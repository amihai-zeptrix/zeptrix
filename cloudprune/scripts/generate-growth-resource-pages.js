#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const dataPath = path.join(__dirname, "growth-resource-items.json");
const followupPath = path.join(projectRoot, "reports", "cloudprune-growth-followup.md");
const shortlistPath = path.join(projectRoot, "reports", "cloudprune-growth-shortlist.md");
const outputRoot = path.join(projectRoot, "cloudprune", "resources");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function markdownLinkToHtml(value) {
  const match = String(value || "").match(/^\[(.*?)\]\((.*?)\)(?: \((.*?)\))?/);
  if (!match) return escapeHtml(value);
  const [, label, url, type] = match;
  const suffix = type ? ` <span>${escapeHtml(type)}</span>` : "";
  return `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(label)}</a>${suffix}`;
}

function field(body, names) {
  for (const name of names) {
    const match = body.match(new RegExp(`^- ${name}: (.*)$`, "m"));
    if (match) return match[1].trim();
  }
  return "";
}

function parseItems(markdown) {
  return markdown.split(/\n###\s+/).slice(1).map((section) => {
    const [headingLine, ...rest] = section.split("\n");
    const title = headingLine.replace(/^\d+\.\s*/, "").trim();
    const body = rest.join("\n");
    const actionPath = body.match(/- Create (\/cloudprune\/resources\/[a-z0-9-]+)/);
    return {
      title,
      slug: actionPath ? actionPath[1].split("/").pop() : slugify(title),
      score: field(body, ["Priority score"]),
      query: field(body, ["Query", "Target query"]).replace(/^`|`$/g, ""),
      source: field(body, ["Source"]),
      sourceStatus: field(body, ["Source status"]),
      sourceTitle: field(body, ["Source title"]),
      sourceDescription: field(body, ["Source description"]),
      pain: field(body, ["Pain"]),
      angle: field(body, ["CloudPrune angle"]),
      cta: field(body, ["CTA"]),
    };
  }).filter((item) => item.title && item.slug);
}

function loadItems() {
  if (fs.existsSync(followupPath) || fs.existsSync(shortlistPath)) {
    const markdownPath = fs.existsSync(followupPath) ? followupPath : shortlistPath;
    const reportItems = parseItems(fs.readFileSync(markdownPath, "utf8"));
    if (reportItems.length) return reportItems;
  }
  if (!fs.existsSync(dataPath)) throw new Error(`Missing tracked resource data file: ${dataPath}`);
  const dataItems = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  if (!Array.isArray(dataItems) || !dataItems.length) throw new Error(`No resource items found in ${dataPath}`);
  return dataItems.map((item) => ({ ...item, slug: item.slug || slugify(item.title) })).filter((item) => item.title && item.slug);
}

function pageHtml(item, allItems) {
  const title = `${item.title} | CloudPrune Resources`;
  const description = item.pain || item.angle || "CloudPrune cloud cost optimization resource.";
  const related = allItems.filter((candidate) => candidate.slug !== item.slug).slice(0, 3);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/cloudprune/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/cloudprune/resources/styles.css" />
  </head>
  <body>
    <header class="resource-hero">
      <nav><a href="/cloudprune/">CloudPrune</a><a href="/cloudprune/resources/">Resources</a></nav>
      <p class="eyebrow">AWS cost playbook</p>
      <h1>${escapeHtml(item.title)}</h1>
      <p>${escapeHtml(item.pain)}</p>
      <a class="button" href="/cloudprune/">Start a read-only CloudPrune scan</a>
    </header>
    <main>
      <section class="panel">
        <h2>The cost signal</h2>
        <p>${escapeHtml(item.pain)} ${escapeHtml(item.angle)}</p>
        <dl class="facts">
          <div><dt>Search intent</dt><dd>${escapeHtml(item.query)}</dd></div>
          <div><dt>Priority score</dt><dd>${escapeHtml(item.score || "n/a")}</dd></div>
          <div><dt>Reference</dt><dd>${markdownLinkToHtml(item.source)}${item.sourceStatus ? ` <small>${escapeHtml(item.sourceStatus)}</small>` : ""}</dd></div>
        </dl>
      </section>
      <section class="grid">
        <article>
          <h2>How to verify manually</h2>
          <ol>
            <li>Open AWS Billing and Cost Explorer to confirm the service driving the spend.</li>
            <li>Use the AWS console view for the affected service to identify candidate resources.</li>
            <li>Run a read-only AWS CLI inventory command and export the resource IDs before changing anything.</li>
            <li>Compare age, attachment, traffic, retention, and recent usage signals before deciding on cleanup.</li>
          </ol>
        </article>
        <article>
          <h2>Impact and rollback</h2>
          <ol>
            <li>Classify whether the action can affect production traffic, data retention, compliance, or incident response.</li>
            <li>Prefer dry-run review first. For storage deletion, create or verify a snapshot/export when rollback matters.</li>
            <li>Schedule changes with an owner and a validation window. Stop if the blast radius is unclear.</li>
            <li>Keep the previous configuration or snapshot reference until post-change metrics are stable.</li>
          </ol>
        </article>
      </section>
      <section class="panel accent">
        <h2>How CloudPrune helps</h2>
        <p>CloudPrune starts read-only, scans AWS evidence, stores the recommendation, and shows savings context with risk, downtime, impact analysis, and safer execution steps.</p>
        <p>${escapeHtml(item.cta || "Use CloudPrune to turn the finding into an actionable savings workflow.")}</p>
      </section>
      <section class="panel">
        <h2>Related CloudPrune resources</h2>
        <div class="related">
          ${related.map((candidate) => `<a href="/cloudprune/resources/${escapeHtml(candidate.slug)}">${escapeHtml(candidate.title)}</a>`).join("")}
        </div>
      </section>
    </main>
  </body>
</html>
`;
}

function indexHtml(items) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="CloudPrune AWS cost optimization resources for high-intent cost pain searches." />
    <title>CloudPrune AWS Cost Resources</title>
    <link rel="icon" href="/cloudprune/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/cloudprune/resources/styles.css" />
  </head>
  <body>
    <header class="resource-hero">
      <nav><a href="/cloudprune/">CloudPrune</a></nav>
      <p class="eyebrow">CloudPrune resources</p>
      <h1>AWS cost reduction playbooks for real bill pain.</h1>
      <p>Short, practical guides that turn AWS cost questions into read-only checks, impact analysis, and safe next steps.</p>
      <a class="button" href="/cloudprune/">Start a read-only CloudPrune scan</a>
    </header>
    <main>
      <section class="resource-list">
        ${items.map((item) => `<article><span>${escapeHtml(item.score || "n/a")}</span><h2><a href="/cloudprune/resources/${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.pain)}</p></article>`).join("")}
      </section>
    </main>
  </body>
</html>
`;
}

const css = `:root{--ink:#17211f;--muted:#61716c;--line:#dae5df;--forest:#12332d;--green:#31b86f;--sky:#2598d1;--paper:#fff;--canvas:#f2f7f5}*{box-sizing:border-box}body{margin:0;background:linear-gradient(120deg,#e7f7ef,#eef7fb 42%,#f7fbf9);color:var(--ink);font:16px/1.62 Inter,system-ui,sans-serif}a{color:#176fb1;font-weight:800;text-decoration:none}a:hover{text-decoration:underline}.resource-hero{padding:28px max(24px,calc((100vw - 1040px)/2)) 56px;background:radial-gradient(circle at 12% 15%,rgba(49,184,111,.22),transparent 240px),linear-gradient(135deg,#12332d,#174d43 58%,#17658a);color:#f5fff9}.resource-hero nav{display:flex;gap:18px;margin-bottom:58px}.resource-hero nav a{color:#d9fff0}.eyebrow{margin:0 0 12px;color:#92edbd;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.resource-hero h1{max-width:880px;margin:0;font-size:clamp(34px,5vw,64px);line-height:1.02;letter-spacing:0}.resource-hero p:not(.eyebrow){max-width:760px;margin:20px 0 0;color:#dbeee8;font-size:20px}.button{display:inline-flex;margin-top:28px;padding:14px 18px;border-radius:8px;background:#f5fff9;color:#12332d;box-shadow:0 18px 40px rgba(0,0,0,.18)}main{max-width:1040px;margin:-28px auto 72px;padding:0 24px}.panel,.grid article,.resource-list article{border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.92);box-shadow:0 16px 42px rgba(18,51,45,.1)}.panel{padding:28px;margin-bottom:20px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-bottom:20px}.grid article{padding:28px}h2{margin:0 0 12px;font-size:24px;line-height:1.2}p{margin:0 0 14px;color:var(--muted)}ol{margin:0;padding-left:22px;color:var(--muted)}li+li{margin-top:10px}.facts{display:grid;gap:12px;margin:24px 0 0}.facts div{display:grid;grid-template-columns:150px 1fr;gap:18px;border-top:1px solid var(--line);padding-top:12px}.facts dt{font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#45615a}.facts dd{margin:0;color:var(--ink);font-weight:700}.facts small{display:block;color:var(--muted);font-weight:700}.accent{background:linear-gradient(135deg,#e7f8ee,#e9f6ff)}.related{display:grid;gap:10px}.resource-list{display:grid;gap:14px}.resource-list article{padding:22px}.resource-list span{display:inline-flex;margin-bottom:10px;border-radius:999px;background:#e7f8ee;color:#17633c;padding:3px 10px;font-size:12px;font-weight:900}.resource-list h2{font-size:20px}.resource-list p{margin-bottom:0}@media (max-width:760px){.grid{grid-template-columns:1fr}.facts div{grid-template-columns:1fr;gap:4px}.resource-hero{padding-bottom:44px}.resource-hero nav{margin-bottom:38px}}`;

const items = loadItems();

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, "styles.css"), css);
fs.writeFileSync(path.join(outputRoot, "index.html"), indexHtml(items));
for (const item of items) {
  const directory = path.join(outputRoot, item.slug);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), pageHtml(item, items));
}
console.log(`Generated ${items.length} CloudPrune resource pages in ${outputRoot}`);
