/**
 * Case Context V2 — fail-closed request-shape validation.
 *
 * This is the single runtime boundary that turns untrusted HTTP JSON into the
 * typed shapes the service and the anonymization foundation expect. It exists
 * so malformed input is rejected with a precise 400 instead of being silently
 * cast, dropped, or normalized — which would otherwise let an unsupported
 * category reach `PseudonymAssigner` (`[undefined_*]` placeholders) or let a
 * malformed `approvedCandidateIds` become `[]` and persist
 * `anonymizedText === rawText`.
 *
 * Deliberately does NOT touch the anonymization foundation taxonomy, matching
 * semantics, or determinism: the canonical category vocabulary below is a
 * runtime mirror of `SensitiveCategory` in `anonymization/types.ts`, not a
 * redefinition of it.
 */

import type { ManualSensitiveTerm, SensitiveCategory } from '../anonymization';

/** Runtime mirror of the foundation `SensitiveCategory` vocabulary. */
export const SUPPORTED_SENSITIVE_CATEGORIES: readonly SensitiveCategory[] = [
  'EMAIL',
  'PHONE',
  'IBAN',
  'TAX_ID',
  'IDENTIFIER',
  'ADDRESS',
  'PERSON',
  'ORGANIZATION',
  'PROJECT',
  'BUSINESS_SECRET',
  'OTHER_SENSITIVE',
];

const SUPPORTED_CATEGORY_SET: ReadonlySet<string> = new Set(SUPPORTED_SENSITIVE_CATEGORIES);

/**
 * Maximum number of manual terms accepted in one request. Exact-term detection
 * scans the source (up to `MAX_INPUT_CHARS` = 2,000,000 chars) once per term,
 * so an unbounded list is a request-level CPU amplification vector. 100 is far
 * above any realistic human review and keeps worst-case scanning bounded.
 */
export const MAX_MANUAL_TERMS = 100;

/**
 * Maximum UTF-16 length of a single manual term. A legitimate sensitive term
 * (name, organization, address, secret phrase) is never anywhere near this;
 * the bound prevents pathological per-term memory/CPU during normalization and
 * detection without rejecting any real value.
 */
export const MAX_MANUAL_TERM_LENGTH = 500;

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { status: 400, code });
}

export function isSensitiveCategory(value: unknown): value is SensitiveCategory {
  return typeof value === 'string' && SUPPORTED_CATEGORY_SET.has(value);
}

/**
 * Parse and validate the `manualTerms` request shape.
 *
 * Omitted (`undefined`) is equivalent to `[]`. Any supplied value must be an
 * array of well-formed `{ term, category }` objects; a single malformed entry
 * fails the whole request (no partial acceptance). Categories must be one of
 * the canonical foundation categories — never cast, dropped, or remapped.
 */
export function parseManualTerms(value: unknown): ManualSensitiveTerm[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    fail('INVALID_MANUAL_TERMS', 'manualTerms must be an array.');
  }
  if (value.length > MAX_MANUAL_TERMS) {
    fail('MANUAL_TERMS_TOO_MANY', `manualTerms exceeds the maximum of ${MAX_MANUAL_TERMS} terms.`);
  }

  const out: ManualSensitiveTerm[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail('INVALID_MANUAL_TERMS', 'Each manual term must be an object.');
    }
    const term = (item as { term?: unknown }).term;
    const category = (item as { category?: unknown }).category;

    if (typeof term !== 'string') {
      fail('INVALID_MANUAL_TERMS', 'Each manual term must have a string "term".');
    }
    if (term.trim() === '') {
      fail('INVALID_MANUAL_TERMS', 'Each manual term must have a non-blank "term".');
    }
    if (term.length > MAX_MANUAL_TERM_LENGTH) {
      fail('MANUAL_TERM_TOO_LONG', `A manual term exceeds the maximum of ${MAX_MANUAL_TERM_LENGTH} characters.`);
    }
    if (!isSensitiveCategory(category)) {
      fail('INVALID_SENSITIVE_CATEGORY', `Unsupported sensitive category: ${String(category)}.`);
    }

    out.push({ term, category });
  }
  return out;
}

/**
 * Parse and validate the APPLY endpoint's `approvedCandidateIds`.
 *
 * Required and strictly `string[]`: missing, null, non-array, non-string, or
 * blank entries all fail with 400. An explicitly supplied `[]` is allowed (a
 * reviewer may deliberately approve zero candidates and complete the review).
 */
export function parseApprovedCandidateIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    fail('INVALID_APPROVED_CANDIDATE_IDS', 'approvedCandidateIds must be an array of strings.');
  }
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || id.trim() === '') {
      fail('INVALID_APPROVED_CANDIDATE_IDS', 'approvedCandidateIds must contain only non-blank strings.');
    }
    out.push(id);
  }
  return out;
}
