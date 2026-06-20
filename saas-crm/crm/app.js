const STORAGE_KEY = "zeptrix-saas-crm-v1";
const SESSION_KEY = "zeptrix-saas-session-v1";
const WHATS_NEW_KEY = "zeptrix-crm-whats-new-v1";
const WHATS_NEW_VERSION = "crm-build-order-2026-06-19";
const GMAIL_DISCOVERY_PAGE_SIZE = 10;
const ADMIN_LIST_PAGE_SIZE = 8;
const DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS = 30;
const MFA_CODE = "123456";
const SEED_ADMIN_TEMP_PASSWORD = "Tmp-Admin-7394!";
const SEED_AMIHAI_TEMP_PASSWORD = "Tmp-Amihai-5821!";
const CRM_NAMED_ROUTE_MATCH = location.pathname.match(/^\/crm\/([^/.]+)\/?$/);
const CRM_SECTION_ROUTE = CRM_NAMED_ROUTE_MATCH && ["admin", "home", "pipeline", "accounts", "campaigns", "contacts", "activities", "inbox", "reports", "settings", "templates"].includes(CRM_NAMED_ROUTE_MATCH[1]) ? CRM_NAMED_ROUTE_MATCH[1] : "";
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
const defaultMailTemplates = [
  {
    id: "follow-up-check-in",
    name: "Follow-up check-in",
    subject: "Quick check-in for {{accountName}}",
    body: "Hi {{mainContactName}},\n\nI noticed we have not connected in a while and wanted to check how things are going at {{accountName}}.\n\nIs there anything you need from us, or any priority we should help move forward?\n\nBest,\n{{ownerName}}",
  },
  {
    id: "renewal-touchpoint",
    name: "Renewal touchpoint",
    subject: "Planning ahead for {{accountName}}",
    body: "Hi {{mainContactName}},\n\nAs we plan ahead for {{accountName}}, I wanted to review current priorities, value delivered, and any open risks before the next milestone.\n\nWould a short review next week work?\n\nBest,\n{{ownerName}}",
  },
  {
    id: "executive-value-recap",
    name: "Executive value recap",
    subject: "Value recap for {{accountName}}",
    body: "Hi {{mainContactName}},\n\nI prepared a short recap for {{accountName}} covering outcomes, open actions, and the next value areas for {{dealName}}.\n\nHappy to walk through it with your team.\n\nBest,\n{{ownerName}}",
  },
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
      { id: "admin-owner", name: "Platform Admin", email: "admin@zeptrix.io", password: SEED_ADMIN_TEMP_PASSWORD, mustChangePassword: true, role: "platform_admin", mfa: false, sso: true },
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
  auditLogs: [],
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

const defaultOutgoingEmail = {
  configured: false,
  status: "Not configured",
  host: "",
  port: 587,
  secure: false,
  username: "",
  fromName: "Zeptrix CRM",
  fromEmail: "",
  passwordConfigured: false,
  updatedAt: "",
};

const defaultWorkflowAutomation = {
  enabled: true,
  createFollowUpTasks: true,
  tagRiskAccounts: true,
  riskTag: "At risk",
  dormantDueDays: 3,
  attentionDueDays: 1,
  lastRunAt: "",
  lastRunSummary: {},
};

let data = loadData();
let session = loadSession();
let ui = {
  authStep: "password",
  pendingUser: null,
  authError: "",
  authNotice: "",
  tenantId: session?.tenantId || "admin",
  section: CRM_SECTION_ROUTE || "admin",
  view: "table",
  savedView: "All deals",
  search: "",
  contactSearch: "",
  contactTagFilters: [],
  activityFilter: "open",
  stageFilter: "All",
  selected: null,
  modal: null,
  editing: null,
  editingTenant: null,
  adminNotice: "",
  adminTab: "tenants",
  adminSearch: "",
  adminPages: { tenants: 1, invites: 1, audit: 1 },
  newGroup: "active",
  inlineDealGroup: null,
  inlineContactOpen: false,
  editingContactEmail: "",
  importOpen: false,
  taskDealId: null,
  emailDealId: null,
  emailTemplateId: "follow-up-check-in",
  emailContext: null,
  collapsed: [],
  accountFocus: "",
  selectedContactEmail: "",
  selectedCommunicationId: null,
  selectedCampaignId: null,
  selectedReportTemplate: "",
  helpTopic: "",
  pendingTag: null,
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
  nextData.auditLogs = nextData.auditLogs || [];
  nextData.tenants = nextData.tenants.map((tenant) => ({
    ...tenant,
    deals: (tenant.deals || []).map((deal) => ({ ...deal, tags: deal.tags || defaultAccountTags(deal) })),
    availableTags: normalizeTags([...(tenant.availableTags || []), ...(tenant.deals || []).flatMap((deal) => deal.tags || defaultAccountTags(deal)), ...defaultTags]),
    mailTemplates: normalizeMailTemplates(tenant.mailTemplates),
    outgoingEmail: { ...defaultOutgoingEmail, ...(tenant.outgoingEmail || {}) },
    workflowAutomation: { ...defaultWorkflowAutomation, ...(tenant.workflowAutomation || {}) },
    campaigns: (tenant.campaigns?.length ? tenant.campaigns : defaultCampaignsForTenant(tenant)).map((campaign) => ({ recurrence: "one-time", ...campaign })),
    supportTickets: normalizeSupportTickets(tenant),
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

function normalizeTagName(value = "") {
  return String(value).trim().replace(/\s+/g, " ").slice(0, 40);
}

function normalizeTags(tags = []) {
  return [...new Set((Array.isArray(tags) ? tags : String(tags || "").split(",")).map(normalizeTagName).filter(Boolean))].sort();
}

function normalizeMailTemplates(templates = []) {
  const source = templates?.length ? templates : defaultMailTemplates;
  return source.map((template) => ({ ...template, id: template.id || localRecordId("template") }));
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

function normalizeSupportTickets(tenant) {
  const source = tenant.supportTickets?.length ? tenant.supportTickets : defaultSupportTicketsForTenant(tenant);
  return source.map((ticket, index) => ({
    id: ticket.id || `ticket-${index + 1}`,
    account: ticket.account || tenant.deals[index % Math.max(tenant.deals.length, 1)]?.account || "Unassigned account",
    requester: ticket.requester || tenant.deals.find((deal) => deal.account === ticket.account)?.contact || "Customer",
    subject: ticket.subject || "Support request",
    status: ticket.status || "Open",
    priority: ticket.priority || "Medium",
    source: ticket.source || "Zendesk",
    sla: ticket.sla || "On track",
    sentiment: ticket.sentiment || "Neutral",
    updatedAt: ticket.updatedAt || daysFromNow(-index - 1),
  }));
}

function defaultSupportTicketsForTenant(tenant) {
  if (!["admin", "amihai", "demo"].includes(tenant.slug) && !["admin", "amihai", "demo"].includes(String(tenant.id))) return [];
  const examples = [
    { account: "Orbital Systems", requester: "Liam Brooks", subject: "Security review answer is overdue", status: "Open", priority: "High", source: "Zendesk", sla: "Breach risk today", sentiment: "Frustrated", updatedAt: "2026-06-12T10:15:00" },
    { account: "Nimbus Labs", requester: "Sophie Green", subject: "Procurement needs rollout clarification", status: "Pending", priority: "High", source: "Gmail label", sla: "Due in 6 hours", sentiment: "Angry", updatedAt: "2026-06-11T16:40:00" },
    { account: "BluePeak Advisory", requester: "Idan Yuval", subject: "Migration checklist question", status: "Open", priority: "Medium", source: "Freshdesk", sla: "On track", sentiment: "Neutral", updatedAt: "2026-06-10T12:20:00" },
    { account: "Northline Apps", requester: "Yael Ron", subject: "SLA mapping for pilot support", status: "Open", priority: "Medium", source: "Zendesk", sla: "Due tomorrow", sentiment: "Concerned", updatedAt: "2026-06-09T09:10:00" },
  ];
  const accounts = new Set((tenant.deals || []).map((deal) => deal.account));
  return examples.filter((ticket) => accounts.has(ticket.account));
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
  }, 2000);
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

function israelGreeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hour12: false }).format(date));
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
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
    const message = body.error === "Unable to scan Gmail." && body.detail
      ? body.detail
      : response.status === 401 && body.error === "Authentication required."
      ? "Please sign in again to continue."
      : body.error || body.detail || "Request failed.";
    throw new Error(message);
  }
  return body;
}

const AUDIT_VALUE_ALLOWLIST = new Set([
  "account", "enabled", "gmailLookbackDays", "group", "priority", "recurrence", "region", "seats", "stage", "status", "type", "value",
  "close", "due", "staleMonths", "detectNewContacts", "detectDormantContacts", "createFollowUpTasks", "tagRiskAccounts", "dormantDueDays", "attentionDueDays",
]);
const AUDIT_CLICK_SKIP_ACTIONS = new Set([
  "back-login", "cancel-contact-edit", "cancel-inline-add", "cancel-reply", "clear-account-focus", "clear-contact-search", "close", "close-whats-new",
  "filter-activities", "gmail-discovery-page", "google-sso", "jump-home-risk-thread", "jump-risk-thread", "logout", "open-activities",
  "open-help", "open-import", "open-inbox", "open-settings", "open-whats-new", "admin-page", "reset-campaign-draft", "show-forgot-password", "show-mfa-recovery", "show-register",
]);

function redactAuditValue(name, value) {
  const field = String(name || "");
  if (!AUDIT_VALUE_ALLOWLIST.has(field) || /(password|secret|token|code|temporary|authorization|credential|email|phone|body|subject|message|note|template|client|smtp|label|uri|url|name|contact|owner|user)/i.test(field)) return "[redacted]";
  return String(value ?? "").slice(0, 500);
}

function auditFormFields(form) {
  const fields = {};
  for (const element of [...form.elements]) {
    if (!element.name || element.disabled) continue;
    if ((element.type === "checkbox" || element.type === "radio") && !element.checked) continue;
    fields[element.name] = redactAuditValue(element.name, element.type === "checkbox" ? element.checked : element.value);
  }
  return fields;
}

function auditTenantIdForTarget(target = null) {
  const action = target?.dataset?.action || "";
  const id = target?.dataset?.id || "";
  if (isPlatformAdmin() && ["open-tenant", "edit-tenant", "reset-tenant-password", "delete-tenant"].includes(action) && id) return id;
  return currentTenant()?.id || session?.tenantId || "";
}

function auditTenantIdForForm(form) {
  if (isPlatformAdmin() && form.matches("[data-tenant-form]") && ui.editingTenant?.id) return ui.editingTenant.id;
  return currentTenant()?.id || session?.tenantId || "";
}

function localAuditLog(payload) {
  const tenant = data.tenants.find((item) => item.id === payload.tenantId) || currentTenant();
  data.auditLogs = [
    {
      id: localRecordId("audit"),
      tenantId: payload.tenantId,
      tenantName: tenant?.name || "Unknown tenant",
      userEmail: session?.email || "",
      userRole: session?.role || "",
      eventType: payload.eventType,
      operation: payload.operation,
      target: payload.target || "",
      details: payload.details || {},
      createdAt: new Date().toISOString(),
    },
    ...(data.auditLogs || []),
  ].slice(0, 300);
  saveData();
}

function recordAuditEvent(payload) {
  if (!session) return;
  const eventPayload = { tenantId: payload.tenantId || currentTenant()?.id || session.tenantId, ...payload };
  if (!session.apiToken) {
    localAuditLog(eventPayload);
    return;
  }
  window.fetch("/api/audit", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.apiToken}` },
    body: JSON.stringify(eventPayload),
  })
    .then((response) => response.ok ? response.json() : null)
    .then((body) => {
      if (body?.auditLog && isPlatformAdmin()) {
        data.auditLogs = [body.auditLog, ...(data.auditLogs || [])].slice(0, 300);
        saveData();
      }
    })
    .catch((error) => console.warn("Audit log write failed:", error.message));
}

function auditClickEvent({ clickTarget, section, view, dealId, account, contactEmail, communicationId, campaignId, collapse, column, settingsTab, adminTab, actionElement }) {
  if (!session) return;
  const action = actionElement?.dataset.action || "";
  if (!action || AUDIT_CLICK_SKIP_ACTIONS.has(action)) return;
  const operation = actionElement?.dataset.action
    || (section ? `navigate:${section}` : "")
    || (view ? `view:${view}` : "")
    || (settingsTab ? `settings:${settingsTab}` : "")
    || (adminTab ? `admin:${adminTab}` : "")
    || (dealId ? "open-deal" : account ? "open-account" : contactEmail ? "open-contact" : communicationId ? "open-communication" : campaignId ? "open-campaign" : collapse ? "toggle-collapse" : column ? "toggle-column" : "button-click");
  const target = actionElement || clickTarget?.closest?.("button,a,label,[data-section],[data-view],[data-settings-tab],[data-admin-tab]") || clickTarget;
  recordAuditEvent({
    tenantId: auditTenantIdForTarget(actionElement),
    eventType: "button_click",
    operation,
    target: [target?.tagName?.toLowerCase(), target?.dataset?.id, target?.dataset?.email, dealId, account, contactEmail, communicationId, campaignId].filter(Boolean).join(":"),
    details: {
      label: (target?.getAttribute?.("aria-label") || target?.textContent || "").trim().slice(0, 120),
      section: ui.section,
      dataset: { ...(target?.dataset || {}) },
    },
  });
}

function auditSubmitEvent(form, status = "success") {
  if (!session) return;
  const marker = [...form.attributes].find((attribute) => attribute.name.startsWith("data-") && attribute.value === "")?.name || "form";
  const editingTenant = form.matches("[data-tenant-form]") ? ui.editingTenant : null;
  recordAuditEvent({
    tenantId: auditTenantIdForForm(form),
    eventType: "form_submit",
    operation: marker.replace(/^data-/, "").replace(/-form$/, ""),
    target: editingTenant?.id ? `tenant:${editingTenant.id}` : marker,
    details: { section: ui.section, status, editedTenantId: editingTenant?.id || "", editedTenantName: editingTenant?.name || "", fields: auditFormFields(form) },
  });
}

async function loadStateFromApi() {
  try {
    const remote = await apiRequest("/api/state");
    data = normalizeData({ ...data, tenants: remote.tenants, inviteEmails: remote.inviteEmails, auditLogs: remote.auditLogs || [] });
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

async function registerViaApi(values) {
  return apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify(values) });
}

async function mfaSetupViaApi(preAuthToken) {
  return apiRequest("/api/auth/mfa/setup", { method: "POST", body: JSON.stringify({ preAuthToken }) });
}

async function mfaVerifyViaApi(preAuthToken, code) {
  return apiRequest("/api/auth/mfa/verify", { method: "POST", body: JSON.stringify({ preAuthToken, code }) });
}

async function forgotPasswordViaApi(email) {
  return apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

async function mfaRecoveryRequestViaApi(email) {
  return apiRequest("/api/auth/mfa/recovery-request", { method: "POST", body: JSON.stringify({ email }) });
}

async function mfaRecoveryConfirmViaApi(token) {
  return apiRequest("/api/auth/mfa/recovery-confirm", { method: "POST", body: JSON.stringify({ token }) });
}

async function changePasswordViaApi(email, password) {
  return apiRequest("/api/auth/change-password", { method: "POST", body: JSON.stringify({ email, password }) });
}

function startGoogleAuth(mode = "login") {
  window.location.href = `/api/auth/google/start?mode=${encodeURIComponent(mode)}`;
}

function pendingUserFromChallenge(result) {
  return {
    name: result.user.name,
    email: result.user.email,
    role: result.user.role,
    tenantId: result.user.tenantId,
    mustChangePassword: result.user.mustChangePassword,
    preAuthToken: result.preAuthToken,
    mfaRequired: result.mfaRequired,
    mfaSetupRequired: result.mfaSetupRequired,
    apiToken: result.token || "",
  };
}

async function prepareMfaChallenge(result) {
  if (result.tenant) data.tenants = normalizeData({ ...data, tenants: [...data.tenants.filter((tenant) => tenant.id !== result.tenant.id), result.tenant] }).tenants;
  ui.pendingUser = pendingUserFromChallenge(result);
  if (!ui.pendingUser.mfaRequired && ui.pendingUser.apiToken) {
    await completeAuthSession(ui.pendingUser);
    return;
  }
  if (ui.pendingUser.mfaSetupRequired && ui.pendingUser.preAuthToken) {
    ui.pendingUser.mfaSetup = await mfaSetupViaApi(ui.pendingUser.preAuthToken);
  }
  ui.authError = "";
  ui.authStep = "mfa";
}

async function completeAuthSession(user) {
  session = { email: user.email, name: user.name, role: user.role, tenantId: user.tenantId, forcePasswordChange: !!user.mustChangePassword, apiToken: user.apiToken || "" };
  ui.tenantId = session.tenantId;
  ui.section = isPlatformAdmin() ? "admin" : "home";
  ui.authError = "";
  ui.authStep = "password";
  ui.pendingUser = null;
  saveSession();
  await loadStateFromApi();
  maybeShowWhatsNew();
}

async function consumeGoogleAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("authError");
  const googleAuth = params.get("googleAuth");
  const mfaRecovery = params.get("mfaRecovery");
  if (!authError && !googleAuth && !mfaRecovery) return;
  window.history.replaceState({}, "", window.location.pathname);
  if (authError) {
    ui.authError = authError;
    ui.authStep = "password";
    return;
  }
  if (mfaRecovery) {
    try {
      const result = await mfaRecoveryConfirmViaApi(mfaRecovery);
      ui.authNotice = "Authenticator reset. Scan the new QR code and enter the verification code.";
      await prepareMfaChallenge(result);
    } catch (error) {
      ui.authError = error.message;
      ui.authStep = "mfa-recovery";
    }
    return;
  }
  try {
    const base64 = googleAuth.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    await prepareMfaChallenge(payload);
  } catch (error) {
    ui.authError = `Google sign-in could not be completed: ${error.message}`;
    ui.authStep = "password";
  }
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

async function saveMailTemplateViaApi(tenantId, template) {
  const isPersisted = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(template.id || ""));
  const path = isPersisted
    ? `/api/tenants/${encodeURIComponent(tenantId)}/templates/${encodeURIComponent(template.id)}`
    : `/api/tenants/${encodeURIComponent(tenantId)}/templates`;
  return apiRequest(path, { method: isPersisted ? "PUT" : "POST", body: JSON.stringify(template) });
}

async function deleteMailTemplateViaApi(tenantId, templateId) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/templates/${encodeURIComponent(templateId)}`, { method: "DELETE" });
}

async function createTagViaApi(tenantId, name) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/tags`, { method: "POST", body: JSON.stringify({ name }) });
}

async function saveGmailSettingsViaApi(tenantId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/gmail`, { method: "PUT", body: JSON.stringify(values) });
}

async function saveConfigurationViaApi(tenantId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/configuration`, { method: "PUT", body: JSON.stringify(values) });
}

async function saveWorkflowAutomationViaApi(tenantId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/workflow-automation`, { method: "PUT", body: JSON.stringify(values) });
}

async function saveOutgoingEmailSettingsViaApi(tenantId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/outgoing-email`, { method: "PUT", body: JSON.stringify(values) });
}

async function sendEmailViaApi(tenantId, values) {
  return apiRequest(`/api/tenants/${encodeURIComponent(tenantId)}/outgoing-email/send`, { method: "POST", body: JSON.stringify(values) });
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
          ${ui.authStep === "mfa" ? renderMfa() : ui.authStep === "register" ? renderRegisterForm() : ui.authStep === "forgot" ? renderForgotPassword() : ui.authStep === "mfa-recovery" ? renderMfaRecovery() : renderPasswordLogin()}
        </div>
      </section>
    </main>`;
}

function renderPasswordLogin() {
  return `
    <h2>Sign in</h2>
    <p class="subcopy">Use Google SSO or the temporary password from the invite email. Authenticator MFA is required after sign-in.</p>
    <div class="auth-actions">
      <button class="button google-button" data-action="google-sso" data-mode="login"><span class="google-mark">G</span><span>Continue with Google</span></button>
    </div>
    <div class="divider">or use email</div>
    <form class="auth-actions" data-login-form>
      <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label>Password</label><input name="password" type="password" required /></div>
      <button class="button primary">Continue</button>
      <button class="button ghost auth-link-button" type="button" data-action="show-forgot-password">Forgot password?</button>
      ${ui.authNotice ? `<p class="success">${escapeHtml(ui.authNotice)}</p>` : ""}
      ${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}
    </form>
    <div class="auth-switch"><span>New to Zeptrix CRM?</span><button type="button" class="button ghost" data-action="show-register">Register</button></div>`;
}

function renderForgotPassword() {
  return `
    <h2>Reset password</h2>
    <p class="subcopy">Enter your login email. If the account exists, we will email a temporary password and ask you to create a new one after login.</p>
    <form class="auth-actions" data-forgot-password-form>
      <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
      <button class="button primary">Send reset email</button>
      <button class="button ghost" type="button" data-action="back-login">Back to sign in</button>
      ${ui.authNotice ? `<p class="success">${escapeHtml(ui.authNotice)}</p>` : ""}
      ${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}
    </form>`;
}

function renderRegisterForm() {
  return `
    <h2>Register</h2>
    <p class="subcopy">Register yourself as the tenant admin and start with an empty Trial workspace.</p>
    <div class="auth-actions">
      <button class="button google-button" data-action="google-sso" data-mode="register"><span class="google-mark">G</span><span>Register with Google</span></button>
    </div>
    <div class="divider">or register with email</div>
    <form class="auth-actions" data-register-form>
      <div class="field"><label>Full name</label><input name="fullName" autocomplete="name" required /></div>
      <div class="field"><label>Work email</label><input name="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label>Company name</label><input name="company" autocomplete="organization" required /></div>
      <div class="field"><label>Password</label><input name="password" type="password" minlength="10" autocomplete="new-password" required /></div>
      <div class="field"><label>Confirm password</label><input name="confirm" type="password" minlength="10" autocomplete="new-password" required /></div>
      <button class="button primary">Register</button>
      <button class="button ghost" type="button" data-action="back-login">Back to sign in</button>
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
  const setup = ui.pendingUser?.mfaSetup;
  const isSetup = ui.pendingUser?.mfaSetupRequired;
  return `
    <h2>${isSetup ? "Set up authenticator MFA" : "Verify MFA"}</h2>
    <p class="subcopy">${isSetup ? "Scan the QR code with Google Authenticator, Microsoft Authenticator, 1Password, or any TOTP app." : `Enter the authenticator code for ${escapeHtml(ui.pendingUser?.email || "")}.`}</p>
    ${isSetup ? renderMfaSetup(setup) : ""}
    <form class="auth-actions" data-mfa-form>
      <div class="field"><label>Authenticator code</label><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" placeholder="123456" required /></div>
      <button class="button primary">${isSetup ? "Confirm and open CRM" : "Verify and open CRM"}</button>
      <button class="button ghost auth-link-button" type="button" data-action="show-mfa-recovery">Authenticator not working?</button>
      <button class="button ghost" type="button" data-action="back-login">Back</button>
      ${ui.authNotice ? `<p class="success">${escapeHtml(ui.authNotice)}</p>` : ""}
      ${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}
    </form>`;
}

function renderMfaRecovery() {
  return `
    <h2>Configure authenticator</h2>
    <p class="subcopy">If your authenticator app is unavailable, enter your login email. We will send a secure link that lets you configure a new authenticator.</p>
    <form class="auth-actions" data-mfa-recovery-form>
      <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
      <button class="button primary">Send authenticator link</button>
      <button class="button ghost" type="button" data-action="back-login">Back to sign in</button>
      ${ui.authNotice ? `<p class="success">${escapeHtml(ui.authNotice)}</p>` : ""}
      ${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}
    </form>`;
}

function renderMfaSetup(setup) {
  if (!setup) return `<div class="mfa-setup-card"><strong>Preparing secure MFA setup...</strong><small>Generating your authenticator secret.</small></div>`;
  return `<div class="mfa-setup-card">
    <div class="mfa-qr"><img src="${escapeHtml(setup.qrUrl)}" alt="Authenticator QR code" /></div>
    <div class="mfa-key"><strong>Manual setup key</strong><code>${escapeHtml(setup.secret)}</code><small>If you cannot scan the QR code, enter this key manually in your authenticator app.</small></div>
  </div>`;
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
      ${sideLink("settings", "⚙", "Email integration")}
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
      <label class="global-search"><span>⌕</span><input placeholder="${isPlatformAdmin() ? "Search tenants, deals, contacts..." : "Search deals, accounts, contacts..."}" /><span>⌘ K</span></label>
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
  if (ui.section === "reports") return renderReports();
  if (ui.section === "settings") return renderSettingsPage();
  if (ui.section === "templates") return `${renderPageHeader("Email templates", "Manage reusable email templates for follow-ups and outreach.")}${renderTemplatesSettingsPanel()}`;
  return renderHome();
}

function renderPageHeader(title = "Sales pipeline", copy = "Manage deals, track progress, and keep your team in sync.") {
  const helpTopic = helpTopicForSection();
  return `
    <div class="page-title-row">
      <div><h1>${title}</h1><p class="subcopy">${copy}</p></div>
      <div class="page-actions"><button class="icon-button whats-new-button" data-action="open-whats-new" data-tooltip="What's new" aria-label="Open what's new">✦</button><button class="icon-button help-button" data-action="open-help" data-help-topic="${escapeHtml(helpTopic)}" data-tooltip="Open help" aria-label="Open help">?</button><button class="button" data-action="export">⇩ Export</button><button class="button ${ui.importOpen ? "filter-pill" : ""}" data-action="open-import">⇪ Import</button><button class="button primary" data-action="add-deal">＋ New deal</button></div>
    </div>${ui.importOpen ? renderImportStrip() : ""}`;
}

function helpTopicForSection(section = ui.section) {
  const map = { admin: "admin", home: "home", pipeline: "pipeline", accounts: "accounts", campaigns: "campaigns", contacts: "contacts", activities: "activities", inbox: "inbox", reports: "reports", settings: "email-integration", templates: "email-templates" };
  return map[section] || "home";
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
    <nav class="settings-tabs admin-tabs">
      <button class="${ui.adminTab === "tenants" ? "active" : ""}" data-admin-tab="tenants">Tenants</button>
      <button class="${ui.adminTab === "invites" ? "active" : ""}" data-admin-tab="invites">Invite emails</button>
      <button class="${ui.adminTab === "audit" ? "active" : ""}" data-admin-tab="audit">Audit log</button>
    </nav>
    ${ui.adminTab === "audit" ? renderAdminAuditLog() : ui.adminTab === "invites" ? renderAdminInviteEmails() : renderAdminTenants()}
  `;
}

function renderAdminTenants() {
  const rows = filterAdminRows(data.tenants, tenantSearchText);
  const page = adminPageFor("tenants", rows.length);
  const visibleRows = paginateAdminRows(rows, page);
  return `
    <div class="section-toolbar"><strong>${rows.length} of ${data.tenants.length} tenants</strong>${renderAdminSearch("Search tenants, login email, billing, plan...")}<span class="toolbar-spacer"></span><button class="button primary" data-action="add-tenant">＋ New tenant</button></div>
    ${ui.adminNotice ? `<p class="admin-notice">${escapeHtml(ui.adminNotice)}</p>` : ""}
    <section class="list-card">
      ${visibleRows.map(renderTenantRow).join("") || `<p class="empty-state">${ui.adminSearch ? "No tenants match the current search." : "No tenants yet."}</p>`}
    </section>
    ${renderAdminPagination("tenants", rows.length, page)}`;
}

function renderAdminInviteEmails() {
  const mails = data.inviteEmails || [];
  const rows = filterAdminRows(mails, inviteSearchText);
  const page = adminPageFor("invites", rows.length);
  const visibleRows = paginateAdminRows(rows, page);
  return `
    <div class="section-toolbar"><strong>${rows.length} of ${mails.length} sent invite emails</strong>${renderAdminSearch("Search invite email, tenant, status...")}<span class="toolbar-spacer"></span></div>
    <section class="list-card">
      ${visibleRows.map((mail) => `<div class="invite-row"><span class="activity-symbol">✉</span><span class="list-primary">${escapeHtml(mail.to)}<small>${escapeHtml(mail.tenantName)} · ${inviteSummary(mail)}</small></span><span class="muted">${formatTimestamp(mail.sentAt)}</span></div>`).join("") || `<p class="empty-state">${ui.adminSearch ? "No invite emails match the current search." : "No invite emails sent yet."}</p>`}
    </section>
    ${renderAdminPagination("invites", rows.length, page)}`;
}

function renderAdminAuditLog() {
  const rows = data.auditLogs || [];
  const filteredRows = filterAdminRows(rows, auditSearchText);
  const page = adminPageFor("audit", filteredRows.length);
  const visibleRows = paginateAdminRows(filteredRows, page);
  return `
    <div class="section-toolbar"><strong>${filteredRows.length} of ${rows.length} audit records</strong>${renderAdminSearch("Search operation, tenant, user, target...")}<span class="toolbar-spacer"></span></div>
    <section class="list-card audit-log-card">
      ${visibleRows.map(renderAuditLogRow).join("") || `<p class="empty-state">${ui.adminSearch ? "No audit records match the current search." : "No audit records yet."}</p>`}
    </section>
    ${renderAdminPagination("audit", filteredRows.length, page)}`;
}

function renderAdminSearch(placeholder) {
  return `<label class="table-search admin-list-search"><span>⌕</span><input data-admin-search value="${escapeHtml(ui.adminSearch)}" placeholder="${escapeHtml(placeholder)}" /></label>`;
}

function filterAdminRows(rows, textFn) {
  const query = ui.adminSearch.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((item) => textFn(item).toLowerCase().includes(query));
}

function adminPageFor(tab, total) {
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(ui.adminPages?.[tab] || 1)), totalPages);
  ui.adminPages = { ...(ui.adminPages || {}), [tab]: page };
  return page;
}

function paginateAdminRows(rows, page) {
  const start = (page - 1) * ADMIN_LIST_PAGE_SIZE;
  return rows.slice(start, start + ADMIN_LIST_PAGE_SIZE);
}

function renderAdminPagination(tab, total, page) {
  if (total <= ADMIN_LIST_PAGE_SIZE) return "";
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_LIST_PAGE_SIZE));
  const start = (page - 1) * ADMIN_LIST_PAGE_SIZE + 1;
  const end = Math.min(total, page * ADMIN_LIST_PAGE_SIZE);
  return `<div class="signal-pagination admin-pagination"><span>Showing ${start}-${end} of ${total}</span><button class="button small" data-action="admin-page" data-tab="${escapeHtml(tab)}" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><button class="button small" data-action="admin-page" data-tab="${escapeHtml(tab)}" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Next</button></div>`;
}

function tenantSearchText(tenant) {
  return [tenant.name, tenant.slug, tenant.plan, tenant.status, tenant.region, tenant.seats, tenant.billingEmail, tenantAdminEmail(tenant)].join(" ");
}

function inviteSearchText(mail) {
  return [mail.to, mail.tenantName, mail.status, mail.detail, inviteSummary(mail), mail.sentAt].join(" ");
}

function auditSearchText(item) {
  return [item.operation, item.tenantName, item.details?.editedTenantName, item.userEmail, item.userRole, item.eventType, item.target, auditFieldSummary(item.details?.fields), item.createdAt].join(" ");
}

function auditFieldSummary(fields = {}) {
  const entries = Object.entries(fields || {}).slice(0, 8);
  if (!entries.length) return "";
  const summary = entries.map(([key, value]) => `${key}: ${String(value ?? "").slice(0, 80)}`).join(", ");
  return ` · fields: ${summary}`;
}

function renderAuditLogRow(item) {
  const fields = auditFieldSummary(item.details?.fields);
  const tenantLabel = item.tenantName && item.tenantName !== "Unknown tenant" ? item.tenantName : item.details?.editedTenantName || "Unknown tenant";
  return `<div class="audit-row"><span class="activity-symbol">◷</span><span class="list-primary">${escapeHtml(item.operation)}<small>${escapeHtml(tenantLabel)} · ${escapeHtml(item.userEmail || "unknown user")} · ${escapeHtml(item.eventType)}${escapeHtml(fields)}</small></span><span class="muted">${formatTimestamp(item.createdAt)}</span><code>${escapeHtml(item.target || "-")}</code></div>`;
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
    ${renderPageHeader(`${israelGreeting()}, ${currentUser().name.split(" ")[0]}`, `Here is what is happening in ${tenant.name}.`)}
    ${renderSummary()}
    <section class="admin-grid">
      <article class="widget wide"><h3>Accounts that need attention</h3>${attentionAccounts.map(renderHomeAttentionAccount).join("") || `<p class="empty-state">No high-priority accounts right now.</p>`}</article>
      <article class="widget"><h3>Today's focus</h3><button class="summary-card focus-card" data-action="open-activities"><span class="summary-icon" style="background:var(--orange-soft);color:var(--orange)">◴</span><div><small>Open tasks</small><strong>${tasks.length}</strong></div><span class="summary-trend">Open</span></button></article>
      <article class="widget">${renderHomeAttentionPanel(tenant)}</article>
      <article class="widget wide"><div class="panel-head"><h3>Relationship events</h3><button class="icon-button small" data-action="open-activities" data-tooltip="Open activities" aria-label="Open activities">↗</button></div><div class="home-event-list">${homeEvents(tenant).map(renderHomeEvent).join("")}</div></article>
    </section>`;
}

function renderHomeAttentionAccount(item) {
  const { account, primaryDeal, count, value, reasons, attentionThreadId } = item;
  const label = attentionThreadId ? "Attention" : "High";
  const content = `<span class="list-primary">${escapeHtml(account)}<small>${escapeHtml(primaryDeal.name)} · ${escapeHtml(primaryDeal.contact)}${count > 1 ? ` · ${count} open deals` : ""}</small><span class="attention-reasons">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</span></span><strong>${money(value)}</strong><span class="priority priority-high">${label}</span>`;
  if (!attentionThreadId) return `<button class="metric-row attention-row" data-open-account="${escapeHtml(account)}">${content}</button>`;
  return `<div class="metric-row attention-row correlated-attention-row"><button class="attention-main" data-action="focus-home-correspondence-account" data-account="${escapeHtml(account)}" data-thread-id="${escapeHtml(attentionThreadId)}">${content}</button><button class="icon-button small" data-open-account="${escapeHtml(account)}" data-tooltip="Open account" aria-label="Open account">↗</button></div>`;
}

function renderHomeAttentionPanel(tenant = currentTenant()) {
  const followUps = homeContactsNeedingFollowUp(tenant);
  const attention = homeCorrespondenceRequiringAttention(tenant);
  const accountThreads = homeAccountCorrespondenceNeedingAttention(tenant);
  return `<div class="panel-head"><h3>Correspondence needing attention</h3><span class="thread-actions"><button class="risk-jump-button small" data-action="jump-home-risk-thread" data-tooltip="Jump to red correspondence" aria-label="Jump to red correspondence">!</button><button class="icon-button small" data-action="open-inbox" data-tooltip="Open inbox" aria-label="Open inbox">↗</button></span></div>
    <div class="home-attention-section"><h4>Contacts needing follow-up</h4><p class="subcopy">Contacts with no sent mail in the configured window.</p><div class="home-thread-list">${followUps.map(renderHomeAttentionThread).join("") || `<p class="empty-state compact">No contacts are past the configured threshold.</p>`}</div></div>
    <div class="home-attention-section"><h4>Correspondence requiring attention</h4><p class="subcopy">Negative wording found in the latest scan.</p><div class="home-thread-list">${attention.map(renderHomeAttentionThread).join("") || `<p class="empty-state compact">No negative wording found in the latest scan.</p>`}</div></div>
    ${accountThreads.length ? `<div class="home-attention-section"><h4>Account correspondence signals</h4><p class="subcopy">Open account conversations with approval, renewal, launch, or anger risk.</p><div class="home-thread-list">${accountThreads.map(renderHomeAttentionThread).join("")}</div></div>` : ""}`;
}

function homeCorrespondenceRequiringAttention(tenant = currentTenant()) {
  return gmailAttentionCorrespondence(tenant).map((item) => {
    const deal = tenant.deals.find((candidate) => String(candidate.email || "").toLowerCase() === String(item.email || "").toLowerCase())
      || tenant.deals.find((candidate) => candidate.account === item.account);
    return {
      id: `attention-${item.email}`,
      account: item.account,
      dealId: deal?.id || "",
      email: item.email,
      subject: "Negative wording detected",
      person: item.contact || item.email,
      date: item.lastSeenAt || today(),
      risk: true,
      followUp: true,
      messages: [
        { side: "customer", author: item.contact || item.email, body: `Gmail scan matched: ${item.matches.join(", ") || "negative wording"}.` },
        { side: "team", author: currentUser().name, body: "Review this correspondence and respond before the relationship risk grows." },
      ],
    };
  }).slice(0, 3);
}

function homeContactsNeedingFollowUp(tenant = currentTenant()) {
  return gmailDormantContacts(tenant, Number(gmailIntegration(tenant).staleMonths || 3)).map((contact) => {
    const deal = tenant.deals.find((item) => String(item.email || "").toLowerCase() === String(contact.email || "").toLowerCase())
      || tenant.deals.find((item) => item.account === contact.account);
    return {
      id: `dormant-${contact.email}`,
      account: contact.account || deal?.account || contact.email.split("@")[1],
      dealId: deal?.id || "",
      email: contact.email,
      subject: `No sent email for ${contact.months || 3} months`,
      person: contact.contact || contact.email,
      date: today(),
      risk: false,
      followUp: true,
      messages: [
        { side: "customer", author: contact.contact || contact.email, body: `${contact.email} has not received an outbound email in ${contact.months || 3} months.` },
        { side: "team", author: currentUser().name, body: "Send a short check-in from Email integration to restart the relationship." },
      ],
    };
  }).slice(0, 3);
}

function homeAccountCorrespondenceNeedingAttention(tenant = currentTenant()) {
  const attentionDeals = accountsNeedingAttention(tenant).map((item) => item.primaryDeal).slice(0, 3);
  return attentionDeals.flatMap((deal) => {
    const contacts = topAccountContacts(deal);
    return accountCorrespondence(deal, contacts)
      .filter((thread) => thread.risk || /approval|timeline|launch|renew/i.test(thread.subject))
      .map((thread) => ({ ...thread, account: deal.account, dealId: deal.id, email: deal.email }));
  }).slice(0, 3);
}

function homeCorrespondenceNeedingAttention(tenant = currentTenant()) {
  return [...homeCorrespondenceRequiringAttention(tenant), ...homeContactsNeedingFollowUp(tenant), ...homeAccountCorrespondenceNeedingAttention(tenant)]
    .sort((a, b) => Number(b.risk) - Number(a.risk) || Number(b.followUp) - Number(a.followUp))
    .slice(0, 3);
}

function renderHomeAttentionThread(thread) {
  return `<section class="thread-card home-thread-card ${thread.risk ? "risk-thread" : ""}" data-home-thread-id="${escapeHtml(thread.id)}" data-home-thread-account="${escapeHtml(thread.account)}"><header><div><strong>${escapeHtml(thread.subject)}</strong><small>${thread.risk ? "Anger detected · " : ""}${escapeHtml(thread.account)} · ${formatTimestamp(thread.date)}</small></div><span class="thread-actions">${thread.risk ? `<span class="risk-label">Red risk</span>` : ""}<button class="icon-button small" data-open-account="${escapeHtml(thread.account)}" data-tooltip="Open account" aria-label="Open account">↗</button></span></header><div class="thread-messages">${thread.messages.map((message) => `<div class="message-bubble ${message.side}"><small>${escapeHtml(message.author)}</small><p>${escapeHtml(message.body)}</p></div>`).join("")}</div><div class="home-thread-actions"><button class="button primary small" data-action="reply-home-correspondence" data-thread-id="${escapeHtml(thread.id)}">Send email</button></div></section>`;
}

function focusHomeCorrespondenceAccount(account, threadId = "") {
  const thread = [...document.querySelectorAll("[data-home-thread-id]")].find((item) => (
    (threadId && item.dataset.homeThreadId === threadId)
    || (!threadId && item.dataset.homeThreadAccount === account)
  ));
  thread?.scrollIntoView({ behavior: "smooth", block: "center" });
  thread?.classList.add("is-highlighted");
  setTimeout(() => thread?.classList.remove("is-highlighted"), 1400);
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
    .filter((deal) => deal.priority === "High" && isOpenDeal(deal))
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
  for (const thread of homeAccountAttentionCorrelations(tenant)) {
    const deal = tenant.deals.find((item) => String(item.id) === String(thread.dealId))
      || tenant.deals.find((item) => item.account === thread.account);
    if (!deal || !isOpenDeal(deal)) continue;
    if (!deal) continue;
    const existing = grouped.get(deal.account) || { account: deal.account, primaryDeal: deal, count: 0, value: Number(deal.value || 0), reasons: [] };
    grouped.set(deal.account, {
      ...existing,
      primaryDeal: Number(deal.value) > Number(existing.primaryDeal.value || 0) ? deal : existing.primaryDeal,
      count: Math.max(existing.count, 1),
      value: Math.max(existing.value, Number(deal.value || 0)),
      reasons: [...new Set(["Correspondence needs attention", thread.subject, ...(existing.reasons || [])])].slice(0, 4),
      attentionThreadId: existing.attentionThreadId || thread.id,
      correspondenceRisk: true,
    });
  }
  return [...grouped.values()].sort((a, b) => Number(b.correspondenceRisk) - Number(a.correspondenceRisk) || b.value - a.value);
}

function homeAccountAttentionCorrelations(tenant = currentTenant()) {
  return [...homeCorrespondenceRequiringAttention(tenant), ...homeContactsNeedingFollowUp(tenant)]
    .filter((thread) => thread.dealId && tenant.deals.some((deal) => String(deal.id) === String(thread.dealId)));
}

function isOpenDeal(deal) {
  return deal && !["Won", "Lost"].includes(deal.stage);
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
  if (supportTicketsForAccount(deal.account).some((ticket) => supportTicketRisk(ticket))) reasons.push("Support SLA or complaint risk");
  return reasons.length ? reasons : ["Engagement needs review"];
}

function supportTicketsForAccount(account, tenant = currentTenant()) {
  return (tenant.supportTickets || []).filter((ticket) => ticket.account === account).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function supportTicketRisk(ticket) {
  return ticket.priority === "High" || /breach|angry|frustrated|concerned|overdue/i.test(`${ticket.sla} ${ticket.sentiment} ${ticket.subject}`);
}

function accountSupportHealth(account, tenant = currentTenant()) {
  const tickets = supportTicketsForAccount(account, tenant);
  const risky = tickets.filter(supportTicketRisk);
  if (!tickets.length) return { label: "No open support context", tone: "stage-won", count: 0, risky: 0 };
  if (risky.length) return { label: `${risky.length} support risk${risky.length === 1 ? "" : "s"}`, tone: "stage-negotiation", count: tickets.length, risky: risky.length };
  return { label: `${tickets.length} support ticket${tickets.length === 1 ? "" : "s"} on track`, tone: "stage-qualified", count: tickets.length, risky: 0 };
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

function renderReports() {
  const tenant = currentTenant();
  const deals = tenant.deals;
  const open = deals.filter((deal) => !["Won", "Lost"].includes(deal.stage));
  const riskAccounts = accountsNeedingAttention(tenant);
  const supportRiskTickets = tenant.supportTickets.filter(supportTicketRisk);
  const savedReports = customReportDefinitions(tenant);
  return `${renderPageHeader("Reports", "Build saved dashboards for forecast, bottlenecks, account risk, and activity health.")}
    <section class="report-hero">
      <div><p class="eyebrow">Custom reporting</p><h2>${money(weightedForecast())} weighted forecast</h2><p>Saved reports combine pipeline, Gmail risk, activities, campaigns, and account tags into one management view.</p></div>
      <div class="report-filter-panel">
        <span>Owner</span><strong>${new Set(deals.map((deal) => deal.owner)).size} owners</strong>
        <span>Stage</span><strong>${stages.filter((stage) => deals.some((deal) => deal.stage === stage)).length} active stages</strong>
        <span>Risk</span><strong>${riskAccounts.length} accounts</strong>
        <span>Source</span><strong>CRM + Gmail + Support</strong>
      </div>
    </section>
    <div class="summary-grid report-summary">
      ${summaryCard("↗", "var(--blue-soft)", "var(--blue)", "Open pipeline", money(total(open)), `${open.length} deals`)}
      ${summaryCard("◎", "var(--mint-soft)", "var(--mint)", "Weighted forecast", money(weightedForecast()), "by stage confidence")}
      ${summaryCard("!", "#fee2e2", "#b91c1c", "Risk accounts", riskAccounts.length, "need review")}
      ${summaryCard("◴", "var(--orange-soft)", "var(--orange)", "Support risks", supportRiskTickets.length, "SLA and sentiment")}
    </div>
    ${ui.selectedReportTemplate ? `<p class="admin-notice">Opened report template: ${escapeHtml(ui.selectedReportTemplate)}</p>` : ""}
    <section class="report-grid">
      <article class="widget wide report-widget"><div class="panel-head"><h3>Saved reports</h3><span class="subcopy">${savedReports.length} templates</span></div><div class="saved-report-list">${savedReports.map(renderSavedReportCard).join("")}</div></article>
      <article class="widget report-widget"><h3>Forecast by owner</h3>${reportOwnerRows(open).map(renderReportMetricRow).join("")}</article>
      <article class="widget report-widget"><h3>Stage bottlenecks</h3>${reportStageRows(open).map(renderReportMetricRow).join("")}</article>
      <article class="widget report-widget"><h3>Support health</h3>${reportSupportRows(tenant).map(renderReportMetricRow).join("")}</article>
      <article class="widget wide report-widget"><h3>Risk and source table</h3><table class="report-table"><thead><tr><th>Account</th><th>Owner</th><th>Stage</th><th>Risk reason</th><th>Value</th></tr></thead><tbody>${riskAccounts.slice(0, 8).map((item) => { const deal = item.primaryDeal; return `<tr><td><button class="inline-link" data-open-account="${escapeHtml(deal.account)}">${escapeHtml(deal.account)}</button></td><td>${escapeHtml(deal.owner)}</td><td>${escapeHtml(deal.stage)}</td><td>${escapeHtml(item.reasons?.[0] || "Needs review")}</td><td>${money(deal.value)}</td></tr>`; }).join("") || `<tr><td colspan="5" class="empty-state">No account risk detected.</td></tr>`}</tbody></table></article>
    </section>`;
}

function customReportDefinitions(tenant) {
  return [
    { name: "Monthly forecast by owner", description: "Weighted forecast grouped by owner, stage, and expected close date.", filter: "Owner + stage + close month", metric: money(weightedForecast()) },
    { name: "Account risk board", description: "Accounts with negative correspondence, dormant contacts, support tickets, high priority deals, or renewal pressure.", filter: "Risk + Gmail + support", metric: accountsNeedingAttention(tenant).length },
    { name: "Support SLA health", description: "Zendesk, Freshdesk, and Gmail support labels grouped by account health and sentiment.", filter: "SLA + source + sentiment", metric: tenant.supportTickets.filter(supportTicketRisk).length },
    { name: "Campaign impact", description: "Campaign audiences, tags, recurrence, and related pipeline for outreach planning.", filter: "Campaign + tag + level", metric: tenant.campaigns?.length || 0 },
  ];
}

function renderSavedReportCard(report) {
  return `<button class="saved-report-card ${ui.selectedReportTemplate === report.name ? "is-selected" : ""}" data-action="open-report-template" data-report-name="${escapeHtml(report.name)}"><strong>${escapeHtml(report.name)}</strong><small>${escapeHtml(report.description)}</small><span>${escapeHtml(report.filter)}</span><em>${escapeHtml(String(report.metric))}</em></button>`;
}

function reportOwnerRows(deals) {
  return Object.entries(deals.reduce((rows, deal) => {
    rows[deal.owner] = rows[deal.owner] || { label: deal.owner, value: 0, count: 0 };
    rows[deal.owner].value += Number(deal.value || 0) * ((data.stageProbabilities[deal.stage] || 0) / 100);
    rows[deal.owner].count += 1;
    return rows;
  }, {})).map(([, row]) => ({ ...row, valueLabel: money(row.value), detail: `${row.count} open deals` })).sort((a, b) => b.value - a.value);
}

function reportStageRows(deals) {
  return stages.map((stage) => {
    const stageDeals = deals.filter((deal) => deal.stage === stage);
    return { label: stage, value: total(stageDeals), valueLabel: money(total(stageDeals)), detail: `${stageDeals.length} deals` };
  }).filter((row) => row.value || row.detail !== "0 deals");
}

function reportSupportRows(tenant) {
  return Object.entries((tenant.supportTickets || []).reduce((rows, ticket) => {
    rows[ticket.source] = rows[ticket.source] || { label: ticket.source, count: 0, risky: 0 };
    rows[ticket.source].count += 1;
    if (supportTicketRisk(ticket)) rows[ticket.source].risky += 1;
    return rows;
  }, {})).map(([, row]) => ({ label: row.label, value: row.risky, valueLabel: `${row.risky}/${row.count}`, detail: "risky tickets" }));
}

function renderReportMetricRow(row) {
  return `<div class="report-metric-row"><span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small></span><b>${escapeHtml(row.valueLabel)}</b></div>`;
}

function renderContacts() {
  const allContacts = uniqueBy("email");
  const contacts = filteredContacts(allContacts);
  const query = ui.contactSearch.trim();
  const hasFilters = query || ui.contactTagFilters.length;
  return `${renderPageHeader("Contacts", "Keep the people behind every opportunity organized.")}<div class="section-toolbar"><strong>${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-contact">＋ Add contact</button></div><div class="contact-search-bar"><label class="table-search contact-search"><span>⌕</span><input data-contact-search value="${escapeHtml(ui.contactSearch)}" placeholder="Search contacts, accounts, email, owner, deal, stage..." /></label>${renderContactTagFilter()}${hasFilters ? `<button class="button small" data-action="clear-contact-search">Clear</button>` : ""}</div><section class="list-card">${ui.inlineContactOpen ? renderInlineContactRow() : ""}${contacts.map(renderContactRow).join("") || (!ui.inlineContactOpen ? `<p class="empty-state">${hasFilters ? "No contacts match the current filters." : "No contacts yet."}</p>` : "")}</section>`;
}

function renderContactTagFilter() {
  const selected = new Set(ui.contactTagFilters);
  const label = selected.size ? `${selected.size} ${selected.size === 1 ? "tag" : "tags"}` : "All tags";
  return `<details class="contact-tag-filter"><summary><span>Tags</span><strong>${escapeHtml(label)}</strong></summary><div class="tag-filter-menu">${allContactTags().map((tag) => `<label><input type="checkbox" data-contact-tag-filter value="${escapeHtml(tag)}" ${selected.has(tag) ? "checked" : ""} />${escapeHtml(tag)}</label>`).join("")}</div></details>`;
}

function renderInlineContactRow() {
  return `<form class="list-row contact-row inline-contact-row" data-inline-contact-form><span class="activity-symbol">＋</span><span class="inline-field-stack"><input name="contact" placeholder="Contact name" required /><input name="email" type="email" placeholder="Email" required /></span><input name="phone" placeholder="Phone" /><input name="account" placeholder="Account" required /><select name="owner">${Object.keys(owners).map((owner) => `<option ${owner === currentUser().name ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select><span class="row-actions"><button class="button small primary">Save</button><button type="button" class="button small" data-action="cancel-inline-add">Cancel</button></span></form>`;
}

function filteredContacts(contacts = uniqueBy("email")) {
  const query = ui.contactSearch.trim().toLowerCase();
  const tagFilters = new Set(ui.contactTagFilters || []);
  return contacts.filter((deal) => {
    const matchesQuery = !query || [
    deal.contact,
    deal.account,
      deal.email,
      deal.phone,
    ...(deal.tags || []),
    deal.owner,
    deal.name,
    deal.stage,
    deal.priority,
    deal.note,
  ].join(" ").toLowerCase().includes(query);
    const matchesTags = !tagFilters.size || (deal.tags || []).some((tag) => tagFilters.has(tag));
    return matchesQuery && matchesTags;
  });
}

function renderContactRow(deal) {
  const isOpen = ui.selectedContactEmail === deal.email;
  const isEditing = ui.editingContactEmail === deal.email;
  return `<div class="list-row contact-row ${isOpen ? "is-open" : ""}">${avatar(deal.owner)}<button class="activity-main" data-open-contact="${escapeHtml(deal.email)}"><span class="list-primary">${escapeHtml(deal.contact)}<small>${escapeHtml(deal.email)}</small></span></button><span class="muted contact-phone">${escapeHtml(deal.phone || "-")}</span>${renderCompactContactTags(deal)}<button class="inline-link" data-open-account="${escapeHtml(deal.account)}">${escapeHtml(deal.account)}</button><span class="row-actions"><button class="button small" data-action="edit-contact" data-email="${escapeHtml(deal.email)}">Edit</button><button class="button small danger" data-action="delete-contact" data-email="${escapeHtml(deal.email)}">Delete</button></span></div>${isEditing ? renderEditContactRow(deal) : ""}${isOpen && !isEditing ? renderContactDetail(deal) : ""}`;
}

function renderEditContactRow(deal) {
  return `<form class="contact-edit-panel" data-edit-contact-form data-original-email="${escapeHtml(deal.email)}">
    <div class="contact-edit-head"><span class="activity-symbol">✎</span><div><strong>Edit contact</strong><small>Update the contact details saved for this account.</small></div></div>
    <div class="contact-edit-grid">
      <label><span>Contact name</span><input name="contact" value="${escapeHtml(deal.contact)}" placeholder="Contact name" required /></label>
      <label><span>Email</span><input name="email" type="email" value="${escapeHtml(deal.email)}" placeholder="Email" required /></label>
      <label class="contact-edit-phone"><span>Phone number</span><input name="phone" value="${escapeHtml(deal.phone || "")}" placeholder="+1 415 555 0198" /></label>
      <label><span>Account</span><input name="account" value="${escapeHtml(deal.account)}" placeholder="Account" required /></label>
      <label><span>Owner</span><select name="owner">${Object.keys(owners).map((owner) => `<option ${owner === deal.owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select></label>
    </div>
    <div class="contact-edit-actions"><button class="button primary">Save contact</button><button type="button" class="button" data-action="cancel-contact-edit">Cancel</button></div>
  </form>`;
}

function renderCompactContactTags(deal) {
  const tags = deal.tags || [];
  const visibleTags = tags.slice(0, 2);
  return `<span class="contact-tags-short account-tags">${visibleTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}${tags.length > visibleTags.length ? `<span>+${tags.length - visibleTags.length}</span>` : ""}</span>`;
}

function renderContactDetail(deal) {
  const profile = contactProfile(deal);
  const contactTags = normalizeTags(deal.tags || []);
  const availableTags = allContactTags().filter((tag) => !contactTags.includes(tag));
  return `<div class="contact-detail-row">
    <div class="contact-detail-head">${avatar(deal.contact, "large")}<div><h3>${escapeHtml(deal.contact)}</h3><p class="subcopy">${escapeHtml(profile.role)} · <button class="text-link" data-open-account="${escapeHtml(deal.account)}">${escapeHtml(deal.account)}</button></p></div></div>
    <div class="contact-tag-editor"><span class="account-tags">${contactTags.map((tag) => `<button data-action="remove-contact-tag" data-id="${escapeHtml(deal.id)}" data-tag="${escapeHtml(tag)}" data-tooltip="Remove tag">${escapeHtml(tag)} ×</button>`).join("") || `<span>No tags yet</span>`}</span><select data-contact-tag-select data-id="${escapeHtml(deal.id)}"><option value="">Add tag...</option>${availableTags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}<option value="__new__">...add new</option></select></div>
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
  return `${renderPageHeader("Accounts", "Track customers and prospects at the company level.")}<div class="section-toolbar"><strong>${accounts.length} accounts</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-deal">＋ Add account</button></div><section class="list-card">${accounts.map((deal) => `<div class="list-row account-row"><span class="account-mark">${initials(deal.account)}</span><button class="activity-main" data-open-account="${escapeHtml(deal.account)}"><span class="list-primary">${escapeHtml(deal.account)}<small>${escapeHtml(deal.contact)}</small><span class="account-tags">${accountTags(deal.account).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</span></span></button><strong>${money(total(currentTenant().deals.filter((item) => item.account === deal.account)))}</strong><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span><button class="button small danger" data-action="delete-account" data-account="${escapeHtml(deal.account)}">Delete</button></div>`).join("") || `<p class="empty-state">No accounts yet.</p>`}</section>`;
}

function allAccountTags() {
  return allContactTags();
}

function allContactTags() {
  const tenant = currentTenant();
  return normalizeTags([...defaultTags, ...(tenant.availableTags || []), ...tenant.deals.flatMap((deal) => deal.tags || [])]);
}

function accountTags(account) {
  return [...new Set(currentTenant().deals.filter((deal) => deal.account === account).flatMap((deal) => deal.tags || []))].sort();
}

async function saveAvailableTag(tag) {
  const normalized = normalizeTagName(tag);
  if (!normalized) return "";
  const tenant = currentTenant();
  if (session?.apiToken) {
    const result = await createTagViaApi(tenant.id, normalized);
    setTenant({ ...currentTenant(), availableTags: normalizeTags(result.tags || [...(currentTenant().availableTags || []), normalized]) });
  } else {
    setTenant({ ...tenant, availableTags: normalizeTags([...(tenant.availableTags || []), normalized]) });
  }
  return normalized;
}

function openTagDialog(target) {
  ui.pendingTag = target;
  ui.modal = "tag";
  render();
}

async function setContactTags(dealId, tags) {
  const tenant = currentTenant();
  const existing = tenant.deals.find((deal) => String(deal.id) === String(dealId));
  if (!existing) return;
  const nextTags = normalizeTags(tags);
  const nextDeal = { ...existing, tags: nextTags, updated: "Just now" };
  const saved = session?.apiToken ? (await updateDealViaApi(tenant.id, existing.id, nextDeal)).deal : nextDeal;
  setTenant({
    ...currentTenant(),
    deals: currentTenant().deals.map((deal) => String(deal.id) === String(existing.id) ? saved : deal),
    availableTags: normalizeTags([...(currentTenant().availableTags || []), ...nextTags]),
  });
}

async function setAccountTags(account, tags) {
  const tenant = currentTenant();
  const nextTags = normalizeTags(tags);
  const updatedDeals = [];
  let deals = tenant.deals.map((deal) => {
    if (deal.account !== account) return deal;
    const updated = { ...deal, tags: nextTags, updated: "Just now" };
    updatedDeals.push(updated);
    return updated;
  });
  if (session?.apiToken) {
    const savedDeals = [];
    for (const deal of updatedDeals) savedDeals.push((await updateDealViaApi(tenant.id, deal.id, deal)).deal);
    deals = deals.map((deal) => savedDeals.find((saved) => String(saved.id) === String(deal.id)) || deal);
  }
  setTenant({ ...currentTenant(), deals, availableTags: normalizeTags([...(currentTenant().availableTags || []), ...nextTags]) });
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

function mailTemplates(tenant = currentTenant()) {
  return normalizeMailTemplates(tenant.mailTemplates);
}

function selectedMailTemplate() {
  const templates = mailTemplates();
  return templates.find((template) => String(template.id) === String(ui.emailTemplateId)) || templates[0];
}

function mergeMailTemplate(value = "", deal = currentTenant().deals[0]) {
  const data = {
    ...mergeDataForDeal(deal),
    mainContactName: deal?.contact || "there",
    contactName: deal?.contact || "there",
    email: deal?.email || "",
    phone: deal?.phone || "",
    months: String(gmailDormantContacts(currentTenant()).find((item) => item.email === deal?.email)?.months || gmailIntegration(currentTenant()).staleMonths || 3),
  };
  return String(value || "").replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
}

function renderImportStrip() {
  return `<section class="import-strip"><button data-action="import-source" data-source="csv"><strong>CSV</strong><small>Upload accounts and contacts from a spreadsheet</small></button><button data-action="import-source" data-source="salesforce"><strong>Salesforce</strong><small>Sync leads, accounts, contacts, and owners</small></button><button data-action="import-source" data-source="zendesk"><strong>Zendesk/Freshdesk</strong><small>Bring tickets, SLA risk, complaints, and support context</small></button></section>`;
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
  const timeline = accountTimeline(accountDeal);
  const supportHealth = accountSupportHealth(accountDeal.account);
  const supportTickets = supportTicketsForAccount(accountDeal.account);
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
          <span><small>Support health</small><strong>${escapeHtml(supportHealth.label)}</strong></span>
        </div>
        <div class="account-summary-actions"><button class="risk-jump-button" data-action="jump-risk-thread" data-tooltip="Jump to anger correspondence" aria-label="Jump to anger correspondence">!</button><span>Anger correspondence detected</span></div>
      </article>
      <article class="account-panel">
        <h3>Top contacts</h3>
        <div class="contact-grid">${contacts.map(renderAccountContact).join("")}</div>
      </article>
      <article class="account-panel account-timeline-panel">
        <div class="panel-head"><div><h3>Account timeline</h3><p class="subcopy">Every customer signal in one chronological story.</p></div><span class="count">${timeline.length}</span></div>
        <div class="account-timeline">${timeline.map(renderAccountTimelineItem).join("")}</div>
      </article>
      <article class="account-panel support-panel">
        <div class="panel-head"><div><h3>Support context</h3><p class="subcopy">Zendesk, Freshdesk, and Gmail support labels tied to the account.</p></div><span class="status-pill ${supportHealth.tone}">${escapeHtml(supportHealth.label)}</span></div>
        <div class="support-ticket-list">${supportTickets.map(renderSupportTicket).join("") || `<p class="empty-state compact">No support tickets linked to this account.</p>`}</div>
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

function renderSupportTicket(ticket) {
  return `<div class="support-ticket ${supportTicketRisk(ticket) ? "support-risk" : ""}"><span class="activity-symbol">${ticket.source === "Gmail label" ? "✉" : "!"}</span><div><strong>${escapeHtml(ticket.subject)}</strong><small>${escapeHtml(ticket.requester)} · ${escapeHtml(ticket.source)} · ${formatTimestamp(ticket.updatedAt)}</small><p>${escapeHtml(ticket.status)} · ${escapeHtml(ticket.priority)} priority · SLA: ${escapeHtml(ticket.sla)} · sentiment: ${escapeHtml(ticket.sentiment)}</p></div></div>`;
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

function accountTimeline(accountDeal) {
  const tenant = currentTenant();
  const accountDeals = tenant.deals.filter((deal) => deal.account === accountDeal.account);
  const dealIds = new Set(accountDeals.map((deal) => String(deal.id)));
  const contacts = topAccountContacts(accountDeal);
  const items = [];
  for (const deal of accountDeals) {
    items.push({
      id: `deal-${deal.id}`,
      type: "Deal",
      tone: deal.priority === "High" ? "risk" : "deal",
      date: deal.close || today(),
      title: `${deal.name} target close`,
      detail: `${deal.stage} · ${money(deal.value)} · ${deal.owner}`,
      action: "Open deal",
      dealId: deal.id,
    });
  }
  for (const task of tenant.tasks.filter((task) => dealIds.has(String(task.dealId)))) {
    items.push({
      id: `task-${task.id}`,
      type: task.completed ? "Completed activity" : "Activity",
      tone: task.completed ? "done" : task.priority === "High" ? "risk" : "activity",
      date: task.due || today(),
      title: task.title,
      detail: `${task.type} · ${task.owner} · ${task.completed ? "done" : "open"}`,
      action: task.completed ? "" : "Open activities",
      section: "activities",
    });
  }
  for (const item of tenant.communications.filter((communication) => dealIds.has(String(communication.dealId)))) {
    items.push({
      id: `communication-${item.id}`,
      type: item.type,
      tone: item.direction === "inbound" ? "email" : "sent",
      date: item.date,
      title: item.subject,
      detail: `${item.direction} · ${item.owner} · ${communicationTrackingLabel(item)}`,
      action: "Open inbox",
      section: "inbox",
    });
  }
  for (const campaign of (tenant.campaigns || []).filter((campaign) => campaignRecipients(campaign.audienceType, campaign.audienceValue).some((deal) => deal.account === accountDeal.account))) {
    items.push({
      id: `campaign-${campaign.id}`,
      type: "Campaign",
      tone: "campaign",
      date: campaign.createdAt || today(),
      title: campaign.name,
      detail: `${recurrenceLabel(campaign.recurrence)} · ${campaign.status}`,
      action: "Open campaigns",
      section: "campaigns",
    });
  }
  for (const moment of relationshipMoments(accountDeal, contacts).slice(0, 6)) {
    items.push({
      id: `moment-${moment.type}-${moment.date}`,
      type: moment.type,
      tone: moment.type === "Risk" ? "risk" : "moment",
      date: moment.date,
      title: moment.title,
      detail: moment.detail,
      action: "",
    });
  }
  for (const signal of gmailDormantContacts(tenant).filter((signal) => signal.account === accountDeal.account)) {
    items.push({
      id: `gmail-dormant-${signal.email}`,
      type: "Gmail follow-up",
      tone: "activity",
      date: gmailIntegration(tenant).lastScanAt || today(),
      title: `No sent email for ${signal.months || gmailIntegration(tenant).staleMonths || 3} months`,
      detail: `${signal.contact || signal.email} · ${signal.email}`,
      action: "Send email",
      email: signal.email,
    });
  }
  for (const signal of gmailAttentionCorrespondence(tenant).filter((signal) => signal.account === accountDeal.account)) {
    items.push({
      id: `gmail-risk-${signal.email}`,
      type: "Risk signal",
      tone: "risk",
      date: signal.lastSeenAt || gmailIntegration(tenant).lastScanAt || today(),
      title: "Negative wording detected",
      detail: `${signal.contact || signal.email} · ${signal.matches.slice(0, 4).join(", ") || "needs review"}`,
      action: "Respond",
      email: signal.email,
    });
  }
  return items
    .sort((a, b) => new Date(b.date || today()) - new Date(a.date || today()))
    .slice(0, 16);
}

function renderAccountTimelineItem(item) {
  const action = item.dealId
    ? `<button class="button small" data-open-deal="${escapeHtml(item.dealId)}">${escapeHtml(item.action)}</button>`
    : item.section && item.action
      ? `<button class="button small" data-section="${escapeHtml(item.section)}">${escapeHtml(item.action)}</button>`
      : item.email
        ? `<button class="button small primary" data-action="follow-up-contact" data-email="${escapeHtml(item.email)}">${escapeHtml(item.action)}</button>`
        : "";
  return `<div class="timeline-item timeline-${escapeHtml(item.tone)}"><span class="timeline-dot"></span><div><small>${escapeHtml(item.type)} · ${formatTimelineDate(item.date)}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div>${action}</div>`;
}

function formatTimelineDate(value) {
  if (!value) return "No date";
  const date = String(value).includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
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
      tracking: communicationTrackingLabel(item),
      source: item.source || "crm",
      gmailThreadId: item.gmailThreadId || "",
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
  const threadMeta = [thread.risk ? "Anger detected" : "", thread.tracking, thread.gmailThreadId ? `Gmail thread ${thread.gmailThreadId}` : "", thread.person, formatTimestamp(thread.date)].filter(Boolean).join(" · ");
  return `<section class="thread-card ${thread.risk ? "risk-thread" : ""}" data-thread-id="${escapeHtml(thread.id)}"><header><div><strong>${escapeHtml(thread.subject)}</strong><small>${escapeHtml(threadMeta)}</small></div><span class="thread-actions">${thread.source === "gmail" ? `<span class="tracking-pill tracking-gmail">Gmail · attached</span>` : ""}${thread.risk ? `<span class="risk-label">Red risk</span>` : ""}<button class="icon-button small" data-action="reply-correspondence" data-thread-id="${escapeHtml(thread.id)}" data-tooltip="Reply" aria-label="Reply">↩</button></span></header><div class="thread-messages">${thread.messages.map((message) => `<div class="message-bubble ${message.side}"><small>${escapeHtml(message.author)}</small><p>${escapeHtml(message.body)}</p></div>`).join("")}</div>${isReplying ? renderReplyComposer(thread.id) : ""}</section>`;
}

function communicationTrackingLabel(item = {}) {
  return item.trackingStatus || item.tracked || (item.source === "gmail" ? "Imported from Gmail" : "Logged");
}

function renderTrackingPill(item = {}) {
  const source = item.source === "gmail" ? "Gmail" : "CRM";
  const label = communicationTrackingLabel(item);
  const klass = item.source === "gmail" ? "tracking-gmail" : label.toLowerCase().includes("sent") ? "tracking-sent" : "tracking-logged";
  return `<span class="tracking-pill ${klass}">${escapeHtml(source)} · ${escapeHtml(label)}</span>`;
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

function openFollowUpEmail(email) {
  const deal = currentTenant().deals.find((item) => String(item.email || "").toLowerCase() === String(email || "").toLowerCase()) || currentTenant().deals[0];
  ui.emailDealId = deal?.id || null;
  ui.emailTemplateId = mailTemplates()[0]?.id || "follow-up-check-in";
  ui.emailContext = null;
  ui.modal = "email";
  ui.selected = null;
}

function openHomeCorrespondenceEmail(threadId) {
  const tenant = currentTenant();
  const thread = homeCorrespondenceNeedingAttention(tenant).find((item) => String(item.id) === String(threadId));
  if (!thread) return;
  const deal = tenant.deals.find((item) => String(item.id) === String(thread.dealId))
    || tenant.deals.find((item) => String(item.email || "").toLowerCase() === String(thread.email || "").toLowerCase())
    || tenant.deals.find((item) => item.account === thread.account)
    || tenant.deals[0];
  const transcript = thread.messages.map((message) => `${message.author}: ${message.body}`).join("\n");
  ui.emailDealId = deal?.id || null;
  ui.emailTemplateId = mailTemplates()[0]?.id || "follow-up-check-in";
  ui.emailContext = {
    to: thread.email || deal?.email || "",
    subject: `Re: ${thread.subject}`,
    account: thread.account,
    person: thread.person || deal?.contact || "",
    summary: `${thread.subject} · ${thread.account}`,
    body: `Hi ${deal?.contact || thread.person || "there"},\n\nI saw this needs attention and wanted to follow up directly.\n\nContext:\n${transcript}\n\nBest,\n${currentUser().name}`,
  };
  ui.modal = "email";
  ui.selected = null;
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
  return `${renderPageHeader("Inbox", "Keep customer communication attached to every opportunity.")}<div class="section-toolbar"><strong>${items.length} logged interactions</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="compose-email">＋ Send email</button></div><section class="activity-card">${items.map((item) => {
    const deal = currentTenant().deals.find((candidate) => candidate.id === item.dealId);
    const isOpen = String(ui.selectedCommunicationId) === String(item.id);
    return `<div class="communication-row ${isOpen ? "is-open" : ""}"><span class="activity-symbol">${item.type === "Meeting" ? "◴" : "✉"}</span><button class="activity-main" data-open-communication="${item.id}"><span class="list-primary">${escapeHtml(item.subject)}<small>${escapeHtml(deal?.name || "Unlinked")} · ${escapeHtml(deal?.account || "No account")} · ${escapeHtml(item.owner)}</small></span></button>${renderTrackingPill(item)}<span class="muted">${formatTimestamp(item.date)}</span><button class="button small danger" data-action="delete-communication" data-id="${item.id}">Delete</button></div>${isOpen ? renderInboxThread(item, deal) : ""}`;
  }).join("") || `<p class="empty-state">No communication logged yet.</p>`}</section>`;
}

function renderInboxThread(item, deal) {
  const contactName = deal?.contact || "Customer";
  const accountName = deal?.account || "Unlinked account";
  const customerBody = item.direction === "inbound" ? item.body : "Thanks for the update. Please keep this attached to the account plan so the next owner has full context.";
  const teamBody = item.direction === "inbound" ? "I logged this in the account timeline and added the next step for the owner." : item.body;
  return `<div class="inbox-thread-row"><section class="thread-card inbox-thread-card"><header><div><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(accountName)} · ${escapeHtml(contactName)} · ${formatTimestamp(item.date)}${item.gmailThreadId ? ` · thread ${escapeHtml(item.gmailThreadId)}` : ""}</small></div><span class="thread-actions">${renderTrackingPill(item)}<button class="icon-button small" data-open-account="${escapeHtml(accountName)}" data-tooltip="Open account" aria-label="Open account">↗</button></span></header><div class="thread-messages"><div class="message-bubble customer"><small>${escapeHtml(contactName)}</small><p>${escapeHtml(customerBody)}</p></div><div class="message-bubble team"><small>${escapeHtml(item.owner)}</small><p>${escapeHtml(teamBody)}</p></div></div></section></div>`;
}

function renderModal() {
  if (ui.modal === "whats-new") return renderWhatsNewDialog();
  if (ui.modal === "help") return renderHelpDialog();
  if (ui.modal === "tag") return renderTagDialog();
  if (ui.modal === "tenant") return renderTenantForm();
  if (ui.modal === "deal") return renderDealForm();
  if (ui.modal === "task") return renderTaskForm();
  if (ui.modal === "email") return renderEmailForm();
  if (ui.modal === "import") return renderImportModal();
  if (ui.modal === "settings") return renderSettings();
  if (ui.selected) return renderDealDrawer(currentTenant().deals.find((deal) => String(deal.id) === String(ui.selected)));
  return "";
}

function renderTagDialog() {
  const target = ui.pendingTag || {};
  const label = target.type === "account"
    ? `Add a reusable tag to ${target.account}`
    : `Add a reusable tag to ${currentTenant().deals.find((deal) => String(deal.id) === String(target.dealId))?.contact || "this contact"}`;
  return `<div class="modal-layer center tag-dialog-layer"><form class="modal tag-dialog" data-tag-form><header class="modal-head"><div><p class="eyebrow">Tag management</p><h2>Create a new tag</h2><p class="subcopy">${escapeHtml(label)} and make it available for future contacts, accounts, and campaigns.</p></div><button type="button" class="close-button" data-action="close">×</button></header><div class="tag-dialog-body"><div class="tag-preview-card"><span class="summary-icon" style="background: var(--blue-soft); color: var(--blue);">#</span><div><strong>Reusable customer signal</strong><small>Use tags for segments like Champion, Technical buyer, Renewal, VIP, or At risk.</small></div></div><label class="field full"><span>Tag name</span><input name="tag" placeholder="e.g. Champion" required autofocus /></label><div class="tag-suggestions">${["Champion", "Technical buyer", "VIP", "Renewal", "At risk"].map((tag) => `<button type="button" class="field-tag" data-action="use-tag-suggestion" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join("")}</div></div><div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Create and apply tag</button></div></form></div>`;
}

function renderWhatsNewDialog() {
  return `<div class="modal-layer center whats-new-layer"><section class="modal whats-new-modal"><div class="whats-new-window-bar"><span></span><span></span><span></span><strong>Product update</strong><button class="close-button" data-action="close-whats-new">×</button></div><div class="whats-new-frame"><header class="whats-new-head"><p class="eyebrow">What's new</p><h2>Account intelligence release</h2><p>Five major CRM upgrades now connect email, accounts, workflows, reporting, and support into one customer operating view.</p></header><div class="whats-new-hero"><div><strong>Customer context is now connected</strong><p>Gmail threads attach to accounts, visual automation turns risk into actions, reports show bottlenecks, and support tickets surface SLA and sentiment risk.</p></div><span>CRM OS</span></div><div class="whats-new-grid mail-capability-grid"><article><strong>Account timeline</strong><small>Deals, tasks, campaigns, Gmail signals, relationship moments, and correspondence now form one chronological account story.</small></article><article><strong>Email tracking</strong><small>Sent CRM email and imported Gmail threads show source, tracking status, and account attachment.</small></article><article><strong>Workflow builder</strong><small>Visual rules convert dormant contacts and negative wording into activities and risk tags after Gmail scans.</small></article><article><strong>Custom reports</strong><small>Saved reporting templates cover owner forecast, risk boards, campaign impact, and support health.</small></article><article><strong>Support context</strong><small>Zendesk, Freshdesk, and Gmail-label examples show SLA risk, sentiment, and complaints inside account detail.</small></article><article><strong>Online guide</strong><small>Every page has a question-mark help button that opens the relevant CRM guide section.</small></article></div><div class="form-actions"><button class="button" data-action="close-whats-new">Later</button><button class="button primary" data-action="open-help" data-help-topic="home">Open user guide</button></div></div></section></div>`;
}

function helpContent() {
  return {
    home: { title: "Home guide", copy: "Use Home to see today’s focus, accounts needing attention, correspondence risk, follow-up gaps, and relationship events.", steps: ["Open an account from any attention card to review the full context.", "Use the red risk jump icon to move directly to angry or escalation correspondence.", "Click follow-up actions to open a prefilled email dialog."] },
    pipeline: { title: "Pipeline guide", copy: "Manage active and closed opportunities from table, Kanban, and dashboard views.", steps: ["Use inline Add deal rows for fast entry.", "Switch to Dashboard for stage distribution and forecast.", "Import CSV, Salesforce, or support context from the page header."] },
    accounts: { title: "Accounts guide", copy: "Accounts combine contacts, timelines, support context, correspondence, tags, and relationship moments.", steps: ["Open Support context to review SLA and sentiment risk.", "Use Account timeline to see deals, tasks, Gmail, campaigns, and milestones together.", "Tags can segment accounts for campaigns and reports."] },
    campaigns: { title: "Campaigns guide", copy: "Build recurring account campaigns with tag, level, or account-name targeting.", steps: ["Choose an audience, recurrence, subject, and template.", "Use merge tokens like account name and main contact name.", "Click existing campaigns to inspect recipients and preview content."] },
    contacts: { title: "Contacts guide", copy: "Find people by name, account, email, owner, stage, phone, or tags.", steps: ["Use search and tag filters together.", "Expand a contact for details and linked account navigation.", "Add or edit tags to drive segmentation and campaigns."] },
    activities: { title: "Activities guide", copy: "Activities are actionable next steps created manually or by workflow automation.", steps: ["Filter open vs all activities.", "Click a task row or check icon to mark it done.", "Workflow automation can create Gmail risk and dormant-contact tasks."] },
    inbox: { title: "Inbox guide", copy: "Inbox stores CRM-sent email and Gmail-imported account threads.", steps: ["Click a row to expand the correspondence.", "Use tracking pills to see CRM vs Gmail source.", "Open the linked account from the thread header."] },
    reports: { title: "Reports guide", copy: "Reports provide saved dashboards for forecast, account risk, campaign impact, and support health.", steps: ["Open saved report templates to focus the report board.", "Use Risk and source table to drill into accounts.", "Support health highlights SLA and sentiment pressure."] },
    "email-integration": { title: "Email integration guide", copy: "Configure Gmail, outgoing email, templates, workflow automation, and tenant settings.", steps: ["Click Connect Gmail and choose the mailbox in Google.", "Approve the Google authorization screen; Zeptrix manages the OAuth app configuration.", "Configure lookback days and no-mail thresholds, then scan Gmail."] },
    "email-templates": { title: "Email templates guide", copy: "Manage reusable templates for follow-ups and campaigns.", steps: ["Create templates with merge fields.", "Select templates in the send email dialog.", "Outgoing email settings control actual sending."] },
    admin: { title: "Admin guide", copy: "Platform admins manage tenants, login emails, password resets, and invite history.", steps: ["Use tenant edit to update owner login and billing metadata.", "Use reset password to send a temporary password.", "Invite email history shows delivery attempts and generated passwords."] },
  };
}

function renderHelpDialog() {
  const topic = helpContent()[ui.helpTopic || helpTopicForSection()] || helpContent().home;
  return `<div class="modal-layer center"><section class="modal help-modal"><header class="modal-head"><div><p class="eyebrow">Online user guide</p><h2>${escapeHtml(topic.title)}</h2><p class="subcopy">${escapeHtml(topic.copy)}</p></div><button class="close-button" data-action="close">×</button></header><div class="help-guide">${topic.steps.map((step, index) => `<article><span>${index + 1}</span><p>${escapeHtml(step)}</p></article>`).join("")}</div><div class="help-guide-index">${Object.entries(helpContent()).map(([key, item]) => `<button class="${(ui.helpTopic || helpTopicForSection()) === key ? "is-selected" : ""}" data-action="open-help" data-help-topic="${escapeHtml(key)}">${escapeHtml(item.title.replace(" guide", ""))}</button>`).join("")}</div><div class="form-actions"><button class="button primary" data-action="close">Done</button></div></section></div>`;
}

function renderTenantForm() {
  const tenant = ui.editingTenant || { name: "", slug: "", plan: "Growth", status: "Active", region: "US-East", seats: 3, billingEmail: "" };
  const ownerEmail = tenantAdminEmail(tenant) || "";
  return `<div class="modal-layer center"><form class="modal" data-tenant-form><header class="modal-head"><div><h2>${tenant.id ? "Edit tenant" : "Create tenant"}</h2><p class="subcopy">${tenant.id ? "Change tenant details, login access, and billing metadata." : "Provision a workspace, owner, and empty CRM data set."}</p></div><button type="button" class="close-button" data-action="close">×</button></header><div class="form-grid">${formField("Tenant name", "name", tenant.name, "text", true)}${formField("Workspace ID", "slug", tenant.slug, "text", true)}${selectField("Plan", "plan", ["Starter", "Growth", "Enterprise"], tenant.plan)}${selectField("Status", "status", ["Active", "Trial", "Suspended"], tenant.status)}${selectField("Region", "region", ["US-East", "EU-West", "AP-South"], tenant.region)}${formField("Seats", "seats", tenant.seats, "number", true)}${formField("Tenant admin login email", "ownerEmail", ownerEmail, "email", true, "full")}${formField("Billing email", "billingEmail", tenant.billingEmail, "email", true, "full")}</div>${ui.authError ? `<p class="error">${escapeHtml(ui.authError)}</p>` : ""}<div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">${tenant.id ? "Save tenant" : "Create tenant"}</button></div></form></div>`;
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
  const deal = currentTenant().deals.find((item) => String(item.id) === String(dealId)) || currentTenant().deals[0];
  const templates = mailTemplates();
  const template = selectedMailTemplate();
  const subject = ui.emailContext?.subject || mergeMailTemplate(template?.subject || "", deal);
  const body = ui.emailContext?.body || mergeMailTemplate(template?.body || "", deal);
  const to = ui.emailContext?.to || deal?.email || "";
  const contextCard = ui.emailContext ? `<div class="email-context-card"><span class="summary-icon" style="background: var(--blue-soft); color: var(--blue);">↩</span><div><strong>${escapeHtml(ui.emailContext.summary || "Correspondence context")}</strong><small>${escapeHtml([ui.emailContext.person, ui.emailContext.account].filter(Boolean).join(" · "))}</small></div></div>` : "";
  return `<div class="modal-layer center"><form class="modal email-modal" data-email-form><header class="modal-head"><div><h2>Send email</h2><p class="subcopy">Send the message through the configured outgoing server and attach it to the opportunity.</p></div><button type="button" class="close-button" data-action="close">×</button></header>${contextCard}<div class="form-grid">${selectField("Deal", "dealId", currentTenant().deals.map((deal) => [deal.id, deal.name]), dealId)}<div class="field"><label>Template</label><select name="templateId" data-email-template>${templates.map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(template?.id) ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>${formField("To", "to", to, "email", true)}<input type="hidden" name="direction" value="outbound" />${formField("Subject", "subject", subject, "text", true, "full")}<div class="field full"><label>Message</label><textarea name="body" required>${escapeHtml(body)}</textarea></div></div><div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Send email</button></div></form></div>`;
}

function renderImportModal() {
  return `<div class="modal-layer center"><section class="modal import-modal"><header class="modal-head"><div><h2>Import accounts and contacts</h2><p class="subcopy">Bring relationship data in from files and connected systems.</p></div><button class="close-button" data-action="close">×</button></header><div class="import-options"><button data-action="import-source" data-source="csv"><strong>CSV import</strong><small>Map columns like account, contact, email, phone, owner, and stage.</small></button><button data-action="import-source" data-source="salesforce"><strong>Salesforce sync</strong><small>Import leads, accounts, contacts, opportunities, owners, and stages.</small></button><button data-action="import-source" data-source="zendesk"><strong>Zendesk/Freshdesk sync</strong><small>Import organizations, requesters, support tickets, SLA risk, and sentiment signals.</small></button></div><div class="import-preview"><h3>Demo mapping preview</h3><div class="import-map"><span>Source field</span><span>Zeptrix field</span><span>Confidence</span><strong>Company / Organization</strong><strong>Account</strong><em>High</em><strong>Name / Requester</strong><strong>Contact</strong><em>High</em><strong>Email</strong><strong>Email</strong><em>High</em><strong>Ticket priority / SLA</strong><strong>Support health</strong><em>High</em><strong>Owner / Assignee</strong><strong>Owner</strong><em>Medium</em></div></div></section></div>`;
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
      <button class="${ui.settingsTab === "outgoing" ? "active" : ""}" data-settings-tab="outgoing">Outgoing email</button>
      <button class="${ui.settingsTab === "templates" ? "active" : ""}" data-settings-tab="templates">Email templates</button>
      <button class="${ui.settingsTab === "automation" ? "active" : ""}" data-settings-tab="automation">Workflow automation</button>
      <button class="${ui.settingsTab === "configuration" ? "active" : ""}" data-settings-tab="configuration">Configuration</button>
    </nav>
    ${ui.settingsTab === "mail" ? renderMailIntegrationsSettings() : ui.settingsTab === "outgoing" ? renderOutgoingEmailSettingsPanel() : ui.settingsTab === "templates" ? renderTemplatesSettingsPanel() : ui.settingsTab === "automation" ? renderWorkflowAutomationSettingsPanel() : renderConfigurationSettingsPanel()}`;
}

function renderTemplatesSettingsPanel() {
  const templates = mailTemplates();
  return `<section class="settings-card templates-card"><div class="panel-head"><div><h3>Email templates</h3><p class="subcopy">Manage reusable messages for follow-ups and account outreach.</p></div></div><div class="template-list">${templates.map((template) => renderTemplateForm(template)).join("")}</div><form class="template-form new-template-form" data-template-form><h4>New email template</h4><div class="form-grid">${formField("Template name", "name", "", "text", true)}${formField("Subject", "subject", "", "text", true)}<div class="field full"><label>Body</label><textarea name="body" required placeholder="Hi {{mainContactName}},&#10;&#10;..."></textarea></div></div><div class="token-bar">${templateTokens.map(([token, label]) => `<span class="field-tag">${escapeHtml(label)}: {{${escapeHtml(token)}}}</span>`).join("")}</div><div class="form-actions"><button class="button primary">Create email template</button></div></form></section>`;
}

function renderTemplateForm(template) {
  return `<form class="template-form" data-template-form data-template-id="${escapeHtml(template.id)}"><div class="panel-head compact"><h4>${escapeHtml(template.name)}</h4><button type="button" class="button small danger" data-action="delete-template" data-id="${escapeHtml(template.id)}">Delete</button></div><div class="form-grid">${formField("Template name", "name", template.name, "text", true)}${formField("Subject", "subject", template.subject, "text", true)}<div class="field full"><label>Body</label><textarea name="body" required>${escapeHtml(template.body)}</textarea></div></div><div class="form-actions"><button class="button small primary">Save email template</button></div></form>`;
}

function renderOutgoingEmailSettingsPanel() {
  const settings = outgoingEmailSettings();
  const canUseBackend = !!session?.apiToken && session.role !== "demo_user";
  const disabled = canUseBackend ? "" : "disabled";
  return `<section class="settings-card outgoing-card"><div class="panel-head"><div><h3>Outgoing email</h3><p class="subcopy">Configure the SMTP server used when CRM sends follow-up email.</p></div><span class="status-pill ${settings.configured ? "stage-won" : "stage-lead"}">${escapeHtml(settings.status)}</span></div>
    ${canUseBackend ? "" : `<p class="admin-notice">Outgoing email requires signing in to a workspace at /crm.</p>`}
    <form class="settings-form" data-outgoing-email-form>
      <div class="form-grid">
        ${formField("SMTP host", "host", settings.host, "text", true)}
        ${formField("Port", "port", settings.port, "number", true)}
        ${formField("Username", "username", settings.username, "text", true)}
        <div class="field"><label>Password</label><input name="password" type="password" value="" ${settings.passwordConfigured ? "" : "required"} placeholder="${settings.passwordConfigured ? "Leave blank to keep current password" : ""}" /></div>
        ${formField("From name", "fromName", settings.fromName, "text", true)}
        ${formField("From email", "fromEmail", settings.fromEmail, "email", true)}
      </div>
      <div class="check-list compact">
        <label class="check-row"><input type="checkbox" name="secure" ${settings.secure ? "checked" : ""} /><span>Use SSL/TLS</span><small>Enable for port 465. Port 587 usually starts plain and upgrades with STARTTLS.</small></label>
      </div>
      <div class="form-actions"><span class="subcopy">${settings.passwordConfigured ? "Password is saved securely on the server." : "Password is required before sending email."}</span><span class="toolbar-spacer"></span><button class="button primary" ${disabled}>Save outgoing email</button></div>
    </form></section>`;
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
  const attention = gmailAttentionCorrespondence(tenant);
  const canUseGmailBackend = !!session?.apiToken && session.role !== "demo_user";
  const actionDisabled = canUseGmailBackend ? "" : "disabled";
  return `
    <section class="settings-layout">
      <div class="settings-stack">
        <article class="settings-card">
          <div class="panel-head"><div><h3>Gmail integration</h3><p class="subcopy">Connect Gmail with one Google authorization step to enrich contacts and engagement signals.</p></div><span class="status-pill ${gmail.enabled ? "stage-won" : "stage-lead"}">${escapeHtml(gmail.status)}</span></div>
          ${ui.gmailNotice ? `<p class="admin-notice gmail-notice ${ui.gmailNotice.toLowerCase().includes("failed") ? "error" : ""}">${escapeHtml(ui.gmailNotice)}</p>` : ""}
          <form class="settings-form" data-gmail-settings-form>
            <div class="form-actions gmail-primary-actions"><button type="button" class="button primary" data-action="connect-gmail" ${actionDisabled}>Connect Gmail</button><button type="button" class="button" data-action="scan-gmail" ${actionDisabled}>Scan now</button></div>
            <p class="admin-notice">${gmail.accountEmail ? `Connected mailbox: <strong>${escapeHtml(gmail.accountEmail)}</strong>` : "Click Connect Gmail and choose the Gmail account in Google. No mailbox password or OAuth client setup is required."}</p>
            <div class="form-grid">
              ${formField("Labels to read", "labels", gmail.labels)}
              ${formField("No-mail threshold in months", "staleMonths", gmail.staleMonths, "number", true)}
            </div>
            <div class="check-list compact">
              <label class="check-row"><input type="checkbox" name="detectNewContacts" ${gmail.detectNewContacts ? "checked" : ""} /><span>Identify new contacts from Gmail</span><small>Scans the last ${gmailLookbackDays} days of non-sent Gmail and suggests people who do not exist in CRM.</small></label>
              <label class="check-row"><input type="checkbox" name="detectDormantContacts" ${gmail.detectDormantContacts ? "checked" : ""} /><span>Find contacts with no sent mail</span><small>Default threshold is 3 months and can be changed above.</small></label>
            </div>
            ${canUseGmailBackend ? "" : `<p class="admin-notice">Gmail connection requires signing in to a workspace at /crm.</p>`}
            <p class="subcopy">Uses server-side OAuth with <strong>gmail.readonly</strong>; refresh tokens are encrypted on the server and the browser never stores the Google client secret.</p>
            <p class="subcopy">New-contact discovery scans the last <strong>${gmailLookbackDays} days</strong> of non-sent Gmail and filters out contacts already in CRM.</p>
            <div class="form-actions gmail-save-actions"><span class="toolbar-spacer"></span><button class="button primary" ${actionDisabled}>Save Gmail settings</button></div>
          </form>
        </article>
        <article class="settings-card follow-up-card">
          <div class="panel-head"><div><h3>Contacts needing follow-up</h3><p class="subcopy">Contacts with no sent mail in the configured window.</p></div><span class="summary-icon" style="background: var(--orange-soft); color: var(--orange);">◴</span></div>
          <div class="signal-list">
            ${dormant.map((item) => `<div class="signal-row"><span class="activity-symbol">!</span><button class="activity-main" data-open-contact="${escapeHtml(item.email)}"><span class="list-primary">${escapeHtml(item.contact)}<small>${escapeHtml(item.account)} · no sent mail for ${item.months} months</small></span></button><button class="priority priority-high follow-up-chip" data-action="follow-up-contact" data-email="${escapeHtml(item.email)}">Follow up</button></div>`).join("") || `<p class="empty-state compact">No contacts are past the configured threshold.</p>`}
          </div>
          <div class="signal-list attention-signal-list">
            <h4>Correspondence requiring attention</h4>
            ${attention.map((item) => `<div class="signal-row risk-signal-row"><span class="activity-symbol">!</span><button class="activity-main" data-open-contact="${escapeHtml(item.email)}"><span class="list-primary">${escapeHtml(item.contact)}<small>${escapeHtml(item.account)} · matched ${escapeHtml(item.matches.slice(0, 3).join(", ") || "negative wording")}</small></span></button><button class="priority priority-high follow-up-chip" data-action="follow-up-contact" data-email="${escapeHtml(item.email)}">Respond</button></div>`).join("") || `<p class="empty-state compact">No negative wording found in the latest scan.</p>`}
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
  const percent = total ? Math.max(2, Math.min(100, Math.round((scanned / total) * 100))) : 12;
  const detail = total ? `${scanned} of ${total} emails scanned` : `${scanned} emails scanned`;
  return `<div class="gmail-progress"><div class="gmail-progress-head"><strong>Scanning Gmail...</strong><span>${escapeHtml(detail)}</span></div><div class="gmail-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total || 100}" aria-valuenow="${total ? scanned : 0}" aria-label="Gmail scan progress"><span style="width:${percent}%"></span></div></div>`;
}

function renderWorkflowAutomationSettingsPanel() {
  const automation = workflowAutomation(currentTenant());
  const summary = automation.lastRunSummary || {};
  return `<section class="settings-card automation-card">
    <div class="panel-head"><div><h3>Workflow automation</h3><p class="subcopy">Turn email risk signals into account actions automatically after each Gmail scan.</p></div><span class="status-pill ${automation.enabled ? "stage-won" : "stage-lead"}">${automation.enabled ? "Enabled" : "Paused"}</span></div>
    <form class="settings-form" data-workflow-automation-form>
      <div class="workflow-builder">
        ${renderWorkflowRuleCard("Negative wording detected", "Gmail scan finds anger, escalation, blocked, renewal-risk, or cancellation language.", "Create a high-priority response activity", automation.createFollowUpTasks, "attentionDueDays", automation.attentionDueDays, "days", "risk")}
        <span class="workflow-connector">→</span>
        ${renderWorkflowRuleCard("No sent email in threshold", "A known contact has not received an outbound Gmail message in the configured window.", "Create a follow-up activity", automation.createFollowUpTasks, "dormantDueDays", automation.dormantDueDays, "days", "follow")}
        <span class="workflow-connector">→</span>
        ${renderWorkflowRuleCard("Account risk is visible", "Related accounts are tagged and surface in Accounts that need attention.", `Apply ${automation.riskTag || "At risk"} tag`, automation.tagRiskAccounts, "riskTag", automation.riskTag, "tag", "tag")}
      </div>
      <div class="check-list compact">
        <label class="check-row"><input type="checkbox" name="enabled" ${automation.enabled ? "checked" : ""} /><span>Run automation after Gmail scan</span><small>Uses the current Gmail scan results. No separate background job is required.</small></label>
        <label class="check-row"><input type="checkbox" name="createFollowUpTasks" ${automation.createFollowUpTasks ? "checked" : ""} /><span>Create follow-up activities</span><small>Dormant contacts get email tasks; negative wording gets high-priority response tasks.</small></label>
        <label class="check-row"><input type="checkbox" name="tagRiskAccounts" ${automation.tagRiskAccounts ? "checked" : ""} /><span>Mark risky accounts</span><small>Accounts tied to negative correspondence are tagged for account review.</small></label>
      </div>
      <div class="automation-preview">
        <span><small>Last run</small><strong>${automation.lastRunAt ? formatTimestamp(automation.lastRunAt) : "Not run yet"}</strong></span>
        <span><small>Tasks created</small><strong>${Number(summary.tasksCreated || 0)}</strong></span>
        <span><small>Account tags updated</small><strong>${Number(summary.accountsTagged || 0)}</strong></span>
        <span><small>Risk signals</small><strong>${Number(summary.riskSignals || 0)}</strong></span>
      </div>
      <div class="form-actions"><span class="subcopy">Saved rules apply on the next Gmail scan.</span><span class="toolbar-spacer"></span><button class="button primary">Save workflow automation</button></div>
    </form>
  </section>`;
}

function renderWorkflowRuleCard(trigger, condition, action, enabled, fieldName, fieldValue, fieldType, tone) {
  const input = fieldType === "tag"
    ? `<input name="${fieldName}" value="${escapeHtml(fieldValue)}" aria-label="${escapeHtml(action)}" required />`
    : `<input name="${fieldName}" type="number" min="${fieldName === "attentionDueDays" ? 0 : 1}" max="${fieldName === "attentionDueDays" ? 14 : 30}" value="${Number(fieldValue)}" aria-label="${escapeHtml(action)}" required />`;
  return `<article class="workflow-rule-card workflow-${tone}">
    <div class="workflow-node"><span>${tone === "risk" ? "!" : tone === "tag" ? "#" : "↗"}</span><strong>${escapeHtml(trigger)}</strong></div>
    <p>${escapeHtml(condition)}</p>
    <div class="workflow-action">
      <small>${enabled ? "Active action" : "Paused action"}</small>
      <strong>${escapeHtml(action)}</strong>
      <label><span>${fieldType === "tag" ? "Tag name" : "Due in"}</span>${input}${fieldType === "tag" ? "" : `<em>days</em>`}</label>
    </div>
  </article>`;
}

function renderConfigurationSettingsPanel() {
  const gmail = gmailIntegration(currentTenant());
  return `<section class="settings-card configuration-card"><div class="panel-head"><div><h3>Configuration</h3><p class="subcopy">Tenant-level keys that control CRM behavior.</p></div></div><form class="configuration-list" data-configuration-form><label class="configuration-row"><span><strong>gmail.inboxLookbackDays</strong><small>Number of days to look back when scanning Gmail for new contacts.</small></span><input name="gmailLookbackDays" type="number" min="1" max="365" value="${Number(gmail.gmailLookbackDays || DEFAULT_GMAIL_DISCOVERY_LOOKBACK_DAYS)}" /></label><div class="form-actions"><button class="button primary">Save configuration</button></div></form></section>`;
}

function gmailIntegration(tenant = currentTenant()) {
  return { ...defaultGmailIntegration, ...(tenant.gmailIntegration || {}) };
}

function outgoingEmailSettings(tenant = currentTenant()) {
  return { ...defaultOutgoingEmail, ...(tenant.outgoingEmail || {}) };
}

function workflowAutomation(tenant = currentTenant()) {
  return { ...defaultWorkflowAutomation, ...(tenant.workflowAutomation || {}) };
}

function outgoingEmailFormValues(form) {
  const values = Object.fromEntries(new FormData(form));
  return {
    ...values,
    port: Math.max(1, Math.min(65535, Number(values.port || 587))),
    secure: Boolean(values.secure),
  };
}

function gmailFormValues(form) {
  const values = Object.fromEntries(new FormData(form));
  return {
    ...values,
    detectNewContacts: Boolean(values.detectNewContacts),
    detectDormantContacts: Boolean(values.detectDormantContacts),
  };
}

function workflowAutomationFormValues(form) {
  const values = Object.fromEntries(new FormData(form));
  const dormantDueDays = values.dormantDueDays === "" ? defaultWorkflowAutomation.dormantDueDays : values.dormantDueDays;
  const attentionDueDays = values.attentionDueDays === "" ? defaultWorkflowAutomation.attentionDueDays : values.attentionDueDays;
  return {
    enabled: Boolean(values.enabled),
    createFollowUpTasks: Boolean(values.createFollowUpTasks),
    tagRiskAccounts: Boolean(values.tagRiskAccounts),
    riskTag: values.riskTag || defaultWorkflowAutomation.riskTag,
    dormantDueDays: Math.max(1, Math.min(30, Number(dormantDueDays || defaultWorkflowAutomation.dormantDueDays))),
    attentionDueDays: Math.max(0, Math.min(14, Number(attentionDueDays ?? defaultWorkflowAutomation.attentionDueDays))),
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

function gmailAttentionCorrespondence(tenant = currentTenant()) {
  const signals = gmailIntegration(tenant).signals || [];
  return signals
    .filter((signal) => signal.type === "attention_correspondence")
    .map((signal) => ({
      contact: signal.name || signal.email.split("@")[0],
      email: signal.email,
      account: signal.account || signal.email.split("@")[1],
      matches: String(signal.source || "").replace(/^Matched:\s*/i, "").split(",").map((item) => item.trim()).filter(Boolean),
      lastSeenAt: signal.lastSeenAt || "",
    }))
    .slice(0, 6);
}

function monthsSince(value) {
  const then = new Date(value);
  const now = new Date(`${today()}T12:00:00`);
  return Math.max(0, Math.floor((now - then) / (30 * 86400000)));
}

function renderDealDrawer(deal) {
  if (!deal) return "";
  return `<div class="modal-layer"><aside class="drawer"><header class="modal-head"><div><p class="subcopy">Deal details</p></div><button class="close-button" data-action="close">×</button></header><section class="detail-hero">${avatar(deal.owner, "large")}<div><h2>${escapeHtml(deal.name)}</h2><p class="subcopy">${escapeHtml(deal.account)} · ${escapeHtml(deal.contact)}</p></div></section><section class="detail-section"><div class="detail-grid"><div><span class="detail-label">Stage</span><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span></div><div><span class="detail-label">Value</span><strong>${money(deal.value)}</strong></div><div><span class="detail-label">Owner</span><span class="owner-cell">${avatar(deal.owner, "small")}${deal.owner}</span></div><div><span class="detail-label">Close date</span><span>${formatDate(deal.close)}</span></div><div><span class="detail-label">Priority</span><span class="priority priority-${deal.priority.toLowerCase()}">${deal.priority}</span></div><div><span class="detail-label">Email</span><span>${escapeHtml(deal.email || "-")}</span></div></div></section><section class="detail-section"><h3>Notes</h3><p class="subcopy">${escapeHtml(deal.note || "No notes yet.")}</p></section><section class="detail-section"><h3>Communication</h3>${currentTenant().communications.filter((item) => String(item.dealId) === String(deal.id)).map((item) => `<div class="message-card"><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.type)} · ${formatTimestamp(item.date)} · ${communicationTrackingLabel(item)}</small>${renderTrackingPill(item)}<p>${escapeHtml(item.body)}</p></div>`).join("") || `<p class="subcopy">No messages logged yet.</p>`}<button class="button small" data-action="compose-email" data-deal-id="${deal.id}">＋ Send email</button></section><section class="detail-section"><h3>Activity</h3>${currentTenant().tasks.filter((task) => String(task.dealId) === String(deal.id)).map((task) => { const [label, klass] = taskStatus(task); return `<div class="drawer-task"><button class="task-check" data-action="toggle-task" data-id="${task.id}">${task.completed ? "✓" : ""}</button><span>${escapeHtml(task.title)}<small>${formatDate(task.due)}</small></span><span class="priority ${klass}">${label}</span><button class="button small danger" data-action="delete-task" data-id="${task.id}">Delete</button></div>`; }).join("") || `<p class="subcopy">No tasks yet.</p>`}</section><div class="form-actions"><button class="button danger" data-action="delete-deal" data-id="${deal.id}">Delete deal</button><button class="button" data-action="add-task" data-deal-id="${deal.id}">＋ Add task</button><span class="toolbar-spacer"></span><button class="button" data-action="close">Close</button><button class="button primary" data-action="edit-deal" data-id="${deal.id}">Edit deal</button></div></aside></div>`;
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
  const adminTab = event.target.closest("[data-admin-tab]")?.dataset.adminTab;

  if (!section && !view && !dealId && !account && !contactEmail && !communicationId && !campaignId && !collapse && !column && !settingsTab && !adminTab && !actionElement) return;
  auditClickEvent({ clickTarget: event.target, section, view, dealId, account, contactEmail, communicationId, campaignId, collapse, column, settingsTab, adminTab, actionElement });

  if (section) {
    ui.section = section;
    ui.importOpen = false;
    ui.selectedContactEmail = "";
    ui.editingContactEmail = "";
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
    ui.editingContactEmail = "";
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
  if (adminTab) ui.adminTab = adminTab;

  if (actionElement) {
    const { action, group, id, dealId: taskDealId } = actionElement.dataset;
    if (action === "google-sso") startGoogleAuth(actionElement.dataset.mode || "login");
    if (action === "focus-home-correspondence-account") {
      focusHomeCorrespondenceAccount(actionElement.dataset.account || "", actionElement.dataset.threadId || "");
      return;
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
    if (action === "open-help") {
      if (ui.modal === "whats-new") dismissWhatsNew();
      ui.modal = "help";
      ui.helpTopic = actionElement.dataset.helpTopic || helpTopicForSection();
      render();
      return;
    }
    if (action === "open-whats-new") {
      ui.modal = "whats-new";
      render();
      return;
    }
    if (action === "open-report-template") {
      ui.section = "reports";
      ui.selectedReportTemplate = actionElement.dataset.reportName || "";
      showToast(`${ui.selectedReportTemplate || "Report"} template opened`);
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
      try {
        await setAccountTags(accountName, tags);
      } catch (error) {
        showToast(`Could not remove tag: ${error.message}`);
      }
    }
    if (action === "remove-contact-tag") {
      const tenant = currentTenant();
      const deal = tenant.deals.find((item) => String(item.id) === String(id));
      if (deal) {
        try {
          await setContactTags(deal.id, (deal.tags || []).filter((tag) => tag !== actionElement.dataset.tag));
        } catch (error) {
          showToast(`Could not remove tag: ${error.message}`);
        }
      }
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
    if (action === "use-tag-suggestion") {
      const input = document.querySelector("[data-tag-form] input[name='tag']");
      if (input) {
        input.value = actionElement.dataset.tag || "";
        input.focus();
      }
      return;
    }
    if (action === "show-register") { ui.authStep = "register"; ui.authError = ""; ui.authNotice = ""; }
    if (action === "show-forgot-password") { ui.authStep = "forgot"; ui.authError = ""; ui.authNotice = ""; ui.pendingUser = null; }
    if (action === "show-mfa-recovery") { ui.authStep = "mfa-recovery"; ui.authError = ""; ui.authNotice = ""; ui.pendingUser = null; }
    if (action === "back-login") { ui.authStep = "password"; ui.authError = ""; ui.authNotice = ""; ui.pendingUser = null; }
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
    if (action === "edit-contact") {
      ui.section = "contacts";
      ui.editingContactEmail = actionElement.dataset.email || "";
      ui.inlineContactOpen = false;
      ui.selectedContactEmail = "";
    }
    if (action === "cancel-contact-edit") ui.editingContactEmail = "";
    if (action === "add-task") { ui.modal = "task"; ui.taskDealId = taskDealId || null; ui.selected = null; }
    if (action === "compose-email") { ui.modal = "email"; ui.emailDealId = taskDealId || null; ui.emailContext = null; ui.selected = null; }
    if (action === "follow-up-contact") {
      openFollowUpEmail(actionElement.dataset.email);
    }
    if (action === "reply-home-correspondence") {
      openHomeCorrespondenceEmail(actionElement.dataset.threadId);
    }
    if (action === "delete-template") {
      const tenant = currentTenant();
      try {
        if (session?.apiToken && /^[0-9a-f-]{36}$/i.test(id)) await deleteMailTemplateViaApi(tenant.id, id);
        setTenant({ ...currentTenant(), mailTemplates: mailTemplates().filter((template) => String(template.id) !== String(id)) });
        showToast("Template deleted");
      } catch (error) {
        showToast(`Could not delete template: ${error.message}`);
      }
    }
    if (action === "open-import") ui.importOpen = !ui.importOpen;
    if (action === "import-source") {
      await importSampleRecords(actionElement.dataset.source);
      ui.modal = null;
      ui.importOpen = false;
      ui.section = "contacts";
      ui.contactSearch = actionElement.dataset.source || "";
      ui.selectedContactEmail = "";
    }
    if (action === "open-settings") ui.modal = "settings";
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
        if (result.warning) showToast(result.warning);
        if (result.automationSummary) showToast(`Automation created ${Number(result.automationSummary.tasksCreated || 0)} tasks and updated ${Number(result.automationSummary.accountsTagged || 0)} account tags`);
        await loadStateFromApi();
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
    if (action === "admin-page") {
      const tab = actionElement.dataset.tab || ui.adminTab;
      ui.adminPages = { ...(ui.adminPages || {}), [tab]: Math.max(1, Number(actionElement.dataset.page || 1)) };
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
    if (action === "close") { ui.modal = null; ui.selected = null; ui.editing = null; ui.editingTenant = null; ui.pendingTag = null; ui.helpTopic = ""; ui.importOpen = false; ui.inlineDealGroup = null; ui.inlineContactOpen = false; ui.editingContactEmail = ""; ui.taskDealId = null; ui.emailDealId = null; ui.emailContext = null; ui.authError = ""; ui.authNotice = ""; ui.adminNotice = ""; }
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
    if (action === "clear-contact-search") { ui.contactSearch = ""; ui.contactTagFilters = []; ui.selectedContactEmail = ""; }
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
  if (event.target.matches("[data-admin-search]")) {
    ui.adminSearch = event.target.value;
    ui.adminPages = { ...(ui.adminPages || {}), [ui.adminTab]: 1 };
    const cursor = event.target.selectionStart;
    render();
    restoreSearchFocus("[data-admin-search]", cursor);
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

document.addEventListener("change", async (event) => {
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
  if (event.target.matches("[data-contact-tag-filter]")) {
    ui.contactTagFilters = [...document.querySelectorAll("[data-contact-tag-filter]:checked")].map((option) => option.value);
    ui.selectedContactEmail = "";
    render();
    return;
  }
  if (event.target.matches("[data-email-template]")) {
    ui.emailTemplateId = event.target.value;
    ui.emailContext = null;
    render();
    return;
  }
  if (event.target.closest("[data-email-form]") && event.target.name === "dealId") {
    ui.emailDealId = event.target.value;
    ui.emailContext = null;
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
    try {
      if (tag === "__new__") {
        event.target.value = "";
        openTagDialog({ type: "account", account });
        return;
      }
      if (tag) await setAccountTags(account, [...accountTags(account), tag]);
      event.target.value = "";
      render();
    } catch (error) {
      showToast(`Could not save tag: ${error.message}`);
    }
    return;
  }
  if (event.target.matches("[data-contact-tag-select]")) {
    const dealId = event.target.dataset.id;
    const deal = currentTenant().deals.find((item) => String(item.id) === String(dealId));
    let tag = event.target.value;
    if (!deal || !tag) return;
    try {
      if (tag === "__new__") {
        event.target.value = "";
        openTagDialog({ type: "contact", dealId: deal.id });
        return;
      }
      if (tag) await setContactTags(deal.id, [...(deal.tags || []), tag]);
      event.target.value = "";
      render();
    } catch (error) {
      showToast(`Could not save tag: ${error.message}`);
    }
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("[data-tag-form]")) {
    event.preventDefault();
    const { tag } = Object.fromEntries(new FormData(event.target));
    const target = ui.pendingTag;
    try {
      const savedTag = await saveAvailableTag(tag);
      if (savedTag && target?.type === "account") await setAccountTags(target.account, [...accountTags(target.account), savedTag]);
      if (savedTag && target?.type === "contact") {
        const deal = currentTenant().deals.find((item) => String(item.id) === String(target.dealId));
        if (deal) await setContactTags(deal.id, [...(deal.tags || []), savedTag]);
      }
      ui.pendingTag = null;
      ui.modal = null;
      showToast(`Added tag ${savedTag}`);
      auditSubmitEvent(event.target);
      render();
    } catch (error) {
      showToast(`Could not save tag: ${error.message}`);
    }
    return;
  }
  if (event.target.matches("[data-login-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    try {
      ui.authNotice = "";
      const result = await loginViaApi(values.email, values.password);
      await prepareMfaChallenge(result);
    } catch {
      const user = authenticate(values.email, values.password);
      if (!user) {
        ui.authError = "Invalid email or password.";
        render();
        return;
      }
      ui.pendingUser = { ...user, mfaRequired: true, mfaSetupRequired: false };
      ui.authError = "";
      ui.authStep = "mfa";
    }
    if (!ui.pendingUser) {
      ui.authError = "Invalid email or password.";
      render();
      return;
    }
    render();
    return;
  }
  if (event.target.matches("[data-forgot-password-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    try {
      const result = await forgotPasswordViaApi(values.email);
      ui.authError = "";
      ui.authNotice = result.message || "If an account exists for that email, password reset instructions were sent.";
      ui.authStep = "password";
    } catch (error) {
      ui.authError = error.message;
      ui.authNotice = "";
    }
    render();
    return;
  }
  if (event.target.matches("[data-register-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    if (values.password !== values.confirm) {
      ui.authError = "Passwords do not match.";
      render();
      return;
    }
    try {
      const result = await registerViaApi(values);
      await prepareMfaChallenge(result);
    } catch (error) {
      ui.authError = error.message;
    }
    render();
    return;
  }
  if (event.target.matches("[data-mfa-recovery-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    try {
      const result = await mfaRecoveryRequestViaApi(values.email);
      ui.authError = "";
      ui.authNotice = result.message || "If an account exists for that email, authenticator recovery instructions were sent.";
      ui.authStep = "password";
    } catch (error) {
      ui.authError = error.message;
      ui.authNotice = "";
    }
    render();
    return;
  }
  if (event.target.matches("[data-mfa-form]")) {
    event.preventDefault();
    const { code } = Object.fromEntries(new FormData(event.target));
    if (ui.pendingUser?.preAuthToken) {
      try {
        const result = await mfaVerifyViaApi(ui.pendingUser.preAuthToken, code);
        ui.pendingUser = { ...ui.pendingUser, ...pendingUserFromChallenge({ user: result.user, token: result.token }) };
      } catch (error) {
        ui.authError = error.message;
        render();
        return;
      }
    } else if (code !== MFA_CODE) {
        ui.authError = "Invalid MFA code.";
        render();
        return;
    }
    await completeAuthSession(ui.pendingUser);
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
    auditSubmitEvent(event.target);
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
        data.tenants = data.tenants.map((tenant) => tenant.id === ui.editingTenant.id ? { ...tenant, ...result.tenant, users: result.tenant.users?.length ? result.tenant.users : tenant.users, deals: tenant.deals, tasks: tenant.tasks, communications: tenant.communications, campaigns: tenant.campaigns, mailTemplates: tenant.mailTemplates, outgoingEmail: tenant.outgoingEmail } : tenant);
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
    auditSubmitEvent(event.target);
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
    try {
      let communication;
      if (session?.apiToken && session.role !== "demo_user") {
        const result = await sendEmailViaApi(tenant.id, values);
        communication = result.communication;
      } else {
        communication = { ...values, id: Math.max(0, ...tenant.communications.map((item) => item.id)) + 1, dealId: values.dealId, type: "Email", owner: currentUser().name, tracked: "Local draft", date: new Date().toISOString() };
      }
      setTenant({ ...currentTenant(), communications: [communication, ...currentTenant().communications] });
      ui.modal = null;
      ui.emailDealId = null;
      ui.emailContext = null;
      showToast(session?.apiToken && session.role !== "demo_user" ? "Email sent" : "Email saved locally");
      auditSubmitEvent(event.target);
    } catch (error) {
      showToast(`Could not send email: ${error.message}`);
    }
    render();
    return;
  }
  if (event.target.matches("[data-template-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const tenant = currentTenant();
    const existingId = event.target.dataset.templateId || "";
    const template = { id: existingId || localRecordId("template"), ...values, updatedAt: new Date().toISOString() };
    try {
      const saved = session?.apiToken ? (await saveMailTemplateViaApi(tenant.id, template)).template : template;
      const templates = existingId
        ? mailTemplates().map((item) => String(item.id) === String(existingId) ? saved : item)
        : [saved, ...mailTemplates()];
      setTenant({ ...currentTenant(), mailTemplates: templates });
      ui.settingsTab = "templates";
      showToast(existingId ? "Template saved" : "Template created");
      auditSubmitEvent(event.target);
      render();
    } catch (error) {
      showToast(`Could not save template: ${error.message}`);
    }
    return;
  }
  if (event.target.matches("[data-reply-form]")) {
    event.preventDefault();
    const { body } = Object.fromEntries(new FormData(event.target));
    addCorrespondenceReply(event.target.dataset.threadId, body);
    auditSubmitEvent(event.target);
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
    auditSubmitEvent(event.target);
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
      auditSubmitEvent(event.target);
    } catch (error) {
      const values = gmailFormValues(event.target);
      const previous = gmailIntegration(tenant);
      setTenant({
        ...tenant,
        gmailIntegration: {
          ...previous,
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
  if (event.target.matches("[data-outgoing-email-form]")) {
    event.preventDefault();
    const tenant = currentTenant();
    const values = outgoingEmailFormValues(event.target);
    try {
      const result = await saveOutgoingEmailSettingsViaApi(tenant.id, values);
      setTenant({ ...currentTenant(), outgoingEmail: { ...result.outgoingEmail, status: "Outgoing email settings saved." } });
      showToast("Outgoing email settings saved");
      auditSubmitEvent(event.target);
    } catch (error) {
      setTenant({ ...tenant, outgoingEmail: { ...outgoingEmailSettings(tenant), ...values, status: error.message, passwordConfigured: outgoingEmailSettings(tenant).passwordConfigured || Boolean(values.password) } });
      showToast(error.message);
    }
    ui.section = "settings";
    ui.settingsTab = "outgoing";
    render();
    return;
  }
  if (event.target.matches("[data-workflow-automation-form]")) {
    event.preventDefault();
    const tenant = currentTenant();
    const values = workflowAutomationFormValues(event.target);
    try {
      const result = await saveWorkflowAutomationViaApi(tenant.id, values);
      setTenant({ ...currentTenant(), workflowAutomation: result.workflowAutomation });
      showToast("Workflow automation saved");
      auditSubmitEvent(event.target);
    } catch (error) {
      setTenant({ ...tenant, workflowAutomation: { ...workflowAutomation(tenant), ...values } });
      showToast(session?.apiToken ? error.message : "Workflow automation saved locally");
    }
    ui.section = "settings";
    ui.settingsTab = "automation";
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
      auditSubmitEvent(event.target);
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
      auditSubmitEvent(event.target);
      render();
    } catch (error) {
      showToast(`Could not save contact: ${error.message}`);
    }
    return;
  }
  if (event.target.matches("[data-edit-contact-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const originalEmail = event.target.dataset.originalEmail || "";
    const tenant = currentTenant();
    const normalizedEmail = String(values.email || "").trim().toLowerCase();
    const duplicate = tenant.deals.some((deal) => String(deal.email || "").toLowerCase() === normalizedEmail && String(deal.email || "").toLowerCase() !== originalEmail.toLowerCase());
    if (duplicate) {
      showToast(`Could not save contact: ${values.email} already exists`);
      return;
    }
    const updatedDeals = tenant.deals.map((deal) => String(deal.email || "").toLowerCase() === originalEmail.toLowerCase()
      ? { ...deal, contact: values.contact, email: values.email, phone: values.phone, account: values.account, owner: values.owner, updated: "Just now" }
      : deal);
    const changedDeals = updatedDeals.filter((deal, index) => deal !== tenant.deals[index]);
    try {
      const savedDeals = [];
      if (session?.apiToken) {
        for (const deal of changedDeals) savedDeals.push((await updateDealViaApi(tenant.id, deal.id, deal)).deal);
      }
      const deals = session?.apiToken
        ? tenant.deals.map((deal) => savedDeals.find((saved) => String(saved.id) === String(deal.id)) || deal)
        : updatedDeals;
      setTenant({ ...tenant, deals });
      ui.editingContactEmail = "";
      ui.selectedContactEmail = values.email;
      showToast("Contact saved");
      auditSubmitEvent(event.target);
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
      auditSubmitEvent(event.target);
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
    auditSubmitEvent(event.target);
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
      auditSubmitEvent(event.target);
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

consumeGoogleAuthRedirect().finally(() => render());
