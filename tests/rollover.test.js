import {
  advanceTime,
  change,
  click,
  getState,
  loadApp,
  setNow,
  sleepFor,
} from "./helpers/dom.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function habit(id, title, completions = []) {
  return {
    id,
    title,
    type: "daily",
    priority: "normal",
    createdAt: "2026-03-01",
    completed: false,
    completions,
  };
}

function start({ now, resetMinutes = 0, tasks }) {
  return loadApp({
    now,
    storage: { version: 1, tasks, settings: { resetMinutes, introSeen: true } },
  });
}

const checkboxes = (dom) => [...dom.window.document.querySelectorAll("#daily-list .task-check")];
const day = (dom) => dom.window.todayStr();

function pageBecomesVisible(dom) {
  Object.defineProperty(dom.window.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
}

describe("rolling over at the reset time while the page stays open", () => {
  it("unchecks habits and updates the date at midnight, without a reload", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 23, 50, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    expect(checkboxes(dom)[0].checked).toBe(true);
    const header = dom.window.document.getElementById("today-date").textContent;

    advanceTime(dom, 20 * MINUTE);

    expect(day(dom)).toBe("2026-03-16");
    expect(checkboxes(dom)[0].checked).toBe(false);
    expect(dom.window.document.getElementById("today-date").textContent).not.toBe(header);
  });

  it("keeps the completion in history when the day rolls over", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 23, 59, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    advanceTime(dom, 5 * MINUTE);
    expect(getState(dom).tasks[0].completions).toEqual(["2026-03-15"]);
  });

  it("rolls over at a custom reset time, and not before it", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 3, 59, 0),
      resetMinutes: 240,
      tasks: [habit("a", "Stretch", ["2026-03-14"])],
    });
    // before 04:00 it is still the previous day, so the habit counts as done
    expect(day(dom)).toBe("2026-03-14");
    expect(checkboxes(dom)[0].checked).toBe(true);

    advanceTime(dom, 30 * 1000);
    expect(checkboxes(dom)[0].checked).toBe(true);

    advanceTime(dom, 2 * MINUTE);
    expect(day(dom)).toBe("2026-03-15");
    expect(checkboxes(dom)[0].checked).toBe(false);
  });

  it("switches within a moment of the reset time, not only on the next poll", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 3, 59, 50),
      resetMinutes: 240,
      tasks: [habit("a", "Stretch", ["2026-03-14"])],
    });
    advanceTime(dom, 9 * 1000);
    expect(checkboxes(dom)[0].checked).toBe(true);
    advanceTime(dom, 2 * 1000);
    expect(checkboxes(dom)[0].checked).toBe(false);
  });

  it("does not rebuild the list while the day is unchanged", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 10, 0, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    const row = dom.window.document.querySelector(".task-row");
    advanceTime(dom, 3 * HOUR);
    expect(dom.window.document.querySelector(".task-row")).toBe(row);
  });
});

describe("after the computer sleeps", () => {
  it("rolls over as soon as overdue timers fire on resume", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 22, 0, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    sleepFor(dom, 9 * HOUR);
    expect(day(dom)).toBe("2026-03-16");
    expect(checkboxes(dom)[0].checked).toBe(false);
  });

  it("rolls over when the page becomes visible even if timers never ran", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 22, 0, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    setNow(dom, new Date(2026, 2, 16, 7, 0, 0));
    expect(checkboxes(dom)[0].checked).toBe(true);

    pageBecomesVisible(dom);
    expect(checkboxes(dom)[0].checked).toBe(false);
  });

  it("rolls over on window focus", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 22, 0, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    setNow(dom, new Date(2026, 2, 16, 7, 0, 0));
    dom.window.dispatchEvent(new dom.window.Event("focus"));
    expect(checkboxes(dom)[0].checked).toBe(false);
  });

  it("rolls over when restored from the back/forward cache", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 22, 0, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    setNow(dom, new Date(2026, 2, 16, 7, 0, 0));
    dom.window.dispatchEvent(new dom.window.Event("pageshow"));
    expect(checkboxes(dom)[0].checked).toBe(false);
  });

  it("does nothing on wake when it is still the same day", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 9, 0, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    const row = dom.window.document.querySelector(".task-row");
    setNow(dom, new Date(2026, 2, 15, 17, 0, 0));
    dom.window.dispatchEvent(new dom.window.Event("focus"));
    expect(dom.window.document.querySelector(".task-row")).toBe(row);
  });
});

describe("timer housekeeping", () => {
  it("keeps exactly one timer pending, however often it is woken", () => {
    const dom = start({ now: new Date(2026, 2, 15, 9, 0, 0), tasks: [] });
    expect(dom.window.__timers.size).toBe(1);
    for (let i = 0; i < 5; i++) {
      dom.window.dispatchEvent(new dom.window.Event("focus"));
      dom.window.dispatchEvent(new dom.window.Event("pageshow"));
    }
    advanceTime(dom, 10 * MINUTE);
    expect(dom.window.__timers.size).toBe(1);
  });

  it("polls at most every 30 seconds so a late or paused timer is caught quickly", () => {
    const dom = start({ now: new Date(2026, 2, 15, 9, 0, 0), tasks: [] });
    const [timer] = [...dom.window.__timers.values()];
    expect(timer.at - dom.window.Date.now()).toBe(30000);
  });

  it("aims at the reset moment when it is closer than the poll interval", () => {
    const dom = start({ now: new Date(2026, 2, 15, 23, 59, 50), tasks: [] });
    const [timer] = [...dom.window.__timers.values()];
    expect(timer.at - dom.window.Date.now()).toBe(10 * 1000 + 250);
  });

  it("re-aims the timer when the reset time setting changes", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 10, 30, 50),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    // 10:31 is 10 seconds away, earlier than the 30s poll that was pending
    change(dom.window.document.getElementById("reset-time-input"), "10:31");
    // before 10:31 it is still the previous day, so the habit is not done yet
    expect(day(dom)).toBe("2026-03-14");
    expect(checkboxes(dom)[0].checked).toBe(false);

    advanceTime(dom, 11 * 1000);
    expect(day(dom)).toBe("2026-03-15");
    expect(checkboxes(dom)[0].checked).toBe(true);
  });
});

describe("rolling over while something is being edited", () => {
  it("leaves an open editor and its text alone", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 23, 55, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    click(dom.window.document.querySelector(".task-edit"));
    const input = dom.window.document.querySelector(".edit-title-input");
    input.value = "Stretch for ten minutes";

    advanceTime(dom, 10 * MINUTE);

    expect(dom.window.document.querySelector(".edit-title-input")).toBe(input);
    expect(input.value).toBe("Stretch for ten minutes");
  });

  it("applies the new day as soon as the edit ends", () => {
    const dom = start({
      now: new Date(2026, 2, 15, 23, 55, 0),
      tasks: [habit("a", "Stretch", ["2026-03-15"])],
    });
    click(dom.window.document.querySelector(".task-edit"));
    advanceTime(dom, 10 * MINUTE);

    click(dom.window.document.querySelector(".edit-actions button[type='button']"));

    expect(dom.window.document.querySelector(".edit-form")).toBeNull();
    expect(checkboxes(dom)[0].checked).toBe(false);
    expect(dom.window.document.getElementById("today-date").textContent).toContain("16");
  });
});
