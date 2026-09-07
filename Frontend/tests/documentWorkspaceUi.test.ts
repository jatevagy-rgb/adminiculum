import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

const documentPage = () => read("src/app/cases/[caseId]/documents/page.tsx");
const clientPage = () => read("src/app/clients/[clientId]/page.tsx");
const tabs = () => read("src/components/documents/workContext/DocumentWorkspaceTabs.tsx");

test("Document Workspace exposes the four case-document views", () => {
  const source = tabs();
  for (const label of ["Áttekintés", "Változások", "Felülvizsgálat", "Verziók"]) {
    assert.match(source, new RegExp(label));
  }
  for (const anchor of ["document-overview", "document-changes", "document-review", "document-versions"]) {
    assert.match(source, new RegExp(anchor));
    assert.match(documentPage(), new RegExp(`id=\\"${anchor}\\"`));
  }
});

test("Document add and immutable version upload remain distinct", () => {
  const source = documentPage();
  assert.match(source, /Dokumentum hozzáadása/);
  assert.match(source, /Új verzió feltöltése/);
  assert.match(source, /uploadImmutableDocumentVersion/);
  assert.doesNotMatch(source, /contentEditable/);
});

test("Document workspace resolves the case directly before the legacy paginated fallback", () => {
  const source = documentPage();
  assert.match(source, /getCaseById\(resolvedParams\.caseId\)/);
  assert.match(source, /getCases\(1, 200\)/);
  assert.match(source, /item\.caseNumber === resolvedParams\.caseId/);
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
  // Annotation capability is still derived from the TXT renderer only.
  assert.match(source, /textRendered: canRenderTextVersion/);
  assert.match(source, /canRenderTextVersion = selectedVersionFileType === 'TXT'/);
});

test("Current non-TXT versions load read-only preview via getDocumentText (B + C)", () => {
  const source = documentPage();
  assert.match(source, /getDocumentText\(selectedUploadedDocument\.id\)/);
  assert.match(source, /versionTextPlan === 'DOCUMENT_TEXT'/);
  assert.match(source, /versionIsCurrent: Boolean\(selectedVersion\?\.isCurrent\)/);
  assert.match(source, /versionBelongsToSelectedDocument: annotationVersionEligible/);
  assert.match(source, /documentIsUploaded: Boolean\(\s*selectedUploadedDocument && selectedUploadedDocument\.documentType !== 'MODIFIED_WORKING_COPY',?\s*\)/);
  assert.match(source, /setDocumentTextPreview\(result\.text\)/);
  assert.match(source, /data-testid="version-preview-document-text"/);
  // Truthful states: endpoint-provided reason is shown; request failure is neutral.
  assert.match(source, /documentTextUnavailableReason \|\| 'Ehhez a dokumentumhoz nem érhető el kinyerhető szöveg\.'/);
  assert.match(source, /A kinyert szöveg betöltése nem sikerült/);
  assert.doesNotMatch(source, /Nincs elérhető szöveg/);
});

test("Document-level extracted text never becomes a version-scoped anchor source (D + E)", () => {
  const source = documentPage();
  // The DOCUMENT_TEXT branch must not touch versionText — anchors, offsets,
  // contentFingerprint and rendererVersion all derive from versionText only.
  const documentTextBranch = source.split("versionTextPlan === 'DOCUMENT_TEXT'")[1];
  assert.ok(documentTextBranch, 'DOCUMENT_TEXT branch exists');
  const section = documentTextBranch.slice(0, documentTextBranch.indexOf('return () =>'));
  assert.doesNotMatch(section, /setVersionText|pendingTextAnchor|contentFingerprint|rendererVersion/);
  // resolveAnnotationCapabilities input is unchanged: textRendered is still
  // bound to the TXT renderer flag, not to any document-level text state.
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
    /setVersionText\(null\);\s*setVersionTextUnavailable\(false\);\s*setDocumentTextPreview\(null\);\s*setDocumentTextUnavailableReason\(null\);\s*setDocumentTextFailed\(false\);/,
  );
  // Async results are cancellation-guarded on selection change.
  assert.match(source, /if \(cancelled\) return;\s*if \(result\.text/);
  assert.match(source, /setDocumentTextPreview\(result\.text\)/);
  assert.match(source, /if \(!cancelled\) setIsLoadingDocumentText\(false\)/);
});

test("Client context only enters a real client-scoped case document workspace", () => {
  const source = clientPage();
  assert.match(source, /getCases\(1, 100, undefined, clientId\)/);
  assert.match(source, /\/cases\/\$\{cases\.find\(\(item\) => item\.status !== "CLOSED"\)\?\.id\}\/documents/);
  assert.match(source, /\/cases\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  assert.doesNotMatch(source, /Demo Kft|hard-coded.*case|caseId:\s*["'][0-9a-f-]{8}/i);
});
