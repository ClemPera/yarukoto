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

function monthLabels(doc) {
  return Array.from(doc.querySelectorAll("#activity-months .activity-month-label")).map(
    (label) => label.textContent
  );
}

function localeMonth(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: "long" });
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

describe("monthly layout", () => {
  it("renders January through the current month with all seven weekday labels", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    const blocks = Array.from(doc.querySelectorAll("#activity-months .activity-month"));

    expect(monthLabels(doc)).toEqual([
      localeMonth(2026, 0),
      localeMonth(2026, 1),
      localeMonth(2026, 2),
    ]);
    expect(blocks).toHaveLength(3);

    blocks.forEach((block) => {
      const weekdays = Array.from(block.querySelectorAll(".activity-weekday")).map(
        (label) => label.textContent
      );
      expect(weekdays).toEqual(WEEKDAY_NAMES);
    });

    const graph = doc.getElementById("activity-months");
    expect(graph.getAttribute("role")).toBe("img");
    expect(graph.getAttribute("aria-label")).toBe(
      "Habit activity for 2026, all tasks. Darker squares mean more habits completed."
    );
  });

  it("ends the current month yesterday and has no cell for today or any future date", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    const all = dates(doc);

    expect(all).toHaveLength(73);
    expect(all[0]).toBe("2026-01-01");
    expect(all.at(-1)).toBe("2026-03-14");
    expect(all).not.toContain("2026-03-15");
    expect(all.every((date) => date <= "2026-03-14")).toBe(true);
    expect(doc.querySelector('.activity-cell[data-date="2026-03-15"]')).toBeNull();
    expect(doc.querySelector(".activity-cell.is-out[data-date]")).toBeNull();
  });
});

describe("year navigation", () => {
  it("renders all twelve months of a past year, then returns to the current year", () => {
    const dom = seed([makeTask("habit", "2025-01-01", ["2025-12-31"])]);
    const doc = dom.window.document;
    const prev = doc.getElementById("activity-prev");
    const next = doc.getElementById("activity-next");
    const label = doc.getElementById("activity-year-label");

    expect(label.textContent).toBe("2026");
    expect(label.getAttribute("aria-live")).toBe("polite");
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);

    click(prev);
    expect(label.textContent).toBe("2025");
    expect(next.disabled).toBe(false);
    expect(monthLabels(doc)).toEqual(
      Array.from({ length: 12 }, (_, month) => localeMonth(2025, month))
    );
    expect(dates(doc)).toHaveLength(365);
    expect(dates(doc)[0]).toBe("2025-01-01");
    expect(dates(doc).at(-1)).toBe("2025-12-31");

    const lastDay = doc.querySelector('.activity-cell[data-date="2025-12-31"]');
    expect(lastDay.classList.contains("level-4")).toBe(true);
    expect(lastDay.title).toBe(`${fullDate(2025, 11, 31)}\nhabit`);

    click(next);
    expect(label.textContent).toBe("2026");
    expect(next.disabled).toBe(true);
    expect(monthLabels(doc)).toHaveLength(3);
    expect(dates(doc)).toHaveLength(73);
    expect(doc.querySelector('.activity-cell[data-date="2026-03-15"]')).toBeNull();
  });
});

describe("intensity", () => {
  const habits = [
    makeTask("a", "2026-02-01", ["2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05"]),
    makeTask("b", "2026-02-01", ["2026-02-03", "2026-02-04", "2026-02-05"]),
    makeTask("c", "2026-02-01", ["2026-02-04", "2026-02-05"]),
    makeTask("d", "2026-02-01", ["2026-02-05"]),
  ];

  it("sets levels 0 through 4 from the completed share", () => {
    const dom = seed(habits);
    const doc = dom.window.document;
    const cell = (date) => doc.querySelector(`.activity-cell[data-date="${date}"]`);

    expect(cell("2026-02-01").classList.contains("level-0")).toBe(true);
    expect(cell("2026-02-02").classList.contains("level-1")).toBe(true);
    expect(cell("2026-02-03").classList.contains("level-2")).toBe(true);
    expect(cell("2026-02-04").classList.contains("level-3")).toBe(true);
    expect(cell("2026-02-05").classList.contains("level-4")).toBe(true);
  });

  it("counts only habits that existed on that day", () => {
    const dom = seed(habits);
    const doc = dom.window.document;
    const cell = (date) => doc.querySelector(`.activity-cell[data-date="${date}"]`);

    expect(cell("2026-01-31").classList.contains("level-0")).toBe(true);
    expect(cell("2026-01-31").title).toBe(`${fullDate(2026, 0, 31)}\nNo habits yet`);
    expect(cell("2026-02-01").title).toBe(`${fullDate(2026, 1, 1)}\nNo habits completed`);
    expect(cell("2026-02-05").title).toBe(`${fullDate(2026, 1, 5)}\na\nb\nc\nd`);
  });
});

describe("hover details", () => {
  it("lists the completed habits under the exact full date", () => {
    const dom = seed([
      makeTask("read", "2026-01-01", ["2026-03-14"], { title: "Read 10 pages" }),
      makeTask("water", "2026-01-01", ["2026-03-14"], { title: "Drink water" }),
      makeTask("stretch", "2026-01-01", ["2026-03-14"], { title: "Stretch" }),
    ]);
    const doc = dom.window.document;
    const cell = doc.querySelector('.activity-cell[data-date="2026-03-14"]');

    expect(cell.title).toBe(
      `${fullDate(2026, 2, 14)}\nRead 10 pages\nDrink water\nStretch`
    );
  });

  it("says when nothing was done or when no habits existed yet", () => {
    const dom = seed([makeTask("read", "2026-03-01", [], { title: "Read 10 pages" })]);
    const doc = dom.window.document;
    const cell = (date) => doc.querySelector(`.activity-cell[data-date="${date}"]`);

    expect(cell("2026-03-10").title).toBe(
      `${fullDate(2026, 2, 10)}\nNo habits completed`
    );
    expect(cell("2026-02-28").title).toBe(`${fullDate(2026, 1, 28)}\nNo habits yet`);
  });
});

describe("task filter", () => {
  const tasks = [
    makeTask("read", "2026-02-01", ["2026-02-03", "2026-02-05"], {
      title: "Read 10 pages",
    }),
    makeTask("water", "2026-01-01", ["2026-02-04"], { title: "Drink water" }),
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
    expect(dates(doc)[0]).toBe("2026-02-01");
    expect(dates(doc)).toHaveLength(42);
    expect(doc.querySelector('.activity-cell[data-date="2026-01-31"]')).toBeNull();
    expect(cell("2026-02-03").classList.contains("level-4")).toBe(true);
    expect(cell("2026-02-04").classList.contains("level-0")).toBe(true);
    expect(cell("2026-02-03").title).toBe(`${fullDate(2026, 1, 3)}\nRead 10 pages: Done`);
    expect(cell("2026-02-04").title).toBe(
      `${fullDate(2026, 1, 4)}\nRead 10 pages: Not done`
    );
    expect(doc.querySelector('.activity-cell[data-date="2026-03-15"]')).toBeNull();

    const graph = doc.getElementById("activity-months");
    expect(graph.getAttribute("aria-label")).toBe(
      "Habit activity for 2026, Read 10 pages. Filled squares mean it was done."
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

  it("keeps the selection through year changes", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    const select = doc.getElementById("activity-task-filter");

    change(select, "read");
    click(doc.getElementById("activity-prev"));
    expect(doc.getElementById("activity-year-label").textContent).toBe("2025");
    expect(select.value).toBe("read");
    expect(doc.getElementById("activity-legend-task").hidden).toBe(false);

    click(doc.getElementById("activity-next"));
    expect(doc.getElementById("activity-year-label").textContent).toBe("2026");
    expect(select.value).toBe("read");
    expect(dates(doc)).toHaveLength(42);
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
  it("uses plain spans for cells and keeps only the year arrows as buttons", () => {
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
