/**
 * GWO-2 TED adapter — normalization mappings.
 * T01 valid one-lot notice; T02 multi-lot independent scopes; T06 malformed
 * lot fails independently; T07 CPV dedupe; T08 NUTS dedupe; T09 per-lot
 * value/currency; T10 deadline normalization; T11 buyer preservation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OpportunityVariantInput } from '../src/normalize/variant.ts';
import { normalizeTedNotice } from '../src/adapters/ted/normalize.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/ted/', import.meta.url));

function loadNotices(file: string): Record<string, unknown>[] {
  const parsed = JSON.parse(readFileSync(fixturesDir + file, 'utf8')) as { notices: Record<string, unknown>[] };
  return parsed.notices;
}

function normalizeOne(notice: unknown): OpportunityVariantInput {
  const batch = normalizeTedNotice(notice);
  assert.equal(batch.rejections.length, 0, JSON.stringify(batch.rejections));
  assert.equal(batch.variants.length, 1);
  const variant = batch.variants[0];
  assert.ok(variant);
  return variant;
}

test('T01: valid one-lot notice normalizes to a PROCUREMENT scope', () => {
  const notice = loadNotices('notices-live-sample.json')[0];
  const variant = normalizeOne(notice);
  assert.equal(variant.source, 'TED');
  assert.equal(variant.kind, 'PROCUREMENT');
  assert.equal(variant.sourceIdentifier, '68474b80-f5a6-4779-b152-2180fea3e044::LOT-7460');
  assert.equal(variant.status, 'OPEN');
  assert.equal(variant.language, 'hu');
  assert.ok(variant.title.length > 10);
  assert.equal(variant.sourceUrl, 'https://ted.europa.eu/en/notice/-/detail/566524-2025');
});

test('T02: multi-lot notice emits independent scopes', () => {
  const notice = loadNotices('notices-live-sample.json')[1];
  const batch = normalizeTedNotice(notice);
  assert.equal(batch.rejections.length, 0);
  assert.equal(batch.variants.length, 4);
  const identifiers = batch.variants.map((entry) => entry.sourceIdentifier);
  assert.equal(new Set(identifiers).size, 4);
  for (const identifier of identifiers) {
    assert.ok(identifier.startsWith('f54da681-f890-4ad1-aadf-ec1aaa9ebad3::LOT-'));
  }
});

test('T06: malformed lot is rejected independently, valid lots continue', () => {
  const notice = loadNotices('notices-synthetic-edge.json')[2];
  const batch = normalizeTedNotice(notice);
  assert.equal(batch.variants.length, 2);
  assert.equal(batch.rejections.length, 1);
  assert.equal(batch.rejections[0]?.reason, 'MALFORMED_LOT');
  const identifiers = batch.variants.map((entry) => entry.sourceIdentifier);
  assert.ok(identifiers.some((id) => id.endsWith('::LOT-0001')));
  assert.ok(identifiers.some((id) => id.endsWith('::LOT-0003')));
});

test('T07: CPV codes are normalized and deduplicated', () => {
  const notice = loadNotices('notices-live-sample.json')[0];
  const variant = normalizeOne(notice);
  assert.deepEqual(variant.cpvCodes, ['45210000']);
});

test('T08: NUTS codes are normalized and deduplicated', () => {
  const notice = loadNotices('notices-live-sample.json')[0];
  const variant = normalizeOne(notice);
  assert.deepEqual(variant.nutsCodes, ['AT111', 'AUT']);
  assert.deepEqual(variant.eligibleCountries, [], 'NUTS must not become an eligibility claim');
});

test('T09: per-lot value and currency are read at the lot index only', () => {
  const notice = loadNotices('notices-live-sample.json')[1];
  const batch = normalizeTedNotice(notice);
  const byLot = new Map(batch.variants.map((entry) => [entry.sourceIdentifier, entry]));
  const lot1 = byLot.get('f54da681-f890-4ad1-aadf-ec1aaa9ebad3::LOT-0001');
  const lot2 = byLot.get('f54da681-f890-4ad1-aadf-ec1aaa9ebad3::LOT-0002');
  assert.ok(lot1 && lot2);
  assert.equal(lot1.estimatedValueMin, 500000);
  assert.equal(lot1.estimatedValueMax, 500000);
  assert.equal(lot1.currency, 'EUR');
  assert.equal(lot2.estimatedValueMin, 200000);
  assert.equal(lot2.currency, 'EUR');
});

test('T10: deadline date with offset keeps date-only semantics', () => {
  const notice = loadNotices('notices-live-sample.json')[0];
  const variant = normalizeOne(notice);
  assert.equal(variant.deadlineAt, '2025-09-04');
  assert.equal(variant.publicationAt, '2025-09-01');
});

test('T11: buyer name is preserved from the multilingual map', () => {
  const notice = loadNotices('notices-live-sample.json')[0];
  const variant = normalizeOne(notice);
  assert.equal(variant.buyerName, 'PEB – Projektentwicklung Burgenland GmbH');
});
