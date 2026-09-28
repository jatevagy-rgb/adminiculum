/**
 * Exact-version selection anchoring for the Document Reader.
 *
 * The legacy workspace derived a text range with `versionText.indexOf(selectedText)`.
 * That is unsafe for legal documents where the same phrase ("30 nap") can occur
 * many times: it always anchors the FIRST occurrence, not the one the user
 * actually selected.
 *
 * This module derives absolute character offsets from the real DOM Range inside
 * the canonical reader root, so a duplicate phrase anchors to the selected
 * occurrence. It refuses to produce an anchor it cannot prove: if the canonical
 * text slice does not equal the actual selected text, it returns null and the
 * caller must not submit anything.
 */

export interface ExactSelectionAnchor {
  /** The exact selected text as it exists in the canonical version text. */
  selectedText: string;
  startOffset: number;
  endOffset: number;
  textPrefix: string;
  textSuffix: string;
}

const CONTEXT_LENGTH = 120;

/**
 * Characters between the start of `root`'s text content and (container, offset).
 * Returns null when the point is not inside `root` or the DOM refuses the range.
 */
export function offsetFromRootStart(root: Node, container: Node, offset: number): number | null {
  if (typeof document === 'undefined') return null;
  if (!root.contains(container)) return null;
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(container, offset);
  } catch {
    return null;
  }
  return range.toString().length;
}

/**
 * Computes a trustworthy anchor for the current selection inside the exact
 * version-text root. Returns null when there is no usable selection or when the
 * DOM mapping cannot be proven to match `canonicalText`.
 */
export function computeExactSelectionAnchor(
  root: HTMLElement | null,
  selection: Selection | null,
  canonicalText: string,
): ExactSelectionAnchor | null {
  if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const rawSelected = range.toString();
  if (!rawSelected.trim()) return null;

  const startOffset = offsetFromRootStart(root, range.startContainer, range.startOffset);
  const endOffset = offsetFromRootStart(root, range.endContainer, range.endOffset);
  if (startOffset === null || endOffset === null) return null;
  if (startOffset < 0 || endOffset <= startOffset || endOffset > canonicalText.length) return null;

  // Anchor invariant: the canonical text slice at the derived offsets must be
  // exactly the text the user selected in the DOM. If it is not, the mapping is
  // not trustworthy and no anchor may be produced.
  const slice = canonicalText.slice(startOffset, endOffset);
  if (slice !== rawSelected) return null;

  return {
    selectedText: rawSelected,
    startOffset,
    endOffset,
    textPrefix: canonicalText.slice(Math.max(0, startOffset - CONTEXT_LENGTH), startOffset),
    textSuffix: canonicalText.slice(endOffset, Math.min(canonicalText.length, endOffset + CONTEXT_LENGTH)),
  };
}

/**
 * Splits `text` into presentation segments for one or more highlight ranges.
 * Rejoining the returned strings reproduces `text` byte-for-byte, so rendering
 * wrappers never shift character offsets.
 */
export interface HighlightRange {
  start: number;
  end: number;
  className: string;
  testId?: string;
  key: string;
  /** Optional identity of the review item this range belongs to. */
  anchorId?: string;
  /** Presentation kind for an anchored review range. */
  kind?: string;
  /**
   * Overlap priority. When several ranges cover the same characters the highest
   * priority wins (ties keep the earliest-starting range). Default 0.
   */
  priority?: number;
}

export function splitTextByHighlights(
  text: string,
  ranges: HighlightRange[],
): Array<{ text: string; range: HighlightRange | null }> {
  const usable = ranges
    .filter((range) => range.end > range.start && range.start >= 0 && range.end <= text.length)
    .sort((a, b) => a.start - b.start);

  if (usable.length === 0) return [{ text, range: null }];

  const boundaries = new Set<number>([0, text.length]);
  for (const range of usable) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const segments: Array<{ text: string; range: HighlightRange | null }> = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end <= start) continue;
    let covering: HighlightRange | null = null;
    for (const range of usable) {
      if (range.start <= start && range.end >= end) {
        if (!covering || (range.priority ?? 0) > (covering.priority ?? 0)) covering = range;
      }
    }
    segments.push({ text: text.slice(start, end), range: covering });
  }
  return segments;
}
