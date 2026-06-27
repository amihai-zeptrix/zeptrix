const assert = require("node:assert/strict");
const test = require("node:test");
const { awsExecutionOptions, buildReport, createLimiter, markdownTableCell, parseArgs, renderMarkdown } = require("../scripts/aws-assessment");

const fixtureAssessment = {
  generatedAt: "2026-06-27T10:00:00.000Z",
  region: "us-east-1",
  days: 30,
  concurrency: 6,
  maxResources: 25,
  checks: {
    identity: {
      service: "STS",
      ok: true,
      required: true,
      data: { Account: "123456789012", Arn: "arn:aws:iam::123456789012:user/read-only" },
    },
    costByService: {
      service: "Cost Explorer",
      ok: true,
      data: {
        ResultsByTime: [
          {
            Groups: [
              { Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "1200", Unit: "USD" } } },
              { Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "300", Unit: "USD" } } },
              { Keys: ["Amazon Simple Storage Service"], Metrics: { UnblendedCost: { Amount: "180", Unit: "USD" } } },
            ],
          },
        ],
      },
    },
    savingsPlansRecommendation: {
      service: "Cost Explorer",
      ok: true,
      data: {
        SavingsPlansPurchaseRecommendation: {
          SavingsPlansPurchaseRecommendationDetails: [{ EstimatedMonthlySavingsAmount: "212.40" }],
        },
      },
    },
    ec2Instances: {
      service: "EC2",
      ok: true,
      data: { Reservations: [{ Instances: [{ InstanceId: "i-stopped", State: { Name: "stopped" } }] }] },
    },
    ebsVolumes: {
      service: "EBS",
      ok: true,
      data: { Volumes: [{ VolumeId: "vol-1", State: "available", Size: 100, VolumeType: "gp3" }] },
    },
    elasticIps: {
      service: "EC2",
      ok: true,
      data: { Addresses: [{ PublicIp: "203.0.113.10" }] },
    },
    logGroups: {
      service: "CloudWatch Logs",
      ok: true,
      data: { logGroups: [{ logGroupName: "/aws/lambda/no-retention" }] },
    },
    s3Lifecycle: {
      service: "S3 Lifecycle",
      ok: true,
      data: { buckets: [{ name: "logs-bucket", lifecycleStatus: "missing", lifecycleConfigured: false, versioningStatus: "Enabled" }] },
    },
    computeOptimizerEc2: {
      service: "Compute Optimizer",
      ok: true,
      data: { instanceRecommendations: [{ finding: "Optimized", instanceArn: "arn:aws:ec2:us-east-1:123456789012:instance/i-ok" }, { finding: "Overprovisioned", instanceArn: "arn:aws:ec2:us-east-1:123456789012:instance/i-over" }] },
    },
    rdsMetrics: {
      service: "CloudWatch RDS Metrics",
      ok: true,
      data: { instances: [{ id: "db-low", status: "available", averageCpu: 4.2, averageConnections: 1.3 }] },
    },
    loadBalancerMetrics: {
      service: "CloudWatch ELB Metrics",
      ok: true,
      data: { loadBalancers: [{ name: "unused-alb", state: "active", metricSum: 0 }] },
    },
    natGateways: {
      service: "VPC",
      ok: true,
      data: { NatGateways: [{ NatGatewayId: "nat-1", State: "available" }] },
    },
    natGatewayMetrics: {
      service: "CloudWatch NAT Gateway Metrics",
      ok: true,
      data: { natGateways: [{ id: "nat-1", state: "available", bytesOutToDestination: 2 * 1024 ** 3 }] },
    },
  },
};

test("parseArgs supports onboarding assessment options", () => {
  assert.deepEqual(parseArgs(["--profile", "prod", "--region", "us-west-2", "--concurrency", "4", "--days", "45", "--format", "json", "--max-resources", "50", "--timeout-ms", "45000", "--out-dir", "tmp"]), {
    profile: "prod",
    region: "us-west-2",
    concurrency: 4,
    days: 45,
    format: "json",
    maxResources: 50,
    timeoutMs: 45000,
    outDir: require("node:path").resolve("tmp"),
  });
});

test("buildReport creates impact-aware AWS recommendations", () => {
  const report = buildReport(fixtureAssessment);
  const ids = report.findings.map((finding) => finding.id);

  assert.equal(report.account, "123456789012");
  assert.equal(report.costs.find((cost) => cost.service === "Amazon Elastic Compute Cloud - Compute").amount, 1500);
  assert.ok(ids.includes("idle-ebs-volumes"));
  assert.ok(ids.includes("idle-elastic-ips"));
  assert.ok(ids.includes("idle-load-balancers"));
  assert.ok(ids.includes("ec2-rightsizing"));
  assert.ok(ids.includes("rds-rightsizing"));
  assert.ok(ids.includes("compute-commitments"));
  assert.ok(ids.includes("storage-lifecycle"));
  assert.ok(ids.includes("network-egress-review"));

  const ebs = report.findings.find((finding) => finding.id === "idle-ebs-volumes");
  assert.equal(ebs.operationalRisk, "low");
  assert.equal(ebs.downtimeRisk, "none if volumes are truly detached");
  assert.match(ebs.minimizeImpact, /Snapshot first/);
  assert.match(ebs.rollbackPath, /snapshot/);

  const commitment = report.findings.find((finding) => finding.id === "compute-commitments");
  assert.equal(commitment.confidence, "high");
  assert.equal(commitment.estimatedMonthlySavings, 212.4);

  const storage = report.findings.find((finding) => finding.id === "storage-lifecycle");
  assert.ok(storage.resources.includes("s3://logs-bucket"));

  const ec2 = report.findings.find((finding) => finding.id === "ec2-rightsizing");
  assert.ok(ec2.resources.includes("arn:aws:ec2:us-east-1:123456789012:instance/i-over"));
  assert.ok(!ec2.resources.includes("arn:aws:ec2:us-east-1:123456789012:instance/i-ok"));
});

test("renderMarkdown includes permission and impact sections", () => {
  const markdown = renderMarkdown(buildReport(fixtureAssessment));

  assert.match(markdown, /# CloudPrune AWS Assessment/);
  assert.match(markdown, /## Permission Check/);
  assert.match(markdown, /Impact analysis/);
  assert.match(markdown, /Minimize impact/);
  assert.match(markdown, /Rollback path/);
});

test("S3 lifecycle findings ignore buckets with unknown lifecycle status", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [] } },
      logGroups: { service: "CloudWatch Logs", ok: true, data: { logGroups: [] } },
      s3Lifecycle: {
        service: "S3 Lifecycle",
        ok: true,
        data: {
          buckets: [
            { name: "missing-lifecycle", lifecycleStatus: "missing" },
            { name: "unknown-lifecycle", lifecycleStatus: "unknown", lifecycleError: "AccessDenied | nope" },
          ],
        },
      },
    },
  });
  const storage = report.findings.find((finding) => finding.id === "storage-lifecycle");

  assert.ok(storage.resources.includes("s3://missing-lifecycle"));
  assert.ok(!storage.resources.includes("s3://unknown-lifecycle"));
});

test("load balancer no-data is treated as idle but unavailable metrics are not", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [] } },
      loadBalancerMetrics: {
        service: "CloudWatch ELB Metrics",
        ok: true,
        data: {
          loadBalancers: [
            { name: "no-data-alb", state: "active", metricStatus: "no-data", metricSum: null },
            { name: "gateway-lb", state: "active", metricStatus: "unavailable", metricSum: null },
          ],
        },
      },
    },
  });
  const idle = report.findings.find((finding) => finding.id === "idle-load-balancers");

  assert.ok(idle.resources.includes("no-data-alb"));
  assert.ok(!idle.resources.includes("gateway-lb"));
});

test("Savings Plans fallback is clearly heuristic and does not invent savings", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      savingsPlansRecommendation: { service: "Cost Explorer", ok: false, error: "Recommendation generation unavailable" },
      costByService: {
        service: "Cost Explorer",
        ok: true,
        data: { ResultsByTime: [{ Groups: [{ Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "1500", Unit: "USD" } } }] }] },
      },
    },
  });
  const commitment = report.findings.find((finding) => finding.id === "compute-commitments");

  assert.equal(commitment.confidence, "low");
  assert.equal(commitment.estimatedMonthlySavings, null);
  assert.match(commitment.impactAnalysis, /heuristic signal/);
});

test("Markdown rendering escapes table cells and resource names", () => {
  assert.equal(markdownTableCell("a|b\nc"), "a\\|b c");

  const markdown = renderMarkdown({
    generatedAt: "now",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    identity: { Account: "123|456" },
    permissions: [{ id: "x|y", service: "Svc", ok: false, error: "Denied | nope\nnext" }],
    findings: [
      {
        title: "Bad | heading",
        strategy: "Storage",
        estimatedMonthlySavings: null,
        confidence: "low",
        blastRadius: "one\nline",
        operationalRisk: "low",
        downtimeRisk: "none",
        impactAnalysis: "safe",
        minimizeImpact: "slowly",
        rollbackPath: "undo",
        validationWindow: "watch",
        resources: ["bucket|name", "thing`name"],
      },
    ],
  });

  assert.match(markdown, /x\\\|y/);
  assert.match(markdown, /Denied \\\| nope next/);
  assert.match(markdown, /`bucket\|name`, `thing\\`name`/);
});

test("createLimiter caps concurrent asynchronous work globally", async () => {
  const limit = createLimiter(2);
  let active = 0;
  let maxActive = 0;
  const tasks = Array.from({ length: 8 }, (_, index) =>
    limit(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return index;
    })
  );

  assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(maxActive, 2);
});

test("awsExecutionOptions preserves the shared limiter for nested collectors", () => {
  const limiter = createLimiter(1);
  const options = awsExecutionOptions({ profile: "prod", region: "us-east-1", timeoutMs: 1234, awsLimiter: limiter });

  assert.equal(options.profile, "prod");
  assert.equal(options.timeoutMs, 1234);
  assert.equal(options.awsLimiter, limiter);
  assert.equal(options.region, undefined);
});
