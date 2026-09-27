/**
 * GWO-1 — deterministic diff classification.
 *
 * Exactly one classification per normalized current record:
 *   NEW       no previous captured state for source + sourceIdentifier
 *   UPDATED   previous state exists and the canonical business state changed
 *   UNCHANGED previous state exists and the canonical business state is identical
 *
 * Classification semantics (per the documented contentHash contract):
 * - the stored canonical contentHash covers business fields + display
 *   language + per-language variant hashes;
 * - when two hashes differ, the diff layer re-compares a language-independent
 *   business fingerprint (businessProjection + revision). A pure
 *   language-representation change of the same unchanged authoritative
 *   opportunity therefore classifies UNCHANGED;
 * - observedAt is excluded from hashing, so an observation-timestamp change
 *   alone stays UNCHANGED;
 * - deadline/status/budget/metadata/revision changes flip the business
 *   fingerprint and classify UPDATED.
 */

import type { NormalizedExternalOpportunity } from '../types.ts';
import type { CaptureRecord } from '../capture/store.ts';
import { businessProjection, hashCanonical } from '../hash/contentHash.ts';

export type DiffClassification = 'NEW' | 'UPDATED' | 'UNCHANGED';

export interface DiffDecision {
  classification: DiffClassification;
  sourceIdentifier: string;
  currentHash: string;
  previousHash: string | null;
}

/** Language-independent business fingerprint (revision included). */
export function businessFingerprint(opportunity: NormalizedExternalOpportunity): string {
  return hashCanonical({
    business: businessProjection(opportunity),
    revision: opportunity.sourceRevisionIdentifier,
  });
}

export function classifyOpportunity(
  current: NormalizedExternalOpportunity,
  previous: CaptureRecord | null,
): DiffDecision {
  if (previous === null) {
    return {
      classification: 'NEW',
      sourceIdentifier: current.sourceIdentifier,
      currentHash: current.contentHash,
      previousHash: null,
    };
  }
  if (previous.contentHash === current.contentHash) {
    return {
      classification: 'UNCHANGED',
      sourceIdentifier: current.sourceIdentifier,
      currentHash: current.contentHash,
      previousHash: previous.contentHash,
    };
  }
  if (businessFingerprint(previous.opportunity) === businessFingerprint(current)) {
    return {
      classification: 'UNCHANGED',
      sourceIdentifier: current.sourceIdentifier,
      currentHash: current.contentHash,
      previousHash: previous.contentHash,
    };
  }
  return {
    classification: 'UPDATED',
    sourceIdentifier: current.sourceIdentifier,
    currentHash: current.contentHash,
    previousHash: previous.contentHash,
  };
}

export interface DiffSummary {
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  decisions: DiffDecision[];
}

export function classifyBatch(
  opportunities: readonly NormalizedExternalOpportunity[],
  lookup: (source: string, sourceIdentifier: string) => CaptureRecord | null,
): DiffSummary {
  const decisions: DiffDecision[] = [];
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  for (const opportunity of opportunities) {
    const previous = lookup(opportunity.source, opportunity.sourceIdentifier);
    const decision = classifyOpportunity(opportunity, previous);
    decisions.push(decision);
    if (decision.classification === 'NEW') newCount += 1;
    else if (decision.classification === 'UPDATED') updatedCount += 1;
    else unchangedCount += 1;
  }
  return { newCount, updatedCount, unchangedCount, decisions };
}
