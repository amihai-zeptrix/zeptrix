const TAGS = {
  design: { label: "בית", color: "#df7a59" },
  marketing: { label: "קניות", color: "#7289ce" },
  development: { label: "ילדים", color: "#4e9478" },
  urgent: { label: "דחוף", color: "#dc665d" },
  research: { label: "סידורים", color: "#9473b8" },
};

const PEOPLE = {
  you: { name: "עמיחי", initials: "עמ", className: "avatar-you" },
  lina: { name: "אתי", initials: "את", className: "avatar-lina" },
};

const day = 86400000;
const API_URL = "api/tasks";
const isoAfter = (days) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
let tasks = [];
let isLoading = true;
let state = { view: "all", status: "open", tags: new Set(), search: "", sort: "priority" };
let composerSelectedTags = new Set();
let editingTaskId = null;
let undoAction = null;
let toastTimer;
let loadRequestId = 0;
let loadController = null;
let mutationsInFlight = 0;
let refreshAfterMutations = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function normalizeTask(task) {
  if (!task || !Number.isFinite(task.id) || typeof task.title !== "string" || !Array.isArray(task.tags)) return null;
  return {
    id: task.id,
    title: task.title.slice(0, 120),
    description: typeof task.description === "string" ? task.description.slice(0, 1000) : "",
    tags: [...new Set(task.tags.filter(tag => tag in TAGS))],
    assignee: task.assignee in PEOPLE ? task.assignee : "you",
    due: typeof task.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : "",
    priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
    completed: task.completed === true,
    created: Number.isFinite(task.created) ? task.created : task.id,
    updated: Number.isFinite(task.updated) ? task.updated : task.created,
    revision: Number.isInteger(task.revision) && task.revision > 0 ? task.revision : 1,
  };
}

async function apiRequest(path = "", options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `API request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadTasks(silent = false) {
  if (mutationsInFlight) return;
  const requestId = ++loadRequestId;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  if (!silent) {
    isLoading = true;
    renderTaskList();
  }
  try {
    const response = await apiRequest("", { signal: controller.signal });
    if (requestId !== loadRequestId || mutationsInFlight) return;
    tasks = response.map(normalizeTask).filter(Boolean);
  } catch (error) {
    if (error.name !== "AbortError" && !silent) showToast("לא הצלחנו לטעון משימות", "בדקו את החיבור ונסו שוב.");
  } finally {
    if (requestId !== loadRequestId) return;
    loadController = null;
    isLoading = false;
    render();
  }
}

function beginMutation() {
  mutationsInFlight++;
  loadRequestId++;
  loadController?.abort();
  loadController = null;
}

function endMutation() {
  mutationsInFlight = Math.max(0, mutationsInFlight - 1);
  if (!mutationsInFlight && refreshAfterMutations) {
    refreshAfterMutations = false;
    queueMicrotask(() => loadTasks(true));
  }
}

function requestRefreshAfterMutations() {
  refreshAfterMutations = true;
}

function escapeHtml(value) {
  const el = document.createElement("div");
  el.textContent = value;
  return el.innerHTML;
}

function formatDue(dateValue) {
  if (!dateValue) return "ללא תאריך";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateValue}T00:00:00`);
  const diff = Math.round((due - today) / day);
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  return due.toLocaleDateString("he-IL", { month: "short", day: "numeric" });
}

function isOverdue(task) {
  return task.due && !task.completed && new Date(`${task.due}T23:59:59`) < new Date();
}

function tagMarkup(tag) {
  return `<span class="task-tag tag-${tag}"><i></i>${TAGS[tag].label}</span>`;
}

function taskMarkup(task, index) {
  const person = PEOPLE[task.assignee] || PEOPLE.you;
  const priorityLabel = { high: "גבוהה", medium: "בינונית", low: "נמוכה" }[task.priority];
  return `<article class="task-row ${task.completed ? "completed" : ""}" data-id="${task.id}" style="animation-delay:${Math.min(index * 35, 220)}ms">
    <button class="complete-button" data-complete="${task.id}" aria-label="${task.completed ? "סימון כפתוחה" : "סימון כהושלמה"}"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg></button>
    <div class="task-body"><div class="task-title">${escapeHtml(task.title)}</div><div class="task-meta">${task.tags.map(tagMarkup).join("")}<span class="priority-badge priority-${task.priority}"><i></i>עדיפות ${priorityLabel}</span><span class="due-date ${isOverdue(task) ? "overdue" : ""}"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>${formatDue(task.due)}</span></div></div>
    <span class="avatar assignee ${person.className}" title="${person.name}">${person.initials}</span>
    <button class="row-menu" data-edit="${task.id}" aria-label="עריכת משימה" title="עריכת משימה">⋯</button>
  </article>`;
}

function filteredTasks() {
  let result = [...tasks];
  if (state.view === "today") result = result.filter(t => t.due === isoAfter(0));
  if (state.view === "assigned") result = result.filter(t => t.assignee === "you");
  if (state.view === "completed") result = result.filter(t => t.completed);
  if (state.status === "open") result = result.filter(t => !t.completed);
  if (state.status === "completed") result = result.filter(t => t.completed);
  if (state.tags.size) result = result.filter(t => [...state.tags].every(tag => t.tags.includes(tag)));
  if (state.search) result = result.filter(t => `${t.title} ${t.description || ""}`.toLowerCase().includes(state.search));
  const priority = { high: 0, medium: 1, low: 2 };
  result.sort((a, b) => state.sort === "newest" ? b.created - a.created : state.sort === "due" ? (a.due || "9999").localeCompare(b.due || "9999") : priority[a.priority] - priority[b.priority]);
  return result;
}

function getStats() {
  const stats = { open: 0, done: 0, todayOpen: 0, todayTotal: 0, todayDone: 0, mine: 0, tags: Object.fromEntries(Object.keys(TAGS).map(tag => [tag, 0])) };
  const today = isoAfter(0);
  tasks.forEach(task => {
    task.completed ? stats.done++ : stats.open++;
    if (!task.completed && task.assignee === "you") stats.mine++;
    if (task.due === today) { stats.todayTotal++; task.completed ? stats.todayDone++ : stats.todayOpen++; }
    task.tags.forEach(tag => { if (tag in stats.tags) stats.tags[tag]++; });
  });
  return stats;
}

function renderTaskList() {
  const visible = filteredTasks();
  $("#taskList").innerHTML = visible.map(taskMarkup).join("");
  $("#taskList").hidden = isLoading;
  $("#loadingState").hidden = !isLoading;
  $("#emptyState").hidden = isLoading || visible.length > 0;
}

function render() {
  const stats = getStats();
  renderTaskList();
  renderCounts(stats);
  renderTagFilters(stats.tags);
  renderProgress(stats);
}

function renderCounts(stats) {
  $("#allCount").textContent = tasks.length;
  $("#todayCount").textContent = stats.todayOpen;
  $("#mineCount").textContent = stats.mine;
  $("#completedCount").textContent = stats.done;
  $("#openTabCount").textContent = stats.open;
  $("#doneTabCount").textContent = stats.done;
  $("#allTabCount").textContent = tasks.length;
}

function renderProgress(stats) {
  const completed = stats.todayDone;
  const total = stats.todayTotal;
  const percent = total ? Math.round(completed / total * 100) : 0;
  $("#progressFraction").textContent = `${completed} מתוך ${total} הושלמו`;
  $("#progressPercent").textContent = `${percent}%`;
  $("#progressBar").style.width = `${percent}%`;
  $("#progressHeadline").textContent = percent === 100 && total ? "סיימתם הכול להיום — כל הכבוד" : percent >= 50 ? "אתם מתקדמים מצוין" : "יום מסודר מתחיל כאן";
  const remaining = Math.max(0, total - completed);
  $("#progressText").textContent = total ? (remaining === 1 ? "נותרה משימה אחת להיום." : `נותרו ${remaining} משימות להיום.`) : "הוסיפו משימה להיום כדי להתחיל.";
}

function renderTagFilters(counts = getStats().tags) {
  $("#sidebarTags").innerHTML = Object.entries(TAGS).map(([key, tag]) => `<button class="sidebar-tag ${state.tags.has(key) ? "active" : ""}" data-tag="${key}"><i class="tag-dot" style="background:${tag.color}"></i>${tag.label}<b>${counts[key]}</b></button>`).join("");
  $("#filterTags").innerHTML = Object.entries(TAGS).map(([key, tag]) => `<button class="filter-pill ${state.tags.has(key) ? "active" : ""}" data-tag="${key}"><i style="background:${tag.color}"></i>${tag.label}</button>`).join("");
  $("#filterBadge").hidden = state.tags.size === 0;
  $("#filterBadge").textContent = state.tags.size;
  $("#clearTags").classList.toggle("visible", state.tags.size > 0);
}

function renderComposerTags() {
  $("#composerTags").innerHTML = Object.entries(TAGS).map(([key, tag]) => `<button type="button" class="composer-tag ${composerSelectedTags.has(key) ? "active" : ""}" data-compose-tag="${key}"><i style="background:${tag.color}"></i>${tag.label}</button>`).join("");
}

async function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return false;
  const completed = !task.completed;
  beginMutation();
  try {
    const updated = normalizeTask(await apiRequest(`/${id}`, { method: "PUT", body: JSON.stringify({ completed, revision: task.revision }) }));
    tasks = tasks.map(item => item.id === id ? updated : item);
    render();
    if (completed) showToast("המשימה הושלמה", "כל הכבוד, ממשיכים כך.", () => toggleComplete(id));
    return true;
  } catch (error) {
    if (error.status === 409) { requestRefreshAfterMutations(); showToast("המשימה השתנתה", "טענו את הגרסה העדכנית מהמכשיר האחר."); }
    else showToast("לא הצלחנו לעדכן", "בדקו את החיבור ונסו שוב.");
  } finally {
    endMutation();
  }
  return false;
}

function showToast(title, message, onUndo = null) {
  clearTimeout(toastTimer);
  undoAction = onUndo;
  $("#toastTitle").textContent = title;
  $("#toastMessage").textContent = message;
  $("#undoButton").hidden = !onUndo;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}

async function addTask(title, extras = {}) {
  const values = { title: title.trim().slice(0, 120), description: (extras.description || "").slice(0, 1000), tags: extras.tags || [], assignee: extras.assignee || "you", due: extras.due || "", priority: extras.priority || "medium", completed: false };
  beginMutation();
  try {
    const created = normalizeTask(await apiRequest("", { method: "POST", body: JSON.stringify(values) }));
    tasks = [created, ...tasks];
    state.status = "open";
    $$(".view-tabs button").forEach(button => button.classList.toggle("active", button.dataset.status === "open"));
    render();
    return true;
  } catch {
    showToast("לא הצלחנו ליצור משימה", "בדקו את החיבור ונסו שוב.");
    return false;
  } finally {
    endMutation();
  }
}

async function updateTask(id, updates) {
  const existing = tasks.find(task => task.id === id);
  if (!existing) return false;
  beginMutation();
  try {
    const updated = normalizeTask(await apiRequest(`/${id}`, { method: "PUT", body: JSON.stringify({ ...updates, revision: existing.revision }) }));
    tasks = tasks.map(task => task.id === id ? updated : task);
    render();
    showToast("המשימה עודכנה", "השינויים נשמרו בהצלחה.");
    return true;
  } catch (error) {
    if (error.status === 409) { requestRefreshAfterMutations(); showToast("המשימה השתנתה", "טענו את הגרסה העדכנית מהמכשיר האחר."); }
    else showToast("לא הצלחנו לשמור", "בדקו את החיבור ונסו שוב.");
  } finally {
    endMutation();
  }
  return false;
}

function openDialog(task = null) {
  editingTaskId = task?.id || null;
  composerSelectedTags = new Set(task?.tags || []);
  renderComposerTags();
  $("#taskForm").reset();
  $("#dialogEyebrow").textContent = task ? "עריכת משימה" : "משימה חדשה";
  $("#dialogTitle").textContent = task ? "מה תרצו לשנות?" : "מה צריך לעשות?";
  $("#submitTask").textContent = task ? "שמירת שינויים" : "יצירת משימה";
  $("#taskTitle").value = task?.title || "";
  $("#taskDescription").value = task?.description || "";
  $("#taskAssignee").value = task?.assignee || "you";
  $("#taskDue").value = task?.due || (task ? "" : isoAfter(0));
  $("#taskPriority").value = task?.priority || "medium";
  $("#taskDialog").showModal();
  setTimeout(() => $("#taskTitle").focus(), 80);
}

$("#dateLabel").textContent = new Date().toLocaleDateString("he-IL", { weekday: "long", month: "long", day: "numeric" });
renderComposerTags();
render();
loadTasks();
setInterval(() => {
  if (document.visibilityState === "visible" && !$("#taskDialog").open) loadTasks(true);
}, 5000);
window.addEventListener("focus", () => loadTasks(true));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadTasks(true);
});

document.addEventListener("click", (event) => {
  const complete = event.target.closest("[data-complete]");
  const editButton = event.target.closest("[data-edit]");
  const tagButton = event.target.closest("[data-tag]");
  const composeTag = event.target.closest("[data-compose-tag]");
  if (complete) toggleComplete(Number(complete.dataset.complete));
  if (editButton) openDialog(tasks.find(task => task.id === Number(editButton.dataset.edit)));
  if (tagButton) { const tag = tagButton.dataset.tag; state.tags.has(tag) ? state.tags.delete(tag) : state.tags.add(tag); render(); }
  if (composeTag) { const tag = composeTag.dataset.composeTag; composerSelectedTags.has(tag) ? composerSelectedTags.delete(tag) : composerSelectedTags.add(tag); renderComposerTags(); }
});

$$(".nav-item").forEach(button => button.addEventListener("click", () => {
  state.view = button.dataset.view;
  if (state.view === "completed") state.status = "completed";
  $$(".nav-item").forEach(item => item.classList.toggle("active", item === button));
  $$(".view-tabs button").forEach(item => item.classList.toggle("active", item.dataset.status === state.status));
  const labels = { all: ["אפליקצת המשימות של משפחת <em>הדר</em>", "כל המשימות המשפחתיות במקום אחד, ברור ונוח."], today: ["המשימות של <em>היום</em>", "כל מה שצריך לקבל תשומת לב היום."], assigned: ["המשימות <em>שלי</em>", "כל המשימות המשפחתיות שבאחריותי."], completed: ["התקדמות שכיף <em>לחגוג</em>", "כל מה שהמשפחה כבר הספיקה לעשות."] };
  $("#viewTitle").innerHTML = labels[state.view][0]; $("#viewSubtitle").textContent = labels[state.view][1];
  $("#sidebar").classList.remove("open"); $("#sidebarScrim").classList.remove("open"); render();
}));

$$(".view-tabs button").forEach(button => button.addEventListener("click", () => {
  state.status = button.dataset.status;
  $$(".view-tabs button").forEach(item => item.classList.toggle("active", item === button)); render();
}));

let searchTimer;
$("#searchInput").addEventListener("input", event => {
  state.search = event.target.value.toLowerCase().trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTaskList, 100);
});
$("#sortSelect").addEventListener("change", event => { state.sort = event.target.value; render(); });
$("#filterToggle").addEventListener("click", () => $("#filterDrawer").classList.toggle("open"));
$("#clearTags").addEventListener("click", () => { state.tags.clear(); render(); });

async function submitQuick() {
  const input = $("#quickTaskInput");
  if (!input.value.trim()) return;
  if (!await addTask(input.value, { due: isoAfter(0) })) return;
  input.value = ""; $("#quickAdd").classList.remove("has-value");
}
$("#quickTaskInput").addEventListener("input", event => $("#quickAdd").classList.toggle("has-value", !!event.target.value.trim()));
$("#quickTaskInput").addEventListener("keydown", event => { if (event.key === "Enter") submitQuick(); });
$("#quickSubmit").addEventListener("click", submitQuick);
$("#quickAddIcon").addEventListener("click", () => $("#quickTaskInput").focus());

$("#openComposer").addEventListener("click", () => openDialog());
$("#emptyAdd").addEventListener("click", () => openDialog());
$("#closeDialog").addEventListener("click", () => $("#taskDialog").close());
$("#cancelDialog").addEventListener("click", () => $("#taskDialog").close());
$("#taskForm").addEventListener("submit", async event => {
  event.preventDefault();
  const title = $("#taskTitle").value;
  if (!title.trim()) return;
  const values = { title: title.trim().slice(0, 120), description: $("#taskDescription").value.slice(0, 1000), tags: [...composerSelectedTags], assignee: $("#taskAssignee").value, due: $("#taskDue").value, priority: $("#taskPriority").value };
  $("#submitTask").disabled = true;
  const saved = editingTaskId ? await updateTask(editingTaskId, values) : await addTask(title, values);
  $("#submitTask").disabled = false;
  if (saved) { editingTaskId = null; $("#taskDialog").close(); }
});
$("#taskForm").addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") $("#taskForm").requestSubmit(); });

$("#undoButton").addEventListener("click", async () => { if (undoAction && await undoAction()) { undoAction = null; $("#toast").classList.remove("show"); } });
$("#menuButton").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#sidebarScrim").classList.add("open"); });
$("#sidebarClose").addEventListener("click", () => { $("#sidebar").classList.remove("open"); $("#sidebarScrim").classList.remove("open"); });
$("#sidebarScrim").addEventListener("click", () => { $("#sidebar").classList.remove("open"); $("#sidebarScrim").classList.remove("open"); });

document.addEventListener("keydown", event => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) { event.preventDefault(); $("#searchInput").focus(); }
  if (event.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && !$("#taskDialog").open) { event.preventDefault(); openDialog(); }
});
