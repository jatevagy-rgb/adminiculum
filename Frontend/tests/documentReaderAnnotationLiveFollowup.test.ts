import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  computeAnchoredLayout,
  type RailLayoutItem,
} from "../src/components/documents/reader/railAnchorLayout";

/**
 * Document Workspace live-acceptance follow-up repair — no scroll jump and
 * anchored post-create state for comment/suggestion authoring.
 *
 * Live acceptance failed after PR #436: selecting text deep in a long DOCX and
 * clicking "Megjegyzés hozzáadása" / "Módosítási javaslat" jumped the shared
 * document + margin scroll container back to the top, so the created
 * comment/suggestion card was no longer beside the selected text.
 *
 * The pinned contract:
 *  1. opening either composer focuses its textarea with `preventScroll`, so the
 *     browser never scrolls the container to reveal a card that is still at its
 *     temporary top fallback;
 *  2. neither the open handlers nor the create handlers touch scrollTop or call
 *     scrollTo/scrollIntoView — creating an item never resets local scroll;
 *  3. the rail layout recomputes SYNCHRONOUSLY when the rendered item set
 *     changes, so a newly mounted draft/card is painted at its measured anchor
 *     Y in the same commit instead of the fallback top (0);
 *  4. a newly created review item with a measurable anchor lands at that
 *     measured top, never fallback 0;
 *  5. accept/reject suggestion controls remain available.
 */

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

const workspace = () => read("src/components/documents/reader/DocumentReaderWorkspace.tsx");
const layoutHook = () => read("src/components/documents/reader/useReaderRailLayout.ts");
const margin = () => read("src/components/documents/reader/DocumentReviewMargin.tsx");
const commentComposer = () => read("src/components/documents/reader/ReviewCommentComposer.tsx");
const proposalComposer = () => read("src/components/documents/reader/ModificationProposalComposer.tsx");
const rail = () => read("src/components/documents/reader/DocumentReviewRail.tsx");

const NO_SCROLL = /scrollTo\s*\(|scrollIntoView\s*\(|scrollTop\s*=|window\.scroll/;

// ---------------------------------------------------------------- SCROLL-SAFE COMPOSER FOCUS

test("the comment composer focuses its textarea with preventScroll, never a bare focus()", () => {
  const source = commentComposer();
  assert.match(source, /focus\(\{ preventScroll: true \}\)/, "the only focus call must not scroll");
  assert.doesNotMatch(source, /\.focus\(\)/, "no bare focus() may remain in the comment composer");
});

test("the proposal composer focuses its textarea with preventScroll, never a bare focus()", () => {
  const source = proposalComposer();
  assert.match(source, /focus\(\{ preventScroll: true \}\)/, "the only focus call must not scroll");
  assert.doesNotMatch(source, /\.focus\(\)/, "no bare focus() may remain in the proposal composer");
});

// ---------------------------------------------------------------- OPEN HANDLERS NEVER SCROLL

test("opening the comment composer never scrolls the shared reader container", () => {
  const source = workspace();
  const block = source.slice(source.indexOf("const openCommentComposer"), source.indexOf("const switchToProposal"));
  assert.match(block, /setCommentComposerOpen\(true\)/);
  assert.doesNotMatch(block, NO_SCROLL, "the comment open handler must not touch scroll");
});

test("opening the proposal composer never scrolls the shared reader container", () => {
  const source = workspace();
  const block = source.slice(source.indexOf("const openProposalComposer"), source.indexOf("const switchToProposal"));
  assert.match(block, /setProposalComposerOpen\(true\)/);
  assert.doesNotMatch(block, NO_SCROLL, "the proposal open handler must not touch scroll");
});

// ---------------------------------------------------------------- CREATE HANDLERS NEVER SCROLL

test("creating a comment never resets the scroll container", () => {
  const source = workspace();
  const block = source.slice(source.indexOf("const submitComment"), source.indexOf("const focusRailTarget"));
  assert.match(block, /createDocumentReviewComment\(/);
  assert.match(block, /reloadRail\(\)/);
  assert.doesNotMatch(block, NO_SCROLL, "the comment create path must not touch scroll");
});

test("creating a proposal never resets the scroll container", () => {
  const source = workspace();
  const block = source.slice(source.indexOf("const submitProposal"), source.indexOf("const focusRailTarget"));
  assert.match(block, /createDocumentModificationProposal\(/);
  assert.match(block, /reloadRail\(\)/);
  assert.doesNotMatch(block, NO_SCROLL, "the proposal create path must not touch scroll");
});

test("the workspace's only document-side scroll call remains the explicit rail focus action", () => {
  const source = workspace();
  const matches = source.match(/scrollIntoView/g) ?? [];
  assert.equal(matches.length, 1, "scrollIntoView may only exist in focusRailTarget");
  assert.match(source, /const focusRailTarget = useCallback/);
  const focusBlock = source.slice(source.indexOf("const focusRailTarget"), source.indexOf("const focusComment"));
  assert.match(focusBlock, /highlightRef\.current\?\.scrollIntoView/);
});

// ---------------------------------------------------------------- SYNCHRONOUS FIRST-PAINT LAYOUT

test("the rail layout recomputes synchronously when the rendered item set changes", () => {
  const source = layoutHook();
  // The item-set layout effect must call recompute() directly (same commit),
  // not defer to a rAF, so a newly opened draft or created card is painted at
  // its measured anchor Y and never first at the fallback top (0).
  assert.match(source, /useLayoutEffect\(\(\) => \{\s*recompute\(\);\s*\}, \[recompute, itemsKey\]\)/);
  // Resize / observer-driven recomputes keep the rAF batching path.
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /measureAnchorYPositions/);
});

test("the anchored margin still positions cards from measured state, including the draft", () => {
  const source = margin();
  assert.match(source, /absoluteTop\(positions\[entry\.comment\.id\]\)/);
  assert.match(source, /absoluteTop\(positions\[entry\.proposal\.id\]\)/);
  assert.match(source, /absoluteTop\(positions\[draftId\]\)/);
  assert.match(source, /registerCard\(draftId\)/);
});

// ---------------------------------------------------------------- MEASURED ANCHOR, NOT FALLBACK 0

test("a newly created review item lands at its measured anchor top, never fallback 0", () => {
  const items: RailLayoutItem[] = [
    { id: "existing", kind: "comment", startOffset: 80, endOffset: 90, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "new-item", kind: "proposal", startOffset: 5000, endOffset: 5020, createdAt: "2026-06-01T00:00:00.000Z" },
  ];
  const { positions } = computeAnchoredLayout({
    items,
    desiredYById: { existing: 260, "new-item": 6200 },
    heightById: { existing: 90, "new-item": 110 },
    gap: 12,
  });
  assert.equal(positions["new-item"], 6200, "the created item keeps its measured top, not 0");
  assert.equal(positions.existing, 260, "existing items keep their measured tops");
});

test("an unmeasured created item still degrades to deterministic stacking, never NaN", () => {
  const items: RailLayoutItem[] = [
    { id: "new-item", kind: "comment", startOffset: 5000, endOffset: 5020, createdAt: "2026-06-01T00:00:00.000Z" },
  ];
  const { positions, contentHeight } = computeAnchoredLayout({
    items,
    desiredYById: { "new-item": null },
    heightById: { "new-item": 80 },
    gap: 12,
  });
  assert.equal(positions["new-item"], 0);
  assert.equal(contentHeight, 92);
});

// ---------------------------------------------------------------- EXISTING SUGGESTION ACTIONS

test("accept/reject suggestion controls remain available", () => {
  const railSource = rail();
  assert.match(railSource, /data-testid="reader-rail-proposal-accept"/);
  assert.match(railSource, /data-testid="reader-rail-proposal-reject"/);
  const workspaceSource = workspace();
  assert.match(workspaceSource, /acceptDocumentModificationProposal/);
  assert.match(workspaceSource, /rejectDocumentModificationProposal/);
  assert.match(workspaceSource, /withdrawDocumentModificationProposal/);
});

// ---------------------------------------------------------------- DOM (runtime, scroll-safe focus)

const { JSDOM } = require("jsdom") as { JSDOM: new (html?: string, options?: any) => any };

test("DOM: opening the composer focuses the textarea with preventScroll", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
  });
  const g: any = globalThis;
  const setGlobal = (name: string, value: any) => {
    Object.defineProperty(g, name, { value, configurable: true, writable: true });
  };
  setGlobal("window", dom.window);
  setGlobal("document", dom.window.document);
  setGlobal("navigator", dom.window.navigator);
  setGlobal("HTMLElement", dom.window.HTMLElement);
  setGlobal("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
  setGlobal("Element", dom.window.Element);
  setGlobal("Node", dom.window.Node);
  setGlobal("Event", dom.window.Event);
  setGlobal("requestAnimationFrame", (cb: any) => setTimeout(() => cb(Date.now()), 0));
  setGlobal("cancelAnimationFrame", (id: any) => clearTimeout(id));
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const recordedFocusOptions: Array<{ preventScroll?: boolean } | undefined> = [];
  const originalFocus = dom.window.HTMLElement.prototype.focus;
  dom.window.HTMLElement.prototype.focus = function (options?: { preventScroll?: boolean }) {
    recordedFocusOptions.push(options);
    return originalFocus.call(this);
  };

  try {
    const React: any = await import("react");
    setGlobal("React", React);
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);
    const { ReviewCommentComposer } = await import("../src/components/documents/reader/ReviewCommentComposer");
    await React.act(async () => {
      root.render(React.createElement(ReviewCommentComposer, {
        open: true,
        selectedText: "30 nap",
        busy: false,
        error: null,
        targetKey: "a",
        onCancel: () => {},
        onSubmit: () => {},
      }));
    });

    const textarea = container.querySelector('[data-testid="review-comment-input"]');
    assert.ok(textarea, "the composer textarea must render");
    assert.ok(
      recordedFocusOptions.some((options) => options?.preventScroll === true),
      "the composer must request a scroll-safe focus",
    );
    assert.equal(dom.window.document.activeElement, textarea, "the textarea receives focus");
  } finally {
    dom.window.HTMLElement.prototype.focus = originalFocus;
    dom.window.close();
  }
});
