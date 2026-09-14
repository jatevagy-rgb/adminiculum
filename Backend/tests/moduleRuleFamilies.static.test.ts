import { validateRuleAst } from '../src/modules/compliance/ruleAstValidator';
import type { EvaluatorFactMap } from '../src/modules/compliance/evaluator';
import { COMPLIANCE_MODULE_RULE_FAMILIES, CLIENT_COMPLIANCE_RESULT_LANGUAGE, evaluateRuleFamily, getComplianceRuleFamily, ruleFamiliesForModule } from '../src/modules/compliance/moduleRuleFamilies';
import { getCanonicalCompanyFact } from '../src/modules/client-workspace/companyProfileFactCatalog';

const EVALUABLE = new Set(['BOOLEAN', 'NUMBER', 'STRING', 'DATE']);
const b = (value: boolean) => ({ type: 'boolean' as const, value });
const n = (value: number) => ({ type: 'number' as const, value });
const facts = (input: Record<string, ReturnType<typeof b> | ReturnType<typeof n>>): EvaluatorFactMap => input;

describe('compliance module rule families (GDPR / whistleblowing / NIS2)', () => {
  it('every authored AST is structurally valid and every dependency is an evaluable canonical fact', () => {
    expect(COMPLIANCE_MODULE_RULE_FAMILIES.length).toBeGreaterThanOrEqual(5);
    for (const family of COMPLIANCE_MODULE_RULE_FAMILIES) {
      expect(validateRuleAst(family.ast).valid).toBe(true);
      expect(family.factDependencies.length).toBeGreaterThan(0);
      for (const factKey of family.factDependencies) {
        const fact = getCanonicalCompanyFact(factKey);
        expect(fact).toBeDefined();
        expect(EVALUABLE.has(fact?.valueType ?? '')).toBe(true);
      }
      expect(family.controls.length).toBeGreaterThan(0);
    }
  });

  it('GDPR_FLOW: applies, does not apply and needs facts', () => {
    const gdpr = getComplianceRuleFamily('R-DATA-001');
    expect(gdpr).toBeDefined();
    if (!gdpr) return;
    expect(evaluateRuleFamily(gdpr, facts({ personal_data_processing: b(true) })).result).toBe('APPLIES');
    expect(evaluateRuleFamily(gdpr, facts({ personal_data_processing: b(false) })).result).toBe('DOES_NOT_APPLY');
    expect(evaluateRuleFamily(gdpr, facts({})).result).toBe('INSUFFICIENT_FACTS');

    const dpia = getComplianceRuleFamily('R-DATA-002');
    expect(dpia).toBeDefined();
    if (!dpia) return;
    expect(evaluateRuleFamily(dpia, facts({ special_category_data: b(true) })).result).toBe('APPLIES');
    expect(evaluateRuleFamily(dpia, facts({ special_category_data: b(false), systematic_monitoring: b(false), large_scale_processing: b(false) })).result).toBe('DOES_NOT_APPLY');
    expect(evaluateRuleFamily(dpia, facts({ special_category_data: b(false) })).result).toBe('INSUFFICIENT_FACTS');
  });

  it('WHISTLEBLOWING_FLOW: size threshold OR special sector, unknown sector stays insufficient', () => {
    const whistle = getComplianceRuleFamily('R-WB-001');
    expect(whistle).toBeDefined();
    if (!whistle) return;
    expect(evaluateRuleFamily(whistle, facts({ employee_count: n(73) })).result).toBe('APPLIES');
    expect(evaluateRuleFamily(whistle, facts({ employee_count: n(10), whistle_special_sector: b(false) })).result).toBe('DOES_NOT_APPLY');
    expect(evaluateRuleFamily(whistle, facts({ employee_count: n(10) })).result).toBe('INSUFFICIENT_FACTS');
    expect(evaluateRuleFamily(whistle, facts({ employee_count: n(10), whistle_special_sector: b(true) })).result).toBe('APPLIES');
  });

  it('NIS2_FLOW: provider role, critical dependency with size, and insufficiency', () => {
    const scope = getComplianceRuleFamily('R-CYBER-001');
    const controls = getComplianceRuleFamily('R-CYBER-002');
    expect(scope).toBeDefined();
    expect(controls).toBeDefined();
    if (!scope || !controls) return;
    expect(evaluateRuleFamily(scope, facts({ managed_it_service_provider: b(true) })).result).toBe('APPLIES');
    expect(evaluateRuleFamily(scope, facts({ critical_it_dependency: b(true), employee_count: n(60) })).result).toBe('APPLIES');
    expect(evaluateRuleFamily(scope, facts({ managed_it_service_provider: b(false), data_center_or_cloud_provider: b(false), critical_it_dependency: b(true), employee_count: n(20) })).result).toBe('DOES_NOT_APPLY');
    expect(evaluateRuleFamily(scope, facts({ critical_it_dependency: b(true), employee_count: n(20) })).result).toBe('INSUFFICIENT_FACTS');
    expect(evaluateRuleFamily(scope, facts({ managed_it_service_provider: b(false), data_center_or_cloud_provider: b(false), critical_it_dependency: b(false), employee_count: n(20) })).result).toBe('DOES_NOT_APPLY');
    expect(evaluateRuleFamily(scope, facts({})).result).toBe('INSUFFICIENT_FACTS');
    expect(evaluateRuleFamily(controls, facts({ critical_it_dependency: b(true) })).result).toBe('APPLIES');
    expect(evaluateRuleFamily(controls, facts({ critical_it_dependency: b(false), managed_it_service_provider: b(false) })).result).toBe('DOES_NOT_APPLY');
  });

  it('LEGAL_REVIEW_REQUIRED: ambiguity is declared as LEGAL_ONLY, never faked deterministic', () => {
    expect(getComplianceRuleFamily('R-DATA-002')?.specialistRequirement).toBe('LEGAL_ONLY');
    expect(getComplianceRuleFamily('R-CYBER-001')?.specialistRequirement).toBe('LEGAL_ONLY');
    expect(getComplianceRuleFamily('R-DATA-001')?.specialistRequirement).toBe('NONE');
    expect(getComplianceRuleFamily('R-WB-001')?.specialistRequirement).toBe('NONE');
    expect(getComplianceRuleFamily('R-CYBER-002')?.specialistRequirement).toBe('NONE');
    // Every family records a legal source + locator, so nothing is asserted without grounding.
    for (const family of COMPLIANCE_MODULE_RULE_FAMILIES) {
      expect(family.legalSourceKey.length).toBeGreaterThan(0);
      expect(family.locatorHu.length).toBeGreaterThan(0);
      expect(family.sourceSupportState).toBe('SUFFICIENT');
    }
  });

  it('EVIDENCE_YES/NO/UNKNOWN paths are declared for every control', () => {
    for (const family of COMPLIANCE_MODULE_RULE_FAMILIES) {
      for (const control of family.controls) {
        expect(control.evidenceRoute.yes).toBe('UPLOAD_OR_REUSE_DOCUMENT');
        expect(control.evidenceRoute.no).toBe('MISSING_CONTROL_EVIDENCE');
        expect(control.evidenceRoute.unknown).toBe('LAWYER_REVIEW');
        expect(control.evidenceQuestionHu.length).toBeGreaterThan(10);
        expect(control.reviewCadenceDays).toBeGreaterThan(0);
      }
    }
  });

  it('CLIENT_SAFE: result language is human, has no internal ids and never claims full compliance', () => {
    const entries = Object.values(CLIENT_COMPLIANCE_RESULT_LANGUAGE);
    expect(entries).toHaveLength(5);
    for (const entry of entries) {
      expect(entry.titleHu.length).toBeGreaterThan(0);
      expect(entry.bodyHu.length).toBeGreaterThan(0);
      expect(`${entry.titleHu} ${entry.bodyHu}`).not.toMatch(/100\s?%|teljes(?:en)? megfelel|compliant/i);
      expect(`${entry.titleHu} ${entry.bodyHu}`).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(`${entry.titleHu} ${entry.bodyHu}`).not.toMatch(/§|cikk|Article|rule|R-[A-Z]+-\d/i);
    }
  });

  it('exposes module scoping for the three verticals', () => {
    expect(ruleFamiliesForModule('DATA').map((family) => family.ruleId)).toEqual(['R-DATA-001', 'R-DATA-002']);
    expect(ruleFamiliesForModule('WHISTLEBLOWING').map((family) => family.ruleId)).toEqual(['R-WB-001']);
    expect(ruleFamiliesForModule('CYBER').map((family) => family.ruleId)).toEqual(['R-CYBER-001', 'R-CYBER-002']);
  });
});
