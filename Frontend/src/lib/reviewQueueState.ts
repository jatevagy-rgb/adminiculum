/**
 * Review queue presentation state for the internal /reviews workspace.
 *
 * The queue has four distinct outcomes that must never be confused with each
 * other: loading, successful-but-empty, populated and unavailable. A failed
 * load never claims that there is nothing to review, and the raw error is
 * never part of the returned copy.
 */

export type ReviewQueueStatus = "loading" | "ready" | "failed";

export type ReviewQueueView =
  | { kind: "loading"; title: string }
  | { kind: "unavailable"; title: string; detail: string }
  | { kind: "empty"; title: string; detail: string }
  | { kind: "no-match"; title: string; detail: string }
  | { kind: "populated" };

export const REVIEW_QUEUE_COPY = {
  loading: "Review tételek betöltése…",
  unavailableTitle: "A review adatok most nem érhetők el.",
  unavailableDetail: "A lista betöltése nem sikerült, ezért most nem látható a review sor.",
  emptyTitle: "Nincs review-ra váró Leadás.",
  emptyDetail: "A review-ra küldött revisionök itt jelennek meg.",
  noMatchTitle: "Nincs találat a szűrőkkel.",
  noMatchDetail: "Módosítsa a keresést vagy a szűrőket.",
  retry: "Újratöltés",
  unknownCount: "—",
} as const;

export function deriveReviewQueueView(input: {
  status: ReviewQueueStatus;
  totalCount: number;
  filteredCount: number;
  /** Accepted so callers cannot accidentally route raw errors into the UI copy. */
  error?: unknown;
}): ReviewQueueView {
  if (input.status === "failed") {
    return { kind: "unavailable", title: REVIEW_QUEUE_COPY.unavailableTitle, detail: REVIEW_QUEUE_COPY.unavailableDetail };
  }
  if (input.status === "loading") {
    return { kind: "loading", title: REVIEW_QUEUE_COPY.loading };
  }
  if (input.totalCount === 0) {
    return { kind: "empty", title: REVIEW_QUEUE_COPY.emptyTitle, detail: REVIEW_QUEUE_COPY.emptyDetail };
  }
  if (input.filteredCount === 0) {
    return { kind: "no-match", title: REVIEW_QUEUE_COPY.noMatchTitle, detail: REVIEW_QUEUE_COPY.noMatchDetail };
  }
  return { kind: "populated" };
}

/** Counts are only truthful once the queue loaded successfully. */
export function reviewQueueCountLabel(status: ReviewQueueStatus, count: number): string {
  return status === "ready" ? String(count) : REVIEW_QUEUE_COPY.unknownCount;
}
