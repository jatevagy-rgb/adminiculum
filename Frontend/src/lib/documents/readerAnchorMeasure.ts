/**
 * Measured anchor positions for the anchor-aligned review margin.
 *
 * The reader renders the exact version text as DOM text nodes (possibly wrapped
 * in inline `mark`/`span` elements that never shift offsets). To place a review
 * card next to its referenced sentence we resolve a character offset to the
 * matching text node, build a collapsed Range there and read its real client
 * rectangle relative to the positioning container.
 *
 * Positions are ALWAYS measured from the live DOM, never cached as one-time
 * absolute coordinates, so scrolling/resizing/reflow stay correct.
 */

export interface OffsetTextPosition {
  node: Text;
  offset: number;
}

const SHOW_TEXT = 4;

/** Resolves an absolute character offset to a (text node, offset-in-node) pair. */
export function offsetToTextPosition(root: HTMLElement | null, offset: number): OffsetTextPosition | null {
  if (!root || offset < 0) return null;
  const doc = root.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return null;

  const walker = doc.createTreeWalker(root, SHOW_TEXT);
  let remaining = offset;
  let last: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.data.length;
    last = node;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
    node = walker.nextNode() as Text | null;
  }
  // Offset at/after the very end resolves to the end of the last text node.
  if (last) return { node: last, offset: last.data.length };
  return null;
}

/**
 * Vertical position (px) of `offset` relative to the top of `container`.
 * Returns null when the DOM cannot be laid out (e.g. jsdom has no layout), so
 * callers fall back to deterministic sequential stacking.
 */
export function measureOffsetY(
  container: HTMLElement | null,
  root: HTMLElement | null,
  offset: number,
): number | null {
  if (!container || !root) return null;
  const doc = root.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const position = offsetToTextPosition(root, offset);
  if (!position) return null;

  const range = doc.createRange();
  try {
    range.setStart(position.node, position.offset);
    range.setEnd(position.node, position.offset);
  } catch {
    return null;
  }
  if (typeof range.getBoundingClientRect !== "function") return null;
  const rect = range.getBoundingClientRect();
  if (!rect) return null;
  if (rect.top === 0 && rect.bottom === 0 && rect.height === 0 && rect.width === 0) return null;
  if (typeof container.getBoundingClientRect !== "function") return null;
  const containerRect = container.getBoundingClientRect();
  return rect.top - containerRect.top;
}

/** Measures every anchored item in one pass. */
export function measureAnchorYPositions(
  container: HTMLElement | null,
  root: HTMLElement | null,
  offsets: ReadonlyArray<{ id: string; startOffset: number | null }>,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const item of offsets) {
    result[item.id] =
      item.startOffset === null ? null : measureOffsetY(container, root, item.startOffset);
  }
  return result;
}
