// Reader text-search: pure, framework-free helpers so the behaviour can be
// tested executably. Search is presentation-only: it never mutates the loaded
// canonical text and never touches annotation offsets.

export type ReaderSearchSurface = "VERSION_TEXT" | "PLAIN" | "NONE";

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
 * - VERSION_TEXT: the exact selected immutable version's text (TXT bytes or
 *   backend-extracted DOCX/PDF text). Matches are highlighted inside the same
 *   `versionText` string the reader renders and the anchors are computed
 *   against, so search can never read another version's text. Annotation
 *   offsets are untouched (highlighting is presentation-only).
 * - PLAIN: the document-level extracted-text surface (legacy/non-version
 *   formats) — display-only, carries no text-range anchors.
 */
export function resolveReaderSearchSurface(input: {
  hasVersionText: boolean;
  hasPlainText: boolean;
}): ReaderSearchSurface {
  // The version-scoped surface is rendered first when it qualifies, so it wins.
  if (input.hasVersionText) return "VERSION_TEXT";
  if (input.hasPlainText) return "PLAIN";
  return "NONE";
}

/** Search (with visual highlight + navigation) needs real, exact reader text. */
export function isReaderSearchSupported(surface: ReaderSearchSurface): boolean {
  return surface === "VERSION_TEXT" || surface === "PLAIN";
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

/**
 * Same segmentation as `buildReaderHighlightSegments`, but restricted to one
 * slice `[rangeStart, rangeEnd)` of the full text. Match indexes stay the global
 * index into `offsets` so the active-match navigation keeps working, and only
 * matches fully contained in the range are highlighted (a match straddling an
 * annotation boundary is left plain rather than split). Rejoining the returned
 * segments returns exactly `text.slice(rangeStart, rangeEnd)`.
 */
export function buildReaderHighlightSegmentsInRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  offsets: number[],
  termLength: number,
): ReaderHighlightSegment[] {
  const start = Math.max(0, Math.min(rangeStart, text.length));
  const end = Math.max(start, Math.min(rangeEnd, text.length));
  const inner = text.slice(start, end);
  if (termLength <= 0 || inner.length === 0) return [{ text: inner, matchIndex: null }];
  const segments: ReaderHighlightSegment[] = [];
  let cursor = 0;
  offsets.forEach((offset, index) => {
    if (offset < start || offset + termLength > end) return;
    const local = offset - start;
    if (local < cursor) return;
    if (local > cursor) segments.push({ text: inner.slice(cursor, local), matchIndex: null });
    segments.push({ text: inner.slice(local, local + termLength), matchIndex: index });
    cursor = local + termLength;
  });
  if (cursor < inner.length) segments.push({ text: inner.slice(cursor), matchIndex: null });
  return segments.length > 0 ? segments : [{ text: inner, matchIndex: null }];
}
