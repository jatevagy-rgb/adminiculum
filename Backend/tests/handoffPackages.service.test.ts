jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: {
      findUnique: jest.fn(),
    },
    document: {
      findUnique: jest.fn(),
    },
    anonymousDocument: {
      findUnique: jest.fn(),
    },
    contractGeneration: {
      findUnique: jest.fn(),
    },
    legalAnalysis: {
      findUnique: jest.fn(),
    },
    contractReviewRecord: {
      findUnique: jest.fn(),
    },
    lawyerHandoffPackage: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    timelineEvent: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import handoffPackagesService from '../src/modules/handoff-packages/service';

describe('handoff package adjacent foundation checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_LEGAL_ANALYSES;
    delete process.env.ENABLE_CONTRACT_REVIEW_NOTES;
  });

  it('retires direct creation without writing a package or timeline event', async () => {
    await expect(handoffPackagesService.createHandoffPackage({ caseId: 'case-1' }))
      .rejects.toMatchObject({ statusCode: 410, code: 'HANDOFF_PACKAGE_CREATION_RETIRED' });
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.create).not.toHaveBeenCalled();
    expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
  });

  it('rejects legal analysis references before querying absent foundations', async () => {
    await expect(
      handoffPackagesService.updateHandoffPackage('package-1', {
        legalAnalysisId: 'analysis-1',
      })
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'LEGAL_ANALYSIS_FEATURE_UNAVAILABLE',
    });

    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.legalAnalysis.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.create).not.toHaveBeenCalled();
  });

  it('rejects review note references before loading a handoff package', async () => {
    await expect(
      handoffPackagesService.updateHandoffPackage('package-1', {
        reviewNotesId: 'review-1',
      })
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'REVIEW_NOTES_FEATURE_UNAVAILABLE',
    });

    expect(prisma.contractReviewRecord.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.findUnique).not.toHaveBeenCalled();
  });

  it('excludes archived packages from the default case list', async () => {
    (prisma.lawyerHandoffPackage.findMany as jest.Mock).mockResolvedValue([]);

    await handoffPackagesService.listHandoffPackages('case-1');

    expect(prisma.lawyerHandoffPackage.findMany).toHaveBeenCalledWith({
      where: {
        caseId: 'case-1',
        status: { not: 'ARCHIVED' },
      },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('includes archived records and preserves every DTO field in complete history', async () => {
    const archived = {
      id: 'package-1', caseId: 'case-1', status: 'ARCHIVED', packageType: 'FINAL_APPROVAL',
      sourceDocumentId: 'document-1', anonymizedDocumentId: 'anonymous-1',
      generatedContractId: 'generation-1', legalAnalysisId: 'analysis-1', reviewNotesId: 'notes-1',
      preparerSummary: 'Original summary', preparedById: 'worker-1',
      submittedAt: new Date('2026-07-17T08:00:00Z'), reviewedById: 'reviewer-1',
      reviewedAt: new Date('2026-07-17T09:00:00Z'), reviewDecision: 'REJECTED_BLOCKING',
      reviewComment: 'Original review', createdAt: new Date('2026-07-17T07:00:00Z'),
      updatedAt: new Date('2026-07-17T10:00:00Z'),
    };
    (prisma.lawyerHandoffPackage.findMany as jest.Mock).mockResolvedValue([archived]);
    await expect(handoffPackagesService.listHandoffPackages('case-1', { includeArchived: true }))
      .resolves.toEqual([archived]);
    expect(prisma.lawyerHandoffPackage.findMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1' }, orderBy: { updatedAt: 'desc' },
    });
  });

  it('reports unavailable complete history while retaining default missing-table behavior', async () => {
    (prisma.lawyerHandoffPackage.findMany as jest.Mock)
      .mockRejectedValueOnce(new Error('Table LawyerHandoffPackage does not exist'))
      .mockRejectedValueOnce(new Error('Table LawyerHandoffPackage does not exist'));
    await expect(handoffPackagesService.listHandoffPackages('case-1', { includeArchived: true }))
      .rejects.toMatchObject({ statusCode: 501, code: 'HANDOFF_FEATURE_UNAVAILABLE' });
    await expect(handoffPackagesService.listHandoffPackages('case-1')).resolves.toEqual([]);
  });

  it('reports a missing repository for complete history without changing default behavior', async () => {
    const repo = prisma.lawyerHandoffPackage;
    try {
      (prisma as any).lawyerHandoffPackage = undefined;
      await expect(handoffPackagesService.listHandoffPackages('case-1', { includeArchived: true }))
        .rejects.toMatchObject({ statusCode: 501, code: 'HANDOFF_FEATURE_UNAVAILABLE' });
      await expect(handoffPackagesService.listHandoffPackages('case-1')).resolves.toEqual([]);
    } finally {
      (prisma as any).lawyerHandoffPackage = repo;
    }
  });

  it('archives only the package row and preserves timeline records', async () => {
    const existing = {
      id: 'package-1',
      caseId: 'case-1',
      status: 'DRAFT',
      packageType: 'STANDARD',
      sourceDocumentId: null,
      anonymizedDocumentId: null,
      generatedContractId: null,
      legalAnalysisId: null,
      reviewNotesId: null,
      preparerSummary: null,
      preparedById: 'user-1',
      submittedAt: null,
      reviewedById: null,
      reviewedAt: null,
      reviewDecision: null,
      reviewComment: null,
      createdAt: new Date('2026-06-23T00:00:00.000Z'),
      updatedAt: new Date('2026-06-23T00:00:00.000Z'),
    };
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue(existing);
    (prisma.lawyerHandoffPackage.update as jest.Mock).mockResolvedValue({
      ...existing,
      status: 'ARCHIVED',
    });

    const result = await handoffPackagesService.archiveHandoffPackage('package-1');

    expect(result.status).toBe('ARCHIVED');
    expect(prisma.lawyerHandoffPackage.update).toHaveBeenCalledWith({
      where: { id: 'package-1' },
      data: { status: 'ARCHIVED' },
    });
    expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
  });

  it('keeps archive idempotent for an already archived package', async () => {
    const archived = {
      id: 'package-1',
      caseId: 'case-1',
      status: 'ARCHIVED',
      packageType: 'STANDARD',
      sourceDocumentId: null,
      anonymizedDocumentId: null,
      generatedContractId: null,
      legalAnalysisId: null,
      reviewNotesId: null,
      preparerSummary: null,
      preparedById: null,
      submittedAt: null,
      reviewedById: null,
      reviewedAt: null,
      reviewDecision: null,
      reviewComment: null,
      createdAt: new Date('2026-06-23T00:00:00.000Z'),
      updatedAt: new Date('2026-06-23T00:00:00.000Z'),
    };
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue(archived);

    const result = await handoffPackagesService.archiveHandoffPackage('package-1');

    expect(result.status).toBe('ARCHIVED');
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
    expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
  });

  it('keeps archived packages available through explicit single-package reads', async () => {
    const archived = {
      id: 'package-1',
      caseId: 'case-1',
      status: 'ARCHIVED',
      packageType: 'STANDARD',
      sourceDocumentId: null,
      anonymizedDocumentId: null,
      generatedContractId: null,
      legalAnalysisId: null,
      reviewNotesId: null,
      preparerSummary: null,
      preparedById: null,
      submittedAt: null,
      reviewedById: null,
      reviewedAt: null,
      reviewDecision: null,
      reviewComment: null,
      createdAt: new Date('2026-06-23T00:00:00.000Z'),
      updatedAt: new Date('2026-06-23T00:00:00.000Z'),
    };
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue(archived);

    const result = await handoffPackagesService.getHandoffPackage('package-1');

    expect(result).toMatchObject({
      id: 'package-1',
      status: 'ARCHIVED',
    });
  });

  it('blocks terminal review states through the generic update route', async () => {
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue({
      id: 'package-1',
      status: 'SUBMITTED',
    });

    await expect(
      handoffPackagesService.updateHandoffPackage('package-1', { status: 'APPROVED' })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'HANDOFF_TRANSITION_REQUIRES_EXPLICIT_ROUTE',
    });
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it('requires submission before a handoff can be reviewed', async () => {
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue({
      id: 'package-1',
      status: 'DRAFT',
    });

    await expect(
      handoffPackagesService.reviewHandoffPackage('package-1', { decision: 'APPROVED', userId: 'reviewer-1' })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'HANDOFF_NOT_READY',
    });
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it('requires a reviewer note when returning a submitted handoff', async () => {
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue({
      id: 'package-1',
      status: 'SUBMITTED',
    });

    await expect(
      handoffPackagesService.reviewHandoffPackage('package-1', {
        decision: 'REJECTED_NEEDS_REVISION',
        userId: 'reviewer-1',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'REVIEW_COMMENT_REQUIRED',
    });
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED_NEEDS_REVISION', 'REJECTED_BLOCKING'] as const)(
    'records %s on an existing submitted handoff through explicit review', async (decision) => {
    const existing = {
      id: 'package-1',
      caseId: 'case-1',
      status: 'SUBMITTED',
      packageType: 'STANDARD',
      sourceDocumentId: null,
      anonymizedDocumentId: null,
      generatedContractId: null,
      legalAnalysisId: null,
      reviewNotesId: null,
      preparerSummary: 'Elkészült munka',
      preparedById: 'worker-1',
      submittedAt: new Date('2026-07-17T08:00:00.000Z'),
      reviewedById: null,
      reviewedAt: null,
      reviewDecision: null,
      reviewComment: null,
      createdAt: new Date('2026-07-17T07:00:00.000Z'),
      updatedAt: new Date('2026-07-17T08:00:00.000Z'),
    };
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue(existing);
    (prisma.lawyerHandoffPackage.update as jest.Mock).mockResolvedValue({
      ...existing,
      status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      reviewedById: 'reviewer-1',
      reviewedAt: new Date('2026-07-17T09:00:00.000Z'),
      reviewDecision: decision,
      reviewComment: 'Existing package decision',
    });
    (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({});

    const result = await handoffPackagesService.reviewHandoffPackage('package-1', {
      decision,
      userId: 'reviewer-1',
      reviewComment: 'Existing package decision',
    });

    expect(result.status).toBe(decision === 'APPROVED' ? 'APPROVED' : 'REJECTED');
    expect(result.reviewDecision).toBe(decision);
    expect(prisma.lawyerHandoffPackage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: result.status, reviewedById: 'reviewer-1', reviewDecision: decision }),
    }));
    expect(prisma.timelineEvent.create).toHaveBeenCalled();
  });
});
