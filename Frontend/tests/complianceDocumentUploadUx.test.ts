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
  assert.match(src, /a jogi mátrix automatikusan elkészül/);
  // Upload never claims publication from the linkage alone.
  assert.match(src, /result\.publication\?\.status === "PUBLISHED"/);
});

test('the canonical upload API wrapper targets the orchestration endpoint with the intent', () => {
  const api = read(API);
  assert.match(api, /documents\/upload/);
  assert.match(api, /intent: ComplianceDocumentAudience/);
  assert.match(api, /fileContent: string/);
});
