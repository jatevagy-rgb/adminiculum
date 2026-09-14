/**
 * GROW CUSTOMER ASSESSMENT JOURNEY — assessment registry invariants (unit).
 *
 * Pure, no database. Locks the deterministic question → finding contract and the
 * customer-safe evidence boundary so they cannot silently regress.
 */

import {
  ASSESSMENT_ANSWER_VALUES,
  ASSESSMENT_PACKS,
  AssessmentAnswerInput,
  AssessmentValidationError,
  evaluateAssessmentAnswers,
  getAssessmentPack,
  listAssessmentPacks,
  validateAssessmentSubmission,
} from '../src/modules/company-growth/assessments/registry';
import { evidenceCorpusKeyResolves, resolveCustomerEvidence } from '../src/modules/company-growth/assessments/evidence';

function answersFor(packKey: string, overrides: Record<string, string> = {}): AssessmentAnswerInput[] {
  const pack = getAssessmentPack(packKey)!;
  return pack.questions.map((q) => ({ questionKey: q.questionKey, answer: overrides[q.questionKey] ?? 'UNKNOWN' }));
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected validation error');
  } catch (error) {
    expect(error).toBeInstanceOf(AssessmentValidationError);
    expect((error as AssessmentValidationError).code).toBe(code);
  }
}

describe('GROW assessment registry', () => {
  it('ASSESSMENT_PACK_KEYS_UNIQUE=PASS', () => {
    const keys = listAssessmentPacks().map((p) => p.packKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'DIGITAL_MATURITY',
      'TRANSFORMATION_READINESS',
      'PROCESS_AUTOMATION_READINESS',
      'SYSTEMS_DATA_FLOW',
    ]);
  });

  it('QUESTION_KEYS_UNIQUE_WITHIN_PACK=PASS', () => {
    for (const pack of ASSESSMENT_PACKS) {
      const keys = pack.questions.map((q) => q.questionKey);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('FINDING_KEYS_UNIQUE_WITHIN_PACK=PASS', () => {
    for (const pack of ASSESSMENT_PACKS) {
      const keys = pack.findings.map((f) => f.findingKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('TRIGGERS_NEVER_REFERENCE_UNKNOWN_OR_NOT_APPLICABLE=PASS', () => {
    for (const pack of ASSESSMENT_PACKS) {
      for (const rule of pack.findings) {
        for (const trigger of rule.triggers) {
          expect(trigger.answers).not.toContain('UNKNOWN');
          expect(trigger.answers).not.toContain('NOT_APPLICABLE');
          for (const answer of trigger.answers) {
            expect(ASSESSMENT_ANSWER_VALUES).toContain(answer);
          }
        }
      }
    }
  });

  it('UNKNOWN_PACK_REJECTED=PASS', () => {
    expectCode(() => validateAssessmentSubmission('NOT_A_PACK', 1, []), 'ASSESSMENT_UNKNOWN_PACK');
  });

  it('UNKNOWN_VERSION_REJECTED=PASS', () => {
    expectCode(() => validateAssessmentSubmission('DIGITAL_MATURITY', 99, []), 'ASSESSMENT_UNKNOWN_VERSION');
  });

  it('UNKNOWN_QUESTION_REJECTED=PASS', () => {
    const answers = answersFor('DIGITAL_MATURITY');
    answers[0] = { questionKey: 'nope_question', answer: 'YES' };
    expectCode(() => validateAssessmentSubmission('DIGITAL_MATURITY', 1, answers), 'ASSESSMENT_UNKNOWN_QUESTION');
  });

  it('INVALID_ANSWER_REJECTED=PASS', () => {
    const answers = answersFor('DIGITAL_MATURITY');
    answers[0] = { questionKey: answers[0].questionKey, answer: 'MAYBE' };
    expectCode(() => validateAssessmentSubmission('DIGITAL_MATURITY', 1, answers), 'ASSESSMENT_INVALID_ANSWER');
  });

  it('DUPLICATE_QUESTION_REJECTED=PASS', () => {
    const answers = answersFor('DIGITAL_MATURITY');
    answers[1] = { questionKey: answers[0].questionKey, answer: 'YES' };
    expectCode(() => validateAssessmentSubmission('DIGITAL_MATURITY', 1, answers), 'ASSESSMENT_DUPLICATE_QUESTION');
  });

  it('INCOMPLETE_SUBMISSION_REJECTED=PASS', () => {
    const answers = answersFor('DIGITAL_MATURITY').slice(0, 3);
    expectCode(() => validateAssessmentSubmission('DIGITAL_MATURITY', 1, answers), 'ASSESSMENT_INCOMPLETE');
  });

  it('UNKNOWN_NOT_NEGATIVE=PASS', () => {
    const answers = answersFor('DIGITAL_MATURITY');
    const evaluation = evaluateAssessmentAnswers('DIGITAL_MATURITY', 1, answers)!;
    expect(evaluation.findings).toHaveLength(0);
    expect(evaluation.directions).toHaveLength(0);
    expect(evaluation.unknownDimensions.length).toBeGreaterThan(0);
  });

  it('NOT_APPLICABLE_NOT_NEGATIVE=PASS', () => {
    const pack = getAssessmentPack('DIGITAL_MATURITY')!;
    const answers = pack.questions.map((q) => ({
      questionKey: q.questionKey,
      answer: q.options.some((o) => o.value === 'NOT_APPLICABLE') ? 'NOT_APPLICABLE' : 'UNKNOWN',
    }));
    const evaluation = evaluateAssessmentAnswers('DIGITAL_MATURITY', 1, answers)!;
    expect(evaluation.findings).toHaveLength(0);
    expect(evaluation.notApplicableDimensions.length).toBeGreaterThan(0);
  });

  it('FINDINGS_DETERMINISTIC=PASS', () => {
    const answers = answersFor('DIGITAL_MATURITY', {
      dm_strategy_alignment: 'NO',
      dm_prioritization: 'NO',
      dm_training: 'PARTLY',
    });
    const first = evaluateAssessmentAnswers('DIGITAL_MATURITY', 1, answers);
    const second = evaluateAssessmentAnswers('DIGITAL_MATURITY', 1, answers);
    expect(first).toEqual(second);
    expect(first!.findings.map((f) => f.findingKey)).toEqual([
      'dm_business_link_unclear',
      'dm_skills_not_systematic',
    ]);
  });

  it('FINDINGS_DEDUPLICATED=PASS', () => {
    // Two triggers support dm_business_link_unclear: both negative → ONE finding.
    const answers = answersFor('DIGITAL_MATURITY', {
      dm_strategy_alignment: 'NO',
      dm_prioritization: 'NO',
    });
    const evaluation = evaluateAssessmentAnswers('DIGITAL_MATURITY', 1, answers)!;
    const matches = evaluation.findings.filter((f) => f.findingKey === 'dm_business_link_unclear');
    expect(matches).toHaveLength(1);
    expect(matches[0].triggeringQuestionKeys.sort()).toEqual(['dm_prioritization', 'dm_strategy_alignment']);
  });

  it('EVIDENCE_KEYS_RESOLVE=PASS', () => {
    for (const pack of ASSESSMENT_PACKS) {
      for (const key of pack.evidenceCorpusKeys) {
        expect(evidenceCorpusKeyResolves(key)).toBe(true);
      }
      for (const rule of pack.findings) {
        expect(rule.supportingCorpusKeys.length).toBeGreaterThan(0);
        for (const key of rule.supportingCorpusKeys) {
          expect(evidenceCorpusKeyResolves(key)).toBe(true);
        }
      }
    }
  });

  it('ONLY_VERIFIED_EVIDENCE_CAN_BE_STRONG_BACKING=PASS', () => {
    const verified = resolveCustomerEvidence(['pack:EV-DMM-2024-001']);
    expect(verified).toHaveLength(1);
    expect(verified[0].strength).toBe('STRONG');

    const provisional = resolveCustomerEvidence(['benchmark:unverified-sme-admin-share']);
    expect(provisional).toHaveLength(1);
    expect(provisional[0].strength).toBe('CONTEXT');
    expect(provisional[0].strengthLabelHu).toMatch(/nem ellenőrzött/i);
  });

  it('NO_INTERNAL_DATABASE_IDS_IN_CUSTOMER_RESULT=PASS', () => {
    const evidence = resolveCustomerEvidence(['pack:EV-DMM-2024-001', 'pack:EV-DT-ROI-2024-001']);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toMatch(/\bclientId\b/);
    expect(serialized).not.toMatch(/"id"\s*:/);
    expect(serialized).not.toMatch(/ResearchEvidence/);
    for (const item of evidence) {
      expect(Object.keys(item)).not.toContain('id');
      expect(Object.keys(item)).not.toContain('clientId');
    }
  });

  it('AUTOMATION_DEFERRAL_GUARDRAIL=PASS', () => {
    const neutral: Record<string, string> = {
      pa_owner: 'YES',
      pa_documented: 'YES',
      pa_stable: 'YES',
      pa_rework: 'NO',
      pa_manual_repetitive: 'NO',
      pa_duplicate_entry: 'NO',
      pa_approval_wait: 'NO',
      pa_measured: 'YES',
      pa_automation_suitable: 'YES',
    };
    const clean = evaluateAssessmentAnswers('PROCESS_AUTOMATION_READINESS', 1, answersFor('PROCESS_AUTOMATION_READINESS', neutral))!;
    expect(clean.findings).toHaveLength(0);

    const manualOnly = evaluateAssessmentAnswers(
      'PROCESS_AUTOMATION_READINESS',
      1,
      answersFor('PROCESS_AUTOMATION_READINESS', { ...neutral, pa_manual_repetitive: 'YES' }),
    )!;
    expect(manualOnly.directions.map((d) => d.code)).toContain('AUTOMATE_REPETITIVE_STEP');
    expect(manualOnly.directions.map((d) => d.code)).not.toContain('REDESIGN_BEFORE_AUTOMATING');

    const unstable = evaluateAssessmentAnswers(
      'PROCESS_AUTOMATION_READINESS',
      1,
      answersFor('PROCESS_AUTOMATION_READINESS', {
        ...neutral,
        pa_manual_repetitive: 'YES',
        pa_rework: 'YES',
      }),
    )!;
    const codes = unstable.directions.map((d) => d.code);
    expect(codes).toContain('REDESIGN_BEFORE_AUTOMATING');
    expect(codes).not.toContain('AUTOMATE_REPETITIVE_STEP');
  });

  it('FOUR_V1_PACKS_PRESENT=PASS', () => {
    expect(ASSESSMENT_PACKS).toHaveLength(4);
    for (const pack of ASSESSMENT_PACKS) {
      expect(pack.version).toBe(1);
      expect(pack.titleHu.length).toBeGreaterThan(0);
      expect(pack.descriptionHu.length).toBeGreaterThan(0);
      expect(pack.estimatedMinutes).toBeGreaterThan(0);
    }
  });
});
