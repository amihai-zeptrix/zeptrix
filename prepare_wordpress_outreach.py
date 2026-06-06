#!/usr/bin/env python3
"""
Generate send-ready website modernization outreach drafts from wordpress_smb_leads.csv.

The output is plain-text .eml files with Amihai <amihai@zeptrix.io> as the sender.
This keeps the messages easy to review and less fragile for deliverability.
"""

from __future__ import annotations

import argparse
import csv
import re
from email.message import EmailMessage
from pathlib import Path
from typing import Dict, Iterable, Tuple


DEFAULT_SENDER_NAME = "Amihai"
DEFAULT_SENDER_EMAIL = "amihai@zeptrix.io"
DEFAULT_OUTPUT_DIR = Path("/tmp/zeptrix-wordpress-outbox")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "lead"


def team_name(company: str) -> str:
    return f"{company} team" if company else "team"


def classify_offer(industry: str, notes: str, evidence: str) -> Tuple[str, str]:
    text = " ".join([industry, notes, evidence]).lower()

    if any(token in text for token in ["managed it", "it services", "technology", "cyber", "software"]):
        return (
            "The site already speaks to an IT audience",
            "the homepage could make support, cybersecurity, and contact paths easier to scan",
        )
    if any(token in text for token in ["tax", "accounting", "bookkeeping", "cpa"]):
        return (
            "The service pages are clear and professional",
            "tax and bookkeeping visitors may need a faster path from problem to consultation",
        )
    if any(token in text for token in ["dental", "medical", "health", "pharma", "clinic", "patient"]):
        return (
            "The site is set up to build trust",
            "appointment and contact paths could probably be tighter on mobile",
        )
    if any(token in text for token in ["hvac", "plumbing", "electrical", "construction", "contractor", "mechanical"]):
        return (
            "The work is visible and credible",
            "the first screen could make service area, trust proof, and quote request clearer",
        )
    if any(token in text for token in ["law", "attorney", "legal"]):
        return (
            "The firm already looks established",
            "the path from practice area to consultation could probably be shorter",
        )
    if any(token in text for token in ["marketing", "consulting", "agency", "consultant", "hr"]):
        return (
            "The offer is already broad and useful",
            "the first screen could make the main service outcome easier to compare",
        )
    if any(token in text for token in ["real estate", "property", "architecture", "design-build", "retail"]):
        return (
            "The visuals and positioning look strong",
            "the call to action could be more direct for high-intent visitors",
        )

    return (
        "The site already looks maintained",
        "the homepage could probably make the primary call to action more direct",
    )


def build_subject(company: str) -> str:
    return f"Quick site modernization idea for {company}"


def build_body(row: Dict[str, str]) -> str:
    company = row["company"].strip()
    website = row["website"].strip()
    industry = row.get("industry", "").strip()
    evidence = row.get("wordpress_evidence", "").strip()
    notes = row.get("notes", "").strip()
    positive_observation, practical_opportunity = classify_offer(industry, notes, evidence)
    greeting = team_name(company)

    return f"""Hi {greeting},

I noticed {company} is running WordPress at {website}.

I help small businesses turn older WordPress sites into something modern, fast, AI-assisted, and hosted by Zeptrix. If you prefer to stay on WordPress, we can keep it there and manage it properly.

What I noticed:
{positive_observation}. One practical opportunity: {practical_opportunity}.

Since the site appears to run on WordPress, this is usually something we can improve without a rebuild.

Limited offer:
Join this month, evaluate for free, and start with only $19 from next month.

If useful, reply with one site problem you want off your plate and I’ll suggest the first sensible fix.

If you are not the right person, feel free to point me to whoever handles the website or vendor updates at {company}.

Best,
Amihai
amihai@zeptrix.io
Zeptrix SiteOps
https://zeptrix.io/siteops

Plans start at $19/month after the free evaluation."""


def iter_rows(path: Path) -> Iterable[Dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        yield from csv.DictReader(handle)


def write_eml(
    output_dir: Path,
    row: Dict[str, str],
    sender_name: str,
    sender_email: str,
) -> Path:
    company = row["company"].strip()
    recipient = row.get("contact_email", "").strip()
    subject = build_subject(company)
    body = build_body(row)

    message = EmailMessage()
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = recipient
    message["Reply-To"] = sender_email
    message["Subject"] = subject
    message.set_content(body)

    filename = f"{slugify(company)}-{slugify(recipient)}.eml"
    path = output_dir / filename
    path.write_text(message.as_string(), encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare WordPress outreach email drafts.")
    parser.add_argument("--input", default="wordpress_smb_leads.csv", help="Path to the lead CSV")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory for .eml drafts")
    parser.add_argument("--limit", type=int, default=0, help="Limit the number of generated drafts")
    parser.add_argument("--sender-name", default=DEFAULT_SENDER_NAME)
    parser.add_argument("--sender-email", default=DEFAULT_SENDER_EMAIL)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    rows = [row for row in iter_rows(input_path) if row.get("contact_email", "").strip()]
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    manifest_path = output_dir / "manifest.csv"
    skipped_path = output_dir / "skipped.csv"

    generated = []
    skipped = []
    for row in rows:
        generated.append(write_eml(output_dir, row, args.sender_name, args.sender_email))

    with input_path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if not row.get("contact_email", "").strip():
                skipped.append(row)

    with manifest_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["company", "recipient_email", "draft_file"])
        for row in rows:
            recipient = row.get("contact_email", "").strip()
            writer.writerow([row.get("company", ""), recipient, f"{slugify(row.get('company', ''))}-{slugify(recipient)}.eml"])

    with skipped_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["company", "website", "reason"])
        for row in skipped:
            writer.writerow([row.get("company", ""), row.get("website", ""), "No public email found"])

    print(f"Generated {len(generated)} drafts in {output_dir}")
    print(f"Manifest: {manifest_path}")
    print(f"Skipped: {skipped_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
