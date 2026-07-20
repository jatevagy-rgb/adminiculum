const prismaMock = {
  user: { findUnique: jest.fn() },
  task: { findMany: jest.fn() },
  taskSubmission: { findMany: jest.fn() },
};

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: prismaMock,
}));

import { getReviewTasksForUser } from '../src/modules/tasks/services';

describe('getReviewTasksForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.taskSubmission.findMany.mockResolvedValue([]);
  });

  it('scopes a lawyer review queue to task or case participation', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'LAWYER' });

    await getReviewTasksForUser('user-1');

    expect(prismaMock.taskSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'SUBMITTED',
        submittedById: { not: 'user-1' },
        OR: [
          { assignedReviewerId: 'user-1' },
          { task: { assignedById: 'user-1' } },
          { task: { case: { assignedLawyerId: 'user-1' } } },
          { task: { case: { createdById: 'user-1' } } },
          { task: { case: { collaborators: { some: { userId: 'user-1' } } } } },
        ],
      }),
    }));

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW'] },
        NOT: { assignedToId: 'user-1' },
        submissions: { none: { status: 'SUBMITTED' } },
        OR: [
          { assignedById: 'user-1' },
          { case: { assignedLawyerId: 'user-1' } },
          { case: { createdById: 'user-1' } },
          { case: { collaborators: { some: { userId: 'user-1' } } } },
        ],
      }),
    }));
  });

  it('keeps an administrator scoped to explicit task or case participation', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    await getReviewTasksForUser('admin-1');

    const query = prismaMock.task.findMany.mock.calls[0][0];
    expect(query.where.status).toEqual({ in: ['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW'] });
    expect(query.where.NOT).toEqual({ assignedToId: 'admin-1' });
    expect(query.where.submissions).toEqual({ none: { status: 'SUBMITTED' } });
    expect(query.where.OR).toEqual([
      { assignedById: 'admin-1' },
      { case: { assignedLawyerId: 'admin-1' } },
      { case: { createdById: 'admin-1' } },
      { case: { collaborators: { some: { userId: 'admin-1' } } } },
    ]);
  });

  it('returns submission-backed review rows before legacy fallback rows', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'reviewer-1', role: 'LAWYER' });
    prismaMock.taskSubmission.findMany.mockResolvedValue([{
      id: 'submission-1',
      taskId: 'task-1',
      revisionNumber: 2,
      status: 'SUBMITTED',
      requestedAttention: 'DETAILED_REVIEW',
      externalActionRequired: false,
      workSummary: 'A bounded summary',
      submittedAt: new Date('2026-07-18T12:00:00.000Z'),
      submittedBy: { id: 'worker-1', name: 'Worker', email: 'worker@example.invalid', role: 'LAWYER' },
      assignedReviewer: { id: 'reviewer-1', name: 'Reviewer', email: 'reviewer@example.invalid', role: 'LAWYER' },
      task: {
        id: 'task-1',
        title: 'Submission task',
        status: 'IN_REVIEW',
        priority: 'HIGH',
        dueDate: null,
        case: { id: 'case-1', caseNumber: 'CASE-1', title: 'Case', clientId: 'client-1', clientName: 'Client', matterType: 'OTHER', client: { colorKey: 'INDIGO' } },
      },
      _count: { documents: 1 },
      timeEntries: [{ timeEntry: { minutes: 30 } }],
    }]);
    prismaMock.task.findMany.mockResolvedValue([{
      id: 'legacy-task',
      title: 'Legacy task',
      status: 'IN_REVIEW',
      submittedAt: new Date('2026-07-17T12:00:00.000Z'),
      case: {
        id: 'case-legacy',
        caseNumber: 'CASE-LEGACY',
        title: 'Legacy case',
        clientId: 'client-legacy',
        clientName: 'Legacy client',
        matterType: 'OTHER',
        client: { colorKey: null },
      },
    }]);

    const queue = await getReviewTasksForUser('reviewer-1');

    expect(queue).toHaveLength(2);
    expect(queue[0]).toEqual(expect.objectContaining({
      source: 'TASK_SUBMISSION',
      submissionId: 'submission-1',
      taskId: 'task-1',
      submissionDocumentCount: 1,
      linkedTimeMinutes: 30,
      nextActionCode: 'OPEN_REVIEW',
      case: expect.objectContaining({ clientColorKey: 'INDIGO' }),
    }));
    expect(queue[1]).toEqual(expect.objectContaining({ source: 'LEGACY_TASK', taskId: 'legacy-task' }));
    expect(prismaMock.taskSubmission.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns an empty queue for an unknown user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(getReviewTasksForUser('missing')).resolves.toEqual([]);
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });
});
