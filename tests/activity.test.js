import { loadApp, click } from "./helpers/dom.js";

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

function seed(tasks) {
  return loadApp({
    storage: { version: 1, tasks, settings: { resetMinutes: 0, introSeen: true } },
  });
}

function dates(doc) {
  return Array.from(doc.querySelectorAll(".activity-cell[data-date]")).map(
    (cell) => cell.dataset.date
  );
}

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

describe("current year", () => {
  it("renders two half-year blocks with Mon, Wed and Fri labels", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    const halves = Array.from(doc.querySelectorAll("#activity-halves .activity-half"));

    expect(halves).toHaveLength(2);
    expect(halves.map((half) => half.querySelector(".activity-half-label").textContent)).toEqual([
      "Jan – Jun",
      "Jul – Dec",
    ]);

    const weekdays = Array.from(halves[0].querySelectorAll(".activity-weekday")).map(
      (label) => label.textContent
    );
    expect(weekdays).toEqual(["Mon", "", "Wed", "", "Fri", "", ""]);

    const graph = doc.getElementById("activity-halves");
    expect(graph.getAttribute("role")).toBe("img");
    expect(graph.getAttribute("aria-label")).toBe(
      "Habit activity for 2026. Darker squares mean more habits completed."
    );
  });

  it("ends yesterday and has no cell for today or any future date", () => {
    const dom = seed([makeTask("habit", "2026-01-01")]);
    const doc = dom.window.document;
    const all = dates(doc);

    expect(all).toHaveLength(73);
    expect(all[0]).toBe("2026-01-01");
    expect(all.at(-1)).toBe("2026-03-14");
    expect(all).not.toContain("2026-03-15");
    expect(all.every((date) => date <= "2026-03-14")).toBe(true);
    expect(doc.querySelector('.activity-cell[data-date="2026-03-15"]')).toBeNull();
    expect(doc.querySelector('.activity-cell.is-out[data-date]')).toBeNull();
  });
});

describe("year navigation", () => {
  it("renders the full previous year, then returns to the current year", () => {
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
    expect(dates(doc)).toHaveLength(365);
    expect(dates(doc)[0]).toBe("2025-01-01");
    expect(dates(doc).at(-1)).toBe("2025-12-31");

    const lastDay = doc.querySelector('.activity-cell[data-date="2025-12-31"]');
    expect(lastDay.classList.contains("level-4")).toBe(true);
    expect(lastDay.title).toBe(`${fullDate(2025, 11, 31)}: 1 of 1 habit`);

    click(next);
    expect(label.textContent).toBe("2026");
    expect(next.disabled).toBe(true);
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
    expect(cell("2026-01-31").title).toBe(`${fullDate(2026, 0, 31)}: no habits`);
    expect(cell("2026-02-01").title).toBe(`${fullDate(2026, 1, 1)}: 0 of 4 habits`);
    expect(cell("2026-02-05").title).toBe(`${fullDate(2026, 1, 5)}: 4 of 4 habits`);
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
    expect(details.querySelectorAll(".activity-grid button")).toHaveLength(0);
    expect(details.querySelectorAll("button")).toHaveLength(2);
    expect(doc.querySelector(".activity-cell[tabindex]")).toBeNull();
  });
});
