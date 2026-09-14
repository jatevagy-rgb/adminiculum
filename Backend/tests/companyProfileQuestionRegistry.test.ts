import { COMPANY_PROFILE_QUESTIONS, getCompanyProfileQuestionForDefinition } from '../src/modules/client-workspace/companyProfileQuestionRegistry';

describe('company profile question registry', () => {
  it('keeps the server-controlled baseline typed and sectioned', () => {
    expect(COMPANY_PROFILE_QUESTIONS.find((question) => question.questionKey === 'employee_count')).toMatchObject({
      valueType: 'NUMBER',
      scopeType: 'COMPANY',
      section: 'PEOPLE',
    });
    expect(COMPANY_PROFILE_QUESTIONS.some((question) => question.valueType === 'BOOLEAN')).toBe(true);
    expect(COMPANY_PROFILE_QUESTIONS.some((question) => question.valueType === 'STRING')).toBe(true);
  });

  it('only maps active canonical definitions with compatible typed metadata', () => {
    expect(getCompanyProfileQuestionForDefinition({ key: 'employee_count', valueType: 'NUMBER' })).toMatchObject({ questionKey: 'employee_count' });
    expect(getCompanyProfileQuestionForDefinition({ key: 'employee_count', valueType: 'STRING' })).toBeNull();
    expect(getCompanyProfileQuestionForDefinition({ key: 'internal_only', questionKey: 'internal_only', valueType: 'STRING' })).toBeNull();
  });
});
