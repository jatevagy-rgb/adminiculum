/**
 * Shared attention-category FRONTEND presentation mapping.
 *
 * Prepared for Slice 1 but NOT yet wired into any production page. Reuses the
 * existing Review visual language (labels, marks, tones). It deliberately holds
 * NO duration-band table — the bands are backend-authoritative and the API
 * provides computed workload ranges; this module only FORMATS minute ranges for
 * display (formatting is kept separate from domain calculation).
 */
import { ATTENTION_LABELS } from "./taskWorkflowPresentation";

export type AttentionCategory =
  | "QUICK_SCAN"
  | "APPROVAL"
  | "SIGNATURE"
  | "EDITING"
  | "DETAILED_REVIEW";

/** Canonical order — mirrors the Review page and the backend domain module. */
export const ATTENTION_CATEGORY_ORDER: readonly AttentionCategory[] = [
  "QUICK_SCAN",
  "APPROVAL",
  "SIGNATURE",
  "EDITING",
  "DETAILED_REVIEW",
];

export type AttentionTone = "gold" | "sage" | "violet" | "blue" | "burgundy";

export interface AttentionPresentation {
  value: AttentionCategory;
  label: string;
  mark: string;
  tone: AttentionTone;
  /** Accessible label for screen readers / aria-label. */
  accessibleLabel: string;
}

// Marks + tones mirror reviews/page.tsx (the established Review visual language).
// A later slice re-points that page at this module so there is one source.
const MARKS: Record<AttentionCategory, { mark: string; tone: AttentionTone }> = {
  QUICK_SCAN: { mark: "↗", tone: "gold" },
  APPROVAL: { mark: "✓", tone: "sage" },
  SIGNATURE: { mark: "✎", tone: "violet" },
  EDITING: { mark: "▤", tone: "blue" },
  DETAILED_REVIEW: { mark: "◎", tone: "burgundy" },
};

export function attentionPresentation(value: AttentionCategory): AttentionPresentation {
  const label = ATTENTION_LABELS[value];
  const { mark, tone } = MARKS[value];
  return { value, label, mark, tone, accessibleLabel: `Figyelmi kategória: ${label}` };
}

export const ATTENTION_PRESENTATIONS: readonly AttentionPresentation[] =
  ATTENTION_CATEGORY_ORDER.map(attentionPresentation);

/** UI label for the unclassified bucket (attentionCategory === null). */
export const UNCLASSIFIED_LABEL = "Nincs besorolva";

// ---------------------------------------------------------------------------
// Duration-range formatting (presentation only — NOT a band table)
// ---------------------------------------------------------------------------

function hoursNumber(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10; // one decimal, half-up
  return Number.isInteger(hours) ? String(hours) : String(hours).replace(".", ",");
}

/**
 * Format an aggregate minute range for display. Inputs are whole minutes from the
 * API. Never invents precision; collapses an equal range to a single value.
 * Returns "" for an empty/zero range (caller renders count-only instead).
 */
export function formatEstimateRange(minMinutes: number, maxMinutes: number): string {
  if (!Number.isFinite(minMinutes) || !Number.isFinite(maxMinutes)) return "";
  if (minMinutes <= 0 && maxMinutes <= 0) return "";
  if (minMinutes === maxMinutes) {
    return minMinutes < 60 ? `kb. ${minMinutes} perc` : `kb. ${hoursNumber(minMinutes)} óra`;
  }
  if (maxMinutes < 60) return `kb. ${minMinutes}–${maxMinutes} perc`;
  if (minMinutes >= 60) return `kb. ${hoursNumber(minMinutes)}–${hoursNumber(maxMinutes)} óra`;
  return `kb. ${minMinutes} perc–${hoursNumber(maxMinutes)} óra`;
}
