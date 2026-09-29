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

/**
 * Comment anchor recovery.
 *
 * Comments are the only rail items whose stored `startOffset` may be absent:
 * legacy review comments were authored before every path required offsets, and
 * a re-extracted version text can push a recorded offset outside the rendered
 * document. An unplaced comment must NOT silently inherit the previous card's
 * stack position — it has to be placed beside its own quoted text. These pure
 * helpers resolve a trustworthy offset from the comment's own selectedText and
 * its stored prefix/suffix context; they never invent an anchor for text that
 * does not occur in the rendered document.
 */
export interface AnchorTextHints {
  selectedText?: string | null;
  textPrefix?: string | null;
  textSuffix?: string | null;
}

/** Offset of the quoted text occurrence that matches the stored context, else the first occurrence. */
export function resolveTextAnchorOffset(rootText: string, hints: AnchorTextHints): number | null {
  const needle = typeof hints.selectedText === "string" ? hints.selectedText : "";
  if (!rootText || !needle) return null;
  const prefix = typeof hints.textPrefix === "string" ? hints.textPrefix : "";
  const suffix = typeof hints.textSuffix === "string" ? hints.textSuffix : "";

  const candidates: number[] = [];
  let from = 0;
  while (from < rootText.length) {
    const index = rootText.indexOf(needle, from);
    if (index < 0) break;
    candidates.push(index);
    from = index + 1;
  }
  if (candidates.length === 0) return null;

  const contextMatches = candidates.filter((index) => {
    if (prefix) {
      const before = rootText.slice(Math.max(0, index - prefix.length), index);
      if (!before.endsWith(prefix)) return false;
    }
    if (suffix) {
      const after = rootText.slice(index + needle.length, index + needle.length + suffix.length);
      if (!after.startsWith(suffix)) return false;
    }
    return true;
  });
  return contextMatches.length > 0 ? contextMatches[0] : candidates[0];
}

/**
 * Effective anchor offset for one rail item.
 *
 * A numeric offset inside the rendered text always wins — comments with a valid
 * offset and every proposal/draft stay on the exact legacy path. Only a comment
 * whose offset is missing or no longer fits the rendered text falls back to its
 * own quoted text; when even that fails the original value is preserved so the
 * legacy deterministic stacking behaviour is unchanged.
 */
export function resolveRailItemOffset(
  rootText: string,
  item: { kind: string; startOffset?: number | null } & AnchorTextHints,
): number | null {
  const numeric = item.startOffset;
  const usable =
    typeof numeric === "number" && Number.isFinite(numeric) && numeric >= 0 && numeric <= rootText.length;
  if (usable) return numeric;
  if (item.kind === "comment") {
    const resolved = resolveTextAnchorOffset(rootText, item);
    if (resolved !== null) return resolved;
  }
  return numeric ?? null;
}
