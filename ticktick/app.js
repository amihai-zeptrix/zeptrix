const TAGS = {
  design: { label: "Design", color: "#df7a59" },
  marketing: { label: "Marketing", color: "#7289ce" },
  development: { label: "Development", color: "#4e9478" },
  urgent: { label: "Urgent", color: "#dc665d" },
  research: { label: "Research", color: "#9473b8" },
};

const PEOPLE = {
  you: { name: "Alex Young", initials: "AY", className: "avatar-you" },
  lina: { name: "Lina Stone", initials: "LS", className: "avatar-lina" },
  marcus: { name: "Marcus Kim", initials: "MK", className: "avatar-marcus" },
  nora: { name: "Nora Reed", initials: "NR", className: "avatar-nora" },
};

const day = 86400000;
const STORAGE_KEY = "zeptrix-tasks-v1";
const isoAfter = (days) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const seedTasks = [
  { id: 1, title: "Finalize the mobile onboarding flow", description: "Review the final screens with product.", tags: ["design", "urgent"], assignee: "lina", due: isoAfter(0), priority: "high", completed: false, created: Date.now() - 50000 },
  { id: 2, title: "Prepare Q3 campaign performance report", description: "Pull results from the paid and organic channels.", tags: ["marketing"], assignee: "marcus", due: isoAfter(1), priority: "medium", completed: false, created: Date.now() - 40000 },
  { id: 3, title: "Fix authentication edge case on Safari", description: "Session expires after returning from the payment flow.", tags: ["development", "urgent"], assignee: "you", due: isoAfter(0), priority: "high", completed: false, created: Date.now() - 30000 },
  { id: 4, title: "Interview five beta customers", description: "Focus on the new collaboration experience.", tags: ["research"], assignee: "nora", due: isoAfter(3), priority: "medium", completed: false, created: Date.now() - 20000 },
  { id: 5, title: "Update empty states and illustrations", description: "Bring all empty states into the new visual system.", tags: ["design"], assignee: "you", due: isoAfter(5), priority: "low", completed: false, created: Date.now() - 10000 },
  { id: 6, title: "Publish weekly product changelog", description: "", tags: ["marketing", "development"], assignee: "marcus", due: isoAfter(-1), priority: "low", completed: true, created: Date.now() - 60000 },
];

let tasks = loadTasks();
let state = { view: "all", status: "open", tags: new Set(), search: "", sort: "priority" };
let composerSelectedTags = new Set();
let undoAction = null;
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(stored)) return seedTasks;
    const normalizedTasks = stored.map(normalizeTask);
    return normalizedTasks.every(Boolean) ? normalizedTasks : seedTasks;
  }
  catch { return seedTasks; }
}

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
  };
}

function saveTasks(nextTasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks));
    tasks = nextTasks;
    return true;
  } catch {
    showToast("Couldn’t save changes", "Browser storage is full or unavailable.");
    return false;
  }
}

function escapeHtml(value) {
  const el = document.createElement("div");
  el.textContent = value;
  return el.innerHTML;
}

function formatDue(dateValue) {
  if (!dateValue) return "No date";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateValue}T00:00:00`);
  const diff = Math.round((due - today) / day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(task) {
  return task.due && !task.completed && new Date(`${task.due}T23:59:59`) < new Date();
}

function tagMarkup(tag) {
  return `<span class="task-tag tag-${tag}"><i></i>${TAGS[tag].label}</span>`;
}

function taskMarkup(task, index) {
  const person = PEOPLE[task.assignee] || PEOPLE.you;
  return `<article class="task-row ${task.completed ? "completed" : ""}" data-id="${task.id}" style="animation-delay:${Math.min(index * 35, 220)}ms">
    <button class="complete-button" data-complete="${task.id}" aria-label="${task.completed ? "Mark open" : "Mark done"}"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg></button>
    <div class="task-body"><div class="task-title">${escapeHtml(task.title)}</div><div class="task-meta">${task.tags.map(tagMarkup).join("")}<span class="due-date ${isOverdue(task) ? "overdue" : ""}"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>${formatDue(task.due)}</span></div></div>
    <i class="priority-mark priority-${task.priority}" title="${task.priority} priority"></i>
    <span class="avatar assignee ${person.className}" title="${person.name}">${person.initials}</span>
    <button class="row-menu" data-delete="${task.id}" aria-label="Delete task" title="Delete task">⋯</button>
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
  $("#emptyState").hidden = visible.length > 0;
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
  $("#progressFraction").textContent = `${completed} / ${total} complete`;
  $("#progressPercent").textContent = `${percent}%`;
  $("#progressBar").style.width = `${percent}%`;
  $("#progressHeadline").textContent = percent === 100 && total ? "Today is wrapped—beautiful work" : percent >= 50 ? "You’re building real momentum" : "A clear day starts here";
  $("#progressText").textContent = total ? `${Math.max(0, total - completed)} task${total - completed === 1 ? "" : "s"} left for today.` : "Add a task for today to start your momentum.";
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

function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return false;
  const completed = !task.completed;
  const nextTasks = tasks.map(item => item.id === id ? { ...item, completed } : item);
  if (!saveTasks(nextTasks)) return false;
  render();
  if (completed) showToast("Task completed", "Nice work—keep the momentum going.", () => toggleComplete(id));
  return true;
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

function deleteTask(id) {
  const index = tasks.findIndex(task => task.id === id);
  if (index < 0) return false;
  const deleted = tasks[index];
  if (!saveTasks(tasks.filter(task => task.id !== id))) return false;
  render();
  showToast("Task deleted", "The task was removed from this device.", () => {
    const restored = [...tasks];
    restored.splice(Math.min(index, restored.length), 0, deleted);
    if (!saveTasks(restored)) return false;
    render();
    return true;
  });
  return true;
}

function addTask(title, extras = {}) {
  const newTask = { id: Date.now(), title: title.trim().slice(0, 120), description: (extras.description || "").slice(0, 1000), tags: extras.tags || [], assignee: extras.assignee || "you", due: extras.due || "", priority: extras.priority || "medium", completed: false, created: Date.now() };
  if (!saveTasks([newTask, ...tasks])) return false;
  state.status = "open";
  $$(".view-tabs button").forEach(button => button.classList.toggle("active", button.dataset.status === "open"));
  render();
  return true;
}

function openDialog() {
  composerSelectedTags.clear();
  renderComposerTags();
  $("#taskForm").reset();
  $("#taskDue").value = isoAfter(0);
  $("#taskDialog").showModal();
  setTimeout(() => $("#taskTitle").focus(), 80);
}

$("#dateLabel").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
renderComposerTags();
render();

document.addEventListener("click", (event) => {
  const complete = event.target.closest("[data-complete]");
  const deleteButton = event.target.closest("[data-delete]");
  const tagButton = event.target.closest("[data-tag]");
  const composeTag = event.target.closest("[data-compose-tag]");
  if (complete) toggleComplete(Number(complete.dataset.complete));
  if (deleteButton) deleteTask(Number(deleteButton.dataset.delete));
  if (tagButton) { const tag = tagButton.dataset.tag; state.tags.has(tag) ? state.tags.delete(tag) : state.tags.add(tag); render(); }
  if (composeTag) { const tag = composeTag.dataset.composeTag; composerSelectedTags.has(tag) ? composerSelectedTags.delete(tag) : composerSelectedTags.add(tag); renderComposerTags(); }
});

$$(".nav-item").forEach(button => button.addEventListener("click", () => {
  state.view = button.dataset.view;
  if (state.view === "completed") state.status = "completed";
  $$(".nav-item").forEach(item => item.classList.toggle("active", item === button));
  $$(".view-tabs button").forEach(item => item.classList.toggle("active", item.dataset.status === state.status));
  const labels = { all: ["Welcome to Pettesh Hadars <em>tasks place</em>", "Keep family tasks clear, shared, and easy to finish."], today: ["Today’s focus, <em>made clear.</em>", "A focused view of everything that needs attention today."], assigned: ["Your tasks, <em>all together.</em>", "Every family task assigned to you, in one calm and focused place."], completed: ["Progress worth <em>celebrating.</em>", "A record of everything your family has moved forward."] };
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

function submitQuick() {
  const input = $("#quickTaskInput");
  if (!input.value.trim()) return;
  if (!addTask(input.value, { due: isoAfter(0) })) return;
  input.value = ""; $("#quickAdd").classList.remove("has-value");
}
$("#quickTaskInput").addEventListener("input", event => $("#quickAdd").classList.toggle("has-value", !!event.target.value.trim()));
$("#quickTaskInput").addEventListener("keydown", event => { if (event.key === "Enter") submitQuick(); });
$("#quickSubmit").addEventListener("click", submitQuick);
$("#quickAddIcon").addEventListener("click", () => $("#quickTaskInput").focus());

$("#openComposer").addEventListener("click", openDialog);
$("#emptyAdd").addEventListener("click", openDialog);
$("#closeDialog").addEventListener("click", () => $("#taskDialog").close());
$("#cancelDialog").addEventListener("click", () => $("#taskDialog").close());
$("#taskForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = $("#taskTitle").value;
  if (!title.trim()) return;
  if (addTask(title, { description: $("#taskDescription").value, tags: [...composerSelectedTags], assignee: $("#taskAssignee").value, due: $("#taskDue").value, priority: $("#taskPriority").value })) $("#taskDialog").close();
});
$("#taskForm").addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") $("#taskForm").requestSubmit(); });

$("#undoButton").addEventListener("click", () => { if (undoAction && undoAction()) { undoAction = null; $("#toast").classList.remove("show"); } });
$("#menuButton").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#sidebarScrim").classList.add("open"); });
$("#sidebarClose").addEventListener("click", () => { $("#sidebar").classList.remove("open"); $("#sidebarScrim").classList.remove("open"); });
$("#sidebarScrim").addEventListener("click", () => { $("#sidebar").classList.remove("open"); $("#sidebarScrim").classList.remove("open"); });

document.addEventListener("keydown", event => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) { event.preventDefault(); $("#searchInput").focus(); }
  if (event.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && !$("#taskDialog").open) { event.preventDefault(); openDialog(); }
});
