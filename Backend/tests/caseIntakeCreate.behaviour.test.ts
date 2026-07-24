/**
 * Behavioural tests for transactional matter intake (CASE-INTAKE-REDESIGN-1).
 * Exercises the real service against a mocked Prisma client: validation bounds,
 * deadline resolution, cross-client/duplicate protection and rollback.
 */
const prismaMock: any = {
  client: { findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  communication: { findMany: jest.fn(), update: jest.fn() },
  case: { create: jest.fn(), count: jest.fn() },
  caseCollaborator: { create: jest.fn() },
  caseExternalParticipant: { create: jest.fn() },
  caseIntakeDeadline: { create: jest.fn() },
  task: { create: jest.fn() },
  timelineEvent: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

import { createCaseIntake, resolveDeadlineDueAt, CaseIntakeError } from '../src/modules/cases/intakeCreate.service';

const ACTOR = 'user-1';
const CLIENT = { id: 'client-1', name: 'Teszt Kft.' };
const MINIMAL = { clientId: CLIENT.id, title: 'Teszt ügy', matterType: 'CONTRACT_REVIEW' };

function caseRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'case-1', caseNumber: 'CASE-2026-001', title: 'Teszt ügy', status: 'DRAFT', priority: 'MEDIUM',
    matterType: 'CONTRACT_REVIEW', clientRole: null, createdAt: new Date('2026-07-24'),
    intakeOriginReason: null, intakeCurrentSituation: null, intakeClientExpectation: null,
    intakeUrgentAction: null, intakeNextStep: null,
    client: CLIENT, assignedLawyer: null, ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.client.findUnique.mockResolvedValue(CLIENT);
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.communication.findMany.mockResolvedValue([]);
  prismaMock.case.count.mockResolvedValue(0);
  prismaMock.case.create.mockResolvedValue(caseRow());
  prismaMock.timelineEvent.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
});

describe('quick create (minimum fields)', () => {
  it('creates a matter from the minimum payload', async () => {
    const result = await createCaseIntake(ACTOR, MINIMAL);
    expect(result.case.id).toBe('case-1');
    expect(result.case.caseNumber).toBe('CASE-2026-001');
    expect(result.participants).toEqual([]);
    expect(result.deadlines).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(prismaMock.case.create).toHaveBeenCalledTimes(1);
  });

  it('requires a client and a title', async () => {
    await expect(createCaseIntake(ACTOR, { title: 'x' })).rejects.toMatchObject({ code: 'FIELD_REQUIRED' });
    await expect(createCaseIntake(ACTOR, { clientId: CLIENT.id })).rejects.toMatchObject({ code: 'FIELD_REQUIRED' });
  });

  it('rejects an unauthenticated actor', async () => {
    await expect(createCaseIntake('', MINIMAL)).rejects.toMatchObject({ status: 401 });
  });

  it('404s for an unknown client', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    await expect(createCaseIntake(ACTOR, MINIMAL)).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND', status: 404 });
    expect(prismaMock.case.create).not.toHaveBeenCalled();
  });

  it('returns a safe DTO without raw Prisma relations', async () => {
    const result = await createCaseIntake(ACTOR, MINIMAL);
    expect(Object.keys(result).sort()).toEqual(
      ['case', 'communicationLinks', 'deadlines', 'externalParticipants', 'participants', 'tasks']
    );
    expect(result.case).not.toHaveProperty('createdById');
    expect(result.case).not.toHaveProperty('_count');
  });
});

describe('starting context is stored as discrete fields', () => {
  it('maps each answer to its own column, not one blob', async () => {
    await createCaseIntake(ACTOR, {
      ...MINIMAL,
      startingContext: {
        originReason: 'Ügyfél megkeresés', currentSituation: 'Peren kívüli',
        clientExpectation: 'Egyezség', urgentAction: 'Nincs', nextStep: 'Iratok bekérése',
      },
    });
    const data = prismaMock.case.create.mock.calls[0][0].data;
    expect(data.intakeOriginReason).toBe('Ügyfél megkeresés');
    expect(data.intakeCurrentSituation).toBe('Peren kívüli');
    expect(data.intakeClientExpectation).toBe('Egyezség');
    expect(data.intakeUrgentAction).toBe('Nincs');
    expect(data.intakeNextStep).toBe('Iratok bekérése');
  });
});

describe('deadline resolution', () => {
  const now = new Date('2026-07-24T10:00:00.000Z');

  it('keeps an absolute deadline as given', () => {
    const r = resolveDeadlineDueAt({ inputMode: 'ABSOLUTE', dueAt: '2026-08-01T09:30:00.000Z' }, now);
    expect(r.dueAt.toISOString()).toBe('2026-08-01T09:30:00.000Z');
    expect(r.inputMode).toBe('ABSOLUTE');
    expect(r.relativeValue).toBeNull();
  });

  it.each([
    ['MINUTE', 30, '2026-07-24T10:30:00.000Z'],
    ['HOUR', 5, '2026-07-24T15:00:00.000Z'],
    ['DAY', 3, '2026-07-27T10:00:00.000Z'],
    ['WEEK', 2, '2026-08-07T10:00:00.000Z'],
  ])('computes a relative deadline in %s correctly', (unit, value, expected) => {
    const r = resolveDeadlineDueAt({ inputMode: 'RELATIVE', relativeUnit: unit, relativeValue: value }, now);
    expect(r.dueAt.toISOString()).toBe(expected);
    expect(r.inputMode).toBe('RELATIVE');
    expect(r.relativeValue).toBe(value);
    expect(r.relativeUnit).toBe(unit);
  });

  it.each([0, -5, 1.5, 5000])('rejects invalid relative value %s', (v) => {
    expect(() => resolveDeadlineDueAt({ inputMode: 'RELATIVE', relativeUnit: 'DAY', relativeValue: v }, now))
      .toThrow(CaseIntakeError);
  });

  it('rejects an unsupported relative unit and an invalid absolute date', () => {
    expect(() => resolveDeadlineDueAt({ inputMode: 'RELATIVE', relativeUnit: 'FORTNIGHT', relativeValue: 1 }, now)).toThrow();
    expect(() => resolveDeadlineDueAt({ inputMode: 'ABSOLUTE', dueAt: 'not-a-date' }, now)).toThrow();
  });

  it('persists a typed deadline with its reminder', async () => {
    prismaMock.caseIntakeDeadline.create.mockResolvedValue({
      id: 'dl-1', title: 'Fellebbezés', deadlineType: 'STATUTORY', dueAt: new Date('2026-08-01'),
      inputMode: 'ABSOLUTE', relativeValue: null, relativeUnit: null, reminderMinutesBefore: 1440, responsibleId: null,
    });
    const result = await createCaseIntake(ACTOR, {
      ...MINIMAL,
      deadlines: [{ title: 'Fellebbezés', deadlineType: 'STATUTORY', inputMode: 'ABSOLUTE', dueAt: '2026-08-01T00:00:00.000Z', reminderMinutesBefore: 1440 }],
    });
    expect(result.deadlines[0]).toMatchObject({ deadlineType: 'STATUTORY', reminderMinutesBefore: 1440 });
  });

  it('rejects an unsupported deadline type and an out-of-range reminder', async () => {
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, deadlines: [{ title: 'x', deadlineType: 'MADE_UP', dueAt: '2026-08-01' }] }))
      .rejects.toMatchObject({ code: 'INVALID_DEADLINE_TYPE' });
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, deadlines: [{ title: 'x', deadlineType: 'OTHER', dueAt: '2026-08-01', reminderMinutesBefore: 999999 }] }))
      .rejects.toMatchObject({ code: 'INVALID_REMINDER' });
  });
});

describe('participants', () => {
  it('persists the role, not just a name', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u2' }]);
    prismaMock.caseCollaborator.create.mockResolvedValue({ id: 'cc-1', userId: 'u2', role: 'REVIEWER' });
    const result = await createCaseIntake(ACTOR, { ...MINIMAL, participants: [{ userId: 'u2', role: 'reviewer' }] });
    expect(result.participants[0]).toEqual({ id: 'cc-1', userId: 'u2', role: 'REVIEWER' });
  });

  it('requires a role for an external participant', async () => {
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, externalParticipants: [{ name: 'Ellenfél Kft.' }] }))
      .rejects.toMatchObject({ code: 'FIELD_REQUIRED' });
  });

  it('persists an external participant with role and side', async () => {
    prismaMock.caseExternalParticipant.create.mockResolvedValue({ id: 'ex-1', name: 'Ellenfél Kft.', role: 'OPPOSING_PARTY', side: 'OPPOSING' });
    const result = await createCaseIntake(ACTOR, {
      ...MINIMAL, externalParticipants: [{ name: 'Ellenfél Kft.', role: 'OPPOSING_PARTY', side: 'OPPOSING' }],
    });
    expect(result.externalParticipants[0]).toMatchObject({ role: 'OPPOSING_PARTY', side: 'OPPOSING' });
  });

  it('rejects a referenced user that does not exist', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, participants: [{ userId: 'ghost', role: 'X' }] }))
      .rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    expect(prismaMock.case.create).not.toHaveBeenCalled();
  });
});

describe('communication thread linking', () => {
  const thread = { id: 'c1', subject: 'Szerződés', caseId: null, clientId: CLIENT.id };

  it('links selected threads and marks exactly one primary', async () => {
    prismaMock.communication.findMany.mockResolvedValue([thread, { ...thread, id: 'c2' }]);
    prismaMock.communication.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id, subject: 'Szerződés', isPrimaryForCase: data.isPrimaryForCase,
    }));
    const result = await createCaseIntake(ACTOR, {
      ...MINIMAL, communicationThreadIds: ['c1', 'c2'], primaryCommunicationThreadId: 'c2',
    });
    expect(result.communicationLinks).toHaveLength(2);
    expect(result.communicationLinks.filter((l) => l.isPrimary)).toHaveLength(1);
    expect(result.communicationLinks.find((l) => l.id === 'c2')!.isPrimary).toBe(true);
  });

  it('does not create a duplicate link when the same thread is sent twice', async () => {
    prismaMock.communication.findMany.mockResolvedValue([thread]);
    prismaMock.communication.update.mockResolvedValue({ id: 'c1', subject: 'Szerződés', isPrimaryForCase: false });
    const result = await createCaseIntake(ACTOR, { ...MINIMAL, communicationThreadIds: ['c1', 'c1', 'c1'] });
    expect(prismaMock.communication.update).toHaveBeenCalledTimes(1);
    expect(result.communicationLinks).toHaveLength(1);
  });

  it('refuses a thread already linked to another case', async () => {
    prismaMock.communication.findMany.mockResolvedValue([{ ...thread, caseId: 'other-case' }]);
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, communicationThreadIds: ['c1'] }))
      .rejects.toMatchObject({ code: 'COMMUNICATION_ALREADY_LINKED', status: 409 });
  });

  it('refuses a thread belonging to a different client', async () => {
    prismaMock.communication.findMany.mockResolvedValue([{ ...thread, clientId: 'other-client' }]);
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, communicationThreadIds: ['c1'] }))
      .rejects.toMatchObject({ code: 'COMMUNICATION_CLIENT_MISMATCH', status: 403 });
  });

  it('404s when a selected thread does not exist', async () => {
    prismaMock.communication.findMany.mockResolvedValue([]);
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, communicationThreadIds: ['ghost'] }))
      .rejects.toMatchObject({ code: 'COMMUNICATION_NOT_FOUND', status: 404 });
  });

  it('refuses a primary thread that was not among the selected threads', async () => {
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, communicationThreadIds: ['c1'], primaryCommunicationThreadId: 'c9' }))
      .rejects.toMatchObject({ code: 'PRIMARY_THREAD_NOT_SELECTED' });
  });

  it('supports the explicit "later" choice (no threads)', async () => {
    const result = await createCaseIntake(ACTOR, { ...MINIMAL, communicationThreadIds: [] });
    expect(result.communicationLinks).toEqual([]);
    expect(prismaMock.communication.update).not.toHaveBeenCalled();
  });
});

describe('initial tasks', () => {
  it('creates editable tasks from the payload', async () => {
    prismaMock.task.create.mockResolvedValue({
      id: 't1', title: 'Iratok bekérése', status: 'TODO', priority: 'HIGH', dueDate: null, assignedToId: null,
    });
    const result = await createCaseIntake(ACTOR, {
      ...MINIMAL, initialTasks: [{ title: 'Iratok bekérése', priority: 'HIGH' }],
    });
    expect(result.tasks[0]).toMatchObject({ title: 'Iratok bekérése', priority: 'HIGH', status: 'TODO' });
    expect(prismaMock.task.create.mock.calls[0][0].data.caseId).toBe('case-1');
  });

  it('rejects an unsupported task priority', async () => {
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, initialTasks: [{ title: 'x', priority: 'SUPER' }] }))
      .rejects.toMatchObject({ code: 'INVALID_TASK_PRIORITY' });
  });
});

describe('atomicity and bounds', () => {
  it('creates nothing when a nested write fails', async () => {
    prismaMock.task.create.mockRejectedValue(new Error('nested failure'));
    // A real transaction rolls back; the contract is that the error propagates
    // and the caller never receives a partially created matter.
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, initialTasks: [{ title: 'x' }] })).rejects.toThrow();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('runs every nested write inside a single transaction', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u2' }]);
    prismaMock.caseCollaborator.create.mockResolvedValue({ id: 'cc', userId: 'u2', role: 'X' });
    prismaMock.task.create.mockResolvedValue({ id: 't', title: 'x', status: 'TODO', priority: 'MEDIUM', dueDate: null, assignedToId: null });
    await createCaseIntake(ACTOR, { ...MINIMAL, participants: [{ userId: 'u2', role: 'X' }], initialTasks: [{ title: 'x' }] });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('enforces scalar bounds and collection caps', async () => {
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, title: 'x'.repeat(500) })).rejects.toMatchObject({ code: 'FIELD_TOO_LONG' });
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, initialTasks: Array.from({ length: 40 }, () => ({ title: 'x' })) }))
      .rejects.toMatchObject({ code: 'TOO_MANY_ITEMS' });
    await expect(createCaseIntake(ACTOR, { ...MINIMAL, participants: 'not-an-array' as never }))
      .rejects.toMatchObject({ code: 'INVALID_FIELD' });
  });

  it('writes audit metadata without any captured free text', async () => {
    await createCaseIntake(ACTOR, {
      ...MINIMAL,
      startingContext: { originReason: 'SENSITIVE_INTAKE_TEXT' },
    });
    const payload = JSON.stringify(prismaMock.timelineEvent.create.mock.calls[0][0].data);
    expect(payload).not.toContain('SENSITIVE_INTAKE_TEXT');
    expect(payload).toContain('case_intake_v1');
  });
});
