export type WorkflowDeadlineSourceType = 'TASK' | 'CASE_DEADLINE';
export type WorkflowDeadlineStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'SUPERSEDED';
export type WorkflowDeadlineUrgency = 'OVERDUE' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'LATER';
export type WorkflowDeadlineImportance = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'UNSPECIFIED';

export interface WorkflowDeadlineCapabilities {
  canOpen: boolean;
  canComplete: boolean;
  canReopen: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  canCreateTask: boolean;
}

export interface WorkflowDeadlineDto {
  id: string;
  sourceType: WorkflowDeadlineSourceType;
  sourceId: string;
  caseId: string;
  title: string;
  safeDescription?: string | null;
  startsAt?: string | null;
  dueAt: string;
  allDay: boolean;
  status: WorkflowDeadlineStatus;
  urgency: WorkflowDeadlineUrgency;
  importance: WorkflowDeadlineImportance;
  legalSignificance: null;
  responsibility: {
    assignee?: { id: string; displayName: string } | null;
    responsibleLawyer?: { id: string; displayName: string } | null;
  };
  source: {
    type: 'TASK' | 'CASE';
    id: string;
    displayName?: string | null;
    href?: string | null;
  };
  capabilities: WorkflowDeadlineCapabilities;
  href?: string | null;
  updatedAt?: string | null;
}

const CLOSED_TASK_STATUSES = new Set(['COMPLETED', 'DONE', 'APPROVED', 'REJECTED', 'DECLINED', 'CANCELLED', 'ARCHIVED']);
const REVIEW_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW']);

export function toSafeIsoDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function compactSafeText(value?: string | null, max = 180): string | null {
  if (!value) return null;
  const compact = String(value).replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

export function deriveDeadlineUrgency(dueAt: string, now: Date, agendaWindowDays = 7): WorkflowDeadlineUrgency {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'LATER';

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrowStart = new Date(tomorrowStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 1);
  const windowEnd = new Date(todayStart);
  windowEnd.setDate(windowEnd.getDate() + agendaWindowDays + 1);

  if (due.getTime() < now.getTime()) return 'OVERDUE';
  if (due.getTime() >= todayStart.getTime() && due.getTime() < tomorrowStart.getTime()) return 'TODAY';
  if (due.getTime() >= tomorrowStart.getTime() && due.getTime() < dayAfterTomorrowStart.getTime()) return 'TOMORROW';
  if (due.getTime() < windowEnd.getTime()) return 'THIS_WEEK';
  return 'LATER';
}

export function mapImportance(priority?: string | null): WorkflowDeadlineImportance {
  const normalized = String(priority || '').toUpperCase();
  if (normalized === 'URGENT') return 'CRITICAL';
  if (normalized === 'HIGH') return 'HIGH';
  if (normalized === 'LOW') return 'LOW';
  if (normalized === 'MEDIUM') return 'NORMAL';
  return 'UNSPECIFIED';
}

export function deriveTaskDeadlineStatus(status?: string | null): WorkflowDeadlineStatus {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'CANCELLED' || normalized === 'ARCHIVED') return 'CANCELLED';
  if (CLOSED_TASK_STATUSES.has(normalized)) return 'COMPLETED';
  return 'OPEN';
}

export function deriveCaseDeadlineStatus(status?: string | null, completedAt?: Date | string | null): WorkflowDeadlineStatus {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ARCHIVED' || normalized === 'CANCELLED') return 'CANCELLED';
  if (normalized === 'FINAL') return 'COMPLETED';
  if (completedAt || ['COMPLETED', 'DONE', 'APPROVED'].includes(normalized)) return 'COMPLETED';
  return 'OPEN';
}

export function deriveDeadlineCapabilities(params: {
  sourceType: WorkflowDeadlineSourceType;
  status: WorkflowDeadlineStatus;
  isAssignedToCurrentUser?: boolean;
  isCaseManager?: boolean;
  taskStatus?: string | null;
}): WorkflowDeadlineCapabilities {
  const open = params.status === 'OPEN';
  const actor = Boolean(params.isAssignedToCurrentUser || params.isCaseManager);
  const reviewState = REVIEW_STATUSES.has(String(params.taskStatus || '').toUpperCase());
  return {
    canOpen: true,
    canComplete: params.sourceType === 'TASK' && open && actor && reviewState,
    canReopen: false,
    canReschedule: params.sourceType === 'TASK' && open && actor,
    canCancel: false,
    canCreateTask: params.sourceType === 'CASE_DEADLINE' && open && actor,
  };
}

const URGENCY_RANK: Record<WorkflowDeadlineUrgency, number> = {
  OVERDUE: 0,
  TODAY: 1,
  TOMORROW: 2,
  THIS_WEEK: 3,
  LATER: 4,
};

const IMPORTANCE_RANK: Record<WorkflowDeadlineImportance, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
  UNSPECIFIED: 4,
};

const SOURCE_RANK: Record<WorkflowDeadlineSourceType, number> = {
  TASK: 0,
  CASE_DEADLINE: 1,
};

export function compareDeadlines(left: WorkflowDeadlineDto, right: WorkflowDeadlineDto, currentUserId?: string): number {
  return (
    URGENCY_RANK[left.urgency] - URGENCY_RANK[right.urgency] ||
    IMPORTANCE_RANK[left.importance] - IMPORTANCE_RANK[right.importance] ||
    new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime() ||
    (right.responsibility.assignee?.id === currentUserId ? 1 : 0) - (left.responsibility.assignee?.id === currentUserId ? 1 : 0) ||
    SOURCE_RANK[left.sourceType] - SOURCE_RANK[right.sourceType] ||
    left.id.localeCompare(right.id)
  );
}
