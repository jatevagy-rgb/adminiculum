/**
 * GWO-1 — Funding & Tenders normalization.
 *
 * Raw F&T record -> OpportunityVariantInput. Handles both verified record
 * shapes:
 *   A. static topicDetails JSON: { TopicDetails: { ... } }
 *   B. search-result entry:      { reference, url, language, metadata: {...} }
 *
 * Rules: official reference-dictionary mapping for status codes; date
 * normalization reuse; null/unknown preservation; no eligibility
 * interpretation; no company logic; bounded namespaced source metadata.
 * Unknown status codes stay UNKNOWN and the raw code is preserved.
 *
 * Type semantics (official calls-for-proposals contract, live-proven
 * 2026-09-27): the funding discovery query selects source types 1, 2 and 8 —
 * all three belong to the FUNDING opportunity family for this adapter. Type 0
 * (the portal's separate tenders builder) and any unknown value fail closed.
 * The raw source type is preserved in bounded fundingTenders metadata.
 *
 * REVISION IDENTITY vs SOURCE ORDER SIGNAL (live-proven 2026-09-27):
 * - `sourceRevisionIdentifier` stays the checksum (esST_checksum) on search
 *   records and the newest lastChangeDate on static topicDetails records.
 *   It answers "is this the same source revision?" and is never orderable.
 * - `sourceSpecificMetadata.fundingTenders.sourceLastChangeAt` is the separate
 *   authoritative source-order evidence: the source-provided last-change
 *   timestamp from the portal's `latestInfos[].lastChangeDate` update history
 *   (newest first). It answers "can we prove this source state is newer/older?"
 *   It is null when the source record carries no trustworthy timestamp — the
 *   live SEDIA search index currently stores `latestInfos` as the JSON string
 *   "[]", so search records emit null and downstream consumers fail closed.
 *   observedAt is never used and never fabricated.
 */

import type { OpportunityVariantInput, NormalizationOutcome } from '../../normalize/variant.ts';
import type { FundingTendersReferenceData } from '../../reference/fundingTendersReference.ts';
import { mapSourceStatus } from '../../reference/fundingTendersReference.ts';
import { normalizeSourceTimestamp } from '../../normalize/time.ts';
import { deriveSourceIdentifier, deriveRevisionSignal, deriveSourceUrl } from './identity.ts';

/** Official calls-for-proposals (funding) source types. */
export const FUNDING_SOURCE_TYPES = [1, 2, 8] as const;

/**
 * Explicit order-signal status (GWO-1G). Search-derived variants only receive
 * a status from the topicDetails enrichment step; static topicDetails records
 * receive it directly from their own source history.
 */
export const SOURCE_ORDER_SIGNAL_STATUSES = ['AUTHORITATIVE_TIMESTAMP', 'AUTHORITATIVE_NO_HISTORY'] as const;
export type SourceOrderSignalStatus = (typeof SOURCE_ORDER_SIGNAL_STATUSES)[number];

/**
 * Order evidence extracted from an official topicDetails record. Null when the
 * raw value is not a TopicDetails object shape (malformed / wrong shape).
 * `sourceOrderSignalStatus` is null only for that malformed case; a valid
 * TopicDetails record always yields TIMESTAMP or NO_HISTORY (never UNAVAILABLE —
 * an unavailable fetch is handled by the enrichment layer, not here).
 */
export interface TopicDetailsOrderEvidence {
  identifier: string | null;
  sourceLastChangeAt: string | null;
  sourceOrderSignalStatus: SourceOrderSignalStatus;
}

export function deriveTopicDetailsOrderEvidence(raw: unknown): TopicDetailsOrderEvidence | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const topicDetails = (raw as Record<string, unknown>)['TopicDetails'];
  if (topicDetails === null || typeof topicDetails !== 'object' || Array.isArray(topicDetails)) return null;
  const row = topicDetails as Record<string, unknown>;
  const sourceLastChangeAt = normalizeSourceOrderSignal(latestInfosLastChange(row['latestInfos']));
  return {
    identifier: firstScalar(row['identifier']),
    sourceLastChangeAt,
    sourceOrderSignalStatus: sourceLastChangeAt !== null ? 'AUTHORITATIVE_TIMESTAMP' : 'AUTHORITATIVE_NO_HISTORY',
  };
}

const EPOCH_MILLIS = /^\d{13}$/;

function firstScalar(value: unknown): string | null {
  if (Array.isArray(value)) {
    return firstScalar(value[0]);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function scalarList(value: unknown): string[] {
  const out: string[] = [];
  const push = (entry: unknown): void => {
    if (Array.isArray(entry)) {
      for (const item of entry) push(item);
      return;
    }
    if (typeof entry === 'string' || typeof entry === 'number') out.push(String(entry));
  };
  push(value);
  return out;
}

function toFiniteNumber(value: unknown): number | null {
  const scalar = firstScalar(value);
  if (scalar === null || scalar.trim().length === 0) return null;
  const parsed = Number(scalar);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Newest-first `lastChangeDate` from the portal's `latestInfos` update history.
 * Accepts the official `{approvalDate, lastChangeDate, content}` entry shape
 * (topicDetails contract). Non-object entries (including the JSON-string "[]"
 * the live SEDIA search index stores) and empty values yield null — the order
 * signal is never invented.
 */
function latestInfosLastChange(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const lastChange = firstScalar((entry as Record<string, unknown>)['lastChangeDate']);
    if (lastChange !== null && lastChange.trim().length > 0) return lastChange.trim();
  }
  return null;
}

/**
 * Order-signal normalization: directly source-derived, ISO-normalized, and
 * null when absent or untrusted. Malformed / unparseable timestamps become
 * null (never passed through verbatim) so downstream ordering logic fails
 * closed. Date-only values must be calendar-valid. Never falls back to
 * observedAt.
 */
function normalizeSourceOrderSignal(raw: string | null): string | null {
  if (raw === null) return null;
  const normalized = normalizeSourceTimestamp(raw);
  if (normalized.value === null) return null;
  if (normalized.precision === 'unknown') return null;
  const probe = normalized.precision === 'date' ? `${normalized.value}T00:00:00Z` : normalized.value;
  if (Number.isNaN(Date.parse(probe))) return null;
  return normalized.value;
}

/**
 * Epoch millis are absolute instants and convert losslessly to UTC. A value at
 * exactly 00:00 UTC is reduced to date-only semantics (the portal stores
 * date-only deadlines as UTC midnight). Other values pass through the shared
 * timestamp normalizer (never assumes a timezone).
 */
function normalizeSourceDate(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (EPOCH_MILLIS.test(trimmed)) {
    const date = new Date(Number(trimmed));
    if (Number.isNaN(date.getTime())) return null;
    const iso = date.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  return normalizeSourceTimestamp(trimmed).value;
}

interface UnifiedRecord {
  recordShape: 'topicDetails' | 'searchEntry';
  identifier: string | null;
  title: string | null;
  type: number | null;
  rawStatusIds: string[];
  language: string | null;
  url: string | null;
  summary: string | null;
  publicationRaw: string | null;
  openingRaw: string | null;
  deadlineRaws: string[];
  frameworkProgrammeCode: string | null;
  frameworkProgrammeLabel: string | null;
  programmeDivisionCode: string | null;
  callIdentifier: string | null;
  budgetTotal: number | null;
  eligibilityText: string | null;
  revisionSignal: string | null;
  revisionSource: 'esST_checksum' | 'lastChangeDate' | null;
  sourceLastChangeRaw: string | null;
  datasource: string | null;
  reference: string | null;
  ccm2Id: number | null;
  callCcm2Id: number | null;
  allowPartnerSearch: boolean | null;
  sme: boolean | null;
}

function budgetFromTopicDetails(topic: Record<string, unknown>, identifier: string): number | null {
  const overview = topic['budgetOverviewJSONItem'];
  if (overview === null || typeof overview !== 'object' || Array.isArray(overview)) return null;
  const map = (overview as Record<string, unknown>)['budgetTopicActionMap'];
  if (map === null || typeof map !== 'object' || Array.isArray(map)) return null;
  const prefix = `${identifier} `;
  let total = 0;
  let found = false;
  for (const entries of Object.values(map as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const action = firstScalar((entry as Record<string, unknown>)['action']);
      if (action === null || !action.startsWith(prefix)) continue;
      const yearMap = (entry as Record<string, unknown>)['budgetYearMap'];
      if (yearMap === null || typeof yearMap !== 'object' || Array.isArray(yearMap)) continue;
      for (const raw of Object.values(yearMap as Record<string, unknown>)) {
        const amount = toFiniteNumber(raw);
        if (amount !== null) {
          total += amount;
          found = true;
        }
      }
    }
  }
  return found ? total : null;
}

function unifyTopicDetails(topic: Record<string, unknown>): UnifiedRecord {
  const actions = Array.isArray(topic['actions']) ? topic['actions'] as Record<string, unknown>[] : [];
  const firstAction = actions[0] ?? {};
  const rawStatusIds = actions
    .map((action) => {
      const entry = action['status'];
      return entry !== null && typeof entry === 'object' ? firstScalar((entry as Record<string, unknown>)['id']) : null;
    })
    .filter((entry): entry is string => entry !== null && entry.trim().length > 0);
  const framework = topic['frameworkProgramme'];
  const frameworkObject = framework !== null && typeof framework === 'object' ? (framework as Record<string, unknown>) : {};
  const division = Array.isArray(topic['programmeDivision']) ? (topic['programmeDivision'] as Record<string, unknown>[])[0] : null;
  const divisionObject = division !== null && typeof division === 'object' ? division : {};
  const identifier = firstScalar(topic['identifier']);
  const latestInfos = Array.isArray(topic['latestInfos']) ? topic['latestInfos'] as Record<string, unknown>[] : [];
  return {
    recordShape: 'topicDetails',
    identifier: identifier !== null && identifier.trim().length > 0 ? identifier.trim() : null,
    title: firstScalar(topic['title']),
    type: toFiniteNumber(topic['type']),
    rawStatusIds,
    language: null,
    url: null,
    summary: null,
    publicationRaw: firstScalar(topic['publicationDateLong']),
    openingRaw: firstScalar(firstAction['plannedOpeningDate']),
    deadlineRaws: scalarList(firstAction['deadlineDates']),
    frameworkProgrammeCode: firstScalar(frameworkObject['abbreviation']),
    frameworkProgrammeLabel: firstScalar(frameworkObject['description']) ?? firstScalar(frameworkObject['abbreviation']),
    programmeDivisionCode: firstScalar(divisionObject['abbreviation']) ?? firstScalar(divisionObject['description']),
    callIdentifier: firstScalar(topic['callIdentifier']),
    budgetTotal: identifier !== null ? budgetFromTopicDetails(topic, identifier) : null,
    eligibilityText: firstScalar(topic['conditions']),
    revisionSignal: deriveRevisionSignal({}, latestInfos.map((entry) => ({ lastChangeDate: entry['lastChangeDate'] }))),
    revisionSource: 'lastChangeDate',
    sourceLastChangeRaw: latestInfosLastChange(topic['latestInfos']),
    datasource: null,
    reference: null,
    ccm2Id: toFiniteNumber(topic['ccm2Id']),
    callCcm2Id: toFiniteNumber(topic['callccm2Id']),
    allowPartnerSearch: typeof topic['allowPartnerSearch'] === 'boolean' ? topic['allowPartnerSearch'] : null,
    sme: typeof topic['sme'] === 'boolean' ? topic['sme'] : null,
  };
}

function unifySearchEntry(entry: Record<string, unknown>, metadata: Record<string, unknown>): UnifiedRecord {
  const identifier = deriveSourceIdentifier(metadata);
  const frameworkLabel = firstScalar(metadata['frameworkProgramme']);
  return {
    recordShape: 'searchEntry',
    identifier,
    title: firstScalar(metadata['title']),
    type: toFiniteNumber(metadata['type']),
    rawStatusIds: scalarList(metadata['status']).filter((value) => value.trim().length > 0),
    language: firstScalar(entry['language']) ?? firstScalar(metadata['language']),
    url: firstScalar(entry['url']) ?? firstScalar(metadata['url']),
    summary: firstScalar(entry['summary']) ?? firstScalar(metadata['summary']),
    publicationRaw: firstScalar(metadata['publicationDateLong']) ?? firstScalar(metadata['startDate']),
    openingRaw: firstScalar(metadata['plannedOpeningDate']),
    deadlineRaws: scalarList(metadata['deadlineDates']).length > 0 ? scalarList(metadata['deadlineDates']) : scalarList(metadata['deadlineDate']),
    frameworkProgrammeCode: frameworkLabel,
    frameworkProgrammeLabel: frameworkLabel,
    programmeDivisionCode: firstScalar(metadata['programmeDivision']),
    callIdentifier: firstScalar(metadata['callIdentifier']),
    budgetTotal: toFiniteNumber(metadata['budget']),
    eligibilityText: firstScalar(metadata['conditions']),
    revisionSignal: deriveRevisionSignal(metadata),
    revisionSource: firstScalar(metadata['esST_checksum']) !== null ? 'esST_checksum' : null,
    sourceLastChangeRaw: latestInfosLastChange(metadata['latestInfos']),
    datasource: firstScalar(metadata['DATASOURCE']),
    reference: firstScalar(entry['reference']),
    ccm2Id: toFiniteNumber(metadata['ccm2Id']),
    callCcm2Id: toFiniteNumber(metadata['callccm2Id']),
    allowPartnerSearch: null,
    sme: null,
  };
}

function toUnifiedRecord(raw: unknown): UnifiedRecord | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const topicDetails = row['TopicDetails'];
  if (topicDetails !== null && typeof topicDetails === 'object' && !Array.isArray(topicDetails)) {
    return unifyTopicDetails(topicDetails as Record<string, unknown>);
  }
  const metadata = row['metadata'];
  if (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return unifySearchEntry(row, metadata as Record<string, unknown>);
  }
  return null;
}

/**
 * Normalize one raw F&T record into a language-bound variant. Fails closed:
 * records without a stable identifier, title, or a supported type are
 * rejected explicitly — never turned into empty opportunities.
 */
export function normalizeFundingTendersRecord(raw: unknown, reference: FundingTendersReferenceData): NormalizationOutcome {
  const unified = toUnifiedRecord(raw);
  if (unified === null) {
    return { ok: false, rejection: { reason: 'MALFORMED_RECORD', detail: 'Record is not a recognized Funding & Tenders shape.' } };
  }
  if (unified.identifier === null) {
    return { ok: false, rejection: { reason: 'MISSING_IDENTIFIER', detail: 'No stable source identifier on the record.' } };
  }
  if (unified.title === null || unified.title.trim().length === 0) {
    return { ok: false, rejection: { reason: 'TITLE_MISSING', detail: `Record ${unified.identifier} has no title.` } };
  }
  const supportedType = unified.type !== null && (FUNDING_SOURCE_TYPES as readonly number[]).includes(unified.type);
  const kind = supportedType ? 'FUNDING' : null;
  if (kind === null) {
    return { ok: false, rejection: { reason: 'TYPE_UNSUPPORTED', detail: `Record ${unified.identifier} has no supported funding type (found ${String(unified.type)}).` } };
  }

  const primaryStatus = unified.rawStatusIds[0] ?? null;
  const statusMapping = mapSourceStatus(primaryStatus, reference);

  const deadlineAt = unified.deadlineRaws.length > 0 ? normalizeSourceDate(unified.deadlineRaws[0] ?? null) : null;
  const publicationAt = normalizeSourceDate(unified.publicationRaw);
  const openingAt = normalizeSourceDate(unified.openingRaw);
  const sourceUrl = unified.url ?? deriveSourceUrl(unified.identifier);
  const sourceLastChangeAt = normalizeSourceOrderSignal(unified.sourceLastChangeRaw);
  // Static topicDetails records carry their order evidence directly; search
  // records receive it (or an explicit rejection) from topicDetails enrichment.
  const sourceOrderSignalStatus: SourceOrderSignalStatus | null =
    unified.recordShape === 'topicDetails'
      ? (sourceLastChangeAt !== null ? 'AUTHORITATIVE_TIMESTAMP' : 'AUTHORITATIVE_NO_HISTORY')
      : null;

  const variant: OpportunityVariantInput = {
    source: 'EU_FUNDING_TENDERS',
    sourceIdentifier: unified.identifier,
    kind,
    language: unified.language,
    title: unified.title.trim(),
    summary: unified.summary,
    eligibilityText: unified.eligibilityText,
    sourceRevisionIdentifier: unified.revisionSignal,
    status: statusMapping.status,
    sourceUrl,
    publicationAt,
    openingAt,
    deadlineAt,
    programme: unified.frameworkProgrammeLabel,
    callIdentifier: unified.callIdentifier,
    authorityName: null,
    buyerName: null,
    cpvCodes: [],
    activityCodes: [],
    sectorHints: [],
    eligibleCountries: [],
    nutsCodes: [],
    placeOfPerformance: null,
    estimatedValueMin: null,
    estimatedValueMax: null,
    fundingAmountMin: unified.budgetTotal,
    fundingAmountMax: unified.budgetTotal,
    currency: null,
    cofinancingRate: null,
    sourceSpecificMetadata: {
      fundingTenders: {
        datasource: unified.datasource,
        reference: unified.reference,
        frameworkProgrammeCode: unified.frameworkProgrammeCode,
        programmeDivisionCode: unified.programmeDivisionCode,
        rawStatusCodes: [...new Set(unified.rawStatusIds)],
        sourceType: unified.type,
        ccm2Id: unified.ccm2Id,
        callCcm2Id: unified.callCcm2Id,
        statusLabel: statusMapping.label,
        revisionSource: unified.revisionSource,
        sourceLastChangeAt,
        sourceOrderSignalStatus,
      },
    },
  };
  return { ok: true, variant };
}
