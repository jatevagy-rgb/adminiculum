/**
 * C4A — canonical Adminiculum legal reference (hyperlinked transport).
 *
 * A compliance master row may carry a Word hyperlink whose TARGET is a
 * deterministic machine identity, e.g.
 *
 *   visible text : Eker. tv. 5. § (2) b) pont
 *   target       : TV/2001/108/5/2/b
 *
 * This module recognises exactly these target spellings and normalizes them to
 * ONE canonical reference:
 *
 *   1. TV/<year>/<act-number>[/<opaque-locator-tail>]
 *   2. T/<year>/<act-number>[/<opaque-locator-tail>]      (Peter transport alias)
 *   3. https://ref.adminiculum.hu/TV/<year>/<act-number>[/<opaque-locator-tail>]
 *   4. https://ref.adminiculum.hu/T/<year>/<act-number>[/<opaque-locator-tail>]
 *
 * The `T/` form is an INPUT TRANSPORT ALIAS only: it is normalized to the
 * existing canonical `TV/...` namespace, so nothing downstream (anchor keys,
 * C4B `identifierFamily = TV`, NJT ELI deduplication, monitoring manifest
 * schemaVersion 1) changes and `T` is never persisted.
 *
 * Deliberately out of scope (must NOT be guessed or interpreted):
 * - the locator tail is OPAQUE. A segment is never interpreted as a section,
 *   paragraph or point, and legal notation such as `15/A` or `6:59` is never
 *   rewritten into another syntax;
 * - the visible hyperlink text is never parsed. Only the structural target is
 *   read, and a human-readable citation such as `Ptk. 6:59. § (2)` never becomes
 *   an identity.
 *
 * Anything that is not an exact canonical reference returns null: an ordinary
 * hyperlink (https://example.com/foo) stays ordinary document content.
 */

/** Canonical internal source prefix. Exact, case-sensitive. */
export const CANONICAL_LEGAL_REFERENCE_SOURCE = 'TV';

/**
 * Accepted transport source prefixes, normalized to the canonical source.
 * `T` is Peter's external transport alias; it never reaches persisted keys.
 */
export const TRANSPORT_SOURCE_ALIASES: readonly string[] = ['TV', 'T'];

/** Peter's external transport prefix (input alias only). */
export const PETER_LEGAL_REFERENCE_SOURCE = 'T';

/** Machine transport host. It is NOT the official source of the law. */
export const REF_ADMINICULUM_HOST = 'ref.adminiculum.hu';

/** Wrapper accepted on top of the canonical path. */
export const REF_ADMINICULUM_URL_PREFIX = `https://${REF_ADMINICULUM_HOST}/`;

/** Prefix of the derived monitoring anchor key for this transport. */
export const CANONICAL_REFERENCE_ANCHOR_KEY_PREFIX = 'LEGAL|REF=';

/** Bound on the normalized reference (structural segments only). */
export const MAX_CANONICAL_REFERENCE_LENGTH = 256;

const YEAR_SEGMENT = /^\d{4}$/;
const ACT_NUMBER_SEGMENT = /^\d{1,12}$/;
/**
 * Opaque tail segment: bounded, transport-safe, never interpreted. `:` is part
 * of the opaque alphabet (e.g. `6:59`) and is preserved byte-for-byte; it is
 * never converted into `6-59`, `6/59` or `sec=6:59`.
 */
const LOCATOR_SEGMENT = /^[A-Za-z0-9._+:-]{1,64}$/;

export interface CanonicalLegalReference {
  /** Full normalized reference, e.g. `TV/2001/108/5/2/b`. */
  canonicalReference: string;
  /** Source-level reference, e.g. `TV/2001/108` (no locator). */
  sourceReference: string;
  /** Opaque locator tail, e.g. `5/2/b`; null when the target carries none. */
  locator: string | null;
}

/**
 * Normalize an exact canonical legal reference, or return null.
 *
 * Only the wrapper URL, leading/trailing whitespace and the exact path
 * segmentation required for the `TV/<year>/<act-number>` prefix are normalized.
 * Anything else — another host, a non-numeric year or act number, an empty or
 * over-long segment, a query/fragment, whitespace inside the value — is rejected
 * rather than repaired.
 */
export function parseCanonicalLegalReference(value: string | null | undefined): CanonicalLegalReference | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CANONICAL_REFERENCE_LENGTH) return null;
  // A reference is a path identity: no whitespace, query or fragment is valid.
  if (/[\s?#]/.test(trimmed)) return null;

  // The wrapper is transport syntax; the raw form is used as-is. Any other host
  // (or an arbitrary URL) keeps its scheme in the first segment and is rejected.
  const path = trimmed.startsWith(REF_ADMINICULUM_URL_PREFIX)
    ? trimmed.slice(REF_ADMINICULUM_URL_PREFIX.length)
    : trimmed;

  const segments = path.split('/');
  if (segments.length < 3) return null;
  const [sourceToken, year, actNumber, ...tail] = segments;
  // `TV` and Peter's `T` alias converge to the SAME internal namespace.
  if (!TRANSPORT_SOURCE_ALIASES.includes(sourceToken)) return null;
  if (!YEAR_SEGMENT.test(year) || !ACT_NUMBER_SEGMENT.test(actNumber)) return null;
  if (tail.some((segment) => !LOCATOR_SEGMENT.test(segment))) return null;

  const sourceReference = `${CANONICAL_LEGAL_REFERENCE_SOURCE}/${year}/${actNumber}`;
  const locator = tail.length ? tail.join('/') : null;
  return {
    canonicalReference: locator ? `${sourceReference}/${locator}` : sourceReference,
    sourceReference,
    locator,
  };
}

/**
 * Derive the internal DTO's canonical reference from a persisted anchor key.
 * Only a fully revalidated `LEGAL|REF=<canonicalReference>` key yields a value,
 * so the read model can never present a malformed reference as a valid one.
 */
export function canonicalReferenceFromAnchorKey(anchorKey: string | null | undefined): string | null {
  if (typeof anchorKey !== 'string' || !anchorKey.startsWith(CANONICAL_REFERENCE_ANCHOR_KEY_PREFIX)) return null;
  const candidate = anchorKey.slice(CANONICAL_REFERENCE_ANCHOR_KEY_PREFIX.length);
  const parsed = parseCanonicalLegalReference(candidate);
  return parsed && parsed.canonicalReference === candidate ? parsed.canonicalReference : null;
}
