import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const STORAGE_KEY = "yarukoto-data";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Fixed local-time instant (Sunday 2026-03-15 10:30). Every app started by
// loadApp() sees this as "now", so date-dependent behavior is deterministic
// in any timezone.
export const FIXED_NOW = new Date(2026, 2, 15, 10, 30, 0);

const html = readFileSync(join(ROOT, "index.html"), "utf8");
const appSource = readFileSync(join(ROOT, "app.js"), "utf8");
// Inline app.js the way index.html would load it, so tests exercise the real
// wiring (one classic script against the real markup).
const bootHtml = html.replace(
  '<script src="app.js"></script>',
  `<script>${appSource.replaceAll("</script>", "<\\/script>")}</script>`
);

/**
 * Boot the real index.html + app.js in jsdom.
 *
 * Options:
 * - now: Date used by the app for `new Date()` / `Date.now()` (default FIXED_NOW).
 * - storage: value seeded into localStorage before the app loads. Pass an
 *   object to store JSON, or a string to store raw text (for corrupt-data tests).
 * - reducedMotion: makes matchMedia("(prefers-reduced-motion: reduce)") match.
 * - confirm: initial return value of window.confirm (mutable via setConfirm).
 */
export function loadApp({ now = FIXED_NOW, storage, reducedMotion = false, confirm = true } = {}) {
  const dom = new JSDOM(bootHtml, {
    url: "https://localhost/",
    runScripts: "dangerously",
    beforeParse(window) {
      const RealDate = window.Date;
      class MockDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) super(now.getTime());
          else super(...args);
        }
        static now() {
          return now.getTime();
        }
      }
      window.Date = MockDate;

      window.matchMedia = (query) => ({
        matches: reducedMotion && query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      });

      window.__confirm = confirm;
      window.confirm = () => window.__confirm;
      window.__alerts = [];
      window.alert = (message) => window.__alerts.push(message);

      window.__animationCalls = [];
      window.Element.prototype.animate = function (keyframes, options) {
        window.__animationCalls.push({ element: this, keyframes, options });
        return {
          finished: Promise.resolve(),
          cancel() {},
          finish() {},
          play() {},
          pause() {},
          reverse() {},
          commitStyles() {},
          addEventListener() {},
          removeEventListener() {},
          playState: "finished",
          playbackRate: 1,
          onfinish: null,
        };
      };

      window.__objectUrls = [];
      window.__revokedUrls = [];
      window.URL.createObjectURL = (blob) => {
        const url = `blob:mock-${window.__objectUrls.length}`;
        window.__objectUrls.push({ url, blob });
        return url;
      };
      window.URL.revokeObjectURL = (url) => window.__revokedUrls.push(url);

      // jsdom does not implement downloads; record clicks instead of navigating.
      window.__anchorClicks = [];
      window.HTMLAnchorElement.prototype.click = function () {
        window.__anchorClicks.push({ href: this.href, download: this.download });
      };

      if (storage !== undefined) {
        window.localStorage.setItem(
          STORAGE_KEY,
          typeof storage === "string" ? storage : JSON.stringify(storage)
        );
      }
    },
  });

  return dom;
}

// Read app.js script-global lexical bindings (state, editingId) that are not
// properties of window.
export function getState(dom) {
  return dom.window.eval("state");
}

export function setState(dom, value) {
  dom.window.eval(`state = ${JSON.stringify(value)}`);
}

export function getEditingId(dom) {
  return dom.window.eval("editingId");
}

export function setEditingId(dom, value) {
  dom.window.eval(`editingId = ${JSON.stringify(value)}`);
}

export function setConfirm(dom, value) {
  dom.window.__confirm = value;
}

export function click(el) {
  el.dispatchEvent(
    new el.ownerDocument.defaultView.MouseEvent("click", { bubbles: true, cancelable: true })
  );
}

export function change(el, value) {
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

export function submit(form) {
  form.dispatchEvent(
    new form.ownerDocument.defaultView.Event("submit", { bubbles: true, cancelable: true })
  );
}

export function keydown(el, key) {
  el.dispatchEvent(
    new el.ownerDocument.defaultView.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    })
  );
}

export function setFiles(input, files) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new input.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

// Let pending microtasks (e.g. async import handlers) settle.
export function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Copy a cross-realm value into the test realm for structural assertions.
export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
