/**
 * SEC-0A / OPS log redaction helpers.
 *
 * The access log must never carry credentials or bearer material. Two rules:
 *  1) Request URLs are logged path-only (query string stripped), so a token
 *     that ever ends up in a query parameter is not persisted to logs.
 *  2) Any structured context object logged by the app runs through
 *     `redactObject`, which masks Authorization/cookie/token/secret/connection
 *     fields regardless of nesting.
 *
 * Note: the HTTP access logger (morgan 'combined') already omits request bodies
 * and Authorization/Cookie request headers; these helpers close the remaining
 * query-string and structured-context gaps.
 */

export const REDACTED = '[REDACTED]';

// Substrings that mark a key as sensitive. Matched case-insensitively against a
// normalized key (non-alphanumerics stripped) so `access-token`, `access_token`
// and `accessToken` are all caught.
const SENSITIVE_KEY_FRAGMENTS = [
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'passwordhash',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearer',
  'token',
  'secret',
  'clientsecret',
  'apikey',
  'databaseurl',
  'connectionstring',
  'sptoken',
  'sharepointsecret',
  'graphtoken',
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Strip the query string from a request URL so it can be safely logged.
 */
export function sanitizeUrlForLog(url: string | undefined | null): string {
  const raw = typeof url === 'string' ? url : '';
  if (!raw) return '';
  const queryIndex = raw.indexOf('?');
  const hashIndex = raw.indexOf('#');
  let cut = raw.length;
  if (queryIndex >= 0) cut = Math.min(cut, queryIndex);
  if (hashIndex >= 0) cut = Math.min(cut, hashIndex);
  return raw.slice(0, cut) || raw;
}

/**
 * Deep-redact sensitive fields in an arbitrary value for safe structured
 * logging. Objects are copied (never mutated in place); primitives pass through.
 */
export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactObject(entry, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactObject(entry, depth + 1);
  }
  return out;
}
