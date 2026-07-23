/**
 * Normalized geometry helpers for anchored annotations.
 *
 * All persisted coordinates are normalized to 0..1 relative to the page surface —
 * never browser viewport pixels — so an anchor survives zoom, scroll and
 * different device pixel ratios. These rules intentionally mirror the server-side
 * validation in Backend/src/modules/documents/annotations.service.ts and the
 * database CHECK constraints, so an invalid shape is rejected before it is sent.
 */

export type NormalizedPoint = { x: number; y: number };
export type NormalizedRect = { x: number; y: number; width: number; height: number };

/** Minimum normalized edge length; anything smaller is an accidental click, not a shape. */
export const MIN_NORMALIZED_EDGE = 0.002;

export function clamp01(value: number): number {
  // NaN has no meaningful position and collapses to 0; ±Infinity clamps to the
  // nearest bound so an extreme pointer position still yields an in-page value.
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Convert a viewport pixel position into a normalized point on a page surface. */
export function toNormalizedPoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number }
): NormalizedPoint {
  if (!bounds.width || !bounds.height) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - bounds.left) / bounds.width),
    y: clamp01((clientY - bounds.top) / bounds.height),
  };
}

/** Build a normalized rect from two corner points (order-independent). */
export function toNormalizedRect(start: NormalizedPoint, end: NormalizedPoint): NormalizedRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return {
    x: clamp01(x),
    y: clamp01(y),
    // Never allow the shape to extend past the page edge.
    width: clamp01(Math.min(width, 1 - clamp01(x))),
    height: clamp01(Math.min(height, 1 - clamp01(y))),
  };
}

export function isValidNormalizedPoint(point: NormalizedPoint | null | undefined): boolean {
  if (!point) return false;
  return (
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
  );
}

/** Rejects zero/degenerate area and any shape crossing the page bounds. */
export function isValidNormalizedRect(rect: NormalizedRect | null | undefined): boolean {
  if (!rect) return false;
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return false;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return false;
  if (width < MIN_NORMALIZED_EDGE || height < MIN_NORMALIZED_EDGE) return false;
  return x + width <= 1 && y + height <= 1;
}

/** Convert a normalized rect into CSS percentage box styles for overlay rendering. */
export function toOverlayStyle(rect: NormalizedRect): {
  left: string; top: string; width: string; height: string;
} {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

export const ALLOWED_PAGE_ROTATIONS = [0, 90, 180, 270] as const;
export function isAllowedPageRotation(rotation: number | null | undefined): boolean {
  if (rotation === null || rotation === undefined) return true;
  return (ALLOWED_PAGE_ROTATIONS as readonly number[]).includes(rotation);
}
