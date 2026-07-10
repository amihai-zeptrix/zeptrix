const registerUrl = "https://zeptrix.io/cloudprune/";

const resourceUrls = {
  billShock: "https://zeptrix.io/cloudprune/resources/aws-free-tier-bill-shock-what-to-check-when-a-small-account-suddenly-costs-money",
  natGateway: "https://zeptrix.io/cloudprune/resources/nat-gateway-costs-high-how-to-find-endpoint-and-routing-opportunities",
  idleRds: "https://zeptrix.io/cloudprune/resources/idle-rds-instances-how-to-review-database-savings-without-breaking-apps",
  cloudWatch: "https://zeptrix.io/cloudprune/resources/cloudwatch-costs-too-high-find-the-log-groups-and-metrics-driving-the-bill",
  unattachedEbs: "https://zeptrix.io/cloudprune/resources/unattached-ebs-volumes-still-cost-money-how-to-find-and-safely-remove-them",
  finopsSmallTeams: "https://zeptrix.io/cloudprune/resources/finops-for-small-teams-start-with-read-only-aws-savings-before-buying-a-heavy-platform",
};

const targets = [
  {
    id: "reddit-aws",
    name: "Reddit r/aws",
    url: "https://www.reddit.com/r/aws/",
    composeUrl: "https://www.reddit.com/r/aws/submit?type=TEXT",
    fit: "High",
    rule: "Use only when answering a current, specific cost question. Disclose affiliation. Avoid promotional top-level posts unless the subreddit rules allow tools/showcase posts.",
    angle: "Short diagnostic checklist for bill shock, EBS, CloudWatch, NAT Gateway, and idle RDS.",
    cta: resourceUrls.billShock,
  },
  {
    id: "reddit-devops",
    name: "Reddit r/devops",
    url: "https://www.reddit.com/r/devops/",
    composeUrl: "https://www.reddit.com/r/devops/submit?type=TEXT",
    fit: "High",
    rule: "Answer current operational pain threads. Keep product mention secondary and transparent.",
    angle: "How to turn AWS cost cleanup into a reversible workflow with impact analysis.",
    cta: registerUrl,
  },
  {
    id: "reddit-finops",
    name: "Reddit r/FinOps",
    url: "https://www.reddit.com/r/FinOps/",
    composeUrl: "https://www.reddit.com/r/FinOps/submit?type=TEXT",
    fit: "High",
    rule: "Best fit for thoughtful vendor-disclosed comments and proof-of-value posts. Avoid repetitive self-promotion.",
    angle: "Small-team FinOps without a heavy platform: read-only scan, evidence, impact, dry-run automation.",
    cta: resourceUrls.finopsSmallTeams,
  },
  {
    id: "hacker-news",
    name: "Hacker News",
    url: "https://news.ycombinator.com/",
    composeUrl: "https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fzeptrix.io%2Fcloudprune%2F&t=Show%20HN%3A%20CloudPrune%20-%20read-only%20AWS%20cost%20recommendations%20with%20impact%20analysis",
    fit: "Medium",
    rule: "Do not post generic promotion. Use only for Show HN, Launch HN if eligible, or a genuinely technical write-up.",
    angle: "Show HN: CloudPrune, read-only AWS cost recommendations with impact analysis.",
    cta: registerUrl,
  },
  {
    id: "dev",
    name: "DEV Community AWS tag",
    url: "https://dev.to/t/aws",
    composeUrl: "https://dev.to/new",
    fit: "High",
    rule: "Publish original educational posts. Product CTA at the end is acceptable when the article stands alone.",
    angle: "Republish practical guides for bill shock, CloudWatch, EBS, NAT Gateway, and idle RDS.",
    cta: resourceUrls.cloudWatch,
  },
  {
    id: "aws-repost",
    name: "AWS re:Post",
    url: "https://repost.aws/",
    composeUrl: "https://repost.aws/",
    fit: "Medium",
    rule: "Answer with AWS-native steps first. Link CloudPrune only if the answer remains useful without the link and affiliation is disclosed.",
    angle: "Cost Explorer next step: map service spend to concrete resources and rollback-safe recommendations.",
    cta: resourceUrls.billShock,
  },
  {
    id: "indie-hackers",
    name: "Indie Hackers",
    url: "https://www.indiehackers.com/",
    composeUrl: "https://www.indiehackers.com/new",
    fit: "Medium",
    rule: "Founder story or build-in-public post, not a support-thread pitch.",
    angle: "Building CloudPrune from a real AWS bill-cutting workflow for small teams.",
    cta: registerUrl,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    url: "https://www.linkedin.com/",
    composeUrl: "https://www.linkedin.com/feed/",
    fit: "Medium",
    rule: "Post from a personal profile with a concrete lesson and screenshots. Avoid tagging unrelated people.",
    angle: "The three places small AWS accounts leak money: EBS, CloudWatch, and NAT Gateway.",
    cta: registerUrl,
  },
];

function redditReplyDraft(resourceUrl = resourceUrls.billShock) {
  return [
    "I would start with the boring checks before changing architecture:",
    "",
    "1. Cost Explorer by service for the last 30/90 days.",
    "2. EC2/EBS: unattached volumes, snapshots, idle instances, and public IPv4 addresses.",
    "3. CloudWatch: log ingestion, retention, and noisy log groups.",
    "4. Networking: NAT Gateway processed data and cross-AZ paths.",
    "5. RDS: low connections/CPU/IOPS, but only after owner + backup validation.",
    "",
    "Disclosure: I'm building CloudPrune, a read-only AWS cost scanner. We made this checklist so the recommendation includes evidence, impact, downtime risk, and rollback notes before any action:",
    resourceUrl,
  ].join("\n");
}

function devArticleDraft() {
  return [
    "Title: Why is my AWS bill suddenly high? A practical triage checklist",
    "",
    "A useful cost review starts with the services that can keep billing while nobody is actively using them: EBS volumes, CloudWatch logs, NAT Gateways, idle RDS instances, public IPv4 addresses, and stale snapshots.",
    "",
    "The important part is not just finding waste. It is deciding whether the cleanup is safe. For every candidate, capture owner, last use, monthly cost, impact, downtime risk, rollback path, and whether the first action can be a dry run.",
    "",
    "I'm building CloudPrune around that workflow: read-only scan first, recommendation second, reviewed automation later. Try it here:",
    registerUrl,
  ].join("\n");
}

function hnDraft() {
  return [
    "Show HN: CloudPrune - read-only AWS cost recommendations with impact analysis",
    "",
    "I built CloudPrune after repeatedly seeing that cloud cost tools stop at 'here is a recommendation' while the hard part is 'can I safely do this?'",
    "",
    "It starts with read-only AWS onboarding, scans inventory/spend/utilization signals, and turns findings into recommendations that include evidence, estimated savings, operational impact, downtime risk, and rollback notes. Automation starts as dry-run and needs approval.",
    "",
    "The current focus is small teams that need actionable cost cleanup without buying a heavy FinOps platform.",
    "",
    registerUrl,
  ].join("\n");
}

function linkedinDraft() {
  return [
    "Most small AWS bill surprises I see come from resources that keep charging quietly:",
    "",
    "- unattached EBS volumes",
    "- noisy CloudWatch log groups",
    "- NAT Gateway processed data",
    "- idle RDS instances",
    "- public IPv4 addresses and old snapshots",
    "",
    "The tricky part is not finding them. The tricky part is proving a cleanup will not break production.",
    "",
    "That is the workflow we are building into CloudPrune: read-only scan, evidence, savings estimate, impact analysis, downtime/rollback notes, then reviewed dry-run automation.",
    "",
    `Try it here: ${registerUrl}`,
  ].join("\n");
}

function draftForTarget(target) {
  if (target.id.startsWith("reddit-")) return redditReplyDraft(target.cta);
  if (target.id === "dev") return devArticleDraft();
  if (target.id === "hacker-news") return hnDraft();
  if (target.id === "linkedin") return linkedinDraft();
  return redditReplyDraft(target.cta);
}

module.exports = {
  registerUrl,
  resourceUrls,
  targets,
  redditReplyDraft,
  devArticleDraft,
  hnDraft,
  linkedinDraft,
  draftForTarget,
};
