/**
 * GWO-1 — deterministic dry-run report.
 *
 * Truthfulness rules:
 * - a failed source is ERROR with explicit errorCode/errorMessage — never a
 *   successful zero-result run;
 * - counts are derived from the diff pipeline, never fabricated;
 * - samples are bounded (max 3), sorted, and carry only source data;
 * - no stack traces, no secrets, no customer data.
 */

import type { NormalizedExternalOpportunity } from './types.ts';
import type { DiffSummary } from './diff/classify.ts';
import type { SourceHealth } from './sourceHealth.ts';
import { compareCodePoints } from './hash/contentHash.ts';

export const REPORT_SCHEMA_VERSION = 1 as const;
export const MAX_REPORT_SAMPLES = 3;

export const SOURCE_ATTRIBUTION =
  'Source: EU Funding & Tenders Portal (https://ec.europa.eu/info/funding-tenders/opportunities). ' +
  'Reuse permitted under the European Commission reuse policy with attribution. ' +
  'No API-specific licence or rate limit was found; confirm the portal-specific notice/rate policy before production scheduling.';

export interface ReportInput {
  source: 'EU_FUNDING_TENDERS';
  health: SourceHealth;
  healthReason: string;
  requestedAt: string;
  completedAt: string;
  lastSuccessAt: string | null;
  fetchedCount: number;
  normalizedCount: number;
  rejectedCount: number;
  opportunities: readonly NormalizedExternalOpportunity[];
  diff: DiffSummary | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ReportSample {
  sourceIdentifier: string;
  title: string;
  status: string;
  deadlineAt: string | null;
  programme: string | null;
  callIdentifier: string | null;
  sourceUrl: string;
}

export interface DryRunReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  mode: 'dry-run' | 'no-commit';
  generatedAt: string;
  source: string;
  health: SourceHealth;
  healthReason: string;
  requestedAt: string;
  completedAt: string;
  lastSuccessAt: string | null;
  fetchedCount: number;
  normalizedCount: number;
  rejectedCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  samples: ReportSample[];
  errorCode: string | null;
  errorMessage: string | null;
  attribution: string;
}

export function buildReportSample(opportunity: NormalizedExternalOpportunity): ReportSample {
  return {
    sourceIdentifier: opportunity.sourceIdentifier,
    title: opportunity.title,
    status: opportunity.status,
    deadlineAt: opportunity.deadlineAt,
    programme: opportunity.programme,
    callIdentifier: opportunity.callIdentifier,
    sourceUrl: opportunity.sourceUrl,
  };
}

export function buildDryRunReport(input: ReportInput, mode: 'dry-run' | 'no-commit', generatedAt: string): DryRunReport {
  const samples = [...input.opportunities]
    .sort((a, b) => compareCodePoints(a.sourceIdentifier, b.sourceIdentifier))
    .slice(0, MAX_REPORT_SAMPLES)
    .map(buildReportSample);
  const diff = input.diff;
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    mode,
    generatedAt,
    source: input.source,
    health: input.health,
    healthReason: input.healthReason,
    requestedAt: input.requestedAt,
    completedAt: input.completedAt,
    lastSuccessAt: input.lastSuccessAt,
    fetchedCount: input.fetchedCount,
    normalizedCount: input.normalizedCount,
    rejectedCount: input.rejectedCount,
    newCount: diff?.newCount ?? 0,
    updatedCount: diff?.updatedCount ?? 0,
    unchangedCount: diff?.unchangedCount ?? 0,
    samples,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    attribution: SOURCE_ATTRIBUTION,
  };
}
