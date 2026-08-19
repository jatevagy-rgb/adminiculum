/**
 * ORGANIZATION (Phase 3) — extensible string-code registries.
 * Responsibility types and person-document role codes expand post-release, so
 * they are validated STRING codes (not Prisma enums) — no migration needed.
 */

export const PERSON_RESPONSIBILITY_TYPES = new Set([
  'MANAGEMENT',
  'FINANCE',
  'CONTRACT_OWNER',
  'OBLIGATION_OWNER',
  'DATA_PROTECTION',
  'APPROVAL',
  'OPERATIONS',
  'HR',
  'OTHER',
]);

export const PERSON_DOCUMENT_ROLES = new Set([
  'EMPLOYMENT_CONTRACT',
  'EMPLOYMENT_AMENDMENT',
  'JOB_DESCRIPTION',
  'NDA',
  'POLICY_ACKNOWLEDGEMENT',
]);

export function isResponsibilityType(code: unknown): boolean {
  return typeof code === 'string' && PERSON_RESPONSIBILITY_TYPES.has(code);
}
export function isPersonDocumentRole(code: unknown): boolean {
  return typeof code === 'string' && PERSON_DOCUMENT_ROLES.has(code);
}
