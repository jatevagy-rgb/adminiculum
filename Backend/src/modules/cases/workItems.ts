import { prisma } from '../../prisma/prisma.service';
import { isDatabaseFoundationEnabled } from '../../middleware/featureAvailability';

export type WorkItemType = 'TASK' | 'HANDOFF' | 'DOCUMENT' | 'COMMUNICATION';
export type WorkflowCategory = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'WAITING' | 'REVIEW' | 'HANDOFF' | 'COMPLETED';
export type WorkItemUrgency = 'OVERDUE' | 'TODAY' | 'SOON' | 'LATER' | 'NONE';
export type SupportedTaskAction = 'START' | 'SUBMIT_FOR_REVIEW' | 'APPROVE' | 'RETURN_FOR_CORRECTION' | 'BLOCK' | 'UNBLOCK';

const OPEN_TASK_STATUSES = new Set(['PENDING', 'TODO']);
const ACTIVE_TASK_STATUSES = new Set(['PENDING', 'TODO', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW', 'BLOCKED']);
const REVIEW_TASK_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW']);
const DONE_TASK_STATUSES = new Set(['COMPLETED', 'DONE', 'CANCELLED']);
const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);
const REVIEWER_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);

export interface WorkItemCapabilities {
  canStart: boolean;
  canComplete: boolean;
  canBlock: boolean;
  canUnblock: boolean;
  canSubmitForReview: boolean;
  canApprove: boolean;
  canReturnForCorrection: boolean;
  canCreateHandoff: boolean;
  canAcceptHandoff: boolean;
  canReturnHandoff: boolean;
  canOpenSource: boolean;
}

export interface CaseWorkItemsDto {
  caseId: string;
  generatedAt: string;
  summary: {
    open: number;
    mine: number;
    overdue: number;
    dueSoon: number;
    blocked: number;
    waiting: number;
    reviewRequired: number;
    handoffRequired: number;
    completedRecently: number;
  };
  items: Array<{
    id: string;
    type: WorkItemType;
    title: string;
    safeDescription?: string | null;
    status: string;
    workflowCategory: WorkflowCategory;
    priority?: string | null;
    dueAt?: string | null;
    completedAt?: string | null;
    updatedAt?: string | null;
    caseId: string;
    isMine: boolean;
    assignee?: { id: string; displayName: string } | null;
    createdBy?: { id: string; displayName: string } | null;
    review?: {
      reviewer?: { id: string; displayName: string } | null;
      state?: string | null;
      requestedAt?: string | null;
      reviewedAt?: string | null;
    } | null;
    handoff?: {
      id: string;
      status: string;
      from?: { id: string; displayName: string } | null;
      to?: { id: string; displayName: string } | null;
      updatedAt?: string | null;
    } | null;
    blocker?: {
      category?: string | null;
      safeLabel?: string | null;
      since?: string | null;
    } | null;
    source?: {
      type?: 'DOCUMENT' | 'COMMUNICATION' | 'DEADLINE' | 'CASE' | null;
      id?: string | null;
      displayName?: string | null;
      href?: string | null;
    } | null;
    urgency: WorkItemUrgency;
    capabilities: WorkItemCapabilities;
    href?: string | null;
  }>;
  availability: {
    taskTransitions: boolean;
    blockerState: boolean;
    waitingState: boolean;
    reviewWorkflow: boolean;
    handoffWorkflow: boolean;
  };
}

export class WorkflowTransitionError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowTransitionError';
  }
}

function isOpenTaskStatus(status?: string | null): boolean {
  return ACTIVE_TASK_STATUSES.has(String(status || '').toUpperCase());
}

export function deriveWorkflowCategory(status?: string | null, stuckReason?: string | null): WorkflowCategory {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'BLOCKED' || stuckReason) return 'BLOCKED';
  if (REVIEW_TASK_STATUSES.has(normalized)) return 'REVIEW';
  if (DONE_TASK_STATUSES.has(normalized)) return 'COMPLETED';
  if (normalized === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'OPEN';
}

export function deriveUrgency(dueAt?: string | Date | null, now: Date = new Date()): WorkItemUrgency {
  if (!dueAt) return 'NONE';
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'NONE';

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 3);

  if (due.getTime() < todayStart.getTime()) return 'OVERDUE';
  if (due.getTime() < tomorrowStart.getTime()) return 'TODAY';
  if (due.getTime() <= soon.getTime()) return 'SOON';
  return 'LATER';
}

function blankCapabilities(): WorkItemCapabilities {
  return {
    canStart: false,
    canComplete: false,
    canBlock: false,
    canUnblock: false,
    canSubmitForReview: false,
    canApprove: false,
    canReturnForCorrection: false,
    canCreateHandoff: false,
    canAcceptHandoff: false,
    canReturnHandoff: false,
    canOpenSource: false,
  };
}

function isManagerRole(role?: string | null): boolean {
  return PRIVILEGED_ROLES.has(String(role || '').toUpperCase());
}

export function deriveTaskCapabilities(
  task: { status?: string | null; assignedToId?: string | null; assignedById?: string | null; stuckReason?: string | null },
  currentUserId: string,
  currentUserRole?: string | null
): WorkItemCapabilities {
  const capabilities = blankCapabilities();
  const status = String(task.status || '').toUpperCase();
  const role = String(currentUserRole || '').toUpperCase();
  const assignedWorker = Boolean(task.assignedToId) && task.assignedToId === currentUserId;
  const taskSupervisor = Boolean(task.assignedById) && task.assignedById === currentUserId;
  const reviewer = task.assignedToId !== currentUserId && (taskSupervisor || REVIEWER_ROLES.has(role));

  capabilities.canStart = assignedWorker && OPEN_TASK_STATUSES.has(status);
  capabilities.canSubmitForReview = assignedWorker && status === 'IN_PROGRESS';
  capabilities.canApprove = reviewer && REVIEW_TASK_STATUSES.has(status);
  capabilities.canReturnForCorrection = reviewer && REVIEW_TASK_STATUSES.has(status);
  capabilities.canComplete = capabilities.canApprove;
  capabilities.canBlock = assignedWorker && ['PENDING', 'TODO', 'IN_PROGRESS'].includes(status);
  capabilities.canUnblock = assignedWorker && status === 'BLOCKED';
  capabilities.canCreateHandoff = false;
  return capabilities;
}

export function validateTaskTransition(
  task: { status?: string | null; assignedToId?: string | null; assignedById?: string | null },
  action: SupportedTaskAction,
  currentUserId: string,
  currentUserRole?: string | null
): { status: string; data: Record<string, unknown>; timelineType: string } {
  const capabilities = deriveTaskCapabilities(task, currentUserId, currentUserRole);
  const status = String(task.status || '').toUpperCase();
  const now = new Date();

  const denied = () => {
    throw new WorkflowTransitionError(403, 'TASK_ACTION_FORBIDDEN', 'You are not allowed to perform this task action.');
  };
  const conflict = () => {
    throw new WorkflowTransitionError(409, 'INVALID_TASK_TRANSITION', 'The task is not in a state that allows this action.');
  };

  if (action === 'START') {
    if (!OPEN_TASK_STATUSES.has(status)) conflict();
    if (!capabilities.canStart) denied();
    return { status: 'IN_PROGRESS', data: { status: 'IN_PROGRESS', startedAt: now }, timelineType: 'TASK_STARTED' };
  }
  if (action === 'SUBMIT_FOR_REVIEW') {
    if (status !== 'IN_PROGRESS') conflict();
    if (!capabilities.canSubmitForReview) denied();
    return { status: 'IN_REVIEW', data: { status: 'IN_REVIEW', submittedAt: now }, timelineType: 'TASK_SUBMITTED' };
  }
  if (action === 'APPROVE') {
    if (!REVIEW_TASK_STATUSES.has(status)) conflict();
    if (!capabilities.canApprove) denied();
    return { status: 'DONE', data: { status: 'DONE', completedAt: now }, timelineType: 'TASK_COMPLETED' };
  }
  if (action === 'RETURN_FOR_CORRECTION') {
    if (!REVIEW_TASK_STATUSES.has(status)) conflict();
    if (!capabilities.canReturnForCorrection) denied();
    return { status: 'IN_PROGRESS', data: { status: 'IN_PROGRESS', completedAt: null }, timelineType: 'TASK_REJECTED' };
  }
  if (action === 'BLOCK') {
    if (!['PENDING', 'TODO', 'IN_PROGRESS'].includes(status)) conflict();
    if (!capabilities.canBlock) denied();
    return { status: 'BLOCKED', data: { status: 'BLOCKED', stuckSince: now }, timelineType: 'TASK_BLOCKED' };
  }
  if (action === 'UNBLOCK') {
    if (status !== 'BLOCKED') conflict();
    if (!capabilities.canUnblock) denied();
    return { status: 'IN_PROGRESS', data: { status: 'IN_PROGRESS', stuckReason: null, stuckSince: null }, timelineType: 'TASK_STARTED' };
  }

  throw new WorkflowTransitionError(400, 'UNKNOWN_TASK_ACTION', 'Unknown task action.');
}

export function deriveHandoffCapabilities(
  handoff: { status?: string | null; preparedById?: string | null; reviewedById?: string | null },
  currentUserId: string,
  currentUserRole?: string | null
): WorkItemCapabilities {
  const capabilities = blankCapabilities();
  const status = String(handoff.status || '').toUpperCase();
  const manager = isManagerRole(currentUserRole);
  capabilities.canOpenSource = true;
  capabilities.canAcceptHandoff = manager && ['SUBMITTED', 'IN_REVIEW'].includes(status);
  capabilities.canReturnHandoff = manager && ['SUBMITTED', 'IN_REVIEW'].includes(status);
  capabilities.canCreateHandoff = Boolean(currentUserId);
  return capabilities;
}

function displayUser(user?: { id: string; name?: string | null; email?: string | null } | null): { id: string; displayName: string } | null {
  if (!user?.id) return null;
  return { id: user.id, displayName: user.name || user.email || user.id };
}

function safeDescription(value?: string | null): string | null {
  if (!value) return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function urgencyRank(urgency: WorkItemUrgency): number {
  return { OVERDUE: 0, TODAY: 1, SOON: 2, LATER: 4, NONE: 5 }[urgency];
}

function categoryRank(category: WorkflowCategory, capabilities: WorkItemCapabilities): number {
  if (category === 'REVIEW' && (capabilities.canApprove || capabilities.canReturnForCorrection)) return 1;
  if (category === 'HANDOFF' && (capabilities.canAcceptHandoff || capabilities.canReturnHandoff)) return 1;
  if (category === 'BLOCKED') return 3;
  if (category === 'IN_PROGRESS') return 4;
  if (category === 'OPEN') return 5;
  if (category === 'COMPLETED') return 9;
  return 6;
}

export async function getCaseWorkItems(
  caseId: string,
  currentUserId: string,
  currentUserRole?: string | null,
  now: Date = new Date()
): Promise<CaseWorkItemsDto | null> {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true },
  });
  if (!caseRecord) return null;

  const [tasks, documents, communications, handoffs] = await Promise.all([
    prisma.task.findMany({
      where: { caseId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        submittedAt: true,
        updatedAt: true,
        caseId: true,
        assignedToId: true,
        assignedById: true,
        documentId: true,
        sourceCommunicationId: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        assignedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: 80,
    }),
    prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        name: true,
        fileName: true,
        documentType: true,
        category: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.communication.findMany({
      where: { caseId },
      select: {
        id: true,
        subject: true,
        summary: true,
        type: true,
        documentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    isDatabaseFoundationEnabled('ENABLE_HANDOFF_PACKAGES') && (prisma as any).lawyerHandoffPackage
      ? (prisma as any).lawyerHandoffPackage.findMany({
          where: { caseId, status: { not: 'ARCHIVED' } },
          select: {
            id: true,
            caseId: true,
            status: true,
            packageType: true,
            sourceDocumentId: true,
            preparerSummary: true,
            preparedById: true,
            submittedAt: true,
            reviewedById: true,
            reviewedAt: true,
            reviewDecision: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const taskItems = tasks.map((task) => {
    const stuckReason = null;
    const stuckSince = null;
    const workflowCategory = deriveWorkflowCategory(task.status, stuckReason);
    const urgency = deriveUrgency(task.dueDate, now);
    const capabilities = deriveTaskCapabilities(task, currentUserId, currentUserRole);
    const item = {
      id: task.id,
      type: 'TASK' as const,
      title: task.title,
      safeDescription: safeDescription(task.description),
      status: String(task.status),
      workflowCategory,
      priority: task.priority ? String(task.priority) : null,
      dueAt: task.dueDate ? task.dueDate.toISOString() : null,
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      updatedAt: task.updatedAt ? task.updatedAt.toISOString() : null,
      caseId: task.caseId,
      isMine: task.assignedToId === currentUserId,
      assignee: displayUser(task.assignedTo),
      createdBy: displayUser(task.assignedBy),
      review: REVIEW_TASK_STATUSES.has(String(task.status).toUpperCase())
        ? {
            reviewer: null,
            state: String(task.status),
            requestedAt: task.submittedAt ? task.submittedAt.toISOString() : null,
            reviewedAt: null,
          }
        : null,
      handoff: null,
      blocker: stuckReason || stuckSince
        ? {
            category: stuckReason ? String(stuckReason) : null,
            safeLabel: stuckReason ? String(stuckReason).replace(/_/g, ' ') : 'Blokkolt feladat',
            since: stuckSince ? stuckSince.toISOString() : null,
          }
        : null,
      source: task.documentId
        ? {
            type: 'DOCUMENT' as const,
            id: task.documentId,
            displayName: 'Kapcsolt dokumentum',
            href: `/documents/compare?caseId=${encodeURIComponent(task.caseId)}&documentId=${encodeURIComponent(task.documentId)}`,
          }
        : task.sourceCommunicationId
          ? {
              type: 'COMMUNICATION' as const,
              id: task.sourceCommunicationId,
              displayName: 'Kapcsolt kommunikáció',
              href: `/cases/${encodeURIComponent(task.caseId)}/communications`,
            }
          : {
              type: 'CASE' as const,
              id: task.caseId,
              displayName: 'Ügy',
              href: `/cases/${encodeURIComponent(task.caseId)}`,
            },
      urgency,
      capabilities: { ...capabilities, canOpenSource: Boolean(task.documentId || task.sourceCommunicationId) },
      href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
    };
    return item;
  });

  const handoffItems = (handoffs as any[]).map((handoff) => {
    const capabilities = deriveHandoffCapabilities(handoff, currentUserId, currentUserRole);
    return {
      id: `handoff-${handoff.id}`,
      type: 'HANDOFF' as const,
      title: handoff.packageType === 'FINAL_APPROVAL' ? 'Végső jóváhagyási leadás' : 'Ügyvédi leadási csomag',
      safeDescription: safeDescription(handoff.preparerSummary),
      status: String(handoff.status),
      workflowCategory: 'HANDOFF' as const,
      priority: null,
      dueAt: null,
      completedAt: handoff.reviewedAt ? new Date(handoff.reviewedAt).toISOString() : null,
      updatedAt: handoff.updatedAt ? new Date(handoff.updatedAt).toISOString() : null,
      caseId: handoff.caseId,
      isMine: false,
      assignee: null,
      createdBy: handoff.preparedById ? { id: handoff.preparedById, displayName: handoff.preparedById } : null,
      review: {
        reviewer: handoff.reviewedById ? { id: handoff.reviewedById, displayName: handoff.reviewedById } : null,
        state: handoff.reviewDecision || handoff.status,
        requestedAt: handoff.submittedAt ? new Date(handoff.submittedAt).toISOString() : null,
        reviewedAt: handoff.reviewedAt ? new Date(handoff.reviewedAt).toISOString() : null,
      },
      handoff: {
        id: handoff.id,
        status: String(handoff.status),
        from: handoff.preparedById ? { id: handoff.preparedById, displayName: handoff.preparedById } : null,
        to: null,
        updatedAt: handoff.updatedAt ? new Date(handoff.updatedAt).toISOString() : null,
      },
      blocker: null,
      source: handoff.sourceDocumentId
        ? {
            type: 'DOCUMENT' as const,
            id: handoff.sourceDocumentId,
            displayName: 'Leadási dokumentum',
            href: `/documents/compare?caseId=${encodeURIComponent(handoff.caseId)}&documentId=${encodeURIComponent(handoff.sourceDocumentId)}`,
          }
        : { type: 'CASE' as const, id: handoff.caseId, displayName: 'Ügy', href: `/cases/${encodeURIComponent(handoff.caseId)}/handoff` },
      urgency: 'NONE' as const,
      capabilities,
      href: `/cases/${encodeURIComponent(handoff.caseId)}/handoff`,
    };
  });

  const documentItems = documents.map((document) => {
    const capabilities = blankCapabilities();
    capabilities.canOpenSource = true;
    return {
      id: `document-${document.id}`,
      type: 'DOCUMENT' as const,
      title: document.fileName || document.name || 'Kapcsolt dokumentum',
      safeDescription: [document.documentType, document.category].filter(Boolean).join(' · ') || null,
      status: String(document.documentType || document.category || 'DOCUMENT'),
      workflowCategory: 'OPEN' as const,
      priority: null,
      dueAt: null,
      completedAt: null,
      updatedAt: document.updatedAt ? document.updatedAt.toISOString() : document.createdAt.toISOString(),
      caseId,
      isMine: false,
      assignee: null,
      createdBy: null,
      review: null,
      handoff: null,
      blocker: null,
      source: {
        type: 'DOCUMENT' as const,
        id: document.id,
        displayName: 'Dokumentum',
        href: `/documents/compare?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(document.id)}`,
      },
      urgency: 'NONE' as const,
      capabilities,
      href: `/documents/compare?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(document.id)}`,
    };
  });

  const communicationItems = communications.map((communication) => {
    const capabilities = blankCapabilities();
    capabilities.canOpenSource = true;
    return {
      id: `communication-${communication.id}`,
      type: 'COMMUNICATION' as const,
      title: communication.subject || 'Kapcsolt kommunikáció',
      safeDescription: safeDescription(communication.summary),
      status: String(communication.type || 'COMMUNICATION'),
      workflowCategory: 'OPEN' as const,
      priority: null,
      dueAt: null,
      completedAt: null,
      updatedAt: communication.updatedAt ? communication.updatedAt.toISOString() : communication.createdAt.toISOString(),
      caseId,
      isMine: false,
      assignee: null,
      createdBy: null,
      review: null,
      handoff: null,
      blocker: null,
      source: {
        type: 'COMMUNICATION' as const,
        id: communication.id,
        displayName: 'Kommunikáció',
        href: `/cases/${encodeURIComponent(caseId)}/communications`,
      },
      urgency: 'NONE' as const,
      capabilities,
      href: `/cases/${encodeURIComponent(caseId)}/communications`,
    };
  });

  const items = [...taskItems, ...documentItems, ...communicationItems, ...handoffItems].sort((a, b) => {
    const mineA = a.assignee?.id === currentUserId ? 0 : 1;
    const mineB = b.assignee?.id === currentUserId ? 0 : 1;
    return (
      mineA - mineB ||
      urgencyRank(a.urgency) - urgencyRank(b.urgency) ||
      categoryRank(a.workflowCategory, a.capabilities) - categoryRank(b.workflowCategory, b.capabilities) ||
      String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')) * -1 ||
      a.id.localeCompare(b.id)
    );
  });

  const openItems = items.filter((item) => item.workflowCategory !== 'COMPLETED');
  return {
    caseId,
    generatedAt: now.toISOString(),
    summary: {
      open: openItems.length,
      mine: openItems.filter((item) => item.assignee?.id === currentUserId).length,
      overdue: openItems.filter((item) => item.urgency === 'OVERDUE').length,
      dueSoon: openItems.filter((item) => item.urgency === 'TODAY' || item.urgency === 'SOON').length,
      blocked: openItems.filter((item) => item.workflowCategory === 'BLOCKED').length,
      waiting: 0,
      reviewRequired: openItems.filter((item) => item.workflowCategory === 'REVIEW').length,
      handoffRequired: openItems.filter((item) => item.workflowCategory === 'HANDOFF').length,
      completedRecently: items.filter((item) => item.workflowCategory === 'COMPLETED').length,
    },
    items,
    availability: {
      taskTransitions: true,
      blockerState: true,
      waitingState: false,
      reviewWorkflow: true,
      handoffWorkflow: isDatabaseFoundationEnabled('ENABLE_HANDOFF_PACKAGES') && Boolean((prisma as any).lawyerHandoffPackage),
    },
  };
}

export function ensureNoArbitraryTaskStatusPayload(body: unknown): void {
  if (body && typeof body === 'object' && 'status' in (body as Record<string, unknown>)) {
    throw new WorkflowTransitionError(400, 'STATUS_PAYLOAD_NOT_ALLOWED', 'Task status cannot be assigned directly.');
  }
}
