const { awsScanMaxRegions, awsScanRegion } = require("./config");

function externalIdForAccount(accountId) {
  return `cloudprune-${accountId}`;
}

function normalizeAwsRoleArn(roleArn) {
  const value = String(roleArn || "").trim();
  const match = value.match(/^arn:aws[a-z-]*:iam::(\d{12}):role\/([A-Za-z0-9+=,.@_/-]{1,512})$/);
  if (!match) throw new Error("Enter a valid AWS IAM role ARN.");
  return { roleArn: value, awsAccountId: match[1] };
}

function normalizeAwsScanRegions(regions) {
  const values = Array.isArray(regions) ? regions : [];
  const selected = values.map((region) => String(region || "").trim()).filter(Boolean);
  const normalized = selected.length ? selected : [awsScanRegion];
  const unique = Array.from(new Set(normalized));
  if (unique.length > awsScanMaxRegions) throw new Error(`Select up to ${awsScanMaxRegions} AWS regions for one scan.`);
  for (const region of unique) {
    if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) throw new Error("Select valid AWS regions to scan.");
  }
  return unique;
}

function publicCloudConnection(row) {
  if (!row) return null;
  const metadata = row.metadata || {};
  return {
    provider: row.provider,
    awsAccountId: row.provider_account_id,
    roleArn: row.role_arn,
    externalId: row.external_id,
    regions: normalizeAwsScanRegions(metadata.regions),
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
    regions: scanJson.regions || scanJson.requestedRegions || [],
    progress: Number(scanJson.progress || (row.status === "running" ? 0 : 100)),
    message: scanJson.message || "",
    scannedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  externalIdForAccount,
  normalizeAwsRoleArn,
  normalizeAwsScanRegions,
  publicAwsScan,
  publicCloudConnection,
};
