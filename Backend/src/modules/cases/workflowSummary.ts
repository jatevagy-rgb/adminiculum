import { prisma } from '../../prisma/prisma.service';
import { deriveDeadlineUrgency as deriveCanonicalDeadlineUrgency } from '../agenda/deadlineEngine';

export type WorkflowNextActionKind =
  | 'OVERDUE_TASK'
  | 'HANDOFF_REVIEW'
  | 'DOCUMENT_REVIEW'
  | 'DUE_SOON_TASK'
  | 'UPCOMING_DEADLINE'
  | 'BLOCKED_ITEM'
  | 'OPEN_TASK';

export type WorkflowNextActionSourceType = 'TASK' | 'DEADLINE' | 'DOCUMENT_REVIEW' | 'HANDOFF';
export type WorkflowNextActionScope = 'MY_WORK' | 'CASE';
export type DeadlineUrgency = 'OVERDUE' | 'TODAY' | 'SOON' | 'LATER';

export interface WorkflowActionCandidate {
  kind: WorkflowNextActionKind;
  title: string;
  explanation: string;
  dueAt?: string | null;
  sourceType: WorkflowNextActionSourceType;
  sourceId?: string | null;
  href?: string | null;
  scope: WorkflowNextActionScope;
  assignedToCurrentUser?: boolean;
  createdAt?: string | null;
  priority?: string | null;
}

export type WorkflowNextActionDto = Omit<
  WorkflowActionCandidate,
  'assignedToCurrentUser' | 'createdAt' | 'priority'
>;

export interface CaseWorkflowSummaryDto {
  caseId: string;
  generatedAt: string;
  case: {
    displayName: string;
    reference?: string | null;
    status?: string | null;
    clientRole?: string | null;
    updatedAt?: string | null;
  };
  nextAction: WorkflowNextActionDto | null;
  waitingOn: null;
  nextDeadline: {
    id: string;
    title: string;
    dueAt: string;
    urgency: DeadlineUrgency;
    href?: string | null;
  } | null;
  taskStats: {
    open: number;
    overdue: number;
    dueSoon: number;
    blocked: number;
    review: number;
  };
  latestCommunication: {
    id: string;
    subject?: string | null;
    contentPreview?: string | null;
    occurredAt?: string | null;
    direction?: string | null;
    attachmentCount?: number;
    sourceTaskCount?: number;
    href?: string | null;
  } | null;
  activeReview: {
    id: string;
    documentId?: string | null;
    displayName: string;
    status?: string | null;
    responsibleName?: string | null;
    updatedAt?: string | null;
    href?: string | null;
  } | null;
  responsibility: {
    responsibleLawyer?: {
      id: string;
      displayName: string;
    } | null;
    collaborators: Array<{
      id: string;
      displayName: string;
      role?: string | null;
    }>;
  };
  handoff: null;
  availability: {
    tasks: boolean;
    deadlines: boolean;
    communications: boolean;
    reviews: boolean;
    collaborators: boolean;
    handoff: boolean;
  };
}

type SafeTaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  documentId: string | null;
  stuckReason?: string | null;
  stuckSince?: Date | null;
};

type SafeDocumentRow = {
  id: string;
  name: string | null;
  fileName: string | null;
  documentType: string | null;
  folder: string | null;
  updatedAt: Date;
};

const CLOSED_TASK_STATUSES = new Set([
  'COMPLETED',
  'DONE',
  'APPROVED',
  'REJECTED',
  'DECLINED',
  'CANCELLED',
  'ARCHIVED',
]);

const REVIEW_TASK_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW']);
const BLOCKED_TASK_STATUSES = new Set(['BLOCKED']);
const PRIORITY_SCORE: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function toIso(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isOpenTask(status?: string | null): boolean {
  return !CLOSED_TASK_STATUSES.has(String(status || '').toUpperCase());
}

function isOverdue(dueAt: string | null | undefined, now: Date): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

function isDueWithin(dueAt: string | null | undefined, now: Date, hours: number): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  const diff = due.getTime() - now.getTime();
  return diff >= 0 && diff <= hours * 60 * 60 * 1000;
}

function priorityScore(priority?: string | null): number {
  return PRIORITY_SCORE[String(priority || '').toUpperCase()] || 0;
}

function sourceRank(sourceType: WorkflowNextActionSourceType): number {
  return { TASK: 0, HANDOFF: 1, DOCUMENT_REVIEW: 2, DEADLINE: 3 }[sourceType];
}

function actionRank(candidate: WorkflowActionCandidate, now: Date): number {
  const personal = candidate.assignedToCurrentUser || candidate.scope === 'MY_WORK';
  if (candidate.kind === 'OVERDUE_TASK' && personal) return 1;
  if (candidate.kind === 'OVERDUE_TASK') return 2;
  if (candidate.kind === 'HANDOFF_REVIEW' && personal) return 3;
  if (candidate.kind === 'DOCUMENT_REVIEW' && personal) return 4;
  if (candidate.kind === 'DUE_SOON_TASK' && personal) return 5;
  if (candidate.kind === 'UPCOMING_DEADLINE' && isDueWithin(candidate.dueAt, now, 24 * 7)) return 6;
  if (candidate.kind === 'BLOCKED_ITEM') return 7;
  if (candidate.kind === 'OPEN_TASK' && personal) return 8;
  if (candidate.kind === 'OPEN_TASK') return 9;
  return 99;
}

export function selectNextWorkflowAction(
  candidates: WorkflowActionCandidate[],
  now = new Date()
): WorkflowNextActionDto | null {
  if (candidates.length === 0) return null;

  const [selected] = [...candidates].sort((left, right) => {
    const rankDiff = actionRank(left, now) - actionRank(right, now);
    if (rankDiff !== 0) return rankDiff;

    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;

    const priorityDiff = priorityScore(right.priority) - priorityScore(left.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const createdLeft = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const createdRight = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (createdLeft !== createdRight) return createdLeft - createdRight;

    const sourceDiff = sourceRank(left.sourceType) - sourceRank(right.sourceType);
    if (sourceDiff !== 0) return sourceDiff;

    return String(left.sourceId || left.title).localeCompare(String(right.sourceId || right.title));
  });

  if (!selected) return null;
  const { assignedToCurrentUser, createdAt, priority, ...dto } = selected;
  return dto;
}

function deadlineUrgency(dueAt: string, now: Date): DeadlineUrgency {
  const urgency = deriveCanonicalDeadlineUrgency(dueAt, now);
  if (urgency === 'TOMORROW' || urgency === 'THIS_WEEK') return 'SOON';
  if (urgency === 'OVERDUE' || urgency === 'TODAY') return urgency;
  return 'LATER';
}

function taskToCandidate(task: SafeTaskRow, currentUserId: string, now: Date): WorkflowActionCandidate | null {
  if (!isOpenTask(task.status)) return null;

  const status = String(task.status || '').toUpperCase();
  const dueAt = toIso(task.dueDate);
  const assignedToCurrentUser = task.assignedToId === currentUserId;
  const scope: WorkflowNextActionScope = assignedToCurrentUser ? 'MY_WORK' : 'CASE';
  const base = {
    title: task.title,
    dueAt,
    sourceType: 'TASK' as const,
    sourceId: task.id,
    href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
    scope,
    assignedToCurrentUser,
    createdAt: toIso(task.createdAt),
    priority: task.priority,
  };

  if (isOverdue(dueAt, now)) {
    return {
      ...base,
      kind: 'OVERDUE_TASK',
      explanation: 'A feladat határideje lejárt.',
    };
  }

  if (BLOCKED_TASK_STATUSES.has(status)) {
    return {
      ...base,
      kind: 'BLOCKED_ITEM',
      explanation: 'A feladat blokkolt állapotban van, belső döntést igényel.',
    };
  }

  if (isDueWithin(dueAt, now, 48)) {
    return {
      ...base,
      kind: 'DUE_SOON_TASK',
      explanation: 'A feladat határideje 48 órán belül esedékes.',
    };
  }

  return {
    ...base,
    kind: 'OPEN_TASK',
    explanation: 'Nyitott feladat vár feldolgozásra.',
  };
}

function reviewCandidateFromDocument(document: SafeDocumentRow): WorkflowActionCandidate {
  return {
    kind: 'DOCUMENT_REVIEW',
    title: document.fileName || document.name || 'Dokumentum felülvizsgálat',
    explanation: 'A dokumentum felülvizsgálatra vár.',
    dueAt: null,
    sourceType: 'DOCUMENT_REVIEW',
    sourceId: document.id,
    href: `/cases/${encodeURIComponent('CASE_ID_PLACEHOLDER')}/review/${encodeURIComponent(document.id)}`,
    scope: 'CASE',
    createdAt: toIso(document.updatedAt),
  };
}

export async function getCaseWorkflowSummary(
  caseId: string,
  currentUserId: string,
  now = new Date()
): Promise<CaseWorkflowSummaryDto | null> {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      clientName: true,
      matterType: true,
      status: true,
      clientRole: true,
      deadline: true,
      updatedAt: true,
      assignedLawyer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!caseRecord) return null;

  const [tasks, documents, communications, collaborators] = await Promise.all([
    prisma.task.findMany({
      where: { caseId },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        assignedToId: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        documentId: true,
        stuckReason: true,
        stuckSince: true,
      },
    }),
    prisma.document.findMany({
      where: { caseId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        fileName: true,
        documentType: true,
        folder: true,
        updatedAt: true,
      },
    }),
    prisma.communication.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: {
        id: true,
        subject: true,
        summary: true,
        direction: true,
        createdAt: true,
      },
    }),
    prisma.caseCollaborator.findMany({
      where: { caseId },
      orderBy: { addedAt: 'asc' },
      take: 12,
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const openTasks = tasks.filter((task) => isOpenTask(task.status));
  const taskCandidates = openTasks
    .map((task) => taskToCandidate(task, currentUserId, now))
    .filter((candidate): candidate is WorkflowActionCandidate => Boolean(candidate));

  const reviewDocument = documents.find((document) => {
    const status = String(document.folder || '').toUpperCase();
    return status.includes('REVIEW') || status.includes('IN_REVIEW');
  }) || null;

  const candidates = [...taskCandidates];
  if (reviewDocument) {
    const reviewCandidate = reviewCandidateFromDocument(reviewDocument);
    candidates.push({
      ...reviewCandidate,
      href: `/cases/${encodeURIComponent(caseId)}/review/${encodeURIComponent(reviewDocument.id)}`,
    });
  }

  const caseDeadlineIso = toIso(caseRecord.deadline);
  if (caseDeadlineIso) {
    candidates.push({
      kind: 'UPCOMING_DEADLINE',
      title: 'Ügyhatáridő',
      explanation: 'A következő határidő hét napon belül esedékes.',
      dueAt: caseDeadlineIso,
      sourceType: 'DEADLINE',
      sourceId: caseRecord.id,
      href: `/cases/${encodeURIComponent(caseId)}`,
      scope: 'CASE',
      createdAt: toIso(caseRecord.updatedAt),
    });
  }

  const latestCommunication = communications[0] || null;
  const latestCommunicationAttachmentCount = latestCommunication
    ? await prisma.communicationAttachment.count({ where: { communicationId: latestCommunication.id } })
    : 0;
  const latestCommunicationSourceTaskCount = latestCommunication
    ? await prisma.task.count({ where: { sourceCommunicationId: latestCommunication.id } as any })
    : 0;

  const nowIso = now.toISOString();
  const dueSoonTasks = openTasks.filter((task) => isDueWithin(toIso(task.dueDate), now, 48));
  const overdueTasks = openTasks.filter((task) => isOverdue(toIso(task.dueDate), now));
  const blockedTasks = openTasks.filter((task) => BLOCKED_TASK_STATUSES.has(String(task.status || '').toUpperCase()));
  const reviewTasks = openTasks.filter((task) => REVIEW_TASK_STATUSES.has(String(task.status || '').toUpperCase()));

  return {
    caseId: caseRecord.id,
    generatedAt: nowIso,
    case: {
      displayName:
        caseRecord.title ||
        `${caseRecord.clientName || 'Ismeretlen ügyfél'} - ${caseRecord.matterType || 'Ügy'}`,
      reference: caseRecord.caseNumber,
      status: caseRecord.status,
      clientRole: caseRecord.clientRole,
      updatedAt: toIso(caseRecord.updatedAt),
    },
    nextAction: selectNextWorkflowAction(candidates, now),
    waitingOn: null,
    nextDeadline: caseDeadlineIso
      ? {
          id: caseRecord.id,
          title: 'Ügyhatáridő',
          dueAt: caseDeadlineIso,
          urgency: deadlineUrgency(caseDeadlineIso, now),
          href: `/cases/${encodeURIComponent(caseId)}`,
        }
      : null,
    taskStats: {
      open: openTasks.length,
      overdue: overdueTasks.length,
      dueSoon: dueSoonTasks.length,
      blocked: blockedTasks.length,
      review: reviewTasks.length,
    },
    latestCommunication: latestCommunication
      ? {
          id: latestCommunication.id,
          subject: latestCommunication.subject,
          contentPreview: latestCommunication.summary,
          occurredAt: toIso(latestCommunication.createdAt),
          direction: latestCommunication.direction,
          attachmentCount: latestCommunicationAttachmentCount,
          sourceTaskCount: latestCommunicationSourceTaskCount,
          href: `/cases/${encodeURIComponent(caseId)}/communications`,
        }
      : null,
    activeReview: reviewDocument
      ? {
          id: reviewDocument.id,
          documentId: reviewDocument.id,
          displayName: reviewDocument.fileName || reviewDocument.name || 'Dokumentum',
          status: reviewDocument.folder,
          responsibleName: null,
          updatedAt: toIso(reviewDocument.updatedAt),
          href: `/cases/${encodeURIComponent(caseId)}/review/${encodeURIComponent(reviewDocument.id)}`,
        }
      : null,
    responsibility: {
      responsibleLawyer: caseRecord.assignedLawyer
        ? {
            id: caseRecord.assignedLawyer.id,
            displayName: caseRecord.assignedLawyer.name,
          }
        : null,
      collaborators: collaborators.map((collaborator) => ({
        id: collaborator.user.id,
        displayName: collaborator.user.name,
        role: collaborator.role,
      })),
    },
    handoff: null,
    availability: {
      tasks: true,
      deadlines: Boolean(caseDeadlineIso),
      communications: true,
      reviews: true,
      collaborators: true,
      handoff: false,
    },
  };
}
