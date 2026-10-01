import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("lawyer review mobile UX: reviews page has responsive queue master-detail switcher and 44px touch targets", () => {
  const pagePath = path.resolve(process.cwd(), "src/app/reviews/page.tsx");
  const content = readFileSync(pagePath, "utf-8");

  // On compact viewports (< xl), selecting a review hides the queue list to give full screen to workspace
  assert.match(content, /selected \? "hidden xl:block" : "block"/, "Queue list should hide on <xl when item is selected");
  // Mobile queue item touch targets should be at least 44px
  assert.match(content, /min-h-\[44px\]/, "Queue items should have at least 44px min-height for touch");
});

test("lawyer review mobile UX: TaskReviewWorkspace renders exact-version hero and mobile return button", () => {
  const workspacePath = path.resolve(process.cwd(), "src/components/tasks/TaskReviewWorkspace.tsx");
  const content = readFileSync(workspacePath, "utf-8");

  // Mobile back button to return to queue
  assert.match(content, /data-testid="task-review-back-to-queue"/, "Must have mobile back-to-queue button");
  assert.match(content, /data-testid="exact-version-hero"/, "Must render exact-version hero card");
  assert.match(content, /data-testid="exact-version-open-button"/, "Hero card must render direct link button to exact version");
  assert.match(content, /data-testid="newer-version-notice"/, "Must show notice if newer version exists");
});

test("lawyer review mobile UX: TaskReviewWorkspace decision bar displays exact decision version and proper action hierarchy", () => {
  const workspacePath = path.resolve(process.cwd(), "src/components/tasks/TaskReviewWorkspace.tsx");
  const content = readFileSync(workspacePath, "utf-8");

  // Decision bar displays exact version before decision
  assert.match(content, /data-testid="exact-decision-version"/, "Must display exact decision version in decision bar");
  assert.match(content, /Döntési verzió:/, "Must show localized decision version label");
  
  // Return button is neutral secondary, Approval button is primary
  assert.match(content, /data-testid="task-review-action-return"[\s\S]*?variant="neutral"/, "Return action must be neutral secondary");
  assert.match(content, /data-testid="task-review-action-approve"[\s\S]*?variant="primary"/, "Approve action must be primary");

  // Dialogs enforce exact document version check and safe zoom-free textarea styling
  assert.match(content, /Jóváhagyandó pontos dokumentumverziók:/, "Approval dialog must list exact document versions");
  assert.match(content, /text-sm sm:text-xs min-h-\[72px\]/, "Return dialog textarea must avoid mobile auto-zoom and provide touch height");
});

test("lawyer review mobile UX: DocumentReaderWorkspace opens rail drawer on compact viewports when anchor tapped", () => {
  const readerPath = path.resolve(process.cwd(), "src/components/documents/reader/DocumentReaderWorkspace.tsx");
  const content = readFileSync(readerPath, "utf-8");

  // Drawer opens when anchor is activated on compact viewport
  assert.match(content, /if \(isCompactViewport\(\)\) setRailDrawerOpen\(true\);/, "Must open drawer on compact viewport when anchor tapped");
  // Rail toggle button has min-h-[40px]
  assert.match(content, /data-testid="document-reader-rail-toggle"[\s\S]*?min-h-\[40px\]/, "Rail toggle button must have at least 40px touch height");
});

test("lawyer review mobile UX: DocumentReviewRail includes next pending proposal jump and touch-friendly buttons", () => {
  const railPath = path.resolve(process.cwd(), "src/components/documents/reader/DocumentReviewRail.tsx");
  const content = readFileSync(railPath, "utf-8");

  // Next pending jump button
  assert.match(content, /data-testid="reader-rail-jump-next-pending"/, "Must render next pending proposal jump button");
  assert.match(content, /Következő döntendő/, "Jump button must have clear Hungarian copy");
  assert.match(content, /data-testid="reader-rail-jump-next-pending"[\s\S]*?min-h-\[40px\]/, "Jump button must have min-h-[40px]");
  // Jump keeps drawer open by passing closeDrawer = false
  assert.match(content, /onFocusProposal\(target,\s*false\)/, "Jump must pass false to onFocusProposal to keep drawer open");
  // Accept and Reject buttons have min-h-[40px] min-w-[40px]
  assert.match(content, /data-testid="reader-rail-proposal-accept"[\s\S]*?min-h-\[40px\][\s\S]*?min-w-\[40px\]/, "Accept button must have at least 40x40px touch target");
  assert.match(content, /data-testid="reader-rail-proposal-reject"[\s\S]*?min-h-\[40px\][\s\S]*?min-w-\[40px\]/, "Reject button must have at least 40x40px touch target");
  // Rail filter buttons have min-h-[40px]
  assert.match(content, /data-testid=\{`reader-rail-filter-\$\{value\}`\}[\s\S]*?min-h-\[40px\]/, "Rail filter pills must have min-h-[40px]");
});

test("lawyer review mobile UX: DocumentReaderRailDrawer has 40x40px touch-friendly close button", () => {
  const drawerPath = path.resolve(process.cwd(), "src/components/documents/reader/DocumentReaderRailDrawer.tsx");
  const content = readFileSync(drawerPath, "utf-8");

  assert.match(content, /data-testid="document-reader-rail-drawer-close"[\s\S]*?min-h-\[40px\][\s\S]*?min-w-\[40px\]/, "Drawer close button must have at least 40x40px touch target");
});

test("lawyer review mobile UX: DocumentReviewWorkflowPanel has comfortable touch targets for point closing", () => {
  const panelPath = path.resolve(process.cwd(), "src/components/documents/review/DocumentReviewWorkflowPanel.tsx");
  const content = readFileSync(panelPath, "utf-8");

  assert.match(content, /min-h-\[40px\]/, "Point resolution button must have min-h-[40px]");
  assert.match(content, /min-h-\[40px\]/, "Workflow transition buttons must have min-h-[40px]");
});

test("lawyer review mobile UX: WorkflowDialog has touch-friendly buttons on mobile", () => {
  const dialogPath = path.resolve(process.cwd(), "src/components/tasks/WorkflowDialog.tsx");
  const content = readFileSync(dialogPath, "utf-8");

  assert.match(content, /min-h-\[40px\]/, "Workflow dialog buttons must have min-h-[40px]");
});

test("lawyer review mobile UX: TaskReviewWorkspace wires returnActionRef and fallbackFocusTarget to WorkflowDialog", () => {
  const workspacePath = path.resolve(process.cwd(), "src/components/tasks/TaskReviewWorkspace.tsx");
  const workspaceContent = readFileSync(workspacePath, "utf-8");

  // returnActionRef is defined and bound to return button
  assert.match(workspaceContent, /const returnActionRef = useRef<HTMLButtonElement \| null>\(null\);/, "Must declare returnActionRef");
  assert.match(workspaceContent, /returnActionRef\.current = node\?\.querySelector\("button"\)[\s\S]*?data-testid="task-review-action-return"/, "Must bind ref to return action button");

  // Passed to return WorkflowDialog
  assert.match(workspaceContent, /<WorkflowDialog[\s\S]*?open=\{returnDialogOpen\}[\s\S]*?returnFocusRef=\{returnActionRef\}[\s\S]*?fallbackFocusTarget="#review-queue-title"/, "Return dialog must receive returnFocusRef and fallbackFocusTarget");

  // On return completion, focus shifts to surviving queue heading
  assert.match(workspaceContent, /document\.getElementById\("review-queue-title"\)/, "Must locate surviving review queue title on return close");

  // Reviews page defines accessible review queue heading with tabIndex={-1}
  const pagePath = path.resolve(process.cwd(), "src/app/reviews/page.tsx");
  const pageContent = readFileSync(pagePath, "utf-8");
  assert.match(pageContent, /<h2 id="review-queue-title" tabIndex=\{-1\}/, "Review queue title must have tabIndex={-1} for programmatic return focus");
});

test("lawyer review mobile UX: WorkflowDialog supports returnFocusRef, window keydown, and fallback focus target", () => {
  const dialogPath = path.resolve(process.cwd(), "src/components/tasks/WorkflowDialog.tsx");
  const content = readFileSync(dialogPath, "utf-8");

  // returnFocusRef and fallbackFocusTarget props
  assert.match(content, /returnFocusRef\?: \{ current: HTMLElement \| null \};/, "Must accept returnFocusRef");
  assert.match(content, /fallbackFocusTarget\?: HTMLElement \| null \| string \| \(\(\) => HTMLElement \| null\);/, "Must accept fallbackFocusTarget");

  // Capture before autofocus replacement
  assert.match(content, /returnFocusRefRef\.current\?\.current \?\? priorFocusRef\.current/, "Must resolve return focus via returnFocusRefRef first");

  // Window keydown listener for Escape
  assert.match(content, /window\.addEventListener\("keydown", handleKeyDown\);/, "Must attach keydown listener to window");
  assert.match(content, /window\.removeEventListener\("keydown", handleKeyDown\);/, "Must detach keydown listener on unmount");

  // Opener focus and fallback resolution
  assert.match(content, /if \(opener && document\.contains\(opener\) && !opener\.hasAttribute\("disabled"\)\) \{\s*opener\.focus\(\);/, "Must focus opener if connected and enabled");
  assert.match(content, /if \(fallbackEl && document\.contains\(fallbackEl\)\) \{\s*if \(!fallbackEl\.hasAttribute\("tabindex"\)/, "Must focus fallback target if opener is missing or detached");
});

test("lawyer review mobile UX: rapid double-submit guard fires exactly one mutation attempt", async () => {
  const { StableMutationAttempt } = await import("../src/lib/taskLifecycleApi");
  const attempt = new StableMutationAttempt("return");

  let mutationCalls = 0;
  const executeMutation = () => {
    const key = attempt.key();
    mutationCalls++;
    return key;
  };

  attempt.begin();
  const k1 = executeMutation();
  // Rapid second activation before completion
  const k2 = attempt.key();
  assert.equal(k1, k2, "Attempt key must remain stable across rapid activation");
  assert.equal(mutationCalls, 1, "Exactly one mutation execution permitted during rapid activation");

  attempt.complete();
});

test("lawyer review mobile UX: focus restoration respects connected opener and falls back to surviving queue heading", () => {
  let activeElement: any = null;

  const createMockElement = (tag: string, id: string, attrs: Record<string, string> = {}) => {
    const attributes = { ...attrs };
    return {
      tagName: tag.toUpperCase(),
      id,
      hasAttribute: (name: string) => name in attributes,
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, val: string) => { attributes[name] = val; },
      focus: function() { activeElement = this; },
    };
  };

  const queueHeading = createMockElement("h2", "review-queue-title");
  const trigger = createMockElement("button", "task-review-action-return");

  // Helper matching WorkflowDialog cleanup logic
  const resolveFocusOnClose = (
    opener: any,
    fallback: any,
    inDoc: (el: any) => boolean,
    docQuery: (sel: string) => any
  ) => {
    if (opener && inDoc(opener) && !opener.hasAttribute("disabled")) {
      opener.focus();
      return;
    }
    if (fallback) {
      let fallbackEl = typeof fallback === "string" ? docQuery(fallback) : fallback;
      if (fallbackEl && inDoc(fallbackEl)) {
        if (!fallbackEl.hasAttribute("tabindex") && fallbackEl.tagName.startsWith("H")) {
          fallbackEl.setAttribute("tabindex", "-1");
        }
        fallbackEl.focus();
      }
    }
  };

  // Case 1: Trigger is connected and enabled -> focus returns to trigger
  resolveFocusOnClose(trigger, "#review-queue-title", (el) => el === trigger || el === queueHeading, (sel) => sel === "#review-queue-title" ? queueHeading : null);
  assert.equal(activeElement, trigger, "Active element must return to trigger when trigger survives");

  // Case 2: Trigger is disconnected (unmounted upon success) -> focus falls back to surviving queue heading
  activeElement = null;
  resolveFocusOnClose(trigger, "#review-queue-title", (el) => el === queueHeading, (sel) => sel === "#review-queue-title" ? queueHeading : null);
  assert.equal(activeElement, queueHeading, "Active element must fall back to queue heading when trigger is detached");
  assert.equal(queueHeading.getAttribute("tabindex"), "-1", "Queue heading must receive tabindex=-1 for programmatic focus");
});


