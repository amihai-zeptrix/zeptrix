const STORAGE_KEY = "zeptrix-saas-crm-v1";
const SESSION_KEY = "zeptrix-saas-session-v1";
const WHATS_NEW_KEY = "zeptrix-crm-whats-new-v1";
const WHATS_NEW_VERSION = "gmail-scan-paging-2026-06-15";
const GMAIL_DISCOVERY_PAGE_SIZE = 10;
const DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS = 30;
const MFA_CODE = "123456";
const SEED_ADMIN_TEMP_PASSWORD = "Tmp-Admin-7394!";
const SEED_AMIHAI_TEMP_PASSWORD = "Tmp-Amihai-5821!";
const CRM_NAMED_ROUTE_MATCH = location.pathname.match(/^\/crm\/([^/.]+)\/?$/);
const CRM_SECTION_ROUTE = CRM_NAMED_ROUTE_MATCH && ["admin", "home", "pipeline", "accounts", "campaigns", "contacts", "activities", "inbox", "reports", "settings"].includes(CRM_NAMED_ROUTE_MATCH[1]) ? CRM_NAMED_ROUTE_MATCH[1] : "";
const DEMO_ROUTE_MATCH = location.pathname.match(/^\/crm\/demo(?:\/([^/]+))?\/?$/) || (!CRM_SECTION_ROUTE ? CRM_NAMED_ROUTE_MATCH : null);
const IS_DEMO_ROUTE = !!DEMO_ROUTE_MATCH;
const DEMO_USER_NAME = DEMO_ROUTE_MATCH?.[1] || DEMO_ROUTE_MATCH?.[2] ? titleCase(DEMO_ROUTE_MATCH[1] || DEMO_ROUTE_MATCH[2]) : "Demo User";

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
const defaultTags = ["Enterprise", "Renewal", "Expansion", "At risk", "Pilot"];
const campaignRecurrences = [
  ["one-time", "One-time"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Every 3 months"],
  ["renewal-window", "Renewal window"],
];
const templateTokens = [
  ["mainContactName", "Main contact name"],
  ["accountName", "Account name"],
  ["ownerName", "Owner name"],
  ["dealName", "Deal name"],
  ["dealValue", "Deal value"],
  ["closeDate", "Close date"],
];

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
      { id: 1, name: "Enterprise rollout", account: "Orbital Systems", contact: "Liam Brooks", email: "liam@orbitalsystems.com", owner: "Noa Levi", stage: "Negotiation", value: 72000, close: "2026-06-18", priority: "High", group: "active", tags: ["Enterprise", "Renewal"], note: "Security review complete. Waiting on procurement.", updated: "Today, 09:42" },
      { id: 2, name: "Q3 expansion plan", account: "Nimbus Labs", contact: "Sophie Green", email: "sophie@nimbuslabs.io", owner: "Daniel Cohen", stage: "Proposal", value: 48500, close: "2026-06-30", priority: "Medium", group: "active", tags: ["Expansion"], note: "Proposal shared after product workshop.", updated: "Yesterday" },
      { id: 3, name: "Operations package", account: "Acme Studios", contact: "Ethan Hall", email: "ethan@acmestudios.co", owner: "Maya Bar", stage: "Qualified", value: 24000, close: "2026-07-11", priority: "Medium", group: "active", tags: ["Pilot"], note: "Needs a migration timeline.", updated: "May 29" },
      { id: 4, name: "Global account migration", account: "Atlas Freight", contact: "Lucas Martin", email: "lucas@atlasfreight.com", owner: "Avi Stein", stage: "Won", value: 96000, close: "2026-05-24", priority: "High", group: "closed", tags: ["Enterprise"], note: "Closed after successful pilot.", updated: "May 24" },
    ],
    tasks: [
      { id: 1, dealId: 1, title: "Confirm procurement timeline", type: "Follow-up", owner: "Noa Levi", due: "2026-06-13", priority: "High", completed: false },
      { id: 2, dealId: 2, title: "Review proposal feedback", type: "Email", owner: "Daniel Cohen", due: "2026-06-15", priority: "Medium", completed: false },
    ],
    communications: [
      { id: 1, dealId: 1, type: "Email", direction: "outbound", subject: "Security review follow-up", body: "Sharing the final procurement checklist and next steps.", date: "2026-06-10T09:42:00", owner: "Noa Levi", tracked: "Opened twice" },
    ],
    campaigns: [
      { id: 1, name: "Enterprise renewal readiness", audienceType: "tag", audienceValue: "Enterprise", recurrence: "renewal-window", subject: "Planning your next Zeptrix milestone", template: "Hi {{mainContactName}},\n\nAs {{accountName}} approaches the next milestone, {{ownerName}} prepared a short plan around {{dealName}} and the {{dealValue}} relationship.\n\nCan we review it before {{closeDate}}?", status: "Draft", createdAt: "2026-06-12T10:00:00" },
      { id: 2, name: "Quarterly customer health check", audienceType: "level", audienceValue: "High", recurrence: "quarterly", subject: "Quarterly health check for {{accountName}}", template: "Hi {{mainContactName}},\n\nEvery three months we like to review customer health, outcomes, risks, and next steps. {{ownerName}} would like to check how things are going with {{accountName}} and where {{dealName}} can create more value.\n\nWould next week work for a short conversation?", status: "Draft", createdAt: "2026-06-12T10:20:00" },
      { id: 3, name: "Expansion discovery pulse", audienceType: "tag", audienceValue: "Expansion", recurrence: "quarterly", subject: "New ideas for {{accountName}}", template: "Hi {{mainContactName}},\n\nBased on {{dealName}}, I see a few opportunities for {{accountName}} to expand usage. I can share a short benchmark and a practical next-step plan.\n\nBest,\n{{ownerName}}", status: "Draft", createdAt: "2026-06-12T10:40:00" },
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
      { id: 1, name: "Partner CRM launch", account: "BluePeak Advisory", contact: "Idan Yuval", email: "idan@bluepeak.example", owner: "Amihai Cohen", stage: "Proposal", value: 42000, close: "2026-06-25", priority: "High", group: "active", tags: ["Enterprise", "Expansion"], note: "Pricing review scheduled.", updated: "Today, 10:18" },
      { id: 2, name: "Support workflow", account: "Northline Apps", contact: "Yael Ron", email: "yael@northline.example", owner: "Noa Levi", stage: "Qualified", value: 18000, close: "2026-07-08", priority: "Medium", group: "active", tags: ["Pilot"], note: "Needs SLA mapping.", updated: "Yesterday" },
      { id: 3, name: "Renewal package", account: "Cedar Retail", contact: "Tom Bar", email: "tom@cedar.example", owner: "Amihai Cohen", stage: "Won", value: 28000, close: "2026-06-02", priority: "Low", group: "closed", tags: ["Renewal"], note: "Renewed for 12 months.", updated: "Jun 2" },
    ],
    tasks: [
      { id: 1, dealId: 1, title: "Send revised quote", type: "Email", owner: "Amihai Cohen", due: "2026-06-14", priority: "High", completed: false },
    ],
    communications: [
      { id: 1, dealId: 1, type: "Meeting", direction: "inbound", subject: "Pricing workshop", body: "Reviewed Growth plan and data migration needs.", date: "2026-06-11T15:30:00", owner: "Amihai Cohen", tracked: "45 min" },
    ],
    campaigns: [
      { id: 1, name: "Expansion stakeholder note", audienceType: "tag", audienceValue: "Expansion", recurrence: "monthly", subject: "Next step for {{accountName}}", template: "Hi {{mainContactName}},\n\nFollowing {{dealName}}, I wanted to share a tailored rollout plan for {{accountName}}.\n\n{{ownerName}} can walk through it this week.", status: "Draft", createdAt: "2026-06-12T11:00:00" },
      { id: 2, name: "Quarterly customer health check", audienceType: "level", audienceValue: "High", recurrence: "quarterly", subject: "Quarterly health check for {{accountName}}", template: "Hi {{mainContactName}},\n\nEvery three months we like to review customer health, outcomes, risks, and next steps. {{ownerName}} can review how things are going with {{accountName}}, what is working, and where {{dealName}} needs more support.\n\nWould you like to schedule a quick review?", status: "Draft", createdAt: "2026-06-12T11:20:00" },
      { id: 3, name: "Renewal value recap", audienceType: "tag", audienceValue: "Renewal", recurrence: "renewal-window", subject: "Value recap before renewal for {{accountName}}", template: "Hi {{mainContactName}},\n\nAhead of {{closeDate}}, I prepared a short recap of outcomes from {{dealName}} and the next value areas for {{accountName}}.\n\nBest,\n{{ownerName}}", status: "Draft", createdAt: "2026-06-12T11:40:00" },
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

const defaultGmailIntegration = {
  enabled: false,
  status: "Not connected",
  accountEmail: "",
  workspaceDomain: "zeptrix.io",
  clientId: "",
  redirectUri: "https://www.zeptrix.io/api/gmail/oauth/callback",
  labels: "Inbox, Sent",
  gmailLookbackDays: DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS,
  staleMonths: 3,
  detectNewContacts: true,
  detectDormantContacts: true,
  lastScanAt: "",
};

let data = loadData();
let session = loadSession();
let ui = {
  authStep: "password",
  pendingUser: null,
  authError: "",
  tenantId: session?.tenantId || "admin",
  section: CRM_SECTION_ROUTE || "admin",
  view: "table",
  savedView: "All deals",
  search: "",
  contactSearch: "",
  activityFilter: "open",
  stageFilter: "All",
  selected: null,
  modal: null,
  editing: null,
  editingTenant: null,
  adminNotice: "",
  newGroup: "active",
  inlineDealGroup: null,
  inlineContactOpen: false,
  taskDealId: null,
  emailDealId: null,
  collapsed: [],
  accountFocus: "",
  selectedContactEmail: "",
  selectedCommunicationId: null,
  selectedCampaignId: null,
  settingsTab: "mail",
  gmailDiscoveryPage: 1,
  gmailNotice: "",
  addedGmailContacts: new Set(),
  skippedGmailContacts: new Set(),
  gmailScanProgress: null,
  toasts: [],
  replyingThread: "",
  correspondenceDrafts: {},
  campaignDraft: {
    name: "Renewal planning outreach",
    audienceType: "tag",
    audienceValue: "Enterprise",
    recurrence: "one-time",
    subject: "Next step for {{accountName}}",
    template: "Hi {{mainContactName}},\n\nI prepared a short plan for {{accountName}} around {{dealName}}. {{ownerName}} can walk through the next step before {{closeDate}}.\n\nBest,\n{{ownerName}}",
  },
};

handleGmailCallbackQuery();
loadStateFromApi();
if (IS_DEMO_ROUTE) applyDemoSession();

function handleGmailCallbackQuery() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("gmail") === "connected") {
    ui.section = "settings";
    ui.settingsTab = "mail";
    ui.gmailNotice = "Gmail connected. Refreshing integration status...";
    window.history.replaceState({}, "", window.location.pathname);
  }
  if (params.get("gmail") === "error") {
    ui.section = "settings";
    ui.settingsTab = "mail";
    ui.gmailNotice = `Gmail connection failed: ${params.get("detail") || "Unknown error."}`;
    window.history.replaceState({}, "", window.location.pathname);
  }
}

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
    deals: (tenant.deals || []).map((deal) => ({ ...deal, tags: deal.tags || defaultAccountTags(deal) })),
    campaigns: (tenant.campaigns?.length ? tenant.campaigns : defaultCampaignsForTenant(tenant)).map((campaign) => ({ recurrence: "one-time", ...campaign })),
    gmailIntegration: { ...defaultGmailIntegration, ...(tenant.gmailIntegration || {}) },
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

function defaultAccountTags(deal) {
  if (deal.priority === "High") return ["Enterprise"];
  if (deal.stage === "Won") return ["Renewal"];
  if (deal.stage === "Proposal") return ["Expansion"];
  return ["Pilot"];
}

function defaultCampaignsForTenant(tenant) {
  const tags = new Set((tenant.deals || []).flatMap((deal) => deal.tags || defaultAccountTags(deal)));
  const examples = [
    { id: 1, name: "Quarterly customer health check", audienceType: "level", audienceValue: "High", recurrence: "quarterly", subject: "Quarterly health check for {{accountName}}", template: "Hi {{mainContactName}},\n\nEvery three months we like to review customer health, outcomes, risks, and next steps. {{ownerName}} would like to check how things are going with {{accountName}} and where {{dealName}} can create more value.\n\nWould next week work for a short conversation?", status: "Draft", createdAt: "2026-06-12T10:20:00" },
    { id: 2, name: "Expansion discovery pulse", audienceType: "tag", audienceValue: "Expansion", recurrence: "quarterly", subject: "New ideas for {{accountName}}", template: "Hi {{mainContactName}},\n\nBased on {{dealName}}, I see a few opportunities for {{accountName}} to expand usage. I can share a short benchmark and a practical next-step plan.\n\nBest,\n{{ownerName}}", status: "Draft", createdAt: "2026-06-12T10:40:00" },
    { id: 3, name: "Renewal value recap", audienceType: "tag", audienceValue: "Renewal", recurrence: "renewal-window", subject: "Value recap before renewal for {{accountName}}", template: "Hi {{mainContactName}},\n\nAhead of {{closeDate}}, I prepared a short recap of outcomes from {{dealName}} and the next value areas for {{accountName}}.\n\nBest,\n{{ownerName}}", status: "Draft", createdAt: "2026-06-12T11:00:00" },
  ];
  return examples.filter((campaign) => campaign.audienceType !== "tag" || tags.has(campaign.audienceValue));
}

function loadSession() {
  try {
    const storedSession = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (storedSession?.role === "demo_user" && !IS_DEMO_ROUTE) return null;
    if (storedSession && storedSession.role !== "demo_user" && !storedSession.apiToken) return null;
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
  ensureClientDemoTenant();
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

function ensureClientDemoTenant() {
  if (data.tenants.some((tenant) => tenant.slug === "demo" || tenant.id === "demo")) return;
  const template = data.tenants.find((tenant) => tenant.slug === "admin") || data.tenants[0];
  data.tenants = [
    ...data.tenants,
    {
      ...structuredClone(template),
      id: "demo",
      name: "CRM Demo",
      slug: "demo",
      plan: "Enterprise",
      status: "Active",
      region: "US-East",
      seats: 6,
      billingEmail: "demo@zeptrix.io",
      users: [],
    },
  ];
}

function currentTenant() {
  return data.tenants.find((tenant) => tenant.id === ui.tenantId) || data.tenants[0];
}

function setTenant(nextTenant) {
  data.tenants = data.tenants.map((tenant) => tenant.id === nextTenant.id ? nextTenant : tenant);
  saveData();
}

function localRecordId(prefix = "local") {
  return crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function setGmailStatus(status, tenant = currentTenant()) {
  const previous = gmailIntegration(tenant);
  setTenant({ ...tenant, gmailIntegration: { ...previous, status } });
  ui.section = "settings";
  ui.settingsTab = "mail";
  render();
}

function pollGmailScanProgress(tenantId, scanId) {
  return window.setInterval(async () => {
    try {
      ui.gmailScanProgress = { ...(ui.gmailScanProgress || {}), ...(await gmailScanProgressViaApi(tenantId, scanId)), active: true };
      render();
    } catch (error) {
      ui.gmailScanProgress = { ...(ui.gmailScanProgress || {}), status: "progress unavailable", error: error.message, active: true };
      render();
    }
  }, 5000);
}

function showToast(message) {
  const toast = { id: Date.now(), message };
  ui.toasts = [toast, ...ui.toasts].slice(0, 3);
  render();
  window.setTimeout(() => {
    ui.toasts = ui.toasts.filter((item) => item.id !== toast.id);
    render();
  }, 2600);
}

function maybeShowWhatsNew() {
  if (IS_DEMO_ROUTE || session?.forcePasswordChange) return;
  if (localStorage.getItem(WHATS_NEW_KEY) === WHATS_NEW_VERSION) return;
  ui.modal = "whats-new";
}

function dismissWhatsNew() {
  localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW_VERSION);
  if (ui.modal === "whats-new") ui.modal = null;
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
    headers: { "content-type": "application/json", ...(session?.apiToken ? { authorization: `Bearer ${session.apiToken}` } : {}), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 401 && body.error === "Authentication required."
      ? "Please sign in again to continue."
      : body.error || body.detail || "Request failed.";
    throw new Error(message);
  }
  return body;
}

async function loadStateFromApi() {
  try {
    const remote = await apiRequest("/api/state");
    data = normalizeData({ ...data, tenants: remote.tenants, inviteEmails: remote.inviteEmails });
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

async function createDealViaApi(tenantId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/deals`, { method: "POST", body: JSON.stringify(values) });
}

async function updateDealViaApi(tenantId, dealId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/deals/${encodeURIComponent(dealId)}`, { method: "PUT", body: JSON.stringify(values) });
}

async function deleteDealViaApi(tenantId, dealId) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/deals/${encodeURIComponent(dealId)}`, { method: "DELETE" });
}

async function saveGmailSettingsViaApi(tenantId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/gmail`, { method: "PUT", body: JSON.stringify(values) });
}

async function saveConfigurationViaApi(tenantId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/configuration`, { method: "PUT", body: JSON.stringify(values) });
}

async function connectGmailViaApi(tenantId) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/gmail/connect`, { method: "POST" });
}

async function scanGmailViaApi(tenantId, scanId = "") {
  const suffix = scanId ? `?scanId=${encodeURIComponent(scanId)}` : "";
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/gmail/scan${suffix}`, { method: "POST" });
}

async function gmailScanProgressViaApi(tenantId, scanId) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/gmail/scan-progress?scanId=${encodeURIComponent(scanId)}`);
}

async function skipGmailContactViaApi(tenantId, contact) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/gmail/skip`, { method: "POST", body: JSON.stringify(contact) });
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
      ${renderToasts()}
      ${renderModal()}
    </div>`;
}

function renderToasts() {
  return `<div class="toast-stack" aria-live="polite">${ui.toasts.map((toast) => `<div class="toast">${escapeHtml(toast.message)}</div>`).join("")}</div>`;
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
      ${sideLink("campaigns", "◉", "Campaigns", tenant.campaigns?.length || 0)}
      ${sideLink("contacts", "♙", "Contacts", uniqueBy("email").length)}
      ${sideLink("activities", "✓", "Activities", openTasks().length)}
      ${sideLink("inbox", "✉", "Inbox", tenant.communications.length)}
      ${sideLink("reports", "◴", "Reports")}
      ${sideLink("settings", "⚙", "Settings")}
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
  if (ui.section === "campaigns") return renderCampaigns();
  if (ui.section === "activities") return renderActivities();
  if (ui.section === "inbox") return renderInbox();
  if (ui.section === "reports") return `${renderPageHeader("Reports", "Monitor pipeline health and sales performance.")}${renderDashboard()}`;
  if (ui.section === "settings") return renderSettingsPage();
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
      <article class="widget"><h3>Today's focus</h3><button class="summary-card focus-card" data-action="open-activities"><span class="summary-icon" style="background:var(--orange-soft);color:var(--orange)">◴</span><div><small>Open tasks</small><strong>${tasks.length}</strong></div><span class="summary-trend">Open</span></button></article>
      <article class="widget"><div class="panel-head"><h3>Correspondence needing attention</h3><span class="thread-actions"><button class="risk-jump-button small" data-action="jump-home-risk-thread" data-tooltip="Jump to red correspondence" aria-label="Jump to red correspondence">!</button><button class="icon-button small" data-action="open-inbox" data-tooltip="Open inbox" aria-label="Open inbox">↗</button></span></div><div class="home-thread-list">${homeCorrespondenceNeedingAttention(tenant).map(renderHomeAttentionThread).join("") || `<p class="empty-state compact">No correspondence needs attention.</p>`}</div></article>
      <article class="widget wide"><div class="panel-head"><h3>Relationship events</h3><button class="icon-button small" data-action="open-activities" data-tooltip="Open activities" aria-label="Open activities">↗</button></div><div class="home-event-list">${homeEvents(tenant).map(renderHomeEvent).join("")}</div></article>
    </section>`;
}

function homeCorrespondenceNeedingAttention(tenant = currentTenant()) {
  const attentionDeals = accountsNeedingAttention(tenant).map((item) => item.primaryDeal).slice(0, 3);
  return attentionDeals.flatMap((deal) => {
    const contacts = topAccountContacts(deal);
    return accountCorrespondence(deal, contacts)
      .filter((thread) => thread.risk || /approval|timeline|launch|renew/i.test(thread.subject))
      .map((thread) => ({ ...thread, account: deal.account, dealId: deal.id }));
  }).sort((a, b) => Number(b.risk) - Number(a.risk)).slice(0, 3);
}

function renderHomeAttentionThread(thread) {
  return `<section class="thread-card home-thread-card ${thread.risk ? "risk-thread" : ""}"><header><div><strong>${escapeHtml(thread.subject)}</strong><small>${thread.risk ? "Anger detected · " : ""}${escapeHtml(thread.account)} · ${formatTimestamp(thread.date)}</small></div><span class="thread-actions">${thread.risk ? `<span class="risk-label">Red risk</span>` : ""}<button class="icon-button small" data-open-account="${escapeHtml(thread.account)}" data-tooltip="Open account" aria-label="Open account">↗</button></span></header><div class="thread-messages">${thread.messages.map((message) => `<div class="message-bubble ${message.side}"><small>${escapeHtml(message.author)}</small><p>${escapeHtml(message.body)}</p></div>`).join("")}</div></section>`;
}

function homeEvents(tenant = currentTenant()) {
  const dealById = new Map(tenant.deals.map((deal) => [String(deal.id), deal]));
  const dueTasks = openTasks(tenant).slice(0, 3).map((task) => {
    const deal = dealById.get(String(task.dealId));
    return { date: task.due, title: task.title, detail: `${task.type} · ${task.owner}`, type: "Task", account: deal?.account || "Unassigned account" };
  });
  const closeDates = tenant.deals
    .filter((deal) => !["Won", "Lost"].includes(deal.stage))
    .sort((a, b) => a.close.localeCompare(b.close))
    .slice(0, 3)
    .map((deal) => ({ date: deal.close, title: "Target close date", detail: `${deal.name} · ${money(deal.value)}`, type: "Deal", account: deal.account }));
  const seenContacts = new Set();
  const birthdays = tenant.deals
    .filter((deal) => {
      const key = deal.email || deal.contact;
      if (!deal.contact || seenContacts.has(key)) return false;
      seenContacts.add(key);
      return true;
    })
    .slice(0, 5)
    .map((deal) => ({ date: birthdayDate(deal.contact), title: `${deal.contact}'s birthday`, detail: "Send a personal note", type: "Birthday", account: deal.account }));
  return [...dueTasks, ...closeDates, ...birthdays].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
}

function renderHomeEvent(event) {
  return `<div class="moment-row home-event-row"><span class="moment-date">${formatMomentDate(event.date)}</span><div><strong>${escapeHtml(event.title)}</strong><small><button class="event-account" data-open-account="${escapeHtml(event.account)}">${escapeHtml(event.account)}</button>${escapeHtml(event.type)} · ${escapeHtml(event.detail)}</small></div></div>`;
}

function birthdayDate(seed) {
  const charTotal = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const month = String(1 + charTotal % 12).padStart(2, "0");
  const day = String(1 + charTotal % 27).padStart(2, "0");
  return `2026-${month}-${day}`;
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
      ${isCollapsed ? "" : `<table class="crm-table"><thead><tr><th class="select-col"><input type="checkbox" /></th><th class="deal-col">Deal name</th>${data.visibleColumns.map(columnHeading).join("")}<th class="more-col"></th></tr></thead><tbody>${deals.length ? deals.map(renderRow).join("") : `<tr><td colspan="10" class="empty-state">No deals match this view.</td></tr>`}${ui.inlineDealGroup === key ? renderInlineDealRow(key) : ""}<tr class="add-row"><td></td><td colspan="8"><button class="add-item" data-action="add-deal" data-group="${key}">＋ Add deal</button></td></tr></tbody></table>`}
    </section>`;
}

function renderInlineDealRow(group = "active") {
  return `<tr class="inline-deal-row"><td></td><td colspan="8"><form class="inline-add-form deal-inline-form" data-inline-deal-form data-group="${escapeHtml(group)}"><input name="name" placeholder="Deal name" required /><input name="account" placeholder="Account" required /><input name="contact" placeholder="Contact" /><input name="email" type="email" placeholder="Email" /><select name="owner">${Object.keys(owners).map((owner) => `<option>${escapeHtml(owner)}</option>`).join("")}</select><select name="stage">${stages.map((stage) => `<option ${stage === "Lead" ? "selected" : ""}>${stage}</option>`).join("")}</select><input name="value" type="number" min="0" placeholder="Value" value="0" /><input name="close" type="date" value="${daysFromNow(30)}" /><select name="priority"><option>Medium</option><option>High</option><option>Low</option></select><span class="row-actions"><button class="button small primary">Save</button><button type="button" class="button small" data-action="cancel-inline-add">Cancel</button></span></form></td></tr>`;
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
  const allContacts = uniqueBy("email");
  const contacts = filteredContacts(allContacts);
  const query = ui.contactSearch.trim();
  return `${renderPageHeader("Contacts", "Keep the people behind every opportunity organized.")}<div class="section-toolbar"><strong>${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}</strong><span class="toolbar-spacer"></span><button class="button" data-action="open-import">⇪ Import</button><button class="button primary" data-action="add-contact">＋ Add contact</button></div><div class="contact-search-bar"><label class="table-search contact-search"><span>⌕</span><input data-contact-search value="${escapeHtml(ui.contactSearch)}" placeholder="Search contacts, accounts, email, owner, deal, stage..." /></label>${query ? `<button class="button small" data-action="clear-contact-search">Clear</button>` : ""}</div>${renderImportStrip()}<section class="list-card">${ui.inlineContactOpen ? renderInlineContactRow() : ""}${contacts.map(renderContactRow).join("") || (!ui.inlineContactOpen ? `<p class="empty-state">${query ? `No contacts match "${escapeHtml(query)}".` : "No contacts yet."}</p>` : "")}</section>`;
}

function renderInlineContactRow() {
  return `<form class="list-row contact-row inline-contact-row" data-inline-contact-form><span class="activity-symbol">＋</span><span class="inline-field-stack"><input name="contact" placeholder="Contact name" required /><input name="email" type="email" placeholder="Email" required /></span><input name="phone" placeholder="Phone" /><input name="account" placeholder="Account" required /><select name="owner">${Object.keys(owners).map((owner) => `<option ${owner === currentUser().name ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select><span class="row-actions"><button class="button small primary">Save</button><button type="button" class="button small" data-action="cancel-inline-add">Cancel</button></span></form>`;
}

function filteredContacts(contacts = uniqueBy("email")) {
  const query = ui.contactSearch.trim().toLowerCase();
  if (!query) return contacts;
  return contacts.filter((deal) => [
    deal.contact,
    deal.account,
      deal.email,
      deal.phone,
    deal.owner,
    deal.name,
    deal.stage,
    deal.priority,
    deal.note,
  ].join(" ").toLowerCase().includes(query));
}

function renderContactRow(deal) {
  const isOpen = ui.selectedContactEmail === deal.email;
  return `<div class="list-row contact-row ${isOpen ? "is-open" : ""}">${avatar(deal.owner)}<button class="activity-main" data-open-contact="${escapeHtml(deal.email)}"><span class="list-primary">${escapeHtml(deal.contact)}<small>${escapeHtml(deal.email)}</small></span></button><span class="muted contact-phone">${escapeHtml(deal.phone || "-")}</span><button class="inline-link" data-open-account="${escapeHtml(deal.account)}">${escapeHtml(deal.account)}</button><span class="muted">Owner: ${escapeHtml(deal.owner)}</span><button class="button small danger" data-action="delete-contact" data-email="${escapeHtml(deal.email)}">Delete</button></div>${isOpen ? renderContactDetail(deal) : ""}`;
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
  return `${renderPageHeader("Accounts", "Track customers and prospects at the company level.")}<div class="section-toolbar"><strong>${accounts.length} accounts</strong><span class="toolbar-spacer"></span><button class="button" data-action="open-import">⇪ Import</button><button class="button primary" data-action="add-deal">＋ Add account</button></div>${renderImportStrip()}<section class="list-card">${accounts.map((deal) => `<div class="list-row account-row"><span class="account-mark">${initials(deal.account)}</span><button class="activity-main" data-open-account="${escapeHtml(deal.account)}"><span class="list-primary">${escapeHtml(deal.account)}<small>${escapeHtml(deal.contact)}</small><span class="account-tags">${accountTags(deal.account).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</span></span></button><strong>${money(total(currentTenant().deals.filter((item) => item.account === deal.account)))}</strong><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span><button class="button small danger" data-action="delete-account" data-account="${escapeHtml(deal.account)}">Delete</button></div>`).join("") || `<p class="empty-state">No accounts yet.</p>`}</section>`;
}

function allAccountTags() {
  return [...new Set([...defaultTags, ...currentTenant().deals.flatMap((deal) => deal.tags || [])])].sort();
}

function accountTags(account) {
  return [...new Set(currentTenant().deals.filter((deal) => deal.account === account).flatMap((deal) => deal.tags || []))].sort();
}

function setAccountTags(account, tags) {
  const tenant = currentTenant();
  setTenant({ ...tenant, deals: tenant.deals.map((deal) => deal.account === account ? { ...deal, tags } : deal) });
}

function accountLevel(deal) {
  return deal.priority;
}

function campaignRecipients(audienceType, audienceValue) {
  const accounts = uniqueBy("account");
  if (!audienceType || audienceType === "tag") return accounts.filter((deal) => accountTags(deal.account).includes(audienceValue || allAccountTags()[0]));
  if (audienceType === "level") return accounts.filter((deal) => accountLevel(deal) === audienceValue);
  if (audienceType === "name") return accounts.filter((deal) => deal.account === audienceValue);
  return accounts;
}

function mergeDataForDeal(deal) {
  return {
    mainContactName: deal?.contact || "customer",
    accountName: deal?.account || "account",
    ownerName: deal?.owner || currentUser().name,
    dealName: deal?.name || "your next initiative",
    dealValue: deal ? money(deal.value) : "$0",
    closeDate: deal ? formatDate(deal.close) : "the target date",
  };
}

function renderMergedTemplate(template, deal) {
  const data = mergeDataForDeal(deal);
  return escapeHtml(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => `<strong>${escapeHtml(data[key] || "")}</strong>`).replace(/\n/g, "<br>");
}

function renderImportStrip() {
  return `<section class="import-strip"><button data-action="import-source" data-source="csv"><strong>CSV</strong><small>Upload accounts and contacts from a spreadsheet</small></button><button data-action="import-source" data-source="salesforce"><strong>Salesforce</strong><small>Sync leads, accounts, contacts, and owners</small></button><button data-action="import-source" data-source="zendesk"><strong>Zendesk</strong><small>Bring support contacts and account context</small></button></section>`;
}

function renderCampaigns() {
  const tenant = currentTenant();
  const campaigns = tenant.campaigns || [];
  const draft = ui.campaignDraft;
  const tags = allAccountTags();
  const accounts = uniqueBy("account");
  const levels = ["High", "Medium", "Low"];
  const audienceOptions = draft.audienceType === "level" ? levels : draft.audienceType === "name" ? accounts.map((deal) => deal.account) : tags;
  const audienceValue = draft.audienceValue || audienceOptions[0] || "";
  const recipients = campaignRecipients(draft.audienceType, audienceValue);
  const previewDeal = recipients[0] || accounts[0];
  const selectedCampaign = campaigns.find((campaign) => String(campaign.id) === String(ui.selectedCampaignId));
  return `${renderPageHeader("Campaigns", "Segment customers, personalize outreach, and keep every campaign tied to account data.")}
    <section class="campaign-layout">
      <article class="widget">
        <div class="panel-head"><h3>Existing campaigns</h3><span class="thread-actions"><button class="icon-button small" data-action="new-campaign" data-tooltip="New campaign" aria-label="New campaign">＋</button><span class="count">${campaigns.length}</span></span></div>
        <div class="campaign-list">${campaigns.map((campaign) => {
          const recipients = campaignRecipients(campaign.audienceType, campaign.audienceValue);
          const isSelected = String(campaign.id) === String(ui.selectedCampaignId);
          return `<button class="campaign-card ${isSelected ? "is-selected" : ""}" data-open-campaign="${campaign.id}"><strong>${escapeHtml(campaign.name)}</strong><small>${escapeHtml(campaign.status)} · ${escapeHtml(recurrenceLabel(campaign.recurrence))} · ${escapeHtml(campaign.audienceType)}: ${escapeHtml(campaign.audienceValue)} · ${recipients.length} accounts</small><p>${renderMergedTemplate(campaign.subject, recipients[0] || accounts[0])}</p></button>`;
        }).join("") || `<p class="empty-state compact">No campaigns yet.</p>`}</div>
      </article>
      ${selectedCampaign ? renderCampaignDetail(selectedCampaign) : `<form class="widget campaign-builder" data-campaign-form>
        <h3>Add campaign</h3>
        <div class="campaign-fields">
          <label class="field"><span>Name</span><input name="name" value="${escapeHtml(draft.name)}" data-campaign-field required /></label>
          <label class="field"><span>Audience</span><select name="audienceType" data-campaign-field><option value="tag" ${draft.audienceType === "tag" ? "selected" : ""}>By tag</option><option value="level" ${draft.audienceType === "level" ? "selected" : ""}>By level</option><option value="name" ${draft.audienceType === "name" ? "selected" : ""}>By account name</option></select></label>
          <label class="field"><span>Selector</span><select name="audienceValue" data-campaign-field>${audienceOptions.map((option) => `<option value="${escapeHtml(option)}" ${option === audienceValue ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>
          <label class="field"><span>Recurrence</span><select name="recurrence" data-campaign-field>${campaignRecurrences.map(([value, label]) => `<option value="${value}" ${value === draft.recurrence ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
          <label class="field"><span>Subject</span><input name="subject" value="${escapeHtml(draft.subject)}" data-campaign-field required /></label>
        </div>
        <div class="recipient-preview"><strong>${recipients.length} selected accounts</strong><span>${recipients.map((deal) => escapeHtml(deal.account)).join(", ") || "No matching accounts"}</span></div>
        <div class="token-bar">${templateTokens.map(([token, label]) => `<button type="button" class="field-tag" data-action="insert-template-token" data-token="${token}">${escapeHtml(label)}</button>`).join("")}</div>
        <label class="field"><span>Template markup</span><textarea name="template" data-campaign-template data-campaign-field rows="8" required>${escapeHtml(draft.template)}</textarea></label>
        <section class="campaign-preview"><small>Preview for ${escapeHtml(previewDeal?.account || "no account")}</small><h4>${renderMergedTemplate(draft.subject, previewDeal)}</h4><p>${renderMergedTemplate(draft.template, previewDeal)}</p></section>
        <div class="form-actions"><button type="button" class="button" data-action="reset-campaign-draft">Reset</button><span class="toolbar-spacer"></span><button class="button primary">Create campaign</button></div>
      </form>`}
    </section>`;
}

function recurrenceLabel(value) {
  return campaignRecurrences.find(([key]) => key === value)?.[1] || "One-time";
}

function renderCampaignDetail(campaign) {
  const recipients = campaignRecipients(campaign.audienceType, campaign.audienceValue);
  const previewDeal = recipients[0] || uniqueBy("account")[0];
  return `<article class="widget campaign-detail">
    <div class="panel-head"><div><h3>${escapeHtml(campaign.name)}</h3><p class="subcopy">${escapeHtml(campaign.status)} campaign details</p></div><button class="button small" data-action="new-campaign">New campaign</button></div>
    <section class="campaign-detail-grid">
      <span><small>Audience</small><strong>${escapeHtml(campaign.audienceType)}: ${escapeHtml(campaign.audienceValue)}</strong></span>
      <span><small>Recurrence</small><strong>${escapeHtml(recurrenceLabel(campaign.recurrence))}</strong></span>
      <span><small>Recipients</small><strong>${recipients.length} accounts</strong></span>
      <span><small>Created</small><strong>${formatTimestamp(campaign.createdAt)}</strong></span>
    </section>
    <div class="recipient-preview"><strong>Selected accounts</strong><span>${recipients.map((deal) => escapeHtml(deal.account)).join(", ") || "No matching accounts"}</span></div>
    <section class="campaign-preview"><small>Subject preview</small><h4>${renderMergedTemplate(campaign.subject, previewDeal)}</h4><p>${renderMergedTemplate(campaign.template, previewDeal)}</p></section>
    <label class="field"><span>Template markup</span><textarea readonly rows="8">${escapeHtml(campaign.template)}</textarea></label>
  </article>`;
}

function renderAccountDetail(accountDeal, accountCount) {
  if (!accountDeal) return `${renderPageHeader("Account not found", "The selected account is no longer available.")}<button class="button" data-action="clear-account-focus">Show all accounts</button>`;
  const tenant = currentTenant();
  const accountDeals = tenant.deals.filter((deal) => deal.account === accountDeal.account);
  const contacts = topAccountContacts(accountDeal);
  const threads = accountCorrespondence(accountDeal, contacts);
  const reasons = accountAttentionReasons(accountDeal);
  return `
    ${renderPageHeader(accountDeal.account, `${accountDeals.length} active relationship ${accountDeals.length === 1 ? "record" : "records"} · ${money(total(accountDeals))} pipeline value`)}
    <div class="account-focus-banner"><span class="account-mark">${initials(accountDeal.account)}</span><div><strong>Viewing account</strong><small>${escapeHtml(accountDeal.account)} · opened from account intelligence</small></div><button class="button small" data-action="clear-account-focus">Back to account list</button></div>
    <div class="section-toolbar"><strong>Account intelligence</strong><span class="toolbar-spacer"></span><button class="button" data-action="clear-account-focus">Show all ${accountCount} accounts</button><button class="button primary" data-action="add-deal">＋ New deal</button></div>
    <section class="account-profile">
      <article class="account-panel account-summary-panel">
        <span class="account-mark large">${initials(accountDeal.account)}</span>
        <div>
          <h2>${escapeHtml(accountDeal.account)}</h2>
          <p class="subcopy">${escapeHtml(accountDeal.note || "Relationship is active and ready for follow-up.")}</p>
          <div class="account-reason-chips">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
          <div class="account-tag-editor"><span class="account-tags">${accountTags(accountDeal.account).map((tag) => `<button data-action="remove-account-tag" data-account="${escapeHtml(accountDeal.account)}" data-tag="${escapeHtml(tag)}" data-tooltip="Remove tag">${escapeHtml(tag)} ×</button>`).join("")}</span><select data-account-tag-select data-account="${escapeHtml(accountDeal.account)}"><option value="">Add tag...</option>${allAccountTags().filter((tag) => !accountTags(accountDeal.account).includes(tag)).map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}<option value="__new__">+ New tag</option></select></div>
        </div>
        <div class="account-kpis">
          <span><small>Stage</small><strong>${escapeHtml(accountDeal.stage)}</strong></span>
          <span><small>Owner</small><strong>${escapeHtml(accountDeal.owner)}</strong></span>
          <span><small>Close date</small><strong>${formatDate(accountDeal.close)}</strong></span>
        </div>
        <div class="account-summary-actions"><button class="risk-jump-button" data-action="jump-risk-thread" data-tooltip="Jump to anger correspondence" aria-label="Jump to anger correspondence">!</button><span>Anger correspondence detected</span></div>
      </article>
      <article class="account-panel">
        <h3>Top contacts</h3>
        <div class="contact-grid">${contacts.map(renderAccountContact).join("")}</div>
      </article>
      <article class="account-panel correspondence-panel">
        <div class="panel-head"><h3>Correspondence</h3><button class="icon-button small" data-action="new-correspondence" data-tooltip="Add correspondence" aria-label="Add correspondence">＋</button></div>
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
  const accountKey = slugify(accountDeal.account);
  const existing = currentTenant().communications
    .filter((item) => currentTenant().deals.find((deal) => String(deal.id) === String(item.dealId))?.account === accountDeal.account)
    .map((item, index) => ({
      id: `logged-${item.id}`,
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
    id: `${accountKey}-${slugify(subject)}`,
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
  return [...(ui.correspondenceDrafts[accountKey] || []), ...existing, ...generated].slice(0, 8);
}

function renderAccountThread(thread) {
  const isReplying = ui.replyingThread === thread.id;
  return `<section class="thread-card ${thread.risk ? "risk-thread" : ""}" data-thread-id="${escapeHtml(thread.id)}"><header><div><strong>${escapeHtml(thread.subject)}</strong><small>${thread.risk ? "Anger detected · " : ""}${escapeHtml(thread.person)} · ${formatTimestamp(thread.date)}</small></div><span class="thread-actions">${thread.risk ? `<span class="risk-label">Red risk</span>` : ""}<button class="icon-button small" data-action="reply-correspondence" data-thread-id="${escapeHtml(thread.id)}" data-tooltip="Reply" aria-label="Reply">↩</button></span></header><div class="thread-messages">${thread.messages.map((message) => `<div class="message-bubble ${message.side}"><small>${escapeHtml(message.author)}</small><p>${escapeHtml(message.body)}</p></div>`).join("")}</div>${isReplying ? renderReplyComposer(thread.id) : ""}</section>`;
}

function renderReplyComposer(threadId) {
  return `<form class="reply-composer" data-reply-form data-thread-id="${escapeHtml(threadId)}"><textarea name="body" placeholder="Write a reply..." required></textarea><div><button type="button" class="button small" data-action="cancel-reply">Cancel</button><button class="button small primary">Add reply</button></div></form>`;
}

function addCorrespondenceThread() {
  const account = ui.accountFocus || currentTenant().deals[0]?.account || "Account";
  const key = slugify(account);
  const owner = currentUser()?.name || "Zeptrix";
  const thread = {
    id: `${key}-manual-${Date.now()}`,
    subject: "New correspondence",
    person: owner,
    date: new Date().toISOString(),
    messages: [
      { side: "team", author: owner, body: "Added a new account correspondence thread for follow-up." },
    ],
  };
  ui.correspondenceDrafts = { ...ui.correspondenceDrafts, [key]: [thread, ...(ui.correspondenceDrafts[key] || [])] };
  saveData();
  render();
}

function addCorrespondenceReply(threadId, body) {
  const account = ui.accountFocus || currentTenant().deals[0]?.account || "Account";
  const key = slugify(account);
  const owner = currentUser()?.name || "Zeptrix";
  const drafts = ui.correspondenceDrafts[key] || [];
  const updatedDrafts = drafts.map((thread) => thread.id === threadId ? { ...thread, messages: [...thread.messages, { side: "team", author: owner, body }] } : thread);
  if (updatedDrafts.some((thread) => thread.id === threadId)) {
    ui.correspondenceDrafts = { ...ui.correspondenceDrafts, [key]: updatedDrafts };
  } else {
    const source = accountCorrespondence(currentTenant().deals.find((deal) => deal.account === account) || currentTenant().deals[0], topAccountContacts(currentTenant().deals.find((deal) => deal.account === account) || currentTenant().deals[0])).find((thread) => thread.id === threadId);
    if (source) {
      ui.correspondenceDrafts = { ...ui.correspondenceDrafts, [key]: [{ ...source, messages: [...source.messages, { side: "team", author: owner, body }] }, ...drafts] };
    }
  }
  ui.replyingThread = "";
  saveData();
}

function renderActivities() {
  const allTasks = [...currentTenant().tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || a.due.localeCompare(b.due));
  const tasks = ui.activityFilter === "open" ? allTasks.filter((task) => !task.completed) : allTasks;
  return `${renderPageHeader("Activities", "Stay on top of meetings, follow-ups, and deal updates.")}<div class="section-toolbar"><strong>${openTasks().length} open tasks</strong><span class="toolbar-spacer"></span><span class="segmented-control"><button class="${ui.activityFilter === "open" ? "active" : ""}" data-action="filter-activities" data-filter="open">Open</button><button class="${ui.activityFilter === "all" ? "active" : ""}" data-action="filter-activities" data-filter="all">All</button></span><button class="button primary" data-action="add-task">＋ New activity</button></div><section class="activity-card">${tasks.length ? tasks.map(renderTaskRow).join("") : `<p class="empty-state">${ui.activityFilter === "open" ? "No open activities." : "No activities yet."}</p>`}</section>`;
}

function renderTaskRow(task) {
  const deal = currentTenant().deals.find((item) => item.id === task.dealId);
  const [label, klass] = taskStatus(task);
  return `<div class="activity-feed-row ${task.completed ? "completed" : ""}"><button class="task-check" data-action="toggle-task" data-id="${task.id}" aria-label="${task.completed ? "Mark incomplete" : "Mark done"}">${task.completed ? "✓" : ""}</button><button class="activity-main" data-action="toggle-task" data-id="${task.id}"><span class="list-primary">${escapeHtml(task.title)}<small>${escapeHtml(task.type)} · ${escapeHtml(deal?.name || "Unlinked")} · ${escapeHtml(task.owner)}</small></span></button><span class="muted">${formatDate(task.due)}</span><span class="priority ${klass}">${label}</span><button class="button small danger" data-action="delete-task" data-id="${task.id}">Delete</button></div>`;
}

function renderInbox() {
  const items = [...currentTenant().communications].sort((a, b) => b.date.localeCompare(a.date));
  return `${renderPageHeader("Inbox", "Keep customer communication attached to every opportunity.")}<div class="section-toolbar"><strong>${items.length} logged interactions</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="compose-email">＋ Log email</button></div><section class="activity-card">${items.map((item) => {
    const deal = currentTenant().deals.find((candidate) => candidate.id === item.dealId);
    const isOpen = String(ui.selectedCommunicationId) === String(item.id);
    return `<div class="communication-row ${isOpen ? "is-open" : ""}"><span class="activity-symbol">${item.type === "Meeting" ? "◴" : "✉"}</span><button class="activity-main" data-open-communication="${item.id}"><span class="list-primary">${escapeHtml(item.subject)}<small>${escapeHtml(deal?.name || "Unlinked")} · ${escapeHtml(deal?.account || "No account")} · ${escapeHtml(item.owner)} · ${escapeHtml(item.tracked)}</small></span></button><span class="muted">${formatTimestamp(item.date)}</span><button class="button small danger" data-action="delete-communication" data-id="${item.id}">Delete</button></div>${isOpen ? renderInboxThread(item, deal) : ""}`;
  }).join("") || `<p class="empty-state">No communication logged yet.</p>`}</section>`;
}

function renderInboxThread(item, deal) {
  const contactName = deal?.contact || "Customer";
  const accountName = deal?.account || "Unlinked account";
  const customerBody = item.direction === "inbound" ? item.body : "Thanks for the update. Please keep this attached to the account plan so the next owner has full context.";
  const teamBody = item.direction === "inbound" ? "I logged this in the account timeline and added the next step for the owner." : item.body;
  return `<div class="inbox-thread-row"><section class="thread-card inbox-thread-card"><header><div><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(accountName)} · ${escapeHtml(contactName)} · ${formatTimestamp(item.date)}</small></div><span class="thread-actions"><button class="icon-button small" data-open-account="${escapeHtml(accountName)}" data-tooltip="Open account" aria-label="Open account">↗</button></span></header><div class="thread-messages"><div class="message-bubble customer"><small>${escapeHtml(contactName)}</small><p>${escapeHtml(customerBody)}</p></div><div class="message-bubble team"><small>${escapeHtml(item.owner)}</small><p>${escapeHtml(teamBody)}</p></div></div></section></div>`;
}

function renderModal() {
  if (ui.modal === "whats-new") return renderWhatsNewDialog();
  if (ui.modal === "gmail-oauth-guide") return renderGmailOAuthGuide();
  if (ui.modal === "tenant") return renderTenantForm();
  if (ui.modal === "deal") return renderDealForm();
  if (ui.modal === "task") return renderTaskForm();
  if (ui.modal === "email") return renderEmailForm();
  if (ui.modal === "import") return renderImportModal();
  if (ui.modal === "settings") return renderSettings();
  if (ui.selected) return renderDealDrawer(currentTenant().deals.find((deal) => String(deal.id) === String(ui.selected)));
  return "";
}

function renderWhatsNewDialog() {
  return `<div class="modal-layer center whats-new-layer"><section class="modal whats-new-modal"><div class="whats-new-window-bar"><span></span><span></span><span></span><strong>Product update</strong><button class="close-button" data-action="close-whats-new">×</button></div><div class="whats-new-frame"><header class="whats-new-head"><p class="eyebrow">What's new</p><h2>Gmail integration</h2><p>Populate accounts from Gmail and turn real inbox activity into CRM context.</p></header><div class="whats-new-hero"><div><strong>Populate accounts from Gmail</strong><p>Connect Gmail to discover new contacts, turn them into account leads, and spot relationships that need follow-up without manual spreadsheet work.</p></div><span>Gmail</span></div><div class="whats-new-grid"><article><strong>New contacts</strong><small>Find people from recent Gmail threads and add them to CRM with one click.</small></article><article><strong>Relationship health</strong><small>See contacts that have not received outbound mail in your configured time window.</small></article><article><strong>Account context</strong><small>Use imported conversations to keep accounts and next steps easier to populate.</small></article></div><div class="form-actions"><button class="button" data-action="close-whats-new">Later</button><button class="button primary" data-action="open-gmail-settings">Open Gmail integration</button></div></div></section></div>`;
}

function renderGmailOAuthGuide() {
  return `<div class="modal-layer center"><section class="modal gmail-guide-modal"><header class="modal-head"><div><h2>Configure Gmail OAuth</h2><p class="subcopy">Follow these steps in Google Cloud Console for your Google Workspace project.</p></div><button class="close-button" data-action="close">×</button></header><ol class="guide-steps"><li><strong>Open Google Cloud Console</strong><span>Go to APIs & Services, then OAuth consent screen and Clients.</span></li><li><strong>Create a Web application client</strong><span>Choose application type Web application. Do not use Desktop or Android.</span></li><li><strong>Add the JavaScript origin</strong><code>https://www.zeptrix.io</code></li><li><strong>Add the redirect URI</strong><code>https://www.zeptrix.io/api/gmail/oauth/callback</code></li><li><strong>Publish or add test users</strong><span>In Testing mode, add every Gmail account that will authorize the CRM.</span></li><li><strong>Copy the Client ID</strong><span>Paste the Client ID into this field. The client secret stays on the server.</span></li></ol><div class="form-actions"><button class="button" data-action="close">Done</button><a class="button primary" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud Console</a></div></section></div>`;
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

function renderImportModal() {
  return `<div class="modal-layer center"><section class="modal import-modal"><header class="modal-head"><div><h2>Import accounts and contacts</h2><p class="subcopy">Bring relationship data in from files and connected systems.</p></div><button class="close-button" data-action="close">×</button></header><div class="import-options"><button data-action="import-source" data-source="csv"><strong>CSV import</strong><small>Map columns like account, contact, email, phone, owner, and stage.</small></button><button data-action="import-source" data-source="salesforce"><strong>Salesforce sync</strong><small>Import leads, accounts, contacts, opportunities, owners, and stages.</small></button><button data-action="import-source" data-source="zendesk"><strong>Zendesk sync</strong><small>Import organizations, requesters, support context, and sentiment signals.</small></button></div><div class="import-preview"><h3>Demo mapping preview</h3><div class="import-map"><span>Source field</span><span>Zeptrix field</span><span>Confidence</span><strong>Company / Organization</strong><strong>Account</strong><em>High</em><strong>Name / Requester</strong><strong>Contact</strong><em>High</em><strong>Email</strong><strong>Email</strong><em>High</em><strong>Owner / Assignee</strong><strong>Owner</strong><em>Medium</em></div></div></section></div>`;
}

function renderSettings() {
  const columns = [["owner", "Owner"], ["stage", "Stage"], ["value", "Deal value"], ["account", "Account"], ["close", "Close date"], ["priority", "Priority"]];
  return `<div class="modal-layer center"><section class="modal"><header class="modal-head"><div><h2>Workspace settings</h2><p class="subcopy">Configure visible columns and forecast confidence.</p></div><button class="close-button" data-action="close">×</button></header><div class="check-list">${columns.map(([key, label]) => `<label class="check-row"><input type="checkbox" data-column="${key}" ${data.visibleColumns.includes(key) ? "checked" : ""} /><span>${label}</span><small>Visible column</small></label>`).join("")}</div><h3 class="settings-heading">Stage confidence</h3><div class="probability-grid">${stages.map((stage) => `<label class="probability-row"><span>${stage}</span><input type="number" min="0" max="100" value="${data.stageProbabilities[stage]}" data-probability="${stage}" /><small>%</small></label>`).join("")}</div><h3 class="settings-heading">Custom fields</h3><div class="tag-list">${data.customFields.map((field) => `<span class="field-tag">${escapeHtml(field)}</span>`).join("")}<button class="button small" data-action="add-custom-field">＋ Add field</button></div><div class="form-actions"><button class="button" data-action="reset">Reset demo data</button><span class="toolbar-spacer"></span><button class="button primary" data-action="close">Done</button></div></section></div>`;
}

function renderSettingsPage() {
  return `
    ${renderPageHeader("Settings", "Configure CRM integrations and workspace behavior.")}
    <nav class="settings-tabs">
      <button class="${ui.settingsTab === "mail" ? "active" : ""}" data-settings-tab="mail">Mail integrations</button>
      <button class="${ui.settingsTab === "configuration" ? "active" : ""}" data-settings-tab="configuration">Configuration</button>
    </nav>
    ${ui.settingsTab === "mail" ? renderMailIntegrationsSettings() : renderConfigurationSettingsPanel()}`;
}

function renderMailIntegrationsSettings() {
  const tenant = currentTenant();
  const gmail = gmailIntegration(tenant);
  const gmailLookbackDays = Number(gmail.gmailLookbackDays || DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS);
  const discoveries = gmailContactDiscoveries(tenant).filter((item) => !ui.addedGmailContacts.has(item.email) && !ui.skippedGmailContacts.has(item.email));
  const totalDiscoveryPages = Math.max(1, Math.ceil(discoveries.length / GMAIL_DISCOVERY_PAGE_SIZE));
  ui.gmailDiscoveryPage = Math.min(Math.max(1, ui.gmailDiscoveryPage || 1), totalDiscoveryPages);
  const discoveryStart = (ui.gmailDiscoveryPage - 1) * GMAIL_DISCOVERY_PAGE_SIZE;
  const visibleDiscoveries = discoveries.slice(discoveryStart, discoveryStart + GMAIL_DISCOVERY_PAGE_SIZE);
  const dormant = gmailDormantContacts(tenant, Number(gmail.staleMonths || 3));
  const canUseGmailBackend = !!session?.apiToken && session.role !== "demo_user";
  const actionDisabled = canUseGmailBackend ? "" : "disabled";
  return `
    <section class="settings-layout">
      <div class="settings-stack">
        <article class="settings-card">
          <div class="panel-head"><div><h3>Gmail integration</h3><p class="subcopy">Read Gmail metadata and messages to enrich contacts and engagement signals.</p></div><span class="status-pill ${gmail.enabled ? "stage-won" : "stage-lead"}">${escapeHtml(gmail.status)}</span></div>
          ${ui.gmailNotice ? `<p class="admin-notice gmail-notice ${ui.gmailNotice.toLowerCase().includes("failed") ? "error" : ""}">${escapeHtml(ui.gmailNotice)}</p>` : ""}
          <form class="settings-form" data-gmail-settings-form>
            <div class="form-grid">
              ${formField("Gmail account", "accountEmail", gmail.accountEmail, "email", true)}
              ${formField("Google Workspace domain", "workspaceDomain", gmail.workspaceDomain)}
              ${formField("OAuth client ID", "clientId", gmail.clientId, "text", false, "full", `<button type="button" class="button small oauth-guide-button" data-action="open-gmail-oauth-guide">Show me now</button>`)}
              ${formField("Authorized redirect URI", "redirectUri", gmail.redirectUri, "url", false, "full")}
              ${formField("Labels to read", "labels", gmail.labels)}
              ${formField("No-mail threshold in months", "staleMonths", gmail.staleMonths, "number", true)}
            </div>
            <div class="check-list compact">
              <label class="check-row"><input type="checkbox" name="detectNewContacts" ${gmail.detectNewContacts ? "checked" : ""} /><span>Identify new contacts from Gmail</span><small>Scans the last ${gmailLookbackDays} days of non-sent Gmail and suggests people who do not exist in CRM.</small></label>
              <label class="check-row"><input type="checkbox" name="detectDormantContacts" ${gmail.detectDormantContacts ? "checked" : ""} /><span>Find contacts with no sent mail</span><small>Default threshold is 3 months and can be changed above.</small></label>
            </div>
            ${canUseGmailBackend ? "" : `<p class="admin-notice">Gmail connection requires signing in to a workspace at /crm.</p>`}
            <div class="form-actions"><button type="button" class="button" data-action="connect-gmail" ${actionDisabled}>Connect Gmail</button><button type="button" class="button" data-action="scan-gmail" ${actionDisabled}>Scan now</button><span class="toolbar-spacer"></span><button class="button primary" ${actionDisabled}>Save Gmail settings</button></div>
            <p class="subcopy">Uses server-side OAuth with <strong>gmail.readonly</strong>; refresh tokens are encrypted on the server and the browser never stores the Google client secret.</p>
            <p class="subcopy">New-contact discovery scans the last <strong>${gmailLookbackDays} days</strong> of non-sent Gmail and filters out contacts already in CRM.</p>
          </form>
        </article>
        <article class="settings-card follow-up-card">
          <div class="panel-head"><div><h3>Contacts needing follow-up</h3><p class="subcopy">Contacts with no sent mail in the configured window.</p></div><span class="summary-icon" style="background: var(--orange-soft); color: var(--orange);">◴</span></div>
          <div class="signal-list">
            ${dormant.map((item) => `<button class="signal-row" data-open-contact="${escapeHtml(item.email)}"><span class="activity-symbol">!</span><span class="list-primary">${escapeHtml(item.contact)}<small>${escapeHtml(item.account)} · no sent mail for ${item.months} months</small></span><span class="priority priority-high">Follow up</span></button>`).join("") || `<p class="empty-state compact">No contacts are past the configured threshold.</p>`}
          </div>
        </article>
      </div>
      <article class="settings-card">
        <h3>Gmail signals</h3>
        <div class="integration-metrics">
          ${summaryCard("♙", "var(--blue-soft)", "var(--blue)", "New contacts", discoveries.length, "from Gmail")}
          ${summaryCard("◴", "var(--orange-soft)", "var(--orange)", "Dormant contacts", dormant.length, `${Number(gmail.staleMonths || 3)} months`)}
        </div>
        <div class="signal-list">
          <h4>New contacts found in Gmail</h4>
          <p class="signal-scope">Scope: last ${gmailLookbackDays} days, non-sent Gmail, excluding existing CRM contacts.</p>
          ${ui.gmailScanProgress?.active ? renderGmailScanProgress() : visibleDiscoveries.map((item) => `<div class="signal-row" data-gmail-signal-email="${escapeHtml(item.email)}"><span class="activity-symbol">＋</span><span class="list-primary">${escapeHtml(item.name)}<small>${escapeHtml([item.email, item.phone, item.source].filter(Boolean).join(" · "))}</small></span><span class="row-actions"><button class="button small" data-action="add-gmail-contact" data-email="${escapeHtml(item.email)}">Add</button><button class="button small" data-action="skip-gmail-contact" data-email="${escapeHtml(item.email)}">Skip</button></span></div>`).join("") || `<p class="empty-state compact">No unknown Gmail contacts found in the latest scan.</p>`}
          ${renderGmailDiscoveryPagination(discoveries.length, ui.gmailDiscoveryPage, totalDiscoveryPages)}
        </div>
        <p class="subcopy">Last scan: ${gmail.lastScanAt ? formatTimestamp(gmail.lastScanAt) : "Not scanned yet"}</p>
      </article>
    </section>`;
}

function renderGmailDiscoveryPagination(total, page, totalPages) {
  if (total <= GMAIL_DISCOVERY_PAGE_SIZE) return "";
  const start = (page - 1) * GMAIL_DISCOVERY_PAGE_SIZE + 1;
  const end = Math.min(total, page * GMAIL_DISCOVERY_PAGE_SIZE);
  return `<div class="signal-pagination"><span>Showing ${start}-${end} of ${total}</span><button class="button small" data-action="gmail-discovery-page" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><button class="button small" data-action="gmail-discovery-page" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Next</button></div>`;
}

function renderGmailScanProgress() {
  const progress = ui.gmailScanProgress || {};
  const scanned = Number(progress.scannedMessages || 0);
  const total = Number(progress.totalMessages || 0);
  const detail = total ? `${scanned} of ${total} emails scanned` : `${scanned} emails scanned`;
  return `<div class="gmail-progress"><strong>Scanning Gmail...</strong><span>${escapeHtml(detail)}</span><small>Updating every 5 seconds while the scan runs.</small></div>`;
}

function renderConfigurationSettingsPanel() {
  const gmail = gmailIntegration(currentTenant());
  return `<section class="settings-card configuration-card"><div class="panel-head"><div><h3>Configuration</h3><p class="subcopy">Tenant-level keys that control CRM behavior.</p></div></div><form class="configuration-list" data-configuration-form><label class="configuration-row"><span><strong>gmail.inboxLookbackDays</strong><small>Number of days to look back when scanning Gmail for new contacts.</small></span><input name="gmailLookbackDays" type="number" min="1" max="365" value="${Number(gmail.gmailLookbackDays || DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS)}" /></label><div class="form-actions"><button class="button primary">Save configuration</button></div></form></section>`;
}

function gmailIntegration(tenant = currentTenant()) {
  return { ...defaultGmailIntegration, ...(tenant.gmailIntegration || {}) };
}

function normalizedGmailClientId(value) {
  return String(value || "").replace(/\s+/g, "");
}

function gmailFormValues(form) {
  const values = Object.fromEntries(new FormData(form));
  return {
    ...values,
    clientId: normalizedGmailClientId(values.clientId),
    detectNewContacts: Boolean(values.detectNewContacts),
    detectDormantContacts: Boolean(values.detectDormantContacts),
  };
}

function gmailContactDiscoveries(tenant = currentTenant()) {
  const gmail = gmailIntegration(tenant);
  const signals = gmail.signals || [];
  const existing = new Set(tenant.deals.map((deal) => String(deal.email || "").toLowerCase()).filter(Boolean));
  const scanned = signals.filter((signal) => signal.type === "new_contact");
  if (scanned.length) return scanned
    .filter((signal) => !existing.has(String(signal.email || "").toLowerCase()))
    .map((signal) => ({ name: signal.name || signal.email.split("@")[0], email: signal.email, account: signal.account || "", phone: signal.phone || "", source: signal.source || "Gmail scan" }));
  if (gmail.lastScanAt) return [];
  return [
    { name: "Maya Rosenthal", email: "maya.rosenthal@newbridge.ai", source: "Inbound Gmail thread" },
    { name: "Chris Morgan", email: "chris@procurementhub.com", source: "Cc on renewal discussion" },
    { name: "Nina Patel", email: "nina@legaldesk.io", source: "Vendor review email" },
  ].filter((item) => !existing.has(item.email.toLowerCase()));
}

function gmailDormantContacts(tenant = currentTenant(), thresholdMonths = 3) {
  const gmail = gmailIntegration(tenant);
  const signals = gmail.signals || [];
  const scanned = signals.filter((signal) => signal.type === "dormant_contact");
  if (scanned.length) return scanned.map((signal) => ({ contact: signal.name || signal.email.split("@")[0], email: signal.email, account: signal.account || signal.email.split("@")[1], months: signal.months || thresholdMonths }));
  if (gmail.lastScanAt) return [];
  const recentOutboundByEmail = new Map();
  tenant.communications
    .filter((item) => item.direction === "outbound")
    .forEach((item) => {
      const deal = tenant.deals.find((candidate) => String(candidate.id) === String(item.dealId));
      if (!deal?.email) return;
      const previous = recentOutboundByEmail.get(deal.email) || "";
      if (!previous || item.date > previous) recentOutboundByEmail.set(deal.email, item.date);
    });
  return uniqueBy("email")
    .filter((deal) => deal.email)
    .map((deal, index) => {
      const lastOutbound = recentOutboundByEmail.get(deal.email);
      const fallbackMonths = 2 + (index % 5);
      const months = lastOutbound ? monthsSince(lastOutbound) : fallbackMonths;
      return { ...deal, months };
    })
    .filter((deal) => deal.months >= thresholdMonths)
    .slice(0, 6);
}

function monthsSince(value) {
  const then = new Date(value);
  const now = new Date(`${today()}T12:00:00`);
  return Math.max(0, Math.floor((now - then) / (30 * 86400000)));
}

function renderDealDrawer(deal) {
  if (!deal) return "";
  return `<div class="modal-layer"><aside class="drawer"><header class="modal-head"><div><p class="subcopy">Deal details</p></div><button class="close-button" data-action="close">×</button></header><section class="detail-hero">${avatar(deal.owner, "large")}<div><h2>${escapeHtml(deal.name)}</h2><p class="subcopy">${escapeHtml(deal.account)} · ${escapeHtml(deal.contact)}</p></div></section><section class="detail-section"><div class="detail-grid"><div><span class="detail-label">Stage</span><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span></div><div><span class="detail-label">Value</span><strong>${money(deal.value)}</strong></div><div><span class="detail-label">Owner</span><span class="owner-cell">${avatar(deal.owner, "small")}${deal.owner}</span></div><div><span class="detail-label">Close date</span><span>${formatDate(deal.close)}</span></div><div><span class="detail-label">Priority</span><span class="priority priority-${deal.priority.toLowerCase()}">${deal.priority}</span></div><div><span class="detail-label">Email</span><span>${escapeHtml(deal.email || "-")}</span></div></div></section><section class="detail-section"><h3>Notes</h3><p class="subcopy">${escapeHtml(deal.note || "No notes yet.")}</p></section><section class="detail-section"><h3>Communication</h3>${currentTenant().communications.filter((item) => String(item.dealId) === String(deal.id)).map((item) => `<div class="message-card"><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.type)} · ${formatTimestamp(item.date)} · ${escapeHtml(item.tracked)}</small><p>${escapeHtml(item.body)}</p></div>`).join("") || `<p class="subcopy">No messages logged yet.</p>`}<button class="button small" data-action="compose-email" data-deal-id="${deal.id}">＋ Log email</button></section><section class="detail-section"><h3>Activity</h3>${currentTenant().tasks.filter((task) => String(task.dealId) === String(deal.id)).map((task) => { const [label, klass] = taskStatus(task); return `<div class="drawer-task"><button class="task-check" data-action="toggle-task" data-id="${task.id}">${task.completed ? "✓" : ""}</button><span>${escapeHtml(task.title)}<small>${formatDate(task.due)}</small></span><span class="priority ${klass}">${label}</span><button class="button small danger" data-action="delete-task" data-id="${task.id}">Delete</button></div>`; }).join("") || `<p class="subcopy">No tasks yet.</p>`}</section><div class="form-actions"><button class="button danger" data-action="delete-deal" data-id="${deal.id}">Delete deal</button><button class="button" data-action="add-task" data-deal-id="${deal.id}">＋ Add task</button><span class="toolbar-spacer"></span><button class="button" data-action="close">Close</button><button class="button primary" data-action="edit-deal" data-id="${deal.id}">Edit deal</button></div></aside></div>`;
}

function formField(label, name, value = "", type = "text", required = false, klass = "", labelAction = "") {
  return `<div class="field ${klass}"><label>${labelAction ? `<span>${label}</span>${labelAction}` : label}</label><input name="${name}" type="${type}" value="${escapeHtml(String(value))}" ${required ? "required" : ""} /></div>`;
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
  const communicationId = event.target.closest("[data-open-communication]")?.dataset.openCommunication;
  const campaignId = event.target.closest("[data-open-campaign]")?.dataset.openCampaign;
  const collapse = event.target.closest("[data-collapse]")?.dataset.collapse;
  const column = event.target.closest("[data-column]")?.dataset.column;
  const settingsTab = event.target.closest("[data-settings-tab]")?.dataset.settingsTab;

  if (!section && !view && !dealId && !account && !contactEmail && !communicationId && !campaignId && !collapse && !column && !settingsTab && !actionElement) return;

  if (section) {
    ui.section = section;
    ui.selectedContactEmail = "";
    ui.selectedCommunicationId = null;
    ui.selectedCampaignId = null;
    ui.selected = null;
    ui.accountFocus = "";
  }
  if (view) ui.view = view;
  if (dealId) ui.selected = dealId;
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
  if (communicationId) {
    ui.section = "inbox";
    ui.selectedCommunicationId = String(ui.selectedCommunicationId) === String(communicationId) ? null : communicationId;
    ui.selected = null;
  }
  if (campaignId) {
    ui.section = "campaigns";
    ui.selectedCampaignId = campaignId;
    ui.selected = null;
  }
  if (collapse) ui.collapsed = ui.collapsed.includes(collapse) ? ui.collapsed.filter((item) => item !== collapse) : [...ui.collapsed, collapse];
  if (column) data.visibleColumns = event.target.checked ? [...data.visibleColumns, column] : data.visibleColumns.filter((item) => item !== column);
  if (settingsTab) ui.settingsTab = settingsTab;

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
    if (action === "jump-home-risk-thread") {
      const riskThread = document.querySelector(".home-thread-list .risk-thread");
      riskThread?.scrollIntoView({ behavior: "smooth", block: "center" });
      riskThread?.classList.add("is-highlighted");
      setTimeout(() => riskThread?.classList.remove("is-highlighted"), 1400);
      return;
    }
    if (action === "new-correspondence") {
      addCorrespondenceThread();
      return;
    }
    if (action === "open-activities") {
      ui.section = "activities";
      ui.activityFilter = "open";
      ui.selected = null;
      ui.accountFocus = "";
      ui.selectedContactEmail = "";
    }
    if (action === "open-inbox") {
      ui.section = "inbox";
      ui.selected = null;
      ui.accountFocus = "";
      ui.selectedContactEmail = "";
      ui.selectedCommunicationId = null;
    }
    if (action === "insert-template-token") {
      const token = `{{${actionElement.dataset.token}}}`;
      const textarea = document.querySelector("[data-campaign-template]");
      if (textarea) {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        ui.campaignDraft.template = `${textarea.value.slice(0, start)}${token}${textarea.value.slice(end)}`;
      }
      render();
      const nextTextarea = document.querySelector("[data-campaign-template]");
      nextTextarea?.focus();
      return;
    }
    if (action === "reset-campaign-draft") {
      ui.campaignDraft = { name: "", audienceType: "tag", audienceValue: allAccountTags()[0] || "", recurrence: "one-time", subject: "", template: "" };
    }
    if (action === "new-campaign") {
      ui.section = "campaigns";
      ui.selectedCampaignId = null;
    }
    if (action === "remove-account-tag") {
      const accountName = actionElement.dataset.account;
      const tags = accountTags(accountName).filter((tag) => tag !== actionElement.dataset.tag);
      setAccountTags(accountName, tags);
    }
    if (action === "filter-activities") ui.activityFilter = actionElement.dataset.filter || "open";
    if (action === "reply-correspondence") {
      ui.replyingThread = actionElement.dataset.threadId;
      render();
      [...document.querySelectorAll("[data-thread-id]")].find((item) => item.dataset.threadId === ui.replyingThread)?.querySelector("textarea")?.focus();
      return;
    }
    if (action === "cancel-reply") {
      ui.replyingThread = "";
    }
    if (action === "back-login") { ui.authStep = "password"; ui.authError = ""; }
    if (action === "logout") { session = null; saveSession(); ui.authStep = "password"; }
    if (action === "open-tenant") { ui.tenantId = id; ui.section = "pipeline"; session.tenantId = id; saveSession(); }
    if (action === "add-tenant") { ui.editingTenant = null; ui.authError = ""; ui.adminNotice = ""; ui.modal = "tenant"; }
    if (action === "add-deal") {
      ui.section = "pipeline";
      ui.view = "table";
      ui.modal = null;
      ui.editing = null;
      ui.inlineDealGroup = group || "active";
      ui.selected = null;
    }
    if (action === "add-contact") {
      ui.section = "contacts";
      ui.modal = null;
      ui.inlineContactOpen = true;
      ui.selected = null;
    }
    if (action === "cancel-inline-add") {
      ui.inlineDealGroup = null;
      ui.inlineContactOpen = false;
    }
    if (action === "add-task") { ui.modal = "task"; ui.taskDealId = taskDealId || null; ui.selected = null; }
    if (action === "compose-email") { ui.modal = "email"; ui.emailDealId = taskDealId || null; ui.selected = null; }
    if (action === "open-import") ui.modal = "import";
    if (action === "import-source") {
      await importSampleRecords(actionElement.dataset.source);
      ui.modal = null;
      ui.section = "contacts";
      ui.contactSearch = actionElement.dataset.source || "";
      ui.selectedContactEmail = "";
    }
    if (action === "open-settings") ui.modal = "settings";
    if (action === "open-gmail-oauth-guide") ui.modal = "gmail-oauth-guide";
    if (action === "close-whats-new") {
      dismissWhatsNew();
      render();
      return;
    }
    if (action === "open-gmail-settings") {
      dismissWhatsNew();
      ui.section = "settings";
      ui.settingsTab = "mail";
      render();
      return;
    }
    if (action === "connect-gmail") {
      const tenant = currentTenant();
      try {
        setGmailStatus("Saving Gmail settings...", tenant);
        const saved = await saveGmailSettingsViaApi(tenant.id, gmailFormValues(actionElement.closest("form")));
        setTenant({ ...currentTenant(), gmailIntegration: { ...saved.gmailIntegration, status: "Preparing Google authorization..." } });
        render();
        const connected = await connectGmailViaApi(tenant.id);
        setGmailStatus("Redirecting to Google authorization...", currentTenant());
        window.location.href = connected.authUrl;
        return;
      } catch (error) {
        setGmailStatus(error.message, currentTenant());
      }
    }
    if (action === "scan-gmail") {
      const tenant = currentTenant();
      const scanId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let progressTimer = null;
      try {
        setGmailStatus("Saving Gmail settings...", tenant);
        const saved = await saveGmailSettingsViaApi(tenant.id, gmailFormValues(actionElement.closest("form")));
        setTenant({ ...currentTenant(), gmailIntegration: { ...saved.gmailIntegration, signals: [], status: "Scanning Gmail..." } });
        ui.addedGmailContacts.clear();
        ui.skippedGmailContacts.clear();
        ui.gmailDiscoveryPage = 1;
        ui.gmailScanProgress = { active: true, status: "starting", scannedMessages: 0, totalMessages: 0, scanId };
        render();
        progressTimer = pollGmailScanProgress(tenant.id, scanId);
        const result = await scanGmailViaApi(tenant.id, scanId);
        if (progressTimer) window.clearInterval(progressTimer);
        ui.gmailScanProgress = { active: false, status: "complete", scannedMessages: result.scannedMessages || 0, totalMessages: result.scannedMessages || 0 };
        setTenant({ ...currentTenant(), gmailIntegration: result.gmailIntegration });
        ui.gmailDiscoveryPage = 1;
        render();
      } catch (error) {
        if (progressTimer) window.clearInterval(progressTimer);
        ui.gmailScanProgress = { ...(ui.gmailScanProgress || {}), active: false, status: "failed", error: error.message };
        setGmailStatus(error.message, currentTenant());
      }
    }
    if (action === "gmail-discovery-page") {
      ui.gmailDiscoveryPage = Math.max(1, Number(actionElement.dataset.page || 1));
      render();
      return;
    }
    if (action === "add-gmail-contact") {
      const tenant = currentTenant();
      const discovery = gmailContactDiscoveries(tenant).find((item) => item.email === actionElement.dataset.email);
      if (discovery) {
        const contact = {
          id: localRecordId("gmail-contact"),
          name: `${discovery.name} Gmail lead`,
          account: discovery.account || discovery.email.split("@")[1],
          contact: discovery.name,
          email: discovery.email,
          phone: discovery.phone || "",
          owner: currentUser().name,
          stage: "Lead",
          value: 0,
          close: daysFromNow(30),
          priority: "Medium",
          group: "active",
          tags: ["Gmail"],
          note: `Discovered from ${discovery.source}${discovery.account ? ` for ${discovery.account}` : ""}${discovery.phone ? `; phone ${discovery.phone}` : ""}.`,
          updated: "Just now",
        };
        try {
          const saved = session?.apiToken ? (await createDealViaApi(tenant.id, contact)).deal : contact;
          setTenant({ ...currentTenant(), deals: [saved, ...currentTenant().deals] });
          ui.addedGmailContacts.add(discovery.email);
          ui.gmailDiscoveryPage = Math.max(1, ui.gmailDiscoveryPage);
          showToast(`Added ${discovery.name} from Gmail`);
        } catch (error) {
          showToast(`Could not save ${discovery.name}: ${error.message}`);
        }
        return;
      }
    }
    if (action === "skip-gmail-contact") {
      const tenant = currentTenant();
      const discovery = gmailContactDiscoveries(tenant).find((item) => item.email === actionElement.dataset.email);
      if (discovery) {
        try {
          const result = await skipGmailContactViaApi(tenant.id, discovery);
          if (result.gmailIntegration) setTenant({ ...currentTenant(), gmailIntegration: result.gmailIntegration });
          ui.skippedGmailContacts.add(discovery.email);
          showToast(`Skipped ${discovery.email}`);
        } catch (error) {
          showToast(error.message);
        }
        return;
      }
    }
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
    if (action === "close") { ui.modal = null; ui.selected = null; ui.editing = null; ui.editingTenant = null; ui.inlineDealGroup = null; ui.inlineContactOpen = false; ui.taskDealId = null; ui.emailDealId = null; ui.authError = ""; ui.adminNotice = ""; }
    if (action === "edit-deal") { ui.selected = null; ui.editing = currentTenant().deals.find((deal) => String(deal.id) === String(id)); ui.modal = "deal"; }
    if (action === "toggle-task") {
      const tenant = currentTenant();
      setTenant({ ...tenant, tasks: tenant.tasks.map((task) => task.id === Number(id) ? { ...task, completed: !task.completed } : task) });
    }
    if (action === "delete-deal") {
      const tenant = currentTenant();
      try {
        if (session?.apiToken) await deleteDealViaApi(tenant.id, id);
        setTenant({ ...tenant, deals: tenant.deals.filter((deal) => String(deal.id) !== String(id)), tasks: tenant.tasks.filter((task) => String(task.dealId) !== String(id)), communications: tenant.communications.filter((item) => String(item.dealId) !== String(id)) });
        ui.modal = null;
        ui.selected = null;
        ui.editing = null;
      } catch (error) {
        showToast(`Could not delete deal: ${error.message}`);
      }
    }
    if (action === "delete-contact") {
      const email = actionElement.dataset.email?.toLowerCase();
      const tenant = currentTenant();
      try {
        const changedDeals = [];
        const deals = tenant.deals.map((deal) => {
          if (deal.email?.toLowerCase() !== email) return deal;
          const changed = { ...deal, contact: "", email: "", updated: "Just now" };
          changedDeals.push(changed);
          return changed;
        });
        if (session?.apiToken) {
          for (const deal of changedDeals) await updateDealViaApi(tenant.id, deal.id, deal);
        }
        setTenant({ ...tenant, deals });
        ui.selected = null;
      } catch (error) {
        showToast(`Could not delete contact: ${error.message}`);
      }
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
      if (String(ui.selectedCommunicationId) === String(id)) ui.selectedCommunicationId = null;
    }
    if (action === "add-custom-field") {
      const field = prompt("Custom field name");
      if (field?.trim() && !data.customFields.includes(field.trim())) data.customFields = [...data.customFields, field.trim()];
    }
    if (action === "clear-account-focus") ui.accountFocus = "";
    if (action === "clear-contact-search") { ui.contactSearch = ""; ui.selectedContactEmail = ""; }
    if (action === "reset") { data = structuredClone(defaultData); ui.tenantId = session?.tenantId || "admin"; }
    if (action === "export") exportCsv();
  }
  saveData();
  render();
});

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-search]")) {
    ui.search = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    restoreSearchFocus("[data-search]", cursor);
    return;
  }
  if (event.target.matches("[data-contact-search]")) {
    ui.contactSearch = event.target.value;
    const cursor = event.target.selectionStart;
    ui.selectedContactEmail = "";
    render();
    restoreSearchFocus("[data-contact-search]", cursor);
    return;
  }
  if (event.target.matches("[data-campaign-field]")) {
    ui.campaignDraft = { ...ui.campaignDraft, [event.target.name]: event.target.value };
  }
});

function restoreSearchFocus(selector, cursor) {
  const input = document.querySelector(selector);
  input?.focus();
  if (typeof cursor === "number") input?.setSelectionRange(cursor, cursor);
}

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
    return;
  }
  if (event.target.matches("[data-campaign-field]")) {
    ui.campaignDraft = { ...ui.campaignDraft, [event.target.name]: event.target.value };
    if (event.target.name === "audienceType") ui.campaignDraft.audienceValue = "";
    render();
    return;
  }
  if (event.target.matches("[data-account-tag-select]")) {
    const account = event.target.dataset.account;
    let tag = event.target.value;
    if (!tag) return;
    if (tag === "__new__") tag = prompt("New account tag")?.trim();
    if (tag) setAccountTags(account, [...new Set([...accountTags(account), tag])].sort());
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
        apiToken: result.token,
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
    session = { email: ui.pendingUser.email, name: ui.pendingUser.name, role: ui.pendingUser.role, tenantId: ui.pendingUser.tenantId, forcePasswordChange: !!ui.pendingUser.mustChangePassword, apiToken: ui.pendingUser.apiToken || "" };
    ui.tenantId = session.tenantId;
    ui.section = isPlatformAdmin() ? "admin" : "home";
    ui.authError = "";
    ui.authStep = "password";
    saveSession();
    await loadStateFromApi();
    maybeShowWhatsNew();
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
    maybeShowWhatsNew();
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
        data.tenants = data.tenants.map((tenant) => tenant.id === ui.editingTenant.id ? { ...tenant, ...result.tenant, users: result.tenant.users?.length ? result.tenant.users : tenant.users, deals: tenant.deals, tasks: tenant.tasks, communications: tenant.communications, campaigns: tenant.campaigns } : tenant);
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
    const communications = [{ ...values, id: Math.max(0, ...tenant.communications.map((item) => item.id)) + 1, dealId: values.dealId, type: "Email", owner: currentUser().name, tracked: "Logged", date: new Date().toISOString() }, ...tenant.communications];
    setTenant({ ...tenant, communications });
    ui.modal = null;
    ui.emailDealId = null;
    render();
    return;
  }
  if (event.target.matches("[data-reply-form]")) {
    event.preventDefault();
    const { body } = Object.fromEntries(new FormData(event.target));
    addCorrespondenceReply(event.target.dataset.threadId, body);
    render();
    return;
  }
  if (event.target.matches("[data-campaign-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const tenant = currentTenant();
    const campaigns = tenant.campaigns || [];
    const campaign = {
      id: Math.max(0, ...campaigns.map((item) => item.id)) + 1,
      recurrence: "one-time",
      ...values,
      status: "Draft",
      createdAt: new Date().toISOString(),
    };
    setTenant({ ...tenant, campaigns: [campaign, ...campaigns] });
    ui.campaignDraft = { ...ui.campaignDraft, name: "", recurrence: "one-time", subject: "", template: "" };
    ui.selectedCampaignId = campaign.id;
    render();
    return;
  }
  if (event.target.matches("[data-gmail-settings-form]")) {
    event.preventDefault();
    const tenant = currentTenant();
    try {
      setGmailStatus("Saving Gmail settings...", tenant);
      const result = await saveGmailSettingsViaApi(tenant.id, gmailFormValues(event.target));
      setTenant({ ...currentTenant(), gmailIntegration: { ...result.gmailIntegration, status: "Gmail settings saved." } });
    } catch (error) {
      const values = gmailFormValues(event.target);
      const previous = gmailIntegration(tenant);
      setTenant({
        ...tenant,
        gmailIntegration: {
          ...previous,
          accountEmail: values.accountEmail || "",
          workspaceDomain: values.workspaceDomain || "",
          clientId: values.clientId || "",
          redirectUri: values.redirectUri || defaultGmailIntegration.redirectUri,
          labels: values.labels || "Inbox, Sent",
          staleMonths: Math.max(1, Number(values.staleMonths || 3)),
          detectNewContacts: values.detectNewContacts,
          detectDormantContacts: values.detectDormantContacts,
          status: error.message,
        },
      });
    }
    ui.section = "settings";
    ui.settingsTab = "mail";
    ui.gmailNotice = "";
    render();
    return;
  }
  if (event.target.matches("[data-configuration-form]")) {
    event.preventDefault();
    const tenant = currentTenant();
    const values = Object.fromEntries(new FormData(event.target));
    const gmailLookbackDays = Math.max(1, Math.min(365, Number(values.gmailLookbackDays || DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS)));
    try {
      const result = await saveConfigurationViaApi(tenant.id, { gmailLookbackDays });
      setTenant({ ...currentTenant(), gmailIntegration: { ...result.gmailIntegration, status: "Configuration saved." } });
      showToast("Configuration saved");
    } catch (error) {
      const previous = gmailIntegration(tenant);
      setTenant({ ...tenant, gmailIntegration: { ...previous, gmailLookbackDays, status: error.message } });
      showToast(error.message);
    }
    ui.section = "settings";
    ui.settingsTab = "configuration";
    render();
    return;
  }
  if (event.target.matches("[data-inline-contact-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const tenant = currentTenant();
    const contact = {
      id: localRecordId("contact"),
      name: `${values.account} relationship`,
      account: values.account,
      contact: values.contact,
      email: values.email,
      phone: values.phone,
      owner: values.owner,
      stage: "Lead",
      value: 0,
      close: daysFromNow(30),
      priority: "Medium",
      group: "active",
      tags: ["Pilot"],
      note: "Contact added directly from Contacts.",
      updated: "Just now",
    };
    try {
      const saved = session?.apiToken ? (await createDealViaApi(tenant.id, contact)).deal : contact;
      setTenant({ ...currentTenant(), deals: [saved, ...currentTenant().deals] });
      ui.inlineContactOpen = false;
      ui.section = "contacts";
      ui.selectedContactEmail = saved.email;
      render();
    } catch (error) {
      showToast(`Could not save contact: ${error.message}`);
    }
    return;
  }
  if (event.target.matches("[data-inline-deal-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const tenant = currentTenant();
    const group = event.target.dataset.group || "active";
    const deal = {
      ...values,
      id: localRecordId("deal"),
      value: Number(values.value || 0),
      close: values.close || daysFromNow(30),
      group,
      tags: defaultAccountTags(values),
      note: "Deal added inline from the pipeline.",
      updated: "Just now",
    };
    const tasks = deal.stage === "Proposal"
      ? [{ id: Math.max(0, ...tenant.tasks.map((task) => task.id)) + 1, dealId: deal.id, title: "Follow up on proposal", type: "Follow-up", owner: deal.owner, due: daysFromNow(3), priority: "Medium", completed: false }, ...tenant.tasks]
      : tenant.tasks;
    try {
      const saved = session?.apiToken ? (await createDealViaApi(tenant.id, deal)).deal : deal;
      setTenant({ ...currentTenant(), deals: [saved, ...currentTenant().deals], tasks: tasks.map((task) => String(task.dealId) === String(deal.id) ? { ...task, dealId: saved.id } : task) });
      ui.inlineDealGroup = null;
      ui.selected = null;
      render();
    } catch (error) {
      showToast(`Could not save deal: ${error.message}`);
    }
    return;
  }
  if (event.target.matches("[data-task-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const tenant = currentTenant();
    const tasks = [{ ...values, id: Math.max(0, ...tenant.tasks.map((task) => task.id)) + 1, dealId: values.dealId, completed: false }, ...tenant.tasks];
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
    const deal = { ...existing, ...values, id: existing?.id || localRecordId("deal"), value: Number(values.value), tags: existing?.tags || defaultAccountTags(values), updated: "Just now" };
    try {
      const saved = session?.apiToken
        ? (existing ? (await updateDealViaApi(tenant.id, existing.id, deal)).deal : (await createDealViaApi(tenant.id, deal)).deal)
        : deal;
      const deals = existing ? tenant.deals.map((item) => String(item.id) === String(existing.id) ? saved : item) : [saved, ...tenant.deals];
      const tasks = saved.stage === "Proposal" && existing?.stage !== "Proposal"
      ? [{ id: Math.max(0, ...tenant.tasks.map((task) => task.id)) + 1, dealId: saved.id, title: "Follow up on proposal", type: "Follow-up", owner: saved.owner, due: daysFromNow(3), priority: "Medium", completed: false }, ...tenant.tasks]
      : tenant.tasks;
      setTenant({ ...tenant, deals, tasks });
      ui.modal = null;
      ui.editing = null;
      render();
    } catch (error) {
      showToast(`Could not save deal: ${error.message}`);
    }
  }
});

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-drag-deal]");
  if (card) event.dataTransfer.setData("text/plain", card.dataset.dragDeal);
});

document.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-drop-stage]")) event.preventDefault();
});

document.addEventListener("drop", async (event) => {
  const column = event.target.closest("[data-drop-stage]");
  if (!column) return;
  event.preventDefault();
  const tenant = currentTenant();
  const id = event.dataTransfer.getData("text/plain");
  const stage = column.dataset.dropStage;
  const changed = tenant.deals.find((deal) => String(deal.id) === String(id));
  if (!changed) return;
  const nextDeal = { ...changed, stage, group: ["Won", "Lost"].includes(stage) ? "closed" : "active", updated: "Just now" };
  try {
    const saved = session?.apiToken ? (await updateDealViaApi(tenant.id, id, nextDeal)).deal : nextDeal;
    setTenant({ ...tenant, deals: tenant.deals.map((deal) => String(deal.id) === String(id) ? saved : deal) });
    render();
  } catch (error) {
    showToast(`Could not update stage: ${error.message}`);
  }
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

async function importSampleRecords(source = "csv") {
  const imported = {
    csv: [
      { name: "CSV account enrichment", account: "Marble Ridge", contact: "Tara Quinn", email: "tara@marbleridge.com", owner: "Maya Bar", stage: "Lead", value: 14300, close: "2026-08-18", priority: "Medium", group: "active", note: "Imported from CSV with mapped account, contact, email, and owner fields." },
      { name: "CSV contact cleanup", account: "Lakeview Supply", contact: "Peter Walsh", email: "peter@lakeviewsupply.com", owner: "Daniel Cohen", stage: "Qualified", value: 19600, close: "2026-08-02", priority: "Low", group: "active", note: "Imported from CSV contact list." },
    ],
    salesforce: [
      { name: "Salesforce enterprise opportunity", account: "Apex Robotics", contact: "Mei Lin", email: "mei@apexrobotics.com", owner: "Noa Levi", stage: "Proposal", value: 74200, close: "2026-07-22", priority: "High", group: "active", note: "Synced from Salesforce opportunity and account owner." },
      { name: "Salesforce expansion lead", account: "BrightPath Logistics", contact: "Andre Moore", email: "andre@brightpathlogistics.com", owner: "Avi Stein", stage: "Qualified", value: 38400, close: "2026-07-29", priority: "Medium", group: "active", note: "Synced from Salesforce lead conversion." },
    ],
    zendesk: [
      { name: "Zendesk support escalation", account: "Pioneer Apps", contact: "Leah Brooks", email: "leah@pioneerapps.io", owner: "Maya Bar", stage: "Negotiation", value: 46300, close: "2026-06-29", priority: "High", group: "active", note: "Imported from Zendesk organization with active support context." },
      { name: "Zendesk renewal recovery", account: "Urban Ledger", contact: "Samir Khan", email: "samir@urbanledger.co", owner: "Daniel Cohen", stage: "Proposal", value: 31700, close: "2026-07-17", priority: "High", group: "active", note: "Imported from Zendesk requester and organization records." },
    ],
  }[source] || [];
  const tenant = currentTenant();
  const existingEmails = new Set(tenant.deals.map((deal) => deal.email?.toLowerCase()));
  const deals = imported
    .filter((deal) => !existingEmails.has(deal.email.toLowerCase()))
    .map((deal) => ({ ...deal, id: localRecordId("import"), tags: defaultAccountTags(deal), updated: "Imported just now" }));
  if (!deals.length) return;
  try {
    const savedDeals = [];
    for (const deal of deals) {
      savedDeals.push(session?.apiToken ? (await createDealViaApi(tenant.id, deal)).deal : deal);
    }
    setTenant({ ...currentTenant(), deals: [...savedDeals, ...currentTenant().deals] });
  } catch (error) {
    showToast(`Could not import records: ${error.message}`);
  }
}

render();
