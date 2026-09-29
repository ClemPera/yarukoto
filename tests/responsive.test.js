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

  it("habit names wrap and the dot row can wrap on tiny screens", () => {
    expect(rule(".habit-history-title")["overflow-wrap"]).toBe("break-word");
    expect(rule(".habit-dots")["flex-wrap"]).toBe("wrap");
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
    expect(items).toEqual(["history", "settings", "export", "import", "help", "github"]);
  });
});

describe("phone widths", () => {
  it("uses less padding so titles get more room", () => {
    expect(phoneRule("body").padding).toBe("1.25rem 0.75rem");
    expect(phoneRule(".page").padding).toBe("1.4rem 0.9rem 1.2rem");
    expect(phoneRule(".task-row").gap).toBe("0.45rem");
  });
});
