import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "src/app/cases/[caseId]/documents/page.tsx"),
  "utf8",
);

test("DW01 canonicalizes default selection with replace and user selection with push", () => {
  assert.match(source, /const syncDocumentIdToUrl = useCallback/);
  assert.match(source, /params\.set\("documentId", documentId\)/);
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
  const overview = source.match(/data-testid="contextual-overview-panel"[\s\S]*?<\/div>\s*<div className=\{contextualTab === 'approval'/)?.[0] ?? "";
  assert.doesNotMatch(top, /<AdminButton[^>]*>Változások<\/AdminButton>/);
  assert.doesNotMatch(top, /<AdminButton[^>]*>AI előkészítés<\/AdminButton>/);
  assert.doesNotMatch(overview, /Változások megnyitása|Megjegyzések megnyitása|Jóváhagyás megnyitása/);
  for (const label of ["Áttekintés", "Változások", "Megjegyzések", "Jóváhagyás"]) {
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
  assert.match(resolveEffect, /modifiedWorkingCopies\.find\(\(document\) => document\.id === requestedDocumentId\)/);
  assert.doesNotMatch(resolveEffect, /syncDocumentIdToUrl|router\[/);
  assert.match(source, /syncDocumentIdToUrl\(null, "replace"\)/);
});
