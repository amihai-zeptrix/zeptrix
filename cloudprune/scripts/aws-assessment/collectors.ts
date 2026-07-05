const { CHECKS } = require("./constants");
const {
  addCheck,
  awsExecutionOptions,
  createLimiter,
  mapWithConcurrency,
  runAwsJson,
} = require("./aws-client");

type AssessmentCheck = { service?: string; ok?: boolean; data?: any; error?: string; required?: boolean };
type AssessmentChecks = Record<string, AssessmentCheck>;
type CollectorOptions = {
  days: number;
  concurrency: number;
  maxResources: number;
  region: string;
  profile?: string;
  timeoutMs?: number;
  awsLimiter?: <T>(task: () => Promise<T> | T) => Promise<T>;
};
type CollectionContext = { startDate: string; endDate: string };

/**
 * @typedef {{ days: number, concurrency: number, maxResources: number, region: string, profile?: string, timeoutMs?: number, awsLimiter?: import("./aws-client").AwsExecutionOptions["awsLimiter"] }} CollectorOptions
 * @typedef {{ startDate: string, endDate: string }} CollectionContext
 * @typedef {{ service?: string, ok?: boolean, data?: any, error?: string, required?: boolean }} AssessmentCheck
 * @typedef {Record<string, AssessmentCheck>} AssessmentChecks
 * @typedef {{ generatedAt: string, region: string, days: number, concurrency: number, maxResources: number, profile: string | null, checks: AssessmentChecks }} AwsAssessment
 */

/**
 * @param {number} daysAgo
 * @returns {string}
 */
function isoDateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

/**
 * @param {Array<{ Average?: unknown }>} datapoints
 * @returns {number | null}
 */
function metricAverage(datapoints: Array<{ Average?: unknown }>): number | null {
  const values = (datapoints || []).map((point) => Number(point.Average)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * @param {Array<Record<string, unknown>>} datapoints
 * @param {string} [key]
 * @returns {number | null}
 */
function metricSum(datapoints: Array<Record<string, unknown>>, key = "Sum"): number | null {
  const values = (datapoints || []).map((point) => Number(point[key])).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0);
}

/**
 * @param {Array<Record<string, unknown>>} datapoints
 * @param {string} [key]
 * @returns {{ hasData: boolean, value: number | null }}
 */
function metricSummary(datapoints: Array<Record<string, unknown>>, key = "Sum"): { hasData: boolean; value: number | null } {
  const values = (datapoints || []).map((point) => Number(point[key])).filter((value) => Number.isFinite(value));
  if (!values.length) return { hasData: false, value: null };
  return { hasData: true, value: values.reduce((total, value) => total + value, 0) };
}

/**
 * @param {CollectorOptions} options
 * @param {CollectionContext} context
 * @param {string} namespace
 * @param {string} metricName
 * @param {Array<{ name: string, value: string }>} dimensions
 * @param {string} statistic
 * @returns {Promise<import("./aws-client").AwsJsonResult>}
 */
async function getMetric(options: CollectorOptions, context: CollectionContext, namespace: string, metricName: string, dimensions: Array<{ name: string; value: string }>, statistic: string) {
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

/**
 * @param {string} loadBalancerArn
 * @returns {string | null}
 */
function loadBalancerDimension(loadBalancerArn: string): string | null {
  const marker = ":loadbalancer/";
  const index = loadBalancerArn.indexOf(marker);
  return index === -1 ? null : loadBalancerArn.slice(index + marker.length);
}

/**
 * @param {import("./aws-client").AwsJsonResult} result
 * @returns {{ status: "configured" | "missing" | "unknown", configured: boolean | null, error: string | null | undefined }}
 */
function classifyS3Lifecycle(result: { ok: boolean; data?: any; error?: string }) {
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

/**
 * @param {AssessmentChecks} checks
 * @param {CollectorOptions} options
 * @returns {Promise<void>}
 */
async function collectS3LifecycleSignals(checks: AssessmentChecks, options: CollectorOptions): Promise<void> {
  const buckets = checks.s3Buckets?.data?.Buckets || [];
  const sampled = buckets.slice(0, options.maxResources);
  const data = await mapWithConcurrency(sampled, options.concurrency, async (bucket: any) => {
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

/**
 * @param {AssessmentChecks} checks
 * @param {CollectorOptions} options
 * @param {CollectionContext} context
 * @returns {Promise<void>}
 */
async function collectRdsMetricSignals(checks: AssessmentChecks, options: CollectorOptions, context: CollectionContext): Promise<void> {
  const instances = checks.rdsInstances?.data?.DBInstances || [];
  const data = await mapWithConcurrency(instances.slice(0, options.maxResources), options.concurrency, async (instance: any) => {
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

/**
 * @param {AssessmentChecks} checks
 * @param {CollectorOptions} options
 * @param {CollectionContext} context
 * @returns {Promise<void>}
 */
async function collectLoadBalancerMetricSignals(checks: AssessmentChecks, options: CollectorOptions, context: CollectionContext): Promise<void> {
  const loadBalancers = checks.loadBalancers?.data?.LoadBalancers || [];
  const data = await mapWithConcurrency(loadBalancers.slice(0, options.maxResources), options.concurrency, async (loadBalancer: any) => {
    const dimension = loadBalancerDimension(loadBalancer.LoadBalancerArn || "");
    const metricConfigByType = {
      application: { namespace: "AWS/ApplicationELB", metricName: "RequestCount" },
      network: { namespace: "AWS/NetworkELB", metricName: "ActiveFlowCount" },
      gateway: { unsupportedReason: "Gateway Load Balancer idle detection is not implemented yet." },
    };
    const config = metricConfigByType[loadBalancer.Type] || { unsupportedReason: `Unsupported load balancer type: ${loadBalancer.Type || "unknown"}.` };
    /** @type {import("./aws-client").AwsJsonResult} */
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

/**
 * @param {AssessmentChecks} checks
 * @param {CollectorOptions} options
 * @param {CollectionContext} context
 * @returns {Promise<void>}
 */
async function collectNatMetricSignals(checks: AssessmentChecks, options: CollectorOptions, context: CollectionContext): Promise<void> {
  const natGateways = checks.natGateways?.data?.NatGateways || [];
  const data = await mapWithConcurrency(natGateways.slice(0, options.maxResources), options.concurrency, async (gateway: any) => {
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

/**
 * @param {CollectorOptions} options
 * @returns {Promise<AwsAssessment>}
 */
async function collectAwsSignals(options: CollectorOptions) {
  const endDate = isoDateDaysAgo(0);
  const startDate = isoDateDaysAgo(options.days);
  const context = { startDate, endDate };
  const checks: AssessmentChecks = {};
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

module.exports = {
  collectAwsSignals,
  metricSummary,
};
