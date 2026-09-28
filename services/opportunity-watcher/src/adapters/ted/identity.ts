/**
 * GWO-2 — TED business identity.
 *
 * BUSINESS_IDENTITY_KEY=procedure-identifier + identifier-lot (per actionable scope)
 *   A publication/notice is source history; the actionable scope is the
 *   procedure + lot. One multi-lot notice therefore emits one normalized
 *   opportunity per lot. When a notice has no lot, an explicit procedure-level
 *   scope is used (`@procedure` marker); `LOT-0` is never fabricated.
 *
 * REVISION_IDENTITY=publication-number + notice-version (BT-701 / BT-757)
 *   A new notice version is a revision of the same stable scope, never a new
 *   opportunity. Change/corrigendum relations (BT-758, change-reason-code)
 *   are preserved in bounded source metadata.
 *
 * Identity never depends on title, translated title, fetch timestamp, or
 * notice version. No matching logic lives here.
 */

function scalarString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export interface NoticeIdentity {
  publicationNumber: string | null;
  noticeVersion: number | null;
  noticeType: string | null;
}

export function deriveNoticeIdentity(notice: Record<string, unknown>): NoticeIdentity {
  const versionRaw = notice['notice-version'];
  return {
    publicationNumber: scalarString(notice['publication-number']),
    noticeVersion: typeof versionRaw === 'number' && Number.isFinite(versionRaw) ? versionRaw : null,
    noticeType: scalarString(notice['notice-type']),
  };
}

export function deriveProcedureIdentifier(notice: Record<string, unknown>): string | null {
  return scalarString(notice['procedure-identifier']);
}

/**
 * Lot identifiers in source order. Positions are preserved: an empty/invalid
 * entry stays as null so the normalizer can reject that lot independently and
 * per-lot arrays remain index-aligned. Empty when the notice is lot-less.
 */
export function deriveLotIdentifiers(notice: Record<string, unknown>): (string | null)[] {
  const raw = notice['identifier-lot'];
  if (!Array.isArray(raw)) {
    const single = scalarString(raw);
    return single !== null ? [single] : [];
  }
  return raw.map((entry) => scalarString(entry));
}

export const PROCEDURE_SCOPE_MARKER = '@procedure';

/** Stable, language-independent scope identifier (procedure + lot or procedure-level). */
export function deriveScopeIdentifier(procedureIdentifier: string, lotIdentifier: string | null): string {
  const lot = lotIdentifier !== null && lotIdentifier.trim().length > 0 ? lotIdentifier.trim() : PROCEDURE_SCOPE_MARKER;
  return `${procedureIdentifier}::${lot}`;
}

/** Authoritative notice/version revision identity. Null when unavailable. */
export function deriveRevisionIdentity(identity: NoticeIdentity): string | null {
  if (identity.publicationNumber === null || identity.noticeVersion === null) {
    return null;
  }
  return `${identity.publicationNumber}::v${identity.noticeVersion}`;
}

const URL_LANG_PREFERENCE = ['ENG', 'HUN'] as const;

/** Official TED notice URL; falls back to the canonical EN detail URL. */
export function deriveSourceUrl(notice: Record<string, unknown>, publicationNumber: string | null): string | null {
  const links = notice['links'];
  if (links !== null && typeof links === 'object' && !Array.isArray(links)) {
    const html = (links as Record<string, unknown>)['html'];
    if (html !== null && typeof html === 'object' && !Array.isArray(html)) {
      const htmlMap = html as Record<string, unknown>;
      for (const lang of URL_LANG_PREFERENCE) {
        const url = scalarString(htmlMap[lang]);
        if (url !== null) return url;
      }
      const first = Object.keys(htmlMap).sort()[0];
      const fallback = first !== undefined ? scalarString(htmlMap[first]) : null;
      if (fallback !== null) return fallback;
    }
  }
  if (publicationNumber === null) return null;
  return `https://ted.europa.eu/en/notice/-/detail/${publicationNumber}`;
}
