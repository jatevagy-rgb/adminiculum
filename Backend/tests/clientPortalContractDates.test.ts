/**
 * CLIENT PORTAL CONTRACT DATES (Slice B) — targeted projection unit tests.
 *
 * Proves the customer-safe contract-date extension:
 *  - "active" derives ONLY from the canonical ContractRecord status (never dates);
 *  - "expiring this month" uses the canonical expiryDate + the portal's existing
 *    UTC server-day/month convention (same as the customer calendar);
 *  - the allowed contract-level dates (signature/effective/expiry/next critical)
 *    are projected as existing CONTRACT_DATE calendar items, reusing the canonical
 *    safe projection — no new calendar/event storage, no new category;
 *  - a null date never produces an item and the legacy keyDate is never
 *    double-counted once richer dates exist;
 *  - internal obligation/occurrence/entitlement dates are never exposed.
 *
 * Pure/injected — no database is required.
 */
import { prisma as realPrisma } from '../src/prisma/prisma.service';
import {
  CUSTOMER_CALENDAR_CATEGORIES,
} from '../src/modules/client-portal-calendar/projection';
import { mapOrgContractSource } from '../src/modules/client-portal-calendar/mappers';
import {
  getCustomerCalendar,
  type CustomerCalendarReaders,
} from '../src/modules/client-portal-calendar/service';
import {
  customerContractLifecycle,
  expiresInPortalMonth,
  isActiveContractStatus,
  portalServerDay,
} from '../src/modules/client-workspace/orgContractsService';
import { assertClientSafe } from '../src/modules/client-interaction/base';

function readers(overrides: Partial<CustomerCalendarReaders> = {}): CustomerCalendarReaders {
  return {
    listMatters: async () => [],
    listActionRequests: async () => [],
    grantedCaseIds: async () => [],
    listCaseRequests: async () => [],
    listContracts: async () => [],
    listCompanyMilestones: async () => [],
    listGrowInitiatives: async () => [],
    listComplianceReviews: async () => [],
    ...overrides,
  };
}

const NOW = new Date('2026-09-15T09:00:00.000Z');
const RANGE = { from: '2026-09-01', to: '2026-09-30' };

describe('contract active state is derived from canonical status only', () => {
  it('treats ONLY an ACTIVE ContractRecord status as active', () => {
    expect(isActiveContractStatus('ACTIVE')).toBe(true);
    for (const status of ['SIGNED_NOT_EFFECTIVE', 'TERMINATING', 'DRAFT', 'EXPIRED', 'TERMINATED', 'ARCHIVED', '']) {
      expect(isActiveContractStatus(status)).toBe(false);
    }
  });

  it('maps the customer-visible statuses to the canonical lifecycle', () => {
    expect(customerContractLifecycle('ACTIVE')).toBe('active');
    expect(customerContractLifecycle('SIGNED_NOT_EFFECTIVE')).toBe('upcoming');
    expect(customerContractLifecycle('TERMINATING')).toBe('terminating');
  });
});

describe('expiring this month uses the portal month convention', () => {
  it('is true only within the same UTC month as the server day', () => {
    expect(expiresInPortalMonth('2027-01-01T00:00:00.000Z', new Date('2027-01-15T00:00:00.000Z'))).toBe(true);
    expect(expiresInPortalMonth('2027-01-31T00:00:00.000Z', new Date('2027-01-01T00:00:00.000Z'))).toBe(true);
    expect(expiresInPortalMonth('2027-02-01T00:00:00.000Z', new Date('2027-01-31T23:00:00.000Z'))).toBe(false);
    expect(expiresInPortalMonth('2026-12-31T00:00:00.000Z', new Date('2027-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('never invents a month for a null or malformed expiry date', () => {
    expect(expiresInPortalMonth(null, NOW)).toBe(false);
    expect(expiresInPortalMonth(undefined, NOW)).toBe(false);
    expect(expiresInPortalMonth('', NOW)).toBe(false);
    expect(expiresInPortalMonth('not-a-date', NOW)).toBe(false);
  });

  it('uses the UTC server day, matching the customer calendar', () => {
    expect(portalServerDay(new Date('2026-09-15T23:30:00.000Z'))).toBe('2026-09-15');
  });
});

describe('contract date mapper (canonical published projection only)', () => {
  it('never surfaces a contract that is not explicitly published', () => {
    expect(mapOrgContractSource({ reference: 'c1', title: 'Szerződés', expiryDate: '2026-09-19T00:00:00.000Z' })).toEqual([]);
    expect(mapOrgContractSource({ reference: 'c1', title: 'Szerződés', keyDate: '2026-09-19', publishedDoc: null })).toEqual([]);
  });

  it('emits the allowed contract-level dates as CONTRACT_DATE items with concise labels', () => {
    const items = mapOrgContractSource({
      reference: 'c1',
      title: 'Keretszerződés',
      publishedDoc: { publicationId: 'p1' },
      signatureDate: '2026-01-05T00:00:00.000Z',
      effectiveDate: '2026-02-01T00:00:00.000Z',
      expiryDate: '2027-01-01T00:00:00.000Z',
      nextCriticalDate: '2026-11-30T00:00:00.000Z',
    });
    expect(items.map((item) => item.sourceKey)).toEqual([
      'contract-c1-expiry',
      'contract-c1-critical',
      'contract-c1-effective',
      'contract-c1-signature',
    ]);
    expect(items.every((item) => item.category === 'CONTRACT_DATE')).toBe(true);
    expect(items.every((item) => item.status === 'INFO')).toBe(true);
    expect(items.every((item) => item.href === '/portal/szerzodesek')).toBe(true);
    const titles = items.map((item) => item.title);
    expect(titles[0]).toContain('Lejárat');
    expect(titles[1]).toContain('Következő kritikus dátum');
    expect(titles[2]).toContain('Hatálybalépés');
    expect(titles[3]).toContain('Aláírás dátuma');
    expect(() => assertClientSafe(items)).not.toThrow();
  });

  it('never invents an item for a null contract date', () => {
    const items = mapOrgContractSource({
      reference: 'c1',
      title: 'Keretszerződés',
      publishedDoc: { publicationId: 'p1' },
      effectiveDate: '2026-02-01T00:00:00.000Z',
      expiryDate: null,
      nextCriticalDate: null,
      signatureDate: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].sourceKey).toBe('contract-c1-effective');
  });

  it('does NOT double-count the legacy keyDate once richer dates exist', () => {
    const items = mapOrgContractSource({
      reference: 'c1',
      title: 'Keretszerződés',
      publishedDoc: { publicationId: 'p1' },
      keyDate: '2026-09-19T00:00:00.000Z',
      expiryDate: '2026-09-19T00:00:00.000Z',
    });
    expect(items).toHaveLength(1);
    expect(items[0].sourceKey).toBe('contract-c1-expiry');
    expect(items.some((item) => item.sourceKey === 'contract-c1')).toBe(false);
  });

  it('keeps the legacy keyDate fallback when no explicit date is present', () => {
    const items = mapOrgContractSource({ reference: 'c1', title: 'Szerződés', keyDate: '2026-09-19T00:00:00.000Z', publishedDoc: { publicationId: 'p1' } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: 'CONTRACT_DATE', sourceKey: 'contract-c1', date: '2026-09-19T00:00:00.000Z' });
  });

  it('emits exactly one deterministic item when two canonical dates share a day', () => {
    const items = mapOrgContractSource({
      reference: 'c1',
      title: 'Keretszerződés',
      publishedDoc: { publicationId: 'p1' },
      expiryDate: '2027-01-01T00:00:00.000Z',
      nextCriticalDate: '2027-01-01T00:00:00.000Z',
    });
    expect(items).toHaveLength(1);
    expect(items[0].sourceKey).toBe('contract-c1-expiry');
  });

  it('never exposes internal obligation / occurrence / entitlement dates', () => {
    const items = mapOrgContractSource({
      reference: 'c1',
      title: 'Keretszerződés',
      publishedDoc: { publicationId: 'p1' },
      effectiveDate: '2026-02-01T00:00:00.000Z',
      obligations: [{ id: 'ob-1', title: 'Belső kötelezettség', nextDueDate: '2026-12-31T00:00:00.000Z', status: 'OPEN' }],
      entitlements: [{ id: 'en-1', type: 'RENEWAL_OPTION', exerciseByDate: '2026-10-01T00:00:00.000Z' }],
    } as never);
    const json = JSON.stringify(items);
    expect(json).not.toContain('Belső kötelezettség');
    expect(json).not.toContain('ob-1');
    expect(json).not.toContain('en-1');
    expect(json).not.toContain('2026-12-31');
    expect(json).not.toContain('2026-10-01');
  });
});

describe('contract calendar integration reuses the canonical projection', () => {
  it('projects the customer-safe contract dates without an extra event model', async () => {
    // The category set is unchanged: contract dates reuse the existing CONTRACT_DATE
    // category rather than introducing a second calendar/event store.
    expect([...CUSTOMER_CALENDAR_CATEGORIES]).toEqual([
      'MATTER_TARGET',
      'PUBLISHED_DEADLINE',
      'ACTION_REQUEST',
      'CUSTOMER_REQUEST',
      'CONTRACT_DATE',
      'COMPANY_MILESTONE',
      'GROW_TARGET',
      'COMPLIANCE_REVIEW',
    ]);
  });

  it('reuses CONTRACT_DATE and never double-counts the existing keyDate', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        listContracts: async () => [{
          reference: 'pub-1',
          title: 'Keretszerződés',
          publishedDoc: { publicationId: 'p1' },
          keyDate: '2026-09-19T00:00:00.000Z',
          effectiveDate: '2026-09-10T00:00:00.000Z',
          expiryDate: '2026-09-19T00:00:00.000Z',
        }],
      }),
    });
    const contractItems = result.items.filter((item) => item.category === 'CONTRACT_DATE');
    expect(contractItems.map((item) => item.day)).toEqual(['2026-09-10', '2026-09-19']);
    expect(contractItems.map((item) => item.id)).toEqual([
      'CONTRACT_DATE:contract-pub-1-effective',
      'CONTRACT_DATE:contract-pub-1-expiry',
    ]);
    expect(result.items.some((item) => item.id === 'CONTRACT_DATE:contract-pub-1')).toBe(false);
    expect(contractItems.every((item) => item.status === 'INFO' && item.href === '/portal/szerzodesek')).toBe(true);
    expect(() => assertClientSafe(result)).not.toThrow();
  });

  it('preserves the existing open/overdue buckets (contract dates are informational)', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', { from: '2026-09-01', to: '2026-09-30' }, realPrisma, {
      now: NOW,
      readers: readers({
        listActionRequests: async () => [{ id: 'a1', title: 'Teendő', dueAt: '2026-09-05T00:00:00.000Z' }],
        listContracts: async () => [{
          reference: 'pub-1',
          title: 'Keretszerződés',
          publishedDoc: { publicationId: 'p1' },
          expiryDate: '2026-09-19T00:00:00.000Z',
        }],
      }),
    });
    // Only the ACTION_REQUEST carries OPEN; the contract date never inflates open/overdue.
    expect(result.counts.open).toBe(1);
    expect(result.counts.overdue).toBe(1);
    expect(result.counts.dueToday).toBe(0);
    expect(result.counts.dueNext7Days).toBe(0);
    expect(result.counts.total).toBe(2);
  });

  it('isolates contract dates to whatever the canonical contract reader authorizes', async () => {
    const result = await getCustomerCalendar('identity-1', 'workspace-1', RANGE, realPrisma, {
      now: NOW,
      readers: readers({
        // The canonical reader only ever returns the current client's published contracts.
        listContracts: async () => [{
          reference: 'pub-a',
          title: 'A szerződés',
          publishedDoc: { publicationId: 'p-a' },
          expiryDate: '2026-09-22T00:00:00.000Z',
        }],
      }),
    });
    expect(result.items.map((item) => item.title)).toEqual(['A szerződés · Lejárat']);
    for (const item of result.items) {
      expect(item.id).not.toContain('client-b');
      expect(item.href.startsWith('/portal/')).toBe(true);
    }
  });
});
