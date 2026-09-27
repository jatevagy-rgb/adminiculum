/**
 * GWO-3A — external opportunity ingestion integration (requires PostgreSQL).
 *
 * Skips cleanly when no database URL is available locally; CI provides one.
 * Covers: CREATED, REPLAYED, idempotency conflict, source update with history
 * preservation, projection revision + regression guard, client isolation,
 * unknown source/schema fail-closed with zero writes, malformed batch zero
 * writes, bounded metadata rejection, and truthful PARTIAL batches.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  importExternalOpportunityBatch,
} from '../src/modules/company-observatory/ingestion/opportunityImport';
import type { GwoOpportunityRecord } from '../src/modules/company-observatory/ingestion/opportunityTypes';

const databaseUrl =
  process.env.GWO3A_TEST_DATABASE_URL ||
  process.env.OBSERVATORY_TEST_DATABASE_URL ||
  process.env.GROW_TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

const d = databaseUrl ? describe : describe.skip;

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

d('GWO-3A ingestion integration', () => {
  let prisma: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const c1 = crypto.randomUUID();
  const c2 = crypto.randomUUID();
  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };

  const topicA = `GWO3A-${suffix}-TOPIC-A`;
  const topicB = `GWO3A-${suffix}-TOPIC-B`;
  const topicC = `GWO3A-${suffix}-TOPIC-C`;

  function record(overrides: Partial<GwoOpportunityRecord> = {}): GwoOpportunityRecord {
    return {
      schemaVersion: 1,
      source: 'EU_FUNDING_TENDERS',
      sourceIdentifier: topicA,
      sourceRevisionIdentifier: 'REV-1',
      kind: 'FUNDING',
      title: 'Synthetic GWO-3A topic',
      status: 'OPEN',
      sourceUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/gwo3a',
      observedAt: '2026-09-27T10:00:00.000Z',
      contentHash: HASH_A,
      summary: null,
      programme: null,
      callIdentifier: `GWO3A-${suffix}-CALL`,
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

  let opportunityId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.user.createMany({
      data: [
        { id: adminId, email: `gwo3a-admin-${suffix}@test.invalid`, name: 'GWO3A Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyerId, email: `gwo3a-lawyer-${suffix}@test.invalid`, name: 'GWO3A Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });
    await prisma.client.createMany({
      data: [
        { id: c1, name: `GWO3A Client 1 ${suffix}` },
        { id: c2, name: `GWO3A Client 2 ${suffix}` },
      ],
    });
    await prisma.case.create({
      data: {
        id: crypto.randomUUID(),
        caseNumber: `GWO3A-${suffix}`,
        title: 'GWO3A access case',
        caseType: 'OTHER',
        clientId: c1,
        createdById: adminId,
        assignedLawyerId: lawyerId,
      } as never,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('T1 valid new F&T opportunity -> CREATED projection', async () => {
    const result = await importExternalOpportunityBatch(admin, c1, { sourceType: 'EU_FUNDING_TENDERS', records: [record()] }, { db: prisma });
    expect(result.status).toBe('COMPLETED');
    expect(result.counts).toEqual({ created: 1, updated: 0, replayed: 0, failed: 0 });
    const projection = await prisma.externalOpportunity.findUnique({
      where: { clientId_sourceType_businessKey_scopeKey: { clientId: c1, sourceType: 'EU_FUNDING_TENDERS', businessKey: topicA, scopeKey: `GWO3A-${suffix}-CALL` } },
    });
    expect(projection).not.toBeNull();
    expect(projection!.kind).toBe('FUNDING');
    expect(projection!.status).toBe('OPEN');
    expect(projection!.schemaVersion).toBe(1);
    expect(projection!.revision).toBe(1);
    expect(projection!.lastContentHash).toBe(HASH_A);
    expect(projection!.deadlineAt?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    opportunityId = projection!.id;
  });

  it('T2/T3 exact replay -> REPLAYED without revision increment', async () => {
    const before = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    const result = await importExternalOpportunityBatch(admin, c1, { sourceType: 'EU_FUNDING_TENDERS', records: [record()] }, { db: prisma });
    expect(result.counts.replayed).toBe(1);
    expect(result.counts.created + result.counts.updated).toBe(0);
    const after = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    expect(after.revision).toBe(before.revision);
    expect(after.currentObservationId).toBe(before.currentObservationId);
    const observations = await prisma.observation.count({ where: { clientId: c1, connectionId: after.connectionId } });
    expect(observations).toBe(1);
  });

  it('T4 same idempotency key + different digest -> conflict, run PARTIAL, projection untouched', async () => {
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({ title: 'Conflicting digest change', contentHash: HASH_B, observedAt: '2026-09-27T11:00:00.000Z' })],
    }, { db: prisma });
    expect(result.counts.failed).toBe(1);
    expect(result.results[0]?.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(result.status).toBe('PARTIAL');
    const run = await prisma.discoveryRun.findUniqueOrThrow({ where: { id_clientId: { id: result.runId, clientId: c1 } } });
    expect(run.status).toBe('PARTIAL');
    const projection = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    expect(projection.revision).toBe(1);
    expect(projection.lastContentHash).toBe(HASH_A);
  });

  it('T5/T6/T7/T8 newer source revision -> new Observation, old preserved, same projection, revision +1', async () => {
    const before = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({ sourceRevisionIdentifier: 'REV-2', contentHash: HASH_B, title: 'Updated topic title', observedAt: '2026-09-27T12:00:00.000Z' })],
    }, { db: prisma });
    expect(result.counts.updated).toBe(1);
    const after = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    expect(after.id).toBe(before.id);
    expect(after.revision).toBe(2);
    expect(after.title).toBe('Updated topic title');
    expect(after.currentObservationId).not.toBe(before.currentObservationId);
    const oldObservation = await prisma.observation.findUnique({ where: { id_clientId: { id: before.currentObservationId, clientId: c1 } } });
    expect(oldObservation).not.toBeNull();
    const observations = await prisma.observation.count({ where: { clientId: c1, connectionId: after.connectionId } });
    expect(observations).toBe(2);
  });

  it('T9 older replay cannot regress the newer projection', async () => {
    const before = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({ sourceRevisionIdentifier: 'REV-3', contentHash: HASH_C, title: 'Stale older revision', observedAt: '2026-09-27T09:00:00.000Z' })],
    }, { db: prisma });
    expect(result.counts.failed).toBe(1);
    expect(result.results[0]?.code).toBe('GWO_STALE_REVISION_REJECTED');
    const after = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    expect(after.revision).toBe(before.revision);
    expect(after.title).toBe(before.title);
    expect(after.lastContentHash).toBe(before.lastContentHash);
    expect(after.currentObservationId).toBe(before.currentObservationId);
  });

  it('T10 client/source binding isolation: same sourceIdentifier under another client is a separate projection', async () => {
    const result = await importExternalOpportunityBatch(admin, c2, { sourceType: 'EU_FUNDING_TENDERS', records: [record()] }, { db: prisma });
    expect(result.counts.created).toBe(1);
    const c2Projection = await prisma.externalOpportunity.findUnique({
      where: { clientId_sourceType_businessKey_scopeKey: { clientId: c2, sourceType: 'EU_FUNDING_TENDERS', businessKey: topicA, scopeKey: `GWO3A-${suffix}-CALL` } },
    });
    expect(c2Projection).not.toBeNull();
    expect(c2Projection!.id).not.toBe(opportunityId);
    const c1Projection = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    expect(c1Projection.revision).toBe(2);
    const connections = await prisma.externalSourceConnection.findMany({ where: { sourceType: 'EU_FUNDING_TENDERS', clientId: { in: [c1, c2] } } });
    expect(new Set(connections.map((connection) => connection.clientId)).size).toBe(2);
  });

  it('T12 cross-client observation relation stays tenant-scoped', async () => {
    const c2Projection = await prisma.externalOpportunity.findUniqueOrThrow({
      where: { clientId_sourceType_businessKey_scopeKey: { clientId: c2, sourceType: 'EU_FUNDING_TENDERS', businessKey: topicA, scopeKey: `GWO3A-${suffix}-CALL` } },
    });
    const crossTenantLookup = await prisma.observation.findFirst({ where: { id: c2Projection.currentObservationId, clientId: c1 } });
    expect(crossTenantLookup).toBeNull();
  });

  it('T13/T14/T15 unknown sources are rejected with zero writes', async () => {
    const counts = async () => ({
      connections: await prisma.externalSourceConnection.count({ where: { clientId: c1 } }),
      runs: await prisma.discoveryRun.count({ where: { clientId: c1 } }),
      observations: await prisma.observation.count({ where: { clientId: c1 } }),
      opportunities: await prisma.externalOpportunity.count({ where: { clientId: c1 } }),
    });
    const before = await counts();
    for (const source of ['TED', 'EKR', 'PALYAZAT_GOV']) {
      await expect(
        importExternalOpportunityBatch(admin, c1, { sourceType: source, records: [record({ source })] }, { db: prisma }),
      ).rejects.toMatchObject({ status: 400, code: 'GWO_IMPORT_INVALID' });
    }
    expect(await counts()).toEqual(before);
  });

  it('T16 schemaVersion != 1 is rejected with zero writes', async () => {
    const before = await prisma.externalOpportunity.count({ where: { clientId: c1 } });
    await expect(
      importExternalOpportunityBatch(admin, c1, { sourceType: 'EU_FUNDING_TENDERS', records: [record({ schemaVersion: 2 })] }, { db: prisma }),
    ).rejects.toMatchObject({ status: 400, code: 'GWO_IMPORT_INVALID' });
    expect(await prisma.externalOpportunity.count({ where: { clientId: c1 } })).toBe(before);
  });

  it('T17 malformed batch causes zero writes', async () => {
    const before = { runs: await prisma.discoveryRun.count({ where: { clientId: c1 } }), observations: await prisma.observation.count({ where: { clientId: c1 } }) };
    await expect(
      importExternalOpportunityBatch(admin, c1, { sourceType: 'EU_FUNDING_TENDERS', records: [record(), { bogus: true }] }, { db: prisma }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await prisma.discoveryRun.count({ where: { clientId: c1 } })).toBe(before.runs);
    expect(await prisma.observation.count({ where: { clientId: c1 } })).toBe(before.observations);
  });

  it('T18/T19 bounded metadata violations are rejected with zero writes', async () => {
    const before = await prisma.observation.count({ where: { clientId: c1 } });
    await expect(
      importExternalOpportunityBatch(admin, c1, { sourceType: 'EU_FUNDING_TENDERS', records: [record({ sourceIdentifier: topicB, sourceSpecificMetadata: { l1: { l2: { l3: { l4: { l5: 'x' } } } } } })] }, { db: prisma }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      importExternalOpportunityBatch(admin, c1, { sourceType: 'EU_FUNDING_TENDERS', records: [record({ sourceIdentifier: topicB, sourceSpecificMetadata: { accessToken: 'x' } })] }, { db: prisma }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await prisma.observation.count({ where: { clientId: c1 } })).toBe(before);
  });

  it('T20 valid record + per-record conflict -> truthful PARTIAL run with the valid record persisted', async () => {
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [
        record({ sourceIdentifier: topicC, sourceRevisionIdentifier: 'REV-1', contentHash: HASH_A, observedAt: '2026-09-27T13:00:00.000Z' }),
        record({ title: 'Conflicting again', contentHash: HASH_C, observedAt: '2026-09-27T13:00:01.000Z' }),
      ],
    }, { db: prisma });
    expect(result.status).toBe('PARTIAL');
    expect(result.counts.created).toBe(1);
    expect(result.counts.failed).toBe(1);
    const run = await prisma.discoveryRun.findUniqueOrThrow({ where: { id_clientId: { id: result.runId, clientId: c1 } } });
    expect(run.status).toBe('PARTIAL');
    const persisted = await prisma.externalOpportunity.findUnique({
      where: { clientId_sourceType_businessKey_scopeKey: { clientId: c1, sourceType: 'EU_FUNDING_TENDERS', businessKey: topicC, scopeKey: `GWO3A-${suffix}-CALL` } },
    });
    expect(persisted).not.toBeNull();
  });

  it('T28 existing Observatory replay/conflict semantics remain canonical (reused service)', async () => {
    const { ObservatoryIngestionService } = await import('../src/modules/company-observatory/ingestion/service');
    const observatory = new ObservatoryIngestionService();
    const connection = await prisma.externalSourceConnection.findFirstOrThrow({ where: { clientId: c1, sourceType: 'EU_FUNDING_TENDERS' } });
    const run = await observatory.startDiscoveryRun(admin, { clientId: c1, connectionId: connection.id });
    const key = `GWO3A-${suffix}-OBS-REPLAY`;
    const replayArgs = { clientId: c1, connectionId: connection.id, discoveryRunId: run.id, idempotencyKey: key, rawPayload: { a: 1 } as never };
    const first = await observatory.ingestObservation(admin, replayArgs);
    const second = await observatory.ingestObservation(admin, replayArgs);
    expect(second.id).toBe(first.id);
    await expect(
      observatory.ingestObservation(admin, { ...replayArgs, rawPayload: { a: 2 } as never }),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
});
