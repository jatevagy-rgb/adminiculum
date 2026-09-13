/**
 * GROW intervention taxonomy — unit tests (no database).
 *
 * Locks the 13-code catalogue and the explicit safety guardrails so they cannot
 * silently regress into frontend-only copy.
 */

import {
  INTERVENTION_CODES,
  INTERVENTIONS,
  deriveProcessSignals,
  interventionLabelHu,
  selectInterventions,
  type ProcessSignal,
} from '../src/modules/company-growth/research/interventions';

describe('intervention taxonomy', () => {
  it('exposes all 13 canonical interventions, each human-review-required', () => {
    expect(INTERVENTION_CODES).toHaveLength(13);
    expect(new Set(INTERVENTION_CODES).size).toBe(13);
    for (const def of INTERVENTIONS) {
      expect(def.humanReviewRequired).toBe(true);
      expect(def.labelHu.length).toBeGreaterThan(0);
    }
    expect(interventionLabelHu('STANDARDIZE_PROCESS')).toBe('Folyamat standardizálása');
    expect(interventionLabelHu('UNKNOWN_CODE')).toBe('UNKNOWN_CODE');
  });

  it('guardrail: LONG_CYCLE_TIME alone does NOT trigger approval redesign', () => {
    const signals: ProcessSignal[] = ['LONG_CYCLE_TIME'];
    expect(selectInterventions({ domainKey: 'APPROVAL_DELAY', signals, measured: true })).not.toContain(
      'REDESIGN_APPROVAL_ROUTING',
    );
    expect(
      selectInterventions({ domainKey: 'APPROVAL_DELAY', signals: [...signals, 'APPROVAL_HEAVY'], measured: true }),
    ).toContain('REDESIGN_APPROVAL_ROUTING');
  });

  it('guardrail: MULTI_SYSTEM_PROCESS alone does NOT trigger CONSOLIDATE_SYSTEMS', () => {
    const base: ProcessSignal[] = ['MULTI_SYSTEM_PROCESS'];
    expect(selectInterventions({ domainKey: 'SYSTEM_SWITCHING', signals: base, measured: true })).not.toContain(
      'CONSOLIDATE_SYSTEMS',
    );
    expect(
      selectInterventions({ domainKey: 'SYSTEM_SWITCHING', signals: [...base, 'HIGH_SYSTEM_SWITCHES'], measured: true }),
    ).toContain('CONSOLIDATE_SYSTEMS');
  });

  it('guardrail: SINGLE_PERSON_DEPENDENCY alone does NOT trigger ownership clarification', () => {
    const base: ProcessSignal[] = ['SINGLE_PERSON_DEPENDENCY'];
    expect(selectInterventions({ domainKey: 'UNCLEAR_OWNERSHIP', signals: base, measured: true })).not.toContain(
      'CLARIFY_PROCESS_OWNERSHIP',
    );
    expect(
      selectInterventions({ domainKey: 'UNCLEAR_OWNERSHIP', signals: [...base, 'UNASSIGNED_STEPS'], measured: true }),
    ).toContain('CLARIFY_PROCESS_OWNERSHIP');
  });

  it('guardrail: MANUAL_DATA_ENTRY alone does not become an intake diagnosis', () => {
    // DIGITIZE_INTAKE is domain-restricted to MANUAL_ADMIN_LOAD / DUPLICATE_DATA_ENTRY.
    expect(
      selectInterventions({ domainKey: 'APPROVAL_DELAY', signals: ['MANUAL_DATA_ENTRY'], measured: true }),
    ).not.toContain('DIGITIZE_INTAKE');
  });

  it('automation is deferred when variability / rework / unclear ownership is present', () => {
    const signals: ProcessSignal[] = ['REPETITIVE_STEP', 'REWORK_PRESENT'];
    const selected = selectInterventions({ domainKey: 'DUPLICATE_DATA_ENTRY', signals, measured: true });
    expect(selected).not.toContain('AUTOMATE_REPETITIVE_STEP');
    expect(selected).toContain('REDESIGN_BEFORE_AUTOMATING');
  });

  it('automation is allowed when the process is stable', () => {
    const selected = selectInterventions({
      domainKey: 'DUPLICATE_DATA_ENTRY',
      signals: ['REPETITIVE_STEP'],
      measured: true,
    });
    expect(selected).toContain('AUTOMATE_REPETITIVE_STEP');
    expect(selected).not.toContain('REDESIGN_BEFORE_AUTOMATING');
  });

  it('domain filtering prevents nonsense pairings', () => {
    // A privacy/HR-style domain is not in the taxonomy and yields nothing.
    expect(selectInterventions({ domainKey: 'PRIVACY_GAP', signals: ['MANUAL_DATA_ENTRY'], measured: true })).toEqual([]);
    // Approval domain never yields system consolidation.
    expect(
      selectInterventions({ domainKey: 'APPROVAL_DELAY', signals: ['HIGH_SYSTEM_SWITCHES'], measured: true }),
    ).not.toContain('CONSOLIDATE_SYSTEMS');
  });

  it('deriveProcessSignals reads the T2A metric codes and survey categories', () => {
    const signals = deriveProcessSignals({
      metrics: {
        WAITING_SHARE: 0.949,
        APPROVAL_STEP_COUNT: 2,
        DATA_ENTRY_STEP_COUNT: 3,
        SYSTEM_SWITCH_COUNT: 7,
        SYSTEM_COUNT: 5,
        UNASSIGNED_STEP_COUNT: 0,
        PROCESS_OWNER_PRESENT: true,
        TOTAL_ACTIVE_MINUTES: 435,
      },
      surveyCategories: ['REWORK', 'SLOW_APPROVAL'],
      measured: true,
      declared: true,
    });
    expect(signals).toEqual(
      expect.arrayContaining([
        'HIGH_WAITING_SHARE',
        'LONG_CYCLE_TIME',
        'MULTI_SYSTEM_PROCESS',
        'HIGH_SYSTEM_SWITCHES',
        'MANUAL_DATA_ENTRY',
        'REPEATED_DATA_ENTRY',
        'REWORK_PRESENT',
      ]),
    );
    // Approval count 2 is below the APPROVAL_HEAVY threshold of 3.
    expect(signals).not.toContain('APPROVAL_HEAVY');
    // Owner is present and no unassigned steps -> no ownership-failure signal.
    expect(signals).not.toContain('UNASSIGNED_STEPS');
  });
});
