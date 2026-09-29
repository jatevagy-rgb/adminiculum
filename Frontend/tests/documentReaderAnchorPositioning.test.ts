import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  computeAnchoredLayout,
  type RailLayoutItem,
} from "../src/components/documents/reader/railAnchorLayout";

/**
 * Document Workspace live-acceptance repair — anchored annotation rendering and
 * selection-toolbar positioning.
 *
 * Live acceptance failed twice: comment/suggestion cards rendered as a stacked
 * side list unrelated to the referenced text, and the selection action toolbar
 * appeared near the top of the page instead of next to the selection for text
 * lower in the document. These assertions pin the repaired contract:
 *
 *  1. once anchor positions are measured, cards land beside their text ranges;
 *  2. the rail layout re-measures when the document mounts AFTER the rail items
 *     (the live ordering that produced the stacked top-of-margin list);
 *  3. the selection toolbar is positioned with root-relative coordinates inside
 *     the scrolling flow, never viewport-fixed;
 *  4. the anchored margin stays the primary desktop presentation and the
 *     accept/reject suggestion controls remain present.
 */

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

const workspace = () => read("src/components/documents/reader/DocumentReaderWorkspace.tsx");
const margin = () => read("src/components/documents/reader/DocumentReviewMargin.tsx");
const rail = () => read("src/components/documents/reader/DocumentReviewRail.tsx");
const layoutHook = () => read("src/components/documents/reader/useReaderRailLayout.ts");
const toolbar = () => read("src/components/documents/reader/DocumentSelectionToolbar.tsx");

// ---------------------------------------------------------------- ANCHORED RENDERING

test("measured anchor tops position cards beside their referenced text ranges", () => {
  const items: RailLayoutItem[] = [
    { id: "a", kind: "comment", startOffset: 100, endOffset: 110, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", kind: "proposal", startOffset: 1400, endOffset: 1410, createdAt: "2026-01-01T00:00:00.000Z" },
  ];
  const { positions, contentHeight } = computeAnchoredLayout({
    items,
    desiredYById: { a: 340, b: 1900 },
    heightById: { a: 80, b: 90 },
    gap: 12,
  });
  assert.equal(positions.a, 340, "the first card sits at its measured anchor line, not top 0");
  assert.equal(positions.b, 1900, "the second card sits at its measured anchor line, not stacked below the first");
  assert.equal(contentHeight, 2002);
});

test("the rail layout re-measures when the document mounts after the rail items", () => {
  const source = layoutHook();
  // The live failure ordering: rail items arrive before the version text, the
  // document element mounts later without changing any hook dependency.
  assert.match(source, /observedNodes/);
  assert.match(source, /const container = containerRef\.current \?\? null;/);
  assert.match(source, /const document = documentRef\.current \?\? null;/);
  assert.match(source, /if \(container !== observedNodes\.container \|\| document !== observedNodes\.document\)/);
  assert.match(source, /setObservedNodes\(\{ container, document \}\);\s*\n\s*scheduleRecompute\(\);/);
  // Resize observation must follow the mounted nodes, not the refs, so the
  // document element is observed from the moment it exists.
  assert.match(source, /for \(const element of \[observedNodes\.container, observedNodes\.document\]\)/);
  assert.match(source, /\[observedNodes\.container, observedNodes\.document, enabled, itemsKey, scheduleRecompute\]/);
  // Existing live-measurement behaviour is preserved.
  assert.match(source, /measureAnchorYPositions/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /addEventListener\("resize"/);
  assert.match(source, /requestAnimationFrame/);
});

test("the anchored margin stays the primary desktop presentation", () => {
  const workspaceSource = workspace();
  assert.match(workspaceSource, /<DocumentReviewMargin/);
  assert.match(workspaceSource, /documentRef=\{readerRootRef\}/);
  const marginSource = margin();
  assert.match(marginSource, /data-testid="document-review-margin"/);
  assert.match(marginSource, /style=\{absoluteTop\(positions\[entry\.comment\.id\]\)\}/);
  assert.match(marginSource, /style=\{absoluteTop\(positions\[entry\.proposal\.id\]\)\}/);
});

// ---------------------------------------------------------------- SELECTION TOOLBAR POSITION

test("the selection toolbar uses root-relative scroll-container coordinates, not viewport-fixed", () => {
  const source = workspace();
  // Root-relative measurement: selection rect and workspace root rect are both
  // live viewport readings, so the difference is the document-flow offset.
  assert.match(source, /workspaceRootRef/);
  assert.match(source, /ref=\{workspaceRootRef\}/);
  assert.match(source, /const rootRect = workspaceRootRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(source, /const above = rect\.top - rootRect\.top - 44;/);
  assert.match(source, /rect\.bottom - rootRect\.top \+ 8/, "near the workspace top the toolbar drops below the selection");
  assert.match(source, /rect\.left - rootRect\.left/);
  assert.match(source, /rootRect\.width - 300/);
  // The toolbar renders inside the workspace root, which lives in the same
  // scroll region as the document, so it stays beside the selection.
  assert.match(source, /style=\{\{ position: 'absolute', top: toolbarPos\.top, left: toolbarPos\.left \}\}/);
  assert.doesNotMatch(source, /position: 'fixed'/, "the toolbar must not float on the viewport");
  // The two primary selection actions are unchanged.
  assert.match(toolbar(), /data-testid="reader-selection-comment"/);
  assert.match(toolbar(), /data-testid="reader-selection-proposal"/);
});

// ---------------------------------------------------------------- EXISTING SUGGESTION ACTIONS

test("accept/reject suggestion controls remain present", () => {
  const railSource = rail();
  assert.match(railSource, /data-testid="reader-rail-proposal-accept"/);
  assert.match(railSource, /data-testid="reader-rail-proposal-reject"/);
  assert.match(railSource, /entry\.proposal\.status === "PENDING" && canDecide/);
  const workspaceSource = workspace();
  assert.match(workspaceSource, /acceptDocumentModificationProposal/);
  assert.match(workspaceSource, /rejectDocumentModificationProposal/);
});
