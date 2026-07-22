/**
 * Shared attention-category domain contract.
 *
 * Single source of truth for the attention taxonomy that is already persisted as
 * the Prisma enum `ReviewAttentionLevel` (values QUICK_SCAN, APPROVAL, SIGNATURE,
 * EDITING, DETAILED_REVIEW). This module holds the canonical ordering, indicative
 * planning duration bands, parsing/validation, and workload aggregation.
 *
 * Design notes:
 * - The enum is NOT renamed and NOT duplicated as a second persisted enum.
 * - This module intentionally does not import the generated Prisma client so it
 *   stays testable without a generated client; a drift test asserts the local
 *   ordered tuple equals `Object.values(ReviewAttentionLevel)`.
 * - Duration bands are indicative PLANNING estimates only — not billing, not
 *   actual worked time (TimeEntry), not an SLA or commitment.
 */

import { isClosedTaskStatus } from './taskStatus';

export type AttentionCategory =
  | 'QUICK_SCAN'
  | 'APPROVAL'
  | 'SIGNATURE'
  | 'EDITING'
  | 'DETAILED_REVIEW';

/** Canonical display/aggregation order (matches the deployed enum + Review UI). */
export const ATTENTION_CATEGORY_ORDER = [
  'QUICK_SCAN',
  'APPROVAL',
  'SIGNATURE',
  'EDITING',
  'DETAILED_REVIEW',
] as const satisfies readonly AttentionCategory[];

export interface DurationBand {
  readonly minMinutes: number;
  readonly maxMinutes: number;
}

/** Indicative planning bands (Phase 3 defaults). Not billing/actual/SLA. */
export const ATTENTION_DURATION_BANDS: Readonly<Record<AttentionCategory, DurationBand>> = {
  QUICK_SCAN: { minMinutes: 5, maxMinutes: 15 },
  APPROVAL: { minMinutes: 10, maxMinutes: 20 },
  SIGNATURE: { minMinutes: 5, maxMinutes: 10 },
  EDITING: { minMinutes: 30, maxMinutes: 60 },
  DETAILED_REVIEW: { minMinutes: 60, maxMinutes: 120 },
};

/** Planning cap: one working day. Explicit estimates above this are rejected. */
export const ESTIMATED_MINUTES_MIN = 1;
export const ESTIMATED_MINUTES_MAX = 8 * 60; // 480

const ATTENTION_CATEGORY_SET: ReadonlySet<string> = new Set(ATTENTION_CATEGORY_ORDER);

export function isAttentionCategory(value: unknown): value is AttentionCategory {
  return typeof value === 'string' && ATTENTION_CATEGORY_SET.has(value);
}

export type EstimateRejectReason = 'NOT_A_NUMBER' | 'NOT_INTEGER' | 'NOT_POSITIVE' | 'TOO_LARGE';

export type EstimateParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: EstimateRejectReason };

/**
 * Validate a PROVIDED explicit estimate. `null`/absent is handled by the caller
 * (the field is optional); this validates a value the caller chose to send.
 * Rejects NaN, decimals, zero, negatives, and values above the planning cap.
 * Never silently clamps.
 */
export function parseEstimatedMinutes(value: unknown): EstimateParseResult {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return { ok: false, reason: 'NOT_A_NUMBER' };
  }
  if (!Number.isInteger(value)) {
    return { ok: false, reason: 'NOT_INTEGER' };
  }
  if (value < ESTIMATED_MINUTES_MIN) {
    return { ok: false, reason: 'NOT_POSITIVE' };
  }
  if (value > ESTIMATED_MINUTES_MAX) {
    return { ok: false, reason: 'TOO_LARGE' };
  }
  return { ok: true, value };
}

/**
 * The no-double-counting + user-scope predicate used BEFORE aggregation.
 * A task counts in a user's workload iff it is assigned to that user and is not
 * closed. Aggregation is per-Task (one item per task), so multiple submissions
 * or reviewers never multiply the count. Reuses the authoritative
 * `isClosedTaskStatus`. Pure and DB-free for testability.
 */
export function isCountableWorkloadTask(
  task: { status?: string | null; assignedToId?: string | null },
  userId: string,
): boolean {
  if (!userId || !task.assignedToId || task.assignedToId !== userId) return false;
  return !isClosedTaskStatus(task.status);
}

export interface AttentionWorkItem {
  /** null => unclassified (legacy or not yet classified). */
  attentionCategory: AttentionCategory | null;
  /** null => fall back to the category band. */
  estimatedMinutes: number | null;
}

export interface MinuteRange {
  readonly minMinutes: number;
  readonly maxMinutes: number;
}

/**
 * Effective planning range for a single item.
 * Precedence: explicit valid estimate (min=max) > category band > unclassified (null).
 * A null-category item contributes no duration (returns null) even if an estimate
 * is present — such items are reported as unclassified count-only.
 */
export function itemEstimateRange(item: AttentionWorkItem): MinuteRange | null {
  if (item.attentionCategory == null || !isAttentionCategory(item.attentionCategory)) {
    return null;
  }
  if (item.estimatedMinutes != null) {
    const parsed = parseEstimatedMinutes(item.estimatedMinutes);
    if (parsed.ok) {
      return { minMinutes: parsed.value, maxMinutes: parsed.value };
    }
    // Invalid stored estimate should not exist (validated on write); fall back to
    // the band defensively rather than emitting a misleading value.
  }
  const band = ATTENTION_DURATION_BANDS[item.attentionCategory];
  return { minMinutes: band.minMinutes, maxMinutes: band.maxMinutes };
}

export interface CategoryWorkload {
  attentionCategory: AttentionCategory;
  count: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface AttentionWorkloadSummary {
  categories: CategoryWorkload[];
  unclassified: { count: number };
}

/**
 * Aggregate a set of work items into per-category totals plus an unclassified
 * count. Items are bucketed once by their category (the caller is responsible for
 * passing each Task exactly once — see the no-double-counting contract). Category
 * order is canonical; categories with zero items are still returned (count 0) so
 * the Dashboard can render a stable set of cards.
 */
export function aggregateAttentionWorkload(items: readonly AttentionWorkItem[]): AttentionWorkloadSummary {
  const totals = new Map<AttentionCategory, CategoryWorkload>();
  for (const category of ATTENTION_CATEGORY_ORDER) {
    totals.set(category, { attentionCategory: category, count: 0, minMinutes: 0, maxMinutes: 0 });
  }
  let unclassified = 0;

  for (const item of items) {
    if (item.attentionCategory == null || !isAttentionCategory(item.attentionCategory)) {
      unclassified += 1;
      continue;
    }
    const bucket = totals.get(item.attentionCategory)!;
    const range = itemEstimateRange(item);
    bucket.count += 1;
    if (range) {
      bucket.minMinutes += range.minMinutes;
      bucket.maxMinutes += range.maxMinutes;
    }
  }

  return {
    categories: ATTENTION_CATEGORY_ORDER.map((category) => totals.get(category)!),
    unclassified: { count: unclassified },
  };
}
