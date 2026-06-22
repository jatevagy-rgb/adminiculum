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
});
