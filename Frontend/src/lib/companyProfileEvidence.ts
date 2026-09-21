/**
 * Company-profile follow-up evidence presentation helpers.
 *
 * The follow-up header must count what the customer still OWES, not how many
 * controls happen to apply. The machine-readable `evidenceState` comes from the
 * canonical backend journey (derived from the persisted ClientControl row and
 * its evidence links), so the frontend never infers pending state from
 * `stateHu` or from `implemented` alone.
 */
import type { PortalCompanyProfileEvidenceState } from "./clientPortalApi";

export type EvidenceStateCarrier = { evidenceState: PortalCompanyProfileEvidenceState };

/**
 * Counts applicable controls that are still awaiting a customer answer.
 * PENDING is the only state that means "megválaszolandó":
 *  - ANSWERED covers a persisted YES (current evidence linked) and a persisted
 *    NO (explicitly NOT_IMPLEMENTED);
 *  - STALE is persisted evidence that needs review, not a fresh answer, and is
 *    therefore never counted as pending.
 */
export function countPendingEvidence(items: readonly EvidenceStateCarrier[]): number {
  return items.filter((item) => item.evidenceState === "PENDING").length;
}

/**
 * Header label for the follow-up evidence disclosure. The applicable total is
 * intentionally not used as the pending count. When nothing applies, the
 * honest empty-state label is kept instead of claiming everything was answered.
 */
export function evidencePendingLabel(applicableCount: number, pendingCount: number): string {
  if (applicableCount <= 0) return "Részletek";
  return pendingCount > 0 ? `${pendingCount} megválaszolandó` : "Mind megválaszolva";
}
