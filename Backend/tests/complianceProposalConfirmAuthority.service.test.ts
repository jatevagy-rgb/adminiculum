/**
 * SEC-0A — Compliance proposal → Task authority (SEC-D).
 *
 * confirmProposal previously let a professional-role CaseCollaborator confirm a
 * proposal into a Task. The Task-producing confirmation must now require
 * canonical CASE_MANAGE. Proposal read/review eligibility stays unchanged; the
 * collaborator-only confirm is denied with zero Task/proposal side effects.
 */

const userCanManageCaseByIdMock = jest.fn();

jest.mock('../src/modules/cases/authorization', () => ({
  userCanManageCaseById: (...args: unknown[]) => userCanManageCaseByIdMock(...args),
}));

jest.mock('../src/modules/cases/caseMutationGuard', () => ({
  lockCaseForMutation: jest.fn(),
}));

jest.mock('../src/modules/cases/services', () => ({ __esModule: true, default: { createCase: jest.fn() } }));
jest.mock('../src/modules/compliance/complianceCaseTypeResolver', () => ({ resolveComplianceCaseType: jest.fn() }));

class InteractionError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'InteractionError';
  }
}

jest.mock('../src/modules/client-interaction/base', () => ({
  InteractionError,
  assertClientReadAccess: jest.fn(async () => ({ id: 'client-1', name: 'Client' })),
  assertInternalCaseAccess: jest.fn(async () => ({ id: 'case-1', clientId: 'client-1' })),
  requireInternal: jest.fn(),
  safeText: (value: unknown) => (value == null ? null : String(value).trim()),
}));

const mockTx = {
  $queryRaw: jest.fn(),
  complianceProposal: { findUnique: jest.fn(), update: jest.fn() },
  assessmentFinding: { findUnique: jest.fn() },
  task: { create: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockDb = {
  $transaction: jest.fn((operation: (tx: typeof mockTx) => unknown) => operation(mockTx)),
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockDb }));

import { confirmProposal } from '../src/modules/compliance/complianceProposalService';

const proposal = {
  id: 'prop-1',
  clientId: 'client-1',
  findingId: 'finding-1',
  caseId: 'case-1',
  status: 'PROPOSED',
  taskId: null,
  assigneeId: null,
  title: 'Fix compliance gap',
  description: 'desc',
  suggestedAction: null,
  deadline: null,
  applicabilityIdAtProposal: 'app-1',
  findingStatusAtProposal: 'OPEN',
};

describe('confirmProposal — Task-producing confirmation requires CASE_MANAGE', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.$queryRaw.mockResolvedValue([{ id: 'prop-1' }]);
    mockTx.complianceProposal.findUnique.mockResolvedValue(proposal);
    mockTx.assessmentFinding.findUnique.mockResolvedValue({ requirementApplicabilityId: 'app-1', status: 'OPEN' });
    mockTx.task.create.mockResolvedValue({ id: 'task-1', title: 'Fix compliance gap', status: 'TODO', caseId: 'case-1' });
    mockTx.complianceProposal.update.mockResolvedValue({});
  });

  it('DENIES a collaborator-only professional with zero side effects', async () => {
    userCanManageCaseByIdMock.mockResolvedValue(false);
    await expect(
      confirmProposal({ userId: 'collab-1', role: 'COLLAB_LAWYER' }, 'prop-1'),
    ).rejects.toMatchObject({ status: 403, code: 'CASE_MANAGE_REQUIRED' });
    expect(userCanManageCaseByIdMock).toHaveBeenCalledWith('collab-1', 'COLLAB_LAWYER', 'case-1', mockTx);
    expect(mockTx.task.create).not.toHaveBeenCalled();
    expect(mockTx.complianceProposal.update).not.toHaveBeenCalled();
  });

  it('DENIES a collaborator-only lawyer with zero side effects', async () => {
    userCanManageCaseByIdMock.mockResolvedValue(false);
    await expect(
      confirmProposal({ userId: 'collab-1', role: 'LAWYER' }, 'prop-1'),
    ).rejects.toMatchObject({ status: 403, code: 'CASE_MANAGE_REQUIRED' });
    expect(mockTx.task.create).not.toHaveBeenCalled();
    expect(mockTx.complianceProposal.update).not.toHaveBeenCalled();
  });

  it('preserves the manager confirm path (CASE_MANAGE)', async () => {
    userCanManageCaseByIdMock.mockResolvedValue(true);
    const result = await confirmProposal({ userId: 'lawyer-1', role: 'LAWYER' }, 'prop-1');
    expect(mockTx.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ caseId: 'case-1' }) }));
    expect(mockTx.complianceProposal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) }));
    expect(result).toMatchObject({ id: 'task-1' });
  });
});
