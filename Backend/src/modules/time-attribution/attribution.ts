export type TimeAttributionKind =
  | 'EXACT_CASE'
  | 'TASK_DERIVED_CASE'
  | 'MATTER_ONLY'
  | 'AMBIGUOUS';

export type TimeAttributionInput = {
  caseId: string;
  matterId: string;
  matterCaseIds: string[];
  task: {
    caseId: string;
    matterId: string | null;
    workPackageCaseId: string | null;
  } | null;
};

/**
 * Classifies a persisted time entry without guessing from titles, hierarchy, or
 * present-day template configuration. A task link is the authoritative case
 * provenance; an unlinked entry is exact only for a single-case matter.
 */
export function classifyTimeAttribution(input: TimeAttributionInput): TimeAttributionKind {
  if (input.task) {
    if (
      input.task.caseId === input.caseId
      && input.task.matterId === input.matterId
      && (input.task.workPackageCaseId === null || input.task.workPackageCaseId === input.caseId)
    ) {
      return 'TASK_DERIVED_CASE';
    }
    return 'AMBIGUOUS';
  }

  if (input.matterCaseIds.length === 1 && input.matterCaseIds[0] === input.caseId) {
    return 'EXACT_CASE';
  }

  return input.matterCaseIds.length === 0 ? 'MATTER_ONLY' : 'AMBIGUOUS';
}
