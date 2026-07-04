#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultInput = path.join(__dirname, "../reports/cloudprune-growth-shortlist.md");
const defaultOutput = path.join(__dirname, "../reports/cloudprune-growth-followup.md");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function parseShortlist(markdown) {
  const sections = markdown.split(/\n###\s+/).slice(1);
  return sections.map((section) => {
    const [headingLine, ...rest] = section.split("\n");
    const title = headingLine.replace(/^\d+\.\s*/, "").trim();
    const body = rest.join("\n");
    const source = body.match(/- Source: \[(.*?)\]\((.*?)\) \((.*?)\)/);
    const query = body.match(/- Target query: `([^`]+)`/);
    const pain = body.match(/- Pain: (.*)/);
    const angle = body.match(/- CloudPrune angle: (.*)/);
    const cta = body.match(/- CTA: (.*)/);
    const score = body.match(/- Priority score: (\d+)/);
    return {
      title,
      score: score ? Number(score[1]) : 0,
      query: query?.[1] || "",
      sourceTitle: source?.[1] || "",
      sourceUrl: source?.[2] || "",
      sourceType: source?.[3] || "",
      pain: pain?.[1] || "",
      angle: angle?.[1] || "",
      cta: cta?.[1] || "",
    };
  }).filter((item) => item.sourceUrl);
}

async function inspectPage(browser, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.setUserAgent("Mozilla/5.0 CloudPruneGrowthFollowup/1.0");
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await delay(1200);
    const data = await page.evaluate(() => ({
      title: globalThis.document.title || "",
      description: globalThis.document.querySelector("meta[name='description']")?.getAttribute("content") || "",
      h1: globalThis.document.querySelector("h1")?.textContent || "",
      textSample: globalThis.document.body?.textContent?.replace(/\s+/g, " ").slice(0, 600) || "",
    }));
    return {
      ok: Boolean(response?.ok()),
      status: response?.status() || 0,
      finalUrl: page.url(),
      ...data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      title: "",
      description: "",
      h1: "",
      textSample: "",
      error: error.message,
    };
  } finally {
    await page.close();
  }
}

function contentActions(item, pageData) {
  const slug = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return [
    `Create /cloudprune/resources/${slug} targeting "${item.query}".`,
    "Open with the exact pain and avoid generic FinOps copy.",
    "Include AWS Console and AWS CLI discovery steps.",
    "Add impact analysis: what can break, expected downtime, rollback, and what needs human review.",
    "Add a CloudPrune section showing how read-only scan evidence maps to the recommendation.",
    `CTA: ${item.cta}`,
    pageData.ok ? "Source page loaded successfully; use it as a reference target." : "Source page did not load cleanly; verify manually before citing or linking.",
  ];
}

function markdownReport(items, inspected, registerPage) {
  const lines = [
    "# CloudPrune Growth Follow-Up",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Register Page Check",
    "",
    `- URL: https://zeptrix.io/cloudprune/`,
    `- Status: ${registerPage.status || "n/a"}`,
    `- Title: ${registerPage.title || "-"}`,
    `- H1: ${registerPage.h1 || "-"}`,
    "",
    "## Follow-Up Queue",
    "",
  ];

  items.forEach((item, index) => {
    const pageData = inspected[index];
    lines.push(`### ${index + 1}. ${item.title}`);
    lines.push("");
    lines.push(`- Priority score: ${item.score}`);
    lines.push(`- Query: \`${item.query}\``);
    lines.push(`- Source: [${item.sourceTitle}](${item.sourceUrl}) (${item.sourceType})`);
    lines.push(`- Source status: ${pageData.status || "n/a"}${pageData.ok ? " OK" : " needs review"}`);
    lines.push(`- Source title: ${pageData.title || "-"}`);
    if (pageData.description) lines.push(`- Source description: ${pageData.description}`);
    if (pageData.error) lines.push(`- Source error: ${pageData.error}`);
    lines.push(`- Pain: ${item.pain}`);
    lines.push(`- CloudPrune angle: ${item.angle}`);
    lines.push("");
    lines.push("Actions:");
    contentActions(item, pageData).forEach((action) => lines.push(`- ${action}`));
    lines.push("");
    lines.push("Draft opening:");
    lines.push("");
    lines.push(`> ${item.pain} ${item.angle} This guide shows how to verify the issue manually, understand impact before acting, and use CloudPrune to turn the finding into a safe savings workflow.`);
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

async function main() {
  const input = argValue("--input", defaultInput);
  const output = argValue("--output", defaultOutput);
  const markdown = fs.readFileSync(input, "utf8");
  const items = parseShortlist(markdown);
  if (!items.length) throw new Error(`No shortlist items found in ${input}`);
  if (!fs.existsSync(chromePath)) throw new Error(`Google Chrome was not found at ${chromePath}`);

  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const registerPage = await inspectPage(browser, "https://zeptrix.io/cloudprune/");
    const inspected = [];
    for (const item of items) {
      inspected.push(await inspectPage(browser, item.sourceUrl));
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, markdownReport(items, inspected, registerPage));
    console.log(`Wrote Puppeteer follow-up report for ${items.length} opportunities to ${output}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
