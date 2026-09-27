/**
 * GWO-1G — bounded topicDetails order-signal enrichment tests (E01–E17, E22).
 * Type-mapping (E18/E19), checksum identity basics (E05), and privacy/runtime
 * guards are also covered by the existing source-contract/privacy suites which
 * this file complements; E20/E21 run as part of the service-local suite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OpportunityVariantInput } from '../src/normalize/variant.ts';
import { groupVariants, toNormalizedOpportunity } from '../src/normalize/multilingual.ts';
import { classifyOpportunity } from '../src/diff/classify.ts';
import type { CaptureRecord } from '../src/capture/store.ts';
import { loadFundingTendersReference } from '../src/reference/fundingTendersReference.ts';
import { normalizeFundingTendersRecord } from '../src/adapters/fundingTenders/normalize.ts';
import {
  MAX_DETAIL_CONCURRENCY,
  MAX_ENRICHED_TOPICS_PER_RUN,
  enrichVariantsWithOrderSignal,
} from '../src/adapters/fundingTenders/enrichment.ts';
import { normalizeFundingTendersEnvelope, runFundingTendersAdapter } from '../src/adapters/fundingTenders/index.ts';
import {
  DETAIL_MAX_RESPONSE_BYTES,
  DETAIL_MAX_RETRIES,
  DETAIL_TIMEOUT_MS,
  FundingTendersRequestError,
  fetchOfficialTopicDetails,
} from '../src/adapters/fundingTenders/request.ts';

const reference = loadFundingTendersReference();

function searchEntry(identifier: string, checksum: string): Record<string, unknown> {
  return {
    reference: `ref-${identifier}`,
    language: 'en',
    metadata: {
      identifier: [identifier],
      title: [`Synthetic ${identifier}`],
      type: ['1'],
      status: ['31094502'],
      esST_checksum: [checksum],
      DATASOURCE: ['SEDIA'],
      latestInfos: ['[]'],
    },
  };
}

function detailsRecord(identifier: string, latestInfos: unknown): Record<string, unknown> {
  return { TopicDetails: { identifier, latestInfos, type: 1, title: `Synthetic ${identifier}` } };
}

function checksum(seed: string): string {
  return seed.repeat(64).slice(0, 64).toLowerCase();
}

function variantsFrom(entries: Record<string, unknown>[]): OpportunityVariantInput[] {
  const { variants, rejections } = normalizeFundingTendersEnvelope(
    { apiVersion: 'test', terms: null, totalResults: entries.length, pageNumber: 1, pageSize: entries.length, sort: null, results: entries as never },
    reference,
  );
  assert.equal(rejections.length, 0, JSON.stringify(rejections));
  return variants;
}

function meta(variant: OpportunityVariantInput): Record<string, unknown> {
  return variant.sourceSpecificMetadata['fundingTenders'] as Record<string, unknown>;
}

async function withServer(
  handler: (url: string, body: string) => { status: number; headers?: Record<string, string>; body: string } | Promise<{ status: number; headers?: Record<string, string>; body: string }>,
  run: (baseUrl: string, captured: { path: string; method: string }[]) => Promise<void>,
): Promise<void> {
  const captured: { path: string; method: string }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      captured.push({ path: req.url ?? '', method: req.method ?? '' });
      void Promise.resolve(handler(req.url ?? '', body)).then((reply) => {
        res.writeHead(reply.status, { 'content-type': 'application/json', ...(reply.headers ?? {}) });
        res.end(reply.body);
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await run(`http://127.0.0.1:${port}`, captured);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('E01: topicDetails URL safely encodes the identifier slug', async () => {
  await withServer(
    () => ({ status: 200, body: JSON.stringify(detailsRecord('X', [])) }),
    async (baseUrl, captured) => {
      const identifier = 'HORIZON CL5/../X';
      await fetchOfficialTopicDetails(identifier, { urlPrefix: `${baseUrl}/data/topicDetails/`, maxRetries: 0, timeoutMs: 5000 });
      assert.equal(captured.length, 1);
      assert.equal(captured[0]?.method, 'GET');
      assert.equal(captured[0]?.path, `/data/topicDetails/${encodeURIComponent('horizon cl5/../x')}.json`);
      assert.ok(!captured[0]?.path.includes(' CL5'), 'raw spaces must never reach the URL');
    },
  );
});

test('E02: detail request timeout is bounded and enforced', async () => {
  assert.ok(DETAIL_TIMEOUT_MS <= 30_000);
  assert.equal(DETAIL_MAX_RETRIES, 1);
  await withServer(
    () => new Promise((resolve) => setTimeout(() => resolve({ status: 200, body: '{}' }), 400)),
    async (baseUrl) => {
      await assert.rejects(
        fetchOfficialTopicDetails('SLOW-TOPIC', { urlPrefix: `${baseUrl}/d/`, timeoutMs: 150, maxRetries: 0 }),
        (error: unknown) => error instanceof FundingTendersRequestError && error.code === 'TIMEOUT',
      );
    },
  );
});

test('E03: detail response size is bounded', async () => {
  assert.ok(DETAIL_MAX_RESPONSE_BYTES <= 4 * 1024 * 1024);
  await withServer(
    () => ({ status: 200, headers: { 'content-length': String(DETAIL_MAX_RESPONSE_BYTES + 1) }, body: '{}' }),
    async (baseUrl) => {
      await assert.rejects(
        fetchOfficialTopicDetails('HUGE-TOPIC', { urlPrefix: `${baseUrl}/d/`, maxRetries: 0, timeoutMs: 5000 }),
        (error: unknown) => error instanceof FundingTendersRequestError && error.code === 'SIZE_EXCEEDED',
      );
    },
  );
});

test('E04/E11: identity mismatch rejects the record and attaches no evidence', async () => {
  const variants = variantsFrom([searchEntry('TOPIC-WANTED', checksum('a'))]);
  const result = await enrichVariantsWithOrderSignal(variants, {
    fetchDetails: async () => detailsRecord('TOPIC-OTHER', [{ lastChangeDate: '2026-09-25T10:00:00.000' }]),
  });
  assert.equal(result.enriched.length, 0);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0]?.reason, 'ORDER_SIGNAL_ENRICHMENT_UNAVAILABLE');
  assert.ok(String(result.rejections[0]?.detail).includes('identity mismatch'));
});

test('E05/E06/E07: checksum identity retained; timestamp attaches separately as AUTHORITATIVE_TIMESTAMP', async () => {
  const seed = checksum('b');
  const variants = variantsFrom([searchEntry('TOPIC-TIMESTAMP', seed)]);
  const result = await enrichVariantsWithOrderSignal(variants, {
    fetchDetails: async () => detailsRecord('TOPIC-TIMESTAMP', [{ lastChangeDate: '2026-09-25T10:00:00.000', content: 'amendment' }]),
  });
  assert.equal(result.rejections.length, 0);
  const variant = result.enriched[0];
  assert.ok(variant);
  assert.equal(variant.sourceRevisionIdentifier, seed);
  assert.equal(meta(variant)['revisionSource'], 'esST_checksum');
  assert.equal(meta(variant)['sourceOrderSignalStatus'], 'AUTHORITATIVE_TIMESTAMP');
  assert.equal(meta(variant)['sourceLastChangeAt'], '2026-09-25T10:00:00.000');
  assert.notEqual(meta(variant)['sourceLastChangeAt'], variant.sourceRevisionIdentifier);
});

test('E08: valid details with empty latestInfos -> AUTHORITATIVE_NO_HISTORY', async () => {
  const variants = variantsFrom([searchEntry('TOPIC-NOHISTORY', checksum('c'))]);
  const result = await enrichVariantsWithOrderSignal(variants, {
    fetchDetails: async () => detailsRecord('TOPIC-NOHISTORY', []),
  });
  assert.equal(result.rejections.length, 0);
  const variant = result.enriched[0];
  assert.ok(variant);
  assert.equal(meta(variant)['sourceOrderSignalStatus'], 'AUTHORITATIVE_NO_HISTORY');
  assert.equal(meta(variant)['sourceLastChangeAt'], null);
});

test('E09: detail network failure rejects the record, never emits it', async () => {
  const variants = variantsFrom([searchEntry('TOPIC-FAIL', checksum('d'))]);
  const result = await enrichVariantsWithOrderSignal(variants, {
    fetchDetails: async () => {
      throw new FundingTendersRequestError('NETWORK_ERROR', 'network down');
    },
  });
  assert.equal(result.enriched.length, 0);
  assert.equal(result.rejections[0]?.reason, 'ORDER_SIGNAL_ENRICHMENT_UNAVAILABLE');
});

test('E10: malformed details payload rejects the record', async () => {
  const variants = variantsFrom([searchEntry('TOPIC-BAD', checksum('e'))]);
  const result = await enrichVariantsWithOrderSignal(variants, {
    fetchDetails: async () => ({ notTopicDetails: true }),
  });
  assert.equal(result.enriched.length, 0);
  assert.ok(String(result.rejections[0]?.detail).includes('Malformed'));
});

test('E12: more than 10 discovered topics fail the run before any detail request', async () => {
  const entries = Array.from({ length: MAX_ENRICHED_TOPICS_PER_RUN + 1 }, (_, index) => searchEntry(`TOPIC-${index}`, checksum('f')));
  let detailCalls = 0;
  await withServer(
    () => ({ status: 200, body: JSON.stringify({ apiVersion: 'test', results: entries }) }),
    async (baseUrl) => {
      const result = await runFundingTendersAdapter({
        request: { url: `${baseUrl}/search`, pageSize: MAX_ENRICHED_TOPICS_PER_RUN + 1, maxRetries: 0 },
        detailsFetch: async () => {
          detailCalls += 1;
          return detailsRecord('X', []);
        },
      });
      assert.equal(detailCalls, 0, 'fan-out must not start');
      assert.equal(result.health, 'ERROR');
      assert.equal(result.variants.length, 0);
      assert.ok(result.rejections.some((rejection) => rejection.reason === 'ENRICHMENT_FANOUT_LIMIT_EXCEEDED'));
      assert.ok(result.healthReason.includes('ENRICHMENT_FANOUT_LIMIT_EXCEEDED'));
    },
  );
});

test('E13: detail request count is exactly one per discovered topic (<=10)', async () => {
  const entries = Array.from({ length: 10 }, (_, index) => searchEntry(`TOPIC-${index}`, checksum('9')));
  const seen: string[] = [];
  await withServer(
    () => ({ status: 200, body: JSON.stringify({ apiVersion: 'test', results: entries }) }),
    async (baseUrl) => {
      const result = await runFundingTendersAdapter({
        request: { url: `${baseUrl}/search`, pageSize: 10, maxRetries: 0 },
        detailsFetch: async (identifier: string) => {
          seen.push(identifier);
          return detailsRecord(identifier, []);
        },
      });
      assert.equal(seen.length, 10);
      assert.equal(new Set(seen).size, 10);
      assert.equal(result.enrichedCount, 10);
      assert.equal(result.enrichmentRejectedCount, 0);
      assert.equal(result.health, 'ACTIVE');
    },
  );
});

test('E14: enrichment concurrency never exceeds the configured bound', async () => {
  const variants = variantsFrom(Array.from({ length: 5 }, (_, index) => searchEntry(`TOPIC-CONC-${index}`, checksum('8'))));
  let inFlight = 0;
  let maxInFlight = 0;
  await enrichVariantsWithOrderSignal(variants, {
    concurrency: 2,
    fetchDetails: async (identifier: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 25));
      inFlight -= 1;
      return detailsRecord(identifier, []);
    },
  });
  assert.ok(maxInFlight <= 2, `max in-flight ${maxInFlight} exceeded bound`);
  assert.ok(MAX_DETAIL_CONCURRENCY >= 1);
});

function opportunityFor(variant: OpportunityVariantInput, observedAt: string) {
  const group = groupVariants([variant])[0];
  assert.ok(group);
  return toNormalizedOpportunity(group, observedAt);
}

function capture(opportunity: ReturnType<typeof opportunityFor>): CaptureRecord {
  return { contentHash: opportunity.contentHash, lastObservedAt: opportunity.observedAt, opportunity };
}

async function enrichedVariant(identifier: string, checksumSeed: string, latestInfos: unknown): Promise<OpportunityVariantInput> {
  const result = await enrichVariantsWithOrderSignal(variantsFrom([searchEntry(identifier, checksum(checksumSeed))]), {
    fetchDetails: async () => detailsRecord(identifier, latestInfos),
  });
  assert.equal(result.rejections.length, 0);
  const variant = result.enriched[0];
  assert.ok(variant);
  return variant;
}

test('E15: observedAt-only replay of an enriched record stays UNCHANGED', async () => {
  const variant = await enrichedVariant('TOPIC-REPLAY', 'a', []);
  const first = opportunityFor(variant, '2026-09-27T10:00:00.000Z');
  const second = opportunityFor(variant, '2026-09-28T22:00:00.000Z');
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UNCHANGED');
});

test('E16: no-history -> first official amendment becomes UPDATED', async () => {
  const initial = await enrichedVariant('TOPIC-AMEND', 'a', []);
  const amended = await enrichedVariant('TOPIC-AMEND', 'b', [{ lastChangeDate: '2026-09-25T10:00:00.000' }]);
  assert.equal(meta(initial)['sourceOrderSignalStatus'], 'AUTHORITATIVE_NO_HISTORY');
  assert.equal(meta(amended)['sourceOrderSignalStatus'], 'AUTHORITATIVE_TIMESTAMP');
  const decision = classifyOpportunity(
    opportunityFor(amended, '2026-09-27T11:00:00.000Z'),
    capture(opportunityFor(initial, '2026-09-27T10:00:00.000Z')),
  );
  assert.equal(decision.classification, 'UPDATED');
});

test('E17: later timestamp amendment T1 -> T2 with checksum C -> UPDATED', async () => {
  const first = await enrichedVariant('TOPIC-AMEND2', 'b', [{ lastChangeDate: '2026-09-25T10:00:00.000' }]);
  const second = await enrichedVariant('TOPIC-AMEND2', 'c', [{ lastChangeDate: '2026-09-26T10:00:00.000' }]);
  const decision = classifyOpportunity(
    opportunityFor(second, '2026-09-27T12:00:00.000Z'),
    capture(opportunityFor(first, '2026-09-27T11:00:00.000Z')),
  );
  assert.equal(decision.classification, 'UPDATED');
});

test('E22: direct static topicDetails behavior preserved with explicit order status', () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/funding-tenders/topic-agrip-multi-2021-im.json', import.meta.url));
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const metadata = meta(outcome.variant);
  assert.equal(metadata['sourceRevisionIdentifier'], undefined);
  assert.equal(outcome.variant.sourceRevisionIdentifier, '2021-05-19T16:37:05.927');
  assert.equal(metadata['sourceLastChangeAt'], '2021-05-19T16:37:05.927');
  assert.equal(metadata['sourceOrderSignalStatus'], 'AUTHORITATIVE_TIMESTAMP');
  const noHistory = normalizeFundingTendersRecord(
    { TopicDetails: { identifier: 'STATIC-NO-HISTORY', title: 'Static no history', type: 1, latestInfos: [], actions: [{ status: { id: '31094502' } }] } },
    reference,
  );
  assert.equal(noHistory.ok, true);
  if (!noHistory.ok) return;
  assert.equal(meta(noHistory.variant)['sourceOrderSignalStatus'], 'AUTHORITATIVE_NO_HISTORY');
  assert.equal(meta(noHistory.variant)['sourceLastChangeAt'], null);
  assert.equal(noHistory.variant.sourceRevisionIdentifier, null);
});
