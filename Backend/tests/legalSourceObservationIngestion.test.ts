/**
 * W2 — legal-source observation ingestion (no database required).
 *
 * Proves the fail-closed machine ingestion boundary:
 *  - authenticated observation → validation → idempotent LegalSourceObservation
 *    → (consolidation only) optional CANDIDATE/UNREVIEWED LegalSourceVersion +
 *    optional LegalSourceCapture;
 *  - amendments persist an observation ONLY;
 *  - the version key is DERIVED from relatedIdentifier (never client-supplied);
 *  - exact retries are DUPLICATE with zero new writes; conflicting retries are
 *    rejected and never overwrite the original;
 *  - an incompatible version state is rejected without mutation;
 *  - per-item transactions roll back alone, valid siblings still commit;
 *  - zero automatic findings/tasks/cases/requests/notifications;
 *  - no client/case/document field can be persisted.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizeJson,
  computeObservationPayloadDigest,
  ingestLegalSourceObservations,
  normalizeConsolidatedCelex,
} from '../src/modules/compliance/legalSourceObservationService';
import { decideCelexBinding } from '../src/modules/compliance-doc-intelligence/legalSourceBinding';

type Row = Record<string, any>;

interface Store {
  sources: Row[];
  versions: Row[];
  captures: Row[];
  observations: Row[];
}

function gdprSource(): Row {
  return {
    id: 'source-gdpr',
    sourceKey: 'EU-32016R0679',
    jurisdictionCode: 'EU',
    instrumentType: 'REGULATION',
    canonicalCitation: 'Regulation (EU) 2016/679',
    title: 'GDPR',
    status: 'APPROVED',
  };
}

function createFakePrisma(store: Store, opts: { failObservationCreate?: boolean } = {}) {
  const calls = {
    legalSourceCreate: 0,
    legalSourceUpdate: 0,
    versionCreate: 0,
    versionUpdate: 0,
    versionReuse: 0,
    captureCreate: 0,
    captureUpdate: 0,
    captureReuse: 0,
    observationCreate: 0,
    userLookup: 0,
    findingCreate: 0,
    taskCreate: 0,
    caseCreate: 0,
    clientRequestCreate: 0,
    clientNotificationCreate: 0,
  };
  const db: any = {
    legalSource: {
      findUnique: async ({ where }: any) => store.sources.find((source) => source.sourceKey === where.sourceKey) ?? null,
      create: async () => {
        calls.legalSourceCreate += 1;
        throw new Error('provisioning a LegalSource is forbidden');
      },
      update: async () => {
        calls.legalSourceUpdate += 1;
        throw new Error('mutating a LegalSource is forbidden');
      },
    },
    legalSourceVersion: {
      findUnique: async ({ where }: any) => {
        const key = where.legalSourceId_legalVersionKey;
        return store.versions.find((version) => version.legalSourceId === key.legalSourceId && version.legalVersionKey === key.legalVersionKey) ?? null;
      },
      upsert: async ({ where, create }: any) => {
        const key = where.legalSourceId_legalVersionKey;
        const existing = store.versions.find((version) => version.legalSourceId === key.legalSourceId && version.legalVersionKey === key.legalVersionKey);
        if (existing) {
          // Prisma upsert with `update: {}` is a read-only reuse — no write happens.
          calls.versionReuse += 1;
          return existing;
        }
        calls.versionCreate += 1;
        const row = { id: `version-${store.versions.length + 1}`, reviewStatus: 'UNREVIEWED', status: 'CANDIDATE', ...create };
        store.versions.push(row);
        return row;
      },
      update: async () => {
        calls.versionUpdate += 1;
        throw new Error('mutating a LegalSourceVersion is forbidden');
      },
    },
    legalSourceCapture: {
      upsert: async ({ where, create }: any) => {
        const key = where.legalSourceVersionId_sourceSha256;
        const existing = store.captures.find(
          (capture) => capture.legalSourceVersionId === key.legalSourceVersionId && capture.sourceSha256 === key.sourceSha256,
        );
        if (existing) {
          calls.captureReuse += 1;
          return existing;
        }
        calls.captureCreate += 1;
        const row = { id: `capture-${store.captures.length + 1}`, ...create };
        store.captures.push(row);
        return row;
      },
    },
    legalSourceObservation: {
      findUnique: async ({ where }: any) => store.observations.find((observation) => observation.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        calls.observationCreate += 1;
        if (opts.failObservationCreate) throw new Error('simulated persistence failure');
        const row = { id: `observation-${store.observations.length + 1}`, ingestedAt: new Date('2026-09-27T21:00:00.000Z'), ...data };
        store.observations.push(row);
        return row;
      },
    },
    // Any of these being reached is a hard failure — W2 must create NONE of them.
    user: { findUnique: async () => { calls.userLookup += 1; return null; }, findFirst: async () => { calls.userLookup += 1; return null; } },
    task: { create: async () => { calls.taskCreate += 1; throw new Error('W2 must not create tasks'); } },
    case: { create: async () => { calls.caseCreate += 1; throw new Error('W2 must not create cases'); } },
    clientRequest: { create: async () => { calls.clientRequestCreate += 1; throw new Error('W2 must not create client requests'); } },
    notification: { create: async () => { calls.clientNotificationCreate += 1; throw new Error('W2 must not create notifications'); } },
    $transaction: async (run: any) => {
      const backup = {
        sources: [...store.sources],
        versions: [...store.versions],
        captures: [...store.captures],
        observations: [...store.observations],
      };
      try {
        return await run(db);
      } catch (error) {
        store.sources = backup.sources;
        store.versions = backup.versions;
        store.captures = backup.captures;
        store.observations = backup.observations;
        throw error;
      }
    },
  };
  return { db, calls };
}

function store(): Store {
  return { sources: [gdprSource()], versions: [], captures: [], observations: [] };
}

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function amendmentItem(overrides: Row = {}): Row {
  return {
    idempotencyKey: 'watcher-2026-09-27-amendment-1',
    kind: 'AMENDMENT_PUBLISHED',
    source: 'EUR_LEX',
    identifierFamily: 'CELEX',
    sourceIdentifier: '32016R0679',
    relatedIdentifier: '32003R1882',
    effectiveFrom: null,
    evidence: {
      sourceUri: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32003R1882',
      sha256: SHA_A,
      capturedAt: '2026-09-27T20:00:00Z',
      queryProvenance: { cellar: { work: '32003R1882' }, sparqlQueryId: 'q-1' },
    },
    warnings: [],
    ...overrides,
  };
}

function consolidatedItem(overrides: Row = {}): Row {
  return {
    idempotencyKey: 'watcher-2026-09-27-consolidated-1',
    kind: 'CONSOLIDATED_VERSION_AVAILABLE',
    source: 'EUR_LEX',
    identifierFamily: 'CELEX',
    sourceIdentifier: '32016R0679',
    relatedIdentifier: '02016R0679-20160504',
    effectiveFrom: '2016-05-04T00:00:00Z',
    evidence: {
      sourceUri: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02016R0679-20160504',
      sha256: SHA_A,
      capturedAt: '2026-09-27T20:00:00Z',
      queryProvenance: { cellar: { work: '02016R0679-20160504' } },
    },
    warnings: ['source-side warning'],
    ...overrides,
  };
}

function envelope(...observations: unknown[]) {
  return { schemaVersion: 1, observations };
}

async function ingest(storeRef: Store, ...observations: unknown[]) {
  const { db, calls } = createFakePrisma(storeRef);
  const response = await ingestLegalSourceObservations(envelope(...observations), db);
  return { response, calls };
}

describe('W2 amendment ingestion', () => {
  it('persists an observation ONLY — no version, no capture', async () => {
    const s = store();
    const { response, calls } = await ingest(s, amendmentItem());
    expect(response.results).toEqual([
      { idempotencyKey: 'watcher-2026-09-27-amendment-1', status: 'ACCEPTED', reason: null, warnings: [] },
    ]);
    expect(s.observations).toHaveLength(1);
    expect(s.versions).toHaveLength(0);
    expect(s.captures).toHaveLength(0);
    const observation = s.observations[0];
    expect(observation.legalSourceVersionId).toBeNull();
    expect(observation.legalSourceCaptureId).toBeNull();
    expect(calls.versionCreate).toBe(0);
    expect(calls.captureCreate).toBe(0);
  });

  it('stores sourceIdentifier (watched act) and relatedIdentifier (amending act) as distinct typed fields', async () => {
    const s = store();
    await ingest(s, amendmentItem());
    const observation = s.observations[0];
    expect(observation.sourceIdentifier).toBe('32016R0679');
    expect(observation.relatedIdentifier).toBe('32003R1882');
    expect(observation.kind).toBe('AMENDMENT_PUBLISHED');
    expect(observation.sourceUri).toContain('32003R1882');
  });

  it('never accepts a malformed base CELEX as sourceIdentifier', async () => {
    const s = store();
    const { response } = await ingest(s, amendmentItem({ sourceIdentifier: 'EU-32016R0679' }));
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'INVALID_SOURCE_IDENTIFIER' });
    expect(s.observations).toHaveLength(0);
  });

  it('never accepts a malformed amendment relatedIdentifier', async () => {
    const s = store();
    const { response } = await ingest(s, amendmentItem({ relatedIdentifier: '02016R0679-20160504' }));
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'INVALID_RELATED_IDENTIFIER' });
    expect(s.observations).toHaveLength(0);
  });
});

describe('W2 consolidated-version ingestion', () => {
  it('persists the observation plus a CANDIDATE/UNREVIEWED version and a capture, keyed from relatedIdentifier', async () => {
    const s = store();
    const { response, calls } = await ingest(s, consolidatedItem());
    expect(response.results[0]).toMatchObject({ status: 'ACCEPTED', reason: null });

    expect(s.versions).toHaveLength(1);
    expect(s.versions[0]).toMatchObject({
      legalSourceId: 'source-gdpr',
      legalVersionKey: '02016R0679-20160504',
      status: 'CANDIDATE',
      reviewStatus: 'UNREVIEWED',
    });
    expect(s.versions[0].effectiveFrom.toISOString()).toBe('2016-05-04T00:00:00.000Z');

    expect(s.captures).toHaveLength(1);
    expect(s.captures[0]).toMatchObject({
      legalSourceVersionId: s.versions[0].id,
      sourceSha256: SHA_A,
      sourceUri: expect.stringContaining('02016R0679-20160504'),
    });

    expect(s.observations[0].legalSourceVersionId).toBe(s.versions[0].id);
    expect(s.observations[0].legalSourceCaptureId).toBe(s.captures[0].id);
    expect(s.observations[0].effectiveFrom.toISOString()).toBe('2016-05-04T00:00:00.000Z');
    expect(calls.versionCreate).toBe(1);
    expect(calls.captureCreate).toBe(1);
  });

  it('derives legalVersionKey directly from the consolidated CELEX (no client versionKey exists)', async () => {
    const s = store();
    await ingest(s, consolidatedItem());
    expect(s.versions[0].legalVersionKey).toBe(s.observations[0].relatedIdentifier);
    // The request contract carries no independent versionKey field at all.
    expect(Object.keys(consolidatedItem())).not.toContain('versionKey');
  });

  it('normalizes the consolidated CELEX token shape strictly', () => {
    expect(normalizeConsolidatedCelex('02016R0679-20160504')).toBe('02016R0679-20160504');
    expect(normalizeConsolidatedCelex('  02016r0679-20160504 ')).toBe('02016R0679-20160504');
    expect(normalizeConsolidatedCelex('32016R0679')).toBeNull();
    expect(normalizeConsolidatedCelex('02016R0679')).toBeNull();
    expect(normalizeConsolidatedCelex('02016R0679-2016-05-04')).toBeNull();
    expect(normalizeConsolidatedCelex('')).toBeNull();
    expect(normalizeConsolidatedCelex(null)).toBeNull();
  });

  it('never accepts a malformed consolidated relatedIdentifier', async () => {
    const s = store();
    const { response } = await ingest(s, consolidatedItem({ relatedIdentifier: '32003R1882' }));
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'INVALID_RELATED_IDENTIFIER' });
    expect(s.versions).toHaveLength(0);
    expect(s.captures).toHaveLength(0);
  });

  it('reuses an existing compatible candidate version instead of creating one', async () => {
    const s = store();
    s.versions.push({
      id: 'version-existing',
      legalSourceId: 'source-gdpr',
      legalVersionKey: '02016R0679-20160504',
      status: 'CANDIDATE',
      reviewStatus: 'UNREVIEWED',
      effectiveFrom: new Date('2016-05-04T00:00:00.000Z'),
    });
    const { response, calls } = await ingest(s, consolidatedItem());
    expect(response.results[0]).toMatchObject({ status: 'ACCEPTED' });
    expect(s.versions).toHaveLength(1);
    expect(s.observations[0].legalSourceVersionId).toBe('version-existing');
    expect(calls.versionCreate).toBe(0);
  });

  it('reuses an existing capture with the same (version, hash) instead of duplicating it', async () => {
    const s = store();
    s.versions.push({
      id: 'version-existing',
      legalSourceId: 'source-gdpr',
      legalVersionKey: '02016R0679-20160504',
      status: 'CANDIDATE',
      reviewStatus: 'UNREVIEWED',
      effectiveFrom: new Date('2016-05-04T00:00:00.000Z'),
    });
    s.captures.push({ id: 'capture-existing', legalSourceVersionId: 'version-existing', sourceSha256: SHA_A });
    const { response, calls } = await ingest(s, consolidatedItem());
    expect(response.results[0]).toMatchObject({ status: 'ACCEPTED' });
    expect(s.captures).toHaveLength(1);
    expect(s.observations[0].legalSourceCaptureId).toBe('capture-existing');
    expect(calls.captureCreate).toBe(0);
  });
});

describe('W2 version state protection', () => {
  it('rejects an incompatible version state without mutating it (ACTIVE + APPROVED stays untouched)', async () => {
    const s = store();
    const active = {
      id: 'version-active',
      legalSourceId: 'source-gdpr',
      legalVersionKey: '02016R0679-20160504',
      status: 'ACTIVE',
      reviewStatus: 'APPROVED',
      effectiveFrom: new Date('2016-05-04T00:00:00.000Z'),
    };
    s.versions.push(active);
    const before = JSON.stringify(s.versions);
    const { response, calls } = await ingest(s, consolidatedItem());
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'VERSION_STATE_CONFLICT' });
    expect(JSON.stringify(s.versions)).toBe(before);
    expect(s.observations).toHaveLength(0);
    expect(calls.versionUpdate).toBe(0);
    expect(calls.versionReuse).toBe(1);
  });

  it('rejects a candidate whose effectiveFrom differs from the incoming observation', async () => {
    const s = store();
    s.versions.push({
      id: 'version-existing',
      legalSourceId: 'source-gdpr',
      legalVersionKey: '02016R0679-20160504',
      status: 'CANDIDATE',
      reviewStatus: 'UNREVIEWED',
      effectiveFrom: new Date('2016-05-05T00:00:00.000Z'),
    });
    const { response } = await ingest(s, consolidatedItem({ effectiveFrom: '2016-05-04T00:00:00Z' }));
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'VERSION_STATE_CONFLICT' });
  });

  it('candidate versions never satisfy the existing ACTIVE + APPROVED binding rule', () => {
    const decision = decideCelexBinding({
      rawCelex: '32016R0679',
      source: {
        id: 'source-gdpr',
        sourceKey: 'EU-32016R0679',
        canonicalCitation: null,
        title: 'GDPR',
      },
      versions: [{
        id: 'version-candidate',
        legalSourceId: 'source-gdpr',
        status: 'CANDIDATE',
        reviewStatus: 'UNREVIEWED',
      }],
    });
    expect(decision).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_BINDABLE_VERSION' });
  });
});

describe('W2 source lookup', () => {
  it('rejects an unknown LegalSource and never provisions one', async () => {
    const s = store();
    const { response, calls } = await ingest(s, amendmentItem({ sourceIdentifier: '32020R0001' }));
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'LEGAL_SOURCE_NOT_FOUND' });
    expect(s.sources).toHaveLength(1);
    expect(s.observations).toHaveLength(0);
    expect(calls.legalSourceCreate).toBe(0);
    expect(calls.legalSourceUpdate).toBe(0);
  });
});

describe('W2 idempotency', () => {
  it('replays an exact duplicate with zero new writes, even after a restart', async () => {
    const s = store();
    await ingest(s, consolidatedItem());
    expect(s.observations).toHaveLength(1);
    const versionsBefore = s.versions.length;
    const capturesBefore = s.captures.length;

    // "Restart": a fresh client over the same durable store.
    const { db } = createFakePrisma(s);
    const replay = await ingestLegalSourceObservations(envelope(consolidatedItem()), db);
    expect(replay.results[0]).toMatchObject({ status: 'DUPLICATE', reason: null });
    expect(s.observations).toHaveLength(1);
    expect(s.versions).toHaveLength(versionsBefore);
    expect(s.captures).toHaveLength(capturesBefore);
  });

  it('rejects the same idempotency key with a different payload and never overwrites the original', async () => {
    const s = store();
    await ingest(s, amendmentItem());
    const original = JSON.stringify(s.observations[0]);
    const { response } = await ingest(s, amendmentItem({ relatedIdentifier: '32004R0001' }));
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'IDEMPOTENCY_KEY_CONFLICT' });
    expect(s.observations).toHaveLength(1);
    expect(JSON.stringify(s.observations[0])).toBe(original);
  });

  it('is insensitive to semantic object key order in queryProvenance', async () => {
    const s = store();
    const first = amendmentItem({ evidence: { ...amendmentItem().evidence, queryProvenance: { b: 1, a: 2 } } });
    const second = amendmentItem({ evidence: { ...amendmentItem().evidence, queryProvenance: { a: 2, b: 1 } } });
    await ingest(s, first);
    const { response } = await ingest(s, second);
    expect(response.results[0]).toMatchObject({ status: 'DUPLICATE' });
    expect(s.observations).toHaveLength(1);
  });

  it('canonicalizes deterministically and covers every semantic field', () => {
    expect(canonicalizeJson({ b: 1, a: [{ d: 2, c: 3 }] })).toEqual({ a: [{ c: 3, d: 2 }], b: 1 });
    const base = {
      idempotencyKey: 'k',
      kind: 'AMENDMENT_PUBLISHED' as const,
      source: 'EUR_LEX',
      identifierFamily: 'CELEX',
      sourceIdentifier: '32016R0679',
      relatedIdentifier: '32003R1882',
      effectiveFrom: null,
      effectiveFromIso: null,
      sourceUri: 'https://example.test/a',
      evidenceSha256: SHA_A,
      capturedAt: new Date('2026-09-27T20:00:00Z'),
      capturedAtIso: '2026-09-27T20:00:00.000Z',
      queryProvenance: null,
      warnings: [],
    };
    const digestA = computeObservationPayloadDigest(base);
    expect(computeObservationPayloadDigest({ ...base, relatedIdentifier: '32004R0001' })).not.toBe(digestA);
    expect(computeObservationPayloadDigest({ ...base, sourceIdentifier: '32022L2555' })).not.toBe(digestA);
    expect(computeObservationPayloadDigest({ ...base, effectiveFromIso: '2020-01-01T00:00:00.000Z' })).not.toBe(digestA);
    expect(computeObservationPayloadDigest({ ...base, warnings: ['x'] })).not.toBe(digestA);
    expect(computeObservationPayloadDigest({ ...base, queryProvenance: { a: 1 } })).not.toBe(digestA);
  });
});

describe('W2 transaction and batch behavior', () => {
  it('rolls back the rejected item alone when persistence fails', async () => {
    const s = store();
    const { db } = createFakePrisma(s, { failObservationCreate: true });
    const response = await ingestLegalSourceObservations(envelope(consolidatedItem()), db);
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'PERSISTENCE_FAILED' });
    expect(s.observations).toHaveLength(0);
    expect(s.versions).toHaveLength(0);
    expect(s.captures).toHaveLength(0);
  });

  it('lets a valid sibling commit while an invalid sibling is rejected', async () => {
    const s = store();
    const { response } = await ingest(
      s,
      amendmentItem({ sourceIdentifier: 'not-a-celex', idempotencyKey: 'bad-1' }),
      amendmentItem({ idempotencyKey: 'good-1' }),
    );
    expect(response.results).toHaveLength(2);
    expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'INVALID_SOURCE_IDENTIFIER' });
    expect(response.results[1]).toMatchObject({ status: 'ACCEPTED' });
    expect(s.observations).toHaveLength(1);
    expect(s.observations[0].idempotencyKey).toBe('good-1');
  });

  it('treats a non-object batch item as a rejected item, not a batch failure', async () => {
    const s = store();
    const { response } = await ingest(s, 'not-an-object');
    expect(response.results[0]).toMatchObject({ idempotencyKey: null, status: 'REJECTED', reason: 'INVALID_OBSERVATION_ITEM' });
  });

  it('rejects malformed envelopes with a 4xx InteractionError', async () => {
    const s = store();
    const { db } = createFakePrisma(s);
    await expect(ingestLegalSourceObservations({ schemaVersion: 2, observations: [] }, db))
      .rejects.toMatchObject({ status: 400, code: 'UNSUPPORTED_SCHEMA_VERSION' });
    await expect(ingestLegalSourceObservations({ schemaVersion: 1, observations: [] }, db))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_OBSERVATIONS' });
    await expect(ingestLegalSourceObservations({ schemaVersion: 1, observations: new Array(101).fill(amendmentItem()) }, db))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_OBSERVATIONS' });
  });
});

describe('W2 automatic-action and tenant-scope safety', () => {
  it('creates zero findings/tasks/cases/client requests/notifications and performs no user lookup', async () => {
    const s = store();
    const { calls } = await ingest(s, amendmentItem(), consolidatedItem());
    expect(calls).toMatchObject({
      findingCreate: 0,
      taskCreate: 0,
      caseCreate: 0,
      clientRequestCreate: 0,
      clientNotificationCreate: 0,
      userLookup: 0,
    });
  });

  it('never persists client/case/document fields carried by a payload', async () => {
    const s = store();
    const sneaky = amendmentItem({
      clientId: 'client-x',
      caseId: 'case-x',
      documentId: 'doc-x',
      changedSubdivisions: ['x'],
      reviewStatus: 'APPROVED',
      structuralChange: true,
    });
    await ingest(s, sneaky);
    const created = s.observations[0];
    const allowed = new Set([
      'schemaVersion', 'idempotencyKey', 'payloadDigest', 'kind', 'source', 'identifierFamily',
      'sourceIdentifier', 'relatedIdentifier', 'legalSourceId', 'effectiveFrom', 'sourceUri',
      'evidenceSha256', 'capturedAt', 'queryProvenance', 'warnings', 'legalSourceVersionId',
      'legalSourceCaptureId', 'id', 'ingestedAt',
    ]);
    for (const key of Object.keys(created)) expect(allowed.has(key)).toBe(true);
    const json = JSON.stringify(created);
    for (const forbidden of ['client-x', 'case-x', 'doc-x', 'changedSubdivisions', 'structuralChange']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('static guard: the W2 module performs no downstream compliance writes', () => {
    const files = [
      join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationService.ts'),
      join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationRoutes.ts'),
    ];
    const forbidden = [
      'task.create', 'case.create', 'clientRequest.create', 'notification.create',
      'complianceFinding.create', 'findingMaterializationService', 'requirement.create',
      'requirementVersion.create', 'clientControl.create', 'legalSource.create',
      'legalSource.update', 'legalSourceVersion.update', 'legalSourceCapture.update',
      'changedSubdivisions',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const token of forbidden) expect(source).not.toContain(token);
    }
  });
});

describe('W2 schema + migration static guard', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const modelStart = schema.indexOf('model LegalSourceObservation {');
  const modelBlock = schema.slice(modelStart, schema.indexOf('\n}', modelStart));

  it('adds a dedicated non-tenant observation model', () => {
    expect(modelStart).toBeGreaterThan(-1);
    expect(modelBlock).toContain('relatedIdentifier');
    expect(modelBlock).toContain('sourceIdentifier');
    expect(modelBlock).toContain('LegalSourceObservationKind');
  });

  it('carries no client/case/document or structural-change field', () => {
    expect(modelStart).toBeGreaterThan(-1);
    for (const forbidden of ['clientId', 'caseId', 'documentId', 'changedSubdivisions', 'structuralChange']) {
      expect(modelBlock).not.toContain(forbidden);
    }
  });

  it('ships its additive migration within the timestamped migration set', () => {
    const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');
    const names = readdirSync(migrationsDir).filter((name) => /^\d{14}_/.test(name)).sort();
    expect(names).toContain('20260927210000_add_legal_source_observations');
    const sql = readFileSync(join(migrationsDir, '20260927210000_add_legal_source_observations', 'migration.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE "legal_source_observations"');
    expect(sql).toContain('CREATE TYPE "LegalSourceObservationKind"');
    expect(sql).toMatch(/ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE|CONSTRAINT)/i);
    expect(sql).not.toMatch(/ALTER TABLE "(?!legal_source_observations)/);
  });
});
