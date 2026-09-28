/**
 * Bounded HTTP for the official CELLAR SPARQL endpoint.
 *
 * Guarantees per logical request:
 *  - hard per-attempt timeout (AbortController)
 *  - bounded response size (streamed read, content-length pre-check)
 *  - retry ONLY for transient failures (network error, timeout, 429, 502,
 *    503, 504) with exponential backoff and a small hard maximum
 *  - one hard total deadline for the whole retry loop
 *  - fail closed: every failure path throws HttpError with a stable code
 */
export interface BoundedHttpOptions {
  timeoutMs: number;
  /** Additional attempts after the first attempt. Hard maximum: 2. */
  retries: number;
  backoffMs: number;
  backoffFactor: number;
  maxBytes: number;
  /** Hard wall-clock budget for one logical request including retries. */
  deadlineMs: number;
}

export type HttpErrorCode =
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_STATUS'
  | 'RESPONSE_TOO_LARGE'
  | 'RETRY_EXHAUSTED';

export class HttpError extends Error {
  constructor(
    public readonly code: HttpErrorCode,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class ResponseTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResponseTooLargeError';
  }
}

export interface HttpStreamResponse {
  status: number;
  contentLength: number | null;
  readText(maxBytes: number): Promise<string>;
}

export type HttpPostFn = (
  url: string,
  body: string,
  signal: AbortSignal,
) => Promise<HttpStreamResponse>;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export async function nodeFetchPost(
  url: string,
  body: string,
  signal: AbortSignal,
): Promise<HttpStreamResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      accept: 'application/sparql-results+json',
    },
    body,
    signal,
  });
  const contentLengthRaw = response.headers.get('content-length');
  const contentLength =
    contentLengthRaw !== null && /^\d+$/.test(contentLengthRaw)
      ? Number.parseInt(contentLengthRaw, 10)
      : null;
  return {
    status: response.status,
    contentLength,
    async readText(maxBytes: number): Promise<string> {
      if (response.body === null) return '';
      if (contentLength !== null && contentLength > maxBytes) {
        throw new ResponseTooLargeError(
          `response content-length ${contentLength} exceeds ${maxBytes} bytes`,
        );
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // Cancellation is best-effort; the guard above still fails closed.
          }
          throw new ResponseTooLargeError(`response exceeds ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
      const joined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      return joined.toString('utf8');
    },
  };
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * One logical POST with bounded retries. Returns { status, text } on success.
 * Every failure path throws HttpError with a stable code.
 */
export async function boundedHttpPost(
  options: BoundedHttpOptions,
  post: HttpPostFn,
  url: string,
  body: string,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<{ status: number; text: string }> {
  const deadline = Date.now() + options.deadlineMs;
  const attempts = options.retries + 1;
  let lastError: HttpError | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new HttpError(
        'RETRY_EXHAUSTED',
        `HTTP deadline exceeded${lastError ? ` (last: ${lastError.code})` : ''}`,
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs, remaining));
    try {
      const response = await post(url, body, controller.signal);
      let text: string;
      try {
        text = await response.readText(options.maxBytes);
      } catch (err) {
        if (err instanceof ResponseTooLargeError) {
          throw new HttpError('RESPONSE_TOO_LARGE', err.message);
        }
        throw err;
      }
      if (response.status >= 200 && response.status < 300) {
        return { status: response.status, text };
      }
      const httpError = new HttpError(
        'HTTP_STATUS',
        `HTTP ${response.status} from ${url}`,
        response.status,
      );
      if (!RETRYABLE_STATUS.has(response.status)) throw httpError;
      lastError = httpError;
      if (attempt === attempts - 1) {
        throw new HttpError(
          'RETRY_EXHAUSTED',
          `HTTP ${response.status} after ${attempts} attempt(s)`,
          response.status,
        );
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const timedOut = isAbortError(err);
      const code: HttpErrorCode = timedOut ? 'TIMEOUT' : 'NETWORK_ERROR';
      const message = timedOut
        ? `request timed out after ${options.timeoutMs}ms`
        : `network error: ${err instanceof Error ? err.message : String(err)}`;
      lastError = new HttpError(code, message);
      if (attempt === attempts - 1) {
        throw new HttpError(
          'RETRY_EXHAUSTED',
          `${code} after ${attempts} attempt(s): ${message}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
    const backoff = Math.min(
      options.backoffMs * Math.pow(options.backoffFactor, attempt),
      Math.max(0, deadline - Date.now()),
    );
    await sleep(backoff);
  }
  throw new HttpError(
    'RETRY_EXHAUSTED',
    lastError ? `HTTP attempts exhausted (last: ${lastError.code})` : 'HTTP attempts exhausted',
  );
}
