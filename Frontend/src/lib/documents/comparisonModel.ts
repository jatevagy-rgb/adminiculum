/**
 * Canonical frontend comparison model (STRUCTURED-DOC-COMPARISON-1, Phase 8).
 *
 * One source for every human label, badge tone and formatting helper the
 * comparison UI uses, so raw enums (MOVE_CANDIDATE, FORMAT_ONLY, GOVERNING_LAW,
 * NEEDS_DISCUSSION, UNCLASSIFIED, …) never reach the screen. React-free and
 * unit-testable.
 */
import type {
  ComparisonStatus, ChangeType, ReviewState, SegmentCategory, CategorySource, ComparisonCounts,
} from "./comparisonApi";

export const COMPARISON_STATUS_LABELS: Record<ComparisonStatus, string> = {
  PENDING: "Előkészítve",
  PROCESSING: "Feldolgozás alatt",
  READY: "Kész",
  IDENTICAL: "Nincs tartalmi eltérés",
  UNSUPPORTED: "Nem összehasonlítható",
  FAILED: "Sikertelen",
  SUPERSEDED: "Felülírva",
};

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  INSERT: "Beszúrás",
  DELETE: "Törlés",
  REPLACE: "Módosítás",
  FORMAT_ONLY: "Csak formázás",
  // Deliberately marked uncertain — never asserted as a confirmed move.
  MOVE_CANDIDATE: "Lehetséges áthelyezés",
};

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  UNREVIEWED: "Nincs átnézve",
  ACCEPTED: "Elfogadva",
  REJECTED: "Elutasítva",
  NEEDS_DISCUSSION: "Megbeszélendő",
  NOT_RELEVANT: "Nem releváns",
};

export const CATEGORY_LABELS: Record<SegmentCategory, string> = {
  PARTY: "Fél",
  DATE: "Dátum",
  AMOUNT: "Összeg",
  OBLIGATION: "Kötelezettség",
  LIABILITY: "Felelősség",
  TERMINATION: "Megszűnés",
  GOVERNING_LAW: "Irányadó jog",
  DEFINITION: "Fogalommeghatározás",
  OTHER: "Egyéb",
  UNCLASSIFIED: "Besorolatlan",
};

export const CATEGORY_SOURCE_LABELS: Record<CategorySource, string> = {
  MANUAL: "Kézi besorolás",
  RULE: "Szabály szerint",
  NONE: "Nincs besorolás",
};

/** Legally-relevant categories highlighted in filters. */
export const LEGALLY_RELEVANT_CATEGORIES: SegmentCategory[] = [
  "PARTY", "DATE", "AMOUNT", "OBLIGATION", "LIABILITY", "TERMINATION", "GOVERNING_LAW", "DEFINITION",
];

export type BadgeTone = "petrol" | "terracotta" | "green" | "ochre" | "navy" | "neutral";

export function changeTypeTone(t: ChangeType): BadgeTone {
  switch (t) {
    case "INSERT": return "green";
    case "DELETE": return "terracotta";
    case "REPLACE": return "ochre";
    case "MOVE_CANDIDATE": return "navy";
    case "FORMAT_ONLY": return "neutral";
    default: return "neutral";
  }
}

export function reviewStateTone(s: ReviewState): BadgeTone {
  switch (s) {
    case "ACCEPTED": return "green";
    case "REJECTED": return "terracotta";
    case "NEEDS_DISCUSSION": return "ochre";
    case "NOT_RELEVANT": return "neutral";
    default: return "petrol";
  }
}

export const comparisonStatusLabel = (s: ComparisonStatus): string => COMPARISON_STATUS_LABELS[s] || s;
export const changeTypeLabel = (t: ChangeType): string => CHANGE_TYPE_LABELS[t] || t;
export const reviewStateLabel = (s: ReviewState): string => REVIEW_STATE_LABELS[s] || s;
export const categoryLabel = (c: SegmentCategory): string => CATEGORY_LABELS[c] || c;
export const categorySourceLabel = (c: CategorySource): string => CATEGORY_SOURCE_LABELS[c] || c;

export const isTerminalStatus = (s: ComparisonStatus): boolean =>
  s === "READY" || s === "IDENTICAL" || s === "UNSUPPORTED" || s === "FAILED" || s === "SUPERSEDED";
export const isPollingStatus = (s: ComparisonStatus): boolean => s === "PENDING" || s === "PROCESSING";

export function reviewProgress(counts: ComparisonCounts): { reviewed: number; total: number; pct: number } {
  const total = counts.total ?? 0;
  const reviewed = counts.reviewed ?? 0;
  return { reviewed, total, pct: total > 0 ? Math.round((reviewed / total) * 100) : 0 };
}

export function formatComparisonDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
}

/** Version identity for the header: selected (target) vs current, without conflation. */
export function versionIdentity(opts: { baseVersionNumber: number | null; targetVersionNumber: number | null; currentVersionNumber: number | null }): {
  baseLabel: string; targetLabel: string; targetIsHistorical: boolean;
} {
  const { baseVersionNumber, targetVersionNumber, currentVersionNumber } = opts;
  return {
    baseLabel: baseVersionNumber != null ? `v${baseVersionNumber}` : "—",
    targetLabel: targetVersionNumber != null ? `v${targetVersionNumber}` : "—",
    targetIsHistorical: targetVersionNumber != null && currentVersionNumber != null && targetVersionNumber < currentVersionNumber,
  };
}
