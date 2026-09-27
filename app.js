const STORAGE_KEY = "yarukoto-data";
const HISTORY_DAYS = 14;

// crypto.randomUUID requires a secure context (https/localhost); avoid it so
// the app also works over plain http, e.g. a phone hitting a LAN IP
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: 1, tasks: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { version: 1, tasks: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let state = loadData();
let editingId = null;

function addTask(title, type) {
  state.tasks.push({
    id: uid(),
    title,
    type,
    createdAt: todayStr(),
    completed: false,
    completions: [],
  });
  saveData(state);
  render();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveData(state);
  render();
}

function toggleDaily(id) {
  const task = state.tasks.find((t) => t.id === id);
  const today = todayStr();
  const idx = task.completions.indexOf(today);
  if (idx === -1) task.completions.push(today);
  else task.completions.splice(idx, 1);
  saveData(state);
  render();
}

function completeToday(id) {
  const task = state.tasks.find((t) => t.id === id);
  task.completed = true;
  task.completions.push(todayStr());
  saveData(state);
  render();
}

function restoreToday(id) {
  const task = state.tasks.find((t) => t.id === id);
  task.completed = false;
  saveData(state);
  render();
}

function updateTask(id, updates) {
  const task = state.tasks.find((t) => t.id === id);
  Object.assign(task, updates);
  saveData(state);
  editingId = null;
  render();
}

function makeTaskRow(task, { onToggle, onCheck }) {
  if (task.id === editingId) return makeEditRow(task);

  const li = document.createElement("li");
  li.className = "task-row";
  li.dataset.type = task.type;

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "task-check";
  check.checked = onCheck(task);
  check.addEventListener("change", () => onToggle(task.id));

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title;

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "task-edit";
  edit.setAttribute("aria-label", `Edit "${task.title}"`);
  edit.textContent = "✎";
  edit.addEventListener("click", () => {
    editingId = task.id;
    render();
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "task-delete";
  del.setAttribute("aria-label", `Delete "${task.title}"`);
  del.textContent = "×";
  del.addEventListener("click", () => {
    if (confirm(`Delete "${task.title}"?`)) deleteTask(task.id);
  });

  li.append(check, title, edit, del);
  return li;
}

function makeEditRow(task) {
  const li = document.createElement("li");
  li.className = "task-row task-row-editing";

  const form = document.createElement("form");
  form.className = "edit-form";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "edit-title-input";
  input.value = task.title;
  input.maxLength = 120;
  input.required = true;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      editingId = null;
      render();
    }
  });

  const typeWrap = document.createElement("div");
  typeWrap.className = "edit-type";
  ["daily", "today"].forEach((type) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `edit-type-${task.id}`;
    radio.value = type;
    radio.checked = task.type === type;
    label.append(radio, document.createTextNode(type === "daily" ? "Daily" : "Just today"));
    typeWrap.append(label);
  });

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    editingId = null;
    render();
  });
  actions.append(save, cancel);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    const type = typeWrap.querySelector("input:checked").value;
    updateTask(task.id, { title, type });
  });

  form.append(input, typeWrap, actions);
  li.append(form);
  return li;
}

function render() {
  document.getElementById("today-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const today = todayStr();
  const dailyTasks = state.tasks.filter((t) => t.type === "daily");
  const todayTasks = state.tasks.filter((t) => t.type === "today" && !t.completed);

  const dailyList = document.getElementById("daily-list");
  dailyList.innerHTML = "";
  dailyTasks.forEach((t) =>
    dailyList.append(makeTaskRow(t, { onToggle: toggleDaily, onCheck: (task) => task.completions.includes(today) }))
  );
  document.getElementById("daily-empty").hidden = dailyTasks.length > 0;

  const todayList = document.getElementById("today-list");
  todayList.innerHTML = "";
  todayTasks.forEach((t) =>
    todayList.append(makeTaskRow(t, { onToggle: completeToday, onCheck: () => false }))
  );
  document.getElementById("today-empty").hidden = todayTasks.length > 0;

  renderHistory(dailyTasks);

  if (editingId) {
    const input = document.querySelector(".edit-form .edit-title-input");
    if (input) {
      input.focus();
      input.select();
    }
  }
}

function renderHistory(dailyTasks) {
  const dailyHistory = document.getElementById("history-daily");
  dailyHistory.innerHTML = "";
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => todayStr(-(HISTORY_DAYS - 1 - i)));

  dailyTasks.forEach((task) => {
    const wrap = document.createElement("div");
    wrap.className = "habit-history";
    const title = document.createElement("div");
    title.className = "habit-history-title";
    title.textContent = task.title;
    const dots = document.createElement("div");
    dots.className = "habit-dots";
    days.forEach((day) => {
      const dot = document.createElement("span");
      dot.className = "habit-dot" + (task.completions.includes(day) ? " done" : "");
      dot.title = day;
      dots.append(dot);
    });
    wrap.append(title, dots);
    dailyHistory.append(wrap);
  });

  const completedToday = state.tasks
    .filter((t) => t.type === "today" && t.completed)
    .sort((a, b) => (b.completions.at(-1) || "").localeCompare(a.completions.at(-1) || ""));

  const historyList = document.getElementById("history-today");
  historyList.innerHTML = "";
  completedToday.forEach((task) => {
    const li = document.createElement("li");
    const label = document.createElement("button");
    label.type = "button";
    label.className = "link-button";
    label.textContent = task.title;
    label.addEventListener("click", () => restoreToday(task.id));
    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = task.completions.at(-1) || "";
    li.append(label, date);
    historyList.append(li);
  });
  document.getElementById("history-empty").hidden = completedToday.length > 0;
}

document.getElementById("add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("add-input");
  const title = input.value.trim();
  if (!title) return;
  const type = document.querySelector('input[name="task-type"]:checked').value;
  addTask(title, type);
  input.value = "";
  input.focus();
});

document.getElementById("history-toggle").addEventListener("click", (e) => {
  const panel = document.getElementById("history-panel");
  const open = panel.hidden;
  panel.hidden = !open;
  e.target.setAttribute("aria-expanded", String(open));
});

document.getElementById("export-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yarukoto-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("import-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.tasks)) throw new Error("invalid file");
    if (!confirm("Replace current tasks with this backup?")) return;
    state = parsed;
    saveData(state);
    render();
  } catch {
    alert("That file doesn't look like a Yarukoto backup.");
  } finally {
    e.target.value = "";
  }
});

render();
