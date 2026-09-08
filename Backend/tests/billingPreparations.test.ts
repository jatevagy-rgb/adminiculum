import { Prisma } from '@prisma/client';
import {
  CALCULATION_POLICY_VERSION,
  deriveReviewStatus,
  entryClientId,
  netAmountForMinutes,
  sourceFingerprint,
} from '../src/modules/billing-preparations/service';

const D = (value: string) => new Prisma.Decimal(value);

function sourceEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'te-1', minutes: 60, billable: true, workType: 'DRAFTING', description: 'Munka',
    workDate: new Date('2026-08-05T12:00:00Z'), userId: 'u-1', matterId: 'm-1', caseId: 'case-1', taskId: null, departmentId: null,
    matter: { id: 'm-1', clientId: 'client-1', cases: [{ id: 'case-1', clientId: 'client-1', caseNumber: 'U1', title: 'Ügy' }] },
    case: { id: 'case-1', clientId: 'client-1', caseNumber: 'U1', title: 'Ügy' },
    user: { id: 'u-1', name: 'Dr. Teszt' },
    department: null,
    task: null,
    ...overrides,
  } as any;
}

describe('T3B per-entry money calculation (authoritative Decimal policy)', () => {
  it('computes minutes × rate / 60 rounded HALF_UP to 2 decimals', () => {
    expect(netAmountForMinutes(1, D('1000'))?.toFixed(2)).toBe('16.67');
    expect(netAmountForMinutes(90, D('45000.1234'))?.toFixed(2)).toBe('67500.19');
    expect(netAmountForMinutes(60, D('40000'))?.toFixed(2)).toBe('40000.00');
    expect(netAmountForMinutes(7, D('33333.3333'))?.toFixed(2)).toBe('3888.89');
  });
  it('never uses JS Number: returns Decimal instances and null for absent rate/zero minutes', () => {
    expect(netAmountForMinutes(60, null)).toBeNull();
    expect(netAmountForMinutes(0, D('1000'))).toBeNull();
    expect(netAmountForMinutes(-5, D('1000'))).toBeNull();
    const amount = netAmountForMinutes(30, D('21000'));
    expect(amount).toBeInstanceOf(Prisma.Decimal);
    expect(amount?.toFixed(2)).toBe('10500.00');
  });
  it('declares the calculation policy version', () => {
    expect(CALCULATION_POLICY_VERSION).toBe('PER_ENTRY_MINUTES_X_RATE_HALF_UP_2DP_V1');
  });
});

describe('source fingerprint (staleness detection)', () => {
  it('is deterministic and sensitive to financially relevant fields', () => {
    const entry = sourceEntry();
    expect(sourceFingerprint(entry)).toBe(sourceFingerprint(sourceEntry()));
    for (const change of [
      { minutes: 61 }, { billable: false }, { description: 'Más' }, { workType: 'REVIEW' },
      { userId: 'u-2' }, { caseId: 'case-2' }, { taskId: 't-1' }, { departmentId: 'd-1' },
      { workDate: new Date('2026-08-06T12:00:00Z') },
    ]) {
      expect(sourceFingerprint(sourceEntry(change))).not.toBe(sourceFingerprint(entry));
    }
  });
  it('detects requester and organization-group relational changes without TimeEntry edits', () => {
    const entry = sourceEntry({
      taskId: 't-1',
      task: {
        id: 't-1', title: 'Feladat', caseId: 'case-1', matterId: 'm-1', requestedByOrganizationPersonId: 'p-1',
        case: { id: 'case-1', clientId: 'client-1', caseNumber: 'U1', title: 'Ügy' },
        requestedByOrganizationPerson: { id: 'p-1', name: 'Kérelmező', jobTitle: null, organizationGroupId: 'g-1', organizationGroup: { id: 'g-1', name: 'HR' } },
        workPackageItem: null,
      },
    });
    const base = sourceFingerprint(entry);
    const moved = sourceEntry({
      taskId: 't-1',
      task: {
        id: 't-1', title: 'Feladat', caseId: 'case-1', matterId: 'm-1', requestedByOrganizationPersonId: 'p-2',
        case: { id: 'case-1', clientId: 'client-1', caseNumber: 'U1', title: 'Ügy' },
        requestedByOrganizationPerson: { id: 'p-2', name: 'Másik', jobTitle: null, organizationGroupId: 'g-2', organizationGroup: { id: 'g-2', name: 'Pénzügy' } },
        workPackageItem: null,
      },
    });
    expect(sourceFingerprint(moved)).not.toBe(base);
  });
});

describe('authoritative client ownership (cross-client guard)', () => {
  it('resolves EXACT_CASE entries to their case client and MATTER_ONLY to the matter client', () => {
    expect(entryClientId(sourceEntry())).toBe('client-1');
    expect(entryClientId(sourceEntry({ caseId: null, case: null }))).toBe('client-1');
    expect(entryClientId(sourceEntry({ matterId: null, matter: null, caseId: null, case: null }))).toBeNull();
  });
});

describe('review status derivation', () => {
  const baseItem = {
    attributionKind: 'EXACT_CASE', hourlyRate: D('1000'), rateOverride: null,
    sourceBillable: true, sourceMinutes: 60, billingMinutes: 60, reviewedAt: null, sourceFingerprint: 'fp',
  };
  const liveOk = { exists: true, fingerprint: 'fp' };
  it('maps every blocker', () => {
    expect(deriveReviewStatus(baseItem, liveOk)).toBe('OK');
    expect(deriveReviewStatus(baseItem, { exists: false, fingerprint: null })).toBe('SOURCE_MISSING');
    expect(deriveReviewStatus(baseItem, { exists: true, fingerprint: 'other' })).toBe('STALE');
    expect(deriveReviewStatus({ ...baseItem, attributionKind: 'MATTER_ONLY' }, liveOk)).toBe('REVIEW_REQUIRED');
    expect(deriveReviewStatus({ ...baseItem, attributionKind: 'AMBIGUOUS' }, liveOk)).toBe('REVIEW_REQUIRED');
    expect(deriveReviewStatus({ ...baseItem, hourlyRate: null }, liveOk)).toBe('NO_RATE');
    expect(deriveReviewStatus({ ...baseItem, sourceBillable: false }, liveOk)).toBe('NON_BILLABLE');
    expect(deriveReviewStatus({ ...baseItem, sourceMinutes: 0, billingMinutes: 0 }, liveOk)).toBe('ZERO_MINUTES');
  });
  it('review acknowledgment clears attribution and non-billable gates; a row override rescues NO_RATE', () => {
    expect(deriveReviewStatus({ ...baseItem, attributionKind: 'MATTER_ONLY', reviewedAt: new Date() }, liveOk)).toBe('OK');
    expect(deriveReviewStatus({ ...baseItem, sourceBillable: false, reviewedAt: new Date() }, liveOk)).toBe('OK');
    expect(deriveReviewStatus({ ...baseItem, hourlyRate: null, rateOverride: D('500') }, liveOk)).toBe('OK');
  });
});
