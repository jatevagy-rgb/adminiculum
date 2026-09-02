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

test("Client context only enters a real client-scoped case document workspace", () => {
  const source = clientPage();
  assert.match(source, /getCases\(1, 100, undefined, clientId\)/);
  assert.match(source, /\/cases\/\$\{cases\.find\(\(item\) => item\.status !== "CLOSED"\)\?\.id\}\/documents/);
  assert.match(source, /\/cases\?clientId=\$\{encodeURIComponent\(clientId\)\}/);
  assert.doesNotMatch(source, /Demo Kft|hard-coded.*case|caseId:\s*["'][0-9a-f-]{8}/i);
});
