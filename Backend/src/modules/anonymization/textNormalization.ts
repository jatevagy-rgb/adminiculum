/**
 * Text normalization helpers (ANONYMIZATION-FOUNDATION-1).
 *
 * These helpers exist ONLY to make exact-term matching robust for Hungarian and
 * other accented text. Normalization is applied to the COMPARISON, never to the
 * output: the anonymized working copy preserves the original characters, case,
 * paragraphs and punctuation of everything that is NOT replaced.
 */

const COMBINING_MARK = /\p{M}/u;

/**
 * Fold a string for matching: strip diacritics and lowercase, while recording a
 * code-unit index map back into the original string. The map is code-unit
 * based because JavaScript string offsets are code-unit based.
 *
 * Returns:
 * - `folded`: the comparison form
 * - `indexMap`: for each code unit in `folded`, the code-unit index in the
 *   original (normalized) input it came from.
 */
export function foldForMatch(input: string): { folded: string; indexMap: number[] } {
  const foldedParts: string[] = [];
  const indexMap: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const decomposed = ch.normalize('NFD');
    for (let j = 0; j < decomposed.length; j++) {
      const unit = decomposed[j];
      if (COMBINING_MARK.test(unit)) {
        continue;
      }
      const lowered = unit.toLowerCase();
      for (let k = 0; k < lowered.length; k++) {
        foldedParts.push(lowered[k]);
        indexMap.push(i);
      }
    }
  }
  return { folded: foldedParts.join(''), indexMap };
}

export interface Occurrence {
  /** Inclusive start offset in the original source (UTF-16 code units). */
  start: number;
  /** Exclusive end offset in the original source. */
  end: number;
  /** The original (unfolded) text at [start, end). */
  originalText: string;
}

/**
 * Find all non-overlapping occurrences of `term` inside `source`.
 *
 * Options control whether matching ignores case and/or diacritics. When either
 * is enabled the match is performed against a folded copy and the offsets are
 * mapped back to the original source, so the extracted `originalText` is always
 * the true source substring (accents, case and all).
 */
export function findOccurrences(
  source: string,
  term: string,
  options: { caseInsensitive: boolean; diacriticInsensitive: boolean; wholeWord?: boolean } = {
    caseInsensitive: true,
    diacriticInsensitive: true,
  },
): Occurrence[] {
  if (term.length === 0) {
    return [];
  }

  if (!options.caseInsensitive && !options.diacriticInsensitive) {
    return scanLiteral(source, term, options.wholeWord === true);
  }

  const foldedSource = foldForMatch(source);
  const foldedTerm = foldForMatch(term);
  if (foldedTerm.folded.length === 0) {
    return [];
  }

  const occurrences: Occurrence[] = [];
  let searchFrom = 0;
  while (searchFrom <= foldedSource.folded.length - foldedTerm.folded.length) {
    const idx = foldedSource.folded.indexOf(foldedTerm.folded, searchFrom);
    if (idx === -1) {
      break;
    }
    const startOrig = foldedSource.indexMap[idx];
    const endOrig = foldedSource.indexMap[idx + foldedTerm.folded.length - 1] + 1;
    if (!options.wholeWord || isWholeWord(source, startOrig, endOrig)) {
      occurrences.push({
        start: startOrig,
        end: endOrig,
        originalText: source.slice(startOrig, endOrig),
      });
    }
    searchFrom = idx + foldedTerm.folded.length;
  }
  return occurrences;
}

/** A whole word is not adjacent to another word character (letters, marks, digits, _). */
export function isWholeWord(source: string, start: number, end: number): boolean {
  const before = start > 0 ? source[start - 1] : undefined;
  const after = end < source.length ? source[end] : undefined;
  const wordChar = /[\p{L}\p{M}\d_]/u;
  return (before === undefined || !wordChar.test(before)) && (after === undefined || !wordChar.test(after));
}

function scanLiteral(source: string, term: string, wholeWord: boolean): Occurrence[] {
  const occurrences: Occurrence[] = [];
  let searchFrom = 0;
  while (searchFrom <= source.length - term.length) {
    const idx = source.indexOf(term, searchFrom);
    if (idx === -1) {
      break;
    }
    if (!wholeWord || isWholeWord(source, idx, idx + term.length)) {
      occurrences.push({ start: idx, end: idx + term.length, originalText: term });
    }
    searchFrom = idx + term.length;
  }
  return occurrences;
}