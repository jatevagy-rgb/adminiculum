import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CDI-1 client boundary — frontend regression proof.
 *
 * The structured clause/anchor intelligence is INTERNAL analysis provenance. It
 * must never reach the customer Compliance Map, the customer Document Center, or
 * any other portal surface. This suite proves that structurally, so a future
 * change cannot quietly import the internal projection into a customer view.
 *
 * The backend half of the proof (client-safe read models and portal DTOs) lives
 * in Backend/tests/complianceDocIntelligence*.
 */

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcRoot = path.join(frontendRoot, 'src');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => path.relative(frontendRoot, file).replace(/\\/g, '/');

/** Tokens that only ever belong to the internal CDI surface. */
const INTERNAL_TOKENS = [
  'complianceIntelligenceApi',
  'ComplianceClauseAnchorPanel',
  'compliance-intelligence',
  'clause-anchors',
  'anchorKey',
  'anchorDisplay',
  'anchorStableId',
  'ingestWarnings',
  'rowDigest',
  // C3A canonical binding metadata (internal-only).
  'legalSourceBindingStatus',
  'canonicalLegalSourceVersionId',
  'canonicalCitation',
  'canonicalTitle',
  'bindingOrigin',
  'bindingReason',
];

function assertCleanOfInternalTokens(files: string[], label: string) {
  const offenders: string[] = [];
  for (const file of files) {
    const source = read(file);
    for (const token of INTERNAL_TOKENS) {
      if (source.includes(token)) offenders.push(`${rel(file)} :: ${token}`);
    }
  }
  assert.deepEqual(offenders, [], `${label} must not reference internal clause/anchor intelligence`);
}

test('the customer portal surfaces never reference the internal clause/anchor projection', () => {
  // Customer Compliance Map, customer Document Center and every portal view.
  const portalFiles = walk(path.join(srcRoot, 'app', 'portal'));
  assert.ok(portalFiles.length > 10, 'the customer portal surface must be discovered');
  assertCleanOfInternalTokens(portalFiles, 'src/app/portal/**');

  const portalComponents = walk(path.join(srcRoot, 'components', 'client-portal'));
  assert.ok(portalComponents.length > 5, 'the customer portal components must be discovered');
  assertCleanOfInternalTokens(portalComponents, 'src/components/client-portal/**');
});

test('the customer-safe api clients never declare internal clause/anchor fields', () => {
  const clientApiFiles = [
    'lib/clientPortalApi.ts',
    'lib/clientPublicationApi.ts',
    'lib/clientInteractionApi.ts',
    'lib/clientWorkspaceApi.ts',
    'lib/clientCompanyApi.ts',
    'lib/customerRequestDetail.ts',
  ].map((relative) => path.join(srcRoot, relative));
  assertCleanOfInternalTokens(clientApiFiles, 'customer-safe api clients');
});

test('the internal matrix panel is imported only by the internal compliance workspace', () => {
  const importers = walk(srcRoot)
    .filter((file) => read(file).includes('ComplianceClauseAnchorPanel') && !rel(file).endsWith('ComplianceClauseAnchorPanel.tsx'))
    .map(rel)
    .sort();

  assert.deepEqual(importers, ['src/components/clients/compliance/ComplianceDocumentsSection.tsx']);
});

test('the internal compliance-intelligence endpoint is only called from its own client module', () => {
  const callers = walk(srcRoot)
    .filter((file) => read(file).includes('compliance-intelligence') && !rel(file).endsWith('lib/complianceIntelligenceApi.ts'))
    .map(rel)
    .sort();

  assert.deepEqual(callers, [], 'no other frontend module may call the internal compliance-intelligence endpoint');
});

test('the internal matrix stays off the portal navigation and off the customer document centre', () => {
  const portalShell = read(path.join(srcRoot, 'components', 'client-portal', 'ClientPortalShell.tsx'));
  assert.ok(!portalShell.includes('Jogi mátrix'), 'the customer shell must not offer the internal legal matrix');

  for (const page of ['app/portal/dokumentumok/page.tsx', 'app/portal/megfeleles/page.tsx']) {
    const source = read(path.join(srcRoot, page));
    assert.ok(!source.includes('Jogi mátrix'), `${page} must not offer the internal legal matrix`);
  }
});
