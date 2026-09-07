import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => {
  const fromCwd = path.resolve(process.cwd(), file);
  if (existsSync(fromCwd)) return readFileSync(fromCwd, "utf8");
  const fromFrontend = path.resolve(process.cwd(), "Frontend", file);
  if (existsSync(fromFrontend)) return readFileSync(fromFrontend, "utf8");
  return readFileSync(path.resolve(__dirname, "..", file), "utf8");
};
const documentPage = () => read("src/app/cases/[caseId]/documents/page.tsx");

test("Canonical four-region workspace layout renders in page.tsx", () => {
  const source = documentPage();
  assert.match(source, /data-testid="canonical-top-region"/, "Canonical top region must exist");
  assert.match(source, /data-testid="canonical-left-ledger"/, "Canonical left ledger must exist");
  assert.match(source, /data-testid="canonical-center-reading"/, "Canonical center reading surface must exist");
  assert.match(source, /data-testid="canonical-right-shell"/, "Canonical right shell must exist");
});

test("Canonical top region displays document identity, version, status, and download/version actions", () => {
  const source = documentPage();
  const topMatch = source.match(/<section data-testid="canonical-top-region"[\s\S]*?<\/section>/);
  assert.ok(topMatch, "Top region section must be found");
  const topSection = topMatch[0];

  assert.match(topSection, /activeTitle/);
  assert.match(topSection, /selectedDocumentTypeLabel/);
  assert.match(topSection, /selectedStatusLabel/);
  assert.match(topSection, /canonicalActiveVersion\.versionNumber/);
  assert.match(topSection, /handleDownloadUploadedDocument|handleDownloadVersion/);
  assert.match(topSection, /Microsoft Word \(asztali\)/);
});

test("Canonical left ledger preserves all document categories and upload trigger", () => {
  const source = documentPage();
  const ledgerMatch = source.match(/<aside data-testid="canonical-left-ledger"[\s\S]*?<\/aside>/);
  assert.ok(ledgerMatch, "Left ledger must be found");
  const ledger = ledgerMatch[0];

  assert.match(ledger, /Feltöltött dokumentumok/);
  assert.match(ledger, /uploadedDocuments\.map/);
  assert.match(ledger, /Módosított munkapéldányok/);
  assert.match(ledger, /modifiedWorkingCopies\.map/);
  assert.match(ledger, /Generált \/ módosított/);
  assert.match(ledger, /generatedLedgerItems\.map/);
  assert.match(ledger, /scanStatusLabel\(doc\.securityScanStatus\)/);
  assert.match(ledger, /setSelectedLedgerItem/);
});

test("Initial-upload control exists and is wired to fileInputRef and uploadCaseDocument", () => {
  const source = documentPage();
  assert.match(source, /fileInputRef\s*=\s*useRef<HTMLInputElement\s*\|\s*null>\(null\)/);
  assert.match(source, /<input\s+ref=\{fileInputRef\}\s+type="file"\s+accept="\.pdf,\.doc,\.docx,\.txt"/);
  assert.match(source, /fileInputRef\.current\?\.click\(\)/);
  assert.match(source, /Dokumentum hozzáadása/);
  assert.match(source, /uploadCaseDocument/);
});

test("Canonical center region provides read-only extracted text preview with Word guidance", () => {
  const source = documentPage();
  const centerMatch = source.match(/<main data-testid="canonical-center-reading"[\s\S]*?<\/main>/);
  assert.ok(centerMatch, "Center reading surface must be found");
  const center = centerMatch[0];

  assert.match(center, /Kanonikus olvasófelület/);
  assert.match(center, /Read-only előnézet · Word a szerkesztő/);
  assert.match(center, /data-testid="version-preview-document-text"/);
  assert.match(center, /canRenderTextVersion/);
  assert.match(center, /versionTextPlan === 'DOCUMENT_TEXT'/);
  assert.match(source, /versionTextPlan === 'VERSION_BLOB'/);
  assert.match(center, /renderAnnotatedText\(\)/);
  assert.doesNotMatch(center, /contentEditable/);
});

test("Canonical center region preserves truthful fallback for historical non-TXT versions", () => {
  const source = documentPage();
  const centerMatch = source.match(/<main data-testid="canonical-center-reading"[\s\S]*?<\/main>/);
  assert.ok(centerMatch, "Center reading surface must be found");
  const center = centerMatch[0];

  assert.match(center, /data-testid="version-preview-unavailable"/);
  assert.match(center, /Stabil szövegkijelölés még nincs ehhez a formátumhoz/);
  assert.match(center, /A megváltoztathatatlan verzió tartalma letöltéssel és Microsoft Wordben érhető el/);
});

test("Contextual work-panel shell exposes truthful four-group structure and neutral statuses", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must be found");
  const shell = shellMatch[0];

  assert.match(shell, /contextualTab === 'review'/);
  assert.match(shell, /contextualTab === 'elemzes'/);
  assert.match(shell, /contextualTab === 'ugyfel'/);
  assert.match(shell, /contextualTab === 'leadas'/);
  assert.match(shell, /Review/);
  assert.match(shell, /Elemzés/);
  assert.match(shell, /Ügyfél/);
  assert.match(shell, /Leadás/);
  assert.match(shell, /document-review/);
  assert.match(shell, /document-legal-analysis/);
  assert.match(shell, /document-publication/);
  assert.match(shell, /document-handoff/);

  // Truthfulness positive assertions
  assert.match(shell, /Feltöltő:/);
  assert.match(shell, /Jogi elemzés/);
  assert.match(shell, /A részletes állapot az elemzési panelen látható\./);
  assert.match(shell, /Publikálva/);
  assert.match(shell, /Nincs publikálva/);
  assert.match(shell, /Leadási csomag/);

  // Truthfulness negative assertions (defects must not be present)
  assert.doesNotMatch(shell, /Elemzés elérhető/, "Must not fabricate legal analysis availability");
  assert.doesNotMatch(shell, /Nincs elemzés/);
  assert.doesNotMatch(shell, /Beérkeztetve/, "Must not display ungrounded intake status");
  assert.doesNotMatch(shell, /Várakozik/);
  assert.doesNotMatch(shell, /Felelős:[\s\S]*?uploadedBy/, "Uploader must not be labeled as Felelős");
  assert.doesNotMatch(shell, /handoffPackageCountLabel/, "Must not use invalid handoff package count");
  assert.doesNotMatch(shell, /Belső munkaverzió/, "Must not infer ungrounded publication status");
  assert.doesNotMatch(source, /handoffPackageCountLabel/, "handoffPackageCountLabel must be completely removed");
});

test("Preserved extended tools section keeps all existing workspaces and actions reachable", () => {
  const source = documentPage();
  assert.match(source, /id="preserved-extended-tools"/);
  assert.match(source, /data-testid="preserved-extended-tools"/);
  assert.match(source, /További meglévő dokumentumeszközök/);

  // All 4 canonical tab anchors
  assert.match(source, /id="document-overview"/);
  assert.match(source, /id="document-versions"/);
  assert.match(source, /id="document-review"/);
  assert.match(source, /id="document-changes"/);

  // Workspaces and dialogs
  assert.match(source, /data-testid="cmp-workspace-section"/);
  assert.match(source, /ComparisonWorkspace/);
  assert.match(source, /LegalAnalysisIntakePanel/);
  assert.match(source, /ClientPublicationPanel/);
  assert.match(source, /ClientHouseStylePanel/);
  assert.match(source, /HandoffPackagePanel/);
  assert.match(source, /AnonymizeModal/);
  assert.match(source, /RehydrateModal/);
  assert.match(source, /id="ledger-delete-document-title"/);
});

// Targeted regression tests for exact-head review findings (Defects 1, 2, 3)

test("A version belonging to document A is NOT accepted as canonical-shell metadata for selected document B", () => {
  const source = documentPage();
  assert.match(source, /selectedVersionBelongsToActiveDocument/);
  assert.match(source, /selectedVersion\?\.documentId === selectedUploadedDocument\?\.id/);
  assert.match(source, /versions\.some\(\(v\) => v\.id === selectedVersion\?\.id\)/);
  assert.match(source, /canonicalActiveVersion = selectedVersionBelongsToActiveDocument \? selectedVersion : null/);

  // Top region must use canonicalActiveVersion for version metadata, never unguarded selectedVersion
  const topMatch = source.match(/<section data-testid="canonical-top-region"[\s\S]*?<\/section>/);
  assert.ok(topMatch, "Top region section must be found");
  const topSection = topMatch[0];

  assert.match(topSection, /canonicalActiveVersion \? \(/);
  assert.match(topSection, /canonicalActiveVersion\.versionNumber/);
  assert.match(topSection, /canonicalActiveVersion\?\.securityScanStatus/);
  assert.match(topSection, /canonicalActiveVersion\?\.uploadedBy/);
  assert.match(topSection, /canonicalActiveVersion\?\.uploadedAt/);
  assert.match(topSection, /canonicalActiveVersion\?\.reviewStatus/);
  assert.doesNotMatch(topSection, /selectedVersion\?\.uploadedBy/);
  assert.doesNotMatch(topSection, /selectedVersion\?\.uploadedAt/);
  assert.doesNotMatch(topSection, /selectedVersion\?\.reviewStatus/);
});

test("Old TXT state cannot qualify for the center rendering path after selected document changes", () => {
  const source = documentPage();
  const centerMatch = source.match(/<main data-testid="canonical-center-reading"[\s\S]*?<\/main>/);
  assert.ok(centerMatch, "Center reading surface must be found");
  const center = centerMatch[0];

  // Must guard text version rendering with selectedVersionBelongsToActiveDocument
  assert.match(center, /canRenderTextVersion\s*&&\s*selectedVersionBelongsToActiveDocument/);
  // Center badge must use canonicalActiveVersion
  assert.match(center, /canonicalActiveVersion \? <AdminBadge tone=\{canonicalActiveVersion\.isCurrent/);
});

test("Actual DOM wrappers exist with document-legal-analysis, document-publication, and document-handoff", () => {
  const source = documentPage();
  // Must NOT count getElementById string references as proof
  const withoutGetElementById = source.replace(/getElementById\(['"][^'"]+['"]\)/g, '');

  assert.match(withoutGetElementById, /<div[^>]*id="document-legal-analysis"[^>]*>[\s\S]*?<LegalAnalysisIntakePanel/);
  assert.match(withoutGetElementById, /<div[^>]*id="document-publication"[^>]*>[\s\S]*?<ClientPublicationPanel/);
  assert.match(withoutGetElementById, /<div[^>]*id="document-handoff"[^>]*>[\s\S]*?<HandoffPackagePanel/);
});

test("Each contextual button points to an actual rendered target and provides truthful disabled states", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must be found");
  const shell = shellMatch[0];

  // Verify each target exists as a DOM element id outside getElementById
  const withoutGetElementById = source.replace(/getElementById\(['"][^'"]+['"]\)/g, '');
  const targets = [
    'document-review',
    'document-changes',
    'document-legal-analysis',
    'document-publication',
    'document-handoff',
  ];
  for (const target of targets) {
    assert.match(withoutGetElementById, new RegExp(`id="${target}"`));
    assert.match(shell, new RegExp(`document\\.getElementById\\('${target}'\\)`));
  }

  // Verify truthful disabling
  assert.match(shell, /disabled=\{!selectedUploadedDocument \|\| !canonicalActiveVersion\}/);
  assert.match(shell, /disabled=\{!selectedUploadedDocument \|\| !canonicalCaseId\}/);
  assert.match(shell, /disabled=\{!caseRecord\}/);
});

test("Canonical Leadás summary does not claim ZIP export and does not fabricate Aktív fallback", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must be found");
  const shell = shellMatch[0];

  assert.doesNotMatch(source, /ZIP export és átadási jegyzék/);
  assert.match(shell, /A részletes leadási állapot a leadási csomag panelen látható\./);
  assert.doesNotMatch(shell, /Aktív/);
  assert.match(shell, /caseRecord\?\.status \|\| "Nincs megadva"/);
});
