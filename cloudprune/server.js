const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { Pool } = require("pg");

const port = Number(process.env.PORT || 4321);
const root = __dirname;
const publicRoot = path.join(root, "cloudprune");
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://zeptrix.io").replace(/\/$/, "");
const googleRedirectUri = process.env.CLOUDPRUNE_GOOGLE_REDIRECT_URI || "https://www.zeptrix.io/api/auth/google/callback";
const googleClientId = process.env.CLOUDPRUNE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.CLOUDPRUNE_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const tokenSecret = process.env.CLOUDPRUNE_TOKEN_SECRET || process.env.CRM_TOKEN_SECRET || "local-cloudprune-token-secret";
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

function signSession(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    accountId: user.account_id,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
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
  if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
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
       returning id, account_id, name, email, provider`,
      [account.rows[0].id, name, email, provider === "password" ? hashPassword(password) : null, payload.googleSubject || null, provider]
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
  const result = await pool.query(`select id, account_id, name, email, password_hash, provider from cloudprune_users where email=$1`, [email]);
  const user = result.rows[0];
  if (!user || !user.password_hash || !verifyPassword(payload.password || "", user.password_hash)) {
    await recordAuthEvent({ email, eventType: "login_failed", detail: "invalid_credentials" });
    throw new Error("Invalid email or password.");
  }
  await pool.query(`update cloudprune_users set last_login_at=now() where id=$1`, [user.id]);
  await recordAuthEvent({ userId: user.id, email, eventType: "login", detail: "password" });
  return user;
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

async function upsertGoogleUser(profile) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const email = normalizeEmail(profile.email);
  const existing = await pool.query(`select id, account_id, name, email, provider from cloudprune_users where email=$1 or google_subject=$2`, [email, profile.sub]);
  if (existing.rows[0]) {
    await pool.query(`update cloudprune_users set google_subject=$2, provider='google', last_login_at=now() where id=$1`, [existing.rows[0].id, profile.sub]);
    await recordAuthEvent({ userId: existing.rows[0].id, email, eventType: "login", detail: "google" });
    return existing.rows[0];
  }
  return registerUser({
    name: profile.name || email.split("@")[0],
    company: profile.hd || email.split("@")[1] || "CloudPrune workspace",
    email,
    googleSubject: profile.sub,
  }, "google");
}

async function handleApi(req, res, requestUrl) {
  const pathname = requestUrl.pathname;
  const prefix = routePrefix(pathname);
  const apiPath = prefix ? pathname.slice(prefix.length) : pathname;
  try {
    if (req.method === "POST" && apiPath === "/api/register") {
      const user = await registerUser(await readJson(req));
      return json(res, 201, { token: signSession(user), user: { name: user.name, email: user.email } });
    }
    if (req.method === "POST" && apiPath === "/api/login") {
      const user = await loginUser(await readJson(req));
      return json(res, 200, { token: signSession(user), user: { name: user.name, email: user.email } });
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
      const user = await upsertGoogleUser(profile);
      res.writeHead(302, {
        location: `${prefix}/?token=${encodeURIComponent(signSession(user))}`,
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

module.exports = { cloudpruneOAuthState, googleRedirectUri, hashPassword, initDatabase, registerUser, server, staticFilePathForUrlPath, verifyCloudpruneOAuthState, verifyPassword };
