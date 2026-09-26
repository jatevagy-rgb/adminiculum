import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Runtime proof (real React 19 + jsdom) for the five targeted repairs:
// first reply, drawer focus mechanics, and composer state reset.
//
// jsdom is a declared devDependency installed by canonical frontend CI.

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as { JSDOM: new (html?: string, options?: any) => any };

interface Harness {
  window: any;
  document: any;
  container: any;
  React: any;
  act: (fn: () => void | Promise<void>) => Promise<void>;
  render: (element: any) => Promise<void>;
  unmount: () => Promise<void>;
  flush: () => Promise<void>;
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
  setGlobal("KeyboardEvent", dom.window.KeyboardEvent);
  setGlobal("MouseEvent", dom.window.MouseEvent);
  setGlobal("requestAnimationFrame", (cb: any) => setTimeout(() => cb(Date.now()), 0));
  setGlobal("cancelAnimationFrame", (id: any) => clearTimeout(id));
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const React: any = await import("react");
  // tsx compiles JSX with the classic runtime; expose React to the compiled
  // component modules (Next.js handles this via its own automatic runtime).
  setGlobal("React", React);
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const act = (fn: () => void | Promise<void>) => React.act(async () => { await fn(); });
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 15));
  const render = (element: any) => act(() => { root.render(element); });
  const unmount = () => act(() => { root.unmount(); });

  // Globals are intentionally left installed for the whole file (node:test runs
  // each file in its own process): React schedules some discrete-event work
  // after the assertion, and tearing the DOM down mid-flight raises a spurious
  // `window is not defined`.
  await run({ window: dom.window, document: dom.window.document, container, React, act, render, unmount, flush });
}

function setTextareaValue(node: any, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(node.ownerDocument.defaultView.HTMLTextAreaElement.prototype, "value")!;
  descriptor.set!.call(node, value);
  node.dispatchEvent(new node.ownerDocument.defaultView.Event("input", { bubbles: true }));
}

function zeroReplyComment() {
  return {
    id: "c1",
    reviewComment: "Első megjegyzés",
    selectedText: "30 nap",
    startOffset: 5,
    endOffset: 11,
    textPrefix: null,
    textSuffix: null,
    contentFingerprint: null,
    createdBy: { id: "u1", name: "Anna" },
    createdAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    replyCount: 0,
  };
}

function railDto(comment: any) {
  return {
    documentId: "d1",
    documentVersionId: "v1",
    versionNumber: 1,
    counts: {
      commentCount: 1,
      modificationProposalCount: 0,
      pendingProposalCount: 0,
      acceptedProposalCount: 0,
      rejectedProposalCount: 0,
      proposalDecisionComplete: false,
    },
    readyForCorrection: false,
    comments: [comment],
    proposals: [],
  };
}

// ---------------------------------------------------------------- DEFECT 1

test("first reply: a zero-reply comment exposes the reply action and can submit the first reply", async () => {
  await withHarness(async ({ container, React, act, render, flush }) => {
    const { DocumentReviewRail } = await import("../src/components/documents/reader/DocumentReviewRail");
    const submitted: Array<[string, string]> = [];
    let loadCalls = 0;

    await render(React.createElement(DocumentReviewRail, {
      rail: railDto(zeroReplyComment()),
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
      onLoadReplies: () => { loadCalls += 1; },
      onSubmitReply: (id: string, body: string) => { submitted.push([id, body]); },
      replyBusyId: null,
    }));

    const toggle = container.querySelector('[data-testid="reader-rail-comment-replies-toggle"]');
    assert.ok(toggle, "a zero-reply comment must expose a reply toggle");
    assert.equal(toggle.getAttribute("data-reply-count"), "0");
    assert.match(toggle.textContent, /Válasz/);

    await act(() => { toggle.click(); });
    assert.equal(loadCalls, 0, "a zero-reply comment must not issue a pre-flight GET");

    const input = container.querySelector('[data-testid="reader-rail-reply-input"]');
    assert.ok(input, "the first-reply composer must appear");

    await act(() => { setTextareaValue(input, "Első válasz"); });
    const submit = container.querySelector('[data-testid="reader-rail-reply-submit"]');
    await act(() => { submit.click(); });
    await flush();

    assert.deepEqual(submitted, [["c1", "Első válasz"]]);
  });
});

test("existing replies still load lazily and render", async () => {
  await withHarness(async ({ container, React, act, render }) => {
    const { DocumentReviewRail } = await import("../src/components/documents/reader/DocumentReviewRail");
    let loadCalls = 0;

    await render(React.createElement(DocumentReviewRail, {
      rail: railDto({ ...zeroReplyComment(), replyCount: 1 }),
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
      repliesByAnnotationId: { c1: [{ id: "r1", body: "Korábbi válasz", createdBy: { id: "u2", name: "Béla" }, createdAt: "2026-01-02T00:00:00.000Z" }] as any },
      onLoadReplies: () => { loadCalls += 1; },
      onSubmitReply: () => {},
      replyBusyId: null,
    }));

    const toggle = container.querySelector('[data-testid="reader-rail-comment-replies-toggle"]');
    assert.match(toggle.textContent, /Válaszok \(1\)/);
    await act(() => { toggle.click(); });
    assert.equal(loadCalls, 1, "an existing-reply comment loads its replies lazily");
    assert.match(container.textContent, /Korábbi válasz/);
  });
});

// ---------------------------------------------------------------- DEFECT 4

test("drawer: focus enters the drawer, Tab stays contained and Escape closes with focus restored", async () => {
  await withHarness(async ({ window, document, container, React, act, render, flush }) => {
    const { DocumentReaderRailDrawer } = await import("../src/components/documents/reader/DocumentReaderRailDrawer");
    let closeCalls = 0;

    function HarnessComponent() {
      const openerRef = React.useRef(null);
      const [open, setOpen] = React.useState(true);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement("button", { ref: openerRef, "data-testid": "opener" }, "open"),
        React.createElement(
          DocumentReaderRailDrawer,
          {
            open,
            onClose: () => { closeCalls += 1; setOpen(false); },
            returnFocusRef: openerRef,
          },
          React.createElement("button", { "data-testid": "inside" }, "inside"),
        ),
      );
    }

    await render(React.createElement(HarnessComponent));
    await flush();

    const drawer = container.querySelector('[data-testid="document-reader-rail-drawer"]');
    const closeButton = container.querySelector('[data-testid="document-reader-rail-drawer-close"]');
    const inside = container.querySelector('[data-testid="inside"]');
    assert.ok(drawer && closeButton && inside);

    // FOCUS ENTERS the drawer.
    assert.ok(drawer.contains(document.activeElement), "focus must move into the drawer on open");

    // TAB CONTAINMENT: from the last focusable, Tab wraps to the first.
    inside.focus();
    assert.equal(document.activeElement, inside);
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    assert.equal(document.activeElement, closeButton, "Tab from the last focusable wraps to the first");

    // ESCAPE closes and restores focus to the opener.
    await act(() => { window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await flush();
    assert.equal(closeCalls, 1, "Escape closes the drawer");
    assert.equal(container.querySelector('[data-testid="document-reader-rail-drawer"]'), null);
    assert.equal(document.activeElement, container.querySelector('[data-testid="opener"]'), "focus returns to the opener");
  });
});

// ---------------------------------------------------------------- DEFECT 5

test("comment composer resets its body on close and on target change", async () => {
  await withHarness(async ({ container, React, act, render }) => {
    const { ReviewCommentComposer } = await import("../src/components/documents/reader/ReviewCommentComposer");
    const view = (open: boolean, targetKey: string) =>
      React.createElement(ReviewCommentComposer, {
        open,
        selectedText: "30 nap",
        busy: false,
        error: null,
        targetKey,
        onCancel: () => {},
        onSubmit: () => {},
      });

    await render(view(true, "a"));
    let input = container.querySelector('[data-testid="review-comment-input"]');
    await act(() => { setTextareaValue(input, "Piszkozat"); });
    assert.equal(input.value, "Piszkozat");

    await render(view(false, "a"));
    await render(view(true, "a"));
    input = container.querySelector('[data-testid="review-comment-input"]');
    assert.equal(input.value, "", "cancel/reopen must reset the comment body");

    await act(() => { setTextareaValue(input, "Másik piszkozat"); });
    await render(view(true, "b"));
    input = container.querySelector('[data-testid="review-comment-input"]');
    assert.equal(input.value, "", "switching target must reset the comment body");
  });
});

test("proposal composer resets proposed text and rationale on close", async () => {
  await withHarness(async ({ container, React, act, render }) => {
    const { ModificationProposalComposer } = await import("../src/components/documents/reader/ModificationProposalComposer");
    const view = (open: boolean) =>
      React.createElement(ModificationProposalComposer, {
        open,
        selectedText: "30 nap",
        busy: false,
        error: null,
        targetKey: "a",
        onCancel: () => {},
        onSubmit: () => {},
      });

    await render(view(true));
    await act(() => { setTextareaValue(container.querySelector('[data-testid="proposal-suggested-text"]'), "30 munkanap"); });
    await act(() => { setTextareaValue(container.querySelector('[data-testid="proposal-rationale"]'), "Pontosítás"); });

    await render(view(false));
    await render(view(true));
    assert.equal(container.querySelector('[data-testid="proposal-suggested-text"]').value, "");
    assert.equal(container.querySelector('[data-testid="proposal-rationale"]').value, "");
  });
});

test("reject dialog resets its reason on close and on target change", async () => {
  await withHarness(async ({ container, React, act, render }) => {
    const { ProposalDecisionDialog } = await import("../src/components/documents/reader/ProposalDecisionDialog");
    const view = (open: boolean, targetKey: string) =>
      React.createElement(ProposalDecisionDialog, {
        open,
        busy: false,
        error: null,
        originalText: "30 nap",
        proposedText: "30 munkanap",
        targetKey,
        onCancel: () => {},
        onConfirm: () => {},
      });

    await render(view(true, "A"));
    await act(() => { setTextareaValue(container.querySelector('[data-testid="proposal-reject-reason"]'), "Nem indokolt"); });
    assert.equal(container.querySelector('[data-testid="proposal-reject-reason"]').value, "Nem indokolt");

    await render(view(true, "B"));
    assert.equal(container.querySelector('[data-testid="proposal-reject-reason"]').value, "", "another proposal starts with an empty reason");

    await act(() => { setTextareaValue(container.querySelector('[data-testid="proposal-reject-reason"]'), "Új indok"); });
    await render(view(false, "B"));
    await render(view(true, "B"));
    assert.equal(container.querySelector('[data-testid="proposal-reject-reason"]').value, "", "close/reopen resets the reason");
  });
});
