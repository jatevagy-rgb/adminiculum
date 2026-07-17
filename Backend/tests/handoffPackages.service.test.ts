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

  it('rejects legal analysis references before querying absent foundations', async () => {
    await expect(
      handoffPackagesService.createHandoffPackage({
        caseId: 'case-1',
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

  it('records an approved submitted handoff through the explicit review method', async () => {
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
      status: 'APPROVED',
      reviewedById: 'reviewer-1',
      reviewedAt: new Date('2026-07-17T09:00:00.000Z'),
      reviewDecision: 'APPROVED',
    });
    (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({});

    const result = await handoffPackagesService.reviewHandoffPackage('package-1', {
      decision: 'APPROVED',
      userId: 'reviewer-1',
    });

    expect(result.status).toBe('APPROVED');
    expect(prisma.lawyerHandoffPackage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'reviewer-1' }),
    }));
    expect(prisma.timelineEvent.create).toHaveBeenCalled();
  });
});
