import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Focused coverage for the Document Workspace full rework:
// URL-driven four-mode routing, the dominant next-action model, canonical
// comparison pairing, and truthful approval/rejected-segment semantics.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const page = () => read("src/app/cases/[caseId]/documents/page.tsx");
const tabs = () => read("src/components/documents/workContext/DocumentWorkspaceTabs.tsx");
const canonicalChanges = () => read("src/components/documents/comparison/CanonicalChangesWorkspace.tsx");
const projection = () => read("src/lib/documents/reviewProjectionApi.ts");
const reviewWorkflow = () => read("src/components/documents/review/DocumentReviewWorkflowPanel.tsx");

test("MODE_URL_DEFAULT_DOCUMENT: absent mode binds to document", () => {
  const source = page();
  assert.match(source, /const requestedMode = searchParams\?\.get\("mode"\) \?\? null/);
  assert.match(source, /requestedMode === "changes" \|\| requestedMode === "review" \|\| requestedMode === "versions"/);
  assert.match(source, /\? requestedMode\s*\n?\s*: "document"/);
});

test("MODE_URL_REVIEW_DEEP_LINK: mode=review resolves the review surface", () => {
  const source = page();
  assert.match(source, /searchParams\?\.get\("mode"\)/);
  assert.match(source, /requestedMode === "review"/);
  assert.match(source, /activeMode === 'review'/);
});

test("MODE_SWITCH_PRESERVES_DOCUMENT_ID and VERSION_ID", () => {
  const source = page();
  const fn = source.slice(source.indexOf("const syncWorkspaceModeToUrl"), source.indexOf("};", source.indexOf("const syncWorkspaceModeToUrl")));
  assert.match(fn, /new URLSearchParams\(searchParams\?\.toString\(\)\)/);
  // only the mode key is rewritten; documentId/versionId ride along verbatim
  assert.match(fn, /params\.set\("mode", mode\)/);
  assert.match(fn, /params\.delete\("mode"\)/);
  assert.doesNotMatch(fn, /set\("documentId"|delete\("versionId"|set\("versionId"/);
});

test("BACK_FORWARD_RELOAD_MODE: mode is URL-driven, not in-memory", () => {
  const source = page();
  assert.match(source, /const activeMode: WorkspaceMode =/);
  assert.match(source, /router\[history\]\(nextUrl\)/);
  assert.doesNotMatch(source, /useState<'document' \| 'changes' \| 'review' \| 'versions'>/);
});

test("NEXT_ACTION_NAVIGATION: forward codes route to owning mode", () => {
  const source = page();
  for (const [code, mode] of [
    ["RUN_COMPARISON", "changes"],
    ["REVIEW_CHANGE_SEGMENTS", "changes"],
    ["START_REVIEW", "review"],
    ["SUBMIT_FOR_REVIEW", "review"],
    ["RESOLVE_BLOCKING_POINTS", "review"],
    ["RESOLVE_REVIEW_POINTS", "review"],
    ["REVIEW_ON_OTHER_VERSION", "review"],
    ["APPROVE_REVIEW", "review"],
    ["READY_FOR_CLIENT", "review"],
    ["UPLOAD_VERSION", "versions"],
  ] as const) {
    assert.match(source, new RegExp(`${code}: '${mode}'`));
  }
});

test("NEXT_ACTION_STATUS_ONLY: pure status codes never forward", () => {
  const source = page();
  for (const code of [
    "SECURITY_THREAT",
    "AWAITING_SECURITY_SCAN",
    "COMPARISON_PROCESSING",
    "COMPARISON_FAILED",
    "COMPARISON_UNSUPPORTED",
    "CHANGES_REQUESTED",
    "REVIEW_CLOSED",
    "NO_ACTION_REQUIRED",
  ]) {
    assert.match(source, new RegExp(`'${code}'`));
  }
  assert.match(source, /NEXT_ACTION_STATUS_ONLY_CODES/);
});

test("APPROVE_HEADER_FOCUSES_REVIEW_CONTROL and NO_DIRECT_HEADER_APPROVAL", () => {
  const source = page();
  // APPROVE_REVIEW routes to the review surface...
  assert.match(source, /APPROVE_REVIEW: 'review'/);
  // ...and the dominant header button only navigates, never transitions.
  assert.match(source, /data-testid="document-next-action"/);
  const btn = source.slice(source.indexOf('data-testid="document-next-action"'), source.indexOf("</AdminButton>", source.indexOf('data-testid="document-next-action"')));
  assert.match(btn, /onClick=\{\(\) => navigateToMode\(nextActionTargetMode\)\}/);
  assert.doesNotMatch(btn, /transitionDocumentReview|approveReview|APPROVE/);
});

test("CANONICAL_COMPARISON_PAIR_LOCKED: exact projection pair only", () => {
  const source = page();
  const section = source.slice(source.indexOf("data-testid=\"canonical-changes-section\""), source.indexOf("</section>", source.indexOf("data-testid=\"canonical-changes-section\"")));
  assert.match(section, /comparisonId=\{reviewProjection\?\.comparison\?\.comparisonId/);
  assert.match(section, /baseVersionId=\{reviewProjection\?\.comparison\?\.baseVersionId/);
  assert.match(section, /targetVersionId=\{reviewProjection\?\.comparison\?\.targetVersionId/);
  assert.doesNotMatch(section, /VersionPairSelector|cmp-version-pair/);
});

test("ARBITRARY_PAIR_NOT_PRIMARY: advanced comparison is outside canonical changes", () => {
  const source = page();
  assert.match(source, /data-testid="advanced-comparison"/);
  assert.match(source, /Haladó összehasonlítás \(tetszőleges verziópár\)/);
  // Advanced ComparisonWorkspace lives under preserved extended tools, not the changes panel.
  const changesPanel = source.slice(source.indexOf("data-testid=\"changes-mode-panel\""), source.indexOf("data-testid=\"document-mode-comments\""));
  assert.doesNotMatch(changesPanel, /<ComparisonWorkspace/);
  assert.match(changesPanel, /<CanonicalChangesWorkspace/);
});

test("REJECTED_SEGMENT_REMAINS_UNRESOLVED", () => {
  const source = canonicalChanges();
  assert.match(source, /data-testid="canonical-changes-rejected-unresolved"/);
  assert.match(source, /Elutasított szakasz — feloldatlan, továbbra is rendezésre vár/);
  assert.match(source, /reviewState === "REJECTED"/);
});

test("APPROVAL_409_REFRESH: transition errors refresh the projection", () => {
  const source = reviewWorkflow();
  assert.match(source, /onChanged/);
  assert.match(source, /await onChanged\?\.\(\)/);
});

test("HISTORICAL_VERSION_READ_ONLY", () => {
  const source = read("src/lib/documents/workContext.ts");
  assert.match(source, /isHistoricalVersion/);
  assert.match(source, /selectedVersion != null && currentVersion != null && selectedVersion < currentVersion/);
});

test("TASK_NOTE_LABEL = Feladatjelölés", () => {
  const source = page();
  assert.match(source, /type: 'TASK_NOTE', label: 'Feladatjelölés'/);
  assert.doesNotMatch(source, /type: 'TASK_NOTE', label: 'Feladat'/);
});

test("NO_NEW_ARBITRARY_HEX: canonical surfaces use tokens, not raw sand/beige hex", () => {
  const source = canonicalChanges() + tabs();
  assert.match(source, /--adm-/);
  assert.doesNotMatch(source, /#faf6ee|#f5efe0|#efe8d8|bg-\[#f[0-9a-f]{5}\]/i);
});

test("FULL_REVIEW_PROJECTION_DTO: backend fields are surfaced truthfully", () => {
  const source = projection();
  assert.match(source, /reviewContext/);
  assert.match(source, /annotationSummary/);
  assert.match(source, /comparisonId/);
  assert.match(source, /unresolvedSegments/);
  assert.match(source, /segmentStates/);
  assert.match(source, /approvedVersionId/);
  assert.match(source, /nextAction/);
});
