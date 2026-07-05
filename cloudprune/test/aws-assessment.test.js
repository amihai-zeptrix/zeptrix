const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
      data: {
        Reservations: [{
          Instances: [
            { InstanceId: "i-app-a", InstanceType: "t3.small", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", VpcId: "vpc-1", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "app-a" }] },
            { InstanceId: "i-app-b", InstanceType: "t3.small", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", VpcId: "vpc-1", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "app-b" }] },
            { InstanceId: "i-stopped", State: { Name: "stopped" } },
          ],
        }],
      },
    },
    ec2Metrics: {
      service: "CloudWatch EC2 Metrics",
      ok: true,
      data: {
        instances: [
          { id: "i-app-a", averageCpu: 8.2, maximumCpu: 28, memoryStatus: "observed", maximumMemory: 41, diskStatus: "observed", maximumDisk: 52 },
          { id: "i-app-b", averageCpu: 6.4, maximumCpu: 22, memoryStatus: "observed", maximumMemory: 38, diskStatus: "observed", maximumDisk: 47 },
        ],
      },
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
      data: { logGroups: [{ logGroupName: "/aws/lambda/no-retention", storedBytes: 10 * 1024 ** 3 }] },
    },
    s3Lifecycle: {
      service: "S3 Lifecycle",
      ok: true,
      data: {
        buckets: [{
          name: "logs-bucket",
          lifecycleStatus: "missing",
          lifecycleConfigured: false,
          versioningStatus: "Enabled",
          storageStats: {
            objectCount: 123456,
            totalStorageBytes: 200 * 1024 ** 3,
            coldStorageBytes: 80 * 1024 ** 3,
            coldStoragePercent: 40,
          },
        }],
      },
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
    albTargetMappings: {
      service: "ELBv2 Target Mapping",
      ok: true,
      data: {
        targetGroups: [{
          name: "apps",
          targetType: "instance",
          protocol: "HTTP",
          port: 80,
          targets: [
            { id: "i-app-a", state: "healthy" },
            { id: "i-app-b", state: "healthy" },
          ],
        }],
      },
    },
    apiGatewayV2: {
      service: "API Gateway HTTP APIs",
      ok: true,
      data: { Items: [{ ApiId: "api-1", Name: "public-api", ProtocolType: "HTTP" }] },
    },
    apiGatewayRest: {
      service: "API Gateway REST APIs",
      ok: true,
      data: { items: [] },
    },
    ssmApplications: {
      service: "SSM Application Inventory",
      ok: true,
      data: {
        instances: [
          { id: "i-app-a", applications: [{ name: "nodejs" }, { name: "nginx" }] },
          { id: "i-app-b", applications: [{ name: "python3" }] },
        ],
      },
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
  assert.ok(ids.includes("ec2-graviton-modernization"));
  assert.ok(ids.includes("ec2-app-consolidation"));
  assert.ok(ids.includes("ec2-to-lambda-assessment"));
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
  assert.equal(storage.statistics["Measured data"], "210 GB");
  assert.equal(storage.statistics["Cold/old-tier S3"], "80 GB (40% of measured S3)");
  assert.equal(storage.statistics["S3 objects"], "123,456");
  assert.match(storage.impactAnalysis, /Observed 210 GB across sampled storage targets/);

  const ec2 = report.findings.find((finding) => finding.id === "ec2-rightsizing");
  assert.ok(ec2.resources.includes("arn:aws:ec2:us-east-1:123456789012:instance/i-over"));
  assert.ok(!ec2.resources.includes("arn:aws:ec2:us-east-1:123456789012:instance/i-ok"));

  const graviton = report.findings.find((finding) => finding.id === "ec2-graviton-modernization");
  assert.equal(graviton.title, "Assess Graviton migration for 2 x86 EC2 instances");
  assert.equal(graviton.statistics["Instance families"], "t3.small -> t4g.small");
  assert.equal(graviton.estimatedMonthlySavings, null);
  assert.equal(graviton.statistics["Estimated savings"], "Requires candidate-level pricing validation");
  assert.match(graviton.impactAnalysis, /changes CPU architecture/);
  assert.match(graviton.minimizeImpact, /arm64 canary/);
  assert.ok(graviton.resources.includes("app-a (t3.small -> t4g.small)"));

  const consolidation = report.findings.find((finding) => finding.id === "ec2-app-consolidation");
  assert.equal(consolidation.statistics["Running instances"], "2");
  assert.equal(consolidation.statistics["Combined avg CPU"], "14.6% instance-capacity");
  assert.equal(consolidation.statistics["Memory usage"], "38-41%");
  assert.equal(consolidation.statistics["Traffic mapping"], "1 ALB target group, 2 healthy EC2 targets, 1 API Gateway API");
  assert.equal(consolidation.statistics["App inventory"], "2/2 SSM-managed instances with application inventory");
  assert.ok(consolidation.resources.includes("app-a"));
  assert.ok(consolidation.resources.includes("app-b"));

  const serverless = report.findings.find((finding) => finding.id === "ec2-to-lambda-assessment");
  assert.equal(serverless.statistics["Traffic mapping"], "1 ALB target group, 2 healthy EC2 targets, 1 API Gateway API");
  assert.equal(serverless.statistics["App inventory"], "2/2 SSM-managed instances with application inventory");
});

test("Graviton migration finding only includes compatible Linux x86 instances", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: {
        service: "Cost Explorer",
        ok: true,
        data: {
          ResultsByTime: [{
            Groups: [{ Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "10000", Unit: "USD" } } }],
          }],
        },
      },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [
              { InstanceId: "i-linux", InstanceType: "m5.large", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "api" }] },
              { InstanceId: "i-rhel", InstanceType: "c5.xlarge", Architecture: "x86_64", PlatformDetails: "Red Hat Enterprise Linux", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "worker" }] },
              { InstanceId: "i-ubuntu", InstanceType: "r5.2xlarge", Architecture: "x86_64", PlatformDetails: "Ubuntu Pro", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "analytics" }] },
              { InstanceId: "i-too-large", InstanceType: "m5.24xlarge", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", State: { Name: "running" } },
              { InstanceId: "i-metal", InstanceType: "m5.metal", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", State: { Name: "running" } },
              { InstanceId: "i-arm", InstanceType: "m7g.large", Architecture: "arm64", PlatformDetails: "Linux/UNIX", State: { Name: "running" } },
              { InstanceId: "i-windows", InstanceType: "m5.large", Architecture: "x86_64", PlatformDetails: "Windows", State: { Name: "running" } },
              { InstanceId: "i-stopped", InstanceType: "m5.large", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", State: { Name: "stopped" } },
            ],
          }],
        },
      },
    },
  });
  const graviton = report.findings.find((finding) => finding.id === "ec2-graviton-modernization");

  assert.ok(graviton);
  assert.equal(graviton.resources.length, 3);
  assert.deepEqual(graviton.resources, [
    "api (m5.large -> m6g.large)",
    "worker (c5.xlarge -> c6g.xlarge)",
    "analytics (r5.2xlarge -> r6g.2xlarge)",
  ]);
  assert.equal(graviton.estimatedMonthlySavings, null);
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
            { name: "missing-lifecycle", lifecycleStatus: "missing", storageStats: { totalStorageBytes: 100 * 1024 ** 3, coldStorageBytes: 20 * 1024 ** 3 } },
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

test("S3 lifecycle findings require at least 10 percent cold or old measured S3 data", () => {
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
            { name: "hot-bucket", lifecycleStatus: "missing", storageStats: { totalStorageBytes: 100 * 1024 ** 3, coldStorageBytes: 9 * 1024 ** 3 } },
          ],
        },
      },
    },
  });

  assert.equal(report.findings.some((finding) => finding.id === "storage-lifecycle"), false);
});

test("service cost anomalies compare current spend to a three-month baseline", () => {
  const report = buildReport({
    generatedAt: "2026-07-06T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: {
        service: "Cost Explorer",
        ok: true,
        data: {
          ResultsByTime: [{
            Groups: [
              { Keys: ["Amazon CloudWatch"], Metrics: { UnblendedCost: { Amount: "42", Unit: "USD" } } },
              { Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "8", Unit: "USD" } } },
            ],
          }],
        },
      },
      costHistoryByService: {
        service: "Cost Explorer",
        ok: true,
        data: {
          ResultsByTime: [
            { TimePeriod: { Start: "2026-03-01", End: "2026-04-01" }, Groups: [{ Keys: ["Amazon CloudWatch"], Metrics: { UnblendedCost: { Amount: "8", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-04-01", End: "2026-05-01" }, Groups: [{ Keys: ["Amazon CloudWatch"], Metrics: { UnblendedCost: { Amount: "9", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-05-01", End: "2026-06-01" }, Groups: [{ Keys: ["Amazon CloudWatch"], Metrics: { UnblendedCost: { Amount: "10", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-06-01", End: "2026-07-01" }, Groups: [{ Keys: ["Amazon CloudWatch"], Metrics: { UnblendedCost: { Amount: "42", Unit: "USD" } } }] },
          ],
        },
      },
    },
  });
  const anomaly = report.findings.find((finding) => finding.id === "cost-anomaly-service-spike");

  assert.ok(anomaly);
  assert.equal(anomaly.title, "Investigate Amazon CloudWatch spend anomaly");
  assert.equal(anomaly.strategy, "Cost anomaly investigation");
  assert.equal(anomaly.statistics["3-month baseline"], "$9/mo");
  assert.equal(anomaly.statistics["Increase vs baseline"], "$33 (366.7%)");
  assert.equal(anomaly.statistics["Previous high month"], "$10");
  assert.match(anomaly.impactAnalysis, /current Cost Explorer period versus a three-month baseline/);
  assert.match(anomaly.minimizeImpact, /Start read-only/);
  assert.deepEqual(anomaly.resources, ["Amazon CloudWatch"]);
});

test("service cost anomalies suppress low-value or low-change service noise", () => {
  const report = buildReport({
    generatedAt: "2026-07-06T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: {
        service: "Cost Explorer",
        ok: true,
        data: { ResultsByTime: [{ Groups: [{ Keys: ["AWS Cost Explorer"], Metrics: { UnblendedCost: { Amount: "4.50", Unit: "USD" } } }] }] },
      },
      costHistoryByService: {
        service: "Cost Explorer",
        ok: true,
        data: {
          ResultsByTime: [
            { TimePeriod: { Start: "2026-03-01", End: "2026-04-01" }, Groups: [{ Keys: ["AWS Cost Explorer"], Metrics: { UnblendedCost: { Amount: "2.90", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-04-01", End: "2026-05-01" }, Groups: [{ Keys: ["AWS Cost Explorer"], Metrics: { UnblendedCost: { Amount: "3.10", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-05-01", End: "2026-06-01" }, Groups: [{ Keys: ["AWS Cost Explorer"], Metrics: { UnblendedCost: { Amount: "3.00", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-06-01", End: "2026-07-01" }, Groups: [{ Keys: ["AWS Cost Explorer"], Metrics: { UnblendedCost: { Amount: "4.50", Unit: "USD" } } }] },
          ],
        },
      },
    },
  });

  assert.equal(report.findings.some((finding) => finding.id === "cost-anomaly-service-spike"), false);
});

test("service cost anomalies do not treat a sparse prior-month group as current spend", () => {
  const report = buildReport({
    generatedAt: "2026-07-06T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: {
        service: "Cost Explorer",
        ok: true,
        data: { ResultsByTime: [{ Groups: [{ Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "10", Unit: "USD" } } }] }] },
      },
      costHistoryByService: {
        service: "Cost Explorer",
        ok: true,
        data: {
          ResultsByTime: [
            { TimePeriod: { Start: "2026-03-01", End: "2026-04-01" }, Groups: [{ Keys: ["Amazon CloudWatch"], Metrics: { UnblendedCost: { Amount: "8", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-04-01", End: "2026-05-01" }, Groups: [{ Keys: ["Amazon CloudWatch"], Metrics: { UnblendedCost: { Amount: "9", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-05-01", End: "2026-06-01" }, Groups: [{ Keys: ["Amazon CloudWatch"], Metrics: { UnblendedCost: { Amount: "42", Unit: "USD" } } }] },
            { TimePeriod: { Start: "2026-06-01", End: "2026-07-01" }, Groups: [{ Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "10", Unit: "USD" } } }] },
          ],
        },
      },
    },
  });

  assert.equal(report.findings.some((finding) => finding.id === "cost-anomaly-service-spike"), false);
});

test("EC2 consolidation finding is shown for low average CPU even with peak spikes", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [] } },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [
              { InstanceId: "i-web", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", VpcId: "vpc-1", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "web" }] },
              { InstanceId: "i-worker", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", VpcId: "vpc-1", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "worker" }] },
            ],
          }],
        },
      },
      ec2Metrics: {
        service: "CloudWatch EC2 Metrics",
        ok: true,
        data: {
          instances: [
            { id: "i-web", averageCpu: 0.4, maximumCpu: 66.7, memoryStatus: "missing", diskStatus: "missing" },
            { id: "i-worker", averageCpu: 3.2, maximumCpu: 96.7, memoryStatus: "missing", diskStatus: "missing" },
          ],
        },
      },
    },
  });
  const consolidation = report.findings.find((finding) => finding.id === "ec2-app-consolidation");

  assert.ok(consolidation);
  assert.equal(consolidation.confidence, "low");
  assert.equal(consolidation.statistics["Combined avg CPU"], "3.6% instance-capacity");
  assert.equal(consolidation.statistics["Peak CPU range"], "66.7-96.7%");
  assert.equal(consolidation.statistics["Memory usage"], "CloudWatch Agent memory metrics missing for 2/2");
  assert.equal(consolidation.statistics["Disk usage"], "CloudWatch Agent disk metrics missing for 2/2");
  assert.equal(consolidation.statistics["App inventory"], "SSM Inventory not enabled");
  assert.equal(consolidation.statistics["Telemetry gap"], "CloudWatch Agent memory metrics missing for 2/2; CloudWatch Agent disk metrics missing for 2/2; SSM Managed Instance inventory not enabled");
  assert.match(consolidation.impactAnalysis, /CPU has spikes/);
  assert.match(consolidation.minimizeImpact, /enable CloudWatch Agent memory\/disk metrics and SSM Inventory/);
  assert.equal(report.findings.some((finding) => finding.id === "ec2-to-lambda-assessment"), false);
});

test("Lambda migration finding requires traffic or app inventory evidence", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [] } },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [
              { InstanceId: "i-web", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", VpcId: "vpc-1", State: { Name: "running" } },
              { InstanceId: "i-worker", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", VpcId: "vpc-1", State: { Name: "running" } },
            ],
          }],
        },
      },
      ec2Metrics: {
        service: "CloudWatch EC2 Metrics",
        ok: true,
        data: {
          instances: [
            { id: "i-web", averageCpu: 1, maximumCpu: 10, memoryStatus: "missing", diskStatus: "missing" },
            { id: "i-worker", averageCpu: 2, maximumCpu: 12, memoryStatus: "missing", diskStatus: "missing" },
          ],
        },
      },
    },
  });

  assert.ok(report.findings.find((finding) => finding.id === "ec2-app-consolidation"));
  assert.equal(report.findings.some((finding) => finding.id === "ec2-to-lambda-assessment"), false);
});

test("EC2 batch host optimization finds stockscanner-style disk and schedule opportunities", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: {
        service: "Cost Explorer",
        ok: true,
        data: { ResultsByTime: [{ Groups: [{ Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "30", Unit: "USD" } } }] }] },
      },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [{
              InstanceId: "i-stockscanner",
              InstanceType: "t3.small",
              Architecture: "x86_64",
              PlatformDetails: "Linux/UNIX",
              VpcId: "vpc-1",
              State: { Name: "running" },
              RootDeviceName: "/dev/xvda",
              BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeId: "vol-stock-root" } }],
              Tags: [{ Key: "Name", Value: "stocks-scanner-1" }],
            }],
          }],
        },
      },
      ec2Metrics: {
        service: "CloudWatch EC2 Metrics",
        ok: true,
        data: {
          instances: [{
            id: "i-stockscanner",
            averageCpu: 2.4,
            maximumCpu: 18.6,
            cpuStatus: "observed",
            diskStatus: "observed",
            maximumDisk: 8,
            rootDiskStatus: "observed",
            maximumRootDisk: 8,
            rootDiskDimensions: [{ Name: "path", Value: "/" }],
          }],
        },
      },
      ebsVolumes: {
        service: "EBS",
        ok: true,
        data: {
          Volumes: [{
            VolumeId: "vol-stock-root",
            State: "in-use",
            Size: 150,
            VolumeType: "gp3",
            Attachments: [{ InstanceId: "i-stockscanner", VolumeId: "vol-stock-root", Device: "/dev/xvda" }],
          }],
        },
      },
      albTargetMappings: { service: "ELBv2 Target Mapping", ok: true, data: { targetGroups: [] } },
      ssmApplications: {
        service: "SSM Application Inventory",
        ok: true,
        data: { instances: [{ id: "i-stockscanner", applications: [{ name: "python3" }, { name: "postgresql" }] }] },
      },
    },
  });
  const batch = report.findings.find((finding) => finding.id === "ec2-batch-host-optimization");

  assert.ok(batch);
  assert.equal(batch.title, "Assess scheduling and disk right-sizing for 1 EC2 batch host");
  assert.equal(batch.statistics["Root volume right-size"], "stocks-scanner-1: 150 GiB -> 20 GiB");
  assert.equal(batch.statistics["Observed root disk"], "stocks-scanner-1: 8%");
  assert.match(batch.statistics["Batch/schedule signals"], /scanner/);
  assert.equal(batch.estimatedMonthlySavings, 10.4);
  assert.match(batch.impactAnalysis, /Root-volume shrink requires planned downtime/);
  assert.match(batch.minimizeImpact, /warn the owner with expected downtime/);
  assert.ok(batch.resources.includes("stocks-scanner-1 (i-stockscanner, vol-stock-root)"));
});

test("EC2 scheduled job Lambda recommendation uses observed runtime and memory evidence", () => {
  const assessment = {
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 7,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: {
        service: "Cost Explorer",
        ok: true,
        data: { ResultsByTime: [{ Groups: [{ Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "6", Unit: "USD" } } }] }] },
      },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [{
              InstanceId: "i-stockscanner",
              InstanceType: "t3.small",
              Architecture: "x86_64",
              PlatformDetails: "Linux/UNIX",
              VpcId: "vpc-1",
              State: { Name: "running" },
              RootDeviceName: "/dev/xvda",
              BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeId: "vol-stock-root" } }],
              Tags: [{ Key: "Name", Value: "stocks-scanner-1" }],
            }],
          }],
        },
      },
      ec2Metrics: {
        service: "CloudWatch EC2 Metrics",
        ok: true,
        data: {
          instances: [{
            id: "i-stockscanner",
            averageCpu: 2.4,
            maximumCpu: 18.6,
            cpuStatus: "observed",
            rootDiskStatus: "observed",
            maximumRootDisk: 8,
          }],
        },
      },
      ebsVolumes: {
        service: "EBS",
        ok: true,
        data: { Volumes: [{ VolumeId: "vol-stock-root", State: "in-use", Size: 150, VolumeType: "gp3", Attachments: [{ InstanceId: "i-stockscanner", VolumeId: "vol-stock-root", Device: "/dev/xvda" }] }] },
      },
      albTargetMappings: { service: "ELBv2 Target Mapping", ok: true, data: { targetGroups: [] } },
      ssmApplications: { service: "SSM Application Inventory", ok: true, data: { instances: [{ id: "i-stockscanner", applications: [{ name: "python3" }] }] } },
      ec2JobRuntimes: {
        service: "EC2 Job Runtime Logs",
        ok: true,
        data: {
          jobs: [
            { instanceId: "i-stockscanner", serviceName: "trade-trigger-monitor.service", runs: 97, lookbackDays: 7, p95Seconds: 2, maxSeconds: 3, memoryMb: 256 },
            { instanceId: "i-stockscanner", serviceName: "paper-portfolio-monitor.service", runs: 480, lookbackDays: 7, p95Seconds: 246, maxSeconds: 320, memoryMb: 512 },
            { instanceId: "i-stockscanner", serviceName: "massive-intraday-update.service", runs: 7, lookbackDays: 7, p95Seconds: 24789, maxSeconds: 24789, memoryMb: 512 },
          ],
        },
      },
    },
  };
  const report = buildReport(assessment);
  const lambda = report.findings.find((finding) => finding.id === "ec2-scheduled-jobs-to-lambda");

  assert.ok(lambda);
  assert.equal(lambda.title, "Pilot Lambda/S3 for 2 short scheduled EC2 jobs");
  assert.equal(lambda.estimatedMonthlySavings, null);
  assert.match(lambda.statistics["Direct Lambda candidates"], /trade-trigger-monitor\.service: 416 runs\/mo, p95 2s, max 3s, 256 MB/);
  assert.match(lambda.statistics["Direct Lambda candidates"], /paper-portfolio-monitor\.service: 2,058 runs\/mo, p95 4\.1m, max 5\.3m, 512 MB/);
  assert.match(lambda.statistics["Long-running blockers"], /massive-intraday-update\.service: max 6\.9h/);
  assert.equal(lambda.statistics["EC2 elimination"], "Not yet; long-running or incomplete jobs prevent eliminating the host as-is");
  assert.match(lambda.impactAnalysis, /exceeds Lambda's 15-minute execution model/);
});

test("EC2 scheduled job Lambda recommendation requires runtime and memory evidence", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 7,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [] } },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [{
              InstanceId: "i-scanner",
              State: { Name: "running" },
              RootDeviceName: "/dev/xvda",
              BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeId: "vol-root" } }],
              Tags: [{ Key: "Name", Value: "scanner-worker" }],
            }],
          }],
        },
      },
      ec2Metrics: { service: "CloudWatch EC2 Metrics", ok: true, data: { instances: [{ id: "i-scanner", averageCpu: 2, maximumCpu: 10, cpuStatus: "observed", rootDiskStatus: "observed", maximumRootDisk: 8 }] } },
      ebsVolumes: { service: "EBS", ok: true, data: { Volumes: [{ VolumeId: "vol-root", State: "in-use", Size: 100, VolumeType: "gp3", Attachments: [{ InstanceId: "i-scanner", VolumeId: "vol-root" }] }] } },
      albTargetMappings: { service: "ELBv2 Target Mapping", ok: true, data: { targetGroups: [] } },
      ec2JobRuntimes: { service: "EC2 Job Runtime Logs", ok: true, data: { jobs: [{ instanceId: "i-scanner", serviceName: "job.service", runs: 10, lookbackDays: 7, p95Seconds: 2 }] } },
    },
  });

  assert.equal(report.findings.some((finding) => finding.id === "ec2-scheduled-jobs-to-lambda"), false);
});

test("EC2 scheduled job Lambda recommendation treats incomplete long jobs as blockers", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 7,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [{ Groups: [{ Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "60", Unit: "USD" } } }] }] } },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [{
              InstanceId: "i-scanner",
              State: { Name: "running" },
              RootDeviceName: "/dev/xvda",
              BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeId: "vol-root" } }],
              Tags: [{ Key: "Name", Value: "scanner-worker" }],
            }],
          }],
        },
      },
      ec2Metrics: { service: "CloudWatch EC2 Metrics", ok: true, data: { instances: [{ id: "i-scanner", averageCpu: 2, maximumCpu: 10, cpuStatus: "observed", rootDiskStatus: "observed", maximumRootDisk: 8 }] } },
      ebsVolumes: { service: "EBS", ok: true, data: { Volumes: [{ VolumeId: "vol-root", State: "in-use", Size: 100, VolumeType: "gp3", Attachments: [{ InstanceId: "i-scanner", VolumeId: "vol-root" }] }] } },
      albTargetMappings: { service: "ELBv2 Target Mapping", ok: true, data: { targetGroups: [] } },
      ec2JobRuntimes: {
        service: "EC2 Job Runtime Logs",
        ok: true,
        data: {
          jobs: [
            { instanceId: "i-scanner", serviceName: "short.service", runs: 10, lookbackDays: 7, p95Seconds: 2, maxSeconds: 3, memoryMb: 256 },
            { instanceId: "i-scanner", serviceName: "average-only.service", runs: 10, lookbackDays: 7, averageSeconds: 2, memoryMb: 256 },
            { instanceId: "i-scanner", serviceName: "long-missing-memory.service", runs: 2, lookbackDays: 7, maxSeconds: 1200 },
          ],
        },
      },
    },
  });
  const lambda = report.findings.find((finding) => finding.id === "ec2-scheduled-jobs-to-lambda");

  assert.ok(lambda);
  assert.equal(lambda.estimatedMonthlySavings, null);
  assert.match(lambda.statistics["Direct Lambda candidates"], /short\.service/);
  assert.match(lambda.statistics["Long-running blockers"], /long-missing-memory\.service: max 20m/);
  assert.match(lambda.statistics["Incomplete blockers"], /average-only\.service: missing runtime evidence/);
  assert.match(lambda.statistics["Incomplete blockers"], /long-missing-memory\.service: missing memory evidence/);
  assert.match(lambda.statistics["EC2 cost context"], /not used as claimed savings/);
});

test("EC2 batch host optimization does not shrink high-disk root volumes", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [] } },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [{
              InstanceId: "i-busy-batch",
              State: { Name: "running" },
              RootDeviceName: "/dev/xvda",
              BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeId: "vol-busy-root" } }],
              Tags: [{ Key: "Name", Value: "nightly-batch-worker" }],
            }],
          }],
        },
      },
      ec2Metrics: {
        service: "CloudWatch EC2 Metrics",
        ok: true,
        data: { instances: [{ id: "i-busy-batch", averageCpu: 3, maximumCpu: 12, cpuStatus: "observed", diskStatus: "observed", maximumDisk: 82, rootDiskStatus: "observed", maximumRootDisk: 82 }] },
      },
      ebsVolumes: {
        service: "EBS",
        ok: true,
        data: { Volumes: [{ VolumeId: "vol-busy-root", State: "in-use", Size: 150, VolumeType: "gp3", Attachments: [{ InstanceId: "i-busy-batch", VolumeId: "vol-busy-root" }] }] },
      },
      albTargetMappings: { service: "ELBv2 Target Mapping", ok: true, data: { targetGroups: [] } },
    },
  });

  assert.equal(report.findings.some((finding) => finding.id === "ec2-batch-host-optimization"), false);
});

test("EC2 batch host optimization requires observed CPU and disk metrics", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [] } },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [{
              InstanceId: "i-unsampled-scanner",
              State: { Name: "running" },
              RootDeviceName: "/dev/xvda",
              BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeId: "vol-unsampled-root" } }],
              Tags: [{ Key: "Name", Value: "unsampled-scanner-worker" }],
            }],
          }],
        },
      },
      ec2Metrics: {
        service: "CloudWatch EC2 Metrics",
        ok: true,
        data: { instances: [] },
      },
      ebsVolumes: {
        service: "EBS",
        ok: true,
        data: { Volumes: [{ VolumeId: "vol-unsampled-root", State: "in-use", Size: 150, VolumeType: "gp3", Attachments: [{ InstanceId: "i-unsampled-scanner", VolumeId: "vol-unsampled-root" }] }] },
      },
      albTargetMappings: { service: "ELBv2 Target Mapping", ok: true, data: { targetGroups: [] } },
    },
  });

  assert.equal(report.findings.some((finding) => finding.id === "ec2-batch-host-optimization"), false);
});

test("EC2 batch host optimization requires root filesystem disk telemetry", () => {
  const report = buildReport({
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    maxResources: 25,
    checks: {
      identity: { service: "STS", ok: true, required: true, data: { Account: "123" } },
      costByService: { service: "Cost Explorer", ok: true, data: { ResultsByTime: [] } },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [{
              InstanceId: "i-nonroot-scanner",
              State: { Name: "running" },
              RootDeviceName: "/dev/xvda",
              BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeId: "vol-nonroot" } }],
              Tags: [{ Key: "Name", Value: "nonroot-scanner-worker" }],
            }],
          }],
        },
      },
      ec2Metrics: {
        service: "CloudWatch EC2 Metrics",
        ok: true,
        data: { instances: [{ id: "i-nonroot-scanner", averageCpu: 2, maximumCpu: 10, cpuStatus: "observed", diskStatus: "observed", maximumDisk: 4, rootDiskStatus: "missing", maximumRootDisk: null }] },
      },
      ebsVolumes: {
        service: "EBS",
        ok: true,
        data: { Volumes: [{ VolumeId: "vol-nonroot", State: "in-use", Size: 150, VolumeType: "gp3", Attachments: [{ InstanceId: "i-nonroot-scanner", VolumeId: "vol-nonroot" }] }] },
      },
      albTargetMappings: { service: "ELBv2 Target Mapping", ok: true, data: { targetGroups: [] } },
    },
  });

  assert.equal(report.findings.some((finding) => finding.id === "ec2-batch-host-optimization"), false);
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
  const options = /** @type {{ profile: string, timeoutMs: number, awsLimiter: Function, region?: string }} */ (
    awsExecutionOptions({ profile: "prod", region: "us-east-1", timeoutMs: 1234, awsLimiter: limiter })
  );

  assert.equal(options.profile, "prod");
  assert.equal(options.timeoutMs, 1234);
  assert.equal(options.awsLimiter, limiter);
  assert.equal(options.region, undefined);
});

test("AWS assessment TypeScript modules compile through the runtime shim", () => {
  const root = path.join(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const tsconfig = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8"));
  const buildConfig = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.build.json"), "utf8"));
  const shim = fs.readFileSync(path.join(root, "scripts/aws-assessment.js"), "utf8");
  const entry = fs.readFileSync(path.join(root, "scripts/aws-assessment.ts"), "utf8");
  const moduleDir = path.join(root, "scripts/aws-assessment");
  const moduleFiles = fs.readdirSync(moduleDir).filter((name) => name.endsWith(".ts"));

  assert.match(packageJson.scripts["assess:aws"], /npm run build --silent && node dist\/scripts\/aws-assessment\.js/);
  assert.ok(tsconfig.include.includes("scripts/**/*.ts"));
  assert.ok(buildConfig.exclude.includes("scripts/aws-assessment.js"));
  assert.match(shim, /dist\/scripts\/aws-assessment\.js/);
  assert.match(entry, /export \{/);
  assert.ok(moduleFiles.length >= 9);
  assert.doesNotMatch(entry, /@ts-nocheck|@ts-ignore/);
  for (const fileName of moduleFiles) {
    assert.doesNotMatch(fs.readFileSync(path.join(moduleDir, fileName), "utf8"), /@ts-nocheck|@ts-ignore/, fileName);
  }
});
