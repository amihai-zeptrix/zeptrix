const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { server, staticFilePathForUrlPath } = require("../server");

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
