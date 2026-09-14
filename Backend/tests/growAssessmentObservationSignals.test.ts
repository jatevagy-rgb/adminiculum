/**
 * GROW assessment → GrowSignal normalization (unit, fail-closed).
 *
 * Proves the PR #230 Observation → GrowSignal boundary only recognizes the
 * explicit GROW_ASSESSMENT_V1 schema and only maps findings whose registry rule
 * carries a canonical survey category. Non-mappable findings (strategy,
 * leadership, culture, customer feedback) must NEVER be coerced into a Grow
 * process domain, and unknown packs/answers must fail closed.
 */

import {
  GROW_ASSESSMENT_SCHEMA,
  getAssessmentPack,
} from '../src/modules/company-growth/assessments/registry';
import { observationToGrowSignals } from '../src/modules/company-growth/research/observationSignals';

function observation(packKey: string, overrides: Record<string, string> = {}) {
  const pack = getAssessmentPack(packKey)!;
  return {
    id: 'obs-test-1',
    observationType: 'DECLARED_SURVEY',
    observedAt: new Date('2026-09-14T10:00:00Z'),
    sourceRecordId: `grow-assessment:${packKey}:key-1`,
    rawPayload: {
      schema: GROW_ASSESSMENT_SCHEMA,
      kind: 'GROW_ASSESSMENT',
      packKey,
      packVersion: 1,
      answers: pack.questions.map((q) => ({ questionKey: q.questionKey, answer: overrides[q.questionKey] ?? 'UNKNOWN' })),
      processId: null,
      provenance: { channel: 'CLIENT_PORTAL', workspaceId: 'ws-1', identityId: 'id-1' },
    },
  };
}

const NEUTRAL_PROCESS: Record<string, string> = {
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

describe('GROW assessment → GrowSignal normalization', () => {
  it('ASSESSMENT_MAPPABLE_FINDING_PRODUCES_SIGNAL=PASS', () => {
    const signals = observationToGrowSignals(
      observation('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' }),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].domainKey).toBe('MANUAL_ADMIN_LOAD');
    expect(signals[0].declared).toBe(true);
    expect(signals[0].measured).toBe(false);
    expect(signals[0].provenance.categoryKey).toBe('MANUAL_ADMIN');
  });

  it('ASSESSMENT_MULTIPLE_MAPPABLE_FINDINGS_DEDUPE_BY_CATEGORY=PASS', () => {
    const signals = observationToGrowSignals(
      observation('PROCESS_AUTOMATION_READINESS', {
        ...NEUTRAL_PROCESS,
        pa_rework: 'YES',
        pa_manual_repetitive: 'YES',
      }),
    );
    const domains = signals.map((s) => s.domainKey).sort();
    expect(domains).toEqual(['MANUAL_ADMIN_LOAD', 'REWORK']);
    // one signal per canonical category
    expect(new Set(signals.map((s) => s.provenance.categoryKey)).size).toBe(signals.length);
  });

  it('NON_MAPPABLE_FINDING_IS_NOT_COERCED=PASS', () => {
    // dm_business_link_unclear (strategy) has no canonical survey category.
    const signals = observationToGrowSignals(observation('DIGITAL_MATURITY', { dm_strategy_alignment: 'NO' }));
    expect(signals).toHaveLength(0);
  });

  it('UNKNOWN_PACK_FAILS_CLOSED=PASS', () => {
    const obs = observation('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' });
    (obs.rawPayload as any).packKey = 'NOT_A_PACK';
    expect(observationToGrowSignals(obs)).toHaveLength(0);
  });

  it('UNKNOWN_VERSION_FAILS_CLOSED=PASS', () => {
    const obs = observation('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' });
    (obs.rawPayload as any).packVersion = 42;
    expect(observationToGrowSignals(obs)).toHaveLength(0);
  });

  it('INVALID_ANSWER_SET_FAILS_CLOSED=PASS', () => {
    const obs = observation('PROCESS_AUTOMATION_READINESS', { ...NEUTRAL_PROCESS, pa_manual_repetitive: 'YES' });
    (obs.rawPayload as any).answers = (obs.rawPayload as any).answers.slice(1);
    expect(observationToGrowSignals(obs)).toHaveLength(0);
  });

  it('GROW_PAIN_INTAKE_STILL_NORMALIZES=PASS', () => {
    const signals = observationToGrowSignals({
      id: 'obs-survey-1',
      observationType: 'DECLARED_SURVEY',
      observedAt: new Date('2026-09-14T10:00:00Z'),
      rawPayload: { kind: 'GROW_PAIN_INTAKE', categories: ['REWORK', 'TOTALLY_UNKNOWN'] },
    });
    expect(signals).toHaveLength(1);
    expect(signals[0].domainKey).toBe('REWORK');
  });
});
