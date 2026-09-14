import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COMPANY_PROFILE_QUESTIONS, getCompanyProfileQuestionForDefinition } from '../src/modules/client-workspace/companyProfileQuestionRegistry';

describe('company profile question registry', () => {
  it('keeps the server-controlled baseline typed and sectioned', () => {
    expect(COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'employee_count')).toMatchObject({
      valueType: 'NUMBER',
      scopeType: 'COMPANY',
      section: 'PEOPLE',
      baseline: true,
    });
    expect(COMPANY_PROFILE_QUESTIONS.filter((question) => question.baseline).map((question) => question.questionKey)).toEqual(['employee_count', 'company_main_activity', 'company_operating_country']);
    expect(COMPANY_PROFILE_QUESTIONS.some((question) => question.valueType === 'BOOLEAN')).toBe(true);
    expect(COMPANY_PROFILE_QUESTIONS.some((question) => question.valueType === 'STRING')).toBe(true);
  });

  it('only maps active canonical definitions with compatible typed metadata', () => {
    expect(getCompanyProfileQuestionForDefinition({ key: 'employee_count', valueType: 'NUMBER' })).toMatchObject({ questionKey: 'employee_count' });
    expect(getCompanyProfileQuestionForDefinition({ key: 'employee_count', valueType: 'STRING' })).toBeNull();
    expect(getCompanyProfileQuestionForDefinition({ key: 'legacy_employee_count', questionKey: 'employee_count', valueType: 'NUMBER' })).toBeNull();
    expect(getCompanyProfileQuestionForDefinition({ key: 'employee_count', questionKey: 'legacy_employee_count', valueType: 'NUMBER' })).toBeNull();
    expect(getCompanyProfileQuestionForDefinition({ key: 'internal_only', questionKey: 'internal_only', valueType: 'STRING' })).toBeNull();
  });

  it('has an additive idempotent data migration for every non-employee baseline key', () => {
    const migration = readFileSync(path.resolve(__dirname, '../prisma/migrations/20260914100000_provision_company_profile_fact_definitions/migration.sql'), 'utf8');
    for (const question of COMPANY_PROFILE_QUESTIONS.filter((item) => item.questionKey !== 'employee_count')) {
      expect(migration).toContain(`'${question.factDefinitionKey}'`);
      expect(migration).toContain(`'${question.valueType}'`);
    }
    expect(migration).toContain('IF FOUND THEN');
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain('INSERT INTO "fact_definitions"');
    expect(migration).toContain('"temporalPolicy"');
    expect(migration).toContain('existing_definition."temporalPolicy"::text <> \'OBSERVATION\'');
    expect(migration).not.toMatch(/UPDATE\s+"fact_definitions"[\s\S]*temporalPolicy/i);
  });

});
