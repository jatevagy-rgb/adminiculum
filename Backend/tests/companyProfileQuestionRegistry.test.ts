import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COMPANY_PROFILE_QUESTIONS, LEGACY_COMPANY_PROFILE_QUESTION_KEYS, getCompanyProfileQuestionForDefinition } from '../src/modules/client-workspace/companyProfileQuestionRegistry';

describe('company profile question registry', () => {
  it('keeps the server-controlled baseline typed and sectioned', () => {
    expect(COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'employee_count')).toMatchObject({
      valueType: 'NUMBER',
      integerOnly: true,
      scopeType: 'COMPANY',
      section: 'PEOPLE',
      baseline: true,
    });
    expect(COMPANY_PROFILE_QUESTIONS.filter((question) => question.baseline).map((question) => question.questionKey)).toEqual(['employee_count', 'company_main_activity', 'company_operating_country']);
    expect(COMPANY_PROFILE_QUESTIONS.some((question) => question.valueType === 'BOOLEAN')).toBe(true);
    expect(COMPANY_PROFILE_QUESTIONS.some((question) => question.valueType === 'STRING')).toBe(true);
    expect(COMPANY_PROFILE_QUESTIONS.some((question) => question.valueType === 'MULTI_ENUM')).toBe(true);
    expect(COMPANY_PROFILE_QUESTIONS.filter((question) => question.integerOnly).map((question) => question.questionKey)).toEqual(['employee_count', 'sites_count']);
  });

  it('appends the canonical Company Profile 2.0 questions without replacing the legacy allow-list', () => {
    for (const key of LEGACY_COMPANY_PROFILE_QUESTION_KEYS) {
      expect(COMPANY_PROFILE_QUESTIONS.some((question) => question.questionKey === key)).toBe(true);
    }
    const employees = COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'employee_count');
    expect(employees).toMatchObject({ label: 'Munkavállalók száma' });
    // TEÁOR'25 replaces free-text-only authority as the structured activity path.
    const primaryTeaor = COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'primary_teaor25_code');
    expect(primaryTeaor).toMatchObject({ valueType: 'STRING', codeCatalog: 'TEAOR25', discoveryBaseline: true, baseline: false });
    const additionalTeaor = COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'additional_teaor25_codes');
    expect(additionalTeaor).toMatchObject({ valueType: 'MULTI_ENUM', codeCatalog: 'TEAOR25', discoveryBaseline: true });
    // Adaptive questions carry a declarative gate and a client-facing "why".
    expect(COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'children_data')).toMatchObject({ module: 'DATA', discoveryBaseline: false });
    expect(COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'special_category_data')?.showWhen).not.toBeNull();
    expect(COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'ai_use')?.why).toBeTruthy();
    expect(COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'ai_use')?.showWhen).toBeNull();
  });

  it('only maps active canonical definitions with compatible typed metadata', () => {
    expect(getCompanyProfileQuestionForDefinition({ key: 'employee_count', valueType: 'NUMBER' })).toMatchObject({ questionKey: 'employee_count' });
    expect(getCompanyProfileQuestionForDefinition({ key: 'employee_count', valueType: 'STRING' })).toBeNull();
    expect(getCompanyProfileQuestionForDefinition({ key: 'legacy_employee_count', questionKey: 'employee_count', valueType: 'NUMBER' })).toBeNull();
    expect(getCompanyProfileQuestionForDefinition({ key: 'employee_count', questionKey: 'legacy_employee_count', valueType: 'NUMBER' })).toBeNull();
    expect(getCompanyProfileQuestionForDefinition({ key: 'internal_only', questionKey: 'internal_only', valueType: 'STRING' })).toBeNull();
    expect(getCompanyProfileQuestionForDefinition({ key: 'ai_use', valueType: 'BOOLEAN' })).toMatchObject({ questionKey: 'ai_use' });
    expect(getCompanyProfileQuestionForDefinition({ key: 'ai_use', valueType: 'STRING' })).toBeNull();
  });

  it('has an additive idempotent data migration for every legacy baseline key', () => {
    const migration = readFileSync(path.resolve(__dirname, '../prisma/migrations/20260914100000_provision_company_profile_fact_definitions/migration.sql'), 'utf8');
    for (const question of COMPANY_PROFILE_QUESTIONS.filter((item) => LEGACY_COMPANY_PROFILE_QUESTION_KEYS.includes(item.questionKey) && item.questionKey !== 'employee_count')) {
      expect(migration).toContain(`'${question.factDefinitionKey}'`);
      expect(migration).toContain(`'${question.valueType}'`);
    }
    expect(migration).toContain('IF FOUND THEN');
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain('INSERT INTO "fact_definitions"');
    expect(migration).toContain('"temporalPolicy"');
    expect(migration).toContain('existing_definition."temporalPolicy"::text <> \'OBSERVATION\'');
    expect(migration).toContain('"determinationMethod"');
    expect(migration).toContain('existing_definition."determinationMethod"::text <> \'USER_PROVIDED\'');
    expect(migration).toContain("'USER_PROVIDED'::\"FactDeterminationMethod\"");
    expect(migration).not.toMatch(/UPDATE\s+"fact_definitions"[\s\S]*temporalPolicy/i);
  });

  it('keeps integer-only validation question-scoped', () => {
    const answerService = readFileSync(path.resolve(__dirname, '../src/modules/client-workspace/companyProfileAnswerService.ts'), 'utf8');
    expect(answerService).toContain('question.integerOnly');
    expect(answerService).toContain('Number.isInteger(input.numberValue)');
    expect(COMPANY_PROFILE_QUESTIONS.filter((question) => question.valueType === 'NUMBER' && question.questionKey !== 'employee_count').every((question) => question.integerOnly !== true || question.questionKey === 'sites_count')).toBe(true);
  });

});
