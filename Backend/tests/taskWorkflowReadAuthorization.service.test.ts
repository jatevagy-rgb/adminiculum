/**
 * Focused authorization matrix for the canonical guarded workflow reader
 * (GET /tasks/:taskId/workflow → TaskSubmissionService.getTaskSubmissionWorkflow).
 *
 * Proves that personal-list membership is NOT the read authority: the guarded
 * reader re-derives access from canUserActOnTask and fails closed for
 * unrelated, cross-client and missing targets with the same 404 shape (no
 * existence disclosure). Mocks the shared prisma client; no database.
 */
const db: any = {
  user: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  task: { findUnique: jest.fn() },
  taskSubmission: { findMany: jest.fn() },
};

jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import taskSubmissionService from '../src/modules/tasks/taskSubmission.service';

const workflowTaskRecord = {
  id: 'task-1',
  title: 'Task title',
  description: 'desc',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  dueDate: null,
  caseId: 'case-1',
  matterId: 'matter-1',
  assignedToId: 'user-A',
  assignedById: 'user-B',
  assignedTo: { id: 'user-A', name: 'A', email: 'a@example.invalid', role: 'LAWYER' },
  case: {
    id: 'case-1',
    caseNumber: 'C-001',
    title: 'Case',
    matterId: 'matter-1',
    assignedLawyerId: 'user-B',
    createdById: 'user-B',
    assignedLawyer: { id: 'user-B', name: 'B', email: 'b@example.invalid', role: 'LAWYER' },
    client: { id: 'client-1', name: 'Client' },
  },
};

const userRoles: Record<string, string> = {
  'user-A': 'LAWYER',
  'user-B': 'LAWYER',
  'user-C': 'LAWYER',
  'user-D': 'ADMIN',
  'user-E': 'LAWYER',
  'user-F': 'LAWYER',
};

describe('getTaskSubmissionWorkflow authorization matrix (guarded read authority)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockImplementation(async ({ where }: any) => {
      const id = where.id as string;
      if (!userRoles[id]) return null;
      return { id, role: userRoles[id] };
    });
    db.case.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'case-1') return { assignedLawyerId: 'user-B', createdById: 'user-B' };
      return null;
    });
    db.caseCollaborator.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.caseId === 'case-1' && where.userId === 'user-C') return { id: 'collab-1' };
      return null;
    });
    db.task.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'task-1') return workflowTaskRecord;
      return null;
    });
    db.taskSubmission.findMany.mockResolvedValue([]);
  });

  it('A assignee: allowed read', async () => {
    const workflow = await taskSubmissionService.getTaskSubmissionWorkflow('task-1', 'user-A');
    expect(workflow.permittedActions.read).toBe(true);
    expect(workflow.task.id).toBe('task-1');
  });

  it('B case assigned lawyer non-assignee: allowed read', async () => {
    const workflow = await taskSubmissionService.getTaskSubmissionWorkflow('task-1', 'user-B');
    expect(workflow.permittedActions.read).toBe(true);
  });

  it('C case collaborator non-assignee: allowed read', async () => {
    const workflow = await taskSubmissionService.getTaskSubmissionWorkflow('task-1', 'user-C');
    expect(workflow.permittedActions.read).toBe(true);
  });

  it('D ADMIN/PARTNER non-assignee: allowed read', async () => {
    const workflow = await taskSubmissionService.getTaskSubmissionWorkflow('task-1', 'user-D');
    expect(workflow.permittedActions.read).toBe(true);
  });

  it('E unrelated: denied with the same fail-closed 404 shape', async () => {
    await expect(taskSubmissionService.getTaskSubmissionWorkflow('task-1', 'user-E')).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('F cross-client (authorized for another client case only): denied 404', async () => {
    await expect(taskSubmissionService.getTaskSubmissionWorkflow('task-1', 'user-F')).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('G random/missing task: denied 404 without distinguishing from denied', async () => {
    await expect(taskSubmissionService.getTaskSubmissionWorkflow('missing', 'user-A')).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
    await expect(taskSubmissionService.getTaskSubmissionWorkflow('missing', 'user-E')).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('a denied read never touches submission persistence', async () => {
    await expect(taskSubmissionService.getTaskSubmissionWorkflow('task-1', 'user-E')).rejects.toThrow();
    expect(db.taskSubmission.findMany).not.toHaveBeenCalled();
  });
});
