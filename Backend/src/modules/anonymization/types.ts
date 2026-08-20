/**
 * Anonymization foundation — core typed contract (ANONYMIZATION-FOUNDATION-1).
 *
 * These types are the small, explicit internal contract the whole module is
 * built around. Everything is expressed in terms of these shapes so that
 * future integration seams (external AI work package, Contract Workspace)
 * can depend on a stable surface without reaching into detector or
 * normalization internals.
 *
 * Terminology is used deliberately and honestly:
 *
 * - ANONYMIZATION  — replacement that is NOT safely reversible (value discarded).
 * - PSEUDONYMIZATION — replacement with a stable placeholder that CAN be mapped
 *   back through a confidential in-memory mapping. This module implements
 *   pseudonymization; it never claims irreversible anonymization.
 *
 * Offsets are always character offsets into the ORIGINAL source text, expressed
 * in JavaScript string code units (UTF-16), which is the only offset space a
 * plain `string` slice can be applied against. All replacements are applied
 * against those stable source offsets from right to left, so earlier offsets are
 * never invalidated by later edits.
 */

/** Revision of the deterministic algorithm. Bump when output changes for equal input. */
export const ANONYMIZATION_ALGORITHM_REVISION = 1;

/**
 * Hard, fail-closed guard against pathological inputs. `detectCandidates`
 * (and therefore `runAnonymization`) throws `AnonymizationInputTooLargeError`
 * when the source exceeds this many UTF-16 code units, rather than emitting a
 * partially-anonymized document. Sized generously so real legal documents pass.
 */
export const MAX_INPUT_CHARS = 2_000_000;

export type SensitiveCategory =
  | 'EMAIL'
  | 'PHONE'
  | 'IBAN'
  | 'TAX_ID'
  | 'IDENTIFIER'
  | 'ADDRESS'
  | 'PERSON'
  | 'ORGANIZATION'
  | 'PROJECT'
  | 'BUSINESS_SECRET'
  | 'OTHER_SENSITIVE';

/** Stable identifiers of the deterministic detectors. */
export type DetectorName =
  | 'email'
  | 'phone'
  | 'iban'
  | 'tax-number'
  | 'eu-vat'
  | 'company-registry'
  | 'exact-term';

export type CandidateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * One detected span in the source text that MAY be sensitive.
 *
 * Detection is conservative: candidates are REVIEWABLE, never automatically
 * applied. A human decides which candidates are approved for replacement.
 */
export interface AnonymizationCandidate {
  /** Stable id referenced by approvals, e.g. `cand-1`, `cand-2`. */
  id: string;
  type: SensitiveCategory;
  /** Inclusive start offset into the source text (UTF-16 code units). */
  start: number;
  /** Exclusive end offset into the source text. */
  end: number;
  /** Exact text found at [start, end) in the source. */
  originalText: string;
  /** Placeholder proposed by the detector/plan builder for review purposes. */
  proposedReplacement: string;
  detector: DetectorName;
  confidence: CandidateConfidence;
  /** Optional human-readable hint for the reviewer (no secret content). */
  note?: string;
  /** Internal ordering weight used for deterministic overlap resolution. */
  precedence: number;
}

/**
 * A redaction the reviewer explicitly approved. Only these are applied.
 * Unapproved candidates are never applied and leave the text unchanged.
 */
export interface ApprovedRedaction {
  start: number;
  end: number;
  type: SensitiveCategory;
  replacement: string;
}

/** A user-supplied sensitive term the workflow wants treated as a candidate. */
export interface ManualSensitiveTerm {
  term: string;
  category: SensitiveCategory;
}

export interface AnonymizationOptions {
  /** Manual exact terms. These are the primary Phase-1 input for names etc. */
  manualTerms: ManualSensitiveTerm[];
  /** Restrict which deterministic detectors run. Defaults to all. */
  enabledDetectors?: DetectorName[];
  /** Match manual terms case-insensitively. Default true. */
  caseInsensitiveExactTerms?: boolean;
  /** Match manual terms ignoring Hungarian/Unicode diacritics. Default true. */
  diacriticInsensitiveExactTerms?: boolean;
  /** Require manual-term matches to be whole words (not embedded in a larger word). Default true. */
  exactTermsWholeWords?: boolean;
  /** Manual terms shorter than this are ignored with a warning. Default 2. */
  minTermLength?: number;
}

export interface CategoryCounts {
  [category: string]: number;
}

/**
 * The safe result. Contains ONLY sanitized content and non-content metadata.
 *
 * Deliberately does NOT contain:
 * - original sensitive values
 * - original → replacement mapping
 * - any reversible information
 */
export interface AnonymizationResult {
  algorithmRevision: number;
  /** Always true for this module: placeholders, not irreversible removal. */
  isPseudonymized: boolean;
  anonymizedText: string;
  appliedCount: number;
  categoryCounts: CategoryCounts;
  /** sha256 of the source text — lets callers verify which source produced this. */
  sourceHash: string;
  /** sha256 of the anonymized text — deterministic for identical input. */
  resultHash: string;
  warnings: string[];
  /** Marker so callers can prove the mapping was never persisted or exported. */
  mappingLocation: 'in-memory-only';
}

/**
 * The confidential internal mapping. Kept strictly separate from the safe
 * result. For this foundation it lives only inside the in-memory operation
 * result and is never persisted or included in the safe export object.
 */
export interface InternalReplacementMapping {
  mapping: Array<{
    category: SensitiveCategory;
    original: string;
    replacement: string;
  }>;
}

/**
 * Safe external-work-package export object.
 *
 * What a future ExternalAiWorkPackage / Contract Workspace integration may
 * ship out of the canonical environment. It contains only the sanitized text
 * and metadata — never the reversible mapping and never original values.
 */
export interface SanitizedExternalPackage {
  contentType: 'anonymized-work-package';
  schemaVersion: 1;
  algorithmRevision: number;
  isPseudonymized: true;
  sanitizedText: string;
  appliedCount: number;
  categoryCounts: CategoryCounts;
  sourceHash: string;
  resultHash: string;
  warnings: string[];
}