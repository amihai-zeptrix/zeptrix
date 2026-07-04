const assert = require("node:assert/strict");
const fs = require("node:fs");
const { once } = require("node:events");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");
const vm = require("node:vm");
const testAdminPassword = ["cloudprune", "test", "admin", "password"].join("-");
process.env.CLOUDPRUNE_ADMIN_PASSWORD = testAdminPassword;
const { buildReport } = require("../scripts/aws-assessment");
const { awsScanCounts, buildAwsAssessment, costFromCostExplorer, publicRecommendation } = require(path.join(__dirname, "../dist/src/aws-scan-report.js"));
const { capAwsRegionalResult, computeOptimizerEc2Command, computeOptimizerMaxResults, elasticIpsCommand } = require(path.join(__dirname, "../dist/src/aws-scan-runner.js"));
const { maxJsonBodyBytes, readJson } = require(path.join(__dirname, "../dist/src/http-utils.js"));
const { cloudpruneOAuthState, cookieValue, externalIdForAccount, googleRedirectUri, normalizeAwsRoleArn, normalizeAwsScanRegions, publicAwsScan, server, signGoogleRegistration, signSession, staticFilePathForUrlPath, validateGoogleProfile, verifyCloudpruneOAuthState, verifyGoogleRegistration, verifySession } = require(path.join(__dirname, "../dist/server.js"));

async function withHttpServer(testServer, callback) {
  testServer.listen(0);
  await once(testServer, "listening");
  const address = testServer.address();
  if (!address || typeof address === "string") throw new Error("Expected local test server to listen on a TCP port.");
  const { port } = address;
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => testServer.close((error) => (error ? reject(error) : resolve())));
  }
}

async function withServer(callback) {
  await withHttpServer(server, callback);
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
    FormData: class {
      constructor(form) {
        this.form = form;
      }
      entries() {
        return Object.entries(this.form.__entries || {});
      }
    },
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

function recommendationAssessmentFixture() {
  return {
    generatedAt: "2026-06-27T10:00:00.000Z",
    region: "us-east-1",
    days: 30,
    concurrency: 6,
    maxResources: 25,
    checks: {
      identity: {
        service: "STS",
        ok: true,
        required: true,
        data: { Account: "123456789012", Arn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole" },
      },
      costByService: {
        service: "Cost Explorer",
        ok: true,
        data: {
          ResultsByTime: [{
            Groups: [
              { Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "1200", Unit: "USD" } } },
              { Keys: ["Amazon Simple Storage Service"], Metrics: { UnblendedCost: { Amount: "180", Unit: "USD" } } },
            ],
          }],
        },
      },
      savingsPlansRecommendation: {
        service: "Cost Explorer",
        ok: true,
        data: {
          SavingsPlansPurchaseRecommendation: {
            SavingsPlansPurchaseRecommendationDetails: [{ EstimatedMonthlySavingsAmount: "212.40" }],
          },
        },
      },
      ec2Instances: {
        service: "EC2",
        ok: true,
        data: {
          Reservations: [{
            Instances: [
              { InstanceId: "i-app-a", InstanceType: "t3.small", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", VpcId: "vpc-1", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "app-a" }] },
              { InstanceId: "i-app-b", InstanceType: "t3.small", Architecture: "x86_64", PlatformDetails: "Linux/UNIX", VpcId: "vpc-1", State: { Name: "running" }, Tags: [{ Key: "Name", Value: "app-b" }] },
            ],
          }],
        },
      },
      ec2Metrics: {
        service: "CloudWatch EC2 Metrics",
        ok: true,
        data: {
          instances: [
            { id: "i-app-a", averageCpu: 8.2, maximumCpu: 28, memoryStatus: "observed", maximumMemory: 41, diskStatus: "observed", maximumDisk: 52 },
            { id: "i-app-b", averageCpu: 6.4, maximumCpu: 22, memoryStatus: "observed", maximumMemory: 38, diskStatus: "observed", maximumDisk: 47 },
          ],
        },
      },
      ebsVolumes: {
        service: "EBS",
        ok: true,
        data: { Volumes: [{ VolumeId: "vol-1", State: "available", Size: 100, VolumeType: "gp3" }] },
      },
      elasticIps: { service: "EC2", ok: true, data: { Addresses: [] } },
      logGroups: {
        service: "CloudWatch Logs",
        ok: true,
        data: { logGroups: [{ logGroupName: "/aws/lambda/no-retention", storedBytes: 10 * 1024 ** 3 }] },
      },
      s3Lifecycle: {
        service: "S3 Lifecycle",
        ok: true,
        data: {
          buckets: [{
            name: "logs-bucket",
            lifecycleStatus: "missing",
            lifecycleConfigured: false,
            storageStats: {
              objectCount: 123456,
              totalStorageBytes: 200 * 1024 ** 3,
              coldStorageBytes: 80 * 1024 ** 3,
              coldStoragePercent: 40,
            },
          }],
        },
      },
      computeOptimizerEc2: { service: "Compute Optimizer", ok: true, data: { instanceRecommendations: [] } },
      rdsMetrics: { service: "CloudWatch RDS Metrics", ok: true, data: { instances: [] } },
      loadBalancerMetrics: { service: "CloudWatch ELB Metrics", ok: true, data: { loadBalancers: [] } },
      albTargetMappings: {
        service: "ELBv2 Target Mapping",
        ok: true,
        data: {
          targetGroups: [{
            name: "apps",
            targetType: "instance",
            protocol: "HTTP",
            port: 80,
            targets: [{ id: "i-app-a", state: "healthy" }, { id: "i-app-b", state: "healthy" }],
          }],
        },
      },
      apiGatewayV2: { service: "API Gateway HTTP APIs", ok: true, data: { Items: [{ ApiId: "api-1", Name: "public-api", ProtocolType: "HTTP" }] } },
      apiGatewayRest: { service: "API Gateway REST APIs", ok: true, data: { items: [] } },
      ssmApplications: {
        service: "SSM Application Inventory",
        ok: true,
        data: {
          instances: [
            { id: "i-app-a", applications: [{ name: "nodejs" }, { name: "nginx" }] },
            { id: "i-app-b", applications: [{ name: "python3" }] },
          ],
        },
      },
    },
  };
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

test("compiled server serves app shell and copied assets", async () => {
  await withHttpServer(server, async (baseUrl) => {
    const root = await fetch(`${baseUrl}/cloudprune/`);
    assert.equal(root.status, 200);
    assert.match(root.headers.get("content-type"), /text\/html/);
    assert.match(await root.text(), /CloudPrune \| Cloud Cost Workspace/);

    const script = await fetch(`${baseUrl}/cloudprune/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /application\/javascript/);
    assert.match(await script.text(), /CloudPrune/);
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
  assert.match(demo, /Review AWS Savings Plans purchase recommendation/);
  assert.match(demo, /BigQuery query scans/);
  assert.doesNotMatch(demo, /No cloud data yet/);
});

test("CloudPrune demo includes example recommendations for every AWS engine type", () => {
  const demo = renderCloudPruneApp("/cloudprune/demo/recommendations");
  const titles = [
    "Review AWS Savings Plans purchase recommendation",
    "Review 128 unattached EBS volumes",
    "Release 43 unassociated Elastic IP addresses",
    "Add retention and lifecycle policies for storage targets",
    "Assess consolidating 2 low-utilization EC2 instances",
    "Investigate 3 load balancers with no observed traffic",
    "Evaluate 9 EC2 Compute Optimizer recommendations",
    "Assess whether low-utilization EC2 app entrypoints can move to Lambda",
    "Review 4 low-utilization RDS instances",
    "Review 2 NAT gateways for endpoint opportunities",
  ];

  for (const title of titles) assert.match(demo, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(demo, /Partition high-scan BigQuery tables/);
  assert.match(demo, /Consolidate underused AKS node pools/);
  assert.match(demo, /Right-size production namespace requests/);
});

test("CloudPrune demo recommendation status buttons open workflow previews", () => {
  const { app, listeners } = bootCloudPruneApp("/cloudprune/demo/recommendations");
  const click = (action, dataset = {}) => {
    for (const handler of listeners.click || []) handler({
      target: {
        closest(selector) {
          return selector === `[data-action='${action}']` ? { disabled: false, dataset } : null;
        },
      },
    });
  };

  click("stage", { recommendationId: "compute-commitments" });
  assert.match(app.innerHTML, /Open evidence review/);
  assert.match(app.innerHTML, /Open review/);
  assert.match(app.innerHTML, /Commit only to a conservative baseline/);

  click("stage", { recommendationId: "idle-ebs-volumes" });
  assert.match(app.innerHTML, /Stage safe execution/);
  assert.match(app.innerHTML, /Add to queue/);
  assert.doesNotMatch(app.innerHTML, /Open evidence review/);

  click("stage", { recommendationId: "storage-lifecycle" });
  assert.match(app.innerHTML, /Build rollout plan/);
  assert.match(app.innerHTML, /Create plan/);
  assert.doesNotMatch(app.innerHTML, /Stage safe execution/);

  click("close-demo-action");
  assert.doesNotMatch(app.innerHTML, /Build rollout plan/);
});

test("CloudPrune feedback button opens a typed report dialog", () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const { app, listeners } = bootCloudPruneApp("/cloudprune/", session, (url) => {
    if (String(url).endsWith("/api/workspace")) {
      return jsonResponse({
        user: { name: "Ami", email: "ami@example.com", companyName: "Zeptrix" },
        connections: { aws: null },
        awsScan: null,
        awsSetup: {},
      });
    }
    return jsonResponse({});
  });

  assert.match(app.innerHTML, /Send feedback/);
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='open-feedback']" ? { disabled: false } : null;
      },
    },
  });

  assert.match(app.innerHTML, /Product feedback/);
  assert.match(app.innerHTML, /<option>Issue<\/option>/);
  assert.match(app.innerHTML, /<option>Feature request<\/option>/);
  assert.match(app.innerHTML, /<textarea name="details"/);
  assert.match(app.innerHTML, /name="attachment" type="file"/);
});

test("CloudPrune login form sends normal user credentials and stores the returned session", async () => {
  const session = sessionToken({
    sub: "t1-user",
    email: "t1@example.com",
    accountId: "22222222-2222-4222-8222-222222222222",
    companyName: "Tenant One",
    exp: Date.now() + 10000,
  });
  const { fetchCalls, listeners, store } = bootCloudPruneApp("/cloudprune/", null, (url, options = {}) => {
    if (String(url).endsWith("/api/login")) {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { email: "t1@example.com", password: "tenant-password" });
      return jsonResponse({ token: session, user: { email: "t1@example.com", companyName: "Tenant One" } });
    }
    return jsonResponse({});
  });
  const form = { dataset: { authForm: "login" }, __entries: { email: "t1@example.com", password: "tenant-password" } };
  for (const handler of listeners.submit || []) await handler({
    preventDefault() {},
    target: {
      closest(selector) {
        return selector === "[data-auth-form]" ? form : null;
      },
    },
  });

  assert.equal(store.get("cloudprune.session"), session);
  assert.ok(fetchCalls.some((call) => String(call.url).endsWith("/api/login")));
});

test("CloudPrune auth page shows the free-until campaign banner", () => {
  const { app } = bootCloudPruneApp("/cloudprune/");
  assert.match(app.innerHTML, /Enjoy totally free until September 2026/);
});

test("CloudPrune login form accepts admin credentials and stores an admin session", async () => {
  const session = sessionToken({
    sub: "cloudprune-admin",
    email: "admin",
    accountId: "cloudprune-admin",
    companyName: "CloudPrune Admin",
    role: "admin",
    exp: Date.now() + 10000,
  });
  const { fetchCalls, listeners, store } = bootCloudPruneApp("/cloudprune/", null, (url, options = {}) => {
    if (String(url).endsWith("/api/login")) {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { email: "admin", password: testAdminPassword });
      return jsonResponse({ token: session, user: { email: "admin", companyName: "CloudPrune Admin", role: "admin" } });
    }
    return jsonResponse({});
  });
  const form = { dataset: { authForm: "login" }, __entries: { email: "admin", password: testAdminPassword } };
  for (const handler of listeners.submit || []) await handler({
    preventDefault() {},
    target: {
      closest(selector) {
        return selector === "[data-auth-form]" ? form : null;
      },
    },
  });

  assert.equal(store.get("cloudprune.session"), session);
  assert.ok(fetchCalls.some((call) => String(call.url).endsWith("/api/login")));
});

test("CloudPrune login form accepts admin username format", () => {
  const { app, listeners } = bootCloudPruneApp("/cloudprune/");
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-auth-mode]" ? { dataset: { authMode: "login" } } : null;
      },
    },
  });

  assert.match(app.innerHTML, /Email or username/);
  assert.match(app.innerHTML, /name="email" type="text" autocomplete="username"/);
  assert.doesNotMatch(app.innerHTML, /name="email" type="email" autocomplete="email" required/);
});

test("CloudPrune admin route renders tenants and feedback reports", async () => {
  const session = sessionToken({
    sub: "cloudprune-admin",
    email: "admin",
    accountId: "cloudprune-admin",
    companyName: "CloudPrune Admin",
    role: "admin",
    exp: Date.now() + 10000,
  });
  const userId = "11111111-1111-4111-8111-111111111111";
  const { app, listeners, fetchCalls } = bootCloudPruneApp("/cloudprune/admin", session, (url) => {
    if (String(url).endsWith("/api/admin/overview")) {
      return jsonResponse({
        tenants: [{
          id: "22222222-2222-4222-8222-222222222222",
          companyName: "Zeptrix",
          userCount: 2,
          connections: 1,
          createdAt: "2026-07-03T08:00:00.000Z",
        }],
        feedback: [{
          id: "feedback-1",
          type: "Issue",
          details: "The scan progress looked stuck.",
          tenant: "Zeptrix",
          user: "Ami",
          email: "ami@example.com",
          createdAt: "2026-07-03T08:30:00.000Z",
          attachment: { name: "scan.png", type: "image/png", size: 2048 },
        }],
      });
    }
    if (String(url).endsWith("/api/admin/tenants/22222222-2222-4222-8222-222222222222/users")) {
      return jsonResponse({
        tenant: { id: "22222222-2222-4222-8222-222222222222", companyName: "Zeptrix" },
        users: [{
          id: userId,
          name: "Ami",
          email: "ami@example.com",
          provider: "google",
          hasPassword: false,
          createdAt: "2026-07-03T08:10:00.000Z",
        }],
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(app.innerHTML, /CloudPrune admin/);
  assert.match(app.innerHTML, /Zeptrix/);
  assert.match(app.innerHTML, /Show users/);
  assert.doesNotMatch(app.innerHTML, /Reset password/);
  assert.doesNotMatch(app.innerHTML, /data-action="admin-spoof-user"/);

  await listeners.click[0]({
    target: {
      closest(selector) {
        return selector === "[data-action='toggle-admin-tenant-users']"
          ? { dataset: { tenantId: "22222222-2222-4222-8222-222222222222" } }
          : null;
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(app.innerHTML, /ami@example\.com/);
  assert.match(app.innerHTML, /Reset password/);
  assert.match(app.innerHTML, /Spoof/);
  assert.match(app.innerHTML, /The scan progress looked stuck/);
  assert.match(app.innerHTML, /scan\.png/);
  assert.ok(fetchCalls.some((call) => String(call.url).endsWith("/api/admin/tenants/22222222-2222-4222-8222-222222222222/users")));
});

test("CloudPrune admin audit log route renders audit events", async () => {
  const session = sessionToken({
    sub: "cloudprune-admin",
    email: "admin",
    accountId: "cloudprune-admin",
    companyName: "CloudPrune Admin",
    role: "admin",
    exp: Date.now() + 10000,
  });
  const { app, fetchCalls } = bootCloudPruneApp("/cloudprune/admin/audit-log", session, (url) => {
    if (String(url).endsWith("/api/admin/audit-log")) {
      return jsonResponse({
        auditLog: [{
          id: "audit-1",
          actorEmail: "user@example.com",
          actorRole: "user",
          action: "aws_scan_started",
          tenant: "Zeptrix",
          targetType: "aws_scan",
          targetId: "scan-1",
          summary: "AWS scan started for account 123456789012",
          createdAt: "2026-07-04T08:30:00.000Z",
        }],
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(app.innerHTML, /Audit log/);
  assert.match(app.innerHTML, /user@example\.com/);
  assert.match(app.innerHTML, /aws_scan_started/);
  assert.match(app.innerHTML, /AWS scan started for account 123456789012/);
  assert.ok(fetchCalls.some((call) => String(call.url).endsWith("/api/admin/audit-log")));
});

test("CloudPrune admin can reset user password and spoof a tenant user", async () => {
  const adminSession = sessionToken({
    sub: "cloudprune-admin",
    email: "admin",
    accountId: "cloudprune-admin",
    companyName: "CloudPrune Admin",
    role: "admin",
    exp: Date.now() + 10000,
  });
  const userSession = sessionToken({
    sub: "11111111-1111-4111-8111-111111111111",
    email: "ami@example.com",
    accountId: "22222222-2222-4222-8222-222222222222",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const userId = "11111111-1111-4111-8111-111111111111";
  const { listeners, store, fetchCalls } = bootCloudPruneApp("/cloudprune/admin", adminSession, (url, options = {}) => {
    if (String(url).endsWith("/api/admin/overview")) {
      return jsonResponse({
        tenants: [{
          id: "22222222-2222-4222-8222-222222222222",
          companyName: "Zeptrix",
          userCount: 1,
          connections: 1,
          createdAt: "2026-07-03T08:00:00.000Z",
        }],
        feedback: [],
      });
    }
    if (String(url).endsWith(`/api/admin/tenants/22222222-2222-4222-8222-222222222222/users`)) {
      return jsonResponse({
        tenant: { id: "22222222-2222-4222-8222-222222222222", companyName: "Zeptrix" },
        users: [{ id: userId, name: "Ami", email: "ami@example.com", provider: "password", hasPassword: true }],
      });
    }
    if (String(url).endsWith(`/api/admin/users/${userId}/password`)) {
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).password, "new-password-123");
      return jsonResponse({ user: { id: userId, email: "ami@example.com" } });
    }
    if (String(url).endsWith(`/api/admin/users/${userId}/spoof`)) {
      assert.equal(options.method, "POST");
      return jsonResponse({ token: userSession, user: { email: "ami@example.com", companyName: "Zeptrix" } });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));
  await listeners.click[0]({
    target: {
      closest(selector) {
        return selector === "[data-action='toggle-admin-tenant-users']"
          ? { dataset: { tenantId: "22222222-2222-4222-8222-222222222222" } }
          : null;
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const resetForm = {
    dataset: { adminResetForm: userId },
    elements: { password: { value: "new-password-123" } },
  };
  await listeners.submit[0]({
    preventDefault() {},
    target: {
      closest(selector) {
        return selector === "[data-admin-reset-form]" ? resetForm : null;
      },
    },
  });

  await listeners.click[0]({
    target: {
      closest(selector) {
        return selector === "[data-action='admin-spoof-user']"
          ? { disabled: false, dataset: { userId } }
          : null;
      },
    },
  });

  assert.ok(fetchCalls.some((call) => String(call.url).endsWith(`/api/admin/users/${userId}/password`)));
  assert.ok(fetchCalls.some((call) => String(call.url).endsWith(`/api/admin/users/${userId}/spoof`)));
  assert.equal(store.get("cloudprune.session"), userSession);
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
  assert.match(workspace, /Region\(s\)/);
  assert.doesNotMatch(workspace, /Regions to scan/);
  assert.match(workspace, /us-east-1/);
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
  let calls = [];
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
  assert.deepEqual(JSON.parse(saveCall.options.body).regions, ["us-east-1"]);
});

test("CloudPrune AWS role submit refreshes derived ARN when account ID changes", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  let calls = [];
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
  assert.deepEqual(JSON.parse(saveCall.options.body).regions, ["us-east-1"]);
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
            regions: ["us-east-1", "il-central-1"],
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
          regions: ["us-west-2"],
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
  assert.match(app.innerHTML, />Edit scan configuration<\/button>/);
  assert.doesNotMatch(app.innerHTML, /<span>Region\(s\)<\/span><div class="connection-region-control">/);
  assert.match(app.innerHTML, /<span>Region\(s\)<\/span><code title="us-west-2">us-west-2<\/code>/);

  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='scan-aws']" ? { disabled: false } : null;
      },
    },
  });

  assert.match(app.innerHTML, /<button data-action="scan-aws" disabled>Scanning\.\.\.<\/button>/);
  assert.match(app.innerHTML, /<button class="secondary-connect" data-action="stop-scan" type="button">Stop scan<\/button>/);
  assert.match(app.innerHTML, /role="progressbar"/);
  assert.match(app.innerHTML, /style="--scan-progress:5%"/);
  assert.match(app.innerHTML, /<strong>0%<\/strong>/);
  assert.doesNotMatch(app.innerHTML, />Scan again<\/button>/);
  const scanCall = fetchCalls.find((call) => String(call.url).endsWith("/api/cloud-connections/aws/scan"));
  assert.ok(scanCall);
  assert.equal(scanCall.options.body, undefined);
  assert.equal(scanCall.options.headers["content-type"], undefined);
});

test("CloudPrune AWS setup regions can be changed before saving role", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const { fetchCalls, listeners } = bootCloudPruneApp("/cloudprune/", session, (url, options = {}) => {
    if (String(url).endsWith("/api/workspace")) {
      return jsonResponse({
        user: { name: "Ami", email: "ami@example.com", companyName: "Zeptrix" },
        connections: {
          aws: {
            provider: "aws",
            awsAccountId: "123456789012",
            roleArn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole",
            externalId: "cloudprune-account-1",
            regions: ["us-east-1"],
            status: "configured",
          },
        },
        awsScan: null,
        awsSetup: {},
      });
    }
    if (String(url).endsWith("/api/cloud-connections/aws") && options.method === "POST") {
      const payload = JSON.parse(options.body);
      return jsonResponse({
        connection: {
          provider: "aws",
          awsAccountId: "123456789012",
          roleArn: payload.roleArn,
          externalId: payload.externalId,
          regions: payload.regions,
          status: "configured",
        },
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));

  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='connect']" ? { disabled: false } : null;
      },
    },
  });
  for (const handler of listeners.change || []) handler({
    target: {
      checked: true,
      dataset: { regionChoice: "il-central-1" },
      closest(selector) {
        return selector === "[data-region-choice]" ? this : null;
      },
    },
  });
  const form = {
    dataset: { connectForm: "aws" },
    elements: {
      awsAccountId: { value: "123456789012" },
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
  await new Promise((resolve) => setImmediate(resolve));

  const saveCall = fetchCalls.find((call) => String(call.url).endsWith("/api/cloud-connections/aws") && call.options.method === "POST");
  assert.ok(saveCall);
  assert.deepEqual(JSON.parse(saveCall.options.body).regions, ["us-east-1", "il-central-1"]);
});

test("CloudPrune AWS setup region summary counts from five regions", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const { app, listeners } = bootCloudPruneApp("/cloudprune/", session, (url) => {
    if (String(url).endsWith("/api/workspace")) {
      return jsonResponse({
        user: { name: "Ami", email: "ami@example.com", companyName: "Zeptrix" },
        connections: {
          aws: {
            provider: "aws",
            awsAccountId: "123456789012",
            roleArn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole",
            externalId: "cloudprune-account-1",
            regions: ["us-east-1", "il-central-1", "eu-west-1", "eu-central-1"],
            status: "configured",
          },
        },
        awsScan: null,
        awsSetup: {},
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='connect']" ? { disabled: false } : null;
      },
    },
  });
  assert.match(app.innerHTML, /class="region-field"/);
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='connect']" ? { disabled: false } : null;
      },
    },
  });
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='connect']" ? { disabled: false } : null;
      },
    },
  });
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='connect']" ? { disabled: false } : null;
      },
    },
  });
  assert.match(app.innerHTML, /title="us-east-1, il-central-1, eu-west-1, eu-central-1"/);
  assert.match(app.innerHTML, /<strong>us-east-1, il-central-1, eu-west-1, eu-central-1<\/strong>/);
});

test("CloudPrune AWS setup region summary collapses five regions", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const { app, listeners } = bootCloudPruneApp("/cloudprune/", session, (url) => {
    if (String(url).endsWith("/api/workspace")) {
      return jsonResponse({
        user: { name: "Ami", email: "ami@example.com", companyName: "Zeptrix" },
        connections: {
          aws: {
            provider: "aws",
            awsAccountId: "123456789012",
            roleArn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole",
            externalId: "cloudprune-account-1",
            regions: ["us-east-1", "il-central-1", "eu-west-1", "eu-central-1", "us-west-2"],
            status: "configured",
          },
        },
        awsScan: null,
        awsSetup: {},
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='connect']" ? { disabled: false } : null;
      },
    },
  });
  assert.match(app.innerHTML, /title="us-east-1, il-central-1, eu-west-1, eu-central-1, us-west-2"/);
  assert.match(app.innerHTML, /<strong>5 regions<\/strong>/);
});

test("CloudPrune AWS region dropdown closes on outside click", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const { app, listeners } = bootCloudPruneApp("/cloudprune/", session, (url) => {
    if (String(url).endsWith("/api/workspace")) {
      return jsonResponse({
        user: { name: "Ami", email: "ami@example.com", companyName: "Zeptrix" },
        connections: {
          aws: {
            provider: "aws",
            awsAccountId: "123456789012",
            roleArn: "arn:aws:iam::123456789012:role/CloudPruneReadOnlyRole",
            externalId: "cloudprune-account-1",
            regions: ["us-east-1"],
            status: "configured",
          },
        },
        awsScan: null,
        awsSetup: {},
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='connect']" ? { disabled: false } : null;
      },
    },
  });
  assert.match(app.innerHTML, /class="region-field"/);
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='toggle-region-picker']" ? { disabled: false } : null;
      },
    },
  });
  assert.match(app.innerHTML, /class="region-menu"/);
  for (const handler of listeners.click || []) handler({
    target: {
      closest() {
        return null;
      },
    },
  });
  assert.doesNotMatch(app.innerHTML, /class="region-menu"/);
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
            statistics: {
              "Measured data": "210 GB",
              "Cold/old-tier S3": "80 GB (40% of measured S3)",
            },
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
  assert.match(app.innerHTML, /Measured data/);
  assert.match(app.innerHTML, /210 GB/);
  assert.match(app.innerHTML, /Cold\/old-tier S3/);
  assert.match(app.innerHTML, /Snapshot first and delete in small batches/);
  assert.match(app.innerHTML, /Create a new EBS volume from the retained snapshot/);
  assert.doesNotMatch(app.innerHTML, /Move steady EC2 baseline into Savings Plans/);
});

test("CloudPrune saved recommendation Review button opens workflow preview", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const { app, listeners } = bootCloudPruneApp("/cloudprune/recommendations", session, (url) => {
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
          counts: { ebsVolumes: 1 },
          errors: [],
          progress: 100,
          message: "AWS scan complete. Read 1 entity.",
          recommendations: [{
            id: "ec2-graviton-modernization",
            cloud: "aws",
            title: "Assess Graviton migration for 2 x86 EC2 instances",
            detail: "Moving from x86 to Graviton changes CPU architecture.",
            impact: 0,
            effort: "Medium",
            risk: "Medium",
            owner: "Compute modernization",
            status: "Review",
            statistics: { "Instance families": "t3.micro -> t4g.micro, t3.small -> t4g.small" },
            minimizeImpact: "Launch one arm64 canary before rolling traffic.",
            rollbackPath: "Switch traffic back to the previous x86 instance type.",
          }],
        },
        awsSetup: {},
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(app.innerHTML, /Assess Graviton migration/);
  assert.match(app.innerHTML, /aria-expanded="false"[^>]*>Review<\/button>/);
  for (const handler of listeners.click || []) handler({
    target: {
      closest(selector) {
        return selector === "[data-action='stage']" ? { disabled: false, dataset: { recommendationId: "ec2-graviton-modernization" } } : null;
      },
    },
  });

  assert.match(app.innerHTML, /Open evidence review/);
  assert.match(app.innerHTML, /aria-expanded="true"[^>]*>Close<\/button>/);
  assert.match(app.innerHTML, /Launch one arm64 canary before rolling traffic/);
  assert.match(app.innerHTML, /Switch traffic back to the previous x86 instance type/);
});

test("CloudPrune recommendations route renders the top generated recommendation first", async () => {
  const session = sessionToken({
    sub: "user-1",
    email: "ami@example.com",
    accountId: "account-1",
    companyName: "Zeptrix",
    exp: Date.now() + 10000,
  });
  const generatedRecommendations = buildReport(recommendationAssessmentFixture()).findings.slice(0, 20).map(publicRecommendation);

  assert.equal(generatedRecommendations[0].id, "compute-commitments");
  assert.equal(generatedRecommendations[0].title, "Review AWS Savings Plans purchase recommendation");

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
          monthlyCost: 1380,
          counts: { ec2Instances: 2, ebsVolumes: 1, logGroups: 1, s3Buckets: 1 },
          errors: [],
          progress: 100,
          message: "AWS scan complete. Read 5 entities.",
          recommendations: generatedRecommendations,
        },
        awsSetup: {},
      });
    }
    return jsonResponse({});
  });
  await new Promise((resolve) => setImmediate(resolve));

  const firstRecommendation = app.innerHTML.match(/<article class="recommendation[^"]*">[\s\S]*?<h3>(.*?)<\/h3>/)?.[1];

  assert.equal(firstRecommendation, "Review AWS Savings Plans purchase recommendation");
  assert.match(app.innerHTML, /Commit only to a conservative baseline/);
  assert.match(app.innerHTML, /Review 1 unattached EBS volume/);
  assert.ok(app.innerHTML.indexOf("Review AWS Savings Plans purchase recommendation") < app.innerHTML.indexOf("Review 1 unattached EBS volume"));
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

test("CloudPrune admin credentials create an admin session", async () => {
  await withServer(async (baseUrl) => {
    for (const password of [testAdminPassword, ` ${testAdminPassword} `]) {
      const response = await fetch(`${baseUrl}/cloudprune/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin", password }),
      });
      assert.equal(response.status, 200);
      const body = JSON.parse(await response.text());
      assert.equal(body.user.role, "admin");
      assert.equal(body.user.email, "admin");
      assert.equal(verifySession(body.token).role, "admin");
    }
  });
});

test("CloudPrune admin password comes from environment, not source", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/user-service.ts"), "utf8");
  const testSource = fs.readFileSync(path.join(__dirname, "server.test.js"), "utf8");
  const leakedAdminPasswordPattern = new RegExp(["Idan", "Yuval"].join(""));
  const literalTestPasswordPattern = new RegExp(["cloudprune-test", "admin-password"].join("-"));
  assert.match(source, /adminPassword/);
  assert.doesNotMatch(source, leakedAdminPasswordPattern);
  assert.doesNotMatch(testSource, leakedAdminPasswordPattern);
  assert.doesNotMatch(testSource, literalTestPasswordPattern);
});

test("CloudPrune admin sessions are bound to the current admin password version", () => {
  const token = signSession({
    id: "cloudprune-admin",
    email: "admin",
    name: "CloudPrune Admin",
    account_id: "cloudprune-admin",
    company_name: "CloudPrune Admin",
    role: "admin",
  });
  const payload = verifySession(token);
  assert.equal(payload.role, "admin");
  assert.match(payload.adminPasswordVersion, /^[A-Za-z0-9_-]+$/);
});

test("CloudPrune user sessions carry a revocable session version", () => {
  const token = signSession({
    id: "user-1",
    email: "ami@example.com",
    name: "Ami",
    account_id: "account-1",
    company_name: "Zeptrix",
    session_version: 7,
  });
  assert.equal(verifySession(token).sessionVersion, 7);

  const userServiceSource = fs.readFileSync(path.join(__dirname, "../src/user-service.ts"), "utf8");
  const feedbackSource = fs.readFileSync(path.join(__dirname, "../src/feedback-service.ts"), "utf8");
  assert.match(userServiceSource, /Number\(session\.sessionVersion\) !== Number\(user\.session_version\)/);
  assert.match(feedbackSource, /session_version=session_version \+ 1/);
});

test("CloudPrune feedback attachment limit is measured server-side", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/feedback-service.ts"), "utf8");
  assert.match(source, /Buffer\.byteLength\(attachmentContent, "base64"\)/);
  assert.match(source, /measuredAttachmentSize[\s\S]*2 \* 1024 \* 1024/);
});

test("CloudPrune audit log has a dedicated table, admin API, and owner email notification", () => {
  const dbSource = fs.readFileSync(path.join(__dirname, "../src/db.ts"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.ts"), "utf8");
  const auditSource = fs.readFileSync(path.join(__dirname, "../src/audit-service.ts"), "utf8");

  assert.match(dbSource, /create table if not exists cloudprune_audit_log/);
  assert.match(serverSource, /api\/admin\/audit-log/);
  assert.match(auditSource, /actorEmail === auditOwnerEmail/);
  assert.match(auditSource, /sesv2", "send-email"/);
  assert.match(auditSource, /cp audit log event|auditEmailSubject/);
  assert.match(auditSource, /amihaih@gmail\.com/);
});

test("CloudPrune JSON request bodies are capped before parsing", async () => {
  const oversizedByHeader = Object.assign(Readable.from(["{}"]), {
    headers: { "content-length": String(maxJsonBodyBytes + 1) },
  });
  await assert.rejects(() => readJson(oversizedByHeader), /too large/i);

  const oversizedStream = Object.assign(Readable.from([Buffer.alloc(maxJsonBodyBytes + 1, "x")]), {
    headers: {},
  });
  await assert.rejects(() => readJson(oversizedStream), /too large/i);
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
  assert.equal(externalIdForAccount("22222222-2222-4222-8222-22222222222223"), "cloudprune-22222222-2222-4222-8222-22222222222223");
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

  const stopped = publicAwsScan({
    id: "scan-3",
    status: "stopped",
    provider_account_id: "123456789012",
    scan_json: { progress: 100, message: "AWS scan stopped by user.", requestedRegions: ["us-east-1"] },
  });
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.message, "AWS scan stopped by user.");
  assert.deepEqual(stopped.regions, ["us-east-1"]);
});

test("AWS scan database writes serialize JSONB payloads", () => {
  const source = [
    fs.readFileSync(path.join(__dirname, "../server.ts"), "utf8"),
    fs.readFileSync(path.join(__dirname, "../src/workspace-service.ts"), "utf8"),
    fs.readFileSync(path.join(__dirname, "../src/aws-scan-runner.ts"), "utf8"),
  ].join("\n");

  assert.match(source, /values \(\$1,\$2,'running',\$3\)[\s\S]*jsonb\(\{ progress: 0, message: "Starting AWS scan\.", requestedRegions \}\)/);
  assert.match(source, /scan_json = scan_json \|\| \$3::jsonb[\s\S]*jsonb\(\{ progress: 100, message: "AWS scan stopped by user\." \}\)/);
  assert.match(source, /scan_json = scan_json \|\| \$2::jsonb[\s\S]*jsonb\(\{ \.\.\.extra, progress, message \}\)/);
  assert.match(source, /counts=\$5::jsonb, errors=\$6::jsonb, scan_json=\$7::jsonb[\s\S]*jsonb\(counts\), jsonb\(errors\), jsonb\(\{/);
  assert.match(source, /set status='failed', errors=\$2, scan_json = scan_json \|\| \$3::jsonb[\s\S]*jsonb\(\[\{ check: "scan", message: error\.message \}\]\), jsonb\(\{ progress: 100, message: "AWS scan failed\." \}\)/);

  assert.doesNotMatch(source, /\[user\.account_id, aws\.provider_account_id, \{ progress: 0/);
  assert.doesNotMatch(source, /\[user\.account_id, "stopped", \{ progress: 100/);
  assert.doesNotMatch(source, /\[scanId, \{ \.\.\.extra, progress, message \}\]/);
  assert.doesNotMatch(source, /\[scanId, status, cost\.amount, cost\.currency, counts, errors, \{/);
  assert.doesNotMatch(source, /\[scanId, \[\{ check: "scan", message: error\.message \}\], \{ progress: 100/);
});

test("AWS scan source collects traffic mapping and app inventory signals", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/aws-scan-runner.ts"), "utf8");

  assert.match(source, /function capAwsRegionalResult/);
  assert.match(source, /elasticIps: "Addresses"/);
  assert.match(source, /computeOptimizerEc2: "instanceRecommendations"/);
  assert.match(source, /CloudPruneTruncated/);
  assert.match(source, /\["targetGroups", "Reading ALB target groups"/);
  assert.match(source, /"elbv2", "describe-target-groups"/);
  assert.match(source, /"elbv2", "describe-target-health"/);
  assert.match(source, /\["apiGatewayV2", "Reading API Gateway HTTP APIs"/);
  assert.match(source, /"apigatewayv2", "get-apis"/);
  assert.match(source, /\["apiGatewayRest", "Reading API Gateway REST APIs"/);
  assert.match(source, /"apigateway", "get-rest-apis"/);
  assert.match(source, /\["ssmInstances", "Reading SSM managed instances"/);
  assert.match(source, /"ssm", "describe-instance-information"/);
  assert.match(source, /"ssm", "list-inventory-entries"/);
  assert.match(source, /"AWS:Application"/);
});

test("AWS scanner bounds Elastic IP and Compute Optimizer collection commands", () => {
  const elasticCommand = elasticIpsCommand("us-east-1", 25);
  assert.deepEqual(elasticCommand.slice(0, 4), ["ec2", "describe-addresses", "--region", "us-east-1"]);
  assert.ok(!elasticCommand.includes("--max-items"));
  assert.match(elasticCommand.join(" "), /Addresses\[:25\]/);
  assert.match(elasticCommand.join(" "), /CloudPruneOriginalCount:length\(Addresses\)/);

  const optimizerCommand = computeOptimizerEc2Command("us-east-1", 5000);
  assert.deepEqual(optimizerCommand.slice(0, 4), ["compute-optimizer", "get-ec2-instance-recommendations", "--region", "us-east-1"]);
  assert.ok(optimizerCommand.includes("--no-paginate"));
  assert.equal(optimizerCommand[optimizerCommand.indexOf("--max-results") + 1], "1000");
  assert.match(optimizerCommand.join(" "), /nextToken/);
  assert.equal(computeOptimizerMaxResults(200), 200);
  assert.equal(computeOptimizerMaxResults(5000), 1000);
});

test("AWS scanner marks post-query regional result truncation", () => {
  assert.deepEqual(capAwsRegionalResult("elasticIps", {
    CloudPruneOriginalCount: 3,
    Addresses: [{ PublicIp: "1.1.1.1" }, { PublicIp: "2.2.2.2" }],
  }, 2), {
    CloudPruneOriginalCount: 3,
    CloudPruneTruncated: true,
    Addresses: [{ PublicIp: "1.1.1.1" }, { PublicIp: "2.2.2.2" }],
  });
  assert.deepEqual(capAwsRegionalResult("computeOptimizerEc2", {
    instanceRecommendations: [{ instanceArn: "a" }, { instanceArn: "b" }, { instanceArn: "c" }],
  }, 2), {
    CloudPruneOriginalCount: 3,
    CloudPruneTruncated: true,
    instanceRecommendations: [{ instanceArn: "a" }, { instanceArn: "b" }],
  });
});

test("AWS assessment exposes traffic mapping and app inventory checks", () => {
  const assessment = buildAwsAssessment({
    targetGroups: [{ TargetGroups: [{ TargetGroupName: "apps", TargetGroupArn: "tg-1", Region: "us-east-1" }] }],
    apiGatewayV2: [{ Items: [{ ApiId: "api-1", Name: "http-api", Region: "us-east-1" }] }],
    apiGatewayRest: [{ items: [{ id: "rest-1", name: "rest-api", Region: "us-east-1" }] }],
    ssmInstances: [{ InstanceInformationList: [{ InstanceId: "i-1", ComputerName: "app", Region: "us-east-1" }] }],
    albTargetMappings: [{ name: "apps", targets: [{ id: "i-1", state: "healthy" }] }],
    ssmApplications: [{ id: "i-1", applications: [{ name: "nodejs" }] }],
  }, ["us-east-1"], []);

  assert.deepEqual(assessment.checks.albTargetMappings.data.targetGroups, [{ name: "apps", targets: [{ id: "i-1", state: "healthy" }] }]);
  assert.equal(assessment.checks.apiGatewayV2.data.Items[0].ApiId, "api-1");
  assert.equal(assessment.checks.apiGatewayRest.data.items[0].id, "rest-1");
  assert.equal(assessment.checks.ssmInstances.data.InstanceInformationList[0].InstanceId, "i-1");
  assert.equal(assessment.checks.ssmApplications.data.instances[0].applications[0].name, "nodejs");
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
    const response = await fetch(`${baseUrl}/cloudprune/%2e%2e/server.ts`);
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), /createServer/);

    const shortResponse = await fetch(`${baseUrl}/cp/%2e%2e/server.ts`);
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

test("compiled server can resolve copied CloudPrune assets", () => {
  const appPath = staticFilePathForUrlPath("/cloudprune/app.js");
  assert.match(appPath, /dist[/\\]cloudprune[/\\]app\.js$/);
  assert.equal(fs.existsSync(appPath), true);
});
