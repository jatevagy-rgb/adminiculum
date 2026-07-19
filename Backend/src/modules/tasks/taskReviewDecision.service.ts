import { createHash } from 'crypto';
import {
  ExternalActionType,
  Prisma,
  PrismaClient,
  TaskReviewDecisionType,
} from '@prisma/client';
import prisma from '../../config/database';
import { validateTaskTransition, WorkflowTransitionError } from '../cases/workItems';
import {
  ApproveSubmissionInput,
  ExternalCompletionInput,
  ReviewMutationResult,
  ReviewSafeUserDto,
  ReturnSubmissionInput,
  ReviseSubmissionResult,
  TaskReviewDecisionDto,
  TaskSubmissionReviewDetailDto,
} from './taskReviewDecision.types';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const INTERNAL_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT', 'COLLAB_LAWYER']);
const DECISION_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_NOTE_LENGTH = 4000;
const MAX_CORRECTIONS_LENGTH = 8000;
const EXTERNAL_ACTION_VALUES = new Set(Object.values(ExternalActionType));

const reviewTaskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  caseId: true,
  matterId: true,
  assignedToId: true,
  assignedById: true,
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  matter: { select: { id: true, title: true } },
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      assignedLawyerId: true,
      createdById: true,
      client: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TaskSelect;

const reviewSubmissionInclude = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  submittedBy: { select: { id: true, name: true, email: true, role: true } },
  assignedReviewer: { select: { id: true, name: true, email: true, role: true } },
  documents: {
    include: {
      document: { select: { id: true, name: true, fileName: true, category: true, currentVersion: true, caseId: true } },
      documentVersion: { select: { id: true, version: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  timeEntries: {
    include: {
      timeEntry: {
        select: { id: true, workType: true, minutes: true, billable: true, workDate: true, taskId: true, matterId: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  reviewDecision: {
    include: { reviewer: { select: { id: true, name: true, email: true, role: true } } },
  },
} satisfies Prisma.TaskSubmissionInclude;

type ReviewTaskRecord = Prisma.TaskGetPayload<{ select: typeof reviewTaskSelect }>;
type ReviewSubmissionRecord = Prisma.TaskSubmissionGetPayload<{ include: typeof reviewSubmissionInclude }>;

interface ReviewActorScope {
  actorId: string;
  role: string;
  internal: boolean;
  canRead: boolean;
  canDecide: boolean;
  canRevise: boolean;
  canRecordExternalCompletion: boolean;
}

interface TransactionHooks {
  beforeReturnCommit?: () => Promise<void> | void;
  beforeApprovalCommit?: () => Promise<void> | void;
  beforeExternalCompletionCommit?: () => Promise<void> | void;
}

interface ReceiptMetadata {
  operation?: string;
  taskId?: string;
  submissionId?: string;
  actorId?: string;
  requestFingerprint?: string;
  createdSubmissionId?: string;
}

export class TaskReviewDecisionServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskReviewDecisionServiceError';
  }
}

function safeUser(user: { id: string; name: string | null; email: string; role: unknown } | null): ReviewSafeUserDto | null {
  if (!user) return null;
  return { id: user.id, displayName: user.name || user.email || user.id, role: String(user.role) };
}

function toDecisionDto(decision: ReviewSubmissionRecord['reviewDecision']): TaskReviewDecisionDto | null {
  if (!decision) return null;
  return {
    id: decision.id,
    decision: String(decision.decision),
    reviewer: safeUser(decision.reviewer)!,
    note: decision.note,
    requestedCorrections: decision.requestedCorrections,
    requiresFullReview: decision.requiresFullReview,
    correctionDeadline: decision.correctionDeadline?.toISOString() || null,
    createdAt: decision.createdAt.toISOString(),
  };
}

function normalizeText(value: unknown, code: string, message: string, maxLength: number): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TaskReviewDecisionServiceError(400, code, message);
  if (normalized.length > maxLength) {
    throw new TaskReviewDecisionServiceError(400, 'REVIEW_FIELD_TOO_LONG', `Review text must not exceed ${maxLength} characters.`);
  }
  return normalized;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new TaskReviewDecisionServiceError(400, 'REVIEW_FIELD_TOO_LONG', `Review text must not exceed ${maxLength} characters.`);
  }
  return normalized;
}

function normalizeDate(value: unknown, code: string, message: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new TaskReviewDecisionServiceError(400, code, message);
  return date;
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new TaskReviewDecisionServiceError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
  }
  return normalized;
}

function stableFingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deterministicUuid(namespace: string, value: string): string {
  const chars = createHash('sha256').update(`${namespace}:${value}`).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ['8', '9', 'a', 'b'][parseInt(chars[16], 16) % 4];
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function receiptId(idempotencyKey: string): string {
  return deterministicUuid('task-review-decision-idempotency-v1', idempotencyKey);
}

function secondaryEventId(idempotencyKey: string, suffix: string): string {
  return deterministicUuid(`task-review-decision-secondary-${suffix}-v1`, idempotencyKey);
}

function reviewVersion(submission: ReviewSubmissionRecord): string {
  return createHash('sha256')
    .update([
      submission.id,
      submission.updatedAt.toISOString(),
      String(submission.status),
      submission.reviewDecision?.id || '',
      submission.externalCompletedAt?.toISOString() || '',
    ].join(':'))
    .digest('hex');
}

function normalizeReviewVersion(value: string): string {
  return value.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  const metadata = error.meta as { code?: string } | undefined;
  return error.code === 'P2010' && metadata?.code === '40001';
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function withSerializableRetry<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw lastError;
}

export class TaskReviewDecisionService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly hooks: TransactionHooks = {},
  ) {}

  private async getContext(
    taskId: string,
    submissionId: string,
    actorId: string,
    db: DatabaseClient = this.db,
  ): Promise<{ task: ReviewTaskRecord; submission: ReviewSubmissionRecord; scope: ReviewActorScope }> {
    const [task, submission, actor] = await Promise.all([
      db.task.findUnique({ where: { id: taskId }, select: reviewTaskSelect }),
      db.taskSubmission.findFirst({ where: { id: submissionId, taskId }, include: reviewSubmissionInclude }),
      db.user.findUnique({ where: { id: actorId }, select: { id: true, role: true, status: true, isActive: true } }),
    ]);
    if (!task || !submission || !actor || !actor.isActive || actor.status !== 'ACTIVE') {
      throw new TaskReviewDecisionServiceError(404, 'TASK_SUBMISSION_NOT_FOUND', 'Task submission not found.');
    }

    const role = String(actor.role);
    const internal = INTERNAL_ROLES.has(role);
    const collaborator = internal
      ? await db.caseCollaborator.findFirst({ where: { caseId: task.caseId, userId: actorId }, select: { id: true } })
      : null;
    const submitter = submission.submittedById === actorId || submission.createdById === actorId;
    const assignedReviewer = submission.assignedReviewerId === actorId;
    const scopedSupervisor = task.assignedById === actorId
      || task.case.assignedLawyerId === actorId
      || task.case.createdById === actorId
      || Boolean(collaborator);
    const taskWorker = task.assignedToId === actorId;
    const canRead = internal && (submitter || assignedReviewer || scopedSupervisor || taskWorker);
    if (!canRead) {
      throw new TaskReviewDecisionServiceError(404, 'TASK_SUBMISSION_NOT_FOUND', 'Task submission not found.');
    }

    const decisionRole = DECISION_ROLES.has(role);
    return {
      task,
      submission,
      scope: {
        actorId,
        role,
        internal,
        canRead,
        canDecide: decisionRole && !submitter && (assignedReviewer || scopedSupervisor),
        canRevise: internal && taskWorker && submission.submittedById === actorId,
        canRecordExternalCompletion: decisionRole && !submitter && scopedSupervisor,
      },
    };
  }

  private assertCanDecide(context: { task: ReviewTaskRecord; submission: ReviewSubmissionRecord; scope: ReviewActorScope }): void {
    if (context.submission.submittedById === context.scope.actorId || context.task.assignedToId === context.scope.actorId) {
      if (context.submission.assignedReviewerId === context.scope.actorId) {
        throw new TaskReviewDecisionServiceError(409, 'SELF_REVIEW_NOT_ALLOWED', 'The submitter cannot review their own submission.');
      }
      throw new TaskReviewDecisionServiceError(403, 'REVIEW_FORBIDDEN', 'You cannot decide this task submission.');
    }
    if (!context.scope.canDecide) {
      throw new TaskReviewDecisionServiceError(403, 'REVIEW_FORBIDDEN', 'You cannot decide this task submission.');
    }
  }

  private assertReviewVersion(submission: ReviewSubmissionRecord, expectedVersion: string): void {
    const normalized = normalizeReviewVersion(expectedVersion);
    if (!normalized) {
      throw new TaskReviewDecisionServiceError(428, 'REVIEW_DETAIL_REQUIRED', 'Open the current review detail before deciding.');
    }
    if (normalized !== reviewVersion(submission)) {
      throw new TaskReviewDecisionServiceError(412, 'REVIEW_VERSION_STALE', 'The review detail changed. Reload it before deciding.');
    }
  }

  private async findReceipt(
    db: DatabaseClient,
    idempotencyKey: string,
    expected: { operation: string; taskId: string; submissionId: string; actorId: string; requestFingerprint: string },
  ): Promise<ReceiptMetadata | null> {
    const submissionKeyOwner = await db.taskSubmission.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (submissionKeyOwner) {
      throw new TaskReviewDecisionServiceError(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was used by another mutation.');
    }
    const receipt = await db.timelineEvent.findUnique({ where: { id: receiptId(idempotencyKey) }, select: { metadata: true } });
    if (!receipt) return null;
    const metadata = (receipt.metadata || {}) as ReceiptMetadata;
    if (
      metadata.operation !== expected.operation
      || metadata.taskId !== expected.taskId
      || metadata.submissionId !== expected.submissionId
      || metadata.actorId !== expected.actorId
      || metadata.requestFingerprint !== expected.requestFingerprint
    ) {
      throw new TaskReviewDecisionServiceError(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was used for another request.');
    }
    return metadata;
  }

  private async loadHistory(taskId: string, db: DatabaseClient = this.db): Promise<ReviewSubmissionRecord[]> {
    return db.taskSubmission.findMany({
      where: { taskId },
      include: reviewSubmissionInclude,
      orderBy: { revisionNumber: 'desc' },
    });
  }

  async getReviewDetail(taskId: string, submissionId: string, actorId: string): Promise<TaskSubmissionReviewDetailDto> {
    const { task, submission, scope } = await this.getContext(taskId, submissionId, actorId);
    const history = await this.loadHistory(taskId);
    const outputs = submission.documents.map((link) => ({
      id: link.id,
      documentId: link.documentId,
      documentVersionId: link.documentVersionId,
      role: String(link.role),
      name: link.document.fileName || link.document.name,
      category: String(link.document.category),
      currentVersion: link.document.currentVersion,
      linkedVersion: link.documentVersion?.version || null,
    }));
    const timeEntries = submission.timeEntries.map((link) => ({
      id: link.id,
      timeEntryId: link.timeEntryId,
      workType: String(link.timeEntry.workType),
      minutes: link.timeEntry.minutes,
      billable: link.timeEntry.billable,
      workDate: link.timeEntry.workDate.toISOString(),
    }));
    const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
    const billableMinutes = timeEntries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entry.minutes, 0);
    const decision = toDecisionDto(submission.reviewDecision);
    const reviewable = submission.status === 'SUBMITTED' && !submission.reviewDecision;
    const externalPending = submission.status === 'APPROVED'
      && submission.externalActionRequired
      && !submission.externalCompletedAt;
    const canRevise = submission.status === 'RETURNED'
      && scope.canRevise
      && !history.some((revision) => revision.status === 'DRAFT');
    const canDecide = reviewable && scope.canDecide && submission.submittedById !== actorId;
    const canRecordExternalCompletion = externalPending && scope.canRecordExternalCompletion;

    let nextActionCode = 'VIEW_SUBMISSION';
    if (canDecide) nextActionCode = 'OPEN_REVIEW';
    else if (canRevise) nextActionCode = 'CONTINUE_RETURNED_WORK';
    else if (canRecordExternalCompletion) nextActionCode = 'RECORD_EXTERNAL_COMPLETION';
    else if (submission.status === 'APPROVED' && !externalPending) nextActionCode = 'VIEW_COMPLETED';

    return {
      reviewVersion: reviewVersion(submission),
      task: {
        id: task.id,
        title: task.title,
        status: String(task.status),
        priority: String(task.priority),
        deadline: task.dueDate?.toISOString() || null,
        assignee: safeUser(task.assignedTo),
      },
      matter: { id: task.matter?.id || task.matterId, displayName: task.matter?.title || null },
      case: { id: task.case.id, caseNumber: task.case.caseNumber, displayName: task.case.title },
      client: { id: task.case.client.id, displayName: task.case.client.name },
      submission: {
        id: submission.id,
        revisionNumber: submission.revisionNumber,
        status: String(submission.status),
        submittedBy: safeUser(submission.submittedBy),
        submittedAt: submission.submittedAt?.toISOString() || null,
        assignedReviewer: safeUser(submission.assignedReviewer)!,
        requestedAttention: submission.requestedAttention ? String(submission.requestedAttention) : null,
        externalActionRequired: submission.externalActionRequired,
        externalActionType: submission.externalActionType ? String(submission.externalActionType) : null,
        externalCompletedAt: submission.externalCompletedAt?.toISOString() || null,
        workSummary: submission.workSummary,
        remainingIssues: submission.remainingIssues,
        zeroTimeConfirmed: submission.zeroTimeConfirmed,
      },
      outputs,
      time: {
        entries: timeEntries,
        totalMinutes,
        billableMinutes,
        nonBillableMinutes: totalMinutes - billableMinutes,
      },
      history: history.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        status: String(revision.status),
        submittedAt: revision.submittedAt?.toISOString() || null,
        returnedAt: revision.returnedAt?.toISOString() || null,
        approvedAt: revision.approvedAt?.toISOString() || null,
        supersedesSubmissionId: revision.supersedesSubmissionId,
        decision: toDecisionDto(revision.reviewDecision),
      })),
      decision,
      permittedActions: {
        read: true,
        return: canDecide,
        approve: canDecide,
        revise: canRevise,
        recordExternalCompletion: canRecordExternalCompletion,
      },
      nextActionCode,
    };
  }

  async returnSubmission(
    taskId: string,
    submissionId: string,
    actorId: string,
    idempotencyKeyValue: string,
    expectedReviewVersion: string,
    input: ReturnSubmissionInput,
    concurrentReplay = false,
  ): Promise<ReviewMutationResult> {
    const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyValue);
    const note = normalizeText(input.note, 'RETURN_NOTE_REQUIRED', 'A reviewer note is required.', MAX_NOTE_LENGTH);
    const requestedCorrections = normalizeText(
      input.requestedCorrections,
      'REQUESTED_CORRECTIONS_REQUIRED',
      'Requested corrections are required.',
      MAX_CORRECTIONS_LENGTH,
    );
    if (typeof input.requiresFullReview !== 'boolean') {
      throw new TaskReviewDecisionServiceError(400, 'REQUIRES_FULL_REVIEW_REQUIRED', 'requiresFullReview must be a boolean.');
    }
    const requiresFullReview = input.requiresFullReview;
    const correctionDeadline = normalizeDate(input.correctionDeadline, 'INVALID_CORRECTION_DEADLINE', 'correctionDeadline must be a valid timestamp.');
    const requestFingerprint = stableFingerprint({
      note,
      requestedCorrections,
      requiresFullReview,
      correctionDeadline: correctionDeadline?.toISOString() || null,
    });

    try {
      const result = await withSerializableRetry(this.db, async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "tasks" WHERE "id" = ${taskId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "task_submissions" WHERE "id" = ${submissionId} FOR UPDATE`);
        const context = await this.getContext(taskId, submissionId, actorId, tx);
        this.assertCanDecide(context);
        const receipt = await this.findReceipt(tx, idempotencyKey, { operation: 'RETURN', taskId, submissionId, actorId, requestFingerprint });
        if (receipt) return { idempotentReplay: true };
        this.assertReviewVersion(context.submission, expectedReviewVersion);
        if (context.submission.reviewDecision) {
          throw new TaskReviewDecisionServiceError(409, 'REVIEW_ALREADY_DECIDED', 'This submission already has a final decision.');
        }
        if (context.submission.status !== 'SUBMITTED') {
          throw new TaskReviewDecisionServiceError(409, 'SUBMISSION_NOT_REVIEWABLE', 'Only a submitted revision may be reviewed.');
        }
        const transition = validateTaskTransition(context.task, 'RETURN_FOR_CORRECTION', actorId, context.scope.role);
        const returnedAt = new Date();
        await tx.taskReviewDecision.create({
          data: {
            submissionId,
            reviewerId: actorId,
            decision: TaskReviewDecisionType.RETURNED,
            note,
            requestedCorrections,
            requiresFullReview,
            correctionDeadline,
          },
        });
        await tx.taskSubmission.update({ where: { id: submissionId }, data: { status: 'RETURNED', returnedAt } });
        await tx.task.update({ where: { id: taskId }, data: transition.data as Prisma.TaskUpdateInput });
        await tx.timelineEvent.create({
          data: {
            id: receiptId(idempotencyKey),
            eventType: 'REVIEW_COMPLETED',
            type: 'TASK_SUBMISSION_RETURNED',
            description: 'A task submission was returned for correction.',
            caseId: context.task.caseId,
            userId: actorId,
            taskId,
            metadata: {
              operation: 'RETURN', taskId, submissionId, revisionNumber: context.submission.revisionNumber,
              actorId, reviewerId: actorId, decision: 'RETURNED', timestamp: returnedAt.toISOString(),
              requiresFullReview, status: 'RETURNED', requestFingerprint,
            },
          },
        });
        if (context.submission.submittedById) {
          await tx.notification.create({
            data: {
              type: 'REVIEW_COMPLETED',
              title: 'Feladatleadás javításra visszaadva',
              message: 'A feladatleadás javítást igényel. Nyissa meg a leadás részleteit.',
              link: `/tasks?taskId=${encodeURIComponent(taskId)}`,
              userId: context.submission.submittedById,
            },
          });
        }
        await this.hooks.beforeReturnCommit?.();
        return { idempotentReplay: false };
      });
      return { idempotentReplay: result.idempotentReplay, review: await this.getReviewDetail(taskId, submissionId, actorId) };
    } catch (error) {
      if (isUniqueConstraintError(error) && !concurrentReplay) {
        return this.returnSubmission(taskId, submissionId, actorId, idempotencyKey, expectedReviewVersion, input, true);
      }
      if (isUniqueConstraintError(error)) {
        throw new TaskReviewDecisionServiceError(409, 'REVIEW_ALREADY_DECIDED', 'This submission already has a final decision.');
      }
      throw this.mapWorkflowError(error);
    }
  }

  async reviseSubmission(
    taskId: string,
    submissionId: string,
    actorId: string,
    idempotencyKeyValue: string,
    concurrentReplay = false,
  ): Promise<ReviseSubmissionResult> {
    const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyValue);
    const requestFingerprint = stableFingerprint({ operation: 'REVISE' });
    try {
      const result = await withSerializableRetry(this.db, async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "tasks" WHERE "id" = ${taskId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "task_submissions" WHERE "id" = ${submissionId} FOR UPDATE`);
        const context = await this.getContext(taskId, submissionId, actorId, tx);
        if (!context.scope.canRevise) {
          throw new TaskReviewDecisionServiceError(403, 'TASK_SUBMISSION_REVISE_FORBIDDEN', 'Only the original task worker may create the corrected revision.');
        }
        const receipt = await this.findReceipt(tx, idempotencyKey, { operation: 'REVISE', taskId, submissionId, actorId, requestFingerprint });
        if (receipt?.createdSubmissionId) {
          const draft = await tx.taskSubmission.findUnique({ where: { id: receipt.createdSubmissionId } });
          if (!draft) throw new TaskReviewDecisionServiceError(409, 'IDEMPOTENCY_RECEIPT_INVALID', 'The persisted revise receipt is invalid.');
          return { idempotentReplay: true, draft };
        }
        if (context.submission.status !== 'RETURNED') {
          throw new TaskReviewDecisionServiceError(409, 'SUBMISSION_NOT_RETURNED', 'Only a returned revision may be revised.');
        }
        const activeDraft = await tx.taskSubmission.findFirst({ where: { taskId, status: 'DRAFT' } });
        if (activeDraft) {
          throw new TaskReviewDecisionServiceError(409, 'TASK_SUBMISSION_ACTIVE_DRAFT_EXISTS', 'A corrected draft already exists.');
        }
        const latest = await tx.taskSubmission.findFirst({ where: { taskId }, orderBy: { revisionNumber: 'desc' } });
        if (!latest || latest.id !== submissionId) {
          throw new TaskReviewDecisionServiceError(409, 'TASK_SUBMISSION_REVISION_CONFLICT', 'Only the latest returned revision may be revised.');
        }
        const draft = await tx.taskSubmission.create({
          data: {
            taskId,
            revisionNumber: context.submission.revisionNumber + 1,
            status: 'DRAFT',
            createdById: actorId,
            assignedReviewerId: context.submission.assignedReviewerId,
            workSummary: context.submission.workSummary,
            remainingIssues: context.submission.remainingIssues,
            requestedAttention: context.submission.requestedAttention,
            externalActionRequired: context.submission.externalActionRequired,
            externalActionType: context.submission.externalActionType,
            supersedesSubmissionId: submissionId,
            zeroTimeConfirmed: false,
          },
        });
        await tx.timelineEvent.create({
          data: {
            id: receiptId(idempotencyKey),
            eventType: 'CUSTOM',
            type: 'TASK_SUBMISSION_REVISION_CREATED',
            description: 'A corrected task submission revision was created.',
            caseId: context.task.caseId,
            userId: actorId,
            taskId,
            metadata: {
              operation: 'REVISE', taskId, submissionId, priorSubmissionId: submissionId,
              createdSubmissionId: draft.id, revisionNumber: draft.revisionNumber, actorId,
              timestamp: draft.createdAt.toISOString(), status: 'DRAFT', requestFingerprint,
            },
          },
        });
        return { idempotentReplay: false, draft };
      });
      return {
        idempotentReplay: result.idempotentReplay,
        draft: {
          id: result.draft.id,
          taskId: result.draft.taskId,
          revisionNumber: result.draft.revisionNumber,
          status: String(result.draft.status),
          supersedesSubmissionId: result.draft.supersedesSubmissionId!,
          assignedReviewerId: result.draft.assignedReviewerId,
          requestedAttention: result.draft.requestedAttention ? String(result.draft.requestedAttention) : null,
          externalActionRequired: result.draft.externalActionRequired,
          externalActionType: result.draft.externalActionType ? String(result.draft.externalActionType) : null,
        },
      };
    } catch (error) {
      if (isUniqueConstraintError(error) && !concurrentReplay) {
        return this.reviseSubmission(taskId, submissionId, actorId, idempotencyKey, true);
      }
      throw error;
    }
  }

  async approveSubmission(
    taskId: string,
    submissionId: string,
    actorId: string,
    idempotencyKeyValue: string,
    expectedReviewVersion: string,
    input: ApproveSubmissionInput,
    concurrentReplay = false,
  ): Promise<ReviewMutationResult> {
    const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyValue);
    const note = normalizeOptionalText(input.note, MAX_NOTE_LENGTH);
    const requestFingerprint = stableFingerprint({ note });
    try {
      const result = await withSerializableRetry(this.db, async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "tasks" WHERE "id" = ${taskId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "task_submissions" WHERE "id" = ${submissionId} FOR UPDATE`);
        const context = await this.getContext(taskId, submissionId, actorId, tx);
        this.assertCanDecide(context);
        const receipt = await this.findReceipt(tx, idempotencyKey, { operation: 'APPROVE', taskId, submissionId, actorId, requestFingerprint });
        if (receipt) return { idempotentReplay: true };
        this.assertReviewVersion(context.submission, expectedReviewVersion);
        if (context.submission.reviewDecision) {
          throw new TaskReviewDecisionServiceError(409, 'REVIEW_ALREADY_DECIDED', 'This submission already has a final decision.');
        }
        if (context.submission.status !== 'SUBMITTED') {
          throw new TaskReviewDecisionServiceError(409, 'SUBMISSION_NOT_REVIEWABLE', 'Only a submitted revision may be reviewed.');
        }
        if (context.submission.externalActionRequired && !context.submission.externalActionType) {
          throw new TaskReviewDecisionServiceError(409, 'EXTERNAL_ACTION_TYPE_REQUIRED', 'The approved external action requires a persisted action type.');
        }
        const transition = validateTaskTransition(context.task, 'APPROVE', actorId, context.scope.role);
        const approvedAt = new Date();
        await tx.taskReviewDecision.create({
          data: { submissionId, reviewerId: actorId, decision: TaskReviewDecisionType.APPROVED, note },
        });
        await tx.taskSubmission.update({ where: { id: submissionId }, data: { status: 'APPROVED', approvedAt } });
        if (!context.submission.externalActionRequired) {
          await tx.task.update({ where: { id: taskId }, data: transition.data as Prisma.TaskUpdateInput });
        }
        await tx.timelineEvent.create({
          data: {
            id: receiptId(idempotencyKey),
            eventType: 'REVIEW_COMPLETED',
            type: 'TASK_SUBMISSION_APPROVED',
            description: 'A task submission was approved.',
            caseId: context.task.caseId,
            userId: actorId,
            taskId,
            metadata: {
              operation: 'APPROVE', taskId, submissionId, revisionNumber: context.submission.revisionNumber,
              actorId, reviewerId: actorId, decision: 'APPROVED', timestamp: approvedAt.toISOString(),
              externalActionType: context.submission.externalActionType, status: 'APPROVED', requestFingerprint,
            },
          },
        });
        if (!context.submission.externalActionRequired) {
          await tx.timelineEvent.create({
            data: {
              id: secondaryEventId(idempotencyKey, 'task-completed'),
              eventType: 'TASK_COMPLETED',
              type: 'TASK_COMPLETED',
              description: 'The task was completed after review approval.',
              caseId: context.task.caseId,
              userId: actorId,
              taskId,
              metadata: { taskId, submissionId, actorId, timestamp: approvedAt.toISOString(), status: 'DONE' },
            },
          });
        }
        if (context.submission.submittedById) {
          await tx.notification.create({
            data: {
              type: 'REVIEW_COMPLETED',
              title: 'Feladatleadás jóváhagyva',
              message: context.submission.externalActionRequired
                ? 'A leadás jóváhagyva; a külső művelet rögzítése még hátravan.'
                : 'A feladatleadás jóváhagyva és a feladat lezárva.',
              link: `/tasks?taskId=${encodeURIComponent(taskId)}`,
              userId: context.submission.submittedById,
            },
          });
        }
        await this.hooks.beforeApprovalCommit?.();
        return { idempotentReplay: false };
      });
      return { idempotentReplay: result.idempotentReplay, review: await this.getReviewDetail(taskId, submissionId, actorId) };
    } catch (error) {
      if (isUniqueConstraintError(error) && !concurrentReplay) {
        return this.approveSubmission(taskId, submissionId, actorId, idempotencyKey, expectedReviewVersion, input, true);
      }
      if (isUniqueConstraintError(error)) {
        throw new TaskReviewDecisionServiceError(409, 'REVIEW_ALREADY_DECIDED', 'This submission already has a final decision.');
      }
      throw this.mapWorkflowError(error);
    }
  }

  async recordExternalCompletion(
    taskId: string,
    submissionId: string,
    actorId: string,
    idempotencyKeyValue: string,
    input: ExternalCompletionInput,
    concurrentReplay = false,
  ): Promise<ReviewMutationResult> {
    const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyValue);
    const actionType = String(input.actionType || '').trim().toUpperCase();
    if (!EXTERNAL_ACTION_VALUES.has(actionType as ExternalActionType)) {
      throw new TaskReviewDecisionServiceError(400, 'EXTERNAL_ACTION_TYPE_REQUIRED', 'A valid actionType confirmation is required.');
    }
    const completedAt = normalizeDate(input.completedAt, 'INVALID_EXTERNAL_COMPLETION_TIME', 'completedAt must be a valid timestamp.') || new Date();
    if (completedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new TaskReviewDecisionServiceError(400, 'INVALID_EXTERNAL_COMPLETION_TIME', 'completedAt cannot be in the future.');
    }
    const requestFingerprint = stableFingerprint({ actionType, completedAt: input.completedAt ? completedAt.toISOString() : null });
    try {
      const result = await withSerializableRetry(this.db, async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "tasks" WHERE "id" = ${taskId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "task_submissions" WHERE "id" = ${submissionId} FOR UPDATE`);
        const context = await this.getContext(taskId, submissionId, actorId, tx);
        if (!context.scope.canRecordExternalCompletion) {
          throw new TaskReviewDecisionServiceError(403, 'EXTERNAL_COMPLETION_FORBIDDEN', 'You cannot record external completion for this task.');
        }
        const receipt = await this.findReceipt(tx, idempotencyKey, { operation: 'EXTERNAL_COMPLETION', taskId, submissionId, actorId, requestFingerprint });
        if (receipt) return { idempotentReplay: true };
        if (context.submission.status !== 'APPROVED' || context.submission.reviewDecision?.decision !== 'APPROVED') {
          throw new TaskReviewDecisionServiceError(409, 'EXTERNAL_COMPLETION_NOT_ALLOWED', 'Only an approved submission may record external completion.');
        }
        if (!context.submission.externalActionRequired || !context.submission.externalActionType) {
          throw new TaskReviewDecisionServiceError(409, 'EXTERNAL_COMPLETION_NOT_ALLOWED', 'This submission has no pending external action.');
        }
        if (context.submission.externalCompletedAt) {
          throw new TaskReviewDecisionServiceError(409, 'EXTERNAL_COMPLETION_ALREADY_RECORDED', 'External completion was already recorded.');
        }
        if (String(context.submission.externalActionType) !== actionType) {
          throw new TaskReviewDecisionServiceError(409, 'EXTERNAL_ACTION_TYPE_MISMATCH', 'actionType does not match the approved external action.');
        }
        const transition = validateTaskTransition(context.task, 'APPROVE', actorId, context.scope.role);
        await tx.taskSubmission.update({
          where: { id: submissionId },
          data: { externalCompletedAt: completedAt, externalCompletedById: actorId },
        });
        await tx.task.update({ where: { id: taskId }, data: transition.data as Prisma.TaskUpdateInput });
        await tx.timelineEvent.create({
          data: {
            id: receiptId(idempotencyKey),
            eventType: 'CUSTOM',
            type: 'TASK_EXTERNAL_COMPLETION_RECORDED',
            description: 'An approved external action was recorded as completed.',
            caseId: context.task.caseId,
            userId: actorId,
            taskId,
            metadata: {
              operation: 'EXTERNAL_COMPLETION', taskId, submissionId,
              revisionNumber: context.submission.revisionNumber, actorId,
              timestamp: completedAt.toISOString(), externalActionType: actionType,
              status: 'COMPLETED', requestFingerprint,
            },
          },
        });
        await tx.timelineEvent.create({
          data: {
            id: secondaryEventId(idempotencyKey, 'task-completed'),
            eventType: 'TASK_COMPLETED',
            type: 'TASK_COMPLETED',
            description: 'The task was completed after its approved external action.',
            caseId: context.task.caseId,
            userId: actorId,
            taskId,
            metadata: { taskId, submissionId, actorId, timestamp: completedAt.toISOString(), status: 'DONE' },
          },
        });
        if (context.submission.submittedById) {
          await tx.notification.create({
            data: {
              type: 'REVIEW_COMPLETED',
              title: 'Külső művelet lezárva',
              message: 'A jóváhagyott külső művelet teljesítése rögzítve, a feladat lezárva.',
              link: `/tasks?taskId=${encodeURIComponent(taskId)}`,
              userId: context.submission.submittedById,
            },
          });
        }
        await this.hooks.beforeExternalCompletionCommit?.();
        return { idempotentReplay: false };
      });
      return { idempotentReplay: result.idempotentReplay, review: await this.getReviewDetail(taskId, submissionId, actorId) };
    } catch (error) {
      if (isUniqueConstraintError(error) && !concurrentReplay) {
        return this.recordExternalCompletion(taskId, submissionId, actorId, idempotencyKey, input, true);
      }
      throw this.mapWorkflowError(error);
    }
  }

  private mapWorkflowError(error: unknown): unknown {
    if (error instanceof WorkflowTransitionError) {
      return new TaskReviewDecisionServiceError(error.statusCode, error.code, error.message);
    }
    return error;
  }
}

const taskReviewDecisionService = new TaskReviewDecisionService();

export default taskReviewDecisionService;
