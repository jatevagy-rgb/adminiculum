import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import {
  computeAnchoredLayout,
  type RailLayoutItem,
} from "../src/components/documents/reader/railAnchorLayout";
import {
  resolveRailItemOffset,
  resolveTextAnchorOffset,
} from "../src/lib/documents/readerAnchorMeasure";

/**
 * Document Workspace review rail — targeted comment anchor repair.
 *
 * Live acceptance: modification proposals anchored beside their selected text,
 * but comments (whose stored `startOffset` may be absent on legacy rows or after
 * a version re-extraction) were treated as unplaced rail items: they sorted last
 * and computeAnchoredLayout resolved them to `previousBottom + gap`, i.e. the
 * comment card appeared directly below the previous/last review card instead of
 * beside its own quoted text.
 *
 * The pinned contract:
 *  1. a comment resolves its own anchor from its quoted text + stored
 *     prefix/suffix when the numeric offset is missing or no longer fits;
 *  2. the resolved offset drives BOTH ordering and measurement, so the comment
 *     never falls under the previous card because "that is the lowest slot";
 *  3. proposals with numeric offsets stay on the exact legacy path;
 *  4. comment cards use the canonical light-blue info family, proposals keep
 *     their own family, and accept/reject/reply affordances are preserved;
 *  5. the scroll-jump repair (synchronous item-set recompute) is untouched.
 */

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

const margin = () => read("src/components/documents/reader/DocumentReviewMargin.tsx");
const hook = () => read("src/components/documents/reader/useReaderRailLayout.ts");
const rail = () => read("src/components/documents/reader/DocumentReviewRail.tsx");

const DOCUMENT_TEXT =
  "Bevezetés. A megrendelő 30 napon belül fizet. Közbenső szöveg. A megoldás. A megrendelő 30 napon belül fizet. Zárás.";
const FIRST_OCCURRENCE = DOCUMENT_TEXT.indexOf("30 nap");
const SECOND_OCCURRENCE = DOCUMENT_TEXT.indexOf("30 nap", FIRST_OCCURRENCE + 1);
const SECOND_PREFIX = DOCUMENT_TEXT.slice(SECOND_OCCURRENCE - 24, SECOND_OCCURRENCE);
const SECOND_SUFFIX = DOCUMENT_TEXT.slice(SECOND_OCCURRENCE + 6, SECOND_OCCURRENCE + 30);

function unresolvedComment(): RailLayoutItem {
  return {
    id: "c-deep",
    kind: "comment",
    startOffset: null,
    endOffset: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    selectedText: "30 nap",
    textPrefix: SECOND_PREFIX,
    textSuffix: SECOND_SUFFIX,
  };
}

const PROPOSAL: RailLayoutItem = {
  id: "p-shallow",
  kind: "proposal",
  startOffset: 0,
  endOffset: 9,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------- ANCHOR RECOVERY

test("comment anchor recovery picks the occurrence matched by the stored context", () => {
  assert.notEqual(SECOND_OCCURRENCE, FIRST_OCCURRENCE, "fixture must contain a duplicate phrase");
  assert.equal(
    resolveTextAnchorOffset(DOCUMENT_TEXT, {
      selectedText: "30 nap",
      textPrefix: SECOND_PREFIX,
      textSuffix: SECOND_SUFFIX,
    }),
    SECOND_OCCURRENCE,
    "the stored prefix/suffix disambiguate the duplicate phrase",
  );
});

test("comment anchor recovery falls back to the first occurrence when context no longer matches", () => {
  assert.equal(
    resolveTextAnchorOffset(DOCUMENT_TEXT, {
      selectedText: "30 nap",
      textPrefix: "Ez a környezet már nem létezik. ",
      textSuffix: "sem ez a folytatás.",
    }),
    FIRST_OCCURRENCE,
  );
});

test("comment anchor recovery never fabricates an anchor for absent text", () => {
  assert.equal(resolveTextAnchorOffset(DOCUMENT_TEXT, { selectedText: "45 nap" }), null);
  assert.equal(resolveTextAnchorOffset(DOCUMENT_TEXT, { selectedText: "" }), null);
});

test("only comments without a usable numeric offset are recovered; proposals are untouched", () => {
  assert.equal(resolveRailItemOffset(DOCUMENT_TEXT, unresolvedComment()), SECOND_OCCURRENCE);
  assert.equal(
    resolveRailItemOffset(DOCUMENT_TEXT, { kind: "comment", startOffset: 15 }),
    15,
    "a usable comment offset always wins over text recovery",
  );
  assert.equal(
    resolveRailItemOffset(DOCUMENT_TEXT, {
      kind: "comment",
      startOffset: DOCUMENT_TEXT.length + 500,
      selectedText: "30 nap",
      textPrefix: SECOND_PREFIX,
      textSuffix: SECOND_SUFFIX,
    }),
    SECOND_OCCURRENCE,
    "an offset that no longer fits the rendered version text is recovered from the comment's own text",
  );
  assert.equal(
    resolveRailItemOffset(DOCUMENT_TEXT, { kind: "comment", startOffset: DOCUMENT_TEXT.length + 500 }),
    DOCUMENT_TEXT.length + 500,
    "an out-of-range offset without recoverable text keeps the legacy numeric value",
  );
  assert.equal(resolveRailItemOffset(DOCUMENT_TEXT, PROPOSAL), 0);
  assert.equal(
    resolveRailItemOffset(DOCUMENT_TEXT, { kind: "proposal", startOffset: null }),
    null,
    "proposals keep the exact legacy unplaced behaviour",
  );
});

// ---------------------------------------------------------------- ORDERING + POSITION

test("a resolved comment anchors at its own position and never stacks under the previous card", () => {
  const resolvedOffset = resolveRailItemOffset(DOCUMENT_TEXT, unresolvedComment());
  assert.equal(resolvedOffset, SECOND_OCCURRENCE);
  const resolved: RailLayoutItem = { ...unresolvedComment(), startOffset: resolvedOffset };

  // Documents the defect this repair fixes: without recovery the comment is
  // unplaced, sorts last and lands exactly under the previous card.
  const before = computeAnchoredLayout({
    items: [PROPOSAL, unresolvedComment()],
    desiredYById: { "p-shallow": 40 },
    heightById: { "p-shallow": 60 },
    gap: 12,
  });
  assert.equal(before.positions["c-deep"], 112, "unplaced comment fell directly below the proposal card");

  const after = computeAnchoredLayout({
    items: [PROPOSAL, resolved],
    desiredYById: { "p-shallow": 40, "c-deep": 2000 },
    heightById: { "p-shallow": 60, "c-deep": 80 },
    gap: 12,
  });
  assert.equal(after.positions["c-deep"], 2000, "the comment keeps its own measured anchor Y");
  assert.equal(after.positions["p-shallow"], 40, "proposal positioning is unchanged");
});

// ---------------------------------------------------------------- MAPPING + HOOK WIRING

test("the margin maps each comment's own text hints into its layout item", () => {
  const source = margin();
  assert.match(source, /selectedText: entry\.comment\.selectedText/);
  assert.match(source, /textPrefix: entry\.comment\.textPrefix/);
  assert.match(source, /textSuffix: entry\.comment\.textSuffix/);
  assert.match(source, /style=\{absoluteTop\(positions\[entry\.comment\.id\]\)\}/);
  assert.match(source, /style=\{absoluteTop\(positions\[entry\.proposal\.id\]\)\}/);
});

test("the layout hook recovers comment anchors before ordering and measuring; proposals stay numeric", () => {
  const source = hook();
  assert.match(source, /resolveRailItemOffset\(rootText, item\)/);
  assert.match(source, /item\.kind !== "comment"/);
  assert.match(source, /computeAnchoredLayout\(\{ items: layoutItems/);
  // Scroll-jump repair stays intact: item-set changes recompute synchronously.
  assert.match(source, /useLayoutEffect\(\(\) => \{\s*recompute\(\);\s*\}, \[recompute, itemsKey\]\)/);
});

// ---------------------------------------------------------------- VISUAL DIFFERENTIATION

test("comment cards use the canonical light-blue info family and proposals keep their own", () => {
  const source = rail();
  const commentCard = source.slice(source.indexOf("function CommentCard"), source.indexOf("Narrow-viewport review list"));
  assert.ok(commentCard.length > 0, "CommentCard block must be extractable");
  assert.match(commentCard, /--adm-semantic-info-soft/);
  assert.match(commentCard, /--adm-semantic-info-border/);

  const proposalCard = source.slice(source.indexOf("export function ProposalCard"));
  assert.doesNotMatch(proposalCard, /--adm-semantic-info/, "proposal styling must stay out of the info family");
  assert.match(proposalCard, /--adm-border-canonical/);

  // Reply and decision affordances are preserved.
  assert.match(commentCard, /reader-rail-reply-submit/);
  assert.match(commentCard, /reader-rail-comment/);
  assert.match(proposalCard, /reader-rail-proposal-accept/);
  assert.match(proposalCard, /reader-rail-proposal-reject/);
});

// ---------------------------------------------------------------- DOM (runtime pipeline)

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html?: string, options?: any) => any;
};

function rect(top: number, bottom: number) {
  return { top, bottom, height: bottom - top, left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => ({}) };
}

/** Global text offset of a DOM point relative to the article root. */
function globalTextOffset(root: any, containerNode: any, offset: number): number {
  const ownerDocument = root.ownerDocument;
  const walker = ownerDocument.createTreeWalker(root, 4);
  let total = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === containerNode) return total + offset;
    total += node.data.length;
    node = walker.nextNode();
  }
  return total;
}

test("DOM: a comment without a numeric offset renders beside its own quoted text, keeps its position on rail reload, and carries the blue info styling", async () => {
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
  setGlobal("Range", dom.window.Range);
  setGlobal("Event", dom.window.Event);
  setGlobal("KeyboardEvent", dom.window.KeyboardEvent);
  setGlobal("requestAnimationFrame", (cb: any) => setTimeout(() => cb(Date.now()), 0));
  setGlobal("cancelAnimationFrame", (id: any) => clearTimeout(id));
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const article = dom.window.document.createElement("article");
  article.textContent = DOCUMENT_TEXT;
  dom.window.document.body.appendChild(article);

  const originalElementRect = dom.window.Element.prototype.getBoundingClientRect;
  const originalRangeRect = dom.window.Range.prototype.getBoundingClientRect;
  // Layout model: both the article and the positioning container start at Y=0,
  // so a measured anchor Y equals 100 + its character offset.
  dom.window.Element.prototype.getBoundingClientRect = function () {
    return rect(0, 9000);
  };
  dom.window.Range.prototype.getBoundingClientRect = function () {
    const top = 100 + globalTextOffset(article, this.startContainer, this.startOffset);
    return rect(top, top);
  };

  try {
    const React: any = await import("react");
    setGlobal("React", React);
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);
    const { DocumentReviewMargin } = await import("../src/components/documents/reader/DocumentReviewMargin");

    const comment = {
      id: "c-deep",
      reviewComment: "Fizetési határidő?",
      selectedText: "30 nap",
      startOffset: null,
      endOffset: null,
      textPrefix: SECOND_PREFIX,
      textSuffix: SECOND_SUFFIX,
      contentFingerprint: null,
      createdBy: { id: "u1", name: "Anna" },
      createdAt: "2026-02-01T00:00:00.000Z",
      resolvedAt: null,
      replyCount: 0,
    };
    const proposal = {
      id: "p-shallow",
      selectedText: "Bevezetés",
      proposedText: "Előszó",
      rationale: null,
      status: "PENDING",
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
      createdBy: { id: "u1", name: "Anna" },
      createdAt: "2026-01-01T00:00:00.000Z",
      startOffset: 0,
      endOffset: 9,
      contentFingerprint: null,
    };
    const railDto = {
      documentId: "d1",
      documentVersionId: "v1",
      versionNumber: 1,
      counts: {
        commentCount: 1,
        modificationProposalCount: 1,
        pendingProposalCount: 1,
        acceptedProposalCount: 0,
        rejectedProposalCount: 0,
        proposalDecisionComplete: false,
      },
      readyForCorrection: false,
      comments: [comment],
      proposals: [proposal],
    };
    const props = {
      rail: railDto,
      loading: false,
      error: false,
      onRetry: () => {},
      filter: "all",
      onFilterChange: () => {},
      activeItemId: null,
      onFocusComment: () => {},
      onFocusProposal: () => {},
      canDecide: false,
      currentUserId: null,
      decisionBusyId: null,
      onAccept: () => {},
      onReject: () => {},
      onWithdraw: () => {},
      repliesByAnnotationId: {},
      onLoadReplies: () => {},
      onSubmitReply: () => {},
      replyBusyId: null,
      documentRef: { current: article },
    };

    await React.act(async () => { root.render(React.createElement(DocumentReviewMargin, props)); });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const commentEl = container.querySelector('[data-testid="reader-rail-comment"]');
    const proposalEl = container.querySelector('[data-testid="reader-rail-proposal"]');
    assert.ok(commentEl, "comment card must render");
    assert.ok(proposalEl, "proposal card must render");

    assert.equal(commentEl.style.top, `${100 + SECOND_OCCURRENCE}px`, "the comment is measured at its own quoted text");
    assert.equal(proposalEl.style.top, "100px", "proposal positioning is unchanged");
    assert.notEqual(commentEl.style.top, "112px", "the comment must not fall back under the previous card");

    assert.match(commentEl.className, /--adm-semantic-info-soft/, "comment card uses the light-blue info background");
    assert.match(commentEl.className, /--adm-semantic-info-border/, "comment card uses the info border");
    assert.doesNotMatch(proposalEl.className, /--adm-semantic-info/, "proposal card keeps its own family");

    // reloadRail: a fresh DTO object with identical content must not move the card.
    await React.act(async () => {
      root.render(
        React.createElement(DocumentReviewMargin, {
          ...props,
          rail: { ...railDto, comments: [{ ...comment }], proposals: [{ ...proposal }] },
        }),
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const reloaded = container.querySelector('[data-testid="reader-rail-comment"]');
    assert.equal(reloaded.style.top, commentEl.style.top, "rail reload keeps the comment beside its own text");
  } finally {
    dom.window.Element.prototype.getBoundingClientRect = originalElementRect;
    dom.window.Range.prototype.getBoundingClientRect = originalRangeRect;
    dom.window.close();
  }
});
