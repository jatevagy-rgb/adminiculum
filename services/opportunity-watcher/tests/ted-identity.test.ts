/**
 * GWO-2 TED adapter — identity, revision and metadata semantics.
 * T03 same procedure/lot across notice version retains identity;
 * T04 notice version changes the revision signal; T05 missing procedure
 * identity fails closed; T12 SME suitability is metadata only; T13 BT-821
 * preserved truthfully; T14 change/corrigendum reference preserved;
 * T17 translated representation cannot create a second opportunity;
 * T18 no legal eligibility output exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OpportunityVariantInput } from '../src/normalize/variant.ts';
import { normalizeTedNotice } from '../src/adapters/ted/normalize.ts';
import { normalizeTedNotices } from '../src/adapters/ted/index.ts';
import { groupVariants } from '../src/normalize/multilingual.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/ted/', import.meta.url));

function loadNotices(file: string): Record<string, unknown>[] {
  const parsed = JSON.parse(readFileSync(fixturesDir + file, 'utf8')) as { notices: Record<string, unknown>[] };
  return parsed.notices;
}

function normalizeOne(notice: unknown): OpportunityVariantInput {
  const batch = normalizeTedNotice(notice);
  assert.equal(batch.variants.length, 1, JSON.stringify(batch.rejections));
  const variant = batch.variants[0];
  assert.ok(variant);
  return variant;
}

test('T03: same procedure/lot across notice versions retains identity', () => {
  const v1 = normalizeOne(loadNotices('notices-live-sample.json')[0]);
  const v2 = normalizeOne(loadNotices('notices-synthetic-edge.json')[4]);
  assert.equal(v1.sourceIdentifier, v2.sourceIdentifier);
  assert.equal(v1.sourceIdentifier, '68474b80-f5a6-4779-b152-2180fea3e044::LOT-7460');
});

test('T04: notice version changes the revision signal, not the identity', () => {
  const v1 = normalizeOne(loadNotices('notices-live-sample.json')[0]);
  const v2 = normalizeOne(loadNotices('notices-synthetic-edge.json')[4]);
  assert.equal(v1.sourceRevisionIdentifier, '566524-2025::v1');
  assert.equal(v2.sourceRevisionIdentifier, '566524-2025::v2');
  assert.notEqual(v1.sourceRevisionIdentifier, v2.sourceRevisionIdentifier);
});

test('T05: missing procedure identity fails the whole notice closed', () => {
  const batch = normalizeTedNotice(loadNotices('notices-synthetic-edge.json')[0]);
  assert.equal(batch.variants.length, 0);
  assert.equal(batch.rejections.length, 1);
  assert.equal(batch.rejections[0]?.reason, 'MISSING_PROCEDURE_IDENTITY');
});

test('T12: SME suitability stays bounded metadata, never eligibility', () => {
  const variant = normalizeOne(loadNotices('notices-live-sample.json')[0]);
  const meta = variant.sourceSpecificMetadata['ted'] as Record<string, unknown>;
  assert.equal(meta['smeSuitability'], true);
  assert.equal(variant.eligibilityText, null);
  assert.deepEqual(variant.eligibleCountries, []);
});

test('T13: BT-821 procurement-documents source is preserved truthfully', () => {
  const variant = normalizeOne(loadNotices('notices-live-sample.json')[0]);
  const meta = variant.sourceSpecificMetadata['ted'] as Record<string, unknown>;
  assert.equal(meta['procurementDocumentsSource'], 'epo-procurement-document');
});

test('T14: change/corrigendum references are preserved', () => {
  const variant = normalizeOne(loadNotices('notices-live-sample.json')[0]);
  const meta = variant.sourceSpecificMetadata['ted'] as Record<string, unknown>;
  assert.equal(meta['changeReasonCode'], 'update-add');
  assert.equal(meta['changeReference'], 'dea70baf-4089-4237-b5f1-e0623dbaad58-01');
});

test('T17: translated representation cannot create a second business opportunity', () => {
  const multi = normalizeOne(loadNotices('notices-live-sample.json')[0]);
  const enOnly = normalizeOne(loadNotices('notice-en-only-synthetic.json')[0]);
  assert.equal(multi.sourceIdentifier, enOnly.sourceIdentifier);
  assert.notEqual(multi.title, enOnly.title);
  const groups = groupVariants([multi, enOnly]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.variants.length, 2);
});

test('T18: no legal eligibility output exists on TED scopes', () => {
  const notices = [
    ...loadNotices('notices-live-sample.json'),
    ...loadNotices('notices-synthetic-edge.json'),
  ];
  const { variants } = normalizeTedNotices(notices);
  assert.ok(variants.length > 0);
  for (const variant of variants) {
    assert.equal(variant.eligibilityText, null);
    assert.deepEqual(variant.eligibleCountries, []);
    assert.deepEqual(variant.sectorHints, []);
    const meta = variant.sourceSpecificMetadata['ted'] as Record<string, unknown>;
    for (const value of Object.values(meta)) {
      const type = typeof value;
      assert.ok(type === 'string' || type === 'number' || type === 'boolean' || value === null, `metadata must stay bounded scalars, found ${type}`);
    }
  }
});
