/**
 * Compliance document upload UX — behaviour contract (source-level, no DOM).
 *
 * The internal compliance page must offer exactly the two user intents, render
 * the legal matrix automatically, keep the advanced existing-document flow
 * secondary, and expose the canonical upload API wrapper.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const VIEW = join(__dirname, '..', 'src', 'components', 'clients', 'compliance', 'ComplianceDocumentsSection.tsx');
const PANEL = join(__dirname, '..', 'src', 'components', 'clients', 'compliance', 'ComplianceClauseAnchorPanel.tsx');
const API = join(__dirname, '..', 'src', 'lib', 'complianceDocumentApi.ts');

const read = (path: string) => readFileSync(path, 'utf8');

test('primary flow exposes exactly the two intent upload actions', () => {
  const src = read(VIEW);
  assert.match(src, /Feltöltés ügyfélnek/);
  assert.match(src, /Feltöltés jogi mátrixszal/);
  // The abstract audience dropdown is no longer part of the primary flow.
  const primary = src.slice(src.indexOf('Dokumentum feltöltése'), src.indexOf('Összekapcsolt dokumentumok'));
  assert.doesNotMatch(primary, /Dokumentum célja/);
});

test('P. internal cards render the legal matrix automatically (no activation button)', () => {
  const src = read(VIEW);
  assert.match(src, /audience === "INTERNAL_ANALYSIS" \? \([\s\S]*?<ComplianceClauseAnchorPanel/);
  assert.doesNotMatch(src, /matrixOpen/);
  assert.doesNotMatch(src, /Jogi mátrix elrejtése/);
  assert.doesNotMatch(src, /Jogi mátrix"/);
});

test('Q. existing manual document linking stays available as a secondary section', () => {
  const src = read(VIEW);
  assert.match(src, /Meglévő dokumentum kapcsolása/);
  assert.match(src, /Dokumentum összekapcsolása/);
  assert.match(src, /Meglévő dokumentum keresése/);
  assert.match(src, /complianceDocumentApi\.link\(/);
});

test('truthful client-facing outcome copy is shown after upload', () => {
  const src = read(VIEW);
  assert.match(src, /Feltöltve – jóváhagyásra vár/);
  assert.match(src, /Ügyfélnek közzétéve/);
  assert.match(src, /a jogi mátrix feldolgozása folyamatban/);
  // Never claims approval-pending without a canonical DRAFT publication id.
  assert.match(src, /result\.publication\?\.status === "DRAFT" && result\.publication\?\.publicationId/);
  // Truthful partial success when no publication draft exists.
  assert.match(src, /az ügyfélközzétételi tervezet nem jött létre/);
  assert.doesNotMatch(src, /a jogi mátrix automatikusan elkészül/);
});

test('auto matrix refresh is bounded and stops when rows arrive', () => {
  const panel = read(PANEL);
  assert.match(panel, /AUTO_MATRIX_MAX_ATTEMPTS = 6/);
  assert.match(panel, /autoRefreshWhileEmpty\?: boolean/);
  assert.match(panel, /autoRefreshAttempts >= AUTO_MATRIX_MAX_ATTEMPTS/);
  assert.match(panel, /clearTimeout\(timer\)/);
  const src = read(VIEW);
  assert.match(src, /autoRefreshWhileEmpty=\{freshDocumentId === link\.documentId\}/);
});

test('M/N. the chooser appears ONLY for 409 COMPLIANCE_CASE_AMBIGUOUS', () => {
  const src = read(VIEW);
  assert.match(src, /error instanceof ApiError && error\.status === 409 && error\.code === "COMPLIANCE_CASE_AMBIGUOUS"/);
  assert.match(src, /data-testid="compliance-case-chooser"/);
  assert.match(src, /Több alkalmas compliance ügy található\. Válassza ki, melyik ügyhöz kerüljön a dokumentum\./);
  // A different 409 code still falls through to the generic upload error.
  assert.match(src, /setActionError\("A dokumentum feltöltése jelenleg nem sikerült\."\)/);
});

test('O/T. the normal flow has no Case selector and keeps the two primary actions', () => {
  const src = read(VIEW);
  assert.match(src, /Feltöltés ügyfélnek/);
  assert.match(src, /Feltöltés jogi mátrixszal/);
  // The chooser renders only when a pending ambiguity upload exists.
  assert.match(src, /\{pendingUpload \? \(/);
  const beforeChooser = src.slice(0, src.indexOf('data-testid="compliance-case-chooser"'));
  assert.doesNotMatch(beforeChooser, /Dokumentum célja/);
});

test('P/Q. the chooser shows only caseNumber + title and retries the SAME prepared payload', () => {
  const src = read(VIEW);
  assert.match(src, /\{option\.caseNumber\} · \{option\.title\}/);
  assert.match(src, /Feltöltés a kiválasztott ügyhöz/);
  assert.match(src, /runUpload\(payload, selectedCaseId\)/);
  // The prepared upload is stored so the file never has to be re-selected.
  assert.match(src, /setPendingUpload\(payload\)/);
  assert.match(src, /const payload = pendingUpload;/);
});

test('R/S. cancel clears the ambiguity state and zero options show a truthful no-access message', () => {
  const src = read(VIEW);
  assert.match(src, /const cancelAmbiguousUpload = \(\) => \{/);
  assert.match(src, /Mégse/);
  assert.match(src, /Több compliance ügy létezik, de egyikhez sincs megfelelő hozzáférése\./);
  assert.match(src, /A választható compliance ügyek jelenleg nem tölthetők be\./);
});

test('stale selection surfaces a specific bounded error without a silent re-choice', () => {
  const src = read(VIEW);
  assert.match(src, /A feltöltés a kiválasztott üggyel nem sikerült/);
  assert.match(src, /error instanceof ApiError && error\.code/);
});

test('the API wrapper exposes the safe option read model and the optional caseId', () => {
  const api = read(API);
  assert.match(api, /document-case-options/);
  assert.match(api, /export type ComplianceCaseOption = \{/);
  assert.match(api, /id: string;\s*caseNumber: string;\s*title: string;\s*status: string;/);
  assert.match(api, /caseId\?: string;/);
});

test('R1. the ambiguous retry resends the FROZEN requirement, not the live selector state', () => {
  const src = read(VIEW);

  // The prepared payload captures the requirement at upload start.
  assert.match(src, /type PendingUpload = \{[\s\S]*?requirementKey: string;[\s\S]*?\};/);
  assert.match(src, /payload = \{\s*requirementKey,\s*intent,/);

  // The retry body is built exclusively from the frozen payload.
  const runUploadBody = src.slice(src.indexOf('const runUpload ='), src.indexOf('const handleUpload ='));
  assert.match(runUploadBody, /requirementKey: payload\.requirementKey/);
  assert.doesNotMatch(runUploadBody, /^\s*requirementKey,\s*$/m);

  // UX guard only — correctness never depends on it.
  assert.match(src, /disabled=\{pendingUpload !== null\}/);
});

test('the canonical upload API wrapper targets the orchestration endpoint with the intent', () => {
  const api = read(API);
  assert.match(api, /documents\/upload/);
  assert.match(api, /intent: ComplianceDocumentAudience/);
  assert.match(api, /fileContent: string/);
});
