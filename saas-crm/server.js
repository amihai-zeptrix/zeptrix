const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { SendEmailCommand, SESClient } = require("@aws-sdk/client-ses");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const QRCode = require("qrcode");

const root = __dirname;
loadEnv(path.join(root, ".env"));

const port = Number(process.env.PORT || 4173);
const region = process.env.AWS_REGION || "us-east-1";
const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SES_FROM_EMAIL;
const registrationNotificationEmail = process.env.REGISTRATION_NOTIFICATION_EMAIL || "amihaih@gmail.com";
const smtpHost = process.env.SMTP_HOST || "smtp.porkbun.com";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || fromEmail;
const smtpPassword = process.env.SMTP_PASSWORD || process.env.PORKBUN_SMTP_PASSWORD;
const emailProvider = (process.env.EMAIL_PROVIDER || (smtpPassword ? "smtp" : "ses")).toLowerCase();
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}/crm/`;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL?.replace(/\/crm\/?$/, "") || `http://localhost:${port}`;
const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SSO_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const tokenSecret = process.env.CRM_TOKEN_SECRET || process.env.TOKEN_SECRET || process.env.DATABASE_URL || "local-dev-token-secret";
const authTokenSecret = process.env.CRM_AUTH_SECRET || tokenSecret;
const GOOGLE_SSO_REDIRECT_URI = `${publicBaseUrl}/api/auth/google/callback`;
const GMAIL_NEW_CONTACT_LOOKBACK_DAYS = 30;
const GMAIL_NEW_CONTACT_METADATA_LIMIT = 1000;
const GMAIL_NEW_CONTACT_FULL_LIMIT = 250;
const GMAIL_NEW_CONTACT_SIGNAL_LIMIT = 250;
const GMAIL_ATTENTION_SIGNAL_LIMIT = 100;
const DEFAULT_WORKFLOW_AUTOMATION = {
  enabled: true,
  createFollowUpTasks: true,
  tagRiskAccounts: true,
  riskTag: "At risk",
  dormantDueDays: 3,
  attentionDueDays: 1,
};
const NEGATIVE_CORRESPONDENCE_PHRASES = [
  "angry", "angrey", "frustrated", "upset", "unhappy", "disappointed", "dissatisfied", "concerned", "worried", "annoyed",
  "irritated", "furious", "outraged", "mad", "displeased", "unacceptable", "not acceptable", "totally unacceptable", "very disappointed", "deeply disappointed",
  "you promised", "you've promised", "you have promised", "we were promised", "as promised", "broken promise", "missed promise", "commitment was made", "you committed", "not what we agreed",
  "missed deadline", "missed the deadline", "late again", "delayed again", "delay", "delayed", "slipped", "slipped again", "behind schedule", "timeline changed",
  "no response", "no reply", "haven't heard", "have not heard", "still waiting", "waiting for", "ignored", "radio silence", "lack of response", "no update",
  "escalate", "escalation", "escalating", "need to escalate", "management attention", "executive escalation", "legal", "procurement is asking", "finance is asking", "leadership is asking",
  "blocker", "blocked", "blocking", "critical blocker", "risk", "at risk", "renewal risk", "churn", "cancel", "cancellation",
  "terminate", "termination", "refund", "credit", "breach", "breached", "contract issue", "sla", "missed sla", "service level",
  "bug", "broken", "not working", "doesn't work", "does not work", "failed", "failure", "issue persists", "still broken", "regression",
  "security concern", "security issue", "compliance concern", "privacy concern", "data issue", "data loss", "incorrect data", "billing issue", "overcharged", "invoice issue",
  "poor experience", "bad experience", "terrible", "awful", "painful", "confusing", "not satisfied", "not happy", "losing confidence", "lost confidence",
  "urgent", "asap", "immediately", "today", "by end of day", "last chance", "final notice", "cannot proceed", "cannot move forward", "deal breaker",
  "not renewing", "won't renew", "will not renew", "switch vendor", "switching vendors", "competitor", "evaluate alternatives", "alternative vendor", "replace", "replacement",
  "account review", "postmortem", "root cause", "corrective action", "recovery plan", "remediation", "mitigation", "action plan", "where is the update", "why should we renew",
];
const scanProgressById = new Map();
const mfaAttemptsByChallenge = new Map();
const consumedMfaChallenges = new Set();
const ses = new SESClient({ region });
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } })
  : null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".sql": "text/plain; charset=utf-8",
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

const AUDIT_VALUE_ALLOWLIST = new Set([
  "account", "enabled", "gmailLookbackDays", "group", "priority", "recurrence", "region", "seats", "stage", "status", "type", "value",
  "close", "due", "staleMonths", "detectNewContacts", "detectDormantContacts", "createFollowUpTasks", "tagRiskAccounts", "dormantDueDays", "attentionDueDays",
]);

function redactAuditValue(name, value) {
  const field = String(name || "");
  if (!AUDIT_VALUE_ALLOWLIST.has(field) || /(password|secret|token|code|temporary|authorization|credential|email|phone|body|subject|message|note|template|client|smtp|label|uri|url|name|contact|owner|user)/i.test(field)) return "[redacted]";
  return String(value ?? "").slice(0, 500);
}

function sanitizedAuditMap(value, maxEntries = 40) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, maxEntries)
      .map(([key, item]) => [String(key).slice(0, 80), redactAuditValue(key, item)]),
  );
}

function sanitizeAuditDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const sanitized = {};
  if ("section" in details) sanitized.section = String(details.section || "").slice(0, 80);
  if ("status" in details) sanitized.status = String(details.status || "").slice(0, 40);
  if ("label" in details) sanitized.label = String(details.label || "").slice(0, 160);
  if ("editedTenantId" in details) sanitized.editedTenantId = String(details.editedTenantId || "").slice(0, 80);
  if ("editedTenantName" in details) sanitized.editedTenantName = String(details.editedTenantName || "").slice(0, 160);
  if (details.dataset && typeof details.dataset === "object") sanitized.dataset = sanitizedAuditMap(details.dataset, 20);
  if (details.fields && typeof details.fields === "object") sanitized.fields = sanitizedAuditMap(details.fields, 50);
  return sanitized;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%";
  const bytes = crypto.randomBytes(14);
  return `Tmp-${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")}`;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function validateTenant(payload) {
  const ownerEmail = payload.ownerEmail || payload.billingEmail;
  const required = ["name", "slug", "plan", "status", "region", "seats", "billingEmail"];
  const missing = required.filter((key) => !String(payload[key] ?? "").trim());
  if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.billingEmail)) return "Billing email is invalid.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return "Tenant admin login email is invalid.";
  if (Number(payload.seats) < 1) return "Seats must be at least 1.";
  return "";
}

function normalizeTenantPayload(payload) {
  return { ...payload, ownerEmail: payload.ownerEmail || payload.billingEmail };
}

function normalizeRegistrationPayload(payload = {}) {
  const fullName = String(payload.fullName || payload.name || "").trim();
  const company = String(payload.company || payload.tenantName || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!fullName) return { error: "Full name is required." };
  if (!company) return { error: "Company name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "A valid work email is required." };
  if (password.length < 10) return { error: "Password must be at least 10 characters." };
  return {
    fullName,
    company,
    email,
    password,
    slug: crypto.randomUUID(),
    plan: "Growth",
    status: "Trial",
    region: "US-East",
    seats: 3,
  };
}

function normalizeDealPayload(payload = {}) {
  const stage = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"].includes(payload.stage) ? payload.stage : "Lead";
  const priority = ["High", "Medium", "Low"].includes(payload.priority) ? payload.priority : "Medium";
  const group = ["active", "closed"].includes(payload.group) ? payload.group : (["Won", "Lost"].includes(stage) ? "closed" : "active");
  const tags = normalizeTags(payload.tags);
  return {
    name: String(payload.name || `${payload.account || payload.contact || "New"} relationship`).trim(),
    account: String(payload.account || "").trim(),
    contact: String(payload.contact || "").trim(),
    email: String(payload.email || "").trim(),
    phone: String(payload.phone || "").trim(),
    owner: String(payload.owner || "").trim(),
    stage,
    value: Math.max(0, Number.parseInt(payload.value, 10) || 0),
    close: String(payload.close || "").trim() || null,
    priority,
    group,
    tags,
    note: String(payload.note || payload.notes || "").trim(),
    updated: String(payload.updated || "Just now").trim(),
  };
}

function normalizeWorkflowAutomationSettings(payload = {}) {
  const enabled = payload.enabled == null ? DEFAULT_WORKFLOW_AUTOMATION.enabled : Boolean(payload.enabled);
  const createFollowUpTasks = payload.createFollowUpTasks == null ? DEFAULT_WORKFLOW_AUTOMATION.createFollowUpTasks : Boolean(payload.createFollowUpTasks);
  const tagRiskAccounts = payload.tagRiskAccounts == null ? DEFAULT_WORKFLOW_AUTOMATION.tagRiskAccounts : Boolean(payload.tagRiskAccounts);
  return {
    enabled,
    createFollowUpTasks,
    tagRiskAccounts,
    riskTag: normalizeTagName(payload.riskTag || DEFAULT_WORKFLOW_AUTOMATION.riskTag) || DEFAULT_WORKFLOW_AUTOMATION.riskTag,
    dormantDueDays: Math.max(1, Math.min(30, Number(payload.dormantDueDays || DEFAULT_WORKFLOW_AUTOMATION.dormantDueDays))),
    attentionDueDays: Math.max(0, Math.min(14, Number(payload.attentionDueDays ?? DEFAULT_WORKFLOW_AUTOMATION.attentionDueDays))),
  };
}

function normalizeTagName(value = "") {
  return String(value).trim().replace(/\s+/g, " ").slice(0, 40);
}

function normalizeTags(value = []) {
  const rawTags = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(rawTags.map(normalizeTagName).filter(Boolean))].slice(0, 20);
}

function validateDeal(values) {
  if (!values.name) return "Deal name is required.";
  if (!values.account && !values.contact) return "Account or contact is required.";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return "A valid email is required.";
  if (values.close && !/^\d{4}-\d{2}-\d{2}$/.test(values.close)) return "Close date must use YYYY-MM-DD.";
  return "";
}

function normalizeMailTemplatePayload(payload = {}) {
  return {
    id: String(payload.id || "").trim(),
    name: String(payload.name || "").trim(),
    subject: String(payload.subject || "").trim(),
    body: String(payload.body || "").trim(),
  };
}

function validateMailTemplate(values) {
  if (!values.name) return "Template name is required.";
  if (!values.subject) return "Template subject is required.";
  if (!values.body) return "Template body is required.";
  return "";
}

function normalizeOutgoingEmailSettings(payload = {}) {
  const port = Math.max(1, Math.min(65535, Number(payload.port || 587)));
  const fromEmail = String(payload.fromEmail || payload.username || "").trim();
  const settings = {
    host: String(payload.host || "").trim(),
    port,
    secure: payload.secure === true || payload.secure === "true" || port === 465,
    username: String(payload.username || "").trim(),
    password: String(payload.password || "").trim(),
    fromName: String(payload.fromName || "Zeptrix CRM").trim(),
    fromEmail,
  };
  if (!settings.host) return { error: "Outgoing mail server is required." };
  if (!settings.username) return { error: "Outgoing mail username is required." };
  if (!settings.fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.fromEmail)) return { error: "A valid from email is required." };
  return settings;
}

function normalizeOutgoingMailPayload(payload = {}) {
  const to = String(payload.to || "").trim();
  const subject = String(payload.subject || "").trim();
  const body = String(payload.body || "").trim();
  const direction = ["inbound", "outbound"].includes(payload.direction) ? payload.direction : "outbound";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "A valid recipient email is required." };
  if (!subject) return { error: "Subject is required." };
  if (!body) return { error: "Message is required." };
  return {
    dealId: String(payload.dealId || "").trim() || null,
    to,
    subject,
    body,
    direction,
  };
}

function duplicateTenantEmailMessage(email, tenantName, role) {
  return `Tenant admin login email ${email} is already used by ${tenantName} (${role}).`;
}

function inviteEmailContent({ to, tenantName, temporaryPassword }) {
  const subject = "Your Zeptrix CRM invite";
  const text = [
    `You've been invited to ${tenantName} in Zeptrix CRM.`,
    "",
    `Sign in: ${appBaseUrl}`,
    `Email: ${to}`,
    `Temporary password: ${temporaryPassword}`,
    "Authenticator MFA: after signing in, you will be prompted to scan a QR code with Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.",
    "",
    "You will be asked to create a permanent password after login.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#20242b">
      <h2>You're invited to Zeptrix CRM</h2>
      <p>You have been invited to <strong>${escapeHtml(tenantName)}</strong>.</p>
      <p><a href="${escapeHtml(appBaseUrl)}">Open Zeptrix CRM</a></p>
      <p><strong>Email:</strong> ${escapeHtml(to)}<br>
      <strong>Temporary password:</strong> ${escapeHtml(temporaryPassword)}<br>
      <strong>Authenticator MFA:</strong> after signing in, you will be prompted to scan a QR code with Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p>
      <p>You will be asked to create a permanent password after login.</p>
    </div>`;
  return { subject, text, html };
}

function passwordResetEmailContent({ to, tenantName, temporaryPassword }) {
  const subject = "Reset your Zeptrix CRM password";
  const text = [
    `A password reset was requested for your ${tenantName} Zeptrix CRM account.`,
    "",
    `Sign in: ${appBaseUrl}`,
    `Email: ${to}`,
    `Temporary password: ${temporaryPassword}`,
    "",
    "After signing in, you will be asked to create a new permanent password.",
    "If you did not request this reset, contact your CRM administrator.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#20242b">
      <h2>Reset your Zeptrix CRM password</h2>
      <p>A password reset was requested for your <strong>${escapeHtml(tenantName)}</strong> account.</p>
      <p><a href="${escapeHtml(appBaseUrl)}">Open Zeptrix CRM</a></p>
      <p><strong>Email:</strong> ${escapeHtml(to)}<br>
      <strong>Temporary password:</strong> ${escapeHtml(temporaryPassword)}</p>
      <p>After signing in, you will be asked to create a new permanent password.</p>
      <p style="color:#667085">If you did not request this reset, contact your CRM administrator.</p>
    </div>`;
  return { subject, text, html };
}

function mfaRecoveryEmailContent({ to, tenantName, recoveryUrl }) {
  const subject = "Configure a new Zeptrix CRM authenticator";
  const text = [
    `A request was made to configure a new authenticator for your ${tenantName} Zeptrix CRM account.`,
    "",
    `Open this link within 30 minutes: ${recoveryUrl}`,
    "",
    "You will be asked to scan a new QR code in Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.",
    "If you did not request this, ignore this email and contact your CRM administrator.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#20242b">
      <h2>Configure a new authenticator</h2>
      <p>A request was made to configure a new authenticator for your <strong>${escapeHtml(tenantName)}</strong> account.</p>
      <p><a href="${escapeHtml(recoveryUrl)}">Configure authenticator</a></p>
      <p>This link expires in 30 minutes. You will be asked to scan a new QR code in Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p>
      <p style="color:#667085">If you did not request this, ignore this email and contact your CRM administrator.</p>
    </div>`;
  return { subject, text, html };
}

function registrationNotificationContent({ tenantName, userName, userEmail, method }) {
  const subject = `New Zeptrix CRM registration: ${tenantName}`;
  const text = [
    "A new user registered to Zeptrix CRM.",
    "",
    `Tenant: ${tenantName}`,
    `User: ${userName}`,
    `Email: ${userEmail}`,
    `Method: ${method}`,
    `Time: ${new Date().toISOString()}`,
    "",
    `Admin: ${appBaseUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#20242b">
      <h2>New Zeptrix CRM registration</h2>
      <p>A new user registered to Zeptrix CRM.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#667085">Tenant</td><td style="padding:4px 0"><strong>${escapeHtml(tenantName)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#667085">User</td><td style="padding:4px 0">${escapeHtml(userName)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#667085">Email</td><td style="padding:4px 0">${escapeHtml(userEmail)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#667085">Method</td><td style="padding:4px 0">${escapeHtml(method)}</td></tr>
      </table>
      <p><a href="${escapeHtml(appBaseUrl)}">Open Zeptrix CRM</a></p>
    </div>`;
  return { subject, text, html };
}

async function sendTransactionalEmail({ to, subject, text, html }) {
  if (!fromEmail) return { status: "not_configured", messageId: null, detail: "Sender email is not configured." };
  if (emailProvider === "smtp") {
    if (!smtpUser || !smtpPassword) return { status: "not_configured", messageId: null, detail: "SMTP user or password is not configured." };
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    });
    const response = await transporter.sendMail({
      from: `Zeptrix CRM <${fromEmail}>`,
      to,
      subject,
      text,
      html,
    });
    return { status: "sent", messageId: response.messageId || null, detail: `Sent through SMTP (${smtpHost}).` };
  }
  const response = await ses.send(new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Charset: "UTF-8", Data: subject },
      Body: {
        Text: { Charset: "UTF-8", Data: text },
        Html: { Charset: "UTF-8", Data: html },
      },
    },
  }));
  return { status: "sent", messageId: response.MessageId, detail: "Sent through Amazon SES." };
}

async function sendRegistrationNotification(args) {
  if (!registrationNotificationEmail) return { status: "disabled", detail: "REGISTRATION_NOTIFICATION_EMAIL is empty." };
  const content = registrationNotificationContent(args);
  return sendTransactionalEmail({ to: registrationNotificationEmail, ...content });
}

async function notifyRegistration(args) {
  try {
    const result = await sendRegistrationNotification(args);
    if (result.status !== "sent") console.log(`Registration notification was not sent: ${result.detail}`);
    return result;
  } catch (error) {
    console.log(`Registration notification failed: ${error.message}`);
    return { status: "failed", detail: error.message };
  }
}

async function sendInviteEmailViaSmtp(args) {
  if (!fromEmail || !smtpUser || !smtpPassword) {
    return { status: "not_configured", messageId: null, detail: "SMTP sender, user, or password is not configured." };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPassword },
  });
  const response = await transporter.sendMail(smtpInviteMessage(args));
  return { status: "sent", messageId: response.messageId || null, detail: `Sent through SMTP (${smtpHost}).` };
}

function smtpInviteMessage(args) {
  const content = inviteEmailContent(args);
  return {
    from: `Zeptrix CRM <${fromEmail}>`,
    to: args.to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  };
}

async function sendInviteEmailViaSes(args) {
  if (!fromEmail) {
    return { status: "not_configured", messageId: null, detail: "SES_FROM_EMAIL is not set." };
  }

  const content = inviteEmailContent(args);
  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [args.to] },
    Message: {
      Subject: { Charset: "UTF-8", Data: content.subject },
      Body: {
        Text: { Charset: "UTF-8", Data: content.text },
        Html: { Charset: "UTF-8", Data: content.html },
      },
    },
  });

  const response = await ses.send(command);
  return { status: "sent", messageId: response.MessageId, detail: "Sent through Amazon SES." };
}

async function sendInviteEmail(args) {
  if (emailProvider === "smtp") return sendInviteEmailViaSmtp(args);
  return sendInviteEmailViaSes(args);
}

async function sendAndRecordInvite({ tenantId, tenantName, to, temporaryPassword }) {
  const invite = await dbQuery(
    `insert into invite_emails (tenant_id, recipient_email, temporary_password_hash, subject, status, message_id, detail, sent_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     returning *`,
    [tenantId, to, hashPassword(temporaryPassword), "Your Zeptrix CRM invite", "queued", null, "Queued before email send."],
  );

  let mail;
  try {
    mail = await sendInviteEmail({ to, tenantName, temporaryPassword });
  } catch (error) {
    mail = { status: "failed", messageId: null, detail: error.message };
  }

  await dbQuery(
    `update invite_emails set status=$2, message_id=$3, detail=$4, sent_at=now() where id=$1`,
    [invite.rows[0].id, mail.status, mail.messageId, mail.detail],
  );

  return {
    id: invite.rows[0].id,
    to,
    tenantName,
    temporaryPassword,
    sentAt: new Date().toISOString(),
    status: mail.status,
    messageId: mail.messageId,
    detail: mail.detail,
  };
}

async function dbQuery(text, params = []) {
  if (!pool) throw new Error("DATABASE_URL is not configured.");
  return pool.query(text, params);
}

async function withTransaction(work) {
  if (!pool) throw new Error("DATABASE_URL is not configured.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function initDatabase() {
  if (!pool) return;
  await dbQuery(`create extension if not exists pgcrypto`);
  await dbQuery(`create extension if not exists citext`);
  await dbQuery(`
    create table if not exists tenants (
      id uuid primary key default gen_random_uuid(),
      slug text not null unique,
      name text not null,
      plan text not null check (plan in ('Starter', 'Growth', 'Enterprise')),
      status text not null default 'Active' check (status in ('Trial', 'Active', 'Suspended')),
      region text not null default 'US-East',
      seats integer not null default 1 check (seats > 0),
      billing_email citext not null,
      mfa_required boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await dbQuery(`alter table tenants add column if not exists mfa_required boolean not null default false`);
  await dbQuery(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      email citext not null unique,
      password_hash text,
      password_change_required boolean not null default true,
      role text not null check (role in ('platform_admin', 'tenant_admin', 'sales_manager', 'sales_rep')),
      mfa_enabled boolean not null default false,
      mfa_secret_enc text,
      mfa_confirmed boolean not null default false,
      google_subject text unique,
      last_login_at timestamptz,
      created_at timestamptz not null default now()
    )`);
  await dbQuery(`alter table users add column if not exists mfa_enabled boolean not null default false`);
  await dbQuery(`alter table users add column if not exists mfa_secret_enc text`);
  await dbQuery(`alter table users add column if not exists mfa_confirmed boolean not null default false`);
  await dbQuery(`alter table users add column if not exists google_subject text`);
  await dbQuery(`alter table users add column if not exists last_login_at timestamptz`);
  await dbQuery(`create unique index if not exists users_google_subject_key on users(google_subject) where google_subject is not null`);
  await dbQuery(`
    create table if not exists deals (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      account text,
      contact text,
      email citext,
      phone text,
      owner text,
      stage text not null check (stage in ('Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost')),
      value integer not null default 0,
      close_date date,
      priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
      deal_group text not null default 'active',
      tags jsonb not null default '[]'::jsonb,
      notes text,
      updated_label text not null default 'Just now',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists contact_tags (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      created_at timestamptz not null default now(),
      unique(tenant_id, name)
    )`);
  await dbQuery(`
    create table if not exists activities (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      deal_id uuid references deals(id) on delete cascade,
      title text not null,
      type text not null check (type in ('Follow-up', 'Call', 'Email', 'Meeting')),
      owner text,
      due_date date,
      priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
      completed boolean not null default false,
      created_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists communications (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      deal_id uuid references deals(id) on delete cascade,
      type text not null check (type in ('Email', 'Meeting', 'Call')),
      direction text not null check (direction in ('inbound', 'outbound')),
      subject text not null,
      body text,
      owner text,
      tracked text,
      tracking_status text not null default 'Logged',
      opened_at timestamptz,
      replied_at timestamptz,
      gmail_thread_id text,
      source text not null default 'crm',
      occurred_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists mail_templates (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      subject text not null,
      body text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists outgoing_email_settings (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      host text not null,
      port integer not null default 587 check (port > 0 and port <= 65535),
      secure boolean not null default false,
      username text not null,
      password_enc text,
      from_name text not null default 'Zeptrix CRM',
      from_email citext not null,
      status text not null default 'Not configured',
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists invite_emails (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      recipient_email citext not null,
      temporary_password_hash text not null,
      subject text not null,
      status text not null default 'queued',
      message_id text,
      detail text,
      sent_at timestamptz,
      created_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists gmail_integrations (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      account_email citext,
      workspace_domain text,
      client_id text,
      redirect_uri text,
      labels text not null default 'Inbox, Sent',
      gmail_lookback_days integer not null default 30 check (gmail_lookback_days > 0 and gmail_lookback_days <= 365),
      stale_months integer not null default 3 check (stale_months > 0 and stale_months <= 36),
      detect_new_contacts boolean not null default true,
      detect_dormant_contacts boolean not null default true,
      enabled boolean not null default false,
      status text not null default 'Not connected',
      access_token_enc text,
      refresh_token_enc text,
      token_expiry timestamptz,
      last_scan_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists gmail_contact_signals (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      signal_type text not null check (signal_type in ('new_contact', 'dormant_contact', 'attention_correspondence')),
      email citext not null,
      name text,
      account text,
      phone text,
      source text,
      months integer,
      message_id text,
      last_seen_at timestamptz,
      created_at timestamptz not null default now(),
      unique(tenant_id, signal_type, email)
    )`);
  await dbQuery(`alter table gmail_contact_signals drop constraint if exists gmail_contact_signals_signal_type_check`);
  await dbQuery(`alter table gmail_contact_signals add constraint gmail_contact_signals_signal_type_check check (signal_type in ('new_contact', 'dormant_contact', 'attention_correspondence'))`);
  await dbQuery(`
    create table if not exists gmail_contact_blacklist (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      email citext not null,
      name text,
      source text,
      created_at timestamptz not null default now(),
      unique(tenant_id, email)
    )`);
  await dbQuery(`
    create table if not exists linkedin_integrations (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      company_page_url text,
      account_email citext,
      sync_contacts boolean not null default true,
      sync_company_updates boolean not null default false,
      enabled boolean not null default false,
      status text not null default 'Not connected',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists workflow_automations (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      enabled boolean not null default true,
      create_follow_up_tasks boolean not null default true,
      tag_risk_accounts boolean not null default true,
      risk_tag text not null default 'At risk',
      dormant_due_days integer not null default 3 check (dormant_due_days >= 1 and dormant_due_days <= 30),
      attention_due_days integer not null default 1 check (attention_due_days >= 0 and attention_due_days <= 14),
      last_run_at timestamptz,
      last_run_summary jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists audit_logs (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid references tenants(id) on delete set null,
      user_id uuid references users(id) on delete set null,
      user_email citext,
      user_role text,
      event_type text not null,
      operation text not null,
      target text,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )`);
  await dbQuery(`alter table gmail_contact_signals add column if not exists phone text`);
  await dbQuery(`alter table deals add column if not exists phone text`);
  await dbQuery(`alter table deals add column if not exists tags jsonb not null default '[]'::jsonb`);
  await dbQuery(`alter table communications add column if not exists tracking_status text not null default 'Logged'`);
  await dbQuery(`alter table communications add column if not exists opened_at timestamptz`);
  await dbQuery(`alter table communications add column if not exists replied_at timestamptz`);
  await dbQuery(`alter table communications add column if not exists gmail_thread_id text`);
  await dbQuery(`alter table communications add column if not exists source text not null default 'crm'`);
  await dbQuery(`alter table gmail_integrations add column if not exists gmail_lookback_days integer not null default 30 check (gmail_lookback_days > 0 and gmail_lookback_days <= 365)`);
  await dbQuery(`alter table linkedin_integrations add column if not exists company_page_url text`);
  await dbQuery(`alter table linkedin_integrations add column if not exists account_email citext`);
  await dbQuery(`alter table linkedin_integrations add column if not exists sync_contacts boolean not null default true`);
  await dbQuery(`alter table linkedin_integrations add column if not exists sync_company_updates boolean not null default false`);
  await dbQuery(`alter table linkedin_integrations add column if not exists enabled boolean not null default false`);
  await dbQuery(`alter table linkedin_integrations add column if not exists status text not null default 'Not connected'`);
  await dbQuery(`create index if not exists deals_tenant_stage_idx on deals(tenant_id, stage)`);
  await dbQuery(`create index if not exists contact_tags_tenant_name_idx on contact_tags(tenant_id, lower(name))`);
  await dbQuery(`create index if not exists mail_templates_tenant_updated_idx on mail_templates(tenant_id, updated_at desc)`);
  await dbQuery(`create index if not exists outgoing_email_settings_updated_idx on outgoing_email_settings(updated_at desc)`);
  await dbQuery(`create index if not exists invite_emails_tenant_created_idx on invite_emails(tenant_id, created_at desc)`);
  await dbQuery(`create index if not exists gmail_signals_tenant_type_idx on gmail_contact_signals(tenant_id, signal_type, created_at desc)`);
  await dbQuery(`create index if not exists gmail_blacklist_tenant_email_idx on gmail_contact_blacklist(tenant_id, email)`);
  await dbQuery(`create index if not exists linkedin_integrations_updated_idx on linkedin_integrations(updated_at desc)`);
  await dbQuery(`create index if not exists communications_tenant_thread_idx on communications(tenant_id, gmail_thread_id)`);
  await dbQuery(`create index if not exists workflow_automations_updated_idx on workflow_automations(updated_at desc)`);
  await dbQuery(`create index if not exists audit_logs_created_idx on audit_logs(created_at desc)`);
  await dbQuery(`create index if not exists audit_logs_tenant_created_idx on audit_logs(tenant_id, created_at desc)`);
  await seedDatabase();
}

async function seedDatabase() {
  const existing = await dbQuery(`select count(*)::int as count from tenants`);
  if (existing.rows[0].count === 0) {
    const adminTenant = await insertTenant({ name: "Zeptrix Admin", slug: "admin", plan: "Enterprise", status: "Active", region: "US-East", seats: 8, billingEmail: "billing@zeptrix.io" });
    const amihaiTenant = await insertTenant({ name: "Amihai Sales", slug: "amihai", plan: "Growth", status: "Active", region: "EU-West", seats: 5, billingEmail: "billing@amihai.example" });
    await insertUser(adminTenant.id, { name: "Platform Admin", email: "admin@zeptrix.io", password: "Tmp-Admin-7394!", role: "platform_admin", mustChangePassword: true, sso: true });
    await insertUser(amihaiTenant.id, { name: "Amihai Cohen", email: "amihai@zeptrix.io", password: "Tmp-Amihai-5821!", role: "tenant_admin", mustChangePassword: true, sso: true });
    await seedCrm(adminTenant.id, [
      { name: "Enterprise rollout", account: "Orbital Systems", contact: "Liam Brooks", email: "liam@orbitalsystems.com", owner: "Noa Levi", stage: "Negotiation", value: 72000, close: "2026-06-18", priority: "High", group: "active", note: "Security review complete. Waiting on procurement.", updated: "Today, 09:42" },
      { name: "Q3 expansion plan", account: "Nimbus Labs", contact: "Sophie Green", email: "sophie@nimbuslabs.io", owner: "Daniel Cohen", stage: "Proposal", value: 48500, close: "2026-06-30", priority: "Medium", group: "active", note: "Proposal shared after product workshop.", updated: "Yesterday" },
      { name: "Operations package", account: "Acme Studios", contact: "Ethan Hall", email: "ethan@acmestudios.co", owner: "Maya Bar", stage: "Qualified", value: 24000, close: "2026-07-11", priority: "Medium", group: "active", note: "Needs a migration timeline.", updated: "May 29" },
      { name: "Global account migration", account: "Atlas Freight", contact: "Lucas Martin", email: "lucas@atlasfreight.com", owner: "Avi Stein", stage: "Won", value: 96000, close: "2026-05-24", priority: "High", group: "closed", note: "Closed after successful pilot.", updated: "May 24" },
    ]);
    await seedCrm(amihaiTenant.id, [
      { name: "Partner CRM launch", account: "BluePeak Advisory", contact: "Idan Yuval", email: "idan@bluepeak.example", owner: "Amihai Cohen", stage: "Proposal", value: 42000, close: "2026-06-25", priority: "High", group: "active", note: "Pricing review scheduled.", updated: "Today, 10:18" },
      { name: "Support workflow", account: "Northline Apps", contact: "Yael Ron", email: "yael@northline.example", owner: "Noa Levi", stage: "Qualified", value: 18000, close: "2026-07-08", priority: "Medium", group: "active", note: "Needs SLA mapping.", updated: "Yesterday" },
      { name: "Renewal package", account: "Cedar Retail", contact: "Tom Bar", email: "tom@cedar.example", owner: "Amihai Cohen", stage: "Won", value: 28000, close: "2026-06-02", priority: "Low", group: "closed", note: "Renewed for 12 months.", updated: "Jun 2" },
    ]);
  }
  await ensureDemoTenant();
}

const demoDeals = [
  { name: "Enterprise rollout", account: "Orbital Systems", contact: "Liam Brooks", email: "liam@orbitalsystems.com", owner: "Noa Levi", stage: "Negotiation", value: 72000, close: "2026-06-18", priority: "High", group: "active", note: "Security review complete. Waiting on procurement.", updated: "Today, 09:42" },
  { name: "Q3 expansion plan", account: "Nimbus Labs", contact: "Sophie Green", email: "sophie@nimbuslabs.io", owner: "Daniel Cohen", stage: "Proposal", value: 48500, close: "2026-06-30", priority: "Medium", group: "active", note: "Proposal shared after product workshop.", updated: "Yesterday" },
  { name: "Operations package", account: "Acme Studios", contact: "Ethan Hall", email: "ethan@acmestudios.co", owner: "Maya Bar", stage: "Qualified", value: 24000, close: "2026-07-11", priority: "Medium", group: "active", note: "Needs a migration timeline.", updated: "May 29" },
  { name: "Team onboarding", account: "Vertex Health", contact: "Amelia Chen", email: "amelia@vertex.health", owner: "Avi Stein", stage: "Lead", value: 18200, close: "2026-07-20", priority: "Low", group: "active", note: "Inbound request from pricing page.", updated: "May 28" },
  { name: "Regional license renewal", account: "Strata Finance", contact: "Oliver Davis", email: "oliver@strata.finance", owner: "Noa Levi", stage: "Negotiation", value: 64000, close: "2026-06-09", priority: "High", group: "active", note: "Final legal pass in progress.", updated: "May 28" },
  { name: "Customer success hub", account: "Northstar Retail", contact: "Emma Wilson", email: "emma@northstarretail.com", owner: "Maya Bar", stage: "Qualified", value: 31000, close: "2026-07-03", priority: "Medium", group: "active", note: "Product fit confirmed with VP Sales.", updated: "May 26" },
  { name: "Analytics workspace", account: "Bloom Foods", contact: "Jack Turner", email: "jack@bloomfoods.co", owner: "Daniel Cohen", stage: "Proposal", value: 26800, close: "2026-06-26", priority: "Low", group: "active", note: "Review call booked.", updated: "May 25" },
  { name: "Global account migration", account: "Atlas Freight", contact: "Lucas Martin", email: "lucas@atlasfreight.com", owner: "Avi Stein", stage: "Won", value: 96000, close: "2026-05-24", priority: "High", group: "closed", note: "Closed after successful pilot.", updated: "May 24" },
  { name: "Marketing automation", account: "Focal Point", contact: "Ella Young", email: "ella@focalpoint.agency", owner: "Noa Levi", stage: "Won", value: 37500, close: "2026-05-21", priority: "Medium", group: "closed", note: "Handoff to onboarding team.", updated: "May 21" },
  { name: "Procurement workflow", account: "Keystone Group", contact: "Mason King", email: "mason@keystone.group", owner: "Daniel Cohen", stage: "Lost", value: 22000, close: "2026-05-16", priority: "Low", group: "closed", note: "Timing shifted to next fiscal year.", updated: "May 16" },
  { name: "Revenue operations rollout", account: "SignalForge", contact: "Priya Shah", email: "priya@signalforge.ai", owner: "Maya Bar", stage: "Qualified", value: 44600, close: "2026-07-18", priority: "Medium", group: "active", note: "RevOps leader wants dashboard governance before rollout.", updated: "Jun 3" },
  { name: "Customer data cleanup", account: "Harbor Cloud", contact: "Nora Evans", email: "nora@harborcloud.io", owner: "Daniel Cohen", stage: "Lead", value: 15800, close: "2026-08-04", priority: "Low", group: "active", note: "Evaluating duplicate detection and enrichment.", updated: "Jun 1" },
  { name: "Field team automation", account: "Summit Energy", contact: "Marcus Lee", email: "marcus@summitenergy.com", owner: "Avi Stein", stage: "Proposal", value: 52200, close: "2026-07-15", priority: "High", group: "active", note: "Field managers need mobile-friendly follow-up workflows.", updated: "May 31" },
  { name: "Investor relations CRM", account: "Cobalt Ventures", contact: "Rachel Stone", email: "rachel@cobalt.vc", owner: "Noa Levi", stage: "Qualified", value: 33800, close: "2026-07-28", priority: "Medium", group: "active", note: "Needs segmentation by fund and investor profile.", updated: "May 30" },
  { name: "Partner portal sync", account: "Helio Partners", contact: "Owen Blake", email: "owen@heliopartners.co", owner: "Maya Bar", stage: "Negotiation", value: 58700, close: "2026-06-22", priority: "High", group: "active", note: "Partner success team requested API scope confirmation.", updated: "May 30" },
  { name: "Service desk CRM bridge", account: "Prairie Software", contact: "Isabella Ross", email: "isabella@prairiesoftware.com", owner: "Daniel Cohen", stage: "Proposal", value: 29100, close: "2026-07-09", priority: "Medium", group: "active", note: "Support leadership wants case-to-opportunity visibility.", updated: "May 27" },
  { name: "Healthcare outreach workflow", account: "Evergreen Clinics", contact: "Caleb Wright", email: "caleb@evergreenclinics.org", owner: "Avi Stein", stage: "Lead", value: 21400, close: "2026-08-12", priority: "Low", group: "active", note: "Needs HIPAA-aligned communication tracking.", updated: "May 26" },
  { name: "Enterprise territory planning", account: "Redwood Manufacturing", contact: "Hannah Park", email: "hannah@redwoodmfg.com", owner: "Noa Levi", stage: "Proposal", value: 67100, close: "2026-07-02", priority: "High", group: "active", note: "Regional directors want territory coverage reporting.", updated: "May 25" },
];

const demoTasks = [
  { dealIndex: 0, title: "Confirm procurement timeline", type: "Follow-up", owner: "Noa Levi", due: "2026-05-31", priority: "High", completed: false },
  { dealIndex: 1, title: "Review proposal feedback", type: "Email", owner: "Daniel Cohen", due: "2026-06-01", priority: "Medium", completed: false },
  { dealIndex: 2, title: "Send migration timeline", type: "Follow-up", owner: "Maya Bar", due: "2026-05-29", priority: "High", completed: false },
  { dealIndex: 4, title: "Check legal approval", type: "Call", owner: "Noa Levi", due: "2026-05-31", priority: "High", completed: false },
  { dealIndex: 6, title: "Run proposal review call", type: "Meeting", owner: "Daniel Cohen", due: "2026-06-02", priority: "Medium", completed: false },
  { dealIndex: 7, title: "Complete onboarding handoff", type: "Follow-up", owner: "Avi Stein", due: "2026-05-25", priority: "Low", completed: true },
];

const demoCommunications = [
  { dealIndex: 0, type: "Email", direction: "outbound", subject: "Security review follow-up", body: "Sharing the final procurement checklist and next steps.", date: "2026-05-30T09:42:00", owner: "Noa Levi", tracked: "Opened twice" },
  { dealIndex: 1, type: "Meeting", direction: "inbound", subject: "Product workshop completed", body: "The Nimbus team requested a proposal for the Q3 expansion plan.", date: "2026-05-29T14:15:00", owner: "Daniel Cohen", tracked: "60 min" },
  { dealIndex: 4, type: "Email", direction: "inbound", subject: "Legal review update", body: "Legal expects to complete the final pass this week.", date: "2026-05-28T11:20:00", owner: "Noa Levi", tracked: "Replied" },
];

async function ensureDemoTenant() {
  let tenant = (await dbQuery(`select * from tenants where slug='demo'`)).rows[0];
  if (!tenant) {
    tenant = await insertTenant({ name: "CRM Demo", slug: "demo", plan: "Enterprise", status: "Active", region: "US-East", seats: 6, billingEmail: "demo@zeptrix.io" });
  }
  const existingDeals = await dbQuery(`select count(*)::int as count from deals where tenant_id=$1`, [tenant.id]);
  if (existingDeals.rows[0].count === 0) await seedFullDemoCrm(tenant.id);
  else await seedMissingDemoDeals(tenant.id);
}

async function insertTenant(values) {
  const result = await dbQuery(
    `insert into tenants (slug, name, plan, status, region, seats, billing_email)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [slugify(values.slug), values.name, values.plan, values.status, values.region, Number(values.seats), values.billingEmail],
  );
  return result.rows[0];
}

async function insertTenantWithClient(client, values) {
  const result = await client.query(
    `insert into tenants (slug, name, plan, status, region, seats, billing_email)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [slugify(values.slug), values.name, values.plan, values.status, values.region, Number(values.seats), values.billingEmail],
  );
  return result.rows[0];
}

async function updateTenant(idOrSlug, values) {
  return withTransaction((client) => updateTenantWithClient(client, idOrSlug, values));
}

async function updateTenantWithClient(client, idOrSlug, values) {
  const existing = await client.query(
    `select * from tenants where id::text=$1 or slug=$1 for update`,
    [idOrSlug],
  );
  if (!existing.rows.length) return null;

  const tenantId = existing.rows[0].id;
  const slug = slugify(values.slug);
  const duplicate = await client.query(
    `select
       exists(select 1 from tenants where slug=$1 and id<>$2) as slug_exists,
       exists(select 1 from users where lower(email)=lower($3) and tenant_id<>$2) as email_exists`,
    [slug, tenantId, values.ownerEmail],
  );
  if (duplicate.rows[0].slug_exists) {
    const error = new Error("A tenant with that workspace URL slug already exists.");
    error.statusCode = 409;
    throw error;
  }
  if (duplicate.rows[0].email_exists) {
    const error = new Error(`Tenant admin login email ${values.ownerEmail} is already used by another tenant.`);
    error.statusCode = 409;
    throw error;
  }

  const result = await client.query(
    `update tenants
     set slug=$2, name=$3, plan=$4, status=$5, region=$6, seats=$7, billing_email=$8, updated_at=now()
     where id=$1
     returning *`,
    [tenantId, slug, values.name, values.plan, values.status, values.region, Number(values.seats), values.billingEmail],
  );

  const userResult = await client.query(
    `update users
     set name=$2, email=$3, google_subject=$4
     where id = (
       select id from users
       where tenant_id=$1 and role='tenant_admin'
       order by created_at
       limit 1
     )
     returning *`,
    [tenantId, values.name, values.ownerEmail, `google-${values.ownerEmail}`],
  );
  return { tenant: result.rows[0], user: userResult.rows[0] };
}

async function insertUser(tenantId, user) {
  const result = await dbQuery(
    `insert into users (tenant_id, name, email, password_hash, password_change_required, role, mfa_enabled, google_subject)
     values ($1, $2, $3, $4, $5, $6, false, $7)
     returning *`,
    [tenantId, user.name, user.email, hashPassword(user.password), !!user.mustChangePassword, user.role, user.googleSubject || (user.sso ? `google-${user.email}` : null)],
  );
  return result.rows[0];
}

async function insertUserWithClient(client, tenantId, user) {
  const result = await client.query(
    `insert into users (tenant_id, name, email, password_hash, password_change_required, role, mfa_enabled, google_subject)
     values ($1, $2, $3, $4, $5, $6, false, $7)
     returning *`,
    [tenantId, user.name, user.email, hashPassword(user.password), !!user.mustChangePassword, user.role, user.googleSubject || (user.sso ? `google-${user.email}` : null)],
  );
  return result.rows[0];
}

async function seedCrm(tenantId, deals) {
  for (const deal of deals) {
    await dbQuery(
      `insert into deals (tenant_id, name, account, contact, email, owner, stage, value, close_date, priority, deal_group, notes, updated_label)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [tenantId, deal.name, deal.account, deal.contact, deal.email, deal.owner, deal.stage, deal.value, deal.close, deal.priority, deal.group, deal.note, deal.updated],
    );
  }
}

async function seedFullDemoCrm(tenantId) {
  const dealIds = [];
  for (const deal of demoDeals) {
    const result = await dbQuery(
      `insert into deals (tenant_id, name, account, contact, email, owner, stage, value, close_date, priority, deal_group, notes, updated_label)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning id`,
      [tenantId, deal.name, deal.account, deal.contact, deal.email, deal.owner, deal.stage, deal.value, deal.close, deal.priority, deal.group, deal.note, deal.updated],
    );
    dealIds.push(result.rows[0].id);
  }

  for (const task of demoTasks) {
    await dbQuery(
      `insert into activities (tenant_id, deal_id, title, type, owner, due_date, priority, completed)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, dealIds[task.dealIndex], task.title, task.type, task.owner, task.due, task.priority, task.completed],
    );
  }

  for (const communication of demoCommunications) {
    await dbQuery(
      `insert into communications (tenant_id, deal_id, type, direction, subject, body, owner, tracked, occurred_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantId, dealIds[communication.dealIndex], communication.type, communication.direction, communication.subject, communication.body, communication.owner, communication.tracked, communication.date],
    );
  }
}

async function seedMissingDemoDeals(tenantId) {
  const existing = await dbQuery(`select lower(email) as email from deals where tenant_id=$1`, [tenantId]);
  const existingEmails = new Set(existing.rows.map((row) => row.email));
  for (const deal of demoDeals) {
    if (existingEmails.has(deal.email.toLowerCase())) continue;
    await dbQuery(
      `insert into deals (tenant_id, name, account, contact, email, owner, stage, value, close_date, priority, deal_group, notes, updated_label)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [tenantId, deal.name, deal.account, deal.contact, deal.email, deal.owner, deal.stage, deal.value, deal.close, deal.priority, deal.group, deal.note, deal.updated],
    );
  }
}

async function upsertDealForTenant(tenantId, payload, dealId = "") {
  const values = normalizeDealPayload(payload);
  const validationError = validateDeal(values);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }
  if (dealId) {
    const result = await dbQuery(
      `update deals
       set name=$3, account=$4, contact=$5, email=nullif($6,'')::citext, phone=$7, owner=$8, stage=$9, value=$10,
           close_date=$11::date, priority=$12, deal_group=$13, tags=$14::jsonb, notes=$15, updated_label=$16, updated_at=now()
       where tenant_id=$1 and id=$2
       returning *`,
      [tenantId, dealId, values.name, values.account, values.contact, values.email, values.phone, values.owner, values.stage, values.value, values.close, values.priority, values.group, JSON.stringify(values.tags), values.note, values.updated],
    );
    if (result.rows[0]) await upsertContactTags(tenantId, values.tags);
    return result.rows[0] ? dealFromRow(result.rows[0]) : null;
  }
  const result = await dbQuery(
    `insert into deals
       (tenant_id, name, account, contact, email, phone, owner, stage, value, close_date, priority, deal_group, tags, notes, updated_label)
     values ($1,$2,$3,$4,nullif($5,'')::citext,$6,$7,$8,$9,$10::date,$11,$12,$13::jsonb,$14,$15)
     returning *`,
    [tenantId, values.name, values.account, values.contact, values.email, values.phone, values.owner, values.stage, values.value, values.close, values.priority, values.group, JSON.stringify(values.tags), values.note, values.updated],
  );
  await upsertContactTags(tenantId, values.tags);
  return dealFromRow(result.rows[0]);
}

async function upsertContactTags(tenantId, tags = []) {
  const normalized = normalizeTags(tags);
  for (const tag of normalized) {
    await dbQuery(
      `insert into contact_tags (tenant_id, name)
       values ($1,$2)
       on conflict (tenant_id, name) do nothing`,
      [tenantId, tag],
    );
  }
  return normalized;
}

async function createContactTagForTenant(tenantId, name) {
  const tag = normalizeTagName(name);
  if (!tag) {
    const error = new Error("Tag name is required.");
    error.statusCode = 400;
    throw error;
  }
  await upsertContactTags(tenantId, [tag]);
  const result = await dbQuery(`select name from contact_tags where tenant_id=$1 order by lower(name), name`, [tenantId]);
  return result.rows.map((row) => row.name);
}

async function upsertMailTemplateForTenant(tenantId, payload, templateId = "") {
  const values = normalizeMailTemplatePayload(payload);
  const validationError = validateMailTemplate(values);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }
  if (templateId) {
    const result = await dbQuery(
      `update mail_templates
       set name=$3, subject=$4, body=$5, updated_at=now()
       where tenant_id=$1 and id=$2
       returning *`,
      [tenantId, templateId, values.name, values.subject, values.body],
    );
    return result.rows[0] ? mailTemplateFromRow(result.rows[0]) : null;
  }
  const result = await dbQuery(
    `insert into mail_templates (tenant_id, name, subject, body)
     values ($1,$2,$3,$4)
     returning *`,
    [tenantId, values.name, values.subject, values.body],
  );
  return mailTemplateFromRow(result.rows[0]);
}

async function readState(auth) {
  const [tenantsResult, usersResult, dealsResult, tasksResult, communicationsResult, invitesResult, gmailResult, gmailSignalResult, linkedinResult, contactTagsResult, mailTemplatesResult, outgoingEmailResult, workflowAutomationResult, auditLogResult] = await Promise.all([
    dbQuery(`select * from tenants order by created_at`),
    dbQuery(`select * from users order by created_at`),
    dbQuery(`select * from deals order by created_at`),
    dbQuery(`select * from activities order by created_at`),
    dbQuery(`select * from communications order by occurred_at desc`),
    dbQuery(`select i.*, t.name tenant_name from invite_emails i join tenants t on t.id=i.tenant_id order by i.created_at desc limit 25`),
    dbQuery(`select * from gmail_integrations`),
    dbQuery(`select * from gmail_contact_signals order by created_at desc limit 500`),
    dbQuery(`select * from linkedin_integrations`),
    dbQuery(`select * from contact_tags order by lower(name), name`),
    dbQuery(`select * from mail_templates order by updated_at desc`),
    dbQuery(`select * from outgoing_email_settings`),
    dbQuery(`select * from workflow_automations`),
    auth.role === "platform_admin"
      ? dbQuery(`select a.*, t.name tenant_name from audit_logs a left join tenants t on t.id=a.tenant_id order by a.created_at desc limit 300`)
      : dbQuery(`select a.*, t.name tenant_name from audit_logs a left join tenants t on t.id=a.tenant_id where a.tenant_id=$1 order by a.created_at desc limit 100`, [auth.tenantId]),
  ]);
  const visibleTenants = auth.role === "platform_admin" ? tenantsResult.rows : tenantsResult.rows.filter((tenant) => tenant.id === auth.tenantId);
  return {
    tenants: visibleTenants.map((tenant) => tenantFromRow(
      tenant,
      usersResult.rows.filter((user) => user.tenant_id === tenant.id),
      dealsResult.rows.filter((deal) => deal.tenant_id === tenant.id),
      tasksResult.rows.filter((task) => task.tenant_id === tenant.id),
      communicationsResult.rows.filter((communication) => communication.tenant_id === tenant.id),
      gmailResult.rows.find((integration) => integration.tenant_id === tenant.id),
      gmailSignalResult.rows.filter((signal) => signal.tenant_id === tenant.id),
      linkedinResult.rows.find((integration) => integration.tenant_id === tenant.id),
      contactTagsResult.rows.filter((tag) => tag.tenant_id === tenant.id),
      mailTemplatesResult.rows.filter((template) => template.tenant_id === tenant.id),
      outgoingEmailResult.rows.find((settings) => settings.tenant_id === tenant.id),
      workflowAutomationResult.rows.find((settings) => settings.tenant_id === tenant.id),
    )),
    inviteEmails: auth.role === "platform_admin" ? invitesResult.rows.map(inviteFromRow) : [],
    auditLogs: auth.role === "platform_admin" ? auditLogResult.rows.map(auditLogFromRow) : [],
  };
}

function tenantFromRow(tenant, users, deals, tasks, communications, gmailIntegration, gmailSignals = [], linkedinIntegration = null, contactTags = [], mailTemplates = [], outgoingEmailSettings = null, workflowAutomation = null) {
  const normalizedDeals = deals.map(dealFromRow);
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    status: tenant.status,
    region: tenant.region,
    seats: tenant.seats,
    billingEmail: tenant.billing_email,
    mfaRequired: !!tenant.mfa_required,
    users: users.map(userFromRow),
    deals: normalizedDeals,
    tasks: tasks.map(taskFromRow),
    communications: communications.map(communicationFromRow),
    gmailIntegration: gmailIntegrationFromRow(gmailIntegration, gmailSignals),
    linkedinIntegration: linkedinIntegrationFromRow(linkedinIntegration),
    availableTags: availableContactTags(contactTags, normalizedDeals),
    mailTemplates: mailTemplates.map(mailTemplateFromRow),
    outgoingEmail: outgoingEmailSettingsFromRow(outgoingEmailSettings),
    workflowAutomation: workflowAutomationFromRow(workflowAutomation),
  };
}

function availableContactTags(contactTags = [], deals = []) {
  return [...new Set([
    ...contactTags.map((tag) => tag.name || tag),
    ...deals.flatMap((deal) => deal.tags || []),
  ].map(normalizeTagName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function userFromRow(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password: "",
    mustChangePassword: user.password_change_required,
    role: user.role,
    mfa: user.mfa_enabled,
    mfaConfirmed: user.mfa_confirmed,
    sso: !!user.google_subject,
  };
}

function dealFromRow(deal) {
  return {
    id: deal.id,
    name: deal.name,
    account: deal.account || "",
    contact: deal.contact || "",
    email: deal.email || "",
    phone: deal.phone || "",
    owner: deal.owner || "",
    stage: deal.stage,
    value: deal.value,
    close: deal.close_date ? deal.close_date.toISOString().slice(0, 10) : "",
    priority: deal.priority,
    group: deal.deal_group,
    tags: Array.isArray(deal.tags) ? deal.tags : [],
    note: deal.notes || "",
    updated: deal.updated_label,
  };
}

function taskFromRow(task) {
  return {
    id: task.id,
    dealId: task.deal_id,
    title: task.title,
    type: task.type,
    owner: task.owner || "",
    due: task.due_date ? task.due_date.toISOString().slice(0, 10) : "",
    priority: task.priority,
    completed: task.completed,
  };
}

function communicationFromRow(item) {
  return {
    id: item.id,
    dealId: item.deal_id,
    type: item.type,
    direction: item.direction,
    subject: item.subject,
    body: item.body || "",
    date: item.occurred_at.toISOString(),
    owner: item.owner || "",
    tracked: item.tracked || "",
    trackingStatus: item.tracking_status || item.tracked || "Logged",
    openedAt: item.opened_at ? item.opened_at.toISOString() : "",
    repliedAt: item.replied_at ? item.replied_at.toISOString() : "",
    gmailThreadId: item.gmail_thread_id || "",
    source: item.source || "crm",
  };
}

function mailTemplateFromRow(template) {
  return {
    id: template.id,
    name: template.name,
    subject: template.subject,
    body: template.body,
    updatedAt: template.updated_at ? template.updated_at.toISOString() : "",
  };
}

function outgoingEmailSettingsFromRow(row) {
  return {
    configured: !!row?.host,
    status: row?.status || "Not configured",
    host: row?.host || "",
    port: row?.port || 587,
    secure: !!row?.secure,
    username: row?.username || "",
    fromName: row?.from_name || "Zeptrix CRM",
    fromEmail: row?.from_email || "",
    passwordConfigured: !!row?.password_enc,
    updatedAt: row?.updated_at ? row.updated_at.toISOString() : "",
  };
}

function workflowAutomationFromRow(row) {
  return {
    ...DEFAULT_WORKFLOW_AUTOMATION,
    enabled: row?.enabled ?? DEFAULT_WORKFLOW_AUTOMATION.enabled,
    createFollowUpTasks: row?.create_follow_up_tasks ?? DEFAULT_WORKFLOW_AUTOMATION.createFollowUpTasks,
    tagRiskAccounts: row?.tag_risk_accounts ?? DEFAULT_WORKFLOW_AUTOMATION.tagRiskAccounts,
    riskTag: row?.risk_tag || DEFAULT_WORKFLOW_AUTOMATION.riskTag,
    dormantDueDays: row?.dormant_due_days || DEFAULT_WORKFLOW_AUTOMATION.dormantDueDays,
    attentionDueDays: row?.attention_due_days ?? DEFAULT_WORKFLOW_AUTOMATION.attentionDueDays,
    lastRunAt: row?.last_run_at ? row.last_run_at.toISOString() : "",
    lastRunSummary: row?.last_run_summary || {},
  };
}

function gmailIntegrationFromRow(row, signals = []) {
  return {
    enabled: !!row?.enabled,
    status: row?.status || "Not connected",
    accountEmail: row?.account_email || "",
    workspaceDomain: row?.workspace_domain || "zeptrix.io",
    clientId: row?.client_id || "",
    redirectUri: row?.redirect_uri || `${publicBaseUrl}/api/gmail/oauth/callback`,
    labels: row?.labels || "Inbox, Sent",
    gmailLookbackDays: row?.gmail_lookback_days || GMAIL_NEW_CONTACT_LOOKBACK_DAYS,
    staleMonths: row?.stale_months || 3,
    detectNewContacts: row?.detect_new_contacts ?? true,
    detectDormantContacts: row?.detect_dormant_contacts ?? true,
    lastScanAt: row?.last_scan_at ? row.last_scan_at.toISOString() : "",
    signals: signals.map(gmailSignalFromRow),
  };
}

function linkedinIntegrationFromRow(row) {
  return {
    enabled: !!row?.enabled,
    status: row?.status || "Not connected",
    companyPageUrl: row?.company_page_url || "",
    accountEmail: row?.account_email || "",
    syncContacts: row?.sync_contacts ?? true,
    syncCompanyUpdates: row?.sync_company_updates ?? false,
    updatedAt: row?.updated_at ? row.updated_at.toISOString() : "",
  };
}

function gmailSignalFromRow(row) {
  return {
    type: row.signal_type,
    email: row.email,
    name: row.name || "",
    account: row.account || "",
    phone: row.phone || extractPhone(row.source || ""),
    source: row.source || "",
    months: row.months || 0,
    messageId: row.message_id || "",
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : "",
  };
}

function inviteFromRow(invite) {
  return {
    id: invite.id,
    to: invite.recipient_email,
    tenantName: invite.tenant_name,
    temporaryPassword: "",
    sentAt: (invite.sent_at || invite.created_at).toISOString(),
    status: invite.status,
    messageId: invite.message_id,
    detail: invite.detail,
  };
}

function auditLogFromRow(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id || "",
    tenantName: row.tenant_name || "Unknown tenant",
    userEmail: row.user_email || "",
    userRole: row.user_role || "",
    eventType: row.event_type,
    operation: row.operation,
    target: row.target || "",
    details: row.details || {},
    createdAt: row.created_at ? row.created_at.toISOString() : "",
  };
}

async function recordServerAudit({ auth, tenantId, eventType = "server_mutation", operation, target = "", details = {} }) {
  if (!pool || !auth) return;
  try {
    await dbQuery(
      `insert into audit_logs (tenant_id, user_id, user_email, user_role, event_type, operation, target, details)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        tenantId || null,
        auth.userId || null,
        auth.email || "",
        auth.role || "",
        eventType,
        String(operation || "unknown").slice(0, 160),
        String(target || "").slice(0, 220),
        JSON.stringify(sanitizeAuditDetails(details)),
      ],
    );
  } catch (error) {
    console.log(`Audit log write failed for ${operation}: ${error.message}`);
  }
}

async function authenticateUser(email, password) {
  const result = await dbQuery(
    `select u.*, t.id tenant_id, t.name tenant_name, t.mfa_required tenant_mfa_required
     from users u join tenants t on t.id=u.tenant_id
     where lower(u.email)=lower($1) and u.password_hash=$2`,
    [email, hashPassword(password)],
  );
  const user = result.rows[0];
  if (!user) return null;
  await dbQuery(`update users set last_login_at=now() where id=$1`, [user.id]);
  return userAuthPayload(user);
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", authTokenSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySignedPayload(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", authTokenSecret).update(body).digest("base64url");
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp && payload.exp < Date.now()) return null;
  return payload;
}

function signAuthToken(user) {
  return signPayload({ userId: user.id, tenantId: user.tenantId, email: user.email, role: user.role, exp: Date.now() + 12 * 60 * 60 * 1000 });
}

function signPreAuthToken(user) {
  return signPayload({ purpose: "mfa", jti: crypto.randomUUID(), userId: user.id, tenantId: user.tenantId, email: user.email, role: user.role, exp: Date.now() + 10 * 60 * 1000 });
}

function verifyPreAuthToken(token) {
  const payload = verifySignedPayload(token);
  return payload?.purpose === "mfa" ? payload : null;
}

function signMfaRecoveryToken(user) {
  const payload = userAuthPayload(user);
  return signPayload({ purpose: "mfa-recovery", jti: crypto.randomUUID(), userId: payload.id, tenantId: payload.tenantId, email: payload.email, role: payload.role, exp: Date.now() + 30 * 60 * 1000 });
}

function verifyMfaRecoveryToken(token) {
  const payload = verifySignedPayload(token);
  return payload?.purpose === "mfa-recovery" ? payload : null;
}

function mfaChallengeKey(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("base64url");
}

function registerMfaAttempt(token) {
  const key = mfaChallengeKey(token);
  const existing = mfaAttemptsByChallenge.get(key) || { count: 0, firstAt: Date.now() };
  const next = Date.now() - existing.firstAt > 10 * 60 * 1000 ? { count: 1, firstAt: Date.now() } : { ...existing, count: existing.count + 1 };
  mfaAttemptsByChallenge.set(key, next);
  setTimeout(() => mfaAttemptsByChallenge.delete(key), 10 * 60 * 1000).unref?.();
  return next.count;
}

function authFromRequest(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return verifySignedPayload(token);
}

function requireAuth(req, res) {
  const auth = authFromRequest(req);
  if (!auth) {
    json(res, 401, { error: "Authentication required." });
    return null;
  }
  return auth;
}

function requirePlatformAdmin(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.role !== "platform_admin") {
    json(res, 403, { error: "Platform admin access required." });
    return null;
  }
  return auth;
}

async function resolveAuthorizedTenant(req, res, idOrSlug) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  const tenant = await dbQuery(`select id from tenants where id::text=$1 or slug=$1`, [idOrSlug]);
  if (!tenant.rows.length) {
    json(res, 404, { error: "Tenant not found." });
    return null;
  }
  const tenantId = tenant.rows[0].id;
  if (auth.role !== "platform_admin" && auth.tenantId !== tenantId) {
    json(res, 403, { error: "Tenant access denied." });
    return null;
  }
  return { auth, tenantId };
}

function safeGmailReturnOrigin(value) {
  const fallback = new URL(publicBaseUrl).origin;
  try {
    const origin = new URL(String(value || fallback)).origin;
    const allowed = new Set([
      fallback,
      "https://www.zeptrix.io",
      "https://zeptrix.io",
    ]);
    if (allowed.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  } catch {
    return fallback;
  }
  return fallback;
}

function signGmailState({ tenantId, userId, returnOrigin }) {
  return signPayload({ tenantId, userId, returnOrigin: safeGmailReturnOrigin(returnOrigin), exp: Date.now() + 10 * 60 * 1000 });
}

function signGoogleAuthState(mode = "login") {
  return signPayload({ purpose: "google-auth", mode: mode === "register" ? "register" : "login", exp: Date.now() + 10 * 60 * 1000 });
}

function verifyGoogleAuthState(token) {
  const payload = verifySignedPayload(token);
  return payload?.purpose === "google-auth" ? payload : null;
}

const googleAuthResults = new Map();

function storeGoogleAuthResult(payload) {
  const code = `${crypto.randomUUID()}-${crypto.randomBytes(12).toString("base64url")}`;
  googleAuthResults.set(code, { payload, exp: Date.now() + 2 * 60 * 1000 });
  setTimeout(() => googleAuthResults.delete(code), 2 * 60 * 1000).unref?.();
  return code;
}

function consumeGoogleAuthResult(code) {
  const entry = googleAuthResults.get(String(code || ""));
  googleAuthResults.delete(String(code || ""));
  if (!entry || entry.exp < Date.now()) return null;
  return entry.payload;
}

function userAuthPayload(user) {
  return {
    id: user.id,
    tenantId: user.tenant_id || user.tenantId,
    tenantName: user.tenant_name || user.tenantName,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantMfaRequired: !!(user.tenant_mfa_required ?? user.mfa_required ?? user.tenantMfaRequired),
    mustChangePassword: user.password_change_required ?? user.mustChangePassword,
    mfaEnabled: user.mfa_enabled ?? user.mfaEnabled,
    mfaConfirmed: user.mfa_confirmed ?? user.mfaConfirmed,
    sso: !!(user.google_subject || user.sso),
  };
}

function authChallengeForUser(user) {
  const payload = userAuthPayload(user);
  const mfaRequired = payload.role === "platform_admin" ? false : !!payload.tenantMfaRequired && !!payload.mfaEnabled;
  return {
    user: payload,
    preAuthToken: mfaRequired ? signPreAuthToken(payload) : "",
    mfaRequired,
    mfaSetupRequired: mfaRequired && !payload.mfaConfirmed,
    token: mfaRequired ? "" : signAuthToken(payload),
  };
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  let output = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += base32Alphabet[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(value = "") {
  const cleaned = String(value).replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const char of cleaned) {
    const index = base32Alphabet.indexOf(char);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totpCode(secret, time = Date.now()) {
  const counter = Math.floor(time / 30000);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
}

function verifyTotpCode(secret, code, window = 1) {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let step = -window; step <= window; step += 1) {
    const expected = totpCode(secret, Date.now() + step * 30000);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return true;
  }
  return false;
}

function authenticatorUri({ secret, email, issuer = "Zeptrix CRM" }) {
  const label = `${issuer}:${email}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function userById(userId) {
  const result = await dbQuery(
    `select u.*, t.id tenant_id, t.name tenant_name, t.mfa_required tenant_mfa_required
     from users u join tenants t on t.id=u.tenant_id
     where u.id=$1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function userByEmail(email) {
  if (!email) return null;
  const result = await dbQuery(
    `select u.*, t.id tenant_id, t.name tenant_name, t.mfa_required tenant_mfa_required
     from users u join tenants t on t.id=u.tenant_id
     where lower(u.email)=lower($1)
     limit 1`,
    [String(email).trim()],
  );
  return result.rows[0] || null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function normalizeGmailSettings(payload = {}) {
  const accountEmail = String(payload.accountEmail || "").trim();
  if (accountEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
    const error = new Error("Gmail account must be a valid email address.");
    error.statusCode = 400;
    throw error;
  }
  const inferredDomain = accountEmail.includes("@") ? accountEmail.split("@").pop() : "";
  return {
    accountEmail,
    workspaceDomain: String(payload.workspaceDomain || inferredDomain || "zeptrix.io").trim(),
    clientId: normalizeOAuthClientId(payload.clientId || googleClientId),
    redirectUri: `${publicBaseUrl}/api/gmail/oauth/callback`,
    labels: String(payload.labels || "Inbox, Sent").trim(),
    gmailLookbackDays: payload.gmailLookbackDays == null ? null : Math.max(1, Math.min(365, Number(payload.gmailLookbackDays || GMAIL_NEW_CONTACT_LOOKBACK_DAYS))),
    staleMonths: payload.staleMonths == null ? null : Math.max(1, Math.min(36, Number(payload.staleMonths || 3))),
    detectNewContacts: payload.detectNewContacts !== false,
    detectDormantContacts: payload.detectDormantContacts !== false,
  };
}

function normalizeOAuthClientId(value) {
  return String(value || "").replace(/\s+/g, "");
}

function isValidGoogleOAuthClientId(value) {
  return /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(value);
}

async function upsertGmailSettings(tenantId, payload) {
  const settings = normalizeGmailSettings(payload);
  const result = await dbQuery(
    `insert into gmail_integrations
       (tenant_id, account_email, workspace_domain, client_id, redirect_uri, labels, gmail_lookback_days, stale_months, detect_new_contacts, detect_dormant_contacts, status, updated_at)
     values ($1,$2,$3,$4,$5,$6,coalesce($7,${GMAIL_NEW_CONTACT_LOOKBACK_DAYS}),coalesce($8,3),$9,$10,'Settings saved',now())
     on conflict (tenant_id) do update set
       account_email=coalesce(nullif(excluded.account_email,''), gmail_integrations.account_email),
       workspace_domain=coalesce(nullif(excluded.workspace_domain,''), gmail_integrations.workspace_domain),
       client_id=excluded.client_id,
       redirect_uri=excluded.redirect_uri,
       labels=excluded.labels,
       gmail_lookback_days=coalesce($7,gmail_integrations.gmail_lookback_days),
       stale_months=coalesce($8,gmail_integrations.stale_months),
       detect_new_contacts=excluded.detect_new_contacts,
       detect_dormant_contacts=excluded.detect_dormant_contacts,
       status=case when gmail_integrations.enabled then 'Settings saved' else 'Not connected' end,
       updated_at=now()
     returning *`,
    [tenantId, settings.accountEmail, settings.workspaceDomain, settings.clientId, settings.redirectUri, settings.labels, settings.gmailLookbackDays, settings.staleMonths, settings.detectNewContacts, settings.detectDormantContacts],
  );
  return gmailIntegrationFromRow(result.rows[0], await readGmailSignals(tenantId));
}

function normalizeConfigurationSettings(payload = {}) {
  return {
    gmailLookbackDays: Math.max(1, Math.min(365, Number(payload.gmailLookbackDays || GMAIL_NEW_CONTACT_LOOKBACK_DAYS))),
    staleMonths: Math.max(1, Math.min(36, Number(payload.staleMonths || 3))),
    mfaRequired: payload.mfaRequired === true || payload.mfaRequired === "true" || payload.mfaRequired === "on",
  };
}

async function upsertConfigurationSettings(tenantId, payload) {
  const settings = normalizeConfigurationSettings(payload);
  const [tenantResult] = await Promise.all([
    dbQuery(`update tenants set mfa_required=$2, updated_at=now() where id=$1 returning *`, [tenantId, settings.mfaRequired]),
    dbQuery(`update users set mfa_enabled=$2 where tenant_id=$1 and role <> 'platform_admin'`, [tenantId, settings.mfaRequired]),
  ]);
  const result = await dbQuery(
    `insert into gmail_integrations (tenant_id, gmail_lookback_days, stale_months, status, updated_at)
     values ($1,$2,$3,'Configuration saved',now())
     on conflict (tenant_id) do update set
       gmail_lookback_days=excluded.gmail_lookback_days,
       stale_months=excluded.stale_months,
       status=case when gmail_integrations.enabled then gmail_integrations.status else gmail_integrations.status end,
       updated_at=now()
     returning *`,
    [tenantId, settings.gmailLookbackDays, settings.staleMonths],
  );
  return { tenant: tenantResult.rows[0], gmailIntegration: gmailIntegrationFromRow(result.rows[0], await readGmailSignals(tenantId)) };
}

function normalizeLinkedinSettings(payload = {}) {
  const accountEmail = String(payload.accountEmail || "").trim();
  if (accountEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
    const error = new Error("LinkedIn account email must be a valid email address.");
    error.statusCode = 400;
    throw error;
  }
  const companyPageUrl = String(payload.companyPageUrl || "").trim();
  if (companyPageUrl && !/^https:\/\/(www\.)?linkedin\.com\/(company|in)\/[^/\s]+\/?$/i.test(companyPageUrl)) {
    const error = new Error("LinkedIn URL must be a linkedin.com company or profile URL.");
    error.statusCode = 400;
    throw error;
  }
  return {
    companyPageUrl,
    accountEmail,
    syncContacts: payload.syncContacts !== false,
    syncCompanyUpdates: payload.syncCompanyUpdates === true || payload.syncCompanyUpdates === "true" || payload.syncCompanyUpdates === "on",
  };
}

async function upsertLinkedinSettings(tenantId, payload) {
  const settings = normalizeLinkedinSettings(payload);
  const result = await dbQuery(
    `insert into linkedin_integrations
       (tenant_id, company_page_url, account_email, sync_contacts, sync_company_updates, enabled, status, updated_at)
     values ($1,$2,$3,$4,$5,false,'Settings saved - LinkedIn OAuth is not connected yet',now())
     on conflict (tenant_id) do update set
       company_page_url=excluded.company_page_url,
       account_email=excluded.account_email,
       sync_contacts=excluded.sync_contacts,
       sync_company_updates=excluded.sync_company_updates,
       status='Settings saved - LinkedIn OAuth is not connected yet',
       updated_at=now()
     returning *`,
    [tenantId, settings.companyPageUrl, settings.accountEmail, settings.syncContacts, settings.syncCompanyUpdates],
  );
  return linkedinIntegrationFromRow(result.rows[0]);
}

async function upsertWorkflowAutomationSettings(tenantId, payload) {
  const settings = normalizeWorkflowAutomationSettings(payload);
  const result = await dbQuery(
    `insert into workflow_automations
       (tenant_id, enabled, create_follow_up_tasks, tag_risk_accounts, risk_tag, dormant_due_days, attention_due_days, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     on conflict (tenant_id) do update set
       enabled=excluded.enabled,
       create_follow_up_tasks=excluded.create_follow_up_tasks,
       tag_risk_accounts=excluded.tag_risk_accounts,
       risk_tag=excluded.risk_tag,
       dormant_due_days=excluded.dormant_due_days,
       attention_due_days=excluded.attention_due_days,
       updated_at=now()
     returning *`,
    [tenantId, settings.enabled, settings.createFollowUpTasks, settings.tagRiskAccounts, settings.riskTag, settings.dormantDueDays, settings.attentionDueDays],
  );
  return workflowAutomationFromRow(result.rows[0]);
}

async function upsertOutgoingEmailSettings(tenantId, payload) {
  const settings = normalizeOutgoingEmailSettings(payload);
  if (settings.error) {
    const error = new Error(settings.error);
    error.statusCode = 400;
    throw error;
  }
  const previous = await dbQuery(`select password_enc from outgoing_email_settings where tenant_id=$1`, [tenantId]);
  const passwordEnc = settings.password ? encryptToken(settings.password) : previous.rows[0]?.password_enc || null;
  if (!passwordEnc) {
    const error = new Error("Outgoing mail password is required.");
    error.statusCode = 400;
    throw error;
  }
  const result = await dbQuery(
    `insert into outgoing_email_settings
       (tenant_id, host, port, secure, username, password_enc, from_name, from_email, status, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'Settings saved',now())
     on conflict (tenant_id) do update set
       host=excluded.host,
       port=excluded.port,
       secure=excluded.secure,
       username=excluded.username,
       password_enc=excluded.password_enc,
       from_name=excluded.from_name,
       from_email=excluded.from_email,
       status='Settings saved',
       updated_at=now()
     returning *`,
    [tenantId, settings.host, settings.port, settings.secure, settings.username, passwordEnc, settings.fromName, settings.fromEmail],
  );
  return outgoingEmailSettingsFromRow(result.rows[0]);
}

async function sendCrmEmailForTenant(tenantId, auth, payload) {
  const message = normalizeOutgoingMailPayload(payload);
  if (message.error) {
    const error = new Error(message.error);
    error.statusCode = 400;
    throw error;
  }
  const settingsResult = await dbQuery(`select * from outgoing_email_settings where tenant_id=$1`, [tenantId]);
  const settings = settingsResult.rows[0];
  if (!settings?.password_enc) {
    const error = new Error("Outgoing email is not configured.");
    error.statusCode = 400;
    throw error;
  }
  const dealResult = message.dealId
    ? await dbQuery(`select id from deals where tenant_id=$1 and id=$2`, [tenantId, message.dealId])
    : { rows: [] };
  if (message.dealId && !dealResult.rows.length) {
    const error = new Error("Deal not found.");
    error.statusCode = 404;
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.username, pass: decryptToken(settings.password_enc) },
  });
  const response = await transporter.sendMail({
    from: `${settings.from_name || "Zeptrix CRM"} <${settings.from_email}>`,
    to: message.to,
    subject: message.subject,
    text: message.body,
  });
  const saved = await dbQuery(
    `insert into communications (tenant_id, deal_id, type, direction, subject, body, owner, tracked, tracking_status, source, occurred_at)
     values ($1,$2,'Email',$3,$4,$5,$6,$7,$8,'crm',now())
     returning *`,
    [tenantId, message.dealId, message.direction, message.subject, message.body, auth.name || auth.email || "", response.messageId ? `Sent · ${response.messageId}` : "Sent", response.messageId ? "Sent via SMTP" : "Sent"],
  );
  await dbQuery(`update outgoing_email_settings set status='Last email sent', updated_at=now() where tenant_id=$1`, [tenantId]);
  return { communication: communicationFromRow(saved.rows[0]), messageId: response.messageId || null };
}

function gmailAuthUrl({ tenantId, userId, clientId, redirectUri, accountEmail, returnOrigin }) {
  const normalizedClientId = normalizeOAuthClientId(clientId || googleClientId);
  if (!isValidGoogleOAuthClientId(normalizedClientId)) {
    throw new Error("Google OAuth client ID is not configured correctly.");
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", normalizedClientId);
  url.searchParams.set("redirect_uri", redirectUri || `${publicBaseUrl}/api/gmail/oauth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
  url.searchParams.set("state", signGmailState({ tenantId, userId, returnOrigin }));
  if (accountEmail) url.searchParams.set("login_hint", accountEmail);
  return url.toString();
}

function encryptToken(value) {
  if (!value) return "";
  const key = crypto.createHash("sha256").update(tokenSecret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value) {
  if (!value) return "";
  const [ivText, tagText, encryptedText] = value.split(".");
  const key = crypto.createHash("sha256").update(tokenSecret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

async function exchangeGmailCode({ code, clientId, redirectUri }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: googleClientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error || "Unable to exchange Gmail OAuth code.");
  return body;
}

async function refreshGmailAccessToken(integration) {
  if (!integration.refresh_token_enc) throw new Error("Gmail refresh token is missing. Reconnect Gmail.");
  const refreshClientId = integration.client_id || googleClientId;
  if (!refreshClientId) throw new Error("Google OAuth client ID is missing. Reconnect Gmail.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: decryptToken(integration.refresh_token_enc),
      client_id: refreshClientId,
      client_secret: googleClientSecret,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error || "Unable to refresh Gmail token.");
  const expiry = new Date(Date.now() + Number(body.expires_in || 3600) * 1000);
  await dbQuery(
    `update gmail_integrations set access_token_enc=$2, token_expiry=$3, updated_at=now() where tenant_id=$1`,
    [integration.tenant_id, encryptToken(body.access_token), expiry],
  );
  return body.access_token;
}

async function getGmailAccessToken(tenantId) {
  const result = await dbQuery(`select * from gmail_integrations where tenant_id=$1`, [tenantId]);
  const integration = result.rows[0];
  if (!integration) throw new Error("Gmail integration is not configured.");
  if (integration.access_token_enc && integration.token_expiry && integration.token_expiry > new Date(Date.now() + 60000)) return decryptToken(integration.access_token_enc);
  return refreshGmailAccessToken(integration);
}

async function gmailApi(accessToken, path, params = {}) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Gmail API request failed.");
  return body;
}

async function listGmailMessages(accessToken, params = {}, limit = GMAIL_NEW_CONTACT_METADATA_LIMIT) {
  const messages = [];
  let pageToken = "";
  while (messages.length < limit) {
    const page = await gmailApi(accessToken, "messages", { ...params, maxResults: Math.min(500, limit - messages.length), pageToken });
    messages.push(...(page.messages || []));
    pageToken = page.nextPageToken || "";
    if (!pageToken) break;
  }
  return { messages };
}

function gmailLabelQuery(labels = "") {
  const parts = String(labels || "")
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean)
    .filter((label) => label !== "sent")
    .map((label) => {
      if (label === "inbox") return "in:inbox";
      return `label:${label.replace(/\s+/g, "-")}`;
    });
  if (!parts.length) return "in:anywhere";
  return parts.length === 1 ? parts[0] : `{${parts.join(" ")}}`;
}

function gmailNewContactScope(labels = "") {
  const parts = String(labels || "")
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean)
    .filter((label) => label !== "sent");
  if (!parts.length || (parts.length === 1 && parts[0] === "inbox")) return "in:anywhere";
  return gmailLabelQuery(labels);
}

function parseEmailAddress(value = "") {
  const text = String(value).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { name: text.split("@")[0], email: text.toLowerCase() };
  const match = text.match(/^(?:"?([^"<]*)"?\s*)<([^<>\s]+@[^<>\s]+)>$/);
  if (!match) return null;
  const email = match[2].toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { name: (match[1] || email.split("@")[0]).trim(), email };
}

function isAutomatedSenderEmail(email = "") {
  const localPart = String(email).toLowerCase().split("@")[0] || "";
  const automatedLocalParts = new Set(["alerts", "newslater", "newsletter", "service", "help", "news", "info"]);
  return automatedLocalParts.has(localPart) || /(^|[._+-])(noo?-?reply|do-?not-?reply|donotreply|updates-?noreply)([._+-]|$)/i.test(localPart);
}

function decodeGmailBody(data = "") {
  if (!data) return "";
  try {
    return Buffer.from(String(data), "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function htmlToText(html = "") {
  return String(html)
    .replace(/<(br|\/p|\/div|\/li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function collectGmailBodyParts(part, collected = { plain: [], html: [] }) {
  if (!part) return collected;
  if (Array.isArray(part.parts)) part.parts.forEach((child) => collectGmailBodyParts(child, collected));
  if (part.filename) return collected;
  const data = part.body?.data;
  if (!data) return collected;
  if (part.mimeType === "text/plain") collected.plain.push(decodeGmailBody(data));
  if (part.mimeType === "text/html") collected.html.push(decodeGmailBody(data));
  return collected;
}

function extractGmailMessageText(message = {}) {
  const collected = collectGmailBodyParts(message.payload);
  const plain = collected.plain.map((part) => part.trim()).filter(Boolean).join("\n");
  if (plain) return plain;
  return collected.html.map(htmlToText).map((part) => part.trim()).filter(Boolean).join("\n");
}

function normalizeAttentionText(value = "") {
  return String(value || "").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
}

function detectNegativeCorrespondence(text = "") {
  const normalized = normalizeAttentionText(text);
  if (!normalized) return [];
  return [...new Set(NEGATIVE_CORRESPONDENCE_PHRASES.filter((phrase) => normalized.includes(normalizeAttentionText(phrase))))].slice(0, 12);
}

function stripQuotedReplies(text = "") {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const stopIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith(">")
      || /^On .+ wrote:$/i.test(trimmed)
      || /^From:\s/i.test(trimmed)
      || /^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed);
  });
  return (stopIndex >= 0 ? lines.slice(0, stopIndex) : lines).join("\n");
}

function normalizeSignatureLine(line = "") {
  return String(line).replace(/\s+/g, " ").replace(/^[|*-]+\s*/, "").trim();
}

function isSignatureNoise(line = "") {
  const value = normalizeSignatureLine(line);
  return !value
    || value.length > 90
    || /^sent from my /i.test(value)
    || /\b(confidential|privileged|unsubscribe|privacy policy|calendar|book a meeting)\b/i.test(value)
    || /^(twitter|facebook|linkedin|instagram)\b/i.test(value)
    || /^https?:\/\//i.test(value)
    || /^www\./i.test(value)
    || /^[-_=]{2,}$/.test(value);
}

function signatureCandidateLines(text = "") {
  const cleanedLines = stripQuotedReplies(text).replace(/\r\n?/g, "\n").split("\n");
  const delimiterIndex = cleanedLines.findLastIndex((line) => line.trim() === "--");
  const signoffIndex = cleanedLines.findLastIndex((line) => /^(thanks|thank you|best|regards|best regards|kind regards|sincerely|cheers)[,!.\s-]*$/i.test(line.trim()));
  const startIndex = Math.max(delimiterIndex, signoffIndex);
  const rawLines = (startIndex >= 0 ? cleanedLines.slice(startIndex + 1) : cleanedLines.slice(-10))
    .map(normalizeSignatureLine)
    .filter((line) => !isSignatureNoise(line))
    .slice(0, 14);
  return rawLines;
}

function looksLikePersonName(line = "") {
  const value = normalizeSignatureLine(line);
  if (!value || /[@\d:/]/.test(value) || /\b(inc|llc|ltd|corp|company|group|labs|systems|technologies|studio|software)\b/i.test(value)) return false;
  const words = value.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((word) => /^[A-Z][A-Za-z'.-]+$/.test(word));
}

function looksLikeTitle(line = "") {
  return /\b(ceo|cto|coo|cfo|founder|co-founder|president|vp|vice president|chief|officer|director|manager|head|lead|principal|partner|consultant|engineer|engineering|technology|sales|marketing|operations|product|success|support|revops|account executive)\b/i.test(normalizeSignatureLine(line));
}

function looksLikeCompany(line = "") {
  const value = normalizeSignatureLine(line);
  if (!value || /[@:]/.test(value) || looksLikeTitle(value) || looksLikePersonName(value)) return false;
  const words = value.split(/\s+/);
  return words.length <= 5 && (/\b(inc|llc|ltd|corp|company|group|labs|systems|technologies|studio|software|ai)\b/i.test(value) || /^[A-Z][A-Za-z0-9&'. -]+$/.test(value));
}

function extractPhone(line = "") {
  const match = normalizeSignatureLine(line).match(/(?:m|mobile|phone|tel|t)?:?\s*((?:\+?\d|\(\d{2,4}\))[\d ().-]{6,}\d)/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function isWeakHeaderName(name = "", email = "") {
  const localPart = String(email).split("@")[0].toLowerCase();
  const normalizedName = String(name).trim().toLowerCase();
  return !normalizedName || normalizedName === localPart || !/\s/.test(normalizedName);
}

function enrichGmailContactFromSignature(contact = {}, messageText = "") {
  const lines = signatureCandidateLines(messageText);
  const enriched = { ...contact, title: "", account: "", phone: "", source: "Inbound Gmail thread" };
  const nameLine = lines.find(looksLikePersonName);
  if (nameLine && isWeakHeaderName(enriched.name, enriched.email)) enriched.name = nameLine;
  enriched.title = lines.find(looksLikeTitle) || "";
  enriched.account = lines.find((line) => looksLikeCompany(line) && line !== enriched.title && line !== enriched.name) || "";
  enriched.phone = lines.map(extractPhone).find(Boolean) || "";
  if (nameLine || enriched.title || enriched.account || enriched.phone) enriched.source = "Inbound Gmail signature";
  return enriched;
}

function headerValue(message, name) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

async function mapLimit(items, limit, worker) {
  const results = [];
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      results.push(await worker(item));
    }
  }));
  return results;
}

async function readGmailSignals(tenantId) {
  const result = await dbQuery(`select * from gmail_contact_signals where tenant_id=$1 order by created_at desc limit 350`, [tenantId]);
  return result.rows;
}

function gmailContactSignalSource(item = {}) {
  const details = [item.title].filter(Boolean).join(" - ");
  return details ? `${item.source} - ${details}` : item.source;
}

function googleSsoConfigured() {
  return Boolean(googleClientId && googleClientSecret);
}

async function exchangeGoogleAuthCode(code, redirectUri = GOOGLE_SSO_REDIRECT_URI) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || "Google authorization failed.");
  return payload;
}

async function verifyGoogleIdentity(idToken) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const profile = await response.json();
  if (!response.ok) throw new Error(profile.error_description || profile.error || "Unable to verify Google identity.");
  if (profile.aud !== googleClientId) throw new Error("Google OAuth client mismatch.");
  if (profile.email_verified !== "true" && profile.email_verified !== true) throw new Error("Google account email is not verified.");
  return {
    subject: profile.sub,
    email: String(profile.email || "").toLowerCase(),
    name: profile.name || profile.email?.split("@")[0] || "Google user",
    picture: profile.picture || "",
    hostedDomain: profile.hd || "",
  };
}

async function findUserByGoogleIdentity(profile) {
  const result = await dbQuery(
    `select u.*, t.id tenant_id, t.name tenant_name, t.mfa_required tenant_mfa_required
     from users u join tenants t on t.id=u.tenant_id
     where u.google_subject=$1 or lower(u.email)=lower($2)
     order by case when u.google_subject=$1 then 0 else 1 end
     limit 1`,
    [profile.subject, profile.email],
  );
  return result.rows[0] || null;
}

async function createGoogleRegistration(profile) {
  const domain = profile.email.split("@")[1] || "workspace";
  const company = profile.hostedDomain ? profile.hostedDomain.split(".")[0] : domain.split(".")[0];
  const created = await withTransaction(async (client) => {
    const tenantRow = await insertTenantWithClient(client, {
      name: `${company.charAt(0).toUpperCase()}${company.slice(1)} Workspace`,
      slug: crypto.randomUUID(),
      plan: "Growth",
      status: "Trial",
      region: "US-East",
      seats: 3,
      billingEmail: profile.email,
    });
    const userRow = await insertUserWithClient(client, tenantRow.id, {
      name: profile.name,
      email: profile.email,
      password: generateTemporaryPassword(),
      role: "tenant_admin",
      mustChangePassword: false,
      sso: false,
      googleSubject: profile.subject,
    });
    return { tenantRow, userRow };
  });
  await notifyRegistration({
    tenantName: created.tenantRow.name,
    userName: created.userRow.name,
    userEmail: created.userRow.email,
    method: "Google SSO",
  });
  return { user: { ...created.userRow, tenant_name: created.tenantRow.name }, tenant: tenantFromRow(created.tenantRow, [created.userRow], [], [], []) };
}

function updateGmailScanProgress(scanId, patch) {
  if (!scanId) return;
  scanProgressById.set(scanId, { ...(scanProgressById.get(scanId) || {}), ...patch, updatedAt: new Date().toISOString() });
}

function finishGmailScanProgress(scanId, patch = {}) {
  if (!scanId) return;
  updateGmailScanProgress(scanId, { status: "complete", active: false, ...patch });
  setTimeout(() => scanProgressById.delete(scanId), 10 * 60 * 1000).unref?.();
}

function isoDateInDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

async function findDealForSignal(client, tenantId, signal) {
  const result = await client.query(
    `select * from deals
     where tenant_id=$1
       and (
         lower(email::text)=lower($2)
         or ($3<>'' and lower(account)=lower($3))
       )
     order by case when lower(email::text)=lower($2) then 0 else 1 end,
              case when stage in ('Won','Lost') then 1 else 0 end,
              updated_at desc
     limit 1`,
    [tenantId, signal.email || "", signal.account || ""],
  );
  return result.rows[0] || null;
}

async function insertWorkflowTaskIfMissing(client, tenantId, deal, task) {
  if (!deal?.id) return false;
  const existing = await client.query(
    `select id from activities
     where tenant_id=$1 and deal_id=$2 and title=$3 and completed=false
     limit 1`,
    [tenantId, deal.id, task.title],
  );
  if (existing.rows.length) return false;
  await client.query(
    `insert into activities (tenant_id, deal_id, title, type, owner, due_date, priority, completed)
     values ($1,$2,$3,$4,$5,$6::date,$7,false)`,
    [tenantId, deal.id, task.title, task.type, deal.owner || "", task.due, task.priority],
  );
  return true;
}

async function addRiskTagToAccountDeals(client, tenantId, account, riskTag) {
  if (!account || !riskTag) return 0;
  const result = await client.query(`select id, tags from deals where tenant_id=$1 and lower(account)=lower($2)`, [tenantId, account]);
  let updated = 0;
  for (const row of result.rows) {
    const tags = normalizeTags([...(Array.isArray(row.tags) ? row.tags : []), riskTag]);
    if (JSON.stringify(tags) === JSON.stringify(normalizeTags(row.tags || []))) continue;
    await client.query(`update deals set tags=$3::jsonb, updated_label='Workflow automation', updated_at=now() where tenant_id=$1 and id=$2`, [tenantId, row.id, JSON.stringify(tags)]);
    updated += 1;
  }
  if (updated) {
    await client.query(
      `insert into contact_tags (tenant_id, name)
       values ($1,$2)
       on conflict (tenant_id, name) do nothing`,
      [tenantId, riskTag],
    );
  }
  return updated;
}

async function applyWorkflowAutomationToGmailSignals(tenantId, { dormant = [], attentionCorrespondence = [] } = {}) {
  const settingsResult = await dbQuery(`select * from workflow_automations where tenant_id=$1`, [tenantId]);
  const settings = workflowAutomationFromRow(settingsResult.rows[0]);
  const summary = { tasksCreated: 0, accountsTagged: 0, dormantSignals: dormant.length, riskSignals: attentionCorrespondence.length };
  if (!settings.enabled) {
    await dbQuery(
      `insert into workflow_automations (tenant_id, enabled, last_run_at, last_run_summary)
       values ($1,$2,now(),$3::jsonb)
       on conflict (tenant_id) do update set last_run_at=now(), last_run_summary=$3::jsonb`,
      [tenantId, settings.enabled, JSON.stringify({ ...summary, skipped: "Automation disabled" })],
    );
    return { ...summary, skipped: "Automation disabled" };
  }
  await withTransaction(async (client) => {
    if (settings.createFollowUpTasks) {
      for (const signal of dormant.slice(0, 50)) {
        const deal = await findDealForSignal(client, tenantId, signal);
        if (!deal || ["Won", "Lost"].includes(deal.stage)) continue;
        const created = await insertWorkflowTaskIfMissing(client, tenantId, deal, {
          title: `Follow up with ${signal.name || signal.email} after ${signal.months || 3} months without email`,
          type: "Email",
          due: isoDateInDays(settings.dormantDueDays),
          priority: "Medium",
        });
        if (created) summary.tasksCreated += 1;
      }
      for (const signal of attentionCorrespondence.slice(0, 50)) {
        const deal = await findDealForSignal(client, tenantId, signal);
        if (!deal || ["Won", "Lost"].includes(deal.stage)) continue;
        const created = await insertWorkflowTaskIfMissing(client, tenantId, deal, {
          title: `Respond to risk email from ${signal.name || signal.email}`,
          type: "Email",
          due: isoDateInDays(settings.attentionDueDays),
          priority: "High",
        });
        if (created) summary.tasksCreated += 1;
      }
    }
    if (settings.tagRiskAccounts) {
      const accounts = [...new Set(attentionCorrespondence.map((signal) => signal.account).filter(Boolean))];
      for (const account of accounts) summary.accountsTagged += await addRiskTagToAccountDeals(client, tenantId, account, settings.riskTag);
    }
    await client.query(
      `insert into workflow_automations (tenant_id, enabled, create_follow_up_tasks, tag_risk_accounts, risk_tag, dormant_due_days, attention_due_days, last_run_at, last_run_summary)
       values ($1,$2,$3,$4,$5,$6,$7,now(),$8::jsonb)
       on conflict (tenant_id) do update set
         last_run_at=now(),
         last_run_summary=$8::jsonb,
         updated_at=workflow_automations.updated_at`,
      [tenantId, settings.enabled, settings.createFollowUpTasks, settings.tagRiskAccounts, settings.riskTag, settings.dormantDueDays, settings.attentionDueDays, JSON.stringify(summary)],
    );
  });
  return summary;
}

async function scanGmailForTenant(tenantId, { scanId = "" } = {}) {
  const integrationResult = await dbQuery(`select * from gmail_integrations where tenant_id=$1`, [tenantId]);
  const integration = integrationResult.rows[0];
  if (!integration?.enabled) throw new Error("Gmail is not connected.");
  updateGmailScanProgress(scanId, { active: true, status: "listing", scannedMessages: 0, totalMessages: 0, startedAt: new Date().toISOString() });
  const accessToken = await getGmailAccessToken(tenantId);
  const staleMonths = Math.max(1, Number(integration.stale_months || 3));
  const gmailLookbackDays = Math.max(1, Math.min(365, Number(integration.gmail_lookback_days || GMAIL_NEW_CONTACT_LOOKBACK_DAYS)));
  const [dealsResult, blacklistResult, inboundList] = await Promise.all([
    dbQuery(`select distinct on (lower(email)) id, lower(email) email, contact, account from deals where tenant_id=$1 and email is not null and email<>'' order by lower(email), updated_at desc`, [tenantId]),
    dbQuery(`select lower(email::text) email from gmail_contact_blacklist where tenant_id=$1`, [tenantId]),
    listGmailMessages(accessToken, { q: `${gmailNewContactScope(integration.labels)} newer_than:${gmailLookbackDays}d -in:sent` }, GMAIL_NEW_CONTACT_METADATA_LIMIT),
  ]);
  const knownEmails = new Set(dealsResult.rows.map((row) => row.email));
  const blacklistedEmails = new Set(blacklistResult.rows.map((row) => row.email));
  const inboundCandidates = (inboundList.messages || []).slice(0, GMAIL_NEW_CONTACT_METADATA_LIMIT);
  let scannedMessages = 0;
  updateGmailScanProgress(scanId, { status: "scanning", totalMessages: inboundCandidates.length, scannedMessages });
  const inboundMetadata = await mapLimit(inboundCandidates, 8, async (message) => {
    const metadata = await gmailApi(accessToken, `messages/${message.id}`, { format: "metadata", metadataHeaders: "From" });
    scannedMessages += 1;
    updateGmailScanProgress(scanId, { status: "scanning", totalMessages: inboundCandidates.length, scannedMessages });
    return metadata;
  });
  const unknownMetadata = [];
  const seenNew = new Set();
  if (integration.detect_new_contacts) {
    for (const message of inboundMetadata) {
      const parsed = parseEmailAddress(headerValue(message, "From"));
      if (!parsed || isAutomatedSenderEmail(parsed.email) || knownEmails.has(parsed.email) || blacklistedEmails.has(parsed.email) || seenNew.has(parsed.email)) continue;
      seenNew.add(parsed.email);
      unknownMetadata.push({ ...message, parsed });
    }
  }
  updateGmailScanProgress(scanId, { status: "enriching", totalMessages: inboundCandidates.length, scannedMessages, candidatesFound: unknownMetadata.length });
  const fullInboundMessages = (await mapLimit(inboundMetadata.slice(0, GMAIL_NEW_CONTACT_FULL_LIMIT), 6, async (message) => {
    try {
      return {
        parsed: parseEmailAddress(headerValue(message, "From")),
        full: await gmailApi(accessToken, `messages/${message.id}`, { format: "full" }),
      };
    } catch (error) {
      console.log(`Skipping Gmail full message ${message.id} for tenant ${tenantId}: ${error.message}`);
      return null;
    }
  })).filter(Boolean);
  const fullByMessageId = new Map(fullInboundMessages.map((message) => [message.full.id, message]));
  const inboundMessages = unknownMetadata
    .slice(0, GMAIL_NEW_CONTACT_FULL_LIMIT)
    .map((message) => fullByMessageId.get(message.id))
    .filter(Boolean)
    .map((message) => ({ ...message, parsed: message.parsed }));

  const newContacts = [];
  for (const message of inboundMessages) {
    newContacts.push({ ...enrichGmailContactFromSignature(message.parsed, extractGmailMessageText(message.full)), messageId: message.full.id });
  }
  const dealByEmail = new Map(dealsResult.rows.map((row) => [row.email, row]));
  const attentionCorrespondence = fullInboundMessages
    .map((message) => {
      if (!message.parsed || isAutomatedSenderEmail(message.parsed.email)) return null;
      const text = extractGmailMessageText(message.full);
      const matches = detectNegativeCorrespondence(`${message.full.snippet || ""}\n${text}`);
      if (!matches.length) return null;
      const deal = dealByEmail.get(message.parsed.email);
      return {
        email: message.parsed.email,
        name: deal?.contact || message.parsed.name || message.parsed.email.split("@")[0],
        account: deal?.account || message.parsed.email.split("@")[1],
        source: `Matched: ${matches.join(", ")}`,
        messageId: message.full.id,
      };
    })
    .filter(Boolean);
  const gmailAccountThreads = fullInboundMessages
    .map((message) => {
      if (!message.parsed || isAutomatedSenderEmail(message.parsed.email)) return null;
      const deal = dealByEmail.get(message.parsed.email);
      if (!deal) return null;
      const text = extractGmailMessageText(message.full).slice(0, 1800);
      return {
        deal,
        email: message.parsed.email,
        name: deal.contact || message.parsed.name || message.parsed.email.split("@")[0],
        subject: headerValue(message.full, "Subject") || message.full.snippet || "Gmail conversation",
        body: text || message.full.snippet || "Imported from Gmail scan.",
        messageId: message.full.id,
        threadId: message.full.threadId || message.full.id,
        internalDate: Number(message.full.internalDate || 0),
      };
    })
    .filter(Boolean);
  const latestGmailAccountThreads = [...gmailAccountThreads.reduce((threads, item) => {
    const existing = threads.get(item.threadId);
    if (!existing || item.internalDate >= existing.internalDate) threads.set(item.threadId, item);
    return threads;
  }, new Map()).values()];

  const dormantChecks = integration.detect_dormant_contacts
    ? await mapLimit(dealsResult.rows.slice(0, 50), 6, async (row) => {
      try {
        const sent = await gmailApi(accessToken, "messages", { q: `in:sent to:${row.email} newer_than:${staleMonths}m`, maxResults: 1 });
        return sent.messages?.length ? null : { email: row.email, name: row.contact || row.email.split("@")[0], account: row.account || "", months: staleMonths, source: `No sent Gmail in ${staleMonths} months` };
      } catch (error) {
        console.log(`Skipping Gmail dormant check for ${row.email} in tenant ${tenantId}: ${error.message}`);
        return null;
      }
    })
    : [];
  const dormant = dormantChecks.filter(Boolean);

  await withTransaction(async (client) => {
    await client.query(`delete from gmail_contact_signals where tenant_id=$1`, [tenantId]);
    for (const item of newContacts.slice(0, GMAIL_NEW_CONTACT_SIGNAL_LIMIT)) {
      await client.query(
        `insert into gmail_contact_signals (tenant_id, signal_type, email, name, account, phone, source, message_id, last_seen_at)
         values ($1,'new_contact',$2,$3,$4,$5,$6,$7,now())
         on conflict (tenant_id, signal_type, email) do update set
           name=excluded.name,
           account=excluded.account,
           phone=excluded.phone,
           source=excluded.source,
           message_id=excluded.message_id,
           last_seen_at=excluded.last_seen_at,
           created_at=now()`,
        [tenantId, item.email, item.name, item.account || "", item.phone || "", gmailContactSignalSource(item), item.messageId],
      );
    }
    for (const item of dormant.slice(0, 50)) {
      await client.query(
        `insert into gmail_contact_signals (tenant_id, signal_type, email, name, account, source, months, last_seen_at)
         values ($1,'dormant_contact',$2,$3,$4,$5,$6,now())
         on conflict (tenant_id, signal_type, email) do update set
           name=excluded.name,
           account=excluded.account,
           source=excluded.source,
           months=excluded.months,
           last_seen_at=excluded.last_seen_at,
           created_at=now()`,
        [tenantId, item.email, item.name, item.account, item.source, item.months],
      );
    }
    for (const item of attentionCorrespondence.slice(0, GMAIL_ATTENTION_SIGNAL_LIMIT)) {
      await client.query(
        `insert into gmail_contact_signals (tenant_id, signal_type, email, name, account, source, message_id, last_seen_at)
         values ($1,'attention_correspondence',$2,$3,$4,$5,$6,now())
         on conflict (tenant_id, signal_type, email) do update set
           name=excluded.name,
           account=excluded.account,
           source=excluded.source,
           message_id=excluded.message_id,
           last_seen_at=excluded.last_seen_at,
           created_at=now()`,
        [tenantId, item.email, item.name, item.account, item.source, item.messageId],
      );
    }
    for (const item of latestGmailAccountThreads.slice(0, 75)) {
      await client.query(
        `with updated as (
           update communications
              set deal_id=$2,
                  subject=$3,
                  body=$4,
                  owner=$5,
                  tracked=$6,
                  tracking_status=$7,
                  replied_at=now(),
                  occurred_at=to_timestamp($9 / 1000.0)
            where tenant_id=$1 and gmail_thread_id=$8
            returning id
         )
         insert into communications
           (tenant_id, deal_id, type, direction, subject, body, owner, tracked, tracking_status, replied_at, gmail_thread_id, source, occurred_at)
         select $1,$2,'Email','inbound',$3,$4,$5,$6,$7,now(),$8,'gmail',to_timestamp($9 / 1000.0)
          where not exists (select 1 from updated)`,
        [tenantId, item.deal.id, item.subject, item.body, item.name, `Gmail thread · ${item.threadId}`, "Imported from Gmail", item.threadId, item.internalDate || Date.now()],
      );
    }
    await client.query(`update gmail_integrations set last_scan_at=now(), status='Last scan completed', updated_at=now() where tenant_id=$1`, [tenantId]);
  });
  let automationSummary = null;
  try {
    automationSummary = await applyWorkflowAutomationToGmailSignals(tenantId, { dormant: dormant.slice(0, 50), attentionCorrespondence: attentionCorrespondence.slice(0, GMAIL_ATTENTION_SIGNAL_LIMIT) });
  } catch (error) {
    console.log(`Gmail scan completed but workflow automation failed for tenant ${tenantId}: ${error.message}`);
    automationSummary = { tasksCreated: 0, accountsTagged: 0, error: error.message };
  }
  const result = { newContacts: newContacts.slice(0, GMAIL_NEW_CONTACT_SIGNAL_LIMIT), dormantContacts: dormant.slice(0, 50), attentionCorrespondence: attentionCorrespondence.slice(0, GMAIL_ATTENTION_SIGNAL_LIMIT), automationSummary, scannedMessages: inboundMetadata.length + dormantChecks.length };
  finishGmailScanProgress(scanId, { scannedMessages: inboundMetadata.length, totalMessages: inboundCandidates.length, candidatesFound: newContacts.length, attentionFound: attentionCorrespondence.length, automationSummary });
  return result;
}

async function handleApi(req, res) {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/state") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const auth = requireAuth(req, res);
      if (!auth) return;
      return json(res, 200, await readState(auth));
    } catch (error) {
      return json(res, 500, { error: "Unable to read state.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/audit") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const auth = requireAuth(req, res);
      if (!auth) return;
      const body = await readBody(req);
      const tenantId = auth.role === "platform_admin"
        ? String(body.tenantId || auth.tenantId || "").trim()
        : auth.tenantId;
      if (!tenantId) return json(res, 400, { error: "Tenant is required for audit logging." });
      if (auth.role !== "platform_admin" && tenantId !== auth.tenantId) return json(res, 403, { error: "Tenant access denied." });
      const tenant = await dbQuery(`select id, name from tenants where id::text=$1 or slug=$1`, [tenantId]);
      if (!tenant.rows.length) return json(res, 404, { error: "Tenant not found." });
      const details = typeof body.details === "object" && body.details ? body.details : {};
      if (Buffer.byteLength(JSON.stringify(details), "utf8") > 50_000) return json(res, 413, { error: "Audit details are too large." });
      const sanitizedDetails = sanitizeAuditDetails(details);
      const result = await dbQuery(
        `insert into audit_logs (tenant_id, user_id, user_email, user_role, event_type, operation, target, details)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         returning *`,
        [
          tenant.rows[0].id,
          auth.userId || null,
          auth.email || "",
          auth.role || "",
          String(body.eventType || "ui_event").slice(0, 80),
          String(body.operation || "unknown").slice(0, 160),
          String(body.target || "").slice(0, 220),
          JSON.stringify(sanitizedDetails),
        ],
      );
      return json(res, 201, { auditLog: auditLogFromRow({ ...result.rows[0], tenant_name: tenant.rows[0].name }) });
    } catch (error) {
      return json(res, 500, { error: "Unable to write audit log.", detail: error.message });
    }
  }

  if (req.method === "GET" && pathname === "/api/auth/google/start") {
    if (!googleSsoConfigured()) return json(res, 503, { error: "Google SSO is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    const mode = requestUrl.searchParams.get("mode") === "register" ? "register" : "login";
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", googleClientId);
    url.searchParams.set("redirect_uri", GOOGLE_SSO_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("state", signGoogleAuthState(mode));
    res.writeHead(302, { location: url.toString() });
    return res.end();
  }

  if (req.method === "GET" && pathname === "/api/auth/google/callback") {
    const redirect = new URL("/crm/", publicBaseUrl);
    try {
      if (!pool) throw new Error("DATABASE_URL is not configured.");
      if (!googleSsoConfigured()) throw new Error("Google SSO is not configured.");
      const state = verifyGoogleAuthState(requestUrl.searchParams.get("state"));
      if (!state) throw new Error("Google sign-in state expired. Please try again.");
      const code = requestUrl.searchParams.get("code");
      if (!code) throw new Error(requestUrl.searchParams.get("error") || "Google authorization did not return a code.");
      const token = await exchangeGoogleAuthCode(code);
      const profile = await verifyGoogleIdentity(token.id_token);
      let user = await findUserByGoogleIdentity(profile);
      let tenant = null;
      if (!user && state.mode !== "register") throw new Error(`No Zeptrix CRM account exists for ${profile.email}. Use Register with Google first.`);
      if (!user) {
        const created = await createGoogleRegistration(profile);
        user = created.user;
        tenant = created.tenant;
      } else if (!user.google_subject) {
        await dbQuery(`update users set google_subject=$2 where id=$1`, [user.id, profile.subject]);
        user.google_subject = profile.subject;
      }
      const challenge = authChallengeForUser(user);
      redirect.searchParams.set("googleCode", storeGoogleAuthResult({ ...challenge, tenant }));
    } catch (error) {
      redirect.searchParams.set("authError", error.message);
    }
    res.writeHead(302, { location: redirect.toString() });
    return res.end();
  }

  if (req.method === "POST" && pathname === "/api/auth/google/exchange") {
    try {
      const { code } = await readBody(req);
      const payload = consumeGoogleAuthResult(code);
      if (!payload) return json(res, 401, { error: "Google sign-in session expired. Please try again." });
      return json(res, 200, payload);
    } catch (error) {
      return json(res, 500, { error: "Unable to complete Google sign-in.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { email, password } = await readBody(req);
      const user = await authenticateUser(email, password);
      if (!user) return json(res, 401, { error: "Invalid email or password." });
      return json(res, 200, authChallengeForUser(user));
    } catch (error) {
      return json(res, 500, { error: "Unable to log in.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/forgot-password") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { email } = await readBody(req);
      const user = await userByEmail(email);
      if (user) {
        const temporaryPassword = generateTemporaryPassword();
        await dbQuery(
          `update users set password_hash=$2, password_change_required=true where id=$1`,
          [user.id, hashPassword(temporaryPassword)],
        );
        const content = passwordResetEmailContent({ to: user.email, tenantName: user.tenant_name, temporaryPassword });
        const mail = await sendTransactionalEmail({ to: user.email, ...content });
        if (mail.status !== "sent") console.log(`Password reset email for ${user.email} was not sent: ${mail.detail}`);
      }
      return json(res, 200, { ok: true, message: "If an account exists for that email, password reset instructions were sent." });
    } catch (error) {
      console.log(`Password reset request failed: ${error.message}`);
      return json(res, 200, { ok: true, message: "If an account exists for that email, password reset instructions were sent." });
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/mfa/recovery-request") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { email } = await readBody(req);
      const user = await userByEmail(email);
      if (user) {
        const recoveryUrl = new URL(appBaseUrl);
        recoveryUrl.searchParams.set("mfaRecovery", signMfaRecoveryToken(user));
        const content = mfaRecoveryEmailContent({ to: user.email, tenantName: user.tenant_name, recoveryUrl: recoveryUrl.toString() });
        const mail = await sendTransactionalEmail({ to: user.email, ...content });
        if (mail.status !== "sent") console.log(`MFA recovery email for ${user.email} was not sent: ${mail.detail}`);
      }
      return json(res, 200, { ok: true, message: "If an account exists for that email, authenticator recovery instructions were sent." });
    } catch (error) {
      console.log(`MFA recovery request failed: ${error.message}`);
      return json(res, 200, { ok: true, message: "If an account exists for that email, authenticator recovery instructions were sent." });
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/mfa/recovery-confirm") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { token } = await readBody(req);
      const recovery = verifyMfaRecoveryToken(token);
      if (!recovery) return json(res, 401, { error: "Authenticator recovery link expired. Please request a new link." });
      const user = await userById(recovery.userId);
      if (!user || String(user.email).toLowerCase() !== String(recovery.email).toLowerCase()) return json(res, 401, { error: "Authenticator recovery link is no longer valid." });
      await dbQuery(
        `update users set mfa_secret_enc=null, mfa_confirmed=false, mfa_enabled=true where id=$1`,
        [user.id],
      );
      return json(res, 200, { ok: true, requiresLogin: true, message: "Authenticator reset. Sign in with your password to configure a new authenticator." });
    } catch (error) {
      return json(res, 500, { error: "Unable to configure authenticator recovery.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const values = normalizeRegistrationPayload(await readBody(req));
      if (values.error) return json(res, 400, { error: values.error });
      const duplicate = await dbQuery(
        `select
           (select name from tenants where slug=$1 limit 1) as slug_tenant_name,
           (select t.name
            from users u join tenants t on t.id=u.tenant_id
            where lower(u.email)=lower($2)
            limit 1) as email_tenant_name`,
        [values.slug, values.email],
      );
      if (duplicate.rows[0].slug_tenant_name) return json(res, 409, { error: `Workspace ID "${values.slug}" is already used by ${duplicate.rows[0].slug_tenant_name}.` });
      if (duplicate.rows[0].email_tenant_name) return json(res, 409, { error: `An account for ${values.email} already exists in ${duplicate.rows[0].email_tenant_name}.` });

      const created = await withTransaction(async (client) => {
        const tenantRow = await insertTenantWithClient(client, {
          name: values.company,
          slug: values.slug,
          plan: values.plan,
          status: values.status,
          region: values.region,
          seats: values.seats,
          billingEmail: values.email,
        });
        const userRow = await insertUserWithClient(client, tenantRow.id, {
          name: values.fullName,
          email: values.email,
          password: values.password,
          role: "tenant_admin",
          mustChangePassword: false,
          sso: false,
        });
        return { tenantRow, userRow };
      });
      const user = {
        id: created.userRow.id,
        tenantId: created.tenantRow.id,
        tenantName: created.tenantRow.name,
        name: created.userRow.name,
        email: created.userRow.email,
        role: created.userRow.role,
        mustChangePassword: false,
      };
      await notifyRegistration({
        tenantName: created.tenantRow.name,
        userName: created.userRow.name,
        userEmail: created.userRow.email,
        method: "Email/password",
      });
      return json(res, 201, { ...authChallengeForUser({ ...created.userRow, tenant_name: created.tenantRow.name }), tenant: tenantFromRow(created.tenantRow, [created.userRow], [], [], []) });
    } catch (error) {
      return json(res, 500, { error: "Unable to register workspace.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/mfa/setup") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { preAuthToken } = await readBody(req);
      const preAuth = verifyPreAuthToken(preAuthToken);
      if (!preAuth) return json(res, 401, { error: "MFA setup session expired. Please sign in again." });
      const user = await userById(preAuth.userId);
      if (!user) return json(res, 404, { error: "User not found." });
      let secret = user.mfa_secret_enc ? decryptToken(user.mfa_secret_enc) : "";
      if (!secret || user.mfa_confirmed) {
        secret = generateTotpSecret();
        await dbQuery(`update users set mfa_secret_enc=$2, mfa_confirmed=false, mfa_enabled=true where id=$1`, [user.id, encryptToken(secret)]);
      }
      const otpauth = authenticatorUri({ secret, email: user.email });
      return json(res, 200, {
        secret,
        otpauth,
        qrUrl: await QRCode.toDataURL(otpauth, { errorCorrectionLevel: "M", margin: 1, width: 220 }),
      });
    } catch (error) {
      return json(res, 500, { error: "Unable to prepare MFA setup.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/mfa/verify") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { preAuthToken, code } = await readBody(req);
      const preAuth = verifyPreAuthToken(preAuthToken);
      if (!preAuth) return json(res, 401, { error: "MFA session expired. Please sign in again." });
      const challengeKey = mfaChallengeKey(preAuthToken);
      if (consumedMfaChallenges.has(challengeKey)) return json(res, 401, { error: "MFA session already used. Please sign in again." });
      if (registerMfaAttempt(preAuthToken) > 5) return json(res, 429, { error: "Too many MFA attempts. Please sign in again." });
      const user = await userById(preAuth.userId);
      if (!user) return json(res, 404, { error: "User not found." });
      const secret = user.mfa_secret_enc ? decryptToken(user.mfa_secret_enc) : "";
      if (!secret || !verifyTotpCode(secret, code)) return json(res, 401, { error: "Invalid authenticator code." });
      await dbQuery(`update users set mfa_confirmed=true, mfa_enabled=true, last_login_at=now() where id=$1`, [user.id]);
      consumedMfaChallenges.add(challengeKey);
      mfaAttemptsByChallenge.delete(challengeKey);
      setTimeout(() => consumedMfaChallenges.delete(challengeKey), 10 * 60 * 1000).unref?.();
      const authUser = userAuthPayload({ ...user, mfa_confirmed: true, mfa_enabled: true });
      return json(res, 200, { user: authUser, token: signAuthToken(authUser) });
    } catch (error) {
      return json(res, 500, { error: "Unable to verify MFA.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/change-password") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const auth = requireAuth(req, res);
      if (!auth) return;
      const { email, password } = await readBody(req);
      if (!email || !password || String(password).length < 10) return json(res, 400, { error: "Password must be at least 10 characters." });
      if (String(auth.email || "").toLowerCase() !== String(email).toLowerCase()) return json(res, 403, { error: "Password can only be changed by the authenticated user." });
      await dbQuery(`update users set password_hash=$2, password_change_required=false where lower(email)=lower($1)`, [email, hashPassword(password)]);
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 500, { error: "Unable to change password.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/tenants") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const auth = requirePlatformAdmin(req, res);
      if (!auth) return;
      const payload = normalizeTenantPayload(await readBody(req));
      const validationError = validateTenant(payload);
      if (validationError) return json(res, 400, { error: validationError });

      const slug = slugify(payload.slug);
      const duplicate = await dbQuery(
        `select
           (select name from tenants where slug=$1 limit 1) as slug_tenant_name,
           (select t.name
            from users u join tenants t on t.id=u.tenant_id
            where lower(u.email)=lower($2)
            limit 1) as email_tenant_name,
           (select u.role
            from users u
            where lower(u.email)=lower($2)
            limit 1) as email_user_role`,
        [slug, payload.ownerEmail],
      );
      if (duplicate.rows[0].slug_tenant_name) {
        return json(res, 409, { error: `Workspace slug "${slug}" is already used by ${duplicate.rows[0].slug_tenant_name}.` });
      }
      if (duplicate.rows[0].email_tenant_name) {
        return json(res, 409, { error: duplicateTenantEmailMessage(payload.ownerEmail, duplicate.rows[0].email_tenant_name, duplicate.rows[0].email_user_role) });
      }

      const temporaryPassword = generateTemporaryPassword();
      const created = await withTransaction(async (client) => {
        const tenantRow = await insertTenantWithClient(client, { ...payload, slug });
        const userRow = await insertUserWithClient(client, tenantRow.id, { name: payload.name, email: payload.ownerEmail, password: temporaryPassword, role: "tenant_admin", mustChangePassword: true, sso: true });
        return { tenantRow, userRow };
      });
      const inviteEmail = await sendAndRecordInvite({
        tenantId: created.tenantRow.id,
        tenantName: payload.name,
        to: payload.ownerEmail,
        temporaryPassword,
      });
      await recordServerAudit({ auth, tenantId: created.tenantRow.id, operation: "create-tenant", target: `tenant:${created.tenantRow.id}`, details: { fields: payload } });

      return json(res, 201, {
        tenant: tenantFromRow(created.tenantRow, [created.userRow], [], [], []),
        inviteEmail,
      });
    } catch (error) {
      return json(res, 502, { error: "Unable to create tenant or send invite.", detail: error.message });
    }
  }

  if (req.method === "POST" && /^\/api\/tenants\/[^/]+\/deals$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-2));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const deal = await upsertDealForTenant(resolved.tenantId, payload);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "create-deal", target: `deal:${deal.id}`, details: { fields: payload } });
      return json(res, 201, { deal });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save contact or deal.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "PUT" && /^\/api\/tenants\/[^/]+\/deals\/[^/]+$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const parts = pathname.split("/");
      const tenantId = decodeURIComponent(parts.at(-3));
      const dealId = decodeURIComponent(parts.at(-1));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const deal = await upsertDealForTenant(resolved.tenantId, payload, dealId);
      if (!deal) return json(res, 404, { error: "Deal not found." });
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "update-deal", target: `deal:${deal.id}`, details: { fields: payload } });
      return json(res, 200, { deal });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to update contact or deal.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "DELETE" && /^\/api\/tenants\/[^/]+\/deals\/[^/]+$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const parts = pathname.split("/");
      const tenantId = decodeURIComponent(parts.at(-3));
      const dealId = decodeURIComponent(parts.at(-1));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const result = await dbQuery(`delete from deals where tenant_id=$1 and id=$2 returning id`, [resolved.tenantId, dealId]);
      if (!result.rows.length) return json(res, 404, { error: "Deal not found." });
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "delete-deal", target: `deal:${result.rows[0].id}` });
      return json(res, 200, { ok: true, id: result.rows[0].id });
    } catch (error) {
      return json(res, 500, { error: "Unable to delete contact or deal.", detail: error.message });
    }
  }

  if (req.method === "POST" && /^\/api\/tenants\/[^/]+\/tags$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-2));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const body = await readBody(req);
      const tags = await createContactTagForTenant(resolved.tenantId, body.name || body.tag);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "create-tag", target: `tag:${String(body.name || body.tag || "").slice(0, 80)}`, details: { fields: body } });
      return json(res, 201, { tags });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save tag.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "POST" && /^\/api\/tenants\/[^/]+\/templates$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-2));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const template = await upsertMailTemplateForTenant(resolved.tenantId, payload);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "create-mail-template", target: `template:${template.id}`, details: { fields: payload } });
      return json(res, 201, { template });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save mail template.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "PUT" && /^\/api\/tenants\/[^/]+\/templates\/[^/]+$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const parts = pathname.split("/");
      const tenantId = decodeURIComponent(parts.at(-3));
      const templateId = decodeURIComponent(parts.at(-1));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const template = await upsertMailTemplateForTenant(resolved.tenantId, payload, templateId);
      if (!template) return json(res, 404, { error: "Mail template not found." });
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "update-mail-template", target: `template:${template.id}`, details: { fields: payload } });
      return json(res, 200, { template });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to update mail template.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "DELETE" && /^\/api\/tenants\/[^/]+\/templates\/[^/]+$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const parts = pathname.split("/");
      const tenantId = decodeURIComponent(parts.at(-3));
      const templateId = decodeURIComponent(parts.at(-1));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const result = await dbQuery(`delete from mail_templates where tenant_id=$1 and id=$2 returning id`, [resolved.tenantId, templateId]);
      if (!result.rows.length) return json(res, 404, { error: "Mail template not found." });
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "delete-mail-template", target: `template:${result.rows[0].id}` });
      return json(res, 200, { ok: true, id: result.rows[0].id });
    } catch (error) {
      return json(res, 500, { error: "Unable to delete mail template.", detail: error.message });
    }
  }

  if (req.method === "PUT" && /^\/api\/tenants\/[^/]+$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const auth = requirePlatformAdmin(req, res);
      if (!auth) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const payload = normalizeTenantPayload(await readBody(req));
      const validationError = validateTenant(payload);
      if (validationError) return json(res, 400, { error: validationError });
      const result = await updateTenant(id, payload);
      if (!result) return json(res, 404, { error: "Tenant not found." });
      await recordServerAudit({ auth, tenantId: result.tenant.id, operation: "update-tenant", target: `tenant:${result.tenant.id}`, details: { fields: payload } });
      return json(res, 200, { tenant: tenantFromRow(result.tenant, result.user ? [result.user] : [], [], [], []) });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to update tenant.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/reset-password")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const auth = requirePlatformAdmin(req, res);
      if (!auth) return;
      const id = decodeURIComponent(pathname.split("/").at(-2));
      const userResult = await dbQuery(
        `select u.id user_id, u.email, t.id tenant_id, t.name tenant_name
         from tenants t
         join users u on u.tenant_id=t.id
         where (t.id::text=$1 or t.slug=$1) and u.role in ('tenant_admin', 'platform_admin')
         order by case when u.role='tenant_admin' then 0 else 1 end, u.created_at
         limit 1`,
        [id],
      );
      if (!userResult.rows.length) return json(res, 404, { error: "Tenant admin user not found." });

      const user = userResult.rows[0];
      const temporaryPassword = generateTemporaryPassword();
      await dbQuery(
        `update users set password_hash=$2, password_change_required=true where id=$1`,
        [user.user_id, hashPassword(temporaryPassword)],
      );
      const inviteEmail = await sendAndRecordInvite({
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        to: user.email,
        temporaryPassword,
      });
      await recordServerAudit({ auth, tenantId: user.tenant_id, operation: "reset-tenant-password", target: `tenant:${user.tenant_id}` });
      return json(res, 200, { ok: true, inviteEmail });
    } catch (error) {
      return json(res, 500, { error: "Unable to reset password.", detail: error.message });
    }
  }

  if (req.method === "DELETE" && /^\/api\/tenants\/[^/]+$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const auth = requirePlatformAdmin(req, res);
      if (!auth) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const result = await dbQuery(`delete from tenants where id::text=$1 or slug=$1 returning id, slug`, [id]);
      if (!result.rows.length) return json(res, 404, { error: "Tenant not found." });
      await recordServerAudit({ auth, tenantId: null, operation: "delete-tenant", target: `tenant:${result.rows[0].slug}`, details: { editedTenantId: result.rows[0].id, editedTenantName: result.rows[0].slug } });
      return json(res, 200, { ok: true, slug: result.rows[0].slug });
    } catch (error) {
      return json(res, 500, { error: "Unable to delete tenant.", detail: error.message });
    }
  }

  if (req.method === "PUT" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/gmail")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-2));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const gmailIntegration = await upsertGmailSettings(resolved.tenantId, payload);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "update-gmail-settings", target: "gmail-settings", details: { fields: payload } });
      return json(res, 200, { gmailIntegration });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save Gmail settings.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "PUT" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/configuration")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-2));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const settings = await upsertConfigurationSettings(resolved.tenantId, payload);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "update-configuration", target: "configuration", details: { fields: payload } });
      return json(res, 200, { gmailIntegration: settings.gmailIntegration, tenantSettings: { mfaRequired: !!settings.tenant.mfa_required } });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save configuration.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "PUT" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/linkedin")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-2));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const linkedinIntegration = await upsertLinkedinSettings(resolved.tenantId, payload);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "update-linkedin-settings", target: "linkedin-settings", details: { fields: payload } });
      return json(res, 200, { linkedinIntegration });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save LinkedIn settings.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "PUT" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/workflow-automation")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-2));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const workflowAutomation = await upsertWorkflowAutomationSettings(resolved.tenantId, payload);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "update-workflow-automation", target: "workflow-automation", details: { fields: payload } });
      return json(res, 200, { workflowAutomation });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save workflow automation.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "PUT" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/outgoing-email")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-2));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const outgoingEmail = await upsertOutgoingEmailSettings(resolved.tenantId, payload);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "update-outgoing-email", target: "outgoing-email", details: { fields: payload } });
      return json(res, 200, { outgoingEmail });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save outgoing email settings.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/outgoing-email/send")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-3));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const payload = await readBody(req);
      const result = await sendCrmEmailForTenant(resolved.tenantId, resolved.auth, payload);
      await recordServerAudit({ auth: resolved.auth, tenantId: resolved.tenantId, operation: "send-email", target: `deal:${payload.dealId || ""}`, details: { fields: payload } });
      return json(res, 200, result);
    } catch (error) {
      return json(res, error.statusCode || 502, { error: error.statusCode ? error.message : "Unable to send email.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/gmail/skip")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-3));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const body = await readBody(req);
      const parsed = parseEmailAddress(body.email || "");
      if (!parsed) return json(res, 400, { error: "Valid email is required." });
      await withTransaction(async (client) => {
        await client.query(
          `insert into gmail_contact_blacklist (tenant_id, email, name, source)
           values ($1,$2,$3,$4)
           on conflict (tenant_id, email) do update set name=excluded.name, source=excluded.source`,
          [resolved.tenantId, parsed.email, body.name || parsed.name, body.source || "Skipped from Gmail discoveries"],
        );
        await client.query(`delete from gmail_contact_signals where tenant_id=$1 and signal_type='new_contact' and email=$2`, [resolved.tenantId, parsed.email]);
      });
      const integration = await dbQuery(`select * from gmail_integrations where tenant_id=$1`, [resolved.tenantId]);
      return json(res, 200, { ok: true, email: parsed.email, gmailIntegration: gmailIntegrationFromRow(integration.rows[0], await readGmailSignals(resolved.tenantId)) });
    } catch (error) {
      return json(res, 500, { error: "Unable to skip Gmail contact.", detail: error.message });
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/gmail/connect")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      if (!googleClientId || !googleClientSecret) return json(res, 400, { error: "Google connection is not configured on the server." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-3));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const body = await readBody(req);
      const integrationResult = await dbQuery(
        `select g.*, t.id resolved_tenant_id
         from tenants t left join gmail_integrations g on g.tenant_id=t.id
         where t.id::text=$1 or t.slug=$1`,
        [resolved.tenantId],
      );
      const integration = integrationResult.rows[0];
      if (!integration) return json(res, 404, { error: "Tenant not found." });
      return json(res, 200, {
        authUrl: gmailAuthUrl({
          tenantId: integration.resolved_tenant_id,
          userId: resolved.auth.userId,
          clientId: googleClientId,
          redirectUri: `${publicBaseUrl}/api/gmail/oauth/callback`,
          accountEmail: integration.account_email || "",
          returnOrigin: body.returnOrigin || req.headers.origin || req.headers.referer,
        }),
      });
    } catch (error) {
      return json(res, 500, { error: "Unable to create Gmail OAuth URL.", detail: error.message });
    }
  }

  if (req.method === "GET" && pathname === "/api/gmail/oauth/callback") {
    try {
      if (!pool) throw new Error("DATABASE_URL is not configured.");
      if (!googleClientId || !googleClientSecret) throw new Error("Google connection is not configured on the server.");
      const state = verifySignedPayload(requestUrl.searchParams.get("state"));
      const code = requestUrl.searchParams.get("code");
      if (!state.tenantId || !code) throw new Error("Gmail OAuth response is missing state or code.");
      const integrationResult = await dbQuery(`select * from gmail_integrations where tenant_id=$1`, [state.tenantId]);
      const integration = integrationResult.rows[0];
      if (!integration) throw new Error("Gmail integration settings were not found.");
      const token = await exchangeGmailCode({ code, clientId: googleClientId, redirectUri: `${publicBaseUrl}/api/gmail/oauth/callback` });
      const profile = await gmailApi(token.access_token, "profile");
      const connectedEmail = String(profile.emailAddress || "").trim();
      if (!connectedEmail) throw new Error("Google did not return the connected Gmail account.");
      const connectedDomain = connectedEmail.includes("@") ? connectedEmail.split("@").pop().toLowerCase() : (integration.workspace_domain || "gmail.com");
      await dbQuery(
        `update gmail_integrations
         set enabled=true, status='Connected', access_token_enc=$2, refresh_token_enc=coalesce($3, refresh_token_enc), token_expiry=$4, account_email=$5, workspace_domain=$6, client_id=$7, redirect_uri=$8, updated_at=now()
         where tenant_id=$1`,
        [state.tenantId, encryptToken(token.access_token), token.refresh_token ? encryptToken(token.refresh_token) : null, new Date(Date.now() + Number(token.expires_in || 3600) * 1000), connectedEmail, connectedDomain, googleClientId, `${publicBaseUrl}/api/gmail/oauth/callback`],
      );
      res.writeHead(302, { location: `${safeGmailReturnOrigin(state.returnOrigin)}/crm/?gmail=connected` });
      res.end();
      return;
    } catch (error) {
      const state = verifySignedPayload(requestUrl.searchParams.get("state")) || {};
      res.writeHead(302, { location: `${safeGmailReturnOrigin(state.returnOrigin)}/crm/?gmail=error&detail=${encodeURIComponent(error.message)}` });
      res.end();
      return;
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/gmail/scan")) {
    const scanId = requestUrl.searchParams.get("scanId") || "";
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-3));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const result = await scanGmailForTenant(resolved.tenantId, { scanId });
      try {
        const integration = await dbQuery(`select * from gmail_integrations where tenant_id=$1`, [resolved.tenantId]);
        return json(res, 200, { ...result, gmailIntegration: gmailIntegrationFromRow(integration.rows[0], await readGmailSignals(resolved.tenantId)) });
      } catch (error) {
        console.log(`Gmail scan completed but response hydration failed for tenant ${resolved.tenantId}: ${error.message}`);
        return json(res, 200, {
          ...result,
          warning: `Gmail scan completed, but refreshed signals could not be loaded: ${error.message}`,
          gmailIntegration: {
            enabled: true,
            status: "Last scan completed. Refresh to load the latest Gmail signals.",
            signals: [
              ...result.newContacts.map((item) => ({ ...item, type: "new_contact" })),
              ...result.dormantContacts.map((item) => ({ ...item, type: "dormant_contact" })),
              ...result.attentionCorrespondence.map((item) => ({ ...item, type: "attention_correspondence" })),
            ],
          },
        });
      }
    } catch (error) {
      finishGmailScanProgress(scanId, { status: "failed", error: error.message });
      return json(res, 502, { error: "Unable to scan Gmail.", detail: error.message });
    }
  }

  if (req.method === "GET" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/gmail/scan-progress")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-3));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const scanId = requestUrl.searchParams.get("scanId") || "";
      return json(res, 200, scanProgressById.get(scanId) || { active: false, status: "unknown", scannedMessages: 0, totalMessages: 0 });
    } catch (error) {
      return json(res, 500, { error: "Unable to read Gmail scan progress.", detail: error.message });
    }
  }

  json(res, 404, { error: "Not found" });
}

function staticFilePathForUrlPath(urlPath) {
  if (urlPath === "/crm/demo" || urlPath === "/crm/demo/" || urlPath.startsWith("/crm/demo/")) return path.join(root, "crm/index.html");
  if (/^\/crm\/[^/.]+\/?$/.test(urlPath)) return path.join(root, "crm/index.html");
  return path.join(root, urlPath === "/" ? "index.html" : urlPath);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  let filePath = staticFilePathForUrlPath(urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

function startServer() {
  return initDatabase()
    .then(() => {
      server.listen(port, () => {
        console.log(`Zeptrix CRM server listening on http://localhost:${port}`);
        if (!fromEmail) console.log("No sender email is set; invite emails will be marked not_configured.");
        if (emailProvider === "smtp" && !smtpPassword) console.log("SMTP password is not set; invite emails will be marked not_configured.");
        if (!pool) console.log("DATABASE_URL is not set; API persistence is disabled.");
      });
    })
    .catch((error) => {
      console.error("Failed to initialize database", error);
      process.exit(1);
    });
}

if (require.main === module) startServer();

module.exports = {
  detectNegativeCorrespondence,
  duplicateTenantEmailMessage,
  decryptToken,
  encryptToken,
  enrichGmailContactFromSignature,
  extractGmailMessageText,
  gmailAuthUrl,
  gmailLabelQuery,
  authChallengeForUser,
  authenticatorUri,
  inviteEmailContent,
  isAutomatedSenderEmail,
  mfaRecoveryEmailContent,
  normalizeDealPayload,
  normalizeGmailSettings,
  normalizeLinkedinSettings,
  normalizeOutgoingEmailSettings,
  normalizeOutgoingMailPayload,
  normalizeRegistrationPayload,
  normalizeTenantPayload,
  normalizeWorkflowAutomationSettings,
  parseEmailAddress,
  passwordResetEmailContent,
  registrationNotificationContent,
  signAuthToken,
  signGoogleAuthState,
  signMfaRecoveryToken,
  signPreAuthToken,
  storeGoogleAuthResult,
  staticFilePathForUrlPath,
  smtpInviteMessage,
  totpCode,
  slugify,
  updateTenantWithClient,
  validateTenant,
  verifyGoogleAuthState,
  consumeGoogleAuthResult,
  verifyMfaRecoveryToken,
  verifyPreAuthToken,
  verifySignedPayload,
  verifyTotpCode,
};
