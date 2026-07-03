const path = require("node:path");

export const port: number = Number(process.env.PORT || 4321);
const root = path.resolve(__dirname, "..");
export const publicRoot: string = path.join(root, "cloudprune");
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://zeptrix.io").replace(/\/$/, "");
export const isProduction: boolean = process.env.NODE_ENV === "production";
export const databaseUrl: string = process.env.CLOUDPRUNE_DATABASE_URL || process.env.DATABASE_URL || "";
export const cloudFormationTemplateUrl: string = process.env.CLOUDPRUNE_AWS_CLOUDFORMATION_TEMPLATE_URL || (isProduction ? "" : `${publicBaseUrl}/cloudprune/aws-readonly-role-template.yaml`);
export const awsScanRegion: string = process.env.CLOUDPRUNE_AWS_SCAN_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
export const awsCliPath: string = process.env.CLOUDPRUNE_AWS_CLI || "aws";
export const awsCliMaxOutputBytes: number = Number(process.env.CLOUDPRUNE_AWS_CLI_MAX_OUTPUT_BYTES || 5 * 1024 * 1024);
export const awsScanMaxRegions: number = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_REGIONS || 12);
export const awsScanMaxInventoryItems: number = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_INVENTORY_ITEMS || 200);
export const awsScanMaxLogGroups: number = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_LOG_GROUPS || 50);
export const awsScanMaxSampledResources: number = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_SAMPLED_RESOURCES || 25);
export const awsScanStaleAfterSeconds: number = Number(process.env.CLOUDPRUNE_AWS_SCAN_STALE_AFTER_SECONDS || 300);
export const googleRedirectUri: string = process.env.CLOUDPRUNE_GOOGLE_REDIRECT_URI || "https://www.zeptrix.io/api/auth/google/callback";
export const googleClientId: string = process.env.CLOUDPRUNE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
export const googleClientSecret: string = process.env.CLOUDPRUNE_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
export const tokenSecret: string = process.env.CLOUDPRUNE_TOKEN_SECRET || process.env.CRM_TOKEN_SECRET || (databaseUrl || isProduction ? "" : "local-cloudprune-token-secret");
export const adminPassword: string = process.env.CLOUDPRUNE_ADMIN_PASSWORD || "";
export const awsPrincipalArn: string = process.env.CLOUDPRUNE_AWS_PRINCIPAL_ARN || "";
export const cloudpruneOauthCookieDomain: string = process.env.CLOUDPRUNE_OAUTH_COOKIE_DOMAIN || "zeptrix.io";
export const auditEmailTo: string = process.env.CLOUDPRUNE_AUDIT_EMAIL_TO || "amihaih@gmail.com";
export const auditEmailFrom: string = process.env.CLOUDPRUNE_AUDIT_EMAIL_FROM || process.env.LEAD_FROM_EMAIL || "amihai@zeptrix.io";
export const auditEmailSubject: string = process.env.CLOUDPRUNE_AUDIT_EMAIL_SUBJECT || "cp audit log event";

export function validateRuntimeConfig(): void {
  if ((databaseUrl || isProduction) && !tokenSecret) throw new Error("CLOUDPRUNE_TOKEN_SECRET or CRM_TOKEN_SECRET is required when persistence is enabled.");
  if (isProduction && !adminPassword) throw new Error("CLOUDPRUNE_ADMIN_PASSWORD is required in production.");
  if (isProduction && !cloudFormationTemplateUrl) throw new Error("CLOUDPRUNE_AWS_CLOUDFORMATION_TEMPLATE_URL is required in production.");
  if (!Number.isInteger(awsScanMaxRegions) || awsScanMaxRegions < 1 || awsScanMaxRegions > 30) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_REGIONS must be an integer from 1 to 30.");
  if (!Number.isInteger(awsScanMaxInventoryItems) || awsScanMaxInventoryItems < 1 || awsScanMaxInventoryItems > 5000) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_INVENTORY_ITEMS must be an integer from 1 to 5000.");
  if (!Number.isInteger(awsScanMaxLogGroups) || awsScanMaxLogGroups < 1 || awsScanMaxLogGroups > 1000) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_LOG_GROUPS must be an integer from 1 to 1000.");
  if (!Number.isInteger(awsScanMaxSampledResources) || awsScanMaxSampledResources < 1 || awsScanMaxSampledResources > 250) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_SAMPLED_RESOURCES must be an integer from 1 to 250.");
  if (!Number.isInteger(awsScanStaleAfterSeconds) || awsScanStaleAfterSeconds < 60 || awsScanStaleAfterSeconds > 3600) throw new Error("CLOUDPRUNE_AWS_SCAN_STALE_AFTER_SECONDS must be an integer from 60 to 3600.");
}
