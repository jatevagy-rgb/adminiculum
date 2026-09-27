/**
 * GWO-1 — structural privacy guard (defense in depth).
 *
 * No normalized DTO, capture object, request or report may contain keys
 * representing Adminiculum tenant data. The service also has no import path
 * into Adminiculum domain modules, Prisma, a database-URL environment
 * variable, or the legal-watcher.
 *
 * RUNTIME_FORBIDDEN_IMPORT_TOKENS is the single definition site of the
 * deny-list and is reused by the isolation test, which greps every other
 * source file: if any token appears there, the test fails.
 */

export const FORBIDDEN_TENANT_KEYS = [
  'clientId',
  'caseId',
  'documentId',
  'workspaceId',
  'organizationPersonId',
  'personId',
  'matterId',
] as const;

export const RUNTIME_FORBIDDEN_IMPORT_TOKENS = [
  '@prisma/client',
  'DATABASE_URL',
  'Backend/',
  'Frontend/',
  'legal-watcher',
] as const;

export class PrivacyViolationError extends Error {
  readonly key: string;
  readonly path: string;

  constructor(key: string, path: string) {
    super(`Forbidden tenant key "${key}" found at ${path}.`);
    this.name = 'PrivacyViolationError';
    this.key = key;
    this.path = path;
  }
}

const FORBIDDEN = new Set<string>(FORBIDDEN_TENANT_KEYS.map((key) => key.toLowerCase()));

export function scanForbiddenKeys(value: unknown): string[] {
  const violations: string[] = [];
  const stack: { entry: unknown; path: string }[] = [{ entry: value, path: '$' }];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const { entry, path } = stack.pop() as { entry: unknown; path: string };
    if (entry === null || typeof entry !== 'object') continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    if (Array.isArray(entry)) {
      for (let index = 0; index < entry.length; index += 1) {
        stack.push({ entry: entry[index], path: `${path}[${index}]` });
      }
      continue;
    }
    for (const [key, child] of Object.entries(entry as Record<string, unknown>)) {
      if (FORBIDDEN.has(key.toLowerCase())) {
        violations.push(`${path}.${key}`);
      }
      stack.push({ entry: child, path: `${path}.${key}` });
    }
  }
  return violations;
}

/** Throws PrivacyViolationError when any forbidden tenant key is present. */
export function assertPrivacySafe(value: unknown, label: string): void {
  const violations = scanForbiddenKeys(value);
  if (violations.length > 0) {
    throw new PrivacyViolationError(violations[0] ?? 'unknown', label);
  }
}

/** Returns true when no forbidden key is present (test-friendly form). */
export function isPrivacySafe(value: unknown): boolean {
  return scanForbiddenKeys(value).length === 0;
}
