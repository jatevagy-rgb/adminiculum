/**
 * Review-rail read-model tests: completion projection is derived ONLY from
 * active (non-deleted) proposals, commentCount only counts REVIEW_COMMENT, and
 * `readyForCorrection` is exactly `proposalDecisionComplete`.
 */
const prismaMock: any = {
  documentVersion: { findFirst: jest.fn() },
  documentAnnotation: { findMany: jest.fn(), count: jest.fn() },
  documentModificationProposal: { findMany: jest.fn(), groupBy: jest.fn() },
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

import { getDocumentReviewRail } from '../src/modules/documents/reviewRail.service';

const DOC = 'doc-1';
const VER = 'ver-1';

function statusGroups(pending: number, accepted: number, rejected: number) {
  const groups: any[] = [];
  if (pending) groups.push({ status: 'PENDING', _count: { _all: pending } });
  if (accepted) groups.push({ status: 'ACCEPTED', _count: { _all: accepted } });
  if (rejected) groups.push({ status: 'REJECTED', _count: { _all: rejected } });
  return groups;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.documentVersion.findFirst.mockResolvedValue({ id: VER, version: 2 });
  prismaMock.documentAnnotation.findMany.mockResolvedValue([]);
  prismaMock.documentAnnotation.count.mockResolvedValue(0);
  prismaMock.documentModificationProposal.findMany.mockResolvedValue([]);
  prismaMock.documentModificationProposal.groupBy.mockResolvedValue([]);
});

describe('getDocumentReviewRail', () => {
  it('returns 404 for a version that does not belong to the document', async () => {
    prismaMock.documentVersion.findFirst.mockResolvedValue(null);
    await expect(getDocumentReviewRail(DOC, VER)).rejects.toMatchObject({
      code: 'DOCUMENT_VERSION_NOT_FOUND',
      status: 404,
    });
  });

  it('zero proposals => proposalDecisionComplete false', async () => {
    const rail = await getDocumentReviewRail(DOC, VER);
    expect(rail.counts.proposalDecisionComplete).toBe(false);
    expect(rail.readyForCorrection).toBe(false);
    expect(rail.versionNumber).toBe(2);
  });

  it('pending > 0 => false; total > 0 with no pending => true', async () => {
    prismaMock.documentModificationProposal.groupBy.mockResolvedValueOnce(statusGroups(1, 1, 0));
    let rail = await getDocumentReviewRail(DOC, VER);
    expect(rail.counts.proposalDecisionComplete).toBe(false);

    prismaMock.documentModificationProposal.groupBy.mockResolvedValueOnce(statusGroups(0, 1, 1));
    rail = await getDocumentReviewRail(DOC, VER);
    expect(rail.counts.proposalDecisionComplete).toBe(true);
    expect(rail.readyForCorrection).toBe(true);
    expect(rail.counts.acceptedProposalCount).toBe(1);
    expect(rail.counts.rejectedProposalCount).toBe(1);

    prismaMock.documentModificationProposal.groupBy.mockResolvedValueOnce(statusGroups(0, 0, 1));
    rail = await getDocumentReviewRail(DOC, VER);
    expect(rail.counts.proposalDecisionComplete).toBe(true);
  });

  it('counts only REVIEW_COMMENT annotations and excludes deleted proposals', async () => {
    await getDocumentReviewRail(DOC, VER);
    expect(prismaMock.documentAnnotation.count).toHaveBeenCalledWith({
      where: {
        documentId: DOC,
        documentVersionId: VER,
        annotationType: 'REVIEW_COMMENT',
        deletedAt: null,
      },
    });
    expect(prismaMock.documentModificationProposal.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ documentId: DOC, documentVersionId: VER, deletedAt: null }),
      })
    );
  });

  it('clamps the limit to 50', async () => {
    await getDocumentReviewRail(DOC, VER, { limit: '999' });
    expect(prismaMock.documentAnnotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });
});
