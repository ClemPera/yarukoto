import { loadApp, plain, STORAGE_KEY } from "./helpers/dom.js";

const FALLBACK = { version: 1, tasks: [], settings: { resetMinutes: 0 } };

describe("uid", () => {
  it("returns a non-empty two-part string", () => {
    const dom = loadApp();
    const id = dom.window.uid();
    expect(typeof id).toBe("string");
    expect(id).not.toBe("");
    expect(id.split("-")).toHaveLength(2);
    expect(id.split("-").every((part) => part.length > 0)).toBe(true);
  });

  it("stays unique across 1000 calls", () => {
    const dom = loadApp();
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(dom.window.uid());
    expect(ids.size).toBe(1000);
  });
});

describe("todayStr", () => {
  it("uses the frozen clock for the offset days", () => {
    const dom = loadApp();
    expect(dom.window.todayStr()).toBe("2026-03-15");
    expect(dom.window.todayStr(1)).toBe("2026-03-16");
    expect(dom.window.todayStr(-1)).toBe("2026-03-14");
  });
});

describe("effectiveNow / getResetMinutes", () => {
  it("defaults resetMinutes to 0 when settings are empty", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [], settings: {} } });
    expect(dom.window.getResetMinutes()).toBe(0);
    expect(dom.window.todayStr()).toBe("2026-03-15");
  });

  it("defaults resetMinutes to 0 when settings are missing", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [] } });
    expect(dom.window.getResetMinutes()).toBe(0);
    expect(dom.window.todayStr()).toBe("2026-03-15");
  });

  it("shifts the clock back when the reset crosses midnight", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [], settings: { resetMinutes: 720 } } });
    const now = dom.window.effectiveNow();
    expect(dom.window.getResetMinutes()).toBe(720);
    expect([
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
    ]).toEqual([2026, 3, 14, 22, 30]);
    expect(dom.window.todayStr()).toBe("2026-03-14");
    expect(dom.window.todayStr(1)).toBe("2026-03-15");
  });

  it("keeps the same day when the reset stays past midnight", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [], settings: { resetMinutes: 300 } } });
    expect(dom.window.getResetMinutes()).toBe(300);
    expect(dom.window.todayStr()).toBe("2026-03-15");
  });
});

describe("minutesToTimeStr", () => {
  it("formats minutes as zero-padded HH:MM", () => {
    const dom = loadApp();
    expect(dom.window.minutesToTimeStr(0)).toBe("00:00");
    expect(dom.window.minutesToTimeStr(90)).toBe("01:30");
    expect(dom.window.minutesToTimeStr(1439)).toBe("23:59");
  });
});

describe("timeStrToMinutes", () => {
  it("parses HH:MM into minutes", () => {
    const dom = loadApp();
    expect(dom.window.timeStrToMinutes("00:00")).toBe(0);
    expect(dom.window.timeStrToMinutes("04:30")).toBe(270);
    expect(dom.window.timeStrToMinutes("23:59")).toBe(1439);
  });
});

describe("loadData", () => {
  it("falls back when nothing is stored", () => {
    const dom = loadApp();
    expect(plain(dom.window.loadData())).toEqual(FALLBACK);
  });

  it("falls back on corrupt raw data", () => {
    const dom = loadApp({ storage: "{oops" });
    expect(plain(dom.window.loadData())).toEqual(FALLBACK);
  });

  it("defaults settings when stored data omits them", () => {
    const dom = loadApp({ storage: { tasks: [{ id: "a" }] } });
    const data = plain(dom.window.loadData());
    expect(data.tasks).toEqual([{ id: "a" }]);
    expect(data.settings).toEqual({ resetMinutes: 0 });
  });

  it("preserves a stored resetMinutes", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [], settings: { resetMinutes: 270 } } });
    expect(plain(dom.window.loadData()).settings.resetMinutes).toBe(270);
  });

  it("preserves other stored fields", () => {
    const dom = loadApp({
      storage: { version: 1, tasks: [], settings: { resetMinutes: 0 }, custom: "keep" },
    });
    expect(plain(dom.window.loadData()).custom).toBe("keep");
  });
});

describe("saveData", () => {
  it("round-trips through localStorage under the storage key", () => {
    const dom = loadApp();
    const data = { version: 1, tasks: [{ id: "x", title: "T" }], settings: { resetMinutes: 45 } };
    dom.window.saveData(data);
    expect(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY))).toEqual(data);
  });
});

describe("sortByPriority", () => {
  it("orders high, then normal, then low", () => {
    const dom = loadApp();
    const input = [
      { id: "l", priority: "low" },
      { id: "n", priority: "normal" },
      { id: "h", priority: "high" },
    ];
    expect(dom.window.sortByPriority(input).map((t) => t.id)).toEqual(["h", "n", "l"]);
  });

  it("treats missing or unknown priority as normal", () => {
    const dom = loadApp();
    const input = [
      { id: "l", priority: "low" },
      { id: "missing" },
      { id: "null", priority: null },
      { id: "h", priority: "high" },
    ];
    expect(dom.window.sortByPriority(input).map((t) => t.id)).toEqual([
      "h",
      "missing",
      "null",
      "l",
    ]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const dom = loadApp();
    const input = [
      { id: "a", priority: "low" },
      { id: "b", priority: "high" },
    ];
    const out = dom.window.sortByPriority(input);
    expect(out).not.toBe(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("pendingFirst", () => {
  const doneIds = new Set(["a", "c"]);

  it("puts pending tasks first, preserving order within each group", () => {
    const dom = loadApp();
    const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const result = dom.window.pendingFirst(tasks, (t) => doneIds.has(t.id));
    expect(result.map((t) => t.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("handles all-pending, all-done and empty input", () => {
    const dom = loadApp();
    const all = [{ id: "a" }, { id: "b" }];
    expect(dom.window.pendingFirst(all, () => false).map((t) => t.id)).toEqual(["a", "b"]);
    expect(dom.window.pendingFirst(all, () => true).map((t) => t.id)).toEqual(["a", "b"]);
    expect(dom.window.pendingFirst([], () => false)).toEqual([]);
  });
});
