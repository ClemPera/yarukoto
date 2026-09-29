import { click, getState, keydown, loadApp, plain, setFiles, flush, STORAGE_KEY } from "./helpers/dom.js";

const backdrop = (dom) => dom.window.document.getElementById("intro-backdrop");
const dismissButton = (dom) => dom.window.document.getElementById("intro-dismiss");
const helpButton = (dom) => dom.window.document.getElementById("help-button");
const saved = (dom) => JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));

describe("intro on first launch", () => {
  it("opens by itself on a brand new install and focuses the dismiss button", () => {
    const dom = loadApp();
    expect(backdrop(dom).hidden).toBe(false);
    expect(dom.window.document.activeElement).toBe(dismissButton(dom));
  });

  it("does not open for someone who already has saved data", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [], settings: { resetMinutes: 0 } } });
    expect(backdrop(dom).hidden).toBe(true);
    expect(getState(dom).settings.introSeen).toBe(true);
  });

  it("does not open when the saved data is corrupt", () => {
    const dom = loadApp({ storage: "{oops" });
    expect(backdrop(dom).hidden).toBe(true);
  });

  it("does not open again once it was dismissed", () => {
    const first = loadApp();
    click(dismissButton(first));
    const stored = saved(first);

    const second = loadApp({ storage: stored });
    expect(backdrop(second).hidden).toBe(true);
  });

  it("opens again on the next launch if it was never dismissed", () => {
    // nothing is saved until the user acts, so closing the tab early keeps it pending
    const first = loadApp();
    expect(first.window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    const second = loadApp();
    expect(backdrop(second).hidden).toBe(false);
  });
});

describe("dismissing the intro", () => {
  it("closes on the button and remembers it in storage", () => {
    const dom = loadApp();
    click(dismissButton(dom));
    expect(backdrop(dom).hidden).toBe(true);
    expect(saved(dom).settings.introSeen).toBe(true);
  });

  it("closes on Escape", () => {
    const dom = loadApp();
    keydown(dom.window.document.body, "Escape");
    expect(backdrop(dom).hidden).toBe(true);
    expect(saved(dom).settings.introSeen).toBe(true);
  });

  it("closes when the dimmed area outside the dialog is clicked", () => {
    const dom = loadApp();
    click(backdrop(dom));
    expect(backdrop(dom).hidden).toBe(true);
  });

  it("stays open when the dialog itself is clicked", () => {
    const dom = loadApp();
    click(dom.window.document.querySelector(".modal"));
    click(dom.window.document.querySelector(".intro-list"));
    expect(backdrop(dom).hidden).toBe(false);
  });

  it("ignores Escape while it is closed", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [], settings: {} } });
    keydown(dom.window.document.body, "Escape");
    expect(backdrop(dom).hidden).toBe(true);
    expect(dom.window.document.querySelector(".edit-form")).toBeNull();
  });

  it("keeps Tab inside the dialog", () => {
    const dom = loadApp();
    dom.window.document.getElementById("add-input").focus();
    const event = new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    dom.window.document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(dom.window.document.activeElement).toBe(dismissButton(dom));
  });

  it("does not block Tab once the dialog is closed", () => {
    const dom = loadApp();
    click(dismissButton(dom));
    const event = new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    dom.window.document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("opening the intro again", () => {
  it("the help link reopens it after it was dismissed", () => {
    const dom = loadApp();
    click(dismissButton(dom));
    click(helpButton(dom));
    expect(backdrop(dom).hidden).toBe(false);
    expect(dom.window.document.activeElement).toBe(dismissButton(dom));
  });

  it("returns focus to the help link when closed again", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [], settings: {} } });
    helpButton(dom).focus();
    click(helpButton(dom));
    click(dismissButton(dom));
    expect(backdrop(dom).hidden).toBe(true);
    expect(dom.window.document.activeElement).toBe(helpButton(dom));
  });

  it("reopening and closing does not rewrite anything for an existing user", () => {
    const dom = loadApp({ storage: { version: 1, tasks: [], settings: { resetMinutes: 240 } } });
    const before = dom.window.localStorage.getItem(STORAGE_KEY);
    click(helpButton(dom));
    click(dismissButton(dom));
    expect(dom.window.localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});

describe("intro content", () => {
  it("explains both task types, priority and privacy, and is labelled for screen readers", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const dialog = doc.querySelector(".modal");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(doc.getElementById(dialog.getAttribute("aria-labelledby"))).not.toBeNull();

    const text = doc.querySelector(".intro-list").textContent;
    expect(doc.querySelectorAll(".intro-list li")).toHaveLength(4);
    expect(text).toContain("Daily");
    expect(text).toContain("Just today");
    expect(text).toContain("priority");
    expect(text).toContain("Private");
  });

  it("marks the illustrations as decorative", () => {
    const dom = loadApp();
    const icons = [...dom.window.document.querySelectorAll(".intro-icon")];
    expect(icons).toHaveLength(4);
    expect(icons.every((icon) => icon.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});

describe("importing a backup", () => {
  it("counts as having seen the intro, even if the file says otherwise", async () => {
    const dom = loadApp();
    click(dismissButton(dom));
    const backup = { version: 1, tasks: [], settings: { resetMinutes: 0, introSeen: false } };
    const file = { text: async () => JSON.stringify(backup) };
    setFiles(dom.window.document.getElementById("import-input"), [file]);
    await flush();
    expect(plain(getState(dom)).settings.introSeen).toBe(true);
  });
});
