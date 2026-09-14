import {
  CANONICAL_COMPANY_QUESTIONS,
  type CompanyProfileAnswerType,
  type CompanyProfileModule,
  type CompanyProfileVisibilityCondition,
} from './companyProfileQuestionCatalog';
import { getCanonicalCompanyFact, type CompanyProfileFactSection } from './companyProfileFactCatalog';

export type CompanyProfileValueType = 'NUMBER' | 'BOOLEAN' | 'STRING' | 'ENUM' | 'MULTI_ENUM' | 'DATE' | 'JURISDICTION';

export type CompanyProfileQuestion = {
  questionKey: string;
  factDefinitionKey: string;
  label: string;
  helpText?: string;
  section: CompanyProfileFactSection;
  scopeType: 'COMPANY';
  valueType: CompanyProfileValueType;
  enumOptions?: readonly string[];
  /** Some numeric questions represent counts and therefore require integers. */
  integerOnly?: boolean;
  /** Baseline questions are always available; other questions are adaptive. */
  baseline: boolean;
  order: number;
  /**
   * Canonical discovery baseline (workbook Fact_Dictionary `baseline` column).
   * Kept separate from the legacy `baseline` flag so the existing allow-list and
   * its provisioning migration stay byte-for-byte compatible. The discovery
   * service includes these only when explicitly asked for canonical baseline.
   */
  discoveryBaseline?: boolean;
  /** Client-facing "Miért kérdezzük?" explanation. Never exposes engine terms. */
  why?: string;
  module?: CompanyProfileModule;
  /** Declarative adaptive gate; owned by the catalogue, not the renderer. */
  showWhen?: CompanyProfileVisibilityCondition;
  /** `TEAOR25` marks a code validated against the structured activity catalogue. */
  codeCatalog?: 'TEAOR25';
  /** Workbook Question_Catalog id, retained for traceability only. */
  catalogQuestionKey?: string;
};

/**
 * LEGACY (already provisioned + already tested) allow-list. These entries are
 * intentionally unchanged: existing stored answers, snapshots and tests depend
 * on their exact keys, value types and metadata. New canonical questions are
 * appended below and never replace these.
 */
const LEGACY_COMPANY_PROFILE_QUESTIONS: readonly CompanyProfileQuestion[] = [
  {
    questionKey: 'employee_count',
    factDefinitionKey: 'employee_count',
    label: 'Number of employees',
    helpText: 'A vállalkozás jelenlegi munkavállalói létszáma.',
    section: 'PEOPLE',
    scopeType: 'COMPANY',
    valueType: 'NUMBER',
    integerOnly: true,
    baseline: true,
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
    baseline: true,
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
    baseline: true,
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
    baseline: false,
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
    baseline: false,
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
    baseline: false,
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
    baseline: false,
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
    baseline: false,
    order: 80,
  },
];

/** Question keys provisioned by the legacy migration and asserted by tests. */
export const LEGACY_COMPANY_PROFILE_QUESTION_KEYS: readonly string[] = LEGACY_COMPANY_PROFILE_QUESTIONS.map((question) => question.questionKey);

function valueTypeFor(answerType: CompanyProfileAnswerType): CompanyProfileValueType {
  switch (answerType) {
    case 'BOOLEAN':
    case 'BOOLEAN_UNKNOWN':
      return 'BOOLEAN';
    case 'ENUM':
      return 'ENUM';
    case 'MULTI_ENUM':
    case 'COUNTRY_MULTI':
    case 'TEAOR25_MULTI':
      return 'MULTI_ENUM';
    case 'COUNTRY':
      return 'JURISDICTION';
    case 'TEAOR25':
      return 'STRING';
    case 'NUMBER':
    default:
      return 'NUMBER';
  }
}

const LEGACY_FACT_KEYS = new Set(LEGACY_COMPANY_PROFILE_QUESTIONS.map((question) => question.factDefinitionKey));

/**
 * Canonical questions projected from the workbook catalogue. New fact keys only;
 * the legacy keys above are never replaced. `questionKey` equals the canonical
 * fact key so it matches the provisioned `FactDefinition.questionKey`.
 */
const CANONICAL_COMPANY_PROFILE_QUESTIONS: readonly CompanyProfileQuestion[] = CANONICAL_COMPANY_QUESTIONS
  .filter((question) => question.factKeys.length === 1 && !LEGACY_FACT_KEYS.has(question.factKeys[0]))
  .map((question, index): CompanyProfileQuestion => {
    const factKey = question.factKeys[0];
    const fact = getCanonicalCompanyFact(factKey);
    return {
      questionKey: factKey,
      factDefinitionKey: factKey,
      label: question.labelHu,
      helpText: question.helpTextHu || undefined,
      section: fact?.section ?? 'COMPANY',
      scopeType: 'COMPANY',
      valueType: valueTypeFor(question.answerType),
      enumOptions: question.optionsHu.length ? question.optionsHu : undefined,
      integerOnly: factKey === 'sites_count' ? true : undefined,
      baseline: false,
      discoveryBaseline: question.baseline,
      order: 100 + index,
      why: question.whyHu,
      module: question.module,
      showWhen: question.showWhen,
      codeCatalog: fact?.codeCatalog,
      catalogQuestionKey: question.questionKey,
    };
  });

// This is an explicit client-safe allow-list.  Internal FactDefinition ids,
// rule ids, and arbitrary typed-fact payloads never cross the portal boundary.
export const COMPANY_PROFILE_QUESTIONS: readonly CompanyProfileQuestion[] = [
  ...LEGACY_COMPANY_PROFILE_QUESTIONS,
  ...CANONICAL_COMPANY_PROFILE_QUESTIONS,
];

export function getCompanyProfileQuestionForDefinition(definition: {
  key: string;
  questionKey?: string | null;
  valueType?: string;
}): CompanyProfileQuestion | null {
  const question = COMPANY_PROFILE_QUESTIONS.find((item) => item.factDefinitionKey === definition.key);
  if (!question) return null;
  if (definition.questionKey != null && definition.questionKey !== question.questionKey) return null;
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
