/**
 * RESPONSIBLE-LAWYER LEADÁS workflow (INTERNAL_WORKFLOW_SLICE_2) — focused
 * behavioural tests.
 *
 * Locks the WORKER → LEADÁS → RESPONSIBLE LAWYER → EXACT VERSION REVIEW →
 * RETURN → REVISE → RESUBMIT → APPROVE invariants without a database:
 *
 *   1. the case responsible lawyer wins over the task assigner for Leadás;
 *   2. a missing responsible lawyer blocks Leadás (fail closed);
 *   3. an inactive/ineligible responsible lawyer blocks Leadás;
 *   4. a responsible-lawyer/worker self conflict fails closed;
 *   5. the worker cannot tamper the reviewer to another user;
 *   6. an exact documentVersionId is required before submission;
 *   7. a newer current version never silently replaces the submitted version;
 *   8. only the assigned lawyer gets an actionable queue item;
 *   9. collaborators/supervisors get read-only queue rows, never decisions;
 *   10. the review DTO exposes the exact submitted version identity;
 *   11. a worker-created DocumentReview cannot self-approve;
 *   12. a stale If-Match decision attempt fails closed;
 *   13. an idempotent replay and a conflicting double decision behave;
 *   14. revise pins the newly selected exact version.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from 'crypto';

const prismaDouble: any = {};

jest.mock('../src/config/database', () => ({ __esModule: true, default: prismaDouble }));
jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaDouble }));

import { TaskSubmissionService } from '../src/modules/tasks/taskSubmission.service';
import { TaskReviewDecisionService } from '../src/modules/tasks/taskReviewDecision.service';
import { closeCase, getCaseLifecycle } from '../src/modules/cases/lifecycleService';
import { transitionReview, actorCanDecideReview } from '../src/modules/documents/review/reviewService';

const IDS = {
  task: 'task-1',
  worker: 'worker-1',
  lawyer: 'lawyer-1',
  supervisor: 'supervisor-1',
  outsider: 'outsider-1',
  collaborator: 'collaborator-1',
  case: 'case-1',
  doc: 'doc-1',
  ver2: 'ver-2',
  ver3: 'ver-3',
};

const USERS: Record<string, any> = {
  [IDS.worker]: { id: IDS.worker, role: 'TRAINEE', status: 'ACTIVE', isActive: true, name: 'Worker', email: 'w@x.invalid' },
  [IDS.lawyer]: { id: IDS.lawyer, role: 'LAWYER', status: 'ACTIVE', isActive: true, name: 'Lawyer', email: 'l@x.invalid' },
  [IDS.supervisor]: { id: IDS.supervisor, role: 'PARTNER', status: 'ACTIVE', isActive: true, name: 'Supervisor', email: 's@x.invalid' },
  [IDS.outsider]: { id: IDS.outsider, role: 'LAWYER', status: 'ACTIVE', isActive: true, name: 'Outsider', email: 'o@x.invalid' },
  [IDS.collaborator]: { id: IDS.collaborator, role: 'COLLAB_LAWYER', status: 'ACTIVE', isActive: true, name: 'Collaborator', email: 'c@x.invalid' },
};

function taskRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.task,
    title: 'Leadás task',
    description: null,
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    dueDate: null,
    caseId: IDS.case,
    matterId: 'matter-1',
    assignedToId: IDS.worker,
    assignedById: IDS.supervisor,
    assignedTo: { id: IDS.worker, name: 'Worker', email: 'w@x.invalid', role: 'TRAINEE' },
    case: {
      id: IDS.case,
      caseNumber: 'C-1',
      title: 'Case',
      matterId: 'matter-1',
      assignedLawyerId: IDS.lawyer,
      createdById: IDS.supervisor,
      assignedLawyer: { id: IDS.lawyer, name: 'Lawyer', email: 'l@x.invalid', role: 'LAWYER' },
      client: { id: 'client-1', name: 'Client' },
    },
    ...overrides,
  };
}

function draftRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    taskId: IDS.task,
    revisionNumber: 1,
    status: 'DRAFT',
    createdById: IDS.worker,
    submittedById: null,
    assignedReviewerId: IDS.lawyer,
    workSummary: 'Work done',
    remainingIssues: null,
    reviewerNote: null,
    requestedAttention: 'DETAILED_REVIEW',
    externalActionRequired: false,
    externalActionType: null,
    zeroTimeConfirmed: true,
    submittedAt: null,
    returnedAt: null,
    approvedAt: null,
    supersedesSubmissionId: null,
    externalCompletedAt: null,
    createdAt: new Date('2026-09-30T08:00:00.000Z'),
    updatedAt: new Date('2026-09-30T08:00:00.000Z'),
    idempotencyKey: null,
    createdBy: { id: IDS.worker, name: 'Worker', email: 'w@x.invalid', role: 'TRAINEE' },
    submittedBy: null,
    assignedReviewer: { id: IDS.lawyer, name: 'Lawyer', email: 'l@x.invalid', role: 'LAWYER' },
    reviewDecision: null,
    documents: [],
    timeEntries: [],
    ...overrides,
  };
}

function documentLink(documentVersionId: string | null, currentVersionId = IDS.ver2) {
  return {
    id: 'link-1',
    documentId: IDS.doc,
    documentVersionId,
    role: 'PRIMARY_OUTPUT',
    createdAt: new Date('2026-09-30T08:00:00.000Z'),
    document: {
      id: IDS.doc,
      name: 'Output',
      fileName: 'output.docx',
      category: 'OTHER',
      currentVersion: currentVersionId === IDS.ver3 ? 3 : 2,
      caseId: IDS.case,
      versions: [{ id: currentVersionId }],
    },
    documentVersion: documentVersionId
      ? { id: documentVersionId, version: documentVersionId === IDS.ver3 ? 3 : 2 }
      : null,
  };
}

function wireSubmissionMocks(options: {
  actorRole?: string;
  caseLawyerId?: string | null;
  lawyerActive?: boolean;
  lawyerRole?: string;
  task?: any;
  draft?: any;
} = {}) {
  const actorRole = options.actorRole ?? 'TRAINEE';
  const caseLawyerId = options.caseLawyerId === undefined ? IDS.lawyer : options.caseLawyerId;
  const task = options.task ?? taskRecord({
    case: {
      ...taskRecord().case,
      assignedLawyerId: caseLawyerId,
      assignedLawyer: caseLawyerId === IDS.lawyer
        ? { id: IDS.lawyer, name: 'Lawyer', email: 'l@x.invalid', role: options.lawyerRole ?? 'LAWYER' }
        : null,
    },
  });

  prismaDouble.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prismaDouble));
  prismaDouble.$queryRaw = jest.fn().mockResolvedValue([{ status: 'IN_REVIEW' }]);
  prismaDouble.task = {
    findUnique: jest.fn().mockResolvedValue(task),
    update: jest.fn().mockResolvedValue({}),
  };
  prismaDouble.user = {
    findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where.id === IDS.worker) return { ...USERS[IDS.worker], role: actorRole };
      if (where.id === IDS.lawyer) {
        const user = { ...USERS[IDS.lawyer], role: options.lawyerRole ?? 'LAWYER' };
        if (options.lawyerActive === false) user.isActive = false;
        return user;
      }
      return USERS[where.id] || null;
    }),
  };
  prismaDouble.case = {
    findUnique: jest.fn().mockResolvedValue({ id: IDS.case, assignedLawyerId: caseLawyerId, createdById: IDS.supervisor }),
  };
  prismaDouble.caseCollaborator = { findFirst: jest.fn().mockResolvedValue(null) };
  prismaDouble.taskSubmission = {
    findFirst: jest.fn().mockResolvedValue(options.draft ?? null),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'sub-new', ...data })),
    update: jest.fn().mockImplementation(async ({ data, include }: any) => {
      const merged = { ...(options.draft ?? draftRecord()), ...data };
      return include ? merged : merged;
    }),
  };
  prismaDouble.timelineEvent = { create: jest.fn().mockResolvedValue({}) };
  prismaDouble.notification = { create: jest.fn().mockResolvedValue({}) };
  return task;
}

describe('Responsible-lawyer Leadás routing', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('1. the case responsible lawyer wins over the task assigner for Leadás', async () => {
    wireSubmissionMocks({ actorRole: 'TRAINEE' });
    const service = new TaskSubmissionService(prismaDouble);
    await service.createTaskSubmissionDraft(IDS.task, IDS.worker, {});
    expect(prismaDouble.taskSubmission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignedReviewerId: IDS.lawyer }),
    }));
  });

  it('2. a missing responsible lawyer blocks Leadás (fail closed, no fallback)', async () => {
    wireSubmissionMocks({ actorRole: 'TRAINEE', caseLawyerId: null });
    const service = new TaskSubmissionService(prismaDouble);
    await expect(service.createTaskSubmissionDraft(IDS.task, IDS.worker, {}))
      .rejects.toMatchObject({ code: 'RESPONSIBLE_LAWYER_MISSING', statusCode: 409 });
    expect(prismaDouble.taskSubmission.create).not.toHaveBeenCalled();
  });

  it('3. an inactive responsible lawyer blocks Leadás', async () => {
    wireSubmissionMocks({ actorRole: 'TRAINEE', lawyerActive: false });
    const service = new TaskSubmissionService(prismaDouble);
    await expect(service.createTaskSubmissionDraft(IDS.task, IDS.worker, {}))
      .rejects.toMatchObject({ code: 'RESPONSIBLE_LAWYER_INELIGIBLE', statusCode: 409 });
  });

  it('4. a responsible-lawyer/worker self conflict fails closed', async () => {
    wireSubmissionMocks({ actorRole: 'TRAINEE', caseLawyerId: IDS.worker });
    const service = new TaskSubmissionService(prismaDouble);
    await expect(service.createTaskSubmissionDraft(IDS.task, IDS.worker, {}))
      .rejects.toMatchObject({ code: 'SELF_REVIEW_NOT_ALLOWED', statusCode: 409 });
  });

  it('5. the worker cannot tamper the reviewer to another user', async () => {
    wireSubmissionMocks({ actorRole: 'TRAINEE', draft: draftRecord() });
    const service = new TaskSubmissionService(prismaDouble);
    await expect(service.updateTaskSubmissionDraft(IDS.task, 'sub-1', IDS.worker, { assignedReviewerId: IDS.supervisor }))
      .rejects.toMatchObject({ code: 'REVIEWER_MUST_BE_RESPONSIBLE_LAWYER', statusCode: 403 });
  });

  it('5b. a decision-capable actor keeps the existing non-final reviewer behavior', async () => {
    wireSubmissionMocks({ actorRole: 'PARTNER', draft: draftRecord() });
    prismaDouble.caseCollaborator.findFirst.mockResolvedValue({ id: 'col-out' });
    const service = new TaskSubmissionService(prismaDouble);
    await service.updateTaskSubmissionDraft(IDS.task, 'sub-1', IDS.supervisor, { assignedReviewerId: IDS.outsider });
    expect(prismaDouble.taskSubmission.update).toHaveBeenCalled();
  });

  function staleReviewerDraft() {
    return draftRecord({
      assignedReviewerId: IDS.supervisor,
      assignedReviewer: { id: IDS.supervisor, name: 'Supervisor', email: 's@x.invalid', role: 'PARTNER' },
    });
  }

  it('5c. a worker draft with a stale existing reviewer can still save non-reviewer fields', async () => {
    wireSubmissionMocks({ actorRole: 'TRAINEE', draft: staleReviewerDraft() });
    const service = new TaskSubmissionService(prismaDouble);
    await service.updateTaskSubmissionDraft(IDS.task, 'sub-1', IDS.worker, {
      workSummary: 'Updated summary',
      assignedReviewerId: IDS.supervisor,
    });
    expect(prismaDouble.taskSubmission.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workSummary: 'Updated summary' }),
    }));
  });

  it('5d. a worker cannot change a stale reviewer to an arbitrary third party', async () => {
    wireSubmissionMocks({ actorRole: 'TRAINEE', draft: staleReviewerDraft() });
    const service = new TaskSubmissionService(prismaDouble);
    await expect(service.updateTaskSubmissionDraft(IDS.task, 'sub-1', IDS.worker, { assignedReviewerId: IDS.outsider }))
      .rejects.toMatchObject({ code: 'REVIEWER_MUST_BE_RESPONSIBLE_LAWYER', statusCode: 403 });
    expect(prismaDouble.taskSubmission.update).not.toHaveBeenCalled();
  });

  it('5e. a worker can reconcile a stale reviewer to the current responsible lawyer', async () => {
    wireSubmissionMocks({ actorRole: 'TRAINEE', draft: staleReviewerDraft() });
    const service = new TaskSubmissionService(prismaDouble);
    await service.updateTaskSubmissionDraft(IDS.task, 'sub-1', IDS.worker, { assignedReviewerId: IDS.lawyer });
    expect(prismaDouble.taskSubmission.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignedReviewer: { connect: { id: IDS.lawyer } } }),
    }));
  });

  it('6. an exact documentVersionId is required before submission', async () => {
    wireSubmissionMocks({
      actorRole: 'TRAINEE',
      draft: draftRecord({ documents: [documentLink(null)] }),
    });
    const service = new TaskSubmissionService(prismaDouble);
    const readiness = await service.validateSubmissionReadiness(IDS.task, 'sub-1', IDS.worker);
    expect(readiness.missingPrerequisites).toContain('EXACT_VERSION_REQUIRED');
  });

  it('7. a newer current version never silently replaces the submitted version', async () => {
    wireSubmissionMocks({
      actorRole: 'TRAINEE',
      draft: draftRecord({ documents: [documentLink(IDS.ver2, IDS.ver3)] }),
    });
    const service = new TaskSubmissionService(prismaDouble);
    await expect(service.submitTaskSubmission(IDS.task, 'sub-1', IDS.worker, 'submit-key', []))
      .rejects.toMatchObject({ code: 'EXACT_VERSION_CONFIRMATION_REQUIRED', statusCode: 409 });
    await expect(service.submitTaskSubmission(IDS.task, 'sub-1', IDS.worker, 'submit-key-2', [IDS.ver2]))
      .resolves.toEqual(expect.objectContaining({ idempotentReplay: false }));
  });

  it('7b. submission with a stale reviewer still fails closed until routing is reconciled', async () => {
    wireSubmissionMocks({
      actorRole: 'TRAINEE',
      draft: draftRecord({
        assignedReviewerId: IDS.supervisor,
        assignedReviewer: { id: IDS.supervisor, name: 'Supervisor', email: 's@x.invalid', role: 'PARTNER' },
        documents: [documentLink(IDS.ver2, IDS.ver2)],
      }),
    });
    const service = new TaskSubmissionService(prismaDouble);
    await expect(service.submitTaskSubmission(IDS.task, 'sub-1', IDS.worker, 'stale-submit-key', [IDS.ver2]))
      .rejects.toMatchObject({ code: 'REVIEWER_MUST_BE_RESPONSIBLE_LAWYER', statusCode: 409 });
    expect(prismaDouble.taskSubmission.update).not.toHaveBeenCalled();
  });

  it('7c. a normal current-responsible-lawyer draft still saves and submits', async () => {
    wireSubmissionMocks({
      actorRole: 'TRAINEE',
      draft: draftRecord({ documents: [documentLink(IDS.ver2, IDS.ver2)] }),
    });
    const service = new TaskSubmissionService(prismaDouble);
    await service.updateTaskSubmissionDraft(IDS.task, 'sub-1', IDS.worker, { workSummary: 'Updated', assignedReviewerId: IDS.lawyer });
    await expect(service.submitTaskSubmission(IDS.task, 'sub-1', IDS.worker, 'normal-submit-key', [IDS.ver2]))
      .resolves.toEqual(expect.objectContaining({ idempotentReplay: false }));
  });
});

describe('Review queue authority', () => {
  function queueRow(assignedReviewerId: string) {
    return {
      id: 'sub-1',
      taskId: IDS.task,
      revisionNumber: 1,
      status: 'SUBMITTED',
      requestedAttention: 'DETAILED_REVIEW',
      externalActionRequired: false,
      workSummary: 'A summary',
      submittedAt: new Date('2026-09-30T09:00:00.000Z'),
      submittedBy: { id: IDS.worker, name: 'Worker', email: 'w@x.invalid', role: 'TRAINEE' },
      assignedReviewer: { id: assignedReviewerId, name: 'Reviewer', email: 'r@x.invalid', role: 'LAWYER' },
      documents: [{ id: 'link-1', documentId: IDS.doc, documentVersionId: IDS.ver2, role: 'PRIMARY_OUTPUT' }],
      task: {
        id: IDS.task,
        title: 'Task',
        status: 'IN_REVIEW',
        priority: 'MEDIUM',
        dueDate: null,
        case: {
          id: IDS.case, caseNumber: 'C-1', title: 'Case', clientId: 'client-1', clientName: 'Client',
          matterType: 'OTHER', client: { colorKey: null },
        },
      },
      _count: { documents: 1 },
      timeEntries: [{ timeEntry: { minutes: 30 } }],
    };
  }

  function wireQueue(assignedReviewerId = IDS.lawyer) {
    prismaDouble.user = { findUnique: jest.fn().mockResolvedValue({ id: 'user-x', role: 'LAWYER' }) };
    prismaDouble.taskSubmission = { findMany: jest.fn().mockResolvedValue([queueRow(assignedReviewerId)]) };
  }

  beforeEach(() => { jest.clearAllMocks(); });

  it('8. only the assigned lawyer gets an actionable queue item', async () => {
    wireQueue(IDS.lawyer);
    const service = new TaskSubmissionService(prismaDouble);
    const queue = await service.getSubmissionReviewQueue(IDS.lawyer);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(expect.objectContaining({
      source: 'TASK_SUBMISSION',
      actionable: true,
      readOnly: false,
      nextActionCode: 'OPEN_REVIEW',
      attentionEstimate: { minMinutes: 60, maxMinutes: 120 },
      documentVersions: [expect.objectContaining({ documentId: IDS.doc, documentVersionId: IDS.ver2 })],
    }));
  });

  it('9. a collaborator/supervisor never gets an actionable decision item', async () => {
    wireQueue(IDS.lawyer);
    const service = new TaskSubmissionService(prismaDouble);
    const collaboratorQueue = await service.getSubmissionReviewQueue(IDS.collaborator);
    expect(collaboratorQueue[0]).toEqual(expect.objectContaining({ actionable: false, readOnly: true, nextActionCode: 'VIEW_SUBMISSION' }));
    const supervisorQueue = await service.getSubmissionReviewQueue(IDS.supervisor);
    expect(supervisorQueue[0]).toEqual(expect.objectContaining({ actionable: false, readOnly: true, nextActionCode: 'VIEW_SUBMISSION' }));
  });
});

describe('Document review self-approval guard', () => {
  function makeDocReview(status: string) {
    return {
      id: 'review-1',
      documentId: IDS.doc,
      documentVersionId: IDS.ver2,
      status,
      ownerId: IDS.worker,
      assignedReviewerId: IDS.worker,
      createdById: IDS.worker,
      dueAt: null,
      currentRoundNumber: 1,
      currentRoundId: 'round-1',
      currentRound: {
        id: 'round-1', reviewId: 'review-1', roundNumber: 1,
        reviewVersionId: IDS.ver2, status, startedAt: new Date(),
        submittedAt: null, completedAt: null, revision: 0,
      },
      approvedVersionId: null,
      revision: 0,
      completedAt: null,
      createdAt: new Date('2026-09-30T08:00:00.000Z'),
      updatedAt: new Date('2026-09-30T08:00:00.000Z'),
      document: { id: IDS.doc, fileName: 'output.docx', name: 'output', caseId: IDS.case, currentVersionInt: 2 },
      owner: { id: IDS.worker, name: 'Worker', email: 'w@x.invalid' },
      assignedReviewer: { id: IDS.worker, name: 'Worker', email: 'w@x.invalid' },
      approvedVersion: null,
      rounds: [{
        id: 'round-1', reviewId: 'review-1', roundNumber: 1,
        reviewVersionId: IDS.ver2, status, startedAt: new Date(),
        submittedAt: null, completedAt: null, revision: 0,
      }],
      points: [],
      decisions: [],
    };
  }

  function wireDocReview(actorRole: string) {
    const review = makeDocReview('IN_REVIEW');
    prismaDouble.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prismaDouble));
    prismaDouble.$queryRaw = jest.fn().mockResolvedValue([{ status: 'IN_REVIEW' }]);
    prismaDouble.documentReview = {
      findUnique: jest.fn().mockImplementation(async () => {
        if (review.status === 'APPROVED') review.approvedVersionId = IDS.ver2;
        return review;
      }),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        if (data.status) review.status = data.status;
        if (data.approvedVersion) review.approvedVersionId = data.approvedVersion.connect.id;
        review.revision += 1;
        return review;
      }),
    };
    prismaDouble.documentReviewRound = { update: jest.fn().mockResolvedValue({}) };
    prismaDouble.reviewPoint = { count: jest.fn().mockResolvedValue(0) };
    prismaDouble.documentVersion = {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: IDS.ver2, version: 2, previousVersionId: null }),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: IDS.ver2, version: 2 }),
      update: jest.fn().mockResolvedValue({}),
    };
    prismaDouble.documentComparison = { findFirst: jest.fn().mockResolvedValue(null) };
    prismaDouble.documentChangeSegment = { count: jest.fn().mockResolvedValue(0) };
    prismaDouble.reviewDecision = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'decision-1' }),
    };
    prismaDouble.user = { findUnique: jest.fn().mockResolvedValue({ id: IDS.worker, role: actorRole, status: 'ACTIVE', isActive: true }) };
    prismaDouble.case = { findUnique: jest.fn().mockResolvedValue({ id: IDS.case, assignedLawyerId: IDS.worker, createdById: IDS.worker }) };
    prismaDouble.caseCollaborator = { findFirst: jest.fn().mockResolvedValue(null) };
    prismaDouble.timelineEvent = { create: jest.fn().mockResolvedValue({}) };
    prismaDouble.notification = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) };
  }

  beforeEach(() => { jest.clearAllMocks(); });

  it('11. a worker-created DocumentReview cannot self-approve (403, not 400)', async () => {
    wireDocReview('TRAINEE');
    await expect(transitionReview('review-1', 'APPROVE', { userId: IDS.worker, role: 'TRAINEE' }, { versionId: IDS.ver2, expectedRevision: 0 }, prismaDouble))
      .rejects.toMatchObject({ code: 'DECISION_AUTHORITY_MISSING', status: 403 });
  });

  it('11b. a decision-role owner keeps the legacy document approval path', async () => {
    wireDocReview('LAWYER');
    const result = await transitionReview('review-1', 'APPROVE', { userId: IDS.worker, role: 'LAWYER' }, { versionId: IDS.ver2, expectedRevision: 0 }, prismaDouble);
    expect(result.status).toBe('APPROVED');
  });

  it('11c. actorCanDecideReview is role-aware and legacy-safe', () => {
    expect(actorCanDecideReview({ userId: IDS.worker, role: 'TRAINEE' })).toBe(false);
    expect(actorCanDecideReview({ userId: IDS.worker, role: 'LEGAL_ASSISTANT' })).toBe(false);
    expect(actorCanDecideReview({ userId: IDS.worker, role: 'LAWYER' })).toBe(true);
    expect(actorCanDecideReview({ userId: IDS.worker })).toBe(true);
  });
});

describe('Review decision ETag and idempotency contract', () => {
  const ids = { task: IDS.task, worker: IDS.worker, reviewer: IDS.lawyer };
  let submission: any;
  let taskMock: any;
  let decisionCreates: any[];

  function makeSubmission(status: string) {
    return {
      id: 'sub-1',
      taskId: ids.task,
      revisionNumber: 1,
      status,
      createdById: ids.worker,
      submittedById: ids.worker,
      assignedReviewerId: ids.reviewer,
      workSummary: 'Completed work',
      remainingIssues: null,
      reviewerNote: null,
      requestedAttention: 'DETAILED_REVIEW',
      externalActionRequired: false,
      externalActionType: null,
      zeroTimeConfirmed: false,
      submittedAt: new Date('2026-09-30T08:00:00.000Z'),
      returnedAt: null,
      approvedAt: null,
      supersedesSubmissionId: null,
      externalCompletedAt: null,
      createdAt: new Date('2026-09-30T07:00:00.000Z'),
      updatedAt: new Date('2026-09-30T08:00:00.000Z'),
      idempotencyKey: null,
      createdBy: { id: ids.worker, name: 'Worker', email: 'w@x.invalid', role: 'TRAINEE' },
      submittedBy: { id: ids.worker, name: 'Worker', email: 'w@x.invalid', role: 'TRAINEE' },
      assignedReviewer: { id: ids.reviewer, name: 'Reviewer', email: 'r@x.invalid', role: 'LAWYER' },
      reviewDecision: null,
      documents: [],
      timeEntries: [],
    };
  }

  const reviewTaskRecord = {
    id: ids.task,
    title: 'Review task',
    status: 'IN_REVIEW',
    priority: 'MEDIUM',
    dueDate: null,
    caseId: IDS.case,
    matterId: 'matter-1',
    assignedToId: ids.worker,
    assignedById: IDS.supervisor,
    assignedTo: { id: ids.worker, name: 'Worker', email: 'w@x.invalid', role: 'TRAINEE' },
    matter: { id: 'matter-1', title: 'Matter' },
    case: {
      id: IDS.case, caseNumber: 'C-1', title: 'Case',
      assignedLawyerId: ids.reviewer, createdById: IDS.supervisor,
      client: { id: 'client-1', name: 'Client', colorKey: 'INDIGO' },
    },
  };

  function wireDecisionMocks() {
    submission = makeSubmission('SUBMITTED');
    decisionCreates = [];
    taskMock = {
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(taskMock)),
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'IN_REVIEW' }]),
      task: {
        findUnique: jest.fn().mockResolvedValue({ ...reviewTaskRecord }),
        update: jest.fn().mockResolvedValue({}),
      },
      taskSubmission: {
        findFirst: jest.fn().mockImplementation(async () => submission),
        findMany: jest.fn().mockResolvedValue([submission]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(async ({ data }: any) => Object.assign(submission, data)),
      },
      user: { findUnique: jest.fn().mockImplementation(async ({ where }: any) => USERS[where.id] || null) },
      caseCollaborator: { findFirst: jest.fn().mockResolvedValue(null) },
      taskReviewDecision: {
        create: jest.fn().mockImplementation(async (args: any) => {
          decisionCreates.push(args.data);
          submission.reviewDecision = { id: 'decision-1', ...args.data, createdAt: new Date(), reviewer: USERS[args.data.reviewerId] };
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

  it('12. a stale If-Match decision attempt fails closed', async () => {
    wireDecisionMocks();
    const service = new TaskReviewDecisionService(taskMock as any);
    await expect(service.approveSubmission(ids.task, 'sub-1', ids.reviewer, 'approve-key', 'stale-version', {}))
      .rejects.toMatchObject({ statusCode: 412, code: 'REVIEW_VERSION_STALE' });
    expect(decisionCreates).toHaveLength(0);
  });

  it('13. a double decision is idempotent on replay and conflicting on a new key', async () => {
    wireDecisionMocks();
    const service = new TaskReviewDecisionService(taskMock as any);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.reviewer);
    const requestFingerprint = createHash('sha256').update(JSON.stringify({ note: null })).digest('hex');
    const first = await service.approveSubmission(ids.task, 'sub-1', ids.reviewer, 'approve-key', detail.reviewVersion, {});
    expect(first.idempotentReplay).toBe(false);
    expect(decisionCreates).toHaveLength(1);

    taskMock.timelineEvent.findUnique.mockResolvedValue({
      metadata: { operation: 'APPROVE', taskId: ids.task, submissionId: 'sub-1', actorId: ids.reviewer, requestFingerprint },
    });
    const replay = await service.approveSubmission(ids.task, 'sub-1', ids.reviewer, 'approve-key', detail.reviewVersion, {});
    expect(replay.idempotentReplay).toBe(true);
    expect(decisionCreates).toHaveLength(1);

    taskMock.timelineEvent.findUnique.mockResolvedValue(null);
    const freshDetail = await service.getReviewDetail(ids.task, 'sub-1', ids.reviewer);
    await expect(service.approveSubmission(ids.task, 'sub-1', ids.reviewer, 'second-key', freshDetail.reviewVersion, {}))
      .rejects.toMatchObject({ statusCode: 409, code: 'REVIEW_ALREADY_DECIDED' });
  });

  it.each([
    ['DRAFT', true], ['PREPARED', true], ['SUBMITTED', true], ['IN_REVIEW', true],
    ['APPROVED', false], ['REJECTED', false], ['ARCHIVED', false],
  ])('canonical approval leaves legacy %s and its independent closure count unchanged', async (status, blocksClosure) => {
    wireDecisionMocks();
    const legacy = {
      id: 'legacy-package', caseId: IDS.case, status, packageType: 'FINAL_APPROVAL',
      preparedById: ids.worker, preparerSummary: 'Unrelated legacy work',
      sourceDocumentId: IDS.doc, anonymizedDocumentId: 'anon-1', generatedContractId: 'generation-1',
      legalAnalysisId: 'analysis-1', reviewNotesId: 'notes-1', reviewDecision: null,
    };
    const original = { ...legacy };
    const currentTask = { ...reviewTaskRecord };
    taskMock.task.findUnique.mockImplementation(async () => currentTask);
    taskMock.task.update.mockImplementation(async ({ data }: any) => Object.assign(currentTask, data));
    taskMock.task.count = jest.fn(async ({ where }: any) => {
      if (where.dueDate) return 0;
      return Number(where.status.in
        ? where.status.in.includes(currentTask.status)
        : !where.status.notIn.includes(currentTask.status));
    });
    taskMock.taskSubmission.count = jest.fn(async ({ where }: any) =>
      Number(submission.status === where.status && (!where.externalActionRequired || submission.externalActionRequired)));
    taskMock.lawyerHandoffPackage = {
      count: jest.fn(async ({ where }: any) => Number(where.caseId === legacy.caseId && where.status.in.includes(legacy.status))),
      create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
    };
    taskMock.case = {
      findUnique: jest.fn().mockResolvedValue({
        ...reviewTaskRecord.case, status: 'IN_REVIEW', completedAt: null,
        createdAt: new Date('2026-09-30T07:00:00Z'), updatedAt: new Date('2026-09-30T08:00:00Z'),
        receivedAt: null, assignedLawyer: { id: ids.reviewer, name: 'Reviewer' },
      }),
      count: jest.fn().mockResolvedValue(0), update: jest.fn(),
    };
    taskMock.documentReview = { count: jest.fn().mockResolvedValue(0) };
    taskMock.reviewPoint = { count: jest.fn().mockResolvedValue(0) };
    taskMock.taskSubmissionDocument = { findMany: jest.fn().mockResolvedValue([]) };
    taskMock.timeEntry = { count: jest.fn().mockResolvedValue(0) };
    taskMock.billingPreparationItem = { count: jest.fn().mockResolvedValue(0) };
    taskMock.clientDocumentPublication = { count: jest.fn().mockResolvedValue(0) };
    Object.assign(prismaDouble, taskMock);
    const actor = { userId: ids.reviewer, role: 'LAWYER' };
    const before = await getCaseLifecycle(IDS.case, actor);
    const service = new TaskReviewDecisionService(taskMock);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.reviewer);
    expect(detail.permittedActions.approve).toBe(true);
    await service.approveSubmission(ids.task, 'sub-1', ids.reviewer, 'legacy-independent-approval', detail.reviewVersion, {});
    expect(submission.status).toBe('APPROVED');
    expect(currentTask.status).toBe('DONE');
    expect(legacy).toEqual(original);
    for (const method of ['create', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']) {
      expect(taskMock.lawyerHandoffPackage[method]).not.toHaveBeenCalled();
    }
    const after = await getCaseLifecycle(IDS.case, actor);
    const handoffBlocker = (dto: any) => dto.blockers.find((blocker: any) => blocker.code === 'ACTIVE_HANDOFF');
    expect(handoffBlocker(after)).toEqual(handoffBlocker(before));
    expect(after?.closureReadiness.ready).toBe(!blocksClosure);
    expect(taskMock.lawyerHandoffPackage.count).toHaveBeenCalledWith({
      where: { caseId: IDS.case, status: { in: ['DRAFT', 'PREPARED', 'SUBMITTED', 'IN_REVIEW'] } },
    });
    if (blocksClosure) {
      expect(handoffBlocker(after)).toMatchObject({ count: 1 });
      await expect(closeCase(IDS.case, actor)).rejects.toMatchObject({
        statusCode: 409, code: 'CLOSURE_BLOCKED', blockers: [expect.objectContaining({ code: 'ACTIVE_HANDOFF', count: 1 })],
      });
      expect(taskMock.case.update).not.toHaveBeenCalled();
    } else {
      expect(handoffBlocker(after)).toBeUndefined();
    }
  });

  it('14. revise pins the newly selected exact version through explicit attach', async () => {
    const attachMock: any = {
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(attachMock)),
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'IN_REVIEW' }]),
      task: { findUnique: jest.fn().mockResolvedValue(taskRecord()) },
      user: { findUnique: jest.fn().mockImplementation(async ({ where }: any) => USERS[where.id] || null) },
      case: { findUnique: jest.fn().mockResolvedValue({ id: IDS.case, assignedLawyerId: IDS.lawyer, createdById: IDS.supervisor }) },
      caseCollaborator: { findFirst: jest.fn().mockResolvedValue(null) },
      taskSubmission: {
        findFirst: jest.fn().mockResolvedValue(draftRecord({ documents: [] })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      document: { findFirst: jest.fn().mockResolvedValue({ id: IDS.doc }) },
      documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: IDS.ver3 }) },
      taskSubmissionDocument: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new TaskSubmissionService(attachMock as any);
    await service.attachSubmissionDocument(IDS.task, 'sub-1', IDS.worker, {
      documentId: IDS.doc,
      role: 'PRIMARY_OUTPUT',
      documentVersionId: IDS.ver3,
    });
    expect(attachMock.taskSubmissionDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ documentVersionId: IDS.ver3 }),
    }));
  });

  it('15. the review detail and history expose the exact submitted version identity', async () => {
    wireDecisionMocks();
    taskMock.documentReview = { findMany: jest.fn().mockResolvedValue([]) };
    submission.documents = [{
      id: 'link-1',
      documentId: IDS.doc,
      documentVersionId: IDS.ver2,
      role: 'PRIMARY_OUTPUT',
      documentVersion: { id: IDS.ver2, version: 2 },
      document: {
        id: IDS.doc,
        name: 'Output',
        fileName: 'output.docx',
        category: 'OTHER',
        currentVersion: 2,
        caseId: IDS.case,
        versions: [{ id: IDS.ver2 }],
      },
    }];
    const service = new TaskReviewDecisionService(taskMock as any);
    const detail = await service.getReviewDetail(ids.task, 'sub-1', ids.reviewer);
    expect(detail.reviewVersion).toBeTruthy();
    expect(detail.outputs).toEqual([expect.objectContaining({
      documentId: IDS.doc,
      documentVersionId: IDS.ver2,
      linkedVersion: 2,
      isCurrentVersion: true,
      newerVersionExists: false,
    })]);
    expect(detail.history[0].outputs).toEqual([
      { documentId: IDS.doc, documentVersionId: IDS.ver2, linkedVersion: 2 },
    ]);

    // A newer current version is reported explicitly and never replaces the
    // submitted exact version identity in the reviewer detail.
    submission.documents[0].document.versions = [{ id: IDS.ver3 }];
    submission.documents[0].document.currentVersion = 3;
    const superseded = await service.getReviewDetail(ids.task, 'sub-1', ids.reviewer);
    expect(superseded.outputs).toEqual([expect.objectContaining({
      documentId: IDS.doc,
      documentVersionId: IDS.ver2,
      linkedVersion: 2,
      isCurrentVersion: false,
      newerVersionExists: true,
      currentVersion: 3,
    })]);
  });
});
