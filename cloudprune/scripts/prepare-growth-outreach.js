#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const {
  targets,
  resourceUrls,
  registerUrl,
  redditReplyDraft,
  devArticleDraft,
  hnDraft,
  linkedinDraft,
} = require("./growth-outreach-drafts");

const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const defaultOutput = path.join(__dirname, "../reports/cloudprune-growth-outreach.md");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function inspectPage(browser, target) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 900, deviceScaleFactor: 1 });
  await page.setUserAgent("Mozilla/5.0 CloudPruneOutreachResearch/1.0");
  try {
    const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await delay(800);
    const data = await page.evaluate(() => ({
      title: globalThis.document.title || "",
      h1: globalThis.document.querySelector("h1")?.textContent?.trim() || "",
      description: globalThis.document.querySelector("meta[name='description']")?.getAttribute("content") || "",
      textSample: globalThis.document.body?.textContent?.replace(/\s+/g, " ").trim().slice(0, 500) || "",
    }));
    return {
      ...target,
      status: response?.status() || 0,
      ok: Boolean(response?.ok()),
      finalUrl: page.url(),
      ...data,
    };
  } catch (error) {
    return {
      ...target,
      status: 0,
      ok: false,
      finalUrl: target.url,
      title: "",
      h1: "",
      description: "",
      textSample: "",
      error: error.message,
    };
  } finally {
    await page.close();
  }
}

function markdownReport(results) {
  const lines = [
    "# CloudPrune Outreach Pack",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This pack is for manual, policy-compliant outreach. Do not auto-post promotional comments. Prefer current threads where someone asks for help, disclose the CloudPrune affiliation, and make the answer useful even if the reader never clicks.",
    "",
    "## Target Shortlist",
    "",
  ];

  results.forEach((target, index) => {
    lines.push(`### ${index + 1}. ${target.name}`);
    lines.push("");
    lines.push(`- URL: ${target.url}`);
    lines.push(`- Fit: ${target.fit}`);
    lines.push(`- Page status: ${target.status || "n/a"}${target.ok ? " OK" : " needs manual review"}`);
    lines.push(`- Page title: ${target.title || "-"}`);
    lines.push(`- Posting rule: ${target.rule}`);
    lines.push(`- Angle: ${target.angle}`);
    lines.push(`- CTA: ${target.cta}`);
    if (target.error) lines.push(`- Puppeteer error: ${target.error}`);
    lines.push("");
  });

  lines.push("## Ready-To-Use Drafts");
  lines.push("");
  lines.push("### Reddit/help-thread reply");
  lines.push("");
  lines.push("```text");
  lines.push(redditReplyDraft(resourceUrls.billShock));
  lines.push("```");
  lines.push("");
  lines.push("### DEV article/social post");
  lines.push("");
  lines.push("```text");
  lines.push(devArticleDraft());
  lines.push("```");
  lines.push("");
  lines.push("### Hacker News Show HN");
  lines.push("");
  lines.push("```text");
  lines.push(hnDraft());
  lines.push("```");
  lines.push("");
  lines.push("### LinkedIn founder/operator post");
  lines.push("");
  lines.push("```text");
  lines.push(linkedinDraft());
  lines.push("```");
  lines.push("");
  lines.push("## Best Next Actions");
  lines.push("");
  lines.push("1. Post one original DEV article based on the bill-shock or CloudWatch resource page.");
  lines.push("2. Watch r/aws, r/devops, and r/FinOps for current posts asking about bill shock, CloudWatch cost, NAT Gateway cost, or unused EBS. Reply only when the answer is directly useful.");
  lines.push("3. Submit a Show HN only after the onboarding path and demo are stable enough for Hacker News traffic.");
  lines.push("4. Share a LinkedIn post with one screenshot from CloudPrune showing evidence + impact analysis, not just a marketing claim.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const output = argValue("--output", defaultOutput);
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found at ${chromePath}`);
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const results = [];
    for (const target of targets) results.push(await inspectPage(browser, target));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, markdownReport(results));
    console.log(`Wrote CloudPrune outreach pack to ${output}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
