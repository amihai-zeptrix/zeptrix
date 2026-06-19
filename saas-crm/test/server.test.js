const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { authChallengeForUser, authenticatorUri, decryptToken, detectNegativeCorrespondence, duplicateTenantEmailMessage, enrichGmailContactFromSignature, extractGmailMessageText, encryptToken, gmailAuthUrl, gmailLabelQuery, inviteEmailContent, isAutomatedSenderEmail, normalizeDealPayload, normalizeGmailSettings, normalizeOutgoingEmailSettings, normalizeOutgoingMailPayload, normalizeRegistrationPayload, normalizeTenantPayload, normalizeWorkflowAutomationSettings, parseEmailAddress, signAuthToken, signGoogleAuthState, signPreAuthToken, smtpInviteMessage, staticFilePathForUrlPath, totpCode, updateTenantWithClient, verifyGoogleAuthState, verifyPreAuthToken, verifySignedPayload, verifyTotpCode } = require("../server");

function crmAppSource() {
  return fs.readFileSync(path.join(__dirname, "..", "crm", "app.js"), "utf8");
}

function crmStylesSource() {
  return fs.readFileSync(path.join(__dirname, "..", "crm", "styles.css"), "utf8");
}

function serverSource() {
  return fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
}

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = nextName ? source.indexOf(`function ${nextName}(`, start) : source.length;
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should exist after ${name}`);
  return source.slice(start, end);
}

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

test("self registration creates a tenant admin workspace from the sign-in page", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const server = serverSource();
  const renderLoginSource = functionSource(app, "renderPasswordLogin", "renderRegisterForm");
  const renderRegisterSource = functionSource(app, "renderRegisterForm", "renderPasswordChange");
  const renderMfaSource = functionSource(app, "renderMfa", "renderMfaSetup");
  const renderMfaSetupSource = functionSource(app, "renderMfaSetup", "renderApp");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  const registration = normalizeRegistrationPayload({
    fullName: "Ron Cohen",
    company: "Ron Labs",
    email: "RON@example.com",
    password: "StrongPass12",
  });
  assert.match(registration.slug, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.deepEqual({ ...registration, slug: "uuid" }, {
    fullName: "Ron Cohen",
    company: "Ron Labs",
    email: "ron@example.com",
    password: "StrongPass12",
    slug: "uuid",
    plan: "Growth",
    status: "Trial",
    region: "US-East",
    seats: 3,
  });
  assert.equal(normalizeRegistrationPayload({ fullName: "Ron", company: "Ron Labs", email: "bad", password: "StrongPass12" }).error, "A valid work email is required.");
  assert.equal(normalizeRegistrationPayload({ fullName: "Ron", company: "Ron Labs", email: "ron@example.com", password: "short" }).error, "Password must be at least 10 characters.");
  assert.match(renderLoginSource, /data-action="show-register"/);
  assert.match(renderLoginSource, /data-action="google-sso"/);
  assert.match(renderLoginSource, /data-mode="login"/);
  assert.match(renderLoginSource, /google-mark/);
  assert.match(renderRegisterSource, /data-register-form/);
  assert.match(renderRegisterSource, /data-mode="register"/);
  assert.match(renderRegisterSource, /Register with Google/);
  assert.match(renderRegisterSource, /Full name/);
  assert.doesNotMatch(renderRegisterSource, /Tenant ID/);
  assert.match(renderRegisterSource, /Register/);
  assert.match(renderMfaSource, /Set up authenticator MFA/);
  assert.match(renderMfaSource, /Google Authenticator/);
  assert.match(renderMfaSetupSource, /Manual setup key/);
  assert.match(clickHandlerSource, /action === "show-register"/);
  assert.match(clickHandlerSource, /startGoogleAuth\(actionElement\.dataset\.mode/);
  assert.match(submitHandlerSource, /data-register-form/);
  assert.match(submitHandlerSource, /registerViaApi\(values\)/);
  assert.match(submitHandlerSource, /prepareMfaChallenge\(result\)/);
  assert.match(app, /async function mfaSetupViaApi/);
  assert.match(app, /async function mfaVerifyViaApi/);
  assert.match(app, /consumeGoogleAuthRedirect\(\)\.finally/);
  assert.ok(server.includes('pathname === "/api/auth/register"'));
  assert.ok(server.includes('pathname === "/api/auth/google/start"'));
  assert.ok(server.includes('pathname === "/api/auth/google/callback"'));
  assert.ok(server.includes('pathname === "/api/auth/mfa/setup"'));
  assert.ok(server.includes('pathname === "/api/auth/mfa/verify"'));
  assert.match(server, /normalizeRegistrationPayload/);
  assert.match(server, /insertTenantWithClient/);
  assert.match(server, /insertUserWithClient/);
  assert.match(server, /preAuthToken/);
  assert.match(server, /mfa_secret_enc/);
  assert.match(server, /mfa_confirmed/);
  assert.match(styles, /\.auth-switch/);
  assert.match(styles, /\.google-mark/);
  assert.match(styles, /\.mfa-setup-card/);
});

test("Google SSO and authenticator MFA use signed pre-auth challenges", () => {
  const server = serverSource();
  const challenge = authChallengeForUser({
    id: "user-123",
    tenantId: "tenant-123",
    tenantName: "Tenant",
    name: "Ron Cohen",
    email: "ron@example.com",
    role: "tenant_admin",
    mustChangePassword: false,
    mfaEnabled: true,
    mfaConfirmed: false,
  });
  const secret = "JBSWY3DPEHPK3PXP";
  const code = totpCode(secret);
  const state = signGoogleAuthState("register");

  assert.equal(challenge.mfaRequired, true);
  assert.equal(challenge.mfaSetupRequired, true);
  assert.equal(verifyPreAuthToken(challenge.preAuthToken).purpose, "mfa");
  assert.match(verifyPreAuthToken(challenge.preAuthToken).jti, /^[0-9a-f-]{36}$/i);
  assert.equal(verifyGoogleAuthState(state).mode, "register");
  assert.match(authenticatorUri({ secret, email: "ron@example.com" }), /^otpauth:\/\/totp\/Zeptrix%20CRM/);
  assert.equal(verifyTotpCode(secret, code), true);
  assert.equal(verifyTotpCode(secret, "000000"), false);
  assert.match(server, /openid email profile/);
  assert.match(server, /verifyGoogleIdentity/);
  assert.match(server, /exchangeGoogleAuthCode/);
  assert.match(server, /const QRCode = require\("qrcode"\)/);
  assert.match(server, /QRCode\.toDataURL\(otpauth/);
  assert.doesNotMatch(server, /chart\.googleapis\.com\/chart/);
  assert.match(server, /alter table users add column if not exists mfa_enabled/);
  assert.match(server, /alter table users add column if not exists google_subject/);
  assert.match(server, /alter table users add column if not exists last_login_at/);
  assert.match(server, /users_google_subject_key/);
  assert.match(server, /registerMfaAttempt\(preAuthToken\) > 5/);
  assert.match(server, /consumedMfaChallenges\.has/);
  assert.match(server, /consumedMfaChallenges\.add/);
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
  assert.match(content.text, /Authenticator MFA/);
  assert.doesNotMatch(content.text, /123456/);
  assert.match(content.html, /Example Tenant/);
  assert.match(content.html, /Google Authenticator/);
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

test("Gmail settings normalization clamps scan thresholds and defaults detection", () => {
  const settings = normalizeGmailSettings({
    accountEmail: " user@gmail.com ",
    clientId: " 630303201111-\n etgcku1f78j31regvoc0lm2qdq6gqr5e.app\ns.googleusercontent.com ",
    redirectUri: "https://www.zeptrix.io/api/gmail/oauth/callback",
    staleMonths: 99,
    detectNewContacts: false,
  });

  assert.equal(settings.accountEmail, "user@gmail.com");
  assert.equal(settings.clientId, "630303201111-etgcku1f78j31regvoc0lm2qdq6gqr5e.apps.googleusercontent.com");
  assert.equal(settings.staleMonths, 36);
  assert.equal(settings.detectNewContacts, false);
  assert.equal(settings.detectDormantContacts, true);
  assert.equal(settings.labels, "Inbox, Sent");
  assert.throws(() => normalizeGmailSettings({ accountEmail: "" }), /Gmail account is required/);
  assert.throws(
    () => normalizeGmailSettings({ accountEmail: "user@gmail.com", clientId: "https://www.zeptrix.io/api/gmail/oauth/callback" }),
    /OAuth client ID must be the Web application Client ID/,
  );
});

test("deal payload normalization preserves contact metadata for database persistence", () => {
  const normalized = normalizeDealPayload({
    account: "Example Account",
    contact: "Helena Kralova",
    email: "helena@example.com",
    phone: "+972-52-1234567",
    tags: ["Gmail", "Pilot", ""],
  });

  assert.equal(normalized.name, "Example Account relationship");
  assert.equal(normalized.stage, "Lead");
  assert.equal(normalized.phone, "+972-52-1234567");
  assert.deepEqual(normalized.tags, ["Gmail", "Pilot"]);
});

test("CRM contact tags are backed by tenant tag catalog persistence", () => {
  const server = serverSource();

  assert.match(server, /create table if not exists contact_tags/);
  assert.match(server, /unique\(tenant_id, name\)/);
  assert.match(server, /create index if not exists contact_tags_tenant_name_idx/);
  assert.match(server, /function normalizeTags/);
  assert.match(server, /async function upsertContactTags/);
  assert.match(server, /await upsertContactTags\(tenantId, values\.tags\)/);
  assert.match(server, /dbQuery\(`select \* from contact_tags order by lower\(name\), name`\)/);
  assert.match(server, /availableTags: availableContactTags\(contactTags, normalizedDeals\)/);
  assert.match(server, /\/api\\\/tenants\\\/\[\^\/\]\+\\\/tags/);
  assert.match(server, /createContactTagForTenant\(resolved\.tenantId, body\.name \|\| body\.tag\)/);
});

test("CRM mail templates are persisted and exposed through tenant APIs", () => {
  const server = serverSource();

  assert.match(server, /create table if not exists mail_templates/);
  assert.match(server, /mail_templates_tenant_updated_idx/);
  assert.match(server, /function normalizeMailTemplatePayload/);
  assert.match(server, /async function upsertMailTemplateForTenant/);
  assert.match(server, /mailTemplates: mailTemplates\.map\(mailTemplateFromRow\)/);
  assert.match(server, /function mailTemplateFromRow/);
  assert.match(server, /\/api\\\/tenants\\\/\[\^\/\]\+\\\/templates/);
  assert.match(server, /Unable to save mail template/);
  assert.match(server, /Unable to update mail template/);
  assert.match(server, /Unable to delete mail template/);
});

test("Gmail OAuth URL uses readonly scope and tenant state", () => {
  const authUrl = new URL(gmailAuthUrl({
    tenantId: "tenant-123",
    userId: "user-123",
    clientId: " 630303201111-\n etgcku1f78j31regvoc0lm2qdq6gqr5e.app\ns.googleusercontent.com ",
    redirectUri: "https://www.zeptrix.io/api/gmail/oauth/callback",
    accountEmail: "user@gmail.com",
  }));

  assert.equal(authUrl.hostname, "accounts.google.com");
  assert.equal(authUrl.searchParams.get("client_id"), "630303201111-etgcku1f78j31regvoc0lm2qdq6gqr5e.apps.googleusercontent.com");
  assert.equal(authUrl.searchParams.get("redirect_uri"), "https://www.zeptrix.io/api/gmail/oauth/callback");
  assert.equal(authUrl.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(authUrl.searchParams.get("access_type"), "offline");
  assert.equal(authUrl.searchParams.get("login_hint"), "user@gmail.com");
  const state = verifySignedPayload(authUrl.searchParams.get("state"));
  assert.equal(state.tenantId, "tenant-123");
  assert.equal(state.userId, "user-123");
});

test("Gmail helpers parse addresses and encrypt tokens", () => {
  assert.deepEqual(parseEmailAddress("Maya Rosenthal <maya@example.com>"), { name: "Maya Rosenthal", email: "maya@example.com" });
  assert.deepEqual(parseEmailAddress("plain@example.com"), { name: "plain", email: "plain@example.com" });
  assert.equal(parseEmailAddress("not an address"), null);
  assert.equal(isAutomatedSenderEmail("no-reply@netflix.com"), true);
  assert.equal(isAutomatedSenderEmail("noreply@primark.example"), true);
  assert.equal(isAutomatedSenderEmail("nooreply@scj.igulzynawldxt.us"), true);
  assert.equal(isAutomatedSenderEmail("updates-noreply@example.com"), true);
  assert.equal(isAutomatedSenderEmail("alerts@example.com"), true);
  assert.equal(isAutomatedSenderEmail("newslater@example.com"), true);
  assert.equal(isAutomatedSenderEmail("newsletter@example.com"), true);
  assert.equal(isAutomatedSenderEmail("service@example.com"), true);
  assert.equal(isAutomatedSenderEmail("help@example.com"), true);
  assert.equal(isAutomatedSenderEmail("news@example.com"), true);
  assert.equal(isAutomatedSenderEmail("info@example.com"), true);
  assert.equal(isAutomatedSenderEmail("maya.noa@example.com"), false);
  assert.match(serverSource(), /isAutomatedSenderEmail\(parsed\.email\)/);

  const encrypted = encryptToken("refresh-token-value");
  assert.notEqual(encrypted, "refresh-token-value");
  assert.equal(decryptToken(encrypted), "refresh-token-value");
});

test("Gmail signature parsing enriches contact candidates conservatively", () => {
  const messageText = [
    "Hi team,",
    "",
    "Can we discuss the rollout next week?",
    "",
    "Best regards,",
    "Maya Hart",
    "VP Operations",
    "Nimbus Labs",
    "m: +1 415 555 0144",
    "https://nimbuslabs.io",
    "",
    "On Tue, Liam wrote:",
    "> old quoted text",
  ].join("\n");

  const enriched = enrichGmailContactFromSignature(
    { name: "maya", email: "maya@nimbuslabs.io" },
    messageText,
  );

  assert.equal(enriched.name, "Maya Hart");
  assert.equal(enriched.title, "VP Operations");
  assert.equal(enriched.account, "Nimbus Labs");
  assert.equal(enriched.phone, "+1 415 555 0144");
  assert.equal(enriched.source, "Inbound Gmail signature");

  const mobileVariant = enrichGmailContactFromSignature(
    { name: "ron", email: "ron@acme.com" },
    "Regards\nRon Levi\nChief Technology Officer\nAcme Software\nMobile: (415) 555-0199",
  );
  assert.equal(mobileVariant.name, "Ron Levi");
  assert.equal(mobileVariant.title, "Chief Technology Officer");
  assert.equal(mobileVariant.account, "Acme Software");
  assert.equal(mobileVariant.phone, "(415) 555-0199");

  [
    ["Mobile: +972-544-1234567", "+972-544-1234567"],
    ["Phone: +972-54-1234567", "+972-54-1234567"],
    ["M: 052-1234567", "052-1234567"],
    ["Tel: 03-7654321", "03-7654321"],
  ].forEach(([line, expectedPhone]) => {
    const israeliPhone = enrichGmailContactFromSignature(
      { name: "idan", email: "idan@zeptrix.io" },
      `Thanks\nIdan Yuval\nVP Sales\nZeptrix\n${line}`,
    );
    assert.equal(israeliPhone.phone, expectedPhone);
  });

  const disclaimerOnly = enrichGmailContactFromSignature(
    { name: "support", email: "support@example.com" },
    "Thanks\n\nThis email and any attachments are confidential. Unsubscribe here.",
  );
  assert.equal(disclaimerOnly.name, "support");
  assert.equal(disclaimerOnly.title, "");
  assert.equal(disclaimerOnly.account, "");
});

test("Gmail message text extraction prefers plain text and falls back to html", () => {
  const plain = Buffer.from("Plain body\n-- \nRon Levi\nCTO\nAcme").toString("base64url");
  const html = Buffer.from("<div>HTML body</div><br><strong>Ignored</strong>").toString("base64url");

  assert.equal(extractGmailMessageText({ payload: { parts: [{ mimeType: "text/html", body: { data: html } }, { mimeType: "text/plain", body: { data: plain } }] } }), "Plain body\n-- \nRon Levi\nCTO\nAcme");
  assert.equal(extractGmailMessageText({ payload: { mimeType: "text/html", body: { data: html } } }), "HTML body\nIgnored");
});

test("Gmail attention detection uses a large negative wording lexicon and persists matches", () => {
  const server = serverSource();
  const lexiconSource = server.slice(server.indexOf("const NEGATIVE_CORRESPONDENCE_PHRASES"), server.indexOf("const scanProgressById"));
  const matches = detectNegativeCorrespondence("I am angrey because you've promised a recovery plan and this is still broken.");

  assert.ok(matches.includes("angrey"));
  assert.ok(matches.includes("you've promised"));
  assert.ok(matches.includes("still broken"));
  assert.ok((lexiconSource.match(/"[^"]+"/g) || []).length >= 100);
  assert.match(server, /attention_correspondence/);
  assert.match(server, /detectNegativeCorrespondence/);
  assert.match(server, /Matched: \$\{matches\.join\(", "\)\}/);
  assert.match(server, /insert into gmail_contact_signals \(tenant_id, signal_type, email, name, account, source, message_id, last_seen_at\)/);
});

test("API auth tokens and Gmail labels are signed and bounded", () => {
  const token = signAuthToken({ id: "user-123", tenantId: "tenant-123", email: "owner@example.com", role: "tenant_admin" });
  const auth = verifySignedPayload(token);

  assert.equal(auth.userId, "user-123");
  assert.equal(auth.tenantId, "tenant-123");
  assert.equal(auth.email, "owner@example.com");
  assert.equal(auth.role, "tenant_admin");
  assert.equal(verifySignedPayload(`${token}tampered`), null);
  assert.equal(gmailLabelQuery("Inbox, Sales Follow Up, Sent"), "{in:inbox label:sales-follow-up}");
  assert.equal(gmailLabelQuery("Sent"), "in:anywhere");
  assert.match(serverSource(), /function gmailNewContactScope/);
  assert.match(serverSource(), /return "in:anywhere"/);
});

test("password changes require an authenticated matching user", () => {
  const server = serverSource();
  const changePasswordRoute = server.slice(server.indexOf("pathname === \"/api/auth/change-password\""), server.indexOf("if (req.method === \"POST\" && pathname === \"/api/tenants\"", server.indexOf("pathname === \"/api/auth/change-password\"")));

  assert.match(changePasswordRoute, /const auth = requireAuth\(req, res\)/);
  assert.match(changePasswordRoute, /auth\.email/);
  assert.match(changePasswordRoute, /Password can only be changed by the authenticated user/);
});

test("CRM demo route serves the CRM app shell", () => {
  const crmIndex = path.join(__dirname, "..", "crm", "index.html");

  assert.equal(staticFilePathForUrlPath("/crm/demo"), crmIndex);
  assert.equal(staticFilePathForUrlPath("/crm/demo/"), crmIndex);
  assert.equal(staticFilePathForUrlPath("/crm/demo/ron"), crmIndex);
  assert.equal(staticFilePathForUrlPath("/crm/ron"), crmIndex);
  assert.equal(staticFilePathForUrlPath("/crm/settings"), crmIndex);
  assert.notEqual(staticFilePathForUrlPath("/crm/app.js"), crmIndex);
});

test("CRM named demo routes use the demo tenant instead of admin", () => {
  const app = crmAppSource();

  assert.match(app, /const CRM_SECTION_ROUTE = CRM_NAMED_ROUTE_MATCH/);
  assert.match(app, /"settings", "templates"\]\.includes\(CRM_NAMED_ROUTE_MATCH\[1\]\)/);
  assert.ok(app.includes("const DEMO_ROUTE_MATCH = location.pathname.match(/^\\/crm\\/demo(?:\\/([^/]+))?\\/?$/) || (!CRM_SECTION_ROUTE ? CRM_NAMED_ROUTE_MATCH : null);"));
  assert.match(app, /section: CRM_SECTION_ROUTE \|\| "admin"/);
  assert.match(app, /function ensureClientDemoTenant/);
  assert.match(app, /name: "CRM Demo"/);
  assert.match(app, /tenantId: demoTenant\?\.id \|\| "demo"/);
});

test("CRM admin page exposes tenant and invite tabs", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderAdminSource = functionSource(app, "renderAdmin", "renderAdminTenants");
  const renderAdminTenantsSource = functionSource(app, "renderAdminTenants", "renderAdminInviteEmails");
  const renderAdminInviteEmailsSource = functionSource(app, "renderAdminInviteEmails", "tenantAdminEmail");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));

  assert.match(app, /adminTab: "tenants"/);
  assert.match(renderAdminSource, /class="settings-tabs admin-tabs"/);
  assert.match(renderAdminSource, /data-admin-tab="tenants"/);
  assert.match(renderAdminSource, /data-admin-tab="invites"/);
  assert.match(renderAdminSource, /ui\.adminTab === "invites" \? renderAdminInviteEmails\(\) : renderAdminTenants\(\)/);
  assert.match(renderAdminTenantsSource, /New tenant/);
  assert.match(renderAdminInviteEmailsSource, /Sent invite emails/);
  assert.match(clickHandlerSource, /dataset\.adminTab/);
  assert.match(clickHandlerSource, /ui\.adminTab = adminTab/);
  assert.match(styles, /\.admin-tabs/);
});

test("CRM home keeps attention correspondence and relationship event panels", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderHomeSource = functionSource(app, "renderHome", "renderHomeAttentionPanel");
  const israelGreetingSource = functionSource(app, "israelGreeting", "isPlatformAdmin");
  const homeAttentionPanelSource = functionSource(app, "renderHomeAttentionPanel", "homeCorrespondenceRequiringAttention");
  const homeAttentionSource = functionSource(app, "homeCorrespondenceRequiringAttention", "homeContactsNeedingFollowUp");
  const homeFollowUpSource = functionSource(app, "homeContactsNeedingFollowUp", "homeAccountCorrespondenceNeedingAttention");
  const homeCombinedSource = functionSource(app, "homeCorrespondenceNeedingAttention", "renderHomeAttentionThread");
  const renderHomeThreadSource = functionSource(app, "renderHomeAttentionThread", "homeEvents");
  const renderHomeAccountSource = functionSource(app, "renderHomeAttentionAccount", "renderHomeAttentionPanel");
  const accountsNeedingAttentionSource = functionSource(app, "accountsNeedingAttention", "accountAttentionReasons");
  const correlationSource = functionSource(app, "homeAccountAttentionCorrelations", "isOpenDeal");
  const isOpenDealSource = functionSource(app, "isOpenDeal", "accountAttentionReasons");
  const focusHomeCorrespondenceSource = functionSource(app, "focusHomeCorrespondenceAccount", "homeEvents");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const renderHomeEventSource = functionSource(app, "renderHomeEvent", "birthdayDate");

  assert.match(renderHomeSource, /israelGreeting\(\)/);
  assert.doesNotMatch(renderHomeSource, /Good morning,/);
  assert.match(israelGreetingSource, /timeZone: "Asia\/Jerusalem"/);
  assert.match(renderHomeSource, /Accounts that need attention/);
  assert.match(renderHomeSource, /attentionAccounts\.map\(renderHomeAttentionAccount\)/);
  assert.match(renderHomeSource, /Today's focus/);
  assert.match(homeAttentionPanelSource, /Correspondence needing attention/);
  assert.match(renderHomeSource, /Relationship events/);
  assert.match(renderHomeSource, /renderHomeAttentionPanel\(tenant\)/);
  assert.match(homeAttentionPanelSource, /jump-home-risk-thread/);
  assert.match(homeAttentionPanelSource, /Contacts needing follow-up/);
  assert.match(homeAttentionPanelSource, /Contacts with no sent mail in the configured window\./);
  assert.match(homeAttentionPanelSource, /No contacts are past the configured threshold\./);
  assert.match(homeAttentionPanelSource, /Correspondence requiring attention/);
  assert.match(homeAttentionPanelSource, /No negative wording found in the latest scan\./);
  assert.match(homeAttentionPanelSource, /homeContactsNeedingFollowUp\(tenant\)/);
  assert.match(homeAttentionPanelSource, /homeCorrespondenceRequiringAttention\(tenant\)/);
  assert.match(homeAttentionSource, /gmailAttentionCorrespondence\(tenant\)/);
  assert.match(homeAttentionSource, /Negative wording detected/);
  assert.match(homeAttentionSource, /Gmail scan matched/);
  assert.match(homeFollowUpSource, /gmailDormantContacts\(tenant, Number\(gmailIntegration\(tenant\)\.staleMonths \|\| 3\)\)/);
  assert.match(homeFollowUpSource, /No sent email for \$\{contact\.months \|\| 3\} months/);
  assert.match(homeFollowUpSource, /has not received an outbound email/);
  assert.match(homeCombinedSource, /sort\(\(a, b\) => Number\(b\.risk\) - Number\(a\.risk\) \|\| Number\(b\.followUp\) - Number\(a\.followUp\)\)/);
  assert.match(renderHomeThreadSource, /data-action="reply-home-correspondence"/);
  assert.match(renderHomeThreadSource, /data-thread-id/);
  assert.match(renderHomeThreadSource, /data-home-thread-id/);
  assert.match(renderHomeThreadSource, /data-home-thread-account/);
  assert.match(renderHomeAccountSource, /data-action="focus-home-correspondence-account"/);
  assert.match(renderHomeAccountSource, /attentionThreadId/);
  assert.match(renderHomeAccountSource, /data-open-account="\$\{escapeHtml\(account\)\}"/);
  assert.match(renderHomeAccountSource, /correlated-attention-row/);
  assert.match(accountsNeedingAttentionSource, /homeAccountAttentionCorrelations\(tenant\)/);
  assert.match(accountsNeedingAttentionSource, /Correspondence needs attention/);
  assert.match(accountsNeedingAttentionSource, /correspondenceRisk/);
  assert.match(accountsNeedingAttentionSource, /isOpenDeal\(deal\)/);
  assert.match(correlationSource, /thread\.dealId/);
  assert.doesNotMatch(homeFollowUpSource, /\|\| tenant\.deals\[0\]/);
  assert.match(isOpenDealSource, /!\["Won", "Lost"\]\.includes\(deal\.stage\)/);
  assert.match(focusHomeCorrespondenceSource, /querySelectorAll\("\[data-home-thread-id\]"\)/);
  assert.match(focusHomeCorrespondenceSource, /scrollIntoView/);
  assert.match(clickHandlerSource, /action === "reply-home-correspondence"/);
  assert.match(clickHandlerSource, /openHomeCorrespondenceEmail\(actionElement\.dataset\.threadId\)/);
  assert.match(clickHandlerSource, /action === "focus-home-correspondence-account"/);
  assert.match(clickHandlerSource, /focusHomeCorrespondenceAccount\(actionElement\.dataset\.account/);
  assert.match(renderHomeEventSource, /class="event-account" data-open-account/);
  assert.match(styles, /\.home-thread-list \{\s+display: grid;\s+grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(styles, /\.home-attention-section/);
  assert.match(styles, /\.home-thread-actions/);
  assert.match(styles, /\.correlated-attention-row/);
  assert.match(styles, /\.attention-main/);
  assert.match(styles, /\.thread-card\.is-highlighted/);
  assert.match(styles, /\.message-bubble \{\s+max-width: 100%;/);
});

test("CRM home relationship events include birthdays and account navigation", () => {
  const app = crmAppSource();
  const homeEventsSource = functionSource(app, "homeEvents", "renderHomeEvent");
  const renderHomeEventSource = functionSource(app, "renderHomeEvent", "birthdayDate");

  assert.match(homeEventsSource, /type: "Birthday"/);
  assert.match(homeEventsSource, /account: deal\.account/);
  assert.match(homeEventsSource, /Target close date/);
  assert.match(homeEventsSource, /Task/);
  assert.match(renderHomeEventSource, /data-open-account="\$\{escapeHtml\(event\.account\)\}"/);
});

test("CRM accounts keep account detail intelligence and correspondence controls", () => {
  const app = crmAppSource();
  const renderAccountsSource = functionSource(app, "renderAccounts", "allAccountTags");
  const renderAccountDetailSource = functionSource(app, "renderAccountDetail", "topAccountContacts");
  const renderAccountThreadSource = functionSource(app, "renderAccountThread", "renderReplyComposer");
  const accountCorrespondenceSource = functionSource(app, "accountCorrespondence", "renderAccountThread");
  const styles = crmStylesSource();

  assert.match(renderAccountsSource, /data-open-account/);
  assert.match(renderAccountsSource, /accountTags\(deal\.account\)/);
  assert.match(renderAccountDetailSource, /Top contacts/);
  assert.match(renderAccountDetailSource, /Correspondence/);
  assert.match(renderAccountDetailSource, /Relationship moments/);
  assert.match(renderAccountDetailSource, /account-reason-chips/);
  assert.match(renderAccountDetailSource, /data-account-tag-select/);
  assert.match(renderAccountDetailSource, /remove-account-tag/);
  assert.match(renderAccountDetailSource, /data-action="jump-risk-thread"/);
  assert.match(renderAccountDetailSource, /data-action="new-correspondence"/);
  assert.match(renderAccountThreadSource, /data-action="reply-correspondence"/);
  assert.match(renderAccountThreadSource, /risk-thread/);
  assert.match(accountCorrespondenceSource, /Escalation: angry about delays/);
  assert.match(app, /Anger detected/);
  assert.match(styles, /\.correspondence-panel/);
  assert.match(styles, /\.message-bubble \{\s+max-width: 100%;/);
});

test("CRM contacts add with an inline row instead of a dialog", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderContactsSource = functionSource(app, "renderContacts", "filteredContacts");
  const renderContactTagFilterSource = functionSource(app, "renderContactTagFilter", "renderInlineContactRow");
  const renderInlineContactRowSource = functionSource(app, "renderInlineContactRow", "filteredContacts");
  const renderContactRowSource = functionSource(app, "renderContactRow", "renderContactDetail");
  const renderContactDetailSource = functionSource(app, "renderContactDetail", "contactProfile");
  const renderTagDialogSource = functionSource(app, "renderTagDialog", "renderWhatsNewDialog");
  const allContactTagsSource = functionSource(app, "allContactTags", "accountTags");
  const setContactTagsSource = functionSource(app, "setContactTags", "setAccountTags");
  const renderModalSource = functionSource(app, "renderModal", "renderTenantForm");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const changeHandlerSource = app.slice(app.indexOf("document.addEventListener(\"change\""), app.indexOf("document.addEventListener(\"submit\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(renderContactsSource, /data-action="add-contact"/);
  assert.match(renderContactsSource, /renderContactTagFilter\(\)/);
  assert.match(renderContactsSource, /ui\.contactTagFilters\.length/);
  assert.doesNotMatch(renderContactsSource, /renderImportStrip\(\)/);
  assert.match(renderContactTagFilterSource, /data-contact-tag-filter/);
  assert.doesNotMatch(renderContactTagFilterSource, /multiple/);
  assert.match(renderContactTagFilterSource, /All tags/);
  assert.match(renderContactTagFilterSource, /tag-filter-menu/);
  assert.match(renderContactTagFilterSource, /allContactTags\(\)\.map/);
  assert.match(renderContactsSource, /ui\.inlineContactOpen \? renderInlineContactRow\(\) : ""/);
  assert.doesNotMatch(renderContactsSource, /data-action="add-deal">＋ Add contact/);
  assert.doesNotMatch(renderModalSource, /ui\.modal === "contact"/);
  assert.doesNotMatch(app, /data-contact-form/);
  assert.match(renderInlineContactRowSource, /data-inline-contact-form/);
  assert.match(renderInlineContactRowSource, /inline-contact-row/);
  assert.match(renderInlineContactRowSource, /Contact name/);
  assert.match(renderInlineContactRowSource, /name="phone"/);
  assert.match(renderInlineContactRowSource, /Save/);
  assert.match(renderContactRowSource, /contact-phone/);
  assert.match(renderContactRowSource, /deal\.phone \|\| "-"/);
  assert.match(renderContactRowSource, /renderCompactContactTags\(deal\)/);
  assert.match(renderContactRowSource, /contact-tags-short/);
  assert.match(renderContactRowSource, /data-action="edit-contact"/);
  assert.match(renderContactRowSource, /renderEditContactRow\(deal\)/);
  assert.match(renderContactRowSource, /data-edit-contact-form/);
  assert.match(renderContactRowSource, /contact-edit-panel/);
  assert.match(renderContactRowSource, /contact-edit-grid/);
  assert.match(renderContactRowSource, /Phone number/);
  assert.match(renderContactRowSource, /Save contact/);
  assert.match(renderContactRowSource, /data-original-email/);
  assert.match(renderContactDetailSource, /contact-tag-editor/);
  assert.match(renderContactDetailSource, /data-contact-tag-select/);
  assert.match(renderContactDetailSource, /remove-contact-tag/);
  assert.match(renderContactDetailSource, /\.\.\.add new/);
  assert.match(renderModalSource, /ui\.modal === "tag"/);
  assert.match(renderTagDialogSource, /data-tag-form/);
  assert.match(renderTagDialogSource, /Create a new tag/);
  assert.match(renderTagDialogSource, /data-action="use-tag-suggestion"/);
  assert.match(allContactTagsSource, /tenant\.availableTags/);
  assert.match(setContactTagsSource, /updateDealViaApi\(tenant\.id, existing\.id, nextDeal\)/);
  assert.match(setContactTagsSource, /availableTags: normalizeTags/);
  assert.doesNotMatch(renderContactRowSource, /Owner:/);
  assert.match(app, /deal\.phone/);
  assert.match(app, /async function createTagViaApi/);
  assert.match(app, /async function saveAvailableTag/);
  assert.match(clickHandlerSource, /action === "add-contact"/);
  assert.match(clickHandlerSource, /ui\.inlineContactOpen = true/);
  assert.match(clickHandlerSource, /action === "cancel-inline-add"/);
  assert.match(clickHandlerSource, /action === "edit-contact"/);
  assert.match(clickHandlerSource, /ui\.editingContactEmail = actionElement\.dataset\.email/);
  assert.match(clickHandlerSource, /action === "cancel-contact-edit"/);
  assert.match(clickHandlerSource, /action === "remove-contact-tag"/);
  assert.doesNotMatch(clickHandlerSource, /ui\.modal = "contact"/);
  assert.match(changeHandlerSource, /data-contact-tag-select/);
  assert.match(changeHandlerSource, /openTagDialog\(\{ type: "contact", dealId: deal\.id \}\)/);
  assert.match(changeHandlerSource, /data-contact-tag-filter/);
  assert.match(changeHandlerSource, /querySelectorAll\("\[data-contact-tag-filter\]:checked"\)/);
  assert.match(changeHandlerSource, /setContactTags\(deal\.id, \[\.\.\.\(deal\.tags \|\| \[\]\), tag\]\)/);
  assert.match(submitHandlerSource, /data-tag-form/);
  assert.match(submitHandlerSource, /saveAvailableTag\(tag\)/);
  assert.match(submitHandlerSource, /setContactTags\(deal\.id, \[\.\.\.\(deal\.tags \|\| \[\]\), savedTag\]\)/);
  assert.match(app, /async function createDealViaApi/);
  assert.match(app, /async function updateDealViaApi/);
  assert.match(app, /async function deleteDealViaApi/);
  assert.match(serverSource(), /api\\\/tenants\\\/\[\^\/\]\+\\\/deals/);
  assert.match(serverSource(), /function normalizeDealPayload/);
  assert.match(serverSource(), /phone text/);
  assert.match(serverSource(), /tags jsonb/);
  assert.match(submitHandlerSource, /data-inline-contact-form/);
  assert.match(submitHandlerSource, /data-edit-contact-form/);
  assert.match(submitHandlerSource, /originalEmail/);
  assert.match(submitHandlerSource, /updateDealViaApi\(tenant\.id, deal\.id, deal\)/);
  assert.match(submitHandlerSource, /createDealViaApi\(tenant\.id, contact\)/);
  assert.match(submitHandlerSource, /phone: values\.phone/);
  assert.match(submitHandlerSource, /Contact added directly from Contacts/);
  assert.match(submitHandlerSource, /ui\.inlineContactOpen = false/);
  assert.match(styles, /\.inline-contact-row/);
  assert.match(styles, /\.contact-edit-panel/);
  assert.match(styles, /\.contact-edit-grid/);
  assert.match(styles, /\.contact-edit-phone/);
  assert.match(styles, /\.contact-tags-short/);
  assert.match(styles, /\.contact-tag-editor/);
  assert.match(styles, /\.contact-tag-filter/);
  assert.match(styles, /\.tag-filter-menu/);
  assert.match(styles, /\.tag-dialog/);
});

test("CRM deals add with an inline table row instead of a create dialog", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderGroupSource = functionSource(app, "renderGroup", "renderInlineDealRow");
  const renderInlineDealRowSource = functionSource(app, "renderInlineDealRow", "columnHeading");
  const renderModalSource = functionSource(app, "renderModal", "renderTenantForm");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(renderGroupSource, /ui\.inlineDealGroup === key \? renderInlineDealRow\(key\) : ""/);
  assert.match(renderGroupSource, /data-action="add-deal"/);
  assert.match(renderInlineDealRowSource, /data-inline-deal-form/);
  assert.match(renderInlineDealRowSource, /deal-inline-form/);
  assert.match(renderInlineDealRowSource, /Deal name/);
  assert.match(renderInlineDealRowSource, /Save/);
  assert.match(renderModalSource, /ui\.modal === "deal"/);
  assert.match(clickHandlerSource, /action === "add-deal"/);
  assert.match(clickHandlerSource, /ui\.inlineDealGroup = group \|\| "active"/);
  assert.match(clickHandlerSource, /ui\.view = "table"/);
  assert.doesNotMatch(clickHandlerSource, /action === "add-deal"\) \{ ui\.modal = "deal"/);
  assert.match(submitHandlerSource, /data-inline-deal-form/);
  assert.match(submitHandlerSource, /createDealViaApi\(tenant\.id, deal\)/);
  assert.match(submitHandlerSource, /updateDealViaApi\(tenant\.id, existing\.id, deal\)/);
  assert.match(submitHandlerSource, /Deal added inline from the pipeline/);
  assert.match(submitHandlerSource, /ui\.inlineDealGroup = null/);
  assert.match(styles, /\.inline-add-form/);
  assert.match(styles, /\.inline-deal-row td/);
});

test("CRM campaigns support account tags, audience targeting, and merge tokens", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const sidebarSource = functionSource(app, "renderSidebar", "sideLink");
  const topbarSource = functionSource(app, "renderTopbar", "renderSection");
  const renderSectionSource = functionSource(app, "renderSection", "renderPageHeader");
  const renderCampaignsSource = functionSource(app, "renderCampaigns", "renderAccountDetail");
  const renderCampaignDetailSource = functionSource(app, "renderCampaignDetail", "renderAccountDetail");

  assert.match(app, /const defaultTags =/);
  assert.match(app, /const campaignRecurrences =/);
  assert.match(app, /Every 3 months/);
  assert.match(app, /const templateTokens =/);
  assert.match(app, /campaigns:/);
  assert.match(app, /defaultCampaignsForTenant/);
  assert.match(app, /tenant\.campaigns\?\.length \? tenant\.campaigns : defaultCampaignsForTenant\(tenant\)/);
  assert.match(app, /Quarterly customer health check/);
  assert.match(app, /Expansion discovery pulse|Expansion stakeholder note/);
  assert.match(app, /Renewal value recap|Enterprise renewal readiness/);
  assert.match(app, /function allAccountTags/);
  assert.match(app, /function allContactTags/);
  assert.match(app, /async function setAccountTags/);
  assert.match(app, /updateDealViaApi\(tenant\.id, deal\.id, deal\)/);
  assert.match(app, /function campaignRecipients/);
  assert.match(app, /function renderMergedTemplate/);
  assert.match(app, /function recurrenceLabel/);
  assert.match(app, /data = normalizeData\(\{ \.\.\.data, tenants: remote\.tenants, inviteEmails: remote\.inviteEmails \}\)/);
  assert.match(sidebarSource, /sideLink\("campaigns", "◉", "Campaigns"/);
  assert.match(renderSectionSource, /ui\.section === "campaigns"/);
  assert.match(renderCampaignsSource, /data-campaign-form/);
  assert.match(renderCampaignsSource, /const campaigns = tenant\.campaigns \|\| \[\]/);
  assert.match(renderCampaignsSource, /data-open-campaign/);
  assert.match(renderCampaignsSource, /is-selected/);
  assert.match(renderCampaignsSource, /renderCampaignDetail\(selectedCampaign\)/);
  assert.match(renderCampaignDetailSource, /campaign-detail/);
  assert.match(renderCampaignDetailSource, /Selected accounts/);
  assert.match(renderCampaignDetailSource, /Template markup/);
  assert.match(renderCampaignsSource, /By tag/);
  assert.match(renderCampaignsSource, /By level/);
  assert.match(renderCampaignsSource, /By account name/);
  assert.match(renderCampaignsSource, /Recurrence/);
  assert.match(renderCampaignsSource, /campaignRecurrences\.map/);
  assert.match(renderCampaignsSource, /recurrenceLabel\(campaign\.recurrence\)/);
  assert.match(renderCampaignsSource, /data-action="insert-template-token"/);
  assert.match(renderCampaignsSource, /data-campaign-template/);
  assert.match(styles, /\.campaign-layout/);
  assert.match(styles, /\.campaign-card\.is-selected/);
  assert.match(styles, /\.campaign-detail-grid/);
  assert.match(styles, /\.token-bar/);
  assert.match(styles, /\.account-tag-editor/);
});

test("CRM settings include Gmail mail integration controls", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const sidebarSource = functionSource(app, "renderSidebar", "sideLink");
  const topbarSource = functionSource(app, "renderTopbar", "renderSection");
  const renderSectionSource = functionSource(app, "renderSection", "renderPageHeader");
  const renderSettingsPageSource = functionSource(app, "renderSettingsPage", "renderMailIntegrationsSettings");
  const renderMailSettingsSource = functionSource(app, "renderMailIntegrationsSettings", "renderConfigurationSettingsPanel");
  const renderConfigurationSource = functionSource(app, "renderConfigurationSettingsPanel", "gmailIntegration");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(sidebarSource, /sideLink\("settings", "⚙", "Email integration"\)/);
  assert.doesNotMatch(sidebarSource, /sideLink\("templates", "✎", "Email templates"/);
  assert.match(topbarSource, /isPlatformAdmin\(\) \? "Search tenants, deals, contacts\.\.\." : "Search deals, accounts, contacts\.\.\."/);
  assert.doesNotMatch(sidebarSource, /data-action="open-settings"><span class="icon">⚙<\/span> Settings/);
  assert.match(renderSectionSource, /ui\.section === "settings"/);
  assert.match(renderSectionSource, /ui\.section === "templates"/);
  assert.match(renderSectionSource, /renderTemplatesSettingsPanel\(\)/);
  assert.match(renderSettingsPageSource, /Mail integrations/);
  assert.match(renderSettingsPageSource, /data-settings-tab="mail"/);
  assert.match(renderSettingsPageSource, /Outgoing email/);
  assert.match(renderSettingsPageSource, /data-settings-tab="outgoing"/);
  assert.match(renderSettingsPageSource, /renderOutgoingEmailSettingsPanel/);
  assert.match(renderSettingsPageSource, /Email templates/);
  assert.match(renderSettingsPageSource, /data-settings-tab="templates"/);
  assert.match(renderSettingsPageSource, /renderTemplatesSettingsPanel/);
  assert.match(renderSettingsPageSource, /Workflow automation/);
  assert.match(renderSettingsPageSource, /data-settings-tab="automation"/);
  assert.match(renderSettingsPageSource, /renderWorkflowAutomationSettingsPanel/);
  assert.match(renderSettingsPageSource, /Configuration/);
  assert.match(renderSettingsPageSource, /data-settings-tab="configuration"/);
  assert.doesNotMatch(renderSettingsPageSource, /data-settings-tab="workspace"/);
  assert.match(renderConfigurationSource, /data-configuration-form/);
  assert.match(renderConfigurationSource, /gmail\.inboxLookbackDays/);
  assert.match(renderConfigurationSource, /gmailLookbackDays/);
  assert.match(renderMailSettingsSource, /data-gmail-settings-form/);
  assert.match(renderMailSettingsSource, /formField\("Gmail account", "accountEmail", gmail\.accountEmail, "email", true\)/);
  assert.doesNotMatch(renderMailSettingsSource, /gmailClientIdDiagnostic/);
  assert.doesNotMatch(renderMailSettingsSource, /gmail-diagnostic/);
  assert.match(renderMailSettingsSource, /ui\.gmailNotice/);
  assert.match(renderMailSettingsSource, /gmail-notice/);
  assert.match(renderMailSettingsSource, /data-action="open-gmail-oauth-guide"/);
  assert.match(renderMailSettingsSource, /Show me now/);
  assert.match(renderMailSettingsSource, /canUseGmailBackend/);
  assert.match(renderMailSettingsSource, /Gmail connection requires signing in to a workspace at \/crm\./);
  assert.match(renderMailSettingsSource, /data-action="connect-gmail" \$\{actionDisabled\}/);
  assert.match(renderMailSettingsSource, /OAuth client ID/);
  assert.match(renderMailSettingsSource, /Authorized redirect URI/);
  assert.match(renderMailSettingsSource, /No-mail threshold in months/);
  assert.match(renderMailSettingsSource, /Identify new contacts from Gmail/);
  assert.match(renderMailSettingsSource, /last \$\{gmailLookbackDays\} days/);
  assert.match(renderMailSettingsSource, /filters out contacts already in CRM/);
  assert.match(renderMailSettingsSource, /Find contacts with no sent mail/);
  assert.match(renderMailSettingsSource, /settings-stack/);
  assert.match(renderMailSettingsSource, /follow-up-card/);
  assert.match(renderMailSettingsSource, /gmailAttentionCorrespondence\(tenant\)/);
  assert.match(renderMailSettingsSource, /Correspondence requiring attention/);
  assert.match(renderMailSettingsSource, /negative wording/);
  assert.ok(renderMailSettingsSource.indexOf("Contacts needing follow-up") < renderMailSettingsSource.indexOf("Gmail signals"));
  assert.ok(renderMailSettingsSource.indexOf("Contacts needing follow-up") < renderMailSettingsSource.indexOf("Correspondence requiring attention"));
  assert.match(renderMailSettingsSource, /gmail\.readonly/);
  assert.match(app, /staleMonths: 3/);
  assert.match(app, /gmailContactDiscoveries/);
  assert.match(app, /gmailDormantContacts/);
  assert.match(app, /if \(gmail\.lastScanAt\) return \[\]/);
  assert.match(app, /saveGmailSettingsViaApi/);
  assert.match(app, /saveWorkflowAutomationViaApi/);
  assert.match(app, /connectGmailViaApi/);
  assert.match(app, /scanGmailViaApi/);
  assert.match(serverSource(), /GMAIL_NEW_CONTACT_LOOKBACK_DAYS = 30/);
  assert.match(app, /DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS = 30/);
  assert.match(serverSource(), /gmail_lookback_days/);
  assert.match(serverSource(), /GMAIL_NEW_CONTACT_METADATA_LIMIT = 1000/);
  assert.match(serverSource(), /GMAIL_NEW_CONTACT_FULL_LIMIT = 250/);
  assert.match(serverSource(), /GMAIL_NEW_CONTACT_SIGNAL_LIMIT = 250/);
  assert.match(serverSource(), /listGmailMessages/);
  assert.match(serverSource(), /gmailNewContactScope\(integration\.labels\)/);
  assert.match(serverSource(), /newer_than:\$\{gmailLookbackDays\}d/);
  assert.match(serverSource(), /format: "metadata"/);
  assert.match(serverSource(), /inboundMetadata\.slice\(0, GMAIL_NEW_CONTACT_FULL_LIMIT\)/);
  assert.match(serverSource(), /GMAIL_ATTENTION_SIGNAL_LIMIT = 100/);
  assert.match(serverSource(), /format: "full"/);
  assert.match(serverSource(), /add column if not exists phone text/);
  assert.match(serverSource(), /gmail_contact_blacklist/);
  assert.match(serverSource(), /scanProgressById/);
  assert.match(app, /handleGmailCallbackQuery/);
  assert.match(app, /Gmail connected\. Refreshing integration status/);
  assert.match(app, /setGmailStatus\("Saving Gmail settings\.\.\."/);
  assert.match(app, /Preparing Google authorization/);
  assert.match(app, /Redirecting to Google authorization/);
  assert.match(app, /Scanning Gmail\.\.\./);
  assert.match(app, /Automation created \$\{Number\(result\.automationSummary\.tasksCreated/);
  assert.match(app, /await loadStateFromApi\(\)/);
  assert.match(app, /Gmail settings saved\./);
  assert.match(app, /renderGmailOAuthGuide/);
  assert.match(app, /ui\.modal === "gmail-oauth-guide"/);
  assert.match(app, /Google Cloud Console/);
  assert.match(serverSource(), /if \(!integration\.account_email \|\| profile\.emailAddress\?\.toLowerCase\(\) !== String\(integration\.account_email\)\.toLowerCase\(\)\)/);
  assert.match(clickHandlerSource, /data-settings-tab/);
  assert.match(clickHandlerSource, /action === "connect-gmail"/);
  assert.match(clickHandlerSource, /action === "scan-gmail"/);
  assert.match(clickHandlerSource, /action === "skip-gmail-contact"/);
  assert.match(clickHandlerSource, /action === "add-gmail-contact"/);
  assert.match(submitHandlerSource, /data-gmail-settings-form/);
  assert.match(submitHandlerSource, /saveGmailSettingsViaApi\(tenant\.id, gmailFormValues\(event\.target\)\)/);
  assert.match(submitHandlerSource, /data-workflow-automation-form/);
  assert.match(submitHandlerSource, /saveWorkflowAutomationViaApi\(tenant\.id, values\)/);
  assert.match(submitHandlerSource, /data-configuration-form/);
  assert.match(submitHandlerSource, /saveConfigurationViaApi/);
  assert.match(styles, /\.settings-tabs/);
  assert.match(styles, /\.settings-layout/);
  assert.match(styles, /\.settings-stack/);
  assert.match(styles, /\.signal-row/);
  assert.match(styles, /\.signal-scope/);
  assert.match(styles, /\.gmail-notice\.error/);
  assert.match(styles, /\.automation-preview/);
  assert.doesNotMatch(styles, /\.gmail-diagnostic/);
});

test("CRM workflow automation persists rules and runs after Gmail risk scan", () => {
  const server = serverSource();
  const app = crmAppSource();
  const schema = fs.readFileSync(path.join(__dirname, "..", "crm", "db", "schema.sql"), "utf8");
  const normalized = normalizeWorkflowAutomationSettings({
    enabled: false,
    createFollowUpTasks: false,
    tagRiskAccounts: true,
    riskTag: " Renewal risk ",
    dormantDueDays: 99,
    attentionDueDays: -1,
  });

  assert.equal(normalized.enabled, false);
  assert.equal(normalized.createFollowUpTasks, false);
  assert.equal(normalized.tagRiskAccounts, true);
  assert.equal(normalized.riskTag, "Renewal risk");
  assert.equal(normalized.dormantDueDays, 30);
  assert.equal(normalized.attentionDueDays, 0);

  assert.match(server, /create table if not exists workflow_automations/);
  assert.match(server, /create_follow_up_tasks boolean not null default true/);
  assert.match(server, /last_run_summary jsonb not null default '\{\}'::jsonb/);
  assert.match(server, /function applyWorkflowAutomationToGmailSignals/);
  assert.match(server, /insertWorkflowTaskIfMissing/);
  assert.match(server, /Respond to risk email from/);
  assert.match(server, /Follow up with \$\{signal\.name \|\| signal\.email\} after/);
  assert.match(server, /addRiskTagToAccountDeals/);
  assert.match(server, /applyWorkflowAutomationToGmailSignals\(tenantId, \{ dormant: dormant\.slice/);
  assert.match(server, /automationSummary/);
  assert.match(server, /\/workflow-automation/);
  assert.match(server, /upsertWorkflowAutomationSettings/);
  assert.match(server, /workflowAutomationFromRow/);
  assert.match(schema, /create table workflow_automations/);

  assert.match(app, /defaultWorkflowAutomation/);
  assert.match(app, /workflowAutomation: \{ \.\.\.defaultWorkflowAutomation/);
  assert.match(app, /function renderWorkflowAutomationSettingsPanel/);
  assert.match(app, /Run automation after Gmail scan/);
  assert.match(app, /Mark risky accounts/);
  assert.match(app, /Tasks created/);
  assert.match(app, /workflowAutomationFormValues/);
});

test("CRM outgoing email settings and send email flow are wired to SMTP API", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const server = serverSource();
  const renderSettingsPageSource = functionSource(app, "renderSettingsPage", "renderTemplatesSettingsPanel");
  const renderOutgoingSource = functionSource(app, "renderOutgoingEmailSettingsPanel", "renderMailIntegrationsSettings");
  const renderEmailFormSource = functionSource(app, "renderEmailForm", "renderImportModal");
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.deepEqual(normalizeOutgoingEmailSettings({
    host: "smtp.example.com",
    port: "465",
    username: "sales@example.com",
    password: "secret",
    fromEmail: "sales@example.com",
  }), {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    username: "sales@example.com",
    password: "secret",
    fromName: "Zeptrix CRM",
    fromEmail: "sales@example.com",
  });
  assert.equal(normalizeOutgoingEmailSettings({ username: "u", fromEmail: "bad" }).error, "Outgoing mail server is required.");
  assert.deepEqual(normalizeOutgoingMailPayload({ to: "buyer@example.com", subject: "Hello", body: "Body", direction: "inbound" }), {
    dealId: null,
    to: "buyer@example.com",
    subject: "Hello",
    body: "Body",
    direction: "inbound",
  });
  assert.equal(normalizeOutgoingMailPayload({ to: "bad", subject: "Hello", body: "Body" }).error, "A valid recipient email is required.");
  assert.match(app, /const defaultOutgoingEmail/);
  assert.match(app, /outgoingEmail: \{ \.\.\.defaultOutgoingEmail/);
  assert.match(app, /async function saveOutgoingEmailSettingsViaApi/);
  assert.match(app, /async function sendEmailViaApi/);
  assert.match(renderSettingsPageSource, /ui\.settingsTab === "outgoing"/);
  assert.match(renderOutgoingSource, /data-outgoing-email-form/);
  assert.match(renderOutgoingSource, /SMTP host/);
  assert.match(renderOutgoingSource, /Use SSL\/TLS/);
  assert.match(renderOutgoingSource, /Save outgoing email/);
  assert.match(renderEmailFormSource, /<h2>Send email<\/h2>/);
  assert.match(renderEmailFormSource, /const to = ui\.emailContext\?\.to \|\| deal\?\.email \|\| ""/);
  assert.match(renderEmailFormSource, /email-context-card/);
  assert.match(renderEmailFormSource, /formField\("To", "to", to/);
  assert.match(renderEmailFormSource, /Send email<\/button>/);
  assert.doesNotMatch(renderEmailFormSource, /Log email/);
  assert.match(submitHandlerSource, /sendEmailViaApi\(tenant\.id, values\)/);
  assert.match(submitHandlerSource, /data-outgoing-email-form/);
  assert.match(submitHandlerSource, /saveOutgoingEmailSettingsViaApi\(tenant\.id, values\)/);
  assert.match(server, /create table if not exists outgoing_email_settings/);
  assert.match(server, /function upsertOutgoingEmailSettings/);
  assert.match(server, /function sendCrmEmailForTenant/);
  assert.ok(server.includes('pathname.endsWith("/outgoing-email")'));
  assert.ok(server.includes('pathname.endsWith("/outgoing-email/send")'));
  assert.match(server, /transporter\.sendMail/);
  assert.match(server, /insert into communications/);
  assert.match(styles, /\.modal\.email-modal/);
});

test("CRM mail templates can be managed and selected from follow-up email", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderTemplatesSource = functionSource(app, "renderTemplatesSettingsPanel", "renderTemplateForm");
  const renderTemplateFormSource = functionSource(app, "renderTemplateForm", "renderMailIntegrationsSettings");
  const renderMailSettingsSource = functionSource(app, "renderMailIntegrationsSettings", "renderGmailDiscoveryPagination");
  const renderEmailFormSource = functionSource(app, "renderEmailForm", "renderImportModal");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const changeHandlerSource = app.slice(app.indexOf("document.addEventListener(\"change\""), app.indexOf("document.addEventListener(\"submit\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(app, /const defaultMailTemplates/);
  assert.match(app, /mailTemplates: normalizeMailTemplates/);
  assert.match(app, /async function saveMailTemplateViaApi/);
  assert.match(app, /async function deleteMailTemplateViaApi/);
  assert.match(app, /function mergeMailTemplate/);
  assert.match(app, /function openFollowUpEmail/);
  assert.match(renderTemplatesSource, /data-template-form/);
  assert.match(renderTemplatesSource, /New email template/);
  assert.match(renderTemplateFormSource, /Save email template/);
  assert.match(renderTemplateFormSource, /data-action="delete-template"/);
  assert.match(renderMailSettingsSource, /data-action="follow-up-contact"/);
  assert.match(renderMailSettingsSource, /follow-up-chip/);
  assert.match(renderEmailFormSource, /data-email-template/);
  assert.match(renderEmailFormSource, /email-modal/);
  assert.match(renderEmailFormSource, /mergeMailTemplate\(template\?\.subject/);
  assert.match(renderEmailFormSource, /mergeMailTemplate\(template\?\.body/);
  assert.match(clickHandlerSource, /action === "follow-up-contact"/);
  assert.match(clickHandlerSource, /openFollowUpEmail\(actionElement\.dataset\.email\)/);
  assert.match(clickHandlerSource, /action === "delete-template"/);
  assert.match(changeHandlerSource, /data-email-template/);
  assert.match(submitHandlerSource, /data-template-form/);
  assert.match(submitHandlerSource, /saveMailTemplateViaApi\(tenant\.id, template\)/);
  assert.match(styles, /\.templates-card/);
  assert.match(styles, /\.follow-up-chip/);
  assert.match(styles, /\.modal\.email-modal/);
  assert.match(styles, /min-height: min\(720px, calc\(100vh - 48px\)\)/);
});

test("CRM Gmail discovered contacts provide add feedback and disappear after add", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderMailSettingsSource = functionSource(app, "renderMailIntegrationsSettings", "renderConfigurationSettingsPanel");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));

  assert.match(renderMailSettingsSource, /New contacts found in Gmail/);
  assert.match(renderMailSettingsSource, /Scope: last \$\{gmailLookbackDays\} days/);
  assert.match(renderMailSettingsSource, /non-sent Gmail/);
  assert.match(renderMailSettingsSource, /data-gmail-signal-email/);
  assert.match(renderMailSettingsSource, /\[item\.email, item\.phone, item\.source\]\.filter\(Boolean\)\.join/);
  assert.match(renderMailSettingsSource, /data-action="skip-gmail-contact"/);
  assert.match(renderMailSettingsSource, /renderGmailScanProgress/);
  assert.match(app, /GMAIL_DISCOVERY_PAGE_SIZE = 10/);
  assert.match(renderMailSettingsSource, /visibleDiscoveries/);
  assert.match(renderMailSettingsSource, /renderGmailDiscoveryPagination/);
  assert.match(app, /data-action="gmail-discovery-page"/);
  assert.match(clickHandlerSource, /action === "gmail-discovery-page"/);
  assert.match(renderMailSettingsSource, /!ui\.addedGmailContacts\.has\(item\.email\)/);
  assert.match(app, /phone: signal\.phone \|\| ""/);
  assert.match(app, /filter\(\(signal\) => !existing\.has\(String\(signal\.email \|\| ""\)\.toLowerCase\(\)\)\)/);
  assert.match(clickHandlerSource, /phone: discovery\.phone \|\| ""/);
  assert.match(clickHandlerSource, /phone \$\{discovery\.phone\}/);
  assert.match(clickHandlerSource, /action === "add-gmail-contact"/);
  assert.match(clickHandlerSource, /skipGmailContactViaApi/);
  assert.match(clickHandlerSource, /ui\.skippedGmailContacts\.add\(discovery\.email\)/);
  assert.match(serverSource(), /create table if not exists gmail_contact_blacklist/);
  assert.match(serverSource(), /insert into gmail_contact_blacklist/);
  assert.match(serverSource(), /select lower\(email::text\) email from gmail_contact_blacklist/);
  assert.match(clickHandlerSource, /pollGmailScanProgress/);
  assert.match(clickHandlerSource, /ui\.addedGmailContacts\.add\(discovery\.email\)/);
  assert.match(clickHandlerSource, /showToast\(`Added \$\{discovery\.name\} from Gmail`\)/);
  assert.match(app, /function showToast/);
  assert.match(styles, /\.toast-stack/);
  assert.match(styles, /\.toast/);
  assert.match(styles, /\.signal-pagination/);
});

test("CRM shows an impressive whats new dialog after login", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderModalSource = functionSource(app, "renderModal", "renderTenantForm");
  const renderWhatsNewSource = functionSource(app, "renderWhatsNewDialog", "renderTenantForm");
  const loginHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(app, /WHATS_NEW_VERSION/);
  assert.match(app, /gmail-scan-paging-2026-06-15/);
  assert.match(app, /maybeShowWhatsNew/);
  assert.match(renderModalSource, /ui\.modal === "whats-new"/);
  assert.match(renderWhatsNewSource, /Gmail integration/);
  assert.match(renderWhatsNewSource, /Populate accounts/);
  assert.match(renderWhatsNewSource, /whats-new-window-bar/);
  assert.match(renderWhatsNewSource, /whats-new-frame/);
  assert.match(renderWhatsNewSource, /data-action="close-whats-new"/);
  assert.match(loginHandlerSource, /maybeShowWhatsNew\(\)/);
  assert.match(styles, /\.whats-new-modal/);
  assert.match(styles, /\.whats-new-window-bar/);
  assert.match(styles, /\.whats-new-frame/);
  assert.match(styles, /\.whats-new-hero/);
});

test("CRM rejects stale local sessions but does not log out on protected request failures", () => {
  const app = crmAppSource();
  const loadSessionSource = functionSource(app, "loadSession", "saveData");
  const apiRequestSource = functionSource(app, "apiRequest", "loadStateFromApi");

  assert.match(loadSessionSource, /storedSession\.role !== "demo_user" && !storedSession\.apiToken/);
  assert.match(apiRequestSource, /response\.status === 401/);
  assert.match(apiRequestSource, /Please sign in again to continue/);
  assert.doesNotMatch(apiRequestSource, /session = null/);
});

test("CRM inbox expands communication rows into correspondence threads", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderInboxSource = functionSource(app, "renderInbox", "renderInboxThread");
  const renderInboxThreadSource = functionSource(app, "renderInboxThread", "renderModal");

  assert.match(app, /selectedCommunicationId/);
  assert.match(renderInboxSource, /data-open-communication/);
  assert.match(renderInboxSource, /renderInboxThread\(item, deal\)/);
  assert.match(renderInboxSource, /String\(ui\.selectedCommunicationId\) === String\(item\.id\)/);
  assert.match(renderInboxSource, /communication-row \$\{isOpen \? "is-open" : ""\}/);
  assert.match(renderInboxThreadSource, /class="inbox-thread-row"/);
  assert.match(renderInboxThreadSource, /class="message-bubble customer"/);
  assert.match(renderInboxThreadSource, /class="message-bubble team"/);
  assert.match(renderInboxThreadSource, /data-open-account/);
  assert.match(styles, /\.inbox-thread-row/);
  assert.match(styles, /\.communication-row\.is-open/);
});

test("CRM click handling preserves account, inbox, and search interactions", () => {
  const app = crmAppSource();
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const inputHandlerSource = app.slice(app.indexOf("document.addEventListener(\"input\""), app.indexOf("document.addEventListener(\"change\""));

  assert.match(clickHandlerSource, /data-open-account/);
  assert.match(clickHandlerSource, /ui\.section = "accounts"/);
  assert.match(clickHandlerSource, /ui\.accountFocus = account/);
  assert.match(clickHandlerSource, /data-open-communication/);
  assert.match(clickHandlerSource, /ui\.section = "inbox"/);
  assert.match(clickHandlerSource, /ui\.selectedCommunicationId = String\(ui\.selectedCommunicationId\) === String\(communicationId\) \? null : communicationId/);
  assert.match(clickHandlerSource, /insert-template-token/);
  assert.match(clickHandlerSource, /remove-account-tag/);
  assert.match(clickHandlerSource, /data-open-campaign/);
  assert.match(clickHandlerSource, /ui\.selectedCampaignId = campaignId/);
  assert.match(clickHandlerSource, /new-campaign/);
  assert.match(inputHandlerSource, /restoreSearchFocus\("\[data-contact-search\]", cursor\)/);
});

test("CRM form handling persists campaigns and account tags", () => {
  const app = crmAppSource();
  const changeHandlerSource = app.slice(app.indexOf("document.addEventListener(\"change\""), app.indexOf("document.addEventListener(\"submit\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(changeHandlerSource, /data-campaign-field/);
  assert.match(changeHandlerSource, /data-account-tag-select/);
  assert.match(changeHandlerSource, /openTagDialog\(\{ type: "account", account \}\)/);
  assert.match(submitHandlerSource, /data-campaign-form/);
  assert.match(submitHandlerSource, /data-tag-form/);
  assert.match(submitHandlerSource, /setAccountTags\(target\.account, \[\.\.\.accountTags\(target\.account\), savedTag\]\)/);
  assert.match(submitHandlerSource, /const campaigns = tenant\.campaigns \|\| \[\]/);
  assert.match(submitHandlerSource, /campaigns: \[campaign, \.\.\.campaigns\]/);
  assert.match(submitHandlerSource, /status: "Draft"/);
  assert.match(submitHandlerSource, /recurrence: "one-time"/);
  assert.match(submitHandlerSource, /campaigns: tenant\.campaigns/);
});

test("CRM import options are shown inline from the page header", () => {
  const app = crmAppSource();
  const renderPageHeaderSource = functionSource(app, "renderPageHeader", "renderAdmin");
  const renderContactsSource = functionSource(app, "renderContacts", "renderContactTagFilter");
  const renderAccountsSource = functionSource(app, "renderAccounts", "allAccountTags");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));

  assert.match(renderPageHeaderSource, /data-action="export"/);
  assert.match(renderPageHeaderSource, /data-action="open-import"/);
  assert.match(renderPageHeaderSource, /ui\.importOpen \? renderImportStrip\(\) : ""/);
  assert.doesNotMatch(renderContactsSource, /renderImportStrip\(\)/);
  assert.doesNotMatch(renderAccountsSource, /renderImportStrip\(\)/);
  assert.match(clickHandlerSource, /ui\.importOpen = !ui\.importOpen/);
  assert.match(clickHandlerSource, /ui\.importOpen = false/);
  assert.match(app, /CSV/);
  assert.match(app, /Salesforce/);
  assert.match(app, /Zendesk/);
});
