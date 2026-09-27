/**
 * GWO-1 — Funding & Tenders adapter orchestration.
 *
 * Fetch (bounded) -> normalize (fail-closed) -> adapter result with
 * source-health-compatible metadata. No capture/diff/report logic lives here.
 *
 * Truthfulness: a failed request yields health ERROR with zero normalized
 * outcomes; identity-less records are rejected explicitly and counted.
 */

import type { OpportunityVariantInput } from '../../normalize/variant.ts';
import type { NormalizationRejection } from '../../normalize/variant.ts';
import type { SourceHealth } from '../../sourceHealth.ts';
import { evaluateSourceHealth } from '../../sourceHealth.ts';
import type { FundingTendersReferenceData } from '../../reference/fundingTendersReference.ts';
import { loadFundingTendersReference } from '../../reference/fundingTendersReference.ts';
import type { SearchResponseEnvelope, SearchRequestOptions } from './request.ts';
import { executeFundingTendersSearch, FundingTendersRequestError } from './request.ts';
import { normalizeFundingTendersRecord } from './normalize.ts';

export interface AdapterFetchSuccess {
  ok: true;
  envelope: SearchResponseEnvelope;
  requestedAt: string;
  completedAt: string;
}

export interface AdapterFetchFailure {
  ok: false;
  errorCode: string;
  errorMessage: string;
  requestedAt: string;
  completedAt: string;
}

export type AdapterFetchOutcome = AdapterFetchSuccess | AdapterFetchFailure;

export interface AdapterResult {
  source: 'EU_FUNDING_TENDERS';
  health: SourceHealth;
  healthReason: string;
  requestedAt: string;
  completedAt: string;
  lastSuccessAt: string | null;
  fetchedCount: number;
  normalizedCount: number;
  rejectedCount: number;
  variants: OpportunityVariantInput[];
  rejections: { reason: string; detail: string | null }[];
}

export interface AdapterOptions {
  request?: SearchRequestOptions;
  /** Overridable dictionary for deterministic tests. */
  reference?: FundingTendersReferenceData;
  /** Overridable for deterministic tests (always injected, never a clock mock inside the adapter). */
  now?: Date;
  /** Known previous success timestamp (ISO). */
  lastSuccessAt?: string | null;
}

export function fetchFundingTenders(options: AdapterOptions = {}): Promise<AdapterFetchOutcome> {
  return (async (): Promise<AdapterFetchOutcome> => {
    const requestedAt = (options.now ?? new Date()).toISOString();
    try {
      const envelope = await executeFundingTendersSearch(options.request ?? {});
      const completedAt = new Date().toISOString();
      return { ok: true, envelope, requestedAt, completedAt };
    } catch (error) {
      const completedAt = new Date().toISOString();
      if (error instanceof FundingTendersRequestError) {
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

export function normalizeFundingTendersEnvelope(
  envelope: SearchResponseEnvelope,
  reference: FundingTendersReferenceData,
): { variants: OpportunityVariantInput[]; rejections: NormalizationRejection[] } {
  const variants: OpportunityVariantInput[] = [];
  const rejections: NormalizationRejection[] = [];
  for (const entry of envelope.results) {
    const outcome = normalizeFundingTendersRecord(entry, reference);
    if (outcome.ok) {
      variants.push(outcome.variant);
    } else {
      rejections.push(outcome.rejection);
    }
  }
  return { variants, rejections };
}

/** Fetch + normalize + explicit source-health evaluation. */
export async function runFundingTendersAdapter(options: AdapterOptions = {}): Promise<AdapterResult> {
  const reference = options.reference ?? loadFundingTendersReference();
  const fetchOutcome = await fetchFundingTenders(options);

  if (!fetchOutcome.ok) {
    const health = evaluateSourceHealth({
      attempted: true,
      success: false,
      lastSuccessAt: options.lastSuccessAt ?? null,
      now: options.now ?? new Date(),
    });
    return {
      source: 'EU_FUNDING_TENDERS',
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

  const { variants, rejections } = normalizeFundingTendersEnvelope(fetchOutcome.envelope, reference);
  const health = evaluateSourceHealth({
    attempted: true,
    success: true,
    lastSuccessAt: options.lastSuccessAt ?? null,
    now: options.now ?? new Date(),
  });
  return {
    source: 'EU_FUNDING_TENDERS',
    health: health.health,
    healthReason: health.reason,
    requestedAt: fetchOutcome.requestedAt,
    completedAt: fetchOutcome.completedAt,
    lastSuccessAt: options.lastSuccessAt ?? null,
    fetchedCount: fetchOutcome.envelope.results.length,
    normalizedCount: variants.length,
    rejectedCount: rejections.length,
    variants,
    rejections,
  };
}
