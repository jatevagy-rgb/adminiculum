// Integration test for agenda deadline recovery using direct service call

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getWorkflowAgenda, AgendaRequestError } from '../src/modules/agenda/service';

// Helper to extract deadline items from agenda response
function extractDeadlines(body) {
  return body.days.flatMap((d) => d.items).filter((it) => it.id?.startsWith('CASE_DEADLINE') || it.id?.startsWith('CASE_INTAKE_DEADLINE'));
}

function extractTasks(body) {
  return body.days.flatMap((d) => d.items).filter((it) => it.id?.startsWith('TASK'));
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
    intake1: '00000000-0000-0000-0000-000000000001',
    intake2: '00000000-0000-0000-0000-000000000002',
    intakeB1: uuidv4(),
    taskOpen: uuidv4(),
    taskCompleted: uuidv4(),
    taskOther: uuidv4(),
    taskB: uuidv4(),
    caseFinal: uuidv4(),
    caseCancelled: uuidv4(),
    caseArchived: uuidv4(),
    caseCompletedAt: uuidv4(),
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
    const pastDate = new Date('2026-07-01T09:00:00.000Z');
    const completedAt = new Date('2026-07-05T00:00:00.000Z');

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
        {
          id: ids.intakeB1,
          caseId: ids.caseB,
          title: 'Intake B1',
          deadlineType: 'STATUTORY',
          dueAt: deadlineDate,
          responsibleId: ids.lawyerA,
          createdById: ids.lawyerB,
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
        {
          id: ids.taskB,
          caseId: ids.caseB,
          title: 'Task B (by lawyerA)',
          dueDate: laterDate,
          assignedToId: ids.lawyerA,
          status: 'PENDING',
          taskType: 'DEADLINE',
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

      // Lifecycle cases
      await db.case.createMany({
        data: [
          {
            id: ids.caseFinal,
            caseNumber: 'CASE-FINAL',
            title: 'Final Case',
            caseType: 'CONTRACT_REVIEW',
            clientId: ids.client,
            createdById: ids.lawyerA,
            assignedLawyerId: ids.lawyerA,
            deadline: deadlineDate,
            status: 'FINAL',
            priority: 'MEDIUM',
            updatedAt: new Date(),
          },
          {
            id: ids.caseCancelled,
            caseNumber: 'CASE-CANCELLED',
            title: 'Cancelled Case',
            caseType: 'CONTRACT_REVIEW',
            clientId: ids.client,
            createdById: ids.lawyerA,
            assignedLawyerId: ids.lawyerA,
            deadline: deadlineDate,
            status: 'CANCELLED',
            priority: 'MEDIUM',
            updatedAt: new Date(),
          },
          {
            id: ids.caseArchived,
            caseNumber: 'CASE-ARCHIVED',
            title: 'Archived Case',
            caseType: 'CONTRACT_REVIEW',
            clientId: ids.client,
            createdById: ids.lawyerA,
            assignedLawyerId: ids.lawyerA,
            deadline: deadlineDate,
            status: 'ARCHIVED',
            priority: 'MEDIUM',
            updatedAt: new Date(),
          },
          {
            id: ids.caseCompletedAt,
            caseNumber: 'CASE-COMPLETED-AT',
            title: 'CompletedAt Case',
            caseType: 'CONTRACT_REVIEW',
            clientId: ids.client,
            createdById: ids.lawyerA,
            assignedLawyerId: ids.lawyerA,
            deadline: deadlineDate,
            status: 'DRAFT',
            priority: 'MEDIUM',
            completedAt,
            updatedAt: new Date(),
          },
        ],
      });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const agendaRange = { from: '2026-07-01', to: '2026-08-14' };

// Deterministic ordering test for CASE scope
  test('CASE scope deterministic ordering of deadlines', async () => {
    const agendaFirst = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'CASE',
      caseId: ids.caseA,
      status: 'OPEN',
      ...agendaRange,
      db,
    });
    const agendaSecond = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'CASE',
      caseId: ids.caseA,
      status: 'OPEN',
      ...agendaRange,
      db,
    });
    const dFirst = extractDeadlines(agendaFirst);
    const dSecond = extractDeadlines(agendaSecond);
    // order must be stable across calls
    expect(dFirst.map((it:any)=>it.id)).toEqual(dSecond.map((it:any)=>it.id));
    expect(dFirst.map((it: any) => it.id)).toEqual([
      `CASE_INTAKE_DEADLINE:${ids.intake1}`,
      `CASE_INTAKE_DEADLINE:${ids.intake2}`,
      `CASE_DEADLINE:${ids.caseA}`,
    ]);
  });

  // Case lifecycle status filtering
  test('Case lifecycle status filtering works', async () => {
    const openAgenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'OPEN',
      ...agendaRange,
      db,
    });
    const completedAgenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'COMPLETED',
      ...agendaRange,
      db,
    });
    const openDeadlines = extractDeadlines(openAgenda).map((it:any)=>it.id);
    const completedDeadlines = extractDeadlines(completedAgenda).map((it:any)=>it.id);
    // CLOSED cases should not be in OPEN
    expect(openDeadlines).not.toContain(`CASE_DEADLINE:${ids.caseFinal}`);
    expect(openDeadlines).not.toContain(`CASE_DEADLINE:${ids.caseCancelled}`);
    expect(openDeadlines).not.toContain(`CASE_DEADLINE:${ids.caseArchived}`);
    // CLOSED cases should be in COMPLETED
    expect(completedDeadlines).toContain(`CASE_DEADLINE:${ids.caseFinal}`);
    expect(completedDeadlines).toContain(`CASE_DEADLINE:${ids.caseCancelled}`);
    expect(completedDeadlines).toContain(`CASE_DEADLINE:${ids.caseArchived}`);
    // case with completedAt should be in COMPLETED and not in OPEN
    expect(completedDeadlines).toContain(`CASE_DEADLINE:${ids.caseCompletedAt}`);
    expect(openDeadlines).not.toContain(`CASE_DEADLINE:${ids.caseCompletedAt}`);
  });

  test('Agenda request does not mutate any DB fields', async () => {
    const beforeCase = await db.case.findUnique({ where: { id: ids.caseA } });
    const beforeIntake = await db.caseIntakeDeadline.findUnique({ where: { id: ids.intake1 } });
    const beforeTask = await db.task.findUnique({ where: { id: ids.taskOpen } });
    await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'CASE',
      caseId: ids.caseA,
      status: 'OPEN',
      ...agendaRange,
      db,
    });
    const afterCase = await db.case.findUnique({ where: { id: ids.caseA } });
    const afterIntake = await db.caseIntakeDeadline.findUnique({ where: { id: ids.intake1 } });
    const afterTask = await db.task.findUnique({ where: { id: ids.taskOpen } });
    expect(afterCase?.updatedAt?.getTime()).toBe(beforeCase?.updatedAt?.getTime());
    expect(afterCase?.deadline?.getTime()).toBe(beforeCase?.deadline?.getTime());
    expect(afterIntake?.updatedAt?.getTime()).toBe(beforeIntake?.updatedAt?.getTime());
    expect(afterIntake?.dueAt?.getTime()).toBe(beforeIntake?.dueAt?.getTime());
    expect(afterTask?.updatedAt?.getTime()).toBe(beforeTask?.updatedAt?.getTime());
    expect(afterTask?.dueDate?.getTime()).toBe(beforeTask?.dueDate?.getTime());
  });

  test('MY_WORK scope respects responsibility and case manager, tasks respect assignment', async () => {
    const agenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'OPEN',
      ...agendaRange,
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

  test('ADMIN and PARTNER can access unrelated cases through canonical case authorization', async () => {
    const adminAgenda = await getWorkflowAgenda({
      userId: ids.admin,
      userRole: 'ADMIN',
      scope: 'CASE',
      caseId: ids.caseA,
      status: 'OPEN',
      ...agendaRange,
      db,
    });
    const adminDeadlines = extractDeadlines(adminAgenda);
    expect(adminDeadlines.map((item: any) => item.id)).toEqual([
      `CASE_INTAKE_DEADLINE:${ids.intake1}`,
      `CASE_INTAKE_DEADLINE:${ids.intake2}`,
      `CASE_DEADLINE:${ids.caseA}`,
    ]);

    const partnerAgenda = await getWorkflowAgenda({
      userId: ids.partner,
      userRole: 'PARTNER',
      scope: 'CASE',
      caseId: ids.caseA,
      status: 'OPEN',
      ...agendaRange,
      db,
    });
    const partnerDeadlines = extractDeadlines(partnerAgenda);
    expect(partnerDeadlines.map((item: any) => item.id)).toEqual(adminDeadlines.map((item: any) => item.id));
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
      ...agendaRange,
      db,
    });
    const completedAgenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'COMPLETED',
      ...agendaRange,
      db,
    });
    const allAgenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'ALL',
      ...agendaRange,
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
      ...agendaRange,
      db,
    });
    const agendaPage2 = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'ALL',
      limit: 2,
      offset: 2,
      ...agendaRange,
      db,
    });
    const allAgenda = await getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      scope: 'MY_WORK',
      status: 'ALL',
      ...agendaRange,
      db,
    });
    const allIds = allAgenda.days.flatMap((day) => day.items).map((item) => item.id);
    const page1Ids = agendaPage1.days.flatMap((day) => day.items).map((item) => item.id);
    const page2Ids = agendaPage2.days.flatMap((day) => day.items).map((item) => item.id);
    expect(page1Ids).toHaveLength(2);
    expect(page2Ids).toHaveLength(2);
    expect(page1Ids).toEqual(allIds.slice(0, 2));
    expect(page2Ids).toEqual(allIds.slice(2, 4));
    expect(new Set([...page1Ids, ...page2Ids]).size).toBe(4);
    expect(agendaPage1.pagination.hasMore).toBe(true);
  });

  test('Invalid scope throws error', async () => {

    await expect(getWorkflowAgenda({
      userId: ids.lawyerA,
      userRole: 'LAWYER',
      // @ts-ignore
      scope: 'INVALID_SCOPE',
      status: 'OPEN',
      db,
    })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AGENDA_SCOPE' });
  });

});
