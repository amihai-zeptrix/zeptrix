const CLOUDS = [
  { id: "all", label: "All clouds" },
  { id: "aws", label: "AWS" },
  { id: "gcp", label: "GCP" },
  { id: "azure", label: "Azure" },
  { id: "kubernetes", label: "Kubernetes" },
  { id: "data", label: "Data platforms" },
];

const SERVICES = [
  { provider: "aws", name: "EC2 Compute", owner: "Platform", month: 124800, forecast: 137400, waste: 18400, trend: 11, score: 76 },
  { provider: "aws", name: "RDS", owner: "Core Apps", month: 39200, forecast: 41150, waste: 6200, trend: 5, score: 68 },
  { provider: "gcp", name: "BigQuery", owner: "Analytics", month: 53800, forecast: 66400, waste: 14300, trend: 24, score: 81 },
  { provider: "gcp", name: "GKE", owner: "Platform", month: 46250, forecast: 43900, waste: 9700, trend: -4, score: 72 },
  { provider: "azure", name: "AKS", owner: "Customer Apps", month: 31900, forecast: 36650, waste: 8200, trend: 15, score: 64 },
  { provider: "kubernetes", name: "Production clusters", owner: "SRE", month: 77400, forecast: 80100, waste: 21500, trend: 8, score: 83 },
  { provider: "data", name: "Snowflake", owner: "Data", month: 28800, forecast: 37100, waste: 9100, trend: 31, score: 79 },
];

const AWS_REGIONS = [
  { id: "us-east-1", label: "US East (N. Virginia)" },
  { id: "us-east-2", label: "US East (Ohio)" },
  { id: "us-west-1", label: "US West (N. California)" },
  { id: "us-west-2", label: "US West (Oregon)" },
  { id: "eu-west-1", label: "Europe (Ireland)" },
  { id: "eu-west-2", label: "Europe (London)" },
  { id: "eu-central-1", label: "Europe (Frankfurt)" },
  { id: "eu-north-1", label: "Europe (Stockholm)" },
  { id: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { id: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { id: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { id: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { id: "ca-central-1", label: "Canada (Central)" },
  { id: "sa-east-1", label: "South America (Sao Paulo)" },
  { id: "il-central-1", label: "Israel (Tel Aviv)" },
];

const RECOMMENDATIONS = [
  {
    id: "compute-commitments",
    cloud: "aws",
    title: "Review AWS Savings Plans purchase recommendation",
    impact: 11800,
    effort: "Low",
    risk: "Low",
    owner: "Commitment optimization",
    status: "Review",
    detail: "AWS native recommendations show a stable EC2 baseline that can be partially covered without changing running infrastructure.",
    statistics: { "Estimated monthly savings": "$11,800", "Covered compute baseline": "62%", "Confidence": "High" },
    minimizeImpact: "Commit only to a conservative baseline, exclude volatile accounts, and start with partial coverage.",
    rollbackPath: "No technical rollback; reduce risk by buying smaller commitments and letting them expire naturally.",
  },
  {
    id: "idle-ebs-volumes",
    cloud: "aws",
    title: "Review 128 unattached EBS volumes",
    impact: 3900,
    effort: "Low",
    risk: "Low",
    owner: "Idle resource cleanup",
    status: "Ready",
    detail: "Detached EBS volumes have no active attachment and no snapshot activity in the last 30 days.",
    statistics: { "Detached volumes": "128", "Measured storage": "18.4 TB", "Oldest unattached": "94 days" },
    minimizeImpact: "Snapshot first, delete in small batches, and exclude volumes with active incident or restore tags.",
    rollbackPath: "Create a new EBS volume from the retained snapshot.",
  },
  {
    id: "idle-elastic-ips",
    cloud: "aws",
    title: "Release 43 unassociated Elastic IP addresses",
    impact: 155,
    effort: "Low",
    risk: "Low",
    owner: "Idle resource cleanup",
    status: "Ready",
    detail: "Public IPv4 addresses are allocated but not associated with running resources.",
    statistics: { "Idle addresses": "43", "Regions": "5", "Monthly IPv4 waste": "$155" },
    minimizeImpact: "Check DNS, allowlists, and disaster-recovery runbooks before release.",
    rollbackPath: "Allocate replacement Elastic IPs and update dependent DNS or allowlists.",
  },
  {
    id: "storage-lifecycle",
    cloud: "aws",
    title: "Add retention and lifecycle policies for storage targets",
    impact: 9200,
    effort: "Low",
    risk: "Low",
    owner: "Storage lifecycle optimization",
    status: "Plan",
    detail: "CloudWatch log groups and S3 buckets retain old data without lifecycle transition or deletion policies.",
    statistics: { "Measured data": "210 TB", "Cold/old-tier S3": "84 TB (40% of measured S3)", "S3 objects": "123,456,000" },
    minimizeImpact: "Start with transition policies before deletion and keep longer retention for production and compliance-tagged data.",
    rollbackPath: "Increase retention going forward and restore archived objects when needed.",
  },
  {
    id: "ec2-app-consolidation",
    cloud: "aws",
    title: "Assess consolidating 2 low-utilization EC2 instances",
    impact: 620,
    effort: "Medium",
    risk: "Medium",
    owner: "EC2 consolidation",
    status: "Review",
    detail: "Two app instances have low combined CPU and compatible traffic mapping, making consolidation worth validating.",
    statistics: { "Running instances": "2", "Combined avg CPU": "14.6% instance-capacity", "Memory usage": "38-41%", "Traffic mapping": "1 ALB target group, 2 healthy EC2 targets, 1 API Gateway API" },
    minimizeImpact: "Validate memory, disk, and peak-hour behavior, then drain traffic from one instance before stopping it.",
    rollbackPath: "Restart the stopped instance and restore its target group registration.",
  },
  {
    id: "idle-load-balancers",
    cloud: "aws",
    title: "Investigate 3 load balancers with no observed traffic",
    impact: 65,
    effort: "Low",
    risk: "Medium",
    owner: "Idle resource cleanup",
    status: "Review",
    detail: "Load balancers reported no sampled requests during the scan window but may still support rare jobs or DR flows.",
    statistics: { "No-traffic load balancers": "3", "Observed requests": "0", "Scan window": "30 days" },
    minimizeImpact: "Confirm DNS, health checks, allowlists, and disaster-recovery use before removal.",
    rollbackPath: "Recreate the load balancer from infrastructure-as-code or restore previous listeners and target groups.",
  },
  {
    id: "ec2-rightsizing",
    cloud: "aws",
    title: "Evaluate 9 EC2 Compute Optimizer recommendations",
    impact: 4300,
    effort: "Medium",
    risk: "Medium",
    owner: "EC2 rightsizing",
    status: "Plan",
    detail: "Compute Optimizer identified overprovisioned instances that may be resized after workload validation.",
    statistics: { "Overprovisioned instances": "9", "Average CPU": "7.8%", "Peak CPU range": "18-54%" },
    minimizeImpact: "Resize one service at a time in a maintenance window and watch latency, CPU, memory, and disk headroom.",
    rollbackPath: "Scale the instance back to the previous type or redeploy the previous launch template.",
  },
  {
    id: "ec2-to-lambda-assessment",
    cloud: "aws",
    title: "Assess whether low-utilization EC2 app entrypoints can move to Lambda",
    impact: 2800,
    effort: "High",
    risk: "Medium",
    owner: "Serverless migration assessment",
    status: "Assess",
    detail: "Low-utilization app entrypoints are visible behind ALB and API Gateway paths that may fit event-driven execution.",
    statistics: { "Candidate entrypoints": "6", "Average CPU": "3.4%", "Traffic mapping": "2 ALB rules, 4 API Gateway routes", "App inventory": "Node.js and Python workers" },
    minimizeImpact: "Start with one stateless endpoint, mirror traffic, and keep EC2 serving the primary path until parity is proven.",
    rollbackPath: "Route traffic back to the EC2 target group or previous API integration.",
  },
  {
    id: "rds-rightsizing",
    cloud: "aws",
    title: "Review 4 low-utilization RDS instances",
    impact: 5100,
    effort: "Medium",
    risk: "High",
    owner: "Database rightsizing",
    status: "Review",
    detail: "RDS instances show low CPU and connection counts, but database changes need maintenance-window validation.",
    statistics: { "Low-use databases": "4", "Average CPU": "4.2%", "Average connections": "1.3" },
    minimizeImpact: "Verify memory, IOPS, storage, and Multi-AZ behavior before testing one class step down.",
    rollbackPath: "Scale back to the previous DB instance class during the approved window.",
  },
  {
    id: "network-egress-review",
    cloud: "aws",
    title: "Review 2 NAT gateways for endpoint opportunities",
    impact: 0,
    effort: "Medium",
    risk: "Medium",
    owner: "Network and data transfer waste",
    status: "Assess",
    detail: "NAT gateway traffic may be reducible with gateway or interface endpoints after route-level traffic analysis.",
    statistics: { "Active NAT gateways": "2", "Data processed": "9.4 TB", "Candidate endpoints": "S3, DynamoDB, ECR" },
    minimizeImpact: "Add endpoints before removing NAT paths, test per subnet, and keep route table rollback changes ready.",
    rollbackPath: "Restore previous route table entries and endpoint policies.",
  },
  { cloud: "kubernetes", title: "Right-size production namespace requests", impact: 14200, effort: "Medium", risk: "Low", owner: "SRE", status: "Ready", detail: "CPU requests exceed p95 usage by 48% across 31 deployments." },
  { cloud: "gcp", title: "Partition high-scan BigQuery tables", impact: 9300, effort: "Medium", risk: "Medium", owner: "Analytics", status: "Plan", detail: "Three tables account for 41% of query spend and repeat full scans." },
  { cloud: "data", title: "Suspend idle Snowflake warehouses faster", impact: 7600, effort: "Low", risk: "Low", owner: "Data", status: "Ready", detail: "Warehouse idle windows average 22 minutes after query completion." },
  { cloud: "azure", title: "Consolidate underused AKS node pools", impact: 6100, effort: "Medium", risk: "Medium", owner: "Customer Apps", status: "Review", detail: "Four node pools run below 34% memory utilization during business hours." },
];

const ANOMALIES = [
  { label: "BigQuery query scans", value: "+38%", note: "Analytics workspace", severity: "high" },
  { label: "NAT Gateway data transfer", value: "+19%", note: "us-east-1 shared VPC", severity: "medium" },
  { label: "AKS burst nodes", value: "+14%", note: "checkout workloads", severity: "medium" },
];

const ICONS = {
  logo: `
    <svg class="brand-icon" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logoCloud" x1="9" x2="55" y1="18" y2="46" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7dd3fc" />
          <stop offset=".52" stop-color="#42d392" />
          <stop offset="1" stop-color="#f5b642" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#12332d" />
      <path d="M19 42h25.5c6.4 0 10.5-3.9 10.5-9.2 0-4.6-3.3-8.4-8-9.1C44.9 17.9 39.8 14 33.6 14c-7 0-12.8 4.9-14.1 11.5C13.5 26 9 30.8 9 36.7 9 40.1 12.2 42 19 42Z" fill="url(#logoCloud)" />
      <path d="M24 47c8.9-8.8 17.9-12 29-12" fill="none" stroke="#eafff1" stroke-width="4.8" stroke-linecap="round" />
      <path d="M21 47c5.8.5 10.6-1.2 14.2-5.2-5.7-2.1-10.7-.7-14.2 5.2Z" fill="#eafff1" />
      <path d="M41 19l-6 6m0-6 6 6" stroke="#12332d" stroke-width="3.2" stroke-linecap="round" />
    </svg>
  `,
  dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z"/></svg>`,
  recs: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 5.2 5.8.8-4.2 4.1 1 5.8L12 16.2l-5.2 2.7 1-5.8L3.6 9l5.8-.8L12 3Z"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Zm1 14h-2v-2h2v2Zm0-4h-2V8h2v5Z"/></svg>`,
  automation: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.4 1a7.8 7.8 0 0 0-2.6-1.5L14 2h-4l-.4 3.1A7.8 7.8 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.4 2.4-1a7.8 7.8 0 0 0 2.6 1.5L10 22h4l.4-3.1a7.8 7.8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/></svg>`,
  spend: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c4.4 0 8 1.6 8 3.5S16.4 10 12 10 4 8.4 4 6.5 7.6 3 12 3Zm8 6v3c0 1.9-3.6 3.5-8 3.5S4 13.9 4 12V9c1.5 1.7 4.8 2.5 8 2.5s6.5-.8 8-2.5Zm0 5.5v3c0 1.9-3.6 3.5-8 3.5s-8-1.6-8-3.5v-3c1.5 1.7 4.8 2.5 8 2.5s6.5-.8 8-2.5Z"/></svg>`,
  waste: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l1 3h4v2h-2l-1 12H6L5 9H3V7h4l1-3Zm1.7 15h4.6l.7-10H9l.7 10Z"/></svg>`,
  savings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c5 0 9 3.4 9 7.5 0 3-2.1 5.7-5.2 6.8L15 21h-3l-.6-2.6h-1.8L9 21H6l-.8-3.6C2.6 16.1 1 13.6 1 10.5 1 6.4 5 3 10 3h2Zm2.5 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>`,
  score: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5.1 3.4 9.7 8 11 4.6-1.3 8-5.9 8-11V5l-8-3Zm4.4 7.4-5.2 5.2-2.6-2.6L7.2 13.4l4 4 6.6-6.6-1.4-1.4Z"/></svg>`,
  prune: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20c7.1-1.2 11.8-6.5 14-16-7.5 1.6-12 6-13.4 13.2L4 15.5 3 17l3 3Zm5.4-6.1c1.3-2.4 3.1-4.2 5.4-5.5-1.1 2.6-2.9 4.5-5.4 5.5Z"/></svg>`,
  all: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17h10.4c2.6 0 4.6-1.8 4.6-4.2 0-2.2-1.7-4-3.9-4.2C17.2 5.8 14.8 4 12 4 8.8 4 6.1 6.2 5.5 9.2 2.9 9.4 1 11.5 1 14.1 1 16.2 3 17 7 17Z"/></svg>`,
  aws: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 10.5c0-1.7 1.4-2.8 3.5-2.8 1.1 0 2.1.2 3 .7v2c-.9-.5-1.8-.8-2.8-.8-.8 0-1.3.3-1.3.8 0 .6.7.8 1.7 1.1 1.6.5 3 1.1 3 3 0 1.8-1.5 2.9-3.8 2.9-1.2 0-2.5-.3-3.4-.9v-2.1c1 .7 2.2 1.1 3.3 1.1.9 0 1.4-.3 1.4-.8 0-.6-.7-.8-1.8-1.2-1.5-.4-2.8-1-2.8-3Zm9.5-2.6h2.3l2.4 9.3h-2.2l-.4-1.9h-2.3l-.4 1.9h-2.1l2.7-9.3Zm.2 5.6h1.5l-.7-3.2-.8 3.2ZM3.8 7.9h2.1L4.3 17.2H2.1L3.8 7.9Z"/><path d="M5.1 19.1c4.5 1.8 9.3 1.7 13.6-.5.6-.3 1.1.5.5.9-4.3 3.1-10.4 3.4-14.7.6-.5-.3 0-1.2.6-1Z"/><path d="M18.8 17.8c.9-.1 2.2.2 2.5.6.3.4-.3 1.8-1 2.5-.2.2-.5.1-.4-.2l.4-1.3-1.4-.2c-.3 0-.4-.4-.1-.5Z"/></svg>`,
  gcp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.6 7.5h1.1l3-3C16.9 2.9 14.5 2 12 2 8 2 4.7 4.3 3.1 7.7l3.6 2.8c.8-1.8 2.6-3 4.7-3h3.2Z" fill="#ea4335"/><path d="M20.9 7.7 17.3 10c.5.6.8 1.4.8 2.3 0 .8-.2 1.5-.7 2.1l3.5 2.8c1.4-1.5 2.1-3.2 2.1-5 0-1.6-.8-3.3-2.1-4.5Z" fill="#4285f4"/><path d="M11.4 22c2.7 0 5.1-1 6.9-2.7l-3.5-2.8c-.9.6-2 .9-3.4.9-2 0-3.8-1.2-4.6-3l-3.6 2.8C4.7 20.5 8 22 11.4 22Z" fill="#34a853"/><path d="M6.8 14.4c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.1 7.7C2.4 9.1 2 10.7 2 12.5s.4 3.4 1.2 4.8l3.6-2.9Z" fill="#fbbc05"/></svg>`,
  azure: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.4 3h5.4L9.2 19.5c-.1.3-.4.5-.8.5H4.2c-.6 0-1-.6-.8-1.1L8.6 3.6c.1-.4.4-.6.8-.6Z" fill="#0078d4"/><path d="M16.2 14.1H8.5l7.1-11c.2-.3.5-.1.6.1l4.4 15.5c.2.6-.2 1.2-.8 1.2h-5.5l1.9-5.8Z" fill="#50a7f0"/><path d="m8.5 14.1 5.8 5.8h-6l.2-5.8Z" fill="#005ba1"/></svg>`,
  kubernetes: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 8.7 5v10L12 22l-8.7-5V7L12 2Z" fill="#326ce5"/><path d="m12 5 1 3.4 3-2-1.7 3.2 3.6.3-3.3 1.5 2.8 2.4-3.5-.6.5 3.6L12 14l-2.4 2.8.5-3.6-3.5.6 2.8-2.4-3.3-1.5 3.6-.3L8 6.4l3 2 1-3.4Z" fill="#fff"/></svg>`,
  data: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c4.4 0 8 1.4 8 3.2v11.6c0 1.8-3.6 3.2-8 3.2s-8-1.4-8-3.2V6.2C4 4.4 7.6 3 12 3Zm0 2c-3.3 0-5.8.7-5.8 1.2S8.7 7.4 12 7.4s5.8-.7 5.8-1.2S15.3 5 12 5Zm5.8 4.2c-1.5.8-3.6 1.2-5.8 1.2s-4.3-.4-5.8-1.2v2.3c0 .5 2.5 1.2 5.8 1.2s5.8-.7 5.8-1.2V9.2Zm0 5.3c-1.5.8-3.6 1.2-5.8 1.2s-4.3-.4-5.8-1.2v2.6c0 .5 2.5 1.2 5.8 1.2s5.8-.7 5.8-1.2v-2.6Z"/></svg>`,
};

let state = {
  cloud: "all",
  view: "recommendations",
  automation: false,
  authMode: "register",
  authMessage: "",
  sessionRefreshStarted: false,
  workspace: null,
  workspaceLoadStarted: false,
  connectFormVisible: false,
  connectMessage: "",
  awsConnectDraft: { awsAccountId: "", roleArn: "", externalId: "" },
  awsScan: { status: "idle", progress: 0, message: "" },
  awsScanRegions: ["us-east-1"],
  awsRegionPickerOpen: false,
  activeRecommendationActionId: "",
  feedbackOpen: false,
  feedbackMessage: "",
  feedbackSubmitting: false,
  adminOverview: null,
  adminLoadStarted: false,
  adminMessage: "",
  adminActionUserId: "",
  adminExpandedTenantId: "",
  adminTenantUsers: {},
  adminTenantUsersLoading: "",
  adminAuditLog: null,
  adminAuditLoadStarted: false,
};

const registerDraftKey = "cloudprune.registerDraft";
const awsScanRegionsKey = "cloudprune.awsScanRegions";

function money(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function scanResult() {
  if (state.awsScan.status === "scanning") {
    return state.awsScan.result || {
      status: "running",
      progress: state.awsScan.progress,
      message: state.awsScan.message,
      counts: {},
      errors: [],
    };
  }
  return state.awsScan.result || state.workspace?.awsScan || null;
}

function scanMonthlyCost() {
  const scan = scanResult();
  return scan ? Number(scan.monthlyCost || 0) : 0;
}

function scanTotalEntities(scan) {
  const counts = scan?.counts || {};
  return Object.values(counts).reduce((total, value) => total + Number(value || 0), 0);
}

function loadAwsScanRegions() {
  try {
    const saved = JSON.parse(localStorage.getItem(awsScanRegionsKey) || "[]");
    const valid = Array.isArray(saved) ? saved.filter((region) => AWS_REGIONS.some((item) => item.id === region)) : [];
    return valid.length ? valid : ["us-east-1"];
  } catch {
    return ["us-east-1"];
  }
}

state.awsScanRegions = loadAwsScanRegions();

function selectedAwsRegions() {
  return state.awsScanRegions.length ? state.awsScanRegions : ["us-east-1"];
}

function saveAwsScanRegions() {
  localStorage.setItem(awsScanRegionsKey, JSON.stringify(selectedAwsRegions()));
}

function toggleAwsScanRegion(region, checked) {
  if (!AWS_REGIONS.some((item) => item.id === region)) return;
  const selected = new Set(selectedAwsRegions());
  if (checked) selected.add(region);
  if (!checked && selected.size > 1) selected.delete(region);
  state.awsScanRegions = AWS_REGIONS.map((item) => item.id).filter((id) => selected.has(id));
  saveAwsScanRegions();
}

function savedAwsConnectionRegions(connection = state.workspace?.connections?.aws) {
  const regions = Array.isArray(connection?.regions) ? connection.regions.filter((region) => AWS_REGIONS.some((item) => item.id === region)) : [];
  return regions.length ? regions : selectedAwsRegions();
}

function readonlyAwsRegionSummary(connection = state.workspace?.connections?.aws) {
  const scan = scanResult();
  const scanRegions = Array.isArray(scan?.regions) ? scan.regions.filter(Boolean) : [];
  const regions = scanRegions.length ? scanRegions : savedAwsConnectionRegions(connection);
  return regions.join(", ");
}

let scanProgressTimer = null;

function stopScanProgress() {
  if (scanProgressTimer) clearInterval(scanProgressTimer);
  scanProgressTimer = null;
}

function startScanProgress(scan = null) {
  stopScanProgress();
  state.awsScan = {
    status: "scanning",
    progress: Number(scan?.progress ?? 0),
    message: scan?.message || "Starting AWS scan.",
    result: scan || null,
  };
}

async function scanAws() {
  startScanProgress();
  render();
  try {
    const response = await fetch(`${basePath()}/api/cloud-connections/aws/scan`, {
      method: "POST",
      headers: authHeaders(),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "AWS scan failed.");
    if (body.scan?.status === "running") {
      startScanProgress(body.scan);
      render();
      await pollAwsScan(body.scan.id);
      return;
    }
    completeAwsScan(body.scan);
  } catch (error) {
    stopScanProgress();
    state.awsScan = { status: "error", progress: 100, message: error.message };
  }
  render();
}

async function stopAwsScan() {
  stopScanProgress();
  state.awsScan = {
    ...state.awsScan,
    status: "scanning",
    message: "Stopping AWS scan...",
  };
  render();
  try {
    const response = await fetch(`${basePath()}/api/cloud-connections/aws/scan/stop`, {
      method: "POST",
      headers: authHeaders(),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not stop AWS scan.");
    completeAwsScan(body.scan);
  } catch (error) {
    state.awsScan = { status: "error", progress: 100, message: error.message };
  }
  render();
}

function completeAwsScan(scan) {
  stopScanProgress();
  state.awsScan = {
    status: scan.status === "failed" ? "error" : "done",
    progress: 100,
    message: scan.message || (scan.status === "failed" ? "AWS scan failed." : "AWS scan complete."),
    result: scan,
  };
  state.workspace = { ...(state.workspace || {}), awsScan: scan };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollAwsScan(scanId) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await delay(2000);
    const response = await fetch(`${basePath()}/api/cloud-connections/aws/scan/${encodeURIComponent(scanId)}`, {
      headers: authHeaders(),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "AWS scan status failed.");
    if (body.scan.status !== "running") {
      completeAwsScan(body.scan);
      render();
      return;
    }
    state.awsScan = {
      ...state.awsScan,
      status: "scanning",
      progress: Number(body.scan.progress ?? state.awsScan.progress ?? 0),
      message: body.scan.message || state.awsScan.message || "AWS scan is running.",
      result: body.scan,
    };
    state.workspace = { ...(state.workspace || {}), awsScan: body.scan };
    render();
  }
  throw new Error("AWS scan is still running. Refresh the page to check status.");
}

function filteredServices() {
  return state.cloud === "all" ? SERVICES : SERVICES.filter((service) => service.provider === state.cloud);
}

function activeRecommendations() {
  return appRoute() === "demo" ? RECOMMENDATIONS : scanResult()?.recommendations || [];
}

function filteredRecommendations() {
  const recommendations = activeRecommendations();
  return state.cloud === "all" ? recommendations : recommendations.filter((item) => item.cloud === state.cloud);
}

function recommendationKey(item) {
  return String(item.id || item.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toggleRecommendationAction(recommendationId) {
  const key = String(recommendationId || "");
  if (!key) return;
  const visibleKeys = new Set(filteredRecommendations().map(recommendationKey));
  if (!visibleKeys.has(key)) {
    state.activeRecommendationActionId = "";
    return;
  }
  state.activeRecommendationActionId = state.activeRecommendationActionId === key ? "" : key;
}

function demoActionCopy(item) {
  const status = String(item.status || "Review").toLowerCase();
  if (status === "ready") {
    return {
      eyebrow: "Ready action",
      title: "Stage safe execution",
      lead: "CloudPrune would prepare this recommendation for an operator-reviewed change.",
      steps: ["Confirm selected resources", "Create pre-change snapshots or exports", "Add the task to the automation queue"],
      cta: "Add to queue",
    };
  }
  if (status === "plan") {
    return {
      eyebrow: "Planning action",
      title: "Build rollout plan",
      lead: "CloudPrune would turn the finding into a phased implementation plan with owners and validation windows.",
      steps: ["Choose a first target batch", "Schedule validation and rollback checkpoints", "Create implementation tickets"],
      cta: "Create plan",
    };
  }
  if (status === "assess") {
    return {
      eyebrow: "Assessment action",
      title: "Collect decision data",
      lead: "CloudPrune would open a discovery workflow before recommending any infrastructure change.",
      steps: ["Map traffic and dependencies", "Collect missing utilization signals", "Score migration or consolidation risk"],
      cta: "Start assessment",
    };
  }
  if (status === "approve") {
    return {
      eyebrow: "Approval action",
      title: "Prepare approval packet",
      lead: "CloudPrune would package the savings, risk, and guardrails for a finance or platform approver.",
      steps: ["Review commitment size", "Confirm account and workload exclusions", "Record approver and expiry window"],
      cta: "Request approval",
    };
  }
  return {
    eyebrow: "Review action",
    title: "Open evidence review",
    lead: "CloudPrune would show the evidence, impact analysis, and rollback path before this moves forward.",
    steps: ["Inspect resource evidence", "Confirm downtime and blast radius", "Decide whether to plan, dismiss, or stage"],
    cta: "Open review",
  };
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

function providerLabel(provider) {
  return CLOUDS.find((cloud) => cloud.id === provider)?.label || provider;
}

function vendorBadge(provider, label = providerLabel(provider)) {
  return `<span class="vendor-badge ${provider}">${ICONS[provider] || ICONS.all}<span>${label}</span></span>`;
}

function appRoute(path = location.pathname) {
  if (path === `${basePath(path)}/admin` || path.startsWith(`${basePath(path)}/admin/`)) return "admin";
  return path.startsWith(`${basePath()}/demo`) ? "demo" : "auth";
}

function adminRoute(path = location.pathname) {
  const suffix = path.slice(`${basePath(path)}/admin`.length).replace(/^\/+/, "").split("/")[0];
  return suffix || "overview";
}

function workspaceRoute(path = location.pathname) {
  const base = basePath(path);
  const suffix = path.startsWith(`${base}/demo`) ? path.slice(`${base}/demo`.length) : path.slice(base.length);
  const first = suffix.replace(/^\/+/, "").split("/")[0];
  return first || "dashboard";
}

function basePath(path = location.pathname) {
  return path === "/cp" || path.startsWith("/cp/") ? "/cp" : "/cloudprune";
}

function hasSession() {
  return Boolean(localStorage.getItem("cloudprune.session"));
}

function decodeTokenPayload(token) {
  if (!token) return null;
  try {
    const payload = token.split(".")[0];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

function decodeSession() {
  return decodeTokenPayload(localStorage.getItem("cloudprune.session"));
}

function isAdminSession() {
  return decodeSession()?.role === "admin";
}

function pendingGoogleRegistration() {
  const token = localStorage.getItem("cloudprune.googleRegistration");
  const payload = decodeTokenPayload(token);
  if (payload?.exp && Number(payload.exp) < Date.now()) {
    localStorage.removeItem("cloudprune.googleRegistration");
    return null;
  }
  return payload ? { token, payload } : null;
}

function registerDraft() {
  try {
    return JSON.parse(localStorage.getItem(registerDraftKey)) || {};
  } catch {
    return {};
  }
}

function saveRegisterDraft(draft) {
  localStorage.setItem(registerDraftKey, JSON.stringify({
    name: String(draft.name || "").trim(),
    company: String(draft.company || "").trim(),
    email: String(draft.email || "").trim(),
  }));
}

function saveRegisterDraftFromForm(form) {
  saveRegisterDraft(Object.fromEntries(new FormData(form).entries()));
}

function isRegisterDraftComplete(draft) {
  return Boolean(
    String(draft.name || "").trim() &&
    String(draft.company || "").trim() &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(draft.email || "").trim())
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tenantName() {
  const session = decodeSession();
  return session?.companyName || session?.email?.split("@")[1] || "CloudPrune workspace";
}

function sessionAccountId() {
  return decodeSession()?.accountId || "tenant";
}

function signOut() {
  localStorage.removeItem("cloudprune.session");
  localStorage.removeItem("cloudprune.googleRegistration");
  localStorage.removeItem(registerDraftKey);
  state.authMessage = "Signed out.";
  location.href = `${basePath()}/`;
}

function refreshGoogleStart(form) {
  if (!form || form.dataset.authForm !== "register") return;
  saveRegisterDraftFromForm(form);
  const isComplete = isRegisterDraftComplete(registerDraft());
  const googleButton = form.querySelector("[data-action='google-start']");
  const hint = form.querySelector("[data-google-hint]");
  if (googleButton) googleButton.disabled = !isComplete;
  if (hint) hint.classList.toggle("hidden", isComplete);
}

async function refreshSession() {
  const token = localStorage.getItem("cloudprune.session");
  if (!token || state.sessionRefreshStarted || typeof fetch !== "function") return;
  state.sessionRefreshStarted = true;
  try {
    const response = await fetch(`${basePath()}/api/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "CloudPrune session refresh failed.");
    if (body.token && body.token !== token) {
      localStorage.setItem("cloudprune.session", body.token);
      render();
    }
  } catch {
    state.sessionRefreshStarted = false;
  }
}

function authHeaders(extra = {}) {
  return { ...extra, authorization: `Bearer ${localStorage.getItem("cloudprune.session") || ""}` };
}

function formValue(form, name) {
  return String(
    form?.elements?.[name]?.value ??
    form?.querySelector?.(`[name='${name}']`)?.value ??
    new FormData(form).get(name) ??
    ""
  ).trim();
}

function normalizeAwsAccountId(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 12);
}

function awsRoleArnForAccount(accountId) {
  const normalized = normalizeAwsAccountId(accountId);
  return normalized.length === 12 ? `arn:aws:iam::${normalized}:role/CloudPruneReadOnlyRole` : "";
}

function awsAccountIdFromRoleArn(roleArn) {
  const match = String(roleArn || "").match(/^arn:aws[a-z-]*:iam::(\d{12}):role\/CloudPruneReadOnlyRole$/);
  return match ? match[1] : "";
}

function captureAwsConnectDraft(form) {
  const accountId = normalizeAwsAccountId(formValue(form, "awsAccountId"));
  const roleArn = awsRoleArnForAccount(accountId);
  state.awsConnectDraft = {
    awsAccountId: accountId,
    roleArn,
    externalId: formValue(form, "externalId"),
    regions: selectedAwsRegions(),
  };
  return state.awsConnectDraft;
}

function absoluteAppUrl(pathname) {
  return new URL(pathname, location.href).toString();
}

function cloudFormationLaunchUrl(externalId, principalArn, templateUrl = "") {
  const resolvedTemplateUrl = templateUrl || absoluteAppUrl(`${basePath()}/aws-readonly-role-template.yaml`);
  const params = new URLSearchParams({
    templateURL: resolvedTemplateUrl,
    stackName: "CloudPruneReadOnlyRole",
    param_ExternalId: externalId,
    param_CloudPrunePrincipalArn: principalArn,
    param_RoleName: "CloudPruneReadOnlyRole",
  });
  const url = new URL("https://console.aws.amazon.com/cloudformation/home");
  url.hash = `/stacks/quickcreate?${params.toString()}`;
  return url.toString();
}

async function loadWorkspace() {
  if (!hasSession() || state.workspaceLoadStarted || typeof fetch !== "function") return;
  state.workspaceLoadStarted = true;
  try {
    const response = await fetch(`${basePath()}/api/workspace`, {
      headers: authHeaders(),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "CloudPrune workspace load failed.");
    state.workspace = body;
    if (body.connections?.aws?.regions?.length) {
      state.awsScanRegions = savedAwsConnectionRegions(body.connections.aws);
      saveAwsScanRegions();
    }
    render();
    if (body.awsScan?.status === "running" && state.awsScan.result?.id !== body.awsScan.id) {
      startScanProgress(body.awsScan);
      render();
      pollAwsScan(body.awsScan.id).catch((error) => {
        stopScanProgress();
        state.awsScan = { status: "error", progress: 100, message: error.message };
        render();
      });
    }
  } catch {
    state.workspaceLoadStarted = false;
  }
}

async function loadAdminOverview() {
  if (!isAdminSession() || state.adminLoadStarted || typeof fetch !== "function") return;
  state.adminLoadStarted = true;
  try {
    const response = await fetch(`${basePath()}/api/admin/overview`, {
      headers: authHeaders(),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "CloudPrune admin overview failed.");
    state.adminOverview = body;
    state.adminMessage = "";
  } catch (error) {
    state.adminMessage = error.message;
  }
  render();
}

async function loadAdminTenantUsers(tenantId) {
  if (!isAdminSession() || !tenantId || state.adminTenantUsers[tenantId] || state.adminTenantUsersLoading === tenantId || typeof fetch !== "function") return;
  state.adminTenantUsersLoading = tenantId;
  state.adminMessage = "Loading tenant users...";
  render();
  try {
    const response = await fetch(`${basePath()}/api/admin/tenants/${encodeURIComponent(tenantId)}/users`, {
      headers: authHeaders(),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "CloudPrune tenant users load failed.");
    state.adminTenantUsers = { ...state.adminTenantUsers, [tenantId]: body.users || [] };
    state.adminMessage = "";
  } catch (error) {
    state.adminMessage = error.message;
  }
  state.adminTenantUsersLoading = "";
  render();
}

async function loadAdminAuditLog() {
  if (!isAdminSession() || state.adminAuditLoadStarted || typeof fetch !== "function") return;
  state.adminAuditLoadStarted = true;
  try {
    const response = await fetch(`${basePath()}/api/admin/audit-log`, {
      headers: authHeaders(),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "CloudPrune audit log failed.");
    state.adminAuditLog = body.auditLog || [];
    state.adminMessage = "";
  } catch (error) {
    state.adminMessage = error.message;
  }
  render();
}

function readAttachment(file) {
  if (!file) return Promise.resolve(null);
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error("Attachment must be 2 MB or smaller."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      contentBase64: String(reader.result || "").split(",")[1] || "",
    });
    reader.onerror = () => reject(new Error("Could not read attachment."));
    reader.readAsDataURL(file);
  });
}

async function syncProfileFromDraft(token, draft) {
  if (!isRegisterDraftComplete(draft) || typeof fetch !== "function") return token;
  try {
    const response = await fetch(`${basePath()}/api/profile`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: draft.name, company: draft.company }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "CloudPrune profile update failed.");
    if (body.token) localStorage.setItem("cloudprune.session", body.token);
    localStorage.removeItem(registerDraftKey);
    return body.token || token;
  } catch {
    return token;
  }
}

function renderProviderFilter() {
  return CLOUDS.map((cloud) => `
    <button class="segmented-button ${state.cloud === cloud.id ? "active" : ""}" data-cloud="${cloud.id}">
      ${vendorBadge(cloud.id, cloud.label)}
    </button>
  `).join("");
}

function renderKpis() {
  const services = filteredServices();
  const spend = sum(services, "month");
  const forecast = sum(services, "forecast");
  const waste = sum(services, "waste");
  const score = Math.round(sum(services, "score") / services.length);
  return `
    <section class="kpi-grid" aria-label="Cloud cost summary">
      <article class="kpi spend"><div class="kpi-icon">${ICONS.spend}</div><span>Month spend</span><strong>${money(spend)}</strong><em>${forecast > spend ? `${money(forecast - spend)} forecast overrun` : `${money(spend - forecast)} below forecast`}</em></article>
      <article class="kpi waste"><div class="kpi-icon">${ICONS.waste}</div><span>Verified waste</span><strong>${money(waste)}</strong><em>${Math.round((waste / spend) * 100)}% of monitored spend</em></article>
      <article class="kpi savings"><div class="kpi-icon">${ICONS.savings}</div><span>Potential annual saving</span><strong>${money(waste * 12)}</strong><em>Before implementation risk scoring</em></article>
      <article class="kpi score"><div class="kpi-icon">${ICONS.score}</div><span>Optimization score</span><strong>${score}</strong><em>${score >= 75 ? "Healthy with focused actions" : "Needs review this week"}</em></article>
    </section>
  `;
}

function renderEmptyKpis() {
  const cost = scanMonthlyCost();
  const scan = scanResult();
  const analyzed = scanTotalEntities(scan);
  return `
    <section class="kpi-grid" aria-label="Cloud cost summary">
      <article class="kpi spend"><div class="kpi-icon">${ICONS.spend}</div><span>Month spend</span><strong>${money(cost)}</strong><em>${scan ? "Updated by latest AWS scan" : "No billing data connected"}</em></article>
      <article class="kpi waste"><div class="kpi-icon">${ICONS.waste}</div><span>Verified waste</span><strong>$0</strong><em>Connect AWS to start analysis</em></article>
      <article class="kpi savings"><div class="kpi-icon">${ICONS.savings}</div><span>Potential annual saving</span><strong>$0</strong><em>Pending first assessment</em></article>
      <article class="kpi score"><div class="kpi-icon">${ICONS.score}</div><span>Resources analyzed</span><strong>${analyzed || "-"}</strong><em>${scan ? "Entities read from AWS" : "No resources analyzed yet"}</em></article>
    </section>
  `;
}

function renderSpendBars() {
  const services = filteredServices();
  const max = Math.max(...services.map((service) => service.forecast));
  return services.map((service) => `
    <tr>
      <td><strong>${service.name}</strong><span>${vendorBadge(service.provider)} / ${service.owner}</span></td>
      <td>${money(service.month)}</td>
      <td>
        <div class="bar-track"><i style="width:${Math.max(8, (service.forecast / max) * 100)}%"></i></div>
      </td>
      <td class="${service.trend > 12 ? "danger" : service.trend < 0 ? "good" : ""}">${service.trend > 0 ? "+" : ""}${service.trend}%</td>
      <td>${money(service.waste)}</td>
    </tr>
  `).join("");
}

function renderRecommendations() {
  const recommendations = filteredRecommendations();
  return recommendations.map((item) => {
    const key = recommendationKey(item);
    const isOpen = state.activeRecommendationActionId === key;
    const actionLabel = isOpen ? "Close" : item.status || "Review";
    return `
    <article class="recommendation ${isOpen ? "active-action" : ""}">
      <div class="rec-icon ${item.cloud}">${ICONS.prune}</div>
      <div class="rec-main">
        <span class="cloud-pill">${vendorBadge(item.cloud)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail || item.impactAnalysis || "")}</p>
        ${renderRecommendationStats(item.statistics)}
        ${item.minimizeImpact ? `<p><strong>Minimize impact:</strong> ${escapeHtml(item.minimizeImpact)}</p>` : ""}
        ${item.rollbackPath ? `<p><strong>Rollback:</strong> ${escapeHtml(item.rollbackPath)}</p>` : ""}
      </div>
      <div class="rec-meta">
        <strong>${money(item.impact)}</strong>
        <span>${escapeHtml(item.owner || item.strategy || "CloudPrune")}</span>
        <span>${escapeHtml(item.effort || "Medium")} effort</span>
        <span>${escapeHtml(item.risk || "Medium")} risk</span>
        <button data-action="stage" data-recommendation-id="${escapeHtml(key)}" aria-expanded="${isOpen ? "true" : "false"}" aria-label="${isOpen ? "Close" : "Open"} ${escapeHtml(item.status || "Review")} workflow for ${escapeHtml(item.title)}">${escapeHtml(actionLabel)}</button>
      </div>
      ${isOpen ? renderRecommendationAction(item) : ""}
    </article>
  `;
  }).join("") || `<div class="empty">${appRoute() === "demo" ? "No recommendations match this cloud." : "No recommendations yet. Run an AWS scan to generate cost-saving findings."}</div>`;
}

function renderRecommendationStats(statistics) {
  const entries = Object.entries(statistics || {}).filter(([, value]) => value != null && value !== "");
  if (!entries.length) return "";
  return `
    <dl class="rec-stats">
      ${entries.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderRecommendationAction(item) {
  const action = demoActionCopy(item);
  return `
    <div class="demo-action-panel">
      <div class="demo-action-head">
        <div>
          <span class="eyebrow">${escapeHtml(action.eyebrow)}</span>
          <h4>${escapeHtml(action.title)}</h4>
        </div>
        <button data-action="close-demo-action" aria-label="Close recommendation workflow">Close</button>
      </div>
      <p>${escapeHtml(action.lead)}</p>
      <div class="demo-action-grid">
        <div>
          <strong>Workflow</strong>
          <ol>
            ${action.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
          </ol>
        </div>
        <div>
          <strong>Guardrails</strong>
          <span>${escapeHtml(item.minimizeImpact || "Validate impact, choose a small first batch, and keep rollback ready.")}</span>
        </div>
        <div>
          <strong>Rollback</strong>
          <span>${escapeHtml(item.rollbackPath || "Restore the previous configuration and monitor the workload.")}</span>
        </div>
      </div>
      <div class="demo-action-footer">
        <span>${escapeHtml(item.risk || "Medium")} risk</span>
        <span>${escapeHtml(item.effort || "Medium")} effort</span>
        <strong>${money(item.impact)} monthly impact</strong>
        <button>${escapeHtml(action.cta)}</button>
      </div>
    </div>
  `;
}

function renderFeedbackDialog() {
  if (!state.feedbackOpen) return "";
  const disabled = state.feedbackSubmitting ? "disabled" : "";
  return `
    <div class="dialog-backdrop" role="presentation">
      <section class="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div class="dialog-head">
          <div>
            <span class="eyebrow">Product feedback</span>
            <h2 id="feedback-title">Send feedback</h2>
          </div>
          <button data-action="close-feedback" type="button" aria-label="Close feedback dialog">Close</button>
        </div>
        <form class="feedback-form" data-feedback-form>
          <label>Type
            <select name="type" required>
              <option>Issue</option>
              <option>Feature request</option>
              <option>Question</option>
              <option>Billing</option>
              <option>Other</option>
            </select>
          </label>
          <label>Details
            <textarea name="details" rows="8" maxlength="5000" placeholder="What happened, what did you expect, and how can we reproduce it?" required></textarea>
          </label>
          <label>Attach file
            <input name="attachment" type="file" />
            <span class="field-help">Optional, up to 2 MB. Screenshots are useful.</span>
          </label>
          <div class="dialog-actions">
            <button type="submit" ${disabled}>${state.feedbackSubmitting ? "Sending..." : "Send feedback"}</button>
            <button class="secondary-connect" data-action="close-feedback" type="button" ${disabled}>Cancel</button>
          </div>
          <p class="auth-message">${escapeHtml(state.feedbackMessage)}</p>
        </form>
      </section>
    </div>
  `;
}

function renderAdminUsers(tenant) {
  const users = state.adminTenantUsers[tenant.id] || [];
  if (state.adminTenantUsersLoading === tenant.id) return `<div class="admin-user-list empty">Loading users...</div>`;
  if (!users.length) return `<div class="admin-user-list empty">No users for this tenant.</div>`;
  return `
    <div class="admin-user-list">
      ${users.map((user) => {
        const busy = state.adminActionUserId === user.id;
        return `
          <article class="admin-user-row">
            <div>
              <strong>${escapeHtml(user.name || "Unnamed user")}</strong>
              <span>${escapeHtml(user.email || "")} / ${escapeHtml(user.provider || "password")}${user.hasPassword ? " / password enabled" : ""}</span>
            </div>
            <form class="admin-reset-form" data-admin-reset-form="${escapeHtml(user.id)}">
              <input name="password" type="password" minlength="10" placeholder="New password" aria-label="New password for ${escapeHtml(user.email || user.name || "user")}" required />
              <button type="submit" ${busy ? "disabled" : ""}>Reset password</button>
            </form>
            <button class="secondary-connect" data-action="admin-spoof-user" data-user-id="${escapeHtml(user.id)}" type="button" ${busy ? "disabled" : ""}>Spoof</button>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderAdminSidebar(route) {
  return `
    <aside class="sidebar">
      <a class="brand" href="${basePath()}/admin" aria-label="CloudPrune">${ICONS.logo}<strong>CloudPrune</strong></a>
      <nav>
        <div class="tenant-label"><span>Role</span><strong>Admin</strong></div>
        <a class="${route === "overview" ? "active" : ""}" href="${basePath()}/admin">${ICONS.settings}<span>Admin</span></a>
        <a class="${route === "audit-log" ? "active" : ""}" href="${basePath()}/admin/audit-log">${ICONS.alert}<span>Audit log</span></a>
        <div class="nav-separator" aria-hidden="true"></div>
        <button class="sidebar-action" data-action="logout" type="button">Logout</button>
      </nav>
    </aside>
  `;
}

function renderAdminAuditLog() {
  loadAdminAuditLog();
  const events = state.adminAuditLog || [];
  return `
    <div class="admin-grid">
      <section class="panel table-panel">
        <div class="panel-head"><div><span class="eyebrow">Audit log</span><h2>${events.length} recent events</h2></div></div>
        <table class="audit-log-table">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Tenant</th><th>Target</th><th>Summary</th></tr></thead>
          <tbody>${events.map((event) => `
            <tr>
              <td>${formatDate(event.createdAt)}</td>
              <td><strong>${escapeHtml(event.actorEmail || "unknown")}</strong><span>${escapeHtml(event.actorRole || "user")}</span></td>
              <td>${escapeHtml(event.action || "")}</td>
              <td>${escapeHtml(event.tenant || "-")}</td>
              <td><strong>${escapeHtml(event.targetType || "-")}</strong><span>${escapeHtml(event.targetId || "")}</span></td>
              <td>${escapeHtml(event.summary || "")}</td>
            </tr>
          `).join("") || `<tr><td colspan="6" class="muted-row">No audit events yet.</td></tr>`}</tbody>
        </table>
      </section>
    </div>
  `;
}

function renderAdminOverviewContent() {
  loadAdminOverview();
  const tenants = state.adminOverview?.tenants || [];
  const feedback = state.adminOverview?.feedback || [];
  return `
    <div class="admin-grid">
      <section class="panel table-panel">
        <div class="panel-head"><div><span class="eyebrow">Tenants</span><h2>${tenants.length} workspaces</h2></div></div>
        <table>
          <thead><tr><th>Tenant</th><th>Users</th><th>Connections</th><th>Created</th><th>Manage</th></tr></thead>
          <tbody>${tenants.map((tenant) => `
            <tr>
              <td><strong>${escapeHtml(tenant.companyName)}</strong><span>${escapeHtml(tenant.id)}</span></td>
              <td>${Number(tenant.userCount ?? 0)}</td>
              <td>${Number(tenant.connections || 0)}</td>
              <td>${formatDate(tenant.createdAt)}</td>
              <td><button class="secondary-connect" data-action="toggle-admin-tenant-users" data-tenant-id="${escapeHtml(tenant.id)}" type="button">${state.adminExpandedTenantId === tenant.id ? "Hide users" : "Show users"}</button></td>
            </tr>
            ${state.adminExpandedTenantId === tenant.id ? `
            <tr class="admin-users-table-row">
              <td colspan="5">${renderAdminUsers(tenant)}</td>
            </tr>` : ""}
          `).join("") || `<tr><td colspan="5" class="muted-row">No tenants yet.</td></tr>`}</tbody>
        </table>
      </section>
      <section class="panel feedback-admin-panel">
        <div class="panel-head"><div><span class="eyebrow">Feedback reports</span><h2>${feedback.length} reports</h2></div></div>
        <div class="feedback-list">${feedback.map((item) => `
          <article class="feedback-report">
            <div>
              <span>${escapeHtml(item.type)}</span>
              <h3>${escapeHtml(item.tenant || "Unknown tenant")}</h3>
              <p>${escapeHtml(item.details)}</p>
            </div>
            <aside>
              <strong>${escapeHtml(item.user || "")}</strong>
              <small>${escapeHtml(item.email || "")}</small>
              <small>${formatDate(item.createdAt)}</small>
              ${item.attachment ? `<em>${escapeHtml(item.attachment.name)} (${formatBytes(item.attachment.size)})</em>` : ""}
            </aside>
          </article>
        `).join("") || `<div class="empty">No feedback reports yet.</div>`}</div>
      </section>
    </div>
  `;
}

function renderAdminPage(app) {
  if (!hasSession()) {
    renderAuth(app);
    return;
  }
  if (!isAdminSession()) {
    app.innerHTML = `
      <main class="auth-page">
        <section class="auth-card">
          <a class="auth-brand" href="${basePath()}/" aria-label="CloudPrune">${ICONS.logo}<strong>CloudPrune</strong></a>
          <p class="auth-message">CloudPrune admin access is required.</p>
          <button data-action="logout" type="button">Logout</button>
        </section>
      </main>
    `;
    return;
  }
  const route = adminRoute();
  const isAuditLog = route === "audit-log";
  app.innerHTML = `
    <div class="shell admin-shell">
      ${renderAdminSidebar(route)}
      <main>
        <header class="topbar">
          <div>
            <span class="eyebrow">CloudPrune admin</span>
            <h1>${isAuditLog ? "Audit log." : "Tenants and feedback reports."}</h1>
          </div>
        </header>
        ${isAuditLog ? renderAdminAuditLog() : renderAdminOverviewContent()}
        <p class="auth-message">${escapeHtml(state.adminMessage)}</p>
      </main>
    </div>
  `;
}

function renderAnomalies() {
  return ANOMALIES.map((item) => `
    <article class="anomaly ${item.severity}">
      <div class="anomaly-copy">${ICONS.alert}<div><strong>${item.label}</strong><span>${item.note}</span></div></div>
      <em>${item.value}</em>
    </article>
  `).join("");
}

function renderAutomationQueue() {
  const queue = filteredRecommendations().filter((item) => item.risk === "Low").slice(0, 4);
  return queue.map((item, index) => `
    <li>
      <span>${index + 1}</span>
      <div><strong>${item.title}</strong><small>${money(item.impact)} monthly impact / ${item.owner}</small></div>
      <button data-action="approve">Approve</button>
    </li>
  `).join("") || `<li class="muted-row">Select all clouds to see the automation queue.</li>`;
}

function renderAwsScanPanel(awsConnection) {
  const scan = scanResult();
  const active = state.awsScan.status === "scanning" || scan?.status === "running";
  const counts = scan?.counts || {};
  const stopped = scan?.status === "stopped";
  const failed = scan?.status === "failed";
  const progress = active ? Number(scan?.progress ?? state.awsScan.progress ?? 0) : scan ? 100 : 0;
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const progressWidth = active ? Math.max(5, clampedProgress) : clampedProgress;
  const countRows = [
    ["EC2 instances", counts.ec2Instances],
    ["Lambda functions", counts.lambdas],
    ["RDS instances", counts.rdsInstances],
    ["S3 buckets", counts.s3Buckets],
    ["EBS volumes", counts.ebsVolumes],
    ["Load balancers", counts.loadBalancers],
  ].map(([label, value]) => `<li><span>${label}</span><strong>${Number(value || 0).toLocaleString()}</strong></li>`).join("");
  const errors = (scan?.errors || []).length
    ? `<p class="scan-warning">${scan.errors.length} read check${scan.errors.length === 1 ? "" : "s"} returned warnings. Results are partial.</p>`
    : "";
  return `
    <div class="scan-panel">
      <div>
        <span class="eyebrow">AWS scan</span>
        <h3>${active ? "Scanning account..." : scan ? failed ? "Latest scan failed" : stopped ? "Latest scan stopped" : "Latest scan complete" : "Run first inventory scan"}</h3>
        <p>${active ? escapeHtml(scan?.message || state.awsScan.message || "AWS scan is running.") : scan ? escapeHtml(scan.message || `AWS scan complete. Read ${scanTotalEntities(scan).toLocaleString()} entities from AWS account ${scan.awsAccountId || awsConnection.awsAccountId}.`) : "Collect inventory counts and current-month spend using the saved read-only role."}</p>
      </div>
      <div class="scan-progress-row">
        <div class="scan-progress ${active ? "active" : ""}" aria-label="AWS scan progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(clampedProgress)}" role="progressbar" style="--scan-progress:${progressWidth}%">
          <span></span>
        </div>
        <strong>${Math.round(clampedProgress)}%</strong>
      </div>
      <div class="scan-actions">
        <button data-action="scan-aws" ${active ? "disabled" : ""}>${active ? "Scanning..." : scan ? "Scan again" : "Scan AWS"}</button>
        ${active ? `<button class="secondary-connect" data-action="stop-scan" type="button">Stop scan</button>` : ""}
        <strong>${scan ? money(scan.monthlyCost) : "$0"} <small>month spend</small></strong>
      </div>
      ${scan && !active ? `<ul class="scan-counts">${countRows}</ul>${errors}` : ""}
    </div>
  `;
}

function renderMainPanel() {
  if (state.view === "services") {
    return `
      <section class="panel table-panel">
        <div class="panel-head">
          <div><span class="eyebrow">Spend monitor</span><h2>Forecast, trend, and waste by service</h2></div>
          <button data-view="recommendations">View actions</button>
        </div>
        <table>
          <thead><tr><th>Service</th><th>MTD</th><th>Forecast</th><th>Trend</th><th>Waste</th></tr></thead>
          <tbody>${renderSpendBars()}</tbody>
        </table>
      </section>
    `;
  }
  return `
    <section class="panel">
      <div class="panel-head">
        <div><span class="eyebrow">Savings inbox</span><h2>Prioritized recommendations</h2></div>
        <button data-view="services">View services</button>
      </div>
      <div class="recommendation-list">${renderRecommendations()}</div>
    </section>
  `;
}

function renderEmptyWorkspace() {
  const awsConnection = state.workspace?.connections?.aws || null;
  const externalIdValue = state.awsConnectDraft.externalId || state.workspace?.awsSetup?.externalId || `cloudprune-${sessionAccountId()}`;
  const principalArnValue = state.workspace?.awsSetup?.principalArn || "CloudPrune AWS principal ARN";
  const templateUrlValue = state.workspace?.awsSetup?.cloudFormationTemplateUrl || "";
  if (awsConnection) {
    if (workspaceRoute() === "recommendations") {
      return `
        <div class="workspace">
          <section class="panel">
            <div class="panel-head">
              <div><span class="eyebrow">Savings inbox</span><h2>Prioritized recommendations</h2></div>
              <button data-action="scan-aws" ${state.awsScan.status === "scanning" ? "disabled" : ""}>${state.awsScan.status === "scanning" ? "Scanning..." : "Scan again"}</button>
            </div>
            <div class="recommendation-list">${renderRecommendations()}</div>
          </section>
          <aside class="right-rail">
            <section class="panel compact empty-side-panel">
              <div class="panel-head"><div><span class="eyebrow">Latest AWS scan</span><h2>${scanResult() ? "Available" : "Not run"}</h2></div></div>
              ${renderAwsScanPanel(awsConnection)}
            </section>
            <section class="panel compact empty-side-panel">
              <div class="panel-head"><div><span class="eyebrow">Automation queue</span><h2>Review first</h2></div></div>
              <ol class="queue">${renderAutomationQueue()}</ol>
            </section>
          </aside>
        </div>
      `;
    }
    return `
      <div class="workspace empty-workspace">
        <section class="panel empty-state-panel">
          <div class="empty-state-icon">${ICONS.aws}</div>
          <span class="eyebrow">AWS connected</span>
          <h2>Assume-role access is configured.</h2>
          <p>CloudPrune is ready to run a read-only AWS assessment using the role below. The next step is to start collecting inventory, spend, and utilization signals.</p>
          <div class="connection-summary">
            <span>AWS account</span><strong>${escapeHtml(awsConnection.awsAccountId)}</strong>
            <span>Role ARN</span><code>${escapeHtml(awsConnection.roleArn)}</code>
            <span>External ID</span><code>${escapeHtml(awsConnection.externalId)}</code>
            <span>Region(s)</span><code title="${escapeHtml(readonlyAwsRegionSummary(awsConnection))}">${escapeHtml(readonlyAwsRegionSummary(awsConnection))}</code>
          </div>
          <div class="empty-actions">
            <button data-action="connect" ${state.connectFormVisible ? "disabled" : ""}>Edit scan configuration</button>
            <a href="${basePath()}/demo">View demo data</a>
          </div>
          ${renderAwsScanPanel(awsConnection)}
          ${state.connectFormVisible ? renderAwsConnectForm(externalIdValue, principalArnValue, awsConnection.roleArn, templateUrlValue) : ""}
        </section>
        <aside class="right-rail">
          <section class="panel compact empty-side-panel">
            <div class="panel-head"><div><span class="eyebrow">Connection</span><h2>Configured</h2></div></div>
            <div class="empty">AWS read-only role saved. Run a scan to populate inventory and spend.</div>
          </section>
          <section class="panel compact empty-side-panel">
            <div class="panel-head"><div><span class="eyebrow">Automation queue</span><h2>Disabled</h2></div></div>
            <div class="empty">Automation stays off until real findings are reviewed.</div>
          </section>
        </aside>
      </div>
    `;
  }
  return `
    <div class="workspace empty-workspace">
      <section class="panel empty-state-panel">
        <div class="empty-state-icon">${ICONS.prune}</div>
        <span class="eyebrow">No cloud data yet</span>
        <h2>Connect AWS to start your first cost assessment.</h2>
        <p>CloudPrune will use read-only access to inspect spend, inventory, utilization signals, and safe optimization opportunities before it recommends any action.</p>
        <div class="empty-actions">
          <button data-action="connect" ${state.connectFormVisible ? "disabled" : ""}>Connect AWS</button>
          <a href="${basePath()}/demo">View demo data</a>
        </div>
        ${state.connectFormVisible ? renderAwsConnectForm(externalIdValue, principalArnValue, "", templateUrlValue) : ""}
      </section>
      <aside class="right-rail">
        <section class="panel compact empty-side-panel">
          <div class="panel-head"><div><span class="eyebrow">Recommendations</span><h2>Empty</h2></div></div>
          <div class="empty">No recommendations until a cloud account is connected.</div>
        </section>
        <section class="panel compact empty-side-panel">
          <div class="panel-head"><div><span class="eyebrow">Automation queue</span><h2>Disabled</h2></div></div>
          <div class="empty">Automation stays off until real findings are reviewed.</div>
        </section>
      </aside>
    </div>
  `;
}

function renderAwsRegionPicker() {
  const regions = selectedAwsRegions();
  const regionSummary = regions.length <= 4 ? regions.join(", ") : `${regions.length} regions`;
  const title = regions.join(", ");
  return `
    <div class="region-field">
      <span class="region-field-label">Region(s)</span>
      <div class="region-picker">
      <button type="button" data-action="toggle-region-picker" aria-expanded="${state.awsRegionPickerOpen ? "true" : "false"}" title="${escapeHtml(title)}">
        <strong>${escapeHtml(regionSummary)}</strong>
      </button>
      ${state.awsRegionPickerOpen ? `
        <div class="region-menu" role="group" aria-label="AWS regions to scan">
          ${AWS_REGIONS.map((region) => `
            <label class="region-choice">
              <input type="checkbox" data-region-choice="${region.id}" ${regions.includes(region.id) ? "checked" : ""}>
              <span><strong>${region.id}</strong><small>${escapeHtml(region.label)}</small></span>
            </label>
          `).join("")}
        </div>
      ` : ""}
      </div>
    </div>
  `;
}

function renderAwsConnectForm(externalId, principalArn, roleArn = "", templateUrl = "") {
  const accountId = state.awsConnectDraft.awsAccountId || awsAccountIdFromRoleArn(state.awsConnectDraft.roleArn || roleArn);
  const derivedRoleArn = state.awsConnectDraft.roleArn || roleArn || awsRoleArnForAccount(accountId);
  const draftAccountId = escapeHtml(accountId);
  const draftRoleArn = escapeHtml(derivedRoleArn);
  const draftExternalId = escapeHtml(state.awsConnectDraft.externalId || externalId);
  const escapedExternalId = escapeHtml(externalId);
  const escapedPrincipalArn = escapeHtml(principalArn);
  const launchUrl = cloudFormationLaunchUrl(externalId, principalArn, templateUrl);
  const hasPrincipal = /^arn:aws[a-z-]*:iam::\d{12}:/.test(principalArn);
  const canSave = Boolean(awsRoleArnForAccount(accountId));
  return `
    <form class="connect-form" data-connect-form="aws">
      <div>
        <span class="eyebrow">Assume role setup</span>
        <h3>Connect AWS with one field</h3>
        <p>CloudPrune generates the setup values. After the AWS stack finishes, paste the AccountId output below.</p>
      </div>
      <input name="externalId" type="hidden" value="${draftExternalId}" />
      <input name="roleArn" type="hidden" value="${draftRoleArn}" />
      <div class="setup-steps">
        <section class="setup-step">
          <span>1</span>
          <div>
            <strong>Create read-only AWS role</strong>
            <p>Launch the AWS stack with these parameters. The account ID appears later in the stack Outputs.</p>
            ${hasPrincipal
              ? `<a class="launch-stack-button" href="${escapeHtml(launchUrl)}" target="_blank" rel="noopener">Launch CloudFormation</a>`
              : `<button class="launch-stack-button" type="button" disabled>Launch CloudFormation</button>`}
            <div class="trust-policy">
              <span>CloudPrune principal</span>
              <code>${escapedPrincipalArn}</code>
              <span>External ID</span>
              <code>${escapedExternalId}</code>
              <span>Permissions</span>
              <code>Read-only cost, inventory, and utilization signals</code>
            </div>
          </div>
        </section>
        <section class="setup-step">
          <span>2</span>
          <div>
            <strong>Enter AWS account ID</strong>
            <label>AWS account ID<input name="awsAccountId" value="${draftAccountId}" inputmode="numeric" maxlength="12" placeholder="123456789012" /></label>
            ${renderAwsRegionPicker()}
            <p>Copy the <strong>AccountId</strong> value from the CloudFormation stack Outputs.</p>
            <p class="derived-role" data-derived-role>${draftRoleArn || "Role ARN will be derived automatically."}</p>
          </div>
        </section>
      </div>
      <p class="field-help">CloudPrune will save <code>arn:aws:iam::ACCOUNT_ID:role/CloudPruneReadOnlyRole</code>.</p>
      <div class="connect-actions">
        <button data-action="save-role" type="submit" ${canSave ? "" : "disabled"}>Save role</button>
        <button class="secondary-connect" data-action="cancel-connect" type="button">Cancel</button>
      </div>
      <p class="auth-message">${escapeHtml(state.connectMessage)}</p>
    </form>
  `;
}

function render() {
  const app = document.querySelector("#app");
  if (appRoute() === "admin") {
    renderAdminPage(app);
    return;
  }
  if (appRoute() === "auth") {
    if (hasSession()) {
      if (isAdminSession()) {
        location.href = `${basePath()}/admin`;
        return;
      }
      renderDemo(app, false);
      return;
    }
    renderAuth(app);
    return;
  }
  renderDemo(app, true);
}

function renderAuth(app) {
  const base = basePath();
  const url = new URL(location.href);
  const sso = url.searchParams.get("sso");
  const authCode = url.searchParams.get("authCode");
  if (authCode) {
    history.replaceState({}, "", `${base}/`);
    fetch(`${base}/api/auth/google/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: authCode }),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Google sign-in failed.");
        if (body.token) {
          localStorage.setItem("cloudprune.session", body.token);
          localStorage.removeItem("cloudprune.googleRegistration");
          return syncProfileFromDraft(body.token, registerDraft()).finally(() => {
            location.href = `${base}/`;
          });
        }
        if (body.googleRegistration) {
          localStorage.setItem("cloudprune.googleRegistration", body.googleRegistration);
          state.authMode = "google-register";
          render();
          return null;
        }
        throw new Error("Google sign-in failed.");
      })
      .catch((error) => {
        state.authMessage = error.message;
        render();
      });
    app.innerHTML = `
      <main class="auth-page">
        <section class="auth-card">
          <a class="auth-brand" href="${base}/" aria-label="CloudPrune">${ICONS.logo}<strong>CloudPrune</strong></a>
          <p class="auth-message">Completing Google sign-in...</p>
        </section>
      </main>
    `;
    return;
  }
  const ssoMessage = sso === "not_configured" ? "Google SSO is ready in the UI, but OAuth credentials are not configured on this server yet." : "";
  const googlePending = pendingGoogleRegistration();
  const isGoogleRegister = state.authMode === "google-register" && googlePending;
  const isRegister = state.authMode === "register";
  const draft = registerDraft();
  const googleName = escapeHtml(draft.name || googlePending?.payload.name || "");
  const googleEmail = escapeHtml(googlePending?.payload.email || "");
  const googleCompany = escapeHtml(draft.company || googlePending?.payload.companyName || "");
  const draftName = escapeHtml(draft.name || "");
  const draftCompany = escapeHtml(draft.company || "");
  const draftEmail = escapeHtml(draft.email || "");
  const isGoogleStartDisabled = isRegister && !isRegisterDraftComplete(draft);
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-visual">
        <a class="auth-brand" href="${base}/" aria-label="CloudPrune">${ICONS.logo}<strong>CloudPrune</strong></a>
        <div class="auth-hero">
          <span class="eyebrow">Cloud cost saving platform</span>
          <h1>Prune cloud waste before it reaches the bill.</h1>
          <p>Connect AWS first, inspect the savings plan, and move from dry-run analysis to controlled automation when the impact is clear.</p>
          <div class="auth-campaign-banner">Enjoy totally free until September 2026</div>
        </div>
        <div class="auth-signal-grid" aria-label="CloudPrune preview metrics">
          <article><span>Verified waste</span><strong>$89K</strong><em>monthly demo signal</em></article>
          <article><span>Risk scored</span><strong>42</strong><em>actions ready</em></article>
          <article><span>Guardrails</span><strong>Dry run</strong><em>default mode</em></article>
        </div>
      </section>
      <section class="auth-panel" aria-label="CloudPrune sign in">
        <div class="auth-panel-head">
          <span class="eyebrow">${isGoogleRegister ? "Complete registration" : isRegister ? "Create workspace" : "Welcome back"}</span>
          <h2>${isGoogleRegister ? "Confirm your CloudPrune workspace" : isRegister ? "Start with read-only savings analysis" : "Sign in to CloudPrune"}</h2>
        </div>
        ${isGoogleRegister ? "" : `<div class="auth-tabs" role="tablist">
          <button class="${isRegister ? "active" : ""}" data-auth-mode="register" type="button">Register</button>
          <button class="${!isRegister ? "active" : ""}" data-auth-mode="login" type="button">Login</button>
        </div>`}
        <form class="auth-form" data-auth-form="${state.authMode}">
          ${isGoogleRegister ? `
            <input name="googleRegistrationToken" type="hidden" value="${escapeHtml(googlePending.token)}" />
            <label>Full name<input name="name" autocomplete="name" value="${googleName}" required /></label>
            <label>Company<input name="company" autocomplete="organization" value="${googleCompany}" required /></label>
            <label>Email<input name="email" type="email" value="${googleEmail}" readonly /></label>
          ` : isRegister ? `
            <label>Full name<input name="name" autocomplete="name" value="${draftName}" required /></label>
            <label>Company<input name="company" autocomplete="organization" value="${draftCompany}" required /></label>
            <label>Email<input name="email" type="email" autocomplete="email" value="${draftEmail}" required /></label>
          ` : ""}
          ${isGoogleRegister ? "" : `
            <button class="google-button" data-action="google-start" type="button" ${isGoogleStartDisabled ? "disabled" : ""}>${ICONS.gcp}<span>Continue with Google</span></button>
            ${isRegister ? `<p class="auth-hint ${isGoogleStartDisabled ? "" : "hidden"}" data-google-hint>Fill full name, company, and email to continue with Google.</p>` : ""}
            <div class="auth-divider"><span>or</span></div>
          `}
          ${isGoogleRegister ? "" : `
            ${isRegister ? "" : `<label>Email or username<input name="email" type="text" autocomplete="username" required /></label>`}
            <label>Password<input name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" minlength="10" required /></label>
          `}
          <button type="submit">${isGoogleRegister ? "Create CloudPrune workspace" : isRegister ? "Create CloudPrune workspace" : "Login"}</button>
        </form>
        <a class="demo-link" href="${base}/demo">View live demo</a>
        <p class="auth-message">${state.authMessage || ssoMessage}</p>
      </section>
    </main>
  `;
}

function renderDemo(app, showDemoData = appRoute() === "demo") {
  if (!showDemoData && hasSession()) {
    refreshSession();
    loadWorkspace();
  }
  const base = basePath();
  const isDemo = showDemoData;
  const dashboardPath = isDemo ? `${base}/demo` : `${base}/`;
  const navPath = isDemo ? `${base}/demo/` : `${base}/`;
  const route = workspaceRoute();
  const sidebarAuthAction = hasSession()
    ? `<button class="sidebar-action" data-action="logout" type="button">Logout</button>`
    : `<a class="sidebar-action" href="${base}/">Login</a>`;
  const tenantLabel = escapeHtml(tenantName());
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="${dashboardPath}" aria-label="CloudPrune">${ICONS.logo}<strong>CloudPrune</strong></a>
        <nav>
          <div class="tenant-label"><span>Tenant</span><strong>${tenantLabel}</strong></div>
          <a class="${route === "dashboard" ? "active" : ""}" href="${dashboardPath}">${ICONS.dashboard}<span>Dashboard</span></a>
          <a class="${route === "recommendations" ? "active" : ""}" href="${navPath}recommendations">${ICONS.recs}<span>Recommendations</span></a>
          <a class="${route === "anomalies" ? "active" : ""}" href="${navPath}anomalies">${ICONS.alert}<span>Anomalies</span></a>
          <a class="${route === "automation" ? "active" : ""}" href="${navPath}automation">${ICONS.automation}<span>Automation</span></a>
          <a class="${route === "settings" ? "active" : ""}" href="${navPath}settings">${ICONS.settings}<span>Settings</span></a>
          <div class="nav-separator" aria-hidden="true"></div>
          ${sidebarAuthAction}
        </nav>
        <div class="connector-card">
          <span class="aws">${vendorBadge("aws", "AWS")}</span><span class="gcp">${vendorBadge("gcp", "GCP")}</span><span class="azure">${vendorBadge("azure", "Azure")}</span><span class="kubernetes">${vendorBadge("kubernetes", "K8s")}</span>
        </div>
      </aside>
      <main>
        <header class="topbar">
          <div>
            <span class="eyebrow">Cloud cost saving platform</span>
            <h1>Monitor spend and prune waste before it ships to the bill.</h1>
          </div>
          <div class="hero-mark">${ICONS.logo}</div>
          <div class="top-actions">
            <label class="toggle"><input type="checkbox" ${state.automation ? "checked" : ""} data-action="toggle-automation" /><span></span>Autopilot</label>
            <button class="feedback-button" data-action="open-feedback" type="button">Send feedback</button>
            <button data-action="connect" ${state.connectFormVisible ? "disabled" : ""}>Connect cloud</button>
          </div>
        </header>
        ${showDemoData ? `<div class="filters" role="group" aria-label="Cloud provider filter">${renderProviderFilter()}</div>
        ${renderKpis()}
        <div class="workspace">
          ${renderMainPanel()}
          <aside class="right-rail">
            <section class="panel compact">
              <div class="panel-head"><div><span class="eyebrow">Anomalies</span><h2>Today</h2></div></div>
              <div class="anomaly-list">${renderAnomalies()}</div>
            </section>
            <section class="panel compact">
              <div class="panel-head"><div><span class="eyebrow">Automation queue</span><h2>${state.automation ? "Active" : "Dry run"}</h2></div></div>
              <ol class="queue">${renderAutomationQueue()}</ol>
            </section>
          </aside>
        </div>` : `${renderEmptyKpis()}${renderEmptyWorkspace()}`}
      </main>
    </div>
    ${renderFeedbackDialog()}
  `;
}

document.addEventListener("click", async (event) => {
  const connectButton = event.target.closest("[data-action='connect']");
  if (connectButton) {
    if (connectButton.disabled) return;
    state.connectFormVisible = true;
    state.connectMessage = "";
    state.awsConnectDraft = {
      roleArn: state.workspace?.connections?.aws?.roleArn || state.awsConnectDraft.roleArn || "",
      externalId: state.workspace?.connections?.aws?.externalId || state.workspace?.awsSetup?.externalId || state.awsConnectDraft.externalId || `cloudprune-${sessionAccountId()}`,
      regions: savedAwsConnectionRegions(),
    };
    state.awsScanRegions = savedAwsConnectionRegions();
    saveAwsScanRegions();
    render();
    return;
  }
  const scanButton = event.target.closest("[data-action='scan-aws']");
  if (scanButton) {
    if (scanButton.disabled) return;
    scanAws();
    return;
  }
  const stopScanButton = event.target.closest("[data-action='stop-scan']");
  if (stopScanButton) {
    if (stopScanButton.disabled) return;
    stopAwsScan();
    return;
  }
  const regionButton = event.target.closest("[data-action='toggle-region-picker']");
  if (regionButton) {
    if (regionButton.disabled) return;
    state.awsRegionPickerOpen = !state.awsRegionPickerOpen;
    render();
    return;
  }
  const cancelConnect = event.target.closest("[data-action='cancel-connect']");
  if (cancelConnect) {
    state.connectFormVisible = false;
    state.connectMessage = "";
    render();
    return;
  }
  const googleStartButton = event.target.closest("[data-action='google-start']");
  if (googleStartButton) {
    const form = googleStartButton.closest("[data-auth-form]");
    if (form?.dataset.authForm === "register") {
      saveRegisterDraftFromForm(form);
      if (!isRegisterDraftComplete(registerDraft())) {
        refreshGoogleStart(form);
        state.authMessage = "Fill full name, company, and email before continuing with Google.";
        render();
        return;
      }
    }
    location.href = `${basePath()}/api/auth/google/start`;
    return;
  }
  const logoutButton = event.target.closest("[data-action='logout']");
  if (logoutButton) {
    signOut();
    return;
  }
  const adminTenantUsersButton = event.target.closest("[data-action='toggle-admin-tenant-users']");
  if (adminTenantUsersButton) {
    const tenantId = adminTenantUsersButton.dataset.tenantId;
    state.adminExpandedTenantId = state.adminExpandedTenantId === tenantId ? "" : tenantId;
    render();
    if (state.adminExpandedTenantId) loadAdminTenantUsers(tenantId);
    return;
  }
  const spoofButton = event.target.closest("[data-action='admin-spoof-user']");
  if (spoofButton) {
    if (spoofButton.disabled) return;
    const userId = spoofButton.dataset.userId;
    state.adminActionUserId = userId;
    state.adminMessage = "Opening user session...";
    render();
    try {
      const response = await fetch(`${basePath()}/api/admin/users/${encodeURIComponent(userId)}/spoof`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not spoof user.");
      localStorage.setItem("cloudprune.session", body.token);
      state.workspace = null;
      state.workspaceLoadStarted = false;
      location.href = `${basePath()}/`;
    } catch (error) {
      state.adminMessage = error.message;
      state.adminActionUserId = "";
      render();
    }
    return;
  }
  const openFeedback = event.target.closest("[data-action='open-feedback']");
  if (openFeedback) {
    state.feedbackOpen = true;
    state.feedbackMessage = hasSession() ? "" : "Login or register before sending feedback.";
    render();
    return;
  }
  const closeFeedback = event.target.closest("[data-action='close-feedback']");
  if (closeFeedback) {
    if (state.feedbackSubmitting) return;
    state.feedbackOpen = false;
    state.feedbackMessage = "";
    render();
    return;
  }
  const stageButton = event.target.closest("[data-action='stage']");
  if (stageButton) {
    if (stageButton.disabled) return;
    toggleRecommendationAction(stageButton.dataset.recommendationId);
    render();
    return;
  }
  const closeDemoAction = event.target.closest("[data-action='close-demo-action']");
  if (closeDemoAction) {
    state.activeRecommendationActionId = "";
    render();
    return;
  }
  const cloudButton = event.target.closest("[data-cloud]");
  if (cloudButton) {
    state.cloud = cloudButton.dataset.cloud;
    state.activeRecommendationActionId = "";
    render();
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    state.activeRecommendationActionId = "";
    render();
    return;
  }
  if (state.awsRegionPickerOpen && !event.target.closest(".region-picker")) {
    state.awsRegionPickerOpen = false;
    render();
  }
});

document.addEventListener("change", (event) => {
  const regionChoice = event.target.closest("[data-region-choice]");
  if (regionChoice) {
    toggleAwsScanRegion(regionChoice.dataset.regionChoice, regionChoice.checked);
    state.awsRegionPickerOpen = true;
    render();
    return;
  }
  if (event.target.matches("[data-action='toggle-automation']")) {
    state.automation = event.target.checked;
    render();
  }
  const connectForm = event.target.closest("[data-connect-form='aws']");
  if (connectForm) captureAwsConnectDraft(connectForm);
});

function handleTextInput(event) {
  const connectForm = event.target.closest("[data-connect-form='aws']");
  if (connectForm) {
    const draft = captureAwsConnectDraft(connectForm);
    const roleInput = connectForm.querySelector("[name='roleArn']");
    if (roleInput) roleInput.value = draft.roleArn;
    const accountInput = connectForm.querySelector("[name='awsAccountId']");
    if (accountInput && accountInput.value !== draft.awsAccountId) accountInput.value = draft.awsAccountId;
    const derivedRole = connectForm.querySelector("[data-derived-role]");
    if (derivedRole) derivedRole.textContent = draft.roleArn || "Role ARN will be derived automatically.";
    const saveButton = connectForm.querySelector("[data-action='save-role']");
    if (saveButton) saveButton.disabled = !draft.roleArn;
    return;
  }
  const form = event.target.closest("[data-auth-form='register']");
  if (form) refreshGoogleStart(form);
}

document.addEventListener("input", handleTextInput);
document.addEventListener("keyup", handleTextInput);
document.addEventListener("paste", (event) => {
  setTimeout(() => handleTextInput(event), 0);
});

document.addEventListener("submit", async (event) => {
  const adminResetForm = event.target.closest("[data-admin-reset-form]");
  if (adminResetForm) {
    event.preventDefault();
    const userId = adminResetForm.dataset.adminResetForm;
    const password = adminResetForm.elements.password.value;
    state.adminActionUserId = userId;
    state.adminMessage = "Resetting password...";
    render();
    try {
      const response = await fetch(`${basePath()}/api/admin/users/${encodeURIComponent(userId)}/password`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not reset password.");
      state.adminMessage = `Password reset for ${body.user?.email || "user"}.`;
      if (state.adminExpandedTenantId) {
        state.adminTenantUsers = { ...state.adminTenantUsers, [state.adminExpandedTenantId]: null };
        delete state.adminTenantUsers[state.adminExpandedTenantId];
        loadAdminTenantUsers(state.adminExpandedTenantId);
      }
    } catch (error) {
      state.adminMessage = error.message;
    }
    state.adminActionUserId = "";
    render();
    return;
  }
  const feedbackForm = event.target.closest("[data-feedback-form]");
  if (feedbackForm) {
    event.preventDefault();
    if (!hasSession()) {
      state.feedbackMessage = "Login or register before sending feedback.";
      render();
      return;
    }
    state.feedbackSubmitting = true;
    state.feedbackMessage = "Sending feedback...";
    render();
    try {
      const attachment = await readAttachment(feedbackForm.elements.attachment?.files?.[0]);
      const response = await fetch(`${basePath()}/api/feedback`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: feedbackForm.elements.type.value,
          details: feedbackForm.elements.details.value,
          attachment,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not send feedback.");
      state.feedbackMessage = "Feedback sent. Thank you.";
      state.feedbackOpen = false;
    } catch (error) {
      state.feedbackMessage = error.message;
    }
    state.feedbackSubmitting = false;
    render();
    return;
  }
  const connectForm = event.target.closest("[data-connect-form='aws']");
  if (connectForm) {
    event.preventDefault();
    const payload = captureAwsConnectDraft(connectForm);
    if (!payload.roleArn) return;
    state.connectMessage = "Saving AWS role...";
    render();
    try {
      const response = await fetch(`${basePath()}/api/cloud-connections/aws`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save AWS role.");
      state.workspace = {
        ...(state.workspace || {}),
        connections: { ...((state.workspace || {}).connections || {}), aws: body.connection },
      };
      state.awsScanRegions = savedAwsConnectionRegions(body.connection);
      saveAwsScanRegions();
      state.awsConnectDraft = { roleArn: body.connection.roleArn, externalId: body.connection.externalId, regions: state.awsScanRegions };
      state.connectFormVisible = false;
      state.connectMessage = "";
      render();
    } catch (error) {
      state.connectMessage = error.message;
      render();
    }
    return;
  }
  const form = event.target.closest("[data-auth-form]");
  if (!form) return;
  event.preventDefault();
  const mode = form.dataset.authForm;
  if (mode === "register") saveRegisterDraftFromForm(form);
  const payload = Object.fromEntries(new FormData(form).entries());
  state.authMessage = mode === "login" ? "Signing in..." : "Creating workspace...";
  render();
  try {
    const endpoint = mode === "google-register"
      ? "complete-google-registration"
      : mode === "register" ? "register" : "login";
    const response = await fetch(`${basePath()}/api/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "CloudPrune authentication failed.");
    localStorage.setItem("cloudprune.session", body.token);
    localStorage.removeItem("cloudprune.googleRegistration");
    localStorage.removeItem(registerDraftKey);
    location.href = body.user?.role === "admin" ? `${basePath()}/admin` : `${basePath()}/`;
  } catch (error) {
    state.authMessage = error.message;
    render();
  }
});

document.addEventListener("click", (event) => {
  const authMode = event.target.closest("[data-auth-mode]");
  if (!authMode) return;
  state.authMode = authMode.dataset.authMode;
  state.authMessage = "";
  localStorage.removeItem("cloudprune.googleRegistration");
  render();
});

render();
