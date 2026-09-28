/**
 * GWO-1 — Funding & Tenders business identity.
 *
 * BUSINESS_IDENTITY_KEY=identifier
 *   The official topic identifier (e.g. "AGRIP-MULTI-2021-IM"). Verified
 *   language-independent: the static topicDetails endpoint returns the same
 *   identifier for language=en|hu|de|fr, and the portal topic-details URL uses
 *   the same identifier. It never depends on observedAt or local ordering.
 *
 * REVISION_SIGNAL=esST_checksum (search records), latestInfos.lastChangeDate (static records)
 *   The authoritative checksum the source stores on each indexed document; for
 *   static topicDetails records the newest authoritative last-change timestamp.
 *
 * IDEMPOTENCY_STRATEGY=source + sourceIdentifier is the stable grouping key;
 *   a language-representation change alone reuses the same identity and is
 *   classified UNCHANGED by the diff layer. No matching logic lives here.
 */

export const SOURCE_NAME = 'EU_FUNDING_TENDERS' as const;

export const TOPIC_DETAILS_URL_PREFIX =
  'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/';

function firstScalar(value: unknown): string | null {
  if (Array.isArray(value)) {
    return firstScalar(value[0]);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return null;
}

/** Stable, language-independent business identifier. Null when absent. */
export function deriveSourceIdentifier(metadata: Record<string, unknown>): string | null {
  const value = firstScalar(metadata['identifier']);
  if (value === null || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

/** Authoritative revision signal from the source record. Null when absent. */
export function deriveRevisionSignal(
  metadata: Record<string, unknown>,
  latestInfos?: readonly { lastChangeDate?: unknown }[],
): string | null {
  const checksum = firstScalar(metadata['esST_checksum']);
  if (checksum !== null && checksum.trim().length > 0) {
    return checksum.trim();
  }
  if (Array.isArray(latestInfos) && latestInfos.length > 0) {
    const lastChange = firstScalar(latestInfos[0]?.lastChangeDate);
    if (lastChange !== null && lastChange.trim().length > 0) {
      return lastChange.trim();
    }
  }
  return null;
}

/** Official portal detail URL for an identifier (the slug is the lowercase identifier). */
export function deriveSourceUrl(identifier: string): string {
  return `${TOPIC_DETAILS_URL_PREFIX}${identifier.toLowerCase()}`;
}
