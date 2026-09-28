/**
 * GWO-2 — TED adapter orchestration.
 *
 * Bounded fetch -> per-scope normalization -> adapter result with
 * source-health-compatible metadata. Source history (notice/version) and
 * actionable scope (procedure + lot) are handled by the identity layer;
 * no capture/diff/report logic lives here.
 *
 * Truthfulness: a failed request yields health ERROR with zero normalized
 * scopes; notices without procedure identity are rejected explicitly and
 * counted — never turned into empty opportunities.
 */

import type { OpportunityVariantInput, NormalizationRejection } from '../../normalize/variant.ts';
import type { SourceHealth } from '../../sourceHealth.ts';
import { evaluateSourceHealth } from '../../sourceHealth.ts';
import type { TedSearchEnvelope, TedSearchOptions } from './request.ts';
import { executeTedSearch, TedRequestError } from './request.ts';
import { normalizeTedNotice } from './normalize.ts';

export interface TedAdapterResult {
  source: 'TED';
  health: SourceHealth;
  healthReason: string;
  requestedAt: string;
  completedAt: string;
  lastSuccessAt: string | null;
  /** Raw notices returned by the bounded search page. */
  fetchedCount: number;
  /** Total actionable scopes (procedure + lot) normalized. */
  normalizedCount: number;
  rejectedCount: number;
  variants: OpportunityVariantInput[];
  rejections: NormalizationRejection[];
}

export interface TedAdapterOptions {
  request?: TedSearchOptions;
  /** Overridable for deterministic tests. */
  now?: Date;
  lastSuccessAt?: string | null;
}

export type TedFetchOutcome =
  | { ok: true; envelope: TedSearchEnvelope; requestedAt: string; completedAt: string }
  | { ok: false; errorCode: string; errorMessage: string; requestedAt: string; completedAt: string };

export function normalizeTedNotices(notices: readonly unknown[]): {
  variants: OpportunityVariantInput[];
  rejections: NormalizationRejection[];
} {
  const variants: OpportunityVariantInput[] = [];
  const rejections: NormalizationRejection[] = [];
  for (const notice of notices) {
    const batch = normalizeTedNotice(notice);
    variants.push(...batch.variants);
    rejections.push(...batch.rejections);
  }
  return { variants, rejections };
}

export function fetchTedNotices(options: TedAdapterOptions = {}): Promise<TedFetchOutcome> {
  return (async (): Promise<TedFetchOutcome> => {
    const requestedAt = (options.now ?? new Date()).toISOString();
    try {
      const envelope = await executeTedSearch(options.request ?? {});
      const completedAt = new Date().toISOString();
      return { ok: true, envelope, requestedAt, completedAt };
    } catch (error) {
      const completedAt = new Date().toISOString();
      if (error instanceof TedRequestError) {
        return { ok: false, errorCode: error.code, errorMessage: error.message, requestedAt, completedAt };
      }
      return {
        ok: false,
        errorCode: 'UNEXPECTED',
        errorMessage: error instanceof Error ? error.message : 'Unknown failure.',
        requestedAt,
        completedAt,
      };
    }
  })();
}

/** Fetch + normalize + explicit source-health evaluation. */
export async function runTedAdapter(options: TedAdapterOptions = {}): Promise<TedAdapterResult> {
  const fetchOutcome = await fetchTedNotices(options);

  if (!fetchOutcome.ok) {
    const health = evaluateSourceHealth({
      attempted: true,
      success: false,
      lastSuccessAt: options.lastSuccessAt ?? null,
      now: options.now ?? new Date(),
    });
    return {
      source: 'TED',
      health: health.health,
      healthReason: health.reason,
      requestedAt: fetchOutcome.requestedAt,
      completedAt: fetchOutcome.completedAt,
      lastSuccessAt: options.lastSuccessAt ?? null,
      fetchedCount: 0,
      normalizedCount: 0,
      rejectedCount: 0,
      variants: [],
      rejections: [],
    };
  }

  const { variants, rejections } = normalizeTedNotices(fetchOutcome.envelope.notices);
  const health = evaluateSourceHealth({
    attempted: true,
    success: true,
    lastSuccessAt: options.lastSuccessAt ?? null,
    now: options.now ?? new Date(),
  });
  return {
    source: 'TED',
    health: health.health,
    healthReason: health.reason,
    requestedAt: fetchOutcome.requestedAt,
    completedAt: fetchOutcome.completedAt,
    lastSuccessAt: options.lastSuccessAt ?? null,
    fetchedCount: fetchOutcome.envelope.notices.length,
    normalizedCount: variants.length,
    rejectedCount: rejections.length,
    variants,
    rejections,
  };
}
