/**
 * T02 — Funding & Tenders normalization (identifier, callIdentifier, title,
 * status, deadline, budget, language, source URL, revision metadata).
 * T03 — reference dictionary mapping (known code maps; unknown code stays
 * UNKNOWN and the raw code is preserved; nothing is guessed).
 * T10 — missing optional fields never fabricate values.
 * T11 — malformed / identity-less records fail closed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadFundingTendersReference } from '../src/reference/fundingTendersReference.ts';
import { normalizeFundingTendersRecord } from '../src/adapters/fundingTenders/normalize.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/funding-tenders/', import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(fixturesDir + name, 'utf8')) as unknown;
}

const reference = loadFundingTendersReference();

test('T02: static TopicDetails record normalizes with authoritative fields', () => {
  const outcome = normalizeFundingTendersRecord(loadFixture('topic-agrip-multi-2021-im.json'), reference);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  if (!outcome.ok) return;
  const variant = outcome.variant;
  assert.equal(variant.sourceIdentifier, 'AGRIP-MULTI-2021-IM');
  assert.equal(variant.callIdentifier, 'AGRIP-MULTI-2021');
  assert.equal(variant.kind, 'FUNDING');
  assert.ok(variant.title.startsWith('Support for multi programmes'));
  assert.equal(variant.status, 'CLOSED');
  assert.equal(variant.deadlineAt, '2021-05-11');
  assert.equal(variant.publicationAt, '2021-01-28');
  assert.equal(variant.fundingAmountMin, 4200000);
  assert.equal(variant.fundingAmountMax, 4200000);
  assert.equal(variant.sourceUrl, 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/agrip-multi-2021-im');
  assert.equal(variant.sourceRevisionIdentifier, '2021-05-19T16:37:05.927');
  assert.equal(variant.currency, null);
  assert.equal(variant.eligibilityText !== null, true);
});

test('T02: search-result entry with topic metadata normalizes', () => {
  const raw = (loadFixture('multilingual-variants-synthetic.json') as { searchResults: unknown[] }).searchResults[0];
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  if (!outcome.ok) return;
  const variant = outcome.variant;
  assert.equal(variant.sourceIdentifier, 'HU-TOPIC-EXAMPLE');
  assert.equal(variant.callIdentifier, 'HU-CALL-EXAMPLE');
  assert.equal(variant.status, 'OPEN');
  assert.equal(variant.deadlineAt, '2026-12-31');
  assert.equal(variant.language, 'hu');
  assert.equal(variant.sourceRevisionIdentifier, 'AAAA000000000000000000000000000000000000000000000000000000000001');
});

test('T03: known status code maps through the official dictionary', () => {
  const raw = loadFixture('topic-agrip-multi-2021-im.json');
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.ok(outcome.ok);
  if (!outcome.ok) return;
  assert.equal(outcome.variant.status, 'CLOSED');
  const meta = outcome.variant.sourceSpecificMetadata['fundingTenders'] as Record<string, unknown>;
  assert.deepEqual(meta['rawStatusCodes'], ['31094503']);
});

test('T03: unknown status code stays UNKNOWN and the raw code is preserved', () => {
  const raw = {
    metadata: {
      identifier: ['UNKNOWN-STATUS-TOPIC'],
      callIdentifier: ['UNKNOWN-CALL'],
      title: ['Topic with an unknown status code'],
      type: ['1'],
      status: ['99999999'],
    },
  };
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.ok(outcome.ok);
  if (!outcome.ok) return;
  assert.equal(outcome.variant.status, 'UNKNOWN');
  const meta = outcome.variant.sourceSpecificMetadata['fundingTenders'] as Record<string, unknown>;
  assert.deepEqual(meta['rawStatusCodes'], ['99999999']);
});

test('T10: missing optional fields stay null/empty, never fabricated', () => {
  const raw = {
    metadata: {
      identifier: ['MINIMAL-TOPIC'],
      title: ['Minimal topic'],
      type: ['1'],
    },
  };
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  if (!outcome.ok) return;
  const variant = outcome.variant;
  assert.equal(variant.summary, null);
  assert.equal(variant.programme, null);
  assert.equal(variant.callIdentifier, null);
  assert.equal(variant.deadlineAt, null);
  assert.equal(variant.publicationAt, null);
  assert.equal(variant.language, null);
  assert.equal(variant.fundingAmountMin, null);
  assert.equal(variant.currency, null);
  assert.equal(variant.cofinancingRate, null);
  assert.deepEqual(variant.cpvCodes, []);
  assert.deepEqual(variant.eligibleCountries, []);
  assert.equal(variant.eligibilityText, null);
});

test('T11: malformed records fail closed with explicit rejections', () => {
  const records = (loadFixture('malformed-records-synthetic.json') as { searchResults: unknown[] }).searchResults;
  const reasons = records.map((raw) => {
    const outcome = normalizeFundingTendersRecord(raw, reference);
    assert.equal(outcome.ok, false, 'malformed record must be rejected');
    return outcome.ok ? 'ACCEPTED' : outcome.rejection.reason;
  });
  assert.deepEqual(reasons, ['MISSING_IDENTIFIER', 'MISSING_IDENTIFIER', 'TYPE_UNSUPPORTED', 'TYPE_UNSUPPORTED']);
});

test('T11: non-object records fail closed', () => {
  for (const raw of [null, 7, 'text', [], {}]) {
    const outcome = normalizeFundingTendersRecord(raw, reference);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.rejection.reason, 'MALFORMED_RECORD');
  }
});
