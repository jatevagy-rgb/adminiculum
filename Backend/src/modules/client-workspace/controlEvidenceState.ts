/**
 * Machine-readable follow-up state of one applicable evidence control.
 *
 * Pure derivation from the persisted ClientControl row and its evidence links —
 * no database access, so it is unit-testable without PostgreSQL and can never
 * be derived from the human-readable label.
 *
 *   PENDING  -> the customer still owes an answer
 *   ANSWERED -> a persisted YES (current evidence linked) or a persisted NO
 *               (explicitly NOT_IMPLEMENTED)
 *   STALE    -> persisted evidence that is no longer current and needs review,
 *               never presented as a fresh unanswered question
 */
export type ControlEvidenceState = 'PENDING' | 'ANSWERED' | 'STALE';

export function deriveControlEvidenceState(input: {
  implementationStatus: string | null;
  currentLinked: boolean;
  hasStaleEvidence: boolean;
}): ControlEvidenceState {
  if (input.implementationStatus === 'IMPLEMENTED' && input.currentLinked) return 'ANSWERED';
  if (input.implementationStatus === 'NOT_IMPLEMENTED') return 'ANSWERED';
  if (input.hasStaleEvidence) return 'STALE';
  return 'PENDING';
}
