const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { duplicateTenantEmailMessage, inviteEmailContent, normalizeTenantPayload, smtpInviteMessage, staticFilePathForUrlPath, updateTenantWithClient } = require("../server");

function createTenantUpdateClient({ tenant, users, tenants = [tenant] }) {
  return {
    async query(sql, params) {
      if (sql.includes("select * from tenants")) {
        return { rows: tenants.filter((item) => item.id === params[0] || item.slug === params[0]) };
      }

      if (sql.includes("exists(select 1 from tenants")) {
        const [slug, tenantId, email] = params;
        return {
          rows: [{
            slug_exists: tenants.some((item) => item.slug === slug && item.id !== tenantId),
            email_exists: users.some((user) => user.email.toLowerCase() === email.toLowerCase() && user.tenant_id !== tenantId),
          }],
        };
      }

      if (sql.includes("update tenants")) {
        const [tenantId, slug, name, plan, status, region, seats, billingEmail] = params;
        const item = tenants.find((candidate) => candidate.id === tenantId);
        Object.assign(item, { slug, name, plan, status, region, seats, billing_email: billingEmail });
        return { rows: [item] };
      }

      if (sql.includes("update users")) {
        assert.equal(sql.includes("updated_at"), false);
        const [tenantId, name, email, googleSubject] = params;
        const user = users.find((candidate) => candidate.tenant_id === tenantId && candidate.role === "tenant_admin");
        Object.assign(user, { name, email, google_subject: googleSubject });
        return { rows: [user] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

test("tenant edit updates the primary tenant admin email even when the user row is stale", async () => {
  const tenant = {
    id: "tenant-test",
    slug: "test",
    name: "Test",
    plan: "Growth",
    status: "Active",
    region: "US-East",
    seats: 3,
    billing_email: "amihai@zeptrix.io",
  };
  const users = [{
    id: "user-test",
    tenant_id: "tenant-test",
    name: "Test",
    email: "amihaih@gmail.com",
    role: "tenant_admin",
  }];

  const client = createTenantUpdateClient({ tenant, users });
  await updateTenantWithClient(client, "tenant-test", {
    name: "Test",
    slug: "test",
    plan: "Growth",
    status: "Active",
    region: "US-East",
    seats: 3,
    billingEmail: "billing@test.example",
    ownerEmail: "amihai@zeptrix.io",
  });

  assert.equal(tenant.billing_email, "billing@test.example");
  assert.equal(users[0].email, "amihai@zeptrix.io");
  assert.equal(users[0].google_subject, "google-amihai@zeptrix.io");
});

test("tenant edit rejects tenant admin login emails used by another tenant user", async () => {
  const tenant = { id: "tenant-test", slug: "test", billing_email: "owner@test.example" };
  const users = [
    { id: "user-test", tenant_id: "tenant-test", email: "owner@test.example", role: "tenant_admin" },
    { id: "user-other", tenant_id: "tenant-other", email: "amihaih@gmail.com", role: "tenant_admin" },
  ];
  const client = createTenantUpdateClient({ tenant, users });

  await assert.rejects(
    updateTenantWithClient(client, "tenant-test", {
      name: "Test",
      slug: "test",
      plan: "Growth",
      status: "Active",
      region: "US-East",
      seats: 3,
      billingEmail: "billing@test.example",
      ownerEmail: "amihaih@gmail.com",
    }),
    /Tenant admin login email/,
  );
});

test("duplicate tenant email errors include the tenant and user role", () => {
  assert.equal(
    duplicateTenantEmailMessage("amihai@zeptrix.io", "Amihai Sales", "tenant_admin"),
    "Tenant admin login email amihai@zeptrix.io is already used by Amihai Sales (tenant_admin).",
  );
});

test("tenant payloads default owner login email to billing email for old clients", () => {
  assert.equal(
    normalizeTenantPayload({ billingEmail: "owner@example.com" }).ownerEmail,
    "owner@example.com",
  );
});

test("invite email content includes login details", () => {
  const content = inviteEmailContent({
    to: "owner@example.com",
    tenantName: "Example Tenant",
    temporaryPassword: "Tmp-Example123!",
  });

  assert.equal(content.subject, "Your Zeptrix CRM invite");
  assert.match(content.text, /Email: owner@example.com/);
  assert.match(content.text, /Temporary password: Tmp-Example123!/);
  assert.match(content.html, /Example Tenant/);
});

test("SMTP invite message sends only to the tenant login recipient", () => {
  const message = smtpInviteMessage({
    to: "owner@example.com",
    tenantName: "Example Tenant",
    temporaryPassword: "Tmp-Example123!",
  });

  assert.equal(message.to, "owner@example.com");
  assert.equal("bcc" in message, false);
});

test("CRM demo route serves the CRM app shell", () => {
  const crmIndex = path.join(__dirname, "..", "crm", "index.html");

  assert.equal(staticFilePathForUrlPath("/crm/demo"), crmIndex);
  assert.equal(staticFilePathForUrlPath("/crm/demo/"), crmIndex);
  assert.equal(staticFilePathForUrlPath("/crm/demo/ron"), crmIndex);
});

test("CRM home keeps correspondence and relationship event panels", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "crm", "app.js"), "utf8");
  const renderHomeStart = app.indexOf("function renderHome()");
  const renderHomeEnd = app.indexOf("function homeCorrespondence", renderHomeStart);
  const renderHomeSource = app.slice(renderHomeStart, renderHomeEnd);

  assert.match(renderHomeSource, /Recent correspondence/);
  assert.match(renderHomeSource, /Relationship events/);
});
