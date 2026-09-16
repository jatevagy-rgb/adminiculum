// Reader text-search: pure, framework-free helpers so the behaviour can be
// tested executably. Search is presentation-only: it never mutates the loaded
// canonical text and never touches annotation offsets.

export type ReaderSearchSurface = "ANNOTATED" | "PLAIN" | "NONE";

export interface ReaderSearchState {
  query: string;
  activeIndex: number;
}

export const EMPTY_READER_SEARCH: ReaderSearchState = { query: "", activeIndex: 0 };

export type ReaderSearchAction =
  | { type: "SET_QUERY"; query: string }
  | { type: "STEP"; direction: 1 | -1; count: number }
  | { type: "RESET" };

/**
 * Decide which reader surface is actually in front of the user.
 * - PLAIN: the extracted-text surface — matches can be highlighted and navigated
 *   safely because there are no annotation text-range anchors on it.
 * - ANNOTATED: the annotation-anchored surface — visual search highlighting
 *   cannot be added without risking canonical annotation offsets.
 */
export function resolveReaderSearchSurface(input: {
  hasAnnotatedText: boolean;
  hasPlainText: boolean;
}): ReaderSearchSurface {
  // The annotated surface is rendered first when it qualifies, so it wins.
  if (input.hasAnnotatedText) return "ANNOTATED";
  if (input.hasPlainText) return "PLAIN";
  return "NONE";
}

/** Search (with visual highlight + navigation) is only supported on PLAIN. */
export function isReaderSearchSupported(surface: ReaderSearchSurface): boolean {
  return surface === "PLAIN";
}

export function normalizeReaderSearchTerm(query: string): string {
  return (query || "").trim().toLowerCase();
}

/** All match offsets for the query within the given text (case-insensitive). */
export function findReaderMatchOffsets(
  text: string | null | undefined,
  query: string,
  limit = 500,
): number[] {
  const needle = normalizeReaderSearchTerm(query);
  if (!text || !needle) return [];
  const haystack = text.toLowerCase();
  const offsets: number[] = [];
  let from = 0;
  while (offsets.length < limit) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    offsets.push(at);
    from = at + Math.max(1, needle.length);
  }
  return offsets;
}

export function clampReaderMatchIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

/** Wrap-around previous (-1) / next (+1) navigation. */
export function stepReaderMatchIndex(index: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return 0;
  const current = clampReaderMatchIndex(index, count);
  return (current + direction + count) % count;
}

export function readerSearchReducer(state: ReaderSearchState, action: ReaderSearchAction): ReaderSearchState {
  switch (action.type) {
    case "SET_QUERY":
      return { query: action.query, activeIndex: 0 };
    case "STEP":
      return { ...state, activeIndex: stepReaderMatchIndex(state.activeIndex, action.count, action.direction) };
    case "RESET":
      return { ...EMPTY_READER_SEARCH };
    default:
      return state;
  }
}

export interface ReaderHighlightSegment {
  text: string;
  /** Match index when this segment is a match, otherwise null. */
  matchIndex: number | null;
}

/**
 * Split the text into plain/match segments. Rejoining the segments must return
 * the original text byte-for-byte (this is asserted in the tests).
 */
export function buildReaderHighlightSegments(
  text: string,
  offsets: number[],
  termLength: number,
): ReaderHighlightSegment[] {
  const segments: ReaderHighlightSegment[] = [];
  if (termLength <= 0) return [{ text, matchIndex: null }];
  let cursor = 0;
  offsets.forEach((offset, index) => {
    if (offset < cursor) return;
    if (offset > cursor) segments.push({ text: text.slice(cursor, offset), matchIndex: null });
    segments.push({ text: text.slice(offset, offset + termLength), matchIndex: index });
    cursor = offset + termLength;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), matchIndex: null });
  return segments;
}
