#!/usr/bin/env node
const { collectAwsSignals, metricSummary } = require("./aws-assessment/collectors");
const { awsExecutionOptions, createLimiter } = require("./aws-assessment/aws-client");
const { parseArgs, printHelp } = require("./aws-assessment/cli");
const { costByService } = require("./aws-assessment/costs");
const { buildFindings } = require("./aws-assessment/recommendations");
const { markdownTableCell, markdownText, renderMarkdown } = require("./aws-assessment/markdown");
const { buildPermissionSummary, buildReport, writeReport } = require("./aws-assessment/report");

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const assessment = await collectAwsSignals(options);
    const report = buildReport(assessment);
    const written = writeReport(report, options);
    const missingRequired = report.permissions.filter((item) => item.required && !item.ok);

    console.log(`CloudPrune AWS assessment complete. Findings: ${report.findings.length}.`);
    for (const filePath of written) console.log(`Wrote ${filePath}`);
    if (missingRequired.length) {
      console.error(`Missing required permission: ${missingRequired.map((item) => item.id).join(", ")}`);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

export {
  awsExecutionOptions,
  buildFindings,
  buildPermissionSummary,
  buildReport,
  costByService,
  createLimiter,
  main,
  markdownTableCell,
  markdownText,
  metricSummary,
  parseArgs,
  renderMarkdown,
};

module.exports = {
  buildFindings,
  buildPermissionSummary,
  buildReport,
  awsExecutionOptions,
  costByService,
  createLimiter,
  markdownTableCell,
  markdownText,
  metricSummary,
  main,
  parseArgs,
  renderMarkdown,
};
