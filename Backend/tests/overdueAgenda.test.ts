import { getWorkflowAgenda, makeDefaultAgendaRange } from '../src/modules/agenda/service';
import { businessDayStart, businessDateKey } from '../src/modules/agenda/businessTime';

const now = new Date('2026-07-15T10:00:00Z');
const fixture = [
  { id: 'months-old', status: 'IN_PROGRESS', dueDate: new Date('2026-01-01T00:00:00Z') },
  { id: 'weeks-old', status: 'TODO', dueDate: new Date('2026-06-01T00:00:00Z') },
  { id: 'closed', status: 'COMPLETED', dueDate: new Date('2026-01-01T00:00:00Z') },
  { id: 'future', status: 'TODO', dueDate: new Date('2026-07-16T00:00:00Z') },
].map((row) => ({ ...row, title: row.id, priority: 'MEDIUM', caseId: 'case', assignedToId: 'worker', case: { id: 'case' } }));

function db() {
  return {
    task: { findMany: jest.fn(async ({ where, take }) => fixture.filter((row) =>
      (!where.dueDate.lt || row.dueDate < where.dueDate.lt) &&
      (!where.dueDate.gte || row.dueDate >= where.dueDate.gte) &&
      (!where.dueDate.lte || row.dueDate <= where.dueDate.lte) &&
      !where.status?.notIn?.includes(row.status),
    ).slice(0, take)) },
    case: { findMany: jest.fn(async (_query: any) => []) },
    caseIntakeDeadline: { findMany: jest.fn(async (_query: any) => []) },
  };
}

test('overdue queue includes months-old open work while the default calendar remains bounded', async () => {
  const database = db();
  const args = { userId: 'worker', userRole: 'LAWYER', now, db: database as any };
  const overdue = await getWorkflowAgenda({ ...args, queue: 'OVERDUE' });
  expect(overdue.days.flatMap((day) => day.items).map((item) => item.id)).toEqual(['TASK:months-old', 'TASK:weeks-old']);
  const calendar = await getWorkflowAgenda(args);
  expect(calendar.days.flatMap((day) => day.items).map((item) => item.id)).toEqual(['TASK:future']);
  const [oldQuery, calendarQuery] = database.task.findMany.mock.calls.map(([query]) => query);
  expect(oldQuery.where).toMatchObject({ dueDate: { lt: now }, assignedToId: 'worker' });
  expect(oldQuery.where.case).toEqual(calendarQuery.where.case);
  expect(oldQuery.take).toBe(101);
  expect(calendarQuery.where.dueDate).toHaveProperty('gte');
  expect(calendarQuery.where.dueDate).toHaveProperty('lte');
  for (const model of [database.case, database.caseIntakeDeadline]) {
    expect(model.findMany.mock.calls[0][0]).toMatchObject({ take: 101 });
  }
});

test('overdue pagination preserves source identity and excludes closed queues', async () => {
  const args = { userId: 'worker', userRole: 'LAWYER', now, queue: 'OVERDUE', db: db() as any, limit: 1 };
  const first = await getWorkflowAgenda(args);
  const second = await getWorkflowAgenda({ ...args, offset: 1 });
  expect(first.days[0].items[0].id).toBe('TASK:months-old');
  expect(first.pagination.hasMore).toBe(true);
  expect(second.days[0].items[0].id).toBe('TASK:weeks-old');
  expect(second.pagination.hasMore).toBe(false);
  await expect(getWorkflowAgenda({ ...args, status: 'COMPLETED' })).rejects.toMatchObject({ code: 'OVERDUE_REQUIRES_OPEN' });
});

test('business days follow Budapest through both DST changes independent of server time', () => {
  expect(businessDayStart('2026-03-30').getTime() - businessDayStart('2026-03-29').getTime()).toBe(23 * 3600000);
  expect(businessDayStart('2026-10-26').getTime() - businessDayStart('2026-10-25').getTime()).toBe(25 * 3600000);
  const range = makeDefaultAgendaRange(new Date('2026-07-15T23:30:00Z'));
  expect(range.from.toISOString()).toBe('2026-07-15T22:00:00.000Z');
  expect(businessDateKey(range.from)).toBe('2026-07-16');
});
