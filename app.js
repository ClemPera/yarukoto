const STORAGE_KEY = "yarukoto-data";
const HISTORY_DAYS = 7;
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const PRIORITY_LABEL = { high: "High", normal: "Normal", low: "Low" };
// same convention as Jira: up = high, down = low, equals = normal
const PRIORITY_GLYPH = { high: "↑", normal: "=", low: "↓" };

// crypto.randomUUID requires a secure context (https/localhost); avoid it so
// the app also works over plain http, e.g. a phone hitting a LAN IP
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function dateToStr(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayStr(offsetDays = 0) {
  const d = effectiveNow();
  d.setDate(d.getDate() + offsetDays);
  return dateToStr(d);
}

// Monday-first start of the week containing date
function mondayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// split yyyy-mm-dd so the date is local midnight, unlike new Date(dateStr)
function dateFromStr(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatHistoryDate(dateStr) {
  const date = dateFromStr(dateStr);
  const options = { weekday: "short", month: "short", day: "numeric" };
  if (date.getFullYear() !== effectiveNow().getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}

function formatFullHistoryDate(dateStr) {
  return dateFromStr(dateStr).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatAxisDate(dateStr) {
  return dateFromStr(dateStr).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

// Monday-first short names in the user's locale; 2024-01-01 was a Monday
const WEEKDAY_NAMES = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" })
);

// short month names in the user's locale, in calendar order
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2024, i, 1).toLocaleDateString(undefined, { month: "short" })
);

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
let activityYear = effectiveNow().getFullYear();
let activityMonth = effectiveNow().getMonth();
let activityView = "year";
let activityYearLayout = "months";
let activityTaskId = "all";
let activityFilterSignature = null;
let activityReturnFocus = null;
let activityScrollLock = null;
const narrowViewport = window.matchMedia("(max-width: 34rem)");

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

function toggleDailyForDate(id, dateStr) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const idx = task.completions.indexOf(dateStr);
  if (idx === -1) task.completions.push(dateStr);
  else task.completions.splice(idx, 1);
  saveData(state);
  render();
}

function toggleDaily(id) {
  toggleDailyForDate(id, todayStr());
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
  refreshActivity();

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
  const dailyBlock = document.getElementById("history-daily-block");
  const dailyHistory = document.getElementById("history-daily");
  dailyBlock.hidden = dailyTasks.length === 0;
  dailyHistory.innerHTML = "";

  // yesterday back to a week ago; today belongs to the main Daily list
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => todayStr(i - HISTORY_DAYS));

  if (dailyTasks.length > 0) {
    const axis = document.createElement("div");
    axis.className = "habit-axis";
    axis.setAttribute("aria-hidden", "true");
    days.forEach((day) => {
      const label = document.createElement("span");
      label.textContent = formatAxisDate(day);
      axis.append(label);
    });
    dailyHistory.append(axis);
  }

  dailyTasks.forEach((task) => {
    const wrap = document.createElement("div");
    wrap.className = "habit-history";
    const title = document.createElement("div");
    title.className = "habit-history-title";
    title.textContent = task.title;
    const dots = document.createElement("div");
    dots.className = "habit-dots";
    days.forEach((day) => {
      const done = task.completions.includes(day);
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "habit-dot" + (done ? " done" : "");
      dot.dataset.date = day;
      dot.title = formatHistoryDate(day);
      dot.setAttribute("aria-pressed", String(done));
      dot.setAttribute(
        "aria-label",
        `${done ? "Unmark" : "Mark"} ${task.title} done for ${formatFullHistoryDate(day)}`
      );
      dot.addEventListener("click", () => toggleDailyForDate(task.id, day));
      dots.append(dot);
    });
    wrap.append(title, dots);
    dailyHistory.append(wrap);
  });

  const today = todayStr();
  const completedEarlier = state.tasks
    .filter((t) => {
      if (t.type !== "today" || !t.completed) return false;
      const last = t.completions?.at(-1);
      return Boolean(last) && last !== today;
    })
    .sort((a, b) => b.completions.at(-1).localeCompare(a.completions.at(-1)));

  const historyList = document.getElementById("history-today");
  historyList.innerHTML = "";
  completedEarlier.forEach((task) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = task.title;
    const date = document.createElement("time");
    date.className = "history-date";
    date.dateTime = task.completions.at(-1);
    date.textContent = formatHistoryDate(date.dateTime);
    li.append(label, date);
    historyList.append(li);
  });
  document.getElementById("history-empty").hidden = completedEarlier.length > 0;
  updateActivityVisibility(dailyTasks);
}

function updateActivityVisibility(dailyTasks) {
  const hasDailyTasks = dailyTasks.length > 0;
  document.getElementById("activity-toggle").hidden = !hasDailyTasks;
  if (hasDailyTasks) return;

  activityTaskId = "all";
  if (isActivityOpen()) closeActivity();
}

function activityCellInfo(dateStr, dailyTasks, selectedTask) {
  const date = formatFullHistoryDate(dateStr);

  if (selectedTask) {
    const done = selectedTask.completions.includes(dateStr);
    return {
      level: done ? 4 : 0,
      title: `${date}\n${selectedTask.title}: ${done ? "Done" : "Not done"}`,
    };
  }

  const existing = dailyTasks.filter((t) => t.createdAt <= dateStr);
  if (existing.length === 0) return { level: 0, noData: true, title: `${date}\nNo habits yet` };

  const done = existing.filter((t) => t.completions.includes(dateStr));
  if (done.length === 0) return { level: 0, title: `${date}\nNo habits completed` };

  return {
    level: Math.ceil((done.length / existing.length) * 4),
    title: [date, ...done.map((t) => t.title)].join("\n"),
  };
}

// keep the select in the DOM across renders so choosing a task never loses focus
function syncActivityFilter(dailyTasks) {
  const select = document.getElementById("activity-filter");
  const signature = dailyTasks.map((t) => `${t.id}:${t.title}`).join("\n");

  if (signature !== activityFilterSignature) {
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All tasks";
    select.append(all);
    dailyTasks.forEach((task) => {
      const option = document.createElement("option");
      option.value = task.id;
      option.textContent = task.title;
      select.append(option);
    });
    activityFilterSignature = signature;
  }

  const selected = dailyTasks.find((t) => t.id === activityTaskId);
  if (!selected) activityTaskId = "all";
  select.value = activityTaskId;
  return selected || null;
}

function activityPeriodName() {
  if (activityView === "year") return String(activityYear);
  return new Date(activityYear, activityMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function renderActivityPeriodLabel() {
  const periodLabel = activityPeriodName();
  document.getElementById("activity-period-label").textContent = periodLabel;

  const now = effectiveNow();
  const next = document.getElementById("activity-next");
  if (activityView === "year") {
    next.disabled = activityYear >= now.getFullYear();
  } else {
    const currentIndex = now.getFullYear() * 12 + now.getMonth();
    next.disabled = activityYear * 12 + activityMonth >= currentIndex;
  }
  return periodLabel;
}

function renderActivity(dailyTasks, selectedTask) {
  const isTaskView = Boolean(selectedTask);
  const isYear = activityView === "year";
  const isNarrow = narrowViewport.matches;

  document.getElementById("activity-legend-all").hidden = isTaskView;
  document.getElementById("activity-legend-task").hidden = !isTaskView;
  document.querySelectorAll(".activity-view-button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === activityView));
  });

  const layoutSwitch = document.getElementById("activity-year-layout");
  layoutSwitch.hidden = !(isYear && isNarrow);
  layoutSwitch.querySelectorAll(".activity-year-layout-button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.layout === activityYearLayout));
  });

  document.getElementById("activity-prev").setAttribute("aria-label", isYear ? "Previous year" : "Previous month");
  document.getElementById("activity-next").setAttribute("aria-label", isYear ? "Next year" : "Next month");

  const periodLabel = renderActivityPeriodLabel();
  const graph = document.getElementById("activity-graph");
  graph.setAttribute(
    "aria-label",
    selectedTask
      ? `Habit activity for ${periodLabel}, ${selectedTask.title}. Filled squares mean it was done.`
      : `Habit activity for ${periodLabel}, all tasks. Darker squares mean more habits completed.`
  );

  // the phone week grid is rebuilt on every change, so carry its scroll offset over
  const scrollLeft = graph.querySelector(".activity-year-scroll")?.scrollLeft ?? 0;
  graph.innerHTML = "";
  if (!isYear) {
    graph.append(buildActivityMonthGrid(dailyTasks, selectedTask));
  } else if (!isNarrow) {
    graph.append(buildActivityYearGrid(dailyTasks, selectedTask));
  } else if (activityYearLayout === "weeks") {
    graph.append(buildActivityYearWeeks(dailyTasks, selectedTask));
  } else {
    graph.append(buildActivityYearMonths(dailyTasks, selectedTask));
  }
  const scroller = graph.querySelector(".activity-year-scroll");
  if (scroller) scroller.scrollLeft = scrollLeft;
}

function activityDayCell(dateStr, info, today) {
  const cell = document.createElement("span");
  cell.className = `activity-cell level-${info.level}`;
  cell.dataset.date = dateStr;
  cell.title = info.title;
  if (info.noData) cell.classList.add("is-no-data");
  if (dateStr === today) cell.classList.add("is-today");
  return cell;
}

function activityBlankCell() {
  const cell = document.createElement("span");
  cell.className = "activity-cell is-out";
  return cell;
}

function buildActivityMonthGrid(dailyTasks, selectedTask) {
  const now = effectiveNow();
  const currentIndex = now.getFullYear() * 12 + now.getMonth();
  const selectedIndex = activityYear * 12 + activityMonth;
  const first = new Date(activityYear, activityMonth, 1);
  const last = new Date(activityYear, activityMonth + 1, 0);
  const monthStart = dateToStr(first);
  const monthEnd = dateToStr(last);
  const today = todayStr();
  const cutoff = selectedIndex >= currentIndex ? today : monthEnd;
  const lastWeek =
    selectedIndex === currentIndex ? mondayOf(dateFromStr(today)) : mondayOf(last);

  const grid = document.createElement("div");
  grid.className = "activity-month-grid";
  grid.dataset.month = monthStart.slice(0, 7);

  WEEKDAY_NAMES.forEach((name) => {
    const weekday = document.createElement("span");
    weekday.className = "activity-weekday";
    weekday.textContent = name;
    grid.append(weekday);
  });

  for (let week = mondayOf(first); week <= lastWeek; week.setDate(week.getDate() + 7)) {
    for (let i = 0; i < 7; i++) {
      const date = new Date(week);
      date.setDate(week.getDate() + i);
      const dateStr = dateToStr(date);
      if (
        dateStr < monthStart ||
        dateStr > monthEnd ||
        dateStr > cutoff ||
        (selectedTask && dateStr < selectedTask.createdAt)
      ) {
        grid.append(activityBlankCell());
      } else {
        grid.append(
          activityDayCell(dateStr, activityCellInfo(dateStr, dailyTasks, selectedTask), today)
        );
      }
    }
  }

  return grid;
}

function buildActivityYearGrid(dailyTasks, selectedTask) {
  const currentYear = effectiveNow().getFullYear();
  const yearStart = dateToStr(new Date(activityYear, 0, 1));
  const yearEnd = dateToStr(new Date(activityYear, 11, 31));
  const today = todayStr();
  const cutoff = activityYear >= currentYear ? today : yearEnd;

  const weekStarts = [];
  const firstWeek = mondayOf(new Date(activityYear, 0, 1));
  const lastWeek = mondayOf(new Date(activityYear, 11, 31));
  for (let week = new Date(firstWeek); week <= lastWeek; week.setDate(week.getDate() + 7)) {
    weekStarts.push(new Date(week));
  }
  const weekIndex = new Map(weekStarts.map((week, index) => [dateToStr(week), index]));

  const grid = document.createElement("div");
  grid.className = "activity-year-grid";
  grid.dataset.year = String(activityYear);
  grid.dataset.weeks = String(weekStarts.length);
  grid.style.setProperty("--year-weeks", weekStarts.length);

  const weekdays = document.createElement("div");
  weekdays.className = "activity-year-weekdays";
  WEEKDAY_NAMES.forEach((name) => {
    const label = document.createElement("span");
    label.className = "activity-weekday";
    label.textContent = name;
    weekdays.append(label);
  });
  grid.append(weekdays);

  MONTH_NAMES.forEach((name, month) => {
    const start = weekIndex.get(dateToStr(mondayOf(new Date(activityYear, month, 1))));
    const end = weekIndex.get(dateToStr(mondayOf(new Date(activityYear, month + 1, 0))));
    const label = document.createElement("span");
    label.className = "activity-year-month";
    label.textContent = name;
    label.style.gridColumn = `${start + 2} / span ${end - start + 1}`;
    label.style.gridRow = "1";
    grid.append(label);
  });

  weekStarts.forEach((weekStart, week) => {
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dateStr = dateToStr(date);
      const cell =
        dateStr < yearStart ||
        dateStr > yearEnd ||
        dateStr > cutoff ||
        (selectedTask && dateStr < selectedTask.createdAt)
          ? activityBlankCell()
          : activityDayCell(dateStr, activityCellInfo(dateStr, dailyTasks, selectedTask), today);
      cell.style.gridColumn = String(week + 2);
      cell.style.gridRow = String(i + 2);
      grid.append(cell);
    }
  });

  return grid;
}

function buildActivityYearWeeks(dailyTasks, selectedTask) {
  const scroll = document.createElement("div");
  scroll.className = "activity-year-scroll";
  scroll.append(buildActivityYearGrid(dailyTasks, selectedTask));
  return scroll;
}

function buildActivityYearMonths(dailyTasks, selectedTask) {
  const currentYear = effectiveNow().getFullYear();
  const yearEnd = dateToStr(new Date(activityYear, 11, 31));
  const today = todayStr();
  const cutoff = activityYear >= currentYear ? today : yearEnd;

  const grid = document.createElement("div");
  grid.className = "activity-year-months";
  grid.dataset.year = String(activityYear);

  MONTH_NAMES.forEach((name, month) => {
    const label = document.createElement("span");
    label.className = "activity-month-name";
    label.textContent = name;
    grid.append(label);

    // always 31 columns so day numbers line up down the year
    const daysInMonth = new Date(activityYear, month + 1, 0).getDate();
    for (let day = 1; day <= 31; day++) {
      if (day > daysInMonth) {
        grid.append(activityBlankCell());
        continue;
      }
      const dateStr = dateToStr(new Date(activityYear, month, day));
      if (dateStr > cutoff || (selectedTask && dateStr < selectedTask.createdAt)) {
        grid.append(activityBlankCell());
      } else {
        grid.append(
          activityDayCell(dateStr, activityCellInfo(dateStr, dailyTasks, selectedTask), today)
        );
      }
    }
  });

  return grid;
}

function refreshActivity() {
  const dailyTasks = sortByPriority(state.tasks.filter((t) => t.type === "daily"));
  const selectedTask = syncActivityFilter(dailyTasks);
  if (isActivityOpen()) renderActivity(dailyTasks, selectedTask);
}

function isActivityOpen() {
  return !document.getElementById("activity-dialog-backdrop").hidden;
}

function lockActivityScroll() {
  if (activityScrollLock !== null) return;
  activityScrollLock = document.body.style.overflow;
  document.body.style.overflow = "hidden";
}

function unlockActivityScroll() {
  if (activityScrollLock === null) return;
  document.body.style.overflow = activityScrollLock;
  activityScrollLock = null;
}

function openActivity() {
  const toggle = document.getElementById("activity-toggle");
  if (toggle.hidden || isActivityOpen()) return;
  closeFooterPanels();
  activityReturnFocus = toggle;
  document.getElementById("activity-dialog-backdrop").hidden = false;
  toggle.setAttribute("aria-expanded", "true");
  lockActivityScroll();
  refreshActivity();
  document.getElementById("activity-dialog-close").focus();
}

function closeActivity() {
  const backdrop = document.getElementById("activity-dialog-backdrop");
  if (backdrop.hidden) return;
  backdrop.hidden = true;
  document.getElementById("activity-toggle").setAttribute("aria-expanded", "false");
  unlockActivityScroll();
  const target = activityReturnFocus || document.getElementById("activity-toggle");
  activityReturnFocus = null;
  if (!target.hidden) target.focus();
}

function setActivityTask(id) {
  activityTaskId = id;
  refreshActivity();
}

function setActivityView(view) {
  if (view === activityView) return;
  if (view === "month") {
    const now = effectiveNow();
    if (activityYear > now.getFullYear()) {
      activityYear = now.getFullYear();
      activityMonth = now.getMonth();
    } else if (activityYear === now.getFullYear() && activityMonth > now.getMonth()) {
      activityMonth = now.getMonth();
    }
  }
  activityView = view;
  refreshActivity();
}

function setActivityYearLayout(layout) {
  if (layout === activityYearLayout) return;
  activityYearLayout = layout;
  refreshActivity();
}

function stepActivityPeriod(offset) {
  if (activityView === "year") {
    const target = activityYear + offset;
    if (offset > 0 && target > effectiveNow().getFullYear()) return;
    activityYear = target;
    refreshActivity();
    return;
  }

  const target = new Date(activityYear, activityMonth + offset, 1);
  if (offset > 0) {
    const now = effectiveNow();
    const currentIndex = now.getFullYear() * 12 + now.getMonth();
    if (target.getFullYear() * 12 + target.getMonth() > currentIndex) return;
  }
  activityYear = target.getFullYear();
  activityMonth = target.getMonth();
  refreshActivity();
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

const FOOTER_PANELS = {
  history: { panel: "history-panel", toggle: "history-toggle" },
  settings: { panel: "settings-panel", toggle: "settings-toggle" },
};

function setFooterPanel(name, open) {
  const { panel, toggle } = FOOTER_PANELS[name];
  document.getElementById(panel).hidden = !open;
  document.getElementById(toggle).setAttribute("aria-expanded", String(open));
}

function closeFooterPanels(except) {
  Object.keys(FOOTER_PANELS).forEach((name) => {
    if (name !== except) setFooterPanel(name, false);
  });
}

function toggleFooterPanel(name) {
  const open = document.getElementById(FOOTER_PANELS[name].panel).hidden;
  if (open) closeFooterPanels(name);
  setFooterPanel(name, open);
}

document.getElementById("history-toggle").addEventListener("click", () => toggleFooterPanel("history"));

document.getElementById("activity-toggle").addEventListener("click", openActivity);

document.getElementById("activity-dialog-close").addEventListener("click", closeActivity);

document.getElementById("activity-dialog-backdrop").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeActivity();
});

document.getElementById("activity-prev").addEventListener("click", () => {
  stepActivityPeriod(-1);
});

document.getElementById("activity-next").addEventListener("click", () => {
  stepActivityPeriod(1);
});

document.querySelectorAll(".activity-view-button").forEach((button) => {
  button.addEventListener("click", () => {
    setActivityView(button.dataset.view);
  });
});

document.querySelectorAll(".activity-year-layout-button").forEach((button) => {
  button.addEventListener("click", () => {
    setActivityYearLayout(button.dataset.layout);
  });
});

// the year layout depends on the viewport width, so redraw when it changes
narrowViewport.addEventListener("change", () => {
  if (isActivityOpen()) refreshActivity();
});

document.getElementById("activity-filter").addEventListener("change", (e) => {
  setActivityTask(e.target.value);
});

document.addEventListener("keydown", (e) => {
  if (!isActivityOpen() || isIntroOpen()) return;

  if (e.key === "Escape") {
    e.preventDefault();
    closeActivity();
    return;
  }
  if (e.key !== "Tab") return;

  const dialog = document.getElementById("activity-dialog");
  const focusable = Array.from(
    dialog.querySelectorAll(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.closest("[hidden]"));
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!dialog.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

document.getElementById("settings-toggle").addEventListener("click", () => toggleFooterPanel("settings"));

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
  closeFooterPanels();
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
