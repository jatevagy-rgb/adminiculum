/**
 * PR460 residual gaps — G1-L (omitted/single origin guard) and G2-L
 * (legacy before-only waiting monetization, missing active input).
 *
 * Regression tests written BEFORE the engine edit; they capture the false
 * behaviors of the delivered head and lock the repaired contract:
 *
 *  G1-L.1  both origins omitted must never certify a MEASURED basis
 *  G1-L.2  both origins explicitly null must never certify a MEASURED basis
 *  G1-L.3  a single MEASURED origin cannot certify the comparison
 *  G1-L.4  both origins MEASURED still certify MEASURED (kept contract)
 *
 *  G2-L.1  legacy before-only estimate must not monetize waiting minutes
 *  G2-L.2  legacy before-only with unknown active minutes stays unavailable
 *  G2-L.3  expected-reduction with unknown active minutes stays unavailable
 *  G2-L.4  legacy before-only active estimate contract is preserved
 */

import { computeRoiEstimate } from '../src/modules/company-growth/research/roiEngine';

const beforeAfter = {
  runsPerMonth: 1,
  beforeActiveMinutes: 100,
  beforeWaitingMinutes: null,
  afterActiveMinutes: 50,
  afterWaitingMinutes: null,
};

describe('G1-L — omitted/single origin never certifies MEASURED', () => {
  it('G1-L.1 both origins omitted never produce a MEASURED basis', () => {
    const r = computeRoiEstimate(beforeAfter);
    console.log('G1-L.1 omitted:', JSON.stringify({ basis: r.basis, provenanceType: r.provenanceType, timeSavedMinutesPerRun: r.timeSavedMinutesPerRun }));
    expect(r.basis).not.toBe('MEASURED');
    expect(r.basis).toBe('ASSUMED');
  });

  it('G1-L.2 explicit null origins never produce a MEASURED basis', () => {
    const r = computeRoiEstimate({ ...beforeAfter, beforeOrigin: null, afterOrigin: null });
    expect(r.basis).not.toBe('MEASURED');
    expect(r.basis).toBe('ASSUMED');
  });

  it('G1-L.3 a single MEASURED origin cannot certify the comparison', () => {
    const beforeOnlyMeasured = computeRoiEstimate({ ...beforeAfter, beforeOrigin: 'MEASURED' as const });
    const afterOnlyMeasured = computeRoiEstimate({ ...beforeAfter, afterOrigin: 'MEASURED' as const });
    console.log('G1-L.3 single origins:', JSON.stringify({ beforeOnly: beforeOnlyMeasured.basis, afterOnly: afterOnlyMeasured.basis }));
    expect(beforeOnlyMeasured.basis).not.toBe('MEASURED');
    expect(afterOnlyMeasured.basis).not.toBe('MEASURED');
    expect(beforeOnlyMeasured.basis).toBe('ASSUMED');
    expect(afterOnlyMeasured.basis).toBe('ASSUMED');
  });

  it('G1-L.4 both MEASURED origins still certify MEASURED (kept contract)', () => {
    const r = computeRoiEstimate({ ...beforeAfter, beforeOrigin: 'MEASURED' as const, afterOrigin: 'MEASURED' as const });
    expect(r.basis).toBe('MEASURED');
    expect(r.timeSavedMinutesPerRun).toEqual({ low: 50, base: 50, high: 50 });
  });

  it('G1-L.5 the deterministic active delta is preserved when only the origin support is missing', () => {
    const r = computeRoiEstimate(beforeAfter);
    expect(r.timeSavedMinutesPerRun).toEqual({ low: 50, base: 50, high: 50 });
  });
});

describe('G2-L — legacy before-only paths never monetize waiting', () => {
  const rate = { low: 6000, base: 6000, high: 6000 };

  it('G2-L.1 legacy before-only estimate with waiting-only input produces no savings and no cash', () => {
    const r = computeRoiEstimate({
      runsPerMonth: 1,
      beforeActiveMinutes: 0,
      beforeWaitingMinutes: 600,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      peopleAffected: 1,
      hourlyCostHuf: rate,
    });
    console.log('G2-L.1 waiting-only before-only:', JSON.stringify({ basis: r.basis, timeSavedMinutesPerRun: r.timeSavedMinutesPerRun, cashSavedHufPerMonth: r.cashSavedHufPerMonth }));
    expect(r.timeSavedMinutesPerRun).toEqual({ low: 0, base: 0, high: 0 });
    expect(r.cashSavedHufPerMonth).toBeNull();
  });

  it('G2-L.2 legacy before-only with unknown active minutes stays unavailable', () => {
    const r = computeRoiEstimate({
      runsPerMonth: 1,
      beforeActiveMinutes: null,
      beforeWaitingMinutes: 600,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      peopleAffected: 1,
      hourlyCostHuf: rate,
    });
    expect(r.timeSavedMinutesPerRun).toBeNull();
    expect(r.timeSavedMinutesPerMonth).toBeNull();
    expect(r.cashSavedHufPerMonth).toBeNull();
  });

  it('G2-L.3 expected-reduction with unknown active minutes stays unavailable, never a measured zero', () => {
    const r = computeRoiEstimate({
      runsPerMonth: 1,
      beforeActiveMinutes: null,
      beforeWaitingMinutes: 600,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      beforeOrigin: 'ESTIMATED' as const,
      expectedActiveReductionPct: 20,
      peopleAffected: 1,
      hourlyCostHuf: rate,
    });
    expect(r.timeSavedMinutesPerRun).toBeNull();
    expect(r.timeSavedMinutesPerMonth).toBeNull();
    expect(r.cashSavedHufPerMonth).toBeNull();
  });

  it('G2-L.4 legacy before-only ACTIVE estimate contract is preserved (ESTIMATED, 10-20%)', () => {
    const r = computeRoiEstimate({
      runsPerMonth: 1,
      beforeActiveMinutes: 100,
      beforeWaitingMinutes: 600,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      peopleAffected: 1,
      hourlyCostHuf: rate,
    });
    expect(r.basis).toBe('ESTIMATED');
    expect(r.timeSavedMinutesPerRun).toEqual({ low: 0, base: 10, high: 20 });
    expect(r.cashSavedHufPerMonth).toEqual({ low: 0, base: 1000, high: 2000 });
  });
});
