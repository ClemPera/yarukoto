import { loadApp, click, change, keydown, runDueTimers, setNow } from "./helpers/dom.js";

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

const toggle = (doc) => doc.getElementById("activity-toggle");
const backdrop = (doc) => doc.getElementById("activity-dialog-backdrop");
const dialog = (doc) => doc.getElementById("activity-dialog");
const graph = (doc) => doc.getElementById("activity-graph");

function open(doc) {
  toggle(doc).focus();
  click(toggle(doc));
}

function dates(doc) {
  return Array.from(doc.querySelectorAll("#activity-graph .activity-cell[data-date]")).map(
    (cell) => cell.dataset.date
  );
}

function setView(doc, view) {
  click(doc.querySelector(`.activity-view-button[data-view="${view}"]`));
}

function cell(doc, date) {
  return doc.querySelector(`#activity-graph .activity-cell[data-date="${date}"]`);
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

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2024, i, 1).toLocaleDateString(undefined, { month: "short" })
);

function fullDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

describe("activity entry point", () => {
  it("hides the footer link when there are no daily habits", () => {
    const empty = seed([]);
    expect(toggle(empty.window.document).hidden).toBe(true);

    const todayOnly = seed([makeTask("one-off", "2026-03-15", [], { type: "today" })]);
    expect(toggle(todayOnly.window.document).hidden).toBe(true);
  });

  it("shows the footer link when at least one daily habit exists", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    const link = toggle(doc);

    expect(link.hidden).toBe(false);
    expect(link.textContent).toBe("activity");
    expect(link.getAttribute("aria-haspopup")).toBe("dialog");
    expect(link.getAttribute("aria-controls")).toBe("activity-dialog");
    expect(link.getAttribute("aria-expanded")).toBe("false");
  });

  it("starts closed and only renders a graph after opening", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;

    expect(backdrop(doc).hidden).toBe(true);
    expect(toggle(doc).getAttribute("aria-expanded")).toBe("false");
    expect(graph(doc).children).toHaveLength(0);
  });
});

describe("dialog", () => {
  it("opens on Year by default with a labelled modal", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    open(doc);

    expect(backdrop(doc).hidden).toBe(false);
    expect(toggle(doc).getAttribute("aria-expanded")).toBe("true");
    expect(dialog(doc).getAttribute("role")).toBe("dialog");
    expect(dialog(doc).getAttribute("aria-modal")).toBe("true");
    expect(dialog(doc).getAttribute("aria-labelledby")).toBe("activity-dialog-title");
    expect(doc.getElementById("activity-dialog-title").textContent).toBe("Activity");

    expect(doc.querySelector('.activity-view-button[data-view="month"]').getAttribute("aria-pressed")).toBe("false");
    expect(doc.querySelector('.activity-view-button[data-view="year"]').getAttribute("aria-pressed")).toBe("true");
    expect(doc.getElementById("activity-period-label").textContent).toBe("2026");
    expect(doc.getElementById("activity-period-label").getAttribute("aria-live")).toBe("polite");

    const grid = doc.querySelector("#activity-graph .activity-year-grid");
    expect(grid).not.toBeNull();
    expect(doc.querySelector("#activity-graph .activity-grid")).toBeNull();
    expect(grid.dataset.weeks).toBe("53");
    expect(grid.querySelectorAll(".activity-year-weekdays .activity-weekday")).toHaveLength(7);
    expect(grid.querySelectorAll(".activity-year-month")).toHaveLength(12);

    expect(doc.activeElement).toBe(doc.getElementById("activity-dialog-close"));
    expect(doc.getElementById("activity-dialog-close").getAttribute("aria-label")).toBe("Close activity");
  });

  it("switches between Month and Year while keeping the filter and year", () => {
    const tasks = [
      makeTask("read", "2024-01-01", [], { title: "Read 10 pages" }),
      makeTask("water", "2024-01-01", [], { title: "Drink water" }),
    ];
    const dom = seed(tasks);
    const doc = dom.window.document;
    open(doc);

    change(doc.getElementById("activity-filter"), "read");
    click(doc.getElementById("activity-prev"));
    expect(doc.getElementById("activity-period-label").textContent).toBe("2025");

    setView(doc, "month");
    expect(doc.getElementById("activity-period-label").textContent).toBe(localePeriod(2025, 2));
    expect(doc.getElementById("activity-filter").value).toBe("read");
    expect(doc.querySelector("#activity-graph .activity-grid")).not.toBeNull();
    expect(doc.querySelector("#activity-graph .activity-year-grid")).toBeNull();
    expect(doc.getElementById("activity-next").disabled).toBe(false);

    setView(doc, "year");
    expect(doc.getElementById("activity-period-label").textContent).toBe("2025");
    expect(doc.getElementById("activity-filter").value).toBe("read");
    expect(doc.querySelector("#activity-graph .activity-year-grid")).not.toBeNull();
  });

  it("closes with the close button, Escape, and a backdrop click", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;

    open(doc);
    click(doc.getElementById("activity-dialog-close"));
    expect(backdrop(doc).hidden).toBe(true);
    expect(toggle(doc).getAttribute("aria-expanded")).toBe("false");
    expect(doc.activeElement).toBe(toggle(doc));

    click(toggle(doc));
    keydown(doc.body, "Escape");
    expect(backdrop(doc).hidden).toBe(true);
    expect(doc.activeElement).toBe(toggle(doc));

    click(toggle(doc));
    click(backdrop(doc));
    expect(backdrop(doc).hidden).toBe(true);
    expect(doc.activeElement).toBe(toggle(doc));

    click(toggle(doc));
    click(doc.querySelector("#activity-dialog .activity-dialog-toolbar"));
    expect(backdrop(doc).hidden).toBe(false);
  });

  it("keeps Tab inside the dialog", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    open(doc);

    const close = doc.getElementById("activity-dialog-close");
    const prev = doc.getElementById("activity-prev");
    expect(doc.activeElement).toBe(close);

    keydown(close, "Tab", { shiftKey: true });
    expect(doc.activeElement).toBe(prev);

    keydown(prev, "Tab");
    expect(doc.activeElement).toBe(close);
  });

  it("locks page scrolling while open and restores the previous value", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    doc.body.style.overflow = "scroll";

    open(doc);
    expect(doc.body.style.overflow).toBe("hidden");

    click(doc.getElementById("activity-dialog-close"));
    expect(doc.body.style.overflow).toBe("scroll");
  });
});

describe("month view", () => {
  it("renders the transposed week grid directly in the graph", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    open(doc);
    setView(doc, "month");

    const grid = doc.querySelector("#activity-graph .activity-grid");
    const period = doc.getElementById("activity-period-label");

    expect(grid).not.toBeNull();
    expect(doc.querySelector("#activity-graph .activity-year-grid")).toBeNull();
    expect(grid.dataset.month).toBe("2026-03");
    expect(period.textContent).toBe(localePeriod(2026, 2));
    expect(doc.getElementById("activity-next").disabled).toBe(true);
    expect(doc.getElementById("activity-prev").getAttribute("aria-label")).toBe("Previous month");
    expect(doc.getElementById("activity-next").getAttribute("aria-label")).toBe("Next month");

    const weekdays = Array.from(grid.querySelectorAll(".activity-weekday")).map(
      (label) => label.textContent
    );
    expect(weekdays).toEqual(WEEKDAY_NAMES);

    expect(graph(doc).getAttribute("role")).toBe("img");
    expect(graph(doc).getAttribute("aria-label")).toBe(
      `Habit activity for ${localePeriod(2026, 2)}, all tasks. Darker squares mean more habits completed.`
    );
  });

  it("is Monday-first and ends the current month yesterday", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    open(doc);
    setView(doc, "month");

    const cells = Array.from(doc.querySelectorAll("#activity-graph .activity-grid .activity-cell"));
    const all = dates(doc);

    expect(cells).toHaveLength(42);
    expect(cells[0].classList.contains("is-out")).toBe(true);
    expect(cells[6].dataset.date).toBe("2026-03-01");
    expect(cells[7].dataset.date).toBe("2026-03-02");

    expect(all).toHaveLength(14);
    expect(all[0]).toBe("2026-03-01");
    expect(all.at(-1)).toBe("2026-03-14");
    expect(all).not.toContain("2026-03-15");
    expect(cell(doc, "2026-03-15")).toBeNull();
    expect(doc.querySelector(".activity-cell.is-out[data-date]")).toBeNull();
  });

  it("moves between months and stops at the current month", () => {
    const dom = seed([makeTask("habit", "2025-01-01", ["2026-02-28"])]);
    const doc = dom.window.document;
    const prev = doc.getElementById("activity-prev");
    const next = doc.getElementById("activity-next");
    const period = doc.getElementById("activity-period-label");
    open(doc);
    setView(doc, "month");

    expect(next.disabled).toBe(true);

    click(prev);
    expect(period.textContent).toBe(localePeriod(2026, 1));
    expect(next.disabled).toBe(false);
    expect(dates(doc)).toHaveLength(28);
    expect(dates(doc)[0]).toBe("2026-02-01");
    expect(dates(doc).at(-1)).toBe("2026-02-28");

    const lastDay = cell(doc, "2026-02-28");
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
    open(doc);
    setView(doc, "month");

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

describe("year view", () => {
  it("renders one continuous year grid with every weekday and all twelve months", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    open(doc);

    const grid = doc.querySelector("#activity-graph .activity-year-grid");
    expect(grid).not.toBeNull();
    expect(grid.dataset.year).toBe("2026");
    expect(grid.dataset.weeks).toBe("53");
    expect(grid.style.getPropertyValue("--year-weeks")).toBe("53");
    expect(doc.querySelector(".activity-year-scroll")).toBeNull();

    const weekdays = Array.from(grid.querySelectorAll(".activity-year-weekdays .activity-weekday")).map(
      (label) => label.textContent
    );
    expect(weekdays).toEqual(WEEKDAY_NAMES);

    const months = Array.from(grid.querySelectorAll(".activity-year-month")).map(
      (label) => label.textContent
    );
    expect(months).toEqual(MONTH_NAMES);

    const january = grid.querySelector(".activity-year-month");
    expect(january.style.gridColumn).toBe("2 / span 5");
    expect(january.style.gridRow).toBe("1");

    expect(graph(doc).getAttribute("aria-label")).toBe(
      "Habit activity for 2026, all tasks. Darker squares mean more habits completed."
    );
    expect(doc.getElementById("activity-prev").getAttribute("aria-label")).toBe("Previous year");
    expect(doc.getElementById("activity-next").getAttribute("aria-label")).toBe("Next year");
    expect(doc.getElementById("activity-next").disabled).toBe(true);
  });

  it("ends the current year yesterday and leaves today and later without cells", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    open(doc);

    const all = dates(doc);
    expect(all).toHaveLength(73);
    expect(all[0]).toBe("2026-01-01");
    expect(all.at(-1)).toBe("2026-03-14");
    expect(all).not.toContain("2026-03-15");
    expect(cell(doc, "2026-03-15")).toBeNull();
    expect(doc.querySelector(".activity-cell.is-out[data-date]")).toBeNull();
    expect(doc.querySelectorAll("#activity-graph .activity-cell")).toHaveLength(53 * 7);
  });

  it("renders a full past year and steps years with the arrows", () => {
    const dom = seed([makeTask("habit", "2024-01-01", ["2025-12-31"])]);
    const doc = dom.window.document;
    const prev = doc.getElementById("activity-prev");
    const next = doc.getElementById("activity-next");
    const period = doc.getElementById("activity-period-label");
    open(doc);

    click(prev);
    expect(period.textContent).toBe("2025");
    expect(next.disabled).toBe(false);
    expect(dates(doc)).toHaveLength(365);
    expect(dates(doc)[0]).toBe("2025-01-01");
    expect(dates(doc).at(-1)).toBe("2025-12-31");
    expect(cell(doc, "2025-12-31").classList.contains("level-4")).toBe(true);

    click(next);
    expect(period.textContent).toBe("2026");
    expect(next.disabled).toBe(true);
    expect(dates(doc)).toHaveLength(73);

    click(next);
    expect(period.textContent).toBe("2026");
    expect(dates(doc)).toHaveLength(73);
  });

  it("uses 54 week columns for a year that needs them", () => {
    const dom = seed([makeTask("habit", "2011-01-01")]);
    const doc = dom.window.document;
    const prev = doc.getElementById("activity-prev");
    open(doc);

    for (let i = 0; i < 14; i++) click(prev);

    const grid = doc.querySelector("#activity-graph .activity-year-grid");
    expect(doc.getElementById("activity-period-label").textContent).toBe("2012");
    expect(grid.dataset.weeks).toBe("54");
    expect(dates(doc)).toHaveLength(366);
    expect(dates(doc)[0]).toBe("2012-01-01");
    expect(dates(doc).at(-1)).toBe("2012-12-31");
  });
});

describe("view switching", () => {
  it("keeps the same month number when going back to a past year", () => {
    const dom = seed([makeTask("habit", "2024-01-01")]);
    const doc = dom.window.document;
    const period = doc.getElementById("activity-period-label");
    open(doc);

    click(doc.getElementById("activity-prev"));
    expect(period.textContent).toBe("2025");

    setView(doc, "month");
    expect(period.textContent).toBe(localePeriod(2025, 2));
    expect(dates(doc)).toHaveLength(31);
    expect(dates(doc)[0]).toBe("2025-03-01");
    expect(dates(doc).at(-1)).toBe("2025-03-31");
    expect(doc.getElementById("activity-next").disabled).toBe(false);
  });

  it("clamps to the current month when the old month would be in the future", () => {
    const dom = seed([makeTask("habit", "2024-01-01")]);
    const doc = dom.window.document;
    const period = doc.getElementById("activity-period-label");
    const prev = doc.getElementById("activity-prev");
    const next = doc.getElementById("activity-next");
    open(doc);
    setView(doc, "month");

    click(prev);
    click(prev);
    click(prev);
    expect(period.textContent).toBe(localePeriod(2025, 11));

    setView(doc, "year");
    expect(period.textContent).toBe("2025");
    click(next);
    expect(period.textContent).toBe("2026");

    setView(doc, "month");
    expect(period.textContent).toBe(localePeriod(2026, 2));
    expect(next.disabled).toBe(true);
    expect(dates(doc)).toHaveLength(14);
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
    open(doc);
    setView(doc, "month");

    expect(cell(doc, "2026-03-01").classList.contains("level-0")).toBe(true);
    expect(cell(doc, "2026-03-02").classList.contains("level-1")).toBe(true);
    expect(cell(doc, "2026-03-03").classList.contains("level-2")).toBe(true);
    expect(cell(doc, "2026-03-04").classList.contains("level-3")).toBe(true);
    expect(cell(doc, "2026-03-05").classList.contains("level-4")).toBe(true);
  });

  it("counts only habits that existed on that day", () => {
    const dom = seed([makeTask("late", "2026-03-10", [], { title: "Late habit" })]);
    const doc = dom.window.document;
    open(doc);
    setView(doc, "month");

    expect(cell(doc, "2026-03-05").classList.contains("level-0")).toBe(true);
    expect(cell(doc, "2026-03-05").title).toBe(`${fullDate(2026, 2, 5)}\nNo habits yet`);
    expect(cell(doc, "2026-03-12").title).toBe(
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
    open(doc);
    setView(doc, "month");

    expect(cell(doc, "2026-03-14").title).toBe(
      `${fullDate(2026, 2, 14)}\nRead 10 pages\nDrink water\nStretch`
    );
  });

  it("says when nothing was done or when no habits existed yet", () => {
    const dom = seed([makeTask("read", "2026-03-10", [], { title: "Read 10 pages" })]);
    const doc = dom.window.document;
    open(doc);
    setView(doc, "month");

    expect(cell(doc, "2026-03-12").title).toBe(
      `${fullDate(2026, 2, 12)}\nNo habits completed`
    );
    expect(cell(doc, "2026-03-05").title).toBe(`${fullDate(2026, 2, 5)}\nNo habits yet`);
  });

  it("keeps the multi-line details in the year grid", () => {
    const dom = seed([
      makeTask("read", "2024-01-01", ["2026-01-05"], { title: "Read 10 pages" }),
      makeTask("water", "2024-01-01", ["2026-01-05"], { title: "Drink water" }),
    ]);
    const doc = dom.window.document;
    open(doc);

    expect(cell(doc, "2026-01-05").title).toBe(
      `${fullDate(2026, 0, 5)}\nRead 10 pages\nDrink water`
    );
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
    open(doc);
    const select = doc.getElementById("activity-filter");
    const label = doc.querySelector('label[for="activity-filter"]');

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
    open(doc);
    setView(doc, "month");
    const select = doc.getElementById("activity-filter");

    change(select, "read");

    expect(select.value).toBe("read");
    expect(dates(doc)[0]).toBe("2026-03-05");
    expect(dates(doc)).toHaveLength(10);
    expect(cell(doc, "2026-03-04")).toBeNull();
    expect(cell(doc, "2026-03-07").classList.contains("level-4")).toBe(true);
    expect(cell(doc, "2026-03-06").classList.contains("level-0")).toBe(true);
    expect(cell(doc, "2026-03-07").title).toBe(`${fullDate(2026, 2, 7)}\nRead 10 pages: Done`);
    expect(cell(doc, "2026-03-06").title).toBe(
      `${fullDate(2026, 2, 6)}\nRead 10 pages: Not done`
    );
    expect(cell(doc, "2026-03-15")).toBeNull();

    expect(graph(doc).getAttribute("aria-label")).toBe(
      `Habit activity for ${localePeriod(2026, 2)}, Read 10 pages. Filled squares mean it was done.`
    );
  });

  it("applies to the year grid and survives a view change", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    open(doc);
    const select = doc.getElementById("activity-filter");

    change(select, "read");

    expect(select.value).toBe("read");
    expect(dates(doc)[0]).toBe("2026-03-05");
    expect(dates(doc)).toHaveLength(10);
    expect(cell(doc, "2026-03-04")).toBeNull();
    expect(cell(doc, "2026-03-07").classList.contains("level-4")).toBe(true);
    expect(cell(doc, "2026-03-07").title).toBe(`${fullDate(2026, 2, 7)}\nRead 10 pages: Done`);
    expect(doc.getElementById("activity-legend-all").hidden).toBe(true);
    expect(doc.getElementById("activity-legend-task").hidden).toBe(false);
    expect(graph(doc).getAttribute("aria-label")).toBe(
      "Habit activity for 2026, Read 10 pages. Filled squares mean it was done."
    );

    setView(doc, "month");
    expect(select.value).toBe("read");
    expect(doc.getElementById("activity-period-label").textContent).toBe(localePeriod(2026, 2));
    expect(dates(doc)).toHaveLength(10);
    expect(doc.getElementById("activity-legend-task").hidden).toBe(false);

    setView(doc, "year");
    expect(select.value).toBe("read");
    expect(dates(doc)).toHaveLength(10);
  });

  it("switches between the five-level and binary legends", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    open(doc);
    const select = doc.getElementById("activity-filter");
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

  it("keeps the selection through period changes", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    open(doc);
    setView(doc, "month");
    const select = doc.getElementById("activity-filter");

    change(select, "read");
    click(doc.getElementById("activity-prev"));
    expect(doc.getElementById("activity-period-label").textContent).toBe(
      localePeriod(2026, 1)
    );
    expect(select.value).toBe("read");
    expect(doc.getElementById("activity-legend-task").hidden).toBe(false);
    expect(dates(doc)).toHaveLength(0);

    setView(doc, "year");
    expect(select.value).toBe("read");
    expect(dates(doc)).toHaveLength(10);
  });

  it("does not rebuild the select options or drop focus on a normal re-render", () => {
    const dom = seed(tasks);
    const doc = dom.window.document;
    open(doc);
    const select = doc.getElementById("activity-filter");

    change(select, "read");
    const firstOption = select.options[0];
    select.focus();
    dom.window.eval("render()");

    expect(select.value).toBe("read");
    expect(select.options[0]).toBe(firstOption);
    expect(doc.activeElement).toBe(select);
    expect(backdrop(doc).hidden).toBe(false);
  });

  it("falls back to all tasks when the selected habit is deleted", () => {
    const dom = seed(tasks, { reducedMotion: true });
    const doc = dom.window.document;
    open(doc);
    const select = doc.getElementById("activity-filter");

    change(select, "read");
    click(doc.querySelector('.task-row[data-id="read"] .task-delete'));

    expect(select.value).toBe("all");
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["all", "water"]);
    expect(doc.getElementById("activity-legend-all").hidden).toBe(false);
    expect(doc.getElementById("activity-legend-task").hidden).toBe(true);
    expect(backdrop(doc).hidden).toBe(false);
  });

  it("closes the dialog and hides the footer link when the last daily habit is deleted", () => {
    const dom = seed([makeTask("habit", "2026-01-01")], { reducedMotion: true });
    const doc = dom.window.document;
    open(doc);

    click(doc.querySelector('.task-row[data-id="habit"] .task-delete'));

    expect(backdrop(doc).hidden).toBe(true);
    expect(toggle(doc).hidden).toBe(true);
    expect(doc.body.style.overflow).toBe("");
  });
});

describe("graph structure", () => {
  it("uses plain spans for cells and keeps controls out of both grids", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    open(doc);

    const yearCells = Array.from(doc.querySelectorAll("#activity-graph .activity-year-grid .activity-cell"));
    expect(yearCells.length).toBeGreaterThan(0);
    expect(yearCells.every((el) => el.tagName === "SPAN")).toBe(true);
    expect(graph(doc).querySelectorAll("button")).toHaveLength(0);
    expect(graph(doc).querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(graph(doc).querySelector(".activity-cell[tabindex]")).toBeNull();

    setView(doc, "month");
    const monthCells = Array.from(doc.querySelectorAll("#activity-graph .activity-grid .activity-cell"));
    expect(monthCells.length).toBeGreaterThan(0);
    expect(monthCells.every((el) => el.tagName === "SPAN")).toBe(true);
    expect(graph(doc).querySelectorAll("button")).toHaveLength(0);
    expect(graph(doc).querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(graph(doc).querySelector(".activity-cell[tabindex]")).toBeNull();

    expect(dialog(doc).querySelectorAll("button")).toHaveLength(5);
  });
});

describe("history panel", () => {
  it("keeps the seven-day strip and does not contain the activity graph", () => {
    const dom = seed([
      makeTask("read", "2026-03-01", ["2026-03-14"], { title: "Read 10 pages" }),
    ]);
    const doc = dom.window.document;
    click(doc.getElementById("history-toggle"));

    const panel = doc.getElementById("history-panel");
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector(".activity-graph")).toBeNull();
    expect(doc.getElementById("activity-details")).toBeNull();

    const habit = panel.querySelector("#history-daily .habit-history");
    expect(habit).not.toBeNull();
    expect(habit.querySelector(".habit-history-title").textContent).toBe("Read 10 pages");
    expect(habit.querySelectorAll(".habit-dot")).toHaveLength(7);
    expect(panel.querySelectorAll(".habit-dot.done")).toHaveLength(1);
  });
});

describe("live updates", () => {
  it("rebuilds the open grid when a habit is completed", () => {
    const dom = seed([makeTask("read", "2026-03-01", [], { title: "Read" })]);
    const doc = dom.window.document;
    open(doc);

    const before = doc.querySelector("#activity-graph .activity-year-grid");
    const check = doc.querySelector('#daily-list .task-row[data-id="read"] .task-check');
    check.checked = true;
    check.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    const after = doc.querySelector("#activity-graph .activity-year-grid");
    expect(after).not.toBe(before);
    expect(dates(doc)).toHaveLength(73);
    expect(cell(doc, "2026-03-14").title).toBe(
      `${fullDate(2026, 2, 14)}\nNo habits completed`
    );
    expect(backdrop(doc).hidden).toBe(false);
    expect(doc.activeElement).toBe(doc.getElementById("activity-dialog-close"));
  });

  it("re-renders the open grid after the day rolls over", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    open(doc);
    expect(dates(doc)).toHaveLength(73);

    setNow(dom, new Date(2026, 2, 16, 0, 1, 0));
    runDueTimers(dom);

    expect(dates(doc)).toHaveLength(74);
    expect(cell(doc, "2026-03-15")).not.toBeNull();
    expect(backdrop(doc).hidden).toBe(false);
  });
});
