import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadApp,
  getState,
  change,
  setFiles,
  flush,
  STORAGE_KEY,
} from "./helpers/dom.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "index.html"), "utf8");

function seed(settings = {}, options = {}) {
  return loadApp({
    storage: {
      version: 1,
      tasks: [],
      settings: { resetMinutes: 0, introSeen: true, ...settings },
    },
    ...options,
  });
}

function theme(doc) {
  return doc.documentElement.dataset.theme;
}

describe("theme bootstrap", () => {
  it("resolves the theme in the head before the stylesheet loads", () => {
    const boot = HTML.indexOf("yarukoto-data");
    const styles = HTML.indexOf('<link rel="stylesheet" href="styles.css">');

    expect(boot).toBeGreaterThan(-1);
    expect(boot).toBeLessThan(styles);
    expect(HTML.slice(0, styles)).toContain("document.documentElement.dataset.theme");
  });
});

describe("theme setting", () => {
  it("offers System, Light and Dark, and defaults to System", () => {
    const dom = seed();
    const doc = dom.window.document;
    const select = doc.getElementById("theme-input");

    expect(select).not.toBeNull();
    expect(select.value).toBe("system");
    expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
      ["system", "System"],
      ["light", "Light"],
      ["dark", "Dark"],
    ]);
    expect(theme(doc)).toBe("light");
    expect(getState(dom).settings.theme).toBe("system");
  });

  it("follows the OS while set to System", () => {
    const dom = seed();
    const doc = dom.window.document;

    expect(theme(doc)).toBe("light");
    dom.window.__setDark(true);
    expect(theme(doc)).toBe("dark");
    dom.window.__setDark(false);
    expect(theme(doc)).toBe("light");
  });

  it("applies and persists an explicit theme", () => {
    const dom = seed();
    const doc = dom.window.document;

    change(doc.getElementById("theme-input"), "dark");
    expect(theme(doc)).toBe("dark");
    expect(getState(dom).settings.theme).toBe("dark");

    const saved = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
    expect(saved.settings.theme).toBe("dark");
  });

  it("keeps an explicit theme when the OS preference changes", () => {
    const dom = seed({}, { dark: true });
    const doc = dom.window.document;

    expect(theme(doc)).toBe("dark");
    change(doc.getElementById("theme-input"), "light");
    expect(theme(doc)).toBe("light");

    dom.window.__setDark(true);
    expect(theme(doc)).toBe("light");
    dom.window.__setDark(false);
    expect(theme(doc)).toBe("light");
  });

  it("returns to following the OS after choosing System again", () => {
    const dom = seed({ theme: "dark" });
    const doc = dom.window.document;

    expect(theme(doc)).toBe("dark");
    change(doc.getElementById("theme-input"), "system");
    expect(theme(doc)).toBe("light");

    dom.window.__setDark(true);
    expect(theme(doc)).toBe("dark");
    expect(getState(dom).settings.theme).toBe("system");
  });

  it("restores a saved explicit theme on load", () => {
    const dom = seed({ theme: "dark" }, { dark: false });
    const doc = dom.window.document;

    expect(theme(doc)).toBe("dark");
    expect(doc.getElementById("theme-input").value).toBe("dark");
  });

  it("treats an invalid stored theme as System", () => {
    const dom = seed({ theme: "sepia" }, { dark: true });
    const doc = dom.window.document;

    expect(doc.getElementById("theme-input").value).toBe("system");
    expect(theme(doc)).toBe("dark");
  });

  it("applies the theme from an imported backup", async () => {
    const dom = loadApp();
    const doc = dom.window.document;

    setFiles(doc.getElementById("import-input"), [
      {
        text: async () =>
          JSON.stringify({
            version: 1,
            tasks: [],
            settings: { theme: "dark", introSeen: true },
          }),
      },
    ]);
    await flush();

    expect(getState(dom).settings.theme).toBe("dark");
    expect(doc.getElementById("theme-input").value).toBe("dark");
    expect(theme(doc)).toBe("dark");
  });

  it("boots safely with corrupt stored data", () => {
    const dom = loadApp({ storage: "{oops" });
    expect(theme(dom.window.document)).toBe("light");
  });
});
