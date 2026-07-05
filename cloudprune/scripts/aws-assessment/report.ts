const fs = require("node:fs");
const path = require("node:path");
const { costByService } = require("./costs");
const { buildFindings } = require("./recommendations");
const { renderMarkdown } = require("./markdown");

type AssessmentCheck = { service?: string; ok?: boolean; required?: boolean; error?: string | null; data?: any };
type Assessment = { generatedAt: string; region?: string; days?: number; concurrency?: number | null; maxResources?: number | null; checks?: Record<string, AssessmentCheck> };
type PermissionSummary = { id: string; service: string | undefined; ok: boolean; required: boolean; error: string | null | undefined };
type ReportWriteOptions = { format: string; outDir: string };
type Finding = { [key: string]: any; id?: string; title?: string; impactAnalysis?: string; estimatedMonthlySavings?: number | null; operationalRisk?: string; confidence?: string; statistics?: Record<string, string>; resources?: unknown[] };
type AssessmentReport = { generatedAt: string; account: any; identity: any; region?: string; days?: number; concurrency?: number | null; maxResources?: number | null; permissions: PermissionSummary[]; costs: any[]; findings: Finding[] };

/**
 * @typedef {{ service?: string, ok?: boolean, required?: boolean, error?: string | null, data?: any }} AssessmentCheck
 * @typedef {{ generatedAt: string, region?: string, days?: number, concurrency?: number | null, maxResources?: number | null, checks?: Record<string, any> }} Assessment
 * @typedef {{ id: string, service: string | undefined, ok: boolean, required: boolean, error: string | null | undefined }} PermissionSummary
 * @typedef {{ format: string, outDir: string }} ReportWriteOptions
 * @typedef {{ [key: string]: any, id?: string, title?: string, impactAnalysis?: string, estimatedMonthlySavings?: number | null, operationalRisk?: string, confidence?: string, statistics?: Record<string, string>, resources?: unknown[] }} Finding
 * @typedef {{ generatedAt: string, account: any, identity: any, region?: string, days?: number, concurrency?: number | null, maxResources?: number | null, permissions: PermissionSummary[], costs: import("./costs").ServiceCost[], findings: Finding[] }} AssessmentReport
 */

/**
 * @param {Assessment} assessment
 * @returns {PermissionSummary[]}
 */
function buildPermissionSummary(assessment: Assessment): PermissionSummary[] {
  return Object.entries(assessment.checks || {}).map(([id, check]: [string, AssessmentCheck]) => ({
    id,
    service: check.service,
    ok: Boolean(check.ok),
    required: Boolean(check.required),
    error: check.ok ? null : check.error,
  }));
}

/**
 * @param {Assessment} assessment
 * @returns {AssessmentReport}
 */
function buildReport(assessment: Assessment): AssessmentReport {
  return {
    generatedAt: assessment.generatedAt,
    account: assessment.checks?.identity?.data?.Account || null,
    identity: assessment.checks?.identity?.data || null,
    region: assessment.region,
    days: assessment.days,
    concurrency: assessment.concurrency || null,
    maxResources: assessment.maxResources || null,
    permissions: buildPermissionSummary(assessment),
    costs: costByService(assessment.checks?.costByService).slice(0, 20),
    findings: buildFindings(assessment),
  };
}

/**
 * @param {AssessmentReport} report
 * @param {ReportWriteOptions} options
 * @returns {string[]}
 */
function writeReport(report: AssessmentReport, options: ReportWriteOptions): string[] {
  fs.mkdirSync(options.outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const baseName = `cloudprune-aws-assessment-${report.account || "unknown"}-${stamp}`;
  const written = [];

  if (options.format === "json" || options.format === "both") {
    const jsonPath = path.join(options.outDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    written.push(jsonPath);
  }

  if (options.format === "markdown" || options.format === "both") {
    const markdownPath = path.join(options.outDir, `${baseName}.md`);
    fs.writeFileSync(markdownPath, renderMarkdown(report));
    written.push(markdownPath);
  }

  return written;
}

module.exports = {
  buildPermissionSummary,
  buildReport,
  writeReport,
};
