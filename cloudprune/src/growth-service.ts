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

  const [eventTotals, intentRows, resourceRows, recentRows] = await Promise.all([
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
  ]);

  return {
    eventTotals: eventTotals.rows.map((row: Record<string, any>) => ({ eventType: row.event_type, events: row.events })),
    intents: intentRows.rows.map((row: Record<string, any>) => ({
      intent: row.intent,
      events: row.events,
      pageViews: row.page_views,
      ctaClicks: row.cta_clicks,
      authSuccesses: row.auth_successes,
      awsConnects: row.aws_connects,
      scans: row.scans,
      recommendationViews: row.recommendation_views,
    })),
    resources: resourceRows.rows.map((row: Record<string, any>) => ({
      resource: row.resource,
      title: row.title,
      pageViews: row.page_views,
      ctaClicks: row.cta_clicks,
      events: row.events,
    })),
    recentEvents: recentRows.rows.map(publicGrowthEvent),
  };
}

export { adminGrowthOverview, recordGrowthEvent };
