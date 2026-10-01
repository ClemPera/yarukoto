import {
  loadApp,
  getState,
  setState,
  getEditingId,
  setEditingId,
  plain,
  STORAGE_KEY,
} from "./helpers/dom.js";

function persisted(dom) {
  return JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
}

// Minimal valid state shape used when seeding state directly.
function task(overrides = {}) {
  return { id: "t", title: "T", type: "daily", completed: false, completions: [], ...overrides };
}

describe("addTask", () => {
  it("appends a normal, pending task and persists it", () => {
    const dom = loadApp();
    dom.window.addTask("Write tests", "daily");

    const state = plain(getState(dom));
    expect(state.tasks).toHaveLength(1);
    const added = state.tasks[0];
    expect(added.title).toBe("Write tests");
    expect(added.type).toBe("daily");
    expect(added.priority).toBe("normal");
    expect(added.completed).toBe(false);
    expect(added.completions).toEqual([]);
    expect(added.createdAt).toBe("2026-03-15");
    expect(added.id).toEqual(expect.any(String));
    expect(added.id).not.toBe("");

    expect(persisted(dom)).toEqual(state);
  });

  it("assigns unique ids", () => {
    const dom = loadApp();
    dom.window.addTask("One", "daily");
    dom.window.addTask("Two", "daily");
    const [first, second] = plain(getState(dom)).tasks;
    expect(first.id).not.toBe(second.id);
  });

  it("marks the fresh row with row-enter until the next render", () => {
    const dom = loadApp();
    dom.window.addTask("Fresh", "daily");
    const row = dom.window.document.querySelector("#daily-list .task-row");
    expect(row).not.toBeNull();
    expect(row.classList.contains("row-enter")).toBe(true);

    dom.window.render();
    expect(dom.window.document.querySelector(".row-enter")).toBeNull();
  });
});

describe("setPriority", () => {
  it("sets the chosen priority directly and persists it", () => {
    const dom = loadApp();
    dom.window.addTask("Pick", "daily");
    const id = plain(getState(dom)).tasks[0].id;
    const priority = () => plain(getState(dom)).tasks[0].priority;

    expect(priority()).toBe("normal");
    dom.window.setPriority(id, "low");
    expect(priority()).toBe("low");
    expect(persisted(dom)).toEqual(plain(getState(dom)));
    dom.window.setPriority(id, "high");
    expect(priority()).toBe("high");
    expect(persisted(dom)).toEqual(plain(getState(dom)));
  });
});


describe("deleteTask", () => {
  it("removes only the matching id and persists", () => {
    const dom = loadApp();
    dom.window.addTask("Keep", "daily");
    dom.window.addTask("Drop", "today");
    const drop = plain(getState(dom)).tasks.find((t) => t.title === "Drop");

    dom.window.deleteTask(drop.id);

    const tasks = plain(getState(dom)).tasks;
    expect(tasks.map((t) => t.title)).toEqual(["Keep"]);
    expect(persisted(dom)).toEqual(plain(getState(dom)));
  });
});

describe("toggleDaily", () => {
  it("toggles today's completion for a single task and persists", () => {
    const dom = loadApp();
    dom.window.addTask("A", "daily");
    dom.window.addTask("B", "daily");
    const [a, b] = plain(getState(dom)).tasks;

    dom.window.toggleDaily(a.id);
    let tasks = plain(getState(dom)).tasks;
    expect(tasks.find((t) => t.id === a.id).completions).toEqual(["2026-03-15"]);
    expect(tasks.find((t) => t.id === b.id).completions).toEqual([]);
    expect(persisted(dom)).toEqual(plain(getState(dom)));

    dom.window.toggleDaily(a.id);
    tasks = plain(getState(dom)).tasks;
    expect(tasks.find((t) => t.id === a.id).completions).toEqual([]);
    expect(persisted(dom)).toEqual(plain(getState(dom)));
  });
});

describe("toggleToday", () => {
  it("completes then uncompletes a task and persists", () => {
    const dom = loadApp();
    dom.window.addTask("T", "today");
    const id = plain(getState(dom)).tasks[0].id;

    dom.window.toggleToday(id);
    let stored = plain(getState(dom)).tasks[0];
    expect(stored.completed).toBe(true);
    expect(stored.completions).toEqual(["2026-03-15"]);
    expect(persisted(dom)).toEqual(plain(getState(dom)));

    dom.window.toggleToday(id);
    stored = plain(getState(dom)).tasks[0];
    expect(stored.completed).toBe(false);
    expect(stored.completions).toEqual([]);
    expect(persisted(dom)).toEqual(plain(getState(dom)));
  });

  it("uncompletes without throwing when completions lacks today", () => {
    const dom = loadApp();
    setState(dom, {
      version: 1,
      tasks: [task({ id: "t", type: "today", completed: true, completions: [] })],
      settings: { resetMinutes: 0 },
    });

    expect(() => dom.window.toggleToday("t")).not.toThrow();

    const stored = plain(getState(dom)).tasks[0];
    expect(stored.completed).toBe(false);
    expect(stored.completions).toEqual([]);
  });
});

describe("updateTask", () => {
  it("applies updates, persists and clears editingId", () => {
    const dom = loadApp();
    dom.window.addTask("Old title", "daily");
    const id = plain(getState(dom)).tasks[0].id;
    setEditingId(dom, id);
    expect(getEditingId(dom)).toBe(id);

    dom.window.updateTask(id, { title: "New title", type: "today" });

    const stored = plain(getState(dom)).tasks[0];
    expect(stored.title).toBe("New title");
    expect(stored.type).toBe("today");
    expect(getEditingId(dom)).toBeNull();
    expect(persisted(dom)).toEqual(plain(getState(dom)));
  });
});

describe("isolation", () => {
  it("gives each loadApp() instance its own localStorage", () => {
    const first = loadApp();
    const second = loadApp();

    first.window.addTask("Only first", "daily");

    expect(plain(getState(second)).tasks).toEqual([]);
    expect(second.window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(JSON.parse(first.window.localStorage.getItem(STORAGE_KEY)).tasks).toHaveLength(1);
  });
});
