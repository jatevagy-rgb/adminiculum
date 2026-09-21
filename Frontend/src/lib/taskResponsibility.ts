/**
 * Post-create task responsibility (assignee / planned reviewer / collaborators).
 *
 * The backend stays the sole authority:
 * - POST /tasks/:id/reassign, PUT /tasks/:id/planned-reviewer, PUT/DELETE
 *   /tasks/:id/collaborators/:userId re-check authorization and eligibility.
 * - This module only derives what the UI may OFFER, from the canonical
 *   capability signal (case responsibility projection) and the canonical
 *   candidate projection (GET /cases/:caseId/responsible-candidates).
 *
 * It deliberately does not reproduce user-eligibility rules. It only removes
 * options the backend contract declares impossible (a no-op re-assignment, the
 * worker as reviewer, or an already-added collaborator), so a permitted user is
 * never shown a guaranteed error.
 */

export interface ResponsibilityCandidate {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
}

/**
 * Mirrors the internal-role gate of the task-role endpoints (`requireInternal`):
 * only these roles may read or mutate a task's collaborators / planned reviewer.
 */
export const TASK_ROLE_MANAGER_ROLES = ["ADMIN", "PARTNER", "LAWYER", "COLLAB_LAWYER"] as const;

export function canManageTaskRoles(role?: string | null): boolean {
  return (TASK_ROLE_MANAGER_ROLES as readonly string[]).includes(String(role || "").toUpperCase());
}

/**
 * Reassign is offered only when the canonical case responsibility projection
 * grants `canAssignWork`. The backend still re-checks canUserActOnTask and the
 * assignment role matrix on the request itself.
 */
export function canReassignTask(capabilities?: { canAssignWork?: boolean } | null): boolean {
  return capabilities?.canAssignWork === true;
}

export function isPrivilegedCandidate(candidate: { role?: string | null }): boolean {
  return ["ADMIN", "PARTNER"].includes(String(candidate.role || "").toUpperCase());
}

/** Handing a task to its current assignee is a no-op; do not offer it. */
export function reassignCandidates<T extends { id: string }>(
  candidates: ReadonlyArray<T>,
  currentAssigneeId?: string | null,
): T[] {
  return candidates.filter((candidate) => candidate.id !== currentAssigneeId);
}

/** The planned reviewer can never be the task worker (backend enforces this). */
export function plannedReviewerCandidates<T extends { id: string }>(
  candidates: ReadonlyArray<T>,
  assigneeId?: string | null,
): T[] {
  return candidates.filter((candidate) => candidate.id !== assigneeId);
}

/**
 * Collaborators are parallel workers: never the worker, never the planned
 * reviewer, never already added.
 */
export function collaboratorCandidates<T extends { id: string }>(
  candidates: ReadonlyArray<T>,
  options: {
    assigneeId?: string | null;
    plannedReviewerId?: string | null;
    existingUserIds?: ReadonlyArray<string>;
  },
): T[] {
  const existing = new Set(options.existingUserIds || []);
  return candidates.filter(
    (candidate) =>
      candidate.id !== options.assigneeId &&
      candidate.id !== options.plannedReviewerId &&
      !existing.has(candidate.id),
  );
}

/** Primary group = directly case-related workforce; privileged = explicit secondary group. */
export function splitCandidateGroups<T extends { role?: string | null }>(
  candidates: ReadonlyArray<T>,
): { primary: T[]; privileged: T[] } {
  return {
    primary: candidates.filter((candidate) => !isPrivilegedCandidate(candidate)),
    privileged: candidates.filter((candidate) => isPrivilegedCandidate(candidate)),
  };
}

/** Disambiguate duplicate display names with the email address. */
export function candidateLabel(
  candidate: ResponsibilityCandidate,
  all: ReadonlyArray<{ name: string }>,
): string {
  return all.filter((entry) => entry.name === candidate.name).length > 1 && candidate.email
    ? `${candidate.name} · ${candidate.email}`
    : candidate.name;
}
