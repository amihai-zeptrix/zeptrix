#!/usr/bin/env node
const path = require("node:path");

const compiledPath = path.resolve(__dirname, "../dist/scripts/aws-assessment.js");

try {
  const assessment = require(compiledPath);
  if (require.main === module) assessment.main();
  module.exports = assessment;
} catch (error) {
  if (error.code === "MODULE_NOT_FOUND" && String(error.message || "").includes(compiledPath)) {
    console.error("CloudPrune AWS assessment is written in TypeScript. Run `npm run build` before requiring this shim, or use `npm run assess:aws`.");
    process.exitCode = 1;
  } else {
    throw error;
  }
}
