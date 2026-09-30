import {
  ExternalActionType,
  Prisma,
  PrismaClient,
  ReviewAttentionLevel,
  TaskSubmissionDocumentRole,
} from '@prisma/client';
import prisma from '../../config/database';
import { canUserActOnTask } from './taskAuthorization';
import { WorkflowTransitionError } from '../cases/workItems';
import { planCanonicalTaskTransition } from './taskLifecycle.service';
import { ATTENTION_DURATION_BANDS, isAttentionCategory, type AttentionCategory } from './attentionCategory';
import {
  AttachDocumentInput,
  AttachTimeEntryInput,
  CreateDraftInput,
  EligibleReviewerDto,
  SafeUserDto,
  SubmissionReadinessCode,
  SubmissionReadinessDto,
  TaskSubmissionDto,
  TaskSubmissionWorkflowDto,
  UpdateDraftInput,
} from './taskSubmission.types';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const TERMINAL_TASK_STATUSES = new Set(['COMPLETED', 'DONE', 'CANCELLED']);
const REVIEWER_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);
const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);
const DECISION_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);
const ATTENTION_VALUES = new Set(Object.values(ReviewAttentionLevel));
const DOCUMENT_ROLE_VALUES = new Set(Object.values(TaskSubmissionDocumentRole));
const EXTERNAL_ACTION_VALUES = new Set(Object.values(ExternalActionType));
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_QUEUE_SUMMARY_LENGTH = 180;

const workflowTaskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  caseId: true,
  matterId: true,
  assignedToId: true,
  assignedById: true,
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      matterId: true,
      assignedLawyerId: true,
      createdById: true,
      assignedLawyer: { select: { id: true, name: true, email: true, role: true } },
      client: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TaskSelect;

const submissionInclude = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  submittedBy: { select: { id: true, name: true, email: true, role: true } },
  assignedReviewer: { select: { id: true, name: true, email: true, role: true } },
  reviewDecision: {
    include: { reviewer: { select: { id: true, name: true, email: true, role: true } } },
  },
  documents: {
    include: {
      document: {
        select: {
          id: true,
          name: true,
          fileName: true,
          category: true,
          currentVersion: true,
          caseId: true,
          versions: { where: { isCurrent: true }, select: { id: true }, take: 1 },
        },
      },
      documentVersion: { select: { id: true, version: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  timeEntries: {
    include: {
      timeEntry: {
        select: {
          id: true,
          workType: true,
          minutes: true,
          billable: true,
          workDate: true,
          taskId: true,
          matterId: true,
          userId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.TaskSubmissionInclude;

type WorkflowTaskRecord = Prisma.TaskGetPayload<{ select: typeof workflowTaskSelect }>;
type SubmissionRecord = Prisma.TaskSubmissionGetPayload<{ include: typeof submissionInclude }>;

interface TransactionHooks {
  beforeSubmitCommit?: () => Promise<void> | void;
}

interface ActorAccess {
  role: string;
  canRead: boolean;
  canPrepare: boolean;
  isPrivileged: boolean;
  isTaskAssignee: boolean;
}

export class TaskSubmissionServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskSubmissionServiceError';
  }
}

function safeUser(user: { id: string; name: string | null; email: string; role: unknown } | null): SafeUserDto | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.name || user.email || user.id,
    role: String(user.role),
  };
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function boundedPreview(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_QUEUE_SUMMARY_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_QUEUE_SUMMARY_LENGTH - 3)}...`;
}

/** Indicative planning band for the canonical review attention level. */
function attentionEstimateFor(requestedAttention: ReviewAttentionLevel | null): { minMinutes: number; maxMinutes: number } | null {
  if (!requestedAttention || !isAttentionCategory(requestedAttention)) return null;
  const band = ATTENTION_DURATION_BANDS[requestedAttention as AttentionCategory];
  return { minMinutes: band.minMinutes, maxMinutes: band.maxMinutes };
}

function toSubmissionDto(submission: SubmissionRecord): TaskSubmissionDto {
  const documents = submission.documents.map((link) => ({
    id: link.id,
    documentId: link.documentId,
    documentVersionId: link.documentVersionId,
    role: String(link.role),
    createdAt: link.createdAt.toISOString(),
    linkedVersion: link.documentVersion?.version || null,
    isCurrentVersion: Boolean(link.documentVersionId && link.document.versions.some((version) => version.id === link.documentVersionId)),
    document: {
      id: link.document.id,
      name: link.document.fileName || link.document.name,
      category: String(link.document.category),
      currentVersion: link.document.currentVersion,
    },
  }));
  const timeEntries = submission.timeEntries.map((link) => ({
    id: link.id,
    timeEntryId: link.timeEntryId,
    createdAt: link.createdAt.toISOString(),
    timeEntry: {
      id: link.timeEntry.id,
      workType: String(link.timeEntry.workType),
      minutes: link.timeEntry.minutes,
      billable: link.timeEntry.billable,
      workDate: link.timeEntry.workDate.toISOString(),
      taskId: link.timeEntry.taskId,
      matterId: link.timeEntry.matterId,
    },
  }));

  return {
    id: submission.id,
    taskId: submission.taskId,
    revisionNumber: submission.revisionNumber,
    status: String(submission.status),
    createdBy: safeUser(submission.createdBy)!,
    submittedBy: safeUser(submission.submittedBy),
    assignedReviewer: safeUser(submission.assignedReviewer)!,
    workSummary: submission.workSummary,
    remainingIssues: submission.remainingIssues,
    reviewerNote: submission.reviewerNote,
    requestedAttention: submission.requestedAttention ? String(submission.requestedAttention) : null,
    attentionEstimate: attentionEstimateFor(submission.requestedAttention),
    externalActionRequired: submission.externalActionRequired,
    externalActionType: submission.externalActionType ? String(submission.externalActionType) : null,
    zeroTimeConfirmed: submission.zeroTimeConfirmed,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    submittedAt: submission.submittedAt?.toISOString() || null,
    returnedAt: submission.returnedAt?.toISOString() || null,
    approvedAt: submission.approvedAt?.toISOString() || null,
    supersededAt: submission.supersededAt?.toISOString() || null,
    externalCompletedAt: submission.externalCompletedAt?.toISOString() || null,
    reviewDecision: submission.reviewDecision ? {
      id: submission.reviewDecision.id,
      decision: String(submission.reviewDecision.decision),
      reviewer: safeUser(submission.reviewDecision.reviewer)!,
      note: submission.reviewDecision.note,
      requestedCorrections: submission.reviewDecision.requestedCorrections,
      requiresFullReview: submission.reviewDecision.requiresFullReview,
      correctionDeadline: submission.reviewDecision.correctionDeadline?.toISOString() || null,
      createdAt: submission.reviewDecision.createdAt.toISOString(),
    } : null,
    documents,
    timeEntries,
    documentCount: documents.length,
    linkedTimeMinutes: timeEntries.reduce((sum, link) => sum + link.timeEntry.minutes, 0),
  };
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

async function withSerializableRetry<T>(
  db: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw lastError;
}

export class TaskSubmissionService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly hooks: TransactionHooks = {},
  ) {}

  private async getTask(taskId: string, db: DatabaseClient = this.db): Promise<WorkflowTaskRecord | null> {
    return db.task.findUnique({ where: { id: taskId }, select: workflowTaskSelect });
  }

  private async getActorAccess(
    task: WorkflowTaskRecord,
    actorId: string,
    db: DatabaseClient = this.db,
  ): Promise<ActorAccess> {
    const baseAccess = await canUserActOnTask(task, actorId, db);
    if (!baseAccess.allowed || !baseAccess.role) {
      return { role: baseAccess.role || '', canRead: false, canPrepare: false, isPrivileged: false, isTaskAssignee: false };
    }

    const isPrivileged = PRIVILEGED_ROLES.has(baseAccess.role);
    const isTaskAssignee = task.assignedToId === actorId;
    const canPrepare =
      isPrivileged ||
      isTaskAssignee ||
      task.assignedById === actorId ||
      task.case.assignedLawyerId === actorId ||
      task.case.createdById === actorId;

    return { role: baseAccess.role, canRead: true, canPrepare, isPrivileged, isTaskAssignee };
  }

  private async getTaskForActor(
    taskId: string,
    actorId: string,
    db: DatabaseClient = this.db,
  ): Promise<{ task: WorkflowTaskRecord; access: ActorAccess }> {
    const task = await this.getTask(taskId, db);
    if (!task) {
      throw new TaskSubmissionServiceError(404, 'TASK_NOT_FOUND', 'Task not found.');
    }
    const access = await this.getActorAccess(task, actorId, db);
    if (!access.canRead) {
      throw new TaskSubmissionServiceError(404, 'TASK_NOT_FOUND', 'Task not found.');
    }
    return { task, access };
  }

  private assertTaskOpen(task: WorkflowTaskRecord): void {
    if (TERMINAL_TASK_STATUSES.has(String(task.status))) {
      throw new TaskSubmissionServiceError(409, 'TASK_SUBMISSION_STATE_CONFLICT', 'Closed tasks cannot accept a submission draft.');
    }
  }

  private assertCanPrepare(access: ActorAccess, submission?: SubmissionRecord, actorId?: string): void {
    if (!access.canPrepare) {
      throw new TaskSubmissionServiceError(403, 'TASK_SUBMISSION_EDIT_FORBIDDEN', 'You cannot edit this task submission.');
    }
    if (submission && actorId && submission.assignedReviewerId === actorId && submission.createdById !== actorId) {
      throw new TaskSubmissionServiceError(403, 'TASK_SUBMISSION_REVIEWER_EDIT_FORBIDDEN', 'The assigned reviewer cannot edit the worker draft.');
    }
  }

  private async getSubmission(
    taskId: string,
    submissionId: string,
    db: DatabaseClient = this.db,
  ): Promise<SubmissionRecord> {
    const submission = await db.taskSubmission.findFirst({
      where: { id: submissionId, taskId },
      include: submissionInclude,
    });
    if (!submission) {
      throw new TaskSubmissionServiceError(404, 'TASK_SUBMISSION_NOT_FOUND', 'Task submission not found.');
    }
    return submission;
  }

  private assertDraft(submission: SubmissionRecord): void {
    if (submission.status !== 'DRAFT') {
      throw new TaskSubmissionServiceError(409, 'TASK_SUBMISSION_ALREADY_SUBMITTED', 'Only a draft submission can be changed.');
    }
  }

  private async reviewerPreference(
    task: WorkflowTaskRecord,
    reviewerId: string,
    db: DatabaseClient,
  ): Promise<EligibleReviewerDto['preference'] | null> {
    const reviewer = await db.user.findUnique({
      where: { id: reviewerId },
      select: { id: true, role: true, status: true, isActive: true },
    });
    if (!reviewer || !reviewer.isActive || reviewer.status !== 'ACTIVE' || !REVIEWER_ROLES.has(String(reviewer.role))) {
      return null;
    }
    if (PRIVILEGED_ROLES.has(String(reviewer.role))) return 'PRIVILEGED';
    if (task.assignedById === reviewerId) return 'TASK_SUPERVISOR';
    if (task.case.assignedLawyerId === reviewerId) return 'CASE_RESPONSIBLE_LAWYER';
    if (task.case.createdById === reviewerId) return 'CASE_CREATOR';
    const collaborator = await db.caseCollaborator.findFirst({
      where: { caseId: task.caseId, userId: reviewerId },
      select: { id: true },
    });
    return collaborator ? 'CASE_COLLABORATOR' : null;
  }

  private async assertEligibleReviewer(
    task: WorkflowTaskRecord,
    reviewerId: string,
    submitterIds: string[],
    db: DatabaseClient,
  ): Promise<void> {
    if (submitterIds.filter(Boolean).includes(reviewerId)) {
      throw new TaskSubmissionServiceError(409, 'SELF_REVIEW_NOT_ALLOWED', 'The submitter cannot review their own submission.');
    }
    const preference = await this.reviewerPreference(task, reviewerId, db);
    if (!preference) {
      throw new TaskSubmissionServiceError(409, 'REVIEWER_INELIGIBLE', 'The selected reviewer is not eligible for this task.');
    }
  }

  private async resolveInitialReviewer(
    task: WorkflowTaskRecord,
    actorId: string,
    actorRole: string,
    explicitReviewerId: string | undefined,
    db: DatabaseClient,
  ): Promise<string> {
    const futureSubmitters = [actorId, task.assignedToId || ''];
    const responsibleLawyerFlow = task.assignedToId === actorId && !DECISION_ROLES.has(actorRole);
    if (responsibleLawyerFlow) {
      return this.resolveResponsibleLawyerReviewer(task, explicitReviewerId, futureSubmitters, db);
    }

    // Canonical default order: the case responsible lawyer wins over the task
    // assigner; the task assigner wins over the case creator. An explicit
    // reviewer selection (non-final reviewer behavior) still takes precedence.
    const candidates = [explicitReviewerId, task.case.assignedLawyerId || undefined, task.assignedById || undefined, task.case.createdById]
      .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

    if (explicitReviewerId) {
      await this.assertEligibleReviewer(task, explicitReviewerId, futureSubmitters, db);
      return explicitReviewerId;
    }

    for (const reviewerId of candidates) {
      if (futureSubmitters.includes(reviewerId)) continue;
      if (await this.reviewerPreference(task, reviewerId, db)) return reviewerId;
    }

    throw new TaskSubmissionServiceError(409, 'REVIEWER_REQUIRED', 'An eligible reviewer must be selected before creating this draft.');
  }

  /**
   * Responsible-lawyer Leadás routing (WORKER → RESPONSIBLE LAWYER). Fails
   * closed: the reviewer MUST be the case's assigned lawyer, who must be
   * present, active, review-eligible and different from the worker/submitter.
   * There is deliberately NO fallback to the task assigner, case creator,
   * collaborator, admin or another eligible reviewer.
   */
  private async resolveResponsibleLawyerReviewer(
    task: WorkflowTaskRecord,
    explicitReviewerId: string | undefined,
    submitterIds: string[],
    db: DatabaseClient,
  ): Promise<string> {
    const lawyerId = task.case.assignedLawyerId || null;
    if (!lawyerId) {
      throw new TaskSubmissionServiceError(409, 'RESPONSIBLE_LAWYER_MISSING', 'The case has no responsible lawyer; the Leadás cannot be routed for legal review.');
    }
    if (explicitReviewerId && explicitReviewerId !== lawyerId) {
      throw new TaskSubmissionServiceError(409, 'REVIEWER_MUST_BE_RESPONSIBLE_LAWYER', 'The responsible-lawyer Leadás must be reviewed by the case responsible lawyer.');
    }
    if (submitterIds.filter(Boolean).includes(lawyerId)) {
      throw new TaskSubmissionServiceError(409, 'SELF_REVIEW_NOT_ALLOWED', 'The responsible lawyer cannot review their own Leadás.');
    }
    const lawyer = await db.user.findUnique({
      where: { id: lawyerId },
      select: { id: true, role: true, status: true, isActive: true },
    });
    if (!lawyer || !lawyer.isActive || lawyer.status !== 'ACTIVE' || !REVIEWER_ROLES.has(String(lawyer.role))) {
      throw new TaskSubmissionServiceError(409, 'RESPONSIBLE_LAWYER_INELIGIBLE', 'The case responsible lawyer is inactive or not eligible for legal review.');
    }
    return lawyerId;
  }

  async listEligibleReviewers(taskId: string, actorId: string): Promise<EligibleReviewerDto[]> {
    const { task } = await this.getTaskForActor(taskId, actorId);
    const users = await this.db.user.findMany({
      where: {
        isActive: true,
        status: 'ACTIVE',
        role: { in: Array.from(REVIEWER_ROLES) as any },
        id: { notIn: [actorId, task.assignedToId || ''].filter(Boolean) },
        OR: [
          { id: task.assignedById || '__none__' },
          { id: task.case.assignedLawyerId || '__none__' },
          { id: task.case.createdById },
          { role: { in: Array.from(PRIVILEGED_ROLES) as any } },
          { caseCollaborations: { some: { caseId: task.caseId } } },
        ],
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    const result: EligibleReviewerDto[] = [];
    for (const user of users) {
      const preference = await this.reviewerPreference(task, user.id, this.db);
      if (preference) result.push({ ...safeUser(user)!, preference });
    }
    return result;
  }

  async createTaskSubmissionDraft(
    taskId: string,
    actorId: string,
    input: CreateDraftInput,
  ): Promise<{ created: boolean; workflow: TaskSubmissionWorkflowDto }> {
    try {
      const result = await withSerializableRetry(this.db, async (tx) => {
        const { task, access } = await this.getTaskForActor(taskId, actorId, tx);
        this.assertCanPrepare(access);
        this.assertTaskOpen(task);

        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "tasks" WHERE "id" = ${taskId} FOR UPDATE`);
        const existing = await tx.taskSubmission.findFirst({
          where: { taskId, status: 'DRAFT' },
          include: submissionInclude,
        });
        if (existing) return { created: false };

        const latest = await tx.taskSubmission.findFirst({
          where: { taskId },
          orderBy: { revisionNumber: 'desc' },
          select: { id: true, revisionNumber: true, status: true },
        });
        if (latest && ['SUBMITTED', 'APPROVED'].includes(String(latest.status))) {
          throw new TaskSubmissionServiceError(409, 'TASK_SUBMISSION_STATE_CONFLICT', 'The latest submission revision is not open for replacement.');
        }
        if (latest?.status === 'RETURNED') {
          throw new TaskSubmissionServiceError(409, 'TASK_SUBMISSION_REVISE_REQUIRED', 'A returned revision must be continued through the explicit revise action.');
        }
        const reviewerId = await this.resolveInitialReviewer(task, actorId, access.role, input.assignedReviewerId, tx);

        await tx.taskSubmission.create({
          data: {
            taskId,
            revisionNumber: (latest?.revisionNumber || 0) + 1,
            status: 'DRAFT',
            createdById: actorId,
            assignedReviewerId: reviewerId,
            supersedesSubmissionId: latest?.id || null,
          },
        });
        return { created: true };
      });
      return { ...result, workflow: await this.getTaskSubmissionWorkflow(taskId, actorId) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const workflow = await this.getTaskSubmissionWorkflow(taskId, actorId);
        if (workflow.activeDraft) return { created: false, workflow };
      }
      throw error;
    }
  }

  async updateTaskSubmissionDraft(
    taskId: string,
    submissionId: string,
    actorId: string,
    input: UpdateDraftInput,
  ): Promise<TaskSubmissionWorkflowDto> {
    const allowedFields = new Set([
      'workSummary',
      'remainingIssues',
      'reviewerNote',
      'requestedAttention',
      'assignedReviewerId',
      'externalActionRequired',
      'externalActionType',
      'zeroTimeConfirmed',
    ]);
    for (const key of Object.keys(input)) {
      if (!allowedFields.has(key)) {
        throw new TaskSubmissionServiceError(400, 'TASK_SUBMISSION_FIELD_NOT_ACCEPTED', `Field ${key} cannot be changed.`);
      }
    }

    await withSerializableRetry(this.db, async (tx) => {
      const { task, access } = await this.getTaskForActor(taskId, actorId, tx);
      const submission = await this.getSubmission(taskId, submissionId, tx);
      this.assertCanPrepare(access, submission, actorId);
      this.assertDraft(submission);

      const data: Prisma.TaskSubmissionUpdateInput = {};
      if ('workSummary' in input) data.workSummary = normalizeOptionalText(input.workSummary);
      if ('remainingIssues' in input) data.remainingIssues = normalizeOptionalText(input.remainingIssues);
      if ('reviewerNote' in input) data.reviewerNote = normalizeOptionalText(input.reviewerNote);
      if ('requestedAttention' in input) {
        if (input.requestedAttention === null || input.requestedAttention === '') {
          data.requestedAttention = null;
        } else if (!ATTENTION_VALUES.has(input.requestedAttention as ReviewAttentionLevel)) {
          throw new TaskSubmissionServiceError(400, 'INVALID_REVIEW_ATTENTION', 'requestedAttention is invalid.');
        } else {
          data.requestedAttention = input.requestedAttention as ReviewAttentionLevel;
        }
      }
      if (input.assignedReviewerId) {
        // Responsible-lawyer Leadás: the worker cannot tamper the reviewer to
        // anyone but the case responsible lawyer. Decision-capable actors keep
        // the existing non-final reviewer selection.
        const responsibleLawyerFlow = task.assignedToId === actorId && !DECISION_ROLES.has(access.role);
        if (responsibleLawyerFlow && input.assignedReviewerId !== task.case.assignedLawyerId) {
          throw new TaskSubmissionServiceError(403, 'REVIEWER_MUST_BE_RESPONSIBLE_LAWYER', 'The responsible-lawyer Leadás reviewer cannot be changed by the worker.');
        }
        await this.assertEligibleReviewer(task, input.assignedReviewerId, [actorId, task.assignedToId || ''], tx);
        data.assignedReviewer = { connect: { id: input.assignedReviewerId } };
      }

      const externalActionRequired = input.externalActionRequired ?? submission.externalActionRequired;
      const externalActionType = 'externalActionType' in input ? input.externalActionType : submission.externalActionType;
      if (externalActionRequired && (!externalActionType || !EXTERNAL_ACTION_VALUES.has(externalActionType as ExternalActionType))) {
        throw new TaskSubmissionServiceError(400, 'EXTERNAL_ACTION_TYPE_REQUIRED', 'externalActionType is required when external action is requested.');
      }
      if (!externalActionRequired && externalActionType) {
        throw new TaskSubmissionServiceError(400, 'EXTERNAL_ACTION_TYPE_NOT_ALLOWED', 'externalActionType must be empty when external action is not requested.');
      }
      if ('externalActionRequired' in input || 'externalActionType' in input) {
        data.externalActionRequired = externalActionRequired;
        data.externalActionType = externalActionRequired ? externalActionType as ExternalActionType : null;
      }

      if ('zeroTimeConfirmed' in input) {
        if (input.zeroTimeConfirmed && submission.timeEntries.length > 0) {
          throw new TaskSubmissionServiceError(409, 'ZERO_TIME_CONFIRMATION_CONFLICT', 'Zero time cannot be confirmed while time entries are linked.');
        }
        data.zeroTimeConfirmed = Boolean(input.zeroTimeConfirmed);
        data.zeroTimeConfirmedBy = input.zeroTimeConfirmed ? { connect: { id: actorId } } : { disconnect: true };
        data.zeroTimeConfirmedAt = input.zeroTimeConfirmed ? new Date() : null;
      }

      if (Object.keys(data).length > 0) {
        await tx.taskSubmission.update({ where: { id: submissionId }, data });
      }
    });

    return this.getTaskSubmissionWorkflow(taskId, actorId);
  }

  async assignSubmissionReviewer(
    taskId: string,
    submissionId: string,
    actorId: string,
    assignedReviewerId: string,
  ): Promise<TaskSubmissionWorkflowDto> {
    return this.updateTaskSubmissionDraft(taskId, submissionId, actorId, { assignedReviewerId });
  }

  async attachSubmissionDocument(
    taskId: string,
    submissionId: string,
    actorId: string,
    input: AttachDocumentInput,
  ): Promise<{ created: boolean; workflow: TaskSubmissionWorkflowDto }> {
    if (!DOCUMENT_ROLE_VALUES.has(input.role as TaskSubmissionDocumentRole)) {
      throw new TaskSubmissionServiceError(400, 'INVALID_SUBMISSION_DOCUMENT_ROLE', 'Document role is invalid.');
    }
    const created = await withSerializableRetry(this.db, async (tx) => {
      const { task, access } = await this.getTaskForActor(taskId, actorId, tx);
      const submission = await this.getSubmission(taskId, submissionId, tx);
      this.assertCanPrepare(access, submission, actorId);
      this.assertDraft(submission);

      const document = await tx.document.findFirst({
        where: { id: input.documentId, caseId: task.caseId },
        select: { id: true },
      });
      if (!document) {
        throw new TaskSubmissionServiceError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      }
      // EXACT-VERSION BINDING: the reviewed output is bound to the document's
      // current version at attach time, so a later upload can never silently
      // float an approved submission onto a different DocumentVersion. An
      // explicit documentVersionId lets the worker pin a specific version when
      // the current one is not the intended output.
      let boundVersionId: string | null = null;
      if (input.documentVersionId) {
        const explicitVersion = await tx.documentVersion.findFirst({
          where: { id: input.documentVersionId, documentId: input.documentId },
          select: { id: true },
        });
        if (!explicitVersion) {
          throw new TaskSubmissionServiceError(400, 'EXACT_VERSION_INVALID', 'The selected document version does not belong to the attached document.');
        }
        boundVersionId = explicitVersion.id;
      } else {
        const currentVersion = await tx.documentVersion.findFirst({
          where: { documentId: input.documentId, isCurrent: true },
          orderBy: { version: 'desc' },
          select: { id: true },
        });
        boundVersionId = currentVersion?.id || null;
      }
      const existing = await tx.taskSubmissionDocument.findUnique({
        where: {
          submissionId_documentId_role: {
            submissionId,
            documentId: input.documentId,
            role: input.role as TaskSubmissionDocumentRole,
          },
        },
        select: { id: true },
      });
      if (existing) return false;
      await tx.taskSubmissionDocument.create({
        data: {
          submissionId,
          documentId: input.documentId,
          documentVersionId: boundVersionId,
          role: input.role as TaskSubmissionDocumentRole,
          createdById: actorId,
        },
      });
      return true;
    });
    return { created, workflow: await this.getTaskSubmissionWorkflow(taskId, actorId) };
  }

  async detachSubmissionDocument(
    taskId: string,
    submissionId: string,
    documentId: string,
    actorId: string,
  ): Promise<TaskSubmissionWorkflowDto> {
    await withSerializableRetry(this.db, async (tx) => {
      const { access } = await this.getTaskForActor(taskId, actorId, tx);
      const submission = await this.getSubmission(taskId, submissionId, tx);
      this.assertCanPrepare(access, submission, actorId);
      this.assertDraft(submission);
      await tx.taskSubmissionDocument.deleteMany({ where: { submissionId, documentId } });
    });
    return this.getTaskSubmissionWorkflow(taskId, actorId);
  }

  async attachSubmissionTimeEntry(
    taskId: string,
    submissionId: string,
    actorId: string,
    input: AttachTimeEntryInput,
  ): Promise<{ created: boolean; workflow: TaskSubmissionWorkflowDto }> {
    const created = await withSerializableRetry(this.db, async (tx) => {
      const { task, access } = await this.getTaskForActor(taskId, actorId, tx);
      const submission = await this.getSubmission(taskId, submissionId, tx);
      this.assertCanPrepare(access, submission, actorId);
      this.assertDraft(submission);

      const entry = await tx.timeEntry.findUnique({
        where: { id: input.timeEntryId },
        select: { id: true, matterId: true, taskId: true, userId: true },
      });
      const sameMatter = Boolean(task.matterId) && entry?.matterId === task.matterId;
      const actorMayUseEntry = entry?.userId === actorId || access.isPrivileged;
      if (!entry || !sameMatter || !actorMayUseEntry || (entry.taskId && entry.taskId !== taskId)) {
        throw new TaskSubmissionServiceError(404, 'TIME_ENTRY_NOT_FOUND', 'Time entry not found.');
      }

      const existing = await tx.taskSubmissionTimeEntry.findUnique({
        where: { timeEntryId: input.timeEntryId },
        select: { id: true, submissionId: true },
      });
      if (existing?.submissionId === submissionId) return false;
      if (existing) {
        throw new TaskSubmissionServiceError(409, 'TIME_ENTRY_ALREADY_SUBMITTED', 'This time entry is already linked to another submission.');
      }

      if (!entry.taskId) {
        await tx.timeEntry.update({ where: { id: entry.id }, data: { taskId } });
      }
      await tx.taskSubmissionTimeEntry.create({ data: { submissionId, timeEntryId: entry.id } });
      if (submission.zeroTimeConfirmed) {
        await tx.taskSubmission.update({
          where: { id: submissionId },
          data: { zeroTimeConfirmed: false, zeroTimeConfirmedById: null, zeroTimeConfirmedAt: null },
        });
      }
      return true;
    });
    return { created, workflow: await this.getTaskSubmissionWorkflow(taskId, actorId) };
  }

  async detachSubmissionTimeEntry(
    taskId: string,
    submissionId: string,
    timeEntryId: string,
    actorId: string,
  ): Promise<TaskSubmissionWorkflowDto> {
    await withSerializableRetry(this.db, async (tx) => {
      const { access } = await this.getTaskForActor(taskId, actorId, tx);
      const submission = await this.getSubmission(taskId, submissionId, tx);
      this.assertCanPrepare(access, submission, actorId);
      this.assertDraft(submission);
      await tx.taskSubmissionTimeEntry.deleteMany({ where: { submissionId, timeEntryId } });
    });
    return this.getTaskSubmissionWorkflow(taskId, actorId);
  }

  private async computeReadiness(
    task: WorkflowTaskRecord,
    submission: SubmissionRecord,
    actorId: string,
    actorRole: string,
    db: DatabaseClient,
  ): Promise<SubmissionReadinessDto> {
    const missing: SubmissionReadinessCode[] = [];
    const blocking: SubmissionReadinessCode[] = [];
    const warnings: Array<'ZERO_TIME_CONFIRMED' | 'VERSION_NOT_CURRENT'> = [];

    if (submission.status !== 'DRAFT') blocking.push('SUBMISSION_NOT_DRAFT');
    if (!submission.workSummary?.trim()) missing.push('WORK_SUMMARY_REQUIRED');
    if (!submission.requestedAttention) missing.push('REVIEW_ATTENTION_REQUIRED');
    if (!submission.assignedReviewerId) {
      missing.push('REVIEWER_REQUIRED');
    } else if (submission.assignedReviewerId === actorId || submission.assignedReviewerId === task.assignedToId) {
      blocking.push('SELF_REVIEW_NOT_ALLOWED');
    } else if (!(await this.reviewerPreference(task, submission.assignedReviewerId, db))) {
      blocking.push('REVIEWER_INELIGIBLE');
    }

    // Responsible-lawyer Leadás: when the worker (non-decision role) submits,
    // the reviewer MUST still resolve to the case's responsible lawyer. Fail
    // closed with a specific, actionable readiness state.
    const responsibleLawyerFlow = task.assignedToId === actorId && !DECISION_ROLES.has(actorRole);
    if (responsibleLawyerFlow) {
      if (!task.case.assignedLawyerId) {
        blocking.push('RESPONSIBLE_LAWYER_MISSING');
      } else if (submission.assignedReviewerId && submission.assignedReviewerId !== task.case.assignedLawyerId) {
        blocking.push('REVIEWER_MUST_BE_RESPONSIBLE_LAWYER');
      } else if (task.case.assignedLawyerId) {
        const lawyer = await db.user.findUnique({
          where: { id: task.case.assignedLawyerId },
          select: { id: true, role: true, status: true, isActive: true },
        });
        if (!lawyer || !lawyer.isActive || lawyer.status !== 'ACTIVE' || !REVIEWER_ROLES.has(String(lawyer.role))) {
          blocking.push('RESPONSIBLE_LAWYER_INELIGIBLE');
        }
      }
    }

    if (!submission.documents.some((link) => link.role === 'PRIMARY_OUTPUT')) missing.push('OUTPUT_REQUIRED');
    if (submission.documents.some((link) => link.document.caseId !== task.caseId)) blocking.push('DOCUMENT_SCOPE_INVALID');

    // EXACT VERSION: every linked output must carry a non-null exact
    // DocumentVersion. Legacy null-version rows are preserved as history but a
    // new Leadás cannot be submitted without an exact version binding.
    for (const link of submission.documents) {
      if (!link.documentVersionId) missing.push('EXACT_VERSION_REQUIRED');
      const isCurrent = link.document.versions.some((version) => version.id === link.documentVersionId);
      if (link.documentVersionId && link.document.versions.length > 0 && !isCurrent) {
        warnings.push('VERSION_NOT_CURRENT');
      }
    }

    const invalidTime = submission.timeEntries.some((link) =>
      link.timeEntry.matterId !== task.matterId || link.timeEntry.taskId !== task.id,
    );
    if (invalidTime) blocking.push('TIME_ENTRY_SCOPE_INVALID');
    if (submission.timeEntries.length === 0 && !submission.zeroTimeConfirmed) {
      missing.push('TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED');
    }
    if (submission.zeroTimeConfirmed) warnings.push('ZERO_TIME_CONFIRMED');

    try {
      planCanonicalTaskTransition(task, 'SUBMIT_FOR_REVIEW', actorId, actorRole);
    } catch (error) {
      if (error instanceof WorkflowTransitionError) blocking.push('TASK_STATE_NOT_SUBMITTABLE');
      else throw error;
    }

    return {
      ready: missing.length === 0 && blocking.length === 0,
      missingPrerequisites: Array.from(new Set(missing)),
      blockingErrors: Array.from(new Set(blocking)),
      warnings,
    };
  }

  async validateSubmissionReadiness(
    taskId: string,
    submissionId: string,
    actorId: string,
  ): Promise<SubmissionReadinessDto> {
    const { task, access } = await this.getTaskForActor(taskId, actorId);
    const submission = await this.getSubmission(taskId, submissionId);
    return this.computeReadiness(task, submission, actorId, access.role, this.db);
  }

  async getTaskSubmissionWorkflow(taskId: string, actorId: string): Promise<TaskSubmissionWorkflowDto> {
    const { task, access } = await this.getTaskForActor(taskId, actorId);
    const submissions = await this.db.taskSubmission.findMany({
      where: { taskId },
      include: submissionInclude,
      orderBy: { revisionNumber: 'desc' },
    });
    const activeDraft = submissions.find((submission) => submission.status === 'DRAFT') || null;
    const latestSubmitted = submissions.find((submission) => submission.status !== 'DRAFT' && submission.status !== 'CANCELLED') || null;
    const readableSubmitted = latestSubmitted?.assignedReviewerId === actorId || access.canRead;
    const readiness = activeDraft
      ? await this.computeReadiness(task, activeDraft, actorId, access.role, this.db)
      : null;
    const responsibleLawyerFlow = task.assignedToId === actorId && !DECISION_ROLES.has(access.role);
    const responsibleLawyer = safeUser(task.case.assignedLawyer || null);
    const canEditDraft = Boolean(activeDraft) && access.canPrepare && activeDraft?.assignedReviewerId !== actorId;
    const returnedRevision = submissions.find((submission) => submission.status === 'RETURNED') || null;
    const approvedRevision = submissions.find((submission) => submission.status === 'APPROVED') || null;
    const canReviseReturned = Boolean(returnedRevision && !activeDraft && returnedRevision.submittedById === actorId && access.isTaskAssignee);
    const scopedExternalCompletionActor = task.assignedById === actorId
      || task.case.assignedLawyerId === actorId
      || task.case.createdById === actorId
      || Boolean(await this.db.caseCollaborator.findFirst({ where: { caseId: task.caseId, userId: actorId }, select: { id: true } }));
    const canRecordExternalCompletion = Boolean(
      approvedRevision
      && approvedRevision.externalActionRequired
      && !approvedRevision.externalCompletedAt
      && approvedRevision.submittedById !== actorId
      && REVIEWER_ROLES.has(access.role)
      && scopedExternalCompletionActor
    );

    let nextActionCode = ['PENDING', 'TODO'].includes(String(task.status)) ? 'START_TASK' : 'OPEN_TASK';
    if (activeDraft) nextActionCode = 'CONTINUE_SUBMISSION';
    else if (latestSubmitted?.status === 'SUBMITTED') nextActionCode = latestSubmitted.assignedReviewerId === actorId ? 'OPEN_REVIEW' : 'VIEW_SUBMISSION';
    else if (canReviseReturned) nextActionCode = 'CONTINUE_RETURNED_WORK';
    else if (canRecordExternalCompletion) nextActionCode = 'RECORD_EXTERNAL_COMPLETION';
    else if (approvedRevision && approvedRevision.externalCompletedAt) nextActionCode = 'VIEW_COMPLETED';

    return {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: String(task.status),
        priority: String(task.priority),
        dueDate: task.dueDate?.toISOString() || null,
        caseId: task.caseId,
        matterId: task.matterId,
        assignee: safeUser(task.assignedTo),
        case: {
          id: task.case.id,
          caseNumber: task.case.caseNumber,
          title: task.case.title,
          client: task.case.client,
        },
      },
      activeDraft: activeDraft ? toSubmissionDto(activeDraft) : null,
      submissions: submissions.map(toSubmissionDto),
      latestSubmittedRevision: latestSubmitted ? toSubmissionDto(latestSubmitted) : null,
      latestDecision: latestSubmitted?.reviewDecision ? toSubmissionDto(latestSubmitted).reviewDecision : null,
      currentReviewer: safeUser(activeDraft?.assignedReviewer || latestSubmitted?.assignedReviewer || null),
      responsibleLawyerFlow,
      responsibleLawyer,
      readiness,
      permittedActions: {
        read: true,
        createDraft: access.canPrepare && !activeDraft && !TERMINAL_TASK_STATUSES.has(String(task.status)),
        editDraft: canEditDraft,
        attachDocument: canEditDraft,
        attachTimeEntry: canEditDraft,
        assignReviewer: canEditDraft && !responsibleLawyerFlow,
        submit: Boolean(activeDraft && readiness?.ready && access.isTaskAssignee),
        reviewSubmitted: Boolean(latestSubmitted && readableSubmitted && latestSubmitted.assignedReviewerId === actorId && latestSubmitted.submittedById !== actorId),
        reviseReturned: canReviseReturned,
        recordExternalCompletion: canRecordExternalCompletion,
      },
      nextActionCode,
    };
  }

  async submitTaskSubmission(
    taskId: string,
    submissionId: string,
    actorId: string,
    idempotencyKey: string,
    confirmedDocumentVersionIds: string[] = [],
  ): Promise<{ idempotentReplay: boolean; workflow: TaskSubmissionWorkflowDto; submission: TaskSubmissionDto }> {
    const normalizedKey = idempotencyKey.trim();
    if (!normalizedKey || normalizedKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new TaskSubmissionServiceError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    }
    const confirmedIds = Array.isArray(confirmedDocumentVersionIds)
      ? confirmedDocumentVersionIds.map((value) => String(value)).filter(Boolean)
      : [];

    const result = await withSerializableRetry(this.db, async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "tasks" WHERE "id" = ${taskId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "task_submissions" WHERE "id" = ${submissionId} FOR UPDATE`);

      const { task, access } = await this.getTaskForActor(taskId, actorId, tx);
      const submission = await this.getSubmission(taskId, submissionId, tx);
      if (!access.isTaskAssignee) {
        throw new TaskSubmissionServiceError(403, 'TASK_SUBMISSION_SUBMIT_FORBIDDEN', 'Only the task assignee may submit this work for review.');
      }

      const keyOwner = await tx.taskSubmission.findUnique({
        where: { idempotencyKey: normalizedKey },
        include: submissionInclude,
      });
      if (keyOwner) {
        if (keyOwner.id !== submissionId || keyOwner.taskId !== taskId) {
          throw new TaskSubmissionServiceError(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was used for another submission.');
        }
        if (keyOwner.status !== 'SUBMITTED') {
          throw new TaskSubmissionServiceError(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key is not reusable.');
        }
        return { idempotentReplay: true, submission: keyOwner };
      }

      this.assertCanPrepare(access, submission, actorId);
      this.assertDraft(submission);

      // Responsible-lawyer contract at submit time (authoritative fail-closed
      // gate with specific, actionable errors): for a worker (non-decision
      // role) Leadás the reviewer MUST resolve to the case's responsible
      // lawyer — present, active, review-eligible, different from the worker.
      const responsibleLawyerFlow = task.assignedToId === actorId && !DECISION_ROLES.has(access.role);
      if (responsibleLawyerFlow) {
        await this.resolveResponsibleLawyerReviewer(task, submission.assignedReviewerId, [actorId, task.assignedToId || ''], tx);
      }

      // EXACT VERSION at Leadás: when a bound output version is no longer the
      // document's current version (a newer version exists), the worker must
      // explicitly confirm the exact submitted version ids. Confirmation ids
      // must match the bound ids exactly — no silent substitution.
      const boundVersionIds = submission.documents
        .map((link) => link.documentVersionId)
        .filter((value): value is string => Boolean(value));
      const hasSupersededOutput = submission.documents.some(
        (link) => link.documentVersionId && link.document.versions.length > 0 && !link.document.versions.some((version) => version.id === link.documentVersionId),
      );
      if (hasSupersededOutput) {
        const confirmedSet = new Set(confirmedIds);
        const unconfirmed = boundVersionIds.filter((id) => !confirmedSet.has(id));
        const unknown = confirmedIds.filter((id) => !boundVersionIds.includes(id));
        if (unconfirmed.length > 0 || unknown.length > 0) {
          throw new TaskSubmissionServiceError(409, 'EXACT_VERSION_CONFIRMATION_REQUIRED', 'A newer document version exists. Confirm the exact submitted version(s) before Leadás.');
        }
      }

      const readiness = await this.computeReadiness(task, submission, actorId, access.role, tx);
      if (!readiness.ready) {
        throw new TaskSubmissionServiceError(409, 'HANDOFF_NOT_READY', 'The task submission is not ready.',);
      }

      const transition = planCanonicalTaskTransition(task, 'SUBMIT_FOR_REVIEW', actorId, access.role);
      const submittedAt = new Date();
      const updated = await tx.taskSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'SUBMITTED',
          submittedById: actorId,
          submittedAt,
          idempotencyKey: normalizedKey,
        },
        include: submissionInclude,
      });
      await tx.task.update({
        where: { id: taskId },
        data: transition.data as Prisma.TaskUpdateInput,
      });

      const isResubmission = Boolean(submission.supersedesSubmissionId);
      const auditType = isResubmission ? 'TASK_SUBMISSION_RESUBMITTED' : 'TASK_SUBMISSION_SUBMITTED';
      const auditMetadata = {
        submissionId,
        priorSubmissionId: submission.supersedesSubmissionId,
        revisionNumber: submission.revisionNumber,
        actorId,
        reviewerId: submission.assignedReviewerId,
        eventType: auditType,
        attention: submission.requestedAttention,
        documentCount: submission.documents.length,
        documentVersionIds: boundVersionIds,
        timeEntryCount: submission.timeEntries.length,
        zeroTimeConfirmed: submission.zeroTimeConfirmed,
        status: 'SUBMITTED',
      };
      await tx.timelineEvent.create({
        data: {
          eventType: 'REVIEW_REQUESTED',
          type: auditType,
          description: isResubmission ? 'A corrected task submission was resubmitted for review.' : 'A task submission was sent for review.',
          caseId: task.caseId,
          userId: actorId,
          taskId,
          metadata: auditMetadata,
        },
      });
      await tx.notification.create({
        data: {
          type: 'REVIEW_REQUESTED',
          title: 'Feladat review-ra vár',
          message: 'Új feladatleadás érkezett review-ra.',
          link: `/tasks?taskId=${encodeURIComponent(taskId)}`,
          userId: submission.assignedReviewerId,
        },
      });

      await this.hooks.beforeSubmitCommit?.();
      return { idempotentReplay: false, submission: updated };
    });

    return {
      idempotentReplay: result.idempotentReplay,
      submission: toSubmissionDto(result.submission),
      workflow: await this.getTaskSubmissionWorkflow(taskId, actorId),
    };
  }

  async getSubmissionReviewQueue(userId: string): Promise<any[]> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) return [];
    // Visibility keeps the legacy navigation rows (assigner, responsible
    // lawyer, case creator, collaborators) so no existing surface loses its
    // read access; ACTIONABLE authority below is granted ONLY to the
    // submission's assigned reviewer.
    const submissions = await this.db.taskSubmission.findMany({
      where: {
        status: 'SUBMITTED',
        submittedById: { not: userId },
        OR: [
          { assignedReviewerId: userId },
          { task: { assignedById: userId } },
          { task: { case: { assignedLawyerId: userId } } },
          { task: { case: { createdById: userId } } },
          { task: { case: { collaborators: { some: { userId } } } } },
        ],
      },
      select: {
        id: true,
        taskId: true,
        revisionNumber: true,
        status: true,
        requestedAttention: true,
        externalActionRequired: true,
        workSummary: true,
        submittedAt: true,
        submittedBy: { select: { id: true, name: true, email: true, role: true } },
        assignedReviewer: { select: { id: true, name: true, email: true, role: true } },
        documents: {
          select: { id: true, documentId: true, documentVersionId: true, role: true },
          orderBy: { createdAt: 'asc' as const },
        },
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            case: {
              select: {
                id: true,
                caseNumber: true,
                title: true,
                clientId: true,
                clientName: true,
                matterType: true,
                client: { select: { colorKey: true } },
              },
            },
          },
        },
        _count: { select: { documents: true } },
        timeEntries: { select: { timeEntry: { select: { minutes: true } } } },
      },
      orderBy: [{ submittedAt: 'desc' }, { revisionNumber: 'desc' }],
    });

    return submissions.map((submission) => {
      const { client, ...safeCase } = submission.task.case;
      const actionable = submission.assignedReviewer?.id === userId;
      return {
      id: submission.taskId,
      source: 'TASK_SUBMISSION',
      submissionId: submission.id,
      revisionNumber: submission.revisionNumber,
      taskId: submission.taskId,
      title: submission.task.title,
      status: String(submission.status),
      taskStatus: String(submission.task.status),
      priority: String(submission.task.priority),
      dueDate: submission.task.dueDate,
      submittedAt: submission.submittedAt,
      submittedBy: safeUser(submission.submittedBy),
      assignedReviewer: safeUser(submission.assignedReviewer),
      requestedAttention: submission.requestedAttention ? String(submission.requestedAttention) : null,
      attentionEstimate: attentionEstimateFor(submission.requestedAttention),
      externalActionRequired: submission.externalActionRequired,
      workSummaryPreview: boundedPreview(submission.workSummary),
      submissionDocumentCount: submission._count.documents,
      documentVersions: (submission.documents ?? []).map((link) => ({
        documentId: link.documentId,
        documentVersionId: link.documentVersionId,
        role: String(link.role),
      })),
      linkedTimeMinutes: submission.timeEntries.reduce((sum, link) => sum + link.timeEntry.minutes, 0),
      actionable,
      readOnly: !actionable,
      nextActionCode: actionable ? 'OPEN_REVIEW' : 'VIEW_SUBMISSION',
      case: { ...safeCase, clientColorKey: client?.colorKey ? String(client.colorKey) : null },
      };
    });
  }
}

const taskSubmissionService = new TaskSubmissionService();

export default taskSubmissionService;
