const assert = require("node:assert/strict");
const fs = require("node:fs");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { awsScanCounts, buildAwsAssessment, cloudpruneOAuthState, cookieValue, costFromCostExplorer, externalIdForAccount, googleRedirectUri, normalizeAwsRoleArn, normalizeAwsScanRegions, publicAwsScan, server, signGoogleRegistration, signSession, staticFilePathForUrlPath, validateGoogleProfile, verifyCloudpruneOAuthState, verifyGoogleRegistration, verifySession } = require("../server");

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

function renderCloudPruneApp(pathname, session = null, interact = null) {
  const { app, fetchCalls, listeners, store } = bootCloudPruneApp(pathname, session);
  if (interact) interact({ app, fetchCalls, listeners, store });
  return app.innerHTML;
}

function jsonResponse(payload, ok = true) {
  return {
    ok,
    json: async () => payload,
  };
}

function bootCloudPruneApp(pathname, session = null, fetchHandler = null) {
  const app = { innerHTML: "" };
  const listeners = {};
  const store = new Map(session ? [["cloudprune.session", session]] : []);
  const fetchCalls = [];
  const script = fs.readFileSync(path.join(__dirname, "../cloudprune/app.js"), "utf8");
  const context = {
    URL,
    URLSearchParams,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (fetchHandler) return fetchHandler(url, options);
      return jsonResponse({
          connection: {
            provider: "aws",
            awsAccountId: "123456789012",
            roleArn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole",
            externalId: "cloudprune-account-1",
            status: "configured",
          },
        });
    },
    document: {
      addEventListener(type, handler) {
        listeners[type] = [...(listeners[type] || []), handler];
      },
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
  return { app, fetchCalls, listeners, store };
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

    const template = await fetch(`${baseUrl}/cloudprune/aws-readonly-role-template.yaml`);
    assert.equal(template.status, 200);
    assert.match(template.headers.get("content-type"), /text\/yaml/);
    const templateBody = await template.text();
    assert.match(templateBody, /CloudPruneReadOnlyRole/);
    assert.match(templateBody, /AccountId:/);
    assert.match(templateBody, /!Ref AWS::AccountId/);

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

test("CloudPrune empty workspace opens AWS assume-role setup", () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const workspace = renderCloudPruneApp("/cloudprune/", session, ({ listeners }) => {
    for (const handler of listeners.click || []) handler({
      target: {
        closest(selector) {
          return selector === "[data-action='connect']" ? {} : null;
        },
      },
    });
  });
  assert.match(workspace, /Assume role setup/);
  assert.match(workspace, /Connect AWS with one field/);
  assert.match(workspace, /<button data-action="connect" disabled>Connect AWS<\/button>/);
  assert.match(workspace, /<button data-action="connect" disabled>Connect cloud<\/button>/);
  assert.match(workspace, /Launch CloudFormation/);
  assert.match(workspace, /name="externalId" type="hidden" value="cloudprune-account-1"/);
  assert.match(workspace, /name="roleArn" type="hidden" value=""/);
  assert.match(workspace, /CloudPrune principal/);
  assert.match(workspace, /External ID/);
  assert.match(workspace, /Read-only cost, inventory, and utilization signals/);
  assert.match(workspace, /AWS account ID/);
  assert.match(workspace, /AccountId/);
  assert.match(workspace, /placeholder="123456789012"/);
  assert.match(workspace, /Role ARN will be derived automatically/);
  assert.match(workspace, /arn:aws:iam::ACCOUNT_ID:role\/CloudPruneReadOnlyRole/);
  assert.match(workspace, /<button data-action="save-role" type="submit" disabled>Save role<\/button>/);
  assert.doesNotMatch(workspace, /name="roleArn"[^>]*required/);
  assert.match(workspace, /cloudprune-account-1/);
});

test("CloudPrune AWS role submit derives role ARN from account ID", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  let calls;
  renderCloudPruneApp("/cloudprune/", session, ({ fetchCalls, listeners }) => {
    calls = fetchCalls;
    const form = {
      dataset: { connectForm: "aws" },
      elements: {
        awsAccountId: { value: "123456789012" },
        roleArn: { value: "" },
        externalId: { value: "cloudprune-account-1" },
      },
      querySelector(selector) {
        if (selector === "[name='awsAccountId']") return this.elements.awsAccountId;
        if (selector === "[name='roleArn']") return this.elements.roleArn;
        if (selector === "[name='externalId']") return this.elements.externalId;
        return null;
      },
    };
    for (const handler of listeners.submit || []) handler({
      preventDefault() {},
      target: {
        closest(selector) {
          return selector === "[data-connect-form='aws']" ? form : null;
        },
      },
    });
  });
  await new Promise((resolve) => setImmediate(resolve));
  const saveCall = calls.find((call) => String(call.url).endsWith("/api/cloud-connections/aws"));
  assert.ok(saveCall);
  assert.equal(JSON.parse(saveCall.options.body).roleArn, "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole");
});

test("CloudPrune AWS role submit refreshes derived ARN when account ID changes", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  let calls;
  renderCloudPruneApp("/cloudprune/", session, ({ fetchCalls, listeners }) => {
    calls = fetchCalls;
    const form = {
      dataset: { connectForm: "aws" },
      elements: {
        awsAccountId: { value: "210987654321" },
        roleArn: { value: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole" },
        externalId: { value: "cloudprune-account-1" },
      },
      querySelector(selector) {
        if (selector === "[name='awsAccountId']") return this.elements.awsAccountId;
        if (selector === "[name='roleArn']") return this.elements.roleArn;
        if (selector === "[name='externalId']") return this.elements.externalId;
        return null;
      },
    };
    for (const handler of listeners.submit || []) handler({
      preventDefault() {},
      target: {
        closest(selector) {
          return selector === "[data-connect-form='aws']" ? form : null;
        },
      },
    });
  });
  await new Promise((resolve) => setImmediate(resolve));
  const saveCall = calls.find((call) => String(call.url).endsWith("/api/cloud-connections/aws"));
  assert.ok(saveCall);
  assert.equal(JSON.parse(saveCall.options.body).roleArn, "arn:aws:iam::210987654321:role/CloudPruneReadOnlyRole");
});

test("CloudPrune AWS scan disables the button and shows visible in-progress state", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const { app, fetchCalls, listeners } = bootCloudPruneApp("/cloudprune/", session, (url, options = {}) => {
    if (String(url).endsWith("/api/workspace")) {
      return jsonResponse({
        user: { name: "Ami", email: "ami@example.com", companyName: "Zeptrix" },
        connections: {
          aws: {
            provider: "aws",
            awsAccountId: "123456789012",
            roleArn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole",
            externalId: "cloudprune-account-1",
            status: "configured",
          },
        },
        awsScan: {
          id: "previous-scan",
          status: "completed",
          awsAccountId: "123456789012",
          monthlyCost: 12,
          counts: { ec2Instances: 5 },
          errors: [],
          progress: 100,
          message: "AWS scan complete. Read 5 entities.",
        },
        awsSetup: {},
      });
    }
    if (String(url).endsWith("/api/cloud-connections/aws/scan") && options.method === "POST") {
      return new Promise(() => {});
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(app.innerHTML, />Scan again<\/button>/);

  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='scan-aws']" ? { disabled: false } : null;
      },
    },
  });

  assert.match(app.innerHTML, /<button data-action="scan-aws" disabled>Scanning\.\.\.<\/button>/);
  assert.match(app.innerHTML, /role="progressbar"/);
  assert.match(app.innerHTML, /style="--scan-progress:5%"/);
  assert.match(app.innerHTML, /<strong>0%<\/strong>/);
  assert.doesNotMatch(app.innerHTML, />Scan again<\/button>/);
  const scanCall = fetchCalls.find((call) => String(call.url).endsWith("/api/cloud-connections/aws/scan"));
  assert.ok(scanCall);
  assert.deepEqual(JSON.parse(scanCall.options.body), { regions: ["us-east-1"] });
  assert.equal(scanCall.options.headers["content-type"], "application/json");
});

test("CloudPrune recommendations route renders saved scan recommendations", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const { app } = bootCloudPruneApp("/cloudprune/recommendations", session, (url) => {
    if (String(url).endsWith("/api/workspace")) {
      return jsonResponse({
        user: { name: "Ami", email: "ami@example.com", companyName: "Zeptrix" },
        connections: {
          aws: {
            provider: "aws",
            awsAccountId: "123456789012",
            roleArn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole",
            externalId: "cloudprune-account-1",
            status: "configured",
          },
        },
        awsScan: {
          id: "scan-1",
          status: "completed",
          awsAccountId: "123456789012",
          monthlyCost: 125,
          counts: { ec2Instances: 2, ebsVolumes: 1 },
          errors: [],
          progress: 100,
          message: "AWS scan complete. Read 3 entities.",
          recommendations: [{
            cloud: "aws",
            title: "Review 1 unattached EBS volume",
            detail: "Deleting a detached volume has no compute downtime.",
            impact: 8,
            effort: "Low",
            risk: "Low",
            owner: "Idle resource cleanup",
            status: "Review",
            minimizeImpact: "Snapshot first and delete in small batches.",
            rollbackPath: "Create a new EBS volume from the retained snapshot.",
          }],
        },
        awsSetup: {},
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(app.innerHTML, /Prioritized recommendations/);
  assert.match(app.innerHTML, /Review 1 unattached EBS volume/);
  assert.match(app.innerHTML, /Snapshot first and delete in small batches/);
  assert.match(app.innerHTML, /Create a new EBS volume from the retained snapshot/);
  assert.doesNotMatch(app.innerHTML, /Move steady EC2 baseline into Savings Plans/);
});

test("CloudPrune exchanges Google auth code without accepting session tokens in URLs", async () => {
  const session = signSession({
    id: "user-1",
    email: "ami@example.com",
    name: "Ami",
    account_id: "account-1",
    company_name: "Zeptrix",
  });
  const { app, store, fetchCalls } = bootCloudPruneApp("/cloudprune/?authCode=one-time-code", null, (url, options = {}) => {
    if (String(url).endsWith("/api/auth/google/exchange")) {
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).code, "one-time-code");
      return jsonResponse({ token: session, user: { email: "ami@example.com", companyName: "Zeptrix" } });
    }
    if (String(url).endsWith("/api/profile")) return jsonResponse({ token: session });
    return jsonResponse({});
  });
  assert.match(app.innerHTML, /Completing Google sign-in/);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(store.get("cloudprune.session"), session);
  assert.ok(fetchCalls.some((call) => String(call.url).endsWith("/api/auth/google/exchange")));

  const tokenUrl = bootCloudPruneApp(`/cloudprune/?token=${encodeURIComponent(session)}`);
  assert.equal(tokenUrl.store.get("cloudprune.session"), undefined);
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

test("Google SSO callback state must match browser cookie", () => {
  const state = cloudpruneOAuthState("/cloudprune");
  assert.equal(cookieValue({ headers: { cookie: `other=1; cloudprune_oauth_state=${encodeURIComponent(state)}` } }, "cloudprune_oauth_state"), state);
  assert.notEqual(cookieValue({ headers: { cookie: `cloudprune_oauth_state=${encodeURIComponent(cloudpruneOAuthState("/cloudprune"))}` } }, "cloudprune_oauth_state"), state);
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

test("Google SSO requires verified Google email", () => {
  assert.equal(validateGoogleProfile({
    aud: "",
    email: "ami@example.com",
    email_verified: true,
  }).email, "ami@example.com");
  assert.throws(() => validateGoogleProfile({
    aud: "",
    email: "ami@example.com",
    email_verified: false,
  }), /email must be verified/i);
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

test("AWS assume-role onboarding validates role ARNs and derives external IDs", () => {
  assert.deepEqual(normalizeAwsRoleArn("arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole"), {
    roleArn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole",
    awsAccountId: "123456789012",
  });
  assert.equal(externalIdForAccount("tenant-123"), "cloudprune-tenant-123");
  assert.throws(() => normalizeAwsRoleArn("arn:aws:s3:::bucket"), /valid AWS IAM role ARN/);
  assert.throws(() => normalizeAwsRoleArn("arn:aws:iam::123:role/Bad"), /valid AWS IAM role ARN/);
});

test("AWS scan summary counts entities and monthly cost", () => {
  assert.deepEqual(awsScanCounts({
    ec2Instances: [2, 1],
    lambdas: [2, 1],
    rdsInstances: [1],
    s3Buckets: 4,
    ebsVolumes: [2, 1],
    loadBalancers: [1],
  }), {
    ec2Instances: 3,
    lambdas: 3,
    rdsInstances: 1,
    s3Buckets: 4,
    ebsVolumes: 3,
    loadBalancers: 1,
  });
  assert.deepEqual(costFromCostExplorer({
    ResultsByTime: [{ Total: { UnblendedCost: { Amount: "123.45", Unit: "USD" } } }],
  }), { amount: 123.45, currency: "USD" });
});

test("AWS scan region selection normalizes and validates regions", () => {
  assert.deepEqual(normalizeAwsScanRegions(["us-east-1", "us-east-1", "il-central-1"]), ["us-east-1", "il-central-1"]);
  assert.deepEqual(normalizeAwsScanRegions([]), ["us-east-1"]);
  assert.throws(() => normalizeAwsScanRegions(["us-east-1; rm -rf /"]), /valid AWS regions/);
});

test("AWS scan API payload includes persisted progress and completion message", () => {
  assert.deepEqual(publicAwsScan({
    id: "scan-1",
    status: "running",
    provider_account_id: "123456789012",
    monthly_cost: "0",
    currency: "USD",
    counts: {},
    errors: [],
    scan_json: { progress: 42, message: "Reading EC2 instances in us-east-1.", regions: ["us-east-1"] },
    created_at: "created",
    updated_at: "updated",
  }), {
    id: "scan-1",
    status: "running",
    awsAccountId: "123456789012",
    monthlyCost: 0,
    currency: "USD",
    counts: {},
    errors: [],
    recommendations: [],
    regions: ["us-east-1"],
    progress: 42,
    message: "Reading EC2 instances in us-east-1.",
    scannedAt: "created",
    updatedAt: "updated",
  });

  const completed = publicAwsScan({
    id: "scan-2",
    status: "completed",
    provider_account_id: "123456789012",
    monthly_cost: 12,
    scan_json: {
      progress: 100,
      message: "AWS scan complete. Read 5 entities.",
      recommendations: [{ title: "Release idle Elastic IPs" }],
    },
  });
  assert.equal(completed.message, "AWS scan complete. Read 5 entities.");
  assert.deepEqual(completed.recommendations, [{ title: "Release idle Elastic IPs" }]);
});

test("AWS assessment marks regional services failed when every region fails", () => {
  const assessment = buildAwsAssessment({}, ["us-east-1", "us-west-2"], [
    { check: "ec2Instances:us-east-1", message: "AccessDenied" },
    { check: "ec2Instances:us-west-2", message: "AccessDenied" },
    { check: "ebsVolumes:us-east-1", message: "AccessDenied" },
  ]);

  assert.equal(assessment.checks.ec2Instances.ok, false);
  assert.match(assessment.checks.ec2Instances.error, /us-east-1/);
  assert.equal(assessment.checks.ebsVolumes.ok, false);
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
