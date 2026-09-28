/**
 * Anchor-aligned review-margin layout.
 *
 * The converged reader places comments and modification proposals next to the
 * exact document location they reference (their version-scoped `startOffset`)
 * instead of a global chronological feed. This module is deliberately pure: it
 * owns ordering and deterministic collision handling, while DOM measurement
 * lives in `@/lib/documents/readerAnchorMeasure`.
 *
 * Ordering is primarily by anchor (`startOffset`), NOT by `createdAt`. For
 * identical anchors `createdAt` breaks the tie, then `id`, so the order is
 * always deterministic.
 */

export type RailItemKind = "comment" | "proposal" | "draft";

export interface RailLayoutItem {
  id: string;
  kind: RailItemKind;
  /** Version-scoped exact anchor start. null/unknown items sort last. */
  startOffset: number | null;
  endOffset: number | null;
  /** Real creation timestamp; only a tie-breaker, never the primary order. */
  createdAt: string;
}

/** Sentinel used for items without a usable anchor so they sort after anchored ones. */
const UNPLACED_ANCHOR = Number.MAX_SAFE_INTEGER;

export function railItemAnchorStart(item: Pick<RailLayoutItem, "startOffset">): number {
  const value = item.startOffset;
  if (value === null || value === undefined || Number.isNaN(value)) return UNPLACED_ANCHOR;
  return value;
}

/**
 * Anchor-first deterministic ordering. Nearby items keep document order; items
 * that share a start offset fall back to their real `createdAt` and then id.
 */
export function orderRailItemsByAnchor<T extends RailLayoutItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const anchorA = railItemAnchorStart(a);
    const anchorB = railItemAnchorStart(b);
    if (anchorA !== anchorB) return anchorA - anchorB;
    const createdA = a.createdAt || "";
    const createdB = b.createdAt || "";
    if (createdA !== createdB) return createdA.localeCompare(createdB);
    return a.id.localeCompare(b.id);
  });
}

export interface AnchoredLayoutInput {
  items: readonly RailLayoutItem[];
  /** Desired top (px) per item derived from its measured anchor Y. */
  desiredYById: Record<string, number | null | undefined>;
  /** Measured card height (px) per item. */
  heightById: Record<string, number | undefined>;
  /** Minimum vertical gap between two stacked cards. */
  gap?: number;
  /** Optional minimum top (e.g. a sticky rail header height). */
  minY?: number;
}

export interface AnchoredLayoutResult {
  positions: Record<string, number>;
  contentHeight: number;
}

/**
 * Deterministic collision handling:
 *
 *   actualY(first) = max(desiredY(first), minY)
 *   actualY(next)  = max(desiredY(next), previousBottom + GAP, minY)
 *
 * Items are processed in `orderRailItemsByAnchor`, so cards that reference the
 * same or nearby text stack locally while their vertical position stays tied to
 * the document anchor.
 */
export function computeAnchoredLayout(input: AnchoredLayoutInput): AnchoredLayoutResult {
  const gap = input.gap ?? 12;
  const minY = input.minY ?? 0;
  const ordered = orderRailItemsByAnchor(input.items);
  const positions: Record<string, number> = {};
  let previousBottom: number | null = null;

  for (const item of ordered) {
    const height = Math.max(0, input.heightById[item.id] ?? 0);
    const rawDesired = input.desiredYById[item.id];
    const desired =
      typeof rawDesired === "number" && Number.isFinite(rawDesired) ? rawDesired : minY;
    const afterPrevious = previousBottom === null ? desired : previousBottom + gap;
    const y = Math.max(desired, afterPrevious, minY);
    positions[item.id] = y;
    previousBottom = y + height;
  }

  const contentHeight = previousBottom === null ? 0 : Math.max(0, previousBottom + gap);
  return { positions, contentHeight };
}
