/**
 * CLIENT CALENDAR — unit tests for the read-only projection.
 *
 * Uses an in-memory Prisma stand-in that applies the service's `where` filters
 * (clientId, OR date-range clauses, readable-case scope) so tests verify both
 * the projection output AND which isolation filters reached the query layer.
 */
import { prisma as realPrisma } from '../src/prisma/prisma.service';
import { getClientCalendar, resolveCalendarRange } from '../src/modules/client-calendar/service';
import { InteractionError } from '../src/modules/client-interaction/base';

type Row = Record<string, unknown>;

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
      const cw = cond as Row;
      if (cw.clientId && row.caseClientId !== cw.clientId) return false;
      const idIn = (cw.id as Row | undefined)?.in as unknown[] | undefined;
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

type Fixture = {
  clients: Row[];
  users: Row[];
  collaborators: Row[];
  cases: Row[];
  contracts: Row[];
  obligations: Row[];
  entitlements: Row[];
  milestones: Row[];
  tasks: Row[];
  intakeDeadlines: Row[];
};

function fakePrisma(fx: Fixture) {
  const findMany = (rows: Row[]) => async (args: { where?: Row }) => rows.filter((r) => matchesWhere(r, args?.where || {}));
  return {
    client: { findUnique: async (args: { where: { id: string } }) => fx.clients.find((r) => r.id === args.where.id) ?? null },
    user: { findUnique: async (args: { where: { id: string } }) => fx.users.find((r) => r.id === args.where.id) ?? null },
    caseCollaborator: { findMany: findMany(fx.collaborators) },
    case: {
      findMany: findMany(fx.cases),
      findFirst: async (args: { where: Row }) => fx.cases.find((r) => matchesWhere(r, args.where)) ?? null,
    },
    contractRecord: { findMany: findMany(fx.contracts) },
    clientObligation: { findMany: findMany(fx.obligations) },
    contractEntitlement: { findMany: findMany(fx.entitlements) },
    companyMilestone: { findMany: findMany(fx.milestones) },
    task: { findMany: findMany(fx.tasks) },
    caseIntakeDeadline: { findMany: findMany(fx.intakeDeadlines) },
  } as unknown as typeof realPrisma;
}

const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const ADMIN = 'admin-1';
const LAWYER = 'lawyer-1';
const CASE_A1 = 'case-a1';
const CASE_B1 = 'case-b1';
const CASE_A2 = 'case-a2'; // client A case the lawyer cannot see

function fixture(): Fixture {
  return {
    clients: [{ id: CLIENT_A, name: 'Client A' }, { id: CLIENT_B, name: 'Client B' }],
    users: [
      { id: ADMIN, role: 'ADMIN', status: 'ACTIVE', isActive: true },
      { id: LAWYER, role: 'LAWYER', status: 'ACTIVE', isActive: true },
    ],
    collaborators: [],
    cases: [
      { id: CASE_A1, clientId: CLIENT_A, createdById: LAWYER, assignedLawyerId: null, title: 'A1 ügy', caseNumber: 'A-001', status: 'IN_REVIEW', deadline: new Date('2027-03-05T00:00:00.000Z') },
      { id: CASE_A2, clientId: CLIENT_A, createdById: 'other', assignedLawyerId: 'other', title: 'A2 ügy', caseNumber: 'A-002', status: 'IN_REVIEW', deadline: new Date('2027-04-01T00:00:00.000Z') },
      { id: CASE_B1, clientId: CLIENT_B, createdById: 'other', assignedLawyerId: null, title: 'B1 ügy', caseNumber: 'B-001', status: 'IN_REVIEW', deadline: new Date('2027-05-10T00:00:00.000Z') },
      { id: 'case-a-null', clientId: CLIENT_A, createdById: LAWYER, assignedLawyerId: null, title: 'No deadline', caseNumber: 'A-003', status: 'DRAFT', deadline: null },
    ],
    contracts: [
      {
        id: 'contract-a1', clientId: CLIENT_A, title: 'A keretszerződés', status: 'ACTIVE',
        signatureDate: new Date('2026-01-15T00:00:00.000Z'),
        effectiveDate: new Date('2026-02-01T00:00:00.000Z'),
        expiryDate: new Date('2030-06-30T00:00:00.000Z'),
        nextCriticalDate: new Date('2027-01-31T00:00:00.000Z'),
        noticePeriodDays: 90, autoRenewal: true,
      },
      { id: 'contract-a-null', clientId: CLIENT_A, title: 'No dates', status: 'DRAFT', signatureDate: null, effectiveDate: null, expiryDate: null, nextCriticalDate: null },
      { id: 'contract-b1', clientId: CLIENT_B, title: 'B szerződés', status: 'ACTIVE', signatureDate: new Date('2026-05-01T00:00:00.000Z'), effectiveDate: null, expiryDate: null, nextCriticalDate: null },
    ],
    obligations: [
      { id: 'ob-a1', clientId: CLIENT_A, title: 'Jelentési kötelezettség', status: 'OPEN', nextDueDate: new Date('2027-09-30T00:00:00.000Z'), sourceContractId: 'contract-a1' },
      { id: 'ob-a-null', clientId: CLIENT_A, title: 'Határidő nélkül', status: 'OPEN', nextDueDate: null, sourceContractId: null },
      { id: 'ob-b1', clientId: CLIENT_B, title: 'B kötelezettség', status: 'OPEN', nextDueDate: new Date('2027-01-01T00:00:00.000Z'), sourceContractId: null },
    ],
    entitlements: [
      { id: 'en-a1', clientId: CLIENT_A, contractId: 'contract-a1', title: 'Vételi jog', status: 'ACTIVE', exerciseByDate: new Date('2028-12-31T00:00:00.000Z') },
      { id: 'en-b1', clientId: CLIENT_B, contractId: 'contract-b1', title: 'B jogosultság', status: 'ACTIVE', exerciseByDate: new Date('2028-01-01T00:00:00.000Z') },
    ],
    milestones: [
      { id: 'ms-a1', clientId: CLIENT_A, title: 'Törzstőke-emelés', status: 'PLANNED', type: 'CAPITAL', targetDate: new Date('2027-06-30T00:00:00.000Z'), milestoneDate: new Date('2027-06-30T00:00:00.000Z') },
      { id: 'ms-b1', clientId: CLIENT_B, title: 'B mérföldkő', status: 'PLANNED', type: 'OTHER', targetDate: new Date('2027-01-01T00:00:00.000Z'), milestoneDate: null },
    ],
    tasks: [
      { id: 'task-a1', caseId: CASE_A1, caseClientId: CLIENT_A, title: 'Felülvizsgálat', status: 'PENDING', dueDate: new Date('2027-02-14T00:00:00.000Z') },
      { id: 'task-a2', caseId: CASE_A2, caseClientId: CLIENT_A, title: 'A2 task (unreadable)', status: 'PENDING', dueDate: new Date('2027-02-15T00:00:00.000Z') },
      { id: 'task-b1', caseId: CASE_B1, caseClientId: CLIENT_B, title: 'B task', status: 'PENDING', dueDate: new Date('2027-02-16T00:00:00.000Z') },
      { id: 'task-a-null', caseId: CASE_A1, caseClientId: CLIENT_A, title: 'No due', status: 'PENDING', dueDate: null },
    ],
    intakeDeadlines: [
      { id: 'intake-a1', caseId: CASE_A1, caseClientId: CLIENT_A, title: 'Beadvány határideje', dueAt: new Date('2027-03-01T00:00:00.000Z') },
      { id: 'intake-b1', caseId: CASE_B1, caseClientId: CLIENT_B, title: 'B intake', dueAt: new Date('2027-03-02T00:00:00.000Z') },
    ],
  };
}

const FULL_RANGE = { from: '2026-01-01', to: '2030-12-31' };

describe('client calendar range validation', () => {
  it('accepts a five-calendar-year range', () => {
    const { from, to } = resolveCalendarRange(FULL_RANGE);
    expect(from.toISOString()).toContain('2026-01-01');
    expect(to.toISOString()).toContain('2030-12-31');
  });

  it('rejects ranges beyond the five-year window', () => {
    expect(() => resolveCalendarRange({ from: '2026-01-01', to: '2032-01-01' })).toThrow(InteractionError);
    expect(() => resolveCalendarRange({ from: '2020-01-01', to: '2040-01-01' })).toThrow(/five-year/);
  });

  it('rejects inverted, malformed and non-calendar dates', () => {
    expect(() => resolveCalendarRange({ from: '2030-01-01', to: '2020-01-01' })).toThrow(InteractionError);
    expect(() => resolveCalendarRange({ from: 'yesterday', to: '2030-01-01' })).toThrow(InteractionError);
    expect(() => resolveCalendarRange({ from: '2026-02-30' })).toThrow(InteractionError);
    expect(() => resolveCalendarRange({ from: '' })).toThrow(InteractionError);
  });

  it('defaults to a bounded range when params are omitted', () => {
    const { from, to } = resolveCalendarRange({});
    expect(to.getTime() - from.getTime()).toBeLessThanOrEqual((5 * 366 + 2) * 24 * 60 * 60 * 1000);
  });
});

describe('client calendar projection', () => {
  it('projects all canonical date sources for the client', async () => {
    const fx = fixture();
    const result = await getClientCalendar({ userId: ADMIN, role: 'ADMIN' }, CLIENT_A, FULL_RANGE, fakePrisma(fx));
    const kinds = result.items.map((i) => `${i.sourceType}:${i.dateKind}`);
    expect(kinds).toContain('CONTRACT:SIGNATURE');
    expect(kinds).toContain('CONTRACT:EFFECTIVE');
    expect(kinds).toContain('CONTRACT:EXPIRY');
    expect(kinds).toContain('CONTRACT:CRITICAL_DATE');
    expect(kinds).toContain('OBLIGATION:NEXT_DUE');
    expect(kinds).toContain('ENTITLEMENT:EXERCISE_BY');
    expect(kinds).toContain('COMPANY_MILESTONE:TARGET_DATE');
    expect(kinds).toContain('COMPANY_MILESTONE:MILESTONE_DATE');
    expect(kinds).toContain('CASE_DEADLINE:DEADLINE');
    expect(kinds).toContain('TASK:DUE_DATE');
    expect(kinds).toContain('CASE_INTAKE_DEADLINE:INTAKE_DUE');
  });

  it('never emits an item for a null source date and never derives dates', async () => {
    const fx = fixture();
    const result = await getClientCalendar({ userId: ADMIN, role: 'ADMIN' }, CLIENT_A, FULL_RANGE, fakePrisma(fx));
    const sourceIds = result.items.map((i) => i.sourceId);
    expect(sourceIds).not.toContain('contract-a-null');
    expect(sourceIds).not.toContain('ob-a-null');
    expect(sourceIds).not.toContain('case-a-null');
    expect(sourceIds).not.toContain('task-a-null');
    // noticePeriodDays=90 + autoRenewal must not fabricate a notice/renewal item:
    const contractItems = result.items.filter((i) => i.sourceId === 'contract-a1');
    expect(contractItems).toHaveLength(4); // exactly the four stored dates
    expect(contractItems.every((i) => ['SIGNATURE', 'EFFECTIVE', 'EXPIRY', 'CRITICAL_DATE'].includes(i.dateKind))).toBe(true);
  });

  it('enforces client A/B isolation on every source', async () => {
    const fx = fixture();
    const result = await getClientCalendar({ userId: ADMIN, role: 'ADMIN' }, CLIENT_A, FULL_RANGE, fakePrisma(fx));
    const all = result.items.map((i) => i.sourceId);
    for (const forbidden of ['contract-b1', 'ob-b1', 'en-b1', 'ms-b1', CASE_B1, 'task-b1', 'intake-b1']) {
      expect(all).not.toContain(forbidden);
    }
    expect(result.clientId).toBe(CLIENT_A);
  });

  it('applies the readable-case scope for non-manager roles', async () => {
    const fx = fixture();
    // Lawyer A created CASE_A1 but has no access to CASE_A2 or CASE_B1.
    const result = await getClientCalendar({ userId: LAWYER, role: 'LAWYER' }, CLIENT_A, FULL_RANGE, fakePrisma(fx));
    const caseIds = new Set(result.items.map((i) => i.caseId).filter(Boolean));
    expect(caseIds.has(CASE_A1)).toBe(true);
    expect(caseIds.has(CASE_A2)).toBe(false);
    expect(caseIds.has(CASE_B1)).toBe(false);
    // Non-case sources still project (client-level read access is sufficient).
    expect(result.items.some((i) => i.sourceType === 'CONTRACT')).toBe(true);
  });

  it('rejects a lawyer with no case access in the client', async () => {
    const fx = fixture();
    const stranger = { userId: 'lawyer-x', role: 'LAWYER' };
    fx.users.push({ id: 'lawyer-x', role: 'LAWYER', status: 'ACTIVE', isActive: true });
    await expect(getClientCalendar(stranger, CLIENT_A, FULL_RANGE, fakePrisma(fx))).rejects.toMatchObject({ status: 403 });
  });

  it('honours the database-level range filter', async () => {
    const fx = fixture();
    const result = await getClientCalendar({ userId: ADMIN, role: 'ADMIN' }, CLIENT_A, { from: '2027-01-01', to: '2027-12-31' }, fakePrisma(fx));
    for (const item of result.items) {
      expect(item.date >= '2027-01-01' && item.date <= '2027-12-31T23:59:59.999Z').toBe(true);
    }
    expect(result.items.some((i) => i.dateKind === 'SIGNATURE')).toBe(false); // 2026 — out of range
    expect(result.items.some((i) => i.dateKind === 'EXPIRY')).toBe(false); // 2030 — out of range
  });

  it('echoes the exact requested from/to days in response metadata', async () => {
    const fx = fixture();
    const res = await getClientCalendar({ userId: ADMIN, role: 'ADMIN' }, CLIENT_A, { from: '2026-01-01', to: '2030-12-31' }, fakePrisma(fx));
    expect(res.from).toBe('2026-01-01');
    expect(res.to).toBe('2030-12-31'); // requested inclusive day, not +1
    const single = await getClientCalendar({ userId: ADMIN, role: 'ADMIN' }, CLIENT_A, { from: '2027-03-05', to: '2027-03-05' }, fakePrisma(fx));
    expect(single.from).toBe('2027-03-05');
    expect(single.to).toBe('2027-03-05');
  });

  it('sorts deterministically by date, then sourceType, then identity', async () => {
    const fx = fixture();
    const result = await getClientCalendar({ userId: ADMIN, role: 'ADMIN' }, CLIENT_A, FULL_RANGE, fakePrisma(fx));
    const dates = result.items.map((i) => i.date);
    expect([...dates].sort()).toEqual(dates);
    const order = ['CONTRACT', 'OBLIGATION', 'ENTITLEMENT', 'COMPANY_MILESTONE', 'CASE_DEADLINE', 'TASK', 'CASE_INTAKE_DEADLINE'];
    for (let i = 1; i < result.items.length; i += 1) {
      const [a, b] = [result.items[i - 1], result.items[i]];
      if (a.date === b.date) {
        const key = (x: typeof a) => `${order.indexOf(x.sourceType)}:${x.sourceId}:${x.dateKind}`;
        expect(key(a) <= key(b)).toBe(true);
      }
    }
  });
});
