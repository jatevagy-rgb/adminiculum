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
  // Accept and Reject buttons have min-h-[36px]
  assert.match(content, /data-testid="reader-rail-proposal-accept"[\s\S]*?min-h-\[36px\]/, "Accept button must have min-h-[36px]");
  assert.match(content, /data-testid="reader-rail-proposal-reject"[\s\S]*?min-h-\[36px\]/, "Reject button must have min-h-[36px]");
});

test("lawyer review mobile UX: DocumentReviewWorkflowPanel has comfortable touch targets for point closing", () => {
  const panelPath = path.resolve(process.cwd(), "src/components/documents/review/DocumentReviewWorkflowPanel.tsx");
  const content = readFileSync(panelPath, "utf-8");

  assert.match(content, /min-h-\[36px\]/, "Point resolution button must have min-h-[36px]");
  assert.match(content, /min-h-\[40px\]/, "Workflow transition buttons must have min-h-[40px]");
});
