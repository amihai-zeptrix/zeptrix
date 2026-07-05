const DEFAULT_DAYS = 30;
const DEFAULT_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const DEFAULT_AWS_TIMEOUT_MS = 30000;
const DEFAULT_CONCURRENCY = 6;

/**
 * @typedef {{ startDate: string, endDate: string }} CheckCommandContext
 * @typedef {{ id: string, service: string, command: string[] | ((context: CheckCommandContext) => string[]), required?: boolean, global?: boolean, region?: string }} AssessmentCheckDefinition
 */

/** @type {AssessmentCheckDefinition[]} */
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
    id: "costHistoryByService",
    service: "Cost Explorer",
    command: ({ endDate }) => {
      const start = new Date(`${endDate}T00:00:00Z`);
      start.setUTCMonth(start.getUTCMonth() - 4);
      return [
        "ce",
        "get-cost-and-usage",
        "--time-period",
        `Start=${start.toISOString().slice(0, 10)},End=${endDate}`,
        "--granularity",
        "MONTHLY",
        "--metrics",
        "UnblendedCost",
        "--group-by",
        "Type=DIMENSION,Key=SERVICE",
      ];
    },
    global: true,
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

module.exports = {
  CHECKS,
  DEFAULT_AWS_TIMEOUT_MS,
  DEFAULT_CONCURRENCY,
  DEFAULT_DAYS,
  DEFAULT_REGION,
};
