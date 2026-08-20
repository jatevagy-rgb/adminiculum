/**
 * Deterministic candidate detectors (ANONYMIZATION-FOUNDATION-1).
 *
 * Only patterns that can be detected reliably WITHOUT semantic AI are included:
 * email, phone numbers, IBAN, Hungarian tax numbers, EU VAT, Hungarian company
 * registry numbers, and user-supplied exact sensitive terms. Detection is
 * deliberately conservative — a match produces a REVIEWABLE candidate, never an
 * automatic redaction. False positives are acceptable precisely because nothing
 * is applied until a human approves it.
 *
 * The module does NOT attempt heuristic legal classification and does NOT try
 * to guess arbitrary human names from text. Phase-1 person/company/project
 * identification is an explicit manual input.
 */

import type { AnonymizationCandidate, CandidateConfidence, DetectorName, SensitiveCategory } from './types';
import { findOccurrences, foldForMatch } from './textNormalization';
import { PseudonymAssigner } from './pseudonyms';

/** Overlap precedence: manual/exact terms outrank regex detections. */
export const EXACT_TERM_PRECEDENCE = 2;
export const REGEX_PRECEDENCE = 1;

interface DetectorPattern {
  detector: DetectorName;
  category: SensitiveCategory;
  regex: RegExp;
  confidence: CandidateConfidence;
  /** Optional post-match validation so broad shapes don't grab arbitrary numbers. */
  validate?: (matched: string) => boolean;
  note?: string;
}

/** Hungarian/European phone: +36 / 06 prefixes with 7+ digits, or generic +CC. */
const PHONE_RE = /(?:\+36|06)[\s\-/.()]*\(?(?:\d{1,2})\)?[\s\-/.()]*(?:\d[\s\-/.()]*){7}|\+\d{1,3}[\s\-/.()]*(?:\d[\s\-/.()]*){7,14}/g;

/** IBAN: two letters + two digits + grouped digits. Post-validated for length. */
const IBAN_RE = /\b[A-Z]{2}\d{2}[\s-]?(?:\d{4}[\s-]?){2,7}\d{1,4}\b/g;

/** Hungarian adószám: 8-1-2 form. */
const TAX_NUMBER_RE = /\b\d{8}-\d{1}-\d{2}\b/g;

/** EU VAT / adóazonosító: two letters + 8-12 digits. */
const EU_VAT_RE = /\b[A-Z]{2}\s?\d{8,12}\b/g;

/** Hungarian cégjegyzékszám: 2-2-6 form. */
const COMPANY_REGISTRY_RE = /\b\d{2}-\d{2}-\d{6}\b/g;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function ibanValid(matched: string): boolean {
  const alnum = matched.replace(/[^A-Z0-9]/gi, '');
  if (alnum.length < 15 || alnum.length > 34) {
    return false;
  }
  const digits = matched.replace(/[^0-9]/g, '');
  if (digits.length < 10) {
    return false;
  }
  // IBANs never contain dashes; reject anything with a dash to stay conservative.
  return !matched.includes('-');
}

const PATTERNS: DetectorPattern[] = [
  {
    detector: 'email',
    category: 'EMAIL',
    regex: EMAIL_RE,
    confidence: 'HIGH',
  },
  {
    detector: 'phone',
    category: 'PHONE',
    regex: PHONE_RE,
    confidence: 'HIGH',
  },
  {
    detector: 'iban',
    category: 'IBAN',
    regex: IBAN_RE,
    confidence: 'HIGH',
    validate: ibanValid,
    note: 'validated IBAN shape',
  },
  {
    detector: 'tax-number',
    category: 'TAX_ID',
    regex: TAX_NUMBER_RE,
    confidence: 'HIGH',
  },
  {
    detector: 'eu-vat',
    category: 'TAX_ID',
    regex: EU_VAT_RE,
    confidence: 'MEDIUM',
    note: 'EU VAT format — review before approval',
  },
  {
    detector: 'company-registry',
    category: 'IDENTIFIER',
    regex: COMPANY_REGISTRY_RE,
    confidence: 'HIGH',
  },
];

/** Matches whose intervals overlap (share at least one code unit). */
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Dedupe overlapping matches from the SAME detector, keeping the longest span. */
function dedupeSameDetector<T extends { start: number; end: number }>(matches: T[]): T[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: T[] = [];
  for (const m of sorted) {
    const dup = kept.find((k) => overlaps(k, m));
    if (!dup) {
      kept.push(m);
    }
  }
  return kept;
}

function collectPatternMatches(source: string, enabled: Set<DetectorName>): Array<{ start: number; end: number; originalText: string; pattern: DetectorPattern }> {
  const raw: Array<{ start: number; end: number; originalText: string; pattern: DetectorPattern }> = [];
  for (const pattern of PATTERNS) {
    if (!enabled.has(pattern.detector)) {
      continue;
    }
    pattern.regex.lastIndex = 0;
    const matches = [...source.matchAll(pattern.regex)];
    for (const m of matches) {
      const matched = m[0];
      if (pattern.validate && !pattern.validate(matched)) {
        continue;
      }
      const index = m.index ?? 0;
      raw.push({ start: index, end: index + matched.length, originalText: matched, pattern });
    }
  }
  return dedupeSameDetector(raw);
}

function makeCandidate(
  start: number,
  end: number,
  originalText: string,
  pattern: DetectorPattern,
  id: number,
  proposedReplacement: string,
): AnonymizationCandidate {
  return {
    id: `cand-${id}`,
    type: pattern.category,
    start,
    end,
    originalText,
    proposedReplacement,
    detector: pattern.detector,
    confidence: pattern.confidence,
    note: pattern.note,
    precedence: REGEX_PRECEDENCE,
  };
}

/**
 * Run the enabled deterministic detectors against the source text.
 *
 * Returns raw candidates WITHOUT overlap resolution — the engine resolves
 * cross-detector overlap (e.g. an email inside a larger manual term) using the
 * precedence weights. Manual exact terms always outrank regex detections.
 */
export function detectRegexCandidates(
  source: string,
  enabledDetectors: DetectorName[],
): AnonymizationCandidate[] {
  const enabled = new Set(enabledDetectors);
  const matches = collectPatternMatches(source, enabled);

  const assigner = new PseudonymAssigner();
  const byOrder = [...matches].sort((a, b) => a.start - b.start || a.end - b.end);

  const candidates: AnonymizationCandidate[] = [];
  for (let i = 0; i < byOrder.length; i++) {
    const m = byOrder[i];
    const replacement = assigner.assign(m.pattern.category, m.originalText);
    candidates.push(makeCandidate(m.start, m.end, m.originalText, m.pattern, i + 1, replacement));
  }
  return candidates;
}

/**
 * Detect user-supplied exact sensitive terms (PERSON, ORGANIZATION, PROJECT,
 * BUSINESS_SECRET, OTHER_SENSITIVE, ...). This is the Phase-1 way of identifying
 * names without pretending regex can reliably find every human name.
 */
export function detectExactTermCandidates(
  source: string,
  terms: Array<{ term: string; category: SensitiveCategory }>,
  options: {
    caseInsensitive: boolean;
    diacriticInsensitive: boolean;
    minTermLength: number;
    wholeWord?: boolean;
  },
): { candidates: AnonymizationCandidate[]; warnings: string[] } {
  const candidates: AnonymizationCandidate[] = [];
  const warnings: string[] = [];
  let id = 1;

  const occurrencesByTerm: Array<{ start: number; end: number; originalText: string; category: SensitiveCategory }> = [];

  // Fold the source ONCE and reuse it for every manual term. Folding is
  // O(source length) and allocates two arrays of that length; doing it per term
  // turned a large manual dictionary into an O(terms × source length) allocation
  // amplifier (a denial-of-service vector). The folded copy depends only on the
  // source, so reuse is deterministic and does not change any output.
  const foldedSource =
    options.caseInsensitive || options.diacriticInsensitive ? foldForMatch(source) : undefined;

  // Warnings must identify a term by ordinal position and reason ONLY. The term
  // text itself is user-supplied sensitive data (PERSON / BUSINESS_SECRET / ...),
  // and warnings flow into the safe export package — echoing the value here would
  // leak the original secret out of the canonical environment.
  let termOrdinal = 0;
  for (const { term, category } of terms) {
    termOrdinal += 1;
    const clean = term.trim();
    if (clean.length === 0) {
      warnings.push(`manual term #${termOrdinal} ignored: empty term`);
      continue;
    }
    if (clean.length < options.minTermLength) {
      warnings.push(`manual term #${termOrdinal} ignored: too short (min ${options.minTermLength})`);
      continue;
    }
    const occurrences = findOccurrences(
      source,
      clean,
      {
        caseInsensitive: options.caseInsensitive,
        diacriticInsensitive: options.diacriticInsensitive,
        wholeWord: options.wholeWord,
      },
      foldedSource,
    );
    if (occurrences.length === 0) {
      warnings.push(`manual term #${termOrdinal} not found in source`);
      continue;
    }
    for (const occ of occurrences) {
      occurrencesByTerm.push({ ...occ, category });
    }
  }

  const byOrder = dedupeSameDetector(occurrencesByTerm).sort((a, b) => a.start - b.start || a.end - b.end);

  const assigner = new PseudonymAssigner();
  for (const occ of byOrder) {
    const replacement = assigner.assign(occ.category, occ.originalText);
    candidates.push({
      id: `cand-${id++}`,
      type: occ.category,
      start: occ.start,
      end: occ.end,
      originalText: occ.originalText,
      proposedReplacement: replacement,
      detector: 'exact-term',
      confidence: 'HIGH',
      precedence: EXACT_TERM_PRECEDENCE,
    });
  }

  return { candidates, warnings };
}