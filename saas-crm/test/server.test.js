const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { authChallengeForUser, authenticatorUri, consumeGoogleAuthResult, decryptToken, detectNegativeCorrespondence, duplicateTenantEmailMessage, enrichGmailContactFromSignature, extractGmailMessageText, encryptToken, gmailAuthUrl, gmailLabelQuery, inviteEmailContent, isAutomatedSenderEmail, mfaRecoveryEmailContent, normalizeDealPayload, normalizeGmailSettings, normalizeLinkedinSettings, normalizeOutgoingEmailSettings, normalizeOutgoingMailPayload, normalizeRegistrationPayload, normalizeTenantPayload, normalizeWorkflowAutomationSettings, parseEmailAddress, passwordResetEmailContent, registrationNotificationContent, signAuthToken, signGoogleAuthState, signMfaRecoveryToken, signPreAuthToken, smtpInviteMessage, staticFilePathForUrlPath, storeGoogleAuthResult, totpCode, updateTenantWithClient, verifyGoogleAuthState, verifyMfaRecoveryToken, verifyPreAuthToken, verifySignedPayload, verifyTotpCode } = require("../server");

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
  const prepareMfaSource = functionSource(app, "prepareMfaChallenge", "consumeGoogleAuthRedirect");
  const completeAuthSource = functionSource(app, "completeAuthSession", "consumeGoogleAuthRedirect");
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
  const notification = registrationNotificationContent({
    tenantName: "Ron Labs",
    userName: "Ron Cohen",
    userEmail: "ron@example.com",
    method: "Email/password",
  });
  assert.match(notification.subject, /New Zeptrix CRM registration: Ron Labs/);
  assert.match(notification.text, /Email: ron@example\.com/);
  assert.match(notification.text, /Method: Email\/password/);
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
  assert.match(prepareMfaSource, /!ui\.pendingUser\.mfaRequired && ui\.pendingUser\.apiToken/);
  assert.match(prepareMfaSource, /await completeAuthSession\(ui\.pendingUser\)/);
  assert.match(completeAuthSource, /apiToken: user\.apiToken \|\| ""/);
  assert.match(completeAuthSource, /await loadStateFromApi\(\)/);
  assert.match(app, /async function mfaSetupViaApi/);
  assert.match(app, /async function mfaVerifyViaApi/);
  assert.match(app, /async function googleAuthExchangeViaApi/);
  assert.match(app, /consumeGoogleAuthRedirect\(\)\.finally/);
  assert.ok(server.includes('pathname === "/api/auth/register"'));
  assert.ok(server.includes('pathname === "/api/auth/google/start"'));
  assert.ok(server.includes('pathname === "/api/auth/google/callback"'));
  assert.ok(server.includes('pathname === "/api/auth/google/exchange"'));
  assert.ok(server.includes('pathname === "/api/auth/mfa/setup"'));
  assert.ok(server.includes('pathname === "/api/auth/mfa/verify"'));
  assert.match(server, /normalizeRegistrationPayload/);
  assert.match(server, /insertTenantWithClient/);
  assert.match(server, /insertUserWithClient/);
  assert.match(server, /registrationNotificationEmail = process\.env\.REGISTRATION_NOTIFICATION_EMAIL \|\| "amihaih@gmail.com"/);
  assert.match(server, /notifyRegistration\(\{\s+tenantName: created\.tenantRow\.name,\s+userName: created\.userRow\.name,\s+userEmail: created\.userRow\.email,\s+method: "Email\/password"/);
  assert.match(server, /method: "Google SSO"/);
  assert.match(server, /Registration notification failed/);
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
    tenantMfaRequired: true,
    mfaEnabled: true,
    mfaConfirmed: false,
  });
  const tenantWithoutMfaChallenge = authChallengeForUser({
    id: "user-no-tenant-mfa",
    tenantId: "tenant-123",
    tenantName: "Tenant",
    name: "No MFA User",
    email: "no-mfa@example.com",
    role: "tenant_admin",
    mustChangePassword: false,
    tenantMfaRequired: false,
    mfaEnabled: true,
    mfaConfirmed: false,
  });
  const nonMfaChallenge = authChallengeForUser({
    id: "user-456",
    tenantId: "tenant-456",
    tenantName: "Tenant 2",
    name: "T2 User",
    email: "t2@example.com",
    role: "tenant_admin",
    mustChangePassword: false,
    mfaEnabled: false,
    mfaConfirmed: false,
  });
  const platformAdminChallenge = authChallengeForUser({
    id: "admin-user",
    tenantId: "admin",
    tenantName: "Zeptrix Admin",
    name: "Platform Admin",
    email: "admin@zeptrix.io",
    role: "platform_admin",
    mustChangePassword: false,
    mfaEnabled: true,
    mfaConfirmed: true,
  });
  const secret = "JBSWY3DPEHPK3PXP";
  const code = totpCode(secret);
  const state = signGoogleAuthState("register");
  const authPayload = { user: { id: "user-123", email: "ron@example.com" }, token: "server-side-only" };
  const exchangeCode = storeGoogleAuthResult(authPayload);

  assert.equal(challenge.mfaRequired, true);
  assert.equal(challenge.mfaSetupRequired, true);
  assert.equal(challenge.token, "");
  assert.equal(verifyPreAuthToken(challenge.preAuthToken).purpose, "mfa");
  assert.match(verifyPreAuthToken(challenge.preAuthToken).jti, /^[0-9a-f-]{36}$/i);
  assert.equal(tenantWithoutMfaChallenge.mfaRequired, false);
  assert.equal(tenantWithoutMfaChallenge.preAuthToken, "");
  assert.equal(verifySignedPayload(tenantWithoutMfaChallenge.token).tenantId, "tenant-123");
  assert.equal(nonMfaChallenge.mfaRequired, false);
  assert.equal(nonMfaChallenge.preAuthToken, "");
  assert.equal(verifySignedPayload(nonMfaChallenge.token).tenantId, "tenant-456");
  assert.equal(platformAdminChallenge.mfaRequired, false);
  assert.equal(platformAdminChallenge.preAuthToken, "");
  assert.equal(verifySignedPayload(platformAdminChallenge.token).role, "platform_admin");
  assert.equal(verifyGoogleAuthState(state).mode, "register");
  assert.deepEqual(consumeGoogleAuthResult(exchangeCode), authPayload);
  assert.equal(consumeGoogleAuthResult(exchangeCode), null);
  assert.match(authenticatorUri({ secret, email: "ron@example.com" }), /^otpauth:\/\/totp\/Zeptrix%20CRM/);
  assert.equal(verifyTotpCode(secret, code), true);
  assert.equal(verifyTotpCode(secret, "000000"), false);
  assert.match(server, /openid email profile/);
  assert.match(server, /verifyGoogleIdentity/);
  assert.match(server, /exchangeGoogleAuthCode/);
  assert.match(server, /storeGoogleAuthResult\(\{ \.\.\.challenge, tenant \}\)/);
  assert.match(server, /redirect\.searchParams\.set\("googleCode"/);
  assert.doesNotMatch(server, /redirect\.searchParams\.set\("googleAuth"/);
  assert.match(server, /const QRCode = require\("qrcode"\)/);
  assert.match(server, /QRCode\.toDataURL\(otpauth/);
  assert.doesNotMatch(server, /chart\.googleapis\.com\/chart/);
  assert.match(server, /alter table users add column if not exists mfa_enabled/);
  assert.match(server, /alter table tenants add column if not exists mfa_required/);
  assert.match(server, /mfa_enabled boolean not null default false/);
  assert.match(server, /alter table users add column if not exists google_subject/);
  assert.match(server, /alter table users add column if not exists last_login_at/);
  assert.match(server, /users_google_subject_key/);
  assert.match(server, /registerMfaAttempt\(preAuthToken\) > 5/);
  assert.match(server, /consumedMfaChallenges\.has/);
  assert.match(server, /consumedMfaChallenges\.add/);
  assert.match(server, /payload\.role === "platform_admin" \? false : !!payload\.tenantMfaRequired && !!payload\.mfaEnabled/);
});

test("login screen supports password reset and authenticator recovery", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const server = serverSource();
  const renderLoginSource = functionSource(app, "renderPasswordLogin", "renderForgotPassword");
  const renderForgotPasswordSource = functionSource(app, "renderForgotPassword", "renderRegisterForm");
  const renderMfaSource = functionSource(app, "renderMfa", "renderMfaSetup");
  const renderMfaRecoverySource = functionSource(app, "renderMfaRecovery", "renderApp");
  const redirectSource = functionSource(app, "consumeGoogleAuthRedirect", "findUserByEmail");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));
  const passwordEmail = passwordResetEmailContent({ to: "ron@example.com", tenantName: "Ron Labs", temporaryPassword: "Tmp-Example123" });
  const recoveryEmail = mfaRecoveryEmailContent({ to: "ron@example.com", tenantName: "Ron Labs", recoveryUrl: "https://www.zeptrix.io/crm/?mfaRecovery=token" });
  const recoveryToken = signMfaRecoveryToken({
    id: "user-123",
    tenantId: "tenant-123",
    tenantName: "Ron Labs",
    name: "Ron Cohen",
    email: "ron@example.com",
    role: "tenant_admin",
    mustChangePassword: false,
    mfaEnabled: true,
    mfaConfirmed: true,
  });

  assert.match(passwordEmail.subject, /Reset your Zeptrix CRM password/);
  assert.match(passwordEmail.text, /Temporary password: Tmp-Example123/);
  assert.match(recoveryEmail.subject, /Configure a new Zeptrix CRM authenticator/);
  assert.match(recoveryEmail.text, /Open this link within 30 minutes/);
  assert.equal(verifyMfaRecoveryToken(recoveryToken).purpose, "mfa-recovery");
  assert.match(renderLoginSource, /data-action="show-forgot-password"/);
  assert.match(renderForgotPasswordSource, /data-forgot-password-form/);
  assert.match(renderForgotPasswordSource, /Send reset email/);
  assert.match(renderMfaSource, /data-action="show-mfa-recovery"/);
  assert.match(renderMfaRecoverySource, /data-mfa-recovery-form/);
  assert.match(renderMfaRecoverySource, /Send authenticator link/);
  assert.match(redirectSource, /mfaRecovery/);
  assert.match(redirectSource, /mfaRecoveryConfirmViaApi\(mfaRecovery\)/);
  assert.match(redirectSource, /ui\.authStep = "password"/);
  assert.doesNotMatch(redirectSource, /await prepareMfaChallenge\(result\)/);
  assert.match(clickHandlerSource, /action === "show-forgot-password"/);
  assert.match(clickHandlerSource, /action === "show-mfa-recovery"/);
  assert.match(submitHandlerSource, /data-forgot-password-form/);
  assert.match(submitHandlerSource, /forgotPasswordViaApi\(values\.email\)/);
  assert.match(submitHandlerSource, /data-mfa-recovery-form/);
  assert.match(submitHandlerSource, /mfaRecoveryRequestViaApi\(values\.email\)/);
  assert.ok(server.includes('pathname === "/api/auth/forgot-password"'));
  assert.ok(server.includes('pathname === "/api/auth/mfa/recovery-request"'));
  assert.ok(server.includes('pathname === "/api/auth/mfa/recovery-confirm"'));
  assert.match(server, /password_change_required=true/);
  assert.match(server, /mfa_secret_enc=null, mfa_confirmed=false, mfa_enabled=true/);
  assert.match(server, /requiresLogin: true/);
  assert.doesNotMatch(server, /const updated = await userById\(user\.id\);\s+return json\(res, 200, authChallengeForUser\(updated\)\)/);
  assert.match(server, /signMfaRecoveryToken\(user\)/);
  assert.match(server, /verifyMfaRecoveryToken\(token\)/);
  assert.match(styles, /\.success/);
  assert.match(styles, /\.auth-link-button/);
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
    staleMonths: 99,
    detectNewContacts: false,
  });

  assert.equal(settings.accountEmail, "");
  assert.equal(settings.workspaceDomain, "zeptrix.io");
  assert.equal(settings.redirectUri.endsWith("/api/gmail/oauth/callback"), true);
  assert.equal(settings.staleMonths, 36);
  assert.equal(settings.detectNewContacts, false);
  assert.equal(settings.detectDormantContacts, true);
  assert.equal(settings.labels, "Inbox, Sent");

  const explicitMailbox = normalizeGmailSettings({ accountEmail: " user@gmail.com " });
  assert.equal(explicitMailbox.accountEmail, "user@gmail.com");
  assert.equal(explicitMailbox.workspaceDomain, "gmail.com");
  assert.equal(normalizeGmailSettings({ labels: "Inbox" }).staleMonths, null);
  assert.throws(() => normalizeGmailSettings({ accountEmail: "not-an-email" }), /Gmail account must be a valid email address/);
});

test("LinkedIn settings normalization avoids password and token capture", () => {
  const settings = normalizeLinkedinSettings({
    accountEmail: " owner@example.com ",
    syncContacts: false,
    syncCompanyUpdates: "on",
  });

  assert.equal(settings.companyPageUrl, "");
  assert.equal(settings.accountEmail, "owner@example.com");
  assert.equal(settings.syncContacts, false);
  assert.equal(settings.syncCompanyUpdates, false);
  assert.equal(normalizeLinkedinSettings({ companyPageUrl: "https://www.linkedin.com/company/zeptrix/" }).companyPageUrl, "");
  assert.throws(() => normalizeLinkedinSettings({ accountEmail: "bad" }), /LinkedIn account email must be a valid email address/);
  assert.doesNotThrow(() => normalizeLinkedinSettings({ accountEmail: "owner@example.com", password: "secret", token: "abc", cookie: "li_at=abc" }));
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
    returnOrigin: "https://zeptrix.io",
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
  assert.equal(state.returnOrigin, "https://zeptrix.io");

  const chooserUrl = new URL(gmailAuthUrl({
    tenantId: "tenant-123",
    userId: "user-123",
    clientId: "630303201111-etgcku1f78j31regvoc0lm2qdq6gqr5e.apps.googleusercontent.com",
    redirectUri: "https://www.zeptrix.io/api/gmail/oauth/callback",
  }));
  assert.equal(chooserUrl.searchParams.has("login_hint"), false);
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
  const scanSource = server.slice(server.indexOf("async function scanGmailForTenant"), server.indexOf("async function runWorkflowAutomationForTenant"));
  const refreshSource = functionSource(server, "refreshGmailAccessToken", "getGmailAccessToken");
  const matches = detectNegativeCorrespondence("I am angrey because you've promised a recovery plan and this is still broken.");

  assert.ok(matches.includes("angrey"));
  assert.ok(matches.includes("you've promised"));
  assert.ok(matches.includes("still broken"));
  assert.ok((lexiconSource.match(/"[^"]+"/g) || []).length >= 100);
  assert.match(scanSource, /listGmailMessages\(accessToken, \{ q: `\$\{gmailNewContactScope\(integration\.labels\)\} newer_than:\$\{gmailLookbackDays\}d -in:sent` \}, GMAIL_NEW_CONTACT_METADATA_LIMIT\)/);
  assert.match(scanSource, /if \(integration\.detect_new_contacts\) \{/);
  assert.match(scanSource, /const attentionCorrespondence = fullInboundMessages/);
  assert.doesNotMatch(scanSource, /integration\.detect_new_contacts\s+\?\s+listGmailMessages/);
  assert.match(refreshSource, /const refreshClientId = integration\.client_id \|\| googleClientId/);
  assert.match(refreshSource, /client_id: refreshClientId/);
  assert.match(server, /client_id=\$7, redirect_uri=\$8/);
  assert.match(server, /attention_correspondence/);
  assert.match(server, /detectNegativeCorrespondence/);
  assert.match(server, /Matched: \$\{matches\.join\(", "\)\}/);
  assert.match(server, /insert into gmail_contact_signals \(tenant_id, signal_type, email, name, account, source, message_id, last_seen_at\)/);
  assert.match(server, /on conflict \(tenant_id, signal_type, email\) do update set/);
  assert.match(server, /message_id=excluded\.message_id/);
  assert.match(server, /months=excluded\.months/);
});

test("Gmail scan attaches known account threads to CRM communications with tracking metadata", () => {
  const server = serverSource();
  const app = crmAppSource();
  const styles = crmStylesSource();
  const schema = fs.readFileSync(path.join(__dirname, "..", "crm", "db", "schema.sql"), "utf8");
  const scanSource = server.slice(server.indexOf("async function scanGmailForTenant"), server.indexOf("async function handleRequest"));
  const rowMapperSource = functionSource(server, "communicationFromRow", "gmailIntegrationFromRow");
  const accountTimelineSource = functionSource(app, "accountTimeline", "renderAccountTimelineItem");
  const renderAccountThreadSource = functionSource(app, "renderAccountThread", "renderReplyComposer");
  const renderInboxSource = functionSource(app, "renderInbox", "renderInboxThread");
  const renderInboxThreadSource = functionSource(app, "renderInboxThread", "renderModal");

  assert.match(server, /tracking_status text not null default 'Logged'/);
  assert.match(server, /gmail_thread_id text/);
  assert.match(server, /source text not null default 'crm'/);
  assert.match(server, /add column if not exists tracking_status/);
  assert.match(server, /add column if not exists gmail_thread_id/);
  assert.match(server, /communications_tenant_thread_idx/);
  assert.match(schema, /tracking_status text not null default 'Logged'/);
  assert.match(schema, /gmail_thread_id text/);
  assert.match(schema, /communications_tenant_thread_idx/);
  assert.match(rowMapperSource, /trackingStatus: item\.tracking_status/);
  assert.match(rowMapperSource, /gmailThreadId: item\.gmail_thread_id/);
  assert.match(rowMapperSource, /source: item\.source/);
  assert.match(scanSource, /select distinct on \(lower\(email\)\) id, lower\(email\) email, contact, account/);
  assert.match(scanSource, /const gmailAccountThreads = fullInboundMessages/);
  assert.match(scanSource, /const latestGmailAccountThreads = \[\.\.\.gmailAccountThreads\.reduce/);
  assert.match(scanSource, /threads\.set\(item\.threadId, item\)/);
  assert.match(scanSource, /internalDate: Number\(message\.full\.internalDate \|\| 0\)/);
  assert.match(scanSource, /item\.internalDate >= existing\.internalDate/);
  assert.match(scanSource, /to_timestamp\(\$9 \/ 1000\.0\)/);
  assert.match(scanSource, /dealByEmail\.get\(message\.parsed\.email\)/);
  assert.match(scanSource, /item\.deal\.id/);
  assert.match(scanSource, /insert into communications/);
  assert.match(scanSource, /tracking_status, replied_at, gmail_thread_id, source/);
  assert.match(scanSource, /with updated as/);
  assert.match(scanSource, /update communications/);
  assert.match(scanSource, /latestGmailAccountThreads\.slice\(0, 75\)/);
  assert.match(scanSource, /where tenant_id=\$1 and gmail_thread_id=\$8/);
  assert.match(scanSource, /where not exists \(select 1 from updated\)/);
  assert.match(scanSource, /Imported from Gmail/);
  assert.match(accountTimelineSource, /communicationTrackingLabel\(item\)/);
  assert.match(renderAccountThreadSource, /Gmail · attached/);
  assert.match(renderInboxSource, /renderTrackingPill\(item\)/);
  assert.match(renderInboxThreadSource, /thread \$\{escapeHtml\(item\.gmailThreadId\)\}/);
  assert.match(app, /function communicationTrackingLabel/);
  assert.match(app, /function renderTrackingPill/);
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

test("CRM admin page exposes tenant invite and audit tabs", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderAdminSource = functionSource(app, "renderAdmin", "renderAdminTenants");
  const renderAdminTenantsSource = functionSource(app, "renderAdminTenants", "renderAdminInviteEmails");
  const renderAdminInviteEmailsSource = functionSource(app, "renderAdminInviteEmails", "tenantAdminEmail");
  const renderAdminAuditSource = functionSource(app, "renderAdminAuditLog", "tenantAdminEmail");
  const renderAdminPaginationSource = functionSource(app, "renderAdminPagination", "tenantSearchText");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const inputHandlerSource = app.slice(app.indexOf("document.addEventListener(\"input\""), app.indexOf("function restoreSearchFocus"));

  assert.match(app, /adminTab: "tenants"/);
  assert.match(app, /adminSearch: ""/);
  assert.match(app, /adminPages: \{ tenants: 1, invites: 1, audit: 1 \}/);
  assert.match(renderAdminSource, /class="settings-tabs admin-tabs"/);
  assert.match(renderAdminSource, /data-admin-tab="tenants"/);
  assert.match(renderAdminSource, /data-admin-tab="invites"/);
  assert.match(renderAdminSource, /data-admin-tab="audit"/);
  assert.match(renderAdminSource, /ui\.adminTab === "audit" \? renderAdminAuditLog\(\) : ui\.adminTab === "invites" \? renderAdminInviteEmails\(\) : renderAdminTenants\(\)/);
  assert.match(renderAdminTenantsSource, /New tenant/);
  assert.match(renderAdminTenantsSource, /filterAdminRows\(data\.tenants, tenantSearchText\)/);
  assert.match(renderAdminTenantsSource, /renderAdminSearch\("Search tenants, login email, billing, plan\.\.\."\)/);
  assert.match(renderAdminTenantsSource, /renderAdminPagination\("tenants", rows\.length, page\)/);
  assert.match(renderAdminInviteEmailsSource, /sent invite emails/);
  assert.match(renderAdminInviteEmailsSource, /filterAdminRows\(mails, inviteSearchText\)/);
  assert.match(renderAdminInviteEmailsSource, /renderAdminPagination\("invites", rows\.length, page\)/);
  assert.match(renderAdminAuditSource, /audit records/);
  assert.match(renderAdminAuditSource, /filterAdminRows\(rows, auditSearchText\)/);
  assert.match(renderAdminAuditSource, /renderAdminPagination\("audit", filteredRows\.length, page\)/);
  assert.match(renderAdminAuditSource, /renderAuditLogRow/);
  assert.match(renderAdminAuditSource, /tenantName/);
  assert.match(renderAdminAuditSource, /function auditFieldSummary/);
  assert.match(renderAdminAuditSource, /Object\.entries\(fields \|\| \{\}\)\.slice\(0, 8\)/);
  assert.match(renderAdminPaginationSource, /ADMIN_LIST_PAGE_SIZE/);
  assert.match(renderAdminPaginationSource, /data-action="admin-page"/);
  assert.match(clickHandlerSource, /dataset\.adminTab/);
  assert.match(clickHandlerSource, /ui\.adminTab = adminTab/);
  assert.match(clickHandlerSource, /action === "admin-page"/);
  assert.match(inputHandlerSource, /data-admin-search/);
  assert.match(inputHandlerSource, /ui\.adminPages = \{ \.\.\.\(ui\.adminPages \|\| \{\}\), \[ui\.adminTab\]: 1 \}/);
  assert.match(styles, /\.admin-tabs/);
  assert.match(styles, /\.admin-list-search/);
  assert.match(styles, /\.audit-row/);
});

test("CRM audit log persists UI actions and form fields for admin review", () => {
  const app = crmAppSource();
  const server = serverSource();
  const schema = fs.readFileSync(path.join(__dirname, "..", "crm", "db", "schema.sql"), "utf8");
  const loadStateSource = functionSource(app, "loadStateFromApi", "loginViaApi");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(server, /create table if not exists audit_logs/);
  assert.match(server, /details jsonb not null default '\{\}'::jsonb/);
  assert.match(server, /audit_logs_created_idx/);
  assert.match(server, /audit_logs_tenant_created_idx/);
  assert.match(server, /function auditLogFromRow/);
  assert.match(server, /function sanitizeAuditDetails/);
  assert.match(server, /function sanitizedAuditMap/);
  assert.match(server, /const AUDIT_VALUE_ALLOWLIST/);
  assert.match(server, /email\|phone\|body\|subject\|message\|note\|template\|client\|smtp/);
  assert.match(server, /function recordServerAudit/);
  assert.match(server, /eventType = "server_mutation"/);
  assert.match(server, /operation: "update-gmail-settings"/);
  assert.match(server, /operation: "send-email"/);
  assert.match(server, /Audit details are too large/);
  assert.match(server, /Buffer\.byteLength\(JSON\.stringify\(details\), "utf8"\) > 50_000/);
  assert.match(server, /pathname === "\/api\/audit"/);
  assert.match(server, /insert into audit_logs \(tenant_id, user_id, user_email, user_role, event_type, operation, target, details\)/);
  assert.match(server, /JSON\.stringify\(sanitizedDetails\)/);
  assert.match(server, /auth\.role === "platform_admin" \? auditLogResult\.rows\.map\(auditLogFromRow\) : \[\]/);
  assert.match(schema, /create table audit_logs/);
  assert.match(schema, /create index audit_logs_tenant_created_idx/);
  assert.match(app, /auditLogs: \[\]/);
  assert.match(loadStateSource, /auditLogs: remote\.auditLogs \|\| \[\]/);
  assert.match(app, /function recordAuditEvent/);
  assert.match(app, /function auditClickEvent/);
  assert.match(app, /function auditSubmitEvent/);
  assert.match(app, /function auditTenantIdForForm/);
  assert.match(app, /form\.matches\("\[data-tenant-form\]"\) && ui\.editingTenant\?\.id/);
  assert.match(app, /const AUDIT_VALUE_ALLOWLIST/);
  assert.match(app, /const AUDIT_CLICK_SKIP_ACTIONS/);
  assert.match(app, /redactAuditValue/);
  assert.match(app, /password\|secret\|token\|code\|temporary\|authorization\|credential\|email\|phone\|body\|subject\|message\|note\|template\|client\|smtp/);
  assert.match(clickHandlerSource, /auditClickEvent\(\{ clickTarget: event\.target/);
  assert.doesNotMatch(submitHandlerSource.split("if (event.target.matches(\"[data-tag-form]\")")[0], /auditSubmitEvent\(event\.target\)/);
  assert.match(submitHandlerSource, /auditSubmitEvent\(event\.target\)/);
  assert.match(app, /eventType: "button_click"/);
  assert.match(app, /eventType: "form_submit"/);
  assert.match(app, /fields: auditFormFields\(form\)/);
  assert.match(app, /target: editingTenant\?\.id \? `tenant:\$\{editingTenant\.id\}` : marker/);
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
  const accountTimelineSource = functionSource(app, "accountTimeline", "renderAccountTimelineItem");
  const renderAccountTimelineItemSource = functionSource(app, "renderAccountTimelineItem", "formatTimelineDate");
  const renderAccountThreadSource = functionSource(app, "renderAccountThread", "renderReplyComposer");
  const accountCorrespondenceSource = functionSource(app, "accountCorrespondence", "renderAccountThread");
  const styles = crmStylesSource();

  assert.match(renderAccountsSource, /data-open-account/);
  assert.match(renderAccountsSource, /accountTags\(deal\.account\)/);
  assert.match(renderAccountDetailSource, /Top contacts/);
  assert.match(renderAccountDetailSource, /Account timeline/);
  assert.match(renderAccountDetailSource, /accountTimeline\(accountDeal\)/);
  assert.match(renderAccountDetailSource, /const timeline = accountTimeline\(accountDeal\)/);
  assert.match(renderAccountDetailSource, /timeline\.length/);
  assert.match(renderAccountDetailSource, /timeline\.map\(renderAccountTimelineItem\)/);
  assert.match(renderAccountDetailSource, /Correspondence/);
  assert.match(renderAccountDetailSource, /Relationship moments/);
  assert.match(renderAccountDetailSource, /Support context/);
  assert.match(renderAccountDetailSource, /accountSupportHealth\(accountDeal\.account\)/);
  assert.match(renderAccountDetailSource, /supportTicketsForAccount\(accountDeal\.account\)/);
  assert.match(renderAccountDetailSource, /renderSupportTicket/);
  assert.match(renderAccountDetailSource, /account-reason-chips/);
  assert.match(renderAccountDetailSource, /data-account-tag-select/);
  assert.match(renderAccountDetailSource, /remove-account-tag/);
  assert.match(renderAccountDetailSource, /data-action="jump-risk-thread"/);
  assert.match(renderAccountDetailSource, /data-action="new-correspondence"/);
  assert.match(renderAccountThreadSource, /data-action="reply-correspondence"/);
  assert.match(renderAccountThreadSource, /risk-thread/);
  assert.match(accountTimelineSource, /tenant\.communications\.filter/);
  assert.match(accountTimelineSource, /tenant\.tasks\.filter/);
  assert.match(accountTimelineSource, /tenant\.campaigns/);
  assert.match(accountTimelineSource, /relationshipMoments\(accountDeal, contacts\)/);
  assert.match(accountTimelineSource, /gmailDormantContacts\(tenant\)/);
  assert.match(accountTimelineSource, /gmailAttentionCorrespondence\(tenant\)/);
  assert.match(accountTimelineSource, /sort\(\(a, b\) => new Date\(b\.date/);
  assert.match(app, /function normalizeSupportTickets/);
  assert.match(app, /function defaultSupportTicketsForTenant/);
  assert.match(app, /\!\["admin", "amihai", "demo"\]\.includes\(tenant\.slug\)/);
  assert.match(app, /function supportTicketRisk/);
  assert.match(app, /function accountSupportHealth/);
  assert.match(app, /Support SLA or complaint risk/);
  assert.match(renderAccountTimelineItemSource, /data-open-deal/);
  assert.match(renderAccountTimelineItemSource, /item\.section && item\.action/);
  assert.match(renderAccountTimelineItemSource, /data-section/);
  assert.match(renderAccountTimelineItemSource, /data-action="follow-up-contact"/);
  assert.match(accountCorrespondenceSource, /Escalation: angry about delays/);
  assert.match(app, /Anger detected/);
  assert.match(styles, /\.account-timeline-panel/);
  assert.match(styles, /\.timeline-item/);
  assert.match(styles, /\.timeline-risk/);
  assert.match(styles, /\.correspondence-panel/);
  assert.match(styles, /\.support-panel/);
  assert.match(styles, /\.support-ticket/);
  assert.match(styles, /\.support-ticket\.support-risk/);
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
  assert.match(app, /data = normalizeData\(\{ \.\.\.data, tenants: remote\.tenants, inviteEmails: remote\.inviteEmails, auditLogs: remote\.auditLogs \|\| \[\] \}\)/);
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

test("CRM reports provide custom dashboards and saved report templates", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderSectionSource = functionSource(app, "renderSection", "renderPageHeader");
  const renderReportsSource = functionSource(app, "renderReports", "customReportDefinitions");
  const customReportSource = functionSource(app, "customReportDefinitions", "renderSavedReportCard");
  const renderSavedReportSource = functionSource(app, "renderSavedReportCard", "reportOwnerRows");
  const ownerRowsSource = functionSource(app, "reportOwnerRows", "reportStageRows");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));

  assert.match(renderSectionSource, /ui\.section === "reports"\) return renderReports\(\)/);
  assert.match(app, /selectedReportTemplate: ""/);
  assert.match(app, /function renderReports/);
  assert.match(renderReportsSource, /Custom reporting/);
  assert.match(renderReportsSource, /savedReports\.map\(renderSavedReportCard\)/);
  assert.match(renderReportsSource, /Forecast by owner/);
  assert.match(renderReportsSource, /Stage bottlenecks/);
  assert.match(renderReportsSource, /Risk and source table/);
  assert.match(renderReportsSource, /Support health/);
  assert.match(renderReportsSource, /supportRiskTickets/);
  assert.match(renderReportsSource, /CRM \+ Gmail \+ Support/);
  assert.match(renderReportsSource, /accountsNeedingAttention\(tenant\)/);
  assert.match(renderReportsSource, /const deal = item\.primaryDeal/);
  assert.doesNotMatch(renderReportsSource, /item\.deal\./);
  assert.match(renderReportsSource, /data-open-account/);
  assert.match(customReportSource, /Monthly forecast by owner/);
  assert.match(customReportSource, /Account risk board/);
  assert.match(customReportSource, /Support SLA health/);
  assert.match(app, /function reportSupportRows/);
  assert.match(customReportSource, /Campaign impact/);
  assert.match(renderSavedReportSource, /data-action="open-report-template"/);
  assert.match(renderSavedReportSource, /data-report-name/);
  assert.match(renderSavedReportSource, /is-selected/);
  assert.match(clickHandlerSource, /action === "open-report-template"/);
  assert.match(clickHandlerSource, /ui\.selectedReportTemplate = actionElement\.dataset\.reportName/);
  assert.match(ownerRowsSource, /data\.stageProbabilities/);
  assert.match(styles, /\.report-hero/);
  assert.match(styles, /\.saved-report-card/);
  assert.match(styles, /\.saved-report-card\.is-selected/);
  assert.match(styles, /\.report-metric-row/);
  assert.match(styles, /\.report-table/);
});

test("CRM settings include Connectivity Gmail and LinkedIn controls", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const schema = fs.readFileSync(path.join(__dirname, "..", "crm", "db", "schema.sql"), "utf8");
  const linkedinSpikeSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "linkedin-puppeteer-spike.js"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const sidebarSource = functionSource(app, "renderSidebar", "sideLink");
  const topbarSource = functionSource(app, "renderTopbar", "renderSection");
  const renderSectionSource = functionSource(app, "renderSection", "renderPageHeader");
  const renderSettingsPageSource = functionSource(app, "renderSettingsPage", "renderZoomIntegrationSettings");
  const renderMailSettingsSource = functionSource(app, "renderGmailConnectivitySettings", "renderLinkedinIntegrationSettings");
  const renderLinkedinSource = functionSource(app, "renderLinkedinIntegrationSettings", "renderGmailDiscoveryPagination");
  const renderConfigurationSource = functionSource(app, "renderConfigurationSettingsPanel", "gmailIntegration");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));
  const server = serverSource();
  const summarizeLinkedinSource = server.slice(server.indexOf("function summarizeLinkedinPuppeteerResult"), server.indexOf("async function runLinkedinPuppeteerScan"));

  assert.match(sidebarSource, /connectivityNav\(\)/);
  assert.match(app, /function connectivityNav/);
  assert.match(app, /connectivityOpen: false/);
  assert.match(app, /data-action="toggle-connectivity"/);
  assert.match(app, /aria-expanded="\$\{open \? "true" : "false"\}"/);
  assert.match(app, /const open = ui\.connectivityOpen/);
  assert.match(app, /Connectivity/);
  assert.match(app, /LinkedIn/);
  assert.doesNotMatch(app, /Linked-in/);
  assert.match(app, /Zoom/);
  assert.match(app, /WeChat/);
  assert.doesNotMatch(sidebarSource, /sideLink\("templates", "✎", "Email templates"/);
  assert.match(topbarSource, /isPlatformAdmin\(\) \? "Search tenants, deals, contacts\.\.\." : "Search deals, accounts, contacts\.\.\."/);
  assert.doesNotMatch(sidebarSource, /data-action="open-settings"><span class="icon">⚙<\/span> Settings/);
  assert.match(renderSectionSource, /ui\.section === "settings"/);
  assert.match(renderSectionSource, /ui\.section === "templates"/);
  assert.match(renderSectionSource, /renderTemplatesSettingsPanel\(\)/);
  assert.match(renderSettingsPageSource, /Scan/);
  assert.doesNotMatch(renderSettingsPageSource, /data-settings-tab="gmail">Connectivity/);
  assert.match(renderSettingsPageSource, /const connectivityActive = \["gmail", "linkedin", "zoom", "wechat"\]\.includes\(ui\.settingsTab\)/);
  assert.doesNotMatch(renderSettingsPageSource, /renderConnectivitySubmenu/);
  assert.doesNotMatch(renderSettingsPageSource, /settings-subtabs/);
  assert.doesNotMatch(renderSettingsPageSource, /data-settings-tab="gmail">Gmail/);
  assert.doesNotMatch(renderSettingsPageSource, /data-settings-tab="linkedin">LinkedIn/);
  assert.doesNotMatch(renderSettingsPageSource, /data-settings-tab="zoom">Zoom/);
  assert.doesNotMatch(renderSettingsPageSource, /data-settings-tab="wechat">WeChat/);
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
  assert.doesNotMatch(app, /function renderConnectivitySubmenu/);
  assert.doesNotMatch(styles, /\.settings-subtabs/);
  assert.match(styles, /\.side-submenu/);
  assert.match(styles, /\.side-sublink/);
  assert.match(styles, /font-size: 19px/);
  assert.match(renderConfigurationSource, /data-configuration-form/);
  assert.match(renderConfigurationSource, /gmail\.inboxLookbackDays/);
  assert.match(renderConfigurationSource, /gmailLookbackDays/);
  assert.match(renderConfigurationSource, /Identify no communication in months:/);
  assert.match(renderConfigurationSource, /name="staleMonths"/);
  assert.match(renderConfigurationSource, /security\.mfaRequired/);
  assert.match(renderConfigurationSource, /name="mfaRequired"/);
  assert.match(renderConfigurationSource, /Require users to configure and use an authenticator app/);
  assert.match(renderMailSettingsSource, /data-gmail-settings-form/);
  assert.match(renderMailSettingsSource, /<h3>Gmail<\/h3>/);
  assert.doesNotMatch(renderMailSettingsSource, /formField\("Gmail account", "accountEmail"/);
  assert.doesNotMatch(renderMailSettingsSource, /formField\("Google Workspace domain", "workspaceDomain"/);
  assert.match(renderMailSettingsSource, /Connected mailbox:/);
  assert.match(renderMailSettingsSource, /choose the Gmail account in Google/);
  assert.doesNotMatch(renderMailSettingsSource, /gmailClientIdDiagnostic/);
  assert.doesNotMatch(renderMailSettingsSource, /gmail-diagnostic/);
  assert.match(renderMailSettingsSource, /ui\.gmailNotice/);
  assert.match(renderMailSettingsSource, /gmail-notice/);
  assert.doesNotMatch(renderMailSettingsSource, /data-action="open-gmail-oauth-guide"/);
  assert.doesNotMatch(renderMailSettingsSource, /Show me now/);
  assert.match(renderMailSettingsSource, /canUseGmailBackend/);
  assert.match(renderMailSettingsSource, /Gmail connection requires signing in to a workspace at \/crm\./);
  assert.match(renderMailSettingsSource, /data-action="connect-gmail" \$\{actionDisabled\}/);
  assert.match(renderMailSettingsSource, /gmail-primary-actions/);
  assert.match(renderMailSettingsSource, /gmail-save-actions/);
  assert.match(styles, /\.gmail-primary-actions \{ justify-content: flex-start; \}/);
  assert.match(renderMailSettingsSource, /Gmail folders to scan/);
  assert.doesNotMatch(renderMailSettingsSource, /Labels to read/);
  assert.ok(renderMailSettingsSource.indexOf('data-action="connect-gmail"') < renderMailSettingsSource.indexOf('formField("Gmail folders to scan"'));
  assert.ok(renderMailSettingsSource.indexOf("New-contact discovery scans") < renderMailSettingsSource.indexOf("gmail-save-actions"));
  assert.doesNotMatch(renderMailSettingsSource, /OAuth client ID/);
  assert.doesNotMatch(renderMailSettingsSource, /Authorized redirect URI/);
  assert.match(renderMailSettingsSource, /No mailbox password or OAuth client setup is required/);
  assert.doesNotMatch(renderMailSettingsSource, /No-mail threshold in months/);
  assert.doesNotMatch(renderMailSettingsSource, /name="staleMonths"/);
  assert.match(renderMailSettingsSource, /Identify new contacts from Gmail/);
  assert.match(renderMailSettingsSource, /last \$\{gmailLookbackDays\} days/);
  assert.match(renderMailSettingsSource, /filters out contacts already in CRM/);
  assert.match(renderMailSettingsSource, /Find contacts with no sent mail/);
  assert.match(renderMailSettingsSource, /Uses the no-communication threshold from Configuration/);
  assert.match(renderLinkedinSource, /data-linkedin-settings-form/);
  assert.match(renderLinkedinSource, /<h3>LinkedIn<\/h3>/);
  assert.match(renderLinkedinSource, /never asks for or stores a LinkedIn password/);
  assert.match(renderLinkedinSource, /No LinkedIn password is stored in the CRM/);
  assert.match(renderLinkedinSource, /Connection status/);
  assert.match(renderLinkedinSource, /hosted provider flow/);
  assert.match(renderLinkedinSource, /data-action="connect-linkedin"/);
  assert.match(renderLinkedinSource, /Connect LinkedIn/);
  assert.match(renderLinkedinSource, /data-action="reconcile-linkedin"/);
  assert.match(renderLinkedinSource, /Finalize connection/);
  assert.match(renderLinkedinSource, /data-action="sync-linkedin"/);
  assert.match(renderLinkedinSource, /Scan messages/);
  assert.match(renderLinkedinSource, /providerAccountId/);
  assert.match(renderLinkedinSource, /provider messaging API and webhooks/);
  assert.match(renderLinkedinSource, /Messages needing account match/);
  assert.match(renderLinkedinSource, /Scan completed/);
  assert.match(renderLinkedinSource, /Automated updates ignored/);
  assert.match(renderLinkedinSource, /LinkedIn scan results/);
  assert.match(renderLinkedinSource, /Contacts and messages found in LinkedIn/);
  assert.match(renderLinkedinSource, /0 new messages still gives visible feedback/);
  assert.match(renderLinkedinSource, /data-linkedin-message-id/);
  assert.match(renderLinkedinSource, /data-open-communication/);
  assert.match(renderLinkedinSource, /linkedinScannedMessages\(tenant\)/);
  assert.match(renderLinkedinSource, /unmatchedCount/);
  assert.match(renderLinkedinSource, /ignoredCount/);
  assert.doesNotMatch(renderLinkedinSource, /data-action="authorize-linkedin-session"/);
  assert.doesNotMatch(renderLinkedinSource, /Start LinkedIn login/);
  assert.doesNotMatch(renderLinkedinSource, /data-action="open-linkedin-login-tab"/);
  assert.doesNotMatch(renderLinkedinSource, /Open login tab/);
  assert.doesNotMatch(renderLinkedinSource, /data-action="verify-linkedin-session"/);
  assert.doesNotMatch(renderLinkedinSource, /I finished login/);
  assert.doesNotMatch(renderLinkedinSource, /Temporary LinkedIn login is running/);
  assert.doesNotMatch(renderLinkedinSource, /Run this tunnel in Terminal/);
  assert.doesNotMatch(renderLinkedinSource, /LinkedIn company page/);
  assert.match(renderLinkedinSource, /LinkedIn account email/);
  assert.doesNotMatch(renderLinkedinSource, /data-action="open-linkedin-company"/);
  assert.doesNotMatch(renderLinkedinSource, /data-action="open-linkedin-inbox"/);
  assert.doesNotMatch(renderLinkedinSource, /name="(?:password|token|cookie|sessionCookie|liAt)"/i);
  assert.doesNotMatch(renderLinkedinSource, /type="password"/i);
  assert.doesNotMatch(renderLinkedinSource, /data-action="scan-linkedin"/);
  assert.doesNotMatch(renderLinkedinSource, /LINKEDIN_PUPPETEER_ENABLED=1/);
  assert.doesNotMatch(renderLinkedinSource, /LINKEDIN_CHROME_PROFILE/);
  assert.match(renderLinkedinSource, /linkedin\.lastScanResult\?\.messageCount/);
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
  assert.match(app, /saveLinkedinSettingsViaApi/);
  assert.match(app, /connectLinkedinViaApi/);
  assert.match(app, /reconcileLinkedinViaApi/);
  assert.match(app, /function finalizeLinkedinConnection/);
  assert.match(app, /ui\.linkedinReturnPending/);
  assert.match(app, /syncLinkedinViaApi/);
  assert.match(app, /params\.get\("linkedin"\) === "connected"/);
  assert.match(app, /function linkedinIntegration/);
  assert.match(app, /function linkedinScannedMessages/);
  assert.match(app, /item\.source === "linkedin"/);
  assert.match(app, /lastScanResult\?\.communicationIds/);
  assert.match(app, /Needs account match/);
  assert.match(app, /settingsTab: "gmail"/);
  assert.match(app, /settingsTab === "mail" \? "gmail" : settingsTab/);
  assert.match(app, /mfaRequired = values\.mfaRequired === "on"/);
  assert.match(app, /staleMonths = Math\.max\(1, Math\.min\(36/);
  assert.match(app, /tenantSettings\?\.mfaRequired/);
  assert.match(app, /saveWorkflowAutomationViaApi/);
  assert.match(app, /connectGmailViaApi/);
  assert.match(app, /returnOrigin: window\.location\.origin/);
  assert.match(app, /scanGmailViaApi/);
  assert.match(server, /GMAIL_NEW_CONTACT_LOOKBACK_DAYS = 30/);
  assert.match(app, /DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS = 30/);
  assert.match(server, /gmail_lookback_days/);
  assert.match(server, /linkedin_integrations/);
  assert.match(server, /UNIPILE_DSN/);
  assert.match(server, /UNIPILE_API_KEY/);
  assert.match(server, /function unipileConfigured/);
  assert.match(server, /function requireUnipileWebhookSecret/);
  assert.match(server, /timingSafeEqual/);
  assert.match(server, /async function createLinkedinHostedAuthLink/);
  assert.match(server, /\/api\/v1\/hosted\/accounts\/link/);
  assert.match(server, /notify_url/);
  assert.match(server, /async function reconcileLinkedinProviderAccount/);
  assert.match(server, /\/api\/v1\/accounts/);
  assert.match(server, /if \(integration\?\.provider_account_id\) \{\s*return linkedinIntegrationFromRow\(integration\);/s);
  assert.match(server, /function unipileAccountCreatedAt/);
  assert.match(server, /createdAfterConnect/);
  assert.match(server, /10 \* 60 \* 1000/);
  assert.match(server, /canBindNewest/);
  assert.match(server, /const canBindNewest = !integration\?\.provider_account_id/);
  assert.match(server, /newestAccount/);
  assert.match(server, /Provider returned \$\{allAccounts\.length\} accounts/);
  assert.match(server, /async function syncLinkedinMessages/);
  assert.match(server, /\/api\/v1\/messages\?account_id=/);
  assert.match(server, /async function saveLinkedinMessages/);
  assert.match(server, /on conflict \(tenant_id, source, provider_message_id\).*do nothing/s);
  assert.match(server, /updatedCount: counts\.updated/);
  assert.match(server, /unmatchedCount: counts\.unmatched/);
  assert.match(server, /ignoredCount: counts\.ignored/);
  assert.match(server, /communicationIds: counts\.communicationIds\.slice\(0, 50\)/);
  assert.match(server, /communicationIds\.push\(saved\.rows\[0\]\.id\)/);
  assert.match(server, /function shouldIgnoreLinkedinMessage/);
  assert.match(server, /message\.attendeeType === "ORGANIZATION"/);
  assert.match(server, /watch on demand/);
  assert.match(server, /LinkedIn import needs account match/);
  assert.match(server, /pathname === "\/api\/linkedin\/unipile\/callback"/);
  assert.match(server, /const tenantId = verifyLinkedinHostedAuthName\(payload\.name\)\.tenantId/);
  const callbackRouteSource = server.slice(server.indexOf('pathname === "/api/linkedin/unipile/callback"'), server.indexOf('pathname === "/api/linkedin/unipile/messages"'));
  assert.doesNotMatch(callbackRouteSource, /requireUnipileWebhookSecret/);
  assert.doesNotMatch(server, /payload\.tenant_id \|\| payload\.tenantId/);
  assert.match(server, /pathname === "\/api\/linkedin\/unipile\/messages"/);
  assert.match(server, /pathname\.endsWith\("\/linkedin\/reconcile"\)/);
  assert.match(server, /pathname\.endsWith\("\/linkedin\/connect"\)/);
  assert.match(server, /pathname\.endsWith\("\/linkedin\/sync"\)/);
  assert.match(server, /operation: "connect-linkedin"/);
  assert.match(server, /operation: "sync-linkedin"/);
  assert.match(server, /function normalizeLinkedinSettings/);
  assert.match(server, /operation: "update-linkedin-settings"/);
  assert.match(schema, /create table linkedin_integrations/);
  assert.match(schema, /provider text not null default 'unipile'/);
  assert.match(schema, /provider_account_id text/);
  assert.match(schema, /provider_status text/);
  assert.match(schema, /session_status text not null default 'not_configured'/);
  assert.match(schema, /authorized_at timestamptz/);
  assert.match(schema, /last_sync_at timestamptz/);
  assert.match(schema, /last_scan_result jsonb/);
  assert.match(schema, /provider_message_id text/);
  assert.match(schema, /provider_thread_id text/);
  assert.match(schema, /communications_tenant_source_provider_message_idx/);
  assert.doesNotMatch(schema, /linkedin_.*(password|token|cookie)|password.*linkedin|token.*linkedin|cookie.*linkedin/i);
  assert.match(schema, /gmail_lookback_days/);
  assert.match(server, /update tenants set mfa_required=\$2/);
  assert.match(server, /update users set mfa_enabled=\$2 where tenant_id=\$1 and role <> 'platform_admin'/);
  assert.match(server, /GMAIL_NEW_CONTACT_METADATA_LIMIT = 1000/);
  assert.match(server, /GMAIL_NEW_CONTACT_FULL_LIMIT = 250/);
  assert.match(server, /GMAIL_NEW_CONTACT_SIGNAL_LIMIT = 250/);
  assert.match(server, /listGmailMessages/);
  assert.match(server, /gmailNewContactScope\(integration\.labels\)/);
  assert.match(server, /newer_than:\$\{gmailLookbackDays\}d/);
  assert.match(server, /format: "metadata"/);
  assert.match(server, /inboundMetadata\.slice\(0, GMAIL_NEW_CONTACT_FULL_LIMIT\)/);
  assert.match(server, /GMAIL_ATTENTION_SIGNAL_LIMIT = 100/);
  assert.match(server, /format: "full"/);
  assert.match(server, /Skipping Gmail full message/);
  assert.match(server, /Skipping Gmail dormant check/);
  assert.match(server, /add column if not exists phone text/);
  assert.match(server, /gmail_contact_blacklist/);
  assert.match(server, /scanProgressById/);
  assert.match(app, /handleGmailCallbackQuery/);
  assert.match(app, /Gmail connected\. Refreshing integration status/);
  assert.match(app, /setGmailStatus\("Saving Gmail settings\.\.\."/);
  assert.match(app, /body\.error === "Unable to scan Gmail\." && body\.detail/);
  assert.match(app, /body\.error === "Unable to scan LinkedIn\." && body\.detail/);
  assert.match(app, /Preparing Google authorization/);
  assert.match(app, /Redirecting to Google authorization/);
  assert.match(app, /Scanning Gmail\.\.\./);
  assert.match(app, /\}, 2000\);/);
  assert.match(app, /role="progressbar"/);
  assert.match(app, /gmail-progress-bar/);
  assert.doesNotMatch(app, /Updating every 2 seconds while the scan runs\./);
  assert.match(app, /if \(result\.warning\) showToast\(result\.warning\)/);
  assert.match(app, /Automation created \$\{Number\(result\.automationSummary\.tasksCreated/);
  assert.match(app, /await loadStateFromApi\(\)/);
  assert.match(app, /Gmail settings saved\./);
  assert.doesNotMatch(app, /renderGmailOAuthGuide/);
  assert.doesNotMatch(app, /ui\.modal === "gmail-oauth-guide"/);
  assert.doesNotMatch(app, /Google Cloud Console/);
  assert.match(server, /clientId: normalizeOAuthClientId\(payload\.clientId \|\| googleClientId\)/);
  assert.match(server, /clientId: googleClientId/);
  assert.match(server, /function safeGmailReturnOrigin/);
  assert.match(server, /returnOrigin: body\.returnOrigin \|\| req\.headers\.origin \|\| req\.headers\.referer/);
  assert.match(server, /safeGmailReturnOrigin\(state\.returnOrigin\).*\/crm\/\?gmail=connected/);
  assert.doesNotMatch(server, /does not match \$\{integration\.account_email/);
  assert.match(server, /Google did not return the connected Gmail account/);
  assert.match(server, /account_email=\$5, workspace_domain=\$6/);
  assert.match(server, /Gmail scan completed but workflow automation failed/);
  assert.match(server, /Gmail scan completed but response hydration failed/);
  assert.match(server, /Last scan completed\. Refresh to load the latest Gmail signals\./);
  assert.match(clickHandlerSource, /data-settings-tab/);
  assert.match(clickHandlerSource, /action === "connect-gmail"/);
  assert.match(clickHandlerSource, /action === "connect-linkedin"/);
  assert.match(clickHandlerSource, /connectLinkedinViaApi\(tenant\.id\)/);
  assert.match(clickHandlerSource, /window\.location\.href = result\.authUrl/);
  assert.match(clickHandlerSource, /action === "reconcile-linkedin"/);
  assert.match(clickHandlerSource, /finalizeLinkedinConnection\(\)/);
  assert.match(clickHandlerSource, /action === "sync-linkedin" \|\| action === "scan-linkedin"/);
  assert.match(clickHandlerSource, /syncLinkedinViaApi\(tenant\.id, \{ limit: 50 \}\)/);
  assert.match(clickHandlerSource, /LinkedIn scan completed/);
  assert.match(clickHandlerSource, /ignoredCount/);
  assert.match(clickHandlerSource, /await loadStateFromApi\(\)/);
  assert.match(clickHandlerSource, /ui\.settingsTab = "linkedin"/);
  assert.doesNotMatch(clickHandlerSource, /action === "authorize-linkedin-session"/);
  assert.doesNotMatch(clickHandlerSource, /Temporary LinkedIn login started/);
  assert.doesNotMatch(clickHandlerSource, /action === "open-linkedin-login-tab"/);
  assert.doesNotMatch(clickHandlerSource, /json\\\/list/);
  assert.doesNotMatch(clickHandlerSource, /window\.open\(ui\.linkedinLogin\.localDebugUrl/);
  assert.doesNotMatch(clickHandlerSource, /action === "verify-linkedin-session"/);
  assert.doesNotMatch(app, /profilePath:/);
  assert.match(clickHandlerSource, /action === "toggle-connectivity"/);
  assert.match(clickHandlerSource, /ui\.connectivityOpen = ui\.section === "settings" \? !ui\.connectivityOpen : true/);
  assert.match(clickHandlerSource, /ui\.settingsTab = "gmail"/);
  assert.doesNotMatch(clickHandlerSource, /action === "open-linkedin-company"/);
  assert.doesNotMatch(clickHandlerSource, /action === "open-linkedin-inbox"/);
  assert.doesNotMatch(clickHandlerSource, /scanLinkedinViaApi\(tenant\.id, \{ limit: 10 \}\)/);
  assert.match(clickHandlerSource, /action === "scan-gmail"/);
  assert.match(clickHandlerSource, /action === "skip-gmail-contact"/);
  assert.match(clickHandlerSource, /action === "add-gmail-contact"/);
  assert.match(submitHandlerSource, /data-gmail-settings-form/);
  assert.match(submitHandlerSource, /saveGmailSettingsViaApi\(tenant\.id, gmailFormValues\(event\.target\)\)/);
  assert.match(submitHandlerSource, /data-linkedin-settings-form/);
  assert.match(submitHandlerSource, /saveLinkedinSettingsViaApi\(tenant\.id, values\)/);
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
  const styles = crmStylesSource();
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
  assert.match(app, /function renderWorkflowRuleCard/);
  assert.match(app, /class="workflow-builder"/);
  assert.match(app, /Negative wording detected/);
  assert.match(app, /No sent email in threshold/);
  assert.match(app, /Account risk is visible/);
  assert.match(app, /workflow-connector/);
  assert.match(app, /Run automation after Gmail scan/);
  assert.match(app, /Mark risky accounts/);
  assert.match(app, /Tasks created/);
  assert.match(app, /workflowAutomationFormValues/);
  assert.match(app, /name="\$\{fieldName\}"/);
  assert.match(app, /aria-label="\$\{escapeHtml\(action\)\}" required/);
  assert.match(app, /attentionDueDays/);
  assert.match(app, /dormantDueDays/);
  assert.match(app, /values\.attentionDueDays === "" \? defaultWorkflowAutomation\.attentionDueDays/);
  assert.match(app, /values\.dormantDueDays === "" \? defaultWorkflowAutomation\.dormantDueDays/);
  assert.match(styles, /\.workflow-builder/);
  assert.match(styles, /\.workflow-rule-card/);
  assert.match(styles, /\.workflow-connector/);
  assert.match(styles, /\.workflow-action/);
});

test("CRM outgoing email settings and send email flow are wired to SMTP API", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const server = serverSource();
  const renderSettingsPageSource = functionSource(app, "renderSettingsPage", "renderTemplatesSettingsPanel");
  const renderOutgoingSource = functionSource(app, "renderOutgoingEmailSettingsPanel", "renderGmailConnectivitySettings");
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
  assert.match(server, /tracking_status, source, occurred_at/);
  assert.match(server, /Sent via SMTP/);
  assert.match(styles, /\.modal\.email-modal/);
});

test("CRM mail templates can be managed and selected from follow-up email", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderTemplatesSource = functionSource(app, "renderTemplatesSettingsPanel", "renderTemplateForm");
  const renderTemplateFormSource = functionSource(app, "renderTemplateForm", "renderOutgoingEmailSettingsPanel");
  const renderMailSettingsSource = functionSource(app, "renderGmailConnectivitySettings", "renderLinkedinIntegrationSettings");
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
  const renderMailSettingsSource = functionSource(app, "renderGmailConnectivitySettings", "renderLinkedinIntegrationSettings");
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
  const renderPageHeaderSource = functionSource(app, "renderPageHeader", "renderAdmin");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const loginHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(app, /WHATS_NEW_VERSION/);
  assert.match(app, /crm-build-order-2026-06-19/);
  assert.match(app, /maybeShowWhatsNew/);
  assert.match(renderModalSource, /ui\.modal === "whats-new"/);
  assert.match(renderWhatsNewSource, /Account intelligence release/);
  assert.match(renderWhatsNewSource, /Account timeline/);
  assert.match(renderWhatsNewSource, /Email tracking/);
  assert.match(renderWhatsNewSource, /Workflow builder/);
  assert.match(renderWhatsNewSource, /Custom reports/);
  assert.match(renderWhatsNewSource, /Support context/);
  assert.match(renderWhatsNewSource, /Online guide/);
  assert.match(renderWhatsNewSource, /whats-new-window-bar/);
  assert.match(renderWhatsNewSource, /whats-new-frame/);
  assert.match(renderWhatsNewSource, /data-action="close-whats-new"/);
  assert.match(renderWhatsNewSource, /Open user guide/);
  assert.match(renderPageHeaderSource, /data-action="open-whats-new"/);
  assert.match(renderPageHeaderSource, /aria-label="Open what's new"/);
  assert.match(renderPageHeaderSource, /class="page-actions"/);
  assert.match(clickHandlerSource, /action === "open-whats-new"/);
  assert.match(loginHandlerSource, /maybeShowWhatsNew\(\)/);
  assert.match(styles, /\.whats-new-modal/);
  assert.match(styles, /\.whats-new-button/);
  assert.match(styles, /\.page-actions \{ display: flex; align-items: center; gap: 8px; \}/);
  assert.match(styles, /\.whats-new-window-bar/);
  assert.match(styles, /\.whats-new-frame/);
  assert.match(styles, /\.whats-new-hero/);
});

test("CRM page headers expose contextual online help", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderPageHeaderSource = functionSource(app, "renderPageHeader", "renderAdmin");
  const renderModalSource = functionSource(app, "renderModal", "renderTagDialog");
  const helpContentSource = functionSource(app, "helpContent", "renderHelpDialog");
  const renderHelpSource = functionSource(app, "renderHelpDialog", "renderTenantForm");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));

  assert.match(app, /function helpTopicForSection/);
  assert.match(renderPageHeaderSource, /data-action="open-help"/);
  assert.match(renderPageHeaderSource, /data-help-topic/);
  assert.match(renderPageHeaderSource, /aria-label="Open help"/);
  assert.match(renderModalSource, /ui\.modal === "help"/);
  assert.match(helpContentSource, /Home guide/);
  assert.match(helpContentSource, /Accounts guide/);
  assert.match(helpContentSource, /Reports guide/);
  assert.match(helpContentSource, /Connectivity guide/);
  assert.match(renderHelpSource, /Online user guide/);
  assert.match(renderHelpSource, /help-guide-index/);
  assert.match(clickHandlerSource, /action === "open-help"/);
  assert.match(clickHandlerSource, /if \(ui\.modal === "whats-new"\) dismissWhatsNew\(\)/);
  assert.match(clickHandlerSource, /ui\.helpTopic = actionElement\.dataset\.helpTopic/);
  assert.match(styles, /\.help-button/);
  assert.match(styles, /\.modal\.help-modal/);
  assert.match(styles, /\.help-guide/);
  assert.match(styles, /\.help-guide-index/);
});

test("CRM clears stale local sessions with clear sign-in guidance", () => {
  const app = crmAppSource();
  const loadSessionSource = functionSource(app, "loadSession", "saveData");
  const apiRequestSource = functionSource(app, "apiRequest", "loadStateFromApi");

  assert.match(app, /location\.hostname === "www\.zeptrix\.io"/);
  assert.match(app, /location\.replace\(`https:\/\/zeptrix\.io\$\{location\.pathname\}\$\{location\.search\}\$\{location\.hash\}`\)/);
  assert.match(app, /const IS_CANONICAL_REDIRECT = !IS_DEMO_ROUTE && location\.hostname === "www\.zeptrix\.io"/);
  assert.match(app, /if \(!IS_CANONICAL_REDIRECT\) \{\s*handleGmailCallbackQuery\(\);\s*loadStateFromApi\(\);/);
  assert.match(app, /if \(!IS_CANONICAL_REDIRECT\) \{\s*consumeGoogleAuthRedirect\(\)\.finally\(\(\) => render\(\)\);/);
  assert.match(loadSessionSource, /storedSession\.role !== "demo_user" && !storedSession\.apiToken/);
  assert.match(apiRequestSource, /response\.status === 401/);
  assert.match(apiRequestSource, /Please sign in again to continue/);
  assert.match(apiRequestSource, /session = null/);
  assert.match(apiRequestSource, /ui\.authStep = "password"/);
  assert.doesNotMatch(apiRequestSource, /Your CRM session is not available in this browser tab/);
  assert.doesNotMatch(apiRequestSource, /belongs to another browser domain/);
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
  assert.match(app, /Zendesk\/Freshdesk/);
  assert.match(app, /support tickets, SLA risk, and sentiment signals/);
  assert.match(app, /Support health/);
});
