export const REDACTED = '[REDACTED]';

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
  'apikey',
  'databaseurl',
  'connectionstring',
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

export function sanitizeUrlForLog(url: string | undefined | null): string {
  const raw = typeof url === 'string' ? url : '';
  if (!raw) return '';
  const queryIndex = raw.indexOf('?');
  const hashIndex = raw.indexOf('#');
  const cut = Math.min(...[raw.length, queryIndex, hashIndex].filter((index) => index >= 0));
  return raw.slice(0, cut) || raw;
}

export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => redactObject(entry, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactObject(entry, depth + 1);
  }
  return output;
}
