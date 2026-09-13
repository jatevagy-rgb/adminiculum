/**
 * GROW — deterministic ROI engine.
 *
 * Produces an explicit low/base/high estimate range with full provenance.
 * Time saved and cash saved are deliberately separate numbers: time is the
 * measured/derived quantity, cash is an optional valuation on top of it, never
 * silently equated.
 *
 * Basis ladder (highest applicable wins):
 *   MEASURED   — an after-snapshot with real metrics exists
 *   CALCULATED — derived from a measured before-snapshot + stated deltas
 *   ESTIMATED  — derived from process estimate fields (no measurement)
 *   ASSUMED    — generic defaults only; nothing measured or estimated
 */

export const ROI_ENGINE_VERSION = 'grow-roi-v1';

export interface RoiInputs {
  /** Monthly process frequency (runs per month). */
  runsPerMonth: number;
  /** Before-state cycle minutes per run (measured or estimated). */
  beforeActiveMinutes: number | null;
  beforeWaitingMinutes: number | null;
  /** After-state cycle minutes per run, when actually measured. */
  afterActiveMinutes: number | null;
  afterWaitingMinutes: number | null;
  /**
   * Expected active-minute reduction per run in percent (0-100), used when no
   * after measurement exists. Caller must mark the result synthetic/estimated.
   */
  expectedActiveReductionPct?: number | null;
  /** Optional valuation: loaded hourly cost per person in HUF. */
  hourlyCostHuf?: { low: number; base: number; high: number } | null;
  /** Optional count of people whose time the process consumes per run. */
  peopleAffected?: number | null;
}

export type OutcomeBasis = 'MEASURED' | 'CALCULATED' | 'ESTIMATED' | 'ASSUMED';

export interface RoiEstimate {
  basis: OutcomeBasis;
  timeSavedMinutesPerRun: { low: number; base: number; high: number };
  timeSavedMinutesPerMonth: { low: number; base: number; high: number };
  cashSavedHufPerMonth: { low: number; base: number; high: number } | null;
  provenance: {
    formulaVersion: string;
    computedAt: string;
    inputs: {
      runsPerMonth: number;
      beforeActiveMinutes: number | null;
      beforeWaitingMinutes: number | null;
      afterActiveMinutes: number | null;
      afterWaitingMinutes: number | null;
      expectedActiveReductionPct: number | null;
      hourlyCostHuf: { low: number; base: number; high: number } | null;
      peopleAffected: number | null;
    };
    timeSavedIsNotCashSaved: true;
    explanationHu: string;
  };
}

function n(value: unknown): number | null {
  if (value == null) return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes the deterministic ROI estimate. All math is reproducible from the
 * recorded provenance inputs — no hidden state, no randomness, no AI output.
 */
export function computeRoiEstimate(inputs: RoiInputs): RoiEstimate {
  const runsPerMonth = Math.max(0, n(inputs.runsPerMonth) ?? 0);
  const beforeActive = n(inputs.beforeActiveMinutes);
  const beforeWaiting = n(inputs.beforeWaitingMinutes);
  const afterActive = n(inputs.afterActiveMinutes);
  const afterWaiting = n(inputs.afterWaitingMinutes);
  const expectedReductionPct = n(inputs.expectedActiveReductionPct);
  const people = Math.max(1, n(inputs.peopleAffected) ?? 1);
  const hourly = inputs.hourlyCostHuf
    ? { low: Math.max(0, n(inputs.hourlyCostHuf.low) ?? 0), base: Math.max(0, n(inputs.hourlyCostHuf.base) ?? 0), high: Math.max(0, n(inputs.hourlyCostHuf.high) ?? 0) }
    : null;

  let basis: OutcomeBasis;
  let perRunLow: number;
  let perRunBase: number;
  let perRunHigh: number;

  if (afterActive != null && beforeActive != null) {
    // Measured before+after: the saving is the observed active-time delta,
    // plus the observed waiting-time delta (waiting is elapsed cost, not work
    // time, so it is reported but not multiplied into cash valuation).
    basis = 'MEASURED';
    const activeDelta = beforeActive - afterActive;
    const waitingDelta = (beforeWaiting ?? 0) - (afterWaiting ?? 0);
    perRunBase = Math.max(0, activeDelta);
    // Low/high spread: pessimistic = only active delta; optimistic = active +
    // half the observed waiting reduction credited as freed capacity.
    perRunLow = Math.max(0, activeDelta);
    perRunHigh = Math.max(0, activeDelta + 0.5 * Math.max(0, waitingDelta));
    if (perRunBase === 0 && waitingDelta > 0) {
      // No work-time saved but elapsed time improved — still a real outcome.
      perRunBase = round(0.5 * waitingDelta);
      perRunHigh = round(0.75 * waitingDelta);
    }
  } else if (beforeActive != null && expectedReductionPct != null) {
    basis = 'CALCULATED';
    const pct = Math.min(100, Math.max(0, expectedReductionPct));
    perRunLow = round(beforeActive * (pct / 100) * 0.5);
    perRunBase = round(beforeActive * (pct / 100));
    perRunHigh = round(beforeActive * (pct / 100) * 1.5);
  } else if (beforeActive != null || beforeWaiting != null) {
    basis = 'ESTIMATED';
    const cycle = (beforeActive ?? 0) + (beforeWaiting ?? 0);
    perRunLow = 0;
    perRunBase = round(cycle * 0.1);
    perRunHigh = round(cycle * 0.2);
  } else {
    basis = 'ASSUMED';
    perRunLow = 0;
    perRunBase = 0;
    perRunHigh = 0;
  }

  const monthly = {
    low: round(perRunLow * runsPerMonth * people),
    base: round(perRunBase * runsPerMonth * people),
    high: round(perRunHigh * runsPerMonth * people),
  };

  const cash = hourly
    ? {
        low: round((monthly.low / 60) * hourly.low),
        base: round((monthly.base / 60) * hourly.base),
        high: round((monthly.high / 60) * hourly.high),
      }
    : null;

  return {
    basis,
    timeSavedMinutesPerRun: { low: perRunLow, base: perRunBase, high: perRunHigh },
    timeSavedMinutesPerMonth: monthly,
    cashSavedHufPerMonth: cash,
    provenance: {
      formulaVersion: ROI_ENGINE_VERSION,
      computedAt: new Date().toISOString(),
      inputs: {
        runsPerMonth,
        beforeActiveMinutes: beforeActive,
        beforeWaitingMinutes: beforeWaiting,
        afterActiveMinutes: afterActive,
        afterWaitingMinutes: afterWaiting,
        expectedActiveReductionPct: expectedReductionPct ?? null,
        hourlyCostHuf: hourly,
        peopleAffected: inputs.peopleAffected != null ? people : null,
      },
      timeSavedIsNotCashSaved: true,
      explanationHu:
        'A megtakarított idő a mért vagy becsült aktív perc különbözete alkalmonként, szorozva a havi gyakorisággal és az érintett létszámmal. A pénzben kifejezett érték külön óradíj-becslésből származik, és nem azonos a megtakarított idővel.',
    },
  };
}
