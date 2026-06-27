const assert = require("node:assert/strict");
const fs = require("node:fs");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { cloudpruneOAuthState, googleRedirectUri, server, signGoogleRegistration, signSession, staticFilePathForUrlPath, verifyCloudpruneOAuthState, verifyGoogleRegistration, verifySession } = require("../server");

async function withServer(callback) {
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function sessionToken(payload) {
  return `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
}

function renderCloudPruneApp(pathname, session = null) {
  const app = { innerHTML: "" };
  const store = new Map(session ? [["cloudprune.session", session]] : []);
  const script = fs.readFileSync(path.join(__dirname, "../cloudprune/app.js"), "utf8");
  const context = {
    URL,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    document: {
      addEventListener() {},
      querySelector(selector) {
        return selector === "#app" ? app : null;
      },
    },
    history: {
      replaceState() {},
    },
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    location: {
      href: `https://zeptrix.io${pathname}`,
      pathname,
    },
  };
  vm.runInNewContext(script, context, { filename: "cloudprune/app.js" });
  return app.innerHTML;
}

test("maps CloudPrune app routes to the public index", () => {
  assert.match(staticFilePathForUrlPath("/cloudprune/"), /cloudprune[/\\]index\.html$/);
  assert.match(staticFilePathForUrlPath("/cloudprune/demo"), /cloudprune[/\\]index\.html$/);
  assert.match(staticFilePathForUrlPath("/cloudprune/demo/recommendations"), /cloudprune[/\\]index\.html$/);
  assert.match(staticFilePathForUrlPath("/cloudprune/demo/settings"), /cloudprune[/\\]index\.html$/);
  assert.match(staticFilePathForUrlPath("/cp/"), /cloudprune[/\\]index\.html$/);
  assert.match(staticFilePathForUrlPath("/cp/demo"), /cloudprune[/\\]index\.html$/);
  assert.match(staticFilePathForUrlPath("/cp/demo/recommendations"), /cloudprune[/\\]index\.html$/);
});

test("serves app shell, assets, redirect, and SPA fallback", async () => {
  await withServer(async (baseUrl) => {
    const root = await fetch(`${baseUrl}/cloudprune/`);
    assert.equal(root.status, 200);
    assert.match(root.headers.get("content-type"), /text\/html/);
    assert.match(await root.text(), /CloudPrune \| Cloud Cost Workspace/);

    const redirect = await fetch(`${baseUrl}/cloudprune`, { redirect: "manual" });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "/cloudprune/");

    const shortRedirect = await fetch(`${baseUrl}/cp`, { redirect: "manual" });
    assert.equal(shortRedirect.status, 301);
    assert.equal(shortRedirect.headers.get("location"), "/cp/");

    const script = await fetch(`${baseUrl}/cloudprune/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /application\/javascript/);

    const shortScript = await fetch(`${baseUrl}/cp/app.js`);
    assert.equal(shortScript.status, 200);
    assert.match(shortScript.headers.get("content-type"), /application\/javascript/);

    const fallback = await fetch(`${baseUrl}/cloudprune/recommendations`);
    assert.equal(fallback.status, 200);
    assert.match(await fallback.text(), /<div id="app"><\/div>/);

    const demo = await fetch(`${baseUrl}/cloudprune/demo`);
    assert.equal(demo.status, 200);
    assert.match(await demo.text(), /<div id="app"><\/div>/);

    const shortDemo = await fetch(`${baseUrl}/cp/demo`);
    assert.equal(shortDemo.status, 200);
    assert.match(await shortDemo.text(), /<div id="app"><\/div>/);
  });
});

test("authenticated CloudPrune workspace starts empty while demo data remains intact", () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const workspace = renderCloudPruneApp("/cloudprune/", session);
  assert.match(workspace, /No cloud data yet/);
  assert.match(workspace, /Connect AWS to start your first cost assessment/);
  assert.match(workspace, /<strong>\$0<\/strong>/);
  assert.doesNotMatch(workspace, /EC2 Compute/);
  assert.doesNotMatch(workspace, /Prioritized recommendations/);
  assert.doesNotMatch(workspace, /BigQuery query scans/);

  const demo = renderCloudPruneApp("/cloudprune/demo");
  assert.match(demo, /\$402,150/);
  assert.match(demo, /Prioritized recommendations/);
  assert.match(demo, /Move steady EC2 baseline into Savings Plans/);
  assert.match(demo, /BigQuery query scans/);
  assert.doesNotMatch(demo, /No cloud data yet/);
});

test("auth API reports missing database instead of dropping requests", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cloudprune/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ami", company: "Zeptrix", email: "ami@example.com", password: "long-enough-password" }),
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /database is not configured/i);

    const shortResponse = await fetch(`${baseUrl}/cp/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ami", company: "Zeptrix", email: "ami@example.com", password: "long-enough-password" }),
    });
    assert.equal(shortResponse.status, 400);
    assert.match(await shortResponse.text(), /database is not configured/i);
  });
});

test("Google SSO uses the canonical shared callback", () => {
  assert.equal(googleRedirectUri, "https://www.zeptrix.io/api/auth/google/callback");
});

test("Google SSO state is signed and self-contained", () => {
  const state = cloudpruneOAuthState("/cp");
  assert.match(state, /^cloudprune\.[^.]+\.[^.]+$/);
  assert.equal(verifyCloudpruneOAuthState(state).prefix, "/cp");
  assert.equal(verifyCloudpruneOAuthState(`${state.slice(0, -1)}x`), null);
});

test("Google SSO creates a signed pending registration for new users", () => {
  const token = signGoogleRegistration({ sub: "google-123", email: "ami@example.com", name: "Ami", hd: "Zeptrix" });
  const payload = verifyGoogleRegistration(token);
  assert.equal(payload.sub, "google-123");
  assert.equal(payload.email, "ami@example.com");
  assert.equal(payload.name, "Ami");
  assert.equal(payload.companyName, "Zeptrix");
  assert.equal(verifyGoogleRegistration(`${token.slice(0, -1)}x`), null);
});

test("CloudPrune sessions carry the account company name", () => {
  const token = signSession({
    id: "user-1",
    email: "amihaih@gmail.com",
    name: "Amihai Hadar",
    account_id: "account-1",
    company_name: "Zeptrix",
  });
  const payload = verifySession(token);
  assert.equal(payload.email, "amihaih@gmail.com");
  assert.equal(payload.companyName, "Zeptrix");
  assert.equal(verifySession(`${token.slice(0, -1)}x`), null);
});

test("rejects encoded traversal outside the public app directory", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cloudprune/%2e%2e/server.js`);
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), /createServer/);

    const shortResponse = await fetch(`${baseUrl}/cp/%2e%2e/server.js`);
    assert.equal(shortResponse.status, 403);
    assert.doesNotMatch(await shortResponse.text(), /createServer/);
  });
});

test("returns 400 for malformed percent encoding", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/%E0%A4%A`);
    assert.equal(response.status, 400);
    assert.equal(await response.text(), "Bad request");
  });
});
