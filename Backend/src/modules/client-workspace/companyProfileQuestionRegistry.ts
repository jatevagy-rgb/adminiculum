export type CompanyProfileQuestion = {
  questionKey: string;
  factDefinitionKey: string;
  label: string;
  scopeType: 'COMPANY';
  valueType: 'NUMBER';
};

// This is an explicit client-safe allow-list.  Internal FactDefinition ids,
// rule ids, and arbitrary typed-fact payloads never cross the portal boundary.
export const COMPANY_PROFILE_QUESTIONS: readonly CompanyProfileQuestion[] = [
  {
    questionKey: 'employee_count',
    factDefinitionKey: 'employee_count',
    label: 'Number of employees',
    scopeType: 'COMPANY',
    valueType: 'NUMBER',
  },
];

export function getCompanyProfileQuestion(questionKey: string): CompanyProfileQuestion {
  const question = COMPANY_PROFILE_QUESTIONS.find((item) => item.questionKey === questionKey);
  if (!question) {
    const error = new Error('The requested company profile question is not available.') as Error & { status: number; code: string };
    error.status = 404;
    error.code = 'CLIENT_PROFILE_QUESTION_NOT_FOUND';
    throw error;
  }
  return question;
}
