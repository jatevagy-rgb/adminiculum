/**
 * CONTRACT DATE EXTRACTION — candidate registries.
 *
 * Date-type and provenance codes are validated STRING registries (no Prisma
 * enums) so the taxonomy can grow without a migration, matching the contract
 * library conventions. Only codes listed here are accepted by the service.
 */

/** Candidate date meanings. Contract-level types map onto ContractRecord date
 *  fields; occurrence-level types map onto ClientObligationOccurrence rows. */
export const CONTRACT_DATE_TYPES = new Set([
  'EFFECTIVE',
  'EXPIRY',
  'NEXT_CRITICAL',
  'PAYMENT_DUE',
  'MILESTONE',
  'NOTICE',
  'OTHER',
] as const);

export type ContractDateType = typeof CONTRACT_DATE_TYPES extends Set<infer T> ? T : never;

/** Types written onto ContractRecord via the canonical updateContract service. */
export const CONTRACT_LEVEL_TYPES = new Set<ContractDateType>(['EFFECTIVE', 'EXPIRY', 'NEXT_CRITICAL']);

/** ContractRecord field targeted by a contract-level date type. */
export const CONTRACT_FIELD_BY_TYPE: Record<Extract<ContractDateType, 'EFFECTIVE' | 'EXPIRY' | 'NEXT_CRITICAL'>, 'effectiveDate' | 'expiryDate' | 'nextCriticalDate'> = {
  EFFECTIVE: 'effectiveDate',
  EXPIRY: 'expiryDate',
  NEXT_CRITICAL: 'nextCriticalDate',
};

/** Occurrence types written via the canonical createObligationOccurrence service. */
export const OCCURRENCE_TYPE_BY_DATE_TYPE: Record<string, string> = {
  PAYMENT_DUE: 'PAYMENT',
  MILESTONE: 'MILESTONE',
  NOTICE: 'NOTICE',
  OTHER: 'OTHER',
};

/** Provenance codes. RULE_BASED_EXTRACTION is the deterministic exact-version
 *  text scan; MANUAL is a lawyer-entered candidate; AI_IMPORT is reserved for a
 *  rehydrated AI response. No confidence score is fabricated for any of them. */
export const CANDIDATE_PROVENANCE = new Set([
  'RULE_BASED_EXTRACTION',
  'MANUAL',
  'AI_IMPORT',
] as const);

export type CandidateProvenance = typeof CANDIDATE_PROVENANCE extends Set<infer T> ? T : never;

export function isContractDateType(code: unknown): code is ContractDateType {
  return typeof code === 'string' && CONTRACT_DATE_TYPES.has(code as ContractDateType);
}

export function isCandidateProvenance(code: unknown): code is CandidateProvenance {
  return typeof code === 'string' && CANDIDATE_PROVENANCE.has(code as CandidateProvenance);
}

/** Hungarian review-UI labels for the candidate date types. */
export const CONTRACT_DATE_TYPE_LABELS: Record<ContractDateType, string> = {
  EFFECTIVE: 'Hatálybalépés',
  EXPIRY: 'Lejárat',
  NEXT_CRITICAL: 'Következő kritikus dátum',
  PAYMENT_DUE: 'Fizetési határidő',
  MILESTONE: 'Mérföldkő / teljesítési határidő',
  NOTICE: 'Felmondási / értesítési határidő',
  OTHER: 'Egyéb szerződéses határidő',
};

export const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Jóváhagyásra vár',
  CONFIRMED: 'Megerősítve',
  REJECTED: 'Elutasítva',
};
