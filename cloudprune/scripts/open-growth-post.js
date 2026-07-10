#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { targets, draftForTarget } = require("./growth-outreach-drafts");

const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const defaultDraftPath = path.join(__dirname, "../reports/cloudprune-growth-post-draft.txt");
const userDataDir = path.join(os.homedir(), ".cloudprune-growth-chrome");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function usage() {
  const ids = targets.map((target) => `  - ${target.id}: ${target.name}`).join("\n");
  return [
    "Usage:",
    "  npm run growth:post -- --target linkedin",
    "  npm run growth:post -- --target dev",
    "  npm run growth:post -- --target reddit-aws --url https://www.reddit.com/r/aws/comments/...",
    "",
    "Targets:",
    ids,
    "",
    "This opens the composer/thread and copies the draft to the clipboard. It never presses Submit/Post.",
  ].join("\n");
}

function copyToClipboard(text) {
  if (process.platform === "darwin") {
    const result = spawnSync("pbcopy", { input: text, encoding: "utf8" });
    if (result.status === 0) return true;
  }
  if (process.platform === "win32") {
    const result = spawnSync("clip", { input: text, encoding: "utf8" });
    if (result.status === 0) return true;
  }
  const result = spawnSync("xclip", ["-selection", "clipboard"], { input: text, encoding: "utf8" });
  return result.status === 0;
}

function selectTarget(id) {
  const target = targets.find((item) => item.id === id);
  if (!target) {
    throw new Error(`Unknown target "${id}".\n\n${usage()}`);
  }
  return target;
}

async function openComposer(url) {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found at ${chromePath}`);
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    userDataDir,
    defaultViewport: null,
    args: ["--start-maximized"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  return { browser, page };
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    console.log(usage());
    return;
  }

  const targetId = argValue("--target", "linkedin");
  const output = argValue("--output", defaultDraftPath);
  const target = selectTarget(targetId);
  const openUrl = argValue("--url", target.composeUrl || target.url);
  const draft = draftForTarget(target);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${draft}\n`);
  const copied = copyToClipboard(draft);
  const { browser } = await openComposer(openUrl);

  console.log(`Opened ${target.name}: ${openUrl}`);
  console.log(`Draft written to ${output}`);
  console.log(copied ? "Draft copied to clipboard." : "Clipboard copy failed; use the draft file.");
  console.log("Review the page, paste the draft if needed, and click Submit/Post manually.");
  console.log("Keep this process running while the browser is open. Press Ctrl-C here after posting or closing the browser.");

  await new Promise((resolve) => {
    process.on("SIGINT", resolve);
    browser.on("disconnected", resolve);
  });
  await browser.close().catch(() => {});
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
