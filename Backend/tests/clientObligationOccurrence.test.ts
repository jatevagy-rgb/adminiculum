/**
 * Contract Watch CW1 — ClientObligationOccurrence service unit tests.
 *
 * In-memory Prisma stand-in. Verifies the additive occurrence semantics WITHOUT
 * touching ClientObligation/ContractRecord behavior: N independently tracked
 * occurrences under one obligation, stable ordering, idempotent occurrenceKey,
 * same-client / same-contract invariants, and the explicit revision path.
 */
import { prisma as realPrisma } from '../src/prisma/prisma.service';
import {
  createObligationOccurrence,
  listObligationOccurrences,
  transitionObligationOccurrence,
  updateObligationOccurrence,
} from '../src/modules/client-contracts/service';

type Row = Record<string, any>;

const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const ADMIN = 'admin-1';
const LAWYER_A = 'lawyer-a';
const CONTRACT_A = 'contract-a';
const CONTRACT_B = 'contract-b';
const OBLIGATION_A = 'ob-a';
const OBLIGATION_NO_CONTRACT = 'ob-no-contract';
const OBLIGATION_B = 'ob-b';

function matches(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where || {})) {
    if (cond == null) continue;
    if (typeof cond === 'object' && 'in' in (cond as Row)) {
      if (!((cond as Row).in as unknown[]).includes(row[key])) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function fixture() {
  return {
    clients: [{ id: CLIENT_A, name: 'Client A' }, { id: CLIENT_B, name: 'Client B' }],
    users: [
      { id: ADMIN, role: 'ADMIN', status: 'ACTIVE', isActive: true },
      { id: LAWYER_A, role: 'LAWYER', status: 'ACTIVE', isActive: true },
    ],
    cases: [{ id: 'case-a1', clientId: CLIENT_A, createdById: LAWYER_A, assignedLawyerId: null }],
    collaborators: [] as Row[],
    contracts: [
      { id: CONTRACT_A, clientId: CLIENT_A },
      { id: CONTRACT_B, clientId: CLIENT_B },
    ],
    // Deliberately corrupt row: contract says client B while the obligation says
    // client A — used to prove the defensive same-client check.
    corruptContracts: [{ id: 'contract-b-for-a', clientId: CLIENT_B }],
    obligations: [
      { id: OBLIGATION_A, clientId: CLIENT_A, sourceContractId: CONTRACT_A },
      { id: OBLIGATION_NO_CONTRACT, clientId: CLIENT_A, sourceContractId: null },
      { id: OBLIGATION_B, clientId: CLIENT_B, sourceContractId: CONTRACT_B },
    ],
    documentVersions: [
      { id: 'doc-a', document: { clientId: CLIENT_A } },
      { id: 'doc-b', document: { clientId: CLIENT_B } },
    ],
    tasks: [
      { id: 'task-a', case: { clientId: CLIENT_A } },
      { id: 'task-b', case: { clientId: CLIENT_B } },
    ],
    occurrences: [] as Row[],
  };
}

type Fx = ReturnType<typeof fixture>;

function fakePrisma(fx: Fx) {
  const withCorrupt = [...fx.contracts, ...fx.corruptContracts];
  return {
    client: { findUnique: async ({ where }: any) => fx.clients.find((c) => c.id === where.id) ?? null },
    user: { findUnique: async ({ where }: any) => fx.users.find((u) => u.id === where.id) ?? null },
    case: {
      findMany: async ({ where }: any) => fx.cases.filter((c) => (where.OR || []).some((clause: Row) => clause.createdById === c.createdById || clause.assignedLawyerId === c.assignedLawyerId)),
      findFirst: async ({ where }: any) => fx.cases.find((c) => ((where.id?.in as string[]) || []).includes(c.id) && (!where.clientId || c.clientId === where.clientId)) ?? null,
    },
    caseCollaborator: { findMany: async () => fx.collaborators },
    contractRecord: { findUnique: async ({ where }: any) => withCorrupt.find((c) => c.id === where.id) ?? null },
    clientObligation: { findUnique: async ({ where }: any) => fx.obligations.find((o) => o.id === where.id) ?? null },
    documentVersion: { findUnique: async ({ where }: any) => fx.documentVersions.find((d) => d.id === where.id) ?? null },
    task: { findUnique: async ({ where }: any) => fx.tasks.find((t) => t.id === where.id) ?? null },
    clientObligationOccurrence: {
      findUnique: async ({ where }: any) => {
        if (where.id) return fx.occurrences.find((o) => o.id === where.id) ?? null;
        const key = where.obligationId_occurrenceKey;
        if (key) return fx.occurrences.find((o) => o.obligationId === key.obligationId && o.occurrenceKey === key.occurrenceKey) ?? null;
        return null;
      },
      // Applies the service's orderBy so the test proves the requested order.
      findMany: async ({ where, orderBy }: any) => {
        const rows = fx.occurrences.filter((o) => matches(o, where || {}));
        if (Array.isArray(orderBy)) {
          rows.sort((x, y) => {
            for (const clause of orderBy) {
              const [field, dir] = Object.entries(clause)[0] as [string, string];
              const av = x[field];
              const bv = y[field];
              if (av === bv) continue;
              if (av == null) return 1;
              if (bv == null) return -1;
              const cmp = av < bv ? -1 : 1;
              return dir === 'desc' ? -cmp : cmp;
            }
            return 0;
          });
        }
        return rows;
      },
      create: async ({ data }: any) => {
        const row: Row = {
          id: `occ-${fx.occurrences.length + 1}`,
          revision: 0,
          satisfiedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        fx.occurrences.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = fx.occurrences.find((o) => o.id === where.id);
        if (!row) throw new Error('occurrence not found');
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'increment' in (value as Row)) {
            row[key] = (row[key] ?? 0) + (value as Row).increment;
          } else {
            row[key] = value;
          }
        }
        return row;
      },
    },
  } as unknown as typeof realPrisma;
}

const admin = { userId: ADMIN, role: 'ADMIN' };
const manager = { userId: ADMIN, role: 'PARTNER' };

function occurrencePayload(over: Row = {}): Row {
  return { occurrenceType: 'PAYMENT', title: 'Részletfizetés', ...over };
}

describe('ClientObligationOccurrence — multiple independently tracked occurrences', () => {
  it('tracks N occurrences under ONE obligation with separate state', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    const schedule = [
      { occurrenceKey: 'advance-1', occurrenceType: 'ADVANCE', sequence: 1, dueDate: '2026-10-01', expectedAmount: '1000000', currency: 'huf' },
      { occurrenceKey: 'milestone-1', occurrenceType: 'MILESTONE', sequence: 2, dueDate: '2026-11-15' },
      { occurrenceKey: 'payment-1', occurrenceType: 'PAYMENT', sequence: 3, dueDate: '2026-12-15' },
      { occurrenceKey: 'milestone-2', occurrenceType: 'MILESTONE', sequence: 4, dueDate: '2027-02-20' },
      { occurrenceKey: 'final-invoice', occurrenceType: 'INVOICE', sequence: 5, dueDate: null },
    ];
    for (const entry of schedule) {
      const result = await createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ title: entry.occurrenceKey, ...entry }), db);
      expect(result.replayed).toBe(false);
    }
    const listed = await listObligationOccurrences(admin, OBLIGATION_A, {}, db);
    expect(listed.items).toHaveLength(5);
    expect(listed.items.map((i: any) => i.occurrenceKey)).toEqual(['advance-1', 'milestone-1', 'payment-1', 'milestone-2', 'final-invoice']);
    // Occurrence #1 carries the normalized amount + currency; independent state.
    expect(listed.items[0].expectedAmount).toBe('1000000');
    expect(listed.items[0].currency).toBe('HUF');
    expect(listed.items[4].dueDate).toBeNull(); // nullable dueDate is stored, not invented

    const satisfied = await transitionObligationOccurrence(manager, listed.items[0].id, 'SATISFIED', db);
    expect(satisfied.status).toBe('SATISFIED');
    expect(satisfied.satisfiedAt).toBeTruthy();
    // Other occurrences keep their own state.
    const after = await listObligationOccurrences(admin, OBLIGATION_A, {}, db);
    expect(after.items.filter((i: any) => i.status === 'SATISFIED')).toHaveLength(1);
    expect(after.items.filter((i: any) => i.status === 'OPEN')).toHaveLength(4);
  });

  it('orders deterministically by sequence, then dueDate, then key', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    // Insert deliberately out of order.
    await createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'c', sequence: 2, dueDate: '2027-01-01' }), db);
    await createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'a', sequence: 1, dueDate: '2027-03-01' }), db);
    await createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'b', sequence: 1, dueDate: '2027-02-01' }), db);
    const listed = await listObligationOccurrences(admin, OBLIGATION_A, {}, db);
    expect(listed.items.map((i: any) => i.occurrenceKey)).toEqual(['b', 'a', 'c']);
  });

  it('replaying the same occurrenceKey + dueDate is idempotent', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    const payload = occurrencePayload({ occurrenceKey: 'payment-1', dueDate: '2026-12-15' });
    const first = await createObligationOccurrence(manager, OBLIGATION_A, payload, db);
    const second = await createObligationOccurrence(manager, OBLIGATION_A, payload, db);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.occurrence.id).toBe(first.occurrence.id);
    const listed = await listObligationOccurrences(admin, OBLIGATION_A, {}, db);
    expect(listed.items).toHaveLength(1);
  });

  it('refuses to silently rewrite an existing occurrence dueDate (explicit update path only)', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    await createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'payment-1', dueDate: '2026-12-15' }), db);
    await expect(
      createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'payment-1', dueDate: '2027-01-15' }), db),
    ).rejects.toMatchObject({ status: 409, code: 'OCCURRENCE_KEY_CONFLICT' });
    // The stored date is untouched.
    const listed = await listObligationOccurrences(admin, OBLIGATION_A, {}, db);
    expect(listed.items[0].dueDate).toBe('2026-12-15T00:00:00.000Z');

    const updated = await updateObligationOccurrence(manager, listed.items[0].id, { dueDate: '2027-01-15' }, db);
    expect(updated.dueDate).toBe('2027-01-15T00:00:00.000Z');
    expect(updated.revision).toBe(1);
  });
});

describe('ClientObligationOccurrence — client / contract invariants', () => {
  it('requires the parent obligation to belong to a contract', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    await expect(createObligationOccurrence(manager, OBLIGATION_NO_CONTRACT, occurrencePayload({ occurrenceKey: 'x', dueDate: '2026-10-01' }), db))
      .rejects.toMatchObject({ status: 400, code: 'OCCURRENCE_OBLIGATION_CONTRACT_REQUIRED' });
  });

  it('rejects a contractId that does not match the parent obligation contract', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    await expect(createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'x', dueDate: '2026-10-01', contractId: CONTRACT_B }), db))
      .rejects.toMatchObject({ status: 400, code: 'OCCURRENCE_CONTRACT_MISMATCH' });
  });

  it('rejects a contract whose client differs from the obligation client', async () => {
    const fx = fixture();
    fx.obligations.push({ id: 'ob-corrupt', clientId: CLIENT_A, sourceContractId: 'contract-b-for-a' });
    const db = fakePrisma(fx);
    await expect(createObligationOccurrence(manager, 'ob-corrupt', occurrencePayload({ occurrenceKey: 'x', dueDate: '2026-10-01' }), db))
      .rejects.toMatchObject({ status: 403, code: 'CROSS_CLIENT_CONTRACT' });
  });

  it('rejects cross-client evidence documents and tasks', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    await expect(createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'e', dueDate: '2026-10-01', evidenceDocumentVersionId: 'doc-b' }), db))
      .rejects.toMatchObject({ status: 403, code: 'CROSS_CLIENT_DOCUMENT_VERSION' });
    await expect(createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 't', dueDate: '2026-10-01', relatedTaskId: 'task-b' }), db))
      .rejects.toMatchObject({ status: 403, code: 'CROSS_CLIENT_TASK' });
    expect(fx.occurrences).toHaveLength(0);
  });

  it('denies reading another client\'s obligation occurrences', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    await expect(listObligationOccurrences({ userId: LAWYER_A, role: 'LAWYER' }, OBLIGATION_B, {}, db))
      .rejects.toMatchObject({ status: 403 });
  });

  it('rejects unknown occurrence types and missing keys', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    await expect(createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'x', occurrenceType: 'MADE_UP' }), db))
      .rejects.toMatchObject({ status: 400, code: 'OCCURRENCE_TYPE_UNKNOWN' });
    await expect(createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ title: 'No key' }), db))
      .rejects.toMatchObject({ status: 400, code: 'FIELD_REQUIRED' });
  });

  it('keeps occurrenceKey immutable and only managers may mutate', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    const created = await createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'payment-1', dueDate: '2026-12-15', relatedTaskId: 'task-a', evidenceDocumentVersionId: 'doc-a' }), db);
    expect(created.occurrence.relatedTaskId).toBe('task-a');
    expect(created.occurrence.evidenceDocumentVersionId).toBe('doc-a');
    await expect(updateObligationOccurrence(manager, created.occurrence.id, { occurrenceKey: 'other' }, db))
      .rejects.toMatchObject({ status: 400, code: 'OCCURRENCE_KEY_IMMUTABLE' });
    await expect(createObligationOccurrence({ userId: LAWYER_A, role: 'LAWYER' }, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'y' }), db))
      .rejects.toMatchObject({ status: 403, code: 'CONTRACT_MANAGE_FORBIDDEN' });
  });

  it('rejects invalid status transitions', async () => {
    const fx = fixture();
    const db = fakePrisma(fx);
    const created = await createObligationOccurrence(manager, OBLIGATION_A, occurrencePayload({ occurrenceKey: 'p1', dueDate: '2026-12-15' }), db);
    await transitionObligationOccurrence(manager, created.occurrence.id, 'SATISFIED', db);
    await expect(transitionObligationOccurrence(manager, created.occurrence.id, 'WAIVED', db))
      .rejects.toMatchObject({ status: 409, code: 'INVALID_STATUS_TRANSITION' });
  });
});
