import { PrismaClient } from '@prisma/client';
import { TaskSubmissionService } from '../src/modules/tasks/taskSubmission.service';

/**
 * Focused PostgreSQL authorization matrix for the canonical guarded workflow
 * reader (GET /tasks/:taskId/workflow → getTaskSubmissionWorkflow).
 *
 * Reuses the existing safe task-submission integration database guard: the
 * suite only runs when TASK_SUBMISSION_TEST_DATABASE_URL points at a loopback
 * PostgreSQL host whose database name matches adminiculum_task_submission_backend_.
 * No other database (production, local-live, arbitrary) is ever touched.
 */
const databaseUrl = process.env.TASK_SUBMISSION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  assignee: 'a1000000-0000-4000-8000-000000000001',
  caseLawyer: 'a1000000-0000-4000-8000-000000000002',
  collaborator: 'a1000000-0000-4000-8000-000000000003',
  admin: 'a1000000-0000-4000-8000-000000000004',
  unrelated: 'a1000000-0000-4000-8000-000000000005',
  crossClientLawyer: 'a1000000-0000-4000-8000-000000000006',
  client: 'a2000000-0000-4000-8000-000000000001',
  crossClient: 'a2000000-0000-4000-8000-000000000002',
  matter: 'a3000000-0000-4000-8000-000000000001',
  crossMatter: 'a3000000-0000-4000-8000-000000000002',
  case: 'a4000000-0000-4000-8000-000000000001',
  crossCase: 'a4000000-0000-4000-8000-000000000002',
  task: 'a5000000-0000-4000-8000-000000000001',
  missing: 'a5000000-0000-4000-8000-000000000099',
};

describeWithDatabase('TaskSubmissionService workflow read authorization matrix (PostgreSQL)', () => {
  let db: PrismaClient;
  let service: TaskSubmissionService;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_task_submission_backend_/);

    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const identity = await db.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
    expect(identity[0].database_name).toBe(parsed.pathname.replace(/^\//, ''));
    service = new TaskSubmissionService(db);

    await db.user.createMany({
      data: [
        { id: ids.assignee, email: 'dpl-assignee@example.invalid', name: 'Dpl Assignee', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.caseLawyer, email: 'dpl-caselawyer@example.invalid', name: 'Dpl Case Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.collaborator, email: 'dpl-collaborator@example.invalid', name: 'Dpl Collaborator', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.admin, email: 'dpl-admin@example.invalid', name: 'Dpl Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.unrelated, email: 'dpl-unrelated@example.invalid', name: 'Dpl Unrelated', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.crossClientLawyer, email: 'dpl-crosslawyer@example.invalid', name: 'Dpl Cross Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });
    await db.client.createMany({
      data: [
        { id: ids.client, name: 'Dpl client' },
        { id: ids.crossClient, name: 'Dpl cross client' },
      ],
    });
    await db.matter.createMany({
      data: [
        { id: ids.matter, title: 'Dpl matter', matterType: 'CONTRACT', clientId: ids.client },
        { id: ids.crossMatter, title: 'Dpl cross matter', matterType: 'CONTRACT', clientId: ids.crossClient },
      ],
    });
    await db.case.createMany({
      data: [
        {
          id: ids.case,
          caseNumber: 'DPL-001',
          title: 'Dpl case',
          caseType: 'CONTRACT_REVIEW',
          clientId: ids.client,
          matterId: ids.matter,
          createdById: ids.caseLawyer,
          assignedLawyerId: ids.caseLawyer,
        },
        {
          id: ids.crossCase,
          caseNumber: 'DPL-002',
          title: 'Dpl cross case',
          caseType: 'CONTRACT_REVIEW',
          clientId: ids.crossClient,
          matterId: ids.crossMatter,
          createdById: ids.crossClientLawyer,
          assignedLawyerId: ids.crossClientLawyer,
        },
      ],
    });
    await db.task.create({
      data: {
        id: ids.task,
        title: 'Dpl task',
        taskType: 'OTHER',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        requiredSkills: [],
        caseId: ids.case,
        matterId: ids.matter,
        assignedToId: ids.assignee,
        assignedById: ids.caseLawyer,
      },
    });
    await db.caseCollaborator.create({
      data: { caseId: ids.case, userId: ids.collaborator, role: 'COLLABORATOR' },
    });
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('A assignee: workflow read is allowed', async () => {
    const workflow = await service.getTaskSubmissionWorkflow(ids.task, ids.assignee);
    expect(workflow.permittedActions.read).toBe(true);
    expect(workflow.task.id).toBe(ids.task);
  });

  it('B case assigned lawyer non-assignee: workflow read is allowed', async () => {
    const workflow = await service.getTaskSubmissionWorkflow(ids.task, ids.caseLawyer);
    expect(workflow.permittedActions.read).toBe(true);
  });

  it('C case collaborator non-assignee: workflow read is allowed', async () => {
    const workflow = await service.getTaskSubmissionWorkflow(ids.task, ids.collaborator);
    expect(workflow.permittedActions.read).toBe(true);
  });

  it('D ADMIN/PARTNER non-assignee: workflow read is allowed', async () => {
    const workflow = await service.getTaskSubmissionWorkflow(ids.task, ids.admin);
    expect(workflow.permittedActions.read).toBe(true);
  });

  it('E unrelated: workflow read is denied fail-closed (404)', async () => {
    await expect(service.getTaskSubmissionWorkflow(ids.task, ids.unrelated)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('F cross-client lawyer: workflow read is denied fail-closed (404)', async () => {
    await expect(service.getTaskSubmissionWorkflow(ids.task, ids.crossClientLawyer)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('G random/missing task: workflow read is denied fail-closed (404)', async () => {
    await expect(service.getTaskSubmissionWorkflow(ids.missing, ids.assignee)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });
});
