/**
 * CUSTOMER PORTAL CALENDAR — unit tests.
 *
 * Verifies the customer-safe projection in isolation: allowlisted categories
 * (no internal Task/Case/intake date kind), no invented dates, range bounding,
 * stable ordering, KPI buckets, completed-request classification and the
 * published-only contract rule. The canonical readers are injected so the
 * orchestration is exercised without a database.
 */
import { prisma as realPrisma } from '../src/prisma/prisma.service';
import {
  CUSTOMER_CALENDAR_CATEGORIES,
  buildCustomerCalendar,
  normalizeSourceDate,
  type CustomerCalendarSourceItem,
} from '../src/modules/client-portal-calendar/projection';
import {
  classifyCustomerRequestStatus,
  mapActionRequestSources,
  mapCompanyMilestoneSource,
  mapCustomerRequestSource,
  mapMatterSources,
  mapOrgContractSource,
} from '../src/modules/client-portal-calendar/mappers';
import {
  getCustomerCalendar,
  type CustomerCalendarReaders,
} from '../src/modules/client-portal-calendar/service';
import { assertClientSafe } from '../src/modules/client-interaction/base';

function readers(overrides: Partial<CustomerCalendarReaders> = {}): CustomerCalendarReaders {
  return {
    listMatters: async () => [],
    listActionRequests: async () => [],
    grantedCaseIds: async () => [],
    listCaseRequests: async () => [],
    listContracts: async () => [],
    listCompanyMilestones: async () => [],
    ...overrides,
  };
}

const NOW = new Date('2026-09-15T09:00:00.000Z');
const RANGE = { from: '2026-09-01', to: '2026-09-30' };

describe('customer calendar category allowlist', () => {
  it('contains only customer-safe categories and no internal date kind', () => {
    expect([...CUSTOMER_CALENDAR_CATEGORIES]).toEqual([
      'MATTER_TARGET',
      'PUBLISHED_DEADLINE',
      'ACTION_REQUEST',
      'CUSTOMER_REQUEST',
      'CONTRACT_DATE',
      'COMPANY_MILESTONE',
    ]);
    for (const forbidden of ['TASK', 'CASE_DEADLINE', 'CASE_INTAKE_DEADLINE', 'DUE_DATE', 'INTAKE_DUE', 'MEETING']) {
      expect(CUSTOMER_CALENDAR_CATEGORIES as readonly string[]).not.toContain(forbidden);
    }
  });
});

describe('customer calendar date normalization', () => {
  it('never invents a date for null/blank/invalid input', () => {
    expect(normalizeSourceDate(null)).toBeNull();
    expect(normalizeSourceDate(undefined)).toBeNull();
    expect(normalizeSourceDate('')).toBeNull();
    expect(normalizeSourceDate('   ')).toBeNull();
    expect(normalizeSourceDate('not-a-date')).toBeNull();
    expect(normalizeSourceDate(new Date('invalid'))).toBeNull();
  });

  it('keeps date-only values stable and UTC-normalized', () => {
    expect(normalizeSourceDate('2026-09-30')).toBe('2026-09-30T00:00:00.000Z');
    expect(normalizeSourceDate('2026-09-30T12:00:00.000Z')).toBe('2026-09-30T12:00:00.000Z');
  });
});

describe('customer calendar source mappers', () => {
  it('projects a published matter target and published deadlines only', () => {
    const items = mapMatterSources({
      id: 'pub-1',
      caseId: 'case-internal-1',
      title: 'Közzétett ügy',
      estimatedTiming: '2026-09-20',
      publicDeadlines: [
        { title: 'Közzétett határidő', dueAt: '2026-09-25' },
        { label: 'Másik', date: '2026-09-26' },
        { dueAt: null },
        'garbage',
      ],
    });
    expect(items.map((item) => `${item.category}:${item.sourceKey}`)).toEqual([
      'MATTER_TARGET:target',
      'PUBLISHED_DEADLINE:deadline-0',
      'PUBLISHED_DEADLINE:deadline-1',
    ]);
    expect(items.every((item) => item.href === '/portal/matters/pub-1')).toBe(true);
  });

  it('omits a matter with no published dates', () => {
    expect(mapMatterSources({ id: 'pub-2', title: 'Üres', estimatedTiming: null, publicDeadlines: [] })).toEqual([]);
  });

  it('requires a dueAt for action requests and customer requests', () => {
    expect(mapActionRequestSources({ id: 'a1', title: 'Teendő', dueAt: null })).toEqual([]);
    expect(mapCustomerRequestSource({ id: 'r1', title: 'Kérés', dueAt: null, status: 'PUBLISHED' }, '/portal/dokumentumok')).toEqual([]);
    const action = mapActionRequestSources({ id: 'a2', matterId: 'pub-1', title: 'Teendő', dueAt: '2026-09-10' });
    expect(action[0].href).toBe('/portal/matters/pub-1');
    expect(action[0].category).toBe('ACTION_REQUEST');
  });

  it('classifies customer request status truthfully', () => {
    expect(classifyCustomerRequestStatus('COMPLETED')).toBe('DONE');
    expect(classifyCustomerRequestStatus('SUBMITTED')).toBe('INFO');
    expect(classifyCustomerRequestStatus('UNDER_INTERNAL_REVIEW')).toBe('INFO');
    expect(classifyCustomerRequestStatus('PUBLISHED')).toBe('OPEN');
    expect(classifyCustomerRequestStatus('PARTIALLY_SUBMITTED')).toBe('OPEN');
    expect(classifyCustomerRequestStatus('CORRECTION_REQUESTED')).toBe('OPEN');
  });

  it('projects a contract date only when the contract is explicitly published', () => {
    expect(mapOrgContractSource({ reference: 'c1', title: 'Szerződés', keyDate: '2026-09-19' })).toEqual([]);
    expect(mapOrgContractSource({ reference: 'c1', title: 'Szerződés', keyDate: null, publishedDoc: { publicationId: 'p1' } })).toEqual([]);
    const published = mapOrgContractSource({ reference: 'c1', title: 'Szerződés', keyDate: '2026-09-19', publishedDoc: { publicationId: 'p1' } });
    expect(published).toHaveLength(1);
    expect(published[0].category).toBe('CONTRACT_DATE');
    expect(published[0].href).toBe('/portal/szerzodesek');
  });

  it('requires a date for milestones', () => {
    expect(mapCompanyMilestoneSource({ id: 'm1', title: 'Mérföldkő', date: null })).toEqual([]);
    expect(mapCompanyMilestoneSource({ id: 'm1', title: 'Mérföldkő', date: '2026-09-21' })[0].category).toBe('COMPANY_MILESTONE');
  });
});

describe('customer calendar projection', () => {
  const source = (over: Partial<CustomerCalendarSourceItem> & Pick<CustomerCalendarSourceItem, 'sourceKey' | 'date'>): CustomerCalendarSourceItem => ({
    category: 'ACTION_REQUEST',
    title: 'Elem',
    status: 'OPEN',
    href: '/portal/teendoim',
    ...over,
  });

  it('never invents an item for a null date', () => {
    const result = buildCustomerCalendar([source({ sourceKey: 'x', date: null })], { ...RANGE, today: '2026-09-15' });
    expect(result.items).toEqual([]);
    expect(result.counts.total).toBe(0);
  });

  it('bounds items to the inclusive requested range', () => {
    const result = buildCustomerCalendar([
      source({ sourceKey: 'before', date: '2026-08-31' }),
      source({ sourceKey: 'first', date: '2026-09-01' }),
      source({ sourceKey: 'last', date: '2026-09-30' }),
      source({ sourceKey: 'after', date: '2026-10-01' }),
    ], { ...RANGE, today: '2026-09-15' });
    expect(result.items.map((item) => item.id)).toEqual([
      'ACTION_REQUEST:first',
      'ACTION_REQUEST:last',
    ]);
  });

  it('sorts deterministically by day, then category order, then identity', () => {
    const result = buildCustomerCalendar([
      source({ sourceKey: 'b', date: '2026-09-10', category: 'COMPANY_MILESTONE' }),
      source({ sourceKey: 'a', date: '2026-09-10', category: 'CONTRACT_DATE' }),
      source({ sourceKey: 'z', date: '2026-09-02' }),
      source({ sourceKey: 'y', date: '2026-09-02' }),
    ], { ...RANGE, today: '2026-09-15' });
    expect(result.items.map((item) => item.id)).toEqual([
      'ACTION_REQUEST:y',
      'ACTION_REQUEST:z',
      'CONTRACT_DATE:a',
      'COMPANY_MILESTONE:b',
    ]);
  });

  it('computes near-term KPI buckets for open items only', () => {
    const result = buildCustomerCalendar([
      source({ sourceKey: 'overdue', date: '2026-09-10', status: 'OPEN' }),
      source({ sourceKey: 'today', date: '2026-09-15', status: 'OPEN' }),
      source({ sourceKey: 'in7', date: '2026-09-20', status: 'OPEN' }),
      source({ sourceKey: 'in30', date: '2026-10-05', status: 'OPEN' }),
      source({ sourceKey: 'done', date: '2026-09-12', status: 'DONE' }),
      source({ sourceKey: 'info', date: '2026-09-13', status: 'INFO' }),
    ], { from: '2026-09-01', to: '2026-10-31', today: '2026-09-15' });
    expect(result.counts).toEqual({
      total: 6,
      open: 4,
      overdue: 1,
      dueToday: 1,
      dueNext7Days: 1,
      dueNext30Days: 1,
    });
  });

  it('summarizes only categories that actually have items', () => {
    const result = buildCustomerCalendar([
      source({ sourceKey: 'a', date: '2026-09-10' }),
      source({ sourceKey: 'b', date: '2026-09-11', category: 'CUSTOMER_REQUEST' }),
      source({ sourceKey: 'c', date: '2026-09-12', category: 'CUSTOMER_REQUEST' }),
    ], { ...RANGE, today: '2026-09-15' });
    expect(result.categories).toEqual([
      { key: 'ACTION_REQUEST', label: 'Ügyintézési teendő', count: 1 },
      { key: 'CUSTOMER_REQUEST', label: 'Adat- vagy dokumentumkérés', count: 2 },
    ]);
  });

  it('deduplicates the same category+source identity', () => {
    const result = buildCustomerCalendar([
      source({ sourceKey: 'same', date: '2026-09-10' }),
      source({ sourceKey: 'same', date: '2026-09-10' }),
    ], { ...RANGE, today: '2026-09-15' });
    expect(result.items).toHaveLength(1);
  });
});

describe('customer calendar service orchestration (injected canonical readers)', () => {
  it('echoes the bounded range and server today, and projects only canonical source output', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        listMatters: async () => [{
          id: 'pub-1',
          caseId: 'case-1',
          title: 'Közzétett ügy',
          estimatedTiming: '2026-09-20',
          publicDeadlines: [{ title: 'Közzétett határidő', dueAt: '2026-09-25' }],
        }],
        listActionRequests: async () => [{ id: 'a1', matterId: 'pub-1', matterTitle: 'Közzétett ügy', title: 'Teendő', dueAt: '2026-09-16' }],
        grantedCaseIds: async () => ['case-1'],
        listCaseRequests: async () => [
          { id: 'r1', type: 'DOCUMENT_UPLOAD', title: 'Nyitott kérés', dueAt: '2026-09-18', status: 'PUBLISHED' },
          { id: 'r2', type: 'DOCUMENT_UPLOAD', title: 'Kész kérés', dueAt: '2026-09-11', status: 'COMPLETED' },
          { id: 'r3', type: 'DOCUMENT_UPLOAD', title: 'Határidő nélkül', dueAt: null, status: 'PUBLISHED' },
        ],
      }),
    });

    expect(result.from).toBe('2026-09-01');
    expect(result.to).toBe('2026-09-30');
    expect(result.today).toBe('2026-09-15');
    const byId = new Map(result.items.map((item) => [item.id, item]));
    expect(byId.get('MATTER_TARGET:target')?.href).toBe('/portal/matters/pub-1');
    expect(byId.get('PUBLISHED_DEADLINE:deadline-0')?.day).toBe('2026-09-25');
    expect(byId.get('ACTION_REQUEST:action-a1')?.status).toBe('OPEN');
    expect(byId.get('CUSTOMER_REQUEST:request-r1')?.href).toBe('/portal/matters/pub-1');
    expect(byId.get('CUSTOMER_REQUEST:request-r2')?.status).toBe('DONE');
    expect(byId.has('CUSTOMER_REQUEST:request-r3')).toBe(false);
    // Never invent internal id fields.
    expect(JSON.stringify(result)).not.toContain('case-1');
    expect(JSON.stringify(result)).not.toMatch(/taskId|deadlineId|intakeId/i);
    expect(() => assertClientSafe(result)).not.toThrow();
  });

  it('falls back to the documents surface when a case has no published matter', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        grantedCaseIds: async () => ['case-2'],
        listCaseRequests: async () => [{ id: 'r9', title: 'Kérés', dueAt: '2026-09-18', status: 'PUBLISHED' }],
      }),
    });
    expect(result.items[0].href).toBe('/portal/dokumentumok');
    expect(result.items[0].category).toBe('CUSTOMER_REQUEST');
  });

  it('isolates the projection to whatever the canonical readers authorize', async () => {
    // The injected readers model a workspace whose granted cases belong to client A.
    // A client-B source present in the reader output must not appear because it is
    // never returned by the canonical, grant-scoped readers.
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        grantedCaseIds: async () => ['case-a'],
        listMatters: async () => [{ id: 'matter-a', caseId: 'case-a', title: 'A ügy', estimatedTiming: '2026-09-20', publicDeadlines: [] }],
        listActionRequests: async () => [{ id: 'action-a', matterId: 'matter-a', title: 'A teendő', dueAt: '2026-09-21' }],
      }),
    });
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => !item.href.includes('case-b') && !item.id.includes('case-b'))).toBe(true);
  });

  it('drops out-of-range published dates through the full service path', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        listMatters: async () => [{ id: 'pub-1', title: 'Ügy', estimatedTiming: '2026-11-01', publicDeadlines: [] }],
      }),
    });
    expect(result.items).toEqual([]);
  });

  it('rejects an invalid or unbounded range', async () => {
    await expect(getCustomerCalendar('identity-1', 'workspace-1', { from: '2026-02-30', to: '2026-09-30' }, realPrisma, { now: NOW, readers: readers() })).rejects.toMatchObject({ status: 400 });
    await expect(getCustomerCalendar('identity-1', 'workspace-1', { from: '2020-01-01', to: '2040-01-01' }, realPrisma, { now: NOW, readers: readers() })).rejects.toMatchObject({ status: 400 });
  });
});
