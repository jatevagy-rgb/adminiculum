import { activeAssessmentQuestions, evaluateAssessmentAnswers, getAssessmentPack, validateAssessmentSubmission } from '../src/modules/company-growth/assessments/registry';
import { V2_ASSESSMENT_PACKS, V2_PAIN_ROUTES, quickScanRoutes } from '../src/modules/company-growth/assessments/v2Definitions';
import { resolveCustomerEvidence } from '../src/modules/company-growth/assessments/evidence';

function answers(key: string, overrides: Record<string, string> = {}) {
  const p = getAssessmentPack(key)!;
  const all = p.questions.map(q => ({ questionKey: q.questionKey, answer: overrides[q.questionKey] ?? 'UNKNOWN' }));
  const active = activeAssessmentQuestions(p, all);
  return all.filter(a => active.some(q => q.questionKey === a.questionKey));
}
function evaluate(key: string, overrides: Record<string, string> = {}) {
  return evaluateAssessmentAnswers(key, 2, answers(key, overrides))!;
}
describe('V2 bounded adaptive rules', () => {
  test.each(V2_ASSESSMENT_PACKS.map(p => p.packKey))('%s: uncertainty never becomes a negative finding', key => {
    const result = evaluate(key);
    expect(result.findings).toEqual([]);
    expect(result.directions).toEqual([]);
    expect(result.unknownDimensions.length).toBeGreaterThan(0);
  });
  test('quick scan routes strong signals only; even all high answers produce no diagnosis', () => {
    const a = answers('QUICK_SCAN_V2', { qs_duplicate_entry_frequency: 'ALMOST_DAILY', qs_typical_system_count: 'FIVE_PLUS', qs_rework_frequency: 'WEEKLY' });
    expect(quickScanRoutes(a)).toEqual(['DATA_FLOW_V2', 'PROCESS_STABILITY_REWORK_V2']);
    expect(evaluateAssessmentAnswers('QUICK_SCAN_V2', 2, a)?.findings).toEqual([]);
    expect(quickScanRoutes(answers('QUICK_SCAN_V2'))).toEqual([]);
    expect(new Set(Object.values(V2_PAIN_ROUTES)).size).toBe(7);
  });
  test('inactive followups are rejected; missing active followups are rejected', () => {
    const skipped = answers('DIGITAL_VALUE_V2', { v2_digital_investment_recent: 'NO' });
    expect(skipped).toHaveLength(1);
    expect(validateAssessmentSubmission('DIGITAL_VALUE_V2', 2, skipped).answers).toHaveLength(1);
    expect(() => validateAssessmentSubmission('DIGITAL_VALUE_V2', 2, [...skipped, { questionKey: 'v2_investment_metric', answer: 'NO' }])).toThrow('válaszúthoz');
    expect(() => validateAssessmentSubmission('DIGITAL_VALUE_V2', 2, [{ questionKey: 'v2_digital_investment_recent', answer: 'YES' }])).toThrow('minden megjelenő');
    expect(answers('DATA_FLOW_V2')).toHaveLength(3);
    expect(answers('DATA_FLOW_V2', { v2_data_already_digital: 'MOSTLY', v2_data_transfer_automation: 'NO' })).toHaveLength(4);
  });
  test('local answer vocabulary rejects unknown, duplicate and foreign answers', () => {
    const a = answers('QUICK_SCAN_V2');
    for (const answer of ['YES', 'weekly', 'A saját címkém']) expect(() => validateAssessmentSubmission('QUICK_SCAN_V2', 2, [{ ...a[0], answer }, ...a.slice(1)])).toThrow();
    expect(() => validateAssessmentSubmission('QUICK_SCAN_V2', 2, [...a, a[0]])).toThrow();
    expect(() => validateAssessmentSubmission('QUICK_SCAN_V2', 2, [{ questionKey: 'foreign', answer: 'UNKNOWN' }, ...a.slice(1)])).toThrow();
    expect(() => validateAssessmentSubmission('QUICK_SCAN_V2', 1, a)).toThrow();
  });
  test('not applicable replacement does not create a backup finding', () => {
    expect(evaluate('APPROVAL_V2', { v2_approval_decision_wait: 'YES', v2_approval_backup: 'NOT_APPLICABLE' }).findings).toEqual([]);
  });
  test('automation requires all readiness observations and is deferred by rework', () => {
    const stable = { v2_same_sequence_count: 'EIGHT_TEN', v2_process_instructions_use: 'DOCUMENTED_AND_USED', v2_exceptions_recognizable: 'YES', v2_repetitive_data_digital: 'ALL' };
    expect(evaluate('PROCESS_STABILITY_V2', stable).directions.map(d => d.code)).toContain('AUTOMATE_REPETITIVE_STEP');
    const unsafe = evaluate('PROCESS_STABILITY_REWORK_V2', { ...stable, v2_rework_same_point: 'YES' });
    expect(unsafe.directions.map(d => d.code)).not.toContain('AUTOMATE_REPETITIVE_STEP');
    expect(unsafe.findings.some(f => f.defersAutomation)).toBe(true);
    expect(evaluate('PROCESS_STABILITY_V2', { ...stable, v2_exceptions_recognizable: 'UNKNOWN' }).directions).toEqual([]);
  });
  test('every retained rule has an actionable next check and resolvable bounded evidence', () => {
    for (const p of V2_ASSESSMENT_PACKS) for (const f of p.findings) {
      expect(f.nextCheckHu?.length).toBeGreaterThan(10);
      expect(f.triggers.every(t => !t.answers.includes('UNKNOWN') && !t.answers.includes('NOT_APPLICABLE'))).toBe(true);
      const evidence = resolveCustomerEvidence(f.supportingCorpusKeys);
      expect(evidence.length).toBe(f.supportingCorpusKeys.length);
      expect(evidence.every(e => e.boundedClaim && e.strengthLabelHu)).toBe(true);
    }
  });
});
