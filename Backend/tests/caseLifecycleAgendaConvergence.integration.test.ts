import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { PrismaClient } from '@prisma/client';

/**
 * Case lifecycle -> deadline -> Agenda convergence (PostgreSQL).
 *
 * Proves the single canonical agenda projection answers "what is due, in which
 * case, who owns it" from Case.deadline + Task.dueDate + intake deadlines, with
 * classification, completion removal, client isolation, a single-Case endpoint,
 * one authoritative source shared with the dashboard, and stable timezone semantics.
 */
const databaseUrl = process.env.AGENDA_CONVERGENCE_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const userId = req.headers['x-test-user-id'];
    if (typeof userId !== 'string') { res.status(401).json({ code: 'NOT_AUTHENTICATED' }); return; }
    (req as any).user = { userId, role: String(req.headers['x-test-role'] || 'LAWYER'), authProvider: 'local-jwt' };
    next();
  },
}));

import agendaRoutes from '../src/modules/agenda/routes';
import { getWorkflowAgenda, getCaseDeadlines, AgendaRequestError } from '../src/modules/agenda/service';
import { getCaseAttentionSummary } from '../src/modules/cases/attention.service';

const P = 'ac-';
const ids = {
  lawyerA: `${P}lawyer-a-000000000000000000000001`,
  assignee: `${P}assignee-00000000000000000000001`,
  lawyerB: `${P}lawyer-b-000000000000000000000001`,
  clientA: `${P}client-a-000000000000000000000001`,
  clientB: `${P}client-b-000000000000000000000001`,
  caseA: `${P}case-a-00000000000000000000000001`,
  caseB: `${P}case-b-00000000000000000000000001`,
  wp: `${P}wp-0000000000000000000000000001`,
  wpItem: `${P}wpi-000000000000000000000000001`,
  taskToday: `${P}task-today-0000000000000000000001`,
  taskOverdue: `${P}task-overdue-00000000000000000001`,
  taskUpcoming: `${P}task-upcoming-0000000000000000001`,
  taskCompleted: `${P}task-completed-000000000000000001`,
  taskCancelled: `${P}task-cancelled-000000000000000001`,
  intakeA: `${P}intake-a-000000000000000000000001`,
  taskB: `${P}task-b-00000000000000000000000001`,
};

const NOW = new Date('2026-07-15T09:00:00.000Z');
const caseADeadline = new Date('2026-07-15T14:00:00.000Z');
const RANGE = { from: '2026-07-01', to: '2026-08-10' };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/agenda', agendaRoutes);
  return app;
}
function get(path: string, headers: Record<string, string>): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = createApp().listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') return reject(new Error('no addr'));
      http.request({ hostname: '127.0.0.1', port: addr.port, path, method: 'GET', headers }, (r) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(Buffer.from(c)));
        r.on('end', () => { server.close(); const t = Buffer.concat(chunks).toString('utf8'); resolve({ status: r.statusCode || 0, body: t ? JSON.parse(t) : null }); });
      }).on('error', (e) => { server.close(); reject(e); }).end();
    });
  });
}

describeWithDatabase('Case lifecycle -> deadline -> Agenda convergence (PostgreSQL)', () => {
  let db: PrismaClient;

  const agenda = (over: Record<string, unknown> = {}) => getWorkflowAgenda({ userId: ids.lawyerA, userRole: 'LAWYER', now: NOW, ...RANGE, db, ...over });
  const itemsOf = (a: any) => a.days.flatMap((d: any) => d.items);

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: ids.lawyerA, email: `${P}a@x.invalid`, name: 'Lawyer A', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.assignee, email: `${P}as@x.invalid`, name: 'Assignee', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.lawyerB, email: `${P}b@x.invalid`, name: 'Lawyer B', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] });
    await db.client.createMany({ data: [{ id: ids.clientA, name: 'Client A' }, { id: ids.clientB, name: 'Client B' }] });
    await db.case.createMany({ data: [
      { id: ids.caseA, caseNumber: 'AC-A-001', title: 'Case A', caseType: 'CONTRACT_REVIEW', clientId: ids.clientA, clientName: 'Client A', createdById: ids.lawyerA, assignedLawyerId: ids.lawyerA, deadline: caseADeadline, status: 'DRAFT', priority: 'MEDIUM', updatedAt: NOW },
      { id: ids.caseB, caseNumber: 'AC-B-001', title: 'Case B', caseType: 'CONTRACT_REVIEW', clientId: ids.clientB, clientName: 'Client B', createdById: ids.lawyerB, assignedLawyerId: ids.lawyerB, deadline: new Date('2026-07-16T10:00:00.000Z'), status: 'DRAFT', priority: 'MEDIUM', updatedAt: NOW },
    ] });
    await db.caseWorkPackage.create({ data: { id: ids.wp, caseId: ids.caseA, createdById: ids.lawyerA } });
    await db.caseWorkPackageItem.create({ data: { id: ids.wpItem, caseWorkPackageId: ids.wp, moduleType: 'TASK_GROUP', moduleKey: 'ac', label: 'AC', order: 1, createdById: ids.lawyerA } });
    await db.task.createMany({ data: [
      { id: ids.taskToday, title: 'Today task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'HIGH', requiredSkills: [], caseId: ids.caseA, assignedToId: ids.assignee, assignedById: ids.lawyerA, dueDate: new Date('2026-07-15T16:00:00.000Z') },
      { id: ids.taskOverdue, title: 'Overdue task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'URGENT', requiredSkills: [], caseId: ids.caseA, assignedToId: ids.lawyerA, assignedById: ids.lawyerA, dueDate: new Date('2026-07-10T10:00:00.000Z') },
      { id: ids.taskUpcoming, title: 'Upcoming WP task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'MEDIUM', requiredSkills: [], caseId: ids.caseA, assignedToId: ids.lawyerA, assignedById: ids.lawyerA, dueDate: new Date('2026-07-25T10:00:00.000Z'), workPackageItemId: ids.wpItem },
      { id: ids.taskCompleted, title: 'Completed task', taskType: 'OTHER', status: 'COMPLETED', priority: 'MEDIUM', requiredSkills: [], caseId: ids.caseA, assignedToId: ids.lawyerA, assignedById: ids.lawyerA, dueDate: new Date('2026-07-15T11:00:00.000Z') },
      { id: ids.taskCancelled, title: 'Cancelled task', taskType: 'OTHER', status: 'CANCELLED', priority: 'MEDIUM', requiredSkills: [], caseId: ids.caseA, assignedToId: ids.lawyerA, assignedById: ids.lawyerA, dueDate: new Date('2026-07-15T12:00:00.000Z') },
      { id: ids.taskB, title: 'Other client task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'MEDIUM', requiredSkills: [], caseId: ids.caseB, assignedToId: ids.lawyerB, assignedById: ids.lawyerB, dueDate: new Date('2026-07-15T10:00:00.000Z') },
    ] });
    await db.caseIntakeDeadline.create({ data: { id: ids.intakeA, caseId: ids.caseA, title: 'Statutory deadline', deadlineType: 'STATUTORY', dueAt: caseADeadline, responsibleId: ids.lawyerA, createdById: ids.lawyerA, updatedAt: NOW } });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.caseIntakeDeadline.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.task.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.caseWorkPackageItem.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.caseWorkPackage.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.case.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});
    await db.$disconnect();
  });

  it('1-2-6: Case deadline, Task deadline, and Work-Package task all project as canonical agenda items', async () => {
    const items = itemsOf(await agenda({ scope: 'CASE', caseId: ids.caseA, status: 'ALL' }));
    const idset = items.map((i: any) => i.id);
    expect(idset).toContain(`CASE_DEADLINE:${ids.caseA}`);
    expect(idset).toContain(`TASK:${ids.taskToday}`);
    expect(idset).toContain(`TASK:${ids.taskUpcoming}`); // work-package-linked task behaves like any Task
  });

  it('3-4-5: item carries Case/Client context, responsible lawyer, and distinct assignee', async () => {
    const items = itemsOf(await agenda({ scope: 'CASE', caseId: ids.caseA, status: 'ALL' }));
    const today = items.find((i: any) => i.id === `TASK:${ids.taskToday}`);
    expect(today.source.displayName).toBe('AC-A-001');
    expect(today.safeDescription).toContain('Client A');
    expect(today.responsibility.responsibleLawyer.id).toBe(ids.lawyerA);
    expect(today.responsibility.assignee.id).toBe(ids.assignee); // assignee != responsible
  });

  it('8-9: completed and cancelled tasks are removed from the active agenda', async () => {
    const idset = itemsOf(await agenda({ scope: 'CASE', caseId: ids.caseA, status: 'OPEN' })).map((i: any) => i.id);
    expect(idset).not.toContain(`TASK:${ids.taskCompleted}`);
    expect(idset).not.toContain(`TASK:${ids.taskCancelled}`);
    expect(idset).toContain(`TASK:${ids.taskToday}`);
  });

  it('10-11-12: overdue / today / upcoming classification is correct', async () => {
    const items = itemsOf(await agenda({ scope: 'CASE', caseId: ids.caseA, status: 'OPEN' }));
    const byId = (id: string) => items.find((i: any) => i.id === id);
    expect(byId(`TASK:${ids.taskOverdue}`).urgency).toBe('OVERDUE');
    expect(byId(`TASK:${ids.taskToday}`).urgency).toBe('TODAY');
    expect(['THIS_WEEK', 'LATER']).toContain(byId(`TASK:${ids.taskUpcoming}`).urgency);
  });

  it('13-14-19-20: deadline changes project exactly once with stable UTC semantics', async () => {
    const before = itemsOf(await agenda({ scope: 'CASE', caseId: ids.caseA, status: 'ALL' }));
    expect(before.filter((i: any) => i.id === `CASE_DEADLINE:${ids.caseA}`)).toHaveLength(1);
    expect(before.find((i: any) => i.id === `CASE_DEADLINE:${ids.caseA}`).dueAt).toBe(caseADeadline.toISOString());

    const newDeadline = new Date('2026-07-18T14:00:00.000Z');
    await db.case.update({ where: { id: ids.caseA }, data: { deadline: newDeadline } });
    const newDue = new Date('2026-07-19T08:30:00.000Z');
    await db.task.update({ where: { id: ids.taskToday }, data: { dueDate: newDue } });

    const after = itemsOf(await agenda({ scope: 'CASE', caseId: ids.caseA, status: 'ALL' }));
    const caseRows = after.filter((i: any) => i.id === `CASE_DEADLINE:${ids.caseA}`);
    const taskRows = after.filter((i: any) => i.id === `TASK:${ids.taskToday}`);
    expect(caseRows).toHaveLength(1);
    expect(taskRows).toHaveLength(1);
    expect(caseRows[0].dueAt).toBe(newDeadline.toISOString());
    expect(taskRows[0].dueAt).toBe(newDue.toISOString());

    // restore
    await db.case.update({ where: { id: ids.caseA }, data: { deadline: caseADeadline } });
    await db.task.update({ where: { id: ids.taskToday }, data: { dueDate: new Date('2026-07-15T16:00:00.000Z') } });
  });

  it('15: another client\'s case and task never appear in MY_WORK', async () => {
    const idset = itemsOf(await agenda({ scope: 'MY_WORK', status: 'ALL' })).map((i: any) => i.id);
    expect(idset).not.toContain(`TASK:${ids.taskB}`);
    expect(idset).not.toContain(`CASE_DEADLINE:${ids.caseB}`);
  });

  it('16: CASE-scoped agenda for an unreadable case fails closed (404)', async () => {
    await expect(agenda({ scope: 'CASE', caseId: ids.caseB, status: 'ALL' })).rejects.toBeInstanceOf(AgendaRequestError);
    const res = await get(`/agenda/case/${ids.caseB}`, { 'x-test-user-id': ids.lawyerA, 'x-test-role': 'LAWYER' });
    expect(res.status).toBe(404);
  });

  it('17: the canonical single-Case endpoint returns this case\'s deadlines, most-urgent first', async () => {
    const result = await getCaseDeadlines(ids.caseA, ids.lawyerA, { status: 'OPEN', now: NOW, userRole: 'LAWYER' }, db);
    expect(result.caseId).toBe(ids.caseA);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].urgency).toBe('OVERDUE'); // most urgent surfaces first
    expect(result.items.map((i: any) => i.id)).toContain(`CASE_DEADLINE:${ids.caseA}`);
  });

  it('18: the dashboard attention read model uses the same authoritative Case.deadline source', async () => {
    const summary = await getCaseAttentionSummary(ids.caseA, db);
    const caseSignal = summary!.signals.find((s: any) => s.sourceType === 'CASE_DEADLINE');
    expect(caseSignal?.dueAt).toBe(caseADeadline.toISOString()); // identical to the agenda projection
  });
});
