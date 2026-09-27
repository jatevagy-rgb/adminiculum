/**
 * GWO-1 source-contract repair — type semantics and replay (R08–R18).
 * R08–R10 type 1/2/8 normalize as FUNDING; R11 type 0 fails closed;
 * R12 raw source type preserved; R13 SEDIA events stay fail-closed;
 * R14 identifier is business identity; R15 esST_checksum is revision identity;
 * R16–R18 NEW / UNCHANGED / UPDATED replay preserved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NormalizedExternalOpportunity } from '../src/types.ts';
import { loadFundingTendersReference } from '../src/reference/fundingTendersReference.ts';
import { normalizeFundingTendersRecord } from '../src/adapters/fundingTenders/normalize.ts';
import { groupVariants, toNormalizedOpportunity } from '../src/normalize/multilingual.ts';
import { classifyOpportunity } from '../src/diff/classify.ts';
import type { CaptureRecord } from '../src/capture/store.ts';
import { contentProjection, hashCanonical, variantHash } from '../src/hash/contentHash.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/funding-tenders/', import.meta.url));
const reference = loadFundingTendersReference();

function searchEntry(type: string, identifier: string, checksum: string): Record<string, unknown> {
  return {
    reference: `synthetic-${identifier}`,
    language: 'en',
    metadata: {
      identifier: [identifier],
      title: [`Synthetic funding topic ${identifier}`],
      type: [type],
      status: ['31094502'],
      esST_checksum: [checksum],
      DATASOURCE: ['SEDIA'],
      language: ['en'],
    },
  };
}

function normalizeOk(raw: unknown) {
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  if (!outcome.ok) throw new Error('unreachable');
  return outcome.variant;
}

test('R08: type 1 normalizes as FUNDING', () => {
  const raw = JSON.parse(readFileSync(fixturesDir + 'topic-agrip-multi-2021-im.json', 'utf8')) as unknown;
  const variant = normalizeOk(raw);
  assert.equal(variant.kind, 'FUNDING');
  const meta = variant.sourceSpecificMetadata['fundingTenders'] as Record<string, unknown>;
  assert.equal(meta['sourceType'], 1);
});

test('R09: type 2 normalizes as FUNDING (not PROCUREMENT)', () => {
  const variant = normalizeOk(searchEntry('2', 'SYNTH-FUNDING-TYPE-2', 'AAAA000000000000000000000000000000000000000000000000000000000002'));
  assert.equal(variant.kind, 'FUNDING');
});

test('R10: type 8 normalizes as FUNDING', () => {
  const variant = normalizeOk(searchEntry('8', 'SYNTH-FUNDING-TYPE-8', 'AAAA000000000000000000000000000000000000000000000000000000000008'));
  assert.equal(variant.kind, 'FUNDING');
});

test('R11: type 0 does not become a GWO-1 funding opportunity', () => {
  const outcome = normalizeFundingTendersRecord(searchEntry('0', 'SYNTH-TENDER-TYPE-0', 'BBBB000000000000000000000000000000000000000000000000000000000000'), reference);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.rejection.reason, 'TYPE_UNSUPPORTED');
});

test('R12: raw source type is preserved in bounded metadata for 1/2/8', () => {
  const checksum = 'AAAA00000000000000000000000000000000000000000000000000000000000';
  for (const [type, expected] of [['1', 1], ['2', 2], ['8', 8]] as const) {
    const variant = normalizeOk(searchEntry(type, `SYNTH-SOURCE-TYPE-${type}`, checksum));
    const meta = variant.sourceSpecificMetadata['fundingTenders'] as Record<string, unknown>;
    assert.equal(meta['sourceType'], expected);
  }
});

test('R13: unrelated SEDIA-EVENTS-PROD records remain fail-closed', () => {
  const parsed = JSON.parse(readFileSync(fixturesDir + 'search-response-sample.json', 'utf8')) as { results: unknown[] };
  for (const record of parsed.results) {
    const outcome = normalizeFundingTendersRecord(record, reference);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.rejection.reason, 'MISSING_IDENTIFIER');
  }
});

test('R14: metadata.identifier remains the business identity', () => {
  const variant = normalizeOk(searchEntry('2', 'OFFICIAL-TOPIC-IDENTIFIER', 'CCCC000000000000000000000000000000000000000000000000000000000000'));
  assert.equal(variant.sourceIdentifier, 'OFFICIAL-TOPIC-IDENTIFIER');
});

test('R15: esST_checksum remains the revision identity', () => {
  const checksum = 'DDDD000000000000000000000000000000000000000000000000000000000000';
  const variant = normalizeOk(searchEntry('8', 'OFFICIAL-TOPIC-REVISION', checksum));
  assert.equal(variant.sourceRevisionIdentifier, checksum);
});

function fixtureOpportunity(observedAt: string, mutate?: (o: NormalizedExternalOpportunity) => void): NormalizedExternalOpportunity {
  const raw = JSON.parse(readFileSync(fixturesDir + 'topic-agrip-multi-2021-im.json', 'utf8')) as unknown;
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) throw new Error('unreachable');
  const group = groupVariants([outcome.variant])[0];
  assert.ok(group);
  const opportunity = toNormalizedOpportunity(group, observedAt);
  mutate?.(opportunity);
  return opportunity;
}

function rehash(opportunity: NormalizedExternalOpportunity): string {
  return hashCanonical(
    contentProjection(opportunity, opportunity.language, opportunity.sourceRevisionIdentifier, [
      { language: opportunity.language ?? 'und', hash: variantHash({ title: opportunity.title, summary: opportunity.summary, eligibilityText: opportunity.eligibilityText, revision: opportunity.sourceRevisionIdentifier }) },
    ]),
  );
}

function capture(opportunity: NormalizedExternalOpportunity): CaptureRecord {
  return { contentHash: opportunity.contentHash, lastObservedAt: opportunity.observedAt, opportunity };
}

test('R16: first capture replay classifies NEW', () => {
  const first = fixtureOpportunity('2026-09-27T12:00:00.000Z');
  assert.equal(classifyOpportunity(first, null).classification, 'NEW');
});

test('R17: identical source content classifies UNCHANGED', () => {
  const first = fixtureOpportunity('2026-09-27T12:00:00.000Z');
  const second = fixtureOpportunity('2026-09-28T12:00:00.000Z');
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UNCHANGED');
});

test('R18: material deadline/status/revision change classifies UPDATED', () => {
  const first = fixtureOpportunity('2026-09-27T12:00:00.000Z');
  const second = fixtureOpportunity('2026-09-27T12:00:00.000Z', (o) => {
    o.deadlineAt = '2026-06-30';
    o.status = 'OPEN';
    o.sourceRevisionIdentifier = '2026-06-01T09:00:00.000';
  });
  second.contentHash = rehash(second);
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UPDATED');
});
