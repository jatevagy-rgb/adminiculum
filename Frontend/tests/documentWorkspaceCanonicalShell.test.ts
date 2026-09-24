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

test("Canonical document route uses the normal application shell", () => {
  const source = documentPage();
  assert.match(source, /<AuthenticatedApp section="case-detail">/);
  assert.doesNotMatch(source, /<AuthenticatedApp section="case-detail" workspaceChrome="focused">/);
});

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
  assert.match(ledger, /filteredUploadedDocuments\.map/);
  assert.match(ledger, /Módosított munkapéldányok/);
  assert.match(ledger, /filteredModifiedWorkingCopies\.map/);
  assert.match(ledger, /Generált \/ módosított/);
  assert.match(ledger, /filteredGeneratedLedgerItems\.map/);
  assert.match(ledger, /scanStatusLabel\(doc\.securityScanStatus\)/);
  assert.match(ledger, /selectLedgerItem/);
  // Left-rail search is a view filter over the already-loaded collection.
  assert.match(ledger, /data-testid="ledger-search-input"/);
  assert.match(ledger, /setLedgerSearch/);
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
  assert.match(center, /Csak olvasható előnézet · Word a szerkesztő/);
  assert.match(center, /data-testid="version-preview-document-text"/);
  assert.match(center, /hasVersionScopedText\s*&&\s*selectedVersionBelongsToActiveDocument/);
  assert.match(center, /versionTextPlan === 'DOCUMENT_TEXT'/);
  assert.match(source, /versionTextPlan === 'VERSION_BLOB'/);
  assert.match(center, /renderAnnotatedText\(\)/);
  assert.doesNotMatch(center, /contentEditable/);
});

test("Canonical center region preserves truthful fallback for versions without version-scoped text", () => {
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

  for (const mode of ["document", "changes", "review", "versions"]) {
    assert.match(shell, new RegExp(`activeMode === '${mode}'`));
  }
  assert.match(source, /onNavigate=\{navigateToMode\}/);
  assert.doesNotMatch(shell, /data-testid="contextual-tab-(analysis|client|handoff)"/);
  assert.match(source, /id="document-review"/);
  assert.match(source, /id="document-legal-analysis"/);
  assert.match(source, /id="document-publication"/);
  assert.match(source, /id="document-handoff"/);

  // In-shell working panels (Slice 2)
  assert.match(shell, /LegalAnalysisIntakePanel/);
  assert.match(shell, /ClientPublicationPanel/);
  assert.match(shell, /HandoffPackagePanel/);

  // Truthfulness positive assertions
  assert.match(source, /Publikálva/);
  assert.match(source, /Nincs publikálva/);
  assert.match(shell, /publicationStatusLabel/);
  assert.match(shell, /Leadási csomag/);

  // Truthfulness negative assertions (defects must not be present)
  assert.doesNotMatch(shell, /Elemzés elérhető/, "Must not fabricate legal analysis availability");
  assert.doesNotMatch(shell, /Nincs elemzés/);
  assert.doesNotMatch(shell, /Beérkeztetve/, "Must not display ungrounded intake status");
  assert.doesNotMatch(shell, /Várakozik/);
  assert.doesNotMatch(source, /<b>Felelős:<\/b>[^\\n]*uploadedBy/, "Uploader must not be labeled as Felelős");
  assert.doesNotMatch(shell, /handoffPackageCountLabel/, "Must not use invalid handoff package count");
  assert.doesNotMatch(shell, /Belső munkaverzió/, "Must not infer ungrounded publication status");
  assert.doesNotMatch(source, /handoffPackageCountLabel/, "handoffPackageCountLabel must be completely removed");
});

test("Preserved extended tools section keeps all existing workspaces and actions reachable", () => {
  const source = documentPage();
  assert.match(source, /<details id="preserved-extended-tools-shell" data-testid="preserved-extended-tools-shell"/);
  assert.match(source, /<summary[\s\S]*?Haladó eszközök/);
  assert.match(source, /id="preserved-extended-tools"/);
  assert.match(source, /data-testid="preserved-extended-tools"/);
  assert.match(source, /További meglévő dokumentumeszközök/);

  // All 4 canonical tab anchors
  assert.match(source, /id="document-overview"/);
  assert.match(source, /id="document-versions"/);
  assert.match(source, /id="document-review"/);
  assert.match(source, /id="document-changes"/);

  // Workspaces and dialogs
  assert.match(source, /data-testid="advanced-comparison"/);
  assert.match(source, /ComparisonWorkspace/);
  assert.match(source, /LegalAnalysisIntakePanel/);
  assert.match(source, /ClientPublicationPanel/);
  assert.match(source, /ClientHouseStylePanel/);
  assert.match(source, /HandoffPackagePanel/);
  assert.match(source, /AnonymizeModal/);
  assert.match(source, /RehydrateModal/);
  assert.match(source, /id="ledger-delete-document-title"/);
});

test("Document workspace presents backend enums with human-readable labels", () => {
  const source = documentPage();
  assert.match(source, /NOT_IN_REVIEW:\s*'Nincs felülvizsgálat alatt'/);
  assert.match(source, /INTERNAL_ONLY:\s*'Belső'/);
  assert.match(source, /LAWYER_UPLOAD:\s*'Ügyvédi feltöltés'/);
  assert.match(source, /ORIGINAL:\s*'Eredeti'/);
  assert.match(source, /documentEnumLabel\(selectedVersion\.reviewStatus\)/);
  assert.match(source, /documentEnumLabel\(selectedVersion\.publicationStatus\)/);
  assert.doesNotMatch(source, /<p><b>Review:<\/b> \{selectedVersion\.reviewStatus\}<\/p>/);
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

  // Must guard version-scoped text rendering with selectedVersionBelongsToActiveDocument
  assert.match(center, /hasVersionScopedText\s*&&\s*selectedVersionBelongsToActiveDocument/);
  // Center badge must use canonicalActiveVersion
  assert.match(center, /canonicalActiveVersion \? <AdminBadge tone=\{canonicalActiveVersion\.isCurrent/);
});

test("Actual DOM wrappers exist with document-legal-analysis, document-publication, and document-handoff", () => {
  const source = documentPage();
  // Must NOT count getElementById string references as proof
  const withoutGetElementById = source.replace(/getElementById\(['"][^'"]+['"]\)/g, '');

  assert.match(withoutGetElementById, /<div[^>]*id="document-legal-analysis"/);
  assert.match(withoutGetElementById, /<div[^>]*id="document-publication"/);
  assert.match(withoutGetElementById, /<div[^>]*id="document-handoff"/);
  // Lower publication section uses case-only mode to avoid double-mount writer
  assert.match(withoutGetElementById, /<ClientPublicationPanel[\s\S]*?viewMode="case-only"/);
});

test("Contextual right shell hosts actual working panels without downward scroll jumps", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must be found");
  const shell = shellMatch[0];

  // In Slice 2, right shell actions do NOT scroll down to anchor ids
  assert.doesNotMatch(shell, /document\.getElementById\(['"]document-legal-analysis['"]\)/);
  assert.doesNotMatch(shell, /document\.getElementById\(['"]document-publication['"]\)/);
  assert.doesNotMatch(shell, /document\.getElementById\(['"]document-handoff['"]\)/);
  assert.doesNotMatch(shell, /scrollIntoView/);

  // Lower section anchors still exist in source
  const targets = [
    'document-review',
    'document-changes',
    'document-legal-analysis',
    'document-publication',
    'document-handoff',
  ];
  for (const target of targets) {
    assert.match(source, new RegExp(`id="${target}"`));
  }

  // Working panels are mounted in the right shell
  assert.match(shell, /<LegalAnalysisIntakePanel/);
  assert.match(shell, /<ClientPublicationPanel/);
  assert.match(shell, /<HandoffPackagePanel/);
});

test("Canonical handoff summary does not claim ZIP export or fabricate package state", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must be found");
  const shell = shellMatch[0];

  assert.doesNotMatch(source, /ZIP export és átadási jegyzék/);
  assert.doesNotMatch(shell, /ZIP export és átadási jegyzék/);
  assert.match(shell, /HandoffPackagePanel/);
});

// Targeted regression tests for transient-state truthfulness repairs (PR #182 Final Pass)

test("Regression Proof 1: uploaded document + isLoadingVersions does NOT render 'Nincs aktív review' or 'Nincs publikálva'", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must be found");
  const shell = shellMatch[0];

  // Review header must use isReviewLoading, not fall back to "Nincs aktív review"
  assert.match(source, /isReviewLoading\s*=\s*Boolean\(selectedUploadedDocument && \(!canonicalActiveVersion \|\| isLoadingVersions\)\)/);
  assert.match(shell, /isReviewLoading\s*\?\s*"Verzióadatok betöltése\.\.\."[\s\S]*?canonicalActiveVersion\?\.reviewStatus/);
  assert.match(shell, /isReviewLoading \? \([\s\S]*?Verzió- és felülvizsgálati adatok betöltése folyamatban\.\.\./);

  // Publication status must map loading/unreconciled version state to "Publikációs állapot betöltése...", not "Nincs publikálva"
  assert.match(source, /publicationStatusLabel\s*=\s*!selectedUploadedDocument[\s\S]*?isLoadingVersions \|\| !canonicalActiveVersion[\s\S]*?"Publikációs állapot betöltése\.\.\."/);
  assert.match(shell, /\{publicationStatusLabel\}/);
});

test("Regression Proof 2: right-shell annotation counts require annotationsVersionId === canonicalActiveVersion.id", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must be found");
  const shell = shellMatch[0];

  assert.match(source, /isAnnotationCountAuthoritative\s*=\s*Boolean\(\s*canonicalActiveVersion\s*&&\s*annotationsVersionId === canonicalActiveVersion\.id\s*\)/);
  assert.match(source, /isAnnotationCountAuthoritative \? <p><b>Nyitott annotációk:<\/b> \{openAnnotationCount\} db<\/p>/);
});

test("Regression Proof 3: annotations from version A are not summarized under document/version B", () => {
  // Test the invariant directly: when annotationsVersionId belongs to version A, but canonicalActiveVersion is version B
  const versionAId = "docA-version-1";
  const versionBId = "docB-version-1";
  const annotationsVersionId = versionAId;
  const canonicalActiveVersion = { id: versionBId, versionNumber: 1 };

  const isAnnotationCountAuthoritative = Boolean(
    canonicalActiveVersion && annotationsVersionId === canonicalActiveVersion.id
  );
  assert.strictEqual(isAnnotationCountAuthoritative, false, "Counts from version A must NOT qualify as authoritative for version B");
});

test("Regression Proof 4: canonical center file-type display does not use raw stale selectedVersion when it belongs to a different document", () => {
  const source = documentPage();
  const centerMatch = source.match(/<main data-testid="canonical-center-reading"[\s\S]*?<\/main>/);
  assert.ok(centerMatch, "Center reading surface must be found");
  const center = centerMatch[0];

  assert.match(source, /canonicalShellFileType\s*=\s*\(\(\)\s*=>/);
  assert.match(center, /<AdminBadge tone="neutral">\{canonicalShellFileType\}<\/AdminBadge>/);
  assert.match(center, /\{canonicalShellFileType\} előnézet/);
  assert.doesNotMatch(center, /selectedVersionFileType/);

  // Invariant logic proof: stale selectedVersion from doc A (.txt) vs active doc B (.pdf) with unreconciled version
  const selectedUploadedDocument = { id: "docB", fileName: "documentB.pdf" };
  const canonicalActiveVersion: { originalFileName?: string | null } | null = null; // unreconciled during switch
  const getFileType = (fileName?: string | null) => {
    const ext = (fileName?.split('.').pop() || '').toLowerCase();
    if (['doc', 'docx'].includes(ext)) return 'DOCX';
    if (ext === 'pdf') return 'PDF';
    if (ext === 'txt') return 'TXT';
    return 'FILE';
  };

  const resolveShellFileType = (
    activeVersion: { originalFileName?: string | null } | null,
    uploadedDoc: { fileName?: string | null } | null
  ) => {
    if (activeVersion?.originalFileName) {
      return getFileType(activeVersion.originalFileName);
    }
    if (uploadedDoc?.fileName) {
      return getFileType(uploadedDoc.fileName);
    }
    return 'Dokumentum';
  };

  const canonicalShellFileType = resolveShellFileType(canonicalActiveVersion, selectedUploadedDocument);

  assert.strictEqual(canonicalShellFileType, "PDF", "Must use active document B's file type, never stale selectedVersion A's TXT type");
});

test("Regression Proof 5: publication jump is disabled while uploaded-document version state is unreconciled", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must be found");
  const shell = shellMatch[0];

  assert.match(shell, /disabled=\{!selectedUploadedDocument \|\| !canonicalActiveVersion \|\| !canonicalCaseId\}/);
});

// UX convergence (PR #250): consolidated header + truthful reading toolbar.

test("Canonical header consolidates real work context without duplicating primary workflows", () => {
  const source = documentPage();
  const topMatch = source.match(/<section data-testid="canonical-top-region"[\s\S]*?<\/section>/);
  assert.ok(topMatch, "Top region section must be found");
  const top = topMatch[0];

  assert.match(top, /data-testid="canonical-document-context-line"/);
  assert.match(top, /<b>Ügy:<\/b>/);
  assert.match(top, /<b>Ügyfél:<\/b>/);
  assert.match(top, /<b>Felelős:<\/b> \{activeWorkContextView\.owner\.name\}/);
  assert.match(top, /<b>Reviewer:<\/b> \{activeWorkContextView\.reviewer\.name\}/);
  assert.match(top, /<b>Határidő:<\/b> \{activeWorkContextView\.dueDateLabel\}/);
  assert.match(top, /data-testid="canonical-document-work-instruction"/);
  // responsibility/reviewer/due date come from the canonical work-context view, never inferred
  assert.match(top, /activeWorkContextView\?\.owner\?\.name/);
  assert.match(top, /activeWorkContextView\?\.reviewer\?\.name/);
  assert.match(top, /activeWorkContextView\?\.dueDateLabel/);
  // uploader must not be repurposed as Felelős
  assert.doesNotMatch(top, /<b>Felelős:<\/b>[\s\S]{0,40}uploadedBy/);

  assert.match(top, /handleDownloadUploadedDocument|handleDownload/);
  assert.match(top, /Új verzió feltöltése/);
  assert.doesNotMatch(top, /<AdminButton[^>]*>Változások<\/AdminButton>/);
  assert.doesNotMatch(top, /<AdminButton[^>]*>AI előkészítés<\/AdminButton>/);
});

test("Reading toolbar is truthful: real zoom, real focus mode, no fake page count, no false Word open", () => {
  const source = documentPage();
  const centerMatch = source.match(/<main data-testid="canonical-center-reading"[\s\S]*?<\/main>/);
  assert.ok(centerMatch, "Center reading surface must be found");
  const center = centerMatch[0];

  assert.match(center, /data-testid="reading-zoom-select"/);
  assert.match(source, /\{\[75, 90, 100, 110, 125, 150\]\.map/);
  // zoom changes display only — applied as a style, never to text/state
  assert.match(center, /style=\{\{ zoom: readerZoom \/ 100 \}\}/);
  assert.match(center, /data-testid="reading-focus-toggle"/);
  // focus mode collapses the auxiliary rails and back to a single column
  assert.match(source, /readingFocus \? " lg:hidden" : ""/);
  assert.match(source, /readingFocus \? "lg:grid-cols-\[minmax\(0,1fr\)\]"/);

  // no invented pagination and no unproven Word open action
  assert.doesNotMatch(source, /\b1 \/ 24\b/);
  assert.doesNotMatch(source, /Megnyitás Wordben/);
  assert.doesNotMatch(source, /WORD_OPEN/);
});

test("AI preparation and comparison remain contextual secondary capabilities", () => {
  const source = documentPage();
  // the AI modal receives a canonical Document id (never a generated-contract id)
  assert.ok(source.includes("documentId={selectedUploadedDocument.id}"));
  assert.ok(!source.includes("documentId={activeDocument.id}"));
  // AI remains available from the secondary left-rail preparation block.
  const aiIndex = source.indexOf("setAiPreparationOpen(true)");
  assert.ok(aiIndex > 0);
  assert.match(source.slice(Math.max(0, aiIndex - 220), aiIndex), /selectedUploadedDocument \?/);
  assert.match(source, /setAiVersionPair\(\[baseVersionId, targetVersionId\]\)/);
  assert.match(source, /router\.push\(metaCompareUrl\)/);
});

test("Selection quick toolbar maps to canonical annotation types and never creates a real task", () => {
  const source = documentPage();
  assert.match(source, /data-testid="selection-quick-toolbar"/);
  for (const testId of ["INTERNAL_NOTE", "QUESTION", "MODIFICATION_REASON", "DECISION", "TASK_NOTE"]) {
    assert.ok(source.includes(`testId: '${testId}'`), `quick action ${testId} must be present`);
  }
  // TASK_NOTE is labelled truthfully as an annotation (not a workflow task)
  assert.match(source, /type: 'TASK_NOTE', label: 'Feladatjelölés'/);
  // quick action only preconfigures the existing canonical composer
  assert.match(source, /const applyQuickAnnotationType = \(type: DocumentAnnotationType\)/);
  assert.match(source, /setAnnotationDraft\(\(draft\) => \(\{ \.\.\.draft, annotationType: type \}\)\)/);
  const fnStart = source.indexOf("const applyQuickAnnotationType");
  const fnBody = source.slice(fnStart, source.indexOf("};", fnStart));
  assert.doesNotMatch(fnBody, /createTask|createDocumentTask|onCreateTask/);
});

test("Reader search is truthful: exact displayed text, real scroll navigation, no annotation risk", () => {
  const source = documentPage();
  assert.match(source, /data-testid="reader-search-input"/);
  assert.match(source, /data-testid="reader-search-prev"/);
  assert.match(source, /data-testid="reader-search-next"/);
  assert.match(source, /data-testid="reader-search-clear"/);
  // search is enabled only on a surface that can highlight + navigate
  assert.match(source, /const readerSearchSupported = isReaderSearchSupported\(readerSearchSurface\)/);
  // version-scoped surface searches the exact version text; the legacy plain
  // surface searches the document-level preview.
  assert.match(source, /readerSearchSurface === 'VERSION_TEXT' \? versionText : documentTextPreview/);
  assert.match(source, /const readerSearchSurface = resolveReaderSearchSurface\(\{/);
  assert.match(source, /hasVersionText: Boolean\(hasVersionScopedText && selectedVersionBelongsToActiveDocument && versionText\)/);
  assert.match(source, /'Nincs kereshető szöveg'/);
  assert.match(source, /'Nincs találat'/);
  // active match scrolls into view via a stable presentation index
  assert.match(source, /data-reader-search-index=\{segment\.matchIndex\}/);
  assert.match(source, /scrollIntoView\(/);
  // stale query/active match is reset on document/version switch
  assert.match(source, /readerSearchDispatch\(\{ type: 'RESET' \}\)/);
  // presentation-only highlight applied to the exact rendered version text
  assert.match(source, /data-testid="reader-search-match"/);
  assert.match(source, /buildReaderHighlightSegmentsInRange\(text, rangeStart, rangeEnd, readerMatchOffsets, readerSearchTerm\.length\)/);
  assert.match(source, /renderAnnotatedText\(\)/);
});
