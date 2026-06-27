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
  assert.match(staticFilePathForUrlPath("/cloudprune/recommendations"), /cloudprune[/\\]index\.html$/);
  assert.match(staticFilePathForUrlPath("/cloudprune/settings"), /cloudprune[/\\]index\.html$/);
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

    const script = await fetch(`${baseUrl}/cloudprune/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /application\/javascript/);

    const fallback = await fetch(`${baseUrl}/cloudprune/recommendations`);
    assert.equal(fallback.status, 200);
    assert.match(await fallback.text(), /<div id="app"><\/div>/);
  });
});

test("rejects encoded traversal outside the public app directory", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cloudprune/%2e%2e/server.js`);
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), /createServer/);
  });
});

test("returns 400 for malformed percent encoding", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/%E0%A4%A`);
    assert.equal(response.status, 400);
    assert.equal(await response.text(), "Bad request");
  });
});
