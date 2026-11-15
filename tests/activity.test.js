import { loadApp, click, change } from "./helpers/dom.js";

function makeTask(id, createdAt, completions = [], extra = {}) {
  return {
    id,
    title: id,
    type: "daily",
    priority: "normal",
    createdAt,
    completed: false,
    completions,
    ...extra,
  };
}

function seed(tasks, options = {}) {
  return loadApp({
    storage: { version: 1, tasks, settings: { resetMinutes: 0, introSeen: true } },
    ...options,
  });
}

function dates(doc) {
  return Array.from(doc.querySelectorAll(".activity-cell[data-date]")).map(
    (cell) => cell.dataset.date
  );
}

function localePeriod(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// Monday-first short weekday names in the same locale the app uses.
const WEEKDAY_NAMES = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" })
);

function fullDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

describe("activity graph visibility", () => {
  it("hides the whole graph when there are no daily habits", () => {
    const empty = seed([]);
    expect(empty.window.document.getElementById("activity-details").hidden).toBe(true);

    const todayOnly = seed([makeTask("one-off", "2026-03-15", [], { type: "today" })]);
    expect(todayOnly.window.document.getElementById("activity-details").hidden).toBe(true);
  });

  it("shows a collapsed graph when daily habits exist", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const details = dom.window.document.getElementById("activity-details");

    expect(details.hidden).toBe(false);
    expect(details.open).toBe(false);
    expect(details.querySelector("summary").textContent).toBe("Activity graph");
  });
});

describe("single month view", () => {
  it("shows the current month with all seven weekday labels", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    const blocks = Array.from(doc.querySelectorAll("#activity-months .activity-month"));
    const period = doc.getElementById("activity-period-label");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].dataset.month).toBe("2026-03");
    expect(period.textContent).toBe(localePeriod(2026, 2));
    expect(period.getAttribute("aria-live")).toBe("polite");

    const weekdays = Array.from(blocks[0].querySelectorAll(".activity-weekday")).map(
      (label) => label.textContent
    );
    expect(weekdays).toEqual(WEEKDAY_NAMES);

    const graph = doc.getElementById("activity-months");
    expect(graph.getAttribute("role")).toBe("img");
    expect(graph.getAttribute("aria-label")).toBe(
      `Habit activity for ${localePeriod(2026, 2)}, all tasks. Darker squares mean more habits completed.`
    );
  });

  it("ends the current month yesterday and has no cell for today or any future date", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    const all = dates(doc);

    expect(all).toHaveLength(14);
    expect(all[0]).toBe("2026-03-01");
    expect(all.at(-1)).toBe("2026-03-14");
    expect(all).not.toContain("2026-03-15");
    expect(all.every((date) => date <= "2026-03-14")).toBe(true);
    expect(doc.querySelector('.activity-cell[data-date="2026-03-15"]')).toBeNull();
    expect(doc.querySelector(".activity-cell.is-out[data-date]")).toBeNull();
  });
});

describe("month navigation", () => {
  it("moves back to February, returns to March, and stops at the current month", () => {
    const dom = seed([makeTask("habit", "2025-01-01", ["2026-02-28"])]);
    const doc = dom.window.document;
    const prev = doc.getElementById("activity-prev");
    const next = doc.getElementById("activity-next");
    const period = doc.getElementById("activity-period-label");

    expect(prev.getAttribute("aria-label")).toBe("Previous month");
    expect(next.getAttribute("aria-label")).toBe("Next month");
    expect(period.textContent).toBe(localePeriod(2026, 2));
    expect(next.disabled).toBe(true);

    click(prev);
    expect(period.textContent).toBe(localePeriod(2026, 1));
    expect(next.disabled).toBe(false);
    expect(dates(doc)).toHaveLength(28);
    expect(dates(doc)[0]).toBe("2026-02-01");
    expect(dates(doc).at(-1)).toBe("2026-02-28");

    const lastDay = doc.querySelector('.activity-cell[data-date="2026-02-28"]');
    expect(lastDay.classList.contains("level-4")).toBe(true);
    expect(lastDay.title).toBe(`${fullDate(2026, 1, 28)}\nhabit`);

    click(next);
    expect(period.textContent).toBe(localePeriod(2026, 2));
    expect(next.disabled).toBe(true);
    expect(dates(doc)).toHaveLength(14);

    click(next);
    expect(period.textContent).toBe(localePeriod(2026, 2));
    expect(dates(doc)).toHaveLength(14);
  });

  it("crosses from January 2026 back to December 2025 and forward again", () => {
    const dom = seed([makeTask("habit", "2025-01-01")]);
    const doc = dom.window.document;
    const prev = doc.getElementById("activity-prev");
    const next = doc.getElementById("activity-next");
    const period = doc.getElementById("activity-period-label");

    click(prev);
    click(prev);
    expect(period.textContent).toBe(localePeriod(2026, 0));

    click(prev);
    expect(period.textContent).toBe(localePeriod(2025, 11));
    expect(next.disabled).toBe(false);
    expect(dates(doc)).toHaveLength(31);
    expect(dates(doc)[0]).toBe("2025-12-01");
    expect(dates(doc).at(-1)).toBe("2025-12-31");

    click(next);
    expect(period.textContent).toBe(localePeriod(2026, 0));
    expect(dates(doc)).toHaveLength(31);
    expect(dates(doc)[0]).toBe("2026-01-01");
    expect(dates(doc).at(-1)).toBe("2026-01-31");
  });
});

describe("intensity", () => {
  const habits = [
    makeTask("a", "2026-03-01", ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]),
    makeTask("b", "2026-03-01", ["2026-03-03", "2026-03-04", "2026-03-05"]),
    makeTask("c", "2026-03-01", ["2026-03-04", "2026-03-05"]),
    makeTask("d", "2026-03-01", ["2026-03-05"]),
  ];

  it("sets levels 0 through 4 from the completed share", () => {
    const dom = seed(habits);
    const doc = dom.window.document;
    const cell = (date) => doc.querySelector(`.activity-cell[data-date="${date}"]`);

    expect(cell("2026-03-01").classList.contains("level-0")).toBe(true);
    expect(cell("2026-03-02").classList.contains("level-1")).toBe(true);
    expect(cell("2026-03-03").classList.contains("level-2")).toBe(true);
    expect(cell("2026-03-04").classList.contains("level-3")).toBe(true);
    expect(cell("2026-03-05").classList.contains("level-4")).toBe(true);
  });

  it("counts only habits that existed on that day", () => {
    const dom = seed([makeTask("late", "2026-03-10", [], { title: "Late habit" })]);
    const doc = dom.window.document;
    const cell = (date) => doc.querySelector(`.activity-cell[data-date="${date}"]`);

    expect(cell("2026-03-05").classList.contains("level-0")).toBe(true);
    expect(cell("2026-03-05").title).toBe(`${fullDate(2026, 2, 5)}\nNo habits yet`);
    expect(cell("2026-03-12").title).toBe(
      `${fullDate(2026, 2, 12)}\nNo habits completed`
    );
  });
});

describe("hover details", () => {
  it("lists the completed habits under the exact full date", () => {
    const dom = seed([
      makeTask("read", "2026-03-01", ["2026-03-14"], { title: "Read 10 pages" }),
      makeTask("water", "2026-03-01", ["2026-03-14"], { title: "Drink water" }),
      makeTask("stretch", "2026-03-01", ["2026-03-14"], { title: "Stretch" }),
    ]);
    const doc = dom.window.document;
    const cell = doc.querySelector('.activity-cell[data-date="2026-03-14"]');

    expect(cell.title).toBe(
      `${fullDate(2026, 2, 14)}\nRead 10 pages\nDrink water\nStretch`
    );
  });

  it("says when nothing was done or when no habits existed yet", () => {
    const dom = seed([makeTask("read", "2026-03-10", [], { title: "Read 10 pages" })]);
    const doc = dom.window.document;
    const cell = (date) => doc.querySelector(`.activity-cell[data-date="${date}"]`);

    expect(cell("2026-03-12").title).toBe(
      `${fullDate(2026, 2, 12)}\nNo habits completed`
    );
    expect(cell("2026-03-05").title).toBe(`${fullDate(2026, 2, 5)}\nNo habits yet`);
  });
});

describe("task filter", () => {
  const tasks = [
    makeTask("read", "2026-03-05", ["2026-03-07", "2026-03-09"], {
      title: "Read 10 pages",
    }),
    makeTask("water", "2026-01-01", ["2026-03-04"], { title: "Drink water" }),
  ];

  it("offers all tasks plus every daily habit in a labelled select", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    const select = doc.getElementById("activity-task-filter");
    const label = doc.querySelector('label[for="activity-task-filter"]');

    expect(label.querySelector("span").textContent).toBe("Show");
    expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
      ["all", "All tasks"],
      ["read", "Read 10 pages"],
      ["water", "Drink water"],
    ]);
  });

  it("shows only the chosen habit, with done days at the strongest level", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    const select = doc.getElementById("activity-task-filter");
    const cell = (date) => doc.querySelector(`.activity-cell[data-date="${date}"]`);

    change(select, "read");

    expect(select.value).toBe("read");
    expect(dates(doc)[0]).toBe("2026-03-05");
    expect(dates(doc)).toHaveLength(10);
    expect(doc.querySelector('.activity-cell[data-date="2026-03-04"]')).toBeNull();
    expect(cell("2026-03-07").classList.contains("level-4")).toBe(true);
    expect(cell("2026-03-06").classList.contains("level-0")).toBe(true);
    expect(cell("2026-03-07").title).toBe(`${fullDate(2026, 2, 7)}\nRead 10 pages: Done`);
    expect(cell("2026-03-06").title).toBe(
      `${fullDate(2026, 2, 6)}\nRead 10 pages: Not done`
    );
    expect(doc.querySelector('.activity-cell[data-date="2026-03-15"]')).toBeNull();

    const graph = doc.getElementById("activity-months");
    expect(graph.getAttribute("aria-label")).toBe(
      `Habit activity for ${localePeriod(2026, 2)}, Read 10 pages. Filled squares mean it was done.`
    );
  });

  it("switches between the five-level and binary legends", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    const select = doc.getElementById("activity-task-filter");
    const allLegend = doc.getElementById("activity-legend-all");
    const taskLegend = doc.getElementById("activity-legend-task");

    expect(allLegend.hidden).toBe(false);
    expect(taskLegend.hidden).toBe(true);
    expect(allLegend.textContent).toContain("Less");
    expect(allLegend.textContent).toContain("More");
    expect(allLegend.querySelectorAll(".activity-swatch")).toHaveLength(5);

    change(select, "read");
    expect(allLegend.hidden).toBe(true);
    expect(taskLegend.hidden).toBe(false);
    expect(taskLegend.textContent).toContain("Not done");
    expect(taskLegend.textContent).toContain("Done");
    expect(taskLegend.querySelectorAll(".activity-swatch")).toHaveLength(2);

    change(select, "all");
    expect(allLegend.hidden).toBe(false);
    expect(taskLegend.hidden).toBe(true);
  });

  it("keeps the selection through month changes", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    const select = doc.getElementById("activity-task-filter");

    change(select, "read");
    click(doc.getElementById("activity-prev"));
    expect(doc.getElementById("activity-period-label").textContent).toBe(
      localePeriod(2026, 1)
    );
    expect(select.value).toBe("read");
    expect(doc.getElementById("activity-legend-task").hidden).toBe(false);
    expect(dates(doc)).toHaveLength(0);

    click(doc.getElementById("activity-next"));
    expect(doc.getElementById("activity-period-label").textContent).toBe(
      localePeriod(2026, 2)
    );
    expect(select.value).toBe("read");
    expect(dates(doc)).toHaveLength(10);
  });

  it("does not rebuild the select options or drop focus on a normal re-render", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    const select = doc.getElementById("activity-task-filter");

    change(select, "read");
    const firstOption = select.options[0];
    select.focus();
    dom.window.eval("render()");

    expect(select.value).toBe("read");
    expect(select.options[0]).toBe(firstOption);
    expect(doc.activeElement).toBe(select);
  });

  it("falls back to all tasks when the selected habit is deleted", () => {
    const dom = seed(tasks, { reducedMotion: true });
    const doc = dom.window.document;
    const select = doc.getElementById("activity-task-filter");

    change(select, "read");
    click(doc.querySelector('.task-row[data-id="read"] .task-delete'));

    expect(select.value).toBe("all");
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["all", "water"]);
    expect(doc.getElementById("activity-legend-all").hidden).toBe(false);
    expect(doc.getElementById("activity-legend-task").hidden).toBe(true);
  });
});

describe("graph structure", () => {
  it("uses plain spans for cells and keeps only the month arrows as buttons", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    const details = doc.getElementById("activity-details");
    const cells = Array.from(doc.querySelectorAll(".activity-cell"));

    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => cell.tagName === "SPAN")).toBe(true);
    const realCells = cells.filter((cell) => cell.dataset.date);
    expect(realCells.every((cell) => cell.title.includes("\n"))).toBe(true);
    expect(details.querySelectorAll(".activity-grid button")).toHaveLength(0);
    expect(details.querySelectorAll(".activity-month button")).toHaveLength(0);
    expect(details.querySelectorAll("button")).toHaveLength(2);
    expect(doc.querySelector(".activity-cell[tabindex]")).toBeNull();
  });
});
