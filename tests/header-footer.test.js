import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/dom.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("header logo mark", () => {
  it("renders a decorative mark before the title text", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const h1 = doc.querySelector(".title");
    const mark = h1.querySelector(".logo-mark");

    expect(mark).not.toBeNull();
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    // decorative only - must not add a redundant word to the accessible name
    expect(mark.textContent.trim()).toBe("");
    // first child so it reads before "Yarukoto", matching the favicon's position
    expect(h1.firstElementChild).toBe(mark);
  });
});

describe("footer github link", () => {
  it("links to the repo and opens in a new tab safely", () => {
    const dom = loadApp();
    const link = dom.window.document.querySelector(".page-footer a.link-button");

    expect(link).not.toBeNull();
    expect(link.href).toBe("https://github.com/ClemPera/yarukoto");
    expect(link.target).toBe("_blank");
    // required alongside target=_blank so the new tab can't reach window.opener
    expect(link.rel.split(" ")).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    expect(link.textContent).toBe("github");
  });
});

describe("page height", () => {
  // jsdom has no layout engine, so this can't assert the rendered gap is
  // gone - it guards the CSS rule that caused it: body defaulted to
  // align-items: stretch, which stretched .page to fill the full 100vh
  // even when its content was much shorter, leaving a large empty area
  // below the footer.
  it("body does not stretch its flex item to fill the viewport", () => {
    const css = readFileSync(join(ROOT, "styles.css"), "utf8");
    const bodyRule = css.match(/(?:^|\n)body\s*\{[^}]*\}/)[0];

    expect(bodyRule).toMatch(/align-items:\s*flex-start/);
    expect(bodyRule).not.toMatch(/align-items:\s*stretch/);
  });
});
