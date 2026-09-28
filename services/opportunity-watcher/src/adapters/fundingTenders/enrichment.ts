/**
 * GWO-1G — bounded official topicDetails enrichment for the source order signal.
 *
 * Search remains the discovery source; topicDetails is enrichment only:
 * it attaches the authoritative source order evidence (sourceLastChangeAt +
 * sourceOrderSignalStatus) to each search-derived variant, retaining the
 * search checksum as `sourceRevisionIdentifier`.
 *
 * Bounds: MAX_ENRICHED_TOPICS_PER_RUN enforced by the adapter before fan-out;
 * bounded concurrency (MAX_DETAIL_CONCURRENCY); one detail request per variant.
 *
 * Three states are never collapsed:
 *   AUTHORITATIVE_TIMESTAMP  — details fetched, identity matched, valid
 *                              latestInfos[].lastChangeDate exists;
 *   AUTHORITATIVE_NO_HISTORY — details fetched, identity matched, the official
 *                              record currently contains no usable change
 *                              history;
 *   UNAVAILABLE              — fetch/parse/identity failure: the record is
 *                              rejected explicitly (ORDER_SIGNAL_ENRICHMENT_
 *                              UNAVAILABLE) and never emitted as a safe variant.
 */

import type { OpportunityVariantInput, NormalizationRejection } from '../../normalize/variant.ts';
import { compareCodePoints } from '../../hash/contentHash.ts';
import { fetchOfficialTopicDetails } from './request.ts';
import type { TopicDetailsOrderEvidence } from './normalize.ts';
import { deriveTopicDetailsOrderEvidence } from './normalize.ts';

export const MAX_ENRICHED_TOPICS_PER_RUN = 10;
export const MAX_DETAIL_CONCURRENCY = 3;

export const ORDER_SIGNAL_ENRICHMENT_UNAVAILABLE = 'ORDER_SIGNAL_ENRICHMENT_UNAVAILABLE';

export interface EnrichmentOptions {
  /** Bounded worker-pool size; clamped to [1, MAX_DETAIL_CONCURRENCY]. */
  concurrency?: number;
  /** Test injection; defaults to the official topicDetails fetcher. */
  fetchDetails?: (identifier: string) => Promise<unknown>;
}

export interface EnrichmentResult {
  /** Identity-matched, evidence-attached variants (deterministic order). */
  enriched: OpportunityVariantInput[];
  /** Explicit per-record rejections; never emitted as variants. */
  rejections: NormalizationRejection[];
}

function applyEvidence(variant: OpportunityVariantInput, evidence: TopicDetailsOrderEvidence): OpportunityVariantInput {
  const existingMetadata = variant.sourceSpecificMetadata;
  const fundingTenders =
    existingMetadata['fundingTenders'] !== null && typeof existingMetadata['fundingTenders'] === 'object' && !Array.isArray(existingMetadata['fundingTenders'])
      ? { ...(existingMetadata['fundingTenders'] as Record<string, unknown>) }
      : {};
  fundingTenders['sourceLastChangeAt'] = evidence.sourceLastChangeAt;
  fundingTenders['sourceOrderSignalStatus'] = evidence.sourceOrderSignalStatus;
  return {
    ...variant,
    sourceSpecificMetadata: {
      ...existingMetadata,
      fundingTenders,
    },
  };
}

/**
 * Enrich bounded search-derived variants with official order evidence.
 * One detail request per variant; bounded concurrency; per-record failures
 * become explicit rejections while other records may complete.
 */
export async function enrichVariantsWithOrderSignal(
  variants: readonly OpportunityVariantInput[],
  options: EnrichmentOptions = {},
): Promise<EnrichmentResult> {
  const concurrency = Math.max(1, Math.min(Math.trunc(options.concurrency ?? MAX_DETAIL_CONCURRENCY), MAX_DETAIL_CONCURRENCY));
  const fetchDetails = options.fetchDetails ?? ((identifier: string) => fetchOfficialTopicDetails(identifier));
  const enriched: OpportunityVariantInput[] = [];
  const rejections: NormalizationRejection[] = [];

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= variants.length) return;
      const variant = variants[index];
      if (variant === undefined) continue;
      try {
        const raw = await fetchDetails(variant.sourceIdentifier);
        const evidence = deriveTopicDetailsOrderEvidence(raw);
        if (evidence === null) {
          rejections.push({ reason: ORDER_SIGNAL_ENRICHMENT_UNAVAILABLE, detail: `Malformed topicDetails payload for ${variant.sourceIdentifier}.` });
          continue;
        }
        if (evidence.identifier === null || evidence.identifier !== variant.sourceIdentifier) {
          rejections.push({ reason: ORDER_SIGNAL_ENRICHMENT_UNAVAILABLE, detail: `topicDetails identity mismatch for ${variant.sourceIdentifier}.` });
          continue;
        }
        enriched.push(applyEvidence(variant, evidence));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        rejections.push({ reason: ORDER_SIGNAL_ENRICHMENT_UNAVAILABLE, detail: `topicDetails fetch failed for ${variant.sourceIdentifier}: ${message}` });
      }
    }
  };

  const workerCount = Math.min(concurrency, variants.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  enriched.sort((a, b) => compareCodePoints(a.sourceIdentifier, b.sourceIdentifier));
  rejections.sort((a, b) => compareCodePoints(a.detail ?? '', b.detail ?? ''));
  return { enriched, rejections };
}
