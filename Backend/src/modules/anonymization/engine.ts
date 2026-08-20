/**
 * Anonymization engine — DETECT → REVIEW → APPLY (ANONYMIZATION-FOUNDATION-1).
 *
 * The engine enforces the module's central invariant: detection NEVER publishes.
 *
 *   1. DETECT  — deterministic detectors produce REVIEWABLE candidates.
 *   2. REVIEW  — a human decides which candidates are approved.
 *   3. APPLY   — ONLY the explicitly approved redactions are applied.
 *
 * There is intentionally no path that silently publishes or exports detected
 * candidates. Unapproved candidates leave the text byte-for-byte unchanged.
 *
 * Offset safety: candidates carry offsets into the ORIGINAL source text.
 * Approved redactions are sorted ascending by start and applied from RIGHT TO
 * LEFT, so a replacement never shifts offsets that have not been processed yet.
 * This is deterministic and correct for Unicode/Hungarian text because offsets
 * are JavaScript code units and every regex/match operates in that same space.
 *
 * Pseudonymization: repeated values in one work package always receive the same
 * placeholder (`[SZEMÉLY_1]`, `[EMAIL_1]`, ...) and different values receive
 * different placeholders. The original→placeholder mapping is held only in the
 * in-memory operation result and is NEVER included in the safe export object.
 */

import { createHash } from 'crypto';
import {
  ANONYMIZATION_ALGORITHM_REVISION,
  MAX_INPUT_CHARS,
  type AnonymizationCandidate,
  type AnonymizationOptions,
  type AnonymizationResult,
  type ApprovedRedaction,
  type CategoryCounts,
  type InternalReplacementMapping,
  type SanitizedExternalPackage,
} from './types';
import { detectExactTermCandidates, detectRegexCandidates } from './detectors';
import { PseudonymAssigner } from './pseudonyms';

const ALL_DETECTORS = [
  'email',
  'phone',
  'iban',
  'tax-number',
  'eu-vat',
  'company-registry',
  'exact-term',
] as const;

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * DETECT: run all enabled deterministic detectors and resolve cross-detector
 * overlap (e.g. an email address inside a larger manually selected term).
 *
 * Precedence is deterministic: manual/exact terms first, then longer spans,
 * then earlier start, then stable id. Overlapped candidates are dropped and
 * reported as warnings (ids and categories only — never the sensitive text).
 */
export function detectCandidates(
  sourceText: string,
  options: AnonymizationOptions,
): { candidates: AnonymizationCandidate[]; warnings: string[] } {
  const warnings: string[] = [];

  if (sourceText.length > MAX_INPUT_CHARS) {
    warnings.push(`input exceeds ${MAX_INPUT_CHARS} chars; processing continues`);
  }

  const enabledDetectors = options.enabledDetectors ?? [...ALL_DETECTORS];
  const regexCandidates = detectRegexCandidates(sourceText, enabledDetectors.filter((d) => d !== 'exact-term'));

  const exact = detectExactTermCandidates(sourceText, options.manualTerms, {
    caseInsensitive: options.caseInsensitiveExactTerms ?? true,
    diacriticInsensitive: options.diacriticInsensitiveExactTerms ?? true,
    wholeWord: options.exactTermsWholeWords ?? true,
    minTermLength: options.minTermLength ?? 2,
  });
  warnings.push(...exact.warnings);

  const all = [...exact.candidates, ...regexCandidates];
  // Candidate ids must be unique across detector groups; renumber deterministically.
  all.forEach((c, i) => {
    c.id = `cand-${i + 1}`;
  });

  const sorted = [...all].sort((a, b) => {
    if (b.precedence !== a.precedence) {
      return b.precedence - a.precedence;
    }
    const len = b.end - b.start - (a.end - a.start);
    if (len !== 0) {
      return len;
    }
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return a.id < b.id ? -1 : 1;
  });

  const kept: AnonymizationCandidate[] = [];
  for (const c of sorted) {
    const conflict = kept.find((k) => overlaps(k, c));
    if (conflict) {
      warnings.push(`candidate ${c.id} (${c.type}) dropped: overlaps ${conflict.id} (${conflict.type})`);
      continue;
    }
    kept.push(c);
  }

  kept.sort((a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : 1));
  return { candidates: kept, warnings };
}

/**
 * REVIEW → APPROVE: turn an explicit human choice into an ordered, offset-stable
 * list of redactions. Only candidates whose ids appear in `approvedCandidateIds`
 * are applied. Unknown or duplicate ids produce warnings but do not abort.
 *
 * Final placeholder assignment happens HERE over the approved set (ascending
 * start order), which guarantees consistency: identical values → identical
 * placeholder, different values → different placeholders.
 */
export function createApprovedRedactions(
  candidates: AnonymizationCandidate[],
  approvedCandidateIds: string[],
): { redactions: ApprovedRedaction[]; warnings: string[] } {
  const warnings: string[] = [];
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const seen = new Set<string>();
  const chosen: AnonymizationCandidate[] = [];
  for (const id of approvedCandidateIds) {
    const candidate = byId.get(id);
    if (!candidate) {
      warnings.push(`unknown approved candidate id: ${id}`);
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`duplicate approved candidate id: ${id}`);
      continue;
    }
    seen.add(id);
    chosen.push(candidate);
  }

  chosen.sort((a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : 1));

  const assigner = new PseudonymAssigner();
  const redactions: ApprovedRedaction[] = [];
  for (const c of chosen) {
    const replacement = assigner.assign(c.type, c.originalText);
    redactions.push({ start: c.start, end: c.end, type: c.type, replacement });
  }

  return { redactions, warnings };
}

/**
 * APPLY: replace the approved redactions into the source text.
 *
 * Redactions are applied from the highest offset to the lowest, so each edit
 * only touches positions that will not be edited again — no incremental offset
 * mutation, no corrupted replacements. Defensive overlap filtering keeps the
 * operation total even if an invalid plan is supplied.
 */
export function applyApprovedRedactions(
  sourceText: string,
  redactions: ApprovedRedaction[],
): { anonymizedText: string; appliedCount: number; categoryCounts: CategoryCounts; resultHash: string } {
  const sorted = [...redactions].sort((a, b) => a.start - b.start || a.end - b.end);

  const filtered: ApprovedRedaction[] = [];
  for (const r of sorted) {
    if (r.start < 0 || r.end > sourceText.length || r.start >= r.end) {
      continue;
    }
    const conflict = filtered.some((f) => overlaps(f, r));
    if (conflict) {
      continue;
    }
    filtered.push(r);
  }

  const categoryCounts: CategoryCounts = {};
  let result = sourceText;
  for (let i = filtered.length - 1; i >= 0; i--) {
    const r = filtered[i];
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
    categoryCounts[r.type] = (categoryCounts[r.type] ?? 0) + 1;
  }

  const appliedCount = filtered.length;
  return { anonymizedText: result, appliedCount, categoryCounts, resultHash: sha256(result) };
}

/**
 * Build the safe result metadata for a completed operation. Contains only
 * sanitized content and non-content metadata — never original values and never
 * the reversible mapping.
 */
export function buildResult(
  sourceText: string,
  anonymizedText: string,
  appliedCount: number,
  categoryCounts: CategoryCounts,
  warnings: string[],
): AnonymizationResult {
  return {
    algorithmRevision: ANONYMIZATION_ALGORITHM_REVISION,
    isPseudonymized: true,
    anonymizedText,
    appliedCount,
    categoryCounts,
    sourceHash: sha256(sourceText),
    resultHash: sha256(anonymizedText),
    warnings,
    mappingLocation: 'in-memory-only',
  };
}

/** The confidential internal mapping — returned separately from the safe result. */
export function buildInternalMapping(
  sourceText: string,
  redactions: ApprovedRedaction[],
): InternalReplacementMapping {
  const mapping = redactions.map((r) => ({
    category: r.type,
    original: sourceText.slice(r.start, r.end),
    replacement: r.replacement,
  }));
  return { mapping };
}

/**
 * The safe export object for a future external work package. Contains ONLY the
 * sanitized content — the reversible mapping is excluded by construction.
 */
export function buildSanitizedPackage(result: AnonymizationResult): SanitizedExternalPackage {
  return {
    contentType: 'anonymized-work-package',
    schemaVersion: 1,
    algorithmRevision: result.algorithmRevision,
    isPseudonymized: true,
    sanitizedText: result.anonymizedText,
    appliedCount: result.appliedCount,
    categoryCounts: result.categoryCounts,
    sourceHash: result.sourceHash,
    resultHash: result.resultHash,
    warnings: result.warnings,
  };
}

/**
 * Full DETECT → REVIEW → APPLY orchestration.
 *
 * `approvedCandidateIds` is the explicit human decision. The returned mapping
 * is the ONLY place the reversible original→placeholder correspondence exists.
 */
export function runAnonymization(
  sourceText: string,
  options: AnonymizationOptions,
  approvedCandidateIds: string[],
): {
  result: AnonymizationResult;
  candidates: AnonymizationCandidate[];
  redactions: ApprovedRedaction[];
  mapping: InternalReplacementMapping;
} {
  const { candidates, warnings } = detectCandidates(sourceText, options);
  const approval = createApprovedRedactions(candidates, approvedCandidateIds);
  const allWarnings = [...warnings, ...approval.warnings];
  const applied = applyApprovedRedactions(sourceText, approval.redactions);
  const result = buildResult(
    sourceText,
    applied.anonymizedText,
    applied.appliedCount,
    applied.categoryCounts,
    allWarnings,
  );
  const mapping = buildInternalMapping(sourceText, approval.redactions);
  return { result, candidates, redactions: approval.redactions, mapping };
}