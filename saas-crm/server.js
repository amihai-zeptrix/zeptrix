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
      owner text,
      stage text not null check (stage in ('Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost')),
      value integer not null default 0,
      close_date date,
      priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
      deal_group text not null default 'active',
      notes text,
      updated_label text not null default 'Just now',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
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
  await dbQuery(`create index if not exists deals_tenant_stage_idx on deals(tenant_id, stage)`);
  await dbQuery(`create index if not exists invite_emails_tenant_created_idx on invite_emails(tenant_id, created_at desc)`);
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

async function readState() {
  const [tenantsResult, usersResult, dealsResult, tasksResult, communicationsResult, invitesResult] = await Promise.all([
    dbQuery(`select * from tenants order by created_at`),
    dbQuery(`select * from users order by created_at`),
    dbQuery(`select * from deals order by created_at`),
    dbQuery(`select * from activities order by created_at`),
    dbQuery(`select * from communications order by occurred_at desc`),
    dbQuery(`select i.*, t.name tenant_name from invite_emails i join tenants t on t.id=i.tenant_id order by i.created_at desc limit 25`),
  ]);
  return {
    tenants: tenantsResult.rows.map((tenant) => tenantFromRow(
      tenant,
      usersResult.rows.filter((user) => user.tenant_id === tenant.id),
      dealsResult.rows.filter((deal) => deal.tenant_id === tenant.id),
      tasksResult.rows.filter((task) => task.tenant_id === tenant.id),
      communicationsResult.rows.filter((communication) => communication.tenant_id === tenant.id),
    )),
    inviteEmails: invitesResult.rows.map(inviteFromRow),
  };
}

function tenantFromRow(tenant, users, deals, tasks, communications) {
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
    deals: deals.map(dealFromRow),
    tasks: tasks.map(taskFromRow),
    communications: communications.map(communicationFromRow),
  };
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
    owner: deal.owner || "",
    stage: deal.stage,
    value: deal.value,
    close: deal.close_date ? deal.close_date.toISOString().slice(0, 10) : "",
    priority: deal.priority,
    group: deal.deal_group,
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/state") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      return json(res, 200, await readState());
    } catch (error) {
      return json(res, 500, { error: "Unable to read state.", detail: error.message });
    }
  }

  if (req.method === "POST" && req.url === "/api/auth/login") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { email, password } = await readBody(req);
      const user = await authenticateUser(email, password);
      if (!user) return json(res, 401, { error: "Invalid email or password." });
      return json(res, 200, { user });
    } catch (error) {
      return json(res, 500, { error: "Unable to log in.", detail: error.message });
    }
  }

  if (req.method === "POST" && req.url === "/api/auth/change-password") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const { email, password } = await readBody(req);
      if (!email || !password || String(password).length < 10) return json(res, 400, { error: "Password must be at least 10 characters." });
      await dbQuery(`update users set password_hash=$2, password_change_required=false where lower(email)=lower($1)`, [email, hashPassword(password)]);
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 500, { error: "Unable to change password.", detail: error.message });
    }
  }

  if (req.method === "POST" && req.url === "/api/tenants") {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
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

  if (req.method === "PUT" && req.url.startsWith("/api/tenants/")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const id = decodeURIComponent(req.url.split("/").pop());
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

  if (req.method === "POST" && req.url.startsWith("/api/tenants/") && req.url.endsWith("/reset-password")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const id = decodeURIComponent(req.url.split("/").at(-2));
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

  if (req.method === "DELETE" && req.url.startsWith("/api/tenants/")) {
    try {
      if (!pool) return json(res, 503, { error: "DATABASE_URL is not configured." });
      const id = decodeURIComponent(req.url.split("/").pop());
      const result = await dbQuery(`delete from tenants where id::text=$1 or slug=$1 returning slug`, [id]);
      if (!result.rows.length) return json(res, 404, { error: "Tenant not found." });
      return json(res, 200, { ok: true, slug: result.rows[0].slug });
    } catch (error) {
      return json(res, 500, { error: "Unable to delete tenant.", detail: error.message });
    }
  }

  json(res, 404, { error: "Not found" });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  let filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);
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
  inviteEmailContent,
  normalizeTenantPayload,
  smtpInviteMessage,
  slugify,
  updateTenantWithClient,
  validateTenant,
};
