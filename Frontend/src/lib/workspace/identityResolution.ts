/**
 * Workspace identity resolution.
 *
 * A requested case/document reference is AUTHORITATIVE. These helpers make two
 * guarantees that the live P1 defects (F-001/F-002) violated:
 *
 *   1. A reference is resolved by an exact match only. A failed lookup returns
 *      `null`; it must never fall back to "first available" / list[0].
 *   2. Case references may be either the canonical `Case.id` (UUID-like OR compact
 *      legacy-looking) or a legacy `caseNumber` alias. The legacy alias scan is
 *      exhaustive across pages, not restricted to an arbitrary first page window.
 *
 * Both id formats are equally valid. Format never implies validity.
 */

export type IdentifiedItem = { id: string };

export type CaseReference = {
  id: string;
  caseNumber?: string | null;
};

export type CaseReferencePage<T extends CaseReference> = {
  data: T[];
  pagination?: { page?: number; total?: number; limit?: number };
};

export type FetchCasePage<T extends CaseReference> = (
  page: number,
  limit: number,
) => Promise<CaseReferencePage<T>>;

/**
 * Reads the requested `documentId` from a raw URL search string (`?a=b` or `a=b`).
 */
export function readDocumentIdFromSearch(search: string | null | undefined): string | null {
  if (!search) return null;
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  if (!normalized) return null;
  const value = new URLSearchParams(normalized).get('documentId');
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The router-provided search param is preferred, but the live location search is
 * used as a fallback so a deep link is never lost on the first client render
 * before the router has hydrated search params. Losing it caused the workspace to
 * silently default-select another document (F-001).
 */
export function resolveRequestedDocumentId(
  searchParamsDocumentId: string | null | undefined,
  locationSearch: string | null | undefined,
): string | null {
  const fromParams = searchParamsDocumentId?.trim();
  if (fromParams) return fromParams;
  return readDocumentIdFromSearch(locationSearch);
}

/**
 * Positional default selection (first available document) is only allowed when the
 * URL does NOT request a specific document. A requested identity must never be
 * replaced by another document.
 */
export function shouldDefaultSelectDocument(
  requestedDocumentId: string | null | undefined,
): boolean {
  return !requestedDocumentId?.trim();
}

/**
 * Exact-match lookup across the loaded ledger groups. Returns `null` when the
 * requested document is not present; it never returns a positional item.
 */
export function findRequestedDocument<T extends IdentifiedItem>(
  requestedDocumentId: string | null | undefined,
  groups: ReadonlyArray<ReadonlyArray<T>>,
): T | null {
  const wanted = requestedDocumentId?.trim();
  if (!wanted) return null;
  for (const group of groups) {
    for (const candidate of group) {
      if (candidate?.id === wanted) return candidate;
    }
  }
  return null;
}

/**
 * True only once loading finished AND an explicitly requested document could not be
 * found. Callers use this to show a truthful unavailable state and to keep the
 * URL untouched, instead of substituting another document.
 */
export function isRequestedDocumentUnresolved(
  requestedDocumentId: string | null | undefined,
  resolutionComplete: boolean,
  matched: unknown,
): boolean {
  return Boolean(requestedDocumentId?.trim()) && resolutionComplete && !matched;
}

/**
 * Resolves a requested case reference (canonical `id` OR legacy `caseNumber`) by
 * scanning case-list pages until the exact reference is found. Returns `null` when
 * no page contains it. It never returns an unrelated/positional case, and it does
 * not depend on an arbitrary first-page window.
 */
export async function findCaseByReference<T extends CaseReference>(
  reference: string,
  fetchPage: FetchCasePage<T>,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<T | null> {
  const wanted = reference?.trim();
  if (!wanted) return null;

  const pageSize = options.pageSize ?? 200;
  const maxPages = options.maxPages ?? 50;
  let page = 1;
  let totalPages = maxPages;

  while (page <= maxPages) {
    const response = await fetchPage(page, pageSize);
    const data = response?.data ?? [];
    const match = data.find((item) => item.id === wanted || item.caseNumber === wanted);
    if (match) return match;

    const total = response?.pagination?.total;
    if (typeof total === 'number') {
      totalPages = Math.min(maxPages, Math.max(1, Math.ceil(total / pageSize)));
      if (page >= totalPages) return null;
    } else if (data.length < pageSize) {
      return null;
    }

    page += 1;
  }

  return null;
}
