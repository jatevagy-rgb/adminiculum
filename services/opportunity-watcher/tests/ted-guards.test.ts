/**
 * GWO-2 TED adapter — guards and request contract.
 * T15 no tenant identifiers; T16 runtime isolation; bounded request contract
 * (JSON query + explicit fields + PAGE_NUMBER + limit <= 10); source failure
 * truthfulness (ERROR, never a zero-result success).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedExternalOpportunity } from '../src/types.ts';
import { validateNormalizedOpportunity } from '../src/types.ts';
import { groupVariants, toNormalizedOpportunity } from '../src/normalize/multilingual.ts';
import { normalizeTedNotice } from '../src/adapters/ted/normalize.ts';
import { runTedAdapter } from '../src/adapters/ted/index.ts';
import { buildTedRequestBody, executeTedSearch, TedRequestError, TED_DISCOVERY_FIELDS } from '../src/adapters/ted/request.ts';
import { isPrivacySafe, scanForbiddenKeys, RUNTIME_FORBIDDEN_IMPORT_TOKENS } from '../src/privacy.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/ted/', import.meta.url));
const tedSrcRoot = fileURLToPath(new URL('../src/adapters/ted/', import.meta.url));

function liveVariant(): import('../src/normalize/variant.ts').OpportunityVariantInput {
  const parsed = JSON.parse(readFileSync(fixturesDir + 'notices-live-sample.json', 'utf8')) as { notices: unknown[] };
  const batch = normalizeTedNotice(parsed.notices[0]);
  const variant = batch.variants[0];
  assert.ok(variant);
  return variant;
}

test('T15: normalized TED opportunity contains no tenant identifiers', () => {
  const variant = liveVariant();
  const group = groupVariants([variant])[0];
  assert.ok(group);
  const opportunity: NormalizedExternalOpportunity = toNormalizedOpportunity(group, '2026-09-27T12:00:00.000Z');
  assert.equal(isPrivacySafe(opportunity), true, JSON.stringify(scanForbiddenKeys(opportunity)));
  const validation = validateNormalizedOpportunity(opportunity);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(opportunity.source, 'TED');
  assert.equal(opportunity.kind, 'PROCUREMENT');
});

test('T16: TED source has no Prisma / DATABASE_URL / Backend / Frontend / legal-watcher references', () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) files.push(full);
    }
  };
  walk(tedSrcRoot);
  assert.equal(files.length, 4, 'expected request/identity/normalize/index');
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const token of RUNTIME_FORBIDDEN_IMPORT_TOKENS) {
      assert.equal(text.includes(token), false, `${file} references forbidden token ${token}`);
    }
  }
});

test('T-REQ: outgoing request carries the documented JSON query contract', () => {
  const body = buildTedRequestBody({ sinceDate: '20250901' });
  assert.equal(body['query'], 'publication-date >= 20250901');
  assert.equal(body['paginationMode'], 'PAGE_NUMBER');
  assert.equal(body['page'], 1);
  assert.equal(body['limit'], 10);
  const fields = body['fields'] as string[];
  for (const required of ['publication-number', 'notice-version', 'procedure-identifier', 'identifier-lot', 'notice-title', 'deadline-receipt-tender-date-lot', 'classification-cpv']) {
    assert.ok(fields.includes(required), `field ${required} missing from request projection`);
  }
  assert.deepEqual(fields, [...TED_DISCOVERY_FIELDS]);
  assert.equal(Object.keys(body).sort().join(','), 'fields,limit,page,paginationMode,query');
});

test('T-REQ: bounded limit and single page are enforced before any request', async () => {
  await assert.rejects(() => executeTedSearch({ limit: 11, url: 'http://127.0.0.1:1/' }), (error: unknown) => {
    assert.ok(error instanceof TedRequestError);
    assert.equal(error.code, 'INVALID_ARGUMENT');
    return true;
  });
  await assert.rejects(() => executeTedSearch({ page: 2, url: 'http://127.0.0.1:1/' }), (error: unknown) => {
    assert.ok(error instanceof TedRequestError);
    assert.equal(error.code, 'INVALID_ARGUMENT');
    return true;
  });
});

test('T-REQ: source failure yields health ERROR, never a zero-result success', async () => {
  const result = await runTedAdapter({
    request: { url: 'http://127.0.0.1:1/', timeoutMs: 1000, maxRetries: 0 },
    now: new Date('2026-09-27T12:00:00.000Z'),
  });
  assert.equal(result.health, 'ERROR');
  assert.equal(result.fetchedCount, 0);
  assert.equal(result.normalizedCount, 0);
  assert.equal(result.variants.length, 0);
});
