#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DAYS = 30;
const DEFAULT_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const DEFAULT_AWS_TIMEOUT_MS = 30000;
const DEFAULT_CONCURRENCY = 6;

const CHECKS = [
  {
    id: "identity",
    service: "STS",
    command: ["sts", "get-caller-identity"],
    required: true,
  },
  {
    id: "costByService",
    service: "Cost Explorer",
    command: ({ startDate, endDate }) => [
      "ce",
      "get-cost-and-usage",
      "--time-period",
      `Start=${startDate},End=${endDate}`,
      "--granularity",
      "MONTHLY",
      "--metrics",
      "UnblendedCost",
      "--group-by",
      "Type=DIMENSION,Key=SERVICE",
    ],
  },
  {
    id: "savingsPlansRecommendation",
    service: "Cost Explorer",
    command: [
      "ce",
      "get-savings-plans-purchase-recommendation",
      "--savings-plans-type",
      "COMPUTE_SP",
      "--term-in-years",
      "ONE_YEAR",
      "--payment-option",
      "NO_UPFRONT",
      "--lookback-period-in-days",
      "SIXTY_DAYS",
    ],
    global: true,
  },
  {
    id: "ec2Instances",
    service: "EC2",
    command: ["ec2", "describe-instances"],
  },
  {
    id: "ebsVolumes",
    service: "EBS",
    command: ["ec2", "describe-volumes"],
  },
  {
    id: "elasticIps",
    service: "EC2",
    command: ["ec2", "describe-addresses"],
  },
  {
    id: "natGateways",
    service: "VPC",
    command: ["ec2", "describe-nat-gateways"],
  },
  {
    id: "loadBalancers",
    service: "ELBv2",
    command: ["elbv2", "describe-load-balancers"],
  },
  {
    id: "rdsInstances",
    service: "RDS",
    command: ["rds", "describe-db-instances"],
  },
  {
    id: "logGroups",
    service: "CloudWatch Logs",
    command: ["logs", "describe-log-groups"],
  },
  {
    id: "s3Buckets",
    service: "S3",
    command: ["s3api", "list-buckets"],
    global: true,
  },
  {
    id: "computeOptimizerEc2",
    service: "Compute Optimizer",
    command: ["compute-optimizer", "get-ec2-instance-recommendations"],
  },
  {
    id: "trustedAdvisorChecks",
    service: "Trusted Advisor",
    command: ["support", "describe-trusted-advisor-checks", "--language", "en"],
    region: "us-east-1",
  },
];

function parseArgs(argv) {
  const args = {
    days: DEFAULT_DAYS,
    concurrency: DEFAULT_CONCURRENCY,
    format: "both",
    maxResources: 25,
    outDir: path.resolve(process.cwd(), "reports"),
    region: DEFAULT_REGION,
    timeoutMs: DEFAULT_AWS_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--concurrency") args.concurrency = Number(argv[++index]);
    else if (arg === "--days") args.days = Number(argv[++index]);
    else if (arg === "--format") args.format = argv[++index];
    else if (arg === "--max-resources") args.maxResources = Number(argv[++index]);
    else if (arg === "--out-dir") args.outDir = path.resolve(argv[++index]);
    else if (arg === "--profile") args.profile = argv[++index];
    else if (arg === "--region") args.region = argv[++index];
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++index]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.days) || args.days < 1 || args.days > 366) throw new Error("--days must be an integer from 1 to 366.");
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 20) throw new Error("--concurrency must be an integer from 1 to 20.");
  if (!Number.isInteger(args.maxResources) || args.maxResources < 1 || args.maxResources > 250) throw new Error("--max-resources must be an integer from 1 to 250.");
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs < 1000 || args.timeoutMs > 300000) throw new Error("--timeout-ms must be an integer from 1000 to 300000.");
  if (!["json", "markdown", "both"].includes(args.format)) throw new Error("--format must be json, markdown, or both.");
  return args;
}

function isoDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function compactError(stderr) {
  const text = String(stderr || "").trim();
  return text.split("\n").map((line) => line.trim()).filter(Boolean).slice(-2).join(" ") || "Unknown AWS CLI error.";
}

function createLimiter(concurrency) {
  let active = 0;
  const queue = [];

  function drain() {
    while (active < concurrency && queue.length) {
      const item = queue.shift();
      active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  }

  return function limit(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      drain();
    });
  };
}

function awsExecutionOptions(options, extra = {}) {
  return {
    profile: options.profile,
    timeoutMs: options.timeoutMs,
    awsLimiter: options.awsLimiter,
    ...extra,
  };
}

async function runAwsJson(commandArgs, options = {}) {
  if (options.awsLimiter && !options.skipLimit) {
    return options.awsLimiter(() => runAwsJson(commandArgs, { ...options, skipLimit: true }));
  }

  const args = [...commandArgs, "--output", "json"];
  if (options.profile) args.unshift("--profile", options.profile);
  if (options.region) args.unshift("--region", options.region);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = options.timeoutMs || DEFAULT_AWS_TIMEOUT_MS;
    const child = spawn("aws", args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolve({ ok: false, error: `AWS CLI command timed out after ${timeoutMs}ms.` });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 20 * 1024 * 1024) {
        settled = true;
        child.kill("SIGTERM");
        clearTimeout(timer);
        resolve({ ok: false, error: "AWS CLI output exceeded 20MB." });
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT" ? "AWS CLI is not installed or not on PATH." : error.message });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ ok: false, error: compactError(stderr) });
        return;
      }

      try {
        resolve({ ok: true, data: JSON.parse(stdout || "{}") });
      } catch (error) {
        resolve({ ok: false, error: `AWS CLI returned invalid JSON: ${error.message}` });
      }
    });
  });
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function addCheck(checks, id, service, result) {
  checks[id] = {
    service,
    ok: result.ok,
    data: result.data,
    error: result.error,
    required: false,
  };
}

function metricAverage(datapoints) {
  const values = (datapoints || []).map((point) => Number(point.Average)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function metricSum(datapoints, key = "Sum") {
  const values = (datapoints || []).map((point) => Number(point[key])).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0);
}

function metricSummary(datapoints, key = "Sum") {
  const values = (datapoints || []).map((point) => Number(point[key])).filter((value) => Number.isFinite(value));
  if (!values.length) return { hasData: false, value: null };
  return { hasData: true, value: values.reduce((total, value) => total + value, 0) };
}

async function getMetric(options, context, namespace, metricName, dimensions, statistic) {
  const period = Math.max(3600, Math.ceil((options.days * 86400) / 60));
  const dimensionArgs = dimensions.map((dimension) => `Name=${dimension.name},Value=${dimension.value}`);
  return runAwsJson(
    [
      "cloudwatch",
      "get-metric-statistics",
      "--namespace",
      namespace,
      "--metric-name",
      metricName,
      "--start-time",
      `${context.startDate}T00:00:00Z`,
      "--end-time",
      `${context.endDate}T00:00:00Z`,
      "--period",
      String(period),
      "--statistics",
      statistic,
      "--dimensions",
      ...dimensionArgs,
    ],
    options
  );
}

function loadBalancerDimension(loadBalancerArn) {
  const marker = ":loadbalancer/";
  const index = loadBalancerArn.indexOf(marker);
  return index === -1 ? null : loadBalancerArn.slice(index + marker.length);
}

function classifyS3Lifecycle(result) {
  if (result.ok) {
    return {
      status: Array.isArray(result.data?.Rules) && result.data.Rules.length > 0 ? "configured" : "missing",
      configured: Array.isArray(result.data?.Rules) && result.data.Rules.length > 0,
      error: null,
    };
  }

  const error = result.error || "";
  if (/NoSuchLifecycleConfiguration/i.test(error)) return { status: "missing", configured: false, error };
  return { status: "unknown", configured: null, error };
}

async function collectS3LifecycleSignals(checks, options) {
  const buckets = checks.s3Buckets?.data?.Buckets || [];
  const sampled = buckets.slice(0, options.maxResources);
  const data = await mapWithConcurrency(sampled, options.concurrency, async (bucket) => {
    const s3Options = awsExecutionOptions(options);
    const [lifecycleResult, versioning] = await Promise.all([
      runAwsJson(["s3api", "get-bucket-lifecycle-configuration", "--bucket", bucket.Name], s3Options),
      runAwsJson(["s3api", "get-bucket-versioning", "--bucket", bucket.Name], s3Options),
    ]);
    const lifecycle = classifyS3Lifecycle(lifecycleResult);
    return {
      name: bucket.Name,
      createdAt: bucket.CreationDate,
      lifecycleStatus: lifecycle.status,
      lifecycleConfigured: lifecycle.configured,
      lifecycleError: lifecycle.error,
      versioningStatus: versioning.ok ? versioning.data?.Status || "Suspended" : "Unknown",
      versioningError: versioning.ok ? null : versioning.error,
    };
  });

  addCheck(checks, "s3Lifecycle", "S3 Lifecycle", {
    ok: true,
    data: { buckets: data, sampled: sampled.length, total: buckets.length },
  });
}

async function collectRdsMetricSignals(checks, options, context) {
  const instances = checks.rdsInstances?.data?.DBInstances || [];
  const data = await mapWithConcurrency(instances.slice(0, options.maxResources), options.concurrency, async (instance) => {
    const id = instance.DBInstanceIdentifier;
    const [cpu, connections] = await Promise.all([
      getMetric(options, context, "AWS/RDS", "CPUUtilization", [{ name: "DBInstanceIdentifier", value: id }], "Average"),
      getMetric(options, context, "AWS/RDS", "DatabaseConnections", [{ name: "DBInstanceIdentifier", value: id }], "Average"),
    ]);
    return {
      id,
      class: instance.DBInstanceClass,
      engine: instance.Engine,
      multiAz: Boolean(instance.MultiAZ),
      status: instance.DBInstanceStatus,
      averageCpu: cpu.ok ? metricAverage(cpu.data?.Datapoints) : null,
      averageConnections: connections.ok ? metricAverage(connections.data?.Datapoints) : null,
      cpuError: cpu.ok ? null : cpu.error,
      connectionsError: connections.ok ? null : connections.error,
    };
  });

  addCheck(checks, "rdsMetrics", "CloudWatch RDS Metrics", {
    ok: true,
    data: { instances: data },
  });
}

async function collectLoadBalancerMetricSignals(checks, options, context) {
  const loadBalancers = checks.loadBalancers?.data?.LoadBalancers || [];
  const data = await mapWithConcurrency(loadBalancers.slice(0, options.maxResources), options.concurrency, async (loadBalancer) => {
    const dimension = loadBalancerDimension(loadBalancer.LoadBalancerArn || "");
    const metricConfigByType = {
      application: { namespace: "AWS/ApplicationELB", metricName: "RequestCount" },
      network: { namespace: "AWS/NetworkELB", metricName: "ActiveFlowCount" },
      gateway: { unsupportedReason: "Gateway Load Balancer idle detection is not implemented yet." },
    };
    const config = metricConfigByType[loadBalancer.Type] || { unsupportedReason: `Unsupported load balancer type: ${loadBalancer.Type || "unknown"}.` };
    const result = dimension && !config.unsupportedReason ? await getMetric(options, context, config.namespace, config.metricName, [{ name: "LoadBalancer", value: dimension }], "Sum") : { ok: false, error: config.unsupportedReason || "Unable to parse load balancer dimension." };
    const summary = result.ok ? metricSummary(result.data?.Datapoints) : { hasData: false, value: null };
    return {
      name: loadBalancer.LoadBalancerName,
      arn: loadBalancer.LoadBalancerArn,
      type: loadBalancer.Type,
      state: loadBalancer.State?.Code,
      metricName: config.metricName || null,
      metricStatus: result.ok ? (summary.hasData ? "observed" : "no-data") : "unavailable",
      metricSum: result.ok ? summary.value : null,
      metricError: result.ok ? null : result.error,
    };
  });

  addCheck(checks, "loadBalancerMetrics", "CloudWatch ELB Metrics", {
    ok: true,
    data: { loadBalancers: data },
  });
}

async function collectNatMetricSignals(checks, options, context) {
  const natGateways = checks.natGateways?.data?.NatGateways || [];
  const data = await mapWithConcurrency(natGateways.slice(0, options.maxResources), options.concurrency, async (gateway) => {
    const result = await getMetric(options, context, "AWS/NATGateway", "BytesOutToDestination", [{ name: "NatGatewayId", value: gateway.NatGatewayId }], "Sum");
    return {
      id: gateway.NatGatewayId,
      state: gateway.State,
      bytesOutToDestination: result.ok ? metricSum(result.data?.Datapoints) : null,
      metricError: result.ok ? null : result.error,
    };
  });

  addCheck(checks, "natGatewayMetrics", "CloudWatch NAT Gateway Metrics", {
    ok: true,
    data: { natGateways: data },
  });
}

async function collectAwsSignals(options) {
  const endDate = isoDateDaysAgo(0);
  const startDate = isoDateDaysAgo(options.days);
  const context = { startDate, endDate };
  const checks = {};
  const runtimeOptions = { ...options, awsLimiter: createLimiter(options.concurrency) };

  for (const check of CHECKS) {
    const command = typeof check.command === "function" ? check.command(context) : check.command;
    const result = await runAwsJson(command, { ...runtimeOptions, region: check.region || (check.global ? null : options.region) });
    checks[check.id] = {
      service: check.service,
      ok: result.ok,
      data: result.data,
      error: result.error,
      required: Boolean(check.required),
    };
  }

  await Promise.all([
    checks.s3Buckets?.ok ? collectS3LifecycleSignals(checks, runtimeOptions) : null,
    checks.rdsInstances?.ok ? collectRdsMetricSignals(checks, runtimeOptions, context) : null,
    checks.loadBalancers?.ok ? collectLoadBalancerMetricSignals(checks, runtimeOptions, context) : null,
    checks.natGateways?.ok ? collectNatMetricSignals(checks, runtimeOptions, context) : null,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    region: options.region,
    days: options.days,
    concurrency: options.concurrency,
    maxResources: options.maxResources,
    profile: options.profile || null,
    checks,
  };
}

function dollars(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function costByService(check) {
  if (!check?.ok) return [];
  const groups = check.data?.ResultsByTime?.flatMap((period) => period.Groups || []) || [];
  const byService = new Map();
  for (const group of groups) {
    const service = group.Keys?.[0] || "Unknown";
    const unit = group.Metrics?.UnblendedCost?.Unit || "USD";
    const key = `${service}\0${unit}`;
    const current = byService.get(key) || { service, amount: 0, unit };
    current.amount += dollars(group.Metrics?.UnblendedCost?.Amount);
    byService.set(key, current);
  }
  return Array.from(byService.values())
    .map((item) => ({ ...item, amount: dollars(item.amount) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function flattenInstances(check) {
  if (!check?.ok) return [];
  return (check.data?.Reservations || []).flatMap((reservation) => reservation.Instances || []);
}

function estimatedSavingsFromSavingsPlans(check) {
  if (!check?.ok) return null;
  const detail = check.data?.SavingsPlansPurchaseRecommendation?.SavingsPlansPurchaseRecommendationDetails?.[0];
  const amount = dollars(detail?.EstimatedMonthlySavingsAmount || check.data?.SavingsPlansPurchaseRecommendation?.EstimatedMonthlySavingsAmount || 0);
  return amount > 0 ? amount : null;
}

function resourceSample(items, key, limit = 20) {
  return items.slice(0, limit).map((item) => (typeof key === "function" ? key(item) : item[key])).filter(Boolean);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const precision = amount >= 100 || unitIndex === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(precision).replace(/\.0$/, "")} ${units[unitIndex]}`;
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return "n/a";
  return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}%`;
}

function storageLifecycleStatistics(infiniteLogGroups, bucketsWithoutLifecycle) {
  const logBytes = infiniteLogGroups.reduce((total, group) => total + Number(group.storedBytes || 0), 0);
  const bucketStats = bucketsWithoutLifecycle.map((bucket) => bucket.storageStats || {}).filter((stats) => Number(stats.totalStorageBytes || 0) > 0 || Number(stats.objectCount || 0) > 0);
  const s3Bytes = bucketStats.reduce((total, stats) => total + Number(stats.totalStorageBytes || 0), 0);
  const coldS3Bytes = bucketStats.reduce((total, stats) => total + Number(stats.coldStorageBytes || 0), 0);
  const objectCount = bucketStats.reduce((total, stats) => total + Number(stats.objectCount || 0), 0);
  const totalBytes = logBytes + s3Bytes;
  const coldS3Percent = s3Bytes ? (coldS3Bytes / s3Bytes) * 100 : null;
  const infiniteLogPercent = totalBytes ? (logBytes / totalBytes) * 100 : null;
  const statistics = {
    "Measured data": formatBytes(totalBytes),
    "S3 measured": formatBytes(s3Bytes),
    "Cold/old-tier S3": `${formatBytes(coldS3Bytes)}${coldS3Percent == null ? "" : ` (${formatPercent(coldS3Percent)} of measured S3)`}`,
    "S3 objects": objectCount ? objectCount.toLocaleString() : "n/a",
    "Infinite-retention logs": `${formatBytes(logBytes)}${infiniteLogPercent == null ? "" : ` (${formatPercent(infiniteLogPercent)} of measured data)`}`,
  };
  const sentence = totalBytes
    ? `Observed ${formatBytes(totalBytes)} across sampled storage targets: ${formatBytes(s3Bytes)} in measured S3 buckets and ${formatBytes(logBytes)} in infinite-retention CloudWatch log groups. Cold/old-tier S3 data is ${formatBytes(coldS3Bytes)}${coldS3Percent == null ? "" : ` (${formatPercent(coldS3Percent)} of measured S3)`}.`
    : "Storage quantity metrics were not available for the sampled targets; the finding is based on missing lifecycle/retention policies and cost signals.";
  return { statistics, sentence, totalBytes, s3Bytes, coldS3Bytes, coldS3Percent, logBytes };
}

function instanceName(instance) {
  return (instance.Tags || []).find((tag) => tag.Key === "Name")?.Value || instance.InstanceId || "unknown";
}

function metricRange(values, key) {
  const numbers = values.map((item) => Number(item[key])).filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers), sum: numbers.reduce((total, value) => total + value, 0) };
}

function formatMetricRange(range, suffix = "%") {
  if (!range) return "not available";
  if (Math.abs(range.min - range.max) < 0.05) return `${range.max.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  return `${range.min.toFixed(1).replace(/\.0$/, "")}-${range.max.toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

function applicationInventorySummary(ssmApplications) {
  const managedInstances = ssmApplications.filter((item) => item.id);
  const withApps = managedInstances.filter((item) => (item.applications || []).length > 0);
  const appNames = [...new Set(withApps.flatMap((item) => (item.applications || []).map((app) => app.name).filter(Boolean)))].slice(0, 8);
  return {
    managedInstances,
    withApps,
    appNames,
    label: managedInstances.length ? `${withApps.length}/${managedInstances.length} SSM-managed instance${managedInstances.length === 1 ? "" : "s"} with application inventory` : "SSM Inventory not enabled",
  };
}

function missingTelemetryLabel(kind, missing, total) {
  if (!missing) return "";
  const source = kind === "memory" ? "CloudWatch Agent memory metrics" : "CloudWatch Agent disk metrics";
  return `${source} missing for ${missing}/${total}`;
}

function trafficMappingSummary(albTargetMappings, apiGatewayV2, apiGatewayRest, instanceIds) {
  const idSet = new Set(instanceIds);
  const targetGroups = albTargetMappings.filter((group) => (group.targets || []).some((target) => idSet.has(target.id)));
  const healthyTargets = targetGroups.flatMap((group) => group.targets || []).filter((target) => idSet.has(target.id) && target.state === "healthy").length;
  const apiCount = apiGatewayV2.length + apiGatewayRest.length;
  return {
    targetGroups,
    apiCount,
    label: `${targetGroups.length} ALB target group${targetGroups.length === 1 ? "" : "s"}, ${healthyTargets} healthy EC2 target${healthyTargets === 1 ? "" : "s"}, ${apiCount} API Gateway API${apiCount === 1 ? "" : "s"}`,
  };
}

function ec2ConsolidationCandidate(instances, metrics, ec2Cost, signals = {}) {
  const running = instances.filter((instance) => instance.State?.Name === "running");
  const metricsById = new Map(metrics.map((item) => [item.id, item]));
  const measured = running.map((instance) => ({ instance, metrics: metricsById.get(instance.InstanceId) })).filter((item) => item.metrics?.averageCpu != null);
  if (measured.length < 2) return null;
  const cpuAverage = metricRange(measured.map((item) => item.metrics), "averageCpu");
  const cpuMaximum = metricRange(measured.map((item) => item.metrics), "maximumCpu");
  const memoryAverage = metricRange(measured.map((item) => item.metrics).filter((item) => item.averageMemory != null), "averageMemory");
  const memoryMaximum = metricRange(measured.map((item) => item.metrics).filter((item) => item.maximumMemory != null), "maximumMemory");
  const diskMaximum = metricRange(measured.map((item) => item.metrics).filter((item) => item.maximumDisk != null), "maximumDisk");
  const missingMemory = measured.filter((item) => item.metrics.memoryStatus !== "observed").length;
  const missingDisk = measured.filter((item) => item.metrics.diskStatus !== "observed").length;
  const sameVpc = new Set(measured.map((item) => item.instance.VpcId).filter(Boolean)).size <= 1;
  const sameArchitecture = new Set(measured.map((item) => item.instance.Architecture).filter(Boolean)).size <= 1;
  const samePlatform = new Set(measured.map((item) => item.instance.PlatformDetails).filter(Boolean)).size <= 1;
  const hasCpuSpikes = Boolean(cpuMaximum && cpuMaximum.max > 75);
  const cpuLooksConsolidatable = cpuAverage.sum <= 55;
  const memoryLooksSafe = !memoryMaximum || memoryMaximum.max <= 75;
  const diskLooksSafe = !diskMaximum || diskMaximum.max <= 80;
  if (!cpuLooksConsolidatable || !memoryLooksSafe || !diskLooksSafe || !sameVpc || !sameArchitecture) return null;
  const estimatedSavings = ec2Cost && running.length > 1 ? dollars(ec2Cost / running.length) : null;
  const confidence = missingMemory || missingDisk || hasCpuSpikes ? "low" : samePlatform ? "medium" : "low";
  const measuredIds = measured.map((item) => item.instance.InstanceId);
  const appInventory = applicationInventorySummary(signals.ssmApplications || []);
  const traffic = trafficMappingSummary(signals.albTargetMappings || [], signals.apiGatewayV2 || [], signals.apiGatewayRest || [], measuredIds);
  const telemetryGaps = [
    missingTelemetryLabel("memory", missingMemory, measured.length),
    missingTelemetryLabel("disk", missingDisk, measured.length),
    appInventory.managedInstances.length ? "" : "SSM Managed Instance inventory not enabled",
  ].filter(Boolean);
  return {
    measured,
    estimatedSavings,
    hasCpuSpikes,
    confidence,
    appInventory,
    traffic,
    statistics: {
      "Running instances": String(running.length),
      "Measured instances": String(measured.length),
      "Combined avg CPU": `${cpuAverage.sum.toFixed(1).replace(/\.0$/, "")}% instance-capacity`,
      "Peak CPU range": formatMetricRange(cpuMaximum),
      "Memory usage": missingMemory ? missingTelemetryLabel("memory", missingMemory, measured.length) : formatMetricRange(memoryMaximum),
      "Disk usage": missingDisk ? missingTelemetryLabel("disk", missingDisk, measured.length) : formatMetricRange(diskMaximum),
      "Traffic mapping": traffic.label,
      "App inventory": appInventory.label,
      "Telemetry gap": telemetryGaps.length ? telemetryGaps.join("; ") : "none",
      "Compatibility": `${sameVpc ? "same VPC" : "different VPCs"}, ${sameArchitecture ? "same architecture" : "mixed architecture"}, ${samePlatform ? "same platform" : "mixed platform"}`,
    },
  };
}

function serverlessMigrationCandidate(ec2Consolidation) {
  if (!ec2Consolidation) return null;
  const hasEntrypointEvidence = ec2Consolidation.traffic.targetGroups.length > 0 || ec2Consolidation.traffic.apiCount > 0 || ec2Consolidation.appInventory.withApps.length > 0;
  if (!hasEntrypointEvidence) return null;
  return {
    confidence: ec2Consolidation.traffic.targetGroups.length || ec2Consolidation.traffic.apiCount ? "low" : "very low",
    statistics: {
      "Candidate hosts": String(ec2Consolidation.measured.length),
      "Traffic mapping": ec2Consolidation.traffic.label,
      "App inventory": ec2Consolidation.appInventory.label,
      "Observed CPU": ec2Consolidation.statistics["Combined avg CPU"],
      "Peak CPU range": ec2Consolidation.statistics["Peak CPU range"],
    },
  };
}

function rootVolumeForInstance(instance, volumes) {
  const rootDeviceName = instance.RootDeviceName || "/dev/xvda";
  const rootMapping = (instance.BlockDeviceMappings || []).find((mapping) => mapping.DeviceName === rootDeviceName) || (instance.BlockDeviceMappings || [])[0];
  const mappedVolumeId = rootMapping?.Ebs?.VolumeId;
  return volumes.find((volume) => {
    if (mappedVolumeId && volume.VolumeId === mappedVolumeId) return true;
    return (volume.Attachments || []).some((attachment) => attachment.InstanceId === instance.InstanceId && (!mappedVolumeId || attachment.VolumeId === mappedVolumeId));
  }) || null;
}

function batchWorkloadSignal(instance, inventoryItem) {
  const tagText = (instance.Tags || []).map((tag) => `${tag.Key || ""} ${tag.Value || ""}`).join(" ");
  const appText = (inventoryItem?.applications || []).map((app) => app.name || "").join(" ");
  const text = `${instance.InstanceId || ""} ${tagText} ${appText}`.toLowerCase();
  const signals = ["batch", "scanner", "worker", "cron", "schedule", "scheduler", "etl", "backfill", "import", "export", "sync", "report"];
  return signals.filter((signal) => text.includes(signal));
}

function targetRootVolumeSizeGiB(volumeSizeGiB, maximumDiskPercent) {
  if (maximumDiskPercent == null || !Number.isFinite(Number(maximumDiskPercent))) return null;
  const usedGiB = volumeSizeGiB * (Number(maximumDiskPercent) / 100);
  const target = Math.max(20, Math.ceil((usedGiB / 0.65) / 5) * 5);
  return target < volumeSizeGiB ? target : null;
}

function batchEc2OptimizationCandidate(instances, metrics, volumes, ec2Cost, signals = {}) {
  const running = instances.filter((instance) => instance.State?.Name === "running");
  const metricsById = new Map(metrics.map((item) => [item.id, item]));
  const inventoryById = new Map((signals.ssmApplications || []).map((item) => [item.id, item]));
  const albMappings = signals.albTargetMappings || [];
  const candidates = running.map((instance) => {
    const rootVolume = rootVolumeForInstance(instance, volumes);
    const metric = metricsById.get(instance.InstanceId) || {};
    const inventoryItem = inventoryById.get(instance.InstanceId);
    const signalsFound = batchWorkloadSignal(instance, inventoryItem);
    const attachedTargetGroups = albMappings.filter((group) => (group.targets || []).some((target) => target.id === instance.InstanceId));
    if (!rootVolume || Number(rootVolume.Size || 0) < 80 || attachedTargetGroups.length) return null;
    if (metric.cpuStatus !== "observed" || metric.rootDiskStatus !== "observed") return null;
    const targetGiB = targetRootVolumeSizeGiB(Number(rootVolume.Size || 0), metric.maximumRootDisk);
    if (!targetGiB || targetGiB > Number(rootVolume.Size || 0) * 0.75) return null;
    const lowCpu = metric.averageCpu != null && Number(metric.averageCpu) <= 15;
    const noLargeCpuSpike = metric.maximumCpu != null && Number(metric.maximumCpu) <= 70;
    const hasBatchSignal = signalsFound.length > 0;
    if (!lowCpu || !noLargeCpuSpike || !hasBatchSignal) return null;
    const rate = rootVolume.VolumeType === "gp3" ? 0.08 : 0.10;
    return {
      instance,
      rootVolume,
      metric,
      targetGiB,
      signalsFound,
      storageSavings: Math.max(0, (Number(rootVolume.Size || 0) - targetGiB) * rate),
    };
  }).filter(Boolean);

  if (!candidates.length) return null;
  const storageSavings = candidates.reduce((total, item) => total + item.storageSavings, 0);
  const runningCostPerInstance = ec2Cost && running.length ? ec2Cost / running.length : null;
  const hasRuntimeSchedulingEvidence = candidates.some((item) => item.signalsFound.length > 0);
  return {
    candidates,
    runningCount: running.length,
    estimatedSavings: dollars(storageSavings),
    confidence: candidates.every((item) => item.metric.rootDiskStatus === "observed" && item.metric.cpuStatus === "observed") ? "medium" : "low",
    statistics: {
      "Candidate hosts": String(candidates.length),
      "Root volume right-size": candidates.map((item) => `${instanceName(item.instance)}: ${item.rootVolume.Size} GiB -> ${item.targetGiB} GiB`).join(", "),
      "Observed root disk": candidates.map((item) => `${instanceName(item.instance)}: ${item.metric.maximumRootDisk == null ? "not available" : formatPercent(item.metric.maximumRootDisk)}`).join(", "),
      "Observed CPU": candidates.map((item) => `${instanceName(item.instance)}: avg ${item.metric.averageCpu == null ? "not available" : formatPercent(item.metric.averageCpu)}, peak ${item.metric.maximumCpu == null ? "not available" : formatPercent(item.metric.maximumCpu)}`).join(", "),
      "Batch/schedule signals": candidates.map((item) => `${instanceName(item.instance)}: ${item.signalsFound.length ? item.signalsFound.join(", ") : "none"}`).join(", "),
      "Storage savings": `$${dollars(storageSavings).toLocaleString()}/mo before snapshots`,
      "Runtime scheduling": hasRuntimeSchedulingEvidence ? "Candidate for stop/start schedule after owner-approved run window validation" : "Requires owner-provided run window before estimating compute savings",
      "Compute cost context": runningCostPerInstance == null ? "Needs instance-level pricing or hourly Cost Explorer data" : `Rough current EC2 cost allocation is $${dollars(runningCostPerInstance).toLocaleString()}/mo per running instance before schedule modeling`,
    },
  };
}

const LAMBDA_X86_GB_SECOND_PRICE = 0.0000166667;
const LAMBDA_REQUEST_PRICE = 0.20 / 1_000_000;

function monthlyInvocations(job, defaultLookbackDays) {
  const runs = Number(job.runs || 0);
  const lookbackDays = Number(job.lookbackDays || defaultLookbackDays || 30);
  if (!runs || !Number.isFinite(lookbackDays) || lookbackDays <= 0) return null;
  return Math.ceil(runs * (30 / lookbackDays));
}

function lambdaMemoryMb(job) {
  const value = Number(job.memoryMb || job.maxMemoryMb || job.p95MemoryMb || job.averageMemoryMb || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function lambdaFitSeconds(job) {
  const value = Number(job.maxSeconds || job.p95Seconds || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function lambdaMonthlyCost(job, defaultLookbackDays) {
  const invocations = monthlyInvocations(job, defaultLookbackDays);
  const memoryMb = lambdaMemoryMb(job);
  const durationSeconds = Number(job.p95Seconds || job.averageSeconds || 0);
  if (!invocations || !memoryMb || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const gbSeconds = invocations * durationSeconds * (memoryMb / 1024);
  return dollars(gbSeconds * LAMBDA_X86_GB_SECOND_PRICE + invocations * LAMBDA_REQUEST_PRICE);
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return "n/a";
  if (value < 60) return `${value.toFixed(value % 1 === 0 ? 0 : 1)}s`;
  const minutes = value / 60;
  if (minutes < 60) return `${minutes.toFixed(minutes % 1 === 0 ? 0 : 1)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;
}

function scheduledLambdaMigrationCandidate(batchEc2Optimization, jobRuntimes, ec2Cost, days) {
  if (!batchEc2Optimization || !Array.isArray(jobRuntimes) || !jobRuntimes.length) return null;
  const candidateIds = new Set(batchEc2Optimization.candidates.map((item) => item.instance.InstanceId));
  const jobs = jobRuntimes.filter((job) => candidateIds.has(job.instanceId));
  if (!jobs.length) return null;
  const directLambda = jobs.filter((job) => lambdaMonthlyCost(job, days) != null && lambdaFitSeconds(job) != null && lambdaFitSeconds(job) <= 900);
  const longRunning = jobs.filter((job) => lambdaFitSeconds(job) != null && lambdaFitSeconds(job) > 900);
  const incomplete = jobs.filter((job) => lambdaFitSeconds(job) == null || lambdaMemoryMb(job) == null);
  if (!directLambda.length) return null;
  const projectedLambdaCost = dollars(directLambda.reduce((total, job) => total + lambdaMonthlyCost(job, days), 0));
  const estimatedEc2Allocation = ec2Cost && batchEc2Optimization.runningCount ? dollars(ec2Cost / batchEc2Optimization.runningCount) : null;
  const canEliminateHost = longRunning.length === 0 && incomplete.length === 0;
  return {
    directLambda,
    longRunning,
    incomplete,
    projectedLambdaCost,
    estimatedSavings: null,
    confidence: longRunning.length || incomplete.length ? "medium" : "high",
    statistics: {
      "Direct Lambda candidates": directLambda.map((job) => `${job.serviceName || job.jobName}: ${monthlyInvocations(job, days).toLocaleString()} runs/mo, p95 ${formatDuration(job.p95Seconds)}, max ${formatDuration(job.maxSeconds)}, ${lambdaMemoryMb(job)} MB`).join("; "),
      "Projected Lambda cost": `$${projectedLambdaCost.toLocaleString()}/mo for direct candidates`,
      "Long-running blockers": longRunning.length ? longRunning.map((job) => `${job.serviceName || job.jobName}: max ${formatDuration(job.maxSeconds)}; split with SQS/Step Functions or keep as batch`).join("; ") : "none",
      "Incomplete blockers": incomplete.length ? incomplete.map((job) => `${job.serviceName || job.jobName}: missing ${lambdaFitSeconds(job) == null ? "runtime" : "memory"} evidence`).join("; ") : "none",
      "EC2 elimination": canEliminateHost ? "All observed jobs fit within Lambda's 15-minute limit, but savings still require instance-level cost attribution and state-removal validation" : "Not yet; long-running or incomplete jobs prevent eliminating the host as-is",
      "EC2 cost context": estimatedEc2Allocation == null ? "Needs instance-level pricing or hourly Cost Explorer data" : `Rough account-level EC2 allocation is $${estimatedEc2Allocation.toLocaleString()}/mo per running instance; not used as claimed savings`,
    },
  };
}

function gravitonTargetType(instanceType) {
  const gravitonSizes = new Set(["nano", "micro", "small", "medium", "large", "xlarge", "2xlarge", "4xlarge", "8xlarge", "12xlarge", "16xlarge"]);
  const parts = String(instanceType || "").split(".");
  if (parts.length !== 2) return null;
  const [family, size] = parts;
  if (!gravitonSizes.has(size)) return null;
  const generation = family.match(/^([cmrt])(\d+)([a-z]*)$/i);
  if (!generation) return null;
  const [, prefix, generationNumber, suffix] = generation;
  if (suffix && suffix !== "a" && suffix !== "i") return null;
  const generationValue = Number(generationNumber);
  if (!Number.isFinite(generationValue) || generationValue < 3) return null;
  const targetGeneration = prefix.toLowerCase() === "t" && generationValue <= 3 ? 4 : Math.max(6, generationValue);
  return `${prefix.toLowerCase()}${targetGeneration}g.${size}`;
}

function isLinuxPlatform(platformDetails) {
  const value = String(platformDetails || "").toLowerCase();
  const linuxSignals = ["linux", "ubuntu", "red hat", "rhel", "suse", "debian", "amazon linux"];
  return linuxSignals.some((signal) => value.includes(signal)) && !value.includes("windows") && !value.includes("sql server");
}

function gravitonCandidates(instances) {
  const candidates = instances
    .filter((instance) => instance.State?.Name === "running")
    .filter((instance) => String(instance.Architecture || "").toLowerCase() === "x86_64")
    .filter((instance) => isLinuxPlatform(instance.PlatformDetails))
    .map((instance) => ({ instance, targetType: gravitonTargetType(instance.InstanceType) }))
    .filter((item) => item.targetType);
  if (!candidates.length) return null;
  const families = [...new Set(candidates.map((item) => `${item.instance.InstanceType} -> ${item.targetType}`))];
  return {
    candidates,
    statistics: {
      "Candidate instances": String(candidates.length),
      "Current architecture": "x86_64",
      "Target architecture": "AWS Graviton arm64",
      "Instance families": families.join(", "),
      "Estimated savings": "Requires candidate-level pricing validation",
      "Validation required": "AMI, OS packages, native dependencies, agents, and application runtime must support arm64",
    },
  };
}

function addFinding(findings, finding) {
  findings.push({
    confidence: "medium",
    executionMode: "assisted",
    validationWindow: "Monitor service health, error rate, latency, utilization, and spend for 24-72 hours after change.",
    ...finding,
  });
}

function buildFindings(assessment) {
  const findings = [];
  const checks = assessment.checks || {};
  const costs = costByService(checks.costByService);
  const totalCost = costs.reduce((total, item) => total + item.amount, 0);
  const instances = flattenInstances(checks.ec2Instances);
  const stoppedInstances = instances.filter((instance) => instance.State?.Name === "stopped");
  const volumes = checks.ebsVolumes?.ok ? checks.ebsVolumes.data?.Volumes || [] : [];
  const unattachedVolumes = volumes.filter((volume) => volume.State === "available");
  const addresses = checks.elasticIps?.ok ? checks.elasticIps.data?.Addresses || [] : [];
  const unassociatedAddresses = addresses.filter((address) => !address.AssociationId);
  const logGroups = checks.logGroups?.ok ? checks.logGroups.data?.logGroups || [] : [];
  const infiniteLogGroups = logGroups.filter((group) => !group.retentionInDays);
  const s3LifecycleBuckets = checks.s3Lifecycle?.ok ? checks.s3Lifecycle.data?.buckets || [] : [];
  const bucketsWithoutLifecycle = s3LifecycleBuckets.filter((bucket) => bucket.lifecycleStatus === "missing");
  const optimizerRecommendations = checks.computeOptimizerEc2?.ok ? checks.computeOptimizerEc2.data?.instanceRecommendations || [] : [];
  const notOptimized = optimizerRecommendations.filter((item) => {
    const finding = String(item.finding || "").toLowerCase().replace(/[^a-z]/g, "");
    return finding && finding !== "optimized";
  });
  const rdsMetrics = checks.rdsMetrics?.ok ? checks.rdsMetrics.data?.instances || [] : [];
  const lowUseRds = rdsMetrics.filter((instance) => instance.status === "available" && instance.averageCpu != null && instance.averageCpu < 10 && (instance.averageConnections == null || instance.averageConnections < 5));
  const loadBalancerMetrics = checks.loadBalancerMetrics?.ok ? checks.loadBalancerMetrics.data?.loadBalancers || [] : [];
  const idleLoadBalancers = loadBalancerMetrics.filter((loadBalancer) => loadBalancer.state === "active" && (loadBalancer.metricSum === 0 || loadBalancer.metricStatus === "no-data"));
  const natGateways = checks.natGateways?.ok ? checks.natGateways.data?.NatGateways || [] : [];
  const activeNatGateways = natGateways.filter((gateway) => gateway.State === "available");
  const natMetrics = checks.natGatewayMetrics?.ok ? checks.natGatewayMetrics.data?.natGateways || [] : [];
  const highTrafficNatGateways = natMetrics.filter((gateway) => gateway.state === "available" && Number(gateway.bytesOutToDestination || 0) > 1024 ** 3);
  const ec2Cost = costs.find((item) => /Elastic Compute Cloud|EC2/i.test(item.service))?.amount || 0;
  const s3Cost = costs.find((item) => /Simple Storage Service|S3/i.test(item.service))?.amount || 0;
  const ec2Metrics = checks.ec2Metrics?.ok ? checks.ec2Metrics.data?.instances || [] : [];
  const ec2Consolidation = ec2ConsolidationCandidate(instances, ec2Metrics, ec2Cost, {
    albTargetMappings: checks.albTargetMappings?.ok ? checks.albTargetMappings.data?.targetGroups || [] : [],
    apiGatewayV2: checks.apiGatewayV2?.ok ? checks.apiGatewayV2.data?.Items || [] : [],
    apiGatewayRest: checks.apiGatewayRest?.ok ? checks.apiGatewayRest.data?.items || [] : [],
    ssmApplications: checks.ssmApplications?.ok ? checks.ssmApplications.data?.instances || [] : [],
  });
  const serverlessMigration = serverlessMigrationCandidate(ec2Consolidation);
  const batchEc2Optimization = batchEc2OptimizationCandidate(instances, ec2Metrics, volumes, ec2Cost, {
    albTargetMappings: checks.albTargetMappings?.ok ? checks.albTargetMappings.data?.targetGroups || [] : [],
    ssmApplications: checks.ssmApplications?.ok ? checks.ssmApplications.data?.instances || [] : [],
  });
  const scheduledLambdaMigration = scheduledLambdaMigrationCandidate(
    batchEc2Optimization,
    checks.ec2JobRuntimes?.ok ? checks.ec2JobRuntimes.data?.jobs || [] : [],
    ec2Cost,
    assessment.days
  );
  const gravitonMigration = gravitonCandidates(instances);
  const savingsPlanSavings = estimatedSavingsFromSavingsPlans(checks.savingsPlansRecommendation);

  if (unattachedVolumes.length) {
    const monthlyEstimate = unattachedVolumes.reduce((total, volume) => {
      const size = Number(volume.Size || 0);
      const rate = volume.VolumeType === "gp3" ? 0.08 : 0.10;
      return total + size * rate;
    }, 0);
    addFinding(findings, {
      id: "idle-ebs-volumes",
      strategy: "Idle resource cleanup",
      title: `Review ${unattachedVolumes.length} unattached EBS volume${unattachedVolumes.length === 1 ? "" : "s"}`,
      estimatedMonthlySavings: dollars(monthlyEstimate),
      confidence: "high",
      blastRadius: "Per-volume; no running workload is currently attached.",
      operationalRisk: "low",
      downtimeRisk: "none if volumes are truly detached",
      impactAnalysis: "Deleting a detached volume has no compute downtime, but data is permanently removed unless a snapshot exists.",
      minimizeImpact: "Snapshot first, retain the snapshot for an agreed rollback window, require owner approval for production-tagged volumes, then delete in small batches.",
      rollbackPath: "Create a new EBS volume from the retained snapshot and attach it to the original instance or replacement instance.",
      resources: resourceSample(unattachedVolumes, "VolumeId"),
    });
  }

  if (unassociatedAddresses.length) {
    addFinding(findings, {
      id: "idle-elastic-ips",
      strategy: "Idle resource cleanup",
      title: `Release ${unassociatedAddresses.length} unassociated Elastic IP address${unassociatedAddresses.length === 1 ? "" : "es"}`,
      estimatedMonthlySavings: dollars(unassociatedAddresses.length * 3.6),
      confidence: "high",
      blastRadius: "Per-address; no active ENI or instance association is present.",
      operationalRisk: "low",
      downtimeRisk: "none for unassociated addresses",
      impactAnalysis: "Releasing an unassociated Elastic IP has no workload downtime, but the exact public IP may not be recoverable later.",
      minimizeImpact: "Confirm DNS, firewall allowlists, and owner intent before release; quarantine production-tagged addresses for a review window.",
      rollbackPath: "Allocate a new Elastic IP and update DNS/firewall references if the old address cannot be recovered.",
      resources: resourceSample(unassociatedAddresses, "PublicIp"),
    });
  }

  if (stoppedInstances.length) {
    addFinding(findings, {
      id: "stopped-ec2-instances",
      strategy: "Idle resource cleanup",
      title: `Validate ${stoppedInstances.length} stopped EC2 instance${stoppedInstances.length === 1 ? "" : "s"} and attached storage`,
      estimatedMonthlySavings: 0,
      confidence: "medium",
      blastRadius: "Per-instance plus attached EBS volumes and Elastic IPs.",
      operationalRisk: "low",
      downtimeRisk: "none for already stopped instances",
      impactAnalysis: "Stopped instances do not incur compute charges, but attached EBS volumes, snapshots, and Elastic IPs can continue to cost money.",
      minimizeImpact: "Confirm owner and last-use intent, snapshot required data, release unused Elastic IPs, then remove instances and dependent storage only after approval.",
      rollbackPath: "Restore from AMI/snapshot or recreate from infrastructure-as-code if available.",
      resources: resourceSample(stoppedInstances, "InstanceId"),
    });
  }

  if (idleLoadBalancers.length) {
    addFinding(findings, {
      id: "idle-load-balancers",
      strategy: "Idle resource cleanup",
      title: `Investigate ${idleLoadBalancers.length} load balancer${idleLoadBalancers.length === 1 ? "" : "s"} with no observed traffic`,
      estimatedMonthlySavings: null,
      confidence: "medium",
      blastRadius: "Per-load-balancer and any DNS names, target groups, listeners, and security groups attached to it.",
      operationalRisk: "medium",
      downtimeRisk: "possible if DNS or clients still depend on it",
      impactAnalysis: "A load balancer with no sampled requests may still be used by rare jobs, health checks, allowlists, or disaster-recovery flows.",
      minimizeImpact: "Extend the metric lookback, verify DNS records and access logs, disable listeners before deletion, and watch for failed requests during a quarantine window.",
      rollbackPath: "Recreate the load balancer from infrastructure-as-code or retained configuration and restore DNS.",
      resources: resourceSample(idleLoadBalancers, "name"),
    });
  }

  if (notOptimized.length) {
    addFinding(findings, {
      id: "ec2-rightsizing",
      strategy: "Rightsizing",
      title: `Evaluate ${notOptimized.length} EC2 Compute Optimizer recommendation${notOptimized.length === 1 ? "" : "s"}`,
      estimatedMonthlySavings: null,
      confidence: "high",
      blastRadius: "Per-instance or Auto Scaling group depending on ownership.",
      operationalRisk: "medium",
      downtimeRisk: "restart or rolling replacement",
      impactAnalysis: "Instance type changes usually require stop/start or rolling replacement. Performance risk depends on CPU, memory, network, and disk headroom.",
      minimizeImpact: "Apply one size step at a time, use Auto Scaling rolling replacement where possible, avoid peak windows, and monitor p95 CPU, memory, latency, and error rate.",
      rollbackPath: "Revert to the prior instance type or previous launch template version.",
      resources: resourceSample(notOptimized, (item) => item.instanceArn || item.instanceName || item.instanceId),
    });
  }

  if (gravitonMigration) {
    addFinding(findings, {
      id: "ec2-graviton-modernization",
      strategy: "Compute modernization",
      title: `Assess Graviton migration for ${gravitonMigration.candidates.length} x86 EC2 instance${gravitonMigration.candidates.length === 1 ? "" : "s"}`,
      estimatedMonthlySavings: null,
      confidence: "medium",
      blastRadius: "Per-instance application runtime, AMI, native packages, agents, and deployment pipeline.",
      operationalRisk: "medium",
      downtimeRisk: "restart or rolling replacement",
      impactAnalysis: "Moving from x86 to Graviton changes CPU architecture. Most Linux services migrate cleanly, but native dependencies, agents, container images, and compiled extensions must be validated before cutover.",
      minimizeImpact: "Launch one arm64 canary or parallel Auto Scaling group first, replay production-like traffic, verify latency/error rates and package compatibility, then roll gradually with an x86 rollback target available.",
      rollbackPath: "Switch traffic or launch template back to the previous x86 instance type and AMI, then terminate the Graviton canary after validation.",
      validationWindow: "Run at least one normal traffic cycle on Graviton and compare p95 latency, error rate, CPU, memory, and deployment health against the x86 baseline.",
      statistics: gravitonMigration.statistics,
      resources: resourceSample(gravitonMigration.candidates, (item) => `${instanceName(item.instance)} (${item.instance.InstanceType} -> ${item.targetType})`),
    });
  }

  if (ec2Consolidation) {
    const names = ec2Consolidation.measured.map(({ instance }) => instanceName(instance));
    addFinding(findings, {
      id: "ec2-app-consolidation",
      strategy: "Workload consolidation",
      title: `Assess consolidating ${ec2Consolidation.measured.length} low-utilization EC2 instance${ec2Consolidation.measured.length === 1 ? "" : "s"}`,
      estimatedMonthlySavings: ec2Consolidation.estimatedSavings,
      confidence: ec2Consolidation.confidence,
      blastRadius: "Application processes, ports, host-level dependencies, IAM instance profile, security groups, DNS, and deployment scripts on the candidate EC2 instances.",
      operationalRisk: "medium",
      downtimeRisk: "possible during app migration or DNS cutover",
      impactAnalysis: `Observed average CPU indicates the sampled apps may fit on fewer EC2 instances, but this is an assessment candidate, not an automatic termination recommendation. ${ec2Consolidation.hasCpuSpikes ? `CPU has spikes (${ec2Consolidation.statistics["Peak CPU range"]}), so validate peak-hour behavior before moving anything. ` : ""}Memory/disk and application inventory require guest telemetry: ${ec2Consolidation.statistics["Telemetry gap"]}.`,
      minimizeImpact: "Before moving apps, enable CloudWatch Agent memory/disk metrics and SSM Inventory on candidate instances, inventory running services and ports, move one app at a time, keep the source instance stopped but restorable during a rollback window, and monitor CPU, memory, disk, latency, and error rate before terminating anything.",
      rollbackPath: "Restart the original instance or restore from AMI/snapshot, revert DNS/load-balancer targets, and move the app process back to its original host.",
      validationWindow: "Run both apps on the target host through at least one normal traffic cycle; require CPU, memory, disk, latency, and errors to remain within agreed thresholds before terminating a source instance.",
      statistics: ec2Consolidation.statistics,
      resources: names,
    });
  }

  if (serverlessMigration) {
    addFinding(findings, {
      id: "ec2-to-lambda-assessment",
      strategy: "Serverless migration assessment",
      title: "Assess whether low-utilization EC2 app entrypoints can move to Lambda",
      estimatedMonthlySavings: null,
      confidence: serverlessMigration.confidence,
      blastRadius: "API handlers, scheduled jobs, workers, IAM roles, network access, environment variables, deployment flow, and any local filesystem/state dependencies.",
      operationalRisk: "medium",
      downtimeRisk: "possible during API cutover or worker migration",
      impactAnalysis: "Traffic/app inventory signals suggest at least one low-utilization EC2 workload may be worth evaluating for Lambda, but Lambda fit depends on request duration, statelessness, package size, VPC needs, cold-start tolerance, and concurrency profile.",
      minimizeImpact: "Start with one stateless endpoint or worker, replay production-like traffic, compare p95 duration and error rate, keep the EC2 implementation live behind a reversible route/feature flag, and only terminate EC2 capacity after steady-state validation.",
      rollbackPath: "Route traffic back to the EC2 endpoint, disable the Lambda trigger or API integration, and keep the original instance running until the rollback window closes.",
      validationWindow: "Measure Lambda duration, throttles, errors, cold starts, downstream latency, and total Lambda plus API Gateway/EventBridge/SQS cost for at least one normal traffic cycle.",
      statistics: serverlessMigration.statistics,
      resources: ec2Consolidation.measured.map(({ instance }) => instanceName(instance)),
    });
  }

  if (batchEc2Optimization) {
    addFinding(findings, {
      id: "ec2-batch-host-optimization",
      strategy: "Batch workload optimization",
      title: `Assess scheduling and disk right-sizing for ${batchEc2Optimization.candidates.length} EC2 batch host${batchEc2Optimization.candidates.length === 1 ? "" : "s"}`,
      estimatedMonthlySavings: batchEc2Optimization.estimatedSavings,
      confidence: batchEc2Optimization.confidence,
      blastRadius: "Per-instance root volume, local state, scheduled jobs, attached IAM role, DNS/clients, and any applications running only on that host.",
      operationalRisk: "medium",
      downtimeRisk: "planned stop/start for root-volume shrink or instance schedule enforcement",
      impactAnalysis: "This matches the stockscanner-style optimization path: oversized root EBS plus low-utilization batch signals can often be reduced by snapshotting and replacing the root volume with a smaller one, removing unused heavyweight runtime dependencies, and running the EC2 instance only during approved work windows. Root-volume shrink requires planned downtime because AWS cannot reduce an EBS volume in place.",
      minimizeImpact: "Before any action, warn the owner with expected downtime, snapshot the existing root volume, validate actual used disk from the guest OS, create and boot a smaller replacement volume in a maintenance window, and put stop/start scheduling in dry-run or notification-only mode until the run window is confirmed.",
      rollbackPath: "Stop the instance, reattach the original root volume or restore from the retained snapshot, disable the EventBridge schedule, and restart the prior services.",
      validationWindow: "After the change, verify boot, application health, scheduled job completion, disk free space, CPU, memory, and monthly EC2/EBS spend across at least one normal run window.",
      statistics: batchEc2Optimization.statistics,
      resources: resourceSample(batchEc2Optimization.candidates, (item) => `${instanceName(item.instance)} (${item.instance.InstanceId}, ${item.rootVolume.VolumeId})`),
    });
  }

  if (scheduledLambdaMigration) {
    addFinding(findings, {
      id: "ec2-scheduled-jobs-to-lambda",
      strategy: "Serverless batch migration",
      title: `Pilot Lambda/S3 for ${scheduledLambdaMigration.directLambda.length} short scheduled EC2 job${scheduledLambdaMigration.directLambda.length === 1 ? "" : "s"}`,
      estimatedMonthlySavings: scheduledLambdaMigration.estimatedSavings,
      confidence: scheduledLambdaMigration.confidence,
      blastRadius: "Scheduled job code, environment variables, IAM permissions, local files, local database writes, outbound API calls, and notification side effects.",
      operationalRisk: "medium",
      downtimeRisk: "none for a parallel Lambda pilot; possible data consistency impact during cutover",
      impactAnalysis: scheduledLambdaMigration.longRunning.length || scheduledLambdaMigration.incomplete.length
        ? "Observed runtime and memory evidence shows some scheduled jobs fit Lambda well, but long-running or incomplete jobs still block EC2 host removal. Any job that exceeds Lambda's 15-minute execution model should be split into smaller SQS/Step Functions chunks before EC2 savings are claimed."
        : "Observed runtime and memory evidence shows the scheduled jobs fit Lambda's execution model. A parallel Lambda plus S3 pilot can reduce always-on or scheduled EC2 runtime if local state is removed.",
      minimizeImpact: "Run Lambda in parallel first, write outputs to S3 or a managed datastore, make jobs idempotent, compare outputs with the EC2 job, keep EC2 timers enabled until several successful matching runs, then disable one timer at a time.",
      rollbackPath: "Disable the EventBridge/Lambda trigger, re-enable the original systemd timer or EC2 schedule, and replay missed work from S3 or the source API.",
      validationWindow: "Compare duration, memory, errors, retries, downstream API rate limits, output row counts, and monthly Lambda/EventBridge/S3 cost over at least one normal trading cycle.",
      statistics: scheduledLambdaMigration.statistics,
      resources: resourceSample(scheduledLambdaMigration.directLambda, (job) => `${job.serviceName || job.jobName} (${job.instanceId})`),
    });
  }

  if (lowUseRds.length) {
    addFinding(findings, {
      id: "rds-rightsizing",
      strategy: "Rightsizing",
      title: `Review ${lowUseRds.length} low-utilization RDS instance${lowUseRds.length === 1 ? "" : "s"}`,
      estimatedMonthlySavings: null,
      confidence: "medium",
      blastRadius: "Per-database instance; application impact depends on connection handling and failover topology.",
      operationalRisk: "medium",
      downtimeRisk: "maintenance window, restart, or Multi-AZ failover",
      impactAnalysis: "RDS class changes can cause failover or downtime. Under-provisioning can increase query latency or exhaust memory/IO.",
      minimizeImpact: "Use a maintenance window, verify freeable memory/IOPS/storage headroom, test one class step down, and prioritize Multi-AZ failover paths.",
      rollbackPath: "Scale back to the previous DB instance class during the next approved window or fail back if Multi-AZ behavior is unhealthy.",
      resources: resourceSample(lowUseRds, "id"),
    });
  }

  if ((savingsPlanSavings && savingsPlanSavings > 0) || ec2Cost > Math.max(100, totalCost * 0.2)) {
    const hasNativeSavingsPlanRecommendation = Boolean(savingsPlanSavings);
    addFinding(findings, {
      id: "compute-commitments",
      strategy: "Commitment optimization",
      title: hasNativeSavingsPlanRecommendation ? "Review AWS Savings Plans purchase recommendation" : "Estimate whether compute spend merits Savings Plans analysis",
      estimatedMonthlySavings: hasNativeSavingsPlanRecommendation ? savingsPlanSavings : null,
      confidence: hasNativeSavingsPlanRecommendation ? "high" : "low",
      blastRadius: "Financial commitment across eligible compute usage.",
      operationalRisk: "low",
      downtimeRisk: "none",
      impactAnalysis: hasNativeSavingsPlanRecommendation
        ? "Savings Plans do not change running infrastructure, but they create financial lock-in if usage drops or shifts."
        : "This is a heuristic signal based on EC2 service spend, not a purchase recommendation. It should only trigger deeper hourly-usage analysis.",
      minimizeImpact: "Commit only to a conservative baseline, start with partial coverage, exclude new or volatile accounts, generate native AWS recommendations first, and review hourly usage stability before purchase.",
      rollbackPath: "No technical rollback; mitigate by buying smaller commitments and letting them expire naturally.",
    });
  }

  const storageStats = storageLifecycleStatistics(infiniteLogGroups, bucketsWithoutLifecycle);
  const hasStorageLifecycleEvidence = storageStats.s3Bytes > 0
    ? storageStats.coldS3Percent >= 10
    : storageStats.logBytes > 0;
  if ((infiniteLogGroups.length || bucketsWithoutLifecycle.length || s3Cost > Math.max(50, totalCost * 0.1)) && hasStorageLifecycleEvidence) {
    addFinding(findings, {
      id: "storage-lifecycle",
      strategy: "Storage lifecycle optimization",
      title: `Add retention/lifecycle policies for ${infiniteLogGroups.length + bucketsWithoutLifecycle.length || "candidate"} storage target${infiniteLogGroups.length + bucketsWithoutLifecycle.length === 1 ? "" : "s"}`,
      estimatedMonthlySavings: s3Cost ? dollars(s3Cost * 0.1) : null,
      confidence: infiniteLogGroups.length || bucketsWithoutLifecycle.length ? "high" : "medium",
      blastRadius: "Log groups and storage buckets selected for lifecycle policy.",
      operationalRisk: "low",
      downtimeRisk: "none, but retrieval latency can increase for archive tiers",
      impactAnalysis: `${storageStats.sentence} Retention changes can remove historical logs or move objects to slower retrieval classes, affecting incident response and analytics.`,
      minimizeImpact: "Start with transition policies before deletion, preserve compliance-tagged data, use longer retention for production logs, and avoid Deep Archive without explicit restore-time approval.",
      rollbackPath: "Increase retention going forward; restore archived objects when needed, subject to storage class restore latency.",
      statistics: storageStats.statistics,
      resources: [
        ...resourceSample(infiniteLogGroups, "logGroupName", 10),
        ...resourceSample(bucketsWithoutLifecycle, (bucket) => `s3://${bucket.name}`, 10),
      ],
    });
  }

  if (activeNatGateways.length) {
    addFinding(findings, {
      id: "network-egress-review",
      strategy: "Network and data transfer waste",
      title: `Review ${highTrafficNatGateways.length || activeNatGateways.length} NAT gateway${(highTrafficNatGateways.length || activeNatGateways.length) === 1 ? "" : "s"} for endpoint opportunities`,
      estimatedMonthlySavings: null,
      confidence: highTrafficNatGateways.length ? "medium" : "low",
      blastRadius: "Per-VPC, subnet, and routed workload.",
      operationalRisk: "medium",
      downtimeRisk: "routing or DNS impact if changed incorrectly",
      impactAnalysis: "Changing NAT, route tables, or endpoints can interrupt egress paths for private workloads.",
      minimizeImpact: "Analyze traffic first, add gateway/interface endpoints before removing NAT paths, test per subnet, and keep rollback route table changes ready.",
      rollbackPath: "Restore previous route table entries and endpoint policies.",
      resources: highTrafficNatGateways.length ? resourceSample(highTrafficNatGateways, "id") : resourceSample(activeNatGateways, "NatGatewayId"),
    });
  }

  return findings.sort((a, b) => {
    const riskRank = { low: 0, medium: 1, high: 2 };
    const riskDelta = riskRank[a.operationalRisk] - riskRank[b.operationalRisk];
    if (riskDelta) return riskDelta;
    return (b.estimatedMonthlySavings || 0) - (a.estimatedMonthlySavings || 0);
  });
}

function buildPermissionSummary(assessment) {
  return Object.entries(assessment.checks || {}).map(([id, check]) => ({
    id,
    service: check.service,
    ok: Boolean(check.ok),
    required: Boolean(check.required),
    error: check.ok ? null : check.error,
  }));
}

function markdownText(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function markdownTableCell(value) {
  return markdownText(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function markdownInlineCodeList(values) {
  return values.map((value) => `\`${String(value).replace(/`/g, "\\`")}\``).join(", ");
}

function renderMarkdown(report) {
  const account = markdownText(report.identity?.Account || "unknown");
  const lines = [
    "# CloudPrune AWS Assessment",
    "",
    `Generated: ${markdownText(report.generatedAt)}`,
    `Account: ${account}`,
    `Region: ${markdownText(report.region)}`,
    `Lookback: ${markdownText(report.days)} days`,
    `Resource sample limit: ${markdownText(report.maxResources)}`,
    `AWS CLI concurrency: ${markdownText(report.concurrency || DEFAULT_CONCURRENCY)}`,
    "",
    "## Permission Check",
    "",
    "| Check | Service | Status | Notes |",
    "| --- | --- | --- | --- |",
    ...report.permissions.map((item) => `| ${markdownTableCell(item.id)} | ${markdownTableCell(item.service)} | ${item.ok ? "OK" : "Missing"} | ${markdownTableCell(item.error || "")} |`),
    "",
    "## Findings",
    "",
  ];

  if (!report.findings.length) {
    lines.push("No actionable findings were detected from the available read-only signals.", "");
  }

  for (const finding of report.findings) {
    lines.push(
      `### ${markdownText(finding.title)}`,
      "",
      `- Strategy: ${markdownText(finding.strategy)}`,
      `- Estimated monthly savings: ${finding.estimatedMonthlySavings == null ? "Needs deeper usage data" : `$${finding.estimatedMonthlySavings.toLocaleString()}`}`,
      `- Confidence: ${markdownText(finding.confidence)}`,
      `- Blast radius: ${markdownText(finding.blastRadius)}`,
      `- Operational risk: ${markdownText(finding.operationalRisk)}`,
      `- Downtime risk: ${markdownText(finding.downtimeRisk)}`,
      `- Impact analysis: ${markdownText(finding.impactAnalysis)}`,
      `- Minimize impact: ${markdownText(finding.minimizeImpact)}`,
      `- Rollback path: ${markdownText(finding.rollbackPath)}`,
      `- Validation window: ${markdownText(finding.validationWindow)}`,
      ""
    );
    if (finding.resources?.length) {
      lines.push(`Resources sampled: ${markdownInlineCodeList(finding.resources)}`, "");
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildReport(assessment) {
  return {
    generatedAt: assessment.generatedAt,
    account: assessment.checks?.identity?.data?.Account || null,
    identity: assessment.checks?.identity?.data || null,
    region: assessment.region,
    days: assessment.days,
    concurrency: assessment.concurrency || null,
    maxResources: assessment.maxResources || null,
    permissions: buildPermissionSummary(assessment),
    costs: costByService(assessment.checks?.costByService).slice(0, 20),
    findings: buildFindings(assessment),
  };
}

function writeReport(report, options) {
  fs.mkdirSync(options.outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const baseName = `cloudprune-aws-assessment-${report.account || "unknown"}-${stamp}`;
  const written = [];

  if (options.format === "json" || options.format === "both") {
    const jsonPath = path.join(options.outDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    written.push(jsonPath);
  }

  if (options.format === "markdown" || options.format === "both") {
    const markdownPath = path.join(options.outDir, `${baseName}.md`);
    fs.writeFileSync(markdownPath, renderMarkdown(report));
    written.push(markdownPath);
  }

  return written;
}

function printHelp() {
  console.log(`CloudPrune AWS read-only assessment

Usage:
  npm run assess:aws -- [options]

Options:
  --profile <name>     AWS profile to use
  --region <region>    AWS region to inspect (default: ${DEFAULT_REGION})
  --concurrency <n>    Concurrent AWS CLI calls for sampled resource checks, 1-20 (default: ${DEFAULT_CONCURRENCY})
  --days <number>      Cost lookback window, 1-366 (default: ${DEFAULT_DAYS})
  --format <value>     json, markdown, or both (default: both)
  --max-resources <n>  Max resources sampled for per-resource metric checks (default: 25)
  --timeout-ms <n>     Timeout per AWS CLI command, 1000-300000 (default: ${DEFAULT_AWS_TIMEOUT_MS})
  --out-dir <path>     Report output directory (default: ./reports)

Required AWS CLI credentials should be read-only. Missing optional permissions are reported, not treated as fatal.`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const assessment = await collectAwsSignals(options);
    const report = buildReport(assessment);
    const written = writeReport(report, options);
    const missingRequired = report.permissions.filter((item) => item.required && !item.ok);

    console.log(`CloudPrune AWS assessment complete. Findings: ${report.findings.length}.`);
    for (const filePath of written) console.log(`Wrote ${filePath}`);
    if (missingRequired.length) {
      console.error(`Missing required permission: ${missingRequired.map((item) => item.id).join(", ")}`);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildFindings,
  buildPermissionSummary,
  buildReport,
  awsExecutionOptions,
  costByService,
  createLimiter,
  markdownTableCell,
  markdownText,
  metricSummary,
  parseArgs,
  renderMarkdown,
};
