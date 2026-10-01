/**
 * GROW — ROI provenance & measurement-basis truth tests (no database).
 *
 * Locks the repaired contracts for G1 (provenance/measurement basis) and
 * G2 (waiting time vs money):
 *
 *  G1.1  estimate-based before/after inputs must never be labelled MEASURED
 *  G1.2  the MEASURED basis requires explicit measured origins on both sides
 *  G1.3  a caller-supplied provenanceType cannot relabel a non-measured basis
 *  G1.4  values without a declared origin are rejected (fail closed)
 *  G1.5  null is unknown — never coerced to an explicit zero
 *
 *  G2.1  waiting-time reduction alone produces no cash figure
 *  G2.2  cash is derived only from active-time savings x explicit rate x people
 *  G2.3  unknown runs/people/rate produce null cash, not invented zeros
 *  G2.4  negative improvement is an explicit zero saving, not a gain
 *  G2.5  a calculation from an estimate stays based on an estimate
 *  G2.6  before-only without a delta exposes no savings (unavailable state)
 */

import {
  INPUT_VALUE_ORIGINS,
  ROI_ENGINE_VERSION,
  computeRoiEstimate,
  validateRoiInputs,
} from '../src/modules/company-growth/research/roiEngine';

describe('G1 — provenance and measurement basis', () => {
  it('G1.0 exposes the canonical input-origin contract', () => {
    expect([...INPUT_VALUE_ORIGINS]).toEqual(['MEASURED', 'DECLARED', 'ESTIMATED', 'CALCULATED', 'UNKNOWN']);
  });

  it('G1.1 estimate-based before/after inputs are labelled ESTIMATED, never MEASURED', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 435,
      beforeWaitingMinutes: 8100,
      afterActiveMinutes: 200,
      afterWaitingMinutes: 3000,
      beforeOrigin: 'ESTIMATED',
      afterOrigin: 'ESTIMATED',
    });
    expect(result.basis).toBe('ESTIMATED');
    expect(result.provenanceType).toBe('CLIENT_ESTIMATE');
  });

  it('G1.2 measured basis requires MEASURED origins on BOTH before and after', () => {
    const measured = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 435,
      beforeWaitingMinutes: 8100,
      afterActiveMinutes: 200,
      afterWaitingMinutes: 3000,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
    });
    expect(measured.basis).toBe('MEASURED');
    expect(measured.provenanceType).toBe('MEASURED');

    const mixed = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 435,
      afterActiveMinutes: 200,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'ESTIMATED',
    });
    expect(mixed.basis).not.toBe('MEASURED');
    expect(mixed.basis).toBe('ESTIMATED');
  });

  it('G1.3 a caller-supplied MEASURED provenance flag cannot relabel estimates', () => {
    expect(() =>
      computeRoiEstimate({
        runsPerMonth: 4,
        beforeActiveMinutes: 435,
        afterActiveMinutes: 200,
        beforeOrigin: 'ESTIMATED',
        afterOrigin: 'ESTIMATED',
        provenanceType: 'MEASURED',
      }),
    ).toThrow(/ROI_INPUT_INVALID/);
  });

  it('G1.4 values without a declared origin are rejected instead of silently relabelled', () => {
    expect(() =>
      computeRoiEstimate({
        runsPerMonth: 4,
        beforeActiveMinutes: 435,
        afterActiveMinutes: 200,
        beforeOrigin: 'UNKNOWN',
        afterOrigin: 'MEASURED',
      }),
    ).toThrow(/ROI_INPUT_INVALID/);

    expect(() =>
      computeRoiEstimate({
        runsPerMonth: 4,
        beforeActiveMinutes: 435,
        afterActiveMinutes: null,
        beforeOrigin: 'ESTIMATED',
        afterOrigin: 'UNKNOWN',
      }),
    ).toThrow(/ROI_INPUT_INVALID/);

    expect(validateRoiInputs({ runsPerMonth: 4, beforeActiveMinutes: 10, afterActiveMinutes: 8, beforeOrigin: 'MADE_UP' as never, afterOrigin: 'MEASURED' })).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'beforeOrigin' })]),
    );
  });

  it('G1.5 null is unknown: missing waiting values never become explicit zeros', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 100,
      beforeWaitingMinutes: null,
      afterActiveMinutes: 80,
      afterWaitingMinutes: null,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
    });
    expect(result.waitingTimeSavedMinutesPerRun).toBeNull();
    expect(result.waitingTimeSavedMinutesPerMonth).toBeNull();
    expect(result.timeSavedMinutesPerRun).toEqual({ low: 20, base: 20, high: 20 });
  });

  it('G1.6 measured inputs recorded without any after/delta expose an unavailable savings state, not zeros', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 100,
      beforeWaitingMinutes: null,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      beforeOrigin: 'MEASURED',
    });
    expect(result.basis).toBe('MEASURED');
    expect(result.timeSavedMinutesPerRun).toBeNull();
    expect(result.timeSavedMinutesPerMonth).toBeNull();
    expect(result.cashSavedHufPerMonth).toBeNull();
  });

  it('G1.7 the formula version reflects the corrected provenance-aware engine', () => {
    expect(ROI_ENGINE_VERSION).toBe('grow-roi-v2');
  });
});

describe('G2 — waiting time and money', () => {
  it('G2.1 waiting-time reduction alone must not produce any cash figure', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 100,
      beforeWaitingMinutes: 2000,
      afterActiveMinutes: 100,
      afterWaitingMinutes: 1000,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
      hourlyCostHuf: { low: 8000, base: 10000, high: 12000 },
      peopleAffected: 2,
    });
    expect(result.basis).toBe('MEASURED');
    expect(result.timeSavedMinutesPerRun).toEqual({ low: 0, base: 0, high: 0 });
    expect(result.waitingTimeSavedMinutesPerRun).toEqual({ low: 1000, base: 1000, high: 1000 });
    expect(result.waitingTimeSavedMinutesPerMonth).toEqual({ low: 4000, base: 4000, high: 4000 });
    // Waiting time is elapsed queue time — no billable cash may be derived from it.
    expect(result.cashSavedHufPerMonth).toBeNull();
  });

  it('G2.2 cash is derived ONLY from active-time savings x runs x people x rate', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 435,
      beforeWaitingMinutes: 8100,
      afterActiveMinutes: 200,
      afterWaitingMinutes: 3000,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
      hourlyCostHuf: { low: 8000, base: 12000, high: 16000 },
      peopleAffected: 3,
    });
    // active saved: 235 min/run; monthly 940 process-min; 3 people -> 2820 person-min;
    // /60 * rate -> base = 2820/60*12000 = 564000
    expect(result.timeSavedMinutesPerRun).toEqual({ low: 235, base: 235, high: 235 });
    expect(result.timeSavedMinutesPerMonth).toEqual({ low: 940, base: 940, high: 940 });
    expect(result.cashSavedHufPerMonth).toEqual({ low: 376000, base: 564000, high: 752000 });
    // The waiting delta (5100 min/run) must never inflate the cash figure.
    expect(result.waitingTimeSavedMinutesPerRun).toEqual({ low: 5100, base: 5100, high: 5100 });
    expect((result.cashSavedHufPerMonth as { high: number }).high).toBeLessThanOrEqual(752000);
  });

  it('G2.3 unknown runs per month produce no invented monthly or cash figures', () => {
    const result = computeRoiEstimate({
      runsPerMonth: null,
      beforeActiveMinutes: 100,
      afterActiveMinutes: 80,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
      hourlyCostHuf: { low: 8000, base: 10000, high: 12000 },
      peopleAffected: 2,
    });
    expect(result.timeSavedMinutesPerRun).toEqual({ low: 20, base: 20, high: 20 });
    expect(result.timeSavedMinutesPerMonth).toBeNull();
    expect(result.cashSavedHufPerMonth).toBeNull();
  });

  it('G2.4 unknown headcount or missing rate produce no cash figure', () => {
    const noPeople = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 100,
      afterActiveMinutes: 80,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
      hourlyCostHuf: { low: 8000, base: 10000, high: 12000 },
      peopleAffected: null,
    });
    expect(noPeople.cashSavedHufPerMonth).toBeNull();

    const noRate = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 100,
      afterActiveMinutes: 80,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
      peopleAffected: 2,
    });
    expect(noRate.cashSavedHufPerMonth).toBeNull();
    expect(noRate.timeSavedMinutesPerMonth).toEqual({ low: 80, base: 80, high: 80 });
  });

  it('G2.5 negative improvement is an explicit zero saving, never a gain, and never cash', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 60,
      afterActiveMinutes: 100,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
      hourlyCostHuf: { low: 8000, base: 10000, high: 12000 },
      peopleAffected: 2,
    });
    expect(result.timeSavedMinutesPerRun).toEqual({ low: 0, base: 0, high: 0 });
    expect(result.cashSavedHufPerMonth).toBeNull();
  });

  it('G2.6 a calculation from an estimate stays based on an estimate', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 100,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      beforeOrigin: 'ESTIMATED',
      expectedActiveReductionPct: 30,
    });
    expect(result.basis).toBe('ESTIMATED');
    expect(result.provenanceType).toBe('CLIENT_ESTIMATE');
  });

  it('G2.7 a stated delta over a measured baseline stays CALCULATED', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 100,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      beforeOrigin: 'MEASURED',
      expectedActiveReductionPct: 30,
    });
    expect(result.basis).toBe('CALCULATED');
    expect(result.timeSavedMinutesPerRun).toEqual({ low: 15, base: 30, high: 45 });
  });

  it('G2.8 assumed (no data at all) yields explicit zero savings and no cash', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 0,
      beforeActiveMinutes: null,
      beforeWaitingMinutes: null,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
    });
    expect(result.basis).toBe('ASSUMED');
    expect(result.timeSavedMinutesPerRun).toEqual({ low: 0, base: 0, high: 0 });
    expect(result.cashSavedHufPerMonth).toBeNull();
  });

  it('G2.9 waiting-only savings with unknown runs stays honest (no monthly, no cash)', () => {
    const result = computeRoiEstimate({
      runsPerMonth: null,
      beforeActiveMinutes: 100,
      beforeWaitingMinutes: 2000,
      afterActiveMinutes: 100,
      afterWaitingMinutes: 1000,
      beforeOrigin: 'MEASURED',
      afterOrigin: 'MEASURED',
      hourlyCostHuf: { low: 8000, base: 10000, high: 12000 },
      peopleAffected: 2,
    });
    expect(result.waitingTimeSavedMinutesPerRun).toEqual({ low: 1000, base: 1000, high: 1000 });
    expect(result.waitingTimeSavedMinutesPerMonth).toBeNull();
    expect(result.cashSavedHufPerMonth).toBeNull();
  });

  it('G2.10 provenance records the declared origins and the cash valuation disclaimer', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 100,
      afterActiveMinutes: 80,
      beforeOrigin: 'ESTIMATED',
      afterOrigin: 'ESTIMATED',
      hourlyCostHuf: { low: 8000, base: 10000, high: 12000 },
      peopleAffected: 2,
    });
    expect(result.provenance.inputs.beforeOrigin).toBe('ESTIMATED');
    expect(result.provenance.inputs.afterOrigin).toBe('ESTIMATED');
    expect(result.provenance.timeSavedIsNotCashSaved).toBe(true);
    expect(result.provenance.cashIsCapacityValuationNotRealizedSavings).toBe(true);
  });
});
