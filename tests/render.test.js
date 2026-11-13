import { loadApp, getState, setEditingId } from "./helpers/dom.js";

function makeTask(id, title, type, priority, extra = {}) {
  return {
    id,
    title,
    type,
    priority,
    createdAt: "2026-03-15",
    completed: false,
    completions: [],
    ...extra,
  };
}

function seed(tasks, resetMinutes = 0) {
  return loadApp({ storage: { version: 1, tasks, settings: { resetMinutes } } });
}

function rowIds(listEl) {
  return Array.from(listEl.querySelectorAll(".task-row")).map((row) => row.dataset.id);
}

function localDateStr(offset) {
  const d = new Date(2026, 2, 15);
  d.setDate(d.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function localDate(offset) {
  return new Date(2026, 2, 15 + offset);
}

// Same options as the app, so locale differences do not break the assertions.
function historyDate(offset) {
  const date = localDate(offset);
  const options = { weekday: "short", month: "short", day: "numeric" };
  if (date.getFullYear() !== 2026) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}

function fullHistoryDate(offset) {
  return localDate(offset).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function axisDate(offset) {
  return localDate(offset).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

const HISTORY_OFFSETS = [-7, -6, -5, -4, -3, -2, -1];

describe("date header", () => {
  it("shows the fixed clock's date in the locale format", () => {
    const dom = loadApp();
    const expected = new Date(2026, 2, 15).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    expect(dom.window.document.getElementById("today-date").textContent).toBe(expected);
  });
});

describe("reset time input", () => {
  it("defaults to 00:00", () => {
    const dom = loadApp();
    expect(dom.window.document.getElementById("reset-time-input").value).toBe("00:00");
  });

  it("renders a seeded reset of 270 minutes as 04:30", () => {
    const dom = seed([], 270);
    expect(dom.window.document.getElementById("reset-time-input").value).toBe("04:30");
  });

  it("renders a seeded reset of 0 minutes as 00:00", () => {
    const dom = seed([], 0);
    expect(dom.window.document.getElementById("reset-time-input").value).toBe("00:00");
  });
});

describe("task lists", () => {
  const tasks = [
    makeTask("dn1", "Normal one", "daily", "normal"),
    makeTask("dh", "High one", "daily", "high"),
    makeTask("dl", "Low one", "daily", "low"),
    makeTask("dn2", "Normal two", "daily", "normal"),
    makeTask("th", "High today", "today", "high"),
    makeTask("tn", "Normal today", "today", "normal"),
    makeTask("tl", "Low today", "today", "low"),
    makeTask("tn2", "Normal today two", "today", "normal"),
  ];

  it("orders rows high -> normal -> low, stable within a priority", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    expect(rowIds(doc.getElementById("daily-list"))).toEqual(["dh", "dn1", "dn2", "dl"]);
    expect(rowIds(doc.getElementById("today-list"))).toEqual(["th", "tn", "tn2", "tl"]);
  });

  it("sets row classes, data attributes, glyphs, labels and text", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    const row = doc.querySelector('#daily-list [data-id="dh"]');

    expect(row.classList.contains("task-row")).toBe(true);
    expect(row.dataset.type).toBe("daily");

    const flag = row.querySelector(".task-priority");
    expect(flag.textContent).toBe("\u2191");
    expect(flag.dataset.priority).toBe("high");
    expect(flag.title).toBe("High priority (click to change)");
    expect(flag.getAttribute("aria-label")).toBe("Priority: High. Click to change.");

    expect(row.querySelector(".task-title").textContent).toBe("High one");
    expect(row.querySelector(".task-check").checked).toBe(false);
    expect(row.querySelector(".task-edit").getAttribute("aria-label")).toBe('Edit "High one"');
    expect(row.querySelector(".task-delete").getAttribute("aria-label")).toBe('Delete "High one"');
  });

  it("maps priority to the right glyph", () => {
    const dom = seed([
      makeTask("h", "H", "today", "high"),
      makeTask("n", "N", "today", "normal"),
      makeTask("l", "L", "today", "low"),
    ]);
    const doc = dom.window.document;
    const glyph = (id) => doc.querySelector(`#today-list [data-id="${id}"] .task-priority`).textContent;
    expect(glyph("h")).toBe("\u2191");
    expect(glyph("n")).toBe("=");
    expect(glyph("l")).toBe("\u2193");
  });

  it("checks the checkbox for done tasks only", () => {
    const dom = seed([
      makeTask("dd", "Done daily", "daily", "normal", { completions: ["2026-03-15"] }),
      makeTask("pd", "Pending daily", "daily", "normal"),
      makeTask("dt", "Done today", "today", "normal", {
        completed: true,
        completions: ["2026-03-15"],
      }),
    ]);
    const doc = dom.window.document;
    expect(doc.querySelector('#daily-list [data-id="dd"] .task-check').checked).toBe(true);
    expect(doc.querySelector('#daily-list [data-id="pd"] .task-check').checked).toBe(false);
    expect(doc.querySelector('#today-list [data-id="dt"] .task-check').checked).toBe(true);
  });
});

describe("pendingFirst", () => {
  it("renders done daily and today tasks after pending ones", () => {
    const dom = seed([
      makeTask("da", "Done A", "daily", "normal", { completions: ["2026-03-15"] }),
      makeTask("db", "Pending B", "daily", "normal"),
      makeTask("dc", "Done C", "daily", "normal", { completions: ["2026-03-15"] }),
      makeTask("dd", "Pending D", "daily", "normal"),
      makeTask("ta", "Done A", "today", "normal", { completed: true, completions: ["2026-03-15"] }),
      makeTask("tb", "Pending B", "today", "normal"),
      makeTask("tc", "Done C", "today", "normal", { completed: true, completions: ["2026-03-15"] }),
      makeTask("td", "Pending D", "today", "normal"),
    ]);
    const doc = dom.window.document;
    expect(rowIds(doc.getElementById("daily-list"))).toEqual(["db", "dd", "da", "dc"]);
    expect(rowIds(doc.getElementById("today-list"))).toEqual(["tb", "td", "ta", "tc"]);
  });
});

describe("today list filtering", () => {
  it("shows pending and today-completed tasks and hides tasks completed earlier", () => {
    const dom = seed([
      makeTask("pending", "Pending", "today", "normal"),
      makeTask("done-today", "Done today", "today", "normal", {
        completed: true,
        completions: ["2026-03-15"],
      }),
      makeTask("done-earlier", "Done earlier", "today", "normal", {
        completed: true,
        completions: ["2026-03-14"],
      }),
    ]);
    const doc = dom.window.document;

    expect(doc.querySelector('#today-list [data-id="pending"]')).not.toBeNull();
    expect(doc.querySelector('#today-list [data-id="done-today"]')).not.toBeNull();
    expect(doc.querySelector('[data-id="done-earlier"]')).toBeNull();
  });

  it("renders daily tasks regardless of completion date", () => {
    const dom = seed([
      makeTask("d-done", "Done", "daily", "normal", { completions: ["2026-03-14"] }),
      makeTask("d-pending", "Pending", "daily", "normal"),
    ]);
    const doc = dom.window.document;
    expect(doc.querySelector('#daily-list [data-id="d-done"]')).not.toBeNull();
    expect(doc.querySelector('#daily-list [data-id="d-pending"]')).not.toBeNull();
  });
});

describe("empty notes", () => {
  it("shows the empty note only when its list is empty", () => {
    const empty = seed([]);
    expect(empty.window.document.getElementById("daily-empty").hidden).toBe(false);
    expect(empty.window.document.getElementById("today-empty").hidden).toBe(false);

    const filled = seed([makeTask("d", "Daily task", "daily", "normal")]);
    expect(filled.window.document.getElementById("daily-empty").hidden).toBe(true);
    expect(filled.window.document.getElementById("today-empty").hidden).toBe(false);
  });
});

describe("all-done note", () => {
  it("stays hidden when there are no tasks", () => {
    const dom = seed([]);
    expect(dom.window.document.getElementById("all-done-note").hidden).toBe(true);
  });

  it("stays hidden while something is pending", () => {
    const dom = seed([
      makeTask("d", "Done daily", "daily", "normal", { completions: ["2026-03-15"] }),
      makeTask("t", "Pending today", "today", "normal"),
    ]);
    expect(dom.window.document.getElementById("all-done-note").hidden).toBe(true);
  });

  it("is visible when tasks exist and all daily + today are done", () => {
    const dom = seed([
      makeTask("d", "Done daily", "daily", "normal", { completions: ["2026-03-15"] }),
      makeTask("t", "Done today", "today", "normal", {
        completed: true,
        completions: ["2026-03-15"],
      }),
    ]);
    expect(dom.window.document.getElementById("all-done-note").hidden).toBe(false);
  });
});

describe("daily history", () => {
  it("renders seven dots per daily task for the week ending yesterday, in priority order", () => {
    const dom = seed([
      makeTask("h", "High habit", "daily", "high", {
        completions: ["2026-03-10", "2026-03-15", "2026-02-01"],
      }),
      makeTask("n", "Normal habit", "daily", "normal", { completions: ["2026-03-08"] }),
    ]);
    const doc = dom.window.document;
    const wrappers = Array.from(doc.querySelectorAll("#history-daily .habit-history"));
    expect(wrappers).toHaveLength(2);
    expect(wrappers.map((w) => w.querySelector(".habit-history-title").textContent)).toEqual([
      "High habit",
      "Normal habit",
    ]);

    const days = HISTORY_OFFSETS.map(localDateStr);
    expect(days[0]).toBe("2026-03-08");
    expect(days[6]).toBe("2026-03-14");

    const highDots = Array.from(wrappers[0].querySelectorAll(".habit-dot"));
    const normalDots = Array.from(wrappers[1].querySelectorAll(".habit-dot"));
    expect(highDots).toHaveLength(7);
    expect(normalDots).toHaveLength(7);

    highDots.forEach((dot, i) => {
      expect(dot.dataset.date).toBe(days[i]);
      expect(dot.title).toBe(historyDate(HISTORY_OFFSETS[i]));
      expect(dot.classList.contains("done")).toBe(days[i] === "2026-03-10");
    });
    expect(wrappers[0].querySelectorAll(".habit-dot.done")).toHaveLength(1);

    normalDots.forEach((dot, i) => {
      expect(dot.classList.contains("done")).toBe(days[i] === "2026-03-08");
    });
    expect(wrappers[1].querySelectorAll(".habit-dot.done")).toHaveLength(1);
  });

  it("renders one seven-label axis above the dots with no today", () => {
    const dom = seed([
      makeTask("d", "Habit", "daily", "normal"),
      makeTask("e", "Other habit", "daily", "low"),
    ]);
    const doc = dom.window.document;
    const axis = doc.querySelector("#history-daily .habit-axis");

    expect(axis).not.toBeNull();
    expect(doc.querySelectorAll("#history-daily .habit-axis")).toHaveLength(1);
    expect(axis.getAttribute("aria-hidden")).toBe("true");
    const labels = Array.from(axis.children).map((label) => label.textContent);
    expect(labels).toEqual(HISTORY_OFFSETS.map(axisDate));
    expect(axis.nextElementSibling.classList.contains("habit-history")).toBe(true);
    expect(labels).not.toContain(axisDate(0));
  });

  it("keeps today and the day before the window out of every habit's dots", () => {
    const dom = seed([
      makeTask("a", "A", "daily", "normal", { completions: ["2026-03-15"] }),
      makeTask("b", "B", "daily", "normal"),
    ]);
    const doc = dom.window.document;
    const dates = Array.from(doc.querySelectorAll("#history-daily .habit-dot")).map(
      (dot) => dot.dataset.date
    );

    expect(dates).toHaveLength(14);
    expect(dates).not.toContain("2026-03-15");
    expect(dates).not.toContain("2026-03-07");
    expect(doc.querySelectorAll('#history-daily .habit-dot[aria-pressed="true"]')).toHaveLength(0);
  });

  it("marks yesterday's dot done and ignores a completion made today", () => {
    const dom = seed([
      makeTask("h", "Habit", "daily", "normal", {
        completions: ["2026-03-14", "2026-03-15"],
      }),
    ]);
    const doc = dom.window.document;
    const yesterday = doc.querySelector('#history-daily .habit-dot[data-date="2026-03-14"]');

    expect(yesterday.classList.contains("done")).toBe(true);
    expect(doc.querySelector('#history-daily .habit-dot[data-date="2026-03-15"]')).toBeNull();
    expect(doc.querySelectorAll("#history-daily .habit-dot.done")).toHaveLength(1);
  });

  it("renders dots as buttons with friendly titles and full-date labels", () => {
    const dom = seed([
      makeTask("h", "Read 10 pages", "daily", "high", { completions: ["2026-03-14"] }),
    ]);
    const doc = dom.window.document;
    const done = doc.querySelector('#history-daily .habit-dot[data-date="2026-03-14"]');
    const undone = doc.querySelector('#history-daily .habit-dot[data-date="2026-03-13"]');

    expect(done.tagName).toBe("BUTTON");
    expect(done.type).toBe("button");
    expect(done.getAttribute("aria-pressed")).toBe("true");
    expect(done.title).toBe(historyDate(-1));
    expect(done.getAttribute("aria-label")).toBe(
      `Unmark Read 10 pages done for ${fullHistoryDate(-1)}`
    );

    expect(undone.getAttribute("aria-pressed")).toBe("false");
    expect(undone.getAttribute("aria-label")).toBe(
      `Mark Read 10 pages done for ${fullHistoryDate(-2)}`
    );
  });

  it("hides the daily block with no daily habits but still renders Completed", () => {
    const withDaily = seed([makeTask("d", "Habit", "daily", "normal")]);
    const doc = withDaily.window.document;
    expect(doc.getElementById("history-daily-block").hidden).toBe(false);
    expect(doc.querySelector("#history-daily-block h3").textContent).toBe("Last 7 days");

    const withoutDaily = seed([
      makeTask("t", "Done earlier", "today", "normal", {
        completed: true,
        completions: ["2026-03-14"],
      }),
    ]);
    const doc2 = withoutDaily.window.document;
    expect(doc2.getElementById("history-daily-block").hidden).toBe(true);
    expect(doc2.querySelector("#history-daily .habit-axis")).toBeNull();
    expect(doc2.querySelectorAll("#history-today li")).toHaveLength(1);
  });
});

describe("completed history list", () => {
  it("lists one-off tasks completed before today, newest first", () => {
    const dom = seed([
      makeTask("old", "Older done", "today", "normal", {
        completed: true,
        completions: ["2026-03-10"],
      }),
      makeTask("new", "Newest done", "today", "normal", {
        completed: true,
        completions: ["2026-03-14"],
      }),
      makeTask("multi", "Finished earlier", "today", "normal", {
        completed: true,
        completions: ["2026-03-09", "2026-03-12"],
      }),
      makeTask("today-done", "Done today", "today", "normal", {
        completed: true,
        completions: ["2026-03-15"],
      }),
      makeTask("today-after-old", "Done today after an earlier day", "today", "normal", {
        completed: true,
        completions: ["2026-03-10", "2026-03-15"],
      }),
      makeTask("pending", "Still pending", "today", "normal"),
      makeTask("daily", "Daily done", "daily", "normal", { completions: ["2026-03-15"] }),
    ]);
    const doc = dom.window.document;
    const items = Array.from(doc.querySelectorAll("#history-today li"));

    expect(items.map((li) => li.firstElementChild.textContent)).toEqual([
      "Newest done",
      "Finished earlier",
      "Older done",
    ]);

    const expected = [
      [-1, "2026-03-14"],
      [-3, "2026-03-12"],
      [-5, "2026-03-10"],
    ];
    items.forEach((li, i) => {
      const date = li.querySelector(".history-date");
      expect(date.tagName).toBe("TIME");
      expect(date.dateTime).toBe(expected[i][1]);
      expect(date.textContent).toBe(historyDate(expected[i][0]));
    });
    expect(doc.getElementById("history-empty").hidden).toBe(true);
  });

  it("includes the year in visible dates from another year", () => {
    const dom = seed([
      makeTask("old", "Last year", "today", "normal", {
        completed: true,
        completions: ["2025-12-31"],
      }),
    ]);
    const doc = dom.window.document;
    const date = doc.querySelector("#history-today li .history-date");
    const expected = new Date(2025, 11, 31).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    expect(date.textContent).toBe(expected);
    expect(date.textContent).toContain("2025");
    expect(date.dateTime).toBe("2025-12-31");
  });

  it("shows the empty note when nothing was completed before today", () => {
    const dom = seed([
      makeTask("today-done", "Done today", "today", "normal", {
        completed: true,
        completions: ["2026-03-15"],
      }),
    ]);
    const doc = dom.window.document;
    expect(doc.querySelectorAll("#history-today li")).toHaveLength(0);
    expect(doc.getElementById("history-empty").hidden).toBe(false);
    expect(doc.getElementById("history-empty").textContent).toBe("Nothing completed before today.");

    const filled = seed([
      makeTask("earlier", "Done earlier", "today", "normal", {
        completed: true,
        completions: ["2026-03-14"],
      }),
    ]);
    expect(filled.window.document.getElementById("history-empty").hidden).toBe(true);
  });
});

describe("row enter animation class", () => {
  it("marks a newly added row and clears the mark on the next render", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    dom.window.addTask("Fresh task", "today");
    const id = getState(dom).tasks.at(-1).id;
    const row = doc.querySelector(`#today-list [data-id="${id}"]`);

    expect(row.classList.contains("row-enter")).toBe(true);

    dom.window.render();
    const rerendered = doc.querySelector(`#today-list [data-id="${id}"]`);
    expect(rerendered.classList.contains("row-enter")).toBe(false);
  });
});

describe("edit row", () => {
  it("renders an editable row for the editing task", () => {
    const dom = seed([makeTask("edit-me", "Editable title", "daily", "normal")]);
    const doc = dom.window.document;
    setEditingId(dom, "edit-me");
    dom.window.render();

    const row = doc.querySelector("#daily-list .task-row-editing");
    expect(row).not.toBeNull();
    const form = row.querySelector(".edit-form");
    expect(form).not.toBeNull();

    const input = form.querySelector(".edit-title-input");
    expect(input.value).toBe("Editable title");
    expect(input.maxLength).toBe(120);
    expect(input.required).toBe(true);

    const radios = Array.from(form.querySelectorAll('input[type="radio"]'));
    expect(radios.length).toBe(2);
    expect(radios.map((r) => r.name)).toEqual(["edit-type-edit-me", "edit-type-edit-me"]);
    expect(radios.map((r) => r.value)).toEqual(["daily", "today"]);
    const checked = radios.filter((r) => r.checked);
    expect(checked.length).toBe(1);
    expect(checked[0].value).toBe("daily");

    const buttons = Array.from(form.querySelectorAll(".edit-actions button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["Save", "Cancel"]);
    expect(buttons[0].type).toBe("submit");

    expect(doc.activeElement).toBe(input);
  });

  it("checks the today radio when the task is a today task", () => {
    const dom = seed([makeTask("t", "Today title", "today", "normal")]);
    setEditingId(dom, "t");
    dom.window.render();
    const checked = dom.window.document.querySelector('#today-list .edit-form input[type="radio"]:checked');
    expect(checked.value).toBe("today");
  });
});

describe("makeTaskRow attributes", () => {
  it("sets priority, edit and delete labels", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const task = makeTask("x", "Some task", "today", "normal");
    const row = dom.window.makeTaskRow(task, { onToggle: () => {}, onCheck: () => false });

    expect(row.querySelector(".task-priority").getAttribute("aria-label")).toBe(
      "Priority: Normal. Click to change."
    );
    expect(row.querySelector(".task-edit").getAttribute("aria-label")).toBe('Edit "Some task"');
    expect(row.querySelector(".task-delete").getAttribute("aria-label")).toBe('Delete "Some task"');
  });
});
