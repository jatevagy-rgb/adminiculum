/**
 * GWO-1 — Funding & Tenders request layer.
 *
 * Only the official search endpoint construction, a bounded POST request,
 * timeout, and bounded transient retry live here. No normalization logic and
 * absolutely no customer/client/case fields.
 *
 * Live evidence (captured 2026-09-27):
 * - endpoint requires a `text` request parameter (HTTP 400 "Required request
 *   parameter 'text' for method parameter type String is not present" without it);
 * - form-urlencoded POST with text/pageSize/pageNumber returns HTTP 200 with
 *   an envelope { apiVersion, terms, totalResults, pageNumber, pageSize, sort,
 *   results: [...] }.
 * - Topic-scoped query parameters were not re-verified because the live-request
 *   budget of this run is exhausted; normalization fails closed for records
 *   without a stable topic identifier.
 */

export const FUNDING_TENDERS_SEARCH_URL =
  'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export interface SearchRequestOptions {
  /** Full-text query. Empty string returns unfiltered portal content. */
  text?: string;
  pageSize?: number;
  pageNumber?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Overridable for deterministic tests; defaults to the official endpoint. */
  url?: string;
}

export interface SearchResultEntry {
  reference: string;
  url: string | null;
  contentType: string | null;
  language: string | null;
  databaseLabel: string | null;
  summary: string | null;
  content: string | null;
  checksum: string | null;
  /** ES-stored document metadata (values are scalars or arrays). */
  metadata: Record<string, unknown>;
}

export interface SearchResponseEnvelope {
  apiVersion: string;
  terms: string | null;
  totalResults: number | null;
  pageNumber: number | null;
  pageSize: number | null;
  sort: string | null;
  results: SearchResultEntry[];
}

export type RequestErrorCode =
  | 'INVALID_ARGUMENT'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SIZE_EXCEEDED'
  | 'MALFORMED_RESPONSE'
  | 'RETRIES_EXHAUSTED';

export class FundingTendersRequestError extends Error {
  readonly code: RequestErrorCode;
  readonly status: number | null;

  constructor(code: RequestErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'FundingTendersRequestError';
    this.code = code;
    this.status = status;
  }
}

const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstScalar(value: unknown): string | null {
  if (Array.isArray(value)) {
    return firstScalar(value[0]);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function parseEnvelope(text: string): SearchResponseEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FundingTendersRequestError('MALFORMED_RESPONSE', 'Search response is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FundingTendersRequestError('MALFORMED_RESPONSE', 'Search response is not a JSON object.');
  }
  const row = parsed as Record<string, unknown>;
  const rawResults = Array.isArray(row.results) ? row.results : [];
  const results: SearchResultEntry[] = rawResults.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const meta = item.metadata !== null && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : {};
    return {
      reference: firstScalar(item.reference) ?? '',
      url: firstScalar(item.url),
      contentType: firstScalar(item.contentType),
      language: firstScalar(item.language),
      databaseLabel: firstScalar(item.databaseLabel),
      summary: firstScalar(item.summary),
      content: firstScalar(item.content),
      checksum: firstScalar(item.checksum),
      metadata: meta,
    };
  });
  return {
    apiVersion: firstScalar(row.apiVersion) ?? 'unknown',
    terms: firstScalar(row.terms),
    totalResults: typeof row.totalResults === 'number' ? row.totalResults : null,
    pageNumber: typeof row.pageNumber === 'number' ? row.pageNumber : null,
    pageSize: typeof row.pageSize === 'number' ? row.pageSize : null,
    sort: firstScalar(row.sort),
    results,
  };
}

/**
 * One bounded search execution. Transient failures (network, timeout, 408/429/5xx)
 * are retried with exponential backoff; other 4xx responses fail immediately.
 * Never sends any customer/client/case data.
 */
export async function executeFundingTendersSearch(options: SearchRequestOptions = {}): Promise<SearchResponseEnvelope> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageNumber = options.pageNumber ?? 1;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new FundingTendersRequestError('INVALID_ARGUMENT', `pageSize must be an integer in [1, ${MAX_PAGE_SIZE}].`);
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new FundingTendersRequestError('INVALID_ARGUMENT', 'pageNumber must be a positive integer.');
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const body = new URLSearchParams({
    text: options.text ?? '',
    pageSize: String(pageSize),
    pageNumber: String(pageNumber),
  });
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
    'user-agent': 'adminiculum-opportunity-watcher/0.1 (bounded manual dry-run; internal)',
  };

  let lastError: FundingTendersRequestError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      await sleep(1000 * 2 ** (attempt - 1));
    }
    try {
      const response = await fetch(options.url ?? FUNDING_TENDERS_SEARCH_URL, {
        method: 'POST',
        headers,
        body: body.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const declaredLength = Number(response.headers.get('content-length') ?? '0');
      if (declaredLength > MAX_RESPONSE_BYTES) {
        throw new FundingTendersRequestError('SIZE_EXCEEDED', 'Search response exceeds the bounded size limit.');
      }
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new FundingTendersRequestError('SIZE_EXCEEDED', 'Search response exceeds the bounded size limit.');
      }
      if (!response.ok) {
        const err = new FundingTendersRequestError('HTTP_ERROR', `Search request failed with HTTP ${response.status}.`, response.status);
        lastError = err;
        if (RETRYABLE_HTTP.has(response.status)) {
          continue;
        }
        throw err;
      }
      return parseEnvelope(text);
    } catch (error) {
      if (error instanceof FundingTendersRequestError) {
        if (error.code === 'HTTP_ERROR' && error.status !== null && RETRYABLE_HTTP.has(error.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }
      const name = error instanceof Error ? error.name : 'Unknown';
      if (name === 'TimeoutError' || name === 'AbortError') {
        lastError = new FundingTendersRequestError('TIMEOUT', `Search request timed out after ${timeoutMs} ms.`);
        continue;
      }
      lastError = new FundingTendersRequestError('NETWORK_ERROR', 'Search request failed: network error.');
      continue;
    }
  }
  throw lastError ?? new FundingTendersRequestError('RETRIES_EXHAUSTED', 'Search request failed after all retry attempts.');
}
