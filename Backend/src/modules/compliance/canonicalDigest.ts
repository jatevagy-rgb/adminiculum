/**
 * PHASE 6 — DETERMINISTIC CANONICALIZATION + DIGEST
 *
 * Generic deterministic infrastructure for future immutable evaluation
 * snapshots. Guarantees:
 *
 *   - same semantic object ordering -> same canonical output/digest
 *   - object KEY ORDER does not affect the result (keys are sorted)
 *   - ARRAY ORDER remains meaningful (arrays are NOT sorted)
 *   - undefined / non-JSON values are rejected according to an explicit policy
 *   - digest uses Node's standard SHA-256
 *
 * This helper never hashes secrets; it is intended for structural snapshots of
 * rule ASTs, fact inputs, and result DTOs.
 */
import { createHash } from 'node:crypto';

export interface CanonicalizationOptions {
  /**
   * Policy for values that cannot be represented in the canonical JSON form.
   * Default: 'reject' — throw. 'omit' — skip the key entirely (only valid for
   * object members; array slots and roots cannot be omitted).
   */
  nonJsonPolicy?: 'reject' | 'omit';
}

export class CanonicalizationError extends Error {
  /** JSONPath-like location of the offending value. */
  path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = 'CanonicalizationError';
    this.path = path;
  }
}

function makeError(message: string, path: string): CanonicalizationError {
  return new CanonicalizationError(message, path);
}

function canonicalize(value: unknown, path: string, options: Required<CanonicalizationOptions>): string {
  if (value === null) return 'null';
  if (value === undefined) {
    if (options.nonJsonPolicy === 'omit') {
      // Undefined members are omitted by the caller via `hasOwn`.
      throw makeError('Undefined must be handled by caller (omit).', path);
    }
    throw makeError('Cannot canonicalize undefined (non-JSON value).', path);
  }

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw makeError('Cannot canonicalize non-finite number.', path);
      }
      // Normalize -0 to 0 for determinism.
      return Object.is(value, -0) ? '0' : String(value);
    }
    case 'string':
      return JSON.stringify(value);
    case 'bigint':
      throw makeError('Cannot canonicalize bigint (non-JSON value).', path);
    case 'symbol':
      throw makeError('Cannot canonicalize symbol (non-JSON value).', path);
    case 'function':
      throw makeError('Cannot canonicalize function (non-JSON value).', path);
    case 'object': {
      if (value instanceof Date) {
        // Reject Date objects: they are non-JSON. Callers must pass ISO strings.
        throw makeError('Cannot canonicalize Date object; pass an ISO string instead.', path);
      }
      if (Array.isArray(value)) {
        // Array order is meaningful and preserved.
        const parts = value.map((item, index) => canonicalize(item, `${path}[${index}]`, options));
        return `[${parts.join(',')}]`;
      }
      // Plain object: sort keys lexicographically for deterministic output.
      const keys = Object.keys(value).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const memberValue = (value as Record<string, unknown>)[key];
        const memberPath = `${path}.${key}`;
        if (memberValue === undefined) {
          if (options.nonJsonPolicy === 'reject') {
            throw makeError(`Cannot canonicalize undefined member "${key}".`, memberPath);
          }
          // 'omit': skip undefined members.
          continue;
        }
        parts.push(`${JSON.stringify(key)}:${canonicalize(memberValue, memberPath, options)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw makeError(`Cannot canonicalize value of type "${typeof value}".`, path);
  }
}

/**
 * Produce a deterministic canonical JSON string for a JSON-safe value.
 *
 * @param value  The value to canonicalize. Must be JSON-safe (no functions,
 *               symbols, bigint, Date, undefined, or non-finite numbers) unless
 *               `nonJsonPolicy` is configured.
 * @param options  Behavior for non-JSON values.
 * @throws CanonicalizationError when a value cannot be represented.
 */
export function canonicalStringify(value: unknown, options: CanonicalizationOptions = {}): string {
  const opts: Required<CanonicalizationOptions> = {
    nonJsonPolicy: options.nonJsonPolicy ?? 'reject',
  };
  return canonicalize(value, '$', opts);
}

/**
 * Compute a deterministic SHA-256 hex digest over the canonical form of a value.
 *
 * @param value  The value to digest.
 * @param options  Passed through to canonicalStringify.
 * @throws CanonicalizationError when the value cannot be represented.
 */
export function canonicalDigest(value: unknown, options: CanonicalizationOptions = {}): string {
  const canonical = canonicalStringify(value, options);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}