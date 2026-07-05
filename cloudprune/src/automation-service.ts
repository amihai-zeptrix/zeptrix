const { pool } = require("./db");
const { jsonb } = require("./http-utils");
const { recordAuthEvent, userFromSession } = require("./user-service");

interface RequestLike {
  headers: {
    authorization?: string;
  };
}

interface AutomationPayload {
  recommendationId?: unknown;
}

function recommendationKey(item: Record<string, any>): string {
  return String(item.id || item.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function publicAutomationPlan(row: Record<string, any>) {
  return {
    id: row.id,
    recommendationId: row.recommendation_id,
    title: row.title,
    status: row.status,
    scanId: row.aws_scan_id,
    plan: row.plan_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function automationPlanFromRecommendation(recommendation: Record<string, any>, scan: Record<string, any>) {
  const risk = recommendation.risk || recommendation.operationalRisk || "Medium";
  const effort = recommendation.effort || "Medium";
  const impact = Number(recommendation.impact || recommendation.estimatedMonthlySavings || 0);
  return {
    mode: "dry_run",
    provider: "aws",
    risk,
    effort,
    estimatedMonthlySavings: impact,
    summary: "Dry-run only. No AWS resources are changed by this plan.",
    workflow: [
      "Inspect recommendation evidence and affected resources.",
      "Confirm owner, environment, downtime risk, and protected tags.",
      "Prepare reversible commands or tickets for the first small batch.",
      "Request approval before any execution-capable automation is enabled.",
      "Validate the next scan and spend trend after the approved change.",
    ],
    guardrails: [
      "No execution from dry-run plans.",
      "Approval required before any resource modification.",
      "Audit log records plan creation and future state transitions.",
      "Rollback and validation steps must be present before execution.",
    ],
    rollbackPath: recommendation.rollbackPath || "Revert the approved resource-level change and re-run the scan.",
    validationWindow: recommendation.validationWindow || "Re-run CloudPrune after 24-72 hours and compare cost and health signals.",
    impactAnalysis: recommendation.impactAnalysis || recommendation.detail || "",
    minimizeImpact: recommendation.minimizeImpact || "Start with a small reversible batch and monitor workload health before expanding.",
    resources: recommendation.resources || [],
    statistics: recommendation.statistics || {},
    sourceScan: {
      id: scan.id,
      awsAccountId: scan.provider_account_id,
      monthlyCost: Number(scan.monthly_cost || 0),
      status: scan.status,
    },
  };
}

async function latestScanWithRecommendations(accountId: string) {
  const result = await pool.query(
    `select id, provider_account_id, status, monthly_cost, scan_json, created_at, updated_at
     from cloudprune_aws_scans
     where account_id=$1
     order by created_at desc
     limit 1`,
    [accountId]
  );
  return result.rows[0] || null;
}

async function listAutomationPlans(req: RequestLike) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const user = await userFromSession(req);
  const result = await pool.query(
    `select id, recommendation_id, title, status, aws_scan_id, plan_json, created_at, updated_at
     from cloudprune_automation_plans
     where account_id=$1
     order by created_at desc
     limit 100`,
    [user.account_id]
  );
  return { automationPlans: result.rows.map(publicAutomationPlan) };
}

async function createAutomationPlan(req: RequestLike, payload: AutomationPayload) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const user = await userFromSession(req);
  const recommendationId = String(payload.recommendationId || "").trim();
  if (!recommendationId) throw new Error("Recommendation ID is required.");
  const scan = await latestScanWithRecommendations(user.account_id);
  const recommendations = scan?.scan_json?.recommendations || [];
  const recommendation = recommendations.find((item) => recommendationKey(item) === recommendationId || item.id === recommendationId);
  if (!recommendation) throw new Error("Recommendation was not found in the latest AWS scan.");
  const planJson = automationPlanFromRecommendation(recommendation, scan);
  const result = await pool.query(
    `insert into cloudprune_automation_plans
       (account_id, user_id, aws_scan_id, recommendation_id, title, status, plan_json)
     values ($1,$2,$3,$4,$5,'dry_run',$6::jsonb)
     on conflict (account_id, aws_scan_id, recommendation_id) do update set
       user_id=excluded.user_id,
       title=excluded.title,
       status='dry_run',
       plan_json=excluded.plan_json,
       updated_at=now()
     returning id, recommendation_id, title, status, aws_scan_id, plan_json, created_at, updated_at`,
    [user.account_id, user.id, scan.id, recommendationId, recommendation.title, jsonb(planJson)]
  );
  await recordAuthEvent({
    req,
    userId: user.id,
    accountId: user.account_id,
    email: user.email,
    eventType: "automation_plan_created",
    detail: `Dry-run automation plan created for ${recommendation.title}`,
    targetType: "automation_plan",
    targetId: result.rows[0].id,
    metadata: { recommendationId, scanId: scan.id, mode: "dry_run" },
  });
  return publicAutomationPlan(result.rows[0]);
}

export {
  createAutomationPlan,
  listAutomationPlans,
  publicAutomationPlan,
};
