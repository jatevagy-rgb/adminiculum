/**
 * Workforce-only classification of the evidence state behind one client
 * control. Pure and dependency-free so it stays unit-testable without a
 * database and can never drift into a second evaluation engine.
 *
 * `MISSING_INFORMATION` (unresolved applicability facts) and
 * `LAWYER_REVIEW_REQUIRED` are intentionally absent: they are requirement-level
 * states with no control-level canonical field, so they stay on the
 * applicability/workspace surface instead of being invented here.
 */

export type ControlEvidenceGap = 'EVIDENCED' | 'MISSING_CONTROL' | 'STALE_EVIDENCE' | 'MISSING_EVIDENCE' | 'NOT_ASSESSED';

export function classifyControlEvidenceGap(input: { implementationStatus: string; acceptedCurrent: number; stale: number }): ControlEvidenceGap {
  if (input.implementationStatus === 'NOT_IMPLEMENTED') return 'MISSING_CONTROL';
  if (input.acceptedCurrent > 0) return 'EVIDENCED';
  if (input.stale > 0) return 'STALE_EVIDENCE';
  if (input.implementationStatus === 'NOT_ASSESSED') return 'NOT_ASSESSED';
  return 'MISSING_EVIDENCE';
}
