const { bearerToken, verifySession } = require("./auth");
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

export { recordGrowthEvent };
