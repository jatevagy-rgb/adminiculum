const prismaMock = {
  user: { findUnique: jest.fn() },
  task: { findMany: jest.fn() },
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
  });

  it('scopes a lawyer review queue to task or case participation', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'LAWYER' });

    await getReviewTasksForUser('user-1');

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW'] },
        OR: [
          { assignedToId: 'user-1' },
          { assignedById: 'user-1' },
          { case: { assignedLawyerId: 'user-1' } },
          { case: { createdById: 'user-1' } },
          { case: { collaborators: { some: { userId: 'user-1' } } } },
        ],
      }),
    }));
  });

  it('allows an administrator to see the complete review-status queue', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    await getReviewTasksForUser('admin-1');

    const query = prismaMock.task.findMany.mock.calls[0][0];
    expect(query.where.status).toEqual({ in: ['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW'] });
    expect(query.where.OR).toBeUndefined();
  });

  it('returns an empty queue for an unknown user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(getReviewTasksForUser('missing')).resolves.toEqual([]);
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });
});
