/**
 * GWO-2 — TED notice normalization.
 *
 * Raw TED notice -> one OpportunityVariantInput per actionable scope
 * (procedure + lot; procedure-level when the notice has no lot).
 *
 * Mapping rules (source-supported only):
 * - status is the authoritative notice-type family mapping, never derived
 *   from title keywords or deadlines: cn-* OPEN, can-* AWARDED, pin-*
 *   FORTHCOMING, everything else UNKNOWN;
 * - multilingual text maps ({ lang3: [strings] }) are resolved with the
 *   service display policy HU > EN > deterministic lexical; no translation;
 * - deadline/publication dates like `2025-09-04+02:00` carry date-only
 *   semantics and stay date-only (no timezone shift, no fabricated precision);
 * - per-lot arrays (values, currency, SME, BT-821, deadlines) are read at the
 *   lot index only — never broadcast across lots from multi-entry arrays; a
 *   single-entry array expresses one notice-level value and applies to every
 *   scope of that notice (observed live: 4 lots with 4 values share one
 *   `estimated-value-cur-lot` entry);
 * - selection-criteria metadata (BT-821, BT-809, BT-750) is preserved
 *   verbatim when returned; NO eligibility interpretation, no criterion
 *   objects, no legal conclusion.
 */

import type { OpportunityVariantInput, NormalizationRejection } from '../../normalize/variant.ts';
import type { SourceStatus } from '../../types.ts';
import { normalizeSourceTimestamp } from '../../normalize/time.ts';
import type { NoticeIdentity } from './identity.ts';
import {
  deriveLotIdentifiers,
  deriveNoticeIdentity,
  deriveProcedureIdentifier,
  deriveRevisionIdentity,
  deriveScopeIdentifier,
  deriveSourceUrl,
} from './identity.ts';

export interface TedNormalizationBatch {
  variants: OpportunityVariantInput[];
  rejections: NormalizationRejection[];
}

const DATE_WITH_OFFSET = /^(\d{4}-\d{2}-\d{2})[+-]\d{2}:\d{2}$/;

function scalarString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = scalarString(value);
    return single !== null ? [single] : [];
  }
  const out: string[] = [];
  for (const entry of value) {
    const scalar = scalarString(entry);
    if (scalar !== null) out.push(scalar);
  }
  return out;
}

function numberArray(value: unknown): (number | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const scalar = scalarString(entry);
    if (scalar === null) return null;
    const parsed = Number(scalar);
    return Number.isFinite(parsed) ? parsed : null;
  });
}

function booleanArray(value: unknown): (boolean | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === 'boolean' ? entry : null));
}

function valueAt<T>(values: readonly (T | null)[], index: number): T | null {
  if (index < 0 || index >= values.length) return null;
  return values[index] ?? null;
}

/**
 * Per-scope value resolution: a single-entry array is the notice-level value
 * and applies to every scope; multi-entry arrays are strictly lot-indexed.
 */
function scopeValue<T>(values: readonly (T | null)[], index: number, hasLots: boolean): T | null {
  if (!hasLots) return valueAt(values, 0);
  if (values.length === 1) return valueAt(values, 0);
  return valueAt(values, index);
}

/**
 * Date-only source values with an offset (`2025-09-04+02:00`) express a
 * calendar date; the date is preserved as-is (no instant conversion, no
 * assumption about the missing time). Full ISO timestamps fall through the
 * shared normalizer, which never assumes a timezone.
 */
export function normalizeTedDate(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  const dateOnly = DATE_WITH_OFFSET.exec(trimmed);
  if (dateOnly) return dateOnly[1] ?? null;
  return normalizeSourceTimestamp(trimmed).value;
}

const TITLE_LANG_PREFERENCE = ['hun', 'eng'] as const;
const LANG3_TO_TAG: Record<string, string> = { hun: 'hu', eng: 'en', deu: 'de' };

interface SelectedText {
  language: string;
  value: string;
}

/** HU > EN > deterministic lexical from a { lang3: [strings] } map. */
export function selectMultilingualText(value: unknown): SelectedText | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const map = value as Record<string, unknown>;
  const available = Object.keys(map)
    .filter((key) => stringArray(map[key]).length > 0)
    .sort();
  if (available.length === 0) return null;
  let chosen: string | null = null;
  for (const lang of TITLE_LANG_PREFERENCE) {
    if (available.includes(lang)) {
      chosen = lang;
      break;
    }
  }
  if (chosen === null) chosen = available[0] ?? null;
  if (chosen === null) return null;
  const text = stringArray(map[chosen])[0];
  if (text === undefined) return null;
  return { language: LANG3_TO_TAG[chosen] ?? chosen, value: text };
}

/** Authoritative notice-type family -> canonical status. Unknown families stay UNKNOWN. */
export function mapNoticeTypeToStatus(noticeType: string | null): SourceStatus {
  if (noticeType === null) return 'UNKNOWN';
  if (noticeType.startsWith('cn')) return 'OPEN';
  if (noticeType.startsWith('can')) return 'AWARDED';
  if (noticeType.startsWith('pin')) return 'FORTHCOMING';
  return 'UNKNOWN';
}

function rejection(reason: string, detail: string | null): TedNormalizationBatch {
  return { variants: [], rejections: [{ reason, detail }] };
}

function buildScopeVariant(
  notice: Record<string, unknown>,
  identity: NoticeIdentity,
  procedureIdentifier: string,
  lotIdentifier: string | null,
  lotIndex: number,
  revisionIdentity: string | null,
  sourceUrl: string | null,
): OpportunityVariantInput | NormalizationRejection {
  const title = selectMultilingualText(notice['notice-title']);
  if (title === null) {
    return { reason: 'TITLE_MISSING', detail: `Scope ${procedureIdentifier}::${lotIdentifier ?? '@procedure'} has no title.` };
  }
  if (sourceUrl === null) {
    return { reason: 'SOURCE_URL_MISSING', detail: `Scope ${procedureIdentifier}::${lotIdentifier ?? '@procedure'} has no notice identity for a URL.` };
  }
  const buyer = selectMultilingualText(notice['buyer-name']);

  const deadlineRaws = stringArray(notice['deadline-receipt-tender-date-lot']);
  const estimatedValues = numberArray(notice['estimated-value-lot']);
  const currencies = stringArray(notice['estimated-value-cur-lot']);
  const smeValues = booleanArray(notice['sme-lot']);
  const procurementDocumentSources = stringArray(notice['BT-821-Lot']);
  const criterionTypes = stringArray(notice['BT-809-Lot']);
  const criterionDescriptions = stringArray(notice['BT-750-Lot']);

  const hasLots = lotIdentifier !== null;
  const value = scopeValue(estimatedValues, lotIndex, hasLots);
  const currency = scopeValue(currencies, lotIndex, hasLots);
  const deadlineRaw = scopeValue(deadlineRaws, lotIndex, hasLots);
  const sme = scopeValue(smeValues, lotIndex, hasLots);
  const documentsSource = scopeValue(procurementDocumentSources, lotIndex, hasLots);
  const criterionType = scopeValue(criterionTypes, lotIndex, hasLots);
  const criterionDescription = scopeValue(criterionDescriptions, lotIndex, hasLots);

  return {
    source: 'TED',
    sourceIdentifier: deriveScopeIdentifier(procedureIdentifier, lotIdentifier),
    kind: 'PROCUREMENT',
    language: title.language,
    title: title.value,
    summary: null,
    eligibilityText: null,
    sourceRevisionIdentifier: revisionIdentity,
    status: mapNoticeTypeToStatus(identity.noticeType),
    sourceUrl,
    publicationAt: normalizeTedDate(scalarString(notice['publication-date'])),
    openingAt: null,
    deadlineAt: normalizeTedDate(deadlineRaw),
    programme: null,
    callIdentifier: null,
    authorityName: null,
    buyerName: buyer?.value ?? null,
    cpvCodes: dedupe(stringArray(notice['classification-cpv'])),
    activityCodes: [],
    sectorHints: [],
    eligibleCountries: [],
    nutsCodes: dedupe([
      ...stringArray(notice['place-of-performance']),
      ...stringArray(notice['place-of-performance-country-lot']),
    ]),
    placeOfPerformance: null,
    estimatedValueMin: value,
    estimatedValueMax: value,
    fundingAmountMin: null,
    fundingAmountMax: null,
    currency,
    cofinancingRate: null,
    sourceSpecificMetadata: {
      ted: {
        publicationNumber: identity.publicationNumber,
        noticeVersion: identity.noticeVersion,
        noticeType: identity.noticeType,
        procedureIdentifier,
        lotId: lotIdentifier,
        changeReasonCode: scalarString(notice['change-reason-code']),
        changeReference: scalarString(notice['BT-758-notice']),
        procurementDocumentsSource: documentsSource,
        smeSuitability: sme,
        criterionType,
        criterionDescription,
      },
    },
  };
}

function isRejection(value: OpportunityVariantInput | NormalizationRejection): value is NormalizationRejection {
  return (value as NormalizationRejection).reason !== undefined;
}

/**
 * Normalize one raw TED notice into zero or more scope variants.
 * Fails closed: no procedure identity rejects the whole notice; a malformed
 * lot is rejected independently while valid lots continue; identity is never
 * derived from titles, URLs, or reference numbers.
 */
export function normalizeTedNotice(notice: unknown): TedNormalizationBatch {
  if (notice === null || typeof notice !== 'object' || Array.isArray(notice)) {
    return rejection('MALFORMED_RECORD', 'Notice is not a TED notice object.');
  }
  const row = notice as Record<string, unknown>;
  const identity = deriveNoticeIdentity(row);
  const procedureIdentifier = deriveProcedureIdentifier(row);
  if (procedureIdentifier === null) {
    return rejection('MISSING_PROCEDURE_IDENTITY', 'Notice has no procedure-identifier.');
  }
  const sourceUrl = deriveSourceUrl(row, identity.publicationNumber);
  const revisionIdentity = deriveRevisionIdentity(identity);
  const lots = deriveLotIdentifiers(row);

  const variants: OpportunityVariantInput[] = [];
  const rejections: NormalizationRejection[] = [];

  if (lots.length === 0) {
    const built = buildScopeVariant(row, identity, procedureIdentifier, null, 0, revisionIdentity, sourceUrl);
    if (isRejection(built)) rejections.push(built);
    else variants.push(built);
    return { variants, rejections };
  }

  for (let index = 0; index < lots.length; index += 1) {
    const lotIdentifier = lots[index] ?? null;
    if (lotIdentifier === null) {
      rejections.push({ reason: 'MALFORMED_LOT', detail: `Procedure ${procedureIdentifier} has an empty lot identifier at index ${index}.` });
      continue;
    }
    const built = buildScopeVariant(row, identity, procedureIdentifier, lotIdentifier, index, revisionIdentity, sourceUrl);
    if (isRejection(built)) rejections.push(built);
    else variants.push(built);
  }
  return { variants, rejections };
}
