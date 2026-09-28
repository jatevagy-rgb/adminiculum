/**
 * CONTRACT OCCURRENCE CUSTOMER PUBLICATION GATE — targeted unit tests.
 *
 * Proves the fail-closed occurrence publication mechanism:
 *  - an internal ClientObligationOccurrence is NEVER customer-visible merely
 *    because it exists (default hidden);
 *  - only an explicitly published, explicitly eligible occurrence (PAYMENT /
 *    MILESTONE / NOTICE) projects into the customer calendar;
 *  - publication is a deliberate action with audit ownership; #399 candidate
 *    confirmation (which writes through createObligationOccurrence) never
 *    publishes;
 *  - revocation (unpublish) truthfully removes the calendar entry;
 *  - the customer-safe reader is client-scoped and selects ONLY allowlisted
 *    fields (no internal note / risk / reviewer metadata);
 *  - occurrences never duplicate or displace the existing #391 contract dates.
 *
 * Pure/injected — no database is required.
 */
import { prisma as realPrisma } from '../src/prisma/prisma.service';
import {
  createObligationOccurrence,
  publishObligationOccurrence,
  unpublishObligationOccurrence,
  listPublishedOccurrencesForCustomer,
  CUSTOMER_PUBLISHABLE_OCCURRENCE_TYPES,
} from '../src/modules/client-contracts/service';
import {
  mapPublishedOccurrenceSource,
  CUSTOMER_OCCURRENCE_LABELS,
} from '../src/modules/client-portal-calendar/mappers';
import {
  getCustomerCalendar,
  type CustomerCalendarReaders,
} from '../src/modules/client-portal-calendar/service';
import { assertClientSafe } from '../src/modules/client-interaction/base';

const ACTOR = { userId: 'user-1', role: 'ADMIN', workspaceId: 'ws-1' } as const;

function readers(overrides: Partial<CustomerCalendarReaders> = {}): CustomerCalendarReaders {
  return {
    listMatters: async () => [],
    listActionRequests: async () => [],
    grantedCaseIds: async () => [],
    listCaseRequests: async () => [],
    listContracts: async () => [],
    listPublishedOccurrences: async () => [],
    listCompanyMilestones: async () => [],
    listGrowInitiatives: async () => [],
    listComplianceReviews: async () => [],
    ...overrides,
  };
}

const NOW = new Date('2026-09-15T09:00:00.000Z');
const RANGE = { from: '2026-09-01', to: '2026-09-30' };

function occurrenceRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'occ-1',
    clientId: 'client-1',
    contractId: 'ct-1',
    obligationId: 'ob-1',
    occurrenceKey: 'k-1',
    sequence: 1,
    occurrenceType: 'PAYMENT',
    title: '1. részlet',
    dueDate: new Date('2026-09-20T00:00:00.000Z'),
    expectedAmount: null,
    currency: null,
    status: 'OPEN',
    satisfiedAt: null,
    evidenceDocumentVersionId: null,
    relatedTaskId: null,
    sourceReference: 'internal excerpt',
    internalNote: 'Belső jogi megjegyzés',
    publishedAt: null,
    publishedById: null,
    revision: 0,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** Minimal Prisma double: client/user lookups + the occurrence accessors used here. */
function mockPrisma(occurrence: any = null, extra: Record<string, unknown> = {}): any {
  const row = occurrence ?? occurrenceRow();
  return {
    client: { findUnique: async () => ({ id: 'client-1', name: 'Ügyfél' }) },
    user: { findUnique: async () => ({ id: 'user-1', role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
    clientObligationOccurrence: {
      findUnique: async () => row,
      update: jest.fn(async ({ data }: any) => ({
        ...row,
        ...data,
        publishedAt: data.publishedAt === null ? null : (data.publishedAt ?? row.publishedAt),
        publishedById: data.publishedById === null ? null : (data.publishedById ?? row.publishedById),
        revision: row.revision + 1,
      })),
      findMany: async () => [row],
      create: jest.fn(async ({ data }: any) => ({ ...row, ...data, id: 'occ-2', status: 'OPEN' })),
    },
    ...extra,
  };
}

describe('occurrence default visibility is HIDDEN', () => {
  it('never marks an occurrence published on the canonical create path (#399 confirmation write-through)', async () => {
    const prisma = mockPrisma(null, {
      clientObligation: { findUnique: async () => ({ id: 'ob-1', clientId: 'client-1', sourceContractId: 'ct-1' }) },
      contractRecord: { findUnique: async () => ({ id: 'ct-1', clientId: 'client-1' }) },
    });
    prisma.clientObligationOccurrence.findUnique = async () => null;
    const result = await createObligationOccurrence(ACTOR, 'ob-1', {
      occurrenceType: 'PAYMENT',
      occurrenceKey: 'contract-date-candidate:cand-1',
      title: 'Fizetési határidő',
      dueDate: '2026-09-20T00:00:00.000Z',
    }, prisma);
    expect(result.occurrence.publishedAt).toBeNull();
    const createArgs = prisma.clientObligationOccurrence.create.mock.calls[0][0];
    expect(createArgs.data.publishedAt).toBeUndefined();
    expect(createArgs.data.publishedById).toBeUndefined();
  });

  it('projects NOTHING for an occurrence that was never explicitly published', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({ listPublishedOccurrences: async () => [] }),
    });
    expect(result.items.filter((item) => item.category === 'CONTRACT_OCCURRENCE')).toEqual([]);
    expect(() => assertClientSafe(result)).not.toThrow();
  });
});

describe('publication is an explicit, deliberate, audited action', () => {
  it('sets the publishedAt/publishedById audit pair and bumps revision', async () => {
    const prisma = mockPrisma();
    const dto = await publishObligationOccurrence(ACTOR, 'occ-1', prisma);
    expect(dto.publishedAt).toBeTruthy();
    const updateArgs = prisma.clientObligationOccurrence.update.mock.calls[0][0];
    expect(updateArgs.data.publishedById).toBe('user-1');
    expect(updateArgs.data.publishedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.revision).toEqual({ increment: 1 });
  });

  it('rejects non-eligible occurrence kinds (fail closed)', async () => {
    const prisma = mockPrisma(occurrenceRow({ occurrenceType: 'INSTALLMENT' }));
    await expect(publishObligationOccurrence(ACTOR, 'occ-1', prisma))
      .rejects.toMatchObject({ code: 'OCCURRENCE_TYPE_NOT_PUBLISHABLE' });
  });

  it('rejects an occurrence without a due date', async () => {
    const prisma = mockPrisma(occurrenceRow({ dueDate: null }));
    await expect(publishObligationOccurrence(ACTOR, 'occ-1', prisma))
      .rejects.toMatchObject({ code: 'OCCURRENCE_DUE_DATE_REQUIRED' });
  });

  it('keeps the eligibility set to exactly PAYMENT / MILESTONE / NOTICE', () => {
    expect([...CUSTOMER_PUBLISHABLE_OCCURRENCE_TYPES].sort()).toEqual(['MILESTONE', 'NOTICE', 'PAYMENT']);
  });

  it('unpublish truthfully revokes: publication audit pair is cleared', async () => {
    const prisma = mockPrisma(occurrenceRow({ publishedAt: new Date('2026-09-10T00:00:00.000Z'), publishedById: 'user-1' }));
    const dto = await unpublishObligationOccurrence(ACTOR, 'occ-1', prisma);
    expect(dto.publishedAt).toBeNull();
    const updateArgs = prisma.clientObligationOccurrence.update.mock.calls[0][0];
    expect(updateArgs.data.publishedAt).toBeNull();
    expect(updateArgs.data.publishedById).toBeNull();
  });
});

describe('calendar projection of published occurrences', () => {
  it.each([
    ['PAYMENT', 'Fizetési határidő'],
    ['MILESTONE', 'Köztes teljesítés / mérföldkő'],
    ['NOTICE', 'Értesítési határidő'],
  ] as const)('projects an explicitly published %s occurrence with the customer label', async (type, label) => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        listPublishedOccurrences: async () => [{
          id: 'occ-pay',
          occurrenceType: type,
          title: '',
          dueDate: '2026-09-20T00:00:00.000Z',
        }],
      }),
    });
    const items = result.items.filter((item) => item.category === 'CONTRACT_OCCURRENCE');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe(label);
    expect(items[0].status).toBe('OPEN');
    expect(items[0].href).toBe('/portal/szerzodesek');
    expect(items[0].id).toBe(`CONTRACT_OCCURRENCE:occurrence-occ-pay`);
  });

  it('emits exactly one calendar entry per published occurrence (no duplicates)', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        listPublishedOccurrences: async () => [{
          id: 'occ-pay', occurrenceType: 'PAYMENT', title: '1. részlet', dueDate: '2026-09-20T00:00:00.000Z',
        }],
      }),
    });
    expect(result.items).toHaveLength(1);
    expect(result.counts.total).toBe(1);
  });

  it('keeps a same-day published occurrence separate from the #391 contract date (no collision)', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        listContracts: async () => [{
          reference: 'pub-1', title: 'Keretszerződés', publishedDoc: { publicationId: 'p1' },
          expiryDate: '2026-09-20T00:00:00.000Z',
        }],
        listPublishedOccurrences: async () => [{
          id: 'occ-pay', occurrenceType: 'PAYMENT', title: '1. részlet', dueDate: '2026-09-20T00:00:00.000Z',
        }],
      }),
    });
    expect(result.items.map((item) => item.id)).toEqual([
      'CONTRACT_DATE:contract-pub-1-expiry',
      'CONTRACT_OCCURRENCE:occurrence-occ-pay',
    ]);
  });

  it('revoked / unpublished occurrences are absent from the projection', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      // The canonical reader only ever returns published rows; after revocation
      // the row simply no longer qualifies.
      readers: readers({ listPublishedOccurrences: async () => [] }),
    });
    expect(result.items.some((item) => item.category === 'CONTRACT_OCCURRENCE')).toBe(false);
  });

  it('never projects a kind without a customer label (fail closed)', () => {
    expect(mapPublishedOccurrenceSource({ id: 'occ-x', occurrenceType: 'OTHER', title: 'X', dueDate: '2026-09-20T00:00:00.000Z' })).toEqual([]);
    expect(mapPublishedOccurrenceSource({ id: 'occ-n', occurrenceType: 'PAYMENT', title: 'X', dueDate: null })).toEqual([]);
  });
});

describe('customer-safe boundary', () => {
  it('scopes the published-occurrence reader to the client and allowlisted fields only', async () => {
    const prisma = mockPrisma();
    prisma.clientObligationOccurrence.findMany = jest.fn(async () => []);
    await listPublishedOccurrencesForCustomer('client-1', prisma);
    const args = prisma.clientObligationOccurrence.findMany.mock.calls[0][0];
    expect(args.where.clientId).toBe('client-1');
    expect(args.where.publishedAt).toEqual({ not: null });
    expect(args.where.dueDate).toEqual({ not: null });
    expect(Object.keys(args.select).sort()).toEqual(['dueDate', 'id', 'occurrenceType', 'title']);
  });

  it('returns only id/occurrenceType/title/dueDate — internal metadata never crosses', async () => {
    const prisma = mockPrisma(occurrenceRow({ internalNote: 'TITKOS', sourceReference: 'src-x', expectedAmount: '1000', relatedTaskId: 't-1', publishedById: 'user-1' }));
    const rows = await listPublishedOccurrencesForCustomer('client-1', prisma);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('TITKOS');
    expect(JSON.stringify(rows)).not.toContain('src-x');
    expect(JSON.stringify(rows)).not.toContain('t-1');
    expect(JSON.stringify(rows)).not.toContain('user-1');
  });

  it('emits calendar items carrying no internal note/risk/reviewer metadata', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        listPublishedOccurrences: async () => [{
          id: 'occ-pay', occurrenceType: 'PAYMENT', title: '1. részlet', dueDate: '2026-09-20T00:00:00.000Z',
        }],
      }),
    });
    expect(() => assertClientSafe(result)).not.toThrow();
    const json = JSON.stringify(result.items);
    expect(json).not.toContain('internalNote');
    expect(json).not.toContain('reviewer');
    expect(json).not.toContain('risk');
    expect(json).not.toContain('publishedById');
  });
});

describe('customer label registry', () => {
  it('carries exactly the three required Hungarian labels', () => {
    expect(CUSTOMER_OCCURRENCE_LABELS).toEqual({
      PAYMENT: 'Fizetési határidő',
      MILESTONE: 'Köztes teljesítés / mérföldkő',
      NOTICE: 'Értesítési határidő',
    });
  });
});
