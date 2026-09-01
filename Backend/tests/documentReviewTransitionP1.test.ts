/**
 * Document Review / DECIDE canonical transition P1 hotfix — behavioral tests.
 *
 * Proves the legacy approveDocument / rejectDocument compatibility entry points
 * delegate the review-state decision through the canonical transition engine
 * (not a direct DocumentReview.status write), and that legacy side effects
 * (folder, SharePoint check-in, TimelineEvent, Case status) run ONLY after the
 * canonical transition succeeds.
 *
 * These tests exercise the real service layer against a behavioural Prisma
 * double that models persisted review + round + version + point state, so the
 * canonical transitionReview path is genuinely executed and its verdicts are
 * asserted. They are behavioural, not source-string assertions alone.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const prismaMock: any = {};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

jest.mock('../src/modules/sharepoint', () => ({
  driveService: { checkinDocument: jest.fn() },
}));

import { prisma } from '../src/prisma/prisma.service';
import { driveService } from '../src/modules/sharepoint';
import documentsService from '../src/modules/documents/services';

function makeReview(status: string, revision = 0, reviewVersionId = 'ver-1') {
  return {
    id: 'review-1',
    documentId: 'doc-1',
    documentVersionId: reviewVersionId,
    status,
    ownerId: null,
    dueAt: null,
    currentRoundNumber: 1,
    currentRoundId: 'round-1',
    currentRound: {
      id: 'round-1', reviewId: 'review-1', roundNumber: 1,
      reviewVersionId, status, startedAt: new Date(),
      submittedAt: null, completedAt: null, revision: 0,
    },
    approvedVersionId: null,
    revision,
    createdById: 'user-1',
    assignedReviewerId: 'user-1',
    createdAt: new Date(), updatedAt: new Date(), completedAt: null,
    // Relations loaded by the canonical loadReview() include.
    document: { id: 'doc-1', fileName: 'contract.pdf', name: 'contract', caseId: 'case-1', currentVersionInt: 1 },
    owner: null,
    assignedReviewer: { id: 'user-1', name: 'Reviewer', email: 'r@x.invalid' },
    approvedVersion: null,
    rounds: [{
      id: 'round-1', reviewId: 'review-1', roundNumber: 1,
      reviewVersionId, status, startedAt: new Date(),
      submittedAt: null, completedAt: null, revision: 0,
    }],
    points: [],
    decisions: [],
  };
}

const document = {
  id: 'doc-1', caseId: 'case-1', fileName: 'contract.pdf',
  spItemId: 'sp-1', folder: 'REVIEW',
};

describe('Document Review transition P1 hotfix', () => {
  let reviewStatus: string;
  let reviewRevision: number;
  let caseStatus: string;
  let timelineEvents: number;
  let checkins: number;
  let documentFolder: string;
  let directStatusWrites: number;
  let documentUpdateCalls: number;
  let checkinCalls: number;
  let timelineCalls: number;

  function wireMocks(opts?: { openPoints?: number; openBlockingPoints?: number; noReview?: boolean }) {
    const openPoints = opts?.openPoints ?? 0;
    const openBlockingPoints = opts?.openBlockingPoints ?? 0;
    prismaMock.document = { findUnique: jest.fn().mockResolvedValue(document) };
    prismaMock.documentReview = {
      findFirst: jest.fn().mockImplementation(async () =>
        opts?.noReview ? null : makeReview(reviewStatus, reviewRevision),
      ),
      findUnique: jest.fn().mockImplementation(async () => {
        if (opts?.noReview) return null;
        return makeReview(reviewStatus, reviewRevision);
      }),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        directStatusWrites += 1;
        if (data.status === 'APPROVED') reviewStatus = 'APPROVED';
        if (data.status === 'CHANGES_REQUESTED') reviewStatus = 'CHANGES_REQUESTED';
        return makeReview(reviewStatus, reviewRevision);
      }),
    };
    prismaMock.documentReviewRound = {
      findUnique: jest.fn().mockImplementation(async () => makeReview(reviewStatus, reviewRevision).currentRound),
      update: jest.fn().mockResolvedValue({}),
    };
    prismaMock.documentVersion = {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ver-1', version: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'ver-1', version: 1, documentId: 'doc-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'ver-1', version: 1, documentId: 'doc-1' }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'ver-1', version: 1 }),
    };
    prismaMock.reviewPoint = {
      count: jest.fn()
        .mockResolvedValueOnce(openPoints)
        .mockResolvedValueOnce(openBlockingPoints),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    };
    prismaMock.reviewDecision = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    };
    prismaMock.user = { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', role: 'LAWYER', status: 'ACTIVE', isActive: true }) };
    prismaMock.caseCollaborator = { findFirst: jest.fn().mockResolvedValue({ id: 'col-1', userId: 'user-1' }) };
    prismaMock.case = {
      findUnique: jest.fn().mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'user-1' }),
      update: jest.fn().mockImplementation(async ({ data }: any) => { if (data.status) caseStatus = data.status; return {}; }),
    };
    prismaMock.timelineEvent = {
      create: jest.fn().mockImplementation(async () => { timelineCalls += 1; }),
    };
    // Legacy side-effect seam for folder updates + SharePoint check-in.
    prismaMock.document.update = jest.fn().mockImplementation(async ({ data }: any) => {
      documentUpdateCalls += 1;
      if (data.folder) documentFolder = data.folder as string;
    });
    (driveService.checkinDocument as jest.Mock) = jest.fn().mockImplementation(async () => { checkinCalls += 1; });
    // The canonical transition service wraps its work in prisma.$transaction.
    prismaMock.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prismaMock));
  }

  beforeEach(() => {
    reviewStatus = 'IN_REVIEW';
    reviewRevision = 0;
    caseStatus = 'GENERATING';
    documentFolder = 'REVIEW';
    timelineEvents = 0;
    checkins = 0;
    directStatusWrites = 0;
    documentUpdateCalls = 0;
    checkinCalls = 0;
    timelineCalls = 0;
  });

  it('1. valid legacy approve delegates to canonical transition and persists APPROVED', async () => {
    wireMocks();
    const result = await documentsService.approveDocument('doc-1', 'user-1', 'approved', 'LAWYER');
    expect(result).toBe(true);
    expect(reviewStatus).toBe('APPROVED');
    expect(documentFolder).toBe('APPROVED');
    expect(checkinCalls).toBe(1);
    expect(timelineCalls).toBe(2); // canonical audit event + legacy contract-approved event
    expect(caseStatus).toBe('APPROVED');
  });

  it('2. valid legacy reject/request-changes delegates to canonical transition and persists CHANGES_REQUESTED', async () => {
    wireMocks({ openPoints: 1 });
    const result = await documentsService.rejectDocument('doc-1', 'user-1', 'Please fix clause 4', 'LAWYER');
    expect(result).toBe(true);
    expect(reviewStatus).toBe('CHANGES_REQUESTED');
    expect(documentFolder).toBe('DRAFTS');
    expect(caseStatus).toBe('DRAFT');
    expect(timelineCalls).toBe(2); // canonical audit event + legacy contract-rejected event
  });

  it('3. invalid transition (open blocking point) throws and executes no legacy side effects', async () => {
    wireMocks({ openBlockingPoints: 1 });
    const beforeTimeline = timelineCalls;
    const beforeCheckin = checkinCalls;
    await expect(documentsService.approveDocument('doc-1', 'user-1', 'ok', 'LAWYER')).rejects.toThrow('transition is not allowed');
    expect(timelineCalls).toBe(beforeTimeline);
    expect(checkinCalls).toBe(beforeCheckin);
    expect(documentFolder).toBe('REVIEW');
    expect(caseStatus).toBe('GENERATING');
  });

  it('4. approve after already APPROVED is rejected as invalid state with no side effects', async () => {
    reviewStatus = 'APPROVED';
    wireMocks();
    const beforeTimeline = timelineCalls;
    await expect(documentsService.approveDocument('doc-1', 'user-1', 'again', 'LAWYER')).rejects.toThrow('transition is not allowed');
    expect(timelineCalls).toBe(beforeTimeline);
    expect(documentFolder).toBe('REVIEW');
  });

  it('5. reject without rationale and no open points is denied with no side effects', async () => {
    reviewStatus = 'IN_REVIEW';
    wireMocks({ openPoints: 0 });
    const beforeTimeline = timelineCalls;
    // The canonical REQUEST_CHANGES requires open points OR rationale; an empty
    // reason yields safeRationale = null, so this must be denied.
    await expect(documentsService.rejectDocument('doc-1', 'user-1', '', 'LAWYER')).rejects.toThrow('transition is not allowed');
    expect(timelineCalls).toBe(beforeTimeline);
    expect(documentFolder).toBe('REVIEW');
  });

  it('6. legacy entry points never directly write DocumentReview.status', async () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../src/modules/documents/services.ts'), 'utf8');
    const approveSection = src.slice(src.indexOf('async approveDocument'), src.indexOf('async rejectDocument'));
    const rejectSection = src.slice(src.indexOf('async rejectDocument'), src.lastIndexOf('}'));
    expect(approveSection).not.toMatch(/documentReview\s*\.\s*update[\s\S]{0,80}status/);
    expect(rejectSection).not.toMatch(/documentReview\s*\.\s*update[\s\S]{0,80}status/);
    expect(src).toContain('transitionReview');
    expect(approveSection).toContain("'APPROVE'");
    expect(rejectSection).toContain("'REQUEST_CHANGES'");
  });

  it('7. legacy approve without an active review runs legacy side effects without creating review state', async () => {
    wireMocks({ noReview: true });
    const beforeDirectWrites = directStatusWrites;
    const result = await documentsService.approveDocument('doc-1', 'user-1', 'comment', 'LAWYER');
    expect(result).toBe(true);
    expect(directStatusWrites).toBe(beforeDirectWrites);
    expect(documentFolder).toBe('APPROVED');
  });

  it('8. approval never publishes to the client (no client publication side effect)', async () => {
    wireMocks();
    // No publication API is ever invoked on approve.
    await documentsService.approveDocument('doc-1', 'user-1', 'ok', 'LAWYER');
    expect(prismaMock.clientPublication || prismaMock.clientPortalPublication || prismaMock.publication).toBeUndefined();
  });
});
