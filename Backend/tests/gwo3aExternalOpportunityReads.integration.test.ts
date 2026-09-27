/**
 * GWO-3A — external opportunity reads, tenant isolation and zero Grow side
 * effects (requires PostgreSQL; skips cleanly without a database URL).
 *
 * Covers: bounded tenant-scoped list, tenant-scoped detail, cross-client read
 * rejection, and proof that ingestion creates no RecommendationCandidate,
 * ImprovementOpportunity, DevelopmentInitiative, publication or Notification.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  importExternalOpportunityBatch,
  listExternalOpportunities,
  getExternalOpportunity,
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

d('GWO-3A reads + side-effect isolation integration', () => {
  let prisma: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const c1 = crypto.randomUUID();
  const c2 = crypto.randomUUID();
  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };

  const topics = [`GWO3A-${suffix}-R1`, `GWO3A-${suffix}-R2`, `GWO3A-${suffix}-R3`];

  function record(identifier: string, overrides: Partial<GwoOpportunityRecord> = {}): GwoOpportunityRecord {
    return {
      schemaVersion: 1,
      source: 'EU_FUNDING_TENDERS',
      sourceIdentifier: identifier,
      sourceRevisionIdentifier: 'REV-1',
      kind: 'FUNDING',
      title: `Synthetic read topic ${identifier}`,
      status: 'OPEN',
      sourceUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/gwo3a-read',
      observedAt: '2026-09-27T10:00:00.000Z',
      contentHash: HASH_A,
      summary: null,
      programme: null,
      callIdentifier: `GWO3A-${suffix}-CALL`,
      authorityName: null,
      buyerName: null,
      publicationAt: null,
      openingAt: null,
      deadlineAt: null,
      language: 'hu',
      cpvCodes: [],
      activityCodes: [],
      sectorHints: [],
      eligibleCountries: [],
      nutsCodes: [],
      placeOfPerformance: null,
      estimatedValueMin: null,
      estimatedValueMax: null,
      fundingAmountMin: null,
      fundingAmountMax: null,
      currency: null,
      cofinancingRate: null,
      eligibilityText: null,
      sourceSpecificMetadata: { fundingTenders: { sourceType: 1 } },
      ...overrides,
    };
  }

  let c1FirstId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.user.createMany({
      data: [
        { id: adminId, email: `gwo3a-r-admin-${suffix}@test.invalid`, name: 'GWO3A R Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyerId, email: `gwo3a-r-lawyer-${suffix}@test.invalid`, name: 'GWO3A R Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });
    await prisma.client.createMany({
      data: [
        { id: c1, name: `GWO3A R Client 1 ${suffix}` },
        { id: c2, name: `GWO3A R Client 2 ${suffix}` },
      ],
    });
    await prisma.case.create({
      data: {
        id: crypto.randomUUID(),
        caseNumber: `GWO3A-R-${suffix}`,
        title: 'GWO3A reads access case',
        caseType: 'OTHER',
        clientId: c1,
        createdById: adminId,
        assignedLawyerId: lawyerId,
      } as never,
    });
    await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [
        record(topics[0], { contentHash: HASH_A }),
        record(topics[1], { contentHash: HASH_B, status: 'FORTHCOMING' }),
        record(topics[2], { contentHash: HASH_C, status: 'CLOSED' }),
      ],
    }, { db: prisma });
    await importExternalOpportunityBatch(admin, c2, { sourceType: 'EU_FUNDING_TENDERS', records: [record(topics[0])] }, { db: prisma });
    const first = await prisma.externalOpportunity.findFirstOrThrow({ where: { clientId: c1, businessKey: topics[0] } });
    c1FirstId = first.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('T21 list is bounded and tenant-scoped', async () => {
    const page = await listExternalOpportunities(admin, c1, { limit: 2 }, prisma);
    expect(page.items.length).toBe(2);
    expect(page.page).toEqual({ limit: 2, offset: 0, count: 2 });
    const everything = await listExternalOpportunities(admin, c1, {}, prisma);
    expect(everything.items.length).toBe(3);
    const filtered = await listExternalOpportunities(admin, c1, { status: 'OPEN' }, prisma);
    expect(filtered.items.every((item) => item.status === 'OPEN')).toBe(true);
    const c2Page = await listExternalOpportunities(admin, c2, {}, prisma);
    expect(c2Page.items.length).toBe(1);
    expect(c2Page.items[0]?.businessKey).toBe(topics[0]);
    const lawyerC1 = await listExternalOpportunities(lawyer, c1, {}, prisma);
    expect(lawyerC1.items.length).toBe(3);
  });

  it('T21b cross-client list is rejected for a lawyer without case access', async () => {
    await expect(listExternalOpportunities(lawyer, c2, {}, prisma)).rejects.toMatchObject({ status: 403, code: 'CLIENT_ACCESS_FORBIDDEN' });
  });

  it('T22 detail is tenant-scoped and carries bounded provenance', async () => {
    const detail = await getExternalOpportunity(admin, c1, c1FirstId, prisma);
    expect(detail.id).toBe(c1FirstId);
    expect(detail.businessKey).toBe(topics[0]);
    expect(detail.schemaVersion).toBe(1);
    expect(detail.lastContentHash).toBe(HASH_A);
    expect(detail.sourceMetadata).toBeDefined();
    expect(detail.currentObservation.id).toBeTruthy();
    expect(detail.currentObservation.inputDigest).toHaveLength(64);
    await expect(getExternalOpportunity(lawyer, c2, c1FirstId, prisma)).rejects.toMatchObject({ status: 403 });
    await expect(getExternalOpportunity(admin, c2, c1FirstId, prisma)).rejects.toMatchObject({ status: 404, code: 'GWO_OPPORTUNITY_NOT_FOUND' });
    await expect(getExternalOpportunity(admin, c1, crypto.randomUUID(), prisma)).rejects.toMatchObject({ status: 404 });
  });

  it('T23-T27 ingestion creates no Grow/publication/notification side effects', async () => {
    const snapshot = async () => ({
      recommendations: await prisma.recommendationCandidate.count({ where: { clientId: c1 } }),
      improvements: await prisma.improvementOpportunity.count({ where: { clientId: c1 } }),
      initiatives: await prisma.developmentInitiative.count({ where: { clientId: c1 } }),
      publications: await prisma.clientImprovementOpportunityPublication.count({ where: { clientId: c1 } }),
      notifications: await prisma.notification.count(),
    });
    const before = await snapshot();
    await importExternalOpportunityBatch(admin, c1, {
      sourceType: 'EU_FUNDING_TENDERS',
      records: [record(`GWO3A-${suffix}-SIDE-EFFECT`, { sourceRevisionIdentifier: 'REV-2', contentHash: HASH_B })],
    }, { db: prisma });
    expect(await snapshot()).toEqual(before);
  });
});
