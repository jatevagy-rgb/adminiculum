import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PREEXISTING_COMPANY_FACT_KEYS,
  PROVISIONED_COMPANY_FACTS,
  getProvisionedCompanyFact,
} from '../src/modules/client-workspace/companyProfileFactProvisioning';
import { CANONICAL_COMPANY_FACTS } from '../src/modules/client-workspace/companyProfileFactCatalog';
import { COMPANY_PROFILE_QUESTIONS, LEGACY_COMPANY_PROFILE_QUESTION_KEYS } from '../src/modules/client-workspace/companyProfileQuestionRegistry';

const MIGRATION = path.resolve(__dirname, '../prisma/migrations/20260914111500_provision_canonical_company_profile_facts/migration.sql');

describe('canonical company fact provisioning', () => {
  it('provisions every canonical fact exactly once and never re-provisions pre-existing keys', () => {
    const expectedKeys = CANONICAL_COMPANY_FACTS.filter((fact) => !PREEXISTING_COMPANY_FACT_KEYS.includes(fact.factKey)).map((fact) => fact.factKey);
    expect(PROVISIONED_COMPANY_FACTS.map((row) => row.key)).toEqual(expectedKeys);
    expect(new Set(PROVISIONED_COMPANY_FACTS.map((row) => row.key)).size).toBe(PROVISIONED_COMPANY_FACTS.length);
    for (const preexisting of PREEXISTING_COMPANY_FACT_KEYS) {
      expect(getProvisionedCompanyFact(preexisting)).toBeUndefined();
    }
    // employee_count already exists at runtime and is owned by the demo-Kft
    // reconciliation migration; provisioning it here would break that guard.
    expect(getProvisionedCompanyFact('employee_count')).toBeUndefined();
    for (const row of PROVISIONED_COMPANY_FACTS) {
      expect(row.key).not.toBe('employee_count');
    }
  });

  it('stores multi-cardinality facts with an overlapping multi-value shape', () => {
    const operatingCountries = getProvisionedCompanyFact('operating_countries');
    expect(operatingCountries).toMatchObject({ valueType: 'MULTI_ENUM', overlapPolicy: 'ALLOW' });
    const additionalTeaor = getProvisionedCompanyFact('additional_teaor25_codes');
    expect(additionalTeaor).toMatchObject({ valueType: 'MULTI_ENUM', overlapPolicy: 'ALLOW' });
    for (const fact of CANONICAL_COMPANY_FACTS.filter((item) => item.cardinality === 'multi')) {
      expect(getProvisionedCompanyFact(fact.factKey)).toMatchObject({ valueType: 'MULTI_ENUM', overlapPolicy: 'ALLOW' });
    }
  });

  it('keeps enum option sets and derived classification explicit', () => {
    expect(getProvisionedCompanyFact('company_legal_form')?.allowedEnumValues?.length).toBeGreaterThan(5);
    for (const row of PROVISIONED_COMPANY_FACTS) {
      if (row.valueType === 'ENUM') expect(Array.isArray(row.allowedEnumValues)).toBe(true);
      expect(row.temporalPolicy).toBe('OBSERVATION');
    }
    // Derived and legally-classified facts are provisioned but never asked directly.
    expect(getProvisionedCompanyFact('has_employees')).toMatchObject({ determinationMethod: 'DERIVED', derived: true });
    expect(getProvisionedCompanyFact('nis2_sector')).toMatchObject({ determinationMethod: 'LEGAL_CLASSIFICATION_REQUIRED' });
  });

  it('gives every registry question a provisioned definition', () => {
    for (const question of COMPANY_PROFILE_QUESTIONS) {
      const provisioned = getProvisionedCompanyFact(question.factDefinitionKey);
      if (provisioned) {
        expect(provisioned.valueType).toBe(question.valueType);
        expect(provisioned.questionKey).toBe(question.questionKey);
        continue;
      }
      // Otherwise it must be a key that already exists outside this migration.
      expect(PREEXISTING_COMPANY_FACT_KEYS).toContain(question.factDefinitionKey);
      expect(LEGACY_COMPANY_PROFILE_QUESTION_KEYS).toContain(question.questionKey);
    }
  });

  it('keeps the generated migration in sync with the provisioning source', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    for (const row of PROVISIONED_COMPANY_FACTS) {
      expect(migration).toContain(`'${row.key}'`);
      expect(migration).toContain(`'${row.valueType}'`);
    }
    expect(migration).toContain('IF FOUND THEN');
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain('INSERT INTO "fact_definitions"');
    expect(migration).toContain('"temporalPolicy"');
    expect(migration).not.toMatch(/UPDATE\s+"fact_definitions"[\s\S]*temporalPolicy/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"fact_definitions"/i);
  });
});
