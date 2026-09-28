/**
 * GWO-2 — TED Search API request layer.
 *
 * Official endpoint: POST https://api.ted.europa.eu/v3/notices/search
 * Published notices only; no authentication; pagination mode only; bounded
 * single page with an explicit field projection (limit <= 10).
 *
 * Live evidence (captured 2026-09-27): HTTP 200 with envelope
 * { notices: [...], totalNoticeCount, iterationNextToken, timedOut };
 * notice fields are keyed by their official expert-search slugs and are
 * omitted when absent; multilingual text fields are { lang3: [strings] } maps.
 *
 * No normalization logic and no customer/client/case fields live here.
 */

export const TED_SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 10;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_SINCE_DAYS = 30;

/**
 * Bounded explicit field projection. All names verified against the official
 * TED field list and a live request (2026-09-27).
 */
export const TED_DISCOVERY_FIELDS = [
  'publication-number',
  'notice-version',
  'notice-type',
  'notice-title',
  'procedure-identifier',
  'identifier-lot',
  'publication-date',
  'buyer-name',
  'deadline-receipt-tender-date-lot',
  'classification-cpv',
  'place-of-performance',
  'place-of-performance-country-lot',
  'estimated-value-lot',
  'estimated-value-cur-lot',
  'sme-lot',
  'BT-821-Lot',
  'BT-758-notice',
  'change-reason-code',
] as const;

export interface TedSearchOptions {
  /** Expert query; default `publication-date >= <sinceDate>`. */
  query?: string;
  /** YYYYMMDD lower bound for the default query. Default: 30 days before now. */
  sinceDate?: string;
  limit?: number;
  page?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Overridable for deterministic tests; defaults to the official endpoint. */
  url?: string;
  now?: Date;
}

export interface TedSearchEnvelope {
  notices: Record<string, unknown>[];
  totalNoticeCount: number | null;
  iterationNextToken: string | null;
  timedOut: boolean;
}

export type TedRequestErrorCode =
  | 'INVALID_ARGUMENT'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SIZE_EXCEEDED'
  | 'MALFORMED_RESPONSE';

export class TedRequestError extends Error {
  readonly code: TedRequestErrorCode;
  readonly status: number | null;

  constructor(code: TedRequestErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'TedRequestError';
    this.code = code;
    this.status = status;
  }
}

const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatSinceDate(now: Date, days = DEFAULT_SINCE_DAYS): string {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const year = since.getUTCFullYear();
  const month = String(since.getUTCMonth() + 1).padStart(2, '0');
  const day = String(since.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/** Bounded procurement discovery query (expert search syntax). */
export function buildTedDiscoveryQuery(sinceDate: string): string {
  return `publication-date >= ${sinceDate}`;
}

export function buildTedRequestBody(options: TedSearchOptions = {}): Record<string, unknown> {
  const now = options.now ?? new Date();
  const sinceDate = options.sinceDate ?? formatSinceDate(now);
  return {
    query: options.query ?? buildTedDiscoveryQuery(sinceDate),
    fields: [...TED_DISCOVERY_FIELDS],
    page: options.page ?? 1,
    limit: options.limit ?? DEFAULT_LIMIT,
    paginationMode: 'PAGE_NUMBER',
  };
}

function parseEnvelope(text: string): TedSearchEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TedRequestError('MALFORMED_RESPONSE', 'TED response is not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TedRequestError('MALFORMED_RESPONSE', 'TED response is not a JSON object.');
  }
  const row = parsed as Record<string, unknown>;
  const rawNotices = Array.isArray(row['notices']) ? row['notices'] : [];
  const notices = rawNotices.filter(
    (entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object' && !Array.isArray(entry),
  );
  return {
    notices,
    totalNoticeCount: typeof row['totalNoticeCount'] === 'number' ? row['totalNoticeCount'] : null,
    iterationNextToken: typeof row['iterationNextToken'] === 'string' ? row['iterationNextToken'] : null,
    timedOut: row['timedOut'] === true,
  };
}

/**
 * One bounded search execution. Transient failures (network, timeout,
 * 408/429/5xx) are retried with exponential backoff; other 4xx fail
 * immediately. Never sends any customer/client/case data.
 */
export async function executeTedSearch(options: TedSearchOptions = {}): Promise<TedSearchEnvelope> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const page = options.page ?? 1;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new TedRequestError('INVALID_ARGUMENT', `limit must be an integer in [1, ${MAX_LIMIT}].`);
  }
  if (page !== 1) {
    throw new TedRequestError('INVALID_ARGUMENT', 'GWO-2 performs a single bounded page (page must be 1).');
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const body = JSON.stringify(buildTedRequestBody(options));

  let lastError: TedRequestError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      await sleep(1000 * 2 ** (attempt - 1));
    }
    try {
      const response = await fetch(options.url ?? TED_SEARCH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': 'adminiculum-opportunity-watcher/0.1 (bounded manual dry-run; internal)',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const declaredLength = Number(response.headers.get('content-length') ?? '0');
      if (declaredLength > MAX_RESPONSE_BYTES) {
        throw new TedRequestError('SIZE_EXCEEDED', 'TED response exceeds the bounded size limit.');
      }
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new TedRequestError('SIZE_EXCEEDED', 'TED response exceeds the bounded size limit.');
      }
      if (!response.ok) {
        const err = new TedRequestError('HTTP_ERROR', `TED request failed with HTTP ${response.status}.`, response.status);
        lastError = err;
        if (RETRYABLE_HTTP.has(response.status)) {
          continue;
        }
        throw err;
      }
      return parseEnvelope(text);
    } catch (error) {
      if (error instanceof TedRequestError) {
        if (error.code === 'HTTP_ERROR' && error.status !== null && RETRYABLE_HTTP.has(error.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }
      const name = error instanceof Error ? error.name : 'Unknown';
      if (name === 'TimeoutError' || name === 'AbortError') {
        lastError = new TedRequestError('TIMEOUT', `TED request timed out after ${timeoutMs} ms.`);
        continue;
      }
      lastError = new TedRequestError('NETWORK_ERROR', 'TED request failed: network error.');
      continue;
    }
  }
  throw lastError ?? new TedRequestError('NETWORK_ERROR', 'TED request failed after all retry attempts.');
}
