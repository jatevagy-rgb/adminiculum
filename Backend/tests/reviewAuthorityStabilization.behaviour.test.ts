/**
 * Review authority stabilization — focused behavioural tests (SLICE 1).
 *
 * Locks the invariants of the review-authority repair without a database:
 *
 *   1. a review decision is accepted only from the actor the canonical review
 *      contract authorizes (document: owner/assigned reviewer; task: assigned
 *      reviewer);
 *   2. ordinary case collaborators do not gain approve authority from case
 *      access alone;
 *   3. the submitter cannot self-approve where independent review is required;
 *   4. an unauthorized actor cannot request changes;
 *   5. the return rationale/instructions persist with the decision;
 *   6. resubmission preserves the prior decision and revision history;
 *   7. approval applies to the exact reviewed DocumentVersion;
 *   8. a newer version never inherits an earlier approval;
 *   9. blocking review points still block approval;
 *   10. the legacy approve path remains valid for the authorized reviewer.
 *
 * These are behavioural: the real service functions execute against a Prisma
 * double that models persisted review/submission state.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const prismaMock: any = {};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));
jest.mock('../src/modules/sharepoint', () => ({
  driveService: { checkinDocument: jest.fn() },
}));

import { transitionReview, permittedReviewActions } from '../src/modules/documents/review/reviewService';
import { approvalAppliesToVersion } from '../src/modules/documents/review/reviewWorkflow';
import { driveService } from '../src/modules/sharepoint';
import documentsService from '../src/modules/documents/services';
import { TaskReviewDecisionService } from '../src/modules/tasks/taskReviewDecision.service';
import { TaskSubmissionService } from '../src/modules/tasks/taskSubmission.service';

const DOC_IDS = { owner: 'owner-1', reviewer: 'reviewer-1', outsider: 'outsider-1' };

function makeDocReview(status: string, opts: { ownerId?: string | null; assignedReviewerId?: string | null; createdById?: string } = {}) {
  return {
    id: 'review-1',
    documentId: 'doc-1',
    documentVersionId: 'ver-2',
    status,
    ownerId: opts.ownerId === undefined ? DOC_IDS.owner : opts.ownerId,
    assignedReviewerId: opts.assignedReviewerId === undefined ? DOC_IDS.reviewer : opts.assignedReviewerId,
    createdById: opts.createdById || DOC_IDS.owner,
    dueAt: null,
    currentRoundNumber: 1,
    currentRoundId: 'round-1',
    currentRound: {
      id: 'round-1', reviewId: 'review-1', roundNumber: 1,
      reviewVersionId: 'ver-2', status, startedAt: new Date(),
      submittedAt: null, completedAt: null, revision: 0,
    },
    approvedVersionId: null,
    revision: 0,
    completedAt: null,
    createdAt: new Date('2026-07-18T08:00:00.000Z'),
    updatedAt: new Date('2026-07-18T08:00:00.000Z'),
    document: { id: 'doc-1', fileName: 'contract.pdf', name: 'contract', caseId: 'case-1', currentVersionInt: 2 },
    owner: { id: DOC_IDS.owner, name: 'Owner', email: 'o@x.invalid' },
    assignedReviewer: { id: DOC_IDS.reviewer, name: 'Reviewer', email: 'r@x.invalid' },
    approvedVersion: null,
    rounds: [{
      id: 'round-1', reviewId: 'review-1', roundNumber: 1,
      reviewVersionId: 'ver-2', status, startedAt: new Date(),
      submittedAt: null, completedAt: null, revision: 0,
    }],
    points: [],
    decisions: [],
  };
}

describe('DocumentReview authority stabilization', () => {
  let review: ReturnType<typeof makeDocReview>;
  let reviewStatusWrites: Array<{ status?: string; approvedVersion?: string }>;
  let versionStatusWrites: Record<string, string>;
  let decisionCreates: any[];
  let timelineCalls: number;
  let checkins: number;
  let documentFolder: string;

  function wireDocMocks(initialStatus: string, opts?: { noComparison?: boolean }) {
    review = makeDocReview(initialStatus);
    reviewStatusWrites = [];
    versionStatusWrites = {};
    decisionCreates = [];
    timelineCalls = 0;
    checkins = 0;
    documentFolder = 'REVIEW';

    prismaMock.documentReview = {
      findFirst: jest.fn().mockResolvedValue(review),
      findUnique: jest.fn().mockImplementation(async () => {
        if (review.status === 'APPROVED') review.approvedVersionId = 'ver-2';
        return review;
      }),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        if (data.status) review.status = data.status;
        if (data.approvedVersion) review.approvedVersionId = data.approvedVersion.connect.id;
        reviewStatusWrites.push({ status: data.status, approvedVersion: data.approvedVersion?.connect?.id });
        review.revision += 1;
        return review;
      }),
    };
    prismaMock.documentReviewRound = {
      update: jest.fn().mockResolvedValue({}),
    };
    prismaMock.documentVersion = {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ver-2', version: 2, previousVersionId: 'ver-1' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'ver-1', version: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'ver-2', version: 2 }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => {
        if (where?.id && data?.reviewStatus) versionStatusWrites[where.id] = data.reviewStatus;
        return {};
      }),
    };
    prismaMock.reviewPoint = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    };
    prismaMock.documentComparison = { findFirst: jest.fn().mockResolvedValue(null) };
    prismaMock.documentChangeSegment = { count: jest.fn().mockResolvedValue(0) };
    prismaMock.reviewDecision = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (args: any) => { decisionCreates.push(args.data); return { id: 'decision-1', ...args.data }; }),
    };
    prismaMock.user = { findUnique: jest.fn().mockImplementation(async ({ where }: any) => ({
      id: where.id, role: 'LAWYER', status: 'ACTIVE', isActive: true,
    })) };
    prismaMock.case = { findUnique: jest.fn().mockResolvedValue({ id: 'case-1', assignedLawyerId: DOC_IDS.owner, createdById: DOC_IDS.owner }) };
    prismaMock.caseCollaborator = {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) =>
        where?.userId === DOC_IDS.reviewer || where?.userId === DOC_IDS.outsider ? { id: `col-${where.userId}` } : null),
    };
    prismaMock.timelineEvent = { create: jest.fn().mockImplementation(async () => { timelineCalls += 1; }) };
    prismaMock.notification = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    };
    prismaMock.document = {
      findUnique: jest.fn().mockResolvedValue({ id: 'doc-1', caseId: 'case-1', fileName: 'contract.pdf', spItemId: 'sp-1' }),
      update: jest.fn().mockImplementation(async ({ data }: any) => { if (data.folder) documentFolder = data.folder; }),
    };
    prismaMock.case = {
      ...prismaMock.case,
      update: jest.fn().mockResolvedValue({}),
    };
    (driveService.checkinDocument as jest.Mock).mockImplementation(async () => { checkins += 1; });
    prismaMock.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prismaMock));
  }

  beforeEach(() => { jest.clearAllMocks(); });

  it('1. the assigned reviewer can decide: APPROVE binds the exact reviewed version', async () => {
    wireDocMocks('IN_REVIEW');
    const result = await transitionReview('review-1', 'APPROVE', { userId: DOC_IDS.reviewer, role: 'LAWYER' }, { versionId: 'ver-2', expectedRevision: 0 }, prismaMock);
    expect(result.status).toBe('APPROVED');
    expect(result.approvedVersionId).toBe('ver-2');
    expect(versionStatusWrites['ver-2']).toBe('APPROVED');
    expect(reviewStatusWrites).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'APPROVED', approvedVersion: 'ver-2' })]));
    // Approval never floats onto another version.
    expect(approvalAppliesToVersion('ver-2', 'ver-1')).toBe(false);
    expect(approvalAppliesToVersion('ver-2', 'ver-2')).toBe(true);
  });

  it('2. an ordinary case collaborator cannot approve, even with case access', async () => {
    wireDocMocks('IN_REVIEW');
    await expect(transitionReview('review-1', 'APPROVE', { userId: DOC_IDS.outsider, role: 'LAWYER' }, { versionId: 'ver-2', expectedRevision: 0 }, prismaMock))
      .rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
    expect(reviewStatusWrites).toHaveLength(0);
    expect(versionStatusWrites['ver-2']).toBeUndefined();
    expect(timelineCalls).toBe(0);
  });

  it('3. an unauthorized actor cannot request changes', async () => {
    wireDocMocks('IN_REVIEW');
    await expect(transitionReview('review-1', 'REQUEST_CHANGES', { userId: DOC_IDS.outsider, role: 'LAWYER' }, { safeRationale: 'Please fix', expectedRevision: 0 }, prismaMock))
      .rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
    expect(review.status).toBe('IN_REVIEW');
    expect(decisionCreates).toHaveLength(0);
  });

  it('4. the review owner remains authorized across the canonical transitions', async () => {
    wireDocMocks('IN_REVIEW');
    const result = await transitionReview('review-1', 'REQUEST_CHANGES', { userId: DOC_IDS.owner, role: 'LAWYER' }, { safeRationale: 'Owner requests changes', expectedRevision: 0 }, prismaMock);
    expect(result.status).toBe('CHANGES_REQUESTED');
  });

  it('5. blocking review points still block approval for the authorized reviewer', async () => {
    wireDocMocks('IN_REVIEW');
    prismaMock.reviewPoint.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(transitionReview('review-1', 'APPROVE', { userId: DOC_IDS.reviewer, role: 'LAWYER' }, { versionId: 'ver-2', expectedRevision: 0 }, prismaMock))
      .rejects.toMatchObject({ code: 'BLOCKING_POINTS_OPEN' });
    expect(review.status).toBe('IN_REVIEW');
  });

  it('6. permitted actions are actor-aware (truthful UI authority)', () => {
    const reviewRow = makeDocReview('IN_REVIEW');
    expect(permittedReviewActions(reviewRow, { userId: DOC_IDS.reviewer })).toContain('APPROVE');
    expect(permittedReviewActions(reviewRow, { userId: DOC_IDS.owner })).toContain('APPROVE');
    expect(permittedReviewActions(reviewRow, { userId: DOC_IDS.outsider })).toEqual([]);
    const legacyReview = makeDocReview('IN_REVIEW', { ownerId: null, createdById: DOC_IDS.owner });
    expect(permittedReviewActions(legacyReview, { userId: DOC_IDS.owner })).toContain('APPROVE');
  });

  it('7. the legacy approve path remains valid for the authorized owner and rejects collaborators', async () => {
    wireDocMocks('IN_REVIEW');
    const ok = await documentsService.approveDocument('doc-1', DOC_IDS.owner, 'Looks good', 'LAWYER');
    expect(ok).toBe(true);
    expect(review.status).toBe('APPROVED');
    expect(documentFolder).toBe('APPROVED');
    expect(checkins).toBe(1);
    expect(timelineCalls).toBeGreaterThan(0);

    wireDocMocks('IN_REVIEW');
    const beforeCheckins = checkins;
    await expect(documentsService.approveDocument('doc-1', DOC_IDS.outsider, 'I approve too', 'LAWYER')).rejects.toThrow('transition is not allowed');
    expect(checkins).toBe(beforeCheckins);
    expect(review.status).toBe('IN_REVIEW');
  });
});

describe('TaskReviewDecision authority stabilization', () => {
  const ids = {
    task: 'task-1',
    worker: 'worker-1',
    reviewer: 'reviewer-1',
    supervisor: 'supervisor-1',
    collaborator: 'collaborator-1',
  };

  const users: Record<string, any> = {
    [ids.worker]: { id: ids.worker, role: 'LAWYER', status: 'ACTIVE', isActive: true },
    [ids.reviewer]: { id: ids.reviewer, role: 'LAWYER', status: 'ACTIVE', isActive: true },
    [ids.supervisor]: { id: ids.supervisor, role: 'PARTNER', status: 'ACTIVE', isActive: true },
    [ids.collaborator]: { id: ids.collaborator, role: 'LAWYER', status: 'ACTIVE', isActive: true },
  };

  const taskRecord = {
    id: ids.task,
    title: 'Review task',
    status: 'IN_REVIEW',
    priority: 'MEDIUM',
    dueDate: null,
    caseId: 'case-1',
    matterId: 'matter-1',
    assignedToId: ids.worker,
    assignedById: ids.supervisor,
    assignedTo: { id: ids.worker, name: 'Worker', email: 'w@x.invalid', role: 'LAWYER' },
    matter: { id: 'matter-1', title: 'Matter' },
    case: {
      id: 'case-1', caseNumber: 'C-1', title: 'Case',
      assignedLawyerId: ids.supervisor, createdById: ids.supervisor,
      client: { id: 'client-1', name: 'Client', colorKey: 'INDIGO' },
    },
  };

  let submission: any;
  let taskMock: any;
  let decisionCreates: any[];
  let submissionCreates: any[];
  let submissionUpdates: any[];

  function makeSubmission(status: string, assignedReviewerId = ids.reviewer, submittedById = ids.worker) {
    return {
      id: 'sub-1',
      taskId: ids.task,
      revisionNumber: 1,
      status,
      createdById: ids.worker,
      submittedById,
      assignedReviewerId,
      workSummary: 'Completed work',
      remainingIssues: null,
      reviewerNote: null,
      requestedAttention: 'DETAILED_REVIEW',
      externalActionRequired: false,
      externalActionType: null,
      zeroTimeConfirmed: false,
      submittedAt: new Date('2026-07-18T08:00:00.000Z'),
      returnedAt: null,
      approvedAt: null,
      supersedesSubmissionId: null,
      externalCompletedAt: null,
      createdAt: new Date('2026-07-18T07:00:00.000Z'),
      updatedAt: new Date('2026-07-18T08:00:00.000Z'),
      idempotencyKey: null,
      createdBy: { id: ids.worker, name: 'Worker', email: 'w@x.invalid', role: 'LAWYER' },
      submittedBy: { id: submittedById, name: 'Submitter', email: 's@x.invalid', role: 'LAWYER' },
      assignedReviewer: { id: assignedReviewerId, name: 'Reviewer', email: 'r@x.invalid', role: 'LAWYER' },
      reviewDecision: null,
      documents: [],
      timeEntries: [],
    };
  }

  function wireTaskMocks(initialStatus = 'SUBMITTED', assignedReviewerId = ids.reviewer, submittedById = ids.worker) {
    submission = makeSubmission(initialStatus, assignedReviewerId, submittedById);
    decisionCreates = [];
    submissionCreates = [];
    submissionUpdates = [];
    taskMock = {
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(taskMock)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      task: {
        findUnique: jest.fn().mockResolvedValue({ ...taskRecord }),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...taskRecord, ...data })),
      },
      taskSubmission: {
        findFirst: jest.fn().mockImplementation(async (args: any) => {
          if (args?.where?.status === 'DRAFT') return null;
          return submission;
        }),
        findMany: jest.fn().mockResolvedValue([submission]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(async ({ data }: any) => {
          submissionUpdates.push(data);
          Object.assign(submission, data);
          return submission;
        }),
        create: jest.fn().mockImplementation(async (args: any) => {
          submissionCreates.push(args.data);
          return {
            id: 'sub-2',
            taskId: ids.task,
            revisionNumber: args.data.revisionNumber,
            status: args.data.status,
            supersedesSubmissionId: args.data.supersedesSubmissionId,
            assignedReviewerId: args.data.assignedReviewerId,
            requestedAttention: args.data.requestedAttention,
            externalActionRequired: args.data.externalActionRequired,
            externalActionType: args.data.externalActionType,
            createdAt: new Date(),
          };
        }),
      },
      user: { findUnique: jest.fn().mockImplementation(async ({ where }: any) => users[where.id] || null) },
      caseCollaborator: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) =>
          where?.userId === ids.collaborator ? { id: 'col-1' } : null),
      },
      taskReviewDecision: {
        create: jest.fn().mockImplementation(async (args: any) => {
          decisionCreates.push(args.data);
          submission.reviewDecision = { id: 'decision-1', ...args.data, createdAt: new Date(), reviewer: users[args.data.reviewerId] };
          return submission.reviewDecision;
        }),
      },
      timelineEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  beforeEach(() => { jest.clearAllMocks(); });

  it('1. the assigned reviewer can decide and sees truthful permitted actions', async () => {
    wireTaskMocks();
    const service = new TaskReviewDecisionService(taskMock as any);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.reviewer);
    expect(detail.permittedActions).toEqual(expect.objectContaining({ return: true, approve: true }));
  });

  it('2. a case collaborator who is not the assigned reviewer cannot approve', async () => {
    wireTaskMocks();
    const service = new TaskReviewDecisionService(taskMock as any);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.collaborator);
    expect(detail.permittedActions).toEqual(expect.objectContaining({ return: false, approve: false }));
    await expect(service.approveSubmission(ids.task, 'sub-1', ids.collaborator, 'collab-approve-key', detail.reviewVersion, {}))
      .rejects.toMatchObject({ statusCode: 403, code: 'REVIEW_FORBIDDEN' });
    expect(decisionCreates).toHaveLength(0);
  });

  it('3. a scoped supervisor who is not the assigned reviewer cannot decide', async () => {
    wireTaskMocks();
    const service = new TaskReviewDecisionService(taskMock as any);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.supervisor);
    expect(detail.permittedActions).toEqual(expect.objectContaining({ return: false, approve: false }));
    await expect(service.returnSubmission(
      ids.task, 'sub-1', ids.supervisor, 'supervisor-return-key', detail.reviewVersion,
      { note: 'Fix it', requestedCorrections: 'Fix clause 4', requiresFullReview: false },
    )).rejects.toMatchObject({ statusCode: 403, code: 'REVIEW_FORBIDDEN' });
  });

  it('4. the submitter cannot self-approve and a self-assigned review is blocked', async () => {
    wireTaskMocks();
    const service = new TaskReviewDecisionService(taskMock as any);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.worker);
    await expect(service.approveSubmission(ids.task, 'sub-1', ids.worker, 'worker-approve-key', detail.reviewVersion, {}))
      .rejects.toMatchObject({ statusCode: 403, code: 'REVIEW_FORBIDDEN' });

    wireTaskMocks('SUBMITTED', ids.worker, ids.worker);
    const selfService = new TaskReviewDecisionService(taskMock as any);
    const selfDetail = await selfService.getReviewDetail(ids.task, 'sub-1', ids.worker);
    await expect(selfService.approveSubmission(ids.task, 'sub-1', ids.worker, 'self-approve-key', selfDetail.reviewVersion, {}))
      .rejects.toMatchObject({ statusCode: 409, code: 'SELF_REVIEW_NOT_ALLOWED' });
  });

  it('5. the return rationale and correction instructions persist with the decision', async () => {
    wireTaskMocks();
    const service = new TaskReviewDecisionService(taskMock as any);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.reviewer);
    await service.returnSubmission(
      ids.task, 'sub-1', ids.reviewer, 'return-key', detail.reviewVersion,
      { note: 'Please correct the reference.', requestedCorrections: 'Fix clause 4 and the date.', requiresFullReview: true },
    );
    expect(decisionCreates).toHaveLength(1);
    expect(decisionCreates[0]).toEqual(expect.objectContaining({
      decision: 'RETURNED',
      reviewerId: ids.reviewer,
      note: 'Please correct the reference.',
      requestedCorrections: 'Fix clause 4 and the date.',
      requiresFullReview: true,
    }));
    expect(submissionUpdates).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'RETURNED' })]));
  });

  it('6. resubmission preserves the prior decision and revision history', async () => {
    wireTaskMocks();
    const service = new TaskReviewDecisionService(taskMock as any);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.reviewer);
    await service.returnSubmission(
      ids.task, 'sub-1', ids.reviewer, 'return-key', detail.reviewVersion,
      { note: 'Please correct.', requestedCorrections: 'Fix clause 4.', requiresFullReview: false },
    );
    const updatesBeforeRevise = submissionUpdates.length;
    const decisionsBeforeRevise = decisionCreates.length;

    const revised = await service.reviseSubmission(ids.task, 'sub-1', ids.worker, 'revise-key');
    expect(revised.idempotentReplay).toBe(false);
    expect(submissionCreates).toHaveLength(1);
    expect(submissionCreates[0]).toEqual(expect.objectContaining({
      revisionNumber: 2,
      status: 'DRAFT',
      supersedesSubmissionId: 'sub-1',
    }));
    // The historical decision row and the returned revision are never mutated.
    expect(decisionCreates).toHaveLength(decisionsBeforeRevise);
    expect(submissionUpdates).toHaveLength(updatesBeforeRevise);
    expect(submission.reviewDecision).toEqual(expect.objectContaining({ decision: 'RETURNED' }));
  });
});

describe('TaskSubmission exact-version binding', () => {
  it('binds an attached output to the document version current at attach time', async () => {
    const attachMock: any = {
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(attachMock)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      task: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: 'Task',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          dueDate: null,
          caseId: 'case-1',
          matterId: 'matter-1',
          assignedToId: 'worker-1',
          assignedById: 'supervisor-1',
          assignedTo: { id: 'worker-1', name: 'Worker', email: 'w@x.invalid', role: 'LAWYER' },
          case: {
            id: 'case-1', caseNumber: 'C-1', title: 'Case', matterId: 'matter-1',
            assignedLawyerId: 'supervisor-1', createdById: 'supervisor-1',
            client: { id: 'client-1', name: 'Client' },
          },
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'worker-1', role: 'LAWYER' }) },
      case: { findUnique: jest.fn().mockResolvedValue({ assignedLawyerId: 'supervisor-1', createdById: 'supervisor-1' }) },
      caseCollaborator: { findFirst: jest.fn().mockResolvedValue(null) },
      taskSubmission: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sub-1', taskId: 'task-1', revisionNumber: 1, status: 'DRAFT',
          createdById: 'worker-1', assignedReviewerId: 'reviewer-1',
          workSummary: null, remainingIssues: null, reviewerNote: null,
          requestedAttention: null, externalActionRequired: false, externalActionType: null,
          zeroTimeConfirmed: false, submittedAt: null, returnedAt: null, approvedAt: null,
          supersedesSubmissionId: null, externalCompletedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
          createdBy: { id: 'worker-1', name: 'Worker', email: 'w@x.invalid', role: 'LAWYER' },
          submittedBy: null,
          assignedReviewer: { id: 'reviewer-1', name: 'Reviewer', email: 'r@x.invalid', role: 'LAWYER' },
          reviewDecision: null,
          documents: [],
          timeEntries: [],
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      document: { findFirst: jest.fn().mockResolvedValue({ id: 'doc-1' }) },
      documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'ver-2' }) },
      taskSubmissionDocument: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const service = new TaskSubmissionService(attachMock as any);
    await service.attachSubmissionDocument('task-1', 'sub-1', 'worker-1', { documentId: 'doc-1', role: 'PRIMARY_OUTPUT' });

    expect(attachMock.taskSubmissionDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        submissionId: 'sub-1',
        documentId: 'doc-1',
        documentVersionId: 'ver-2',
        role: 'PRIMARY_OUTPUT',
      }),
    }));
  });
});
