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
const {
  externalIdForAccount,
  normalizeAwsRoleArn,
  normalizeAwsScanRegions,
  publicAwsScan,
  publicCloudConnection,
} = require("./src/aws-models");
const { initDatabase, pool } = require("./src/db");
const { completeGoogleRegistration, loginUser, recordAuthEvent, registerUser, updateUserProfile, userFromSession } = require("./src/user-service");
const { performAwsScan } = require("./src/aws-scan-runner");
const {
  awsPrincipalArn,
  awsScanStaleAfterSeconds,
  cloudFormationTemplateUrl,
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  port,
  validateRuntimeConfig,
} = require("./src/config");
const {
  json,
  jsonb,
  readJson,
  routePrefix,
  staticFilePathForUrlPath,
} = require("./src/http-utils");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
};

async function expireStaleAwsScans(accountId = null) {
  if (!pool) return 0;
  const message = "AWS scan worker stopped before completion. Start a new scan.";
  const params = [`${awsScanStaleAfterSeconds} seconds`, jsonb([{ check: "scan", message }]), jsonb({ progress: 100, message })];
  let accountFilter = "";
  if (accountId) {
    params.push(accountId);
    accountFilter = ` and account_id=$${params.length}`;
  }
  const result = await pool.query(
    `update cloudprune_aws_scans
     set status='failed',
         errors=errors || $2::jsonb,
         scan_json = scan_json || $3::jsonb,
         updated_at=now()
     where status='running'
       and updated_at < now() - $1::interval${accountFilter}`,
    params
  );
  return result.rowCount || 0;
}

async function failOrphanedAwsScansOnStartup() {
  if (!pool) return 0;
  const message = "CloudPrune restarted before this AWS scan completed. Start a new scan.";
  const result = await pool.query(
    `update cloudprune_aws_scans
     set status='failed',
         errors=errors || $1::jsonb,
         scan_json = scan_json || $2::jsonb,
         updated_at=now()
     where status='running'`,
    [jsonb([{ check: "scan", message }]), jsonb({ progress: 100, message })]
  );
  return result.rowCount || 0;
}

async function workspaceForRequest(req) {
  const user = await userFromSession(req);
  await expireStaleAwsScans(user.account_id);
  const connections = await pool.query(
    `select provider, provider_account_id, role_arn, external_id, metadata, status, updated_at
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
  const regions = normalizeAwsScanRegions(payload.regions);
  const result = await pool.query(
    `insert into cloudprune_cloud_connections (account_id, provider, provider_account_id, role_arn, external_id, metadata, status)
     values ($1, 'aws', $2, $3, $4, $5, 'configured')
     on conflict (account_id, provider) do update set
       provider_account_id=excluded.provider_account_id,
       role_arn=excluded.role_arn,
       external_id=excluded.external_id,
       metadata=excluded.metadata,
       status='configured',
       updated_at=now()
     returning provider, provider_account_id, role_arn, external_id, metadata, status, updated_at`,
    [user.account_id, awsAccountId, roleArn, externalId, { regions }]
  );
  await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_connection_saved", detail: awsAccountId });
  return publicCloudConnection(result.rows[0]);
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
  await expireStaleAwsScans(user.account_id);
  const connection = await pool.query(
    `select provider_account_id, role_arn, external_id, metadata
     from cloudprune_cloud_connections
     where account_id=$1 and provider='aws'`,
    [user.account_id]
  );
  const aws = connection.rows[0];
  if (!aws) throw new Error("Connect AWS before scanning.");
  const requestedRegions = normalizeAwsScanRegions(aws.metadata?.regions);

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
        [user.account_id, aws.provider_account_id, jsonb({ progress: 0, message: "Starting AWS scan.", requestedRegions })]
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
    performAwsScan(startedRow.id, user, aws, requestedRegions, { recordAuthEvent }).catch((error) => {
      console.error("CloudPrune AWS scan failed", error);
    });
  });
  await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_scan_started", detail: aws.provider_account_id });
  return publicAwsScan(startedRow);
}

async function getAwsScan(req, scanId) {
  const user = await userFromSession(req);
  await expireStaleAwsScans(user.account_id);
  const result = await pool.query(
    `select id, provider_account_id, status, monthly_cost, currency, counts, errors, scan_json, created_at, updated_at
     from cloudprune_aws_scans
     where id=$1 and account_id=$2`,
    [scanId, user.account_id]
  );
  if (!result.rows[0]) throw new Error("AWS scan was not found.");
  return publicAwsScan(result.rows[0]);
}

async function stopAwsScan(req) {
  const user = await userFromSession(req);
  const result = await pool.query(
    `update cloudprune_aws_scans
     set status=$2,
         scan_json = scan_json || $3::jsonb,
         updated_at=now()
     where id = (
       select id
       from cloudprune_aws_scans
       where account_id=$1 and status='running'
       order by created_at desc
       limit 1
     )
     returning id, provider_account_id, status, monthly_cost, currency, counts, errors, scan_json, created_at, updated_at`,
    [user.account_id, "stopped", jsonb({ progress: 100, message: "AWS scan stopped by user." })]
  );
  if (!result.rows[0]) throw new Error("No running AWS scan was found.");
  await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_scan_stopped", detail: result.rows[0].provider_account_id });
  return publicAwsScan(result.rows[0]);
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
    .then(() => failOrphanedAwsScansOnStartup())
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

module.exports = { cloudpruneOAuthState, cookieValue, externalIdForAccount, googleRedirectUri, hashPassword, initDatabase, normalizeAwsRoleArn, normalizeAwsScanRegions, publicAwsScan, registerUser, server, signGoogleRegistration, signSession, staticFilePathForUrlPath, validateGoogleProfile, validateRuntimeConfig, verifyCloudpruneOAuthState, verifyGoogleRegistration, verifyPassword, verifySession };
