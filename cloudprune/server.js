const fs = require("node:fs");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { Pool } = require("pg");

const port = Number(process.env.PORT || 4321);
const root = __dirname;
const publicRoot = path.join(root, "cloudprune");
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://zeptrix.io").replace(/\/$/, "");
const cloudFormationTemplateUrl = process.env.CLOUDPRUNE_AWS_CLOUDFORMATION_TEMPLATE_URL || "https://s3.amazonaws.com/elasticbeanstalk-us-east-1-339494983469/cloudprune/aws-readonly-role-template.yaml";
const awsScanRegion = process.env.CLOUDPRUNE_AWS_SCAN_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const awsCliPath = process.env.CLOUDPRUNE_AWS_CLI || "aws";
const googleRedirectUri = process.env.CLOUDPRUNE_GOOGLE_REDIRECT_URI || "https://www.zeptrix.io/api/auth/google/callback";
const googleClientId = process.env.CLOUDPRUNE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.CLOUDPRUNE_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const tokenSecret = process.env.CLOUDPRUNE_TOKEN_SECRET || process.env.CRM_TOKEN_SECRET || "local-cloudprune-token-secret";
const awsPrincipalArn = process.env.CLOUDPRUNE_AWS_PRINCIPAL_ARN || "";
const pool = process.env.CLOUDPRUNE_DATABASE_URL || process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.CLOUDPRUNE_DATABASE_URL || process.env.DATABASE_URL,
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
  return {
    status: row.status,
    awsAccountId: row.provider_account_id,
    monthlyCost: Number(row.monthly_cost || 0),
    currency: row.currency || "USD",
    counts: row.counts || {},
    errors: row.errors || [],
    scannedAt: row.created_at,
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
    `select provider_account_id, status, monthly_cost, currency, counts, errors, created_at
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

function runAwsCli(args, { env = {}, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(awsCliPath, args, {
      env: { ...process.env, ...env, AWS_PAGER: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`AWS CLI timed out while running aws ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
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

function awsScanCounts(results) {
  const reservations = results.ec2Instances?.Reservations || [];
  const ec2Instances = reservations.reduce((total, reservation) => total + (reservation.Instances || []).length, 0);
  return {
    ec2Instances,
    lambdas: (results.lambdas?.Functions || []).length,
    rdsInstances: (results.rdsInstances?.DBInstances || []).length,
    s3Buckets: (results.s3Buckets?.Buckets || []).length,
    ebsVolumes: (results.ebsVolumes?.Volumes || []).length,
    loadBalancers: (results.loadBalancers?.LoadBalancers || []).length,
  };
}

async function scanAwsConnection(req) {
  const user = await userFromSession(req);
  const connection = await pool.query(
    `select provider_account_id, role_arn, external_id
     from cloudprune_cloud_connections
     where account_id=$1 and provider='aws'`,
    [user.account_id]
  );
  const aws = connection.rows[0];
  if (!aws) throw new Error("Connect AWS before scanning.");

  const sessionName = `CloudPruneScan-${Date.now()}`;
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
  const scanEnv = {
    AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
    AWS_SESSION_TOKEN: credentials.SessionToken,
    AWS_DEFAULT_REGION: awsScanRegion,
  };
  const { start, end } = monthStartEnd();
  const checks = [
    ["ec2Instances", ["ec2", "describe-instances", "--region", awsScanRegion]],
    ["ebsVolumes", ["ec2", "describe-volumes", "--region", awsScanRegion]],
    ["lambdas", ["lambda", "list-functions", "--region", awsScanRegion]],
    ["rdsInstances", ["rds", "describe-db-instances", "--region", awsScanRegion]],
    ["loadBalancers", ["elbv2", "describe-load-balancers", "--region", awsScanRegion]],
    ["s3Buckets", ["s3api", "list-buckets"]],
    ["cost", [
      "ce", "get-cost-and-usage",
      "--time-period", `Start=${start},End=${end}`,
      "--granularity", "MONTHLY",
      "--metrics", "UnblendedCost",
      "--region", "us-east-1",
    ]],
  ];
  const results = {};
  const errors = [];
  for (const [id, args] of checks) {
    try {
      results[id] = await runAwsJson(args, { env: scanEnv, timeoutMs: 90000 });
    } catch (error) {
      errors.push({ check: id, message: error.message });
    }
  }
  const cost = costFromCostExplorer(results.cost);
  const counts = awsScanCounts(results);
  const status = errors.length ? "completed_with_errors" : "completed";
  const saved = await pool.query(
    `insert into cloudprune_aws_scans (account_id, provider_account_id, status, monthly_cost, currency, counts, errors, scan_json)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning provider_account_id, status, monthly_cost, currency, counts, errors, created_at`,
    [user.account_id, aws.provider_account_id, status, cost.amount, cost.currency, counts, errors, { region: awsScanRegion, checks: Object.keys(results) }]
  );
  await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_scan_completed", detail: `${aws.provider_account_id}:${status}` });
  return publicAwsScan(saved.rows[0]);
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
  if (profile.aud !== googleClientId || !profile.email) throw new Error("Google identity is not valid for this client.");
  return profile;
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
      return json(res, 200, { scan: await scanAwsConnection(req) });
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
      const state = verifyCloudpruneOAuthState(requestUrl.searchParams.get("state"));
      if (!state || state.prefix !== prefix) throw new Error("Google sign-in state did not match.");
      const profile = await googleProfileFromCode(requestUrl.searchParams.get("code"));
      const user = await googleUserFromProfile(profile);
      const location = user
        ? `${prefix}/?token=${encodeURIComponent(signSession(user))}`
        : `${prefix}/?googleRegistration=${encodeURIComponent(signGoogleRegistration(profile))}`;
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
  initDatabase()
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

module.exports = { awsScanCounts, cloudpruneOAuthState, costFromCostExplorer, externalIdForAccount, googleRedirectUri, hashPassword, initDatabase, normalizeAwsRoleArn, registerUser, server, signGoogleRegistration, signSession, staticFilePathForUrlPath, verifyCloudpruneOAuthState, verifyGoogleRegistration, verifyPassword, verifySession };
