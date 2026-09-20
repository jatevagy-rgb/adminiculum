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
const publicationPanel = () => read("src/components/documents/publication/ClientPublicationPanel.tsx");
const handoffPanel = () => read("src/components/handoff/HandoffPackagePanel.tsx");

test("Requirement 1: AI and legal analysis remain secondary approval tools", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must exist");
  const shell = shellMatch[0];

  assert.match(shell, /id="approval-ai-tools"/);
  assert.match(shell, /<LegalAnalysisIntakePanel/);
  assert.doesNotMatch(shell, /document\.getElementById\(['"]document-legal-analysis['"]\)/);
  assert.doesNotMatch(shell, /scrollIntoView/);
});

test("Requirement 2: Publication remains a secondary approval tool", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must exist");
  const shell = shellMatch[0];

  assert.match(shell, /id="approval-publication-tools"/);
  assert.match(shell, /<ClientPublicationPanel/);
  assert.match(shell, /viewMode="document-only"/);
  assert.doesNotMatch(shell, /document\.getElementById\(['"]document-publication['"]\)/);
  assert.doesNotMatch(shell, /scrollIntoView/);
});

test("Requirement 3: Handoff remains a secondary approval tool", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must exist");
  const shell = shellMatch[0];

  assert.match(shell, /id="approval-handoff-tools"/);
  assert.match(shell, /<HandoffPackagePanel/);
  assert.match(shell, /compact/);
  assert.doesNotMatch(shell, /document\.getElementById\(['"]document-handoff['"]\)/);
  assert.doesNotMatch(shell, /scrollIntoView/);
});

test("Requirement 4: Four primary modes switch contextual working content in right shell", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must exist");
  const shell = shellMatch[0];

  // All 4 tabs present with active state switches
  for (const mode of ["overview", "changes", "comments", "approval"]) {
    assert.match(shell, new RegExp(`contextualTab === '${mode}'`));
  }
  assert.doesNotMatch(shell, /onClick=\{\(\) => setContextualTab\('(elemzes|ugyfel|leadas)'\)\}/);

  // Comments owns annotation controls; approval remains review-only.
  const commentsPanel = shell.slice(shell.indexOf('data-testid="contextual-comments-panel"'));
  const approvalPanel = shell.slice(shell.indexOf('data-testid="contextual-approval-panel"'), shell.indexOf('data-testid="contextual-changes-panel"'));
  assert.match(commentsPanel, /openAnnotationCount|handleCreateAnnotation/);
  assert.match(commentsPanel, /handleResolveAnnotation/);
  assert.doesNotMatch(approvalPanel, /handleCreateAnnotation|handleDeleteAnnotation|annotationDraft/);

  // Elemzés mounts LegalAnalysisIntakePanel
  assert.match(shell, /LegalAnalysisIntakePanel/);

  // Ügyfél mounts ClientPublicationPanel
  assert.match(shell, /ClientPublicationPanel/);

  // Leadás mounts HandoffPackagePanel
  assert.match(shell, /HandoffPackagePanel/);
});

test("Requirement 5: No duplicate legal-analysis editor is mounted simultaneously", () => {
  const source = documentPage();

  // Exactly one instance of LegalAnalysisIntakePanel in the entire file
  const matches = source.match(/<LegalAnalysisIntakePanel/g);
  assert.equal(matches?.length, 1, "There must be exactly one LegalAnalysisIntakePanel mounted in the page");

  // The single instance is in the canonical right shell
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch);
  assert.match(shellMatch[0], /<LegalAnalysisIntakePanel/);

  // Lower section #document-legal-analysis is a summary/pointer card with tab switcher
  assert.match(source, /id="document-legal-analysis"/);
  assert.match(source, /setContextualTab\('approval'\)/);
});

test("Requirement 6: No duplicate publication writer is mounted simultaneously", () => {
  const source = documentPage();
  const pubSrc = publicationPanel();

  // ClientPublicationPanel supports viewMode prop
  assert.match(pubSrc, /viewMode\?: "full" \| "document-only" \| "case-only"/);

  // Right shell mounts in document-only mode (drafting/transition card for document)
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch);
  assert.match(shellMatch[0], /<ClientPublicationPanel[\s\S]*?viewMode="document-only"/);

  // Lower section mounts in case-only mode with documentId={undefined} (case grants & matter status only)
  assert.match(source, /id="document-publication"[\s\S]*?<ClientPublicationPanel[\s\S]*?documentId=\{undefined\}[\s\S]*?viewMode="case-only"/);
});

test("Requirement 7: Selected document and version context is passed truthfully to panels", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch);
  const shell = shellMatch[0];

  // Legal analysis panel props
  assert.match(shell, /caseId=\{canonicalCaseId\}/);
  assert.match(shell, /documentId=\{selectedUploadedDocument\.id\}/);

  // Publication panel props
  assert.match(shell, /selectedVersionId=\{canonicalActiveVersion\.id\}/);

  // Handoff panel props
  assert.match(shell, /caseId=\{caseRecord\.id\}/);
  assert.match(shell, /sourceDocumentId=\{selectedUploadedDocument\?\.id \|\| null\}/);
});

test("Requirement 8: Switching documents resets panel state via documentId key prop", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch);
  const shell = shellMatch[0];

  // Key prop guarantees React unmounts/remounts state when document changes
  assert.match(shell, /key=\{selectedUploadedDocument\.id\}/);
});

test("Requirement 9: Preserved extended tools section remains reachable", () => {
  const source = documentPage();
  assert.match(source, /id="preserved-extended-tools"/);
  assert.match(source, /data-testid="preserved-extended-tools"/);
  assert.match(source, /További meglévő dokumentumeszközök/);
  assert.match(source, /id="document-overview"/);
  assert.match(source, /id="document-review"/);
  assert.match(source, /id="document-publication"/);
  assert.match(source, /id="document-handoff"/);
  assert.match(source, /id="document-changes"/);
});

test("Requirement 10: Comparison workspace remains reachable as secondary tool", () => {
  const source = documentPage();
  assert.match(source, /data-testid="cmp-workspace-section"/);
  assert.match(source, /<ComparisonWorkspace/);
  assert.match(source, /selectedUploadedDocument && versions\.length >= 2/);
});

test("Requirement 11: Desktop Word remains primary editor and browser edit remains secondary/experimental", () => {
  const source = documentPage();
  assert.match(source, /Microsoft Word \(asztali\)/);
  assert.match(source, /Read-only előnézet · Word a szerkesztő/);
  assert.match(source, /A megváltoztathatatlan verzió tartalma letöltéssel és Microsoft Wordben érhető el/);
});

test("Requirement 12: PR #181 text extraction semantics preserved", () => {
  const source = documentPage();
  assert.match(source, /canRenderTextVersion/);
  assert.match(source, /selectedVersionBelongsToActiveDocument/);
  assert.match(source, /versionTextUnavailable/);
  assert.match(source, /setSelectedVersionId/);
});

test("Requirement 13: Historical non-TXT versions do not receive current text preview", () => {
  const source = documentPage();
  assert.match(source, /data-testid="version-preview-unavailable"/);
  assert.match(source, /Stabil szövegkijelölés még nincs ehhez a formátumhoz/);
  assert.match(source, /A megváltoztathatatlan verzió tartalma letöltéssel és Microsoft Wordben érhető el/);
});

test("Requirement 14: Publication status and version safety rules remain unchanged", () => {
  const source = documentPage();
  assert.match(source, /isReviewLoading/);
  assert.match(source, /isLoadingVersions \|\| !canonicalActiveVersion/);
  assert.match(source, /Publikációs állapot betöltése\.\.\./);
  assert.match(source, /publicationStatusLabel/);
  assert.match(source, /selectedVersionBelongsToActiveDocument/);
  assert.match(source, /canonicalActiveVersion/);
});

test("Requirement 15: HandoffPackagePanel compact mode styling support", () => {
  const handoffSrc = handoffPanel();
  assert.match(handoffSrc, /compact\?: boolean/);
});

test("Requirement 16: Keep-alive visited tabs in canonical right shell preserve unsaved editor state across tab switches", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must exist");
  const shell = shellMatch[0];

  // Visited tabs tracking initialized with the overview mode only
  assert.match(source, /visitedContextualTabs,\s*setVisitedContextualTabs\]\s*=\s*useState<Record<string,\s*boolean>>\(\{\s*overview:\s*true\s*\}\)/);
  // Visited tabs updated on tab switch
  assert.match(source, /setVisitedContextualTabs\(\(prev\)\s*=>\s*\(prev\[contextualTab\]\s*\?\s*prev\s*:\s*\{\s*\.\.\.prev,\s*\[contextualTab\]:\s*true\s*\}\)\)/);
  // Tab panels are kept mounted using 'hidden' class once visited
  assert.match(shell, /className=\{contextualTab === 'overview' \? 'space-y-4' : 'hidden'\}/);
  assert.match(shell, /visitedContextualTabs\['approval'\]/);
  assert.match(shell, /className=\{contextualTab === 'approval' \? 'space-y-4' : 'hidden'\}/);
  assert.doesNotMatch(shell, /visitedContextualTabs\['(elemzes|ugyfel|leadas)'\]/);

  // Document switch resets visited tabs and clears annotation draft
  assert.match(source, /setVisitedContextualTabs\(\{\s*\[contextualTab\]:\s*true\s*\}\)/);
  assert.match(source, /resetAnnotationDraft\(\)/);
});

test("Requirement 17: Text selection anchor supports both canonical reader and detailed review surface", () => {
  const source = documentPage();

  // Ref defined for detailed annotation surface
  assert.match(source, /detailedAnnotationSurfaceRef\s*=\s*useRef<HTMLDivElement\s*\|\s*null>\(null\)/);
  // Detailed surface div attaches ref
  assert.match(source, /<div[\s\S]*?ref=\{detailedAnnotationSurfaceRef\}[\s\S]*?onMouseUp=\{annotationCapabilities\.canCreateTextRange \? handleTextSelectionAnchor : undefined\}/);

  // handleTextSelectionAnchor verifies containment in currentTarget, canonical reader, or detailed surface
  assert.match(source, /handleTextSelectionAnchor\s*=\s*\(event\?: React\.MouseEvent<HTMLElement>\)\s*=>/);
  assert.match(source, /currentTarget\?\.contains\(anchorNode\)/);
  assert.match(source, /annotationSurfaceRef\.current\?\.contains\(anchorNode\)/);
  assert.match(source, /detailedAnnotationSurfaceRef\.current\?\.contains\(anchorNode\)/);
});

test("Annotation rail keeps comments active and focuses supported text anchors", () => {
  const source = documentPage();
  const commentsPanel = source.slice(source.indexOf('data-testid="contextual-comments-panel"'));
  assert.ok(commentsPanel.includes('data-testid="contextual-comments-panel"'), "Comments panel must remain present");
  assert.match(commentsPanel, /onClick=\{\(\) => focusAnnotation\(annotation\)\}/);
  assert.doesNotMatch(commentsPanel, /setContextualTab\('review'\)/);
  assert.match(source, /const focusAnnotation = \(annotation: DocumentAnnotationItem\) =>/);
  assert.match(source, /setSelectedAnnotationId\(annotation\.id\)/);
  assert.match(source, /globalThis\.requestAnimationFrame\?\.\(\(\) =>/);
  assert.match(source, /document\.getElementById\(`annotation-anchor-\$\{annotation\.id\}`\)/);
  assert.match(source, /target\.scrollIntoView\(\{\s*block: 'center',\s*behavior: 'smooth',\s*\}\)/);
  assert.match(source, /id=\{`annotation-anchor-\$\{annotation\.id\}`\}/);
  assert.match(source, /data-annotation-id=\{annotation\.id\}/);
  assert.match(source, /aria-current=\{selectedAnnotationId === annotation\.id \? 'true' : undefined\}/);
});

test("Unsupported visual anchors remain selected without fabricated navigation", () => {
  const source = documentPage();
  assert.match(source, /annotation\.anchorType === 'TEXT_RANGE'/);
  assert.match(source, /annotationCapabilities\.canNavigateToTextAnchor/);
  assert.match(source, /const isPageAnchor =/);
  assert.match(source, /annotationCapabilities\.canNavigateToPageAnchor/);
  assert.match(source, /document\.getElementById\(`visual-annotation-anchor-\$\{annotation\.id\}`\)/);
  assert.match(source, /A vizuális horgony kiválasztva; ehhez a verzióhoz nincs feloldható olvasói pozíció\./);
  assert.match(source, /data-testid="annotation-focus-message"/);
});

test("Supported visual anchors reuse rendered page controls for navigation", () => {
  const source = documentPage();
  const pageSurface = source.match(/canRenderPageSurface \? annotations\.filter[\s\S]*?pendingVisualAnchor/)?.[0];
  assert.ok(pageSurface, "Rendered page annotation controls must remain present");
  assert.match(source, /id=\{`visual-annotation-anchor-\$\{annotation\.id\}`\}/g);
  assert.match(source, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /target\.scrollIntoView\(\{\s*block: 'center',\s*behavior: 'smooth',\s*\}\)/);
  assert.match(pageSurface, /PAGE_RECTANGLE/);
  assert.match(pageSurface, /PAGE_POINT/);
});

test("Annotation creation, editing, resolution, deletion, and comments remain canonical", () => {
  const source = documentPage();
  assert.match(source, /handleCreateAnnotation/);
  assert.match(source, /handleResolveAnnotation/);
  assert.match(source, /handleReopenAnnotation/);
  assert.match(source, /handleDeleteAnnotation/);
  assert.match(source, /handleAddAnnotationComment/);
  assert.match(source, /getDocumentAnnotationComments/);
  assert.match(source, /selectedAnnotation\.headline/);
  assert.match(source, /selectedAnnotation\.internalNote/);
  assert.doesNotMatch(source, /new\s+DocumentAnnotation/);
});

test("Requirement 18: Canonical composer displays client-explanation draft field with NotPublishedBadge for CLIENT_EXPLANATION_DRAFT", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must exist");
  const shell = shellMatch[0];

  // Canonical composer checks isClientExplanationDraft
  assert.match(shell, /isClientExplanationDraft\(annotationDraft\.annotationType\)/);
  assert.match(shell, /id="comments-ann-client-draft"/);
  assert.match(shell, /Ügyfélnek szánt magyarázat/);
  assert.match(shell, /<NotPublishedBadge \/>/);
  assert.match(shell, /value=\{annotationDraft\.clientExplanationDraft\}/);
  assert.match(shell, /onChange=\{\(event\)\s*=>\s*setAnnotationDraft\(\(draft\)\s*=>\s*\(\{\s*\.\.\.draft,\s*clientExplanationDraft:\s*event\.target\.value\s*\}\)\)\}/);

  // In-shell annotation list and detail badges
  assert.match(shell, /isClientExplanationDraft\(annotation\.annotationType\)\s*\?\s*<NotPublishedBadge \/>/);
  assert.match(shell, /isClientExplanationDraft\(selectedAnnotation\.annotationType\)\s*\?\s*<NotPublishedBadge \/>/);
  assert.match(shell, /selectedAnnotation\.clientExplanationDraft/);
});

test("Requirement 19: Client explanation to publication preparation bridge (A, B, C, F, G, I, J)", () => {
  const source = documentPage();
  const shellMatch = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/);
  assert.ok(shellMatch, "Right shell must exist");
  const shell = shellMatch[0];

  // A. Selected CLIENT_EXPLANATION_DRAFT exposes publication-preparation action
  assert.match(shell, /isClientExplanationDraft\(selectedAnnotation\.annotationType\)\s*\?\s*\(\s*<AdminButton[\s\S]*?Közzététel előkészítése/);

  // I. Non-client annotation types do not expose this publication-preparation action (guarded by isClientExplanationDraft)
  assert.doesNotMatch(shell, /<AdminButton[^>]*>Közzététel előkészítése<\/AdminButton>\s*<AdminButton size="sm" variant="gold"/, "Must be gated by isClientExplanationDraft");

  // B. Action seeds: headline -> client-facing title, clientExplanationDraft -> client-facing explanation
  assert.match(source, /handlePreparePublicationFromAnnotation\s*=\s*\(annotation:\s*DocumentAnnotationItem\)\s*=>/);
  assert.match(source, /annotation\.headline\?\.trim\(\)\s*\|\|\s*activeTitle/);
  assert.match(source, /annotation\.clientExplanationDraft\?\.trim\(\)\s*\|\|\s*''/);
  assert.match(source, /setPublicationPrefill\(\{\s*key:\s*`\$\{annotation\.id\}:\$\{Date\.now\(\)\}`,\s*title,\s*explanation,?\s*\}\)/);

  // C. Action switches to contextualTab='ugyfel'
  assert.match(source, /setContextualTab\('approval'\)/);

  // F & G. No createDocumentPublicationDraft or transitionDocumentPublication call in preparation action
  const prepareFnMatch = source.match(/const handlePreparePublicationFromAnnotation\s*=\s*\([\s\S]*?\n  \};/);
  assert.ok(prepareFnMatch);
  assert.doesNotMatch(prepareFnMatch[0], /createDocumentPublicationDraft/);
  assert.doesNotMatch(prepareFnMatch[0], /transitionDocumentPublication/);
  assert.doesNotMatch(prepareFnMatch[0], /publish/i);

  // J. Document switch resets publicationPrefill to prevent leakage
  const docSwitchEffectMatch = source.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?setPublicationPrefill\(null\);[\s\S]*?\},\s*\[selectedUploadedDocument\?\.id\]\);/);
  assert.ok(docSwitchEffectMatch, "Document switch effect must reset publicationPrefill");

  // Prefill passed to ClientPublicationPanel in canonical right shell
  assert.match(shell, /<ClientPublicationPanel[\s\S]*?prefillDraft=\{publicationPrefill\}/);
});

test("Requirement 20: ClientPublicationPanel prefill lifecycle semantics (D, E, H)", () => {
  const pubSrc = publicationPanel();

  // D. Accepts prefillDraft prop with explicit key tracking
  assert.match(pubSrc, /prefillDraft\?:\s*ClientPublicationPrefillDraft\s*\|\s*null/);
  assert.match(pubSrc, /lastAppliedPrefillKeyRef\s*=\s*useRef<string\s*\|\s*null>\(null\)/);
  assert.match(pubSrc, /if\s*\(!prefillDraft\)\s*\{\s*lastAppliedPrefillKeyRef\.current\s*=\s*null;\s*return;\s*\}/);
  assert.match(pubSrc, /if\s*\(prefillDraft\.key === lastAppliedPrefillKeyRef\.current\)\s*return;/);
  assert.match(pubSrc, /lastAppliedPrefillKeyRef\.current\s*=\s*prefillDraft\.key;/);
  assert.match(pubSrc, /setDocumentTitle\(prefillDraft\.title\)/);
  assert.match(pubSrc, /setDocumentExplanation\(prefillDraft\.explanation\)/);

  // E. Normal rerender without new key does not overwrite user edits (guarded by key check)

  // H. Publication still requires the existing explicit ActionRow lifecycle
  assert.match(pubSrc, /<ActionRow/);
  assert.match(pubSrc, /createLabel="Dokumentum-tervezet létrehozása"/);
  assert.match(pubSrc, /onCreate=\{\(\)\s*=>\s*selectedVersion\s*&&\s*documentId\s*\?\s*run\(\(\)\s*=>\s*createDocumentPublicationDraft/);
  assert.match(pubSrc, /onTransition=\{\(action\)\s*=>\s*documentPublication\s*\?\s*run\(\(\)\s*=>\s*transitionDocumentPublication/);
  assert.match(pubSrc, /disabled=\{busy\s*\|\|\s*!activeGrant\s*\|\|\s*!selectedVersion\}/);
});
