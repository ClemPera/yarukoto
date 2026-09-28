import {
  loadApp,
  getState,
  getEditingId,
  setConfirm,
  click,
  change,
  submit,
  keydown,
  setFiles,
  flush,
  plain,
} from "./helpers/dom.js";

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    title: "Task",
    type: "daily",
    priority: "normal",
    createdAt: "2026-03-15",
    completed: false,
    completions: [],
    ...overrides,
  };
}

function seedTasks(...tasks) {
  return { version: 1, tasks, settings: { resetMinutes: 0 } };
}

function addViaForm(doc, title, type = "daily") {
  if (type !== "daily") {
    doc.querySelector(`input[name="task-type"][value="${type}"]`).checked = true;
  }
  doc.getElementById("add-input").value = title;
  submit(doc.getElementById("add-form"));
}

// Simulate the filename a browser puts on a file input; jsdom rejects a
// non-empty value, so shadow the accessor with a writable own property.
function fakeFilePath(input) {
  Object.defineProperty(input, "value", {
    value: "C:\\fakepath\\backup.json",
    writable: true,
    configurable: true,
  });
}

function toggleCheckbox(dom, id) {
  const doc = dom.window.document;
  const check = doc.querySelector(`#daily-list .task-row[data-id="${id}"] .task-check`);
  check.checked = !check.checked;
  check.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

describe("add form", () => {
  it("adds a daily task by default, clears and re-focuses the input", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const input = doc.getElementById("add-input");
    input.value = "Water the plants";
    submit(doc.getElementById("add-form"));

    const state = getState(dom);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].title).toBe("Water the plants");
    expect(state.tasks[0].type).toBe("daily");
    expect(input.value).toBe("");
    expect(doc.activeElement).toBe(input);

    const rows = doc.querySelectorAll("#daily-list .task-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".task-title").textContent).toBe("Water the plants");

    const saved = JSON.parse(dom.window.localStorage.getItem("yarukoto-data"));
    expect(saved.tasks).toHaveLength(1);
  });

  it("adds a today task when the Just today radio is checked", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    addViaForm(doc, "Call the dentist", "today");

    expect(getState(dom).tasks[0].type).toBe("today");
    expect(doc.querySelectorAll("#today-list .task-row")).toHaveLength(1);
    expect(doc.querySelectorAll("#daily-list .task-row")).toHaveLength(0);
  });

  it("ignores a whitespace-only title", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    doc.getElementById("add-input").value = "   ";
    submit(doc.getElementById("add-form"));

    expect(getState(dom).tasks).toHaveLength(0);
    expect(doc.querySelectorAll("#daily-list .task-row")).toHaveLength(0);
  });
});

describe("footer panels", () => {
  it("toggles history and settings panels with aria-expanded", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const historyPanel = doc.getElementById("history-panel");
    const historyToggle = doc.getElementById("history-toggle");

    expect(historyPanel.hidden).toBe(true);
    expect(historyToggle.getAttribute("aria-expanded")).toBe("false");
    click(historyToggle);
    expect(historyPanel.hidden).toBe(false);
    expect(historyToggle.getAttribute("aria-expanded")).toBe("true");
    click(historyToggle);
    expect(historyPanel.hidden).toBe(true);
    expect(historyToggle.getAttribute("aria-expanded")).toBe("false");

    const settingsPanel = doc.getElementById("settings-panel");
    const settingsToggle = doc.getElementById("settings-toggle");
    expect(settingsPanel.hidden).toBe(true);
    expect(settingsToggle.getAttribute("aria-expanded")).toBe("false");
    click(settingsToggle);
    expect(settingsPanel.hidden).toBe(false);
    expect(settingsToggle.getAttribute("aria-expanded")).toBe("true");
    click(settingsToggle);
    expect(settingsPanel.hidden).toBe(true);
    expect(settingsToggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("reset time", () => {
  it("persists a valid reset time", () => {
    const dom = loadApp();
    change(dom.window.document.getElementById("reset-time-input"), "04:30");

    expect(getState(dom).settings.resetMinutes).toBe(270);
    const saved = JSON.parse(dom.window.localStorage.getItem("yarukoto-data"));
    expect(saved.settings.resetMinutes).toBe(270);
  });

  it("ignores an empty reset time", () => {
    const dom = loadApp();
    const input = dom.window.document.getElementById("reset-time-input");
    change(input, "04:30");
    expect(getState(dom).settings.resetMinutes).toBe(270);

    change(input, "");
    expect(getState(dom).settings.resetMinutes).toBe(270);
  });

  it("shifts the app's day when reset passes the current time", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    addViaForm(doc, "Daily habit");
    change(doc.getElementById("reset-time-input"), "12:00");
    expect(getState(dom).settings.resetMinutes).toBe(720);

    // 10:30 minus 12h lands on 2026-03-14 22:30, so that is the app's "today".
    const expected = new Date(2026, 2, 14, 22, 30).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    expect(doc.getElementById("today-date").textContent).toBe(expected);

    const check = doc.querySelector("#daily-list .task-row .task-check");
    check.checked = true;
    check.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    expect(getState(dom).tasks[0].completions).toContain("2026-03-14");
  });
});

describe("export", () => {
  it("downloads a JSON backup and revokes the object URL", async () => {
    const dom = loadApp();
    const doc = dom.window.document;
    click(doc.getElementById("export-button"));

    expect(dom.window.__objectUrls).toHaveLength(1);
    const { url, blob } = dom.window.__objectUrls[0];
    expect(await blob.text()).toBe(JSON.stringify(plain(getState(dom)), null, 2));

    expect(dom.window.__anchorClicks).toHaveLength(1);
    expect(dom.window.__anchorClicks[0].download).toBe("yarukoto-backup-2026-03-15.json");
    expect(dom.window.__anchorClicks[0].href).toBe(url);
    expect(dom.window.__revokedUrls).toContain(url);
  });
});

describe("import", () => {
  const backupFile = (payload) => ({ text: async () => JSON.stringify(payload) });

  it("replaces state from a valid backup and resets the file input", async () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const input = doc.getElementById("import-input");
    const imported = makeTask({ id: "imp-1", title: "Imported habit" });

    fakeFilePath(input);
    setFiles(input, [backupFile({ version: 1, tasks: [imported] })]);
    await flush();

    const state = getState(dom);
    expect(plain(state.tasks)).toEqual([imported]);
    expect(state.settings.resetMinutes).toBe(0);
    expect(input.value).toBe("");

    expect(doc.querySelectorAll("#daily-list .task-row")).toHaveLength(1);
    expect(doc.querySelector("#daily-list .task-title").textContent).toBe("Imported habit");
    const saved = JSON.parse(dom.window.localStorage.getItem("yarukoto-data"));
    expect(saved.tasks).toHaveLength(1);
  });

  it("keeps state when the import is cancelled", async () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const input = doc.getElementById("import-input");
    const before = plain(getState(dom));

    setConfirm(dom, false);
    fakeFilePath(input);
    setFiles(input, [backupFile({ version: 1, tasks: [makeTask({ id: "x" })] })]);
    await flush();

    expect(plain(getState(dom))).toEqual(before);
    expect(input.value).toBe("");
  });

  it("alerts and keeps state on invalid JSON", async () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const input = doc.getElementById("import-input");
    const before = plain(getState(dom));

    fakeFilePath(input);
    setFiles(input, [{ text: async () => "not json" }]);
    await flush();

    expect(dom.window.__alerts).toEqual(["That file doesn't look like a Yarukoto backup."]);
    expect(plain(getState(dom))).toEqual(before);
    expect(input.value).toBe("");
  });

  it("alerts and keeps state when tasks is not an array", async () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const before = plain(getState(dom));

    setFiles(doc.getElementById("import-input"), [backupFile({ version: 1, tasks: "nope" })]);
    await flush();

    expect(dom.window.__alerts).toEqual(["That file doesn't look like a Yarukoto backup."]);
    expect(plain(getState(dom))).toEqual(before);
  });

  it("does nothing when the file list is empty", async () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const before = plain(getState(dom));

    setFiles(doc.getElementById("import-input"), []);
    await flush();

    expect(plain(getState(dom))).toEqual(before);
    expect(dom.window.__alerts).toHaveLength(0);
  });
});

describe("delete flow", () => {
  it("animates the row out, then removes it on animationend", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    addViaForm(doc, "Ship it");

    const row = doc.querySelector("#daily-list .task-row");
    click(row.querySelector(".task-delete"));
    expect(row.classList.contains("row-exit")).toBe(true);
    expect(getState(dom).tasks).toHaveLength(1);

    row.dispatchEvent(new dom.window.Event("animationend"));
    expect(getState(dom).tasks).toHaveLength(0);
    expect(JSON.parse(dom.window.localStorage.getItem("yarukoto-data")).tasks).toHaveLength(0);
  });

  it("keeps the task when the confirmation is declined", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    addViaForm(doc, "Keep me");
    setConfirm(dom, false);

    const row = doc.querySelector("#daily-list .task-row");
    click(row.querySelector(".task-delete"));
    expect(row.classList.contains("row-exit")).toBe(false);
    expect(getState(dom).tasks).toHaveLength(1);
  });

  it("removes immediately under reduced motion", () => {
    const dom = loadApp({
      reducedMotion: true,
      storage: seedTasks(makeTask({ id: "r1", title: "No anim" })),
    });
    const doc = dom.window.document;
    click(doc.querySelector("#daily-list .task-row .task-delete"));
    expect(getState(dom).tasks).toHaveLength(0);
  });
});

describe("checkbox wiring", () => {
  it("records today for a daily task and moves it below pending rows", () => {
    const dom = loadApp({
      storage: seedTasks(
        makeTask({ id: "a", title: "Alpha" }),
        makeTask({ id: "b", title: "Beta" })
      ),
    });
    const doc = dom.window.document;
    const ids = () => [...doc.querySelectorAll("#daily-list .task-row")].map((r) => r.dataset.id);
    expect(ids()).toEqual(["a", "b"]);

    toggleCheckbox(dom, "a");
    expect(getState(dom).tasks.find((t) => t.id === "a").completions).toContain("2026-03-15");
    expect(ids()).toEqual(["b", "a"]);

    toggleCheckbox(dom, "a");
    expect(getState(dom).tasks.find((t) => t.id === "a").completions).toEqual([]);
    expect(ids()).toEqual(["a", "b"]);
  });

  it("toggles a today task's completed state without hiding it", () => {
    const dom = loadApp({
      storage: seedTasks(makeTask({ id: "t", title: "Call", type: "today" })),
    });
    const doc = dom.window.document;
    const row = () => doc.querySelector('#today-list .task-row[data-id="t"]');
    expect(row()).not.toBeNull();

    let check = row().querySelector(".task-check");
    check.checked = true;
    check.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    expect(getState(dom).tasks[0].completed).toBe(true);
    expect(row()).not.toBeNull();
    check = row().querySelector(".task-check");
    expect(check.checked).toBe(true);
    // CSS strike-through relies on .task-check:checked ~ .task-title
    expect(row().querySelector(".task-title").previousElementSibling).toBe(check);

    check.checked = false;
    check.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(getState(dom).tasks[0].completed).toBe(false);
    expect(row()).not.toBeNull();
    expect(row().querySelector(".task-check").checked).toBe(false);
  });
});

describe("priority flag", () => {
  it("cycles normal to high to low and reorders the list", () => {
    const dom = loadApp({
      storage: seedTasks(
        makeTask({ id: "a", title: "Alpha" }),
        makeTask({ id: "b", title: "Beta" })
      ),
    });
    const doc = dom.window.document;
    const ids = () => [...doc.querySelectorAll("#daily-list .task-row")].map((r) => r.dataset.id);
    const flag = () => doc.querySelector('#daily-list .task-row[data-id="b"] .task-priority');

    expect(ids()).toEqual(["a", "b"]);
    expect(flag().dataset.priority).toBe("normal");

    click(flag());
    expect(getState(dom).tasks.find((t) => t.id === "b").priority).toBe("high");
    expect(flag().dataset.priority).toBe("high");
    expect(flag().textContent).toBe("↑");
    expect(ids()).toEqual(["b", "a"]);

    click(flag());
    expect(getState(dom).tasks.find((t) => t.id === "b").priority).toBe("low");
    expect(flag().dataset.priority).toBe("low");
    expect(ids()).toEqual(["a", "b"]);
  });
});

describe("edit flow", () => {
  function openEditor(dom) {
    click(dom.window.document.querySelector("#daily-list .task-row .task-edit"));
    return dom.window.document.querySelector(".task-row-editing .edit-title-input");
  }

  const storage = () => seedTasks(makeTask({ id: "t", title: "Write" }));

  it("enters edit mode and cancels with Escape", () => {
    const dom = loadApp({ storage: storage() });
    const doc = dom.window.document;
    const input = openEditor(dom);
    expect(getEditingId(dom)).toBe("t");
    expect(input.value).toBe("Write");

    keydown(input, "Escape");
    expect(getEditingId(dom)).toBeNull();
    expect(doc.querySelector(".task-row-editing")).toBeNull();
  });

  it("cancels with the Cancel button", () => {
    const dom = loadApp({ storage: storage() });
    const doc = dom.window.document;
    openEditor(dom);
    click(doc.querySelector(".edit-actions button[type='button']"));

    expect(getEditingId(dom)).toBeNull();
    expect(doc.querySelector(".task-row-editing")).toBeNull();
  });

  it("saves the new title and type", () => {
    const dom = loadApp({ storage: storage() });
    const doc = dom.window.document;
    const input = openEditor(dom);
    input.value = "  Edited  ";
    doc.querySelector('.edit-form input[value="today"]').checked = true;
    submit(doc.querySelector(".edit-form"));

    const task = getState(dom).tasks[0];
    expect(task.title).toBe("Edited");
    expect(task.type).toBe("today");
    expect(getEditingId(dom)).toBeNull();
    expect(doc.querySelector(".task-row-editing")).toBeNull();
    expect(doc.querySelectorAll("#daily-list .task-row")).toHaveLength(0);
    const todayRow = doc.querySelector('#today-list .task-row[data-id="t"]');
    expect(todayRow.querySelector(".task-title").textContent).toBe("Edited");
    expect(JSON.parse(dom.window.localStorage.getItem("yarukoto-data")).tasks[0].title).toBe("Edited");
  });

  it("stays in edit mode and leaves the task untouched when the title is blank", () => {
    const dom = loadApp({ storage: storage() });
    const doc = dom.window.document;
    const input = openEditor(dom);
    input.value = "   ";
    submit(doc.querySelector(".edit-form"));

    expect(getEditingId(dom)).toBe("t");
    expect(doc.querySelector(".task-row-editing")).not.toBeNull();
    expect(getState(dom).tasks[0].title).toBe("Write");
  });
});

describe("persistence round-trip", () => {
  it("restores tasks and settings in a fresh load", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    addViaForm(doc, "Drink water");
    addViaForm(doc, "Call mum", "today");
    toggleCheckbox(dom, getState(dom).tasks[0].id);
    change(doc.getElementById("reset-time-input"), "04:30");

    const saved = JSON.parse(dom.window.localStorage.getItem("yarukoto-data"));
    const dom2 = loadApp({ storage: saved });
    const doc2 = dom2.window.document;

    expect(plain(getState(dom2).tasks)).toEqual(plain(getState(dom).tasks));
    expect(getState(dom2).settings.resetMinutes).toBe(270);
    expect(doc2.querySelectorAll("#daily-list .task-row")).toHaveLength(1);
    expect(doc2.querySelectorAll("#today-list .task-row")).toHaveLength(1);
    expect(doc2.getElementById("reset-time-input").value).toBe("04:30");
  });
});
