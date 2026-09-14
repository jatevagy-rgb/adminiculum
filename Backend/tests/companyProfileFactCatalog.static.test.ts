import {
  CANONICAL_COMPANY_FACTS,
  CANONICAL_COMPANY_FACT_KEYS,
  BASELINE_COMPANY_FACT_KEYS,
  DERIVED_COMPANY_FACT_KEYS,
  LEGACY_FACT_KEY_ALIASES,
  assertFactReconciliationIntegrity,
  canonicalKeyForLegacyFactKey,
  getCanonicalCompanyFact,
  isLegacyFactKeyAlias,
} from '../src/modules/client-workspace/companyProfileFactCatalog';
import { assertCompanyProfileCatalogIntegrity } from '../src/modules/client-workspace/companyProfileQuestionCatalog';

describe('canonical company fact catalogue', () => {
  it('exposes the full workbook fact dictionary exactly once', () => {
    expect(CANONICAL_COMPANY_FACTS).toHaveLength(82);
    expect(new Set(CANONICAL_COMPANY_FACT_KEYS).size).toBe(82);
  });

  it('keeps every fact structural metadata valid', () => {
    const allowedValueTypes = new Set(['BOOLEAN', 'ENUM', 'MULTI_ENUM', 'NUMBER', 'STRING', 'JURISDICTION']);
    for (const fact of CANONICAL_COMPANY_FACTS) {
      expect(fact.factKey).toMatch(/^[a-z0-9_]+$/);
      expect(fact.labelHu.length).toBeGreaterThan(0);
      expect(allowedValueTypes.has(fact.valueType)).toBe(true);
      if (fact.valueType === 'ENUM') {
        expect(Array.isArray(fact.allowedEnumValues)).toBe(true);
        expect(fact.allowedEnumValues?.length).toBeGreaterThan(0);
      }
      if (fact.valueType === 'MULTI_ENUM' && fact.allowedEnumValues) {
        expect(fact.allowedEnumValues.length).toBeGreaterThan(0);
      }
      if (fact.cardinality === 'multi') expect(fact.derivation === null || typeof fact.derivation === 'string').toBe(true);
    }
  });

  it('marks deterministic derivations and routes the rest to classification', () => {
    expect(DERIVED_COMPANY_FACT_KEYS).toEqual(expect.arrayContaining(['has_employees', 'b2c_sales', 'public_sector_customer', 'eu_sme_size_class']));
    expect(getCanonicalCompanyFact('has_employees')?.derivation).toBe('HAS_EMPLOYEES');
    expect(getCanonicalCompanyFact('eu_sme_size_class')?.determinationMethod).toBe('DERIVED');
    // Sector-like facts must not pretend to be deterministically derivable.
    expect(getCanonicalCompanyFact('nis2_sector')?.derivation).toBeNull();
    expect(getCanonicalCompanyFact('nis2_sector')?.determinationMethod).toBe('LEGAL_CLASSIFICATION_REQUIRED');
    expect(getCanonicalCompanyFact('ai_use')?.baseline).toBe(true);
    expect(BASELINE_COMPANY_FACT_KEYS.length).toBeGreaterThan(20);
  });

  it('validates the question catalogue against the fact dictionary', () => {
    expect(() => assertCompanyProfileCatalogIntegrity()).not.toThrow();
  });

  it('reconciles existing master fact keys instead of creating a second silo', () => {
    expect(() => assertFactReconciliationIntegrity()).not.toThrow();
    const masterProvisionedKeys = [
      'employee_count',
      'company_main_activity',
      'company_operating_country',
      'company_regulated_activity',
      'company_sensitive_data_usage',
      'company_important_it_system',
      'company_ai_usage',
      'company_export_activity',
    ];
    for (const key of masterProvisionedKeys) {
      expect(LEGACY_FACT_KEY_ALIASES[key]).toBeDefined();
      expect(getCanonicalCompanyFact(LEGACY_FACT_KEY_ALIASES[key])).toBeDefined();
    }
    expect(canonicalKeyForLegacyFactKey('company_main_activity')).toBe('primary_teaor25_code');
    expect(isLegacyFactKeyAlias('company_ai_usage')).toBe(true);
    expect(isLegacyFactKeyAlias('employee_count')).toBe(false);
  });
});
