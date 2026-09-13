/**
 * GROW ROI engine — unit tests (no database).
 *
 * Locks provenance (6/6), input validation and the time != cash separation.
 */

import {
  ROI_PROVENANCE_TYPES,
  computeRoiEstimate,
  validateRoiInputs,
} from '../src/modules/company-growth/research/roiEngine';

describe('roiEngine provenance + validation', () => {
  it('exposes exactly the six provenance categories', () => {
    expect([...ROI_PROVENANCE_TYPES]).toEqual([
      'MEASURED',
      'CALCULATED',
      'CLIENT_ESTIMATE',
      'CONSULTANT_ESTIMATE',
      'RESEARCH_BENCHMARK',
      'GENERAL_ASSUMPTION',
    ]);
  });

  it('rejects negative, non-finite and incorrectly ordered inputs', () => {
    expect(validateRoiInputs({ runsPerMonth: -1, beforeActiveMinutes: null, beforeWaitingMinutes: null, afterActiveMinutes: null, afterWaitingMinutes: null })).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'runsPerMonth' })]),
    );
    expect(
      validateRoiInputs({
        runsPerMonth: 1,
        beforeActiveMinutes: Number.POSITIVE_INFINITY,
        beforeWaitingMinutes: null,
        afterActiveMinutes: null,
        afterWaitingMinutes: null,
      }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'beforeActiveMinutes' })]));
    expect(
      validateRoiInputs({
        runsPerMonth: 1,
        beforeActiveMinutes: null,
        beforeWaitingMinutes: null,
        afterActiveMinutes: null,
        afterWaitingMinutes: null,
        hourlyCostHuf: { low: 100, base: 50, high: 200 },
      }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'hourlyCostHuf' })]));
  });

  it('rejects an unknown provenance category and out-of-range percentage', () => {
    const issues = validateRoiInputs({
      runsPerMonth: 1,
      beforeActiveMinutes: null,
      beforeWaitingMinutes: null,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      expectedActiveReductionPct: 150,
      provenanceType: 'MADE_UP' as never,
    });
    expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(['expectedActiveReductionPct', 'provenanceType']));
  });

  it('throws when invalid inputs reach computeRoiEstimate', () => {
    expect(() =>
      computeRoiEstimate({
        runsPerMonth: -5,
        beforeActiveMinutes: null,
        beforeWaitingMinutes: null,
        afterActiveMinutes: null,
        afterWaitingMinutes: null,
      }),
    ).toThrow(/ROI_INPUT_INVALID/);
  });

  it('derives MEASURED provenance from a real after-snapshot and keeps ordering', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 435,
      beforeWaitingMinutes: 8100,
      afterActiveMinutes: 200,
      afterWaitingMinutes: 3000,
      hourlyCostHuf: { low: 8000, base: 12000, high: 16000 },
      peopleAffected: 3,
    });
    expect(result.basis).toBe('MEASURED');
    expect(result.provenanceType).toBe('MEASURED');
    expect(result.timeSavedMinutesPerRun.low).toBeLessThanOrEqual(result.timeSavedMinutesPerRun.base);
    expect(result.timeSavedMinutesPerRun.base).toBeLessThanOrEqual(result.timeSavedMinutesPerRun.high);
    expect(result.provenance.timeSavedIsNotCashSaved).toBe(true);
  });

  it('honours an explicit provenance override (e.g. consultant estimate)', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 4,
      beforeActiveMinutes: 435,
      beforeWaitingMinutes: null,
      afterActiveMinutes: null,
      afterWaitingMinutes: null,
      expectedActiveReductionPct: 20,
      provenanceType: 'CONSULTANT_ESTIMATE',
    });
    expect(result.basis).toBe('CALCULATED');
    expect(result.provenanceType).toBe('CONSULTANT_ESTIMATE');
    expect(result.provenance.type).toBe('CONSULTANT_ESTIMATE');
  });

  it('has a deterministic formula version in provenance', () => {
    const result = computeRoiEstimate({
      runsPerMonth: 1,
      beforeActiveMinutes: 100,
      beforeWaitingMinutes: 0,
      afterActiveMinutes: 80,
      afterWaitingMinutes: 0,
    });
    expect(result.provenance.formulaVersion).toBeTruthy();
    expect(result.provenance.inputs.runsPerMonth).toBe(1);
  });
});
