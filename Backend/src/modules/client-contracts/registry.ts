/**
 * CONTRACT LIBRARY (Phase 2) — extensible string-code registries.
 *
 * Taxonomies that will expand post-release (contract types, party roles,
 * obligation source/trigger/frequency, entitlement types) are validated STRING
 * codes, NOT Prisma enums, so new categories need no migration. Only codes
 * listed here are accepted on create/update.
 */

export const CONTRACT_TYPES = new Set([
  'B2B_SUPPLY',
  'SERVICE',
  'LEASE',
  'EMPLOYMENT',
  'FINANCING',
  'NDA',
  'PARTNERSHIP',
  'IT_SYSTEM',
  'SALES',
  'PURCHASE',
  'OTHER',
]);

export const CONTRACT_PARTY_ROLES = new Set([
  'CUSTOMER',
  'SUPPLIER',
  'PARTNER',
  'LEASOR',
  'LESSEE',
  'LENDER',
  'BORROWER',
  'EMPLOYER',
  'EMPLOYEE',
  'OTHER',
]);

export const OBLIGATION_SOURCE_TYPES = new Set([
  'CONTRACT',
  // future: LEGAL_REQUIREMENT
]);

export const OBLIGATION_TRIGGER_TYPES = new Set([
  'DATE',
  'RECURRING',
  'EVENT',
]);

export const OBLIGATION_FREQUENCIES = new Set([
  'ONCE',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
  'CUSTOM',
]);

export const ENTITLEMENT_TYPES = new Set([
  'PRICE_INDEXATION',
  'AUDIT_RIGHT',
  'TERMINATION_RIGHT',
  'PENALTY_CLAIM',
  'GUARANTEE_CALL',
  'RENEWAL_OPTION',
  'EXCLUSIVITY',
]);

export function isContractType(code: unknown): boolean {
  return typeof code === 'string' && CONTRACT_TYPES.has(code);
}
export function isPartyRole(code: unknown): boolean {
  return typeof code === 'string' && CONTRACT_PARTY_ROLES.has(code);
}
export function isObligationSourceType(code: unknown): boolean {
  return typeof code === 'string' && OBLIGATION_SOURCE_TYPES.has(code);
}
export function isObligationTriggerType(code: unknown): boolean {
  return typeof code === 'string' && OBLIGATION_TRIGGER_TYPES.has(code);
}
export function isObligationFrequency(code: unknown): boolean {
  return typeof code === 'string' && OBLIGATION_FREQUENCIES.has(code);
}
export function isEntitlementType(code: unknown): boolean {
  return typeof code === 'string' && ENTITLEMENT_TYPES.has(code);
}
