const { awsScanMaxRegions, awsScanRegion } = require("./config");

type JsonObject = Record<string, unknown>;

interface CloudConnectionRow {
  provider: string;
  provider_account_id: string;
  role_arn: string;
  external_id: string;
  metadata?: {
    regions?: unknown;
  } | null;
  status: string;
  updated_at: unknown;
}

interface AwsScanRow {
  id: string;
  status: string;
  provider_account_id: string;
  monthly_cost?: string | number | null;
  currency?: string | null;
  counts?: JsonObject | null;
  errors?: unknown[] | null;
  scan_json?: {
    recommendations?: unknown[];
    regions?: unknown[];
    requestedRegions?: unknown[];
    progress?: string | number | null;
    message?: string | null;
  } | null;
  created_at: unknown;
  updated_at: unknown;
}

export function externalIdForAccount(accountId: string): string {
  return `cloudprune-${accountId}`;
}

export function normalizeAwsRoleArn(roleArn: unknown): { roleArn: string; awsAccountId: string } {
  const value = String(roleArn || "").trim();
  const match = value.match(/^arn:aws[a-z-]*:iam::(\d{12}):role\/([A-Za-z0-9+=,.@_/-]{1,512})$/);
  if (!match) throw new Error("Enter a valid AWS IAM role ARN.");
  return { roleArn: value, awsAccountId: match[1] };
}

export function normalizeAwsScanRegions(regions: unknown): string[] {
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

export function publicCloudConnection(row: CloudConnectionRow | null) {
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

export function publicAwsScan(row: AwsScanRow | null) {
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
