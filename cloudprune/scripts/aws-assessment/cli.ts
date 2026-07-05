const path = require("node:path");
const {
  DEFAULT_AWS_TIMEOUT_MS,
  DEFAULT_CONCURRENCY,
  DEFAULT_DAYS,
  DEFAULT_REGION,
} = require("./constants");

type AwsAssessmentArgs = {
  days: number;
  concurrency: number;
  format: string;
  maxResources: number;
  outDir: string;
  region: string;
  timeoutMs: number;
  profile?: string;
  help?: boolean;
};

/**
 * @typedef {{
 *   days: number,
 *   concurrency: number,
 *   format: string,
 *   maxResources: number,
 *   outDir: string,
 *   region: string,
 *   timeoutMs: number,
 *   profile?: string,
 *   help?: boolean,
 * }} AwsAssessmentArgs
 */

/**
 * @param {string[]} argv
 * @returns {AwsAssessmentArgs}
 */
function parseArgs(argv: string[]): AwsAssessmentArgs {
  const args: AwsAssessmentArgs = {
    days: DEFAULT_DAYS,
    concurrency: DEFAULT_CONCURRENCY,
    format: "both",
    maxResources: 25,
    outDir: path.resolve(process.cwd(), "reports"),
    region: DEFAULT_REGION,
    timeoutMs: DEFAULT_AWS_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--concurrency") args.concurrency = Number(argv[++index]);
    else if (arg === "--days") args.days = Number(argv[++index]);
    else if (arg === "--format") args.format = argv[++index];
    else if (arg === "--max-resources") args.maxResources = Number(argv[++index]);
    else if (arg === "--out-dir") args.outDir = path.resolve(argv[++index]);
    else if (arg === "--profile") args.profile = argv[++index];
    else if (arg === "--region") args.region = argv[++index];
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++index]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.days) || args.days < 1 || args.days > 366) throw new Error("--days must be an integer from 1 to 366.");
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 20) throw new Error("--concurrency must be an integer from 1 to 20.");
  if (!Number.isInteger(args.maxResources) || args.maxResources < 1 || args.maxResources > 250) throw new Error("--max-resources must be an integer from 1 to 250.");
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs < 1000 || args.timeoutMs > 300000) throw new Error("--timeout-ms must be an integer from 1000 to 300000.");
  if (!["json", "markdown", "both"].includes(args.format)) throw new Error("--format must be json, markdown, or both.");
  return args;
}

/**
 * @returns {void}
 */
function printHelp(): void {
  console.log(`CloudPrune AWS read-only assessment

Usage:
  npm run assess:aws -- [options]

Options:
  --profile <name>     AWS profile to use
  --region <region>    AWS region to inspect (default: ${DEFAULT_REGION})
  --concurrency <n>    Concurrent AWS CLI calls for sampled resource checks, 1-20 (default: ${DEFAULT_CONCURRENCY})
  --days <number>      Cost lookback window, 1-366 (default: ${DEFAULT_DAYS})
  --format <value>     json, markdown, or both (default: both)
  --max-resources <n>  Max resources sampled for per-resource metric checks (default: 25)
  --timeout-ms <n>     Timeout per AWS CLI command, 1000-300000 (default: ${DEFAULT_AWS_TIMEOUT_MS})
  --out-dir <path>     Report output directory (default: ./reports)

Required AWS CLI credentials should be read-only. Missing optional permissions are reported, not treated as fatal.`);
}

module.exports = {
  parseArgs,
  printHelp,
};
