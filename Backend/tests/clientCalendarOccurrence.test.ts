/**
 * Contract Watch CW1 — internal calendar occurrence projection + contract
 * selector.
 *
 * Proves: occurrence dueDate is projected; nullable dueDate is not; the optional
 * contractId scopes only CONTRACT / OBLIGATION / ENTITLEMENT /
 * OBLIGATION_OCCURRENCE rows; and omitting contractId preserves the exact
 * previous unscoped behavior.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { prisma as realPrisma } from '../src/prisma/prisma.service';
import { getClientCalendar } from '../src/modules/client-calendar/service';
import { CUSTOMER_CALENDAR_CATEGORIES } from '../src/modules/client-portal-calendar/projection';

type Row = Record<string, any>;

const inRange = (v: unknown, range: { gte: Date; lte: Date }): boolean =>
  v instanceof Date && v >= range.gte && v <= range.lte;

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond == null) continue;
    if (key === 'OR') {
      if (!(cond as Row[]).some((clause) => matchesWhere(row, clause))) return false;
      continue;
    }
    if (key === 'case') {
      const caseWhere = cond as Row;
      if (caseWhere.clientId && row.caseClientId !== caseWhere.clientId) return false;
      const idIn = (caseWhere.id as Row | undefined)?.in as unknown[] | undefined;
      if (idIn && !idIn.includes(row.caseId)) return false;
      continue;
    }
    if (typeof cond === 'object' && 'gte' in (cond as Row)) {
      if (!inRange(row[key], cond as { gte: Date; lte: Date })) return false;
      continue;
    }
    if (typeof cond === 'object' && 'in' in (cond as Row)) {
      if (!((cond as Row).in as unknown[]).includes(row[key])) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const ADMIN = 'admin-1';

function fixture() {
  return {
    clients: [{ id: CLIENT_A, name: 'Client A' }, { id: CLIENT_B, name: 'Client B' }],
    users: [{ id: ADMIN, role: 'ADMIN', status: 'ACTIVE', isActive: true }],
    contracts: [
      { id: 'contract-a1', clientId: CLIENT_A, title: 'A1 szerződés', status: 'ACTIVE', signatureDate: null, effectiveDate: new Date('2027-01-10T00:00:00.000Z'), expiryDate: null, nextCriticalDate: null },
      { id: 'contract-a2', clientId: CLIENT_A, title: 'A2 szerződés', status: 'ACTIVE', signatureDate: null, effectiveDate: null, expiryDate: new Date('2028-05-05T00:00:00.000Z'), nextCriticalDate: null },
      { id: 'contract-b1', clientId: CLIENT_B, title: 'B szerződés', status: 'ACTIVE', signatureDate: null, effectiveDate: new Date('2027-07-07T00:00:00.000Z'), expiryDate: null, nextCriticalDate: null },
    ],
    obligations: [
      { id: 'ob-a1', clientId: CLIENT_A, title: 'A1 kötelezettség', status: 'OPEN', nextDueDate: new Date('2027-09-30T00:00:00.000Z'), sourceContractId: 'contract-a1' },
      { id: 'ob-a2', clientId: CLIENT_A, title: 'A2 kötelezettség', status: 'OPEN', nextDueDate: new Date('2027-10-01T00:00:00.000Z'), sourceContractId: 'contract-a2' },
      { id: 'ob-b1', clientId: CLIENT_B, title: 'B kötelezettség', status: 'OPEN', nextDueDate: new Date('2027-10-02T00:00:00.000Z'), sourceContractId: 'contract-b1' },
    ],
    entitlements: [
      { id: 'en-a1', clientId: CLIENT_A, contractId: 'contract-a1', title: 'A1 jog', status: 'ACTIVE', exerciseByDate: new Date('2027-11-11T00:00:00.000Z') },
      { id: 'en-a2', clientId: CLIENT_A, contractId: 'contract-a2', title: 'A2 jog', status: 'ACTIVE', exerciseByDate: new Date('2027-12-12T00:00:00.000Z') },
      { id: 'en-b1', clientId: CLIENT_B, contractId: 'contract-b1', title: 'B jog', status: 'ACTIVE', exerciseByDate: new Date('2027-12-13T00:00:00.000Z') },
    ],
    occurrences: [
      { id: 'occ-a1', clientId: CLIENT_A, contractId: 'contract-a1', obligationId: 'ob-a1', occurrenceKey: 'advance-1', sequence: 1, occurrenceType: 'ADVANCE', title: 'Előleg', dueDate: new Date('2027-02-02T00:00:00.000Z'), status: 'OPEN' },
      { id: 'occ-a1b', clientId: CLIENT_A, contractId: 'contract-a1', obligationId: 'ob-a1', occurrenceKey: 'payment-1', sequence: 2, occurrenceType: 'PAYMENT', title: 'Részlet 1', dueDate: new Date('2027-03-03T00:00:00.000Z'), status: 'OPEN' },
      { id: 'occ-a2', clientId: CLIENT_A, contractId: 'contract-a2', obligationId: 'ob-a2', occurrenceKey: 'payment-1', sequence: 1, occurrenceType: 'PAYMENT', title: 'A2 részlet', dueDate: new Date('2027-04-04T00:00:00.000Z'), status: 'OPEN' },
      { id: 'occ-null', clientId: CLIENT_A, contractId: 'contract-a1', obligationId: 'ob-a1', occurrenceKey: 'no-date', sequence: 9, occurrenceType: 'OTHER', title: 'Dátum nélkül', dueDate: null, status: 'OPEN' },
      { id: 'occ-b1', clientId: CLIENT_B, contractId: 'contract-b1', obligationId: 'ob-b1', occurrenceKey: 'payment-1', sequence: 1, occurrenceType: 'PAYMENT', title: 'B részlet', dueDate: new Date('2027-05-05T00:00:00.000Z'), status: 'OPEN' },
    ],
    milestones: [
      { id: 'ms-a1', clientId: CLIENT_A, title: 'A mérföldkő', status: 'PLANNED', targetDate: new Date('2027-06-06T00:00:00.000Z'), milestoneDate: null },
    ],
    cases: [
      { id: 'case-a1', clientId: CLIENT_A, title: 'A ügy', caseNumber: 'A-1', status: 'IN_REVIEW', deadline: new Date('2027-08-08T00:00:00.000Z') },
    ],
    tasks: [
      { id: 'task-a1', caseId: 'case-a1', caseClientId: CLIENT_A, title: 'A feladat', status: 'PENDING', dueDate: new Date('2027-08-09T00:00:00.000Z') },
    ],
    intakeDeadlines: [
      { id: 'intake-a1', caseId: 'case-a1', caseClientId: CLIENT_A, title: 'A intake', dueAt: new Date('2027-08-10T00:00:00.000Z') },
    ],
  };
}

type Fx = ReturnType<typeof fixture>;

function fakePrisma(fx: Fx) {
  const findMany = (rows: Row[]) => async (args: { where?: Row }) => rows.filter((r) => matchesWhere(r, args?.where || {}));
  return {
    client: { findUnique: async ({ where }: any) => fx.clients.find((c) => c.id === where.id) ?? null },
    user: { findUnique: async ({ where }: any) => fx.users.find((u) => u.id === where.id) ?? null },
    case: {
      findMany: findMany(fx.cases),
      findFirst: async ({ where }: any) => fx.cases.find((c) => matchesWhere(c, where)) ?? null,
    },
    caseCollaborator: { findMany: async () => [] },
    contractRecord: {
      findMany: findMany(fx.contracts),
      findUnique: async ({ where }: any) => fx.contracts.find((c) => c.id === where.id) ?? null,
    },
    clientObligation: { findMany: findMany(fx.obligations) },
    contractEntitlement: { findMany: findMany(fx.entitlements) },
    clientObligationOccurrence: { findMany: findMany(fx.occurrences) },
    companyMilestone: { findMany: findMany(fx.milestones) },
    task: { findMany: findMany(fx.tasks) },
    caseIntakeDeadline: { findMany: findMany(fx.intakeDeadlines) },
  } as unknown as typeof realPrisma;
}

const RANGE = { from: '2027-01-01', to: '2028-12-31' };
const actor = { userId: ADMIN, role: 'ADMIN' };

describe('internal calendar — obligation occurrence projection', () => {
  it('projects occurrence dueDate as an OBLIGATION_OCCURRENCE item', async () => {
    const result = await getClientCalendar(actor, CLIENT_A, RANGE, fakePrisma(fixture()));
    const occurrences = result.items.filter((i) => i.sourceType === 'OBLIGATION_OCCURRENCE');
    expect(occurrences.map((i) => i.title).sort()).toEqual(['Előleg', 'Részlet 1', 'A2 részlet'].sort());
    expect(occurrences.every((i) => i.dateKind === 'OCCURRENCE_DUE')).toBe(true);
    expect(occurrences.every((i) => typeof i.contractId === 'string')).toBe(true);
  });

  it('never projects a null-dated occurrence', async () => {
    const result = await getClientCalendar(actor, CLIENT_A, RANGE, fakePrisma(fixture()));
    expect(result.items.map((i) => i.sourceId)).not.toContain('occ-null');
  });

  it('keeps occurrence items out of client B', async () => {
    const result = await getClientCalendar(actor, CLIENT_A, RANGE, fakePrisma(fixture()));
    expect(result.items.map((i) => i.sourceId)).not.toContain('occ-b1');
  });
});

describe('internal calendar — optional contract selector', () => {
  it('scopes CONTRACT / OBLIGATION / ENTITLEMENT / OCCURRENCE to the selected contract', async () => {
    const result = await getClientCalendar(actor, CLIENT_A, { ...RANGE, contractId: 'contract-a1' }, fakePrisma(fixture()));
    const ids = new Set(result.items.map((i) => i.sourceId));
    // Selected contract scope is present.
    expect(ids.has('contract-a1')).toBe(true);
    expect(ids.has('ob-a1')).toBe(true);
    expect(ids.has('en-a1')).toBe(true);
    expect(ids.has('occ-a1')).toBe(true);
    expect(ids.has('occ-a1b')).toBe(true);
    // The other contract of the same client is excluded.
    expect(ids.has('contract-a2')).toBe(false);
    expect(ids.has('ob-a2')).toBe(false);
    expect(ids.has('en-a2')).toBe(false);
    expect(ids.has('occ-a2')).toBe(false);
    // Client-level sources stay client-level.
    expect(ids.has('ms-a1')).toBe(true);
    expect(ids.has('case-a1')).toBe(true);
    expect(ids.has('task-a1')).toBe(true);
    expect(ids.has('intake-a1')).toBe(true);
  });

  it('preserves the exact unscoped calendar when no contractId is given', async () => {
    const unscoped = await getClientCalendar(actor, CLIENT_A, RANGE, fakePrisma(fixture()));
    const empty = await getClientCalendar(actor, CLIENT_A, { ...RANGE, contractId: '' }, fakePrisma(fixture()));
    expect(empty.items).toEqual(unscoped.items);

    const ids = new Set(unscoped.items.map((i) => i.sourceId));
    expect(ids.has('contract-a2')).toBe(true);
    expect(ids.has('ob-a2')).toBe(true);
    expect(ids.has('en-a2')).toBe(true);
    expect(ids.has('occ-a2')).toBe(true);
  });

  it('rejects an unknown contract and another client\'s contract', async () => {
    await expect(getClientCalendar(actor, CLIENT_A, { ...RANGE, contractId: 'missing' }, fakePrisma(fixture())))
      .rejects.toMatchObject({ status: 404, code: 'CONTRACT_NOT_FOUND' });
    await expect(getClientCalendar(actor, CLIENT_A, { ...RANGE, contractId: 'contract-b1' }, fakePrisma(fixture())))
      .rejects.toMatchObject({ status: 403, code: 'CROSS_CLIENT_CONTRACT' });
  });
});

describe('customer portal calendar isolation', () => {
  it('has no occurrence category and never reads occurrence persistence', () => {
    expect(CUSTOMER_CALENDAR_CATEGORIES as readonly string[]).not.toContain('OBLIGATION_OCCURRENCE');
    expect(CUSTOMER_CALENDAR_CATEGORIES as readonly string[]).not.toContain('OCCURRENCE_DUE');
    const root = path.join(__dirname, '..', 'src', 'modules', 'client-portal-calendar');
    for (const file of ['service.ts', 'mappers.ts', 'projection.ts']) {
      const source = readFileSync(path.join(root, file), 'utf8');
      expect(source).not.toMatch(/clientObligationOccurrence|ObligationOccurrence|Occurrence/);
    }
  });
});
