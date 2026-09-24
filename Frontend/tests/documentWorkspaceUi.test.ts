import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

const documentPage = () => read("src/app/cases/[caseId]/documents/page.tsx");
const clientPage = () => read("src/app/clients/[clientId]/page.tsx");
const tabs = () => read("src/components/documents/workContext/DocumentWorkspaceTabs.tsx");

test("Document Workspace exposes the four primary case-document modes", () => {
  const source = tabs();
  for (const label of ["Áttekintés", "Változások", "Megjegyzések", "Jóváhagyás"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /onChange/);
  assert.match(source, /aria-pressed/);
  assert.doesNotMatch(source, /href=|Link|document-(overview|changes|comments|approval)/);
  assert.doesNotMatch(source, /Elemzés|Ügyfél|Leadás/);
});

test("Document add and immutable version upload remain distinct", () => {
  const source = documentPage();
  assert.match(source, /Dokumentum hozzáadása/);
  assert.match(source, /Új verzió feltöltése/);
  assert.match(source, /uploadImmutableDocumentVersion/);
  assert.doesNotMatch(source, /contentEditable/);
});

test("Document workspace resolves the case directly before the exact legacy-reference fallback", () => {
  const source = documentPage();
  assert.match(source, /getCaseById\(resolvedParams\.caseId\)/);
  const directIndex = source.indexOf('getCaseById(resolvedParams.caseId)');
  const fallbackIndex = source.indexOf('findCaseByReference(');
  assert.ok(directIndex >= 0 && fallbackIndex > directIndex,
    'the canonical id lookup must run before the legacy-reference fallback');
  assert.match(source, /findCaseByReference\(/);
  assert.doesNotMatch(source, /getCases\(1, 200\)/,
    'the case fallback must not depend on an arbitrary first-page window');
});

test("Document Workspace surfaces existing Legal Analysis only for a real versioned document", () => {
  const source = documentPage();
  const panel = read("src/components/documents/LegalAnalysisIntakePanel.tsx");
  assert.match(source, /LegalAnalysisIntakePanel/);
  assert.match(source, /caseId=\{canonicalCaseId\}/);
  assert.match(source, /documentId=\{selectedUploadedDocument\.id\}/);
  assert.match(source, /documentSourceType="DOCUMENT"/);
  assert.match(source, /documentTitle=\{activeTitle \|\| undefined\}/);
  assert.match(source, /selectedVersion \? \(/);
  assert.match(panel, /listDocumentLegalAnalyses/);
  assert.match(panel, /getLegalAnalysis/);
  assert.match(panel, /createDocumentLegalAnalysis/);
  assert.match(panel, /updateLegalAnalysis/);
  assert.match(panel, /data-testid="legal-analysis-intake"/);
});

test("Current TXT versions keep the version-specific blob text path (A)", () => {
  const source = documentPage();
  assert.match(source, /versionTextPlan === 'VERSION_BLOB'/);
  assert.match(source, /downloadDocumentVersion\(selectedVersionDocumentId, selectedVersionStableId\)/);
  assert.match(source, /\.then\(\(blob\) => blob\.text\(\)\)/);
  assert.match(source, /setVersionText\(text\)/);
  // Text-range capability requires the exact version text to be loaded.
  assert.match(source, /textRendered: versionTextRendered/);
  assert.match(source, /const versionTextRendered = hasVersionScopedText && versionText !== null/);
});

test("Current and historical DOCX/PDF versions load exact version text (B + C)", () => {
  const source = documentPage();
  assert.match(source, /getDocumentVersionText\(selectedVersionDocumentId, selectedVersionStableId\)/);
  assert.match(source, /versionTextPlan === 'VERSION_TEXT'/);
  assert.match(source, /versionIsCurrent: Boolean\(selectedVersion\?\.isCurrent\)/);
  assert.match(source, /versionBelongsToSelectedDocument: annotationVersionEligible/);
  assert.match(source, /documentIsUploaded: Boolean\(\s*selectedUploadedDocument && selectedUploadedDocument\.documentType !== 'MODIFIED_WORKING_COPY',?\s*\)/);
  // The exact version text flows into the same version-scoped channel that
  // anchors/offsets/fingerprints are computed from.
  assert.match(source, /resolveVersionTextLoadOutcome\(result\)/);
  assert.match(source, /setVersionText\(outcome\.text\)/);
  // Truthful states: endpoint-provided reason is shown; request failure is mapped.
  assert.match(source, /setVersionTextUnavailableReason\(outcome\.unavailableReason \|\| VERSION_TEXT_NO_EXTRACTABLE_TEXT\)/);
  assert.match(source, /versionTextRequestFailureMessage\(error\)/);
  assert.doesNotMatch(source, /Nincs elérhető szöveg/);
});

test("Legacy non-extractable current versions keep the document-level preview", () => {
  const source = documentPage();
  assert.match(source, /getDocumentText\(selectedUploadedDocument\.id\)/);
  assert.match(source, /versionTextPlan === 'DOCUMENT_TEXT'/);
  assert.match(source, /setDocumentTextPreview\(result\.text\)/);
  assert.match(source, /data-testid="version-preview-document-text"/);
  // Truthful states: endpoint-provided reason is shown; request failure is neutral.
  assert.match(source, /documentTextUnavailableReason \|\| 'Ehhez a dokumentumhoz nem érhető el kinyerhető szöveg\.'/);
  assert.match(source, /A kinyert szöveg betöltése nem sikerült/);
});

test("Document-level extracted text never becomes a version-scoped anchor source (D + E)", () => {
  const source = documentPage();
  // The DOCUMENT_TEXT branch must not touch versionText — anchors, offsets,
  // contentFingerprint and rendererVersion all derive from versionText only.
  const documentTextBranch = source.split("versionTextPlan === 'DOCUMENT_TEXT'")[1];
  assert.ok(documentTextBranch, 'DOCUMENT_TEXT branch exists');
  const section = documentTextBranch.slice(0, documentTextBranch.indexOf('return () =>'));
  assert.doesNotMatch(section, /setVersionText|pendingTextAnchor|contentFingerprint|rendererVersion/);
  // resolveAnnotationCapabilities input is bound to the loaded version text,
  // never to any document-level text state.
  const capsCall = source.match(/resolveAnnotationCapabilities\(\{[\s\S]*?\}\)/);
  assert.ok(capsCall);
  assert.doesNotMatch(capsCall[0], /documentText|DocumentText/);
});

test("Version/document switch synchronously clears both text channels (F)", () => {
  const source = documentPage();
  // All preview state resets happen at the top of the same effect body, before
  // any async fetch is issued — stale text can never flash or feed an anchor.
  assert.match(
    source,
    /setVersionText\(null\);\s*setVersionTextUnavailable\(false\);\s*setDocumentTextPreview\(null\);\s*setDocumentTextUnavailableReason\(null\);\s*setDocumentTextFailed\(false\);\s*setVersionTextUnavailableReason\(null\);/,
  );
  // Async results are cancellation-guarded on selection change.
  assert.match(source, /if \(cancelled\) return;\s*if \(result\.text/);
  assert.match(source, /setDocumentTextPreview\(result\.text\)/);
  assert.match(source, /if \(!cancelled\) setIsLoadingDocumentText\(false\)/);
});

test("Client context only enters a real client-scoped case document workspace", () => {
  const source = clientPage();
  assert.match(source, /getCases\(page, CLIENT_CASE_PAGE_SIZE, undefined, clientId\)/);
  assert.match(source, /\/cases\/\$\{cases\.find\(\(item\) => item\.status !== "CLOSED"\)\?\.id\}\/documents/);
  assert.match(source, /\/cases\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  assert.doesNotMatch(source, /Demo Kft|hard-coded.*case|caseId:\s*["'][0-9a-f-]{8}/i);
});
