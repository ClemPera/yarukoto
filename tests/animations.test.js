import { loadApp, plain } from "./helpers/dom.js";

function addRow(dom, id, top, { rowEnter = false, list = "daily-list" } = {}) {
  const doc = dom.window.document;
  const li = doc.createElement("li");
  li.className = "task-row" + (rowEnter ? " row-enter" : "");
  if (id !== null) li.dataset.id = id;
  li.getBoundingClientRect = () => ({
    top,
    left: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: top,
  });
  doc.getElementById(list).append(li);
  return li;
}

describe("burstConfetti", () => {
  it("appends 12 pieces at the element's center with custom properties", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const source = doc.createElement("button");
    source.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      width: 20,
      height: 10,
      right: 120,
      bottom: 60,
    });

    dom.window.burstConfetti(source);

    const pieces = doc.querySelectorAll(".confetti-piece");
    expect(pieces.length).toBe(12);
    pieces.forEach((piece) => {
      expect(piece.style.left).toBe("110px");
      expect(piece.style.top).toBe("55px");
      expect(piece.style.getPropertyValue("--dx")).not.toBe("");
      expect(piece.style.getPropertyValue("--dy")).not.toBe("");
      expect(piece.style.getPropertyValue("--rot")).not.toBe("");
    });
  });

  it("removes a piece on animationend", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const source = doc.createElement("button");
    source.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });

    dom.window.burstConfetti(source);
    const pieces = doc.querySelectorAll(".confetti-piece");
    pieces[0].dispatchEvent(new dom.window.Event("animationend"));

    expect(doc.querySelectorAll(".confetti-piece").length).toBe(11);
  });

  it("does nothing when reduced motion is preferred", () => {
    const dom = loadApp({ reducedMotion: true });
    const source = dom.window.document.createElement("button");
    dom.window.burstConfetti(source);
    expect(dom.window.document.querySelectorAll(".confetti-piece").length).toBe(0);
  });
});

describe("captureRowTops", () => {
  it("maps data-id to row top and ignores rows without data-id", () => {
    const dom = loadApp();
    const doc = dom.window.document;
    const daily = doc.getElementById("daily-list");
    const today = doc.getElementById("today-list");
    addRow(dom, "a", 10);
    addRow(dom, "b", 20, { list: "today-list" });
    const noId = doc.createElement("li");
    noId.className = "task-row";
    noId.getBoundingClientRect = () => ({ top: 30 });
    daily.append(noId);

    const tops = dom.window.captureRowTops([daily, today]);
    expect(tops.size).toBe(2);
    expect(tops.get("a")).toBe(10);
    expect(tops.get("b")).toBe(20);
  });
});

describe("animateRowMoves", () => {
  it("animates a row from its previous top to its current top", () => {
    const dom = loadApp();
    const row = addRow(dom, "a", 40);

    dom.window.animateRowMoves(new Map([["a", 100]]));

    expect(dom.window.__animationCalls.length).toBe(1);
    const call = dom.window.__animationCalls[0];
    expect(call.element).toBe(row);
    expect(plain(call.keyframes)).toEqual([
      { transform: "translateY(60px)" },
      { transform: "translateY(0)" },
    ]);
    expect(plain(call.options)).toEqual({ duration: 200, easing: "ease-out" });
  });

  it("animates multiple rows in one call", () => {
    const dom = loadApp();
    const a = addRow(dom, "a", 40);
    const b = addRow(dom, "b", 200);

    dom.window.animateRowMoves(
      new Map([
        ["a", 100],
        ["b", 150],
      ])
    );

    expect(dom.window.__animationCalls.length).toBe(2);
    expect(dom.window.__animationCalls[0].element).toBe(a);
    expect(dom.window.__animationCalls[1].element).toBe(b);
    expect(plain(dom.window.__animationCalls[1].keyframes)).toEqual([
      { transform: "translateY(-50px)" },
      { transform: "translateY(0)" },
    ]);
  });

  it("skips rows that are entering", () => {
    const dom = loadApp();
    addRow(dom, "a", 40, { rowEnter: true });
    dom.window.animateRowMoves(new Map([["a", 100]]));
    expect(dom.window.__animationCalls.length).toBe(0);
  });

  it("skips ids that are not in the previous tops map", () => {
    const dom = loadApp();
    addRow(dom, "a", 40);
    dom.window.animateRowMoves(new Map([["b", 100]]));
    expect(dom.window.__animationCalls.length).toBe(0);
  });

  it("skips moves smaller than one pixel", () => {
    const dom = loadApp();
    addRow(dom, "a", 40.6);
    dom.window.animateRowMoves(new Map([["a", 40]]));
    expect(dom.window.__animationCalls.length).toBe(0);
  });

  it("does nothing when reduced motion is preferred", () => {
    const dom = loadApp({ reducedMotion: true });
    addRow(dom, "a", 40);
    dom.window.animateRowMoves(new Map([["a", 100]]));
    expect(dom.window.__animationCalls.length).toBe(0);
  });
});
