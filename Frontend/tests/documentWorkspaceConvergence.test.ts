import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const page = () => read("src/app/cases/[caseId]/documents/page.tsx");
const comparison = () => read("src/components/documents/comparison/ComparisonWorkspace.tsx");
const rail = () => read("src/components/documents/comparison/rail.tsx");
const aiModal = () => read("src/components/ai-prompts/AIPromptPreparationModal.tsx");

test("Document workspace convergence keeps one reader and one comparison workspace", () => {
  const source = page();
  assert.match(source, /data-testid="canonical-center-reading"/);
  assert.match(source, /data-testid="canonical-right-shell"/);
  assert.equal((source.match(/<ComparisonWorkspace/g) || []).length, 1);
  assert.match(source, /<DocumentWorkspaceTabs active=\{contextualTab\} onChange=\{setContextualTab\}/);
  assert.doesNotMatch(source, /data-testid="primary-document-work-modes"/);
});

test("Change map uses exact immutable versions and preserves truthful excerpts", () => {
  const source = page();
  const workspace = comparison();
  assert.match(workspace, /baseId/);
  assert.match(workspace, /targetId/);
  assert.match(workspace, /!sameVersion/);
  assert.match(source, /setAiVersionPair\(\[baseVersionId, targetVersionId\]\)/);
  assert.match(source, /onRequestSegmentChanges=\{handleSegmentRequestChanges\}/);
  assert.match(source, /<ComparisonWorkspace[\s\S]*?versions=\{versions\.map/);
});

test("Per-change decisions use canonical segment state and review linkage", () => {
  const source = page();
  const railSource = rail();
  assert.match(railSource, /reviewState: "ACCEPTED"/);
  assert.match(railSource, /Módosítást kérek/);
  assert.match(source, /comparisonSegmentId: segmentChangeRequest\.id/);
  assert.match(source, /Indok:\\n\$\{reason\}\\n\\nKért módosítás:/);
  assert.match(source, /reviewState: 'NEEDS_DISCUSSION'/);
  assert.match(source, /updateSegment\(segmentChangeRequest\.comparisonId/);
  assert.doesNotMatch(
    source.slice(source.indexOf("const submitSegmentRequestChanges"), source.indexOf("const renderAnnotatedText")),
    /transitionDocumentReview/,
  );
});

test("Per-change review actions require the exact selected version and reuse points", () => {
  const source = page();
  assert.match(source, /item\.reviewVersionId === selectedVersion\.id/);
  assert.match(source, /listReviewPoints\(review\.id, \{ type: 'COMPARISON_CHANGE' \}\)/);
  assert.match(source, /point\.comparisonSegmentId === segmentChangeRequest\.id/);
  assert.match(source, /updateReviewPoint\(review\.id, existingPoint\.id/);
});

test("Secondary surfaces do not expose a dead request action and navigation is actually collapsible", () => {
  const source = page();
  const railSource = rail();
  assert.match(railSource, /\{onRequestChanges \? \(/);
  assert.match(source, /<details data-testid="document-version-navigation">[\s\S]*ledger-search-input[\s\S]*filteredUploadedDocuments[\s\S]*<\/details>/);
});

test("AI preparation carries both selected version IDs through the existing prompt system", () => {
  const source = aiModal();
  assert.match(source, /documentVersionIds\?: string\[\]/);
  assert.match(source, /sourceDocumentVersionIds: documentVersionIds\?\.length/);
  assert.match(source, /data-testid="ai-version-pair"/);
});

test("Document-level change requests require both visible inputs and exact revision", () => {
  const source = read("src/components/documents/review/DocumentReviewWorkflowPanel.tsx");
  assert.match(source, /data-testid="review-change-reason"/);
  assert.match(source, /data-testid="review-requested-change"/);
  assert.match(source, /safeRationale: `Indok:\\n\$\{changeReason\.trim\(\)\}\\n\\nKért módosítás:/);
  assert.match(source, /expectedRevision: review\.revision/);
});
