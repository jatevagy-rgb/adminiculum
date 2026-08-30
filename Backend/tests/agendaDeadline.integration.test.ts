// Integration test for agenda deadline recovery using direct service call

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getWorkflowAgenda, AgendaRequestError } from '../src/modules/agenda/service';

// Helper to extract deadline items from agenda response
function extractDeadlines(body: any) {
  return body.days.flatMap((d: any) => d.items).filter((it: any) => it.id?.startsWith('CASE_DEADLINE') || it.id?.startsWith('CASE_INTAKE_DEADLINE'));
}

// Helper to extract task items
function extractTasks(body: any) {
  return body.days.flatMap((d: any) => d.items).filter((it: any) => it.id?.startsWith('TASK'));
}

const databaseUrl = process.env.AGENDA_DEADLINE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Agenda deadline recovery PostgreSQL integration test (service call)', () => {
  let db: PrismaClient;
  const ids = {
    admin: uuidv4(),
    partner: uuidv4(),
    lawyerA: uuidv4(),
    lawyerB: uuidv4(),
    client: uuidv4(),
    caseA: uuidv4(),
    caseB: uuidv4(),
    intake1: uuidv4(),
    intake2: uuidv4(),
    taskOpen: uuidv4(),
    taskCompleted: uuidv4(),
    taskOther: uuidv4(),
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();

    // Users
    await db.user.createMany({
      data: [
        { id: ids.admin, email: 'admin@example.com', name: 'Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.partner, email: 'partner@example.com', name: 'Partner', role: 'PARTNER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.lawyerA, email: 'a@example.com', name: 'Lawyer A', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.lawyerB, email: 'b@example.com', name: 'Lawyer B', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });

    // Client
    await db.client.create({ data: { id: ids.client, name: 'Test Client' } });

    const deadlineDate = new Date('2026-07-15T10:00:00.000Z');
    const laterDate = new Date('2026-07-20T12:00:00.000Z');
    const pastDate = new Date('2026-06-01T09:00:00.000Z');

    // Cases
    await db.case.create({
      data: {
        id: ids.caseA,
        caseNumber: 'CASE-A',
        title: 'Case A',
        caseType: 'CONTRACT_REVIEW',
        clientId: ids.client,
        createdById: ids.lawyerA,
        assignedLawyerId: ids.lawyerA,
        deadline: deadlineDate,
        status: 'DRAFT',
        priority: 'MEDIUM',
        updatedAt: new Date(),
      },
    });
    await db.case.create({
      data: {
        id: ids.caseB,
        caseNumber: 'CASE-B',
        title: 'Case B',
        caseType: 'CONTRACT_REVIEW',
        clientId: ids.client,
        createdById: ids.lawyerB,
        assignedLawyerId: ids.lawyerB,
        deadline: null,
        status: 'DRAFT',
        priority: 'MEDIUM',
        updatedAt: new Date(),
      },
    });

    // Intake deadlines (two for caseA with identical timestamps)
    await db.caseIntakeDeadline.createMany({
      data: [
        {
          id: ids.intake1,
          caseId: ids.caseA,
          title: 'Intake 1',
          deadlineType: 'STATUTORY',
          dueAt: deadlineDate,
          responsibleId: ids.lawyerA,
          createdById: ids.lawyerA,
          updatedAt: new Date(),
        },
        {
          id: ids.intake2,
          caseId: ids.caseA,
          title: 'Intake 2',
          deadlineType: 'STATUTORY',
          dueAt: deadlineDate,
          responsibleId: ids.lawyerA,
          createdById: ids.lawyerA,
          updatedAt: new Date(),
        },
      ],
    });

    // Tasks
    await db.task.createMany({
      data: [
        {
          id: ids.taskOpen,
          caseId: ids.caseA,
          title: 'Open Task A',
          dueDate: laterDate,
          assignedToId: ids.lawyerA,
          status: 'PENDING',
          taskType: 'DEADLINE',
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ids.taskCompleted,
          caseId: ids.caseA,
          title: 'Completed Task A',
          dueDate: pastDate,
          assignedToId: ids.lawyerA,
          status: 'COMPLETED',
          taskType: 'DEADLINE',
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ids.taskOther,
          caseId: ids.caseB,
          title: 'Task B',
          dueDate: laterDate,
          assignedToId: ids.lawyerB,
          status: 'PENDING',
          taskType: 'DEADLINE',
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  test('CASE scope returns case deadline + both intake deadlines (identical timestamps are independent)', async () => {
    const agenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'CASE',
      caseId: ids.caseA,
      status: 'OPEN',
      db,
    });
    const deadlines = extractDeadlines(agenda);
    expect(deadlines).toHaveLength(3);
    const idsSet = new Set(deadlines.map((it: any) => it.id));
    expect(idsSet.has(`CASE_DEADLINE:${ids.caseA}`)).toBe(true);
    expect(idsSet.has(`CASE_INTAKE_DEADLINE:${ids.intake1}`)).toBe(true);
    expect(idsSet.has(`CASE_INTAKE_DEADLINE:${ids.intake2}`)).toBe(true);
  });

  test('MY_WORK scope respects responsibility and case manager, tasks respect assignment', async () => {
    const agenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'OPEN',
      db,
    });
    const deadlines = extractDeadlines(agenda);
    const deadlineIds = deadlines.map((it: any) => it.id);
    expect(deadlineIds).toContain(`CASE_DEADLINE:${ids.caseA}`);
    expect(deadlineIds).toContain(`CASE_INTAKE_DEADLINE:${ids.intake1}`);
    expect(deadlineIds).toContain(`CASE_INTAKE_DEADLINE:${ids.intake2}`);
    expect(deadlineIds).not.toContain(`CASE_DEADLINE:${ids.caseB}`);
    const tasks = extractTasks(agenda);
    const taskIds = tasks.map((it: any) => it.id);
    expect(taskIds).toContain(`TASK:${ids.taskOpen}`);
    expect(taskIds).not.toContain(`TASK:${ids.taskOther}`);
  });

  test('ADMIN and PARTNER have global read access across MY_WORK', async () => {
    const adminAgenda = await getWorkflowAgenda({
      userId: ids.admin,
      userRole: 'ADMIN',
      scope: 'MY_WORK',
      status: 'OPEN',
      db,
    });
    const adminDeadlines = extractDeadlines(adminAgenda);
    expect(adminDeadlines.length).toBeGreaterThanOrEqual(3);

    const partnerAgenda = await getWorkflowAgenda({
      userId: ids.partner,
      userRole: 'PARTNER',
      scope: 'MY_WORK',
      status: 'OPEN',
      db,
    });
    const partnerDeadlines = extractDeadlines(partnerAgenda);
    expect(partnerDeadlines.length).toBeGreaterThanOrEqual(3);
  });

  test('Unauthorized CASE scope throws 404 error', async () => {
    await expect(
      getWorkflowAgenda({
        userId: ids.lawyerB,
        userRole: 'LAWYER',
        scope: 'CASE',
        caseId: ids.caseA,
        status: 'OPEN',
        db,
      })
    ).rejects.toMatchObject({ statusCode: 404, code: 'CASE_NOT_FOUND' });
  });

  test('Status semantics: OPEN vs COMPLETED vs ALL', async () => {
    const openAgenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'OPEN',
      db,
    });
    const completedAgenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'COMPLETED',
      db,
    });
    const allAgenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'ALL',
      db,
    });
    const openTasks = extractTasks(openAgenda);
    const completedTasks = extractTasks(completedAgenda);
    const allTasks = extractTasks(allAgenda);
    expect(openTasks.map((t: any) => t.id)).toContain(`TASK:${ids.taskOpen}`);
    expect(openTasks.map((t: any) => t.id)).not.toContain(`TASK:${ids.taskCompleted}`);
    expect(completedTasks.map((t: any) => t.id)).toContain(`TASK:${ids.taskCompleted}`);
    expect(allTasks.map((t: any) => t.id)).toEqual(expect.arrayContaining([`TASK:${ids.taskOpen}`, `TASK:${ids.taskCompleted}`]));
  });

  test('Pagination respects limit and offset', async () => {
    const agendaPage1 = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'ALL',
      limit: 2,
      offset: 0,
      db,
    });
    const agendaPage2 = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'ALL',
      limit: 2,
      offset: 2,
      db,
    });
    const totalItems = extractDeadlines(agendaPage1).length + extractTasks(agendaPage1).length +
      extractDeadlines(agendaPage2).length + extractTasks(agendaPage2).length;
    expect(totalItems).toBeGreaterThanOrEqual(5);
    expect(agendaPage1.pagination.hasMore).toBe(true);
  });

  test('Invalid scope throws error', async () => {
    // @ts-expect-error purposefully invalid scope
    await expect(getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      // @ts-ignore
      scope: 'INVALID_SCOPE',
      status: 'OPEN',
      db,
    })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AGENDA_SCOPE' });
  });

  test('Agenda request does not mutate any DB fields (updatedAt unchanged)', async () => {
    const beforeCase = await db.case.findUnique({ where: { id: ids.caseA } });
    const beforeIntake = await db.caseIntakeDeadline.findUnique({ where: { id: ids.intake1 } });
    await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'CASE',
      caseId: ids.caseA,
      status: 'OPEN',
      db,
    });
    const afterCase = await db.case.findUnique({ where: { id: ids.caseA } });
    const afterIntake = await db.caseIntakeDeadline.findUnique({ where: { id: ids.intake1 } });
    expect(afterCase?.updatedAt?.getTime()).toBe(beforeCase?.updatedAt?.getTime());
    expect(afterIntake?.updatedAt?.getTime()).toBe(beforeIntake?.updatedAt?.getTime());
  });
});
