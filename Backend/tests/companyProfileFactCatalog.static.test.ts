import {
  CANONICAL_COMPANY_FACTS,
  CANONICAL_COMPANY_FACT_KEYS,
  BASELINE_COMPANY_FACT_KEYS,
  DERIVED_COMPANY_FACT_KEYS,
  assertFactReconciliationIntegrity,
  canonicalKeyForLegacyFactKey,
  getCanonicalCompanyFact,
  isLegacyFactKeyAlias,
  legacyFactClarificationHint,
  legacyFactRelationship,
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

  it('marks only truly deterministic derivations and fails SME classification closed', () => {
    expect(DERIVED_COMPANY_FACT_KEYS).toEqual(expect.arrayContaining(['has_employees', 'b2c_sales', 'public_sector_customer', 'eu_sme_size_class']));
    expect(getCanonicalCompanyFact('has_employees')?.derivation).toBe('HAS_EMPLOYEES');
    // SME classification requires partner/linked-enterprise aggregation and must NOT be derived.
    expect(getCanonicalCompanyFact('eu_sme_size_class')?.determinationMethod).toBe('LEGAL_CLASSIFICATION_REQUIRED');
    expect(getCanonicalCompanyFact('eu_sme_size_class')?.derivation).toBeNull();
    expect(DERIVED_COMPANY_FACT_KEYS).not.toContain('sme_size_class');
    // Sector-like facts must not pretend to be deterministically derivable.
    expect(getCanonicalCompanyFact('nis2_sector')?.derivation).toBeNull();
    expect(getCanonicalCompanyFact('nis2_sector')?.determinationMethod).toBe('LEGAL_CLASSIFICATION_REQUIRED');
    expect(getCanonicalCompanyFact('ai_use')?.baseline).toBe(true);
    expect(BASELINE_COMPANY_FACT_KEYS.length).toBeGreaterThan(20);
  });

  it('validates the question catalogue against the fact dictionary', () => {
    expect(() => assertCompanyProfileCatalogIntegrity()).not.toThrow();
  });

  it('reconciles existing master fact keys by classified relationship, not blind aliasing', () => {
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
      const relationship = legacyFactRelationship(key);
      expect(relationship).toBeDefined();
      expect(getCanonicalCompanyFact(relationship?.canonicalKey ?? '')).toBeDefined();
    }

    // REQUIRED PROOFS: these legacy keys must NOT be treated as aliases.
    for (const legacyKey of ['company_main_activity', 'company_operating_country', 'company_export_activity']) {
      expect(canonicalKeyForLegacyFactKey(legacyKey)).toBeUndefined();
      expect(isLegacyFactKeyAlias(legacyKey)).toBe(false);
      expect(legacyFactRelationship(legacyKey)?.compatibility).not.toBe('EXACT_EQUIVALENT');
    }
    expect(legacyFactRelationship('company_main_activity')?.compatibility).toBe('DIFFERENT');
    expect(legacyFactRelationship('company_operating_country')?.compatibility).toBe('PARTIAL_OVERLAP');
    expect(legacyFactRelationship('company_export_activity')?.compatibility).toBe('PARTIAL_OVERLAP');
    // The four reviewed keys are related but not silently equal.
    for (const legacyKey of ['company_regulated_activity', 'company_sensitive_data_usage', 'company_important_it_system', 'company_ai_usage']) {
      expect(legacyFactRelationship(legacyKey)?.compatibility).toBe('PARTIAL_OVERLAP');
      expect(canonicalKeyForLegacyFactKey(legacyKey)).toBeUndefined();
    }
    // Only a genuine identity may resolve transparently.
    expect(canonicalKeyForLegacyFactKey('employee_count')).toBe('employee_count');
    expect(isLegacyFactKeyAlias('employee_count')).toBe(false);
    // Hints are allowed for some overlaps but never resolve the canonical fact.
    expect(legacyFactClarificationHint('company_main_activity')?.canonicalKey).toBe('primary_teaor25_code');
    expect(legacyFactClarificationHint('company_export_activity')).toBeUndefined();
  });
});
