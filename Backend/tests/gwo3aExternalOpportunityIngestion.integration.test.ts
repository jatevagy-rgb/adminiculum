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
  const topicD = `GWO3A-${suffix}-ORDER-D`;
  const topicE = `GWO3A-${suffix}-ORDER-E`;

  /** GWO-1G contract metadata for search-derived records. */
  function orderMeta(status: 'AUTHORITATIVE_TIMESTAMP' | 'AUTHORITATIVE_NO_HISTORY', at: string | null): Record<string, unknown> {
    return { fundingTenders: { rawStatusCodes: ['31094502'], sourceType: 1, revisionSource: 'esST_checksum', sourceOrderSignalStatus: status, sourceLastChangeAt: at } };
  }

  function record(overrides: Partial<GwoOpportunityRecord> = {}): GwoOpportunityRecord {
    return {
      schemaVersion: 1,
      source: 'EU_FUNDING_TENDERS',
      sourceIdentifier: topicA,
      sourceRevisionIdentifier: '2026-09-20T10:00:00.000',
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
      sourceSpecificMetadata: { fundingTenders: { rawStatusCodes: ['31094502'], sourceType: 1, revisionSource: 'lastChangeDate' } },
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

  it('T5/T6/T7/T8 newer authoritative source revision -> new Observation, old preserved, same projection, revision +1', async () => {
    const before = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({ sourceRevisionIdentifier: '2026-09-25T10:00:00.000', contentHash: HASH_B, title: 'Updated topic title', observedAt: '2026-09-27T12:00:00.000Z' })],
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

  it('T9 MUST-FAIL REGRESSION: older source revision with LATER observedAt cannot regress the projection', async () => {
    const before = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceRevisionIdentifier: '2026-09-15T10:00:00.000',
        contentHash: HASH_C,
        title: 'Stale older source revision',
        observedAt: '2026-09-27T20:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.failed).toBe(1);
    expect(result.counts.updated).toBe(0);
    expect(result.results[0]?.code).toBe('GWO_STALE_SOURCE_REVISION');
    expect(result.status).toBe('PARTIAL');
    const after = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    expect(after.revision).toBe(before.revision);
    expect(after.title).toBe(before.title);
    expect(after.lastContentHash).toBe(before.lastContentHash);
    expect(after.currentObservationId).toBe(before.currentObservationId);
    expect(after.lastRevisionIdentifier).toBe(before.lastRevisionIdentifier);
    const staleObservation = await prisma.observation.findFirst({
      where: { clientId: c1, connectionId: after.connectionId, sourceRecordId: `${topicA}::GWO3A-${suffix}-CALL` },
      orderBy: { createdAt: 'desc' },
    });
    expect(staleObservation).not.toBeNull();
  });

  it('T9b checksum-based differing revision is refused as order-unproven', async () => {
    const before = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceRevisionIdentifier: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        contentHash: HASH_C,
        title: 'Checksum-based change without ordering proof',
        observedAt: '2026-09-27T21:00:00.000Z',
        sourceSpecificMetadata: { fundingTenders: { rawStatusCodes: ['31094502'], sourceType: 1, revisionSource: 'esST_checksum' } },
      })],
    }, { db: prisma });
    expect(result.counts.failed).toBe(1);
    expect(result.counts.updated).toBe(0);
    expect(result.results[0]?.code).toBe('GWO_REVISION_ORDER_UNPROVEN');
    const after = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    expect(after.revision).toBe(before.revision);
    expect(after.lastContentHash).toBe(before.lastContentHash);
    expect(after.currentObservationId).toBe(before.currentObservationId);
  });

  it('T9c authoritative newer revision updates even when watcher observation timing is unusual', async () => {
    const before = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceRevisionIdentifier: '2026-09-28T10:00:00.000',
        contentHash: HASH_C,
        title: 'Authoritatively newer revision',
        observedAt: '2026-09-27T01:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.updated).toBe(1);
    const after = await prisma.externalOpportunity.findUniqueOrThrow({ where: { id_clientId: { id: opportunityId, clientId: c1 } } });
    expect(after.id).toBe(before.id);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.title).toBe('Authoritatively newer revision');
    expect(after.lastRevisionIdentifier).toBe('2026-09-28T10:00:00.000');
  });

  // -------------------------------------------------------------------------
  // GWO-1G contract + replay semantics (R01–R16)
  // -------------------------------------------------------------------------

  it('R01 initial AUTHORITATIVE_NO_HISTORY record creates the projection', async () => {
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-A',
        contentHash: HASH_A,
        title: 'Order contract topic',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_NO_HISTORY', null),
        observedAt: '2026-09-27T10:30:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.created).toBe(1);
    const projection = await prisma.externalOpportunity.findUniqueOrThrow({
      where: { clientId_sourceType_businessKey_scopeKey: { clientId: c1, sourceType: 'EU_FUNDING_TENDERS', businessKey: topicD, scopeKey: `GWO3A-${suffix}-CALL` } },
    });
    expect(projection.lastRevisionIdentifier).toBe('CK-A');
    expect(projection.revision).toBe(1);
  });

  it('R02 exact same record replay -> REPLAYED', async () => {
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-A',
        contentHash: HASH_A,
        title: 'Order contract topic',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_NO_HISTORY', null),
        observedAt: '2026-09-27T10:30:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.replayed).toBe(1);
  });

  it('R03 observedAt-only replay: same revision/content, later observedAt -> REPLAYED, no conflict, no revision change', async () => {
    const before = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-A',
        contentHash: HASH_A,
        title: 'Order contract topic',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_NO_HISTORY', null),
        observedAt: '2026-09-27T15:45:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.replayed).toBe(1);
    expect(result.counts.failed).toBe(0);
    expect(result.results[0]?.code).toBeNull();
    const after = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    expect(after.revision).toBe(before.revision);
    expect(after.currentObservationId).toBe(before.currentObservationId);
  });

  it('R04 same idempotency identity with actual canonical payload mutation -> IDEMPOTENCY_CONFLICT preserved', async () => {
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-A',
        contentHash: HASH_A,
        title: 'Mutated canonical payload under the same revision',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_NO_HISTORY', null),
        observedAt: '2026-09-27T16:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.failed).toBe(1);
    expect(result.results[0]?.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(result.status).toBe('PARTIAL');
  });

  it('R05 first authoritative amendment: NO_HISTORY checksum A -> TIMESTAMP checksum B -> UPDATED', async () => {
    const before = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-B',
        contentHash: HASH_B,
        title: 'First amendment',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_TIMESTAMP', '2026-09-25T10:00:00.000'),
        observedAt: '2026-09-27T17:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.updated).toBe(1);
    const after = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    expect(after.id).toBe(before.id);
    expect(after.revision).toBe(before.revision + 1);
    const priorObservation = await prisma.observation.findUnique({ where: { id_clientId: { id: before.currentObservationId, clientId: c1 } } });
    expect(priorObservation).not.toBeNull();
  });

  it('R06 newer authoritative timestamp T2 > T1 -> UPDATED', async () => {
    const before = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-C',
        contentHash: HASH_C,
        title: 'Second amendment',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_TIMESTAMP', '2026-09-26T10:00:00.000'),
        observedAt: '2026-09-27T18:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.updated).toBe(1);
    const after = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    expect(after.revision).toBe(before.revision + 1);
    expect(after.lastRevisionIdentifier).toBe('CK-C');
  });

  it('R07 older authoritative timestamp with LATER observedAt and lexically-lowest checksum -> GWO_STALE_SOURCE_REVISION', async () => {
    const before = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const revCountBefore = await prisma.observation.count({ where: { clientId: c1, connectionId: before.connectionId } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-0-LOWEST', // lexically lowest: must not influence ordering
        contentHash: HASH_A,
        title: 'Stale amendment',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_TIMESTAMP', '2026-09-25T10:00:00.000'),
        observedAt: '2026-09-27T19:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.counts.failed).toBe(1);
    expect(result.counts.updated).toBe(0);
    expect(result.results[0]?.code).toBe('GWO_STALE_SOURCE_REVISION');
    const after = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    expect(after.revision).toBe(before.revision);
    expect(after.lastRevisionIdentifier).toBe(before.lastRevisionIdentifier);
    expect(after.currentObservationId).toBe(before.currentObservationId);
    const revCountAfter = await prisma.observation.count({ where: { clientId: c1, connectionId: before.connectionId } });
    expect(revCountAfter).toBe(revCountBefore + 1); // immutable history preserved
  });

  it('R08 equal authoritative timestamp with different content -> GWO_REVISION_ORDER_UNPROVEN', async () => {
    const before = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-E',
        contentHash: HASH_A,
        title: 'Equal-timestamp ambiguous change',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_TIMESTAMP', '2026-09-26T10:00:00.000'),
        observedAt: '2026-09-27T20:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.results[0]?.code).toBe('GWO_REVISION_ORDER_UNPROVEN');
    const after = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    expect(after.revision).toBe(before.revision);
    expect(after.currentObservationId).toBe(before.currentObservationId);
  });

  it('R09 TIMESTAMP -> NO_HISTORY with different content -> GWO_SOURCE_ORDER_REGRESSION', async () => {
    const before = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-F',
        contentHash: HASH_A,
        title: 'Order-evidence regression',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_NO_HISTORY', null),
        observedAt: '2026-09-27T21:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.results[0]?.code).toBe('GWO_SOURCE_ORDER_REGRESSION');
    const after = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    expect(after.revision).toBe(before.revision);
    expect(after.lastRevisionIdentifier).toBe(before.lastRevisionIdentifier);
  });

  it('R10 NO_HISTORY -> different NO_HISTORY content -> GWO_REVISION_ORDER_UNPROVEN', async () => {
    const create = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicE,
        sourceRevisionIdentifier: 'CK-X',
        contentHash: HASH_A,
        title: 'No-history topic',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_NO_HISTORY', null),
        observedAt: '2026-09-27T10:40:00.000Z',
      })],
    }, { db: prisma });
    expect(create.counts.created).toBe(1);
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicE,
        sourceRevisionIdentifier: 'CK-Y',
        contentHash: HASH_B,
        title: 'Different no-history content',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_NO_HISTORY', null),
        observedAt: '2026-09-27T21:10:00.000Z',
      })],
    }, { db: prisma });
    expect(result.results[0]?.code).toBe('GWO_REVISION_ORDER_UNPROVEN');
    const projection = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicE } });
    expect(projection.lastRevisionIdentifier).toBe('CK-X');
    expect(projection.revision).toBe(1);
  });

  it('R14 malformed sourceLastChangeAt with AUTHORITATIVE_TIMESTAMP -> UNPROVEN refusal', async () => {
    const before = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-G',
        contentHash: HASH_A,
        title: 'Malformed order evidence',
        sourceSpecificMetadata: orderMeta('AUTHORITATIVE_TIMESTAMP', 'not-a-timestamp'),
        observedAt: '2026-09-27T22:00:00.000Z',
      })],
    }, { db: prisma });
    expect(result.results[0]?.code).toBe('GWO_REVISION_ORDER_UNPROVEN');
    const after = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    expect(after.revision).toBe(before.revision);
  });

  it('R15 unknown sourceOrderSignalStatus -> UNPROVEN refusal', async () => {
    const before = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const result = await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record({
        sourceIdentifier: topicD,
        sourceRevisionIdentifier: 'CK-H',
        contentHash: HASH_A,
        title: 'Unknown order status',
        sourceSpecificMetadata: { fundingTenders: { rawStatusCodes: ['31094502'], sourceType: 1, revisionSource: 'esST_checksum', sourceOrderSignalStatus: 'MAYBE_NEWER' } },
        observedAt: '2026-09-27T22:10:00.000Z',
      })],
    }, { db: prisma });
    expect(result.results[0]?.code).toBe('GWO_REVISION_ORDER_UNPROVEN');
    const after = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    expect(after.revision).toBe(before.revision);
  });

  it('R16 immutable Observation history preserved across the whole transition chain', async () => {
    const projection = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topicD } });
    const rows = await prisma.observation.count({ where: { clientId: c1, connectionId: projection.connectionId, sourceRecordId: `${topicD}::GWO3A-${suffix}-CALL` } });
    expect(rows).toBeGreaterThanOrEqual(7);
    expect(projection.lastRevisionIdentifier).toBe('CK-C');
    expect(projection.revision).toBe(3);
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
