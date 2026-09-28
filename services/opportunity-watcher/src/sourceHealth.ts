/**
 * GWO-1 — explicit per-source health semantics.
 *
 * Truthfulness rules:
 * - a failed source is ERROR, never a successful zero-result run;
 * - NOT_CONFIGURED / BLOCKED_* never render as "0 new opportunities";
 * - STALE means "last success is older than the threshold and no fresh
 *   attempt has been made" — it is not a failure classification.
 *
 * No UI semantics, no scheduler, no notifications in GWO-1.
 */

export const SOURCE_HEALTH_STATES = [
  'ACTIVE',
  'STALE',
  'ERROR',
  'NOT_CONFIGURED',
  'BLOCKED_LEGAL',
  'BLOCKED_PENDING_PERMISSION',
] as const;

export type SourceHealth = (typeof SOURCE_HEALTH_STATES)[number];

export const DEFAULT_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface HealthEvaluationInput {
  /** Was a fetch/normalize attempt made in this run? */
  attempted: boolean;
  /** Result of the attempt (only meaningful when attempted === true). */
  success?: boolean;
  /** Runtime configuration present and valid? Defaults to true. */
  configured?: boolean;
  /** Explicit source-level legal block, if any. */
  blocked?: 'LEGAL' | 'PENDING_PERMISSION' | null;
  /** Last known successful run timestamp (ISO). */
  lastSuccessAt?: string | null;
  now: Date;
  staleAfterMs?: number;
}

export interface HealthEvaluation {
  health: SourceHealth;
  reason: string;
}

export function evaluateSourceHealth(input: HealthEvaluationInput): HealthEvaluation {
  if (input.blocked === 'LEGAL') {
    return { health: 'BLOCKED_LEGAL', reason: 'Source is blocked pending legal clarification.' };
  }
  if (input.blocked === 'PENDING_PERMISSION') {
    return { health: 'BLOCKED_PENDING_PERMISSION', reason: 'Source is blocked pending reuse permission.' };
  }
  if (input.configured === false) {
    return { health: 'NOT_CONFIGURED', reason: 'Required source runtime configuration is missing.' };
  }
  if (input.attempted) {
    if (input.success === true) {
      return { health: 'ACTIVE', reason: 'Source responded successfully in this run.' };
    }
    return { health: 'ERROR', reason: 'Source request or parsing failed in this run.' };
  }

  const lastSuccess = input.lastSuccessAt ? Date.parse(input.lastSuccessAt) : Number.NaN;
  if (Number.isNaN(lastSuccess)) {
    return { health: 'NOT_CONFIGURED', reason: 'No successful source run is known.' };
  }
  const staleAfter = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  if (input.now.getTime() - lastSuccess > staleAfter) {
    return { health: 'STALE', reason: 'Last successful source run is older than the staleness threshold.' };
  }
  return { health: 'ACTIVE', reason: 'Last successful source run is within the staleness threshold.' };
}
