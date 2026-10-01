const STORAGE_KEY = "yarukoto-data";
const HISTORY_DAYS = 14;
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const PRIORITY_LABEL = { high: "High", normal: "Normal", low: "Low" };
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
  // only a brand new install (nothing saved yet) gets the intro on its own;
  // anyone with existing data is treated as having seen it
  const fallback = { version: 1, tasks: [], settings: { resetMinutes: 0, introSeen: raw !== null } };
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
let editingId = null;
let justAddedId = null;
let renderedDay = null;
let rolloverTimer = null;

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

function setPriority(id, priority) {
  const task = state.tasks.find((t) => t.id === id);
  task.priority = priority;
  saveData(state);
  render();
}

function closePriorityMenus() {
  document.querySelectorAll(".priority-menu:not([hidden])").forEach((menu) => {
    menu.hidden = true;
    menu.previousElementSibling.setAttribute("aria-expanded", "false");
  });
}

function makePriorityPicker(task) {
  const priority = task.priority || "normal";

  const wrap = document.createElement("div");
  wrap.className = "priority-wrap";

  const flag = document.createElement("button");
  flag.type = "button";
  flag.className = "task-priority";
  flag.dataset.priority = priority;
  flag.textContent = PRIORITY_GLYPH[priority];
  flag.title = `${PRIORITY_LABEL[priority]} priority (click to change)`;
  flag.setAttribute("aria-label", `Priority: ${PRIORITY_LABEL[priority]}. Click to change.`);
  flag.setAttribute("aria-haspopup", "true");
  flag.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "priority-menu";
  menu.hidden = true;
  Object.keys(PRIORITY_ORDER).forEach((level) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "priority-option";
    option.dataset.priority = level;
    option.setAttribute("aria-pressed", String(level === priority));
    const glyph = document.createElement("span");
    glyph.className = "priority-option-glyph";
    glyph.textContent = PRIORITY_GLYPH[level];
    option.append(glyph, document.createTextNode(PRIORITY_LABEL[level]));
    option.addEventListener("click", () => setPriority(task.id, level));
    menu.append(option);
  });

  flag.addEventListener("click", () => {
    const open = menu.hidden;
    closePriorityMenus();
    menu.hidden = !open;
    flag.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector('[aria-pressed="true"]').focus();
  });
  menu.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closePriorityMenus();
    flag.focus();
  });

  wrap.append(flag, menu);
  return wrap;
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

function toggleToday(id) {
  const task = state.tasks.find((t) => t.id === id);
  const today = todayStr();
  if (task.completed) {
    task.completed = false;
    const idx = task.completions.indexOf(today);
    if (idx !== -1) task.completions.splice(idx, 1);
  } else {
    task.completed = true;
    task.completions.push(today);
  }
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
  li.className = "task-row" + (task.id === justAddedId ? " row-enter" : "");
  li.dataset.id = task.id;
  li.dataset.type = task.type;

  const flag = makePriorityPicker(task);

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
    if (!confirm(`Delete "${task.title}"?`)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      deleteTask(task.id);
      return;
    }
    li.classList.add("row-exit");
    li.addEventListener("animationend", () => deleteTask(task.id), { once: true });
  });

  li.append(flag, check, title, edit, del);
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

// not-done tasks first, done ones (struck through) below, each group keeping its order
function pendingFirst(tasks, isDone) {
  return [...tasks.filter((t) => !isDone(t)), ...tasks.filter(isDone)];
}

// FLIP: record each row's top before the lists are rebuilt, keyed by task id
function captureRowTops(lists) {
  const tops = new Map();
  lists.forEach((list) =>
    list.querySelectorAll(".task-row[data-id]").forEach((row) => {
      tops.set(row.dataset.id, row.getBoundingClientRect().top);
    })
  );
  return tops;
}

// slide rows from their old position to the new one when a re-render moves them
function animateRowMoves(firstTops) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll(".task-row[data-id]").forEach((row) => {
    if (row.classList.contains("row-enter")) return;
    const first = firstTops.get(row.dataset.id);
    if (first === undefined) return;
    const dy = first - row.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    // WAAPI fills none by default, so no transform lingers afterwards
    row.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: 200, easing: "ease-out" }
    );
  });
}

function render() {
  document.getElementById("today-date").textContent = effectiveNow().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  document.getElementById("reset-time-input").value = minutesToTimeStr(getResetMinutes());

  const today = todayStr();
  renderedDay = today;
  const isDailyDone = (t) => t.completions.includes(today);
  const isTodayDone = (t) => t.completed;
  const dailyTasks = sortByPriority(state.tasks.filter((t) => t.type === "daily"));
  const todayTasks = sortByPriority(
    state.tasks.filter((t) => t.type === "today" && (!t.completed || t.completions.includes(today)))
  );

  const dailyList = document.getElementById("daily-list");
  const todayList = document.getElementById("today-list");
  const firstTops = captureRowTops([dailyList, todayList]);

  dailyList.innerHTML = "";
  pendingFirst(dailyTasks, isDailyDone).forEach((t) =>
    dailyList.append(makeTaskRow(t, { onToggle: toggleDaily, onCheck: isDailyDone }))
  );
  document.getElementById("daily-empty").hidden = dailyTasks.length > 0;

  todayList.innerHTML = "";
  pendingFirst(todayTasks, isTodayDone).forEach((t) =>
    todayList.append(makeTaskRow(t, { onToggle: toggleToday, onCheck: isTodayDone }))
  );
  document.getElementById("today-empty").hidden = todayTasks.length > 0;

  animateRowMoves(firstTops);

  const hasVisibleTasks = dailyTasks.length > 0 || todayTasks.length > 0;
  document.getElementById("all-done-note").hidden = !(
    hasVisibleTasks && dailyTasks.every(isDailyDone) && todayTasks.every(isTodayDone)
  );

  renderHistory(dailyTasks);

  if (editingId) {
    const input = document.querySelector(".edit-form .edit-title-input");
    if (input) {
      input.focus();
      input.select();
    }
  }
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
    const label = document.createElement("span");
    label.textContent = task.title;
    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = task.completions.at(-1) || "";
    li.append(label, date);
    historyList.append(li);
  });
  document.getElementById("history-empty").hidden = completedToday.length > 0;
}

// how long the timer may sleep before re-reading the clock; timers can run late
// or pause while the computer sleeps, so the day is never counted down, only re-read
const ROLLOVER_POLL_MS = 30000;

function msUntilNextReset() {
  const now = new Date();
  const mins = getResetMinutes();
  const at = (dayOffset) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, Math.floor(mins / 60), mins % 60, 0, 0);
  const next = at(0) > now ? at(0) : at(1);
  return next - now;
}

// redraw when the app's "day" has moved on since the last render, so habits
// uncheck and the header date updates without a reload
function checkDayRollover() {
  if (todayStr() === renderedDay) return;
  // keep an open editor intact; saving or cancelling re-renders with the new day
  if (editingId) return;
  render();
}

function scheduleRolloverCheck() {
  clearTimeout(rolloverTimer);
  const delay = Math.min(msUntilNextReset() + 250, ROLLOVER_POLL_MS);
  rolloverTimer = setTimeout(() => {
    checkDayRollover();
    scheduleRolloverCheck();
  }, delay);
}

// coming back from sleep, a hidden tab or the back/forward cache: check now
// instead of waiting for the next timer tick
function checkAfterWake() {
  checkDayRollover();
  scheduleRolloverCheck();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkAfterWake();
});
window.addEventListener("focus", checkAfterWake);
window.addEventListener("pageshow", checkAfterWake);
scheduleRolloverCheck();

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
  scheduleRolloverCheck();
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
    state = { ...parsed, settings: { resetMinutes: 0, ...parsed.settings, introSeen: true } };
    saveData(state);
    render();
    scheduleRolloverCheck();
  } catch {
    alert("That file doesn't look like a Yarukoto backup.");
  } finally {
    e.target.value = "";
  }
});

let introReturnFocus = null;

function isIntroOpen() {
  return !document.getElementById("intro-backdrop").hidden;
}

function showIntro() {
  introReturnFocus = document.activeElement;
  document.getElementById("intro-backdrop").hidden = false;
  document.getElementById("intro-dismiss").focus();
}

function dismissIntro() {
  document.getElementById("intro-backdrop").hidden = true;
  if (!state.settings.introSeen) {
    state.settings.introSeen = true;
    saveData(state);
  }
  if (introReturnFocus && introReturnFocus !== document.body) introReturnFocus.focus();
  introReturnFocus = null;
}

document.getElementById("help-button").addEventListener("click", showIntro);
document.getElementById("intro-dismiss").addEventListener("click", dismissIntro);
document.getElementById("intro-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "intro-backdrop") dismissIntro();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".priority-wrap")) closePriorityMenus();
});
document.addEventListener("keydown", (e) => {
  if (!isIntroOpen()) return;
  if (e.key === "Escape") dismissIntro();
  // the dismiss button is the only focusable thing in the dialog, so keep focus on it
  if (e.key === "Tab") {
    e.preventDefault();
    document.getElementById("intro-dismiss").focus();
  }
});

render();
if (!state.settings.introSeen) showIntro();
