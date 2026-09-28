/**
 * GWO-1 — internal per-language variant shape produced by a source adapter
 * before business-identity grouping.
 *
 * This is NOT the public DTO (see src/types.ts). Variants of the same
 * authoritative opportunity share `sourceIdentifier` and differ by language.
 */

import type { OpportunityKind, OpportunitySource, SourceStatus } from '../types.ts';

export interface OpportunityVariantInput {
  source: OpportunitySource;
  sourceIdentifier: string;
  kind: OpportunityKind;
  language: string | null;
  title: string;
  summary: string | null;
  eligibilityText: string | null;
  sourceRevisionIdentifier: string | null;
  status: SourceStatus;
  sourceUrl: string;
  publicationAt: string | null;
  openingAt: string | null;
  deadlineAt: string | null;
  programme: string | null;
  callIdentifier: string | null;
  authorityName: string | null;
  buyerName: string | null;
  cpvCodes: string[];
  activityCodes: string[];
  sectorHints: string[];
  eligibleCountries: string[];
  nutsCodes: string[];
  placeOfPerformance: string | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  fundingAmountMin: number | null;
  fundingAmountMax: number | null;
  currency: string | null;
  cofinancingRate: number | null;
  sourceSpecificMetadata: Record<string, unknown>;
}

export interface NormalizationRejection {
  reason: string;
  detail: string | null;
}

export type NormalizationOutcome =
  | { ok: true; variant: OpportunityVariantInput }
  | { ok: false; rejection: NormalizationRejection };
