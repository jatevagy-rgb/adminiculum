import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import {
  computeAnchoredLayout,
  orderRailItemsByAnchor,
  type RailLayoutItem,
} from "../src/components/documents/reader/railAnchorLayout";
import { measureOffsetY, offsetToTextPosition } from "../src/lib/documents/readerAnchorMeasure";
import { splitTextByHighlights } from "../src/lib/documents/readerDomRange";
import { mergeRailEntries } from "../src/components/documents/reader/readerContracts";

/**
 * Document Workspace live-acceptance repair — anchor-aligned review UX.
 *
 * Live acceptance failed on the converged reader: too narrow, too sand/legacy,
 * modal authoring, and a chronological feed unrelated to the document. These
 * assertions pin the repaired product contract and the pure layout behaviour.
 */

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const workspace = () => read("src/components/documents/reader/DocumentReaderWorkspace.tsx");
const margin = () => read("src/components/documents/reader/DocumentReviewMargin.tsx");
const rail = () => read("src/components/documents/reader/DocumentReviewRail.tsx");
const commentComposer = () => read("src/components/documents/reader/ReviewCommentComposer.tsx");
const proposalComposer = () => read("src/components/documents/reader/ModificationProposalComposer.tsx");
const layoutHook = () => read("src/components/documents/reader/useReaderRailLayout.ts");

// ---------------------------------------------------------------- LAYOUT WIDTH

test("the default reader abandons the narrow ~860px document contract", () => {
  const source = workspace();
  assert.doesNotMatch(source, /max-w-\[860px\]/, "the bounded 860px document surface must be gone");
  assert.match(source, /max-w-\[1560px\]/, "the document + margin share a wide, bounded working area");
  assert.match(source, /w-\[320px\]/, "the review margin owns a stable column width");
  assert.match(source, /flex-1 whitespace-pre-wrap/, "the document is the dominant flexible column");
});

test("the default reader uses canonical light surfaces, not sand/ivory", () => {
  const source = workspace();
  assert.match(source, /bg-\[var\(--adm-canvas-subtle\)\]/);
  assert.match(source, /bg-\[var\(--adm-canvas-white\)\]/);
  assert.doesNotMatch(source, /adm-sand-/, "no sand surface in the default reader");
  assert.doesNotMatch(source, /adm-ivory-/, "no ivory surface in the default reader");
});

// ---------------------------------------------------------------- OFFSET ORDERING

test("review ordering follows startOffset, not global createdAt", () => {
  const items: RailLayoutItem[] = [
    { id: "late-anchor-early-time", kind: "comment", startOffset: 300, endOffset: 310, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "early-anchor-late-time", kind: "proposal", startOffset: 10, endOffset: 20, createdAt: "2026-06-01T00:00:00.000Z" },
  ];
  assert.deepEqual(
    orderRailItemsByAnchor(items).map((item) => item.id),
    ["early-anchor-late-time", "late-anchor-early-time"],
  );

  const merged = mergeRailEntries(
    [{ id: "c", createdAt: "2026-01-01", startOffset: 200, endOffset: 210 } as any],
    [{ id: "p", createdAt: "2026-01-01", startOffset: 40, endOffset: 50 } as any],
  );
  assert.deepEqual(
    merged.map((entry) => (entry.kind === "comment" ? entry.comment.id : entry.proposal.id)),
    ["p", "c"],
  );
});

test("items without an anchor sort last", () => {
  const items: RailLayoutItem[] = [
    { id: "unplaced", kind: "comment", startOffset: null, endOffset: null, createdAt: "2026-01-01" },
    { id: "placed", kind: "comment", startOffset: 5, endOffset: 9, createdAt: "2026-05-01" },
  ];
  assert.deepEqual(orderRailItemsByAnchor(items).map((item) => item.id), ["placed", "unplaced"]);
});

// ---------------------------------------------------------------- COLLISION

test("nearby anchors stack locally without overlapping", () => {
  const items: RailLayoutItem[] = [
    { id: "a", kind: "comment", startOffset: 0, endOffset: 5, createdAt: "2026-01-01" },
    { id: "b", kind: "proposal", startOffset: 10, endOffset: 15, createdAt: "2026-01-02" },
    { id: "c", kind: "comment", startOffset: 12, endOffset: 18, createdAt: "2026-01-03" },
  ];
  const { positions, contentHeight } = computeAnchoredLayout({
    items,
    desiredYById: { a: 0, b: 40, c: 44 },
    heightById: { a: 100, b: 60, c: 60 },
    gap: 10,
  });
  assert.equal(positions.a, 0);
  assert.equal(positions.b, 110, "b is pushed below a's bottom + gap");
  assert.equal(positions.c, 180, "c is pushed below b's bottom + gap");
  assert.equal(contentHeight, 250);
});

test("identical anchors stack deterministically by createdAt", () => {
  const items: RailLayoutItem[] = [
    { id: "second", kind: "comment", startOffset: 50, endOffset: 60, createdAt: "2026-02-01" },
    { id: "first", kind: "comment", startOffset: 50, endOffset: 60, createdAt: "2026-01-01" },
  ];
  const { positions } = computeAnchoredLayout({
    items,
    desiredYById: { first: 70, second: 70 },
    heightById: { first: 50, second: 50 },
    gap: 12,
  });
  assert.equal(positions.first, 70);
  assert.equal(positions.second, 132);
});

test("an unmeasured anchor falls back to sequential stacking, never NaN", () => {
  const items: RailLayoutItem[] = [
    { id: "x", kind: "comment", startOffset: 5, endOffset: 9, createdAt: "2026-01-01" },
    { id: "y", kind: "comment", startOffset: 8, endOffset: 12, createdAt: "2026-01-02" },
  ];
  const { positions } = computeAnchoredLayout({
    items,
    desiredYById: { x: null, y: null },
    heightById: { x: 40, y: 40 },
    gap: 8,
  });
  assert.equal(positions.x, 0);
  assert.equal(positions.y, 48);
});

// ---------------------------------------------------------------- REFLOW

test("layout recomputes from live measurements on resize and reflow", () => {
  const source = layoutHook();
  assert.match(source, /measureAnchorYPositions/, "positions must come from live DOM measurement");
  assert.match(source, /ResizeObserver/);
  assert.match(source, /addEventListener\("resize"/);
  assert.match(source, /requestAnimationFrame/);
  // Never persists a one-time absolute coordinate.
  assert.doesNotMatch(stripComments(source), /localStorage|sessionStorage/);
});

test("offset→text-node mapping is exact and measurement degrades safely", (t) => {
  const JSDOM = loadJsdom();
  if (!JSDOM) {
    t.skip("jsdom unavailable in this environment");
    return;
  }
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  const { window } = dom;
  const root = window.document.getElementById("root") as HTMLElement;
  const first = window.document.createTextNode("első 30 nap");
  root.appendChild(first);
  root.appendChild(window.document.createElement("mark")).appendChild(window.document.createTextNode(" vége"));

  const position = offsetToTextPosition(root, 5);
  assert.ok(position);
  assert.equal(position!.node.data, "első 30 nap");
  assert.equal(position!.offset, 5);

  // jsdom has no layout engine: measurement must return null, never throw/NaN.
  assert.equal(measureOffsetY(root, root, 5), null);
});

// ---------------------------------------------------------------- AUTHORING

test("the comment composer is an inline anchored card, not a central modal", () => {
  const source = commentComposer();
  assert.doesNotMatch(source, /import \{ Modal \}/, "the comment composer must not be a modal");
  assert.doesNotMatch(source, /role="dialog"/);
  assert.match(source, /data-testid="review-comment-composer"/);
  assert.match(source, /role="group"/);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*setBody\(""\);\s*\}, \[open, targetKey\]\)/,
    "the transient body still resets on close/target change",
  );
});

test("the comment composer can switch to a modification proposal for the SAME anchor", () => {
  const source = commentComposer();
  assert.match(source, /onSwitchToProposal/);
  assert.match(source, /data-testid="review-comment-switch-to-proposal"/);
  const workspaceSource = workspace();
  assert.match(workspaceSource, /const switchToProposal = useCallback/);
  const switchBlock = workspaceSource.slice(
    workspaceSource.indexOf("const switchToProposal"),
    workspaceSource.indexOf("const submitComment"),
  );
  assert.doesNotMatch(stripComments(switchBlock), /setAnchor\(/, "switching must never lose the anchor");
  assert.doesNotMatch(stripComments(switchBlock), /submitComment|submitProposal/, "switching must not submit");
  assert.match(switchBlock, /setCommentComposerOpen\(false\)/);
  assert.match(switchBlock, /setProposalComposerOpen\(true\)/);
});

test("the proposal composer is inline too and can switch back to a comment", () => {
  const source = proposalComposer();
  assert.doesNotMatch(source, /import \{ Modal \}/);
  assert.match(source, /data-testid="proposal-composer"/);
  assert.match(source, /data-testid="proposal-switch-to-comment"/);
  assert.match(source, /setProposedText\(""\);[\s\S]*?setRationale\(""\);[\s\S]*?\}, \[open, targetKey\]\)/);
});

test("the workspace mounts the composer inside the review margin, keyed to the exact anchor", () => {
  const source = workspace();
  // The composer is passed as the anchored draft of the margin, not rendered as a page modal.
  assert.match(margin(), /draft/);
  assert.match(source, /draft=\{isDesktop \? draftNode : null\}/);
  assert.match(source, /targetKey=\{anchor \? `\$\{anchor\.startOffset\}:\$\{anchor\.endOffset\}` : undefined\}/);
  assert.match(source, /draftId=\{READER_DRAFT_ITEM_ID\}/);
  assert.match(source, /draftOffset=\{anchor\?\.startOffset \?\? null\}/);
  assert.doesNotMatch(stripComments(source), /<Modal/);
});

test("direct proposal authoring reuses the same selected anchor and exact offsets", () => {
  const source = workspace();
  assert.match(source, /const openProposalComposer = useCallback/);
  const submitBlock = source.slice(source.indexOf("const submitProposal"), source.indexOf("const focusRailTarget"));
  assert.match(submitBlock, /createDocumentModificationProposal\(documentId, documentVersionId, \{/);
  for (const field of ["selectedText", "startOffset", "endOffset", "proposedText", "rationale"]) {
    assert.match(submitBlock, new RegExp(`${field}:`));
  }
  assert.match(submitBlock, /anchor\.startOffset/);
  assert.match(submitBlock, /anchor\.endOffset/);
});

// ---------------------------------------------------------------- SPATIAL WIRING

test("desktop renders the anchored margin and narrow view falls back to the ordered drawer", () => {
  const source = workspace();
  assert.match(source, /<DocumentReviewMargin/);
  assert.match(source, /documentRef=\{readerRootRef\}/);
  assert.match(source, /hidden w-\[320px\] shrink-0 lg:block/);
  assert.match(source, /draft=\{isDesktop \? null : draftNode\}/, "the narrow list carries the draft instead");
  assert.match(source, /<DocumentReaderRailDrawer/);
});

test("document anchors carry review identity and activate their review item", () => {
  const source = workspace();
  assert.match(source, /anchorId: reviewAnchor\.id/);
  assert.match(source, /data-anchor-id=\{segment\.range\.anchorId\}/);
  assert.match(source, /const activateReviewAnchor = useCallback/);
  assert.match(source, /rail\.comments\.find\(\(entry\) => entry\.id === itemId\)/);
  assert.match(source, /rail\.proposals\.find\(\(entry\) => entry\.id === itemId\)/);
});

test("search highlighting never alters anchor identity", () => {
  const source = workspace();
  // Review anchor ranges come only from the rail's exact offsets.
  assert.match(source, /for \(const comment of rail\.comments\)/);
  assert.match(source, /for \(const proposal of rail\.proposals\)/);
  // Search ranges are a separate presentation layer with their own identity.
  assert.match(source, /testId: 'reader-search-match'/);
  assert.match(source, /testId: 'reader-review-anchor'/);
  // Focusing a rail item still highlights the exact stored range.
  assert.match(source, /setHighlightRange\(\{ start: startOffset, end: endOffset \}\)/);
});

test("splitTextByHighlights resolves overlaps by priority without shifting offsets", () => {
  const text = "abcdef";
  const segments = splitTextByHighlights(text, [
    { start: 1, end: 4, className: "review", key: "review", anchorId: "c1", priority: 10 },
    { start: 2, end: 3, className: "active", key: "active", priority: 30 },
  ]);
  assert.equal(segments.map((segment) => segment.text).join(""), text);
  const activeSegment = segments.find((segment) => segment.text === "c");
  assert.equal(activeSegment?.range?.key, "active", "the highest-priority covering range wins");
});

// ---------------------------------------------------------------- REGRESSION GUARDS

test("comment reply, proposal decision and historical-version behaviour are preserved", () => {
  const railSource = rail();
  assert.match(railSource, /data-testid="reader-rail-reply-submit"/);
  assert.match(railSource, /data-testid="reader-rail-proposal-accept"/);
  assert.match(railSource, /data-testid="reader-rail-proposal-reject"/);
  assert.match(railSource, /entry\.proposal\.status === "PENDING" && canDecide/);
  const workspaceSource = workspace();
  assert.match(workspaceSource, /acceptDocumentModificationProposal/);
  assert.match(workspaceSource, /rejectDocumentModificationProposal/);
  assert.match(workspaceSource, /createDocumentReviewCommentReply/);
  assert.match(workspaceSource, /data-testid="document-reader-historical"/);
});

test("no backend contract is changed and no hand-rolled HTTP is introduced", () => {
  for (const file of [workspace(), margin(), rail(), commentComposer(), proposalComposer(), layoutHook()]) {
    assert.doesNotMatch(file, /fetch\(/);
  }
  assert.match(workspace(), /from "@\/lib\/api"/);
});

// ---------------------------------------------------------------- DOM (runtime)

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as { JSDOM: new (html?: string, options?: any) => any };

function loadJsdom(): any | null {
  try {
    return JSDOM ?? null;
  } catch {
    return null;
  }
}

interface Harness {
  container: any;
  React: any;
  act: (fn: () => void | Promise<void>) => Promise<void>;
  render: (element: any) => Promise<void>;
}

async function withHarness(run: (h: Harness) => Promise<void>): Promise<void> {
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

  const React: any = await import("react");
  setGlobal("React", React);
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const act = (fn: () => void | Promise<void>) => React.act(async () => { await fn(); });
  const render = (element: any) => act(() => { root.render(element); });

  await run({ container, React, act, render });
}

test("DOM: the comment composer renders inline (no dialog) and switching never submits", async () => {
  await withHarness(async ({ container, React, act, render }) => {
    const { ReviewCommentComposer } = await import("../src/components/documents/reader/ReviewCommentComposer");
    let switched = 0;
    let submitted = 0;
    await render(React.createElement(ReviewCommentComposer, {
      open: true,
      selectedText: "30 nap",
      busy: false,
      error: null,
      targetKey: "a",
      onCancel: () => {},
      onSubmit: () => { submitted += 1; },
      onSwitchToProposal: () => { switched += 1; },
    }));

    const composer = container.querySelector('[data-testid="review-comment-composer"]');
    assert.ok(composer, "the inline composer card must render");
    assert.equal(composer.getAttribute("role"), "group");
    assert.equal(container.querySelector('[role="dialog"]'), null, "authoring must not be a central modal");
    assert.ok(container.querySelector('[data-testid="review-comment-input"]'));

    const switchButton = container.querySelector('[data-testid="review-comment-switch-to-proposal"]');
    assert.ok(switchButton);
    await act(() => { switchButton.click(); });
    assert.equal(switched, 1, "the switch action fires for the same anchor");
    assert.equal(submitted, 0, "switching must never submit anything");
  });
});

test("DOM: the proposal composer renders inline and can switch back to a comment", async () => {
  await withHarness(async ({ container, React, act, render }) => {
    const { ModificationProposalComposer } = await import("../src/components/documents/reader/ModificationProposalComposer");
    let switched = 0;
    await render(React.createElement(ModificationProposalComposer, {
      open: true,
      selectedText: "30 nap",
      busy: false,
      error: null,
      targetKey: "a",
      onCancel: () => {},
      onSubmit: () => {},
      onSwitchToComment: () => { switched += 1; },
    }));

    const composer = container.querySelector('[data-testid="proposal-composer"]');
    assert.ok(composer);
    assert.equal(container.querySelector('[role="dialog"]'), null);
    const switchButton = container.querySelector('[data-testid="proposal-switch-to-comment"]');
    assert.ok(switchButton);
    await act(() => { switchButton.click(); });
    assert.equal(switched, 1);
  });
});
