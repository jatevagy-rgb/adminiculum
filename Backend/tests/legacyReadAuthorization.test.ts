import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';

const db: any = {
  user: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  task: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  timelineEvent: { create: jest.fn() },
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/prisma/prisma.service', () => ({ __esModule: true, prisma: db, default: db }));
jest.mock('../src/modules/cases/caseMutationGuard', () => ({
  lockCaseForMutation: jest.fn(),
  withCaseWorkGuard: jest.fn(),
  CaseMutationGuardError: class extends Error {},
}));
jest.mock('../src/middleware/auth', () => ({
  authenticate(req: Request, res: Response, next: NextFunction) {
    if (!req.headers['x-test-user']) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
    req.user = {
      userId: String(req.headers['x-test-user']), role: String(req.headers['x-test-role'] || 'LAWYER') as any,
      email: 'synthetic@example.invalid', authProvider: 'local-jwt',
    };
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
const caseSources = {
  getCaseTimeline: jest.fn(), getCaseDocuments: jest.fn(), getCaseClientHouseStyle: jest.fn(),
};
const workflowSources = { getWorkflowGraph: jest.fn(), getWorkflowHistory: jest.fn() };
jest.mock('../src/modules/cases/services', () => ({ __esModule: true, default: caseSources }));
jest.mock('../src/modules/workflow', () => ({ workflowService: workflowSources }));

import taskRoutes from '../src/modules/tasks/routes';
import caseRoutes from '../src/modules/cases/routes';
import { createTask, getTask, updateTaskAttention } from '../src/modules/tasks/services';

const roles: Record<string, string> = {
  admin: 'ADMIN', partner: 'PARTNER', assignee: 'TRAINEE', assigner: 'LAWYER',
  lawyer: 'LAWYER', creator: 'LEGAL_ASSISTANT', collaborator: 'COLLAB_LAWYER',
  sameClient: 'LAWYER', otherClient: 'LAWYER', portal: 'CLIENT',
};
const caseRecord = { id: 'case-1', clientId: 'client-1', assignedLawyerId: 'lawyer', createdById: 'creator' };
// Synthetic credentials only. The database double honors Prisma projections so
// any return to relation:true exposes a forbidden field and fails the test.
const assignedUser = {
  id: 'assignee', name: 'Teszt Munkatárs', role: 'TRAINEE',
  passwordHash: 'synthetic', resetToken: 'synthetic', authToken: 'synthetic',
  securityStamp: 'synthetic', futureCredential: 'synthetic',
};
const taskRecord: any = {
  id: 'task-1', title: 'Teszt feladat', status: 'IN_PROGRESS', priority: 'MEDIUM',
  caseId: 'case-1', assignedToId: 'assignee', assignedById: 'assigner',
  attentionCategory: null, estimatedMinutes: null, assignedTo: assignedUser,
  case: caseRecord, submissions: [], collaborators: [], plannedReviewer: null,
};

function project(record: any, args: any): any {
  if (record == null) return record;
  if (Array.isArray(record)) return record.map((row) => project(row, args));
  if (!args?.select && !args?.include) return record;
  const result: any = args.select ? {} : Object.fromEntries(Object.entries(record).filter(([, value]) => value == null || typeof value !== 'object'));
  for (const [key, selection] of Object.entries(args.select || args.include)) {
    if (selection) result[key] = selection === true ? record[key] : project(record[key], selection);
  }
  return result;
}

const app = express();
app.use(express.json());
app.use('/tasks', taskRoutes);
app.use('/cases', caseRoutes);

function get(path: string, actor?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Missing test address')); return; }
      const request = http.get({ hostname: '127.0.0.1', port: address.port, path,
        headers: actor ? { 'x-test-user': actor, 'x-test-role': roles[actor] } : {},
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          resolve({ status: response.statusCode || 0, body: JSON.parse(Buffer.concat(chunks).toString()) });
        });
      });
      request.on('error', (error) => { server.close(); reject(error); });
    });
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  db.user.findUnique.mockImplementation(async ({ where }: any) => roles[where.id] ? { id: where.id, role: roles[where.id] } : null);
  db.case.findUnique.mockImplementation(async ({ where }: any) => where.id === 'case-1' ? caseRecord : null);
  db.caseCollaborator.findFirst.mockImplementation(async ({ where }: any) => where.caseId === 'case-1' && where.userId === 'collaborator' ? { id: 'membership-1' } : null);
  db.task.findUnique.mockImplementation(async (args: any) => args.where.id === 'task-1' ? project(taskRecord, args) : null);
  db.task.findMany.mockImplementation(async (args: any) => {
    if (args.where.assignedToId && args.where.assignedToId !== taskRecord.assignedToId) return [];
    if (args.where.caseId && args.where.caseId !== taskRecord.caseId) return [];
    return [project(taskRecord, args)];
  });
  db.task.create.mockImplementation(async (args: any) => project(taskRecord, args));
  db.task.update.mockImplementation(async (args: any) => project({ ...taskRecord, ...args.data }, args));
  for (const reader of [...Object.values(caseSources), ...Object.values(workflowSources)]) reader.mockResolvedValue({ source: 'authorized-case-content' });
});

describe('legacy task read authority', () => {
  it.each(['admin', 'partner', 'assignee', 'assigner', 'lawyer', 'creator', 'collaborator'])('%s can read an authorized task without being in the personal list', async (actor) => {
    const response = await get('/tasks/task-1', actor);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('task-1');
    expect(response.body.assignedTo).toEqual({ id: 'assignee', name: 'Teszt Munkatárs', role: 'TRAINEE' });
  });
  it.each(['sameClient', 'otherClient'])('%s cannot read task content', async (actor) => {
    expect(await get('/tasks/task-1', actor)).toMatchObject({ status: 404, body: { code: 'TASK_NOT_FOUND' } });
    expect(db.task.findUnique).toHaveBeenCalledTimes(1); // metadata only, no DTO read
    expect(await get('/tasks/missing', actor)).toMatchObject({ status: 404, body: { code: 'TASK_NOT_FOUND' } });
  });
  it('keeps the personal list personal for workers and privileged users', async () => {
    expect((await get('/tasks', 'assignee')).body.map((item: any) => item.id)).toEqual(['task-1']);
    expect((await get('/tasks', 'admin')).body).toEqual([]);
    expect((await get('/tasks/my/tasks?caseId=foreign', 'assignee')).body).toEqual([]);
  });
  it.each(['/tasks', '/tasks/task-1', '/tasks?caseId=case-1', '/tasks/cases/case-1/tasks', '/tasks/my/tasks'])('rejects portal and anonymous callers at %s', async (path) => {
    expect((await get(path, 'portal')).status).toBe(403);
    expect((await get(path)).status).toBe(401);
    expect(db.task.findUnique).not.toHaveBeenCalled();
    expect(db.task.findMany).not.toHaveBeenCalled();
  });
});

describe.each(['/tasks?caseId=case-1', '/tasks/cases/case-1/tasks'])('case task collection %s', (path) => {
  it.each(['admin', 'partner', 'lawyer', 'creator', 'collaborator'])('preserves %s case access', async (actor) => {
    expect((await get(path, actor)).status).toBe(200);
  });
  it.each(['sameClient', 'otherClient', 'assignee', 'assigner'])('does not give %s the whole case merely through a task or client relationship', async (actor) => {
    expect((await get(path, actor)).status).toBe(403);
    expect(db.task.findMany).not.toHaveBeenCalled();
  });
});

describe.each(['timeline', 'documents', 'workflow-graph', 'workflow-history', 'client-house-style'])('legacy case reader %s', (reader) => {
  it.each(['admin', 'partner', 'lawyer', 'creator', 'collaborator'])('preserves %s access', async (actor) => {
    expect((await get(`/cases/case-1/${reader}`, actor)).status).toBe(200);
  });
  it.each(['sameClient', 'otherClient', 'portal'])('denies %s before reading business data', async (actor) => {
    expect((await get(`/cases/case-1/${reader}`, actor)).status).toBe(403);
    for (const source of [...Object.values(caseSources), ...Object.values(workflowSources)]) expect(source).not.toHaveBeenCalled();
  });
  it('fails closed on authorization lookup failure', async () => {
    db.case.findUnique.mockRejectedValueOnce(new Error('synthetic lookup failure'));
    expect((await get(`/cases/case-1/${reader}`, 'lawyer')).status).toBe(500);
    for (const source of [...Object.values(caseSources), ...Object.values(workflowSources)]) expect(source).not.toHaveBeenCalled();
  });
});

describe('safe embedded users in task DTOs', () => {
  function assertSafeUser(result: any) {
    expect(result.assignedTo).toEqual({ id: 'assignee', name: 'Teszt Munkatárs', role: 'TRAINEE' });
    for (const key of ['passwordHash', 'resetToken', 'authToken', 'securityStamp', 'futureCredential']) {
      expect(JSON.stringify(result)).not.toContain(`"${key}"`);
    }
  }
  it('allowlists the user in single reads', async () => assertSafeUser(await getTask('task-1')));
  it('allowlists the user in transaction-bound create responses', async () => {
    assertSafeUser(await createTask({ caseId: 'case-1', title: 'Teszt', assignedBy: 'assigner', assignedTo: 'assignee', type: 'OTHER' }, db));
  });
  it('allowlists the user in changed and unchanged attention responses', async () => {
    assertSafeUser(await updateTaskAttention('task-1', 'assignee', { estimatedMinutes: 30 }));
    assertSafeUser(await updateTaskAttention('task-1', 'assignee', { estimatedMinutes: null }));
  });
});
