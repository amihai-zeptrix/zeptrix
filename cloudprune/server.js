const fs = require("node:fs");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { buildReport } = require("./scripts/aws-assessment");
const {
  bearerToken,
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
const {
  awsScanCounts,
  buildAwsAssessment,
  costFromCostExplorer,
  mergeAwsCollection,
  mergeAwsReservations,
  publicRecommendation,
} = require("./src/aws-scan-report");
const { initDatabase, pool } = require("./src/db");
const {
  awsCliMaxOutputBytes,
  awsCliPath,
  awsPrincipalArn,
  awsScanMaxInventoryItems,
  awsScanMaxLogGroups,
  awsScanMaxRegions,
  awsScanMaxSampledResources,
  awsScanRegion,
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

function s3MetricWindow() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function normalizeS3BucketRegion(locationConstraint) {
  if (!locationConstraint || locationConstraint === "None") return "us-east-1";
  if (locationConstraint === "EU") return "eu-west-1";
  return locationConstraint;
}

function latestMetricDataValue(result) {
  const timestamps = result?.Timestamps || [];
  const values = result?.Values || [];
  let latestIndex = -1;
  let latestTime = 0;
  for (let index = 0; index < timestamps.length; index += 1) {
    if (values[index] == null) continue;
    const time = Date.parse(timestamps[index]);
    if (Number.isFinite(time) && time >= latestTime) {
      latestTime = time;
      latestIndex = index;
    }
  }
  return latestIndex === -1 ? null : Number(values[latestIndex]);
}

function s3StorageMetricQueries(bucketName) {
  const storageTypes = [
    "StandardStorage",
    "StandardIAStorage",
    "OneZoneIAStorage",
    "GlacierStorage",
    "DeepArchiveStorage",
    "IntelligentTieringFAStorage",
    "IntelligentTieringIAStorage",
    "IntelligentTieringAAStorage",
    "IntelligentTieringAIAStorage",
    "IntelligentTieringDAAStorage",
  ];
  const sizeQueries = storageTypes.map((storageType, index) => ({
    Id: `s${index}`,
    Label: storageType,
    MetricStat: {
      Metric: {
        Namespace: "AWS/S3",
        MetricName: "BucketSizeBytes",
        Dimensions: [
          { Name: "BucketName", Value: bucketName },
          { Name: "StorageType", Value: storageType },
        ],
      },
      Period: 86400,
      Stat: "Average",
    },
    ReturnData: true,
  }));
  return [
    ...sizeQueries,
    {
      Id: "objects",
      Label: "NumberOfObjects",
      MetricStat: {
        Metric: {
          Namespace: "AWS/S3",
          MetricName: "NumberOfObjects",
          Dimensions: [
            { Name: "BucketName", Value: bucketName },
            { Name: "StorageType", Value: "AllStorageTypes" },
          ],
        },
        Period: 86400,
        Stat: "Average",
      },
      ReturnData: true,
    },
  ];
}

function s3StorageStatsFromMetricData(data) {
  const results = data?.MetricDataResults || [];
  const byLabel = Object.fromEntries(results.map((result) => [result.Label, latestMetricDataValue(result)]));
  const storageBreakdown = Object.fromEntries(Object.entries(byLabel)
    .filter(([label, value]) => label !== "NumberOfObjects" && value != null && value > 0)
    .map(([label, value]) => [label, Math.round(value)]));
  const totalStorageBytes = Object.values(storageBreakdown).reduce((total, value) => total + value, 0);
  const coldStorageBytes = Object.entries(storageBreakdown)
    .filter(([label]) => label !== "StandardStorage" && label !== "IntelligentTieringFAStorage")
    .reduce((total, [, value]) => total + value, 0);
  return {
    objectCount: byLabel.NumberOfObjects == null ? null : Math.round(byLabel.NumberOfObjects),
    totalStorageBytes,
    coldStorageBytes,
    coldStoragePercent: totalStorageBytes ? Math.round((coldStorageBytes / totalStorageBytes) * 1000) / 10 : null,
    storageBreakdown,
  };
}

async function cloudWatchAgentMetricSummary(scanEnv, region, instanceId, metricName) {
  const listed = await runAwsJsonCheck([
    "cloudwatch", "list-metrics",
    "--namespace", "CWAgent",
    "--metric-name", metricName,
    "--dimensions", `Name=InstanceId,Value=${instanceId}`,
    "--region", region,
  ], { env: scanEnv, timeoutMs: 30000 });
  const metrics = listed.ok ? (listed.data?.Metrics || []).slice(0, 5) : [];
  if (!metrics.length) return { status: listed.ok ? "missing" : "unavailable", average: null, maximum: null, error: listed.ok ? null : listed.error?.message };
  const summaries = [];
  const { start, end } = monthStartEnd();
  for (const metric of metrics) {
    const data = await runAwsJsonCheck([
      "cloudwatch", "get-metric-statistics",
      "--namespace", "CWAgent",
      "--metric-name", metricName,
      "--start-time", `${start}T00:00:00Z`,
      "--end-time", `${end}T00:00:00Z`,
      "--period", "86400",
      "--statistics", "Average", "Maximum",
      "--dimensions", ...cloudWatchDimensionsArgs(metric.Dimensions),
      "--region", region,
    ], { env: scanEnv, timeoutMs: 30000 });
    if (data.ok) {
      summaries.push({
        average: metricAverage(data.data?.Datapoints),
        maximum: metricMaximum(data.data?.Datapoints),
      });
    }
  }
  const averages = summaries.map((summary) => summary.average).filter((value) => value != null);
  const maximums = summaries.map((summary) => summary.maximum).filter((value) => value != null);
  return {
    status: averages.length || maximums.length ? "observed" : "no-data",
    average: averages.length ? Math.max(...averages) : null,
    maximum: maximums.length ? Math.max(...maximums) : null,
    error: null,
  };
}

function metricAverage(datapoints) {
  const values = (datapoints || []).map((point) => Number(point.Average)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function metricMaximum(datapoints) {
  const values = (datapoints || []).map((point) => Number(point.Maximum)).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Math.max(...values);
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

function cloudWatchDimensionsArgs(dimensions) {
  return (dimensions || []).map((dimension) => `Name=${dimension.Name || dimension.name},Value=${dimension.Value || dimension.value}`);
}

function addRegionToAwsResult(id, data, region) {
  const collectionById = {
    ec2Instances: "Reservations",
    ebsVolumes: "Volumes",
    elasticIps: "Addresses",
    rdsInstances: "DBInstances",
    logGroups: "logGroups",
    loadBalancers: "LoadBalancers",
    targetGroups: "TargetGroups",
    apiGatewayV2: "Items",
    apiGatewayRest: "items",
    ssmInstances: "InstanceInformationList",
    computeOptimizerEc2: "instanceRecommendations",
  };
  const collectionKey = collectionById[id];
  if (!collectionKey || !Array.isArray(data?.[collectionKey])) return data;
  return {
    ...data,
    [collectionKey]: data[collectionKey].map((item) => ({ ...item, Region: region })),
  };
}

function awsCollectionCount(id, data) {
  if (id === "ec2Instances") {
    return (data?.Reservations || []).reduce((total, reservation) => total + (reservation.Instances || []).length, 0);
  }
  const collectionById = {
    ebsVolumes: "Volumes",
    elasticIps: "Addresses",
    lambdas: "Functions",
    rdsInstances: "DBInstances",
    logGroups: "logGroups",
    loadBalancers: "LoadBalancers",
    targetGroups: "TargetGroups",
    apiGatewayV2: "Items",
    apiGatewayRest: "items",
    ssmInstances: "InstanceInformationList",
    computeOptimizerEc2: "instanceRecommendations",
  };
  const collectionKey = collectionById[id];
  return collectionKey ? (data?.[collectionKey] || []).length : 0;
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
    performAwsScan(startedRow.id, user, aws, requestedRegions).catch((error) => {
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

async function updateAwsScanProgress(scanId, completedSteps, totalSteps, message, extra = {}) {
  const denominator = Math.max(1, totalSteps);
  const progress = Math.min(99, Math.max(0, Math.round((completedSteps / denominator) * 100)));
  await pool.query(
    `update cloudprune_aws_scans
     set scan_json = scan_json || $2::jsonb, updated_at=now()
     where id=$1 and status='running'`,
    [scanId, jsonb({ ...extra, progress, message })]
  );
}

function scanStepLabel(label, region) {
  const step = String(label || "").replace(/^Reading /, "").replace(/\.$/, "");
  return region ? `${step} in ${region}` : step;
}

function runningScanMessage(activeSteps) {
  const steps = Array.from(activeSteps);
  if (!steps.length) return "Finishing current scan batch.";
  const visibleSteps = steps.slice(0, 3).join("; ");
  return `Running ${visibleSteps}${steps.length > 3 ? ` and ${steps.length - 3} more` : ""}.`;
}

async function performAwsScan(scanId, user, aws, requestedRegions = [awsScanRegion]) {
  const sessionName = `CloudPruneScan-${Date.now()}`;
  const results = {};
  const errors = [];
  const inventoryLimits = {
    maxRegions: awsScanMaxRegions,
    maxInventoryItems: awsScanMaxInventoryItems,
    maxLogGroups: awsScanMaxLogGroups,
    maxSampledResources: awsScanMaxSampledResources,
    limitedRegionalChecks: [],
    regionalResults: [],
    truncatedChecks: [],
  };
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
    let regions = requestedRegions;
    let skippedRegions = [];
    try {
      const regionResult = await runAwsJson(["ec2", "describe-regions", "--all-regions", "--region", awsScanRegion], { env: scanEnv, timeoutMs: 45000 });
      const enabledRegions = new Set((regionResult.Regions || [])
        .filter((region) => !region.OptInStatus || region.OptInStatus === "opt-in-not-required" || region.OptInStatus === "opted-in")
        .map((region) => region.RegionName)
        .filter(Boolean));
      skippedRegions = requestedRegions.filter((region) => !enabledRegions.has(region));
      regions = requestedRegions.filter((region) => enabledRegions.has(region));
      if (skippedRegions.length) errors.push({ check: "regions", message: `Skipped disabled or unavailable selected AWS regions: ${skippedRegions.join(", ")}.` });
    } catch (error) {
      errors.push({ check: "regions", message: error.message });
      regions = requestedRegions;
    }
    if (!regions.length) throw new Error("None of the selected AWS regions are enabled for this account.");
    completedSteps += 1;

    const globalChecks = [
      ["identity", "Reading AWS account identity.", ["sts", "get-caller-identity"]],
      ["s3Buckets", "Reading S3 buckets.", ["s3api", "list-buckets", "--max-items", String(awsScanMaxInventoryItems)]],
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
      ["ec2Instances", "Reading EC2 instances", (region) => ["ec2", "describe-instances", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Reservations:Reservations[].{Instances:Instances[].{InstanceId:InstanceId,InstanceType:InstanceType,Architecture:Architecture,PlatformDetails:PlatformDetails,VpcId:VpcId,SubnetId:SubnetId,State:State,Tags:Tags}},NextToken:NextToken}"]],
      ["ebsVolumes", "Reading EBS volumes", (region) => ["ec2", "describe-volumes", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Volumes:Volumes[].{VolumeId:VolumeId,State:State,Size:Size,VolumeType:VolumeType,Tags:Tags},NextToken:NextToken}"]],
      ["elasticIps", "Reading Elastic IP addresses", (region) => ["ec2", "describe-addresses", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Addresses:Addresses[].{PublicIp:PublicIp,AllocationId:AllocationId,AssociationId:AssociationId,Tags:Tags},NextToken:NextToken}"]],
      ["lambdas", "Reading Lambda functions", (region) => ["lambda", "list-functions", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Functions:Functions[].{FunctionName:FunctionName},NextToken:NextToken}"]],
      ["rdsInstances", "Reading RDS instances", (region) => ["rds", "describe-db-instances", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{DBInstances:DBInstances[].{DBInstanceIdentifier:DBInstanceIdentifier,DBInstanceClass:DBInstanceClass,Engine:Engine,MultiAZ:MultiAZ,DBInstanceStatus:DBInstanceStatus},NextToken:NextToken}"]],
      ["logGroups", "Reading CloudWatch log groups", (region) => ["logs", "describe-log-groups", "--region", region, "--max-items", String(awsScanMaxLogGroups), "--page-size", String(Math.min(50, awsScanMaxLogGroups)), "--query", "{logGroups:logGroups[].{logGroupName:logGroupName,retentionInDays:retentionInDays,storedBytes:storedBytes},NextToken:NextToken}"]],
      ["loadBalancers", "Reading load balancers", (region) => ["elbv2", "describe-load-balancers", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{LoadBalancers:LoadBalancers[].{LoadBalancerName:LoadBalancerName,LoadBalancerArn:LoadBalancerArn,Type:Type,State:State},NextToken:NextToken}"]],
      ["targetGroups", "Reading ALB target groups", (region) => ["elbv2", "describe-target-groups", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{TargetGroups:TargetGroups[].{TargetGroupName:TargetGroupName,TargetGroupArn:TargetGroupArn,TargetType:TargetType,Protocol:Protocol,Port:Port,LoadBalancerArns:LoadBalancerArns},NextToken:NextToken}"]],
      ["apiGatewayV2", "Reading API Gateway HTTP APIs", (region) => ["apigatewayv2", "get-apis", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{Items:Items[].{ApiId:ApiId,Name:Name,ProtocolType:ProtocolType,ApiEndpoint:ApiEndpoint},NextToken:NextToken}"]],
      ["apiGatewayRest", "Reading API Gateway REST APIs", (region) => ["apigateway", "get-rest-apis", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{items:items[].{id:id,name:name,endpointConfiguration:endpointConfiguration},position:position}"]],
      ["ssmInstances", "Reading SSM managed instances", (region) => ["ssm", "describe-instance-information", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{InstanceInformationList:InstanceInformationList[].{InstanceId:InstanceId,ComputerName:ComputerName,PlatformName:PlatformName,PlatformType:PlatformType,AgentVersion:AgentVersion,PingStatus:PingStatus},NextToken:NextToken}"]],
      ["computeOptimizerEc2", "Reading EC2 Compute Optimizer recommendations", (region) => ["compute-optimizer", "get-ec2-instance-recommendations", "--region", region, "--max-items", String(awsScanMaxInventoryItems), "--query", "{instanceRecommendations:instanceRecommendations[].{instanceArn:instanceArn,instanceName:instanceName,finding:finding,currentInstanceType:currentInstanceType},NextToken:NextToken}"]],
    ];
    inventoryLimits.limitedRegionalChecks = regionalChecks.map(([id]) => id);
    const s3LifecycleJobs = () => (results.s3Buckets?.Buckets || []).slice(0, awsScanMaxSampledResources).flatMap((bucket) => [
      { id: "s3Lifecycle", label: `Reading S3 lifecycle for ${bucket.Name}`, bucket: bucket.Name, command: ["s3api", "get-bucket-lifecycle-configuration", "--bucket", bucket.Name] },
    ]);
    const jobs = regions.flatMap((region) => regionalChecks.map(([id, label, command]) => ({ region, id, label, command })));
    totalSteps = completedSteps + globalChecks.length + jobs.length + 1;
    await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Scanning ${regions.length} selected AWS region${regions.length === 1 ? "" : "s"}.`, { requestedRegions, regions, skippedRegions });

    for (const [id, label, args] of globalChecks) {
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, label);
      try {
        results[id] = await runAwsJson(args, { env: scanEnv, timeoutMs: 60000 });
      } catch (error) {
        errors.push({ check: id, message: error.message });
      }
      completedSteps += 1;
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed ${label.replace(/\.$/, "").toLowerCase()}.`);
    }
    if (results.s3Buckets?.NextToken || (results.s3Buckets?.Buckets || []).length > awsScanMaxInventoryItems) {
      const returnedCount = Math.min(results.s3Buckets.Buckets.length, awsScanMaxInventoryItems);
      results.s3Buckets = {
        ...results.s3Buckets,
        Buckets: results.s3Buckets.Buckets.slice(0, awsScanMaxInventoryItems),
        CloudPruneTruncated: true,
        CloudPruneReturnedBucketCount: returnedCount,
      };
      inventoryLimits.truncatedChecks.push({
        check: "s3Buckets",
        nextTokenPresent: Boolean(results.s3Buckets.NextToken),
        returnedCount,
      });
      errors.push({ check: "s3Buckets", message: `S3 bucket inventory limited to ${returnedCount} returned buckets${results.s3Buckets.NextToken ? " with more buckets available" : ""}.` });
    }

    const lifecycleJobs = s3LifecycleJobs();
    if (lifecycleJobs.length) {
      totalSteps += lifecycleJobs.length;
      results.s3Lifecycle = [];
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading lifecycle policies for ${lifecycleJobs.length} S3 bucket${lifecycleJobs.length === 1 ? "" : "s"}.`);
      for (const job of lifecycleJobs) {
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `${job.label}.`);
        const lifecycle = await runAwsJsonCheck(job.command, { env: scanEnv, timeoutMs: 45000 });
        const lifecycleStatus = lifecycle.ok ? (Array.isArray(lifecycle.data?.Rules) && lifecycle.data.Rules.length ? "configured" : "missing") : /NoSuchLifecycleConfiguration/i.test(lifecycle.error?.message || "") ? "missing" : "unknown";
        let storageStats = null;
        let bucketRegion = null;
        let storageStatsError = null;
        if (lifecycleStatus === "missing") {
          await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading S3 storage metrics for ${job.bucket}.`);
          const location = await runAwsJsonCheck(["s3api", "get-bucket-location", "--bucket", job.bucket], { env: scanEnv, timeoutMs: 30000 });
          bucketRegion = location.ok ? normalizeS3BucketRegion(location.data?.LocationConstraint) : awsScanRegion;
          const { startTime, endTime } = s3MetricWindow();
          const metrics = await runAwsJsonCheck([
            "cloudwatch", "get-metric-data",
            "--region", bucketRegion,
            "--start-time", startTime,
            "--end-time", endTime,
            "--metric-data-queries", JSON.stringify(s3StorageMetricQueries(job.bucket)),
          ], { env: scanEnv, timeoutMs: 45000 });
          if (metrics.ok) storageStats = s3StorageStatsFromMetricData(metrics.data);
          else storageStatsError = metrics.error?.message || "Unable to read S3 storage metrics.";
        }
        results.s3Lifecycle.push({
          name: job.bucket,
          lifecycleStatus,
          lifecycleConfigured: lifecycle.ok ? Array.isArray(lifecycle.data?.Rules) && lifecycle.data.Rules.length > 0 : false,
          lifecycleError: lifecycle.ok ? null : lifecycle.error?.message,
          region: bucketRegion,
          storageStats,
          storageStatsError,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed ${scanStepLabel(job.label).toLowerCase()}.`);
      }
    }

    const concurrency = 5;
    for (let index = 0; index < jobs.length; index += concurrency) {
      const batch = jobs.slice(index, index + concurrency);
      const activeSteps = new Set(batch.map(({ region, label }) => scanStepLabel(label, region)));
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, runningScanMessage(activeSteps));
      await Promise.all(batch.map(async ({ region, id, label, command }) => {
        const activeStep = scanStepLabel(label, region);
        try {
          const data = await runAwsJson(command(region), { env: scanEnv, timeoutMs: 45000 });
          inventoryLimits.regionalResults.push({
            check: id,
            region,
            returnedCount: awsCollectionCount(id, data),
            truncated: Boolean(data?.NextToken),
          });
          if (data?.NextToken) {
            inventoryLimits.truncatedChecks.push({
              check: id,
              region,
              returnedCount: awsCollectionCount(id, data),
            });
          }
          results[id] = [...(results[id] || []), addRegionToAwsResult(id, data, region)];
        } catch (error) {
          errors.push({ check: `${id}:${region}`, message: error.message });
        }
        completedSteps += 1;
        activeSteps.delete(activeStep);
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, runningScanMessage(activeSteps));
      }));
    }
    const targetGroupJobs = mergeAwsCollection(results.targetGroups, "TargetGroups").TargetGroups
      .slice(0, awsScanMaxSampledResources)
      .map((targetGroup) => ({ targetGroup }));
    const ssmApplicationJobs = mergeAwsCollection(results.ssmInstances, "InstanceInformationList").InstanceInformationList
      .filter((instance) => instance.InstanceId)
      .slice(0, awsScanMaxSampledResources)
      .map((instance) => ({ instance }));
    if (targetGroupJobs.length || ssmApplicationJobs.length) {
      totalSteps += targetGroupJobs.length + ssmApplicationJobs.length;
      results.albTargetMappings = [];
      results.ssmApplications = [];
      for (const { targetGroup } of targetGroupJobs) {
        const region = targetGroup.Region || awsScanRegion;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading ALB target health for ${targetGroup.TargetGroupName}.`);
        const health = await runAwsJsonCheck([
          "elbv2", "describe-target-health",
          "--target-group-arn", targetGroup.TargetGroupArn,
          "--region", region,
        ], { env: scanEnv, timeoutMs: 30000 });
        results.albTargetMappings.push({
          name: targetGroup.TargetGroupName,
          arn: targetGroup.TargetGroupArn,
          targetType: targetGroup.TargetType,
          protocol: targetGroup.Protocol,
          port: targetGroup.Port,
          region,
          loadBalancerArns: targetGroup.LoadBalancerArns || [],
          targets: health.ok ? (health.data?.TargetHealthDescriptions || []).map((item) => ({
            id: item.Target?.Id,
            port: item.Target?.Port,
            state: item.TargetHealth?.State,
            reason: item.TargetHealth?.Reason,
          })) : [],
          error: health.ok ? null : health.error?.message,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed ALB target health for ${targetGroup.TargetGroupName}.`);
      }
      for (const { instance } of ssmApplicationJobs) {
        const region = instance.Region || awsScanRegion;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading SSM application inventory for ${instance.InstanceId}.`);
        const applications = await runAwsJsonCheck([
          "ssm", "list-inventory-entries",
          "--instance-id", instance.InstanceId,
          "--type-name", "AWS:Application",
          "--region", region,
          "--max-items", "50",
        ], { env: scanEnv, timeoutMs: 30000 });
        results.ssmApplications.push({
          id: instance.InstanceId,
          computerName: instance.ComputerName,
          platformName: instance.PlatformName,
          platformType: instance.PlatformType,
          pingStatus: instance.PingStatus,
          region,
          applications: applications.ok ? (applications.data?.Entries || []).map((entry) => ({
            name: entry.Name,
            version: entry.Version,
            publisher: entry.Publisher,
            applicationType: entry.ApplicationType,
          })) : [],
          error: applications.ok ? null : applications.error?.message,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed SSM application inventory for ${instance.InstanceId}.`);
      }
    }
    const ec2MetricJobs = mergeAwsReservations(results.ec2Instances).Reservations
      .flatMap((reservation) => reservation.Instances || [])
      .filter((instance) => instance.InstanceId && instance.State?.Name === "running")
      .slice(0, awsScanMaxSampledResources)
      .map((instance) => ({ instance }));
    const rdsMetricJobs = mergeAwsCollection(results.rdsInstances, "DBInstances").DBInstances.slice(0, awsScanMaxSampledResources).flatMap((instance) => [
      { instance, metricName: "CPUUtilization", statistic: "Average" },
      { instance, metricName: "DatabaseConnections", statistic: "Average" },
    ]);
    const loadBalancerMetricJobs = mergeAwsCollection(results.loadBalancers, "LoadBalancers").LoadBalancers.slice(0, awsScanMaxSampledResources).map((loadBalancer) => ({ loadBalancer }));
    if (ec2MetricJobs.length || rdsMetricJobs.length || loadBalancerMetricJobs.length) {
      totalSteps += ec2MetricJobs.length + rdsMetricJobs.length + loadBalancerMetricJobs.length;
      results.ec2Metrics = [];
      results.rdsMetrics = [];
      results.loadBalancerMetrics = [];
      const metricPeriod = String(86400);
      const startTime = `${start}T00:00:00Z`;
      const endTime = `${end}T00:00:00Z`;
      await updateAwsScanProgress(scanId, completedSteps, totalSteps, "Reading CloudWatch utilization metrics.");
      for (const { instance } of ec2MetricJobs) {
        const id = instance.InstanceId;
        const region = instance.Region || awsScanRegion;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading EC2 utilization for ${id}.`);
        const cpu = await runAwsJsonCheck([
          "cloudwatch", "get-metric-statistics",
          "--namespace", "AWS/EC2",
          "--metric-name", "CPUUtilization",
          "--start-time", startTime,
          "--end-time", endTime,
          "--period", metricPeriod,
          "--statistics", "Average", "Maximum",
          "--dimensions", `Name=InstanceId,Value=${id}`,
          "--region", region,
        ], { env: scanEnv, timeoutMs: 45000 });
        const memory = await cloudWatchAgentMetricSummary(scanEnv, region, id, "mem_used_percent");
        const disk = await cloudWatchAgentMetricSummary(scanEnv, region, id, "disk_used_percent");
        results.ec2Metrics.push({
          id,
          type: instance.InstanceType,
          architecture: instance.Architecture,
          platform: instance.PlatformDetails,
          state: instance.State?.Name,
          region,
          vpcId: instance.VpcId,
          subnetId: instance.SubnetId,
          averageCpu: cpu.ok ? metricAverage(cpu.data?.Datapoints) : null,
          maximumCpu: cpu.ok ? metricMaximum(cpu.data?.Datapoints) : null,
          cpuStatus: cpu.ok ? (cpu.data?.Datapoints?.length ? "observed" : "no-data") : "unavailable",
          cpuError: cpu.ok ? null : cpu.error?.message,
          averageMemory: memory.average,
          maximumMemory: memory.maximum,
          memoryStatus: memory.status,
          memoryError: memory.error,
          averageDisk: disk.average,
          maximumDisk: disk.maximum,
          diskStatus: disk.status,
          diskError: disk.error,
        });
        completedSteps += 1;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed EC2 utilization for ${id}.`);
      }
      const rdsById = new Map();
      for (const job of rdsMetricJobs) {
        const id = job.instance.DBInstanceIdentifier;
        const region = job.instance.Region || awsScanRegion;
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading ${job.metricName} for RDS ${id}.`);
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
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed ${job.metricName} for RDS ${id}.`);
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
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Reading load balancer traffic for ${loadBalancer.LoadBalancerName}.`);
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
        await updateAwsScanProgress(scanId, completedSteps, totalSteps, `Completed load balancer traffic for ${loadBalancer.LoadBalancerName}.`);
      }
    }
    const cost = costFromCostExplorer(results.cost);
    const counts = awsScanCounts(results);
    const assessment = buildAwsAssessment(results, regions, errors);
    const recommendations = buildReport(assessment).findings.slice(0, 20).map(publicRecommendation);
    const status = errors.length ? "completed_with_errors" : "completed";
    const totalEntities = Object.values(counts).reduce((total, value) => total + Number(value || 0), 0);
    completedSteps += 1;
    const finalResult = await pool.query(
      `update cloudprune_aws_scans
       set status=$2, monthly_cost=$3, currency=$4, counts=$5::jsonb, errors=$6::jsonb, scan_json=$7::jsonb, updated_at=now()
       where id=$1 and status='running'
       returning id`,
      [scanId, status, cost.amount, cost.currency, jsonb(counts), jsonb(errors), jsonb({
        regions,
        requestedRegions,
        skippedRegions,
        checks: Object.keys(results),
        recommendations,
        limits: {
          maxRegions: awsScanMaxRegions,
          maxInventoryItems: awsScanMaxInventoryItems,
          maxLogGroups: awsScanMaxLogGroups,
          maxSampledResources: awsScanMaxSampledResources,
        },
        inventoryLimits,
        regionalErrors: errors.filter((error) => String(error.check || "").includes(":")),
        progress: 100,
        message: `AWS scan complete. Read ${totalEntities.toLocaleString()} entities.`,
        completedSteps,
        totalSteps,
      })]
    );
    if (finalResult.rows[0]) await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_scan_completed", detail: `${aws.provider_account_id}:${status}` });
  } catch (error) {
    const failureResult = await pool.query(
      `update cloudprune_aws_scans
       set status='failed', errors=$2, scan_json = scan_json || $3::jsonb, updated_at=now()
       where id=$1 and status='running'
       returning id`,
      [scanId, jsonb([{ check: "scan", message: error.message }]), jsonb({ progress: 100, message: "AWS scan failed." })]
    );
    if (failureResult.rows[0]) await recordAuthEvent({ userId: user.id, email: user.email, eventType: "aws_scan_failed", detail: aws.provider_account_id });
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

module.exports = { awsScanCounts, buildAwsAssessment, cloudpruneOAuthState, cookieValue, costFromCostExplorer, externalIdForAccount, googleRedirectUri, hashPassword, initDatabase, normalizeAwsRoleArn, normalizeAwsScanRegions, publicAwsScan, registerUser, server, signGoogleRegistration, signSession, staticFilePathForUrlPath, validateGoogleProfile, validateRuntimeConfig, verifyCloudpruneOAuthState, verifyGoogleRegistration, verifyPassword, verifySession };
