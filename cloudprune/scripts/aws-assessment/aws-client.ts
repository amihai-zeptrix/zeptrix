const { spawn } = require("node:child_process");
const { DEFAULT_AWS_TIMEOUT_MS } = require("./constants");

type AwsLimiter = <T>(task: () => Promise<T> | T) => Promise<T>;
type AwsExecutionOptions = {
  profile?: string;
  region?: string | null;
  timeoutMs?: number;
  awsLimiter?: AwsLimiter;
  skipLimit?: boolean;
};
type AwsJsonResult = { ok: boolean; data?: any; error?: string };
type QueueItem = {
  task: () => Promise<unknown> | unknown;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

/**
 * @typedef {{ profile?: string, region?: string | null, timeoutMs?: number, awsLimiter?: <T>(task: () => Promise<T> | T) => Promise<T>, skipLimit?: boolean }} AwsExecutionOptions
 * @typedef {{ ok: boolean, data?: any, error?: string }} AwsJsonResult
 */

/**
 * @param {unknown} stderr
 * @returns {string}
 */
function compactError(stderr: unknown): string {
  const text = String(stderr || "").trim();
  return text.split("\n").map((line) => line.trim()).filter(Boolean).slice(-2).join(" ") || "Unknown AWS CLI error.";
}

/**
 * @param {number} concurrency
 * @returns {<T>(task: () => Promise<T> | T) => Promise<T>}
 */
function createLimiter(concurrency: number): AwsLimiter {
  let active = 0;
  const queue: QueueItem[] = [];

  /** @returns {void} */
  function drain(): void {
    while (active < concurrency && queue.length) {
      const item = queue.shift();
      if (!item) continue;
      active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  }

  return function limit<T>(task: () => Promise<T> | T): Promise<T> {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve: resolve as (value: unknown) => void, reject });
      drain();
    });
  };
}

/**
 * @param {AwsExecutionOptions} options
 * @param {Partial<AwsExecutionOptions>} [extra]
 * @returns {AwsExecutionOptions}
 */
function awsExecutionOptions(options: AwsExecutionOptions, extra: Partial<AwsExecutionOptions> = {}): AwsExecutionOptions {
  return {
    profile: options.profile,
    timeoutMs: options.timeoutMs,
    awsLimiter: options.awsLimiter,
    ...extra,
  };
}

/**
 * @param {string[]} commandArgs
 * @param {AwsExecutionOptions} [options]
 * @returns {Promise<AwsJsonResult>}
 */
async function runAwsJson(commandArgs: string[], options: AwsExecutionOptions = {}): Promise<AwsJsonResult> {
  if (options.awsLimiter && !options.skipLimit) {
    return options.awsLimiter(() => runAwsJson(commandArgs, { ...options, skipLimit: true }));
  }

  const args = [...commandArgs, "--output", "json"];
  if (options.profile) args.unshift("--profile", options.profile);
  if (options.region) args.unshift("--region", options.region);

  return new Promise<AwsJsonResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = options.timeoutMs || DEFAULT_AWS_TIMEOUT_MS;
    const child = spawn("aws", args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolve({ ok: false, error: `AWS CLI command timed out after ${timeoutMs}ms.` });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk;
      if (stdout.length > 20 * 1024 * 1024) {
        settled = true;
        child.kill("SIGTERM");
        clearTimeout(timer);
        resolve({ ok: false, error: "AWS CLI output exceeded 20MB." });
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT" ? "AWS CLI is not installed or not on PATH." : error.message });
    });
    child.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ ok: false, error: compactError(stderr) });
        return;
      }

      try {
        resolve({ ok: true, data: JSON.parse(stdout || "{}") });
      } catch (error: any) {
        resolve({ ok: false, error: `AWS CLI returned invalid JSON: ${error.message}` });
      }
    });
  });
}

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * @param {Record<string, any>} checks
 * @param {string} id
 * @param {string} service
 * @param {AwsJsonResult} result
 * @returns {void}
 */
function addCheck(checks: Record<string, any>, id: string, service: string, result: AwsJsonResult): void {
  checks[id] = {
    service,
    ok: result.ok,
    data: result.data,
    error: result.error,
    required: false,
  };
}

module.exports = {
  addCheck,
  awsExecutionOptions,
  compactError,
  createLimiter,
  mapWithConcurrency,
  runAwsJson,
};
