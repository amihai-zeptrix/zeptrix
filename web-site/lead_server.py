#!/usr/bin/env python3
import json
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except Exception:
    boto3 = None
    BotoCoreError = ClientError = Exception


HOST = os.environ.get("LEAD_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("LEAD_SERVER_PORT", "8081"))
LEADS_FILE = os.environ.get("LEADS_FILE", "/var/lib/zeptrix-leads/leads.jsonl")
EMAIL_TO = os.environ.get("LEAD_TO_EMAIL", "amihai@zeptrix.io")
EMAIL_FROM = os.environ.get("LEAD_FROM_EMAIL", "amihai@zeptrix.io")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def respond(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def clean_text(value, limit=180):
    return str(value or "").strip()[:limit]


def validate(payload):
    lead_type = clean_text(payload.get("leadType"), 60) or "awsAnalysis"
    name = clean_text(payload.get("name"))
    email = clean_text(payload.get("email")).lower()
    company = clean_text(payload.get("company"))
    phone = clean_text(payload.get("phone"), 80)
    components = payload.get("components") or []
    current_site = clean_text(payload.get("currentSite"), 260)
    request_type = clean_text(payload.get("requestType"), 120)
    timeline = clean_text(payload.get("timeline"), 120)
    budget = clean_text(payload.get("budget"), 120)
    first_request = clean_text(payload.get("firstRequest"), 4000)
    free_migration = bool(payload.get("freeMigration"))

    aws_accounts = None
    raw_aws_accounts = payload.get("awsAccounts")
    if raw_aws_accounts not in (None, ""):
        try:
            aws_accounts = int(raw_aws_accounts)
        except (TypeError, ValueError):
            return None, "AWS account count must be a number."

    if not name:
        return None, "Name is required."
    if not EMAIL_RE.match(email):
        return None, "A valid email is required."
    if aws_accounts is not None and (aws_accounts < 1 or aws_accounts > 10000):
        return None, "AWS account count must be at least 1."
    if not isinstance(components, list):
        components = []

    record = {
        "submittedAt": datetime.now(timezone.utc).isoformat(),
        "leadType": lead_type,
        "name": name,
        "email": email,
        "company": company,
        "phone": phone,
        "awsAccounts": aws_accounts,
        "components": [clean_text(item, 80) for item in components if clean_text(item, 80)],
        "currentSite": current_site,
        "requestType": request_type,
        "timeline": timeline,
        "budget": budget,
        "firstRequest": first_request,
        "freeMigration": free_migration,
    }
    return record, None


def store(record):
    os.makedirs(os.path.dirname(LEADS_FILE), exist_ok=True)
    with open(LEADS_FILE, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")


def send_email(record):
    if boto3 is None:
        return False, "boto3 is not installed"

    is_website_request = record.get("leadType") == "websiteRequest"
    subject = (
        f"New Zeptrix website request: {record['name']}"
        if is_website_request
        else f"New Zeptrix free analysis registration: {record['name']}"
    )
    components = ", ".join(record["components"]) if record["components"] else "Not selected"
    company = record["company"] or "Not provided"
    phone = record["phone"] or "Not provided"
    aws_accounts = record["awsAccounts"] if record["awsAccounts"] is not None else "Not provided"
    if is_website_request:
        body = f"""New Zeptrix website request

Name: {record['name']}
Email: {record['email']}
Company: {company}
Phone: {phone}
Current site: {record.get('currentSite') or 'Not provided'}
Request type: {record.get('requestType') or 'Not provided'}
Timeline: {record.get('timeline') or 'Not provided'}
Budget: {record.get('budget') or 'Not provided'}
Free migration interest: {'Yes' if record.get('freeMigration') else 'No'}

First request:
{record.get('firstRequest') or 'Not provided'}

Submitted at: {record['submittedAt']}
"""
    else:
        body = f"""New Zeptrix registration

Name: {record['name']}
Email: {record['email']}
Company: {company}
Phone: {phone}
AWS accounts: {aws_accounts}
Components: {components}
Submitted at: {record['submittedAt']}
"""

    client = boto3.client("sesv2", region_name=AWS_REGION)
    client.send_email(
        FromEmailAddress=EMAIL_FROM,
        Destination={"ToAddresses": [EMAIL_TO]},
        Content={
            "Simple": {
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
            }
        },
        ReplyToAddresses=[record["email"]],
    )
    return True, "sent"


class LeadHandler(BaseHTTPRequestHandler):
    server_version = "ZeptrixLeadServer/1.0"

    def do_GET(self):
        if self.path == "/health":
            respond(self, 200, {"status": "ok"})
            return
        respond(self, 404, {"status": "error", "message": "Not found."})

    def do_POST(self):
        if self.path != "/api/register":
            respond(self, 404, {"status": "error", "message": "Not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 12000:
                respond(self, 400, {"status": "error", "message": "Invalid request size."})
                return

            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            record, error = validate(payload)
            if error:
                respond(self, 400, {"status": "error", "message": error})
                return

            email_sent = False
            email_error = None
            try:
                email_sent, email_error = send_email(record)
            except (BotoCoreError, ClientError, Exception) as exc:
                email_error = str(exc)

            record["emailSent"] = email_sent
            if email_error:
                record["emailError"] = email_error[:500]
            store(record)

            respond(self, 200, {"status": "ok", "emailSent": email_sent})
        except Exception:
            traceback.print_exc(file=sys.stderr)
            respond(self, 500, {"status": "error", "message": "Server error."})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    httpd = ThreadingHTTPServer((HOST, PORT), LeadHandler)
    print(f"Listening on {HOST}:{PORT}", flush=True)
    httpd.serve_forever()
