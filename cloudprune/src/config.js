const path = require("node:path");

const port = Number(process.env.PORT || 4321);
const root = path.resolve(__dirname, "..");
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
const awsScanMaxLogGroups = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_LOG_GROUPS || 50);
const awsScanMaxSampledResources = Number(process.env.CLOUDPRUNE_AWS_SCAN_MAX_SAMPLED_RESOURCES || 25);
const awsScanStaleAfterSeconds = Number(process.env.CLOUDPRUNE_AWS_SCAN_STALE_AFTER_SECONDS || 300);
const googleRedirectUri = process.env.CLOUDPRUNE_GOOGLE_REDIRECT_URI || "https://www.zeptrix.io/api/auth/google/callback";
const googleClientId = process.env.CLOUDPRUNE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.CLOUDPRUNE_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const tokenSecret = process.env.CLOUDPRUNE_TOKEN_SECRET || process.env.CRM_TOKEN_SECRET || (databaseUrl || isProduction ? "" : "local-cloudprune-token-secret");
const awsPrincipalArn = process.env.CLOUDPRUNE_AWS_PRINCIPAL_ARN || "";
const cloudpruneOauthCookieDomain = process.env.CLOUDPRUNE_OAUTH_COOKIE_DOMAIN || "zeptrix.io";

function validateRuntimeConfig() {
  if ((databaseUrl || isProduction) && !tokenSecret) throw new Error("CLOUDPRUNE_TOKEN_SECRET or CRM_TOKEN_SECRET is required when persistence is enabled.");
  if (isProduction && !cloudFormationTemplateUrl) throw new Error("CLOUDPRUNE_AWS_CLOUDFORMATION_TEMPLATE_URL is required in production.");
  if (!Number.isInteger(awsScanMaxRegions) || awsScanMaxRegions < 1 || awsScanMaxRegions > 30) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_REGIONS must be an integer from 1 to 30.");
  if (!Number.isInteger(awsScanMaxInventoryItems) || awsScanMaxInventoryItems < 1 || awsScanMaxInventoryItems > 5000) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_INVENTORY_ITEMS must be an integer from 1 to 5000.");
  if (!Number.isInteger(awsScanMaxLogGroups) || awsScanMaxLogGroups < 1 || awsScanMaxLogGroups > 1000) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_LOG_GROUPS must be an integer from 1 to 1000.");
  if (!Number.isInteger(awsScanMaxSampledResources) || awsScanMaxSampledResources < 1 || awsScanMaxSampledResources > 250) throw new Error("CLOUDPRUNE_AWS_SCAN_MAX_SAMPLED_RESOURCES must be an integer from 1 to 250.");
  if (!Number.isInteger(awsScanStaleAfterSeconds) || awsScanStaleAfterSeconds < 60 || awsScanStaleAfterSeconds > 3600) throw new Error("CLOUDPRUNE_AWS_SCAN_STALE_AFTER_SECONDS must be an integer from 60 to 3600.");
}

module.exports = {
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
  cloudpruneOauthCookieDomain,
  databaseUrl,
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  isProduction,
  port,
  publicRoot,
  tokenSecret,
  validateRuntimeConfig,
};
