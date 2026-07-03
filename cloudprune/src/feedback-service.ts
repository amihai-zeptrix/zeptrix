const { adminSessionVersion, bearerToken, hashPassword, publicUser, signSession, verifySession } = require("./auth");
const { pool } = require("./db");
const { recordAuthEvent, userFromSession } = require("./user-service");

interface RequestLike {
  headers: {
    authorization?: string;
  };
}

interface AttachmentPayload {
  name?: unknown;
  type?: unknown;
  size?: unknown;
  contentBase64?: unknown;
}

interface FeedbackPayload {
  type?: unknown;
  details?: unknown;
  attachment?: AttachmentPayload | null;
}

const feedbackTypes = new Set(["Issue", "Feature request", "Question", "Billing", "Other"]);

function requireAdmin(req: RequestLike) {
  const session = verifySession(bearerToken(req));
  if (!session || session.role !== "admin") throw new Error("CloudPrune admin access is required.");
  if (session.adminPasswordVersion !== adminSessionVersion()) throw new Error("CloudPrune admin session is invalid.");
  return session;
}

function publicFeedback(row: Record<string, any>) {
  return {
    id: row.id,
    type: row.report_type,
    details: row.details,
    attachment: row.attachment_name ? {
      name: row.attachment_name,
      type: row.attachment_type,
      size: row.attachment_size,
    } : null,
    tenant: row.company_name,
    user: row.user_name,
    email: row.email,
    createdAt: row.created_at,
  };
}

function publicAdminUser(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    provider: row.provider,
    hasPassword: Boolean(row.password_hash),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

async function submitFeedback(req: RequestLike, payload: FeedbackPayload) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const user = await userFromSession(req);
  const type = String(payload.type || "").trim();
  const details = String(payload.details || "").trim();
  if (!feedbackTypes.has(type)) throw new Error("Choose a valid feedback type.");
  if (!details) throw new Error("Feedback details are required.");
  if (details.length > 5000) throw new Error("Feedback details must be 5000 characters or fewer.");

  const attachment = payload.attachment || null;
  const attachmentName = attachment?.name ? String(attachment.name).slice(0, 240) : null;
  const attachmentType = attachment?.type ? String(attachment.type).slice(0, 120) : null;
  const attachmentSize = attachment?.size == null ? null : Number(attachment.size);
  const attachmentContent = attachment?.contentBase64 ? String(attachment.contentBase64) : null;
  const measuredAttachmentSize = attachmentContent ? Buffer.byteLength(attachmentContent, "base64") : attachmentSize;
  if (attachmentContent && !attachmentName) throw new Error("Attachment name is required.");
  if (attachmentSize != null && (!Number.isFinite(attachmentSize) || attachmentSize < 0 || attachmentSize > 2 * 1024 * 1024)) {
    throw new Error("Attachment must be 2 MB or smaller.");
  }
  if (measuredAttachmentSize != null && (!Number.isFinite(measuredAttachmentSize) || measuredAttachmentSize < 0 || measuredAttachmentSize > 2 * 1024 * 1024)) {
    throw new Error("Attachment must be 2 MB or smaller.");
  }

  const result = await pool.query(
    `insert into cloudprune_feedback_reports
       (account_id, user_id, report_type, details, attachment_name, attachment_type, attachment_size, attachment_content_base64)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id, report_type, details, attachment_name, attachment_type, attachment_size, created_at,
       $9::text as company_name, $10::text as user_name, $11::text as email`,
    [user.account_id, user.id, type, details, attachmentName, attachmentType, attachmentSize, attachmentContent, user.company_name, user.name, user.email]
  );
  await recordAuthEvent({
    req,
    userId: user.id,
    accountId: user.account_id,
    email: user.email,
    eventType: "feedback_submitted",
    detail: `${type}: ${details.slice(0, 160)}`,
    targetType: "feedback",
    targetId: result.rows[0].id,
    metadata: { type, hasAttachment: Boolean(attachmentName) },
  });
  return publicFeedback(result.rows[0]);
}

async function adminOverview(req: RequestLike) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  requireAdmin(req);
  const tenants = await pool.query(
    `select a.id, a.company_name, a.created_at,
            count(distinct u.id)::int as user_count,
            count(distinct c.id)::int as connections,
            max(u.last_login_at) as last_login_at
     from cloudprune_accounts a
     left join cloudprune_users u on u.account_id=a.id
     left join cloudprune_cloud_connections c on c.account_id=a.id
     group by a.id, a.company_name, a.created_at
     order by a.created_at desc`
  );
  const feedback = await pool.query(
    `select f.id, f.report_type, f.details, f.attachment_name, f.attachment_type, f.attachment_size, f.created_at,
            a.company_name, u.name as user_name, u.email
     from cloudprune_feedback_reports f
     join cloudprune_accounts a on a.id=f.account_id
     join cloudprune_users u on u.id=f.user_id
     order by f.created_at desc
     limit 200`
  );
  return {
    tenants: tenants.rows.map((row: Record<string, any>) => ({
      id: row.id,
      companyName: row.company_name,
      userCount: row.user_count,
      connections: row.connections,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    })),
    feedback: feedback.rows.map(publicFeedback),
  };
}

async function adminTenantUsers(req: RequestLike, tenantId: string) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  requireAdmin(req);
  const tenant = await pool.query(
    `select id, company_name from cloudprune_accounts where id=$1`,
    [tenantId]
  );
  if (!tenant.rows[0]) throw new Error("CloudPrune tenant was not found.");
  const users = await pool.query(
    `select id, account_id, name, email, provider, password_hash, last_login_at, created_at
     from cloudprune_users
     where account_id=$1
     order by created_at desc`,
    [tenantId]
  );
  return {
    tenant: { id: tenant.rows[0].id, companyName: tenant.rows[0].company_name },
    users: users.rows.map(publicAdminUser),
  };
}

async function adminResetUserPassword(req: RequestLike, userId: string, payload: { password?: unknown }) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const admin = requireAdmin(req);
  const password = String(payload.password || "");
  if (password.length < 10) throw new Error("Password must be at least 10 characters.");
  const result = await pool.query(
    `update cloudprune_users
     set password_hash=$2, session_version=session_version + 1
     where id=$1
     returning id, account_id, name, email, provider, password_hash, session_version, last_login_at, created_at`,
    [userId, hashPassword(password)]
  );
  const user = result.rows[0];
  if (!user) throw new Error("CloudPrune user was not found.");
  await recordAuthEvent({
    req,
    userId: user.id,
    accountId: user.account_id,
    email: admin.email,
    role: "admin",
    eventType: "admin_password_reset",
    detail: `Admin reset password for ${user.email}`,
    targetType: "user",
    targetId: user.id,
    metadata: { targetEmail: user.email },
  });
  return publicAdminUser(user);
}

async function adminSpoofUser(req: RequestLike, userId: string) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const admin = requireAdmin(req);
  const result = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.provider, u.session_version, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.id=$1`,
    [userId]
  );
  const user = result.rows[0];
  if (!user) throw new Error("CloudPrune user was not found.");
  await recordAuthEvent({
    req,
    userId: user.id,
    accountId: user.account_id,
    email: admin.email,
    role: "admin",
    eventType: "admin_spoof",
    detail: `Admin spoofed ${user.email}`,
    targetType: "user",
    targetId: user.id,
    metadata: { targetEmail: user.email },
  });
  return { token: signSession(user), user: publicUser(user) };
}

export {
  adminOverview,
  adminResetUserPassword,
  adminSpoofUser,
  adminTenantUsers,
  submitFeedback,
};
