const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const {
  cloudpruneOAuthCookie,
  cloudpruneOAuthState,
  cookieValue,
  hashPassword,
  normalizeEmail,
  publicUser,
  signGoogleRegistration,
  signSession,
  validateGoogleProfile,
  verifyCloudpruneOAuthState,
  verifyGoogleRegistration,
  verifyPassword,
  verifySession,
} = require("./src/auth");
const { externalIdForAccount, normalizeAwsRoleArn, normalizeAwsScanRegions, publicAwsScan } = require("./src/aws-models");
const { initDatabase, pool } = require("./src/db");
const { adminOverview, adminResetUserPassword, adminSpoofUser, adminTenantUsers, submitFeedback } = require("./src/feedback-service");
const { completeGoogleRegistration, loginUser, recordAuthEvent, registerUser, updateUserProfile, userFromSession } = require("./src/user-service");
const { failOrphanedAwsScansOnStartup, getAwsScan, saveAwsConnection, startAwsScan, stopAwsScan, workspaceForRequest } = require("./src/workspace-service");
const {
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  port,
  validateRuntimeConfig,
} = require("./src/config");
const {
  json,
  readJson,
  routePrefix,
  staticFilePathForUrlPath,
} = require("./src/http-utils");

import type { IncomingMessage, ServerResponse } from "node:http";

type RoutePrefix = "/cloudprune" | "/cp";

interface OAuthUserRow {
  id: string;
  account_id: string;
  name: string;
  email: string;
  provider?: string;
  company_name: string;
}

interface GoogleProfile {
  sub?: string;
  email?: string;
  name?: string;
  hd?: string;
}

interface OAuthCodePayload {
  code?: unknown;
}

interface OAuthCodeInput {
  user?: OAuthUserRow | null;
  registration?: GoogleProfile | null;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
};

function hashOauthCode(code: unknown): string {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

async function createOauthCode({ user = null, registration = null }: OAuthCodeInput): Promise<string> {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const code = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `insert into cloudprune_oauth_codes (code_hash, user_id, registration, expires_at)
     values ($1,$2,$3,now() + interval '5 minutes')`,
    [hashOauthCode(code), user?.id || null, registration]
  );
  return code;
}

async function exchangeOauthCode(payload: OAuthCodePayload) {
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

async function googleProfileFromCode(code: string | null) {
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
  const token = await tokenResponse.json() as { id_token?: string };
  const profileResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token || "")}`);
  if (!profileResponse.ok) throw new Error("Google identity verification failed.");
  const profile = await profileResponse.json();
  return validateGoogleProfile(profile);
}

async function googleUserFromProfile(profile: GoogleProfile): Promise<OAuthUserRow | null> {
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

async function handleApi(req: IncomingMessage, res: ServerResponse, requestUrl: URL): Promise<void> {
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
    if (req.method === "POST" && apiPath === "/api/feedback") {
      return json(res, 201, { feedback: await submitFeedback(req, await readJson(req)) });
    }
    if (req.method === "GET" && apiPath === "/api/admin/overview") {
      return json(res, 200, await adminOverview(req));
    }
    const adminTenantUsersMatch = apiPath.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})\/users$/i);
    if (req.method === "GET" && adminTenantUsersMatch) {
      return json(res, 200, await adminTenantUsers(req, adminTenantUsersMatch[1]));
    }
    const adminPasswordMatch = apiPath.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/password$/i);
    if (req.method === "POST" && adminPasswordMatch) {
      return json(res, 200, { user: await adminResetUserPassword(req, adminPasswordMatch[1], await readJson(req)) });
    }
    const adminSpoofMatch = apiPath.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/spoof$/i);
    if (req.method === "POST" && adminSpoofMatch) {
      return json(res, 200, await adminSpoofUser(req, adminSpoofMatch[1]));
    }
    if (req.method === "POST" && apiPath === "/api/cloud-connections/aws") {
      return json(res, 200, { connection: await saveAwsConnection(req, await readJson(req)) });
    }
    if (req.method === "POST" && apiPath === "/api/cloud-connections/aws/scan") {
      return json(res, 202, { scan: await startAwsScan(req) });
    }
    if (req.method === "POST" && apiPath === "/api/cloud-connections/aws/scan/stop") {
      return json(res, 200, { scan: await stopAwsScan(req) });
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
      const state = cloudpruneOAuthState(prefix as RoutePrefix);
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
  } catch (error: any) {
    return json(res, 400, { error: error.message || "CloudPrune request failed." });
  }
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
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

  let filePath: string | null = staticFilePathForUrlPath(urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const ext = path.extname(filePath);
    const headers: Record<string, string> = {
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
    .then(() => failOrphanedAwsScansOnStartup())
    .then(() => {
      server.listen(port, () => {
        console.log(`CloudPrune listening on http://localhost:${port}/cloudprune/`);
        if (!pool) console.log("CLOUDPRUNE_DATABASE_URL is not set; registration persistence is disabled.");
        if (!googleClientId || !googleClientSecret) console.log("Google SSO is not configured for CloudPrune.");
      });
    })
    .catch((error: unknown) => {
      console.error("Failed to initialize CloudPrune database", error);
      process.exit(1);
    });
}

export { cloudpruneOAuthState, cookieValue, externalIdForAccount, googleRedirectUri, hashPassword, initDatabase, normalizeAwsRoleArn, normalizeAwsScanRegions, publicAwsScan, registerUser, server, signGoogleRegistration, signSession, staticFilePathForUrlPath, validateGoogleProfile, validateRuntimeConfig, verifyCloudpruneOAuthState, verifyGoogleRegistration, verifyPassword, verifySession };
