const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { decryptToken, duplicateTenantEmailMessage, encryptToken, gmailAuthUrl, gmailLabelQuery, inviteEmailContent, normalizeGmailSettings, normalizeTenantPayload, parseEmailAddress, signAuthToken, smtpInviteMessage, staticFilePathForUrlPath, updateTenantWithClient, verifySignedPayload } = require("../server");

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

  const encrypted = encryptToken("refresh-token-value");
  assert.notEqual(encrypted, "refresh-token-value");
  assert.equal(decryptToken(encrypted), "refresh-token-value");
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
  assert.match(app, /"settings"\]\.includes\(CRM_NAMED_ROUTE_MATCH\[1\]\)/);
  assert.ok(app.includes("const DEMO_ROUTE_MATCH = location.pathname.match(/^\\/crm\\/demo(?:\\/([^/]+))?\\/?$/) || (!CRM_SECTION_ROUTE ? CRM_NAMED_ROUTE_MATCH : null);"));
  assert.match(app, /section: CRM_SECTION_ROUTE \|\| "admin"/);
  assert.match(app, /function ensureClientDemoTenant/);
  assert.match(app, /name: "CRM Demo"/);
  assert.match(app, /tenantId: demoTenant\?\.id \|\| "demo"/);
});

test("CRM home keeps attention correspondence and relationship event panels", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const renderHomeSource = functionSource(app, "renderHome", "homeCorrespondenceNeedingAttention");
  const homeAttentionSource = functionSource(app, "homeCorrespondenceNeedingAttention", "renderHomeAttentionThread");
  const renderHomeEventSource = functionSource(app, "renderHomeEvent", "birthdayDate");

  assert.match(renderHomeSource, /Accounts that need attention/);
  assert.match(renderHomeSource, /Today's focus/);
  assert.match(renderHomeSource, /Correspondence needing attention/);
  assert.match(renderHomeSource, /Relationship events/);
  assert.match(renderHomeSource, /jump-home-risk-thread/);
  assert.match(renderHomeSource, /<article class="widget"><div class="panel-head"><h3>Correspondence needing attention/);
  assert.match(homeAttentionSource, /sort\(\(a, b\) => Number\(b\.risk\) - Number\(a\.risk\)\)\.slice\(0, 3\)/);
  assert.match(renderHomeEventSource, /class="event-account" data-open-account/);
  assert.match(styles, /\.home-thread-list \{\s+display: grid;\s+grid-template-columns: minmax\(0, 1fr\);/);
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
  const renderAccountsSource = functionSource(app, "renderAccounts", "renderAccountDetail");
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
  const renderInlineContactRowSource = functionSource(app, "renderInlineContactRow", "filteredContacts");
  const renderModalSource = functionSource(app, "renderModal", "renderTenantForm");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(renderContactsSource, /data-action="add-contact"/);
  assert.match(renderContactsSource, /ui\.inlineContactOpen \? renderInlineContactRow\(\) : ""/);
  assert.doesNotMatch(renderContactsSource, /data-action="add-deal">＋ Add contact/);
  assert.doesNotMatch(renderModalSource, /ui\.modal === "contact"/);
  assert.doesNotMatch(app, /data-contact-form/);
  assert.match(renderInlineContactRowSource, /data-inline-contact-form/);
  assert.match(renderInlineContactRowSource, /inline-contact-row/);
  assert.match(renderInlineContactRowSource, /Contact name/);
  assert.match(renderInlineContactRowSource, /Save/);
  assert.match(clickHandlerSource, /action === "add-contact"/);
  assert.match(clickHandlerSource, /ui\.inlineContactOpen = true/);
  assert.match(clickHandlerSource, /action === "cancel-inline-add"/);
  assert.doesNotMatch(clickHandlerSource, /ui\.modal = "contact"/);
  assert.match(submitHandlerSource, /data-inline-contact-form/);
  assert.match(submitHandlerSource, /Contact added directly from Contacts/);
  assert.match(submitHandlerSource, /ui\.inlineContactOpen = false/);
  assert.match(styles, /\.inline-contact-row/);
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
  assert.match(submitHandlerSource, /Deal added inline from the pipeline/);
  assert.match(submitHandlerSource, /ui\.inlineDealGroup = null/);
  assert.match(styles, /\.inline-add-form/);
  assert.match(styles, /\.inline-deal-row td/);
});

test("CRM campaigns support account tags, audience targeting, and merge tokens", () => {
  const app = crmAppSource();
  const styles = crmStylesSource();
  const sidebarSource = functionSource(app, "renderSidebar", "sideLink");
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
  const renderSectionSource = functionSource(app, "renderSection", "renderPageHeader");
  const renderSettingsPageSource = functionSource(app, "renderSettingsPage", "renderMailIntegrationsSettings");
  const renderMailSettingsSource = functionSource(app, "renderMailIntegrationsSettings", "renderWorkspaceSettingsPanel");
  const clickHandlerSource = app.slice(app.indexOf("document.addEventListener(\"click\""), app.indexOf("document.addEventListener(\"input\""));
  const submitHandlerSource = app.slice(app.indexOf("document.addEventListener(\"submit\""), app.indexOf("document.addEventListener(\"dragstart\""));

  assert.match(sidebarSource, /sideLink\("settings", "⚙", "Settings"\)/);
  assert.doesNotMatch(sidebarSource, /data-action="open-settings"><span class="icon">⚙<\/span> Settings/);
  assert.match(renderSectionSource, /ui\.section === "settings"/);
  assert.match(renderSettingsPageSource, /Mail integrations/);
  assert.match(renderSettingsPageSource, /data-settings-tab="mail"/);
  assert.match(renderMailSettingsSource, /data-gmail-settings-form/);
  assert.match(renderMailSettingsSource, /formField\("Gmail account", "accountEmail", gmail\.accountEmail, "email", true\)/);
  assert.match(renderMailSettingsSource, /gmailClientIdDiagnostic\(gmail\.clientId\)/);
  assert.match(renderMailSettingsSource, /gmail-diagnostic/);
  assert.match(renderMailSettingsSource, /ui\.gmailNotice/);
  assert.match(renderMailSettingsSource, /canUseGmailBackend/);
  assert.match(renderMailSettingsSource, /Gmail connection requires signing in to a workspace at \/crm\./);
  assert.match(renderMailSettingsSource, /data-action="connect-gmail" \$\{actionDisabled\}/);
  assert.match(renderMailSettingsSource, /OAuth client ID/);
  assert.match(renderMailSettingsSource, /Authorized redirect URI/);
  assert.match(renderMailSettingsSource, /No-mail threshold in months/);
  assert.match(renderMailSettingsSource, /Identify new contacts from Gmail/);
  assert.match(renderMailSettingsSource, /Find contacts with no sent mail/);
  assert.match(renderMailSettingsSource, /gmail\.readonly/);
  assert.match(app, /staleMonths: 3/);
  assert.match(app, /gmailContactDiscoveries/);
  assert.match(app, /gmailDormantContacts/);
  assert.match(app, /if \(gmail\.lastScanAt\) return \[\]/);
  assert.match(app, /saveGmailSettingsViaApi/);
  assert.match(app, /connectGmailViaApi/);
  assert.match(app, /scanGmailViaApi/);
  assert.match(app, /handleGmailCallbackQuery/);
  assert.match(app, /Gmail connected\. Refreshing integration status/);
  assert.match(app, /setGmailStatus\("Saving Gmail settings\.\.\."/);
  assert.match(app, /Preparing Google authorization/);
  assert.match(app, /Redirecting to Google authorization/);
  assert.match(app, /Scanning Gmail\.\.\./);
  assert.match(app, /Gmail settings saved\./);
  assert.match(serverSource(), /if \(!integration\.account_email \|\| profile\.emailAddress\?\.toLowerCase\(\) !== String\(integration\.account_email\)\.toLowerCase\(\)\)/);
  assert.match(clickHandlerSource, /data-settings-tab/);
  assert.match(clickHandlerSource, /action === "connect-gmail"/);
  assert.match(clickHandlerSource, /action === "scan-gmail"/);
  assert.match(clickHandlerSource, /action === "add-gmail-contact"/);
  assert.match(submitHandlerSource, /data-gmail-settings-form/);
  assert.match(submitHandlerSource, /saveGmailSettingsViaApi\(tenant\.id, gmailFormValues\(event\.target\)\)/);
  assert.match(styles, /\.settings-tabs/);
  assert.match(styles, /\.settings-layout/);
  assert.match(styles, /\.signal-row/);
  assert.match(styles, /\.gmail-diagnostic code/);
});

test("CRM clears stale sessions without API tokens before protected calls", () => {
  const app = crmAppSource();
  const loadSessionSource = functionSource(app, "loadSession", "saveData");
  const apiRequestSource = functionSource(app, "apiRequest", "loadStateFromApi");

  assert.match(loadSessionSource, /storedSession\.role !== "demo_user" && !storedSession\.apiToken/);
  assert.match(apiRequestSource, /response\.status === 401/);
  assert.match(apiRequestSource, /Please sign in again to continue/);
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
  assert.match(changeHandlerSource, /prompt\("New account tag"\)/);
  assert.match(submitHandlerSource, /data-campaign-form/);
  assert.match(submitHandlerSource, /const campaigns = tenant\.campaigns \|\| \[\]/);
  assert.match(submitHandlerSource, /campaigns: \[campaign, \.\.\.campaigns\]/);
  assert.match(submitHandlerSource, /status: "Draft"/);
  assert.match(submitHandlerSource, /recurrence: "one-time"/);
  assert.match(submitHandlerSource, /campaigns: tenant\.campaigns/);
});
