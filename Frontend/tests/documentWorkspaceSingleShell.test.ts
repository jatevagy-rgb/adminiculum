import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const page = () => read("src/app/cases/[caseId]/documents/page.tsx");
const tabs = () => read("src/components/documents/workContext/DocumentWorkspaceTabs.tsx");

test("single shell exposes exactly four primary work modes", () => {
  const source = page();
  const primary = tabs();

  assert.match(primary, /Áttekintés/);
  assert.match(primary, /Változások/);
  assert.match(primary, /Megjegyzések/);
  assert.match(primary, /Jóváhagyás/);
  assert.doesNotMatch(primary, /Elemzés|Ügyfél|Leadás/);
  assert.doesNotMatch(source, /data-testid="primary-document-work-modes"/);
  assert.equal((source.match(/<DocumentWorkspaceTabs/g) || []).length, 1);
  assert.match(source, /useState<'overview' \| 'changes' \| 'comments' \| 'approval'>\('overview'\)/);
});

test("primary mode navigation is controlled and does not use route or hash links", () => {
  const source = tabs();
  assert.match(source, /active: "overview" \| "changes" \| "comments" \| "approval"/);
  assert.match(source, /onChange: \(mode: "overview" \| "changes" \| "comments" \| "approval"\)/);
  assert.match(source, /onClick=\{\(\) => onChange\(key\)\}/);
  assert.doesNotMatch(source, /next\/link|href=|#[a-z-]+/);
  assert.match(page(), /<DocumentWorkspaceTabs active=\{contextualTab\} onChange=\{setContextualTab\}/);
});

test("comments owns annotation workflow while approval stays review-only", () => {
  const source = page();
  const comments = source.slice(source.indexOf('data-testid="contextual-comments-panel"'));
  const approval = source.slice(source.indexOf('data-testid="contextual-approval-panel"'), source.indexOf('data-testid="contextual-changes-panel"'));
  assert.match(comments, /comments-annotation-composer/);
  assert.match(comments, /comments-annotation-list/);
  assert.match(comments, /comments-comment-thread/);
  assert.match(comments, /handleCreateAnnotation|handleResolveAnnotation|handleDeleteAnnotation/);
  assert.doesNotMatch(approval, /handleCreateAnnotation|handleDeleteAnnotation|annotationDraft/);
});

test("review projection fields feed overview without replacing canonical next action", () => {
  const source = page();
  assert.match(source, /getDocumentReviewProjection/);
  assert.match(source, /reviewProjection\.review\.openPointCount/);
  assert.match(source, /reviewProjection\.review\.blockingPointCount/);
  assert.match(source, /reviewProjection\.comparison\.unresolvedSegments/);
  assert.match(source, /reviewProjection\.nextAction\.label/);
  assert.match(source, /reviewProjection\.comparison\.reviewedSegments/);
});

test("approval keeps selected-version identity separate from current projection truth", () => {
  const source = page();
  assert.match(source, /projectionMatchesSelectedVersion/);
  assert.match(source, /Kiválasztott verzió:<\/b> \{selectedVersion \?/);
  assert.match(source, /approval-current-version-note/);
  assert.match(source, /A kanonikus összegzés az aktuális verzióhoz tartozik/);
});

test("review projection refreshes after review and segment mutations", () => {
  const source = page();
  const review = readFileSync(
    path.resolve(process.cwd(), "src/components/documents/review/DocumentReviewWorkflowPanel.tsx"),
    "utf8",
  );
  assert.match(source, /refreshReviewProjection\(selectedUploadedDocument\.id\)/);
  assert.match(source, /onChanged=\{\(\) => void refreshReviewProjection\(selectedUploadedDocument\.id\)\}/);
  assert.match(source, /onChanged=\{\(\) => selectedUploadedDocument \? refreshReviewProjection\(selectedUploadedDocument\.id\)/);
  assert.match(review, /onChanged\?: \(\) => void \| Promise<void>/);
  assert.match(review, /await onChanged\?\.\(\)/);
});

test("unknown document enums use a neutral bounded label", () => {
  const source = page();
  assert.match(source, /documentEnumLabels\[value\] \|\| 'Ismeretlen állapot'/);
  assert.doesNotMatch(source, /documentEnumLabels\[value\] \|\| value/);
});

test("center reader remains a sibling of the right shell and left ledger", () => {
  const source = page();
  assert.match(source, /data-testid="canonical-left-ledger"/);
  assert.match(source, /data-testid="canonical-center-reading"/);
  assert.match(source, /data-testid="canonical-right-shell"/);
  assert.match(source, /contextualTab === 'overview'/);
  assert.match(source, /contextualTab === 'changes'/);
  assert.match(source, /contextualTab === 'comments'/);
  assert.match(source, /contextualTab === 'approval'/);
});

test("approval uses the canonical document review workflow and secondary lifecycle tools", () => {
  const source = page();
  const shell = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/)?.[0] ?? "";

  assert.match(shell, /data-testid="canonical-document-approval"/);
  assert.match(shell, /<DocumentReviewWorkflowPanel/);
  assert.match(shell, /data-testid="approval-ai-tools"/);
  assert.match(shell, /data-testid="approval-publication-tools"/);
  assert.match(shell, /data-testid="approval-handoff-tools"/);
  assert.doesNotMatch(shell, /setContextualTab\('(elemzes|ugyfel|leadas)'\)/);
});

test("document and version navigation plus metadata compare remain secondary", () => {
  const source = page();
  assert.match(source, /<details data-testid="document-version-navigation" open>/);
  assert.match(source, /filteredUploadedDocuments/);
  assert.match(source, /filteredGeneratedLedgerItems/);
  assert.match(source, /<details id="preserved-extended-tools-shell"/);
  assert.match(source, /const metaCompareUrl =/);
  assert.match(source, /router\.push\(metaCompareUrl\)/);
  assert.match(source, /<ComparisonWorkspace/);
});

test("tabs component names only the four primary modes", () => {
  const source = tabs();
  for (const label of ["Áttekintés", "Változások", "Megjegyzések", "Jóváhagyás"]) {
    assert.match(source, new RegExp(label));
  }
  assert.doesNotMatch(source, /Felülvizsgálat|Verziók|Elemzés|Ügyfél|Leadás/);
  assert.doesNotMatch(source, /Link|href=|document-(overview|changes|comments|approval)/);
});
