import assert from "node:assert/strict";
import test from "node:test";
import {
  computeExactSelectionAnchor,
  splitTextByHighlights,
} from "../src/lib/documents/readerDomRange";
import { canDecideProposal, mergeRailEntries } from "../src/components/documents/reader/readerContracts";

const TEXT = "első 30 nap vége, majd második 30 nap vége.";

// jsdom is an explicit devDependency that canonical frontend CI installs. When
// it is absent locally the DOM tests skip instead of failing the whole suite.
function loadJsdom(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require("jsdom") as any).JSDOM ?? null;
  } catch {
    return null;
  }
}

test("splitTextByHighlights rejoins the canonical text byte-for-byte", () => {
  const segments = splitTextByHighlights(TEXT, [
    { start: 5, end: 11, className: "x", key: "a" },
    { start: 31, end: 37, className: "y", key: "b" },
  ]);
  assert.equal(segments.map((segment) => segment.text).join(""), TEXT);
});

test("duplicate selected text anchors the ACTUAL selected occurrence, not the first indexOf", (t) => {
  const JSDOM = loadJsdom();
  if (!JSDOM) {
    t.skip("jsdom unavailable in this environment");
    return;
  }

  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  const { window } = dom;
  (globalThis as any).window = window;
  (globalThis as any).document = window.document;
  const root = window.document.getElementById("root") as HTMLElement;
  root.appendChild(window.document.createTextNode(TEXT));

  const first = TEXT.indexOf("30 nap");
  const second = TEXT.indexOf("30 nap", first + 1);
  assert.notEqual(first, second, "fixture must contain a duplicate phrase");

  const range = window.document.createRange();
  range.setStart(root.firstChild as Node, second);
  range.setEnd(root.firstChild as Node, second + "30 nap".length);
  const stubSelection = {
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => range,
  } as unknown as Selection;

  const anchor = computeExactSelectionAnchor(root, stubSelection, TEXT);
  assert.ok(anchor, "anchor must be produced for a valid selection");
  assert.equal(anchor.startOffset, second, "anchor must use the selected (second) occurrence");
  assert.notEqual(anchor.startOffset, first, "anchor must NOT collapse to the first indexOf occurrence");
  assert.equal(anchor.endOffset, second + "30 nap".length);
  assert.equal(TEXT.slice(anchor.startOffset, anchor.endOffset), anchor.selectedText);
});

test("a selection outside the reader root is refused", (t) => {
  const JSDOM = loadJsdom();
  if (!JSDOM) {
    t.skip("jsdom unavailable in this environment");
    return;
  }

  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  const { window } = dom;
  (globalThis as any).window = window;
  (globalThis as any).document = window.document;
  const root = window.document.getElementById("root") as HTMLElement;
  root.appendChild(window.document.createTextNode(TEXT));

  const outside = window.document.createElement("div");
  outside.textContent = "30 nap";
  window.document.body.appendChild(outside);
  const range = window.document.createRange();
  range.setStart(outside.firstChild as Node, 0);
  range.setEnd(outside.firstChild as Node, 6);
  const stubSelection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range } as unknown as Selection;
  assert.equal(computeExactSelectionAnchor(root, stubSelection, TEXT), null);
});

test("proposal decision authority is lawyer-level only", () => {
  for (const role of ["ADMIN", "PARTNER", "LAWYER", "COLLAB_LAWYER"]) {
    assert.equal(canDecideProposal(role), true, `${role} must be allowed to decide`);
  }
  for (const role of ["TRAINEE", "LEGAL_ASSISTANT", "CLIENT", "EXTERNAL_REVIEWER", "", null, undefined]) {
    assert.equal(canDecideProposal(role as string | null | undefined), false, `${String(role)} must never decide`);
  }
});

test("rail merge is chronological across comments and proposals", () => {
  const merged = mergeRailEntries(
    [
      { id: "c2", createdAt: "2026-01-02T00:00:00.000Z" } as any,
      { id: "c1", createdAt: "2026-01-01T00:00:00.000Z" } as any,
    ],
    [
      { id: "p1", createdAt: "2026-01-03T00:00:00.000Z" } as any,
      { id: "p0", createdAt: "2025-12-31T00:00:00.000Z" } as any,
    ],
  );
  assert.deepEqual(
    merged.map((entry) => (entry.kind === "comment" ? entry.comment.id : entry.proposal.id)),
    ["p0", "c1", "c2", "p1"],
  );
});
