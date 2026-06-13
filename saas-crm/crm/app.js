const STORAGE_KEY = "zeptrix-saas-crm-v1";
const SESSION_KEY = "zeptrix-saas-session-v1";
const MFA_CODE = "123456";
const SEED_ADMIN_TEMP_PASSWORD = "Tmp-Admin-7394!";
const SEED_AMIHAI_TEMP_PASSWORD = "Tmp-Amihai-5821!";
const DEMO_ROUTE_MATCH = location.pathname.match(/^\/crm\/demo(?:\/([^/]+))?\/?$/);
const IS_DEMO_ROUTE = !!DEMO_ROUTE_MATCH;
const DEMO_USER_NAME = DEMO_ROUTE_MATCH?.[1] ? titleCase(DEMO_ROUTE_MATCH[1]) : "Demo User";

const stages = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const stageClass = {
  Lead: "stage-lead",
  Qualified: "stage-qualified",
  Proposal: "stage-proposal",
  Negotiation: "stage-negotiation",
  Won: "stage-won",
  Lost: "stage-lost",
};
const owners = {
  "Noa Levi": ["NL", "#7961d9"],
  "Daniel Cohen": ["DC", "#de7657"],
  "Maya Bar": ["MB", "#398bbc"],
  "Avi Stein": ["AS", "#22a27b"],
  "Amihai Cohen": ["AC", "#24a978"],
};

const tenantSeed = [
  {
    id: "admin",
    name: "Zeptrix Admin",
    slug: "admin",
    plan: "Enterprise",
    status: "Active",
    region: "US-East",
    seats: 8,
    billingEmail: "billing@zeptrix.io",
    users: [
      { id: "admin-owner", name: "Platform Admin", email: "admin@zeptrix.io", password: SEED_ADMIN_TEMP_PASSWORD, mustChangePassword: true, role: "platform_admin", mfa: true, sso: true },
    ],
    deals: [
      { id: 1, name: "Enterprise rollout", account: "Orbital Systems", contact: "Liam Brooks", email: "liam@orbitalsystems.com", owner: "Noa Levi", stage: "Negotiation", value: 72000, close: "2026-06-18", priority: "High", group: "active", note: "Security review complete. Waiting on procurement.", updated: "Today, 09:42" },
      { id: 2, name: "Q3 expansion plan", account: "Nimbus Labs", contact: "Sophie Green", email: "sophie@nimbuslabs.io", owner: "Daniel Cohen", stage: "Proposal", value: 48500, close: "2026-06-30", priority: "Medium", group: "active", note: "Proposal shared after product workshop.", updated: "Yesterday" },
      { id: 3, name: "Operations package", account: "Acme Studios", contact: "Ethan Hall", email: "ethan@acmestudios.co", owner: "Maya Bar", stage: "Qualified", value: 24000, close: "2026-07-11", priority: "Medium", group: "active", note: "Needs a migration timeline.", updated: "May 29" },
      { id: 4, name: "Global account migration", account: "Atlas Freight", contact: "Lucas Martin", email: "lucas@atlasfreight.com", owner: "Avi Stein", stage: "Won", value: 96000, close: "2026-05-24", priority: "High", group: "closed", note: "Closed after successful pilot.", updated: "May 24" },
    ],
    tasks: [
      { id: 1, dealId: 1, title: "Confirm procurement timeline", type: "Follow-up", owner: "Noa Levi", due: "2026-06-13", priority: "High", completed: false },
      { id: 2, dealId: 2, title: "Review proposal feedback", type: "Email", owner: "Daniel Cohen", due: "2026-06-15", priority: "Medium", completed: false },
    ],
    communications: [
      { id: 1, dealId: 1, type: "Email", direction: "outbound", subject: "Security review follow-up", body: "Sharing the final procurement checklist and next steps.", date: "2026-06-10T09:42:00", owner: "Noa Levi", tracked: "Opened twice" },
    ],
  },
  {
    id: "amihai",
    name: "Amihai Sales",
    slug: "amihai",
    plan: "Growth",
    status: "Active",
    region: "EU-West",
    seats: 5,
    billingEmail: "billing@amihai.example",
    users: [
      { id: "amihai-owner", name: "Amihai Cohen", email: "amihai@zeptrix.io", password: SEED_AMIHAI_TEMP_PASSWORD, mustChangePassword: true, role: "tenant_admin", mfa: true, sso: true },
    ],
    deals: [
      { id: 1, name: "Partner CRM launch", account: "BluePeak Advisory", contact: "Idan Yuval", email: "idan@bluepeak.example", owner: "Amihai Cohen", stage: "Proposal", value: 42000, close: "2026-06-25", priority: "High", group: "active", note: "Pricing review scheduled.", updated: "Today, 10:18" },
      { id: 2, name: "Support workflow", account: "Northline Apps", contact: "Yael Ron", email: "yael@northline.example", owner: "Noa Levi", stage: "Qualified", value: 18000, close: "2026-07-08", priority: "Medium", group: "active", note: "Needs SLA mapping.", updated: "Yesterday" },
      { id: 3, name: "Renewal package", account: "Cedar Retail", contact: "Tom Bar", email: "tom@cedar.example", owner: "Amihai Cohen", stage: "Won", value: 28000, close: "2026-06-02", priority: "Low", group: "closed", note: "Renewed for 12 months.", updated: "Jun 2" },
    ],
    tasks: [
      { id: 1, dealId: 1, title: "Send revised quote", type: "Email", owner: "Amihai Cohen", due: "2026-06-14", priority: "High", completed: false },
    ],
    communications: [
      { id: 1, dealId: 1, type: "Meeting", direction: "inbound", subject: "Pricing workshop", body: "Reviewed Growth plan and data migration needs.", date: "2026-06-11T15:30:00", owner: "Amihai Cohen", tracked: "45 min" },
    ],
  },
];

const defaultStageProbabilities = { Lead: 10, Qualified: 30, Proposal: 55, Negotiation: 80, Won: 100, Lost: 0 };
const defaultData = {
  tenants: tenantSeed,
  inviteEmails: [
    { id: 1, to: "admin@zeptrix.io", tenantName: "Zeptrix Admin", temporaryPassword: SEED_ADMIN_TEMP_PASSWORD, sentAt: "2026-06-12T09:00:00" },
    { id: 2, to: "amihai@zeptrix.io", tenantName: "Amihai Sales", temporaryPassword: SEED_AMIHAI_TEMP_PASSWORD, sentAt: "2026-06-12T09:05:00" },
  ],
  stageProbabilities: defaultStageProbabilities,
  customFields: ["Lead source", "Next step"],
  visibleColumns: ["owner", "stage", "value", "account", "close", "priority"],
};

let data = loadData();
let session = loadSession();
let ui = {
  authStep: "password",
  pendingUser: null,
  authError: "",
  tenantId: session?.tenantId || "admin",
  section: "admin",
  view: "table",
  savedView: "All deals",
  search: "",
  stageFilter: "All",
  selected: null,
  modal: null,
  editing: null,
  editingTenant: null,
  adminNotice: "",
  newGroup: "active",
  taskDealId: null,
  emailDealId: null,
  collapsed: [],
  accountFocus: "",
  selectedContactEmail: "",
};

loadStateFromApi();
if (IS_DEMO_ROUTE) applyDemoSession();

function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeData(stored ? { ...structuredClone(defaultData), ...stored } : structuredClone(defaultData));
  } catch {
    return normalizeData(structuredClone(defaultData));
  }
}

function normalizeData(nextData) {
  const seedPasswords = { "admin@zeptrix.io": SEED_ADMIN_TEMP_PASSWORD, "amihai@zeptrix.io": SEED_AMIHAI_TEMP_PASSWORD };
  nextData.inviteEmails = nextData.inviteEmails || [];
  nextData.tenants = nextData.tenants.map((tenant) => ({
    ...tenant,
    users: (tenant.users || []).map((user) => {
      const generatedPassword = user.password || seedPasswords[user.email] || generateTemporaryPassword();
      if (!user.password && !nextData.inviteEmails.some((mail) => mail.to?.toLowerCase() === user.email.toLowerCase() && mail.temporaryPassword === generatedPassword)) {
        nextData.inviteEmails.unshift({
          id: Math.max(0, ...nextData.inviteEmails.map((mail) => mail.id || 0)) + 1,
          to: user.email,
          tenantName: tenant.name,
          temporaryPassword: generatedPassword,
          sentAt: new Date().toISOString(),
        });
      }
      return {
        ...user,
        password: generatedPassword,
        mustChangePassword: user.mustChangePassword ?? true,
      };
    }),
  }));
  return nextData;
}

function loadSession() {
  try {
    const storedSession = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (storedSession?.role === "demo_user" && !IS_DEMO_ROUTE) return null;
    return storedSession;
  } catch {
    return null;
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function saveSession() {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function titleCase(value) {
  return decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || "Demo User";
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "demo";
}

function applyDemoSession() {
  const demoTenant = data.tenants.find((tenant) => tenant.slug === "demo" || tenant.id === "demo");
  session = {
    email: `${slugify(DEMO_USER_NAME)}@demo.zeptrix.io`,
    name: DEMO_USER_NAME,
    role: "demo_user",
    tenantId: demoTenant?.id || "demo",
    forcePasswordChange: false,
  };
  ui.tenantId = session.tenantId;
  ui.section = "home";
  ui.authError = "";
}

function currentTenant() {
  return data.tenants.find((tenant) => tenant.id === ui.tenantId) || data.tenants[0];
}

function setTenant(nextTenant) {
  data.tenants = data.tenants.map((tenant) => tenant.id === nextTenant.id ? nextTenant : tenant);
  saveData();
}

function currentUser() {
  if (!session) return null;
  return { name: session.name, email: session.email, role: session.role };
}

function isPlatformAdmin() {
  return session?.role === "platform_admin";
}

function tenantUsers() {
  return data.tenants.flatMap((tenant) => tenant.users.map((user) => ({ ...user, tenantId: tenant.id, tenantName: tenant.name })));
}

function authenticate(email, password) {
  return tenantUsers().find((user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.detail || "Request failed.");
  return body;
}

async function loadStateFromApi() {
  try {
    const remote = await apiRequest("/api/state");
    data = { ...data, tenants: remote.tenants, inviteEmails: remote.inviteEmails };
    if (IS_DEMO_ROUTE) applyDemoSession();
    if (!data.tenants.some((tenant) => tenant.id === ui.tenantId)) ui.tenantId = data.tenants[0]?.id || "admin";
    saveData();
    render();
  } catch (error) {
    console.warn("Using local fallback state:", error.message);
  }
}

async function loginViaApi(email, password) {
  return apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

async function changePasswordViaApi(email, password) {
  return apiRequest("/api/auth/change-password", { method: "POST", body: JSON.stringify({ email, password }) });
}

function findUserByEmail(email) {
  return tenantUsers().find((user) => user.email.toLowerCase() === email.toLowerCase());
}

function updateUser(email, patch) {
  data.tenants = data.tenants.map((tenant) => ({
    ...tenant,
    users: tenant.users.map((user) => user.email.toLowerCase() === email.toLowerCase() ? { ...user, ...patch } : user),
  }));
  saveData();
}

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return `Tmp-${[...bytes].map((byte) => chars[byte % chars.length]).join("")}`;
}

function sendInviteEmail(to, tenantName, temporaryPassword) {
  data.inviteEmails = [
    { id: Math.max(0, ...data.inviteEmails.map((mail) => mail.id || 0)) + 1, to, tenantName, temporaryPassword, sentAt: new Date().toISOString(), status: "local_only" },
    ...data.inviteEmails,
  ];
}

async function createTenantViaApi(values) {
  return apiRequest("/api/tenants", { method: "POST", body: JSON.stringify(values) });
}

async function updateTenantViaApi(id, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(values) });
}

async function resetTenantPasswordViaApi(id) {
  return apiRequest(`/api/tenants/${encodeURIComponent(id)}/reset-password`, { method: "POST" });
}

async function deleteTenantViaApi(id) {
  return apiRequest(`/api/tenants/${encodeURIComponent(id)}`, { method: "DELETE" });
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function avatar(name, size = "") {
  const [letters, color] = owners[name] || [initials(name), "#617085"];
  return `<span class="avatar ${size}" style="background:${color}">${letters}</span>`;
}

function today() {
  return "2026-06-12";
}

function daysFromNow(days) {
  const date = new Date(`${today()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysUntil(value) {
  return Math.ceil((new Date(`${value}T12:00:00`) - new Date(`${today()}T12:00:00`)) / 86400000);
}

function openTasks(tenant = currentTenant()) {
  return tenant.tasks.filter((task) => !task.completed);
}

function taskStatus(task) {
  if (task.completed) return ["Done", "priority-low"];
  if (task.due < today()) return ["Overdue", "priority-high"];
  if (task.due === today()) return ["Due today", "priority-medium"];
  return ["Upcoming", "stage-qualified"];
}

function total(items, includeLost = true) {
  return items.filter((deal) => includeLost || deal.stage !== "Lost").reduce((sum, deal) => sum + Number(deal.value), 0);
}

function weightedForecast(deals = currentTenant().deals) {
  return Math.round(deals.reduce((sum, deal) => sum + Number(deal.value) * (data.stageProbabilities[deal.stage] || 0) / 100, 0));
}

function filteredDeals() {
  const tenant = currentTenant();
  const query = ui.search.trim().toLowerCase();
  return tenant.deals.filter((deal) => {
    const matchesQuery = !query || [deal.name, deal.account, deal.contact, deal.owner, deal.email].join(" ").toLowerCase().includes(query);
    const matchesStage = ui.stageFilter === "All" || deal.stage === ui.stageFilter;
    const matchesView = ui.savedView === "All deals"
      || (ui.savedView === "Closing soon" && !["Won", "Lost"].includes(deal.stage) && daysUntil(deal.close) <= 14)
      || (ui.savedView === "High priority" && deal.priority === "High")
      || (ui.savedView === "My open deals" && deal.owner === currentUser()?.name && !["Won", "Lost"].includes(deal.stage));
    return matchesQuery && matchesStage && matchesView;
  });
}

function render() {
  if (session && findUserByEmail(session.email)?.mustChangePassword) {
    session.forcePasswordChange = true;
    saveSession();
  }
  document.querySelector("#app").innerHTML = session ? (session.forcePasswordChange ? renderPasswordChange() : renderApp()) : renderAuth();
}

function renderAuth() {
  return `
    <main class="auth-screen">
      <section class="auth-art">
        <a class="brand" href="/crm/"><span class="brand-mark">Z</span><span>Zeptrix CRM</span></a>
        <div class="auth-copy">
          <h1>Win more deals from one focused sales workspace</h1>
          <p>Track pipeline, accounts, conversations, and follow-ups in a CRM your team can understand at a glance.</p>
          <div class="product-showcase" aria-hidden="true">
            <article class="showcase-card pipeline-preview">
              <div class="showcase-head"><span></span><span></span><span></span></div>
              <div class="pipeline-grid">
                <span style="height:72%"></span>
                <span style="height:46%"></span>
                <span style="height:88%"></span>
                <span style="height:61%"></span>
                <span style="height:34%"></span>
              </div>
              <strong>Pipeline momentum</strong>
              <small>Spot risk, value, and next steps before deals stall.</small>
            </article>
            <article class="showcase-card image-card">
              <img src="./assets/crm-hero-background.png" alt="" />
              <strong>Customer context</strong>
              <small>Every account, activity, and message in one place.</small>
            </article>
            <article class="showcase-card activity-preview">
              <div><span class="dot green"></span><p><strong>Proposal sent</strong><small>Enterprise rollout</small></p></div>
              <div><span class="dot blue"></span><p><strong>Follow-up due</strong><small>Partner CRM launch</small></p></div>
              <div><span class="dot orange"></span><p><strong>Meeting booked</strong><small>Q3 expansion plan</small></p></div>
            </article>
          </div>
        </div>
        <span class="hero-note">Pipeline clarity for teams that move fast.</span>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          ${ui.authStep === "mfa" ? renderMfa() : renderPasswordLogin()}
        </div>
      </section>
    </main>`;
}

function renderPasswordLogin() {
  return `
    <h2>Sign in</h2>
    <p class="subcopy">Use the temporary password from the invite email. MFA code is <strong>${MFA_CODE}</strong>.</p>
    <div class="auth-actions">
      <button class="button google-button" data-action="google-sso">G Continue with Google</button>
    </div>
    <div class="divider">or use email</div>
    <form class="auth-actions" data-login-form>
      <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label>Password</label><input name="password" type="password" required /></div>
      <button class="button primary">Continue</button>
      ${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}
    </form>`;
}

function renderPasswordChange() {
  return `
    <main class="auth-screen">
      <section class="auth-art">
        <a class="brand" href="/crm/"><span class="brand-mark">Z</span><span>Zeptrix CRM</span></a>
        <div class="auth-copy">
          <h1>Create your permanent password</h1>
          <p>Your temporary invite password worked. Set a new password before entering the workspace.</p>
        </div>
        <span class="hero-note">This protects every tenant workspace from shared credentials.</span>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <h2>Change password</h2>
          <p class="subcopy">Use at least 10 characters. Avoid the temporary password from your invite email.</p>
          <form class="auth-actions" data-change-password-form>
            <div class="field"><label>New password</label><input name="password" type="password" minlength="10" required /></div>
            <div class="field"><label>Confirm password</label><input name="confirm" type="password" minlength="10" required /></div>
            <button class="button primary">Save password and continue</button>
            ${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}
          </form>
        </div>
      </section>
    </main>`;
}

function renderMfa() {
  return `
    <h2>Verify MFA</h2>
    <p class="subcopy">Enter the authenticator code for ${escapeHtml(ui.pendingUser?.email || "")}.</p>
    <form class="auth-actions" data-mfa-form>
      <div class="field"><label>Code</label><input name="code" inputmode="numeric" value="${MFA_CODE}" required /></div>
      <button class="button primary">Verify and open CRM</button>
      <button class="button ghost" type="button" data-action="back-login">Back</button>
      ${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}
    </form>`;
}

function renderApp() {
  return `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        ${renderTopbar()}
        <section class="page">${renderSection()}</section>
      </main>
      ${renderModal()}
    </div>`;
}

function renderSidebar() {
  const tenant = currentTenant();
  return `
    <aside class="sidebar">
      <a class="brand" href="/crm/"><span class="brand-mark">Z</span><span>Zeptrix CRM</span></a>
      <div class="tenant-card"><small>TENANT</small><strong>${escapeHtml(tenant.name)}</strong><small>${escapeHtml(tenant.plan)} · ${escapeHtml(tenant.status)}</small></div>
      <p class="side-label">Control</p>
      ${isPlatformAdmin() ? sideLink("admin", "▣", "Tenants", data.tenants.length) : ""}
      ${sideLink("home", "⌂", "Home")}
      <p class="side-label">Workspace</p>
      ${sideLink("pipeline", "▦", "Sales pipeline")}
      ${sideLink("accounts", "▣", "Accounts", uniqueBy("account").length)}
      ${sideLink("contacts", "♙", "Contacts", uniqueBy("email").length)}
      ${sideLink("activities", "✓", "Activities", openTasks().length)}
      ${sideLink("inbox", "✉", "Inbox", tenant.communications.length)}
      ${sideLink("reports", "◴", "Reports")}
      <button class="side-link" data-action="open-settings"><span class="icon">⚙</span> Settings</button>
      <div class="side-spacer"></div>
      <button class="side-link" data-action="logout"><span class="icon">⇤</span> Sign out</button>
      <div class="profile">${avatar(currentUser().name)}<div><strong>${escapeHtml(currentUser().name)}</strong><small>${escapeHtml(currentUser().role)}</small></div></div>
    </aside>`;
}

function sideLink(section, icon, label, count = "") {
  return `<button class="side-link ${ui.section === section ? "active" : ""}" data-section="${section}"><span class="icon">${icon}</span>${label}${count !== "" ? `<span class="count">${count}</span>` : ""}</button>`;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <label class="global-search"><span>⌕</span><input placeholder="Search tenants, deals, contacts..." /><span>⌘ K</span></label>
      <span class="top-spacer"></span>
      ${isPlatformAdmin() ? `<select class="button" data-tenant-select>${data.tenants.map((tenant) => `<option value="${tenant.id}" ${tenant.id === ui.tenantId ? "selected" : ""}>${escapeHtml(tenant.name)}</option>`).join("")}</select>` : ""}
      <button class="icon-button" data-action="add-deal" title="Create deal">＋</button>
      <div class="top-user">${avatar(currentUser().name, "small")}<span>${escapeHtml(currentUser().name)}</span></div>
    </header>`;
}

function renderSection() {
  if (ui.section === "admin" && isPlatformAdmin()) return renderAdmin();
  if (ui.section === "home") return renderHome();
  if (ui.section === "pipeline") return `${renderPageHeader()}${renderSummary()}${renderTabs()}${ui.view === "dashboard" ? renderDashboard() : `${renderToolbar()}${ui.view === "table" ? renderBoard() : renderKanban()}`}`;
  if (ui.section === "contacts") return renderContacts();
  if (ui.section === "accounts") return renderAccounts();
  if (ui.section === "activities") return renderActivities();
  if (ui.section === "inbox") return renderInbox();
  if (ui.section === "reports") return `${renderPageHeader("Reports", "Monitor pipeline health and sales performance.")}${renderDashboard()}`;
  return renderHome();
}

function renderPageHeader(title = "Sales pipeline", copy = "Manage deals, track progress, and keep your team in sync.") {
  return `
    <div class="page-title-row">
      <div><h1>${title}</h1><p class="subcopy">${copy}</p></div>
      <div><button class="button" data-action="export">⇩ Export</button><button class="button primary" data-action="add-deal">＋ New deal</button></div>
    </div>`;
}

function renderAdmin() {
  const allDeals = data.tenants.flatMap((tenant) => tenant.deals.map((deal) => ({ ...deal, tenantName: tenant.name })));
  return `
    ${renderPageHeader("Tenant administration", "Create tenants, monitor usage, and enter each workspace.")}
    <div class="summary-grid">
      ${summaryCard("▣", "var(--blue-soft)", "var(--blue)", "Tenants", data.tenants.length, "2 seeded")}
      ${summaryCard("♙", "var(--mint-soft)", "var(--mint)", "Users", tenantUsers().length, "MFA enabled")}
      ${summaryCard("↗", "var(--purple-soft)", "var(--purple)", "Pipeline", money(total(allDeals, false)), "all tenants")}
      ${summaryCard("◎", "var(--orange-soft)", "var(--orange)", "Seats", data.tenants.reduce((sum, tenant) => sum + Number(tenant.seats), 0), "licensed")}
    </div>
    <div class="section-toolbar"><strong>${data.tenants.length} tenants</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-tenant">＋ New tenant</button></div>
    ${ui.adminNotice ? `<p class="admin-notice">${escapeHtml(ui.adminNotice)}</p>` : ""}
    <section class="list-card">
      ${data.tenants.map(renderTenantRow).join("")}
    </section>
    <div class="section-toolbar"><strong>Sent invite emails</strong><span class="toolbar-spacer"></span></div>
    <section class="list-card">
      ${(data.inviteEmails || []).slice(0, 8).map((mail) => `<div class="invite-row"><span class="activity-symbol">✉</span><span class="list-primary">${escapeHtml(mail.to)}<small>${escapeHtml(mail.tenantName)} · ${inviteSummary(mail)}</small></span><span class="muted">${formatTimestamp(mail.sentAt)}</span></div>`).join("") || `<p class="empty-state">No invite emails sent yet.</p>`}
    </section>`;
}

function tenantAdminEmail(tenant) {
  return tenant.users?.find((user) => ["tenant_admin", "platform_admin"].includes(user.role))?.email || "";
}

function renderTenantRow(tenant) {
  return `<div class="tenant-row"><span class="account-mark">${initials(tenant.name)}</span><span class="list-primary">${escapeHtml(tenant.name)}<small>${escapeHtml(tenant.slug)} · login: ${escapeHtml(tenantAdminEmail(tenant) || "none")} · billing: ${escapeHtml(tenant.billingEmail)}</small></span><span class="status-pill stage-won">${escapeHtml(tenant.status)}</span><strong>${tenant.seats} seats</strong><span>${escapeHtml(tenant.plan)} · ${escapeHtml(tenant.region)}</span>${tenantActions(tenant)}</div>`;
}

function inviteSummary(mail) {
  const status = mail.status || "sent";
  if (status === "failed") return `failed: ${escapeHtml(mail.detail || "Email was not delivered.")}`;
  if (mail.temporaryPassword) return `temporary password: ${escapeHtml(mail.temporaryPassword)} · ${escapeHtml(status)}`;
  if (status === "sent") return "sent by email";
  return escapeHtml(status);
}

function tenantActions(tenant) {
  const isCurrentTenant = tenant.id === session?.tenantId;
  const hasLogin = !!tenantAdminEmail(tenant);
  return `<span class="row-actions">
    <button class="icon-button small" data-action="edit-tenant" data-id="${tenant.id}" data-tooltip="Edit tenant" title="Edit tenant" aria-label="Edit tenant">✎</button>
    <button class="icon-button small" data-action="open-tenant" data-id="${tenant.id}" data-tooltip="Open workspace" title="Open workspace" aria-label="Open workspace">↗</button>
    <button class="icon-button small ${hasLogin ? "" : "is-disabled"}" data-action="reset-tenant-password" data-id="${tenant.id}" ${hasLogin ? "" : `data-disabled="true"`} data-tooltip="${hasLogin ? "Reset password" : "No login user"}" title="${hasLogin ? "Reset password" : "No login user"}" aria-label="${hasLogin ? "Reset password" : "No login user"}">↺</button>
    <button class="icon-button small danger ${isCurrentTenant ? "is-disabled" : ""}" data-action="delete-tenant" data-id="${tenant.id}" ${isCurrentTenant ? `data-disabled="true"` : ""} data-tooltip="${isCurrentTenant ? "Current tenant cannot be deleted" : "Delete tenant"}" title="${isCurrentTenant ? "Current tenant cannot be deleted" : "Delete tenant"}" aria-label="${isCurrentTenant ? "Current tenant cannot be deleted" : "Delete tenant"}">×</button>
  </span>`;
}

function renderHome() {
  const tenant = currentTenant();
  const tasks = openTasks(tenant);
  const attentionAccounts = accountsNeedingAttention(tenant);
  return `
    ${renderPageHeader(`Good morning, ${currentUser().name.split(" ")[0]}`, `Here is what is happening in ${tenant.name}.`)}
    ${renderSummary()}
    <section class="admin-grid">
      <article class="widget wide"><h3>Accounts that need attention</h3>${attentionAccounts.map(({ account, primaryDeal, count, value, reasons }) => `<button class="metric-row attention-row" data-open-account="${escapeHtml(account)}"><span class="list-primary">${escapeHtml(account)}<small>${escapeHtml(primaryDeal.name)} · ${escapeHtml(primaryDeal.contact)}${count > 1 ? ` · ${count} open deals` : ""}</small><span class="attention-reasons">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</span></span><strong>${money(value)}</strong><span class="priority priority-high">High</span></button>`).join("") || `<p class="empty-state">No high-priority accounts right now.</p>`}</article>
      <article class="widget"><h3>Today's focus</h3><div class="summary-card"><span class="summary-icon" style="background:var(--orange-soft);color:var(--orange)">◴</span><div><small>Open tasks</small><strong>${tasks.length}</strong></div></div></article>
    </section>`;
}

function accountsNeedingAttention(tenant = currentTenant()) {
  const grouped = new Map();
  tenant.deals
    .filter((deal) => deal.priority === "High" && !["Won", "Lost"].includes(deal.stage))
    .forEach((deal) => {
      const existing = grouped.get(deal.account) || { account: deal.account, primaryDeal: deal, count: 0, value: 0 };
      grouped.set(deal.account, {
        ...existing,
        primaryDeal: Number(deal.value) > Number(existing.primaryDeal.value) ? deal : existing.primaryDeal,
        count: existing.count + 1,
        value: existing.value + Number(deal.value),
        reasons: accountAttentionReasons(deal),
      });
    });
  return [...grouped.values()].sort((a, b) => b.value - a.value);
}

function accountAttentionReasons(deal) {
  const reasonsByAccount = {
    "Orbital Systems": ["Renewal checkpoint in 90 days", "Security/legal risk", "Angry customer thread"],
    "Strata Finance": ["Renewal in 3 months", "Legal approval stalled", "Executive sponsor needed"],
    "Atlas Freight": ["Onboarding handoff due", "Expansion timing", "Champion follow-up"],
  };
  if (reasonsByAccount[deal.account]) return reasonsByAccount[deal.account];
  const reasons = [];
  if (daysUntil(deal.close) <= 30) reasons.push("Close date approaching");
  if (deal.stage === "Negotiation") reasons.push("Commercial approval pending");
  if (deal.priority === "High") reasons.push("High-value stakeholder follow-up");
  return reasons.length ? reasons : ["Engagement needs review"];
}

function renderSummary(deals = currentTenant().deals) {
  const tenant = currentTenant();
  const open = deals.filter((deal) => !["Won", "Lost"].includes(deal.stage));
  const won = deals.filter((deal) => deal.stage === "Won");
  const dealIds = new Set(deals.map((deal) => deal.id));
  const due = openTasks(tenant).filter((task) => dealIds.has(task.dealId) && task.due <= today());
  return `
    <div class="summary-grid">
      ${summaryCard("↗", "var(--blue-soft)", "var(--blue)", "Pipeline value", money(total(open)), "+12.4%")}
      ${summaryCard("◎", "var(--mint-soft)", "var(--mint)", "Won this month", money(total(won)), "+18.2%")}
      ${summaryCard("▦", "var(--purple-soft)", "var(--purple)", "Open deals", open.length, "+5.1%")}
      ${summaryCard("◴", "var(--orange-soft)", "var(--orange)", "Tasks due", due.length, "needs action")}
    </div>`;
}

function summaryCard(icon, bg, color, label, value, trend) {
  return `<article class="summary-card"><span class="summary-icon" style="background:${bg};color:${color}">${icon}</span><div><small>${label}</small><strong>${value}</strong></div><span class="summary-trend">${trend}</span></article>`;
}

function uniqueBy(field) {
  return [...new Map(currentTenant().deals.filter((deal) => deal[field]).map((deal) => [deal[field], deal])).values()];
}

function renderTabs() {
  return `<nav class="view-tabs">${tab("table", "▤", "Table")}${tab("kanban", "▦", "Kanban")}${tab("dashboard", "◴", "Dashboard")}<button class="view-tab" data-action="open-settings">＋ Add view</button></nav>`;
}

function tab(view, icon, label) {
  return `<button class="view-tab ${ui.view === view ? "active" : ""}" data-view="${view}">${icon} ${label}</button>`;
}

function renderToolbar() {
  return `
    <div class="toolbar">
      <label class="table-search"><span>⌕</span><input data-search value="${escapeHtml(ui.search)}" placeholder="Search deals..." /></label>
      <select class="button ${ui.stageFilter !== "All" ? "filter-pill" : ""}" data-stage-filter>${["All", ...stages].map((stage) => `<option ${stage === ui.stageFilter ? "selected" : ""}>${stage === "All" ? "☰ Filter by stage" : stage}</option>`).join("")}</select>
      <select class="button" data-saved-view>${["All deals", "Closing soon", "High priority", "My open deals"].map((view) => `<option ${ui.savedView === view ? "selected" : ""}>${view}</option>`).join("")}</select>
      <span class="toolbar-spacer"></span>
      <button class="button" data-action="open-settings">☷ Columns</button>
    </div>`;
}

function renderBoard() {
  const deals = filteredDeals();
  return `<div class="board-wrap">${renderGroup("active", "Active opportunities", "#3281db", deals.filter((deal) => deal.group === "active"))}${renderGroup("closed", "Closed this month", "#21a57a", deals.filter((deal) => deal.group === "closed"))}</div>`;
}

function renderGroup(key, label, color, deals) {
  const isCollapsed = ui.collapsed.includes(key);
  return `
    <section class="group" style="--group-color:${color}">
      <header class="group-heading"><button data-collapse="${key}">${isCollapsed ? "▸" : "▾"}</button><h3>${label}</h3><small>${deals.length} deals</small><span class="group-total">${money(total(deals))}</span></header>
      ${isCollapsed ? "" : `<table class="crm-table"><thead><tr><th class="select-col"><input type="checkbox" /></th><th class="deal-col">Deal name</th>${data.visibleColumns.map(columnHeading).join("")}<th class="more-col"></th></tr></thead><tbody>${deals.length ? deals.map(renderRow).join("") : `<tr><td colspan="10" class="empty-state">No deals match this view.</td></tr>`}<tr class="add-row"><td></td><td colspan="8"><button class="add-item" data-action="add-deal" data-group="${key}">＋ Add deal</button></td></tr></tbody></table>`}
    </section>`;
}

function columnHeading(column) {
  const map = { owner: ["owner-col", "Owner"], stage: ["stage-col", "Stage"], value: ["value-col", "Deal value"], account: ["account-col", "Account"], close: ["date-col", "Close date"], priority: ["priority-col", "Priority"] };
  return `<th class="${map[column][0]}">${map[column][1]}</th>`;
}

function renderRow(deal) {
  return `<tr><td class="select-col"><input type="checkbox" /></td><td class="deal-col"><button class="deal-link" data-open-deal="${deal.id}">${escapeHtml(deal.name)}</button></td>${data.visibleColumns.map((column) => renderCell(deal, column)).join("")}<td class="more-col"><button class="row-more" data-open-deal="${deal.id}">⋯</button></td></tr>`;
}

function renderCell(deal, column) {
  if (column === "owner") return `<td class="owner-col"><span class="owner-cell">${avatar(deal.owner)}<span>${escapeHtml(deal.owner.split(" ")[0])}</span></span></td>`;
  if (column === "stage") return `<td class="stage-col"><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span></td>`;
  if (column === "value") return `<td class="value-col"><strong>${money(deal.value)}</strong></td>`;
  if (column === "account") return `<td class="account-col">${escapeHtml(deal.account)}</td>`;
  if (column === "close") return `<td class="date-col">${formatDate(deal.close)}</td>`;
  return `<td class="priority-col"><span class="priority priority-${deal.priority.toLowerCase()}">${deal.priority}</span></td>`;
}

function renderKanban() {
  const deals = filteredDeals();
  return `<div class="kanban">${stages.map((stage) => {
    const stageDeals = deals.filter((deal) => deal.stage === stage);
    return `<section class="kanban-col" data-drop-stage="${stage}"><header class="kanban-head"><h3><span class="status-pill ${stageClass[stage]}">${stage}</span></h3><span>${stageDeals.length}</span></header>${stageDeals.map((deal) => `<article class="kanban-card" draggable="true" data-drag-deal="${deal.id}"><button data-open-deal="${deal.id}">${escapeHtml(deal.name)}</button><p>${escapeHtml(deal.account)}</p><div class="kanban-meta"><span>${money(deal.value)}</span>${avatar(deal.owner, "small")}</div></article>`).join("")}</section>`;
  }).join("")}</div>`;
}

function renderDashboard() {
  const tenant = currentTenant();
  const deals = tenant.deals;
  const closed = deals.filter((deal) => ["Won", "Lost"].includes(deal.stage));
  const winRate = closed.length ? Math.round(closed.filter((deal) => deal.stage === "Won").length / closed.length * 100) : 0;
  return `
    <div class="toolbar"><span class="subcopy">Live pipeline overview</span><span class="toolbar-spacer"></span><button class="button">This month⌄</button></div>
    <section class="dashboard">
      <article class="widget wide"><h3>Pipeline by stage</h3>${stages.map((stage) => {
        const items = deals.filter((deal) => deal.stage === stage);
        const width = Math.max(4, Math.round(total(items) / 1250));
        return `<div class="funnel-row"><small>${stage}</small><div class="funnel-bar"><span style="width:${Math.min(width, 100)}%"></span></div><strong>${money(total(items))}</strong></div>`;
      }).join("")}</article>
      <article class="widget"><h3>Win rate</h3><div style="padding:28px 0;text-align:center"><strong style="font:800 46px Manrope;color:var(--mint)">${winRate}%</strong><p class="subcopy">${closed.length} closed deals measured</p></div></article>
      <article class="widget"><h3>Forecast</h3><div style="padding:24px 0"><small class="muted">Weighted pipeline</small><strong style="display:block;margin:8px 0;font:800 30px Manrope">${money(weightedForecast())}</strong><p class="subcopy">Based on editable stage confidence and expected close dates.</p></div></article>
    </section>`;
}

function renderContacts() {
  const contacts = uniqueBy("email");
  return `${renderPageHeader("Contacts", "Keep the people behind every opportunity organized.")}<div class="section-toolbar"><strong>${contacts.length} contacts</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-deal">＋ Add contact</button></div><section class="list-card">${contacts.map(renderContactRow).join("") || `<p class="empty-state">No contacts yet.</p>`}</section>`;
}

function renderContactRow(deal) {
  const isOpen = ui.selectedContactEmail === deal.email;
  return `<div class="list-row contact-row ${isOpen ? "is-open" : ""}">${avatar(deal.owner)}<button class="activity-main" data-open-contact="${escapeHtml(deal.email)}"><span class="list-primary">${escapeHtml(deal.contact)}<small>${escapeHtml(deal.email)}</small></span></button><button class="inline-link" data-open-account="${escapeHtml(deal.account)}">${escapeHtml(deal.account)}</button><span class="muted">Owner: ${escapeHtml(deal.owner)}</span><button class="button small danger" data-action="delete-contact" data-email="${escapeHtml(deal.email)}">Delete</button></div>${isOpen ? renderContactDetail(deal) : ""}`;
}

function renderContactDetail(deal) {
  const profile = contactProfile(deal);
  return `<div class="contact-detail-row">
    <div class="contact-detail-head">${avatar(deal.contact, "large")}<div><h3>${escapeHtml(deal.contact)}</h3><p class="subcopy">${escapeHtml(profile.role)} · <button class="text-link" data-open-account="${escapeHtml(deal.account)}">${escapeHtml(deal.account)}</button></p></div></div>
    <div class="contact-insight-grid">
      ${contactInsight("Buying role", profile.buyingRole, "How this person affects the deal")}
      ${contactInsight("Engagement", profile.engagement, "Recent email, meeting, and reply signal")}
      ${contactInsight("Preference", profile.preference, "Best channel and cadence")}
      ${contactInsight("Sentiment", profile.sentiment, "Relationship health")}
      ${contactInsight("Next best action", profile.nextAction, "Recommended seller move")}
      ${contactInsight("Personal context", profile.personalContext, "Useful for thoughtful outreach")}
    </div>
  </div>`;
}

function contactProfile(deal) {
  const days = Math.max(1, Math.abs(daysUntil(deal.close)));
  const isHigh = deal.priority === "High";
  return {
    role: deal.stage === "Negotiation" ? "Economic buyer" : deal.stage === "Proposal" ? "Champion" : "Primary stakeholder",
    buyingRole: isHigh ? "Decision maker with budget influence" : "Influencer in the buying committee",
    engagement: `${deal.updated}; ${isHigh ? "high intent" : "steady interest"} across ${deal.stage.toLowerCase()} stage`,
    preference: deal.email ? `Email first, mobile for urgent close-date items` : "Confirm preferred channel",
    sentiment: isHigh ? "Positive, but time-sensitive" : "Healthy relationship",
    nextAction: days <= 14 ? "Confirm blockers and buying committee sign-off" : "Share tailored success plan and timeline",
    personalContext: `Birthday and relationship moments tracked for thoughtful follow-up`,
  };
}

function contactInsight(label, value, hint) {
  return `<div class="contact-insight"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(hint)}</span></div>`;
}

function renderAccounts() {
  const allAccounts = uniqueBy("account");
  const accounts = ui.accountFocus ? allAccounts.filter((deal) => deal.account === ui.accountFocus) : allAccounts;
  if (ui.accountFocus) return renderAccountDetail(accounts[0], allAccounts.length);
  return `${renderPageHeader("Accounts", "Track customers and prospects at the company level.")}<div class="section-toolbar"><strong>${accounts.length} accounts</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-deal">＋ Add account</button></div><section class="list-card">${accounts.map((deal) => `<div class="list-row account-row"><span class="account-mark">${initials(deal.account)}</span><button class="activity-main" data-open-account="${escapeHtml(deal.account)}"><span class="list-primary">${escapeHtml(deal.account)}<small>${escapeHtml(deal.contact)}</small></span></button><strong>${money(total(currentTenant().deals.filter((item) => item.account === deal.account)))}</strong><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span><button class="button small danger" data-action="delete-account" data-account="${escapeHtml(deal.account)}">Delete</button></div>`).join("") || `<p class="empty-state">No accounts yet.</p>`}</section>`;
}

function renderAccountDetail(accountDeal, accountCount) {
  if (!accountDeal) return `${renderPageHeader("Account not found", "The selected account is no longer available.")}<button class="button" data-action="clear-account-focus">Show all accounts</button>`;
  const tenant = currentTenant();
  const accountDeals = tenant.deals.filter((deal) => deal.account === accountDeal.account);
  const contacts = topAccountContacts(accountDeal);
  const threads = accountCorrespondence(accountDeal, contacts);
  return `
    ${renderPageHeader(accountDeal.account, `${accountDeals.length} active relationship ${accountDeals.length === 1 ? "record" : "records"} · ${money(total(accountDeals))} pipeline value`)}
    <div class="account-focus-banner"><span class="account-mark">${initials(accountDeal.account)}</span><div><strong>Viewing account</strong><small>${escapeHtml(accountDeal.account)} · opened from account intelligence</small></div><button class="risk-jump-button" data-action="jump-risk-thread" data-tooltip="Jump to anger correspondence" aria-label="Jump to anger correspondence">!</button><button class="button small" data-action="clear-account-focus">Back to account list</button></div>
    <div class="section-toolbar"><strong>Account intelligence</strong><span class="toolbar-spacer"></span><button class="button" data-action="clear-account-focus">Show all ${accountCount} accounts</button><button class="button primary" data-action="add-deal">＋ New deal</button></div>
    <section class="account-profile">
      <article class="account-panel account-summary-panel">
        <span class="account-mark large">${initials(accountDeal.account)}</span>
        <div>
          <h2>${escapeHtml(accountDeal.account)}</h2>
          <p class="subcopy">${escapeHtml(accountDeal.note || "Relationship is active and ready for follow-up.")}</p>
        </div>
        <div class="account-kpis">
          <span><small>Stage</small><strong>${escapeHtml(accountDeal.stage)}</strong></span>
          <span><small>Owner</small><strong>${escapeHtml(accountDeal.owner)}</strong></span>
          <span><small>Close date</small><strong>${formatDate(accountDeal.close)}</strong></span>
        </div>
      </article>
      <article class="account-panel">
        <h3>Top contacts</h3>
        <div class="contact-grid">${contacts.map(renderAccountContact).join("")}</div>
      </article>
      <article class="account-panel correspondence-panel">
        <h3>Correspondence</h3>
        <div class="thread-list">${threads.map(renderAccountThread).join("")}</div>
      </article>
      <article class="account-panel moments-panel">
        <h3>Relationship moments</h3>
        <div class="moment-list">${relationshipMoments(accountDeal, contacts).map(renderRelationshipMoment).join("")}</div>
      </article>
    </section>`;
}

function topAccountContacts(accountDeal) {
  const domain = accountDeal.email?.split("@")[1] || `${slugify(accountDeal.account)}.example`;
  const base = [
    { name: accountDeal.contact, title: "Executive sponsor", email: accountDeal.email, mobile: contactMobile(accountDeal.contact), twitter: socialHandle(accountDeal.contact), facebook: facebookProfile(accountDeal.contact) },
    { name: accountStakeholderName(accountDeal.account, 0), title: "VP Operations", email: `ops@${domain}`, mobile: contactMobile(`${accountDeal.account} ops`), twitter: socialHandle(accountDeal.account, "ops"), facebook: facebookProfile(accountDeal.account, "ops") },
    { name: accountStakeholderName(accountDeal.account, 1), title: "Procurement lead", email: `procurement@${domain}`, mobile: contactMobile(`${accountDeal.account} procurement`), twitter: socialHandle(accountDeal.account, "procurement"), facebook: facebookProfile(accountDeal.account, "procurement") },
  ];
  return base.slice(0, 3);
}

function accountStakeholderName(account, index) {
  const names = {
    "Orbital Systems": ["Maya Hart", "Jon Reeves"],
    "Strata Finance": ["Nina Patel", "Caleb Frost"],
    "Nimbus Labs": ["Ari Lane", "Grace Kim"],
    "Acme Studios": ["Mila Stone", "Ben Price"],
  };
  return names[account]?.[index] || ["Taylor Morgan", "Jordan Ellis"][index];
}

function contactMobile(seed) {
  const digits = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `+1 (415) ${String(200 + digits % 700).padStart(3, "0")}-${String(1000 + digits * 7 % 9000).padStart(4, "0")}`;
}

function socialHandle(name, suffix = "") {
  const handle = slugify(`${name} ${suffix}`).replaceAll("-", "");
  return { label: `@${handle}`, url: `https://twitter.com/${handle}` };
}

function facebookProfile(name, suffix = "") {
  const path = slugify(`${name} ${suffix}`).replaceAll("-", ".");
  return { label: `facebook.com/${path}`, url: `https://www.facebook.com/${path}` };
}

function renderAccountContact(contact) {
  return `<div class="contact-card">${avatar(contact.name)}<div class="contact-main"><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.title)}</small></div><dl><dt>Email</dt><dd><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></dd><dt>Mobile</dt><dd><a href="tel:${escapeHtml(contact.mobile)}">${escapeHtml(contact.mobile)}</a></dd><dt>Twitter</dt><dd><a href="${escapeHtml(contact.twitter.url)}" target="_blank" rel="noreferrer">${escapeHtml(contact.twitter.label)}</a></dd><dt>Facebook</dt><dd><a href="${escapeHtml(contact.facebook.url)}" target="_blank" rel="noreferrer">${escapeHtml(contact.facebook.label)}</a></dd></dl></div>`;
}

function relationshipMoments(accountDeal, contacts) {
  const birthdayMonth = (seed) => String(1 + [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 12).padStart(2, "0");
  const birthdayDay = (seed) => String(1 + [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 27).padStart(2, "0");
  const birthdays = contacts.map((contact) => ({
    type: "Birthday",
    date: `2026-${birthdayMonth(contact.name)}-${birthdayDay(contact.name)}`,
    title: `${contact.name}'s birthday`,
    detail: `${contact.title} · send a personal note`,
  }));
  const closeDate = new Date(`${accountDeal.close}T12:00:00`);
  const daysBeforeClose = (days) => {
    const date = new Date(closeDate);
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  };
  return [
    ...birthdays,
    { type: "QBR", date: daysBeforeClose(45), title: "Executive business review", detail: "Review ROI, success metrics, and expansion goals." },
    { type: "Renewal", date: daysBeforeClose(90), title: "Renewal checkpoint", detail: "Start commercial alignment before the renewal window." },
    { type: "Milestone", date: daysBeforeClose(20), title: "Launch readiness review", detail: "Confirm onboarding progress and open risks." },
    { type: "Champion", date: daysBeforeClose(35), title: "Champion enablement", detail: "Send internal business-case deck and talk track." },
    { type: "Budget", date: daysBeforeClose(60), title: "Budget planning window", detail: "Align purchase timing with finance planning." },
    { type: "Risk", date: daysBeforeClose(12), title: "Security and legal checkpoint", detail: "Confirm approvals before close date pressure." },
    { type: "Workshop", date: daysBeforeClose(25), title: "Stakeholder workshop", detail: "Map success criteria with the buying committee." },
    { type: "Anniversary", date: "2026-05-24", title: "Customer anniversary", detail: "Celebrate the relationship and share wins." },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

function renderRelationshipMoment(moment) {
  return `<div class="moment-row"><span class="moment-date">${formatMomentDate(moment.date)}</span><div><strong>${escapeHtml(moment.title)}</strong><small>${escapeHtml(moment.type)} · ${escapeHtml(moment.detail)}</small></div></div>`;
}

function accountCorrespondence(accountDeal, contacts) {
  const existing = currentTenant().communications
    .filter((item) => currentTenant().deals.find((deal) => deal.id === item.dealId)?.account === accountDeal.account)
    .map((item, index) => ({
      subject: item.subject,
      person: contacts[index % contacts.length].name,
      date: item.date,
      messages: [
        { side: item.direction === "inbound" ? "customer" : "team", author: item.direction === "inbound" ? contacts[index % contacts.length].name : item.owner, body: item.body },
        { side: item.direction === "inbound" ? "team" : "customer", author: item.direction === "inbound" ? accountDeal.owner : contacts[index % contacts.length].name, body: "Thanks, this is aligned with the account plan. I added the next step and will keep the team updated." },
      ],
    }));
  const generated = [
    ["Escalation: angry about delays", "I am angry that this slipped again. We were promised a clear security answer last week, and now procurement is asking why we should renew at all.", "You are right to be frustrated. I am escalating this today, sending a written recovery plan, and booking a same-day checkpoint with security and procurement.", "risk"],
    ["Procurement timeline", "Can you send the implementation milestones and the exact owner for security sign-off?", "Yes. The security sign-off is with our solutions lead, and I attached the milestone plan for the rollout."],
    ["Commercial approval", "Finance is comfortable with the license level, but they need the payment schedule in plain language.", "I simplified the payment schedule and marked the renewal window clearly for your team."],
    ["Executive recap", "The executive team wants a short recap before they approve the next phase.", "I prepared a one-page recap covering business impact, timeline, and open decisions."],
    ["Integration scope", "Please confirm whether the first phase includes Salesforce and support desk sync.", "Phase one includes Salesforce sync. Support desk sync is staged for week three after validation."],
    ["Launch readiness", "We are ready to move forward if training dates are locked this week.", "Training dates are reserved and the onboarding plan is ready for approval."],
  ].map(([subject, customer, team, risk], index) => ({
    subject,
    person: contacts[index % contacts.length].name,
    date: `2026-06-${String(12 - index).padStart(2, "0")}T${String(10 + index).padStart(2, "0")}:15:00`,
    risk: risk === "risk",
    messages: [
      { side: "customer", author: contacts[index % contacts.length].name, body: customer },
      { side: "team", author: accountDeal.owner, body: team },
      { side: "customer", author: contacts[(index + 1) % contacts.length].name, body: "That works. Please keep this thread updated when the next milestone is complete." },
    ],
  }));
  return [...existing, ...generated].slice(0, 6);
}

function renderAccountThread(thread) {
  return `<section class="thread-card ${thread.risk ? "risk-thread" : ""}"><header><div><strong>${escapeHtml(thread.subject)}</strong><small>${thread.risk ? "Anger detected · " : ""}${escapeHtml(thread.person)} · ${formatTimestamp(thread.date)}</small></div>${thread.risk ? `<span class="risk-label">Red risk</span>` : ""}</header><div class="thread-messages">${thread.messages.map((message) => `<div class="message-bubble ${message.side}"><small>${escapeHtml(message.author)}</small><p>${escapeHtml(message.body)}</p></div>`).join("")}</div></section>`;
}

function renderActivities() {
  const tasks = [...currentTenant().tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || a.due.localeCompare(b.due));
  return `${renderPageHeader("Activities", "Stay on top of meetings, follow-ups, and deal updates.")}<div class="section-toolbar"><strong>${openTasks().length} open tasks</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-task">＋ New activity</button></div><section class="activity-card">${tasks.length ? tasks.map(renderTaskRow).join("") : `<p class="empty-state">No activities yet.</p>`}</section>`;
}

function renderTaskRow(task) {
  const deal = currentTenant().deals.find((item) => item.id === task.dealId);
  const [label, klass] = taskStatus(task);
  return `<div class="activity-feed-row ${task.completed ? "completed" : ""}"><button class="task-check" data-action="toggle-task" data-id="${task.id}">${task.completed ? "✓" : ""}</button><button class="activity-main" data-open-deal="${task.dealId}"><span class="list-primary">${escapeHtml(task.title)}<small>${escapeHtml(task.type)} · ${escapeHtml(deal?.name || "Unlinked")} · ${escapeHtml(task.owner)}</small></span></button><span class="muted">${formatDate(task.due)}</span><span class="priority ${klass}">${label}</span><button class="button small danger" data-action="delete-task" data-id="${task.id}">Delete</button></div>`;
}

function renderInbox() {
  const items = [...currentTenant().communications].sort((a, b) => b.date.localeCompare(a.date));
  return `${renderPageHeader("Inbox", "Keep customer communication attached to every opportunity.")}<div class="section-toolbar"><strong>${items.length} logged interactions</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="compose-email">＋ Log email</button></div><section class="activity-card">${items.map((item) => {
    const deal = currentTenant().deals.find((candidate) => candidate.id === item.dealId);
    return `<div class="communication-row"><span class="activity-symbol">${item.type === "Meeting" ? "◴" : "✉"}</span><button class="activity-main" data-open-deal="${item.dealId}"><span class="list-primary">${escapeHtml(item.subject)}<small>${escapeHtml(deal?.name || "Unlinked")} · ${escapeHtml(item.owner)} · ${escapeHtml(item.tracked)}</small></span></button><span class="muted">${formatTimestamp(item.date)}</span><button class="button small danger" data-action="delete-communication" data-id="${item.id}">Delete</button></div>`;
  }).join("") || `<p class="empty-state">No communication logged yet.</p>`}</section>`;
}

function renderModal() {
  if (ui.modal === "tenant") return renderTenantForm();
  if (ui.modal === "deal") return renderDealForm();
  if (ui.modal === "task") return renderTaskForm();
  if (ui.modal === "email") return renderEmailForm();
  if (ui.modal === "settings") return renderSettings();
  if (ui.selected) return renderDealDrawer(currentTenant().deals.find((deal) => deal.id === ui.selected));
  return "";
}

function renderTenantForm() {
  const tenant = ui.editingTenant || { name: "", slug: "", plan: "Growth", status: "Active", region: "US-East", seats: 3, billingEmail: "" };
  const ownerEmail = tenantAdminEmail(tenant) || "";
  return `<div class="modal-layer center"><form class="modal" data-tenant-form><header class="modal-head"><div><h2>${tenant.id ? "Edit tenant" : "Create tenant"}</h2><p class="subcopy">${tenant.id ? "Change tenant details, login access, and billing metadata." : "Provision a workspace, owner, and empty CRM data set."}</p></div><button type="button" class="close-button" data-action="close">×</button></header><div class="form-grid">${formField("Tenant name", "name", tenant.name, "text", true)}${formField("Tenant ID", "slug", tenant.slug, "text", true)}${selectField("Plan", "plan", ["Starter", "Growth", "Enterprise"], tenant.plan)}${selectField("Status", "status", ["Active", "Trial", "Suspended"], tenant.status)}${selectField("Region", "region", ["US-East", "EU-West", "AP-South"], tenant.region)}${formField("Seats", "seats", tenant.seats, "number", true)}${formField("Tenant admin login email", "ownerEmail", ownerEmail, "email", true, "full")}${formField("Billing email", "billingEmail", tenant.billingEmail, "email", true, "full")}</div>${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}<div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">${tenant.id ? "Save tenant" : "Create tenant"}</button></div></form></div>`;
}

function renderDealForm() {
  const deal = ui.editing || { name: "", account: "", contact: "", email: "", owner: currentUser().name, stage: "Lead", value: "", close: "2026-07-01", priority: "Medium", group: ui.newGroup || "active", note: "" };
  return `<div class="modal-layer center"><form class="modal" data-deal-form><header class="modal-head"><div><h2>${deal.id ? "Edit deal" : "Create deal"}</h2><p class="subcopy">Add the details your team needs to move this opportunity forward.</p></div><button type="button" class="close-button" data-action="close">×</button></header><div class="form-grid">${formField("Deal name", "name", deal.name, "text", true, "full")}${formField("Account", "account", deal.account, "text", true)}${formField("Contact", "contact", deal.contact)}${formField("Email", "email", deal.email, "email")}${selectField("Owner", "owner", Object.keys(owners), deal.owner)}${selectField("Stage", "stage", stages, deal.stage)}${formField("Deal value", "value", deal.value, "number", true)}${formField("Close date", "close", deal.close, "date", true)}${selectField("Priority", "priority", ["High", "Medium", "Low"], deal.priority)}${selectField("Group", "group", ["active", "closed"], deal.group)}<div class="field full"><label>Notes</label><textarea name="note">${escapeHtml(deal.note || "")}</textarea></div></div><div class="form-actions">${deal.id ? `<button type="button" class="button danger" data-action="delete-deal" data-id="${deal.id}">Delete</button>` : ""}<span class="toolbar-spacer"></span><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Save deal</button></div></form></div>`;
}

function renderTaskForm() {
  const task = { dealId: ui.taskDealId || currentTenant().deals[0]?.id, title: "", type: "Follow-up", owner: currentUser().name, due: today(), priority: "Medium" };
  return `<div class="modal-layer center"><form class="modal" data-task-form><header class="modal-head"><div><h2>New activity</h2><p class="subcopy">Create a clear next step and keep the deal moving.</p></div><button type="button" class="close-button" data-action="close">×</button></header><div class="form-grid">${formField("Task", "title", task.title, "text", true, "full")}${selectField("Deal", "dealId", currentTenant().deals.map((deal) => [deal.id, deal.name]), task.dealId)}${selectField("Type", "type", ["Follow-up", "Call", "Email", "Meeting"], task.type)}${selectField("Owner", "owner", Object.keys(owners), task.owner)}${formField("Due date", "due", task.due, "date", true)}${selectField("Priority", "priority", ["High", "Medium", "Low"], task.priority)}</div><div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Save activity</button></div></form></div>`;
}

function renderEmailForm() {
  const dealId = ui.emailDealId || currentTenant().deals[0]?.id;
  return `<div class="modal-layer center"><form class="modal" data-email-form><header class="modal-head"><div><h2>Log email</h2><p class="subcopy">Capture the message and attach it to the right opportunity.</p></div><button type="button" class="close-button" data-action="close">×</button></header><div class="form-grid">${selectField("Deal", "dealId", currentTenant().deals.map((deal) => [deal.id, deal.name]), dealId)}${selectField("Direction", "direction", [["outbound", "Outbound"], ["inbound", "Inbound"]], "outbound")}${formField("Subject", "subject", "", "text", true, "full")}<div class="field full"><label>Message</label><textarea name="body" required></textarea></div></div><div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Log email</button></div></form></div>`;
}

function renderSettings() {
  const columns = [["owner", "Owner"], ["stage", "Stage"], ["value", "Deal value"], ["account", "Account"], ["close", "Close date"], ["priority", "Priority"]];
  return `<div class="modal-layer center"><section class="modal"><header class="modal-head"><div><h2>Workspace settings</h2><p class="subcopy">Configure visible columns and forecast confidence.</p></div><button class="close-button" data-action="close">×</button></header><div class="check-list">${columns.map(([key, label]) => `<label class="check-row"><input type="checkbox" data-column="${key}" ${data.visibleColumns.includes(key) ? "checked" : ""} /><span>${label}</span><small>Visible column</small></label>`).join("")}</div><h3 class="settings-heading">Stage confidence</h3><div class="probability-grid">${stages.map((stage) => `<label class="probability-row"><span>${stage}</span><input type="number" min="0" max="100" value="${data.stageProbabilities[stage]}" data-probability="${stage}" /><small>%</small></label>`).join("")}</div><h3 class="settings-heading">Custom fields</h3><div class="tag-list">${data.customFields.map((field) => `<span class="field-tag">${escapeHtml(field)}</span>`).join("")}<button class="button small" data-action="add-custom-field">＋ Add field</button></div><div class="form-actions"><button class="button" data-action="reset">Reset demo data</button><span class="toolbar-spacer"></span><button class="button primary" data-action="close">Done</button></div></section></div>`;
}

function renderDealDrawer(deal) {
  if (!deal) return "";
  return `<div class="modal-layer"><aside class="drawer"><header class="modal-head"><div><p class="subcopy">Deal details</p></div><button class="close-button" data-action="close">×</button></header><section class="detail-hero">${avatar(deal.owner, "large")}<div><h2>${escapeHtml(deal.name)}</h2><p class="subcopy">${escapeHtml(deal.account)} · ${escapeHtml(deal.contact)}</p></div></section><section class="detail-section"><div class="detail-grid"><div><span class="detail-label">Stage</span><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span></div><div><span class="detail-label">Value</span><strong>${money(deal.value)}</strong></div><div><span class="detail-label">Owner</span><span class="owner-cell">${avatar(deal.owner, "small")}${deal.owner}</span></div><div><span class="detail-label">Close date</span><span>${formatDate(deal.close)}</span></div><div><span class="detail-label">Priority</span><span class="priority priority-${deal.priority.toLowerCase()}">${deal.priority}</span></div><div><span class="detail-label">Email</span><span>${escapeHtml(deal.email || "-")}</span></div></div></section><section class="detail-section"><h3>Notes</h3><p class="subcopy">${escapeHtml(deal.note || "No notes yet.")}</p></section><section class="detail-section"><h3>Communication</h3>${currentTenant().communications.filter((item) => item.dealId === deal.id).map((item) => `<div class="message-card"><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.type)} · ${formatTimestamp(item.date)} · ${escapeHtml(item.tracked)}</small><p>${escapeHtml(item.body)}</p></div>`).join("") || `<p class="subcopy">No messages logged yet.</p>`}<button class="button small" data-action="compose-email" data-deal-id="${deal.id}">＋ Log email</button></section><section class="detail-section"><h3>Activity</h3>${currentTenant().tasks.filter((task) => task.dealId === deal.id).map((task) => { const [label, klass] = taskStatus(task); return `<div class="drawer-task"><button class="task-check" data-action="toggle-task" data-id="${task.id}">${task.completed ? "✓" : ""}</button><span>${escapeHtml(task.title)}<small>${formatDate(task.due)}</small></span><span class="priority ${klass}">${label}</span><button class="button small danger" data-action="delete-task" data-id="${task.id}">Delete</button></div>`; }).join("") || `<p class="subcopy">No tasks yet.</p>`}</section><div class="form-actions"><button class="button danger" data-action="delete-deal" data-id="${deal.id}">Delete deal</button><button class="button" data-action="add-task" data-deal-id="${deal.id}">＋ Add task</button><span class="toolbar-spacer"></span><button class="button" data-action="close">Close</button><button class="button primary" data-action="edit-deal" data-id="${deal.id}">Edit deal</button></div></aside></div>`;
}

function formField(label, name, value = "", type = "text", required = false, klass = "") {
  return `<div class="field ${klass}"><label>${label}</label><input name="${name}" type="${type}" value="${escapeHtml(String(value))}" ${required ? "required" : ""} /></div>`;
}

function selectField(label, name, options, value) {
  return `<div class="field"><label>${label}</label><select name="${name}">${options.map((item) => {
    const [optionValue, optionLabel] = Array.isArray(item) ? item : [item, item];
    return `<option value="${optionValue}" ${String(optionValue) === String(value) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
  }).join("")}</select></div>`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatMomentDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

document.addEventListener("click", async (event) => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  const section = event.target.closest("[data-section]")?.dataset.section;
  const actionElement = event.target.closest("[data-action]");
  const dealId = event.target.closest("[data-open-deal]")?.dataset.openDeal;
  const account = event.target.closest("[data-open-account]")?.dataset.openAccount;
  const contactEmail = event.target.closest("[data-open-contact]")?.dataset.openContact;
  const collapse = event.target.closest("[data-collapse]")?.dataset.collapse;
  const column = event.target.closest("[data-column]")?.dataset.column;

  if (!section && !view && !dealId && !account && !contactEmail && !collapse && !column && !actionElement) return;

  if (section) {
    ui.section = section;
    ui.selectedContactEmail = "";
    ui.selected = null;
    ui.accountFocus = "";
  }
  if (view) ui.view = view;
  if (dealId) ui.selected = Number(dealId);
  if (account) {
    ui.section = "accounts";
    ui.accountFocus = account;
    ui.selectedContactEmail = "";
    ui.selected = null;
  }
  if (contactEmail) {
    ui.section = "contacts";
    ui.selectedContactEmail = ui.selectedContactEmail === contactEmail ? "" : contactEmail;
    ui.selected = null;
  }
  if (collapse) ui.collapsed = ui.collapsed.includes(collapse) ? ui.collapsed.filter((item) => item !== collapse) : [...ui.collapsed, collapse];
  if (column) data.visibleColumns = event.target.checked ? [...data.visibleColumns, column] : data.visibleColumns.filter((item) => item !== column);

  if (actionElement) {
    const { action, group, id, dealId: taskDealId } = actionElement.dataset;
    if (action === "google-sso") {
      ui.pendingUser = findUserByEmail("admin@zeptrix.io");
      ui.authStep = "mfa";
    }
    if (action === "jump-risk-thread") {
      document.querySelector(".risk-thread")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector(".risk-thread")?.classList.add("is-highlighted");
      setTimeout(() => document.querySelector(".risk-thread")?.classList.remove("is-highlighted"), 1400);
      return;
    }
    if (action === "back-login") { ui.authStep = "password"; ui.authError = ""; }
    if (action === "logout") { session = null; saveSession(); ui.authStep = "password"; }
    if (action === "open-tenant") { ui.tenantId = id; ui.section = "pipeline"; session.tenantId = id; saveSession(); }
    if (action === "add-tenant") { ui.editingTenant = null; ui.authError = ""; ui.adminNotice = ""; ui.modal = "tenant"; }
    if (action === "add-deal") { ui.modal = "deal"; ui.editing = null; ui.newGroup = group || "active"; ui.selected = null; }
    if (action === "add-task") { ui.modal = "task"; ui.taskDealId = taskDealId ? Number(taskDealId) : null; ui.selected = null; }
    if (action === "compose-email") { ui.modal = "email"; ui.emailDealId = taskDealId ? Number(taskDealId) : null; ui.selected = null; }
    if (action === "open-settings") ui.modal = "settings";
    if (action === "edit-tenant") { ui.editingTenant = data.tenants.find((tenant) => tenant.id === id); ui.authError = ""; ui.adminNotice = ""; ui.modal = "tenant"; }
    if (action === "reset-tenant-password") {
      const tenant = data.tenants.find((item) => item.id === id);
      const loginEmail = tenant ? tenantAdminEmail(tenant) : "";
      if (actionElement.dataset.disabled === "true") {
        ui.adminNotice = "This tenant has no login user.";
      } else if (tenant && confirm(`Reset password and send a new invite to ${loginEmail}?`)) {
        try {
          const result = await resetTenantPasswordViaApi(id);
          data.inviteEmails = [
            { id: Math.max(0, ...data.inviteEmails.map((mail) => mail.id || 0)) + 1, ...result.inviteEmail },
            ...data.inviteEmails,
          ];
          data.tenants = data.tenants.map((item) => item.id === id ? { ...item, users: item.users.map((user) => ["tenant_admin", "platform_admin"].includes(user.role) ? { ...user, mustChangePassword: true } : user) } : item);
          ui.adminNotice = `Password reset sent to ${loginEmail}.`;
        } catch (error) {
          ui.adminNotice = error.message;
        }
      }
    }
    if (action === "delete-tenant") {
      const tenant = data.tenants.find((item) => item.id === id);
      if (!tenant || actionElement.dataset.disabled === "true") {
        ui.adminNotice = "Current tenant cannot be deleted.";
      } else if (confirm(`Delete ${tenant.name}? This permanently removes the tenant and its CRM data.`)) {
        try {
          await deleteTenantViaApi(id);
          data.tenants = data.tenants.filter((item) => item.id !== id);
          ui.adminNotice = `${tenant.name} was deleted.`;
          if (ui.tenantId === id) ui.tenantId = data.tenants[0]?.id || "admin";
        } catch (error) {
          ui.adminNotice = error.message;
        }
      }
    }
    if (action === "close") { ui.modal = null; ui.selected = null; ui.editing = null; ui.editingTenant = null; ui.taskDealId = null; ui.emailDealId = null; ui.authError = ""; ui.adminNotice = ""; }
    if (action === "edit-deal") { ui.selected = null; ui.editing = currentTenant().deals.find((deal) => deal.id === Number(id)); ui.modal = "deal"; }
    if (action === "toggle-task") {
      const tenant = currentTenant();
      setTenant({ ...tenant, tasks: tenant.tasks.map((task) => task.id === Number(id) ? { ...task, completed: !task.completed } : task) });
    }
    if (action === "delete-deal") {
      const tenant = currentTenant();
      setTenant({ ...tenant, deals: tenant.deals.filter((deal) => deal.id !== Number(id)), tasks: tenant.tasks.filter((task) => task.dealId !== Number(id)), communications: tenant.communications.filter((item) => item.dealId !== Number(id)) });
      ui.modal = null;
      ui.selected = null;
      ui.editing = null;
    }
    if (action === "delete-contact") {
      const email = actionElement.dataset.email?.toLowerCase();
      const tenant = currentTenant();
      setTenant({ ...tenant, deals: tenant.deals.map((deal) => deal.email?.toLowerCase() === email ? { ...deal, contact: "", email: "", updated: "Just now" } : deal) });
      ui.selected = null;
    }
    if (action === "delete-account") {
      const account = actionElement.dataset.account;
      const tenant = currentTenant();
      setTenant({ ...tenant, deals: tenant.deals.map((deal) => deal.account === account ? { ...deal, account: "", updated: "Just now" } : deal) });
      ui.selected = null;
    }
    if (action === "delete-task") {
      const tenant = currentTenant();
      setTenant({ ...tenant, tasks: tenant.tasks.filter((task) => task.id !== Number(id)) });
    }
    if (action === "delete-communication") {
      const tenant = currentTenant();
      setTenant({ ...tenant, communications: tenant.communications.filter((item) => item.id !== Number(id)) });
    }
    if (action === "add-custom-field") {
      const field = prompt("Custom field name");
      if (field?.trim() && !data.customFields.includes(field.trim())) data.customFields = [...data.customFields, field.trim()];
    }
    if (action === "clear-account-focus") ui.accountFocus = "";
    if (action === "reset") { data = structuredClone(defaultData); ui.tenantId = session?.tenantId || "admin"; }
    if (action === "export") exportCsv();
  }
  saveData();
  render();
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-search]")) return;
  ui.search = event.target.value;
  render();
  document.querySelector("[data-search]")?.focus();
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-tenant-select]")) {
    ui.tenantId = event.target.value;
    session.tenantId = ui.tenantId;
    saveSession();
    render();
    return;
  }
  if (event.target.matches("[data-saved-view]")) {
    ui.savedView = event.target.value;
    render();
    return;
  }
  if (event.target.matches("[data-probability]")) {
    data.stageProbabilities = { ...data.stageProbabilities, [event.target.dataset.probability]: Number(event.target.value) };
    saveData();
    render();
    return;
  }
  if (event.target.matches("[data-stage-filter]")) {
    ui.stageFilter = event.target.value.startsWith("☰") ? "All" : event.target.value;
    render();
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("[data-login-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    try {
      const result = await loginViaApi(values.email, values.password);
      ui.pendingUser = {
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.user.tenantId,
        mustChangePassword: result.user.mustChangePassword,
      };
    } catch {
      const user = authenticate(values.email, values.password);
      if (!user) {
        ui.authError = "Invalid email or password.";
        render();
        return;
      }
      ui.pendingUser = user;
    }
    if (!ui.pendingUser) {
      ui.authError = "Invalid email or password.";
      render();
      return;
    }
    ui.authError = "";
    ui.authStep = "mfa";
    render();
    return;
  }
  if (event.target.matches("[data-mfa-form]")) {
    event.preventDefault();
    const { code } = Object.fromEntries(new FormData(event.target));
    if (code !== MFA_CODE) {
      ui.authError = "Invalid MFA code.";
      render();
      return;
    }
    session = { email: ui.pendingUser.email, name: ui.pendingUser.name, role: ui.pendingUser.role, tenantId: ui.pendingUser.tenantId, forcePasswordChange: !!ui.pendingUser.mustChangePassword };
    ui.tenantId = session.tenantId;
    ui.section = isPlatformAdmin() ? "admin" : "home";
    ui.authError = "";
    ui.authStep = "password";
    saveSession();
    render();
    return;
  }
  if (event.target.matches("[data-change-password-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const user = findUserByEmail(session.email);
    if (values.password !== values.confirm) {
      ui.authError = "Passwords do not match.";
      render();
      return;
    }
    if (values.password === user.password) {
      ui.authError = "Choose a password different from the temporary password.";
      render();
      return;
    }
    try {
      await changePasswordViaApi(session.email, values.password);
    } catch (error) {
      ui.authError = error.message;
      render();
      return;
    }
    updateUser(session.email, { password: values.password, mustChangePassword: false });
    session.forcePasswordChange = false;
    ui.authError = "";
    saveSession();
    render();
    return;
  }
  if (event.target.matches("[data-tenant-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const id = values.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    if (ui.editingTenant) {
      try {
        const result = await updateTenantViaApi(ui.editingTenant.id, values);
        data.tenants = data.tenants.map((tenant) => tenant.id === ui.editingTenant.id ? { ...tenant, ...result.tenant, users: result.tenant.users?.length ? result.tenant.users : tenant.users, deals: tenant.deals, tasks: tenant.tasks, communications: tenant.communications } : tenant);
        if (ui.tenantId === ui.editingTenant.id) ui.tenantId = ui.editingTenant.id;
      } catch (error) {
        ui.authError = error.message;
        render();
        return;
      }
    } else {
      try {
        const result = await createTenantViaApi(values);
        data.tenants = [...data.tenants, result.tenant];
        data.inviteEmails = [
          { id: Math.max(0, ...data.inviteEmails.map((mail) => mail.id || 0)) + 1, ...result.inviteEmail },
          ...data.inviteEmails,
        ];
      } catch (error) {
        ui.authError = error.message;
        render();
        return;
      }
    }
    ui.modal = null;
    ui.editingTenant = null;
    saveData();
    render();
    return;
  }
  if (event.target.matches("[data-email-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const tenant = currentTenant();
    const communications = [{ ...values, id: Math.max(0, ...tenant.communications.map((item) => item.id)) + 1, dealId: Number(values.dealId), type: "Email", owner: currentUser().name, tracked: "Logged", date: new Date().toISOString() }, ...tenant.communications];
    setTenant({ ...tenant, communications });
    ui.modal = null;
    ui.emailDealId = null;
    render();
    return;
  }
  if (event.target.matches("[data-task-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const tenant = currentTenant();
    const tasks = [{ ...values, id: Math.max(0, ...tenant.tasks.map((task) => task.id)) + 1, dealId: Number(values.dealId), completed: false }, ...tenant.tasks];
    setTenant({ ...tenant, tasks });
    ui.modal = null;
    ui.taskDealId = null;
    render();
    return;
  }
  if (event.target.matches("[data-deal-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const tenant = currentTenant();
    const existing = ui.editing;
    const deal = { ...existing, ...values, id: existing?.id || Math.max(0, ...tenant.deals.map((item) => item.id)) + 1, value: Number(values.value), updated: "Just now" };
    const deals = existing ? tenant.deals.map((item) => item.id === existing.id ? deal : item) : [deal, ...tenant.deals];
    const tasks = deal.stage === "Proposal" && existing?.stage !== "Proposal"
      ? [{ id: Math.max(0, ...tenant.tasks.map((task) => task.id)) + 1, dealId: deal.id, title: "Follow up on proposal", type: "Follow-up", owner: deal.owner, due: daysFromNow(3), priority: "Medium", completed: false }, ...tenant.tasks]
      : tenant.tasks;
    setTenant({ ...tenant, deals, tasks });
    ui.modal = null;
    ui.editing = null;
    render();
  }
});

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-drag-deal]");
  if (card) event.dataTransfer.setData("text/plain", card.dataset.dragDeal);
});

document.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-drop-stage]")) event.preventDefault();
});

document.addEventListener("drop", (event) => {
  const column = event.target.closest("[data-drop-stage]");
  if (!column) return;
  event.preventDefault();
  const tenant = currentTenant();
  const id = Number(event.dataTransfer.getData("text/plain"));
  const stage = column.dataset.dropStage;
  setTenant({ ...tenant, deals: tenant.deals.map((deal) => deal.id === id ? { ...deal, stage, group: ["Won", "Lost"].includes(stage) ? "closed" : "active", updated: "Just now" } : deal) });
  render();
});

function exportCsv() {
  const columns = ["name", "account", "contact", "email", "owner", "stage", "value", "close", "priority", "group", "note"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns, ...currentTenant().deals.map((deal) => columns.map((column) => deal[column]))].map((row) => row.map(quote).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `${currentTenant().slug}-crm-deals.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

render();
