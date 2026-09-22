/**
 * Truthful resolution of an exact-version text load.
 *
 * The backend version-text endpoint answers HTTP 200 even for a version whose
 * content is unavailable, carrying an empty `text` plus a typed `reasonCode` and
 * a safe, human-readable `unavailableReason`. Request-level failures (404,
 * security-scan block, storage/5xx) surface as thrown API errors instead.
 *
 * These helpers map both shapes to product-level DOM state. Raw backend
 * implementation codes are never rendered; only the endpoint's own safe message
 * or a controlled, format-agnostic fallback is shown.
 */

export const VERSION_TEXT_NO_EXTRACTABLE_TEXT =
  'Ehhez a verzióhoz nem érhető el géppel kinyerhető szöveg.';
export const VERSION_TEXT_REQUEST_FAILED =
  'A szöveges előnézet jelenleg nem tölthető be. A dokumentum és a verzió letöltése továbbra is elérhető.';
export const VERSION_TEXT_VERSION_NOT_FOUND =
  'A kiválasztott verzió szövege nem érhető el.';
export const VERSION_TEXT_SCAN_BLOCKED =
  'A dokumentum biztonsági ellenőrzése még nem engedélyezi a szöveg megnyitását.';

export interface VersionTextLoadOutcome {
  /** Exact version text when usable, otherwise null. */
  text: string | null;
  /** Truthful, product-level reason when no usable text is available. */
  unavailableReason: string | null;
}

/**
 * Interpret an endpoint result. `text` is only accepted when it contains
 * non-whitespace content; otherwise the endpoint's own `unavailableReason` is
 * preferred, falling back to a controlled message. Never invents text.
 */
export function resolveVersionTextLoadOutcome(result: {
  text?: string | null;
  unavailableReason?: string | null;
}): VersionTextLoadOutcome {
  const text = typeof result.text === 'string' ? result.text : '';
  if (text.trim().length > 0) {
    return { text, unavailableReason: null };
  }
  const reason = typeof result.unavailableReason === 'string' && result.unavailableReason.trim().length > 0
    ? result.unavailableReason
    : VERSION_TEXT_NO_EXTRACTABLE_TEXT;
  return { text: null, unavailableReason: reason };
}

/**
 * Map a thrown request error to a controlled, product-level reason. Accepts a
 * structural error (status/code) so it can be tested without the API client.
 */
export function versionTextRequestFailureMessage(
  error: { status?: number; code?: string } | null | undefined,
): string {
  const status = typeof error?.status === 'number' ? error.status : undefined;
  const code = String(error?.code || '').toUpperCase();
  if (code === 'DOCUMENT_SECURITY_SCAN_BLOCKED') return VERSION_TEXT_SCAN_BLOCKED;
  if (status === 404) return VERSION_TEXT_VERSION_NOT_FOUND;
  if (status === undefined || status === 0 || status >= 500) return VERSION_TEXT_REQUEST_FAILED;
  return VERSION_TEXT_REQUEST_FAILED;
}
