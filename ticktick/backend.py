#!/usr/bin/env python3
"""Small authenticated-by-nginx REST API for the Zeptrix family task app."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import time
import base64
import binascii
import hashlib
import hmac
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

DB_PATH = Path(os.environ.get("TASKS_DB_PATH", "/var/lib/zeptrix-tasks/tasks.db"))
HOST = os.environ.get("TASKS_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("TASKS_API_PORT", "8082"))
MAX_BODY_BYTES = 32_768
SESSION_COOKIE = "zeptrix_tasks_session"
SESSION_MAX_AGE = 30 * 24 * 60 * 60
SESSION_SECRET = os.environ.get("TASKS_SESSION_SECRET", "")
VALID_ASSIGNEES = {"you", "lina"}
VALID_PRIORITIES = {"high", "medium", "low"}
VALID_TAGS = {"design", "marketing", "development", "urgent", "research"}
TENANT_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
WORKSPACES = {
    "hadar": {
        "title": "אפליקצת המשימות של משפחת הדר",
        "workspaceName": "בית משפחת הדר",
        "workspaceInitial": "ה",
        "members": {
            "you": {"name": "עמיחי", "initials": "עמ"},
            "lina": {"name": "אתי", "initials": "את"},
        },
    },
    "pettesh": {
        "title": "אפליקציית המשימות של משפחת פטש",
        "workspaceName": "המרחב של פטש",
        "workspaceInitial": "פ",
        "members": {
            "you": {"name": "פטש", "initials": "פט"},
            "lina": {"name": "משפחה", "initials": "מש"},
        },
    },
}

INITIAL_TASKS = [
    "פסיכומטרי של יובל",
    "לקחת תרופות של כולם (אתי, יובל ועמיחי) מסופר - פארם",
    "לזמן בדיקות לב",
    "לדבר עם רסטו ביום ראשון",
    "לבדוק כרטיסי טיסה לחגים",
]


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def encode_urlsafe(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def decode_urlsafe(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_session_token(tenant: str, now: Optional[int] = None) -> str:
    issued = int(time.time() if now is None else now)
    payload = encode_urlsafe(
        json.dumps(
            {"tenant": tenant, "exp": issued + SESSION_MAX_AGE},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    signature = encode_urlsafe(
        hmac.new(SESSION_SECRET.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{payload}.{signature}"


def verify_session_token(token: str, now: Optional[int] = None) -> Optional[str]:
    if not SESSION_SECRET or "." not in token:
        return None
    payload, supplied_signature = token.rsplit(".", 1)
    expected_signature = encode_urlsafe(
        hmac.new(SESSION_SECRET.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(supplied_signature, expected_signature):
        return None
    try:
        data = json.loads(decode_urlsafe(payload))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, binascii.Error):
        return None
    tenant = data.get("tenant")
    expires = data.get("exp")
    current = int(time.time() if now is None else now)
    if not isinstance(tenant, str) or not TENANT_PATTERN.fullmatch(tenant):
        return None
    if not isinstance(expires, int) or isinstance(expires, bool) or expires <= current:
        return None
    return tenant


def initialize_database() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                assignee TEXT NOT NULL CHECK (assignee IN ('you', 'lina')),
                due TEXT NOT NULL DEFAULT '',
                priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
                completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
                created INTEGER NOT NULL,
                updated INTEGER NOT NULL,
                revision INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(tasks)")}
        if "revision" not in columns:
            connection.execute("ALTER TABLE tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 1")
        if "tenant" not in columns:
            connection.execute("ALTER TABLE tasks ADD COLUMN tenant TEXT NOT NULL DEFAULT 'hadar'")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS tasks_tenant_created_idx ON tasks(tenant, created DESC)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        seeded = connection.execute(
            "SELECT 1 FROM app_metadata WHERE key = 'initial_tasks_seeded'"
        ).fetchone()
        count = connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        if seeded is None and count == 0:
            now = int(time.time() * 1000)
            connection.executemany(
                """
                INSERT INTO tasks
                    (id, tenant, title, description, tags, assignee, due, priority, completed, created, updated)
                VALUES (?, 'hadar', ?, '', '[]', 'you', '', 'medium', 0, ?, ?)
                """,
                [(2026073101 + index, title, now + index, now) for index, title in enumerate(INITIAL_TASKS)],
            )
        if seeded is None:
            connection.execute(
                "INSERT INTO app_metadata (key, value) VALUES ('initial_tasks_seeded', '1')"
            )


def row_to_task(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "tags": json.loads(row["tags"]),
        "assignee": row["assignee"],
        "due": row["due"],
        "priority": row["priority"],
        "completed": bool(row["completed"]),
        "created": row["created"],
        "updated": row["updated"],
        "revision": row["revision"],
    }


def validate_task(payload: dict, existing: Optional[dict] = None) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("invalid JSON object")
    base = existing or {}
    title = payload.get("title", base.get("title", ""))
    description = payload.get("description", base.get("description", ""))
    tags = payload.get("tags", base.get("tags", []))
    assignee = payload.get("assignee", base.get("assignee", "you"))
    due = payload.get("due", base.get("due", ""))
    priority = payload.get("priority", base.get("priority", "medium"))
    completed = payload.get("completed", base.get("completed", False))

    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 120:
        raise ValueError("title must contain 1-120 characters")
    if not isinstance(description, str) or len(description) > 1000:
        raise ValueError("description must contain at most 1000 characters")
    if not isinstance(tags, list) or any(tag not in VALID_TAGS for tag in tags):
        raise ValueError("invalid tags")
    if assignee not in VALID_ASSIGNEES:
        raise ValueError("invalid assignee")
    if priority not in VALID_PRIORITIES:
        raise ValueError("invalid priority")
    if not isinstance(due, str) or (due and (len(due) != 10 or due[4] != "-" or due[7] != "-")):
        raise ValueError("invalid due date")
    if not isinstance(completed, bool):
        raise ValueError("completed must be boolean")

    return {
        "title": title.strip(),
        "description": description,
        "tags": list(dict.fromkeys(tags)),
        "assignee": assignee,
        "due": due,
        "priority": priority,
        "completed": completed,
    }


class TaskHandler(BaseHTTPRequestHandler):
    server_version = "ZeptrixTasks/1.0"

    def log_message(self, message: str, *args) -> None:
        print(f"{self.address_string()} - {message % args}", flush=True)

    def send_json(self, status: int, payload: object, headers: Optional[dict] = None) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("invalid content length") from error
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("invalid request size")
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError("invalid JSON") from error

    def task_id(self) -> int | None:
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 2 or parts[0] != "tasks":
            return None
        try:
            return int(parts[1])
        except ValueError:
            return None

    def tenant(self) -> Optional[str]:
        try:
            cookies = SimpleCookie(self.headers.get("Cookie", ""))
        except CookieError:
            return None
        session = cookies.get(SESSION_COOKIE)
        return verify_session_token(session.value) if session else None

    def login_tenant(self) -> Optional[str]:
        tenant = self.headers.get("X-Task-Tenant", "").strip().lower()
        return tenant if TENANT_PATTERN.fullmatch(tenant) else None

    def require_tenant(self) -> Optional[str]:
        tenant = self.tenant()
        if tenant is None:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "authenticated tenant required"})
        return tenant

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self.send_json(HTTPStatus.OK, {"ok": True})
            return
        if path not in {"/tasks", "/workspace"}:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        tenant = self.require_tenant()
        if tenant is None:
            return
        if path == "/workspace":
            workspace = WORKSPACES.get(
                tenant,
                {
                    "title": "מרחב המשימות שלי",
                    "workspaceName": tenant,
                    "workspaceInitial": tenant[0].upper(),
                    "members": {
                        "you": {"name": "אני", "initials": "אני"},
                        "lina": {"name": "משפחה", "initials": "מש"},
                    },
                },
            )
            self.send_json(HTTPStatus.OK, workspace)
            return
        with connect() as connection:
            rows = connection.execute(
                "SELECT * FROM tasks WHERE tenant = ? ORDER BY created DESC", (tenant,)
            ).fetchall()
        self.send_json(HTTPStatus.OK, [row_to_task(row) for row in rows])

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/login":
            tenant = self.login_tenant()
            if tenant is None:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "invalid credentials"})
                return
            token = create_session_token(tenant)
            self.send_json(
                HTTPStatus.OK,
                {"ok": True},
                {"Set-Cookie": f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax"},
            )
            return
        if path == "/logout":
            self.send_json(
                HTTPStatus.OK,
                {"ok": True},
                {"Set-Cookie": f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"},
            )
            return
        if path != "/tasks":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        tenant = self.require_tenant()
        if tenant is None:
            return
        try:
            task = validate_task(self.read_json())
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        now = int(time.time() * 1000)
        with connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO tasks
                    (tenant, title, description, tags, assignee, due, priority, completed, created, updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (tenant, task["title"], task["description"], json.dumps(task["tags"]), task["assignee"], task["due"], task["priority"], int(task["completed"]), now, now),
            )
            task_id = cursor.lastrowid
            row = connection.execute(
                "SELECT * FROM tasks WHERE id = ? AND tenant = ?", (task_id, tenant)
            ).fetchone()
        self.send_json(HTTPStatus.CREATED, row_to_task(row))

    def do_PUT(self) -> None:
        task_id = self.task_id()
        if task_id is None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        tenant = self.require_tenant()
        if tenant is None:
            return
        try:
            payload = self.read_json()
            expected_revision = payload.get("revision")
            if not isinstance(expected_revision, int) or isinstance(expected_revision, bool) or expected_revision < 1:
                raise ValueError("revision is required")
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        with connect() as connection:
            row = connection.execute(
                "SELECT * FROM tasks WHERE id = ? AND tenant = ?", (task_id, tenant)
            ).fetchone()
            if row is None:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "task not found"})
                return
            try:
                task = validate_task(payload, row_to_task(row))
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return
            now = max(int(time.time() * 1000), row["updated"] + 1)
            cursor = connection.execute(
                """
                UPDATE tasks SET title = ?, description = ?, tags = ?, assignee = ?, due = ?,
                    priority = ?, completed = ?, updated = ?, revision = revision + 1
                WHERE id = ? AND tenant = ? AND revision = ?
                """,
                (task["title"], task["description"], json.dumps(task["tags"]), task["assignee"], task["due"], task["priority"], int(task["completed"]), now, task_id, tenant, expected_revision),
            )
            if cursor.rowcount == 0:
                current = connection.execute(
                    "SELECT * FROM tasks WHERE id = ? AND tenant = ?", (task_id, tenant)
                ).fetchone()
                if current is None:
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "task not found"})
                    return
                self.send_json(HTTPStatus.CONFLICT, {"error": "task changed on another device", "task": row_to_task(current)})
                return
            updated = connection.execute(
                "SELECT * FROM tasks WHERE id = ? AND tenant = ?", (task_id, tenant)
            ).fetchone()
        self.send_json(HTTPStatus.OK, row_to_task(updated))

    def do_DELETE(self) -> None:
        task_id = self.task_id()
        if task_id is None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        tenant = self.require_tenant()
        if tenant is None:
            return
        with connect() as connection:
            cursor = connection.execute(
                "DELETE FROM tasks WHERE id = ? AND tenant = ?", (task_id, tenant)
            )
        if cursor.rowcount == 0:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "task not found"})
            return
        self.send_json(HTTPStatus.OK, {"deleted": True})


def main() -> None:
    if len(SESSION_SECRET) < 32:
        raise RuntimeError("TASKS_SESSION_SECRET must contain at least 32 characters")
    initialize_database()
    server = ThreadingHTTPServer((HOST, PORT), TaskHandler)
    print(f"Zeptrix task API listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
