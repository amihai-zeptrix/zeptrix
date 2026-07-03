const { execFile } = require("node:child_process");
const { adminSessionVersion, bearerToken, verifySession } = require("./auth");
const { auditEmailFrom, auditEmailSubject, auditEmailTo, awsCliPath, awsScanRegion } = require("./config");
const { pool } = require("./db");
const { jsonb } = require("./http-utils");

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

interface AuditActor {
  accountId?: string | null;
  userId?: string | null;
  email?: string | null;
  role?: string | null;
}

interface AuditEventInput {
  req?: RequestLike | null;
  actor?: AuditActor | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

const auditOwnerEmail = "amihaih@gmail.com";

function requestIp(req?: RequestLike | null): string | null {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req?.headers?.["x-real-ip"] || req?.socket?.remoteAddress || null;
}

function requestUserAgent(req?: RequestLike | null): string | null {
  const userAgent = req?.headers?.["user-agent"];
  return userAgent ? String(userAgent).slice(0, 500) : null;
}

function adminSession(req: RequestLike) {
  const session = verifySession(bearerToken(req));
  if (!session || session.role !== "admin") throw new Error("CloudPrune admin access is required.");
  if (session.adminPasswordVersion !== adminSessionVersion()) throw new Error("CloudPrune admin session is invalid.");
  return session;
}

function auditEmailBody(event: AuditEventInput): string {
  return [
    "CloudPrune audit log event",
    "",
    `Action: ${event.action}`,
    `Actor: ${event.actor?.email || "unknown"}`,
    `Role: ${event.actor?.role || "user"}`,
    `Account: ${event.actor?.accountId || "-"}`,
    `User: ${event.actor?.userId || "-"}`,
    `Target: ${event.targetType || "-"} ${event.targetId || ""}`.trim(),
    `Summary: ${event.summary || "-"}`,
    `IP: ${requestIp(event.req) || "-"}`,
    `User agent: ${requestUserAgent(event.req) || "-"}`,
    `Metadata: ${JSON.stringify(event.metadata || {}, null, 2)}`,
    `Created at: ${new Date().toISOString()}`,
  ].join("\n");
}

function sendAuditNotification(event: AuditEventInput): void {
  const actorEmail = String(event.actor?.email || "").trim().toLowerCase();
  if (!auditEmailTo || !auditEmailFrom || actorEmail === auditOwnerEmail) return;
  const payload = JSON.stringify({
    FromEmailAddress: auditEmailFrom,
    Destination: { ToAddresses: [auditEmailTo] },
    Content: {
      Simple: {
        Subject: { Data: auditEmailSubject, Charset: "UTF-8" },
        Body: { Text: { Data: auditEmailBody(event), Charset: "UTF-8" } },
      },
    },
  });
  execFile(awsCliPath, ["sesv2", "send-email", "--region", awsScanRegion, "--cli-input-json", payload], { timeout: 15000 }, (error: Error | null) => {
    if (error) console.error("CloudPrune audit notification failed", error.message);
  });
}

async function recordAuditEvent({ req = null, actor = null, action, targetType = null, targetId = null, summary = null, metadata = null }: AuditEventInput): Promise<void> {
  if (!pool) return;
  const event = { req, actor, action, targetType, targetId, summary, metadata };
  await pool.query(
    `insert into cloudprune_audit_log
       (account_id, user_id, actor_email, actor_role, action, target_type, target_id, summary, metadata, ip_address, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
    [
      actor?.accountId || null,
      actor?.userId || null,
      actor?.email || null,
      actor?.role || "user",
      action,
      targetType,
      targetId,
      summary,
      jsonb(metadata || {}),
      requestIp(req),
      requestUserAgent(req),
    ]
  );
  sendAuditNotification(event);
}

function publicAuditLog(row: Record<string, any>) {
  return {
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summary: row.summary,
    metadata: row.metadata || {},
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    tenant: row.company_name,
    user: row.user_name,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

async function adminAuditLog(req: RequestLike) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const admin = adminSession(req);
  await recordAuditEvent({
    req,
    actor: { email: admin.email, role: "admin" },
    action: "admin_audit_log_viewed",
    targetType: "audit_log",
    summary: "Admin viewed audit log",
  });
  const result = await pool.query(
    `select l.id, l.action, l.target_type, l.target_id, l.summary, l.metadata, l.actor_email, l.actor_role,
            l.ip_address, l.user_agent, l.created_at, a.company_name, u.name as user_name
     from cloudprune_audit_log l
     left join cloudprune_accounts a on a.id=l.account_id
     left join cloudprune_users u on u.id=l.user_id
     order by l.created_at desc
     limit 500`
  );
  return { auditLog: result.rows.map(publicAuditLog) };
}

export {
  adminAuditLog,
  adminSession,
  recordAuditEvent,
};
