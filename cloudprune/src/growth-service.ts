const { bearerToken, verifySession } = require("./auth");
const { adminSession, recordAuditEvent } = require("./audit-service");
const { jsonb } = require("./http-utils");
const { pool } = require("./db");

interface RequestLike {
  headers: {
    authorization?: string;
    "user-agent"?: string;
    "x-forwarded-for"?: string;
    "x-real-ip"?: string;
  };
  socket?: {
    remoteAddress?: string;
  };
}

interface GrowthEventPayload {
  eventType?: unknown;
  intent?: unknown;
  source?: unknown;
  resourceSlug?: unknown;
  resourceTitle?: unknown;
  path?: unknown;
  url?: unknown;
  metadata?: unknown;
}

interface GrowthExperimentPayload {
  name?: unknown;
  hypothesis?: unknown;
  targetType?: unknown;
  target?: unknown;
  status?: unknown;
}

const allowedEvents = new Set([
  "resource_page_view",
  "resource_cta_click",
  "auth_page_view",
  "registration_start",
  "login_start",
  "google_sso_start",
  "auth_success",
  "aws_connect_opened",
  "aws_connect_saved",
  "aws_scan_started",
  "recommendation_viewed",
]);

function cleanText(value: unknown, maxLength = 160): string {
  return String(value || "").trim().slice(0, maxLength);
}

function requestIp(req: RequestLike): string {
  const forwarded = cleanText(req.headers["x-forwarded-for"], 120).split(",")[0].trim();
  return forwarded || cleanText(req.headers["x-real-ip"], 120) || cleanText(req.socket?.remoteAddress, 120);
}

async function recordGrowthEvent(req: RequestLike, payload: GrowthEventPayload) {
  const eventType = cleanText(payload.eventType, 80);
  if (!allowedEvents.has(eventType)) throw new Error("Choose a valid growth event type.");
  if (!pool) return { recorded: false };

  const session = verifySession(bearerToken(req));
  const metadata = {
    ...(payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : {}),
    ...(payload.resourceTitle ? { resourceTitle: cleanText(payload.resourceTitle, 240) } : {}),
    ...(payload.url ? { url: cleanText(payload.url, 600) } : {}),
  };

  await pool.query(
    `insert into cloudprune_growth_events
       (account_id, user_id, actor_email, event_type, intent, source, resource_slug, path, metadata, ip_address, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
    [
      session?.accountId || null,
      session?.role === "admin" ? null : session?.sub || null,
      session?.email || null,
      eventType,
      cleanText(payload.intent, 80) || null,
      cleanText(payload.source, 160) || null,
      cleanText(payload.resourceSlug, 180) || null,
      cleanText(payload.path, 600) || null,
      jsonb(metadata),
      requestIp(req) || null,
      cleanText(req.headers["user-agent"], 600) || null,
    ]
  );
  return { recorded: true };
}

function publicGrowthEvent(row: Record<string, any>) {
  return {
    id: row.id,
    eventType: row.event_type,
    intent: row.intent,
    source: row.source,
    resourceSlug: row.resource_slug,
    path: row.path,
    metadata: row.metadata || {},
    actorEmail: row.actor_email,
    tenant: row.company_name,
    user: row.user_name,
    createdAt: row.created_at,
  };
}

function publicGrowthExperiment(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    hypothesis: row.hypothesis,
    targetType: row.target_type,
    target: row.target,
    status: row.status,
    createdBy: row.created_by,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function conversionRate(numerator: unknown, denominator: unknown): number {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  return bottom > 0 ? Math.round((top / bottom) * 100) : 0;
}

function growthInsights(intents: Record<string, any>[], resources: Record<string, any>[]) {
  const insights: Record<string, unknown>[] = [];
  for (const row of intents) {
    const intent = row.intent;
    const pageViews = Number(row.page_views || 0);
    const ctaClicks = Number(row.cta_clicks || 0);
    const authSuccesses = Number(row.auth_successes || 0);
    const awsConnects = Number(row.aws_connects || 0);
    const scans = Number(row.scans || 0);
    const ctaRate = conversionRate(ctaClicks, pageViews);
    const authRate = conversionRate(authSuccesses, ctaClicks);
    const scanRate = conversionRate(scans, authSuccesses || ctaClicks);
    if (pageViews >= 10 && ctaRate < 8) {
      insights.push({
        severity: "high",
        type: "weak_cta",
        title: `${intent} gets traffic but low CTA clicks`,
        detail: `${pageViews} views, ${ctaClicks} CTA clicks, ${ctaRate}% view-to-click rate.`,
        action: "Improve CTA copy, move the CTA higher, and make the page promise match the search pain.",
        target: intent,
      });
    }
    if (ctaClicks >= 5 && authRate < 20) {
      insights.push({
        severity: "medium",
        type: "auth_friction",
        title: `${intent} clicks are not becoming users`,
        detail: `${ctaClicks} CTA clicks, ${authSuccesses} auth successes, ${authRate}% click-to-auth rate.`,
        action: "Review registration copy, Google SSO flow, and whether the intent card explains the next step clearly.",
        target: intent,
      });
    }
    if (authSuccesses >= 2 && awsConnects === 0) {
      insights.push({
        severity: "high",
        type: "connect_friction",
        title: `${intent} users are not connecting AWS`,
        detail: `${authSuccesses} auth successes, ${awsConnects} AWS connections saved.`,
        action: "Review AWS onboarding friction, CloudFormation copy, and whether the scan focus reassures read-only access.",
        target: intent,
      });
    }
    if ((authSuccesses || ctaClicks) >= 2 && scans === 0) {
      insights.push({
        severity: "medium",
        type: "scan_friction",
        title: `${intent} has no scans started`,
        detail: `${authSuccesses} auth successes and ${ctaClicks} CTA clicks, but no scans.`,
        action: "Make the scan button more prominent after AWS connect and explain expected scan time.",
        target: intent,
      });
    }
    if (pageViews >= 5 && ctaRate >= 20 && scanRate >= 25) {
      insights.push({
        severity: "low",
        type: "promote_winner",
        title: `${intent} is converting well`,
        detail: `${ctaRate}% view-to-click and ${scanRate}% downstream scan conversion.`,
        action: "Promote this page, create a follow-up comparison section, and use the same CTA pattern on weaker pages.",
        target: intent,
      });
    }
  }
  for (const row of resources) {
    const views = Number(row.page_views || 0);
    const clicks = Number(row.cta_clicks || 0);
    const ctr = conversionRate(clicks, views);
    if (views >= 20 && ctr < 5) {
      insights.push({
        severity: "high",
        type: "resource_cta_underperforming",
        title: `${row.resource} has weak page CTR`,
        detail: `${views} views, ${clicks} CTA clicks, ${ctr}% CTR.`,
        action: "Rewrite the first-screen CTA and add a concrete evidence promise near the first paragraph.",
        target: row.resource,
      });
    }
  }
  return insights.sort((a, b) => {
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (severityOrder[String(a.severity)] ?? 3) - (severityOrder[String(b.severity)] ?? 3);
  }).slice(0, 12);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows: unknown[][]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

async function adminGrowthOverview(req: RequestLike) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const admin = adminSession(req);
  await recordAuditEvent({
    req,
    actor: { email: admin.email, role: "admin" },
    action: "admin_growth_viewed",
    targetType: "growth_events",
    summary: "Admin viewed growth funnel",
  });

  const [eventTotals, intentRows, resourceRows, recentRows, experimentRows] = await Promise.all([
    pool.query(
      `select event_type, count(*)::int as events
       from cloudprune_growth_events
       group by event_type
       order by events desc, event_type asc`
    ),
    pool.query(
      `select coalesce(intent, 'unknown') as intent,
              count(*)::int as events,
              count(*) filter (where event_type='resource_page_view')::int as page_views,
              count(*) filter (where event_type='resource_cta_click')::int as cta_clicks,
              count(*) filter (where event_type='auth_success')::int as auth_successes,
              count(*) filter (where event_type='aws_connect_saved')::int as aws_connects,
              count(*) filter (where event_type='aws_scan_started')::int as scans,
              count(*) filter (where event_type='recommendation_viewed')::int as recommendation_views
       from cloudprune_growth_events
       group by coalesce(intent, 'unknown')
       order by events desc, intent asc
       limit 50`
    ),
    pool.query(
      `select coalesce(resource_slug, source, path, 'unknown') as resource,
              max(metadata->>'resourceTitle') as title,
              count(*) filter (where event_type='resource_page_view')::int as page_views,
              count(*) filter (where event_type='resource_cta_click')::int as cta_clicks,
              count(*)::int as events
       from cloudprune_growth_events
       where event_type in ('resource_page_view', 'resource_cta_click')
       group by coalesce(resource_slug, source, path, 'unknown')
       order by page_views desc, cta_clicks desc, resource asc
       limit 100`
    ),
    pool.query(
      `select e.id, e.event_type, e.intent, e.source, e.resource_slug, e.path, e.metadata,
              e.actor_email, e.created_at, a.company_name, u.name as user_name
       from cloudprune_growth_events e
       left join cloudprune_accounts a on a.id=e.account_id
       left join cloudprune_users u on u.id=e.user_id
       order by e.created_at desc
       limit 200`
    ),
    pool.query(
      `select id, name, hypothesis, target_type, target, status, created_by, started_at, ended_at, created_at, updated_at
       from cloudprune_growth_experiments
       order by case status when 'active' then 0 when 'planned' then 1 when 'paused' then 2 else 3 end,
                created_at desc
       limit 100`
    ),
  ]);

  const intentData = intentRows.rows.map((row: Record<string, any>) => ({
    intent: row.intent,
    events: row.events,
    pageViews: row.page_views,
    ctaClicks: row.cta_clicks,
    authSuccesses: row.auth_successes,
    awsConnects: row.aws_connects,
    scans: row.scans,
    recommendationViews: row.recommendation_views,
    ctaRate: conversionRate(row.cta_clicks, row.page_views),
    authRate: conversionRate(row.auth_successes, row.cta_clicks),
    scanRate: conversionRate(row.scans, row.auth_successes || row.cta_clicks),
  }));
  const resourceData = resourceRows.rows.map((row: Record<string, any>) => ({
    resource: row.resource,
    title: row.title,
    pageViews: row.page_views,
    ctaClicks: row.cta_clicks,
    events: row.events,
    ctr: conversionRate(row.cta_clicks, row.page_views),
  }));
  return {
    eventTotals: eventTotals.rows.map((row: Record<string, any>) => ({ eventType: row.event_type, events: row.events })),
    insights: growthInsights(intentRows.rows, resourceRows.rows),
    intents: intentData,
    resources: resourceData,
    experiments: experimentRows.rows.map(publicGrowthExperiment),
    recentEvents: recentRows.rows.map(publicGrowthEvent),
  };
}

async function createGrowthExperiment(req: RequestLike, payload: GrowthExperimentPayload) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const admin = adminSession(req);
  const name = cleanText(payload.name, 140);
  const hypothesis = cleanText(payload.hypothesis, 600);
  const targetType = cleanText(payload.targetType, 40) || "resource";
  const target = cleanText(payload.target, 220);
  const status = cleanText(payload.status, 40) || "active";
  const allowedTargetTypes = new Set(["resource", "intent", "onboarding", "other"]);
  const allowedStatuses = new Set(["planned", "active", "paused", "completed"]);
  if (!name) throw new Error("Experiment name is required.");
  if (!hypothesis) throw new Error("Experiment hypothesis is required.");
  if (!target) throw new Error("Experiment target is required.");
  if (!allowedTargetTypes.has(targetType)) throw new Error("Choose a valid experiment target type.");
  if (!allowedStatuses.has(status)) throw new Error("Choose a valid experiment status.");

  const result = await pool.query(
    `insert into cloudprune_growth_experiments (name, hypothesis, target_type, target, status, created_by)
     values ($1,$2,$3,$4,$5,$6)
     returning id, name, hypothesis, target_type, target, status, created_by, started_at, ended_at, created_at, updated_at`,
    [name, hypothesis, targetType, target, status, admin.email]
  );
  await recordAuditEvent({
    req,
    actor: { email: admin.email, role: "admin" },
    action: "growth_experiment_created",
    targetType: "growth_experiment",
    targetId: result.rows[0].id,
    summary: `Created growth experiment: ${name}`,
    metadata: { targetType, target, status },
  });
  return publicGrowthExperiment(result.rows[0]);
}

async function adminGrowthCsv(req: RequestLike, kind: string) {
  const overview = await adminGrowthOverview(req);
  if (kind === "events") {
    return csv([
      ["createdAt", "eventType", "intent", "source", "resourceSlug", "actorEmail", "tenant", "path"],
      ...overview.recentEvents.map((event: Record<string, any>) => [
        event.createdAt,
        event.eventType,
        event.intent,
        event.source,
        event.resourceSlug,
        event.actorEmail,
        event.tenant,
        event.path,
      ]),
    ]);
  }
  return csv([
    ["type", "name", "events", "pageViews", "ctaClicks", "authSuccesses", "awsConnects", "scans", "recommendationViews", "rate"],
    ...overview.intents.map((item: Record<string, any>) => [
      "intent",
      item.intent,
      item.events,
      item.pageViews,
      item.ctaClicks,
      item.authSuccesses,
      item.awsConnects,
      item.scans,
      item.recommendationViews,
      `${item.ctaRate}%`,
    ]),
    ...overview.resources.map((item: Record<string, any>) => [
      "resource",
      item.resource,
      item.events,
      item.pageViews,
      item.ctaClicks,
      "",
      "",
      "",
      "",
      `${item.ctr}%`,
    ]),
  ]);
}

export { adminGrowthCsv, adminGrowthOverview, createGrowthExperiment, recordGrowthEvent };
