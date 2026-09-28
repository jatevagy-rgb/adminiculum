/**
 * T16 — authoritative Funding & Tenders source-order signal (live-proven 2026-09-27).
 *
 * REVISION IDENTITY and SOURCE ORDER SIGNAL are separate semantics:
 * - sourceRevisionIdentifier stays esST_checksum on search records (never
 *   orderable) and newest lastChangeDate on static topicDetails records;
 * - sourceSpecificMetadata.fundingTenders.sourceLastChangeAt is ordering
 *   evidence only: directly source-derived, ISO-normalized, null when absent /
 *   untrusted / malformed, and NEVER observedAt.
 *
 * Live source proof (2 official reads, 2026-09-27): the authoritative portal
 * update history is `latestInfos[].lastChangeDate` (newest first). The live
 * SEDIA search index stores metadata.latestInfos as the JSON string "[]"
 * (observed in 13/13 topic records), so search records emit null and
 * downstream consumers fail closed — no timestamp is fabricated.
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
import { assertPrivacySafe } from '../src/privacy.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/funding-tenders/', import.meta.url));
const reference = loadFundingTendersReference();

const DEFAULT_CHECKSUM = 'AAAA000000000000000000000000000000000000000000000000000000000001';

interface SearchEntryOptions {
  identifier: string;
  type?: string;
  checksum?: string;
  latestInfos?: unknown;
  language?: string;
}

function searchEntry(options: SearchEntryOptions): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    identifier: [options.identifier],
    title: [`Synthetic funding topic ${options.identifier}`],
    type: [options.type ?? '1'],
    status: ['31094502'],
    esST_checksum: [options.checksum ?? DEFAULT_CHECKSUM],
    DATASOURCE: ['SEDIA'],
    language: ['en'],
  };
  if (options.latestInfos !== undefined) metadata['latestInfos'] = options.latestInfos;
  return { reference: `synthetic-${options.identifier}`, language: options.language ?? 'en', metadata };
}

function normalizeOk(raw: unknown) {
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  if (!outcome.ok) throw new Error('unreachable');
  return outcome.variant;
}

function fundingMeta(variant: { sourceSpecificMetadata: Record<string, unknown> }): Record<string, unknown> {
  return variant.sourceSpecificMetadata['fundingTenders'] as Record<string, unknown>;
}

function opportunity(options: SearchEntryOptions, observedAt: string): NormalizedExternalOpportunity {
  const variant = normalizeOk(searchEntry(options));
  const group = groupVariants([variant])[0];
  assert.ok(group);
  return toNormalizedOpportunity(group, observedAt);
}

function capture(record: NormalizedExternalOpportunity): CaptureRecord {
  return { contentHash: record.contentHash, lastObservedAt: record.observedAt, opportunity: record };
}

test('T16: search record keeps checksum as revision identity and revisionSource', () => {
  const variant = normalizeOk(searchEntry({ identifier: 'ORDER-SIGNAL-TOPIC' }));
  assert.equal(variant.sourceRevisionIdentifier, DEFAULT_CHECKSUM);
  assert.equal(fundingMeta(variant)['revisionSource'], 'esST_checksum');
});

test('T16: search record exposes sourceLastChangeAt from the portal latestInfos history', () => {
  const variant = normalizeOk(
    searchEntry({
      identifier: 'ORDER-SIGNAL-TOPIC-2',
      latestInfos: [
        { approvalDate: '2026-03-02', lastChangeDate: '2026-03-02T10:46:42.703+0100', content: '<p>update</p>' },
        { approvalDate: '2026-01-15', lastChangeDate: '2026-01-15T09:00:00.000+0100', content: '<p>initial</p>' },
      ],
    }),
  );
  assert.equal(fundingMeta(variant)['sourceLastChangeAt'], '2026-03-02T09:46:42.703Z');
  assert.equal(variant.sourceRevisionIdentifier, DEFAULT_CHECKSUM);
});

test('T16: static topicDetails emits the same sourceLastChangeAt semantic', () => {
  const raw = JSON.parse(readFileSync(fixturesDir + 'topic-agrip-multi-2021-im.json', 'utf8')) as unknown;
  const variant = normalizeOk(raw);
  assert.equal(fundingMeta(variant)['sourceLastChangeAt'], '2021-05-19T16:37:05.927');
  assert.equal(variant.sourceRevisionIdentifier, '2021-05-19T16:37:05.927');
  assert.equal(fundingMeta(variant)['revisionSource'], 'lastChangeDate');
});

test('T16: live SEDIA search shape ("[]" latestInfos) yields a null order signal', () => {
  const variant = normalizeOk(searchEntry({ identifier: 'LIVE-SHAPE-TOPIC', latestInfos: ['[]'] }));
  assert.equal(fundingMeta(variant)['sourceLastChangeAt'], null);
  assert.equal(variant.sourceRevisionIdentifier, DEFAULT_CHECKSUM);
});

test('T16: missing order field never falls back to observedAt', () => {
  const variant = normalizeOk(searchEntry({ identifier: 'NO-ORDER-TOPIC' }));
  assert.equal(fundingMeta(variant)['sourceLastChangeAt'], null);
  const record = opportunity({ identifier: 'NO-ORDER-TOPIC' }, '2026-09-27T20:00:00.000Z');
  assert.equal(fundingMeta(record)['sourceLastChangeAt'], null);
});

test('T16: malformed source timestamp becomes null, not passed through', () => {
  for (const bad of ['not-a-date', '2026-13-45', 'yesterday', '2021-05-19 16:37']) {
    const variant = normalizeOk(
      searchEntry({ identifier: 'MALFORMED-ORDER-TOPIC', latestInfos: [{ lastChangeDate: bad }] }),
    );
    assert.equal(fundingMeta(variant)['sourceLastChangeAt'], null, `expected null for ${bad}`);
  }
});

test('T16: observedAt-only change stays UNCHANGED with the order signal present', () => {
  const first = opportunity(
    { identifier: 'ORDER-REPLAY-TOPIC', latestInfos: [{ lastChangeDate: '2026-03-02T10:46:42.703+0100' }] },
    '2026-09-27T12:00:00.000Z',
  );
  const second = opportunity(
    { identifier: 'ORDER-REPLAY-TOPIC', latestInfos: [{ lastChangeDate: '2026-03-02T10:46:42.703+0100' }] },
    '2026-09-28T12:00:00.000Z',
  );
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UNCHANGED');
});

test('T16: authoritative source revision change stays UPDATED', () => {
  const first = opportunity(
    {
      identifier: 'ORDER-REPLAY-TOPIC-2',
      checksum: 'AAAA000000000000000000000000000000000000000000000000000000000001',
      latestInfos: [{ lastChangeDate: '2026-03-02T10:46:42.703+0100' }],
    },
    '2026-09-27T12:00:00.000Z',
  );
  const second = opportunity(
    {
      identifier: 'ORDER-REPLAY-TOPIC-2',
      checksum: 'AAAA000000000000000000000000000000000000000000000000000000000002',
      latestInfos: [{ lastChangeDate: '2026-04-01T09:00:00.000+0200' }],
    },
    '2026-09-27T12:00:00.000Z',
  );
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UPDATED');
});

test('T16: source types 1/2/8 stay FUNDING and type 0 stays rejected', () => {
  for (const sourceType of ['1', '2', '8']) {
    const variant = normalizeOk(
      searchEntry({
        identifier: `ORDER-TYPE-${sourceType}`,
        type: sourceType,
        latestInfos: [{ lastChangeDate: '2026-03-02T10:00:00.000+0100' }],
      }),
    );
    assert.equal(variant.kind, 'FUNDING');
    assert.equal(fundingMeta(variant)['sourceLastChangeAt'], '2026-03-02T09:00:00.000Z');
  }
  const rejected = normalizeFundingTendersRecord(searchEntry({ identifier: 'ORDER-TYPE-0', type: '0' }), reference);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.rejection.reason, 'TYPE_UNSUPPORTED');
});

test('T16: stable topic identifier and URL unchanged by the order signal', () => {
  const variant = normalizeOk(
    searchEntry({ identifier: 'AGRIP-MULTI-2021-IM', latestInfos: [{ lastChangeDate: '2021-05-19T16:37:05.927' }] }),
  );
  assert.equal(variant.sourceIdentifier, 'AGRIP-MULTI-2021-IM');
  assert.equal(
    variant.sourceUrl,
    'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/agrip-multi-2021-im',
  );
});

test('T16: privacy guard unchanged with the order signal present', () => {
  const record = opportunity(
    { identifier: 'ORDER-PRIVACY-TOPIC', latestInfos: [{ lastChangeDate: '2026-03-02T10:46:42.703+0100' }] },
    '2026-09-27T12:00:00.000Z',
  );
  assert.doesNotThrow(() => assertPrivacySafe(record, `opportunity:${record.sourceIdentifier}`));
});
