import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "src/app/cases/[caseId]/documents/page.tsx"),
  "utf8",
);

test("DW01 canonicalizes default selection with replace and user selection with push", () => {
  assert.match(source, /const syncWorkspaceIdentityToUrl = useCallback/);
  assert.match(source, /const syncDocumentIdToUrl = useCallback/);
  assert.match(source, /params\.set\("documentId", identity\.documentId\)/);
  assert.match(source, /syncDocumentIdToUrl\([^,]+, "replace"\)/);
  assert.match(source, /const selectLedgerItem = useCallback/);
  assert.match(source, /history: "push" \| "replace" = "push"/);
  assert.match(source, /syncDocumentIdToUrl\(item\.item\.id, history\)/);
  assert.match(source, /router\[history\]\(nextUrl\)/);
});

test("DW01 preserves query parameters and resolves browser deep-link changes without a routing loop", () => {
  assert.match(source, /new URLSearchParams\(searchParams\?\.toString\(\)\)/);
  assert.match(source, /const requestedDocumentId = searchParams\?\.get\("documentId"\)/);
  assert.match(source, /if \(!requestedDocumentId \|\| \(!uploadedDocuments\.length && !contracts\.length && !modifiedWorkingCopies\.length\)\) return/);
  const resolveEffectStart = source.indexOf("if (!requestedDocumentId || (!uploadedDocuments.length");
  const resolveEffectEnd = source.indexOf("}, [contracts, requestedDocumentId", resolveEffectStart);
  const resolveEffect = source.slice(resolveEffectStart, resolveEffectEnd);
  assert.ok(resolveEffectStart > 0 && resolveEffectEnd > resolveEffectStart);
  assert.doesNotMatch(resolveEffect, /syncDocumentIdToUrl|router\[/);
});

test("DW02 opens the document navigator and enables the desktop three-column shell", () => {
  assert.match(source, /<details data-testid="document-version-navigation" open>/);
  assert.match(source, /lg:grid-cols-\[230px_minmax\(0,1fr\)_290px\]/);
  assert.match(source, /xl:grid-cols-\[280px_minmax\(0,1fr\)_320px\]/);
  assert.match(source, /readingFocus \? "lg:grid-cols-\[minmax\(0,1fr\)\]"/);
});

test("DW04 keeps four tabs while removing generic hero and Overview mode duplicates", () => {
  const top = source.match(/<section data-testid="canonical-top-region"[\s\S]*?<\/section>/)?.[0] ?? "";
  const overview = source.match(/data-testid="document-mode-overview"[\s\S]*?<\/div>\s*<div className=\{activeMode === 'review'/)?.[0] ?? "";
  assert.doesNotMatch(top, /<AdminButton[^>]*>Változások<\/AdminButton>/);
  assert.doesNotMatch(top, /<AdminButton[^>]*>AI előkészítés<\/AdminButton>/);
  assert.doesNotMatch(overview, /Változások megnyitása|Megjegyzések megnyitása|Jóváhagyás megnyitása/);
  for (const label of ["DOKUMENTUM", "VÁLTOZÁSOK", "VÉLEMÉNYEZÉS", "VERZIÓK"]) {
    assert.match(readFileSync(path.resolve(process.cwd(), "src/components/documents/workContext/DocumentWorkspaceTabs.tsx"), "utf8"), new RegExp(label));
  }
  assert.match(source, /setAiVersionPair\(\[baseVersionId, targetVersionId\]\)/);
  assert.match(source, /AI előkészítés megnyitása/);
});

test("DW05 renders optional metadata only when values exist", () => {
  assert.match(source, /activeWorkContextView\?\.owner\?\.name \? <span>/);
  assert.match(source, /activeWorkContextView\?\.reviewer\?\.name \? <span>/);
  assert.match(source, /activeWorkContextView\?\.dueDateLabel \? <span>/);
  assert.doesNotMatch(source, /activeWorkContextView\?\.(owner|reviewer|dueDateLabel)[\s\S]{0,50}\?\? ['"]—['"]/);
});

test("legacy metadata comparison keeps its canonical route and has no case-scoped alias", () => {
  assert.match(source, /const metaCompareUrl =/);
  assert.match(source, /`\/documents\/compare\?caseId=/);
  assert.match(source, /router\.push\(metaCompareUrl\)/);
  assert.doesNotMatch(source, /\/cases\/\$\{[^}]*\}\/documents\/compare/);
});

test("DW01 resolves every selectable ledger kind from the URL and clears a deleted document id", () => {
  const resolveEffectStart = source.indexOf("if (!requestedDocumentId || (!uploadedDocuments.length");
  const resolveEffectEnd = source.indexOf("}, [contracts, requestedDocumentId", resolveEffectStart);
  const resolveEffect = source.slice(resolveEffectStart, resolveEffectEnd);
  assert.ok(resolveEffectStart > 0 && resolveEffectEnd > resolveEffectStart);
  assert.match(resolveEffect, /findRequestedDocument\(requestedDocumentId, \[uploadedDocuments, modifiedWorkingCopies\]\)/);
  assert.doesNotMatch(resolveEffect, /syncDocumentIdToUrl|router\[/);
  assert.match(source, /syncDocumentIdToUrl\(null, "replace"\)/);
});

test("DW06 writes version identity only as documentId plus explicit historical versionId", () => {
  assert.match(source, /const requestedVersionId = searchParams\?\.get\("versionId"\)/);
  assert.match(source, /params\.set\("versionId", identity\.versionId\)/);
  assert.match(source, /params\.delete\("versionId"\)/);
  // A versionId is only ever written together with its documentId.
  assert.match(source, /if \(identity\.documentId && identity\.versionId\)/);
  // Document switch always drops any previous version identity.
  assert.match(source, /syncWorkspaceIdentityToUrl\(\{ documentId, versionId: null \}, history\)/);
  // Current/default version stays implicit; only historical versions are written.
  assert.match(source, /const selectVersion = \(version: DocumentVersionItem/);
  assert.match(source, /versionId: version\.isCurrent \? null : version\.id/);
  assert.match(source, /onClick=\{\(\) => selectVersion\(version\)\}/);
  // Promoting or uploading a new current version canonicalizes back to document-only.
  assert.match(source, /syncWorkspaceIdentityToUrl\(\{ documentId: version\.documentId, versionId: null \}, "replace"\)/);
  assert.match(source, /syncWorkspaceIdentityToUrl\(\{ documentId: selectedUploadedDocument\.id, versionId: null \}, "replace"\)/);
});

test("DW06 resolves explicit historical versions from the URL and blocks cross-document leakage", () => {
  const effectStart = source.indexOf("const activeDocumentId = selectedUploadedDocument?.id ?? selectedGeneratedContract?.id ?? null;");
  const effectEnd = source.indexOf("}, [isLoadingVersions, requestedVersionId, selectedUploadedDocument?.id, selectedGeneratedContract?.id, selectedVersionId, syncWorkspaceIdentityToUrl, versions, versionsLoadedForDocumentId]);", effectStart);
  const effect = source.slice(effectStart, effectEnd);
  assert.ok(effectStart > 0 && effectEnd > effectStart);
  // Wait until the loaded version list is authoritative for the active document; never
  // reconcile against another document's versions (or a not-yet-loaded empty list).
  assert.match(source, /setVersionsLoadedForDocumentId\(documentId\)/);
  assert.match(effect, /versionsLoadedForDocumentId !== activeDocumentId/);
  // Explicit historical versions bind; stale/foreign/current ids canonicalize to the document's current version.
  assert.match(effect, /if \(match && !match\.isCurrent\)/);
  assert.match(effect, /syncWorkspaceIdentityToUrl\(\{ documentId: activeDocumentId, versionId: null \}, "replace"\)/);
  assert.match(effect, /if \(versions\.length === 0\)/);
  // URL-driven reconciliation must never issue router navigation itself (no loop).
  assert.doesNotMatch(effect, /router\[/);
});

test("DW06 keeps version-bound annotation and review projection context on the selected immutable version", () => {
  assert.match(source, /refreshAnnotations\(selectedUploadedDocument\.id, selectedVersion\.id\)/);
  assert.match(source, /annotationsVersionId === canonicalActiveVersion\.id/);
  assert.match(source, /reviewProjection\.currentVersion\.id === selectedVersion\?\.id/);
  assert.match(source, /approval-current-version-note/);
});

