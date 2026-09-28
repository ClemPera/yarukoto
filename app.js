const STORAGE_KEY = "yarukoto-data";
const HISTORY_DAYS = 14;
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const PRIORITY_LABEL = { high: "High", normal: "Normal", low: "Low" };
const PRIORITY_CYCLE = { normal: "high", high: "low", low: "normal" };
// same convention as Jira: up = high, down = low, equals = normal
const PRIORITY_GLYPH = { high: "↑", normal: "=", low: "↓" };

// crypto.randomUUID requires a secure context (https/localhost); avoid it so
// the app also works over plain http, e.g. a phone hitting a LAN IP
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayStr(offsetDays = 0) {
  const d = effectiveNow();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const fallback = { version: 1, tasks: [], settings: { resetMinutes: 0 } };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed, settings: { ...fallback.settings, ...parsed.settings } };
  } catch {
    return fallback;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getResetMinutes() {
  return state.settings.resetMinutes ?? 0;
}

// "now" shifted back by the configured reset time, so the calendar date of
// the result is the app's current "day" - e.g. with a 4:00am reset, 2:30am
// still counts as the previous day
function effectiveNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - getResetMinutes());
  return d;
}

function minutesToTimeStr(mins) {
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeStrToMinutes(str) {
  const [hh, mm] = str.split(":").map(Number);
  return hh * 60 + mm;
}

const CONFETTI_COLORS = ["--seal", "--daily-mark", "--ink"];

function burstConfetti(fromEl) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = fromEl.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const styles = getComputedStyle(document.documentElement);
  const colors = CONFETTI_COLORS.map((v) => styles.getPropertyValue(v).trim());

  for (let i = 0; i < 12; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const angle = Math.random() * Math.PI * 2;
    const distance = 36 + Math.random() * 46;
    piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * distance - 26}px`);
    piece.style.setProperty("--rot", `${(Math.random() - 0.5) * 480}deg`);
    piece.style.background = colors[i % colors.length];
    piece.style.left = `${originX}px`;
    piece.style.top = `${originY}px`;
    document.body.append(piece);
    piece.addEventListener("animationend", () => piece.remove());
  }
}

let state = loadData();
let justAddedId = null;

function addTask(title, type) {
  const id = uid();
  state.tasks.push({
    id,
    title,
    type,
    priority: "normal",
    createdAt: todayStr(),
    completed: false,
    completions: [],
  });
  justAddedId = id;
  saveData(state);
  render();
}

function cyclePriority(id) {
  const task = state.tasks.find((t) => t.id === id);
  task.priority = PRIORITY_CYCLE[task.priority || "normal"];
  saveData(state);
  render();
}

function sortByPriority(tasks) {
  return [...tasks].sort(
    (a, b) => PRIORITY_ORDER[a.priority || "normal"] - PRIORITY_ORDER[b.priority || "normal"]
  );
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

function makeTaskRow(task, { onToggle, onCheck }) {
  const li = document.createElement("li");
  li.className = "task-row" + (task.id === justAddedId ? " row-enter" : "");
  li.dataset.type = task.type;

  const priority = task.priority || "normal";
  const flag = document.createElement("button");
  flag.type = "button";
  flag.className = "task-priority";
  flag.dataset.priority = priority;
  flag.textContent = PRIORITY_GLYPH[priority];
  flag.title = `${PRIORITY_LABEL[priority]} priority (click to change)`;
  flag.setAttribute("aria-label", `Priority: ${PRIORITY_LABEL[priority]}. Click to change.`);
  flag.addEventListener("click", () => cyclePriority(task.id));

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "task-check";
  check.checked = onCheck(task);
  check.addEventListener("change", () => {
    if (check.checked) burstConfetti(check);
    onToggle(task.id);
  });

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title;

  const del = document.createElement("button");
  del.type = "button";
  del.className = "task-delete";
  del.setAttribute("aria-label", `Delete "${task.title}"`);
  del.textContent = "×";
  del.addEventListener("click", () => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      deleteTask(task.id);
      return;
    }
    li.classList.add("row-exit");
    li.addEventListener("animationend", () => deleteTask(task.id), { once: true });
  });

  li.append(flag, check, title, del);
  return li;
}

function render() {
  document.getElementById("today-date").textContent = effectiveNow().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  document.getElementById("reset-time-input").value = minutesToTimeStr(getResetMinutes());

  const today = todayStr();
  const dailyTasks = sortByPriority(state.tasks.filter((t) => t.type === "daily"));
  const todayTasks = sortByPriority(state.tasks.filter((t) => t.type === "today" && !t.completed));

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

  const hasTasks = dailyTasks.length > 0 || state.tasks.some((t) => t.type === "today");
  const allDailyDone = dailyTasks.length > 0 && dailyTasks.every((t) => t.completions.includes(today));
  const noDailyTasks = dailyTasks.length === 0;
  document.getElementById("all-done-note").hidden = !(
    hasTasks && (allDailyDone || noDailyTasks) && todayTasks.length === 0
  );

  renderHistory(dailyTasks);
  justAddedId = null;
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

document.getElementById("settings-toggle").addEventListener("click", (e) => {
  const panel = document.getElementById("settings-panel");
  const open = panel.hidden;
  panel.hidden = !open;
  e.target.setAttribute("aria-expanded", String(open));
});

document.getElementById("reset-time-input").addEventListener("change", (e) => {
  if (!e.target.value) return;
  state.settings.resetMinutes = timeStrToMinutes(e.target.value);
  saveData(state);
  render();
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
    state = { ...parsed, settings: { resetMinutes: 0, ...parsed.settings } };
    saveData(state);
    render();
  } catch {
    alert("That file doesn't look like a Yarukoto backup.");
  } finally {
    e.target.value = "";
  }
});

render();
