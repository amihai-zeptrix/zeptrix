const { DEFAULT_CONCURRENCY } = require("./constants");

/**
 * @typedef {{ id: string, service?: string, ok: boolean, error?: string | null }} PermissionSummary
 * @typedef {{ title?: string, strategy?: string, estimatedMonthlySavings?: number | null, confidence?: string, blastRadius?: string, operationalRisk?: string, downtimeRisk?: string, impactAnalysis?: string, minimizeImpact?: string, rollbackPath?: string, validationWindow?: string, resources?: unknown[] }} MarkdownFinding
 * @typedef {{ generatedAt?: string, identity?: { Account?: string }, region?: string, days?: number, maxResources?: number, concurrency?: number, permissions: PermissionSummary[], findings: MarkdownFinding[] }} MarkdownReport
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function markdownText(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function markdownTableCell(value) {
  return markdownText(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * @param {unknown[]} values
 * @returns {string}
 */
function markdownInlineCodeList(values) {
  return values.map((value) => `\`${String(value).replace(/`/g, "\\`")}\``).join(", ");
}

/**
 * @param {MarkdownReport} report
 * @returns {string}
 */
function renderMarkdown(report) {
  const account = markdownText(report.identity?.Account || "unknown");
  const lines = [
    "# CloudPrune AWS Assessment",
    "",
    `Generated: ${markdownText(report.generatedAt)}`,
    `Account: ${account}`,
    `Region: ${markdownText(report.region)}`,
    `Lookback: ${markdownText(report.days)} days`,
    `Resource sample limit: ${markdownText(report.maxResources)}`,
    `AWS CLI concurrency: ${markdownText(report.concurrency || DEFAULT_CONCURRENCY)}`,
    "",
    "## Permission Check",
    "",
    "| Check | Service | Status | Notes |",
    "| --- | --- | --- | --- |",
    ...report.permissions.map((item) => `| ${markdownTableCell(item.id)} | ${markdownTableCell(item.service)} | ${item.ok ? "OK" : "Missing"} | ${markdownTableCell(item.error || "")} |`),
    "",
    "## Findings",
    "",
  ];

  if (!report.findings.length) {
    lines.push("No actionable findings were detected from the available read-only signals.", "");
  }

  for (const finding of report.findings) {
    lines.push(
      `### ${markdownText(finding.title)}`,
      "",
      `- Strategy: ${markdownText(finding.strategy)}`,
      `- Estimated monthly savings: ${finding.estimatedMonthlySavings == null ? "Needs deeper usage data" : `$${finding.estimatedMonthlySavings.toLocaleString()}`}`,
      `- Confidence: ${markdownText(finding.confidence)}`,
      `- Blast radius: ${markdownText(finding.blastRadius)}`,
      `- Operational risk: ${markdownText(finding.operationalRisk)}`,
      `- Downtime risk: ${markdownText(finding.downtimeRisk)}`,
      `- Impact analysis: ${markdownText(finding.impactAnalysis)}`,
      `- Minimize impact: ${markdownText(finding.minimizeImpact)}`,
      `- Rollback path: ${markdownText(finding.rollbackPath)}`,
      `- Validation window: ${markdownText(finding.validationWindow)}`,
      ""
    );
    if (finding.resources?.length) {
      lines.push(`Resources sampled: ${markdownInlineCodeList(finding.resources)}`, "");
    }
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  markdownInlineCodeList,
  markdownTableCell,
  markdownText,
  renderMarkdown,
};
