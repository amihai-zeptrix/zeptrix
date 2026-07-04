const { spawn } = require("node:child_process");
const { buildReport } = require("../scripts/aws-assessment");
const {
  awsCliMaxOutputBytes,
  awsCliPath,
  awsScanMaxInventoryItems,
  awsScanMaxLogGroups,
  awsScanMaxRegions,
  awsScanMaxSampledResources,
  awsScanRegion,
} = require("./config");
const { pool } = require("./db");
const { jsonb } = require("./http-utils");
const {
  awsScanCounts,
  buildAwsAssessment,
  costFromCostExplorer,
  mergeAwsCollection,
  mergeAwsReservations,
  publicRecommendation,
} = require("./aws-scan-report");

type GlobalCheck = [string, string, string[]];
type RegionalCheck = [string, string, (region: string) => string[]];

function runAwsCli(args: string[], { env = {}, timeoutMs = 60000, maxOutputBytes = awsCliMaxOutputBytes }: { env?: Record<string, string>; timeoutMs?: number; maxOutputBytes?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(awsCliPath, args, {
      env: { ...process.env, ...env, AWS_PAGER: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    function fail(error: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      reject(error);
    }
    const timer = setTimeout(() => {
      fail(new Error(`AWS CLI timed out while running aws ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) return fail(new Error(`AWS CLI output exceeded ${maxOutputBytes} bytes for aws ${args.join(" ")}`));
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) return fail(new Error(`AWS CLI output exceeded ${maxOutputBytes} bytes for aws ${args.join(" ")}`));
      stderr += chunk;
    });
    child.on("error", (error) => {
      fail(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error((stderr || stdout || `aws ${args.join(" ")} exited with ${code}`).trim()));
    });
  });
}

async function runAwsJson(args: string[], options: any = {}) {
  const stdout = await runAwsCli([...args, "--output", "json"], options);
  return stdout.trim() ? JSON.parse(stdout) : {};
}

async function runAwsJsonCheck(args: string[], options: any = {}) {
  try {
    return { ok: true, data: await runAwsJson(args, options) };
  } catch (error) {
    return { ok: false, error };
  }
}

function monthStartEnd() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function s3MetricWindow() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function normalizeS3BucketRegion(locationConstraint: unknown): string {
  if (!locationConstraint || locationConstraint === "None") return "us-east-1";
  if (locationConstraint === "EU") return "eu-west-1";
  return String(locationConstraint);
}

function latestMetricDataValue(result: any): number | null {
  const timestamps = result?.Timestamps || [];
  const values = result?.Values || [];
  let latestIndex = -1;
  let latestTime = 0;
  for (let index = 0; index < timestamps.length; index += 1) {
    if (values[index] == null) continue;
    const time = Date.parse(timestamps[index]);
    if (Number.isFinite(time) && time >= latestTime) {
      latestTime = time;
      latestIndex = index;
    }
  }
  return latestIndex === -1 ? null : Number(values[latestIndex]);
}

function s3StorageMetricQueries(bucketName: string) {
  const storageTypes = [
    "StandardStorage",
    "StandardIAStorage",
    "OneZoneIAStorage",
    "GlacierStorage",
    "DeepArchiveStorage",
    "IntelligentTieringFAStorage",
    "IntelligentTieringIAStorage",
    "IntelligentTieringAAStorage",
    "IntelligentTieringAIAStorage",
    "IntelligentTieringDAAStorage",
  ];
  const sizeQueries = storageTypes.map((storageType, index) => ({
    Id: `s${index}`,
    Label: storageType,
    MetricStat: {
      Metric: {
        Namespace: "AWS/S3",
        MetricName: "BucketSizeBytes",
        Dimensions: [
          { Name: "BucketName", Value: bucketName },
          { Name: "StorageType", Value: storageType },
        ],
      },
      Period: 86400,
      Stat: "Average",
    },
    ReturnData: true,
  }));
  return [
    ...sizeQueries,
    {
      Id: "objects",
      Label: "NumberOfObjects",
      MetricStat: {
        Metric: {
          Namespace: "AWS/S3",
          MetricName: "NumberOfObjects",
          Dimensions: [
            { Name: "BucketName", Value: bucketName },
            { Name: "StorageType", Value: "AllStorageTypes" },
          ],
        },
        Period: 86400,
        Stat: "Average",
      },
      ReturnData: true,
    },
  ];
}

function s3StorageStatsFromMetricData(data: any) {
  const results = data?.MetricDataResults || [];
  const byLabel = Object.fromEntries(results.map((result) => [result.Label, latestMetricDataValue(result)]));
  const storageBreakdown = Object.fromEntries(Object.entries(byLabel)
    .filter(([label, value]) => label !== "NumberOfObjects" && value != null && value > 0)
    .map(([label, value]) => [label, Math.round(value)]));
  const totalStorageBytes = Object.values(storageBreakdown).reduce((total, value) => total + value, 0);
  const coldStorageBytes = Object.entries(storageBreakdown)
    .filter(([label]) => label !== "StandardStorage" && label !== "IntelligentTieringFAStorage")
    .reduce((total, [, value]) => total + value, 0);
  return {
    objectCount: byLabel.NumberOfObjects == null ? null : Math.round(byLabel.NumberOfObjects),
    totalStorageBytes,
    coldStorageBytes,
    coldStoragePercent: totalStorageBytes ? Math.round((coldStorageBytes / totalStorageBytes) * 1000) / 10 : null,
    storageBreakdown,
  };
}

function dimensionValue(dimensions: any[], name: string): string | null {
  return dimensions.find((dimension) => String(dimension.Name || "").toLowerCase() === name.toLowerCase())?.Value || null;
}

function isRootDiskMetric(dimensions: any[]): boolean {
  const path = dimensionValue(dimensions, "path") || dimensionValue(dimensions, "mount") || dimensionValue(dimensions, "mountpoint");
  return path === "/";
}

async function cloudWatchAgentMetricSummary(scanEnv: Record<string, string>, region: string, instanceId: string, metricName: string) {
  const listed = await runAwsJsonCheck([
    "cloudwatch", "list-metrics",
    "--namespace", "CWAgent",
    "--metric-name", metricName,
    "--dimensions", `Name=InstanceId,Value=${instanceId}`,
    "--region", region,
  ], { env: scanEnv, timeoutMs: 30000 });
  const metrics = listed.ok ? (listed.data?.Metrics || []).slice(0, 5) : [];
  if (!metrics.length) return { status: listed.ok ? "missing" : "unavailable", average: null, maximum: null, error: listed.ok ? null : listed.error?.message };
  const summaries = [];
  const { start, end } = monthStartEnd();
  for (const metric of metrics) {
    const data = await runAwsJsonCheck([
      "cloudwatch", "get-metric-statistics",
      "--namespace", "CWAgent",
      "--metric-name", metricName,
      "--start-time", `${start}T00:00:00Z`,
      "--end-time", `${end}T00:00:00Z`,
      "--period", "86400",
      "--statistics", "Average", "Maximum",
      "--dimensions", ...cloudWatchDimensionsArgs(metric.Dimensions),
      "--region", region,
    ], { env: scanEnv, timeoutMs: 30000 });
    if (data.ok) {
      summaries.push({
        average: metricAverage(data.data?.Datapoints),
        maximum: metricMaximum(data.data?.Datapoints),
        dimensions: metric.Dimensions || [],
      });
    }
  }
  const averages = summaries.map((summary) => summary.average).filter((value) => value != null);
  const maximums = summaries.map((summary) => summary.maximum).filter((value) => value != null);
  const rootSummaries = metricName === "disk_used_percent" ? summaries.filter((summary) => isRootDiskMetric(summary.dimensions)) : [];
  const rootAverages = rootSummaries.map((summary) => summary.average).filter((value) => value != null);
  const rootMaximums = rootSummaries.map((summary) => summary.maximum).filter((value) => value != null);
  return {
    status: averages.length || maximums.length ? "observed" : "no-data",
    average: averages.length ? Math.max(...averages) : null,
    maximum: maximums.length ? Math.max(...maximums) : null,
    rootStatus: metricName === "disk_used_percent" ? (rootAverages.length || rootMaximums.length ? "observed" : "missing") : null,
    rootAverage: rootAverages.length ? Math.max(...rootAverages) : null,
    rootMaximum: rootMaximums.length ? Math.max(...rootMaximums) : null,
    rootDimensions: rootSummaries[0]?.dimensions || null,
    error: null,
  };
}

function metricAverage(datapoints: any): number | null {
  const values = (datapoints || []).map((point) => Number(point.Average)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function metricMaximum(datapoints: any): number | null {
  const values = (datapoints || []).map((point) => Number(point.Maximum)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Math.max(...values);
}

function metricSum(datapoints: any): number | null {
  const values = (datapoints || []).map((point) => Number(point.Sum)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0);
}

function loadBalancerDimension(loadBalancerArn: unknown): string | null {
  const marker = ":loadbalancer/";
  const index = String(loadBalancerArn || "").indexOf(marker);
  return index === -1 ? null : String(loadBalancerArn).slice(index + marker.length);
}

function cloudWatchDimensionsArgs(dimensions: any): string[] {
  return (dimensions || []).map((dimension) => `Name=${dimension.Name || dimension.name},Value=${dimension.Value || dimension.value}`);
}

function addRegionToAwsResult(id: string, data: any, region: string): any {
  const collectionById = {
    ec2Instances: "Reservations",
    ebsVolumes: "Volumes",
    elasticIps: "Addresses",
    rdsInstances: "DBInstances",
    logGroups: "logGroups",
    loadBalancers: "LoadBalancers",
    targetGroups: "TargetGroups",
    apiGatewayV2: "Items",
    apiGatewayRest: "items",
    ssmInstances: "InstanceInformationList",
    computeOptimizerEc2: "instanceRecommendations",
  };
  const collectionKey = collectionById[id];
  if (!collectionKey || !Array.isArray(data?.[collectionKey])) return data;
  return {
    ...data,
    [collectionKey]: data[collectionKey].map((item) => ({ ...item, Region: region })),
  };
}

function awsCollectionCount(id: string, data: any): number {
  if (id === "ec2Instances") {
    return (data?.Reservations || []).reduce((total, reservation) => total + (reservation.Instances || []).length, 0);
  }
  const collectionById = {
    ebsVolumes: "Volumes",
    elasticIps: "Addresses",
    lambdas: "Functions",
    rdsInstances: "DBInstances",
    logGroups: "logGroups",
    loadBalancers: "LoadBalancers",
    targetGroups: "TargetGroups",
    apiGatewayV2: "Items",
    apiGatewayRest: "items",
    ssmInstances: "InstanceInformationList",
    computeOptimizerEc2: "instanceRecommendations",
  };
  const collectionKey = collectionById[id];
  return collectionKey ? (data?.[collectionKey] || []).length : 0;
}

function inventoryResultLimit(maxItems: unknown = awsScanMaxInventoryItems): number {
  return Math.max(1, Math.floor(Number(maxItems) || 1));
}

function computeOptimizerMaxResults(maxItems: unknown = awsScanMaxInventoryItems): number {
  return Math.min(1000, inventoryResultLimit(maxItems));
}

function elasticIpsCommand(region: string, maxItems: unknown = awsScanMaxInventoryItems): string[] {
  const limit = inventoryResultLimit(maxItems);
  return [
    "ec2", "describe-addresses",
    "--region", region,
    "--query", `{Addresses:Addresses[:${limit}].{PublicIp:PublicIp,AllocationId:AllocationId,AssociationId:AssociationId,Tags:Tags},CloudPruneOriginalCount:length(Addresses)}`,
  ];
}

function computeOptimizerEc2Command(region: string, maxItems: unknown = awsScanMaxInventoryItems): string[] {
  return [
    "compute-optimizer", "get-ec2-instance-recommendations",
    "--region", region,
    "--no-paginate",
    "--max-results", String(computeOptimizerMaxResults(maxItems)),
    "--query", "{instanceRecommendations:instanceRecommendations[].{instanceArn:instanceArn,instanceName:instanceName,finding:finding,currentInstanceType:currentInstanceType},nextToken:nextToken}",
  ];
}

function capAwsRegionalResult(id: string, data: any, maxItems: unknown = awsScanMaxInventoryItems): any {
  const collectionById = {
    elasticIps: "Addresses",
    computeOptimizerEc2: "instanceRecommendations",
  };
  const collectionKey = collectionById[id];
  const collection = data?.[collectionKey];
  if (!collectionKey || !Array.isArray(collection)) return data;
  const limit = inventoryResultLimit(maxItems);
  const originalCount = Number(data.CloudPruneOriginalCount || collection.length);
  if (collection.length <= limit && originalCount <= collection.length) return data;
  return {
    ...data,
    [collectionKey]: collection.slice(0, limit),
    CloudPruneTruncated: true,
    CloudPruneOriginalCount: originalCount,
  };
}

async function updateAwsScanProgress(scanId: string, completedSteps: number, totalSteps: number, message: string, extra: Record<string, unknown> = {}) {
  const denominator = Math.max(1, totalSteps);
  const progress = Math.min(99, Math.max(0, Math.round((completedSteps / denominator) * 100)));
  await pool.query(
    `update cloudprune_aws_scans
     set scan_json = scan_json || $2::jsonb, updated_at=now()
     where id=$1 and status='running'`,
    [scanId, jsonb({ ...extra, progress, message })]
  );
}

function scanStepLabel(label: string, region?: string): string {
  const step = String(label || "").replace(/^Reading /, "").replace(/\.$/, "");
  return region ? `${step} in ${region}` : step;
}

function runningScanMessage(activeSteps: Set<string>): string {
  const steps = Array.from(activeSteps);
  if (!steps.length) return "Finishing current scan batch.";
  const visibleSteps = steps.slice(0, 3).join("; ");
  return `Running ${visibleSteps}${steps.length > 3 ? ` and ${steps.length - 3} more` : ""}.`;
}

async function performAwsScan(scanId: string, user: any, aws: any, requestedRegions: string[] = [awsScanRegion], { recordAuthEvent = async (_event: any) => {} }: { recordAuthEvent?: (event: any) => Promise<void> } = {}) {
  const sessionName = `CloudPruneScan-${Date.now()}`;
  const results: any = {};
  const errors: Array<{ check: string; message: string }> = [];
  const inventoryLimits = {
    maxRegions: awsScanMaxRegions,
    maxInventoryItems: awsScanMaxInventoryItems,
    maxLogGroups: awsScanMaxLogGroups,
    maxSampledResources: awsScanMaxSampledResources,
    limitedRegionalChecks: [],
    regionalResults: [],
    truncatedChecks: [],
  };
  let completedSteps = 0;
  let totalSteps = 4;
  try {
    await updateAwsScanProgress(scanId, completedSteps, totalSteps, "Assuming AWS read-only role.");
    const assumed = await runAwsJson([
      "sts", "assume-role",
      "--role-arn", aws.role_arn,
      "--role-session-name", sessionName,
      "--external-id", aws.external_id,
    ], { timeoutMs: 60000 });
    const credentials = assumed.Credentials;
    if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey || !credentials?.SessionToken) {
      throw new Error("AWS assume-role did not return temporary credentials.");
    }
    completedSteps += 1;
    await updateAwsScanProgress(scanId, completedSteps, totalSteps, "Discovering enabled AWS regions.");
    const scanEnv = {
      AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
      AWS_SESSION_TOKEN: credentials.SessionToken,
      AWS_DEFAULT_REGION: awsScanRegion,
    };
    const { start, end } = monthStartEnd();
    let regions: string[] = requestedRegions;
    let skippedRegions: string[] = [];
    try {
      const regionResult = await runAwsJson(["ec2", "describe-regions", "--all-regions", "--region", awsScanRegion], { env: scanEnv, timeoutMs: 45000 });
      const enabledRegions = new Set((regionResult.Regions || [])
        .filter((region) => !region.OptInStatus || region.OptInStatus === "opt-in-not-required" || region.OptInStatus === "opted-in")
        .map((region) => region.RegionName)
        .filter(Boolean));
      skippedRegions = requestedRegions.filter((region) => !enabledRegions.has(region));
      regions = requestedRegions.filter((region) => enabledRegions.has(region));
      if (skippedRegions.length) errors.push({ check: "regions", message: `Skipped disabled or unavailable selected AWS regions: ${skippedRegions.join(", ")}.` });
    } catch (error) {
      errors.push({ check: "regions", message: error.message });
      regions = requestedRegions;
    }
    if (!regions.length) throw new Error("None of the selected AWS regions are enabled for this account.");
    completedSteps += 1;

    const globalChecks: GlobalCheck[] = [
      ["identity", "Reading AWS account identity.", ["sts", "get-caller-identity"]],
      ["s3Buckets", "Reading S3 buckets.", ["s3api", "list-buckets", "--max-items", String(awsScanMaxInventoryItems)]],
      ["cost", "Reading Cost Explorer spend.", [
        "ce", "get-cost-and-usage",
        "--time-period", `Start=${start},End=${end}`,
        "--granularity", "MONTHLY",
        "--metrics", "UnblendedCost",
        "--region", "us-east-1",
      ]],
      ["costByService", "Reading spend by AWS service.", [
        "ce", "get-cost-and-usage",
        "--time-period", `Start=${start},End=${end}`,
        "--granularity", "MONTHLY",
        "--metrics", "UnblendedCost",
        "--group-by", "Type=DIMENSION,Key=SERVICE",
        "--region", "us-east-1",
      ]],
      ["savingsPlansRecommendation", "Reading Savings Plans recommendations.", [
        "ce", "get-savings-plans-purchase-recommendation",
        "--savings-plans-type", "COMPUTE_SP",
        "--term-in-years", "ONE_YEAR",
        "--payment-option", "NO_UPFRONT",
        "--lookback-period-in-days", "SIXTY_DAYS",
        "--region", "us-east-1",
      ]],
    ];
    const regionalChecks: RegionalCheck[] = [
      ["ec2Instances", "Reading EC2 instances", (region) => ["ec2", "describe-instances", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Reservations:Reservations[].{Instances:Instances[].{InstanceId:InstanceId,InstanceType:InstanceType,Architecture:Architecture,PlatformDetails:PlatformDetails,VpcId:VpcId,SubnetId:SubnetId,State:State,RootDeviceName:RootDeviceName,BlockDeviceMappings:BlockDeviceMappings[].{DeviceName:DeviceName,Ebs:Ebs},Tags:Tags}},NextToken:NextToken}"]],
      ["ebsVolumes", "Reading EBS volumes", (region) => ["ec2", "describe-volumes", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Volumes:Volumes[].{VolumeId:VolumeId,State:State,Size:Size,VolumeType:VolumeType,Attachments:Attachments,Tags:Tags},NextToken:NextToken}"]],
      ["elasticIps", "Reading Elastic IP addresses", (region) => elasticIpsCommand(region)],
      ["lambdas", "Reading Lambda functions", (region) => ["lambda", "list-functions", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Functions:Functions[].{FunctionName:FunctionName},NextToken:NextToken}"]],
      ["rdsInstances", "Reading RDS instances", (region) => ["rds", "describe-db-instances", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{DBInstances:DBInstances[].{DBInstanceIdentifier:DBInstanceIdentifier,DBInstanceClass:DBInstanceClass,Engine:Engine,MultiAZ:MultiAZ,DBInstanceStatus:DBInstanceStatus},NextToken:NextToken}"]],
      ["logGroups", "Reading CloudWatch log groups", (region) => ["logs", "describe-log-groups", "--region", region, "--max-items", String(awsScanMaxLogGroups), "--page-size", String(Math.min(50, awsScanMaxLogGroups)), "--query", "{logGroups:logGroups[].{logGroupName:logGroupName,retentionInDays:retentionInDays,storedBytes:storedBytes},NextToken:NextToken}"]],
      ["loadBalancers", "Reading load balancers", (region) => ["elbv2", "describe-load-balancers", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{LoadBalancers:LoadBalancers[].{LoadBalancerName:LoadBalancerName,LoadBalancerArn:LoadBalancerArn,Type:Type,State:State},NextToken:NextToken}"]],
      ["targetGroups", "Reading ALB target groups", (region) => ["elbv2", "describe-target-groups", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{TargetGroups:TargetGroups[].{TargetGroupName:TargetGroupName,TargetGroupArn:TargetGroupArn,TargetType:TargetType,Protocol:Protocol,Port:Port,LoadBalancerArns:LoadBalancerArns},NextToken:NextToken}"]],
      ["apiGatewayV2", "Reading API Gateway HTTP APIs", (region) => ["apigatewayv2", "get-apis", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Items:Items[].{ApiId:ApiId,Name:Name,ProtocolType:ProtocolType,ApiEndpoint:ApiEndpoint},NextToken:NextToken}"]],
      ["apiGatewayRest", "Reading API Gateway REST APIs", (region) => ["apigateway", "get-rest-apis", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{items:items[].{id:id,name:name,endpointConfiguration:endpointConfiguration},position:position}"]],
      ["ssmInstances", "Reading SSM managed instances", (region) => ["ssm", "describe-instance-information", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{InstanceInformationList:InstanceInformationList[].{InstanceId:InstanceId,ComputerName:ComputerName,PlatformName:PlatformName,PlatformType:PlatformType,AgentVersion:AgentVersion,PingStatus:PingStatus},NextToken:NextToken}"]],
      ["computeOptimizerEc2", "Reading EC2 Compute Optimizer recommendations", (region) => computeOptimizerEc2Command(region)],
    ];
    inventoryLimits.limitedRegionalChecks = regionalChecks.map(([id]) => id);
    const s3LifecycleJobs = () => (results.s3Buckets?.Buckets || []).slice(0, awsScanMaxSampledResources).flatMap((bucket) => [
      { id: "s3Lifecycle", label: `Reading S3 lifecycle for ${bucket.Name}`, bucket: bucket.Name, command: ["s3api", "get-bucket-lifecycle-configuration", "--bucket", bucket.Name] },
    ]);
    const jobs = regions.flatMap((region) => regionalChecks.map(([id, label, command]) => ({ region, id, label, command })));
    totalSteps = completedSteps + globalChecks.length + jobs.length + 1;
    await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Scanning ${regions.length} selected AWS region${regions.length === 1 ? "" : "s"}.`, { requestedRegions, regions, skippedRegions });

    for (const [id, label, args] of globalChecks) {
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, label);
      try {
        results[id] = await runAwsJson(args, { env: scanEnv, timeoutMs: 60000 });
      } catch (error: any) {
        errors.push({ check: id, message: error.message });
      }
      completedSteps += 1;
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed ${label.replace(/\.$/, "").toLowerCase()}.`);
    }
    if (results.s3Buckets?.NextToken || (results.s3Buckets?.Buckets || []).length > awsScanMaxInventoryItems) {
      const returnedCount = Math.min(results.s3Buckets.Buckets.length, awsScanMaxInventoryItems);
      results.s3Buckets = {
        ...results.s3Buckets,
        Buckets: results.s3Buckets.Buckets.slice(0, awsScanMaxInventoryItems),
        CloudPruneTruncated: true,
        CloudPruneReturnedBucketCount: returnedCount,
      };
      inventoryLimits.truncatedChecks.push({
        check: "s3Buckets",
        nextTokenPresent: Boolean(results.s3Buckets.NextToken),
        returnedCount,
      });
      errors.push({ check: "s3Buckets", message: `S3 bucket inventory limited to ${returnedCount} returned buckets${results.s3Buckets.NextToken ? " with more buckets available" : ""}.` });
    }

    const lifecycleJobs = s3LifecycleJobs();
    if (lifecycleJobs.length) {
      totalSteps += lifecycleJobs.length;
      results.s3Lifecycle = [];
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading lifecycle policies for ${lifecycleJobs.length} S3 bucket${lifecycleJobs.length === 1 ? "" : "s"}.`);
      for (const job of lifecycleJobs) {
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `${job.label}.`);
        const lifecycle = await runAwsJsonCheck(job.command, { env: scanEnv, timeoutMs: 45000 });
        const lifecycleStatus = lifecycle.ok ? (Array.isArray(lifecycle.data?.Rules) && lifecycle.data.Rules.length ? "configured" : "missing") : /NoSuchLifecycleConfiguration/i.test(lifecycle.error?.message || "") ? "missing" : "unknown";
        let storageStats = null;
        let bucketRegion = null;
        let storageStatsError = null;
        if (lifecycleStatus === "missing") {
          await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading S3 storage metrics for ${job.bucket}.`);
          const location = await runAwsJsonCheck(["s3api", "get-bucket-location", "--bucket", job.bucket], { env: scanEnv, timeoutMs: 30000 });
          bucketRegion = location.ok ? normalizeS3BucketRegion(location.data?.LocationConstraint) : awsScanRegion;
          const { startTime, endTime } = s3MetricWindow();
          const metrics = await runAwsJsonCheck([
            "cloudwatch", "get-metric-data",
            "--region", bucketRegion,
            "--start-time", startTime,
            "--end-time", endTime,
            "--metric-data-queries", JSON.stringify(s3StorageMetricQueries(job.bucket)),
          ], { env: scanEnv, timeoutMs: 45000 });
          if (metrics.ok) storageStats = s3StorageStatsFromMetricData(metrics.data);
          else storageStatsError = metrics.error?.message || "Unable to read S3 storage metrics.";
        }
        results.s3Lifecycle.push({
          name: job.bucket,
          lifecycleStatus,
          lifecycleConfigured: lifecycle.ok ? Array.isArray(lifecycle.data?.Rules) && lifecycle.data.Rules.length > 0 : false,
          lifecycleError: lifecycle.ok ? null : lifecycle.error?.message,
          region: bucketRegion,
          storageStats,
          storageStatsError,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed ${scanStepLabel(job.label).toLowerCase()}.`);
      }
    }

    const concurrency = 5;
    for (let index = 0; index < jobs.length; index += concurrency) {
      const batch = jobs.slice(index, index + concurrency);
      const activeSteps = new Set(batch.map(({ region, label }) => scanStepLabel(label, region)));
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, runningScanMessage(activeSteps));
      await Promise.all(batch.map(async ({ region, id, label, command }) => {
        const activeStep = scanStepLabel(label, region);
        try {
          const data = capAwsRegionalResult(id, await runAwsJson(command(region), { env: scanEnv, timeoutMs: 45000 }));
          inventoryLimits.regionalResults.push({
            check: id,
            region,
            returnedCount: awsCollectionCount(id, data),
            truncated: Boolean(data?.NextToken || data?.nextToken || data?.CloudPruneTruncated),
          });
          if (data?.NextToken || data?.nextToken || data?.CloudPruneTruncated) {
            inventoryLimits.truncatedChecks.push({
              check: id,
              region,
              returnedCount: awsCollectionCount(id, data),
              originalCount: data?.CloudPruneOriginalCount,
            });
          }
          results[id] = [...(results[id] || []), addRegionToAwsResult(id, data, region)];
        } catch (error: any) {
          errors.push({ check: `${id}:${region}`, message: error.message });
        }
        completedSteps += 1;
        activeSteps.delete(activeStep);
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, runningScanMessage(activeSteps));
      }));
    }
    const targetGroupJobs = mergeAwsCollection(results.targetGroups, "TargetGroups").TargetGroups
      .slice(0, awsScanMaxSampledResources)
      .map((targetGroup) => ({ targetGroup }));
    const ssmApplicationJobs = mergeAwsCollection(results.ssmInstances, "InstanceInformationList").InstanceInformationList
      .filter((instance) => instance.InstanceId)
      .slice(0, awsScanMaxSampledResources)
      .map((instance) => ({ instance }));
    if (targetGroupJobs.length || ssmApplicationJobs.length) {
      totalSteps += targetGroupJobs.length + ssmApplicationJobs.length;
      results.albTargetMappings = [];
      results.ssmApplications = [];
      for (const { targetGroup } of targetGroupJobs) {
        const region = targetGroup.Region || awsScanRegion;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading ALB target health for ${targetGroup.TargetGroupName}.`);
        const health = await runAwsJsonCheck([
          "elbv2", "describe-target-health",
          "--target-group-arn", targetGroup.TargetGroupArn,
          "--region", region,
        ], { env: scanEnv, timeoutMs: 30000 });
        results.albTargetMappings.push({
          name: targetGroup.TargetGroupName,
          arn: targetGroup.TargetGroupArn,
          targetType: targetGroup.TargetType,
          protocol: targetGroup.Protocol,
          port: targetGroup.Port,
          region,
          loadBalancerArns: targetGroup.LoadBalancerArns || [],
          targets: health.ok ? (health.data?.TargetHealthDescriptions || []).map((item) => ({
            id: item.Target?.Id,
            port: item.Target?.Port,
            state: item.TargetHealth?.State,
            reason: item.TargetHealth?.Reason,
          })) : [],
          error: health.ok ? null : health.error?.message,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed ALB target health for ${targetGroup.TargetGroupName}.`);
      }
      for (const { instance } of ssmApplicationJobs) {
        const region = instance.Region || awsScanRegion;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading SSM application inventory for ${instance.InstanceId}.`);
        const applications = await runAwsJsonCheck([
          "ssm", "list-inventory-entries",
          "--instance-id", instance.InstanceId,
          "--type-name", "AWS:Application",
          "--region", region,
          "--max-items", "50",
        ], { env: scanEnv, timeoutMs: 30000 });
        results.ssmApplications.push({
          id: instance.InstanceId,
          computerName: instance.ComputerName,
          platformName: instance.PlatformName,
          platformType: instance.PlatformType,
          pingStatus: instance.PingStatus,
          region,
          applications: applications.ok ? (applications.data?.Entries || []).map((entry) => ({
            name: entry.Name,
            version: entry.Version,
            publisher: entry.Publisher,
            applicationType: entry.ApplicationType,
          })) : [],
          error: applications.ok ? null : applications.error?.message,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed SSM application inventory for ${instance.InstanceId}.`);
      }
    }
    const ec2MetricJobs = mergeAwsReservations(results.ec2Instances).Reservations
      .flatMap((reservation) => reservation.Instances || [])
      .filter((instance) => instance.InstanceId && instance.State?.Name === "running")
      .slice(0, awsScanMaxSampledResources)
      .map((instance) => ({ instance }));
    const rdsMetricJobs = mergeAwsCollection(results.rdsInstances, "DBInstances").DBInstances.slice(0, awsScanMaxSampledResources).flatMap((instance) => [
      { instance, metricName: "CPUUtilization", statistic: "Average" },
      { instance, metricName: "DatabaseConnections", statistic: "Average" },
    ]);
    const loadBalancerMetricJobs = mergeAwsCollection(results.loadBalancers, "LoadBalancers").LoadBalancers.slice(0, awsScanMaxSampledResources).map((loadBalancer) => ({ loadBalancer }));
    if (ec2MetricJobs.length || rdsMetricJobs.length || loadBalancerMetricJobs.length) {
      totalSteps += ec2MetricJobs.length + rdsMetricJobs.length + loadBalancerMetricJobs.length;
      results.ec2Metrics = [];
      results.rdsMetrics = [];
      results.loadBalancerMetrics = [];
      const metricPeriod = String(86400);
      const startTime = `${start}T00:00:00Z`;
      const endTime = `${end}T00:00:00Z`;
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, "Reading CloudWatch utilization metrics.");
      for (const { instance } of ec2MetricJobs) {
        const id = instance.InstanceId;
        const region = instance.Region || awsScanRegion;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading EC2 utilization for ${id}.`);
        const cpu = await runAwsJsonCheck([
          "cloudwatch", "get-metric-statistics",
          "--namespace", "AWS/EC2",
          "--metric-name", "CPUUtilization",
          "--start-time", startTime,
          "--end-time", endTime,
          "--period", metricPeriod,
          "--statistics", "Average", "Maximum",
          "--dimensions", `Name=InstanceId,Value=${id}`,
          "--region", region,
        ], { env: scanEnv, timeoutMs: 45000 });
        const memory = await cloudWatchAgentMetricSummary(scanEnv, region, id, "mem_used_percent");
        const disk = await cloudWatchAgentMetricSummary(scanEnv, region, id, "disk_used_percent");
        results.ec2Metrics.push({
          id,
          type: instance.InstanceType,
          architecture: instance.Architecture,
          platform: instance.PlatformDetails,
          state: instance.State?.Name,
          region,
          vpcId: instance.VpcId,
          subnetId: instance.SubnetId,
          averageCpu: cpu.ok ? metricAverage(cpu.data?.Datapoints) : null,
          maximumCpu: cpu.ok ? metricMaximum(cpu.data?.Datapoints) : null,
          cpuStatus: cpu.ok ? (cpu.data?.Datapoints?.length ? "observed" : "no-data") : "unavailable",
          cpuError: cpu.ok ? null : cpu.error?.message,
          averageMemory: memory.average,
          maximumMemory: memory.maximum,
          memoryStatus: memory.status,
          memoryError: memory.error,
          averageDisk: disk.average,
          maximumDisk: disk.maximum,
          diskStatus: disk.status,
          averageRootDisk: disk.rootAverage,
          maximumRootDisk: disk.rootMaximum,
          rootDiskStatus: disk.rootStatus,
          rootDiskDimensions: disk.rootDimensions,
          diskError: disk.error,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed EC2 utilization for ${id}.`);
      }
      const rdsById = new Map<string, any>();
      for (const job of rdsMetricJobs) {
        const id = job.instance.DBInstanceIdentifier;
        const region = job.instance.Region || awsScanRegion;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading ${job.metricName} for RDS ${id}.`);
        const metric = await runAwsJsonCheck([
          "cloudwatch", "get-metric-statistics",
          "--namespace", "AWS/RDS",
          "--metric-name", job.metricName,
          "--start-time", startTime,
          "--end-time", endTime,
          "--period", metricPeriod,
          "--statistics", job.statistic,
          "--dimensions", `Name=DBInstanceIdentifier,Value=${id}`,
          "--region", region,
        ], { env: scanEnv, timeoutMs: 45000 });
        const current = rdsById.get(id) || {
          id,
          class: job.instance.DBInstanceClass,
          engine: job.instance.Engine,
          multiAz: Boolean(job.instance.MultiAZ),
          status: job.instance.DBInstanceStatus,
          region,
        };
        if (job.metricName === "CPUUtilization") current.averageCpu = metric.ok ? metricAverage(metric.data?.Datapoints) : null;
        if (job.metricName === "DatabaseConnections") current.averageConnections = metric.ok ? metricAverage(metric.data?.Datapoints) : null;
        rdsById.set(id, current);
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed ${job.metricName} for RDS ${id}.`);
      }
      results.rdsMetrics = Array.from(rdsById.values());
      for (const { loadBalancer } of loadBalancerMetricJobs) {
        const dimension = loadBalancerDimension(loadBalancer.LoadBalancerArn);
        const region = loadBalancer.Region || awsScanRegion;
        const metricConfigByType = {
          application: { namespace: "AWS/ApplicationELB", metricName: "RequestCount" },
          network: { namespace: "AWS/NetworkELB", metricName: "ActiveFlowCount" },
        };
        const config = metricConfigByType[loadBalancer.Type];
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading load balancer traffic for ${loadBalancer.LoadBalancerName}.`);
        const metric = dimension && config ? await runAwsJsonCheck([
          "cloudwatch", "get-metric-statistics",
          "--namespace", config.namespace,
          "--metric-name", config.metricName,
          "--start-time", startTime,
          "--end-time", endTime,
          "--period", metricPeriod,
          "--statistics", "Sum",
          "--dimensions", `Name=LoadBalancer,Value=${dimension}`,
          "--region", region,
        ], { env: scanEnv, timeoutMs: 45000 }) : { ok: false, error: new Error("Unsupported load balancer type.") };
        const metricValue = metric.ok ? metricSum(metric.data?.Datapoints) : null;
        results.loadBalancerMetrics.push({
          name: loadBalancer.LoadBalancerName,
          arn: loadBalancer.LoadBalancerArn,
          type: loadBalancer.Type,
          state: loadBalancer.State?.Code,
          region,
          metricName: config?.metricName || null,
          metricStatus: metric.ok ? (metricValue == null ? "no-data" : "observed") : "unavailable",
          metricSum: metricValue,
          metricError: metric.ok ? null : metric.error?.message,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed load balancer traffic for ${loadBalancer.LoadBalancerName}.`);
      }
    }
    const cost = costFromCostExplorer(results.cost);
    const counts = awsScanCounts(results);
    const assessment = buildAwsAssessment(results, regions, errors);
    const recommendations = buildReport(assessment).findings.slice(0, 20).map(publicRecommendation);
    const status = errors.length ? "completed_with_errors" : "completed";
    const totalEntities = Object.values(counts).reduce((total: number, value) => total + Number(value || 0), 0);
    completedSteps += 1;
    const finalResult = await pool.query(
      `update cloudprune_aws_scans
       set status=$2, monthly_cost=$3, currency=$4, counts=$5::jsonb, errors=$6::jsonb, scan_json=$7::jsonb, updated_at=now()
       where id=$1 and status='running'
       returning id`,
      [scanId, status, cost.amount, cost.currency, jsonb(counts), jsonb(errors), jsonb({
        regions,
        requestedRegions,
        skippedRegions,
        checks: Object.keys(results),
        recommendations,
        limits: {
          maxRegions: awsScanMaxRegions,
          maxInventoryItems: awsScanMaxInventoryItems,
          maxLogGroups: awsScanMaxLogGroups,
          maxSampledResources: awsScanMaxSampledResources,
        },
        inventoryLimits,
        regionalErrors: errors.filter((error) => String(error.check || "").includes(":")),
        progress: 100,
        message: `AWS scan complete. Read ${totalEntities.toLocaleString()} entities.`,
        completedSteps,
        totalSteps,
      })]
    );
    if (finalResult.rows[0]) await recordAuthEvent({
      userId: user.id,
      accountId: user.account_id,
      email: user.email,
      eventType: "aws_scan_completed",
      detail: `AWS scan ${status} for account ${aws.provider_account_id}`,
      targetType: "aws_scan",
      targetId: scanId,
      metadata: { awsAccountId: aws.provider_account_id, status },
    });
  } catch (error: any) {
    const failureResult = await pool.query(
      `update cloudprune_aws_scans
       set status='failed', errors=$2, scan_json = scan_json || $3::jsonb, updated_at=now()
       where id=$1 and status='running'
       returning id`,
      [scanId, jsonb([{ check: "scan", message: error.message }]), jsonb({ progress: 100, message: "AWS scan failed." })]
    );
    if (failureResult.rows[0]) await recordAuthEvent({
      userId: user.id,
      accountId: user.account_id,
      email: user.email,
      eventType: "aws_scan_failed",
      detail: `AWS scan failed for account ${aws.provider_account_id}`,
      targetType: "aws_scan",
      targetId: scanId,
      metadata: { awsAccountId: aws.provider_account_id },
    });
  }
}

export {
  capAwsRegionalResult,
  computeOptimizerEc2Command,
  computeOptimizerMaxResults,
  elasticIpsCommand,
  performAwsScan,
};
