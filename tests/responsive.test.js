import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/dom.js";

// jsdom has no layout engine, so these can't measure a rendered page. They pin
// the CSS properties that keep long text inside the card (found by measuring
// the real page in a browser at 320-768px), plus the markup those selectors
// rely on, so neither can drift apart unnoticed.

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css"), "utf8");

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&");

function declarations(body) {
  return Object.fromEntries(
    body
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const at = part.indexOf(":");
        return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
      }),
  );
}

// A top-level rule: the selector starts its line, so rules nested inside an
// @media block (which are indented) are not picked up by mistake.
function rule(selector) {
  const match = CSS.match(new RegExp(`(?:^|\\n)${escape(selector)}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no top-level rule for ${selector}`);
  return declarations(match[1]);
}

function phoneRule(selector) {
  const media = CSS.match(/@media \(max-width: 400px\) \{([\s\S]*?)\n\}/);
  if (!media) throw new Error("no phone media query");
  const match = media[1].match(new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no ${selector} rule in the phone media query`);
  return declarations(match[1]);
}

function narrowRule(selector) {
  const media = CSS.match(/@media \(max-width: 34rem\) \{([\s\S]*?)\n\}/);
  if (!media) throw new Error("no 34rem media query");
  const match = media[1].match(new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no ${selector} rule in the 34rem media query`);
  return declarations(match[1]);
}

function rootDeclarations() {
  const match = CSS.match(/(?:^|\n):root\s*\{([^}]*)\}/);
  if (!match) throw new Error("no :root block");
  return declarations(match[1]);
}

function darkRootDeclarations() {
  const dark = CSS.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/);
  if (!dark) throw new Error("no dark media query");
  const match = dark[1].match(/:root\s*\{([^}]*)\}/);
  if (!match) throw new Error("no :root block in the dark media query");
  return declarations(match[1]);
}

describe("long task titles", () => {
  it("the title is the part of the row that shrinks and wraps", () => {
    const title = rule(".task-title");
    expect(title.flex).toBe("1");
    // without min-width: 0 a flex item never shrinks below its longest word
    expect(title["min-width"]).toBe("0");
    expect(title["overflow-wrap"]).toBe("break-word");
  });

  it("the controls stay on the first line of a wrapped title", () => {
    expect(rule(".task-row")["align-items"]).toBe("flex-start");
  });

  it("the controls never shrink to make room for the title", () => {
    for (const selector of [".task-priority", ".task-check", ".task-edit", ".task-delete"]) {
      const flex = rule(selector).flex;
      expect(flex, selector).toBe("none");
    }
  });

  it("the controls share one height so their centers line up with the first line", () => {
    expect(rule(".task-priority").height).toBe("1.6rem");
    expect(rule(".task-edit").height).toBe("1.6rem");
    expect(rule(".task-delete").height).toBe("1.6rem");
  });
});

describe("history", () => {
  it("long titles wrap and the date keeps its own column", () => {
    expect(rule(".history-list li > :first-child")["min-width"]).toBe("0");
    expect(rule(".history-list li > :first-child")["overflow-wrap"]).toBe("break-word");
    expect(rule(".history-date").flex).toBe("none");
    expect(rule(".history-date")["white-space"]).toBe("nowrap");
    expect(rule(".history-list li").gap).toBeTruthy();
  });

  it("habit names wrap and the axis and dot rows share a seven-column grid", () => {
    expect(rule(".habit-history-title")["overflow-wrap"]).toBe("break-word");
    for (const selector of [".habit-axis", ".habit-dots"]) {
      const declarations = rule(selector);
      expect(declarations.display, selector).toBe("grid");
      expect(declarations["grid-template-columns"], selector).toBe(
        "repeat(7, minmax(0, 1fr))"
      );
    }
  });

  it("dots are readable tap targets with a visible ring", () => {
    const dot = rule(".habit-dot");
    expect(dot.height).toBe("2rem");
    expect(dot.border).toBe("none");

    const ring = rule(".habit-dot::before");
    expect(ring.width).toBe("0.9rem");
    expect(ring.height).toBe("0.9rem");
    expect(ring.border).toBe("1.5px solid var(--ink-soft)");
  });

  it("the completed list is built as title first, date last, as the CSS expects", () => {
    const dom = loadApp({
      storage: {
        version: 1,
        tasks: [
          {
            id: "a",
            title: "Done a while ago",
            type: "today",
            priority: "normal",
            createdAt: "2026-03-01",
            completed: true,
            completions: ["2026-03-10"],
          },
        ],
        settings: { resetMinutes: 0, introSeen: true },
      },
    });
    const item = dom.window.document.querySelector("#history-today li");
    expect(item.children).toHaveLength(2);
    expect(item.firstElementChild.classList.contains("history-date")).toBe(false);
    expect(item.firstElementChild.textContent).toBe("Done a while ago");
    expect(item.lastElementChild.classList.contains("history-date")).toBe(true);
  });
});

describe("activity dialog", () => {
  it("opens in a wide dialog that stays inside the viewport", () => {
    const dialog = rule(".activity-dialog");
    expect(dialog.width).toBe("min(96vw, 80rem)");
    expect(dialog["max-width"]).toBe("100%");
    expect(dialog["min-width"]).toBe("0");
    expect(rule(".activity-dialog-backdrop").padding).toBe("1.25rem");
    expect(rule(".activity-dialog-head .modal-title")["font-size"]).toBe("1.55rem");
  });

  it("wraps the view toggle and filter instead of overflowing at 320px", () => {
    const toolbar = rule(".activity-dialog-toolbar");
    expect(toolbar.display).toBe("flex");
    expect(toolbar["flex-wrap"]).toBe("wrap");
    expect(toolbar["justify-content"]).toBe("space-between");
    expect(rule(".activity-dialog-toolbar .activity-filter").flex).toBe("1 1 12rem");
    expect(rule(".activity-filter").flex).toBe("1 1 9rem");
    expect(rule(".activity-view-toggle").flex).toBe("none");
    expect(rule(".activity-view-button")["font-size"]).toBe("0.78rem");
    expect(rule(".activity-filter select").flex).toBe("1");
    expect(rule(".activity-filter select")["min-width"]).toBe("0");
    expect(rule(".activity-filter select").width).toBeUndefined();
  });

  it("centers the period header between its arrows", () => {
    const nav = rule(".activity-period-nav");
    expect(nav.display).toBe("flex");
    expect(nav["justify-content"]).toBe("center");
  });

  it("renders a compact seven-column month calendar, capped and centered", () => {
    const grid = rule(".activity-month-grid");
    expect(grid.display).toBe("grid");
    expect(grid["grid-template-columns"]).toBe("repeat(7, minmax(0, 1fr))");
    expect(grid.width).toBe("100%");
    expect(grid["max-width"]).toBe("16rem");
    expect(grid.margin).toBe("0 auto");
    expect(grid.gap).toBe("0.3rem");
    expect(rule(".activity-month-grid .activity-weekday")["justify-content"]).toBe("center");
  });

  it("sizes cells from their column so they grow without overflowing", () => {
    const cell = rule(".activity-cell");
    expect(cell.width).toBeUndefined();
    expect(cell["min-width"]).toBe("0");
    expect(cell["aspect-ratio"]).toBe("1");
  });

  it("fits the whole year in the dialog without a scroll wrapper on desktop", () => {
    expect(CSS).not.toContain(".activity-year-grid-full");

    const grid = rule(".activity-year-grid");
    expect(grid.display).toBe("grid");
    expect(grid.width).toBe("100%");
    expect(grid["grid-template-columns"]).toBe(
      "2.4rem repeat(var(--year-weeks, 53), minmax(0, 1fr))"
    );
    expect(grid["grid-template-rows"]).toBe("auto repeat(7, auto)");
    expect(grid["--year-gap"]).toBe("0.32rem");
    expect(grid.gap).toBe("var(--year-gap)");
    expect(grid["overflow-x"]).toBeUndefined();

    const graph = rule(".activity-dialog-graph");
    expect(graph.width).toBe("100%");
    expect(graph["min-width"]).toBe("0");
    expect(graph["overflow-x"]).toBeUndefined();
  });

  it("puts the month labels above their week spans and clips them", () => {
    const label = rule(".activity-year-month");
    expect(label["font-size"]).toBe("0.8rem");
    expect(label["white-space"]).toBe("nowrap");
    expect(label.overflow).toBe("hidden");
    expect(label["text-overflow"]).toBe("ellipsis");
  });

  it("keeps the weekday labels in their own fixed column", () => {
    const labels = rule(".activity-year-weekdays");
    expect(labels["grid-column"]).toBe("1 / -1");
    expect(labels["grid-row"]).toBe("2 / span 7");
    expect(labels.width).toBe("2.4rem");
    expect(rule(".activity-year-grid .activity-weekday")["font-size"]).toBe("0.82rem");
  });

  it("has no fixed width or min-width that could overflow the dialog at 320px", () => {
    const section = CSS.slice(CSS.indexOf(".activity-filter {"), CSS.indexOf("/* on phones"));
    const widths = [
      ...section.matchAll(/(?:^|[;{\s])(?:min-)?width:\s*([\d.]+)rem/g),
    ].map((match) => Number(match[1]));

    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((width) => width <= 16)).toBe(true);
  });

  it("uses readable labels, gaps, cells and swatches", () => {
    expect(parseFloat(rule(".activity-period-label")["font-size"])).toBeGreaterThan(0.75);
    expect(parseFloat(rule(".activity-weekday")["font-size"])).toBeGreaterThan(0.5);
    expect(parseFloat(rule(".activity-month-grid").gap)).toBeGreaterThan(0.0625);
    expect(rule(".activity-swatch").width).toBe("0.9rem");
  });

  it("paints explicit level colors instead of fading one fill", () => {
    const light = rootDeclarations();
    const dark = darkRootDeclarations();

    for (const level of [0, 1, 2, 3, 4]) {
      const name = `--activity-level-${level}`;
      expect(light[name], `light ${name}`).toBeTruthy();
      expect(dark[name], `dark ${name}`).toBeTruthy();
      expect(CSS).toMatch(
        new RegExp(
          `\\.activity-cell\\.level-${level}[^{]*\\{[^}]*background:\\s*var\\(${name}\\)`
        )
      );
      expect(CSS).toMatch(
        new RegExp(
          `\\.activity-swatch\\.level-${level}[^{]*\\{[^}]*background:\\s*var\\(${name}\\)`
        )
      );
    }

    expect(light["--activity-level-4"]).toBe("var(--daily-mark)");
    expect(dark["--activity-level-4"]).toBe("var(--daily-mark)");
    expect(CSS).not.toMatch(/\.activity-(?:cell|swatch)[^{}]*\{[^}]*\bopacity\s*:/);
  });

  it("draws no-data days differently from not-done days", () => {
    const noData = rule(".activity-cell.is-no-data");
    expect(noData.background).toBe("transparent");
    expect(noData.border).toBe("1px dashed var(--paper-line)");
  });

  it("rings today's cell with a visible outline", () => {
    const ring = rule(".activity-cell.is-today");
    expect(ring.outline).toBe("2px solid var(--ink)");
    expect(ring["outline-offset"]).toBe("1px");
  });

  it("keeps padding and future cells in the grid but invisible", () => {
    expect(rule(".activity-cell.is-out").visibility).toBe("hidden");
  });

  it("hides the year layout switch on desktop and shows it under 34rem", () => {
    expect(rule(".activity-year-layout").display).toBe("none");
    expect(narrowRule(".activity-year-layout").display).toBe("flex");
  });

  it("fits the phone month heatmap without horizontal overflow", () => {
    const months = rule(".activity-year-months");
    expect(months.display).toBe("grid");
    expect(months["grid-template-columns"]).toBe("2.1rem repeat(31, minmax(0, 1fr))");
    expect(months.width).toBe("100%");
    expect(months["min-width"]).toBe("0");
    expect(months["overflow-x"]).toBeUndefined();
  });

  it("scrolls only the phone week grid, with a sticky weekday column", () => {
    const scroll = rule(".activity-year-scroll");
    expect(scroll["overflow-x"]).toBe("auto");
    expect(scroll["overflow-y"]).toBe("hidden");
    expect(rule(".activity-dialog-graph")["overflow-x"]).toBeUndefined();

    const grid = rule(".activity-year-scroll .activity-year-grid");
    expect(grid["grid-template-columns"]).toBe(
      "1.6rem repeat(var(--year-weeks, 53), 0.62rem)"
    );
    expect(grid.width).toBe("max-content");
    expect(rule(".activity-year-scroll .activity-year-weekdays")["position"]).toBe("sticky");
  });
});

describe("footer", () => {
  it("wraps onto more rows instead of running past the card", () => {
    expect(rule(".page-footer")["flex-wrap"]).toBe("wrap");
  });

  it("links have vertical padding so they are comfortable to tap", () => {
    expect(rule(".link-button").padding).toMatch(/^0\.4rem 0$/);
  });

  it("every footer item is a direct child, which is what wraps", () => {
    const dom = loadApp();
    const footer = dom.window.document.querySelector(".page-footer");
    const items = [...footer.children].map((el) => el.textContent.trim());
    expect(items).toEqual(["history", "settings", "activity", "export", "import", "help", "github"]);
  });
});

describe("phone widths", () => {
  it("uses less padding so titles get more room", () => {
    expect(phoneRule("body").padding).toBe("1.25rem 0.75rem");
    expect(phoneRule(".page").padding).toBe("1.4rem 0.9rem 1.2rem");
    expect(phoneRule(".task-row").gap).toBe("0.45rem");
  });

  it("compacts the activity dialog to fit 320px", () => {
    expect(phoneRule(".activity-dialog-backdrop").padding).toBe("0.5rem");
    expect(phoneRule(".activity-dialog").padding).toBe("0.9rem 0.85rem 0.85rem");
    expect(phoneRule(".activity-dialog-head .modal-title")["font-size"]).toBe("1.2rem");
    expect(phoneRule(".activity-dialog-toolbar").gap).toBe("0.5rem 0.75rem");
  });
});
