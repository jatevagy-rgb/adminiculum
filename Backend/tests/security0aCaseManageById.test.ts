/**
 * SEC-0A — canonical CASE_MANAGE predicate (identity-based).
 *
 * Proves the single reusable primitive that every alternate Task-producing
 * entry point must share with POST /tasks. A CaseCollaborator-only relationship
 * is READ-ONLY and never qualifies as CASE_MANAGE.
 */

import { userCanManageCaseById } from '../src/modules/cases/authorization';

const caseFindUniqueMock = jest.fn();

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: { case: { findUnique: (...args: unknown[]) => caseFindUniqueMock(...args) } },
}));

describe('userCanManageCaseById — canonical CASE_MANAGE', () => {
  const caseId = 'case-1';
  const assignedLawyerId = 'lawyer-1';
  const createdById = 'creator-1';

  beforeEach(() => {
    jest.clearAllMocks();
    caseFindUniqueMock.mockResolvedValue({ id: caseId, assignedLawyerId, createdById });
  });

  it('denies when there is no userId', async () => {
    await expect(userCanManageCaseById(null, 'LAWYER', caseId)).resolves.toBe(false);
    await expect(userCanManageCaseById(undefined, 'LAWYER', caseId)).resolves.toBe(false);
  });

  it('returns null for a missing case (not found)', async () => {
    caseFindUniqueMock.mockResolvedValue(null);
    await expect(userCanManageCaseById('lawyer-1', 'LAWYER', caseId)).resolves.toBeNull();
  });

  it('allows ADMIN and PARTNER regardless of case membership', async () => {
    await expect(userCanManageCaseById('anyone', 'ADMIN', caseId)).resolves.toBe(true);
    await expect(userCanManageCaseById('anyone', 'PARTNER', caseId)).resolves.toBe(true);
  });

  it('allows the assigned lawyer', async () => {
    await expect(userCanManageCaseById(assignedLawyerId, 'LAWYER', caseId)).resolves.toBe(true);
  });

  it('allows the case creator', async () => {
    await expect(userCanManageCaseById(createdById, 'LAWYER', caseId)).resolves.toBe(true);
  });

  it('DENIES a collaborator-only workforce user (read-only does not manage)', async () => {
    await expect(userCanManageCaseById('collab-1', 'COLLAB_LAWYER', caseId)).resolves.toBe(false);
    await expect(userCanManageCaseById('collab-1', 'LAWYER', caseId)).resolves.toBe(false);
  });

  it('denies an unrelated workforce user', async () => {
    await expect(userCanManageCaseById('outsider', 'LAWYER', caseId)).resolves.toBe(false);
  });

  it('uses the supplied transaction/query client for the case lookup', async () => {
    const txCaseFindUnique = jest.fn().mockResolvedValue({ id: caseId, assignedLawyerId, createdById });
    const tx = { case: { findUnique: txCaseFindUnique } } as never;
    await expect(userCanManageCaseById(createdById, 'LAWYER', caseId, tx)).resolves.toBe(true);
    expect(txCaseFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: caseId } }));
  });
});
