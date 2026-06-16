const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { SendEmailCommand, SESClient } = require("@aws-sdk/client-ses");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");

const root = __dirname;
loadEnv(path.join(root, ".env"));

const port = Number(process.env.PORT || 4173);
const region = process.env.AWS_REGION || "us-east-1";
const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SES_FROM_EMAIL;
const smtpHost = process.env.SMTP_HOST || "smtp.porkbun.com";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || fromEmail;
const smtpPassword = process.env.SMTP_PASSWORD || process.env.PORKBUN_SMTP_PASSWORD;
const emailProvider = (process.env.EMAIL_PROVIDER || (smtpPassword ? "smtp" : "ses")).toLowerCase();
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}/crm/`;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL?.replace(/\/crm\/?$/, "") || `http://localhost:${port}`;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const tokenSecret = process.env.CRM_TOKEN_SECRET || process.env.TOKEN_SECRET || process.env.DATABASE_URL || "local-dev-token-secret";
const authTokenSecret = process.env.CRM_AUTH_SECRET || tokenSecret;
const GMAIL_NEW_CONTACT_LOOKBACK_DAYS = 30;
const GMAIL_NEW_CONTACT_METADATA_LIMIT = 1000;
const GMAIL_NEW_CONTACT_FULL_LIMIT = 250;
const GMAIL_NEW_CONTACT_SIGNAL_LIMIT = 250;
const scanProgressById = new Map();
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
    "MFA code for this demo: 123456",
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
      <strong>MFA code for this demo:</strong> 123456</p>
      <p>You will be asked to create a permanent password after login.</p>
    </div>`;
  return { subject, text, html };
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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await dbQuery(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      email citext not null unique,
      password_hash text,
      password_change_required boolean not null default true,
      role text not null check (role in ('platform_admin', 'tenant_admin', 'sales_manager', 'sales_rep')),
      mfa_enabled boolean not null default true,
      google_subject text unique,
      last_login_at timestamptz,
      created_at timestamptz not null default now()
    )`);
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
      occurred_at timestamptz not null default now()
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
      signal_type text not null check (signal_type in ('new_contact', 'dormant_contact')),
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
  await dbQuery(`alter table gmail_contact_signals add column if not exists phone text`);
  await dbQuery(`alter table deals add column if not exists phone text`);
  await dbQuery(`alter table deals add column if not exists tags jsonb not null default '[]'::jsonb`);
  await dbQuery(`alter table gmail_integrations add column if not exists gmail_lookback_days integer not null default 30 check (gmail_lookback_days > 0 and gmail_lookback_days <= 365)`);
  await dbQuery(`create index if not exists deals_tenant_stage_idx on deals(tenant_id, stage)`);
  await dbQuery(`create index if not exists contact_tags_tenant_name_idx on contact_tags(tenant_id, lower(name))`);
  await dbQuery(`create index if not exists invite_emails_tenant_created_idx on invite_emails(tenant_id, created_at desc)`);
  await dbQuery(`create index if not exists gmail_signals_tenant_type_idx on gmail_contact_signals(tenant_id, signal_type, created_at desc)`);
  await dbQuery(`create index if not exists gmail_blacklist_tenant_email_idx on gmail_contact_blacklist(tenant_id, email)`);
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
     values ($1, $2, $3, $4, $5, $6, true, $7)
     returning *`,
    [tenantId, user.name, user.email, hashPassword(user.password), !!user.mustChangePassword, user.role, user.sso ? `google-${user.email}` : null],
  );
  return result.rows[0];
}

async function insertUserWithClient(client, tenantId, user) {
  const result = await client.query(
    `insert into users (tenant_id, name, email, password_hash, password_change_required, role, mfa_enabled, google_subject)
     values ($1, $2, $3, $4, $5, $6, true, $7)
     returning *`,
    [tenantId, user.name, user.email, hashPassword(user.password), !!user.mustChangePassword, user.role, user.sso ? `google-${user.email}` : null],
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

async function readState(auth) {
  const [tenantsResult, usersResult, dealsResult, tasksResult, communicationsResult, invitesResult, gmailResult, gmailSignalResult, contactTagsResult] = await Promise.all([
    dbQuery(`select * from tenants order by created_at`),
    dbQuery(`select * from users order by created_at`),
    dbQuery(`select * from deals order by created_at`),
    dbQuery(`select * from activities order by created_at`),
    dbQuery(`select * from communications order by occurred_at desc`),
    dbQuery(`select i.*, t.name tenant_name from invite_emails i join tenants t on t.id=i.tenant_id order by i.created_at desc limit 25`),
    dbQuery(`select * from gmail_integrations`),
    dbQuery(`select * from gmail_contact_signals order by created_at desc limit 500`),
    dbQuery(`select * from contact_tags order by lower(name), name`),
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
      contactTagsResult.rows.filter((tag) => tag.tenant_id === tenant.id),
    )),
    inviteEmails: auth.role === "platform_admin" ? invitesResult.rows.map(inviteFromRow) : [],
  };
}

function tenantFromRow(tenant, users, deals, tasks, communications, gmailIntegration, gmailSignals = [], contactTags = []) {
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
    users: users.map(userFromRow),
    deals: normalizedDeals,
    tasks: tasks.map(taskFromRow),
    communications: communications.map(communicationFromRow),
    gmailIntegration: gmailIntegrationFromRow(gmailIntegration, gmailSignals),
    availableTags: availableContactTags(contactTags, normalizedDeals),
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

async function authenticateUser(email, password) {
  const result = await dbQuery(
    `select u.*, t.id tenant_id, t.name tenant_name
     from users u join tenants t on t.id=u.tenant_id
     where lower(u.email)=lower($1) and u.password_hash=$2`,
    [email, hashPassword(password)],
  );
  const user = result.rows[0];
  if (!user) return null;
  await dbQuery(`update users set last_login_at=now() where id=$1`, [user.id]);
  return {
    id: user.id,
    tenantId: user.tenant_id,
    tenantName: user.tenant_name,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.password_change_required,
  };
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

function signGmailState({ tenantId, userId }) {
  return signPayload({ tenantId, userId, exp: Date.now() + 10 * 60 * 1000 });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function normalizeGmailSettings(payload = {}) {
  const accountEmail = String(payload.accountEmail || "").trim();
  const clientId = normalizeOAuthClientId(payload.clientId);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
    const error = new Error("Gmail account is required.");
    error.statusCode = 400;
    throw error;
  }
  if (clientId && !isValidGoogleOAuthClientId(clientId)) {
    const error = new Error("OAuth client ID must be the Web application Client ID ending in .apps.googleusercontent.com.");
    error.statusCode = 400;
    throw error;
  }
  return {
    accountEmail,
    workspaceDomain: String(payload.workspaceDomain || "zeptrix.io").trim(),
    clientId,
    redirectUri: String(payload.redirectUri || `${publicBaseUrl}/api/gmail/oauth/callback`).trim(),
    labels: String(payload.labels || "Inbox, Sent").trim(),
    gmailLookbackDays: payload.gmailLookbackDays == null ? null : Math.max(1, Math.min(365, Number(payload.gmailLookbackDays || GMAIL_NEW_CONTACT_LOOKBACK_DAYS))),
    staleMonths: Math.max(1, Math.min(36, Number(payload.staleMonths || 3))),
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
     values ($1,$2,$3,$4,$5,$6,coalesce($7,${GMAIL_NEW_CONTACT_LOOKBACK_DAYS}),$8,$9,$10,'Settings saved',now())
     on conflict (tenant_id) do update set
       account_email=excluded.account_email,
       workspace_domain=excluded.workspace_domain,
       client_id=excluded.client_id,
       redirect_uri=excluded.redirect_uri,
       labels=excluded.labels,
       gmail_lookback_days=coalesce($7,gmail_integrations.gmail_lookback_days),
       stale_months=excluded.stale_months,
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
  };
}

async function upsertConfigurationSettings(tenantId, payload) {
  const settings = normalizeConfigurationSettings(payload);
  const result = await dbQuery(
    `insert into gmail_integrations (tenant_id, gmail_lookback_days, status, updated_at)
     values ($1,$2,'Configuration saved',now())
     on conflict (tenant_id) do update set
       gmail_lookback_days=excluded.gmail_lookback_days,
       status=case when gmail_integrations.enabled then gmail_integrations.status else gmail_integrations.status end,
       updated_at=now()
     returning *`,
    [tenantId, settings.gmailLookbackDays],
  );
  return gmailIntegrationFromRow(result.rows[0], await readGmailSignals(tenantId));
}

function gmailAuthUrl({ tenantId, userId, clientId, redirectUri, accountEmail }) {
  const normalizedClientId = normalizeOAuthClientId(clientId);
  if (!isValidGoogleOAuthClientId(normalizedClientId)) {
    throw new Error("Saved OAuth client ID is not a valid Google Web application Client ID.");
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", normalizedClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
  url.searchParams.set("state", signGmailState({ tenantId, userId }));
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
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: decryptToken(integration.refresh_token_enc),
      client_id: integration.client_id,
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

function updateGmailScanProgress(scanId, patch) {
  if (!scanId) return;
  scanProgressById.set(scanId, { ...(scanProgressById.get(scanId) || {}), ...patch, updatedAt: new Date().toISOString() });
}

function finishGmailScanProgress(scanId, patch = {}) {
  if (!scanId) return;
  updateGmailScanProgress(scanId, { status: "complete", active: false, ...patch });
  setTimeout(() => scanProgressById.delete(scanId), 10 * 60 * 1000).unref?.();
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
    dbQuery(`select distinct lower(email) email, contact, account from deals where tenant_id=$1 and email is not null and email<>''`, [tenantId]),
    dbQuery(`select lower(email::text) email from gmail_contact_blacklist where tenant_id=$1`, [tenantId]),
    integration.detect_new_contacts
      ? listGmailMessages(accessToken, { q: `${gmailNewContactScope(integration.labels)} newer_than:${gmailLookbackDays}d -in:sent` }, GMAIL_NEW_CONTACT_METADATA_LIMIT)
      : { messages: [] },
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
  for (const message of inboundMetadata) {
    const parsed = parseEmailAddress(headerValue(message, "From"));
    if (!parsed || isAutomatedSenderEmail(parsed.email) || knownEmails.has(parsed.email) || blacklistedEmails.has(parsed.email) || seenNew.has(parsed.email)) continue;
    seenNew.add(parsed.email);
    unknownMetadata.push({ ...message, parsed });
  }
  updateGmailScanProgress(scanId, { status: "enriching", totalMessages: inboundCandidates.length, scannedMessages, candidatesFound: unknownMetadata.length });
  const inboundMessages = await mapLimit(unknownMetadata.slice(0, GMAIL_NEW_CONTACT_FULL_LIMIT), 6, async (message) => ({
    parsed: message.parsed,
    full: await gmailApi(accessToken, `messages/${message.id}`, { format: "full" }),
  }));

  const newContacts = [];
  for (const message of inboundMessages) {
    newContacts.push({ ...enrichGmailContactFromSignature(message.parsed, extractGmailMessageText(message.full)), messageId: message.full.id });
  }

  const dormantChecks = integration.detect_dormant_contacts
    ? await mapLimit(dealsResult.rows.slice(0, 50), 6, async (row) => {
      const sent = await gmailApi(accessToken, "messages", { q: `in:sent to:${row.email} newer_than:${staleMonths}m`, maxResults: 1 });
      return sent.messages?.length ? null : { email: row.email, name: row.contact || row.email.split("@")[0], account: row.account || "", months: staleMonths, source: `No sent Gmail in ${staleMonths} months` };
    })
    : [];
  const dormant = dormantChecks.filter(Boolean);

  await withTransaction(async (client) => {
    await client.query(`delete from gmail_contact_signals where tenant_id=$1`, [tenantId]);
    for (const item of newContacts.slice(0, GMAIL_NEW_CONTACT_SIGNAL_LIMIT)) {
      await client.query(
        `insert into gmail_contact_signals (tenant_id, signal_type, email, name, account, phone, source, message_id, last_seen_at)
         values ($1,'new_contact',$2,$3,$4,$5,$6,$7,now())`,
        [tenantId, item.email, item.name, item.account || "", item.phone || "", gmailContactSignalSource(item), item.messageId],
      );
    }
    for (const item of dormant.slice(0, 50)) {
      await client.query(
        `insert into gmail_contact_signals (tenant_id, signal_type, email, name, account, source, months, last_seen_at)
         values ($1,'dormant_contact',$2,$3,$4,$5,$6,now())`,
        [tenantId, item.email, item.name, item.account, item.source, item.months],
      );
    }
    await client.query(`update gmail_integrations set last_scan_at=now(), status='Last scan completed', updated_at=now() where tenant_id=$1`, [tenantId]);
  });
  const result = { newContacts: newContacts.slice(0, GMAIL_NEW_CONTACT_SIGNAL_LIMIT), dormantContacts: dormant.slice(0, 50), scannedMessages: inboundMetadata.length + dormantChecks.length };
  finishGmailScanProgress(scanId, { scannedMessages: inboundMetadata.length, totalMessages: inboundCandidates.length, candidatesFound: newContacts.length });
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

  if (req.method === "POST" && pathname === "/api/auth/login") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { email, password } = await readBody(req);
      const user = await authenticateUser(email, password);
      if (!user) return json(res, 401, { error: "Invalid email or password." });
      return json(res, 200, { user, token: signAuthToken(user) });
    } catch (error) {
      return json(res, 500, { error: "Unable to log in.", detail: error.message });
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
      if (!requirePlatformAdmin(req, res)) return;
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
      const deal = await upsertDealForTenant(resolved.tenantId, await readBody(req));
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
      const deal = await upsertDealForTenant(resolved.tenantId, await readBody(req), dealId);
      if (!deal) return json(res, 404, { error: "Deal not found." });
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
      return json(res, 201, { tags });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save tag.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "PUT" && /^\/api\/tenants\/[^/]+$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      if (!requirePlatformAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const payload = normalizeTenantPayload(await readBody(req));
      const validationError = validateTenant(payload);
      if (validationError) return json(res, 400, { error: validationError });
      const result = await updateTenant(id, payload);
      if (!result) return json(res, 404, { error: "Tenant not found." });
      return json(res, 200, { tenant: tenantFromRow(result.tenant, result.user ? [result.user] : [], [], [], []) });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to update tenant.", detail: error.statusCode ? undefined : error.message });
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/tenants/") && pathname.endsWith("/reset-password")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      if (!requirePlatformAdmin(req, res)) return;
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
      return json(res, 200, { ok: true, inviteEmail });
    } catch (error) {
      return json(res, 500, { error: "Unable to reset password.", detail: error.message });
    }
  }

  if (req.method === "DELETE" && /^\/api\/tenants\/[^/]+$/.test(pathname)) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      if (!requirePlatformAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const result = await dbQuery(`delete from tenants where id::text=$1 or slug=$1 returning slug`, [id]);
      if (!result.rows.length) return json(res, 404, { error: "Tenant not found." });
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
      const gmailIntegration = await upsertGmailSettings(resolved.tenantId, await readBody(req));
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
      const gmailIntegration = await upsertConfigurationSettings(resolved.tenantId, await readBody(req));
      return json(res, 200, { gmailIntegration });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Unable to save configuration.", detail: error.statusCode ? undefined : error.message });
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
      if (!googleClientSecret) return json(res, 400, { error: "GOOGLE_CLIENT_SECRET is not configured." });
      const tenantId = decodeURIComponent(pathname.split("/").at(-3));
      const resolved = await resolveAuthorizedTenant(req, res, tenantId);
      if (!resolved) return;
      const integrationResult = await dbQuery(
        `select g.*, t.id resolved_tenant_id
         from tenants t left join gmail_integrations g on g.tenant_id=t.id
         where t.id::text=$1 or t.slug=$1`,
        [resolved.tenantId],
      );
      const integration = integrationResult.rows[0];
      if (!integration) return json(res, 404, { error: "Tenant not found." });
      if (!integration.account_email) return json(res, 400, { error: "Save Gmail account before connecting." });
      if (!integration.client_id || !integration.redirect_uri) return json(res, 400, { error: "Save Gmail client ID and redirect URI before connecting." });
      return json(res, 200, {
        authUrl: gmailAuthUrl({
          tenantId: integration.resolved_tenant_id,
          userId: resolved.auth.userId,
          clientId: integration.client_id,
          redirectUri: integration.redirect_uri,
          accountEmail: integration.account_email,
        }),
      });
    } catch (error) {
      return json(res, 500, { error: "Unable to create Gmail OAuth URL.", detail: error.message });
    }
  }

  if (req.method === "GET" && pathname === "/api/gmail/oauth/callback") {
    try {
      if (!pool) throw new Error("DATABASE_URL is not configured.");
      if (!googleClientSecret) throw new Error("GOOGLE_CLIENT_SECRET is not configured.");
      const state = verifySignedPayload(requestUrl.searchParams.get("state"));
      const code = requestUrl.searchParams.get("code");
      if (!state.tenantId || !code) throw new Error("Gmail OAuth response is missing state or code.");
      const integrationResult = await dbQuery(`select * from gmail_integrations where tenant_id=$1`, [state.tenantId]);
      const integration = integrationResult.rows[0];
      if (!integration) throw new Error("Gmail integration settings were not found.");
      const token = await exchangeGmailCode({ code, clientId: integration.client_id, redirectUri: integration.redirect_uri });
      const profile = await gmailApi(token.access_token, "profile");
      if (!integration.account_email || profile.emailAddress?.toLowerCase() !== String(integration.account_email).toLowerCase()) {
        throw new Error(`Connected Gmail account ${profile.emailAddress || "unknown"} does not match ${integration.account_email || "the configured Gmail account"}.`);
      }
      await dbQuery(
        `update gmail_integrations
         set enabled=true, status='Connected', access_token_enc=$2, refresh_token_enc=coalesce($3, refresh_token_enc), token_expiry=$4, updated_at=now()
         where tenant_id=$1`,
        [state.tenantId, encryptToken(token.access_token), token.refresh_token ? encryptToken(token.refresh_token) : null, new Date(Date.now() + Number(token.expires_in || 3600) * 1000)],
      );
      res.writeHead(302, { location: "/crm/?gmail=connected" });
      res.end();
      return;
    } catch (error) {
      res.writeHead(302, { location: `/crm/?gmail=error&detail=${encodeURIComponent(error.message)}` });
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
      const integration = await dbQuery(`select * from gmail_integrations where tenant_id=$1`, [resolved.tenantId]);
      return json(res, 200, { ...result, gmailIntegration: gmailIntegrationFromRow(integration.rows[0], await readGmailSignals(resolved.tenantId)) });
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
  duplicateTenantEmailMessage,
  decryptToken,
  encryptToken,
  enrichGmailContactFromSignature,
  extractGmailMessageText,
  gmailAuthUrl,
  gmailLabelQuery,
  inviteEmailContent,
  isAutomatedSenderEmail,
  normalizeDealPayload,
  normalizeGmailSettings,
  normalizeTenantPayload,
  parseEmailAddress,
  signAuthToken,
  staticFilePathForUrlPath,
  smtpInviteMessage,
  slugify,
  updateTenantWithClient,
  validateTenant,
  verifySignedPayload,
};
