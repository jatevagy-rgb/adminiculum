export type CompanyProfileValueType = 'NUMBER' | 'BOOLEAN' | 'STRING' | 'ENUM' | 'DATE';

export type CompanyProfileQuestion = {
  questionKey: string;
  factDefinitionKey: string;
  label: string;
  helpText?: string;
  section: 'COMPANY' | 'OPERATIONS' | 'PEOPLE' | 'DATA' | 'DIGITAL' | 'MARKET' | 'SPECIAL';
  scopeType: 'COMPANY';
  valueType: CompanyProfileValueType;
  enumOptions?: readonly string[];
  order: number;
};

// This is an explicit client-safe allow-list.  Internal FactDefinition ids,
// rule ids, and arbitrary typed-fact payloads never cross the portal boundary.
export const COMPANY_PROFILE_QUESTIONS: readonly CompanyProfileQuestion[] = [
  {
    questionKey: 'employee_count',
    factDefinitionKey: 'employee_count',
    label: 'Number of employees',
    helpText: 'A vállalkozás jelenlegi munkavállalói létszáma.',
    section: 'PEOPLE',
    scopeType: 'COMPANY',
    valueType: 'NUMBER',
    order: 10,
  },
  {
    questionKey: 'company_main_activity',
    factDefinitionKey: 'company_main_activity',
    label: 'Fő tevékenység vagy ágazat',
    helpText: 'Mivel foglalkozik elsősorban a vállalkozás?',
    section: 'OPERATIONS',
    scopeType: 'COMPANY',
    valueType: 'STRING',
    order: 20,
  },
  {
    questionKey: 'company_operating_country',
    factDefinitionKey: 'company_operating_country',
    label: 'Működési ország',
    helpText: 'Melyik országban működik a vállalkozás?',
    section: 'COMPANY',
    scopeType: 'COMPANY',
    valueType: 'STRING',
    order: 30,
  },
  {
    questionKey: 'company_regulated_activity',
    factDefinitionKey: 'company_regulated_activity',
    label: 'Szabályozott tevékenység',
    helpText: 'Végez a vállalkozás külön engedélyhez vagy hatósági szabályhoz kötött tevékenységet?',
    section: 'SPECIAL',
    scopeType: 'COMPANY',
    valueType: 'BOOLEAN',
    order: 40,
  },
  {
    questionKey: 'company_sensitive_data_usage',
    factDefinitionKey: 'company_sensitive_data_usage',
    label: 'Különleges személyes adatok kezelése',
    helpText: 'Kezel a vállalkozás egészségügyi, biometrikus vagy más különleges személyes adatot?',
    section: 'DATA',
    scopeType: 'COMPANY',
    valueType: 'BOOLEAN',
    order: 50,
  },
  {
    questionKey: 'company_important_it_system',
    factDefinitionKey: 'company_important_it_system',
    label: 'Fontos informatikai rendszerek',
    helpText: 'Támaszkodik a működés kritikus informatikai vagy digitális rendszerre?',
    section: 'DIGITAL',
    scopeType: 'COMPANY',
    valueType: 'BOOLEAN',
    order: 60,
  },
  {
    questionKey: 'company_ai_usage',
    factDefinitionKey: 'company_ai_usage',
    label: 'Mesterséges intelligencia használata',
    helpText: 'Használ a vállalkozás mesterséges intelligencián alapuló eszközt vagy szolgáltatást?',
    section: 'DIGITAL',
    scopeType: 'COMPANY',
    valueType: 'BOOLEAN',
    order: 70,
  },
  {
    questionKey: 'company_export_activity',
    factDefinitionKey: 'company_export_activity',
    label: 'Export- vagy határon átnyúló tevékenység',
    helpText: 'Értékesít vagy nyújt szolgáltatást a vállalkozás más országban?',
    section: 'MARKET',
    scopeType: 'COMPANY',
    valueType: 'BOOLEAN',
    order: 80,
  },
];

export function getCompanyProfileQuestionForDefinition(definition: {
  key: string;
  questionKey?: string | null;
  valueType?: string;
}): CompanyProfileQuestion | null {
  const question = COMPANY_PROFILE_QUESTIONS.find((item) => item.factDefinitionKey === definition.key
    || (definition.questionKey != null && item.questionKey === definition.questionKey));
  if (!question) return null;
  if (definition.valueType && String(definition.valueType) !== question.valueType) return null;
  return question;
}

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

/**
 * Returns true if the given questionKey is registered in the canonical
 * company-profile allowlist and is therefore portal-answerable.
 */
export function isCompanyProfileQuestion(questionKey: string | null | undefined): boolean {
  if (!questionKey) return false;
  return COMPANY_PROFILE_QUESTIONS.some((item) => item.questionKey === questionKey);
}
