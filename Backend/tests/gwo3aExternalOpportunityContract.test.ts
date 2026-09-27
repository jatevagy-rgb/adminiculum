/**
 * GWO-3A — backend boundary contract tests (no database required).
 *
 * Covers the fail-closed source registry, schemaVersion gate, bounded source
 * metadata safety, identity derivation, bounded deterministic idempotency keys,
 * and static safety guards (no Grow side-effect imports, no watcher runtime
 * import, route registration present).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InteractionError } from '../src/modules/client-interaction/base';
import {
  ACCEPTED_GWO_SOURCES,
  GWO_MAX_BATCH_RECORDS,
  GWO_IDEMPOTENCY_KEY_LIMIT,
  deriveBusinessKey,
  deriveGwoIdempotencyKey,
  deriveScopeKey,
  validateBoundedSourceMetadata,
  validateGwoImportPayload,
  validateGwoOpportunityRecord,
} from '../src/modules/company-observatory/ingestion/opportunityTypes';
import type { GwoOpportunityRecord } from '../src/modules/company-observatory/ingestion/opportunityTypes';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function validRecord(overrides: Partial<GwoOpportunityRecord> = {}): GwoOpportunityRecord {
  return {
    schemaVersion: 1,
    source: 'EU_FUNDING_TENDERS',
    sourceIdentifier: 'HORIZON-TEST-TOPIC',
    sourceRevisionIdentifier: 'REV-1',
    kind: 'FUNDING',
    title: 'Synthetic test topic',
    status: 'OPEN',
    sourceUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-test-topic',
    observedAt: '2026-09-27T12:00:00.000Z',
    contentHash: HASH_A,
    summary: null,
    programme: null,
    callIdentifier: 'HORIZON-CALL-1',
    authorityName: null,
    buyerName: null,
    publicationAt: '2026-09-01',
    openingAt: null,
    deadlineAt: '2026-12-01',
    language: 'hu',
    cpvCodes: [],
    activityCodes: [],
    sectorHints: [],
    eligibleCountries: [],
    nutsCodes: [],
    placeOfPerformance: null,
    estimatedValueMin: null,
    estimatedValueMax: null,
    fundingAmountMin: 1000000,
    fundingAmountMax: 1000000,
    currency: 'EUR',
    cofinancingRate: null,
    eligibilityText: null,
    sourceSpecificMetadata: { fundingTenders: { rawStatusCodes: ['31094502'], sourceType: 1 } },
    ...overrides,
  };
}

function expectRejection(fn: () => unknown): InteractionError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(InteractionError);
    const interaction = error as InteractionError;
    expect(interaction.status).toBe(400);
    return interaction;
  }
  throw new Error('Expected the call to be rejected.');
}

describe('GWO-3A boundary contract (static)', () => {
  test('registry accepts EU_FUNDING_TENDERS only in this slice', () => {
    expect([...ACCEPTED_GWO_SOURCES]).toEqual(['EU_FUNDING_TENDERS']);
    const ok = validateGwoImportPayload({ sourceType: 'EU_FUNDING_TENDERS', records: [validRecord()] });
    expect(ok.records).toHaveLength(1);
  });

  test.each(['TED', 'EKR', 'PALYAZAT_GOV'])('source %s is rejected with zero writes', (source) => {
    const error = expectRejection(() => validateGwoImportPayload({ sourceType: source, records: [validRecord({ source })] }));
    expect(error.message).toContain('zero writes');
  });

  test('unknown schemaVersion fails closed', () => {
    const issues = validateGwoOpportunityRecord(validRecord({ schemaVersion: 2 }), 'EU_FUNDING_TENDERS');
    expect(issues.map((issue) => issue.code)).toContain('GWO_SCHEMA_VERSION_UNSUPPORTED');
    expectRejection(() => validateGwoImportPayload({ sourceType: 'EU_FUNDING_TENDERS', records: [validRecord({ schemaVersion: 2 })] }));
  });

  test('record identity, kind, status, url and hash are validated', () => {
    expect(validateGwoOpportunityRecord(validRecord({ sourceIdentifier: '' }), 'EU_FUNDING_TENDERS').map((i) => i.code)).toContain('GWO_SOURCE_IDENTIFIER_MISSING');
    expect(validateGwoOpportunityRecord(validRecord({ kind: 'GRANT' }), 'EU_FUNDING_TENDERS').map((i) => i.code)).toContain('GWO_KIND_INVALID');
    expect(validateGwoOpportunityRecord(validRecord({ status: 'MAYBE' }), 'EU_FUNDING_TENDERS').map((i) => i.code)).toContain('GWO_STATUS_INVALID');
    expect(validateGwoOpportunityRecord(validRecord({ sourceUrl: '' }), 'EU_FUNDING_TENDERS').map((i) => i.code)).toContain('GWO_SOURCE_URL_MISSING');
    expect(validateGwoOpportunityRecord(validRecord({ contentHash: 'not-hex' }), 'EU_FUNDING_TENDERS').map((i) => i.code)).toContain('GWO_CONTENT_HASH_INVALID');
  });

  test('batch size is bounded', () => {
    expectRejection(() => validateGwoImportPayload({ sourceType: 'EU_FUNDING_TENDERS', records: [] }));
    const tooMany = Array.from({ length: GWO_MAX_BATCH_RECORDS + 1 }, () => validRecord());
    expectRejection(() => validateGwoImportPayload({ sourceType: 'EU_FUNDING_TENDERS', records: tooMany }));
  });

  test('bounded metadata rejects excessive depth, key count, size, secrets and prototype keys', () => {
    expect(validateBoundedSourceMetadata({ a: { b: { c: { d: { e: 'too deep' } } } } })).toContain('SOURCE_METADATA_TOO_DEEP');
    const manyKeys: Record<string, string> = {};
    for (let index = 0; index < 70; index += 1) manyKeys[`k${index}`] = 'v';
    expect(validateBoundedSourceMetadata(manyKeys)).toContain('SOURCE_METADATA_TOO_MANY_KEYS');
    expect(validateBoundedSourceMetadata({ blob: 'x'.repeat(9000) })).toContain('SOURCE_METADATA_TOO_LARGE');
    const secretIssues = validateBoundedSourceMetadata({ accessToken: 'x' });
    expect(secretIssues.some((issue) => issue.includes('SOURCE_METADATA_SECRET_KEY'))).toBe(true);
    const pollution = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    const pollutionIssues = validateBoundedSourceMetadata(pollution);
    expect(pollutionIssues.some((issue) => issue.includes('SOURCE_METADATA_PROTOTYPE_KEY'))).toBe(true);
    expectRejection(() => validateGwoImportPayload({ sourceType: 'EU_FUNDING_TENDERS', records: [validRecord({ sourceSpecificMetadata: { l1: { l2: { l3: { l4: { l5: 'x' } } } } } })] }));
    expectRejection(() => validateGwoImportPayload({ sourceType: 'EU_FUNDING_TENDERS', records: [validRecord({ sourceSpecificMetadata: { clientSecret: 'x' } })] }));
  });

  test('identity derivation: businessKey and scopeKey', () => {
    expect(deriveBusinessKey(validRecord())).toBe('HORIZON-TEST-TOPIC');
    expect(deriveScopeKey(validRecord())).toBe('HORIZON-CALL-1');
    expect(deriveScopeKey(validRecord({ callIdentifier: null }))).toBe('HORIZON-TEST-TOPIC');
  });

  test('idempotency key is deterministic, identity-distinct and bounded', () => {
    const a = deriveGwoIdempotencyKey('EU_FUNDING_TENDERS', validRecord());
    const b = deriveGwoIdempotencyKey('EU_FUNDING_TENDERS', validRecord());
    expect(a).toBe(b);
    expect(a).toBe('gw:EU_FUNDING_TENDERS:HORIZON-TEST-TOPIC:REV-1');
    expect(a.length).toBeLessThanOrEqual(GWO_IDEMPOTENCY_KEY_LIMIT);
    const longIdentifier = 'X'.repeat(300);
    const longKey = deriveGwoIdempotencyKey('EU_FUNDING_TENDERS', validRecord({ sourceIdentifier: longIdentifier, sourceRevisionIdentifier: 'R'.repeat(80) }));
    expect(longKey.length).toBeLessThanOrEqual(GWO_IDEMPOTENCY_KEY_LIMIT);
    expect(longKey).toContain(':sha256:');
    const longKeyTwo = deriveGwoIdempotencyKey('EU_FUNDING_TENDERS', validRecord({ sourceIdentifier: `${longIdentifier}Y`, sourceRevisionIdentifier: 'R'.repeat(80) }));
    expect(longKeyTwo).not.toBe(longKey);
    const revisionFallback = deriveGwoIdempotencyKey('EU_FUNDING_TENDERS', validRecord({ sourceRevisionIdentifier: null }));
    expect(revisionFallback).toContain(HASH_A);
  });

  test('static guard: no Grow side effects, no watcher runtime import', () => {
    const modules = [
      join(__dirname, '../src/modules/company-observatory/ingestion/opportunityTypes.ts'),
      join(__dirname, '../src/modules/company-observatory/ingestion/opportunityImport.ts'),
    ];
    const forbidden = ['recommendationcandidate', 'improvementopportunity', 'developmentinitiative', 'notificationservice', 'opportunitypublication', 'opportunity-watcher', 'services/opportunity-watcher'];
    for (const file of modules) {
      const text = readFileSync(file, 'utf8').toLowerCase();
      for (const token of forbidden) {
        expect(text.includes(token)).toBe(false);
      }
    }
  });

  test('static guard: GWO-3A routes are registered under client-company grow conventions', () => {
    const routes = readFileSync(join(__dirname, '../src/modules/client-company/routes.ts'), 'utf8');
    expect(routes).toContain("'/clients/:clientId/grow/external-opportunities/imports'");
    expect(routes).toContain("'/clients/:clientId/grow/external-opportunities'");
    expect(routes).toContain("'/clients/:clientId/grow/external-opportunities/:opportunityId'");
    expect(routes).toContain('importExternalOpportunityBatch');
  });
});
