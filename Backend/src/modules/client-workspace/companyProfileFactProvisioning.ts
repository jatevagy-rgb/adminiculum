/**
 * COMPANY PROFILE 2.0 — CANONICAL FACT PROVISIONING
 *
 * Single declarative source for which canonical company facts must exist as
 * `fact_definitions` rows. It is consumed by:
 *   - the additive, idempotent provisioning migration (SQL generated from this
 *     module so the two can never drift), and
 *   - tests that assert every registry question has a provisioning row.
 *
 * The seven legacy keys already provisioned by
 * 20260914100000_provision_company_profile_fact_definitions are intentionally
 * EXCLUDED here: they are retained as-is and reconciled via
 * `LEGACY_FACT_KEY_ALIASES`. `employee_count` is included because it is already
 * canonical; the migration treats the existing compatible row as a no-op.
 */

import { CANONICAL_COMPANY_FACTS, type CompanyProfileFactDefinition } from './companyProfileFactCatalog';

export type CompanyProfileProvisionedValueType = 'BOOLEAN' | 'ENUM' | 'MULTI_ENUM' | 'NUMBER' | 'STRING' | 'JURISDICTION';

export interface CompanyProfileFactProvisioningRow {
  readonly key: string;
  readonly questionKey: string;
  readonly valueType: CompanyProfileProvisionedValueType;
  readonly allowedEnumValues: readonly string[] | null;
  readonly determinationMethod: 'USER_PROVIDED' | 'DERIVED' | 'LEGAL_CLASSIFICATION_REQUIRED';
  readonly overlapPolicy: 'ALLOW' | 'DISALLOW';
  readonly temporalPolicy: 'OBSERVATION';
  readonly baseline: boolean;
  readonly derived: boolean;
}

/** Keys provisioned by the legacy migration — never re-provisioned here. */
export const LEGACY_PROVISIONED_FACT_KEYS: readonly string[] = [
  'company_main_activity',
  'company_operating_country',
  'company_regulated_activity',
  'company_sensitive_data_usage',
  'company_important_it_system',
  'company_ai_usage',
  'company_export_activity',
];

const LEGACY_PROVISIONED = new Set(LEGACY_PROVISIONED_FACT_KEYS);

export const PROVISIONED_COMPANY_FACTS: readonly CompanyProfileFactProvisioningRow[] = CANONICAL_COMPANY_FACTS
  .filter((fact) => !LEGACY_PROVISIONED.has(fact.factKey))
  .map((fact: CompanyProfileFactDefinition): CompanyProfileFactProvisioningRow => ({
    key: fact.factKey,
    questionKey: fact.factKey,
    valueType: fact.valueType,
    allowedEnumValues: fact.allowedEnumValues ?? null,
    determinationMethod: fact.determinationMethod,
    overlapPolicy: fact.cardinality === 'multi' ? 'ALLOW' : 'DISALLOW',
    temporalPolicy: 'OBSERVATION',
    baseline: fact.baseline,
    derived: fact.derived,
  }));

const PROVISIONED_BY_KEY = new Map(PROVISIONED_COMPANY_FACTS.map((row) => [row.key, row]));

export function getProvisionedCompanyFact(key: string): CompanyProfileFactProvisioningRow | undefined {
  return PROVISIONED_BY_KEY.get(key);
}

export function isProvisionedCompanyFactKey(key: string): boolean {
  return PROVISIONED_BY_KEY.has(key);
}
