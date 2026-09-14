/**
 * GROW CUSTOMER ASSESSMENT JOURNEY — customer-safe research provenance.
 *
 * Resolves assessment evidence corpus keys against the existing curated
 * research corpus (../research/corpus.ts SEEDED_CORPUS). This module creates NO
 * parallel corpus and NO new evidence entries.
 *
 * Safety contract:
 * - Output is built ONLY from the curated, in-repo seed records; it never
 *   contains a ResearchEvidence database id, clientId, corpus mechanics,
 *   domain keys, scoring keys or raw payload.
 * - Only records whose verificationStatus is VERIFIED are presented as strong
 *   backing. UNVERIFIED records are downgraded to CONTEXT (clearly labelled
 *   provisional) and are never presented as authoritative support.
 */

import { SEEDED_CORPUS } from '../research/corpus';

export interface CustomerAssessmentEvidence {
  corpusKey: string;
  title: string;
  authors: string | null;
  year: number | null;
  doi: string | null;
  locator: string | null;
  boundedClaim: string | null;
  limitations: string | null;
  /** STRONG only when the underlying record is VERIFIED; otherwise CONTEXT. */
  strength: 'STRONG' | 'CONTEXT';
  strengthLabelHu: string;
}

const CORPUS_BY_KEY = new Map(SEEDED_CORPUS.map((entry) => [entry.corpusKey, entry]));

export function evidenceCorpusKeyResolves(corpusKey: string): boolean {
  return CORPUS_BY_KEY.has(String(corpusKey ?? ''));
}

/**
 * Resolves and deduplicates corpus keys into customer-safe provenance records,
 * preserving first-appearance order. Unknown keys are dropped (fail-closed).
 */
export function resolveCustomerEvidence(corpusKeys: readonly string[]): CustomerAssessmentEvidence[] {
  const out: CustomerAssessmentEvidence[] = [];
  const seen = new Set<string>();
  for (const rawKey of corpusKeys) {
    const corpusKey = String(rawKey ?? '');
    if (!corpusKey || seen.has(corpusKey)) continue;
    seen.add(corpusKey);
    const entry = CORPUS_BY_KEY.get(corpusKey);
    if (!entry) continue;
    const verified = entry.verificationStatus === 'VERIFIED';
    out.push({
      corpusKey,
      title: entry.title,
      authors: entry.authors ?? null,
      year: entry.year ?? null,
      doi: entry.doi ?? null,
      locator: entry.locator ?? null,
      boundedClaim: entry.boundedClaim ?? null,
      limitations: entry.limitations ?? null,
      strength: verified ? 'STRONG' : 'CONTEXT',
      strengthLabelHu: verified ? 'Ellenőrzött szakirodalmi háttér' : 'Tájékoztató kontextus (nem ellenőrzött)',
    });
  }
  return out;
}
