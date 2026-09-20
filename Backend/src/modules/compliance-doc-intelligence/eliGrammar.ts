/**
 * C5A — pure Hungarian ELI act + subdivision grammar.
 *
 * A database-free, network-free validator that answers, for an ALREADY
 * STRUCTURED identifier:
 *
 *   1. is this Hungarian act reference structurally valid?
 *   2. what type of act is it?
 *   3. how many act-identity segments belong to that type?
 *   4. is this subdivision path structurally valid?
 *   5. is its hierarchy valid?
 *   6. if invalid, which bounded error code explains it?
 *
 * THIS MODULE IS NOT WIRED INTO INGESTION. It changes no runtime contract:
 * C4A `TV/<year>/<act>[/<opaque-tail>]` transport, the `T` input alias, the
 * `ref.adminiculum.hu` wrapper, `canonicalLegalReference.ts`, `anchorKey`,
 * `rowDigest`, CELEX binding and monitoring manifest v1 are all untouched. The
 * locator of an existing canonical reference stays opaque here too: this module
 * never reparses it.
 *
 * POLICY BOUNDARY — this validator only checks identifiers that are ALREADY
 * structured. It never parses visible legal citation text, never converts legacy
 * `5/2/b` or `sec=15/B;par=4`, and never derives `15/A § → art_15a` or
 * `Ptk. 6:59 → art_6:59`. Those are policy decisions for a later integration
 * slice; here `art_6:59` is only checked for syntactic validity when supplied.
 *
 * Every decision comes from `./eliReferenceData`, which records the authoritative
 * source URL and the verification date for each vocabulary.
 */
import {
  ELI_ACT_TYPES,
  ELI_SUBDIVISION_CODES,
  ELI_SUBDIVISION_HIERARCHY_RANK,
  type EliActIdentitySegmentKind,
  type EliActTypeDefinition,
} from './eliReferenceData';

/**
 * The CLOSED C5A error vocabulary. Deliberately distinct from the existing
 * meanings of `MALFORMED_CANONICAL_REFERENCE` and `UNSUPPORTED_ELI`, which
 * remain untouched for the C4A/C4B runtime paths.
 *
 * `ACT_ARITY_MISMATCH` covers the whole act-identity contract: a wrong segment
 * count, a missing or extra segment, or a segment that does not match the
 * positional shape verified for that type.
 */
export type EliGrammarErrorCode =
  | 'UNKNOWN_ACT_TYPE'
  | 'ACT_ARITY_MISMATCH'
  | 'UNKNOWN_SUBDIVISION_CODE'
  | 'MALFORMED_SUBDIVISION_SEGMENT'
  | 'SUBDIVISION_HIERARCHY_VIOLATION'
  | 'SUBDIVISION_TOO_DEEP';

/** The same closed vocabulary as data, for exhaustive review and iteration. */
export const ELI_GRAMMAR_ERROR_CODES: readonly EliGrammarErrorCode[] = [
  'UNKNOWN_ACT_TYPE',
  'ACT_ARITY_MISMATCH',
  'UNKNOWN_SUBDIVISION_CODE',
  'MALFORMED_SUBDIVISION_SEGMENT',
  'SUBDIVISION_HIERARCHY_VIOLATION',
  'SUBDIVISION_TOO_DEEP',
];

/** Maximum number of `/`-separated subdivision segments. */
export const MAX_SUBDIVISION_DEPTH = 6;

/** Bound on one subdivision identifier (transport-safe alphabet below). */
export const MAX_SUBDIVISION_IDENTIFIER_LENGTH = 64;

export interface EliActIdentitySegment {
  kind: EliActIdentitySegmentKind;
  value: string;
}

export interface EliActReference {
  /** Exact, case-sensitive NJT type code, e.g. "TV". */
  typeCode: string;
  /** Act-identity segments in positional order, one per NJT scheme parameter. */
  identitySegments: readonly EliActIdentitySegment[];
  /** The validated reference, whitespace-trimmed and otherwise byte-identical. */
  reference: string;
}

export type EliActReferenceValidation =
  | { valid: true; act: EliActReference }
  | { valid: false; errorCode: EliGrammarErrorCode };

export interface EliSubdivisionSegment {
  /** Verified EU subdivision code, e.g. "art". */
  code: string;
  /** Bounded identifier after `_`, e.g. "6:59"; null for a singleton segment. */
  identifier: string | null;
  /** Bounded structural rank, or null when this code is order-neutral. */
  hierarchyRank: number | null;
}

export interface EliSubdivisionPath {
  segments: readonly EliSubdivisionSegment[];
  /** The validated path, whitespace-trimmed and otherwise byte-identical. */
  path: string;
}

export type EliSubdivisionValidation =
  | { valid: true; subdivision: EliSubdivisionPath }
  | { valid: false; errorCode: EliGrammarErrorCode };

/* ------------------------------------------------------------------ */
/*  Verified vocabularies, resolved once from the data module          */
/* ------------------------------------------------------------------ */

const ACT_TYPE_BY_CODE: ReadonlyMap<string, EliActTypeDefinition> = new Map(
  ELI_ACT_TYPES.map((definition) => [definition.code, definition]),
);

const SUBDIVISION_CODE_SET: ReadonlySet<string> = new Set(ELI_SUBDIVISION_CODES);

/** Characters accepted in the source token, per the act-identity shapes. */
const YEAR_SEGMENT = /^\d{4}$/;
const SERIAL_SEGMENT = /^\d{1,12}$/;
/** NJT issuer abbreviation (`{kib}`), e.g. `IM`, `KORM`; shape only, not a closed list. */
const ISSUER_SEGMENT = /^[A-Z][A-Z0-9]{0,7}$/;
/** NJT KSH settlement code (`{orkib}`), e.g. `735616`; shape only, not a closed list. */
const MUNICIPALITY_SEGMENT = /^\d{1,9}$/;

/**
 * One subdivision segment: exactly three lowercase code letters, then an
 * optional `_<identifier>`. The identifier alphabet mirrors the transport-safe
 * opaque alphabet of C4A so `6:59` is admissible, while a fourth code letter, an
 * empty segment or an uppercase code is MALFORMED rather than repaired.
 */
const SUBDIVISION_SEGMENT = /^([a-z]{3})(?:_([A-Za-z0-9._+:-]{1,64}))?$/;

function matchesKind(kind: EliActIdentitySegmentKind, value: string): boolean {
  switch (kind) {
    case 'year':
      return YEAR_SEGMENT.test(value);
    case 'serial':
      return SERIAL_SEGMENT.test(value);
    case 'issuer':
      return ISSUER_SEGMENT.test(value);
    case 'municipality':
      return MUNICIPALITY_SEGMENT.test(value);
    default:
      return false;
  }
}

const invalidAct = (errorCode: EliGrammarErrorCode): EliActReferenceValidation => ({ valid: false, errorCode });
const invalidSubdivision = (errorCode: EliGrammarErrorCode): EliSubdivisionValidation => ({ valid: false, errorCode });

/* ------------------------------------------------------------------ */
/*  Vocabulary queries                                                 */
/* ------------------------------------------------------------------ */

/** True when the exact, case-sensitive token is a verified NJT act type code. */
export function isKnownEliActType(code: string | null | undefined): boolean {
  return typeof code === 'string' && ACT_TYPE_BY_CODE.has(code);
}

/** The verified definition for an act type code, or null. Read-only data. */
export function getEliActTypeDefinition(code: string | null | undefined): EliActTypeDefinition | null {
  if (typeof code !== 'string') return null;
  return ACT_TYPE_BY_CODE.get(code) ?? null;
}

/** True when the lowercase token is a verified EU subdivision code. */
export function isKnownEliSubdivisionCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && SUBDIVISION_CODE_SET.has(code);
}

/* ------------------------------------------------------------------ */
/*  Act reference grammar                                              */
/* ------------------------------------------------------------------ */

/**
 * Validate one already-structured Hungarian ELI act reference, e.g.
 * `TV/2001/108`, `R/2016/IM/21`, `OR/1992/735616/5` or `Alaptv`.
 *
 * The type must be a verified NJT code and the reference must carry EXACTLY the
 * positional identity segments proven for that type: an extra or missing segment
 * is never accepted and never silently dropped. Nothing is transformed — the
 * returned `reference` is byte-identical to the trimmed input.
 */
export function validateEliActReference(value: string | null | undefined): EliActReferenceValidation {
  if (typeof value !== 'string') return invalidAct('UNKNOWN_ACT_TYPE');
  const trimmed = value.trim();
  if (!trimmed) return invalidAct('UNKNOWN_ACT_TYPE');
  // A reference is a path identity: no whitespace, query or fragment is valid.
  if (/[\s?#]/.test(trimmed)) return invalidAct('ACT_ARITY_MISMATCH');

  const segments = trimmed.split('/');
  const typeCode = segments[0];
  const definition = ACT_TYPE_BY_CODE.get(typeCode);
  if (!definition) return invalidAct('UNKNOWN_ACT_TYPE');

  const identityTokens = segments.slice(1);
  if (identityTokens.length !== definition.identitySegments.length) return invalidAct('ACT_ARITY_MISMATCH');

  const identitySegments: EliActIdentitySegment[] = [];
  for (let index = 0; index < identityTokens.length; index += 1) {
    const kind = definition.identitySegments[index];
    const token = identityTokens[index];
    if (!matchesKind(kind, token)) return invalidAct('ACT_ARITY_MISMATCH');
    identitySegments.push({ kind, value: token });
  }

  return {
    valid: true,
    act: { typeCode, identitySegments, reference: trimmed },
  };
}

/* ------------------------------------------------------------------ */
/*  Subdivision grammar                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate one already-structured ELI subdivision path, e.g. `art_5`,
 * `art_5/par_2/pnt_b` or `art_6:59`.
 *
 * Each segment is `<3-letter-lowercase-code>[_<bounded-identifier>]`; the code
 * must be in the verified EU subdivision vocabulary; the path may not exceed
 * `MAX_SUBDIVISION_DEPTH` segments; and the structural hierarchy ranks must be
 * strictly increasing. An identifier-less segment (e.g. a preamble singleton) is
 * admitted by the optional-identifier form — it is never repaired or expanded.
 */
export function validateEliSubdivisionPath(value: string | null | undefined): EliSubdivisionValidation {
  if (typeof value !== 'string') return invalidSubdivision('MALFORMED_SUBDIVISION_SEGMENT');
  const trimmed = value.trim();
  if (!trimmed) return invalidSubdivision('MALFORMED_SUBDIVISION_SEGMENT');
  // A path is a path identity: no whitespace, query or fragment is valid.
  if (/[\s?#]/.test(trimmed)) return invalidSubdivision('MALFORMED_SUBDIVISION_SEGMENT');

  const rawSegments = trimmed.split('/');
  if (rawSegments.length > MAX_SUBDIVISION_DEPTH) return invalidSubdivision('SUBDIVISION_TOO_DEEP');

  const segments: EliSubdivisionSegment[] = [];
  let previousRank: number | null = null;

  for (const raw of rawSegments) {
    const match = SUBDIVISION_SEGMENT.exec(raw);
    if (!match) return invalidSubdivision('MALFORMED_SUBDIVISION_SEGMENT');

    const code = match[1];
    if (!SUBDIVISION_CODE_SET.has(code)) return invalidSubdivision('UNKNOWN_SUBDIVISION_CODE');

    const rank = ELI_SUBDIVISION_HIERARCHY_RANK[code];
    const hierarchyRank = typeof rank === 'number' ? rank : null;
    // A ranked parent must never appear after a ranked child. Unranked (known)
    // codes are order-neutral and impose no constraint.
    if (hierarchyRank !== null && previousRank !== null && hierarchyRank <= previousRank) {
      return invalidSubdivision('SUBDIVISION_HIERARCHY_VIOLATION');
    }
    if (hierarchyRank !== null) previousRank = hierarchyRank;

    segments.push({ code, identifier: match[2] ?? null, hierarchyRank });
  }

  return { valid: true, subdivision: { segments, path: trimmed } };
}
