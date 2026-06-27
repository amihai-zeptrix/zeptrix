const fs = require("node:fs");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { Pool } = require("pg");
const { buildReport } = require("./scripts/aws-assessment");

const port = Number(process.env.PORT || 4321);
const root = __dirname;
const publicRoot = path.join(root, "cloudprune");
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://zeptrix.io").replace(/\/$/, "");
const isProduction = process.env.NODE_ENV === "production";
const databaseUrl = process.env.CLOUDPRUNE_DATABASE_URL || process.env.DATABASE_URL || "";
const cloudFormationTemplateUrl = process.env.CLOUDPRUNE_AWS_CLOUDFORMATION_TEMPLATE_URL || (isProduction ? "" : `${publicBaseUrl}/cloudprune/aws-readonly-role-template.yaml`);
const awsScanRegion = process.env.CLOUDPRUNE_AWS_SCAN_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const awsCliPath = process.env.CLOUDPRUNE_AWS_CLI || "aws";
const awsCliMaxOutputBytes = Number(process.env.CLOUDPRUNE_AWS_CLI_MAX_OUTPUT_BYTES || 5 * 1024 * 1024);
const awsScanMaxRegions = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_REGIONS || 12);
const awsScanMaxInventoryItems = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_INVENTORY_ITEMS || 200);
const awsScanMaxSampledResources = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_SAMPLED_RESOURCES || 25);
const googleRedirectUri = process.env.CLOUDPRUNE_GOOGLE_REDIRECT_URI || "https://www.zeptrix.io/api/auth/google/callback";
const googleClientId = process.env.CLOUDPRUNE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.CLOUDPRUNE_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const tokenSecret = process.env.CLOUDPRUNE_TOKEN_SECRET || process.env.CRM_TOKEN_SECRET || (databaseUrl || isProduction ? "" : "local-cloudprune-token-secret");
const awsPrincipalArn = process.env.CLOUDPRUNE_AWS_PRINCIPAL_ARN || "";
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.CLOUDPRUNE_DATABASE_SSL === "true" || process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    })
  : null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
};

const cloudpruneOauthCookieDomain = process.env.CLOUDPRUNE_OAUTH_COOKIE_DOMAIN || "zeptrix.io";

function routePrefix(urlPath) {
  if (urlPath === "/cloudprune" || urlPath.startsWith("/cloudprune/")) return "/cloudprune";
  if (urlPath === "/cp" || urlPath.startsWith("/cp/")) return "/cp";
  return null;
}

function staticFilePathForUrlPath(urlPath) {
  const prefix = routePrefix(urlPath);
  if (urlPath === "/" || urlPath === "/cloudprune" || urlPath === "/cloudprune/" || urlPath === "/cp" || urlPath === "/cp/") return path.join(publicRoot, "index.html");
  if (!prefix) return null;
  if (!path.basename(urlPath).includes(".")) return path.join(publicRoot, "index.html");

  const relativePath = urlPath.slice(`${prefix}/`.length);
  const filePath = path.resolve(publicRoot, relativePath);
  return filePath.startsWith(`${publicRoot}${path.sep}`) || filePath === publicRoot ? filePath : null;
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 210000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function validateRuntimeConfig() {
  if ((databaseUrl || isProduction) && !tokenSecret) throw new Error("CLOUDPRUNE_TOKEN_SECRET or CRM_TOKEN_SECRET is required when persistence is enabled.");
  if (isProduction && !cloudFormationTemplateUrl) throw new Error("CLOUDPRUNE_AWS_CLOUDFORMATION_TEMPLATE_URL is required in production.");
  if (!Number.isInteger(awsScanMaxRegions) || awsScanMaxRegions < 1 || awsScanMaxRegions > 30) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_REGIONS must be an integer from 1 to 30.");
  if (!Number.isInteger(awsScanMaxInventoryItems) || awsScanMaxInventoryItems < 1 || awsScanMaxInventoryItems > 5000) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_INVENTORY_ITEMS must be an integer from 1 to 5000.");
  if (!Number.isInteger(awsScanMaxSampledResources) || awsScanMaxSampledResources < 1 || awsScanMaxSampledResources > 250) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_SAMPLED_RESOURCES must be an integer from 1 to 250.");
}

function secureEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function publicUser(user) {
  return { name: user.name, email: user.email, companyName: user.company_name };
}

function externalIdForAccount(accountId) {
  return `cloudprune-${accountId}`;
}

function normalizeAwsRoleArn(roleArn) {
  const value = String(roleArn || "").trim();
  const match = value.match(/^arn:aws[a-z-]*:iam::(\d{12}):role\/([A-Za-z0-9+=,.@_/-]{1,512})$/);
  if (!match) throw new Error("Enter a valid AWS IAM role ARN.");
  return { roleArn: value, awsAccountId: match[1] };
}

function publicCloudConnection(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    awsAccountId: row.provider_account_id,
    roleArn: row.role_arn,
    externalId: row.external_id,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function publicAwsScan(row) {
  if (!row) return null;
  const scanJson = row.scan_json || {};
  return {
    id: row.id,
    status: row.status,
    awsAccountId: row.provider_account_id,
    monthlyCost: Number(row.monthly_cost || 0),
    currency: row.currency || "USD",
    counts: row.counts || {},
    errors: row.errors || [],
    recommendations: scanJson.recommendations || [],
    progress: Number(scanJson.progress || (row.status === "running" ? 0 : 100)),
    message: scanJson.message || "",
    scannedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function signSession(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    accountId: user.account_id,
    companyName: user.company_name,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[0]).digest("base64url");
  if (!secureEqual(parts[1], expected)) return null;
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  if (!payload.sub || (payload.exp && Number(payload.exp) < Date.now())) return null;
  return payload;
}

function bearerToken(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function userFromSession(req) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const session = verifySession(bearerToken(req));
  if (!session) throw new Error("CloudPrune session is invalid.");
  const result = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.provider, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.id=$1`,
    [session.sub]
  );
  if (!result.rows[0]) throw new Error("CloudPrune session user was not found.");
  return result.rows[0];
}

function signGoogleRegistration(profile) {
  const email = normalizeEmail(profile.email);
  const payload = {
    sub: profile.sub,
    email,
    name: profile.name || email.split("@")[0],
    companyName: profile.hd || "",
    exp: Date.now() + 20 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyGoogleRegistration(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[0]).digest("base64url");
  if (!secureEqual(parts[1], expected)) return null;
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  if (!payload.sub || !payload.email || (payload.exp && Number(payload.exp) < Date.now())) return null;
  return payload;
}

function validateGoogleProfile(profile) {
  if (profile.aud !== googleClientId || !profile.email) throw new Error("Google identity is not valid for this client.");
  if (profile.email_verified !== true && profile.email_verified !== "true") throw new Error("Google email must be verified.");
  return profile;
}

function cloudpruneOAuthState(prefix) {
  const body = Buffer.from(JSON.stringify({
    prefix,
    nonce: crypto.randomBytes(18).toString("base64url"),
    exp: Date.now() + 10 * 60 * 1000,
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `cloudprune.${body}.${sig}`;
}

function verifyCloudpruneOAuthState(state) {
  const parts = String(state || "").split(".");
  if (parts.length !== 3 || parts[0] !== "cloudprune") return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[1]).digest("base64url");
  if (!secureEqual(parts[2], expected)) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (payload.exp && Number(payload.exp) < Date.now()) return null;
  if (payload.prefix !== "/cp" && payload.prefix !== "/cloudprune") return null;
  return payload;
}

function cookieValue(req, name) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .reduce((found, part) => {
      if (found !== null) return found;
      const index = part.indexOf("=");
      if (index < 0) return null;
      const key = part.slice(0, index);
      return key === name ? decodeURIComponent(part.slice(index + 1)) : null;
    }, null);
}

function cloudpruneOAuthCookie(value, prefix, extra = "") {
  const domain = cloudpruneOauthCookieDomain ? `; Domain=${cloudpruneOauthCookieDomain}` : "";
  return `cloudprune_oauth_state=${value}; Path=${prefix}${domain}; HttpOnly; SameSite=Lax; Secure${extra}`;
}

async function initDatabase() {
  if (!pool) return;
  await pool.query(`create extension if not exists pgcrypto`);
  await pool.query(`create extension if not exists citext`);
  await pool.query(`
    create table if not exists cloudprune_accounts (
      id uuid primary key default gen_random_uuid(),
      company_name text not null,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists cloudprune_users (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references cloudprune_accounts(id) on delete cascade,
      name text not null,
      email citext not null unique,
      password_hash text,
      google_subject text unique,
      provider text not null default 'password',
      last_login_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists cloudprune_auth_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references cloudprune_users(id) on delete set null,
      email citext,
      event_type text not null,
      detail text,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists cloudprune_cloud_connections (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references cloudprune_accounts(id) on delete cascade,
      provider text not null,
      provider_account_id text,
      role_arn text,
      external_id text not null,
      status text not null default 'configured',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(account_id, provider)
    )
  `);
  await pool.query(`
    create table if not exists cloudprune_aws_scans (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references cloudprune_accounts(id) on delete cascade,
      provider_account_id text not null,
      status text not null default 'completed',
      monthly_cost numeric not null default 0,
      currency text not null default 'USD',
      counts jsonb not null default '{}'::jsonb,
      errors jsonb not null default '[]'::jsonb,
      scan_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table cloudprune_aws_scans add column if not exists updated_at timestamptz not null default now()`);
  await pool.query(`
    create table if not exists cloudprune_oauth_codes (
      code_hash text primary key,
      user_id uuid references cloudprune_users(id) on delete cascade,
      registration jsonb,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
}

async function recordAuthEvent({ userId = null, email = null, eventType, detail = null }) {
  if (!pool) return;
  await pool.query(
    `insert into cloudprune_auth_events (user_id, email, event_type, detail) values ($1,$2,$3,$4)`,
    [userId, email, eventType, detail]
  );
}

async function registerUser(payload, provider = "password") {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const name = String(payload.name || "").trim();
  const company = String(payload.company || payload.companyName || "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (!name || !company || !email.includes("@")) throw new Error("Name, company, and email are required.");
  if (provider === "password" && password.length < 10) throw new Error("Password must be at least 10 characters.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const account = await client.query(`insert into cloudprune_accounts (company_name) values ($1) returning id`, [company]);
    const user = await client.query(
      `insert into cloudprune_users (account_id, name, email, password_hash, google_subject, provider, last_login_at)
       values ($1,$2,$3,$4,$5,$6,now())
       returning id, account_id, name, email, provider, $7::text as company_name`,
      [account.rows[0].id, name, email, provider === "password" ? hashPassword(password) : null, payload.googleSubject || null, provider, company]
    );
    await client.query(
      `insert into cloudprune_auth_events (user_id, email, event_type, detail) values ($1,$2,$3,$4)`,
      [user.rows[0].id, email, provider === "google" ? "google_register" : "register", company]
    );
    await client.query("commit");
    return user.rows[0];
  } catch (error) {
    await client.query("rollback");
    if (error.code === "23505") throw new Error("A CloudPrune user already exists for this email.");
    throw error;
  } finally {
    client.release();
  }
}

async function loginUser(payload) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const email = normalizeEmail(payload.email);
  const result = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.password_hash, u.provider, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.email=$1`,
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.password_hash || !verifyPassword(payload.password || "", user.password_hash)) {
    await recordAuthEvent({ email, eventType: "login_failed", detail: "invalid_credentials" });
    throw new Error("Invalid email or password.");
  }
  await pool.query(`update cloudprune_users set last_login_at=now() where id=$1`, [user.id]);
  await recordAuthEvent({ userId: user.id, email, eventType: "login", detail: "password" });
  return user;
}

async function completeGoogleRegistration(payload) {
  const registration = verifyGoogleRegistration(payload.googleRegistrationToken);
  if (!registration) throw new Error("Google registration expired. Please continue with Google again.");
  return registerUser({
    name: payload.name || registration.name,
    company: payload.company || payload.companyName,
    email: registration.email,
    googleSubject: registration.sub,
  }, "google");
}

async function updateUserProfile(req, payload) {
  const user = await userFromSession(req);
  const name = String(payload.name || "").trim();
  const company = String(payload.company || payload.companyName || "").trim();
  if (!name || !company) throw new Error("Name and company are required.");
  await pool.query(
    `update cloudprune_users set name=$2 where id=$1`,
    [user.id, name]
  );
  await pool.query(
    `update cloudprune_accounts set company_name=$2 where id=$1`,
    [user.account_id, company]
  );
  return { ...user, name, company_name: company };
}

async function workspaceForRequest(req) {
  const user = await userFromSession(req);
  const connections = await pool.query(
    `select provider, provider_account_id, role_arn, external_id, status, updated_at
     from cloudprune_cloud_connections
     where account_id=$1`,
    [user.account_id]
  );
  const byProvider = Object.fromEntries(connections.rows.map((row) => [row.provider, publicCloudConnection(row)]));
  const latestScan = await pool.query(
    `select id, provider_account_id, status, monthly_cost, currency, counts, errors, scan_json, created_at, updated_at
     from cloudprune_aws_scans
     where account_id=$1
     order by created_at desc
     limit 1`,
    [user.account_id]
  );
  return {
    user: publicUser(user),
    connections: {
      aws: byProvider.aws || null,
    },
    awsScan: publicAwsScan(latestScan.rows[0]),
    awsSetup: {
      externalId: byProvider.aws?.externalId || externalIdForAccount(user.account_id),
      principalArn: awsPrincipalArn,
      cloudFormationTemplateUrl,
    },
  };
}

async function saveAwsConnection(req, payload) {
  const user = await userFromSession(req);
  const { roleArn, awsAccountId } = normalizeAwsRoleArn(payload.roleArn);
  const externalId = String(payload.externalId || externalIdForAccount(user.account_id)).trim();
  const result = await pool.query(
    `insert into cloudprune_cloud_connections (account_id, provider, provider_account_id, role_arn, external_id, status)
     values ($1, 'aws', $2, $3, $4, 'configured')
     on conflict (account_id, provider) do update set
       provider_account_id=excluded.provider_account_id,
       role_arn=excluded.role_arn,
       external_id=excluded.external_id,
       status='configured',
       updated_at=now()
     returning provider, provider_account_id, role_arn, external_id, status, updated_at`,
    [user.account_id, awsAccountId, roleArn, externalId]
  );
  await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_connection_saved", detail: awsAccountId });
  return publicCloudConnection(result.rows[0]);
}

function runAwsCli(args, { env = {}, timeoutMs = 60000, maxOutputBytes = awsCliMaxOutputBytes } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(awsCliPath, args, {
      env: { ...process.env, ...env, AWS_PAGER: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      reject(error);
    }
    const timer = setTimeout(() => {
      fail(new Error(`AWS CLI timed out while running aws ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) return fail(new Error(`AWS CLI output exceeded ${maxOutputBytes} bytes for aws ${args.join(" ")}`));
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) return fail(new Error(`AWS CLI output exceeded ${maxOutputBytes} bytes for aws ${args.join(" ")}`));
      stderr += chunk;
    });
    child.on("error", (error) => {
      fail(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error((stderr || stdout || `aws ${args.join(" ")} exited with ${code}`).trim()));
    });
  });
}

async function runAwsJson(args, options = {}) {
  const stdout = await runAwsCli([...args, "--output", "json"], options);
  return stdout.trim() ? JSON.parse(stdout) : {};
}

async function runAwsJsonCheck(args, options = {}) {
  try {
    return { ok: true, data: await runAwsJson(args, options) };
  } catch (error) {
    return { ok: false, error };
  }
}

function monthStartEnd() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function costFromCostExplorer(data) {
  const total = data?.ResultsByTime?.[0]?.Total?.UnblendedCost || {};
  return {
    amount: Number(total.Amount || 0),
    currency: total.Unit || "USD",
  };
}

function scanCountValue(value, collectionKey) {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.reduce((total, item) => total + scanCountValue(item, collectionKey), 0);
  if (!value) return 0;
  if (collectionKey === "Reservations") return (value.Reservations || []).reduce((total, reservation) => total + (reservation.Instances || []).length, 0);
  return (value[collectionKey] || []).length;
}

function awsScanCounts(results) {
  return {
    ec2Instances: scanCountValue(results.ec2Instances, "Reservations"),
    lambdas: scanCountValue(results.lambdas, "Functions"),
    rdsInstances: scanCountValue(results.rdsInstances, "DBInstances"),
    s3Buckets: scanCountValue(results.s3Buckets, "Buckets"),
    ebsVolumes: scanCountValue(results.ebsVolumes, "Volumes"),
    loadBalancers: scanCountValue(results.loadBalancers, "LoadBalancers"),
  };
}

function awsCheck(service, data, error = null) {
  return {
    service,
    ok: !error,
    data: error ? null : data,
    error: error ? String(error.message || error) : null,
  };
}

function mergeAwsCollection(items, collectionKey) {
  if (!Array.isArray(items)) return items || {};
  return {
    [collectionKey]: items.flatMap((item) => item?.[collectionKey] || []),
  };
}

function mergeAwsReservations(items) {
  if (!Array.isArray(items)) return items || {};
  return {
    Reservations: items.flatMap((item) => item?.Reservations || []),
  };
}

function checkError(errors, id) {
  return errors.find((error) => error.check === id) || null;
}

function regionalCheckError(errors, id, regions, resultItems) {
  const failures = errors.filter((error) => String(error.check || "").startsWith(`${id}:`));
  if (!failures.length) return null;
  if (!Array.isArray(resultItems) || resultItems.length === 0 || failures.length >= regions.length) {
    return new Error(`All ${id} regional checks failed: ${failures.map((error) => error.check.split(":")[1]).join(", ")}`);
  }
  return null;
}

function buildAwsAssessment(results, regions, errors) {
  return {
    generatedAt: new Date().toISOString(),
    region: awsScanRegion,
    days: 30,
    concurrency: 5,
    maxResources: awsScanMaxSampledResources,
    checks: {
      identity: awsCheck("STS", results.identity, checkError(errors, "identity")),
      costByService: awsCheck("Cost Explorer", results.costByService, checkError(errors, "costByService")),
      savingsPlansRecommendation: awsCheck("Cost Explorer", results.savingsPlansRecommendation, checkError(errors, "savingsPlansRecommendation")),
      ec2Instances: awsCheck("EC2", mergeAwsReservations(results.ec2Instances), regionalCheckError(errors, "ec2Instances", regions, results.ec2Instances)),
      ebsVolumes: awsCheck("EBS", mergeAwsCollection(results.ebsVolumes, "Volumes"), regionalCheckError(errors, "ebsVolumes", regions, results.ebsVolumes)),
      elasticIps: awsCheck("EC2", mergeAwsCollection(results.elasticIps, "Addresses"), regionalCheckError(errors, "elasticIps", regions, results.elasticIps)),
      rdsInstances: awsCheck("RDS", mergeAwsCollection(results.rdsInstances, "DBInstances"), regionalCheckError(errors, "rdsInstances", regions, results.rdsInstances)),
      rdsMetrics: awsCheck("CloudWatch RDS Metrics", { instances: results.rdsMetrics || [] }, null),
      logGroups: awsCheck("CloudWatch Logs", mergeAwsCollection(results.logGroups, "logGroups"), regionalCheckError(errors, "logGroups", regions, results.logGroups)),
      s3Buckets: awsCheck("S3", results.s3Buckets || {}, checkError(errors, "s3Buckets")),
      s3Lifecycle: awsCheck("S3 Lifecycle", { buckets: results.s3Lifecycle || [] }, null),
      loadBalancers: awsCheck("ELBv2", mergeAwsCollection(results.loadBalancers, "LoadBalancers"), regionalCheckError(errors, "loadBalancers", regions, results.loadBalancers)),
      loadBalancerMetrics: awsCheck("CloudWatch ELB Metrics", { loadBalancers: results.loadBalancerMetrics || [] }, null),
      computeOptimizerEc2: awsCheck("Compute Optimizer", mergeAwsCollection(results.computeOptimizerEc2, "instanceRecommendations"), regionalCheckError(errors, "computeOptimizerEc2", regions, results.computeOptimizerEc2)),
    },
    regions,
  };
}

function publicRecommendation(finding) {
  return {
    id: finding.id,
    cloud: "aws",
    title: finding.title,
    detail: finding.impactAnalysis,
    impact: Number(finding.estimatedMonthlySavings || 0),
    effort: finding.operationalRisk === "low" ? "Low" : finding.operationalRisk === "high" ? "High" : "Medium",
    risk: finding.operationalRisk === "low" ? "Low" : finding.operationalRisk === "high" ? "High" : "Medium",
    owner: finding.strategy,
    status: finding.executionMode === "assisted" ? "Review" : "Ready",
    strategy: finding.strategy,
    confidence: finding.confidence,
    downtimeRisk: finding.downtimeRisk,
    blastRadius: finding.blastRadius,
    impactAnalysis: finding.impactAnalysis,
    minimizeImpact: finding.minimizeImpact,
    rollbackPath: finding.rollbackPath,
    validationWindow: finding.validationWindow,
    resources: finding.resources || [],
  };
}

function metricAverage(datapoints) {
  const values = (datapoints || []).map((point) => Number(point.Average)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function metricSum(datapoints) {
  const values = (datapoints || []).map((point) => Number(point.Sum)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0);
}

function loadBalancerDimension(loadBalancerArn) {
  const marker = ":loadbalancer/";
  const index = String(loadBalancerArn || "").indexOf(marker);
  return index === -1 ? null : String(loadBalancerArn).slice(index + marker.length);
}

function addRegionToAwsResult(id, data, region) {
  const collectionById = {
    ec2Instances: "Reservations",
    ebsVolumes: "Volumes",
    elasticIps: "Addresses",
    rdsInstances: "DBInstances",
    logGroups: "logGroups",
    loadBalancers: "LoadBalancers",
    computeOptimizerEc2: "instanceRecommendations",
  };
  const collectionKey = collectionById[id];
  if (!collectionKey || !Array.isArray(data?.[collectionKey])) return data;
  return {
    ...data,
    [collectionKey]: data[collectionKey].map((item) => ({ ...item, Region: region })),
  };
}

function hashOauthCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

async function createOauthCode({ user = null, registration = null }) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const code = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `insert into cloudprune_oauth_codes (code_hash, user_id, registration, expires_at)
     values ($1,$2,$3,now() + interval '5 minutes')`,
    [hashOauthCode(code), user?.id || null, registration]
  );
  return code;
}

async function exchangeOauthCode(payload) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const codeHash = hashOauthCode(payload.code || "");
  const result = await pool.query(
    `update cloudprune_oauth_codes
     set consumed_at=now()
     where code_hash=$1
       and consumed_at is null
       and expires_at > now()
     returning registration, user_id`,
    [codeHash]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Google sign-in expired. Please try again.");
  if (row.registration) {
    return { googleRegistration: signGoogleRegistration(row.registration) };
  }
  const userResult = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.provider, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.id=$1`,
    [row.user_id]
  );
  const userRow = userResult.rows[0];
  if (!userRow) throw new Error("Google sign-in expired. Please try again.");
  const user = {
    id: userRow.id,
    account_id: userRow.account_id,
    name: userRow.name,
    email: userRow.email,
    provider: userRow.provider,
    company_name: userRow.company_name,
  };
  return { token: signSession(user), user: publicUser(user) };
}

async function startAwsScan(req) {
  const user = await userFromSession(req);
  const connection = await pool.query(
    `select provider_account_id, role_arn, external_id
     from cloudprune_cloud_connections
     where account_id=$1 and provider='aws'`,
    [user.account_id]
  );
  const aws = connection.rows[0];
  if (!aws) throw new Error("Connect AWS before scanning.");

  let startedRow;
  let isNewScan = false;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`cloudprune-aws-scan:${user.account_id}`]);
    const running = await client.query(
      `select id, provider_account_id, status, monthly_cost, currency, counts, errors, scan_json, created_at, updated_at
       from cloudprune_aws_scans
       where account_id=$1 and status='running'
       order by created_at desc
       limit 1`,
      [user.account_id]
    );
    if (running.rows[0]) {
      startedRow = running.rows[0];
    } else {
      const inserted = await client.query(
        `insert into cloudprune_aws_scans (account_id, provider_account_id, status, scan_json)
         values ($1,$2,'running',$3)
         returning id, provider_account_id, status, monthly_cost, currency, counts, errors, scan_json, created_at, updated_at`,
        [user.account_id, aws.provider_account_id, { progress: 0, message: "Starting AWS scan." }]
      );
      startedRow = inserted.rows[0];
      isNewScan = true;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (!isNewScan) return publicAwsScan(startedRow);
  setImmediate(() => {
    performAwsScan(startedRow.id, user, aws).catch((error) => {
      console.error("CloudPrune AWS scan failed", error);
    });
  });
  await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_scan_started", detail: aws.provider_account_id });
  return publicAwsScan(startedRow);
}

async function getAwsScan(req, scanId) {
  const user = await userFromSession(req);
  const result = await pool.query(
    `select id, provider_account_id, status, monthly_cost, currency, counts, errors, scan_json, created_at, updated_at
     from cloudprune_aws_scans
     where id=$1 and account_id=$2`,
    [scanId, user.account_id]
  );
  if (!result.rows[0]) throw new Error("AWS scan was not found.");
  return publicAwsScan(result.rows[0]);
}

async function updateAwsScanProgress(scanId, completedSteps, totalSteps, message, extra = {}) {
  const denominator = Math.max(1, totalSteps);
  const progress = Math.min(99, Math.max(0, Math.round((completedSteps / denominator) * 100)));
  await pool.query(
    `update cloudprune_aws_scans
     set scan_json = scan_json || $2::jsonb, updated_at=now()
     where id=$1 and status='running'`,
    [scanId, { ...extra, progress, message }]
  );
}

async function performAwsScan(scanId, user, aws) {
  const sessionName = `CloudPruneScan-${Date.now()}`;
  const results = {};
  const errors = [];
  let completedSteps = 0;
  let totalSteps = 4;
  try {
    await updateAwsScanProgress(scanId, completedSteps, totalSteps, "Assuming AWS read-only role.");
    const assumed = await runAwsJson([
      "sts", "assume-role",
      "--role-arn", aws.role_arn,
      "--role-session-name", sessionName,
      "--external-id", aws.external_id,
    ], { timeoutMs: 60000 });
    const credentials = assumed.Credentials;
    if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey || !credentials?.SessionToken) {
      throw new Error("AWS assume-role did not return temporary credentials.");
    }
    completedSteps += 1;
    await updateAwsScanProgress(scanId, completedSteps, totalSteps, "Discovering enabled AWS regions.");
    const scanEnv = {
      AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
      AWS_SESSION_TOKEN: credentials.SessionToken,
      AWS_DEFAULT_REGION: awsScanRegion,
    };
    const { start, end } = monthStartEnd();
    let regions = [awsScanRegion];
    try {
      const regionResult = await runAwsJson(["ec2", "describe-regions", "--all-regions", "--region", awsScanRegion], { env: scanEnv, timeoutMs: 45000 });
      regions = (regionResult.Regions || [])
        .filter((region) => !region.OptInStatus || region.OptInStatus === "opt-in-not-required" || region.OptInStatus === "opted-in")
        .map((region) => region.RegionName)
        .filter(Boolean);
      if (!regions.length) regions = [awsScanRegion];
      if (regions.length > awsScanMaxRegions) {
        errors.push({ check: "regions", message: `Scan limited to ${awsScanMaxRegions} of ${regions.length} enabled AWS regions.` });
        regions = regions.slice(0, awsScanMaxRegions);
      }
    } catch (error) {
      errors.push({ check: "regions", message: error.message });
    }
    completedSteps += 1;

    const globalChecks = [
      ["identity", "Reading AWS account identity.", ["sts", "get-caller-identity"]],
      ["s3Buckets", "Reading S3 buckets.", ["s3api", "list-buckets"]],
      ["cost", "Reading Cost Explorer spend.", [
        "ce", "get-cost-and-usage",
        "--time-period", `Start=${start},End=${end}`,
        "--granularity", "MONTHLY",
        "--metrics", "UnblendedCost",
        "--region", "us-east-1",
      ]],
      ["costByService", "Reading spend by AWS service.", [
        "ce", "get-cost-and-usage",
        "--time-period", `Start=${start},End=${end}`,
        "--granularity", "MONTHLY",
        "--metrics", "UnblendedCost",
        "--group-by", "Type=DIMENSION,Key=SERVICE",
        "--region", "us-east-1",
      ]],
      ["savingsPlansRecommendation", "Reading Savings Plans recommendations.", [
        "ce", "get-savings-plans-purchase-recommendation",
        "--savings-plans-type", "COMPUTE_SP",
        "--term-in-years", "ONE_YEAR",
        "--payment-option", "NO_UPFRONT",
        "--lookback-period-in-days", "SIXTY_DAYS",
        "--region", "us-east-1",
      ]],
    ];
    const regionalChecks = [
      ["ec2Instances", "Reading EC2 instances", (region) => ["ec2", "describe-instances", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Reservations:Reservations[].{Instances:Instances[].{InstanceId:InstanceId,InstanceType:InstanceType,State:State,Tags:Tags}}}"]],
      ["ebsVolumes", "Reading EBS volumes", (region) => ["ec2", "describe-volumes", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Volumes:Volumes[].{VolumeId:VolumeId,State:State,Size:Size,VolumeType:VolumeType,Tags:Tags}}"]],
      ["elasticIps", "Reading Elastic IP addresses", (region) => ["ec2", "describe-addresses", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Addresses:Addresses[].{PublicIp:PublicIp,AllocationId:AllocationId,AssociationId:AssociationId,Tags:Tags}}"]],
      ["lambdas", "Reading Lambda functions", (region) => ["lambda", "list-functions", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "length(Functions)"]],
      ["rdsInstances", "Reading RDS instances", (region) => ["rds", "describe-db-instances", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{DBInstances:DBInstances[].{DBInstanceIdentifier:DBInstanceIdentifier,DBInstanceClass:DBInstanceClass,Engine:Engine,MultiAZ:MultiAZ,DBInstanceStatus:DBInstanceStatus}}"]],
      ["logGroups", "Reading CloudWatch log groups", (region) => ["logs", "describe-log-groups", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{logGroups:logGroups[].{logGroupName:logGroupName,retentionInDays:retentionInDays,storedBytes:storedBytes}}"]],
      ["loadBalancers", "Reading load balancers", (region) => ["elbv2", "describe-load-balancers", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{LoadBalancers:LoadBalancers[].{LoadBalancerName:LoadBalancerName,LoadBalancerArn:LoadBalancerArn,Type:Type,State:State}}"]],
      ["computeOptimizerEc2", "Reading EC2 Compute Optimizer recommendations", (region) => ["compute-optimizer", "get-ec2-instance-recommendations", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{instanceRecommendations:instanceRecommendations[].{instanceArn:instanceArn,instanceName:instanceName,finding:finding,currentInstanceType:currentInstanceType}}"]],
    ];
    const s3LifecycleJobs = () => (results.s3Buckets?.Buckets || []).slice(0, awsScanMaxSampledResources).flatMap((bucket) => [
      { id: "s3Lifecycle", label: `Reading S3 lifecycle for ${bucket.Name}`, bucket: bucket.Name, command: ["s3api", "get-bucket-lifecycle-configuration", "--bucket", bucket.Name] },
    ]);
    const jobs = regions.flatMap((region) => regionalChecks.map(([id, label, command]) => ({ region, id, label, command })));
    totalSteps = completedSteps + globalChecks.length + jobs.length + 1;
    await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Discovered ${regions.length} enabled AWS region${regions.length === 1 ? "" : "s"}.`);

    for (const [id, label, args] of globalChecks) {
      try {
        results[id] = await runAwsJson(args, { env: scanEnv, timeoutMs: 60000 });
      } catch (error) {
        errors.push({ check: id, message: error.message });
      }
      completedSteps += 1;
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, label);
    }

    const lifecycleJobs = s3LifecycleJobs();
    if (lifecycleJobs.length) {
      totalSteps += lifecycleJobs.length;
      results.s3Lifecycle = [];
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading lifecycle policies for ${lifecycleJobs.length} S3 bucket${lifecycleJobs.length === 1 ? "" : "s"}.`);
      for (const job of lifecycleJobs) {
        const lifecycle = await runAwsJsonCheck(job.command, { env: scanEnv, timeoutMs: 45000 });
        results.s3Lifecycle.push({
          name: job.bucket,
          lifecycleStatus: lifecycle.ok ? (Array.isArray(lifecycle.data?.Rules) && lifecycle.data.Rules.length ? "configured" : "missing") : /NoSuchLifecycleConfiguration/i.test(lifecycle.error?.message || "") ? "missing" : "unknown",
          lifecycleConfigured: lifecycle.ok ? Array.isArray(lifecycle.data?.Rules) && lifecycle.data.Rules.length > 0 : false,
          lifecycleError: lifecycle.ok ? null : lifecycle.error?.message,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `${job.label}.`);
      }
    }

    const concurrency = 5;
    for (let index = 0; index < jobs.length; index += concurrency) {
      const batch = jobs.slice(index, index + concurrency);
      await Promise.all(batch.map(async ({ region, id, label, command }) => {
        try {
          const data = await runAwsJson(command(region), { env: scanEnv, timeoutMs: 45000 });
          results[id] = [...(results[id] || []), addRegionToAwsResult(id, data, region)];
        } catch (error) {
          errors.push({ check: `${id}:${region}`, message: error.message });
        }
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `${label} in ${region}.`);
      }));
    }
    const rdsMetricJobs = mergeAwsCollection(results.rdsInstances, "DBInstances").DBInstances.slice(0, awsScanMaxSampledResources).flatMap((instance) => [
      { instance, metricName: "CPUUtilization", statistic: "Average" },
      { instance, metricName: "DatabaseConnections", statistic: "Average" },
    ]);
    const loadBalancerMetricJobs = mergeAwsCollection(results.loadBalancers, "LoadBalancers").LoadBalancers.slice(0, awsScanMaxSampledResources).map((loadBalancer) => ({ loadBalancer }));
    if (rdsMetricJobs.length || loadBalancerMetricJobs.length) {
      totalSteps += rdsMetricJobs.length + loadBalancerMetricJobs.length;
      results.rdsMetrics = [];
      results.loadBalancerMetrics = [];
      const metricPeriod = String(86400);
      const startTime = `${start}T00:00:00Z`;
      const endTime = `${end}T00:00:00Z`;
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, "Reading CloudWatch utilization metrics.");
      const rdsById = new Map();
      for (const job of rdsMetricJobs) {
        const id = job.instance.DBInstanceIdentifier;
        const region = job.instance.Region || awsScanRegion;
        const metric = await runAwsJsonCheck([
          "cloudwatch", "get-metric-statistics",
          "--namespace", "AWS/RDS",
          "--metric-name", job.metricName,
          "--start-time", startTime,
          "--end-time", endTime,
          "--period", metricPeriod,
          "--statistics", job.statistic,
          "--dimensions", `Name=DBInstanceIdentifier,Value=${id}`,
          "--region", region,
        ], { env: scanEnv, timeoutMs: 45000 });
        const current = rdsById.get(id) || {
          id,
          class: job.instance.DBInstanceClass,
          engine: job.instance.Engine,
          multiAz: Boolean(job.instance.MultiAZ),
          status: job.instance.DBInstanceStatus,
          region,
        };
        if (job.metricName === "CPUUtilization") current.averageCpu = metric.ok ? metricAverage(metric.data?.Datapoints) : null;
        if (job.metricName === "DatabaseConnections") current.averageConnections = metric.ok ? metricAverage(metric.data?.Datapoints) : null;
        rdsById.set(id, current);
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading ${job.metricName} for RDS ${id}.`);
      }
      results.rdsMetrics = Array.from(rdsById.values());
      for (const { loadBalancer } of loadBalancerMetricJobs) {
        const dimension = loadBalancerDimension(loadBalancer.LoadBalancerArn);
        const region = loadBalancer.Region || awsScanRegion;
        const metricConfigByType = {
          application: { namespace: "AWS/ApplicationELB", metricName: "RequestCount" },
          network: { namespace: "AWS/NetworkELB", metricName: "ActiveFlowCount" },
        };
        const config = metricConfigByType[loadBalancer.Type];
        const metric = dimension && config ? await runAwsJsonCheck([
          "cloudwatch", "get-metric-statistics",
          "--namespace", config.namespace,
          "--metric-name", config.metricName,
          "--start-time", startTime,
          "--end-time", endTime,
          "--period", metricPeriod,
          "--statistics", "Sum",
          "--dimensions", `Name=LoadBalancer,Value=${dimension}`,
          "--region", region,
        ], { env: scanEnv, timeoutMs: 45000 }) : { ok: false, error: new Error("Unsupported load balancer type.") };
        const metricValue = metric.ok ? metricSum(metric.data?.Datapoints) : null;
        results.loadBalancerMetrics.push({
          name: loadBalancer.LoadBalancerName,
          arn: loadBalancer.LoadBalancerArn,
          type: loadBalancer.Type,
          state: loadBalancer.State?.Code,
          region,
          metricName: config?.metricName || null,
          metricStatus: metric.ok ? (metricValue == null ? "no-data" : "observed") : "unavailable",
          metricSum: metricValue,
          metricError: metric.ok ? null : metric.error?.message,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading load balancer traffic for ${loadBalancer.LoadBalancerName}.`);
      }
    }
    const cost = costFromCostExplorer(results.cost);
    const counts = awsScanCounts(results);
    const assessment = buildAwsAssessment(results, regions, errors);
    const recommendations = buildReport(assessment).findings.slice(0, 20).map(publicRecommendation);
    const status = errors.length ? "completed_with_errors" : "completed";
    const totalEntities = Object.values(counts).reduce((total, value) => total + Number(value || 0), 0);
    completedSteps += 1;
    await pool.query(
      `update cloudprune_aws_scans
       set status=$2, monthly_cost=$3, currency=$4, counts=$5, errors=$6, scan_json=$7, updated_at=now()
       where id=$1`,
      [scanId, status, cost.amount, cost.currency, counts, errors, {
        regions,
        checks: Object.keys(results),
        recommendations,
        limits: {
          maxRegions: awsScanMaxRegions,
          maxInventoryItems: awsScanMaxInventoryItems,
          maxSampledResources: awsScanMaxSampledResources,
        },
        regionalErrors: errors.filter((error) => String(error.check || "").includes(":")),
        progress: 100,
        message: `AWS scan complete. Read ${totalEntities.toLocaleString()} entities.`,
        completedSteps,
        totalSteps,
      }]
    );
    await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_scan_completed", detail: `${aws.provider_account_id}:${status}` });
  } catch (error) {
    await pool.query(
      `update cloudprune_aws_scans
       set status='failed', errors=$2, scan_json = scan_json || $3::jsonb, updated_at=now()
       where id=$1`,
      [scanId, [{ check: "scan", message: error.message }], { progress: 100, message: "AWS scan failed." }]
    );
    await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_scan_failed", detail: aws.provider_account_id });
  }
}

async function googleProfileFromCode(code) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: googleRedirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) throw new Error("Google token exchange failed.");
  const token = await tokenResponse.json();
  const profileResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token || "")}`);
  if (!profileResponse.ok) throw new Error("Google identity verification failed.");
  const profile = await profileResponse.json();
  return validateGoogleProfile(profile);
}

async function googleUserFromProfile(profile) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const email = normalizeEmail(profile.email);
  const existing = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.provider, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.email=$1 or u.google_subject=$2`,
    [email, profile.sub]
  );
  if (existing.rows[0]) {
    await pool.query(`update cloudprune_users set google_subject=$2, provider='google', last_login_at=now() where id=$1`, [existing.rows[0].id, profile.sub]);
    await recordAuthEvent({ userId: existing.rows[0].id, email, eventType: "login", detail: "google" });
    return existing.rows[0];
  }
  return null;
}

async function handleApi(req, res, requestUrl) {
  const pathname = requestUrl.pathname;
  const prefix = routePrefix(pathname);
  const apiPath = prefix ? pathname.slice(prefix.length) : pathname;
  try {
    if (req.method === "POST" && apiPath === "/api/register") {
      const user = await registerUser(await readJson(req));
      return json(res, 201, { token: signSession(user), user: publicUser(user) });
    }
    if (req.method === "POST" && apiPath === "/api/login") {
      const user = await loginUser(await readJson(req));
      return json(res, 200, { token: signSession(user), user: publicUser(user) });
    }
    if (req.method === "POST" && apiPath === "/api/complete-google-registration") {
      const user = await completeGoogleRegistration(await readJson(req));
      return json(res, 201, { token: signSession(user), user: publicUser(user) });
    }
    if (req.method === "POST" && apiPath === "/api/auth/google/exchange") {
      return json(res, 200, await exchangeOauthCode(await readJson(req)));
    }
    if (req.method === "GET" && apiPath === "/api/session") {
      const user = await userFromSession(req);
      return json(res, 200, { token: signSession(user), user: publicUser(user) });
    }
    if (req.method === "POST" && apiPath === "/api/profile") {
      const user = await updateUserProfile(req, await readJson(req));
      return json(res, 200, { token: signSession(user), user: publicUser(user) });
    }
    if (req.method === "GET" && apiPath === "/api/workspace") {
      return json(res, 200, await workspaceForRequest(req));
    }
    if (req.method === "POST" && apiPath === "/api/cloud-connections/aws") {
      return json(res, 200, { connection: await saveAwsConnection(req, await readJson(req)) });
    }
    if (req.method === "POST" && apiPath === "/api/cloud-connections/aws/scan") {
      return json(res, 202, { scan: await startAwsScan(req) });
    }
    const scanMatch = apiPath.match(/^\/api\/cloud-connections\/aws\/scan\/([0-9a-f-]{36})$/i);
    if (req.method === "GET" && scanMatch) {
      return json(res, 200, { scan: await getAwsScan(req, scanMatch[1]) });
    }
    if (req.method === "GET" && apiPath === "/api/auth/google/start") {
      if (!googleClientId || !googleClientSecret) {
        res.writeHead(302, { location: `${prefix}/?sso=not_configured` });
        res.end();
        return;
      }
      const state = cloudpruneOAuthState(prefix);
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", googleClientId);
      url.searchParams.set("redirect_uri", googleRedirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("prompt", "select_account");
      url.searchParams.set("state", state);
      res.writeHead(302, { location: url.toString(), "set-cookie": cloudpruneOAuthCookie(state, prefix) });
      res.end();
      return;
    }
    if (req.method === "GET" && apiPath === "/api/auth/google/callback") {
      const rawState = requestUrl.searchParams.get("state");
      if (!rawState || cookieValue(req, "cloudprune_oauth_state") !== rawState) throw new Error("Google sign-in state did not match.");
      const state = verifyCloudpruneOAuthState(rawState);
      if (!state || state.prefix !== prefix) throw new Error("Google sign-in state did not match.");
      const profile = await googleProfileFromCode(requestUrl.searchParams.get("code"));
      const user = await googleUserFromProfile(profile);
      const authCode = await createOauthCode(user ? { user } : { registration: profile });
      const location = user
        ? `${prefix}/?authCode=${encodeURIComponent(authCode)}`
        : `${prefix}/?authCode=${encodeURIComponent(authCode)}&mode=google-register`;
      res.writeHead(302, {
        location,
        "set-cookie": cloudpruneOAuthCookie("", prefix, "; Max-Age=0"),
      });
      res.end();
      return;
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 400, { error: error.message || "CloudPrune request failed." });
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);
  let urlPath;
  try {
    urlPath = decodeURIComponent(requestUrl.pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  if (urlPath === "/cloudprune" || urlPath === "/cp") {
    res.writeHead(301, { location: `${urlPath}/` });
    res.end();
    return;
  }

  const prefix = routePrefix(urlPath);
  if (prefix && urlPath.startsWith(`${prefix}/api/`)) {
    handleApi(req, res, requestUrl);
    return;
  }

  let filePath = staticFilePathForUrlPath(urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const ext = path.extname(filePath);
    const headers = {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": routePrefix(urlPath) ? "no-store" : "public, max-age=300",
    };
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(serveStatic);

if (require.main === module) {
  Promise.resolve()
    .then(validateRuntimeConfig)
    .then(initDatabase)
    .then(() => {
      server.listen(port, () => {
        console.log(`CloudPrune listening on http://localhost:${port}/cloudprune/`);
        if (!pool) console.log("CLOUDPRUNE_DATABASE_URL is not set; registration persistence is disabled.");
        if (!googleClientId || !googleClientSecret) console.log("Google SSO is not configured for CloudPrune.");
      });
    })
    .catch((error) => {
      console.error("Failed to initialize CloudPrune database", error);
      process.exit(1);
    });
}

module.exports = { awsScanCounts, buildAwsAssessment, cloudpruneOAuthState, cookieValue, costFromCostExplorer, externalIdForAccount, googleRedirectUri, hashPassword, initDatabase, normalizeAwsRoleArn, publicAwsScan, registerUser, server, signGoogleRegistration, signSession, staticFilePathForUrlPath, validateGoogleProfile, validateRuntimeConfig, verifyCloudpruneOAuthState, verifyGoogleRegistration, verifyPassword, verifySession };
