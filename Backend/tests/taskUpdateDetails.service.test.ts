/**
 * Service-level tests for the general task update (PATCH /tasks/:id backing logic).
 * Focus: the field allowlist (no arbitrary status change / no workflow bypass),
 * authorization reuse, and validation. Mocks the shared prisma client.
 */
const db: any = {
  task: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  timelineEvent: { create: jest.fn() },
};

jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import { updateTaskDetails } from '../src/modules/tasks/services';

const EXISTING_TASK = { id: 'task-1', title: 'Régi cím', caseId: 'case-1', assignedToId: null, assignedById: 'user-1' };

describe('updateTaskDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.task.findUnique.mockResolvedValue(EXISTING_TASK);
    db.task.update.mockResolvedValue({ ...EXISTING_TASK, title: 'Új cím' });
    // Actor is ADMIN → canUserActOnTask short-circuits to allowed.
    db.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    db.timelineEvent.create.mockResolvedValue({});
  });

  it('rejects any attempt to change status (no workflow bypass)', async () => {
    await expect(updateTaskDetails('task-1', 'user-1', { status: 'DONE' } as any))
      .rejects.toMatchObject({ statusCode: 400, code: 'UNSUPPORTED_TASK_FIELD' });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('rejects an empty payload', async () => {
    await expect(updateTaskDetails('task-1', 'user-1', {}))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('rejects an empty title', async () => {
    await expect(updateTaskDetails('task-1', 'user-1', { title: '   ' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'TASK_TITLE_REQUIRED' });
  });

  it('404 when the task does not exist', async () => {
    db.task.findUnique.mockResolvedValueOnce(null);
    await expect(updateTaskDetails('missing', 'user-1', { title: 'x' }))
      .rejects.toMatchObject({ statusCode: 404, code: 'TASK_NOT_FOUND' });
  });

  it('403 when the actor cannot act on the task', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'user-9', role: 'LAWYER' });
    db.case.findUnique.mockResolvedValue({ assignedLawyerId: 'other', createdById: 'other' });
    db.caseCollaborator.findFirst.mockResolvedValue(null);
    await expect(updateTaskDetails('task-1', 'user-9', { title: 'x' }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('updates allowed fields and persists them', async () => {
    await updateTaskDetails('task-1', 'user-1', { title: 'Új cím', priority: 'HIGH', description: 'Leírás' });
    expect(db.task.update).toHaveBeenCalledTimes(1);
    const data = db.task.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: 'Új cím', priority: 'HIGH', description: 'Leírás' });
    expect(data).not.toHaveProperty('status');
  });

  it('rejects an invalid priority', async () => {
    await expect(updateTaskDetails('task-1', 'user-1', { priority: 'SUPER' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TASK_PRIORITY' });
  });
});
