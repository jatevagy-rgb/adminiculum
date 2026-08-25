/**
 * TIME-0 — Deterministic recorded-time attribution.
 *
 * A TimeEntry belongs to a Matter (required) and optionally a Task. There is no
 * direct TimeEntry.caseId. We therefore derive Case attribution from the Matter
 * and, when available, the linked Task. This module NEVER infers a Case from
 * hierarchy, name, email, jobTitle or organization structure.
 *
 * Frozen classifications:
 *   - EXACT_CASE          Matter has exactly one Case and matches it.
 *   - TASK_DERIVED_CASE   the linked Task proves exactly one Case.
 *   - MATTER_ONLY         Matter is known but no Case can be proven.
 *   - AMBIGUOUS           multiple/conflicting possible Cases.
 *
 * Invariant: AMBIGUOUS and MATTER_ONLY time must NEVER be counted or displayed
 * as certain Case time.
 */

export type TimeAttributionClassification =
  | 'EXACT_CASE'
  | 'TASK_DERIVED_CASE'
  | 'MATTER_ONLY'
  | 'AMBIGUOUS';

export interface TimeAttributionResult {
  classification: TimeAttributionClassification;
  /** Set only when the classification is EXACT_CASE or TASK_DERIVED_CASE. */
  caseId?: string | null;
  matterId?: string | null;
  taskId?: string | null;
  /** Product-safe, non-identifying evidence reason (never raw internal ids). */
  evidence: string;
}

export interface TimeAttributionTask {
  taskId: string | null;
  caseId: string | null;
  matterId: string | null;
}

interface TimeAttributionInput {
  /** The Matter the TimeEntry is attached to (required). */
  matterId: string;
  /** All Case ids belonging to that Matter (from the Matter relation). */
  matterCaseIds: string[];
  /** The Case we are classifying against (null => matter-level only). */
  caseId?: string | null;
  /** The linked Task, if any. */
  task?: TimeAttributionTask | null;
}

export function classifyTimeAttribution(input: TimeAttributionInput): TimeAttributionResult {
  const { matterId, matterCaseIds, caseId, task } = input;

  if (matterCaseIds.length === 0) {
    return {
      classification: 'MATTER_ONLY',
      matterId,
      taskId: task?.taskId ?? null,
      evidence: 'The Matter has no Case; only matter-level time is known.',
    };
  }

  // A linked Task is the only safe narrowing signal when a Matter has multiple
  // Cases, or as confirmation when there is exactly one.
  if (task) {
    const taskCaseId = task.caseId;
    const taskMatterId = task.matterId;
    if (!taskCaseId || !taskMatterId) {
      return {
        classification: 'AMBIGUOUS',
        matterId,
        taskId: task.taskId ?? null,
        evidence: 'The linked Task does not fully resolve a Case.',
      };
    }
    if (taskMatterId !== matterId) {
      return {
        classification: 'AMBIGUOUS',
        matterId,
        taskId: task.taskId ?? null,
        evidence: 'The linked Task belongs to a different Matter.',
      };
    }
    if (caseId && taskCaseId !== caseId) {
      return {
        classification: 'AMBIGUOUS',
        matterId,
        caseId,
        taskId: task.taskId ?? null,
        evidence: 'The linked Task resolves a different Case than the requested one.',
      };
    }
    return {
      classification: 'TASK_DERIVED_CASE',
      caseId: taskCaseId,
      matterId,
      taskId: task.taskId ?? null,
      evidence: 'The linked Task proves exactly one Case.',
    };
  }

  // No Task.
  if (matterCaseIds.length === 1) {
    if (caseId && matterCaseIds[0] !== caseId) {
      return {
        classification: 'AMBIGUOUS',
        matterId,
        caseId,
        evidence: 'The single Case does not match the requested Case.',
      };
    }
    return {
      classification: 'EXACT_CASE',
      caseId: matterCaseIds[0],
      matterId,
      evidence: 'The Matter has exactly one Case.',
    };
  }

  // Matter has multiple Cases and no Task: cannot determine which Case.
  return {
    classification: 'AMBIGUOUS',
    matterId,
    evidence: 'The Matter has multiple Cases and no Task links a specific Case.',
  };
}

/** Human-facing product label (raw enum is NEVER shown to normal users). */
export function attributionLabel(classification: TimeAttributionClassification): string {
  switch (classification) {
    case 'EXACT_CASE':
      return 'Ügyhöz rendelt';
    case 'TASK_DERIVED_CASE':
      return 'Feladatból azonosított';
    case 'MATTER_ONLY':
      return 'Csak matter szinten';
    case 'AMBIGUOUS':
      return 'Nem egyértelmű';
    default:
      return 'Ismeretlen';
  }
}
