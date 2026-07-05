#!/usr/bin/env python3
"""Generate CloudPrune growth briefs from pain-search shortlist research.

This script deliberately does not post comments or contact communities. It turns
the researched shortlist into prioritized content and participation briefs that a
human can review, edit, and publish.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


REGISTER_URL = "https://zeptrix.io/cloudprune/"
OPERATING_PROMISE = "Recommendation says what may save money. Automation turns it into a reviewed, reversible workflow. Every action starts as dry-run, requires approval, records audit logs, and has rollback/validation steps."


@dataclass(frozen=True)
class Opportunity:
    query: str
    source_type: str
    source_title: str
    source_url: str
    pain: str
    current_answer: str
    cloudprune_angle: str
    content_title: str
    primary_cta: str
    intent_score: int
    fit_score: int
    difficulty_score: int

    @property
    def priority_score(self) -> int:
        return (self.intent_score * 2) + (self.fit_score * 2) - self.difficulty_score


SHORTLIST = [
    Opportunity(
        query="AWS bill suddenly high / why is my AWS bill so high",
        source_type="AWS docs",
        source_title="Understanding unexpected charges",
        source_url="https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/checklistforunwantedcharges.html",
        pain="User sees an unexpected bill and needs to identify which service caused it.",
        current_answer="AWS explains common charge sources and points users back to Billing and Cost Management.",
        cloudprune_angle="CloudPrune can scan the account, summarize the likely waste drivers, and turn the bill shock into prioritized actions with risk notes.",
        content_title="Why Is My AWS Bill Suddenly High? A 15-Minute Triage Checklist",
        primary_cta=f"Connect AWS read-only in CloudPrune and get a ranked savings scan: {REGISTER_URL}",
        intent_score=10,
        fit_score=9,
        difficulty_score=6,
    ),
    Opportunity(
        query="unexpected high AWS billing",
        source_type="AWS re:Post",
        source_title="Unexpected High Billing",
        source_url="https://repost.aws/questions/QUOc3c9GOqSHm1Gds8pHPwUg/unexpected-high-billing",
        pain="User asks the community how to identify the services behind an unexpected AWS bill.",
        current_answer="Community guidance starts with Cost Explorer and the billing console.",
        cloudprune_angle="CloudPrune should position itself as the next step after Cost Explorer: find concrete resources, impact, and safe cleanup steps.",
        content_title="AWS Cost Explorer Shows the Spend. What Should You Do Next?",
        primary_cta=f"Use CloudPrune to convert AWS spend into actionable recommendations: {REGISTER_URL}",
        intent_score=9,
        fit_score=9,
        difficulty_score=5,
    ),
    Opportunity(
        query="CloudWatch cost optimization / reduce CloudWatch charges",
        source_type="AWS docs",
        source_title="Analyzing, optimizing, and reducing CloudWatch costs",
        source_url="https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_billing.html",
        pain="CloudWatch charges rise because of logs, custom metrics, metric streams, dashboards, or alarms.",
        current_answer="AWS documents cost drivers and reduction levers, but leaves discovery and prioritization to the user.",
        cloudprune_angle="CloudPrune can scan log groups, retention settings, and old/noisy log storage, then estimate monthly impact.",
        content_title="CloudWatch Costs Too High? Find the Log Groups and Metrics Driving the Bill",
        primary_cta=f"Run a CloudPrune scan to find CloudWatch cleanup candidates: {REGISTER_URL}",
        intent_score=9,
        fit_score=8,
        difficulty_score=5,
    ),
    Opportunity(
        query="CloudWatch logs cost optimisation techniques",
        source_type="Reddit",
        source_title="Cloudwatch logs cost optimisation techniques",
        source_url="https://www.reddit.com/r/aws/comments/1kfx7bx/cloudwatch_logs_cost_optimisation_techniques/",
        pain="Practitioners want concrete alternatives and retention strategies for expensive CloudWatch Logs.",
        current_answer="Discussion highlights ingestion as the major cost driver and suggests S3/Athena or other logging paths.",
        cloudprune_angle="CloudPrune can publish a pragmatic CloudWatch playbook: retention first, ingestion source review, IA class, and what not to automate.",
        content_title="CloudWatch Logs Cost Optimization: Retention Helps, But Ingestion Is the Real Bill Driver",
        primary_cta=f"Let CloudPrune identify CloudWatch log groups worth reviewing: {REGISTER_URL}",
        intent_score=8,
        fit_score=8,
        difficulty_score=4,
    ),
    Opportunity(
        query="unused EBS volumes cost / find unattached EBS volumes AWS",
        source_type="AWS prescriptive guidance",
        source_title="Delete unattached Amazon EBS volumes",
        source_url="https://docs.aws.amazon.com/prescriptive-guidance/latest/optimize-costs-microsoft-workloads/ebs-delete-ebs-volumes.html",
        pain="Unattached EBS volumes keep charging by provisioned GB-month even when no instance uses them.",
        current_answer="AWS recommends identifying unattached volumes, checking dependencies, snapshots, compliance, and safe deletion.",
        cloudprune_angle="CloudPrune can add age, attachment history, snapshot/rollback guidance, and a dry-run recommendation before deletion.",
        content_title="Unattached EBS Volumes Still Cost Money: How to Find and Safely Remove Them",
        primary_cta=f"Use CloudPrune to find EBS cleanup opportunities with rollback notes: {REGISTER_URL}",
        intent_score=10,
        fit_score=10,
        difficulty_score=4,
    ),
    Opportunity(
        query="are unattached EBS volumes charged",
        source_type="Reddit",
        source_title="Are the EBS volumes which are not attached to any instance charged?",
        source_url="https://www.reddit.com/r/aws/comments/15y3fry/are_the_ebs_volumes_which_are_not_attached_to_any/",
        pain="Users are unsure whether detached volumes are still billed and what to do with them.",
        current_answer="Community confirms they are billed and suggests snapshots/archive or deletion.",
        cloudprune_angle="CloudPrune can make this an entry-level educational page with a scan CTA.",
        content_title="Are Unattached EBS Volumes Charged? Yes. Here Is the Safe Cleanup Path",
        primary_cta=f"Scan for unattached EBS volumes in CloudPrune: {REGISTER_URL}",
        intent_score=9,
        fit_score=10,
        difficulty_score=3,
    ),
    Opportunity(
        query="AWS cost recommendations / Cost Optimization Hub recommendations",
        source_type="AWS blog",
        source_title="New Cost Optimization Hub centralizes recommended actions",
        source_url="https://aws.amazon.com/blogs/aws/new-cost-optimization-hub-to-find-all-recommended-actions-in-one-place-for-saving-you-money/",
        pain="Users want a centralized list of AWS savings recommendations across accounts and regions.",
        current_answer="AWS Cost Optimization Hub consolidates idle resource, rightsizing, and purchasing recommendations.",
        cloudprune_angle="CloudPrune can differentiate on impact analysis, workflow, tenant-friendly onboarding, and recommendations saved outside the AWS console.",
        content_title="AWS Cost Optimization Hub vs CloudPrune: Recommendations Are Only Step One",
        primary_cta=f"Try CloudPrune when you need impact analysis and a savings workflow: {REGISTER_URL}",
        intent_score=8,
        fit_score=9,
        difficulty_score=7,
    ),
    Opportunity(
        query="Trusted Advisor vs Cost Optimization Hub",
        source_type="AWS re:Post",
        source_title="Trusted Advisor vs Cost Optimization Hub",
        source_url="https://repost.aws/questions/QUjRLkV6q4RL-Tcdav6_7M_w/trusted-advisor-vs-cost-optimization-hub",
        pain="Users are confused which AWS-native recommendation source they should trust.",
        current_answer="Community explains Cost Optimization Hub consolidates multiple AWS tools, but does not replace every source.",
        cloudprune_angle="CloudPrune can publish a comparison matrix and explain how to combine native tools with account scans.",
        content_title="Trusted Advisor, Compute Optimizer, or Cost Optimization Hub: Which AWS Recommendation Source Should You Use?",
        primary_cta=f"Use CloudPrune to normalize recommendations into one prioritized view: {REGISTER_URL}",
        intent_score=8,
        fit_score=8,
        difficulty_score=5,
    ),
    Opportunity(
        query="FinOps tools for small teams / cloud cost optimization tools for small companies",
        source_type="Reddit",
        source_title="Do you have any advice on cloud cost optimization tools for small companies?",
        source_url="https://www.reddit.com/r/FinOps/comments/1r0ly03/do_you_have_any_advice_on_cloud_cost_optimization/",
        pain="Small teams want savings without buying heavy enterprise FinOps platforms.",
        current_answer="Community advice often favors native tools and simple automation before large platforms.",
        cloudprune_angle=f"CloudPrune can be positioned as lightweight, read-only first, concrete recommendations, and free trial/free-until campaign. {OPERATING_PROMISE}",
        content_title="FinOps for Small Teams: Start With Read-Only AWS Savings Before Buying a Heavy Platform",
        primary_cta=f"Start with CloudPrune read-only onboarding: {REGISTER_URL}",
        intent_score=10,
        fit_score=10,
        difficulty_score=5,
    ),
    Opportunity(
        query="cloud cost optimization tools that actually work",
        source_type="Reddit",
        source_title="Cloud cost optimization tools that actually work?",
        source_url="https://www.reddit.com/r/FinOps/comments/1r9p62f/cloud_cost_optimization_tools_that_actually_work/",
        pain="Buyers are skeptical that tools only provide dashboards and generic recommendations.",
        current_answer="Community emphasizes proof of value, governance, tagging, and actionability over charts.",
        cloudprune_angle=f"CloudPrune should lead with proof: scan entities, show exact evidence, savings, impact, and dry-run automation path. {OPERATING_PROMISE}",
        content_title="Cloud Cost Optimization Tools That Actually Work: What to Test in a Proof of Value",
        primary_cta=f"Run a CloudPrune proof-of-value scan on your AWS account: {REGISTER_URL}",
        intent_score=9,
        fit_score=9,
        difficulty_score=6,
    ),
]


def ranked_opportunities() -> list[Opportunity]:
    return sorted(SHORTLIST, key=lambda item: (-item.priority_score, -item.intent_score, item.difficulty_score, item.query))


def markdown_brief(opportunities: Iterable[Opportunity]) -> str:
    lines = [
        "# CloudPrune Pain-Search Growth Shortlist",
        "",
        f"Register page: {REGISTER_URL}",
        "",
        "## Prioritized Opportunities",
        "",
    ]
    for index, item in enumerate(opportunities, start=1):
        lines.extend(
            [
                f"### {index}. {item.content_title}",
                "",
                f"- Priority score: {item.priority_score}",
                f"- Target query: `{item.query}`",
                f"- Source: [{item.source_title}]({item.source_url}) ({item.source_type})",
                f"- Pain: {item.pain}",
                f"- Current answer: {item.current_answer}",
                f"- CloudPrune angle: {item.cloudprune_angle}",
                f"- CTA: {item.primary_cta}",
                "",
                "Suggested outline:",
                "",
                "1. Name the pain in the first paragraph.",
                "2. Show exact AWS console and CLI discovery steps.",
                "3. Explain risk, impact, rollback, and when not to act.",
                "4. Add a CloudPrune section showing how the scan detects the issue.",
                "5. End with a read-only scan CTA.",
                "",
            ]
        )
    return "\n".join(lines)


def write_csv(path: Path, opportunities: Iterable[Opportunity]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "priority_score",
        "query",
        "source_type",
        "source_title",
        "source_url",
        "pain",
        "current_answer",
        "cloudprune_angle",
        "content_title",
        "primary_cta",
        "intent_score",
        "fit_score",
        "difficulty_score",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for item in opportunities:
            row = asdict(item)
            row["priority_score"] = item.priority_score
            writer.writerow(row)


def write_json(path: Path, opportunities: Iterable[Opportunity]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = []
    for item in opportunities:
        row = asdict(item)
        row["priority_score"] = item.priority_score
        payload.append(row)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_markdown(path: Path, opportunities: Iterable[Opportunity]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown_brief(opportunities), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate CloudPrune content-growth briefs from pain-search shortlist research.")
    parser.add_argument("--format", choices=["markdown", "csv", "json"], default="markdown")
    parser.add_argument("--output", default="reports/cloudprune-growth-shortlist.md")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    opportunities = ranked_opportunities()
    if args.format == "csv":
        write_csv(output, opportunities)
    elif args.format == "json":
        write_json(output, opportunities)
    else:
        write_markdown(output, opportunities)
    print(f"Wrote {len(opportunities)} CloudPrune growth opportunities to {output}")


if __name__ == "__main__":
    main()
