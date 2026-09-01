import {
  deriveTaskCapabilities,
  validateTaskTransition,
  type SupportedTaskAction,
  type WorkItemCapabilities,
  type WorkflowTransitionError,
} from '../cases/workItems';

export type CanonicalTaskAction = Extract<
  SupportedTaskAction,
  'START' | 'SUBMIT_FOR_REVIEW' | 'APPROVE' | 'RETURN_FOR_CORRECTION'
>;

export type CanonicalTaskRecord = {
  status?: string | null;
  assignedToId?: string | null;
  assignedById?: string | null;
  workflowInstanceId?: string | null;
};

export type CanonicalTaskTransition = {
  status: string;
  data: Record<string, unknown>;
  timelineType: string;
};

/**
 * Shared semantic transition contract for legacy Task routes and the
 * submission/review transactions. Persistence-specific work stays in those
 * transactions; status meaning and predecessor checks stay here.
 */
export function planCanonicalTaskTransition(
  task: CanonicalTaskRecord,
  action: CanonicalTaskAction,
  actorId: string,
  actorRole?: string | null,
): CanonicalTaskTransition {
  return validateTaskTransition(task, action, actorId, actorRole);
}

export function canonicalTaskCapabilities(
  task: CanonicalTaskRecord,
  actorId: string,
  actorRole?: string | null,
): WorkItemCapabilities {
  return deriveTaskCapabilities(task, actorId, actorRole);
}

export function isCanonicalReviewStatus(status?: string | null): boolean {
  return ['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW'].includes(String(status || '').toUpperCase());
}

export type { SupportedTaskAction, WorkflowTransitionError };
