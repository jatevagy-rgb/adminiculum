/**
 * T13 — privacy guard: no normalized DTO, request, capture object or report
 * may contain tenant identifiers; the guard scans recursively.
 * T14 — runtime isolation: no Prisma import, no DATABASE_URL usage, no
 * Backend/Frontend/legal-watcher import anywhere in the service source.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedExternalOpportunity } from '../src/types.ts';
import { groupVariants, toNormalizedOpportunity } from '../src/normalize/multilingual.ts';
import { loadFundingTendersReference } from '../src/reference/fundingTendersReference.ts';
import { normalizeFundingTendersRecord } from '../src/adapters/fundingTenders/normalize.ts';
import { isPrivacySafe, scanForbiddenKeys, FORBIDDEN_TENANT_KEYS, RUNTIME_FORBIDDEN_IMPORT_TOKENS } from '../src/privacy.ts';
import { buildDryRunReport } from '../src/report.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/funding-tenders/', import.meta.url));
const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));

function fixtureOpportunity(): NormalizedExternalOpportunity {
  const raw = JSON.parse(readFileSync(fixturesDir + 'topic-agrip-multi-2021-im.json', 'utf8')) as unknown;
  const outcome = normalizeFundingTendersRecord(raw, loadFundingTendersReference());
  assert.ok(outcome.ok);
  if (!outcome.ok) throw new Error('fixture must normalize');
  const group = groupVariants([outcome.variant])[0];
  assert.ok(group);
  return toNormalizedOpportunity(group, '2026-09-27T12:00:00.000Z');
}

test('T13: normalized opportunity contains no tenant identifiers', () => {
  const opportunity = fixtureOpportunity();
  assert.equal(isPrivacySafe(opportunity), true, JSON.stringify(scanForbiddenKeys(opportunity)));
});

test('T13: report payload contains no tenant identifiers', () => {
  const opportunity = fixtureOpportunity();
  const report = buildDryRunReport(
    {
      source: 'EU_FUNDING_TENDERS',
      health: 'ACTIVE',
      healthReason: 'test',
      requestedAt: '2026-09-27T12:00:00.000Z',
      completedAt: '2026-09-27T12:00:01.000Z',
      lastSuccessAt: null,
      fetchedCount: 1,
      normalizedCount: 1,
      rejectedCount: 0,
      opportunities: [opportunity],
      diff: { newCount: 1, updatedCount: 0, unchangedCount: 0, decisions: [] },
      errorCode: null,
      errorMessage: null,
    },
    'dry-run',
    '2026-09-27T12:00:02.000Z',
  );
  assert.equal(isPrivacySafe(report), true);
});

test('T13: the guard detects forbidden keys at any depth', () => {
  const dirty = {
    source: 'EU_FUNDING_TENDERS',
    nested: { deep: [{ clientId: 'x' }] },
  };
  assert.equal(isPrivacySafe(dirty), false);
  const violations = scanForbiddenKeys(dirty);
  assert.ok(violations.some((path) => path.includes('clientId')));
  for (const key of FORBIDDEN_TENANT_KEYS) {
    const probe = { [key]: 'value' };
    assert.equal(isPrivacySafe(probe), false, `key ${key} must be forbidden`);
  }
});

test('T14: service source has no Prisma / DATABASE_URL / Adminiculum / legal-watcher references', () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts')) {
        files.push(full);
      }
    }
  };
  walk(srcRoot);
  assert.ok(files.length > 0, 'source tree must be non-empty');
  const denyListDefinition = fileURLToPath(new URL('../src/privacy.ts', import.meta.url));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    // The deny-list is defined once, in privacy.ts itself; that file is the
    // only permitted place where the tokens appear as literals.
    const scanTokens = file === denyListDefinition ? [] : RUNTIME_FORBIDDEN_IMPORT_TOKENS;
    for (const token of scanTokens) {
      assert.equal(text.includes(token), false, `${file} references forbidden token ${token}`);
    }
  }
});

test('T14: the service has no import path into Adminiculum runtime', () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts')) {
        files.push(full);
      }
    }
  };
  walk(srcRoot);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.equal(/from ['"](?:\.\.\/)*\.\.\/\.\.\/(?:Backend|Frontend|services)\//.test(text), false, `${file} imports outside the service`);
  }
});
