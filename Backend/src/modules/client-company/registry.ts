/**
 * COMPANY FOUNDATION — extensible string-code registries.
 *
 * Taxonomies that will expand post-release (fact types, milestone types,
 * assessment types) are validated STRING codes, NOT Prisma enums. New packs
 * (SUPPLIER_READINESS, AI_GOVERNANCE, ...) only extend these sets in code —
 * never a database migration. Only the codes listed here are accepted on
 * create; unknown codes are rejected server-side.
 */

export const COMPANY_FACT_TYPES = new Set([
  'EMPLOYEE_COUNT',
  'REVENUE_BAND',
  'MAIN_ACTIVITY',
  'OPERATING_COUNTRY',
  'SITE',
  'EXPORT_ACTIVITY',
  'OWNERSHIP',
  'MANAGEMENT_STRUCTURE',
  'REGULATED_ACTIVITY',
  'CRITICAL_CUSTOMER',
  'CRITICAL_SUPPLIER',
  'FINANCING',
  'IMPORTANT_IT_SYSTEM',
  'SENSITIVE_DATA_USAGE',
  'AI_USAGE',
  'CERTIFICATION',
]);

export const COMPANY_MILESTONE_TYPES = new Set([
  'NEW_SITE',
  'FIRST_EXPORT',
  'NEW_COUNTRY',
  'FINANCING',
  'INVESTOR',
  'NEW_BUSINESS_UNIT',
  'ACQUISITION',
  'NEW_GROUP_COMPANY',
  'IMPORTANT_IT_SYSTEM',
  'CRITICAL_LARGE_CUSTOMER',
]);

export const COMPANY_ASSESSMENT_TYPES = new Set([
  'COMPANY_OPERATING',
  'MANAGEMENT_MATURITY',
  'CONTRACT_GOVERNANCE',
  'HR_GOVERNANCE',
  'DIGITAL_MATURITY',
]);

export function isCompanyFactType(code: unknown): boolean {
  return typeof code === 'string' && COMPANY_FACT_TYPES.has(code);
}

export function isCompanyMilestoneType(code: unknown): boolean {
  return typeof code === 'string' && COMPANY_MILESTONE_TYPES.has(code);
}

export function isCompanyAssessmentType(code: unknown): boolean {
  return typeof code === 'string' && COMPANY_ASSESSMENT_TYPES.has(code);
}
