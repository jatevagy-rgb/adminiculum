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

/**
 * Resolves the "Megnyitás Wordben" destination with truthful version identity.
 *
 * - A HISTORICAL version must NEVER fall back to the document-level/current
 *   SharePoint URL: that would open a different document than the version being
 *   reviewed. If it has no own URL, there is no handoff (returns null).
 * - A CURRENT version may use its own URL, or the canonical current-document
 *   URL when the version carries no own link.
 * - No version selected -> no handoff.
 */
export function resolveWordHandoffUrl(input: {
  hasVersion: boolean;
  versionSpWebUrl: string | null | undefined;
  versionIsCurrent: boolean;
  documentSpWebUrl: string | null | undefined;
}): string | null {
  if (!input.hasVersion) return null;
  const versionUrl = input.versionSpWebUrl || null;
  if (!input.versionIsCurrent) return versionUrl;
  return versionUrl || input.documentSpWebUrl || null;
}

export type MergedRailEntry =
  | { kind: "comment"; createdAt: string; comment: DocumentReviewRailComment }
  | { kind: "proposal"; createdAt: string; proposal: DocumentReviewRailProposal };

function entryAnchorStart(entry: MergedRailEntry): number {
  const value = entry.kind === "comment" ? entry.comment.startOffset : entry.proposal.startOffset;
  if (value === null || value === undefined || Number.isNaN(value)) return Number.MAX_SAFE_INTEGER;
  return value;
}

/**
 * Anchor-first client-side merge of the two independent rail collections.
 *
 * The default review presentation is spatial, not chronological: items are
 * ordered primarily by their version-scoped `startOffset` (document position).
 * `createdAt` only breaks ties for identical anchors, then kind, so the order is
 * deterministic without fabricating sequence numbers.
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
    const anchorA = entryAnchorStart(a);
    const anchorB = entryAnchorStart(b);
    if (anchorA !== anchorB) return anchorA - anchorB;
    const byTime = (a.createdAt || "").localeCompare(b.createdAt || "");
    if (byTime !== 0) return byTime;
    return a.kind === b.kind ? 0 : a.kind === "comment" ? -1 : 1;
  });
}
