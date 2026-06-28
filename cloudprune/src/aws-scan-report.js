const { awsScanMaxSampledResources, awsScanRegion } = require("./config");

function costFromCostExplorer(data) {
  const total = data?.ResultsByTime?.[0]?.Total?.UnblendedCost || {};
  return {
    amount: Number(total.Amount || 0),
    currency: total.Unit || "USD",
  };
}

function scanCountValue(value, collectionKey) {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.reduce((total, item) => total + scanCountValue(item, collectionKey), 0);
  if (!value) return 0;
  if (collectionKey === "Reservations") return (value.Reservations || []).reduce((total, reservation) => total + (reservation.Instances || []).length, 0);
  return (value[collectionKey] || []).length;
}

function awsScanCounts(results) {
  return {
    ec2Instances: scanCountValue(results.ec2Instances, "Reservations"),
    lambdas: scanCountValue(results.lambdas, "Functions"),
    rdsInstances: scanCountValue(results.rdsInstances, "DBInstances"),
    s3Buckets: scanCountValue(results.s3Buckets, "Buckets"),
    ebsVolumes: scanCountValue(results.ebsVolumes, "Volumes"),
    loadBalancers: scanCountValue(results.loadBalancers, "LoadBalancers"),
  };
}

function awsCheck(service, data, error = null) {
  return {
    service,
    ok: !error,
    data: error ? null : data,
    error: error ? String(error.message || error) : null,
  };
}

function mergeAwsCollection(items, collectionKey) {
  if (!Array.isArray(items)) return items || {};
  return {
    [collectionKey]: items.flatMap((item) => item?.[collectionKey] || []),
  };
}

function mergeAwsReservations(items) {
  if (!Array.isArray(items)) return items || {};
  return {
    Reservations: items.flatMap((item) => item?.Reservations || []),
  };
}

function checkError(errors, id) {
  return errors.find((error) => error.check === id) || null;
}

function regionalCheckError(errors, id, regions, resultItems) {
  const failures = errors.filter((error) => String(error.check || "").startsWith(`${id}:`));
  if (!failures.length) return null;
  if (!Array.isArray(resultItems) || resultItems.length === 0 || failures.length >= regions.length) {
    return new Error(`All ${id} regional checks failed: ${failures.map((error) => error.check.split(":")[1]).join(", ")}`);
  }
  return null;
}

function buildAwsAssessment(results, regions, errors) {
  return {
    generatedAt: new Date().toISOString(),
    region: awsScanRegion,
    days: 30,
    concurrency: 5,
    maxResources: awsScanMaxSampledResources,
    checks: {
      identity: awsCheck("STS", results.identity, checkError(errors, "identity")),
      costByService: awsCheck("Cost Explorer", results.costByService, checkError(errors, "costByService")),
      savingsPlansRecommendation: awsCheck("Cost Explorer", results.savingsPlansRecommendation, checkError(errors, "savingsPlansRecommendation")),
      ec2Instances: awsCheck("EC2", mergeAwsReservations(results.ec2Instances), regionalCheckError(errors, "ec2Instances", regions, results.ec2Instances)),
      ec2Metrics: awsCheck("CloudWatch EC2 Metrics", { instances: results.ec2Metrics || [] }, null),
      ebsVolumes: awsCheck("EBS", mergeAwsCollection(results.ebsVolumes, "Volumes"), regionalCheckError(errors, "ebsVolumes", regions, results.ebsVolumes)),
      elasticIps: awsCheck("EC2", mergeAwsCollection(results.elasticIps, "Addresses"), regionalCheckError(errors, "elasticIps", regions, results.elasticIps)),
      rdsInstances: awsCheck("RDS", mergeAwsCollection(results.rdsInstances, "DBInstances"), regionalCheckError(errors, "rdsInstances", regions, results.rdsInstances)),
      rdsMetrics: awsCheck("CloudWatch RDS Metrics", { instances: results.rdsMetrics || [] }, null),
      logGroups: awsCheck("CloudWatch Logs", mergeAwsCollection(results.logGroups, "logGroups"), regionalCheckError(errors, "logGroups", regions, results.logGroups)),
      s3Buckets: awsCheck("S3", results.s3Buckets || {}, checkError(errors, "s3Buckets")),
      s3Lifecycle: awsCheck("S3 Lifecycle", { buckets: results.s3Lifecycle || [] }, null),
      loadBalancers: awsCheck("ELBv2", mergeAwsCollection(results.loadBalancers, "LoadBalancers"), regionalCheckError(errors, "loadBalancers", regions, results.loadBalancers)),
      loadBalancerMetrics: awsCheck("CloudWatch ELB Metrics", { loadBalancers: results.loadBalancerMetrics || [] }, null),
      albTargetMappings: awsCheck("ELBv2 Target Mapping", { targetGroups: results.albTargetMappings || [] }, null),
      apiGatewayV2: awsCheck("API Gateway HTTP APIs", mergeAwsCollection(results.apiGatewayV2, "Items"), regionalCheckError(errors, "apiGatewayV2", regions, results.apiGatewayV2)),
      apiGatewayRest: awsCheck("API Gateway REST APIs", mergeAwsCollection(results.apiGatewayRest, "items"), regionalCheckError(errors, "apiGatewayRest", regions, results.apiGatewayRest)),
      ssmInstances: awsCheck("SSM Managed Instances", mergeAwsCollection(results.ssmInstances, "InstanceInformationList"), regionalCheckError(errors, "ssmInstances", regions, results.ssmInstances)),
      ssmApplications: awsCheck("SSM Application Inventory", { instances: results.ssmApplications || [] }, null),
      computeOptimizerEc2: awsCheck("Compute Optimizer", mergeAwsCollection(results.computeOptimizerEc2, "instanceRecommendations"), regionalCheckError(errors, "computeOptimizerEc2", regions, results.computeOptimizerEc2)),
    },
    regions,
  };
}

function publicRecommendation(finding) {
  return {
    id: finding.id,
    cloud: "aws",
    title: finding.title,
    detail: finding.impactAnalysis,
    impact: Number(finding.estimatedMonthlySavings || 0),
    effort: finding.operationalRisk === "low" ? "Low" : finding.operationalRisk === "high" ? "High" : "Medium",
    risk: finding.operationalRisk === "low" ? "Low" : finding.operationalRisk === "high" ? "High" : "Medium",
    owner: finding.strategy,
    status: finding.executionMode === "assisted" ? "Review" : "Ready",
    strategy: finding.strategy,
    confidence: finding.confidence,
    downtimeRisk: finding.downtimeRisk,
    blastRadius: finding.blastRadius,
    impactAnalysis: finding.impactAnalysis,
    minimizeImpact: finding.minimizeImpact,
    rollbackPath: finding.rollbackPath,
    validationWindow: finding.validationWindow,
    statistics: finding.statistics || null,
    resources: finding.resources || [],
  };
}

module.exports = {
  awsScanCounts,
  buildAwsAssessment,
  costFromCostExplorer,
  mergeAwsCollection,
  mergeAwsReservations,
  publicRecommendation,
};
