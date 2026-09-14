/**
 * COMPLIANCE DISCOVERY 2.0 — REPRESENTATIVE LEGAL MODULE RULE FAMILIES
 *
 * Declarative authoring layer for the first three verticals:
 *   - DATA           -> GDPR / adatvédelem
 *   - WHISTLEBLOWING -> belső visszaélés-bejelentés
 *   - CYBER          -> NIS2 / kiberbiztonság
 *
 * Authority: Adminiculum_Compliance_Scoping_System_v2
 *   Rule_Families, Controls_Evidence, Bizonyíték_kérdések, Ügyfél_eredmény.
 *
 * These are DEFINITIONS, not assertions of legal correctness. Each definition
 * records the legal source, the locator, the canonical fact dependencies, the
 * rule AST and the automation level. `specialistRequirement: 'LEGAL_ONLY'`
 * makes the existing evaluation service short-circuit to LEGAL_REVIEW_REQUIRED,
 * so no deterministic certainty is faked for threshold/annex/sector scope.
 *
 * Only BOOLEAN / NUMBER / STRING / DATE facts may be rule dependencies: the
 * evaluator cannot consume ENUM / MULTI_ENUM. Facts the workbook marks derived
 * (e.g. b2c_sales) exist exactly so rules can consume them.
 */

import { RULE_AST_V1, type CompareNode, type ComparisonOperator, type FactRefNode, type LiteralNode, type RuleExpression, type RuleNode } from './ruleAst';
import { evaluateRule, type EvaluatorFactMap, type EvaluatorResult } from './evaluator';

export type ComplianceModuleKey = 'DATA' | 'WHISTLEBLOWING' | 'CYBER';

export type EvidenceOutcomeRoute = 'UPLOAD_OR_REUSE_DOCUMENT' | 'MISSING_CONTROL_EVIDENCE' | 'LAWYER_REVIEW';

export interface ComplianceControlSeed {
  readonly controlKey: string;
  readonly titleHu: string;
  readonly ownerRoleHu: string;
  readonly reviewCadenceDays: number;
  readonly evidenceQuestionHu: string;
  readonly evidenceExamplesHu: readonly string[];
  /** Client answer -> journey, per the workbook Bizonyíték_kérdések sheet. */
  readonly evidenceRoute: { readonly yes: EvidenceOutcomeRoute; readonly no: EvidenceOutcomeRoute; readonly unknown: EvidenceOutcomeRoute };
}

export interface ComplianceRuleFamilyDefinition {
  readonly ruleId: string;
  readonly module: ComplianceModuleKey;
  readonly requirementKey: string;
  readonly titleHu: string;
  readonly normativeStatementHu: string;
  readonly jurisdictionCode: string;
  readonly domainCode: string;
  readonly legalSourceKey: string;
  readonly locatorHu: string;
  readonly evaluationScopeType: 'COMPANY';
  readonly factDependencies: readonly string[];
  readonly ast: RuleExpression;
  readonly sourceSupportState: 'SUFFICIENT' | 'INSUFFICIENT';
  /** `LEGAL_ONLY` => evaluation service returns LEGAL_REVIEW_REQUIRED. */
  readonly specialistRequirement: 'NONE' | 'LEGAL_ONLY';
  readonly controls: readonly ComplianceControlSeed[];
}

// ---------------------------------------------------------------------------
// AST builders (closed v1 shape only)
// ---------------------------------------------------------------------------

const fact = (factKey: string): FactRefNode => ({ kind: 'FACT', factKey });
const lit = (valueType: 'boolean' | 'number' | 'string' | 'date', value: boolean | number | string): LiteralNode => ({ kind: 'LITERAL', valueType, value });
const compare = (operator: ComparisonOperator, left: FactRefNode, right: FactRefNode | LiteralNode): CompareNode => ({ kind: 'COMPARE', operator, left, right });
const eqBool = (factKey: string, value: boolean): CompareNode => compare('EQ', fact(factKey), lit('boolean', value));
const gteNum = (factKey: string, value: number): CompareNode => compare('GTE', fact(factKey), lit('number', value));
const and = (...children: RuleNode[]): RuleNode => ({ kind: 'AND', children });
const or = (...children: RuleNode[]): RuleNode => ({ kind: 'OR', children });
const expression = (node: RuleNode): RuleExpression => ({ schemaVersion: RULE_AST_V1, node });

const EVIDENCE_ROUTE = {
  yes: 'UPLOAD_OR_REUSE_DOCUMENT',
  no: 'MISSING_CONTROL_EVIDENCE',
  unknown: 'LAWYER_REVIEW',
} as const;

// ---------------------------------------------------------------------------
// GDPR / DATA
// ---------------------------------------------------------------------------

const DATA_CONTROLS: readonly ComplianceControlSeed[] = [
  {
    controlKey: 'C-DATA-001',
    titleHu: 'Adatkezelési nyilvántartás és jogalap-mátrix',
    ownerRoleHu: 'Adatvédelmi felelős',
    reviewCadenceDays: 365,
    evidenceQuestionHu: 'Vezettek nyilvántartást arról, milyen személyes adatot milyen célból kezeltek?',
    evidenceExamplesHu: ['ROPA', 'jogalap-mátrix', 'folyamatleírás'],
    evidenceRoute: EVIDENCE_ROUTE,
  },
  {
    controlKey: 'C-DATA-002',
    titleHu: 'Adatkezelési tájékoztatók',
    ownerRoleHu: 'Adatvédelmi felelős',
    reviewCadenceDays: 365,
    evidenceQuestionHu: 'Van jelenleg hatályos adatkezelési tájékoztatótok?',
    evidenceExamplesHu: ['webes tájékoztató', 'munkavállalói tájékoztató', 'ügyféltájékoztató'],
    evidenceRoute: EVIDENCE_ROUTE,
  },
  {
    controlKey: 'C-DATA-003',
    titleHu: 'DPIA/DPO szükségességi vizsgálat',
    ownerRoleHu: 'DPO / jog',
    reviewCadenceDays: 365,
    evidenceQuestionHu: 'Készült adatvédelmi hatásvizsgálat valamely magas kockázatú adatkezelésre?',
    evidenceExamplesHu: ['DPIA', 'DPO kijelölés', 'szükségességi memo'],
    evidenceRoute: EVIDENCE_ROUTE,
  },
];

// ---------------------------------------------------------------------------
// NIS2 / CYBER
// ---------------------------------------------------------------------------

const CYBER_CONTROLS: readonly ComplianceControlSeed[] = [
  {
    controlKey: 'C-CYBER-001',
    titleHu: 'Kiberkockázat-kezelési keret',
    ownerRoleHu: 'IT/CISO',
    reviewCadenceDays: 365,
    evidenceQuestionHu: 'Van írásban rögzített kiberbiztonsági kockázatértékelés?',
    evidenceExamplesHu: ['kockázatértékelés', 'szabályzatok', 'kontrolllista'],
    evidenceRoute: EVIDENCE_ROUTE,
  },
  {
    controlKey: 'C-CYBER-002',
    titleHu: 'Incidenskezelés és jelentési folyamat',
    ownerRoleHu: 'IT/CISO',
    reviewCadenceDays: 180,
    evidenceQuestionHu: 'Van dokumentált eljárásotok informatikai incidens esetére?',
    evidenceExamplesHu: ['incident response plan', 'incidensnapló', 'gyakorlat jegyzőkönyv'],
    evidenceRoute: EVIDENCE_ROUTE,
  },
];

// ---------------------------------------------------------------------------
// Whistleblowing
// ---------------------------------------------------------------------------

const WHISTLEBLOWING_CONTROLS: readonly ComplianceControlSeed[] = [
  {
    controlKey: 'C-WB-001',
    titleHu: 'Belső visszaélés-bejelentési rendszer',
    ownerRoleHu: 'Compliance/jog',
    reviewCadenceDays: 365,
    evidenceQuestionHu: 'Működik belső visszaélés-bejelentési csatorna, és van róla szabályzat?',
    evidenceExamplesHu: ['szabályzat', 'csatorna', 'kijelölés', 'adatkezelési tájékoztató'],
    evidenceRoute: EVIDENCE_ROUTE,
  },
];

export const COMPLIANCE_MODULE_RULE_FAMILIES: readonly ComplianceRuleFamilyDefinition[] = [
  {
    ruleId: 'R-DATA-001',
    module: 'DATA',
    requirementKey: 'GDPR_GENERAL_SCOPE',
    titleHu: 'GDPR általános tárgyi/területi hatály',
    normativeStatementHu: 'A személyes adatok kezelésére a GDPR és az Infotv. hatályi rendelkezései alkalmazandók.',
    jurisdictionCode: 'HU',
    domainCode: 'DATA_PROTECTION',
    legalSourceKey: 'EU-32016R0679',
    locatorHu: 'GDPR 2–3. cikk; Infotv. hatályi rendelkezések',
    evaluationScopeType: 'COMPANY',
    factDependencies: ['personal_data_processing'],
    ast: expression(eqBool('personal_data_processing', true)),
    sourceSupportState: 'SUFFICIENT',
    specialistRequirement: 'NONE',
    controls: DATA_CONTROLS.filter((control) => control.controlKey === 'C-DATA-001' || control.controlKey === 'C-DATA-002'),
  },
  {
    ruleId: 'R-DATA-002',
    module: 'DATA',
    requirementKey: 'GDPR_ELEVATED_RISK_DPIA_DPO',
    titleHu: 'GDPR fokozott kockázat / DPIA-DPO vizsgálat',
    normativeStatementHu: 'Kockázati tények fennállása esetén adatvédelmi hatásvizsgálat és DPO-szükségesség vizsgálandó.',
    jurisdictionCode: 'HU',
    domainCode: 'DATA_PROTECTION',
    legalSourceKey: 'EU-32016R0679',
    locatorHu: 'GDPR 35., 37. cikk és kapcsolódó feltételek',
    evaluationScopeType: 'COMPANY',
    factDependencies: ['special_category_data', 'systematic_monitoring', 'large_scale_processing'],
    ast: expression(or(eqBool('special_category_data', true), eqBool('systematic_monitoring', true), eqBool('large_scale_processing', true))),
    sourceSupportState: 'SUFFICIENT',
    // Threshold/exception interpretation is not automatable.
    specialistRequirement: 'LEGAL_ONLY',
    controls: DATA_CONTROLS.filter((control) => control.controlKey === 'C-DATA-003'),
  },
  {
    ruleId: 'R-WB-001',
    module: 'WHISTLEBLOWING',
    requirementKey: 'WHISTLEBLOWING_INTERNAL_CHANNEL',
    titleHu: 'Belső visszaélés-bejelentési rendszer',
    normativeStatementHu: 'Az érintett szervezeteknek belső visszaélés-bejelentési rendszert kell működtetniük.',
    jurisdictionCode: 'HU',
    domainCode: 'WHISTLEBLOWING',
    legalSourceKey: 'HU-011',
    locatorHu: '2023. évi XXV. tv. belső visszaélés-bejelentési fejezete; EU 2019/1937',
    evaluationScopeType: 'COMPANY',
    factDependencies: ['employee_count', 'whistle_special_sector'],
    ast: expression(or(gteNum('employee_count', 50), eqBool('whistle_special_sector', true))),
    sourceSupportState: 'SUFFICIENT',
    specialistRequirement: 'NONE',
    controls: WHISTLEBLOWING_CONTROLS,
  },
  {
    ruleId: 'R-CYBER-001',
    module: 'CYBER',
    requirementKey: 'NIS2_ORGANISATION_SCOPE',
    titleHu: 'NIS2 szervezeti hatály',
    normativeStatementHu: 'A NIS2 ágazati/típusfeltétel és méretküszöb alapján a szervezet hatálya jogi felülvizsgálatot igényel.',
    jurisdictionCode: 'HU',
    domainCode: 'CYBERSECURITY',
    legalSourceKey: 'EU-32022L2555',
    locatorHu: 'NIS2 2. cikk + I–II. melléklet; 2024. évi LXIX. tv. hatályi szabályok',
    evaluationScopeType: 'COMPANY',
    factDependencies: ['managed_it_service_provider', 'data_center_or_cloud_provider', 'critical_it_dependency', 'employee_count'],
    ast: expression(or(
      eqBool('managed_it_service_provider', true),
      eqBool('data_center_or_cloud_provider', true),
      and(eqBool('critical_it_dependency', true), gteNum('employee_count', 50)),
    )),
    sourceSupportState: 'SUFFICIENT',
    // Sector classification, exceptions and annex thresholds require legal review.
    specialistRequirement: 'LEGAL_ONLY',
    controls: CYBER_CONTROLS,
  },
  {
    ruleId: 'R-CYBER-002',
    module: 'CYBER',
    requirementKey: 'NIS2_SECURITY_CONTROLS',
    titleHu: 'Kiberbiztonsági kontrollok és audit',
    normativeStatementHu: 'Kritikus informatikai függőség esetén kockázatkezelési és incidenskezelési kontrollok szükségesek.',
    jurisdictionCode: 'HU',
    domainCode: 'CYBERSECURITY',
    legalSourceKey: 'HU-031',
    locatorHu: '2024. évi LXIX. tv. II. fejezet; NIS2 kockázatkezelési kötelezettségek',
    evaluationScopeType: 'COMPANY',
    factDependencies: ['critical_it_dependency', 'managed_it_service_provider'],
    ast: expression(or(eqBool('critical_it_dependency', true), eqBool('managed_it_service_provider', true))),
    sourceSupportState: 'SUFFICIENT',
    specialistRequirement: 'NONE',
    controls: CYBER_CONTROLS,
  },
];

const RULE_FAMILY_BY_ID = new Map(COMPLIANCE_MODULE_RULE_FAMILIES.map((family) => [family.ruleId, family]));

export function getComplianceRuleFamily(ruleId: string): ComplianceRuleFamilyDefinition | undefined {
  return RULE_FAMILY_BY_ID.get(ruleId);
}

export function ruleFamiliesForModule(module: ComplianceModuleKey): readonly ComplianceRuleFamilyDefinition[] {
  return COMPLIANCE_MODULE_RULE_FAMILIES.filter((family) => family.module === module);
}

/** Evaluates the declarative AST against a fact map (pure, no database). */
export function evaluateRuleFamily(family: ComplianceRuleFamilyDefinition, facts: EvaluatorFactMap): EvaluatorResult {
  return evaluateRule(family.ast, facts);
}

// ---------------------------------------------------------------------------
// Client-facing result language (workbook Ügyfél_eredmény)
// ---------------------------------------------------------------------------

export interface ClientComplianceResultLanguage {
  readonly titleHu: string;
  readonly bodyHu: string;
  readonly internalState: string;
}

/**
 * Human, non-legalistic status language for the client portal. The internal
 * legal state stays authoritative. No entry ever claims full compliance.
 */
export const CLIENT_COMPLIANCE_RESULT_LANGUAGE: Readonly<Record<'DOES_NOT_APPLY' | 'INSUFFICIENT_FACTS' | 'LEGAL_REVIEW_REQUIRED' | 'APPLIES' | 'EVIDENCE_GAP', ClientComplianceResultLanguage>> = {
  DOES_NOT_APPLY: {
    titleHu: 'Nem azonosítottunk további teendőt ezen a területen.',
    bodyHu: 'A rendelkezésünkre álló adatok alapján ez a terület jelenleg nem igényel további lépést.',
    internalState: 'DOES_NOT_APPLY',
  },
  INSUFFICIENT_FACTS: {
    titleHu: 'Még egy-két adat kell.',
    bodyHu: 'A válaszok alapján ez a terület érintheti a vállalkozást, de a biztos megállapításhoz még néhány információra van szükség.',
    internalState: 'INSUFFICIENT_FACTS',
  },
  LEGAL_REVIEW_REQUIRED: {
    titleHu: 'Ügyvédi ellenőrzés szükséges.',
    bodyHu: 'A tevékenység vagy méret miatt ezt a területet jogászunknak kell pontosan ellenőriznie.',
    internalState: 'LEGAL_REVIEW_REQUIRED',
  },
  APPLIES: {
    titleHu: 'Teendő azonosítva.',
    bodyHu: 'Ez a követelmény a megadott adatok alapján érinti a vállalkozást. A következő lépés a szükséges dokumentum vagy intézkedés ellenőrzése.',
    internalState: 'APPLIES',
  },
  EVIDENCE_GAP: {
    titleHu: 'Hiányzó bizonyíték vagy intézkedés.',
    bodyHu: 'A szükséges dokumentum vagy intézkedés jelenleg nem igazolt. Ezt pótolni vagy ellenőrizni kell.',
    internalState: 'APPLIES+EVIDENCE_GAP',
  },
};
