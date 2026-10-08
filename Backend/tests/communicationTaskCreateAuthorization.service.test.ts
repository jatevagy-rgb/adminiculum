/**
 * SEC-0A — Communication → Task authority (SEC-B).
 *
 * createCanonicalTaskFromCommunication previously treated CaseCollaborator as
 * Task-creation eligible. It must now require canonical CASE_MANAGE via the
 * shared userCanManageCaseById primitive, so a collaborator-only reader is
 * denied before any Task side effect.
 */

const userCanManageCaseByIdMock = jest.fn();

jest.mock('../src/modules/cases/authorization', () => ({
  userCanManageCaseById: (...args: unknown[]) => userCanManageCaseByIdMock(...args),
}));

const mockDb = {
  communication: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  task: { create: jest.fn() },
};

jest.mock('../src/config/database', () => ({ __esModule: true, default: mockDb }));

import { createCanonicalTaskFromCommunication } from '../src/modules/tasks/services';

describe('createCanonicalTaskFromCommunication — CASE_MANAGE authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'case-1', clientId: 'client-1', subject: 'Subject' });
    mockDb.case.findUnique.mockResolvedValue({ id: 'case-1', clientId: 'client-1', assignedLawyerId: 'lawyer-1', createdById: 'creator-1' });
  });

  it('denies a collaborator-only reader with zero Task side effects', async () => {
    userCanManageCaseByIdMock.mockResolvedValue(false);
    await expect(
      createCanonicalTaskFromCommunication('comm-1', 'collab-1', 'COLLAB_LAWYER', { title: 'Follow up' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'COMMUNICATION_NOT_AUTHORIZED' });
    expect(userCanManageCaseByIdMock).toHaveBeenCalledWith('collab-1', 'COLLAB_LAWYER', 'case-1', mockDb);
    expect(mockDb.task.create).not.toHaveBeenCalled();
  });

  it('denies an unrelated workforce actor with zero Task side effects', async () => {
    userCanManageCaseByIdMock.mockResolvedValue(false);
    await expect(
      createCanonicalTaskFromCommunication('comm-1', 'outsider', 'LAWYER', { title: 'Follow up' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'COMMUNICATION_NOT_AUTHORIZED' });
    expect(userCanManageCaseByIdMock).toHaveBeenCalledWith('outsider', 'LAWYER', 'case-1', mockDb);
    expect(mockDb.task.create).not.toHaveBeenCalled();
  });

  it('consults the canonical CASE_MANAGE helper before any planning or mutation', async () => {
    userCanManageCaseByIdMock.mockResolvedValue(false);
    await expect(
      createCanonicalTaskFromCommunication('comm-1', 'collab-1', 'COLLAB_LAWYER', { title: 'Follow up' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockDb.task.create).not.toHaveBeenCalled();
  });
});
