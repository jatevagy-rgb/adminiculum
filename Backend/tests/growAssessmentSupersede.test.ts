/**
 * GROW assessment observation supersede (unit).
 *
 * A customer retake must SUPERSEDE the observation it corrects: Grow research
 * must reason over the same latest-per-scope view the customer portal shows.
 * Non-assessment observations (including the generic pain-intake survey) are
 * never affected.
 */

import {
  GROW_ASSESSMENT_SCHEMA,
  getAssessmentPack,
} from '../src/modules/company-growth/assessments/registry';
import {
  observationsToGrowSignals,
  supersedeAssessmentObservations,
  type NormalizableObservation,
} from '../src/modules/company-growth/research/observationSignals';

function assessment(
  id: string,
  packKey: string,
  observedAt: string,
  processId: string | null = null,
  answers: Record<string, string> = {},
  workspaceId = 'ws-1',
): NormalizableObservation {
  const pack = getAssessmentPack(packKey)!;
  return {
    id,
    observationType: 'DECLARED_SURVEY',
    observedAt: new Date(observedAt),
    sourceRecordId: `grow-assessment:${packKey}:${id}`,
    rawPayload: {
      schema: GROW_ASSESSMENT_SCHEMA,
      kind: 'GROW_ASSESSMENT',
      packKey,
      packVersion: 1,
      answers: pack.questions.map((q) => ({ questionKey: q.questionKey, answer: answers[q.questionKey] ?? 'UNKNOWN' })),
      processId,
      provenance: { channel: 'CLIENT_PORTAL', workspaceId, identityId: 'id-1' },
    },
  };
}

function survey(id: string, observedAt: string, categories: string[]): NormalizableObservation {
  return {
    id,
    observationType: 'DECLARED_SURVEY',
    observedAt: new Date(observedAt),
    rawPayload: { kind: 'GROW_PAIN_INTAKE', categories },
  };
}

describe('GROW assessment observation supersede', () => {
  it('RETAKE_SUPERSEDES_OLDER_ASSESSMENT=PASS', () => {
    const older = assessment('obs-1', 'PROCESS_AUTOMATION_READINESS', '2026-09-01T10:00:00Z');
    const newer = assessment('obs-2', 'PROCESS_AUTOMATION_READINESS', '2026-09-10T10:00:00Z');
    const kept = supersedeAssessmentObservations([newer, older]);
    expect(kept.map((o) => o.id)).toEqual(['obs-2']);
  });

  it('NEWEST_WINS_INDEPENDENT_OF_INPUT_ORDER=PASS', () => {
    const older = assessment('obs-1', 'DIGITAL_MATURITY', '2026-09-01T10:00:00Z');
    const newer = assessment('obs-2', 'DIGITAL_MATURITY', '2026-09-10T10:00:00Z');
    const kept = supersedeAssessmentObservations([older, newer]);
    expect(kept.map((o) => o.id)).toEqual(['obs-2']);
  });

  it('DIFFERENT_PACKS_ARE_NOT_MERGED=PASS', () => {
    const a = assessment('obs-1', 'DIGITAL_MATURITY', '2026-09-01T10:00:00Z');
    const b = assessment('obs-2', 'SYSTEMS_DATA_FLOW', '2026-09-02T10:00:00Z');
    const kept = supersedeAssessmentObservations([b, a]);
    expect(kept.map((o) => o.id).sort()).toEqual(['obs-1', 'obs-2']);
  });

  it('PROCESS_SCOPE_IS_INDEPENDENT=PASS', () => {
    const processA1 = assessment('obs-1', 'PROCESS_AUTOMATION_READINESS', '2026-09-01T10:00:00Z', 'proc-a');
    const processA2 = assessment('obs-2', 'PROCESS_AUTOMATION_READINESS', '2026-09-10T10:00:00Z', 'proc-a');
    const processB = assessment('obs-3', 'PROCESS_AUTOMATION_READINESS', '2026-09-05T10:00:00Z', 'proc-b');
    const kept = supersedeAssessmentObservations([processA2, processB, processA1]);
    expect(kept.map((o) => o.id).sort()).toEqual(['obs-2', 'obs-3']);
  });

  it('WORKSPACE_SCOPE_IS_INDEPENDENT=PASS', () => {
    const wsA = assessment('obs-1', 'DIGITAL_MATURITY', '2026-09-01T10:00:00Z', null, {}, 'ws-a');
    const wsA2 = assessment('obs-2', 'DIGITAL_MATURITY', '2026-09-10T10:00:00Z', null, {}, 'ws-a');
    const wsB = assessment('obs-3', 'DIGITAL_MATURITY', '2026-09-05T10:00:00Z', null, {}, 'ws-b');
    const kept = supersedeAssessmentObservations([wsA2, wsB, wsA]);
    expect(kept.map((o) => o.id).sort()).toEqual(['obs-2', 'obs-3']);
  });

  it('GENERIC_PAIN_INTAKE_IS_NEVER_SUPERSEDED=PASS', () => {
    const s1 = survey('obs-s1', '2026-09-01T10:00:00Z', ['REWORK']);
    const s2 = survey('obs-s2', '2026-09-02T10:00:00Z', ['MANUAL_ADMIN']);
    const a1 = assessment('obs-a1', 'DIGITAL_MATURITY', '2026-09-01T10:00:00Z');
    const a2 = assessment('obs-a2', 'DIGITAL_MATURITY', '2026-09-10T10:00:00Z');
    const kept = supersedeAssessmentObservations([s1, s2, a2, a1]);
    expect(kept.map((o) => o.id).sort()).toEqual(['obs-a2', 'obs-s1', 'obs-s2']);
  });

  it('NON_ASSESSMENT_INPUT_IS_PASSED_THROUGH=PASS', () => {
    const s1 = survey('obs-s1', '2026-09-01T10:00:00Z', ['REWORK']);
    const kept = supersedeAssessmentObservations([s1]);
    expect(kept).toEqual([s1]);
  });
});

describe('GROW assessment retake research semantics', () => {
  const problemAnswers = { pa_rework: 'YES', pa_manual_repetitive: 'YES' };
  const healthyAnswers = { pa_rework: 'NO', pa_manual_repetitive: 'NO' };

  it('ASSESSMENT_RETAKE_OLD_OBSERVATION_PRESERVED=PASS', () => {
    const older = assessment('obs-1', 'PROCESS_AUTOMATION_READINESS', '2026-09-01T10:00:00Z', 'proc-a', problemAnswers);
    const newer = assessment('obs-2', 'PROCESS_AUTOMATION_READINESS', '2026-09-10T10:00:00Z', 'proc-a', healthyAnswers);
    const input = [older, newer];
    const kept = supersedeAssessmentObservations(input);
    // Selection is non-destructive: the source array is untouched and the older
    // observation still exists (history stays immutable).
    expect(input).toHaveLength(2);
    expect(input).toContain(older);
    expect(kept).not.toContain(older);
  });

  it('ASSESSMENT_RETAKE_ONLY_LATEST_ENTERS_RESEARCH=PASS', () => {
    const older = assessment('obs-1', 'PROCESS_AUTOMATION_READINESS', '2026-09-01T10:00:00Z', 'proc-a', problemAnswers);
    const newer = assessment('obs-2', 'PROCESS_AUTOMATION_READINESS', '2026-09-10T10:00:00Z', 'proc-a', healthyAnswers);
    const signals = observationsToGrowSignals(supersedeAssessmentObservations([newer, older]));
    // Only the latest (healthy) submission is normalized → no signal at all.
    expect(signals).toHaveLength(0);
  });

  it('ASSESSMENT_RETAKE_HEALTHY_ANSWER_REMOVES_STALE_SIGNAL=PASS', () => {
    const older = assessment('obs-1', 'PROCESS_AUTOMATION_READINESS', '2026-09-01T10:00:00Z', 'proc-a', problemAnswers);
    const staleBefore = observationsToGrowSignals([older]);
    expect(staleBefore.map((s) => s.domainKey).sort()).toEqual(['MANUAL_ADMIN_LOAD', 'REWORK']);

    const newer = assessment('obs-2', 'PROCESS_AUTOMATION_READINESS', '2026-09-10T10:00:00Z', 'proc-a', healthyAnswers);
    const afterRetake = observationsToGrowSignals(supersedeAssessmentObservations([newer, older]));
    expect(afterRetake).toHaveLength(0);
  });

  it('GENERIC_SURVEY_RESEARCH_UNCHANGED=PASS', () => {
    const s1 = survey('obs-s1', '2026-09-01T10:00:00Z', ['REWORK']);
    const a1 = assessment('obs-a1', 'PROCESS_AUTOMATION_READINESS', '2026-09-01T09:00:00Z', 'proc-a', problemAnswers);
    const a2 = assessment('obs-a2', 'PROCESS_AUTOMATION_READINESS', '2026-09-10T09:00:00Z', 'proc-a', healthyAnswers);
    const before = observationsToGrowSignals([s1]);
    const after = observationsToGrowSignals(supersedeAssessmentObservations([s1, a2, a1]));
    expect(after).toEqual(before);
    expect(after.map((s) => s.domainKey)).toEqual(['REWORK']);
  });

  it('PROCESS_SIGNAL_SCOPED_TO_SELECTED_PROCESS=PASS', () => {
    const scoped = assessment('obs-1', 'PROCESS_AUTOMATION_READINESS', '2026-09-01T10:00:00Z', 'proc-a', problemAnswers);
    const signals = observationsToGrowSignals([scoped]);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.businessProcessId === 'proc-a')).toBe(true);
  });

  it('NON_PROCESS_PACK_REMAINS_UNSCOPED=PASS', () => {
    // A submission without a process reference normalizes to an unscoped signal
    // (businessProcessId null); the intake separately guarantees that packs which
    // do not allow a process reference never persist one.
    const unscoped = assessment('obs-1', 'PROCESS_AUTOMATION_READINESS', '2026-09-01T10:00:00Z', null, problemAnswers);
    const signals = observationsToGrowSignals([unscoped]);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.businessProcessId === null)).toBe(true);
  });
});
