const STORAGE_KEY = "zeptrix-crm-v1";

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
};

const starterDeals = [
  { id: 1, name: "Enterprise rollout", account: "Orbital Systems", contact: "Liam Brooks", email: "liam@orbitalsystems.com", owner: "Noa Levi", stage: "Negotiation", value: 72000, close: "2026-06-18", priority: "High", group: "active", note: "Security review complete. Waiting on procurement.", updated: "Today, 09:42" },
  { id: 2, name: "Q3 expansion plan", account: "Nimbus Labs", contact: "Sophie Green", email: "sophie@nimbuslabs.io", owner: "Daniel Cohen", stage: "Proposal", value: 48500, close: "2026-06-30", priority: "Medium", group: "active", note: "Proposal shared after product workshop.", updated: "Yesterday" },
  { id: 3, name: "Operations package", account: "Acme Studios", contact: "Ethan Hall", email: "ethan@acmestudios.co", owner: "Maya Bar", stage: "Qualified", value: 24000, close: "2026-07-11", priority: "Medium", group: "active", note: "Needs a migration timeline.", updated: "May 29" },
  { id: 4, name: "Team onboarding", account: "Vertex Health", contact: "Amelia Chen", email: "amelia@vertex.health", owner: "Avi Stein", stage: "Lead", value: 18200, close: "2026-07-20", priority: "Low", group: "active", note: "Inbound request from pricing page.", updated: "May 28" },
  { id: 5, name: "Regional license renewal", account: "Strata Finance", contact: "Oliver Davis", email: "oliver@strata.finance", owner: "Noa Levi", stage: "Negotiation", value: 64000, close: "2026-06-09", priority: "High", group: "active", note: "Final legal pass in progress.", updated: "May 28" },
  { id: 6, name: "Customer success hub", account: "Northstar Retail", contact: "Emma Wilson", email: "emma@northstarretail.com", owner: "Maya Bar", stage: "Qualified", value: 31000, close: "2026-07-03", priority: "Medium", group: "active", note: "Product fit confirmed with VP Sales.", updated: "May 26" },
  { id: 7, name: "Analytics workspace", account: "Bloom Foods", contact: "Jack Turner", email: "jack@bloomfoods.co", owner: "Daniel Cohen", stage: "Proposal", value: 26800, close: "2026-06-26", priority: "Low", group: "active", note: "Review call booked.", updated: "May 25" },
  { id: 8, name: "Global account migration", account: "Atlas Freight", contact: "Lucas Martin", email: "lucas@atlasfreight.com", owner: "Avi Stein", stage: "Won", value: 96000, close: "2026-05-24", priority: "High", group: "closed", note: "Closed after successful pilot.", updated: "May 24" },
  { id: 9, name: "Marketing automation", account: "Focal Point", contact: "Ella Young", email: "ella@focalpoint.agency", owner: "Noa Levi", stage: "Won", value: 37500, close: "2026-05-21", priority: "Medium", group: "closed", note: "Handoff to onboarding team.", updated: "May 21" },
  { id: 10, name: "Procurement workflow", account: "Keystone Group", contact: "Mason King", email: "mason@keystone.group", owner: "Daniel Cohen", stage: "Lost", value: 22000, close: "2026-05-16", priority: "Low", group: "closed", note: "Timing shifted to next fiscal year.", updated: "May 16" },
];

const starterTasks = [
  { id: 1, dealId: 1, title: "Confirm procurement timeline", type: "Follow-up", owner: "Noa Levi", due: "2026-05-31", priority: "High", completed: false },
  { id: 2, dealId: 2, title: "Review proposal feedback", type: "Email", owner: "Daniel Cohen", due: "2026-06-01", priority: "Medium", completed: false },
  { id: 3, dealId: 3, title: "Send migration timeline", type: "Follow-up", owner: "Maya Bar", due: "2026-05-29", priority: "High", completed: false },
  { id: 4, dealId: 5, title: "Check legal approval", type: "Call", owner: "Noa Levi", due: "2026-05-31", priority: "High", completed: false },
  { id: 5, dealId: 7, title: "Run proposal review call", type: "Meeting", owner: "Daniel Cohen", due: "2026-06-02", priority: "Medium", completed: false },
  { id: 6, dealId: 8, title: "Complete onboarding handoff", type: "Follow-up", owner: "Avi Stein", due: "2026-05-25", priority: "Low", completed: true },
];

const starterCommunications = [
  { id: 1, dealId: 1, type: "Email", direction: "outbound", subject: "Security review follow-up", body: "Sharing the final procurement checklist and next steps.", date: "2026-05-30T09:42:00", owner: "Noa Levi", tracked: "Opened twice" },
  { id: 2, dealId: 2, type: "Meeting", direction: "inbound", subject: "Product workshop completed", body: "The Nimbus team requested a proposal for the Q3 expansion plan.", date: "2026-05-29T14:15:00", owner: "Daniel Cohen", tracked: "60 min" },
  { id: 3, dealId: 5, type: "Email", direction: "inbound", subject: "Legal review update", body: "Legal expects to complete the final pass this week.", date: "2026-05-28T11:20:00", owner: "Noa Levi", tracked: "Replied" },
];

const defaultStageProbabilities = { Lead: 10, Qualified: 30, Proposal: 55, Negotiation: 80, Won: 100, Lost: 0 };

const defaultState = {
  deals: starterDeals,
  tasks: starterTasks,
  communications: starterCommunications,
  stageProbabilities: defaultStageProbabilities,
  customFields: ["Lead source", "Next step"],
  savedView: "All deals",
  visibleColumns: ["owner", "stage", "value", "account", "close", "priority"],
  section: "pipeline",
  view: "table",
  search: "",
  stageFilter: "All",
  selected: null,
  modal: null,
  collapsed: [],
};

let state = loadState();

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? { ...defaultState, ...stored, modal: null, selected: null } : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  const { modal, selected, ...persisted } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
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

function filteredDeals() {
  const query = state.search.trim().toLowerCase();
  return state.deals.filter((deal) => {
    const matchesQuery = !query || [deal.name, deal.account, deal.contact, deal.owner, deal.email].join(" ").toLowerCase().includes(query);
    const matchesStage = state.stageFilter === "All" || deal.stage === state.stageFilter;
    const matchesView = state.savedView === "All deals"
      || (state.savedView === "Closing soon" && !["Won", "Lost"].includes(deal.stage) && daysUntil(deal.close) <= 14)
      || (state.savedView === "High priority" && deal.priority === "High")
      || (state.savedView === "My open deals" && deal.owner === "Noa Levi" && !["Won", "Lost"].includes(deal.stage));
    return matchesQuery && matchesStage && matchesView;
  });
}

function total(items, includeLost = true) {
  return items.filter((deal) => includeLost || deal.stage !== "Lost").reduce((sum, deal) => sum + Number(deal.value), 0);
}

function isoDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function today() {
  return isoDate();
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function openTasks() {
  return state.tasks.filter((task) => !task.completed);
}

function taskStatus(task) {
  if (task.completed) return ["Done", "priority-low"];
  if (task.due < today()) return ["Overdue", "priority-high"];
  if (task.due === today()) return ["Due today", "priority-medium"];
  return ["Upcoming", "stage-qualified"];
}

function daysUntil(value) {
  return Math.ceil((new Date(`${value}T12:00:00`) - new Date(`${today()}T12:00:00`)) / 86400000);
}

function weightedForecast(deals = state.deals) {
  return Math.round(deals.reduce((sum, deal) => sum + Number(deal.value) * (state.stageProbabilities[deal.stage] || 0) / 100, 0));
}

function render() {
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        ${renderTopbar()}
        <section class="page">
          ${renderSection()}
        </section>
      </main>
      ${renderModal()}
    </div>`;
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">Z</span><span>Zeptrix CRM</span></div>
      <div class="workspace-switcher">
        <span class="workspace-avatar">ZS</span>
        <div><small>WORKSPACE</small><strong>Zeptrix Sales</strong></div>
        <span class="count">⌄</span>
      </div>
      <p class="side-label">Favorites</p>
      ${sideLink("pipeline", "▦", "Sales pipeline")}
      ${sideLink("my-deals", "♧", "My deals", state.deals.filter((deal) => deal.owner === "Noa Levi").length)}
      <p class="side-label">Workspace</p>
      ${sideLink("home", "⌂", "Home")}
      ${sideLink("contacts", "♙", "Contacts", uniqueBy("email").length)}
      ${sideLink("accounts", "▣", "Accounts", uniqueBy("account").length)}
      ${sideLink("activities", "✓", "Activities", openTasks().length)}
      ${sideLink("tickets", "▤", "Tickets", openTasks().length)}
      ${sideLink("inbox", "✉", "Inbox", state.communications.length)}
      ${sideLink("reports", "◴", "Reports")}
      ${sideLink("data-quality", "◇", "Data quality", duplicateGroups().length)}
      <button class="side-link" data-action="open-settings"><span class="icon">⚙</span> Customize CRM</button>
      <div class="side-spacer"></div>
      ${sideLink("help", "?", "Help center")}
      <div class="profile">${avatar("Noa Levi")}<div class="profile-copy"><strong>Noa Levi</strong><small>Sales manager</small></div><span class="count">⋯</span></div>
    </aside>`;
}

function sideLink(section, icon, label, count = "") {
  return `<button class="side-link ${state.section === section ? "active" : ""}" data-section="${section}"><span class="icon">${icon}</span> ${label}${count !== "" ? `<span class="count">${count}</span>` : ""}</button>`;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <label class="global-search"><span>⌕</span><input placeholder="Search anything..." /><span>⌘ K</span></label>
      <span class="top-spacer"></span>
      <button class="icon-button" data-action="add-deal" title="Create deal">＋</button>
      <span class="top-action" title="Notifications">♧</span>
      <span class="top-action" title="Inbox">✉</span>
      <div class="top-user">${avatar("Noa Levi", "small")}<span>Noa Levi</span><span class="muted">⌄</span></div>
    </header>`;
}

function renderSection() {
  if (state.section === "pipeline") return `${renderPageHeader()}${renderSummary()}${renderTabs()}${state.view === "dashboard" ? renderDashboard() : `${renderToolbar()}${state.view === "table" ? renderBoard() : renderKanban()}`}`;
  if (state.section === "my-deals") return `${renderPageHeader("My deals", "Deals assigned to you across every stage.")}${renderSummary(state.deals.filter((deal) => deal.owner === "Noa Levi"))}${renderSimpleDeals(state.deals.filter((deal) => deal.owner === "Noa Levi"))}`;
  if (state.section === "home") return renderHome();
  if (state.section === "contacts") return renderContacts();
  if (state.section === "accounts") return renderAccounts();
  if (state.section === "activities") return renderActivities();
  if (state.section === "tickets") return renderTickets();
  if (state.section === "inbox") return renderInbox();
  if (state.section === "reports") return `${renderPageHeader("Reports", "Monitor pipeline health and sales performance.")}${renderDashboard()}`;
  if (state.section === "data-quality") return renderDataQuality();
  return renderHelp();
}

function renderPageHeader(title = "Sales pipeline", copy = "Manage deals, track progress, and keep your team in sync.") {
  return `
    <div class="page-title-row">
      <div>
        <h1>${title}</h1>
        <p class="subcopy">${copy}</p>
      </div>
      <div>
        <button class="button" data-action="export">⇩ Export</button>
        <button class="button primary" data-action="add-deal">＋ New deal</button>
      </div>
    </div>`;
}

function renderSummary(deals = state.deals) {
  const open = deals.filter((deal) => !["Won", "Lost"].includes(deal.stage));
  const won = deals.filter((deal) => deal.stage === "Won");
  const dealIds = new Set(deals.map((deal) => deal.id));
  const dueToday = openTasks().filter((task) => dealIds.has(task.dealId) && task.due <= today());
  const urgent = dueToday.filter((task) => task.priority === "High" || task.due < today());
  return `
    <div class="summary-grid">
      ${summaryCard("↗", "#e8f2ff", "#3278dc", "Pipeline value", money(total(open)), "+12.4%")}
      ${summaryCard("◎", "#e7f8ef", "#1e9d6d", "Won this month", money(total(won)), "+18.2%")}
      ${summaryCard("▦", "#f1eaff", "#8055c7", "Open deals", open.length, "+5.1%")}
      ${summaryCard("◴", "#fff0df", "#dc8124", "Tasks due today", dueToday.length, `${urgent.length} urgent`)}
    </div>`;
}

function uniqueBy(field) {
  return [...new Map(state.deals.map((deal) => [deal[field], deal])).values()];
}

function duplicateGroups() {
  const groups = new Map();
  state.deals.forEach((deal) => {
    const key = deal.email?.trim().toLowerCase();
    if (!key) return;
    groups.set(key, [...(groups.get(key) || []), deal]);
  });
  return [...groups.entries()].filter(([, deals]) => deals.length > 1);
}

function renderHome() {
  const tasks = openTasks();
  return `
    ${renderPageHeader("Good morning, Noa", "Here is what is happening across your workspace today.")}
    ${renderSummary()}
    <section class="workspace-grid">
      <article class="widget wide"><h3>Deals that need attention</h3>${state.deals.filter((deal) => deal.priority === "High").map((deal) => `<button class="attention-row" data-open-deal="${deal.id}"><span class="activity-symbol">◴</span><span class="list-primary">${escapeHtml(deal.name)}<small>${escapeHtml(deal.account)} · ${escapeHtml(deal.contact)}</small></span><span class="priority priority-high">High</span></button>`).join("")}</article>
      <article class="widget"><h3>Today's focus</h3>
        <div class="focus-stat"><strong>${tasks.filter((task) => task.due <= today()).length}</strong><span>tasks due today</span></div>
        <div class="focus-stat"><strong>3</strong><span>high-priority deals</span></div>
        <div class="focus-stat"><strong>${tasks.filter((task) => task.type === "Follow-up").length}</strong><span>follow-ups waiting</span></div>
      </article>
    </section>`;
}

function renderSimpleDeals(deals) {
  return `<div class="section-toolbar"><strong>${deals.length} deals</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-deal">＋ New deal</button></div>
    <section class="list-card">${deals.map((deal) => `<button class="list-row" data-open-deal="${deal.id}"><span class="list-primary">${escapeHtml(deal.name)}<small>${escapeHtml(deal.account)}</small></span><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span><strong>${money(deal.value)}</strong><span class="muted">${formatDate(deal.close)}</span></button>`).join("")}</section>`;
}

function renderContacts() {
  const contacts = uniqueBy("email");
  return `${renderPageHeader("Contacts", "Keep the people behind every opportunity organized.")}
    <div class="section-toolbar"><strong>${contacts.length} contacts</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-deal">＋ Add contact</button></div>
    <section class="list-card">${contacts.map((deal) => `<button class="list-row contact-row" data-open-deal="${deal.id}">${avatar(deal.owner)}<span class="list-primary">${escapeHtml(deal.contact)}<small>${escapeHtml(deal.email)}</small></span><span>${escapeHtml(deal.account)}</span><span class="muted">Owner: ${escapeHtml(deal.owner)}</span></button>`).join("")}</section>`;
}

function renderAccounts() {
  const accounts = uniqueBy("account");
  return `${renderPageHeader("Accounts", "Track customers and prospects at the company level.")}
    <div class="section-toolbar"><strong>${accounts.length} accounts</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-deal">＋ Add account</button></div>
    <section class="list-card">${accounts.map((deal) => `<button class="list-row account-row" data-open-deal="${deal.id}"><span class="account-mark">${initials(deal.account)}</span><span class="list-primary">${escapeHtml(deal.account)}<small>${escapeHtml(deal.contact)}</small></span><strong>${money(total(state.deals.filter((item) => item.account === deal.account)))}</strong><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span></button>`).join("")}</section>`;
}

function renderActivities() {
  const tasks = [...state.tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || a.due.localeCompare(b.due));
  return `${renderPageHeader("Activities", "Stay on top of meetings, follow-ups, and deal updates.")}
    <div class="section-toolbar"><strong>${openTasks().length} open tasks</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-task">＋ New activity</button></div>
    <section class="activity-card">
      ${tasks.length ? tasks.map(renderTaskRow).join("") : `<p class="empty-state">No activities yet.</p>`}
    </section>`;
}

function renderTickets() {
  const columns = [
    ["Overdue", (task) => !task.completed && task.due < today()],
    ["Due today", (task) => !task.completed && task.due === today()],
    ["Upcoming", (task) => !task.completed && task.due > today()],
    ["Resolved", (task) => task.completed],
  ];
  return `${renderPageHeader("Ticket management", "Triage customer work, support requests, and follow-up blockers by urgency.")}
    <div class="section-toolbar"><strong>${openTasks().length} open tickets</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="add-task">＋ New ticket</button></div>
    <section class="ticket-board">
      ${columns.map(([label, predicate]) => {
        const items = state.tasks.filter(predicate);
        return `<div class="ticket-column">
          <header class="ticket-column-head"><h3>${label}</h3><span>${items.length}</span></header>
          ${items.map(renderTicketCard).join("") || `<p class="ticket-empty">No tickets</p>`}
        </div>`;
      }).join("")}
    </section>`;
}

function renderTicketCard(task) {
  const deal = state.deals.find((item) => item.id === task.dealId);
  const [label, klass] = taskStatus(task);
  return `<article class="ticket-card">
    <div class="ticket-card-head"><strong>T-${String(task.id).padStart(4, "0")}</strong><span class="priority ${klass}">${label}</span></div>
    <button class="ticket-title" data-open-deal="${task.dealId}">${escapeHtml(task.title)}</button>
    <p>${escapeHtml(deal?.account || "Unlinked account")} · ${escapeHtml(task.owner)}</p>
    <div class="ticket-card-foot"><span>${escapeHtml(task.type)}</span><span>${formatDate(task.due)}</span></div>
    <div class="ticket-card-actions">
      <button class="button small" data-action="toggle-task" data-id="${task.id}">${task.completed ? "Reopen" : "Resolve"}</button>
      <button class="button small" data-action="edit-ticket" data-id="${task.id}">Edit</button>
    </div>
  </article>`;
}

function renderInbox() {
  const items = [...state.communications].sort((a, b) => b.date.localeCompare(a.date));
  return `${renderPageHeader("Inbox", "Keep customer communication attached to every opportunity.")}
    <div class="section-toolbar"><strong>${items.length} logged interactions</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="compose-email">＋ Log email</button></div>
    <section class="activity-card">${items.map((item) => {
      const deal = state.deals.find((candidate) => candidate.id === item.dealId);
      return `<button class="communication-row" data-open-deal="${item.dealId}"><span class="activity-symbol">${item.type === "Meeting" ? "◴" : "✉"}</span><span class="list-primary">${escapeHtml(item.subject)}<small>${escapeHtml(deal?.name || "Unlinked")} · ${escapeHtml(item.owner)} · ${escapeHtml(item.tracked)}</small></span><span class="muted">${formatTimestamp(item.date)}</span></button>`;
    }).join("") || `<p class="empty-state">No communication logged yet.</p>`}</section>`;
}

function renderDataQuality() {
  const duplicates = duplicateGroups();
  const incomplete = state.deals.filter((deal) => !deal.email || !deal.contact || !deal.account);
  return `${renderPageHeader("Data quality", "Find duplicates and incomplete records before they distort your reports.")}
    <div class="summary-grid">
      ${summaryCard("◇", "#fff0df", "#dc8124", "Possible duplicates", duplicates.length, "Review now")}
      ${summaryCard("✓", "#e7f8ef", "#1e9d6d", "Complete records", state.deals.length - incomplete.length, `${state.deals.length} total`)}
      ${summaryCard("!", "#fce8e8", "#c84747", "Missing details", incomplete.length, "Needs attention")}
      ${summaryCard("⇧", "#e8f2ff", "#3278dc", "Import ready", "CSV", "Bulk upload")}
    </div>
    <div class="section-toolbar"><strong>Duplicate review</strong><span class="toolbar-spacer"></span><button class="button primary" data-action="import-csv">⇧ Import CSV</button></div>
    <section class="list-card">${duplicates.map(([email, deals]) => `<div class="quality-row"><span class="account-mark">!</span><span class="list-primary">${escapeHtml(email)}<small>${deals.map((deal) => escapeHtml(`${deal.contact} · ${deal.name}`)).join(" / ")}</small></span><button class="button small" data-action="merge-duplicates" data-email="${escapeHtml(email)}">Merge records</button></div>`).join("") || `<p class="empty-state">No duplicate email addresses found.</p>`}</section>`;
}

function renderTaskRow(task) {
  const deal = state.deals.find((item) => item.id === task.dealId);
  const [label, klass] = taskStatus(task);
  return `<div class="activity-feed-row ${task.completed ? "completed" : ""}">
    <button class="task-check" data-action="toggle-task" data-id="${task.id}" title="${task.completed ? "Reopen task" : "Complete task"}">${task.completed ? "✓" : ""}</button>
    <button class="activity-main" data-open-deal="${task.dealId}"><span class="list-primary">${escapeHtml(task.title)}<small>${escapeHtml(task.type)} · ${escapeHtml(deal?.name || "Unlinked")} · ${escapeHtml(task.owner)}</small></span></button>
    <span class="muted">${formatDate(task.due)}</span><span class="priority ${klass}">${label}</span>
  </div>`;
}

function renderHelp() {
  return `${renderPageHeader("Help center", "Find quick answers for working with your CRM.")}
    <section class="workspace-grid help-grid">
      ${[
        ["▦", "Build your pipeline", "Add deals, change stages, and tailor visible columns."],
        ["♙", "Manage contacts", "Open any contact to review its related deal and activity."],
        ["◴", "Use reports", "Track weighted forecast, win rate, and team performance."],
        ["⚙", "Customize CRM", "Choose the fields your sales team sees in table view."],
      ].map(([icon, title, copy]) => `<article class="widget help-card"><span>${icon}</span><h3>${title}</h3><p class="subcopy">${copy}</p></article>`).join("")}
    </section>`;
}

function summaryCard(icon, bg, color, label, value, trend) {
  return `<article class="summary-card"><span class="summary-icon" style="background:${bg};color:${color}">${icon}</span><div><small>${label}</small><strong>${value}</strong></div><span class="summary-trend">${trend}</span></article>`;
}

function renderTabs() {
  return `
    <nav class="view-tabs">
      ${tab("table", "▤", "Table")}
      ${tab("kanban", "▦", "Kanban")}
      ${tab("dashboard", "◴", "Dashboard")}
      <button class="view-tab" data-action="open-settings">＋ Add view</button>
    </nav>`;
}

function tab(view, icon, label) {
  return `<button class="view-tab ${state.view === view ? "active" : ""}" data-view="${view}">${icon} ${label}</button>`;
}

function renderToolbar() {
  return `
    <div class="toolbar">
      <label class="table-search"><span>⌕</span><input data-search value="${escapeHtml(state.search)}" placeholder="Search deals..." /></label>
      <select class="button ${state.stageFilter !== "All" ? "filter-pill" : ""}" data-stage-filter>
        ${["All", ...stages].map((stage) => `<option ${stage === state.stageFilter ? "selected" : ""}>${stage === "All" ? "☰ Filter by stage" : stage}</option>`).join("")}
      </select>
      <button class="button">♙ Person</button>
      <button class="button">⇅ Sort</button>
      <select class="button" data-saved-view>
        ${["All deals", "Closing soon", "High priority", "My open deals"].map((view) => `<option ${state.savedView === view ? "selected" : ""}>${view}</option>`).join("")}
      </select>
      <span class="toolbar-spacer"></span>
      <button class="button" data-action="open-settings">☷ Columns</button>
      <button class="icon-button" title="More actions">⋯</button>
    </div>`;
}

function renderBoard() {
  const deals = filteredDeals();
  const active = deals.filter((deal) => deal.group === "active");
  const closed = deals.filter((deal) => deal.group === "closed");
  return `<div class="board-wrap">${renderGroup("active", "Active opportunities", "#3281db", active)}${renderGroup("closed", "Closed this month", "#21a57a", closed)}</div>`;
}

function renderGroup(key, label, color, deals) {
  const isCollapsed = state.collapsed.includes(key);
  return `
    <section class="group" style="--group-color:${color}">
      <header class="group-heading">
        <button data-collapse="${key}">${isCollapsed ? "▸" : "▾"}</button>
        <h3>${label}</h3>
        <small>${deals.length} deals</small>
        <span class="group-total">${money(total(deals))}</span>
      </header>
      ${isCollapsed ? "" : `
        <table class="crm-table">
          <thead><tr>
            <th class="select-col"><input type="checkbox" /></th>
            <th class="deal-col">Deal name</th>
            ${state.visibleColumns.map(columnHeading).join("")}
            <th class="more-col"></th>
          </tr></thead>
          <tbody>
            ${deals.length ? deals.map(renderRow).join("") : `<tr><td colspan="10" class="empty-state">No deals match this view.</td></tr>`}
            <tr class="add-row"><td></td><td colspan="8"><button class="add-item" data-action="add-deal" data-group="${key}">＋ Add deal</button></td></tr>
          </tbody>
        </table>`}
    </section>`;
}

function columnHeading(column) {
  const map = {
    owner: ["owner-col", "Owner"], stage: ["stage-col", "Stage"], value: ["value-col", "Deal value"],
    account: ["account-col", "Account"], close: ["date-col", "Close date"], priority: ["priority-col", "Priority"],
  };
  return `<th class="${map[column][0]}">${map[column][1]}</th>`;
}

function renderRow(deal) {
  return `<tr>
    <td class="select-col"><input type="checkbox" /></td>
    <td class="deal-col"><button class="deal-link" data-open-deal="${deal.id}">${escapeHtml(deal.name)}</button></td>
    ${state.visibleColumns.map((column) => renderCell(deal, column)).join("")}
    <td class="more-col"><button class="row-more" data-open-deal="${deal.id}">⋯</button></td>
  </tr>`;
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
    return `<section class="kanban-col" data-drop-stage="${stage}"><header class="kanban-head"><h3><span class="status-pill ${stageClass[stage]}">${stage}</span></h3><span>${stageDeals.length}</span></header>${stageDeals.map((deal) => `
      <article class="kanban-card" draggable="true" data-drag-deal="${deal.id}"><button data-open-deal="${deal.id}">${escapeHtml(deal.name)}</button><p>${escapeHtml(deal.account)}</p><div class="kanban-meta"><span>${money(deal.value)}</span>${avatar(deal.owner, "small")}</div></article>`).join("")}</section>`;
  }).join("")}</div>`;
}

function renderDashboard() {
  const deals = state.deals;
  const activities = deals.slice(0, 4);
  const closed = deals.filter((deal) => ["Won", "Lost"].includes(deal.stage));
  const winRate = closed.length ? Math.round(closed.filter((deal) => deal.stage === "Won").length / closed.length * 100) : 0;
  const aging = deals.filter((deal) => !["Won", "Lost"].includes(deal.stage) && daysUntil(deal.close) < 14);
  return `
    <div class="toolbar"><span class="subcopy">Live pipeline overview</span><span class="toolbar-spacer"></span><button class="button">This month⌄</button></div>
    <section class="dashboard">
      <article class="widget wide"><h3>Pipeline by stage</h3>${stages.map((stage) => {
        const items = deals.filter((deal) => deal.stage === stage);
        const width = Math.max(4, Math.round(total(items) / 1250));
        return `<div class="funnel-row"><small>${stage}</small><div class="funnel-bar"><span style="width:${Math.min(width, 100)}%"></span></div><strong>${money(total(items))}</strong></div>`;
      }).join("")}</article>
      <article class="widget"><h3>Win rate</h3><div style="padding:28px 0;text-align:center"><strong style="font:800 46px Manrope;color:var(--mint)">${winRate}%</strong><p class="subcopy">${closed.length} closed deals measured</p></div></article>
      <article class="widget"><h3>Recent activity</h3>${activities.map((deal) => `<div class="activity-item">${avatar(deal.owner, "small")}<div><strong>${escapeHtml(deal.name)}</strong>${deal.stage} · ${deal.updated}</div></div>`).join("")}</article>
      <article class="widget"><h3>Team performance</h3>${Object.keys(owners).map((owner) => `<div class="activity-item">${avatar(owner, "small")}<div><strong>${owner}</strong>${state.deals.filter((deal) => deal.owner === owner).length} deals · ${money(total(state.deals.filter((deal) => deal.owner === owner)))}</div></div>`).join("")}</article>
      <article class="widget"><h3>Forecast</h3><div style="padding:24px 0"><small class="muted">Weighted pipeline</small><strong style="display:block;margin:8px 0;font:800 30px Manrope">${money(weightedForecast())}</strong><p class="subcopy">Based on editable stage confidence and expected close dates.</p></div></article>
      <article class="widget"><h3>Closing soon</h3>${aging.map((deal) => `<button class="metric-row" data-open-deal="${deal.id}"><span>${escapeHtml(deal.name)}</span><strong>${daysUntil(deal.close)}d</strong></button>`).join("") || `<p class="subcopy">No open deals close within 14 days.</p>`}</article>
    </section>`;
}

function renderModal() {
  if (state.modal === "deal") return renderDealForm();
  if (state.modal === "task") return renderTaskForm();
  if (state.modal === "email") return renderEmailForm();
  if (state.modal === "import") return renderImportForm();
  if (state.modal === "settings") return renderSettings();
  if (state.selected) return renderDealDrawer(state.deals.find((deal) => deal.id === state.selected));
  return "";
}

function renderEmailForm() {
  const dealId = state.emailDealId || state.deals[0]?.id;
  return `<div class="modal-layer center"><form class="modal" data-email-form>
    <header class="modal-head"><div><h2>Log email</h2><p class="subcopy">Capture the message and attach it to the right opportunity.</p></div><button type="button" class="close-button" data-action="close">×</button></header>
    <div class="form-grid">
      ${selectField("Deal", "dealId", state.deals.map((deal) => [deal.id, deal.name]), dealId)}
      ${selectField("Direction", "direction", [["outbound", "Outbound"], ["inbound", "Inbound"]], "outbound")}
      ${formField("Subject", "subject", "", "text", true, "full")}
      <div class="field full"><label>Message</label><textarea name="body" required></textarea></div>
    </div>
    <div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Log email</button></div>
  </form></div>`;
}

function renderImportForm() {
  return `<div class="modal-layer center"><form class="modal" data-import-form>
    <header class="modal-head"><div><h2>Import deals from CSV</h2><p class="subcopy">Paste CSV rows with: name, account, contact, email, owner, stage, value, close, priority.</p></div><button type="button" class="close-button" data-action="close">×</button></header>
    <div class="field"><label>CSV data</label><textarea name="csv" class="csv-input" required placeholder="Website redesign,Acme,Jane Doe,jane@acme.com,Noa Levi,Lead,18000,2026-07-15,Medium"></textarea></div>
    <div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Import records</button></div>
  </form></div>`;
}

function renderTaskForm() {
  const task = state.editingTask || { dealId: state.taskDealId || state.deals[0]?.id, title: "", type: "Follow-up", owner: "Noa Levi", due: today(), priority: "Medium" };
  return `
    <div class="modal-layer center"><form class="modal" data-task-form>
      <header class="modal-head"><div><h2>New activity</h2><p class="subcopy">Create a clear next step and keep the deal moving.</p></div><button type="button" class="close-button" data-action="close">×</button></header>
      <div class="form-grid">
        ${formField("Task", "title", task.title, "text", true, "full")}
        ${selectField("Deal", "dealId", state.deals.map((deal) => [deal.id, deal.name]), task.dealId)}
        ${selectField("Type", "type", ["Follow-up", "Call", "Email", "Meeting"], task.type)}
        ${selectField("Owner", "owner", Object.keys(owners), task.owner)}
        ${formField("Due date", "due", task.due, "date", true)}
        ${selectField("Priority", "priority", ["High", "Medium", "Low"], task.priority)}
      </div>
      <div class="form-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Save activity</button></div>
    </form></div>`;
}

function renderDealForm() {
  const deal = state.editing || { name: "", account: "", contact: "", email: "", owner: "Noa Levi", stage: "Lead", value: "", close: "2026-07-01", priority: "Medium", group: state.newGroup || "active", note: "" };
  return `
    <div class="modal-layer center"><form class="modal" data-deal-form>
      <header class="modal-head"><div><h2>${deal.id ? "Edit deal" : "Create new deal"}</h2><p class="subcopy">Add the details your team needs to move this opportunity forward.</p></div><button type="button" class="close-button" data-action="close">×</button></header>
      <div class="form-grid">
        ${formField("Deal name", "name", deal.name, "text", true, "full")}
        ${formField("Account", "account", deal.account, "text", true)}
        ${formField("Contact", "contact", deal.contact)}
        ${formField("Email", "email", deal.email, "email")}
        ${selectField("Owner", "owner", Object.keys(owners), deal.owner)}
        ${selectField("Stage", "stage", stages, deal.stage)}
        ${formField("Deal value", "value", deal.value, "number", true)}
        ${formField("Close date", "close", deal.close, "date", true)}
        ${selectField("Priority", "priority", ["High", "Medium", "Low"], deal.priority)}
        ${selectField("Group", "group", ["active", "closed"], deal.group)}
        <div class="field full"><label>Notes</label><textarea name="note">${escapeHtml(deal.note || "")}</textarea></div>
      </div>
      <div class="form-actions">${deal.id ? `<button type="button" class="button danger" data-action="delete-deal" data-id="${deal.id}">Delete</button>` : ""}<span class="toolbar-spacer"></span><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Save deal</button></div>
    </form></div>`;
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

function renderSettings() {
  const columns = [["owner", "Owner"], ["stage", "Stage"], ["value", "Deal value"], ["account", "Account"], ["close", "Close date"], ["priority", "Priority"]];
  return `
    <div class="modal-layer center"><section class="modal">
      <header class="modal-head"><div><h2>Customize pipeline</h2><p class="subcopy">Choose which fields appear in your table view.</p></div><button class="close-button" data-action="close">×</button></header>
      <div class="check-list">${columns.map(([key, label]) => `<label class="check-row"><input type="checkbox" data-column="${key}" ${state.visibleColumns.includes(key) ? "checked" : ""} /><span>${label}</span><small>Visible column</small></label>`).join("")}</div>
      <h3 class="settings-heading">Stage confidence</h3>
      <div class="probability-grid">${stages.map((stage) => `<label class="probability-row"><span>${stage}</span><input type="number" min="0" max="100" value="${state.stageProbabilities[stage]}" data-probability="${stage}" /><small>%</small></label>`).join("")}</div>
      <h3 class="settings-heading">Custom fields</h3>
      <div class="tag-list">${state.customFields.map((field) => `<span class="field-tag">${escapeHtml(field)}</span>`).join("")}<button class="button small" data-action="add-custom-field">＋ Add field</button></div>
      <div class="form-actions"><button class="button" data-action="reset">Reset demo data</button><span class="toolbar-spacer"></span><button class="button primary" data-action="close">Done</button></div>
    </section></div>`;
}

function renderDealDrawer(deal) {
  if (!deal) return "";
  return `
    <div class="modal-layer"><aside class="drawer">
      <header class="modal-head"><div><p class="subcopy">Deal details</p></div><button class="close-button" data-action="close">×</button></header>
      <section class="detail-hero">${avatar(deal.owner, "large")}<div><h2>${escapeHtml(deal.name)}</h2><p class="subcopy">${escapeHtml(deal.account)} · ${escapeHtml(deal.contact)}</p></div></section>
      <section class="detail-section"><div class="detail-grid">
        <div><span class="detail-label">Stage</span><span class="status-pill ${stageClass[deal.stage]}">${deal.stage}</span></div>
        <div><span class="detail-label">Value</span><strong>${money(deal.value)}</strong></div>
        <div><span class="detail-label">Owner</span><span class="owner-cell">${avatar(deal.owner, "small")}${deal.owner}</span></div>
        <div><span class="detail-label">Close date</span><span>${formatDate(deal.close)}</span></div>
        <div><span class="detail-label">Priority</span><span class="priority priority-${deal.priority.toLowerCase()}">${deal.priority}</span></div>
        <div><span class="detail-label">Email</span><span>${escapeHtml(deal.email || "—")}</span></div>
      </div></section>
      <section class="detail-section"><h3>Notes</h3><p class="subcopy">${escapeHtml(deal.note || "No notes yet.")}</p></section>
      <section class="detail-section"><h3>Communication</h3>
        ${state.communications.filter((item) => item.dealId === deal.id).map((item) => `<div class="message-card"><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.type)} · ${formatTimestamp(item.date)} · ${escapeHtml(item.tracked)}</small><p>${escapeHtml(item.body)}</p></div>`).join("") || `<p class="subcopy">No messages logged yet.</p>`}
        <button class="button small" data-action="compose-email" data-deal-id="${deal.id}">＋ Log email</button>
      </section>
      <section class="detail-section"><h3>Activity</h3>
        ${state.tasks.filter((task) => task.dealId === deal.id).map((task) => {
          const [label, klass] = taskStatus(task);
          return `<div class="drawer-task"><button class="task-check" data-action="toggle-task" data-id="${task.id}">${task.completed ? "✓" : ""}</button><span>${escapeHtml(task.title)}<small>${formatDate(task.due)}</small></span><span class="priority ${klass}">${label}</span></div>`;
        }).join("") || `<p class="subcopy">No tasks yet.</p>`}
      </section>
      <section class="detail-section"><h3>Timeline</h3>
        <div class="timeline-item"><strong>Deal updated</strong><small>${deal.updated}</small></div>
        <div class="timeline-item"><strong>Stage set to ${deal.stage}</strong><small>May 28, 2026</small></div>
        <div class="timeline-item"><strong>Deal created</strong><small>May 20, 2026</small></div>
      </section>
      <div class="form-actions"><button class="button" data-action="add-task" data-deal-id="${deal.id}">＋ Add task</button><span class="toolbar-spacer"></span><button class="button" data-action="close">Close</button><button class="button primary" data-action="edit-deal" data-id="${deal.id}">Edit deal</button></div>
    </aside></div>`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

document.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  const section = event.target.closest("[data-section]")?.dataset.section;
  const actionElement = event.target.closest("[data-action]");
  const dealId = event.target.closest("[data-open-deal]")?.dataset.openDeal;
  const collapse = event.target.closest("[data-collapse]")?.dataset.collapse;
  const column = event.target.closest("[data-column]")?.dataset.column;

  if (section) state.section = section;
  if (view) state.view = view;
  if (dealId) state.selected = Number(dealId);
  if (collapse) state.collapsed = state.collapsed.includes(collapse) ? state.collapsed.filter((item) => item !== collapse) : [...state.collapsed, collapse];
  if (column) state.visibleColumns = event.target.checked ? [...state.visibleColumns, column] : state.visibleColumns.filter((item) => item !== column);

  if (actionElement) {
    const { action, group, id, dealId: taskDealId, email } = actionElement.dataset;
    if (action === "add-deal") { state.modal = "deal"; state.editing = null; state.newGroup = group || "active"; }
    if (action === "add-task") { state.modal = "task"; state.taskDealId = taskDealId ? Number(taskDealId) : null; state.selected = null; }
    if (action === "edit-ticket") { state.modal = "task"; state.editingTask = state.tasks.find((task) => task.id === Number(id)); state.selected = null; }
    if (action === "compose-email") { state.modal = "email"; state.emailDealId = taskDealId ? Number(taskDealId) : null; state.selected = null; }
    if (action === "import-csv") state.modal = "import";
    if (action === "add-custom-field") {
      const field = prompt("Custom field name");
      if (field?.trim() && !state.customFields.includes(field.trim())) state.customFields = [...state.customFields, field.trim()];
    }
    if (action === "merge-duplicates") {
      const matches = state.deals.filter((deal) => deal.email?.toLowerCase() === email?.toLowerCase());
      const keep = matches[0];
      const removeIds = matches.slice(1).map((deal) => deal.id);
      state.tasks = state.tasks.map((task) => removeIds.includes(task.dealId) ? { ...task, dealId: keep.id } : task);
      state.communications = state.communications.map((item) => removeIds.includes(item.dealId) ? { ...item, dealId: keep.id } : item);
      state.deals = state.deals.filter((deal) => !removeIds.includes(deal.id));
    }
    if (action === "open-settings") state.modal = "settings";
    if (action === "close") { state.modal = null; state.selected = null; state.editing = null; state.editingTask = null; state.taskDealId = null; }
    if (action === "edit-deal") { state.selected = null; state.editing = state.deals.find((deal) => deal.id === Number(id)); state.modal = "deal"; }
    if (action === "toggle-task") {
      state.tasks = state.tasks.map((task) => task.id === Number(id) ? { ...task, completed: !task.completed } : task);
    }
    if (action === "delete-deal") {
      state.deals = state.deals.filter((deal) => deal.id !== Number(id));
      state.tasks = state.tasks.filter((task) => task.dealId !== Number(id));
      state.communications = state.communications.filter((item) => item.dealId !== Number(id));
      state.modal = null;
      state.editing = null;
    }
    if (action === "reset") state = structuredClone(defaultState);
    if (action === "export") exportCsv();
  }
  saveState();
  render();
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-search]")) return;
  state.search = event.target.value;
  saveState();
  render();
  document.querySelector("[data-search]")?.focus();
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-saved-view]")) {
    state.savedView = event.target.value;
    saveState();
    render();
    return;
  }
  if (event.target.matches("[data-probability]")) {
    state.stageProbabilities = { ...state.stageProbabilities, [event.target.dataset.probability]: Number(event.target.value) };
    saveState();
    render();
    return;
  }
  if (!event.target.matches("[data-stage-filter]")) return;
  state.stageFilter = event.target.value.startsWith("☰") ? "All" : event.target.value;
  saveState();
  render();
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("[data-email-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    state.communications = [{
      ...values, id: Math.max(0, ...state.communications.map((item) => item.id)) + 1,
      dealId: Number(values.dealId), type: "Email", owner: "Noa Levi", tracked: "Logged", date: new Date().toISOString(),
    }, ...state.communications];
    state.modal = null;
    state.emailDealId = null;
    saveState();
    render();
    return;
  }
  if (event.target.matches("[data-import-form]")) {
    event.preventDefault();
    const { csv } = Object.fromEntries(new FormData(event.target));
    const imported = csv.trim().split(/\r?\n/).map((line, index) => {
      const [name, account, contact, email, owner = "Noa Levi", stage = "Lead", value = "0", close = today(), priority = "Medium"] = line.split(",").map((item) => item.trim());
      return { id: Math.max(0, ...state.deals.map((deal) => deal.id)) + index + 1, name, account, contact, email, owner, stage, value: Number(value), close, priority, group: ["Won", "Lost"].includes(stage) ? "closed" : "active", note: "Imported from CSV", updated: "Just now" };
    }).filter((deal) => deal.name && deal.account);
    state.deals = [...imported, ...state.deals];
    state.modal = null;
    saveState();
    render();
    return;
  }
  if (event.target.matches("[data-task-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const ticket = {
      ...state.editingTask,
      ...values,
      id: state.editingTask?.id || Math.max(0, ...state.tasks.map((task) => task.id)) + 1,
      dealId: Number(values.dealId),
      completed: state.editingTask?.completed || false,
    };
    state.tasks = state.editingTask
      ? state.tasks.map((task) => task.id === state.editingTask.id ? ticket : task)
      : [ticket, ...state.tasks];
    state.modal = null;
    state.editingTask = null;
    state.taskDealId = null;
    saveState();
    render();
    return;
  }
  if (!event.target.matches("[data-deal-form]")) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  const existing = state.editing;
  const deal = {
    ...existing,
    ...values,
    id: existing?.id || Math.max(0, ...state.deals.map((item) => item.id)) + 1,
    value: Number(values.value),
    updated: "Just now",
  };
  state.deals = existing ? state.deals.map((item) => item.id === existing.id ? deal : item) : [deal, ...state.deals];
  if (deal.stage === "Proposal" && existing?.stage !== "Proposal") {
    state.tasks = [{
      id: Math.max(0, ...state.tasks.map((task) => task.id)) + 1,
      dealId: deal.id,
      title: "Follow up on proposal",
      type: "Follow-up",
      owner: deal.owner,
      due: daysFromNow(3),
      priority: "Medium",
      completed: false,
    }, ...state.tasks];
  }
  state.modal = null;
  state.editing = null;
  saveState();
  render();
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
  const id = Number(event.dataTransfer.getData("text/plain"));
  const stage = column.dataset.dropStage;
  state.deals = state.deals.map((deal) => deal.id === id ? { ...deal, stage, group: ["Won", "Lost"].includes(stage) ? "closed" : "active", updated: "Just now" } : deal);
  saveState();
  render();
});

function exportCsv() {
  const columns = ["name", "account", "contact", "email", "owner", "stage", "value", "close", "priority", "group", "note"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns, ...state.deals.map((deal) => columns.map((column) => deal[column]))].map((row) => row.map(quote).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "zeptrix-crm-deals.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

render();
