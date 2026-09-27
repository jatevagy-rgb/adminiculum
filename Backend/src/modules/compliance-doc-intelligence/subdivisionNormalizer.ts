/**
 * C5B-1 — canonical subdivision normalizer (pure, OPT-IN).
 *
 * This module adds the smallest deterministic subdivision-normalization layer:
 *
 *   - a canonical segment representation that is a structured ARRAY, never a
 *     raw string prefix walk,
 *   - one strict canonical serializer/parser pair (`code_value` segments joined
 *     by `/`; a reserved `/` inside a value is encoded as `%2F`),
 *   - an EU normalization surface that REUSES the C5A validator
 *     (`validateEliSubdivisionPath`) instead of competing with it — the EU
 *     vocabulary, identifier policy and structural ranks all stay C5A data,
 *   - exactly two explicit, opt-in Hungarian input modes:
 *       HU_STRUCTURED_COMPONENTS_V1 — { section, paragraph?, point?, subpoint? }
 *       HU_LEGACY_SLASH_V1         — the approved narrow raw shapes only
 *       (`5`, `5/1`, `5/10`, `5/2/b`, `15/A`, `15/A/1`, `6:114`, `6:114/1`),
 *   - pure hierarchy comparison helpers (EXACT / ANCESTOR / DESCENDANT /
 *     NO_MATCH) with no scoring and no legal conclusion.
 *
 * THE LEGACY PARSER IS NEVER RUN AUTOMATICALLY. Nothing in C4A canonical
 * references, C4C matching, CELEX binding, anchor ingestion, stored locator
 * rows or monitoring manifest v1 calls into this module. Persisted locator
 * strings stay opaque and byte-identical; the canonical parser only accepts
 * already-canonical serialized paths.
 *
 * Fail-closed by construction: an input is either fully normalized or rejected
 * with exactly one closed error code. `5/2/INVALID` never becomes `sec_5/par_2`.
 *
 * Source identity is preserved by segment CODE: EU `art` is NOT Hungarian
 * `sec`, so a cross-source comparison is NO_MATCH by construction. Act identity
 * never appears in `canonicalPath` — C5B does not own legal act identity.
 */
import {
  MAX_SUBDIVISION_DEPTH,
  isKnownEliSubdivisionCode,
  validateEliSubdivisionPath,
  type EliGrammarErrorCode,
} from './eliGrammar';

/* ------------------------------------------------------------------ */
/*  Canonical representation                                           */
/* ------------------------------------------------------------------ */

/**
 * One canonical subdivision segment. `code` is a source-specific level code —
 * `sec`/`par`/`pnt`/`spt` for the Hungarian grammar, or a verified C5A EU code
 * such as `art`/`par`/`pnt`/`anx`. `value` is the decoded identifier, e.g. the
 * inserted section `15/A` or the colon section `6:114`.
 */
export interface CanonicalSubdivisionSegment {
  code: string;
  value: string;
}

/**
 * A canonical subdivision: the deterministic serialization plus the segment
 * array that ALL comparisons and hierarchy decisions are made from.
 */
export interface CanonicalSubdivision {
  canonicalPath: string;
  segments: readonly CanonicalSubdivisionSegment[];
}

/**
 * The CLOSED C5B-1 error vocabulary. Deliberately distinct from the C5A grammar
 * error codes (which remain C5A's contract) and from the C4A runtime meanings
 * of `MALFORMED_CANONICAL_REFERENCE` / `UNSUPPORTED_ELI`.
 *
 * `AMBIGUOUS_LOCATOR` is reserved in C5B-1: every approved input shape has
 * exactly one reading (an inserted `15/A` is consumed by the section, a
 * lowercase point never collides with an uppercase insertion letter), so no v1
 * shape can be ambiguous. The code exists so a later approved grammar can report
 * a genuinely ambiguous locator without inventing a new vocabulary.
 */
export type SubdivisionNormalizationErrorCode =
  | 'UNSUPPORTED_INPUT_FORMAT'
  | 'MALFORMED_INPUT'
  | 'AMBIGUOUS_LOCATOR'
  | 'UNSUPPORTED_IDENTIFIER'
  | 'UNKNOWN_LEVEL'
  | 'INVALID_HIERARCHY'
  | 'NON_CANONICAL_IDENTIFIER';

/** The same closed vocabulary as data, for exhaustive review and iteration. */
export const SUBDIVISION_NORMALIZATION_ERROR_CODES: readonly SubdivisionNormalizationErrorCode[] = [
  'UNSUPPORTED_INPUT_FORMAT',
  'MALFORMED_INPUT',
  'AMBIGUOUS_LOCATOR',
  'UNSUPPORTED_IDENTIFIER',
  'UNKNOWN_LEVEL',
  'INVALID_HIERARCHY',
  'NON_CANONICAL_IDENTIFIER',
];

/** The closed Hungarian subdivision code union supported by C5B-1. */
export type HuSubdivisionCode = 'sec' | 'par' | 'pnt' | 'spt';

/** The Hungarian chain in canonical parent-to-child order. */
export const HU_SUBDIVISION_CODES: readonly HuSubdivisionCode[] = ['sec', 'par', 'pnt', 'spt'];

/** Input contract of the HU_STRUCTURED_COMPONENTS_V1 mode. */
export interface HuStructuredComponents {
  section?: string | null;
  paragraph?: string | null;
  point?: string | null;
  subpoint?: string | null;
}

/**
 * Result contract of every C5B-1 normalizer/parser: fully normalized or one
 * closed error code. No partial success, ever.
 */
export type SubdivisionNormalizationResult =
  | { valid: true; subdivision: CanonicalSubdivision }
  | { valid: false; errorCode: SubdivisionNormalizationErrorCode };

/** Relation of an anchor subdivision to a changed subdivision, same act only. */
export type SubdivisionRelation = 'EXACT' | 'ANCESTOR' | 'DESCENDANT' | 'NO_MATCH';

/** The closed relation vocabulary as data. */
export const SUBDIVISION_RELATIONS: readonly SubdivisionRelation[] = ['EXACT', 'ANCESTOR', 'DESCENDANT', 'NO_MATCH'];

/* ------------------------------------------------------------------ */
/*  Bounded identifier grammar (string validation, no numeric coercion) */
/* ------------------------------------------------------------------ */

/** Canonical positive decimal: no leading zeros, no sign, no bound invented. */
const DECIMAL = /^[1-9]\d*$/;
/** A decimal with a leading zero (`02`) is a valid number but not canonical. */
const LEADING_ZERO = /^0\d+$/;
/** Inserted section: numeric base + exactly one uppercase Latin letter. */
const INSERTED_SECTION = /^[1-9]\d*\/[A-Z]$/;
/** Colon section: both parts canonical positive decimal, colon retained. */
const COLON_SECTION = /^[1-9]\d*:[1-9]\d*$/;
const SINGLE_LOWER_LETTER = /^[a-z]$/;
const SINGLE_UPPER_LETTER = /^[A-Z]$/;
/** Shape used only to diagnose a leading-zero base/suffix as non-canonical. */
const INSERTED_SHAPE = /^([^/]+)\/([^/]+)$/;
const COLON_SHAPE = /^([^:]+):([^:]+)$/;

/**
 * Canonical Hungarian section value. v1 supports a positive decimal (`5`), an
 * inserted section (`15/A`) and — only in the explicit Hungarian modes — a colon
 * section (`6:114`). Ranges, Roman numerals, multiple slash-letter suffixes and
 * lowercase insertion letters are rejected, never repaired.
 */
function sectionValueError(value: string): SubdivisionNormalizationErrorCode | null {
  if (DECIMAL.test(value)) return null;
  if (INSERTED_SECTION.test(value)) return null;
  if (COLON_SECTION.test(value)) return null;

  const inserted = INSERTED_SHAPE.exec(value);
  if (inserted) {
    // A non-canonical numeric base is reported as non-canonical; everything
    // else (lowercase letter, extra slash, `5/2`) is simply unsupported.
    if (paragraphValueError(inserted[1]) === 'NON_CANONICAL_IDENTIFIER') return 'NON_CANONICAL_IDENTIFIER';
    return 'UNSUPPORTED_IDENTIFIER';
  }
  const colon = COLON_SHAPE.exec(value);
  if (colon) {
    if (paragraphValueError(colon[1]) === 'NON_CANONICAL_IDENTIFIER' || paragraphValueError(colon[2]) === 'NON_CANONICAL_IDENTIFIER') {
      return 'NON_CANONICAL_IDENTIFIER';
    }
    return 'UNSUPPORTED_IDENTIFIER';
  }
  if (LEADING_ZERO.test(value)) return 'NON_CANONICAL_IDENTIFIER';
  return 'UNSUPPORTED_IDENTIFIER';
}

/** Canonical paragraph value: positive decimal only. */
function paragraphValueError(value: string): SubdivisionNormalizationErrorCode | null {
  if (DECIMAL.test(value)) return null;
  if (LEADING_ZERO.test(value)) return 'NON_CANONICAL_IDENTIFIER';
  return 'UNSUPPORTED_IDENTIFIER';
}

/** Canonical point value: one lowercase Latin letter or a positive decimal. */
function pointValueError(value: string): SubdivisionNormalizationErrorCode | null {
  if (SINGLE_LOWER_LETTER.test(value)) return null;
  if (DECIMAL.test(value)) return null;
  if (LEADING_ZERO.test(value)) return 'NON_CANONICAL_IDENTIFIER';
  return 'UNSUPPORTED_IDENTIFIER';
}

/**
 * Canonical alpont value, validated against its parent point:
 *  - under a letter point `a`, the subpoint is two lowercase letters whose
 *    first letter equals the parent (`aa`, `ab`, ...);
 *  - under a numeric point, the subpoint is one lowercase letter (`a`).
 * A standalone two-letter token without a parent point is never interpreted.
 */
function subpointValueError(value: string, parentPoint: string | null): SubdivisionNormalizationErrorCode | null {
  if (parentPoint === null || parentPoint.length === 0) return 'INVALID_HIERARCHY';
  if (SINGLE_LOWER_LETTER.test(parentPoint)) {
    const valid = value.length === 2 && value.charAt(0) === parentPoint && SINGLE_LOWER_LETTER.test(value.charAt(1));
    return valid ? null : 'UNSUPPORTED_IDENTIFIER';
  }
  if (DECIMAL.test(parentPoint)) return SINGLE_LOWER_LETTER.test(value) ? null : 'UNSUPPORTED_IDENTIFIER';
  return 'UNSUPPORTED_IDENTIFIER';
}

/** The value rule of one Hungarian level, with its parent value for `spt`. */
function huValueError(code: HuSubdivisionCode, value: string, parentValue: string | null): SubdivisionNormalizationErrorCode | null {
  switch (code) {
    case 'sec':
      return sectionValueError(value);
    case 'par':
      return paragraphValueError(value);
    case 'pnt':
      return pointValueError(value);
    case 'spt':
      return subpointValueError(value, parentValue);
    default:
      return 'UNKNOWN_LEVEL';
  }
}

/* ------------------------------------------------------------------ */
/*  Canonical serialization / construction                             */
/* ------------------------------------------------------------------ */

function isKnownHuSubdivisionCode(code: string): code is HuSubdivisionCode {
  return HU_SUBDIVISION_CODES.includes(code as HuSubdivisionCode);
}

/** A reserved `/` inside a segment value is the only percent-encoded member. */
function encodeSegmentValue(value: string): string {
  return value.replace(/\//g, '%2F');
}

function formatSegment(segment: CanonicalSubdivisionSegment): string {
  return `${segment.code}_${encodeSegmentValue(segment.value)}`;
}

function canonicalResult(segments: readonly CanonicalSubdivisionSegment[]): SubdivisionNormalizationResult {
  const canonicalPath = segments.map(formatSegment).join('/');
  return {
    valid: true,
    subdivision: {
      canonicalPath,
      segments: segments.map((segment) => ({ code: segment.code, value: segment.value })),
    },
  };
}

function invalid(errorCode: SubdivisionNormalizationErrorCode): SubdivisionNormalizationResult {
  return { valid: false, errorCode };
}

/** C5A failures are reused and mapped into the closed C5B vocabulary. */
function mapEliGrammarError(errorCode: EliGrammarErrorCode): SubdivisionNormalizationErrorCode {
  switch (errorCode) {
    case 'UNKNOWN_SUBDIVISION_CODE':
      return 'UNKNOWN_LEVEL';
    case 'SUBDIVISION_HIERARCHY_VIOLATION':
      return 'INVALID_HIERARCHY';
    case 'SUBDIVISION_TOO_DEEP':
      return 'UNSUPPORTED_INPUT_FORMAT';
    case 'MALFORMED_SUBDIVISION_SEGMENT':
    default:
      return 'MALFORMED_INPUT';
  }
}

function buildHuSubdivision(segments: readonly CanonicalSubdivisionSegment[]): SubdivisionNormalizationResult {
  const canonicalSegments: CanonicalSubdivisionSegment[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const expectedCode = HU_SUBDIVISION_CODES[index];
    const segment = segments[index];
    if (segment.code !== expectedCode) return invalid('INVALID_HIERARCHY');
    const parentValue = index > 0 ? segments[index - 1].value : null;
    const errorCode = huValueError(expectedCode, segment.value, parentValue);
    if (errorCode) return invalid(errorCode);
    canonicalSegments.push({ code: segment.code, value: segment.value });
  }
  return canonicalResult(canonicalSegments);
}

function buildEliSubdivision(segments: readonly CanonicalSubdivisionSegment[]): SubdivisionNormalizationResult {
  // Reuse C5A for the whole path: vocabulary, identifier policy, depth and the
  // strictly-increasing structural order all come from the C5A data contract.
  const rawPath = segments.map((segment) => `${segment.code}_${segment.value}`).join('/');
  const validation = validateEliSubdivisionPath(rawPath);
  // NOTE: the repo runs with strictNullChecks off, where a boolean-literal
  // discriminant does not narrow a union; `in` narrowing does.
  if ('errorCode' in validation) return invalid(mapEliGrammarError(validation.errorCode));

  const canonicalSegments: CanonicalSubdivisionSegment[] = [];
  for (const segment of validation.subdivision.segments) {
    if (segment.identifier === null) return invalid('MALFORMED_INPUT');
    canonicalSegments.push({ code: segment.code, value: segment.identifier });
  }
  return canonicalResult(canonicalSegments);
}

/**
 * The single canonical construction path. Validates the segment array (closed
 * HU chain or C5A-EU path), rejects mixed/unknown sources and returns the
 * deterministic serialization. Never repairs: a non-canonical segment array is
 * an error, not a normalized guess.
 */
function buildCanonicalSubdivision(segments: readonly CanonicalSubdivisionSegment[]): SubdivisionNormalizationResult {
  if (!Array.isArray(segments) || segments.length === 0) return invalid('MALFORMED_INPUT');
  if (segments.length > MAX_SUBDIVISION_DEPTH) return invalid('UNSUPPORTED_INPUT_FORMAT');

  const codes: string[] = [];
  for (const segment of segments) {
    if (!segment || typeof segment.code !== 'string' || typeof segment.value !== 'string') return invalid('MALFORMED_INPUT');
    if (segment.code.length === 0 || segment.value.length === 0) return invalid('MALFORMED_INPUT');
    // Raw values never carry whitespace, an escape marker or a query marker.
    if (/[\s%?#]/.test(segment.value)) return invalid('MALFORMED_INPUT');
    codes.push(segment.code);
  }

  const hasHuOnlyCode = codes.some((code) => code === 'sec' || code === 'spt');
  if (hasHuOnlyCode) {
    if (codes.some((code) => !isKnownHuSubdivisionCode(code))) return invalid('MALFORMED_INPUT');
    return buildHuSubdivision(segments);
  }
  if (codes.every((code) => isKnownEliSubdivisionCode(code))) return buildEliSubdivision(segments);
  // Only paths without a Hungarian-only code reach here: every remaining code
  // that is not a verified EU code is an unknown level.
  return invalid('UNKNOWN_LEVEL');
}

/**
 * Strict canonical serializer. Accepts already-canonical segments and returns
 * the deterministic path (`sec_15%2FA/par_1`), or null when the segment array is
 * not canonically serializable (unknown level, bad identifier, mixed source,
 * wrong hierarchy). The serializer never repairs.
 */
export function serializeCanonicalSubdivision(
  segments: readonly CanonicalSubdivisionSegment[] | null | undefined,
): string | null {
  if (!segments) return null;
  const result = buildCanonicalSubdivision(segments);
  return result.valid ? result.subdivision.canonicalPath : null;
}

/* ------------------------------------------------------------------ */
/*  Canonical parser                                                   */
/* ------------------------------------------------------------------ */

interface DecodedCanonicalValue {
  valid: boolean;
  value: string;
  errorCode: SubdivisionNormalizationErrorCode;
}

/**
 * Decode one serialized segment value. Only the reserved member `%2F` (uppercase
 * canonical hex) is a legal escape; `%2f` and every other well-formed escape is
 * an alternate encoding and therefore NON_CANONICAL; a malformed escape is
 * rejected as MALFORMED_INPUT.
 */
function decodeCanonicalValue(raw: string): DecodedCanonicalValue {
  if (!raw.includes('%')) return { valid: true, value: raw, errorCode: 'MALFORMED_INPUT' };

  let value = '';
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw.charAt(index);
    if (character !== '%') {
      value += character;
      continue;
    }
    const hex = raw.slice(index + 1, index + 3);
    if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
      return { valid: false, value: '', errorCode: 'MALFORMED_INPUT' };
    }
    if (hex !== '2F') {
      return { valid: false, value: '', errorCode: 'NON_CANONICAL_IDENTIFIER' };
    }
    value += '/';
    index += 2;
  }
  return { valid: true, value, errorCode: 'MALFORMED_INPUT' };
}

/**
 * Strict canonical parser for serialized subdivision paths. Accepts exactly the
 * canonical serialization (`art_28/par_3/pnt_g`, `sec_15%2FA/par_1`,
 * `sec_6:114`), trims only surrounding transport whitespace, and rejects
 * alternate or malformed encodings. A raw `/` is always a segment boundary; an
 * encoded `%2F` is never a boundary. Source selection is deterministic: any
 * `sec`/`spt` segment selects the Hungarian chain; otherwise the path is read as
 * a C5A EU path (so a shared-code path such as `par_1` keeps its EU reading).
 */
export function parseCanonicalSubdivisionPath(value: string | null | undefined): SubdivisionNormalizationResult {
  if (typeof value !== 'string') return invalid('MALFORMED_INPUT');
  const trimmed = value.trim();
  if (!trimmed) return invalid('MALFORMED_INPUT');
  if (/[\s?#]/.test(trimmed)) return invalid('MALFORMED_INPUT');

  const rawSegments = trimmed.split('/');
  if (rawSegments.some((raw) => raw.length === 0)) return invalid('MALFORMED_INPUT');
  if (rawSegments.length > MAX_SUBDIVISION_DEPTH) return invalid('UNSUPPORTED_INPUT_FORMAT');

  const segments: CanonicalSubdivisionSegment[] = [];
  for (const raw of rawSegments) {
    const separator = raw.indexOf('_');
    if (separator <= 0 || separator === raw.length - 1) return invalid('MALFORMED_INPUT');
    const decoded = decodeCanonicalValue(raw.slice(separator + 1));
    if (!decoded.valid) return invalid(decoded.errorCode);
    segments.push({ code: raw.slice(0, separator), value: decoded.value });
  }
  return buildCanonicalSubdivision(segments);
}

/* ------------------------------------------------------------------ */
/*  EU normalization (C5A-reusing)                                     */
/* ------------------------------------------------------------------ */

/**
 * Normalize an already-valid C5A-compatible EU subdivision path into the
 * canonical segment representation, e.g. `art_28/par_3/pnt_g`. Validation,
 * vocabulary, identifier policy, depth and structural order are executed by
 * C5A; this surface only exposes the canonical parsed form and maps C5A failures
 * into the C5B vocabulary. C5A's vocabulary is never broadened, and no hierarchy
 * rank is assigned to a currently unranked code.
 */
export function normalizeEliSubdivisionPath(value: string | null | undefined): SubdivisionNormalizationResult {
  if (typeof value !== 'string') return invalid('MALFORMED_INPUT');
  const validation = validateEliSubdivisionPath(value);
  if ('errorCode' in validation) return invalid(mapEliGrammarError(validation.errorCode));

  const segments: CanonicalSubdivisionSegment[] = [];
  for (const segment of validation.subdivision.segments) {
    if (segment.identifier === null) return invalid('MALFORMED_INPUT');
    segments.push({ code: segment.code, value: segment.identifier });
  }
  return buildCanonicalSubdivision(segments);
}

/* ------------------------------------------------------------------ */
/*  HU mode 1 — HU_STRUCTURED_COMPONENTS_V1                            */
/* ------------------------------------------------------------------ */

/**
 * Normalize the preferred future Structured-components input:
 *
 *   { section: "5", paragraph: "2", point: "b", subpoint: "aa" }
 *
 * Semantic parent presence is validated: a paragraph without a section, a point
 * without a paragraph and a subpoint without a point are INVALID_HIERARCHY. Empty
 * or omitted optional components are treated as absent (a lower precision, never
 * a guess); all other failures are reported with one closed error code.
 */
export function normalizeHuStructuredComponents(input: HuStructuredComponents | null | undefined): SubdivisionNormalizationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('MALFORMED_INPUT');

  const fields = [input.section, input.paragraph, input.point, input.subpoint];
  const values: (string | null)[] = [null, null, null, null];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === undefined || field === null) continue;
    if (typeof field !== 'string') return invalid('MALFORMED_INPUT');
    const trimmed = field.trim();
    if (trimmed.length === 0) continue;
    values[index] = trimmed;
  }

  if (values.every((value) => value === null)) return invalid('MALFORMED_INPUT');
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== null && values[index - 1] === null) return invalid('INVALID_HIERARCHY');
  }

  const segments: CanonicalSubdivisionSegment[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null) continue;
    const code = HU_SUBDIVISION_CODES[index];
    const parentValue = index > 0 ? values[index - 1] : null;
    const errorCode = huValueError(code, value, parentValue);
    if (errorCode) return invalid(errorCode);
    segments.push({ code, value });
  }
  return buildCanonicalSubdivision(segments);
}

/* ------------------------------------------------------------------ */
/*  HU mode 2 — HU_LEGACY_SLASH_V1                                     */
/* ------------------------------------------------------------------ */

/**
 * Explicit parser for the approved narrow Hungarian slash shapes only:
 *
 *   `5` → sec_5            `15/A` → sec_15%2FA
 *   `5/1` → sec_5/par_1    `15/A/1` → sec_15%2FA/par_1
 *   `5/10` → sec_5/par_10  `6:114` → sec_6:114
 *   `5/2/b` → sec_5/par_2/pnt_b
 *
 * A slash after the numeric section base followed by exactly one uppercase Latin
 * letter belongs to the SECTION identity (`15/A`); it is never parsed as
 * `sec_15` plus a child `A`. Typed semicolon locators (`sec=15/B;par=4`) remain
 * opaque and unsupported. THIS PARSER IS OPT-IN ONLY and must never be applied
 * automatically to persisted locator values.
 */
export function parseHuLegacySlashLocator(value: string | null | undefined): SubdivisionNormalizationResult {
  if (typeof value !== 'string') return invalid('MALFORMED_INPUT');
  const trimmed = value.trim();
  if (!trimmed) return invalid('MALFORMED_INPUT');
  if (/[\s?#]/.test(trimmed)) return invalid('MALFORMED_INPUT');
  if (/[=;]/.test(trimmed)) return invalid('UNSUPPORTED_INPUT_FORMAT');

  const rawTokens = trimmed.split('/');
  if (rawTokens.some((token) => token.length === 0)) return invalid('MALFORMED_INPUT');

  const [firstToken, secondToken] = rawTokens;
  const hasInsertedSection =
    secondToken !== undefined && SINGLE_UPPER_LETTER.test(secondToken) && DECIMAL.test(firstToken);
  const sectionValue = hasInsertedSection ? `${firstToken}/${secondToken}` : firstToken;
  const childTokens = rawTokens.slice(hasInsertedSection ? 2 : 1);
  if (childTokens.length > HU_SUBDIVISION_CODES.length - 1) return invalid('UNSUPPORTED_INPUT_FORMAT');

  const sectionError = sectionValueError(sectionValue);
  if (sectionError) return invalid(sectionError);

  const values: (string | null)[] = [sectionValue, null, null, null];
  const childLevels: readonly HuSubdivisionCode[] = ['par', 'pnt', 'spt'];
  for (let index = 0; index < childTokens.length; index += 1) {
    const level = childLevels[index];
    const token = childTokens[index];
    if (level === 'par') {
      // A single lowercase letter here is a valid point identifier: the
      // paragraph parent is missing, so this is a hierarchy problem, not an
      // unsupported point value.
      if (SINGLE_LOWER_LETTER.test(token)) return invalid('INVALID_HIERARCHY');
    }
    const parentValue = level === 'spt' ? values[2] : null;
    const errorCode = huValueError(level, token, parentValue);
    if (errorCode) return invalid(errorCode);
    values[index + 1] = token;
  }

  const segments: CanonicalSubdivisionSegment[] = [{ code: 'sec', value: sectionValue }];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value !== null) segments.push({ code: HU_SUBDIVISION_CODES[index], value });
  }
  return buildCanonicalSubdivision(segments);
}

/* ------------------------------------------------------------------ */
/*  Pure hierarchy helpers (same-act paths only)                       */
/* ------------------------------------------------------------------ */

/**
 * Compare two canonical subdivisions OF THE SAME LEGAL ACT by their parsed
 * segment arrays — never by encoded string prefixes. Returns the relation of the
 * ANCHOR to the CHANGE:
 *
 *   same segments                    → EXACT
 *   anchor is a complete prefix      → ANCESTOR   (anchor covers the change)
 *   change is a complete prefix      → DESCENDANT (anchor is inside the change)
 *   any other case (incl. siblings)  → NO_MATCH
 *
 * No scoring, no legal conclusion, and no cross-source matching: EU `art` never
 * matches Hungarian `sec` because the codes differ.
 */
export function compareCanonicalSubdivisions(anchor: CanonicalSubdivision, change: CanonicalSubdivision): SubdivisionRelation {
  const anchorSegments = anchor.segments;
  const changeSegments = change.segments;
  const sharedLength = Math.min(anchorSegments.length, changeSegments.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const anchorSegment = anchorSegments[index];
    const changeSegment = changeSegments[index];
    if (anchorSegment.code !== changeSegment.code || anchorSegment.value !== changeSegment.value) return 'NO_MATCH';
  }
  if (anchorSegments.length === changeSegments.length) return 'EXACT';
  return anchorSegments.length < changeSegments.length ? 'ANCESTOR' : 'DESCENDANT';
}
