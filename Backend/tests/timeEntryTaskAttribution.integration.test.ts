import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TIME_ATTRIBUTION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

jest.mock('../src/middleware/auth', () => ({
  ROLES: {
    ADMIN: 'ADMIN', PARTNER: 'PARTNER', LAWYER: 'LAWYER', COLLAB_LAWYER: 'COLLAB_LAWYER',
    TRAINEE: 'TRAINEE', LEGAL_ASSISTANT: 'LEGAL_ASSISTANT', CLIENT: 'CLIENT', EXTERNAL_REVIEWER: 'EXTERNAL_REVIEWER',
  },
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const userId = req.headers['x-test-user-id'];
    if (typeof userId !== 'string') {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'No test identity supplied.' });
      return;
    }
    req.user = {
      userId,
      email: 'time-attribution@example.invalid',
      role: String(req.headers['x-test-role'] || 'LAWYER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

import timeEntriesRoutes from '../src/routes/timeEntries';
import { getCaseTimeAttributionSummary } from '../src/modules/time-attribution/service';

const ids = {
  lawyer: 'ta-user-lawyer-000000000000000000001',
  assignee: 'ta-user-assignee-00000000000000000001',
  outsider: 'ta-user-outsider-00000000000000000001',
  client: 'ta-client-primary-000000000000000000001',
  otherClient: 'ta-client-other-0000000000000000000001',
  matter: 'ta-matter-primary-000000000000000000001',
  singleMatter: 'ta-matter-single-000000000000000000001',
  otherMatter: 'ta-matter-other-0000000000000000000001',
  case: 'ta-case-primary-000000000000000000000001',
  siblingCase: 'ta-case-sibling-00000000000000000000001',
  singleCase: 'ta-case-single-000000000000000000000001',
  otherCase: 'ta-case-other-000000000000000000000001',
  workPackage: 'ta-work-package-primary-000000000000000001',
  workPackageItem: 'ta-work-package-item-primary-0000000001',
  task: 'ta-task-primary-000000000000000000000001',
  assignedTask: 'ta-task-assigned-000000000000000000001',
  conflictingTask: 'ta-task-conflict-000000000000000000001',
  crossTask: 'ta-task-cross-client-00000000000000000001',
};

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/time-entries', timeEntriesRoutes);
  return app;
}

function requestJson(app: Express, body: Record<string, unknown>, headers: Record<string, string>): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Test server address unavailable'));
      const request = http.request({
        hostname: '127.0.0.1', port: address.port, path: '/time-entries', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(JSON.stringify(body)), ...headers },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
        });
      });
      request.on('error', (error) => { server.close(); reject(error); });
      request.end(JSON.stringify(body));
    });
  });
}

describeWithDatabase('Task and Work Package time attribution PostgreSQL', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_(replay_ci|replay_time_attribution|time_attribution_)/);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const identity = await db.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
    expect(identity[0].database_name).toBe(parsed.pathname.replace(/^\//, ''));

    await db.user.createMany({ data: [
      { id: ids.lawyer, email: 'time-attribution-lawyer@example.invalid', name: 'Time Attribution Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.assignee, email: 'time-attribution-assignee@example.invalid', name: 'Time Attribution Assignee', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.outsider, email: 'time-attribution-outsider@example.invalid', name: 'Time Attribution Outsider', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] });
    await db.client.createMany({ data: [
      { id: ids.client, name: 'Time Attribution Primary Client' },
      { id: ids.otherClient, name: 'Time Attribution Other Client' },
    ] });
    await db.matter.createMany({ data: [
      { id: ids.matter, title: 'Primary attribution matter', matterType: 'CONTRACT', clientId: ids.client },
      { id: ids.singleMatter, title: 'Single-case attribution matter', matterType: 'CONTRACT', clientId: ids.client },
      { id: ids.otherMatter, title: 'Other-client attribution matter', matterType: 'CONTRACT', clientId: ids.otherClient },
    ] });
    await db.case.createMany({ data: [
      { id: ids.case, caseNumber: 'TA-PRIMARY-001', title: 'Primary attribution case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, matterId: ids.matter, createdById: ids.lawyer, assignedLawyerId: ids.lawyer },
      { id: ids.siblingCase, caseNumber: 'TA-SIBLING-001', title: 'Sibling attribution case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, matterId: ids.matter, createdById: ids.lawyer, assignedLawyerId: ids.lawyer },
      { id: ids.singleCase, caseNumber: 'TA-SINGLE-001', title: 'Single attribution case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, matterId: ids.singleMatter, createdById: ids.lawyer, assignedLawyerId: ids.lawyer },
      { id: ids.otherCase, caseNumber: 'TA-OTHER-001', title: 'Other attribution case', caseType: 'CONTRACT_REVIEW', clientId: ids.otherClient, matterId: ids.otherMatter, createdById: ids.outsider, assignedLawyerId: ids.outsider },
    ] });
    await db.caseWorkPackage.create({ data: { id: ids.workPackage, caseId: ids.case, createdById: ids.lawyer } });
    await db.caseWorkPackageItem.create({ data: {
      id: ids.workPackageItem, caseWorkPackageId: ids.workPackage, moduleType: 'TASK_GROUP', moduleKey: 'time-attribution',
      label: 'Time attribution', order: 1, createdById: ids.lawyer,
    } });
    await db.task.createMany({ data: [
      { id: ids.task, title: 'Primary task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'MEDIUM', requiredSkills: [], caseId: ids.case, matterId: ids.matter, assignedToId: ids.lawyer, assignedById: ids.lawyer, workPackageItemId: ids.workPackageItem },
      { id: ids.assignedTask, title: 'Assigned task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'MEDIUM', requiredSkills: [], caseId: ids.case, matterId: ids.matter, assignedToId: ids.assignee, assignedById: ids.lawyer },
      { id: ids.conflictingTask, title: 'Conflicting task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'MEDIUM', requiredSkills: [], caseId: ids.case, matterId: ids.singleMatter, assignedToId: ids.lawyer, assignedById: ids.lawyer },
      { id: ids.crossTask, title: 'Cross-client task', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'MEDIUM', requiredSkills: [], caseId: ids.otherCase, matterId: ids.otherMatter, assignedToId: ids.outsider, assignedById: ids.outsider },
    ] });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.timelineEvent.deleteMany({ where: { caseId: { in: [ids.case, ids.siblingCase, ids.singleCase, ids.otherCase] } } });
    await db.timeEntry.deleteMany({ where: { matterId: { in: [ids.matter, ids.singleMatter, ids.otherMatter] } } });
    await db.task.deleteMany({ where: { id: { startsWith: 'ta-' } } });
    await db.caseWorkPackageItem.deleteMany({ where: { id: { startsWith: 'ta-' } } });
    await db.caseWorkPackage.deleteMany({ where: { id: { startsWith: 'ta-' } } });
    await db.case.deleteMany({ where: { id: { startsWith: 'ta-' } } });
    await db.matter.deleteMany({ where: { id: { startsWith: 'ta-' } } });
    await db.client.deleteMany({ where: { id: { startsWith: 'ta-' } } });
    await db.user.deleteMany({ where: { id: { startsWith: 'ta-' } } });
    await db.$disconnect();
  });

  const lawyerHeaders = { 'x-test-user-id': ids.lawyer, 'x-test-role': 'LAWYER' };
  const baseEntry = { workType: 'DRAFTING', description: 'Recorded task work', minutes: 30 };

  it('preserves case-only time while accepting task-only time through server-derived case/matter scope', async () => {
    const caseOnly = await requestJson(createApp(), { ...baseEntry, matterId: ids.singleMatter, caseId: ids.singleCase }, lawyerHeaders);
    expect(caseOnly.status).toBe(201);
    expect(caseOnly.body.taskId).toBeNull();

    const taskOnly = await requestJson(createApp(), { ...baseEntry, taskId: ids.task }, lawyerHeaders);
    expect(taskOnly.status).toBe(201);
    expect(taskOnly.body.taskId).toBe(ids.task);
    expect(taskOnly.body.matterId).toBe(ids.matter);
    const assignedTask = await requestJson(createApp(), { ...baseEntry, taskId: ids.assignedTask, minutes: 10 }, { 'x-test-user-id': ids.assignee, 'x-test-role': 'LAWYER' });
    expect(assignedTask).toMatchObject({ status: 201, body: { taskId: ids.assignedTask, matterId: ids.matter } });
  });

  it('rejects caller-supplied task context that does not agree with the persisted graph', async () => {
    const caseMismatch = await requestJson(createApp(), { ...baseEntry, taskId: ids.task, caseId: ids.siblingCase }, lawyerHeaders);
    expect(caseMismatch).toMatchObject({ status: 400, body: { code: 'TIME_ENTRY_TASK_CASE_MISMATCH' } });
    const matterMismatch = await requestJson(createApp(), { ...baseEntry, taskId: ids.task, matterId: ids.singleMatter }, lawyerHeaders);
    expect(matterMismatch).toMatchObject({ status: 400, body: { code: 'TIME_ENTRY_TASK_MATTER_MISMATCH' } });
    const conflict = await requestJson(createApp(), { ...baseEntry, taskId: ids.conflictingTask }, lawyerHeaders);
    expect(conflict).toMatchObject({ status: 409, body: { code: 'TASK_TIME_SCOPE_UNRESOLVED' } });
  });

  it('fails closed for non-workforce, unreadable, cross-client, and unknown task identifiers', async () => {
    const portal = await requestJson(createApp(), { ...baseEntry, taskId: ids.task }, { 'x-test-user-id': ids.lawyer, 'x-test-role': 'CLIENT' });
    expect(portal).toMatchObject({ status: 403, body: { code: 'WORKFORCE_ACCESS_REQUIRED' } });
    const unreadable = await requestJson(createApp(), { ...baseEntry, taskId: ids.task }, { 'x-test-user-id': ids.outsider, 'x-test-role': 'LAWYER' });
    expect(unreadable).toMatchObject({ status: 404, body: { code: 'TASK_NOT_FOUND' } });
    const crossClient = await requestJson(createApp(), { ...baseEntry, taskId: ids.crossTask }, lawyerHeaders);
    expect(crossClient).toMatchObject({ status: 404, body: { code: 'TASK_NOT_FOUND' } });
    const unknown = await requestJson(createApp(), { ...baseEntry, taskId: 'ta-task-missing-00000000000000000000001' }, lawyerHeaders);
    expect(unknown).toMatchObject({ status: 404, body: { code: 'TASK_NOT_FOUND' } });
  });

  it('keeps task/work-package attribution stable in reporting without double counting after task completion', async () => {
    const secondTaskEntry = await requestJson(createApp(), { ...baseEntry, taskId: ids.task, minutes: 15 }, lawyerHeaders);
    expect(secondTaskEntry.status).toBe(201);
    await db.task.update({ where: { id: ids.task }, data: { status: 'COMPLETED' } });

    const summary = await getCaseTimeAttributionSummary(ids.case, db);
    expect(summary).toMatchObject({
      totalMinutes: 55,
      attributedMinutes: 55,
      taskDerivedCaseMinutes: 55,
      exactCaseMinutes: 0,
      ambiguousMinutes: 0,
    });
    expect(summary?.entries.filter((entry) => entry.taskId === ids.task)).toHaveLength(2);
    const stored = await db.timeEntry.findMany({ where: { taskId: ids.task }, select: { taskId: true, matterId: true } });
    expect(stored).toEqual(expect.arrayContaining([{ taskId: ids.task, matterId: ids.matter }]));
    await expect(db.task.delete({ where: { id: ids.task } })).rejects.toThrow();
  });
});
