import type {
  DocumentReviewRailComment,
  DocumentReviewRailProposal,
} from "@/lib/api";

/**
 * Lawyer-level roles that may decide a modification proposal. The backend
 * remains the final authority for the document/case relationship; this only
 * decides whether the browser offers the decision affordance at all.
 *
 * TRAINEE / LEGAL_ASSISTANT / CLIENT / EXTERNAL_REVIEWER must never see it.
 */
export const PROPOSAL_DECISION_ROLES = new Set([
  "ADMIN",
  "PARTNER",
  "LAWYER",
  "COLLAB_LAWYER",
]);

export function canDecideProposal(role: string | null | undefined): boolean {
  return PROPOSAL_DECISION_ROLES.has(String(role || "").toUpperCase());
}

export type MergedRailEntry =
  | { kind: "comment"; createdAt: string; comment: DocumentReviewRailComment }
  | { kind: "proposal"; createdAt: string; proposal: DocumentReviewRailProposal };

/**
 * Chronological client-side merge of the two independent rail collections.
 * No sequence numbers are fabricated: ordering is solely by the real `createdAt`.
 */
export function mergeRailEntries(
  comments: DocumentReviewRailComment[],
  proposals: DocumentReviewRailProposal[],
): MergedRailEntry[] {
  const entries: MergedRailEntry[] = [
    ...comments.map((comment) => ({ kind: "comment" as const, createdAt: comment.createdAt, comment })),
    ...proposals.map((proposal) => ({ kind: "proposal" as const, createdAt: proposal.createdAt, proposal })),
  ];
  return entries.sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    if (byTime !== 0) return byTime;
    return a.kind === b.kind ? 0 : a.kind === "comment" ? -1 : 1;
  });
}
