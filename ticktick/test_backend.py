import json
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backend


class TaskApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        backend.DB_PATH = Path(cls.temp_dir.name) / "tasks.db"
        backend.initialize_database()
        cls.server = backend.ThreadingHTTPServer(("127.0.0.1", 0), backend.TaskHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.temp_dir.cleanup()

    def request(self, path, method="GET", payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        with urlopen(request, timeout=2) as response:
            return response.status, json.load(response)

    def test_health_and_initial_tasks(self):
        status, health = self.request("/health")
        self.assertEqual(status, 200)
        self.assertEqual(health, {"ok": True})
        status, tasks = self.request("/tasks")
        self.assertEqual(status, 200)
        self.assertEqual(len(tasks), 5)
        self.assertEqual(tasks[0]["assignee"], "you")

    def test_create_update_and_delete(self):
        status, created = self.request(
            "/tasks",
            "POST",
            {"title": "משימת בדיקה", "assignee": "lina", "priority": "low"},
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["title"], "משימת בדיקה")
        self.assertEqual(created["assignee"], "lina")

        status, updated = self.request(
            f"/tasks/{created['id']}",
            "PUT",
            {"priority": "high", "completed": True, "revision": created["revision"]},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["priority"], "high")
        self.assertTrue(updated["completed"])
        self.assertEqual(updated["title"], "משימת בדיקה")
        self.assertEqual(updated["revision"], created["revision"] + 1)

        status, deleted = self.request(f"/tasks/{created['id']}", "DELETE")
        self.assertEqual(status, 200)
        self.assertTrue(deleted["deleted"])

    def test_rejects_invalid_owner(self):
        with self.assertRaises(HTTPError) as context:
            self.request("/tasks", "POST", {"title": "invalid", "assignee": "stranger"})
        self.assertEqual(context.exception.code, 400)
        context.exception.close()

    def test_rejects_stale_concurrent_update(self):
        _, created = self.request("/tasks", "POST", {"title": "בדיקת התנגשות"})
        _, updated = self.request(
            f"/tasks/{created['id']}", "PUT", {"priority": "high", "revision": created["revision"]}
        )
        self.assertEqual(updated["priority"], "high")
        with self.assertRaises(HTTPError) as context:
            self.request(
                f"/tasks/{created['id']}", "PUT", {"completed": True, "revision": created["revision"]}
            )
        self.assertEqual(context.exception.code, 409)
        context.exception.close()
        _, tasks = self.request("/tasks")
        current = next(task for task in tasks if task["id"] == created["id"])
        self.assertEqual(current["priority"], "high")
        self.assertFalse(current["completed"])
        self.request(f"/tasks/{created['id']}", "DELETE")

    def test_concurrent_creates_receive_unique_ids(self):
        def create(index):
            return self.request("/tasks", "POST", {"title": f"מקביל {index}"})[1]

        with ThreadPoolExecutor(max_workers=8) as pool:
            created = list(pool.map(create, range(12)))
        self.assertEqual(len({task["id"] for task in created}), len(created))
        for task in created:
            self.request(f"/tasks/{task['id']}", "DELETE")

    def test_empty_database_does_not_reseed(self):
        original_path = backend.DB_PATH
        with tempfile.TemporaryDirectory() as temp_dir:
            backend.DB_PATH = Path(temp_dir) / "durable-seed.db"
            try:
                backend.initialize_database()
                with backend.connect() as connection:
                    connection.execute("DELETE FROM tasks")
                backend.initialize_database()
                with backend.connect() as connection:
                    self.assertEqual(connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 0)
            finally:
                backend.DB_PATH = original_path


if __name__ == "__main__":
    unittest.main()
