const {
  externalIdForAccount,
  normalizeAwsRoleArn,
  normalizeAwsScanRegions,
  publicAwsScan,
  publicCloudConnection,
} = require("./aws-models");
const {
  awsPrincipalArn,
  awsScanStaleAfterSeconds,
  cloudFormationTemplateUrl,
} = require("./config");
const { pool } = require("./db");
const { jsonb } = require("./http-utils");
const { performAwsScan } = require("./aws-scan-runner");
const { publicUser } = require("./auth");
const { recordAuthEvent, userFromSession } = require("./user-service");
const { listAutomationPlans } = require("./automation-service");

interface RequestLike {
  headers: {
    authorization?: string;
  };
}

interface AwsConnectionPayload {
  roleArn?: unknown;
  externalId?: unknown;
  regions?: unknown;
}

interface AwsScanRow {
  id: string;
  provider_account_id: string;
}

async function expireStaleAwsScans(accountId: string | null = null): Promise<number> {
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

async function failOrphanedAwsScansOnStartup(): Promise<number> {
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

async function workspaceForRequest(req: RequestLike) {
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
    automationPlans: (await listAutomationPlans(req)).automationPlans,
    awsSetup: {
      externalId: byProvider.aws?.externalId || externalIdForAccount(user.account_id),
      principalArn: awsPrincipalArn,
      cloudFormationTemplateUrl,
    },
  };
}

async function saveAwsConnection(req: RequestLike, payload: AwsConnectionPayload) {
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
  await recordAuthEvent({
    req,
    userId: user.id,
    accountId: user.account_id,
    email: user.email,
    eventType: "aws_connection_saved",
    detail: `AWS connection saved for account ${awsAccountId}`,
    targetType: "aws_connection",
    targetId: awsAccountId,
    metadata: { regions },
  });
  return publicCloudConnection(result.rows[0]);
}

async function startAwsScan(req: RequestLike) {
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

  let startedRow: AwsScanRow | null = null;
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
  await recordAuthEvent({
    req,
    userId: user.id,
    accountId: user.account_id,
    email: user.email,
    eventType: "aws_scan_started",
    detail: `AWS scan started for account ${aws.provider_account_id}`,
    targetType: "aws_scan",
    targetId: startedRow.id,
    metadata: { awsAccountId: aws.provider_account_id, regions: requestedRegions },
  });
  return publicAwsScan(startedRow);
}

async function getAwsScan(req: RequestLike, scanId: string) {
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

async function stopAwsScan(req: RequestLike) {
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
  await recordAuthEvent({
    req,
    userId: user.id,
    accountId: user.account_id,
    email: user.email,
    eventType: "aws_scan_stopped",
    detail: `AWS scan stopped for account ${result.rows[0].provider_account_id}`,
    targetType: "aws_scan",
    targetId: result.rows[0].id,
  });
  return publicAwsScan(result.rows[0]);
}

export {
  expireStaleAwsScans,
  failOrphanedAwsScansOnStartup,
  getAwsScan,
  saveAwsConnection,
  startAwsScan,
  stopAwsScan,
  workspaceForRequest,
};
