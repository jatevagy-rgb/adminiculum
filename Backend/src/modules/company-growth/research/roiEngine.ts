/**
 * GROW — deterministic ROI engine (v2, provenance-aware).
 *
 * Produces an explicit low/base/high estimate range with full provenance.
 * Time saved and cash saved are deliberately separate numbers: time is the
 * measured/derived quantity, cash is an optional valuation on top of it, never
 * silently equated. Waiting/elapsed time is reported separately from active
 * work time and can never be monetized.
 *
 * Input-origin contract (G1):
 *   Every before/after value may carry an explicit origin
 *   (MEASURED | DECLARED | ESTIMATED | CALCULATED | UNKNOWN). A MEASURED basis
 *   requires MEASURED origins on BOTH sides. An explicitly UNKNOWN origin is
 *   rejected (fail closed) — it is never silently relabelled. Omitting the
 *   origins keeps the legacy ladder so existing callers keep their contract.
 *
 * Basis ladder (highest applicable wins):
 *   MEASURED   — both before and after values exist with MEASURED origins
 *   CALCULATED — a stated delta over a measured/calculated before-basis
 *   ESTIMATED  — derived from estimates/declarations (no measurement)
 *   ASSUMED    — generic defaults only; nothing measured or estimated
 */

export const ROI_ENGINE_VERSION = 'grow-roi-v2';

/** Canonical input-value origins. Array order is part of the public contract. */
export const INPUT_VALUE_ORIGINS = ['MEASURED', 'DECLARED', 'ESTIMATED', 'CALCULATED', 'UNKNOWN'] as const;
export type InputValueOrigin = (typeof INPUT_VALUE_ORIGINS)[number];

const INPUT_VALUE_ORIGIN_SET = new Set<string>(INPUT_VALUE_ORIGINS);

export interface RoiRange {
  low: number;
  base: number;
  high: number;
}

export interface RoiInputs {
  /** Monthly process frequency (runs per month). Null = unknown. */
  runsPerMonth: number | null;
  /** Before-state cycle minutes per run. */
  beforeActiveMinutes: number | null;
  /** Optional before waiting minutes — omitted or null = unknown. */
  beforeWaitingMinutes?: number | null;
  /** After-state cycle minutes per run, when available. */
  afterActiveMinutes: number | null;
  /** Optional after waiting minutes — omitted or null = unknown. */
  afterWaitingMinutes?: number | null;
  /** Declared origin of the before-side values. Omitted = legacy ladder. */
  beforeOrigin?: InputValueOrigin | null;
  /** Declared origin of the after-side values. Omitted = legacy ladder. */
  afterOrigin?: InputValueOrigin | null;
  /**
   * Expected active-minute reduction per run in percent (0-100), used when no
   * after measurement exists.
   */
  expectedActiveReductionPct?: number | null;
  /** Optional valuation: loaded hourly cost per person in HUF. */
  hourlyCostHuf?: { low: number; base: number; high: number } | null;
  /** Optional count of people whose time the process consumes per run. */
  peopleAffected?: number | null;
  /**
   * Explicit provenance override for the estimate. Must be consistent with the
   * honest basis derived from the inputs — a caller-supplied label can never
   * upgrade the basis.
   */
  provenanceType?: RoiProvenanceType | null;
}

export type OutcomeBasis = 'MEASURED' | 'CALCULATED' | 'ESTIMATED' | 'ASSUMED';

/** The six allowed provenance categories (completion of the taxonomy). */
export const ROI_PROVENANCE_TYPES = [
  'MEASURED',
  'CALCULATED',
  'CLIENT_ESTIMATE',
  'CONSULTANT_ESTIMATE',
  'RESEARCH_BENCHMARK',
  'GENERAL_ASSUMPTION',
] as const;
export type RoiProvenanceType = (typeof ROI_PROVENANCE_TYPES)[number];

const ROI_PROVENANCE_SET = new Set<string>(ROI_PROVENANCE_TYPES);

const BASIS_TO_PROVENANCE: Record<OutcomeBasis, RoiProvenanceType> = {
  MEASURED: 'MEASURED',
  CALCULATED: 'CALCULATED',
  ESTIMATED: 'CLIENT_ESTIMATE',
  ASSUMED: 'GENERAL_ASSUMPTION',
};

export interface RoiEstimate {
  basis: OutcomeBasis;
  provenanceType: RoiProvenanceType;
  /** Active work-time saved per run. Null = no supported delta exists. */
  timeSavedMinutesPerRun: RoiRange | null;
  /** Active work-time saved per month (process minutes, headcount NOT included). Null = unknown frequency or no delta. */
  timeSavedMinutesPerMonth: RoiRange | null;
  /** Waiting/elapsed time saved per run — reported separately, never monetized. Null = waiting data absent. */
  waitingTimeSavedMinutesPerRun: RoiRange | null;
  /** Waiting/elapsed time saved per month. Null = waiting data or frequency absent. */
  waitingTimeSavedMinutesPerMonth: RoiRange | null;
  /** Cash valuation. Only derived from active-time savings x runs x people x rate. Null = not derivable. */
  cashSavedHufPerMonth: RoiRange | null;
  provenance: {
    formulaVersion: string;
    computedAt: string;
    type: RoiProvenanceType;
    inputs: {
      runsPerMonth: number | null;
      beforeActiveMinutes: number | null;
      beforeWaitingMinutes: number | null;
      afterActiveMinutes: number | null;
      afterWaitingMinutes: number | null;
      beforeOrigin: InputValueOrigin | null;
      afterOrigin: InputValueOrigin | null;
      expectedActiveReductionPct: number | null;
      hourlyCostHuf: { low: number; base: number; high: number } | null;
      peopleAffected: number | null;
    };
    timeSavedIsNotCashSaved: true;
    cashIsCapacityValuationNotRealizedSavings: true;
    explanationHu: string;
  };
}

export interface RoiValidationIssue {
  field: string;
  message: string;
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
 * Validates ROI inputs: finite, non-negative, correct ranges/units and valid
 * origin/provenance categories. Low/base/high must be ordered low <= base <= high.
 */
export function validateRoiInputs(inputs: RoiInputs): RoiValidationIssue[] {
  const issues: RoiValidationIssue[] = [];
  const numOrNull = (value: unknown): number | null => {
    if (value == null) return null;
    const v = Number(value);
    return Number.isFinite(v) ? v : null;
  };
  const checkNumber = (field: string, value: unknown): void => {
    if (value == null) return;
    const v = numOrNull(value);
    if (v == null) issues.push({ field, message: 'must be a finite number' });
    else if (v < 0) issues.push({ field, message: 'must be non-negative' });
  };

  checkNumber('runsPerMonth', inputs.runsPerMonth);
  checkNumber('beforeActiveMinutes', inputs.beforeActiveMinutes);
  checkNumber('beforeWaitingMinutes', inputs.beforeWaitingMinutes);
  checkNumber('afterActiveMinutes', inputs.afterActiveMinutes);
  checkNumber('afterWaitingMinutes', inputs.afterWaitingMinutes);
  checkNumber('expectedActiveReductionPct', inputs.expectedActiveReductionPct);
  checkNumber('peopleAffected', inputs.peopleAffected);

  const pct = numOrNull(inputs.expectedActiveReductionPct);
  if (pct != null && pct > 100) issues.push({ field: 'expectedActiveReductionPct', message: 'must be within 0-100' });

  if (inputs.hourlyCostHuf) {
    const { low, base, high } = inputs.hourlyCostHuf;
    checkNumber('hourlyCostHuf.low', low);
    checkNumber('hourlyCostHuf.base', base);
    checkNumber('hourlyCostHuf.high', high);
    const l = numOrNull(low);
    const b = numOrNull(base);
    const h = numOrNull(high);
    if (l != null && b != null && h != null && !(l <= b && b <= h)) {
      issues.push({ field: 'hourlyCostHuf', message: 'must satisfy low <= base <= high' });
    }
  }

  if (inputs.beforeOrigin != null && !INPUT_VALUE_ORIGIN_SET.has(String(inputs.beforeOrigin))) {
    issues.push({ field: 'beforeOrigin', message: `must be one of ${INPUT_VALUE_ORIGINS.join(', ')}` });
  }
  if (inputs.afterOrigin != null && !INPUT_VALUE_ORIGIN_SET.has(String(inputs.afterOrigin))) {
    issues.push({ field: 'afterOrigin', message: `must be one of ${INPUT_VALUE_ORIGINS.join(', ')}` });
  }

  if (inputs.provenanceType != null && !ROI_PROVENANCE_SET.has(String(inputs.provenanceType))) {
    issues.push({ field: 'provenanceType', message: `must be one of ${ROI_PROVENANCE_TYPES.join(', ')}` });
  }

  return issues;
}

/**
 * Basis for a before+after comparison from the two declared origins.
 * MEASURED requires MEASURED on both sides; a calculation from anything stays
 * CALCULATED only when both sides are measured/calculated; any estimate or
 * declaration downgrades to ESTIMATED. Both origins omitted = legacy ladder
 * (MEASURED), preserving the pre-v2 contract for existing callers.
 */
function compareBasis(beforeOrigin: InputValueOrigin | null, afterOrigin: InputValueOrigin | null): OutcomeBasis {
  if (beforeOrigin === 'MEASURED' && afterOrigin === 'MEASURED') return 'MEASURED';
  if (beforeOrigin == null && afterOrigin == null) return 'MEASURED';
  const strong = (o: InputValueOrigin | null): boolean => o === 'MEASURED' || o === 'CALCULATED' || o == null;
  if (strong(beforeOrigin) && strong(afterOrigin)) {
    const bothCalculated = beforeOrigin === 'CALCULATED' || afterOrigin === 'CALCULATED';
    return bothCalculated ? 'CALCULATED' : 'MEASURED';
  }
  return 'ESTIMATED';
}

/**
 * Computes the deterministic ROI estimate. All math is reproducible from the
 * recorded provenance inputs — no hidden state, no randomness, no AI output.
 */
export function computeRoiEstimate(inputs: RoiInputs): RoiEstimate {
  const issues = validateRoiInputs(inputs);
  if (issues.length) {
    throw new Error(`ROI_INPUT_INVALID: ${issues.map((i) => `${i.field} ${i.message}`).join('; ')}`);
  }

  const runs = n(inputs.runsPerMonth);
  const beforeActive = n(inputs.beforeActiveMinutes);
  const beforeWaiting = n(inputs.beforeWaitingMinutes);
  const afterActive = n(inputs.afterActiveMinutes);
  const afterWaiting = n(inputs.afterWaitingMinutes);
  const expectedReductionPct = n(inputs.expectedActiveReductionPct);
  const people = n(inputs.peopleAffected);
  const hourly = inputs.hourlyCostHuf
    ? { low: Math.max(0, n(inputs.hourlyCostHuf.low) ?? 0), base: Math.max(0, n(inputs.hourlyCostHuf.base) ?? 0), high: Math.max(0, n(inputs.hourlyCostHuf.high) ?? 0) }
    : null;

  const beforeOrigin: InputValueOrigin | null = (inputs.beforeOrigin ?? null) as InputValueOrigin | null;
  const afterOrigin: InputValueOrigin | null = (inputs.afterOrigin ?? null) as InputValueOrigin | null;

  // G1: an explicitly UNKNOWN origin is never silently relabelled — fail closed.
  if (beforeOrigin === 'UNKNOWN' || afterOrigin === 'UNKNOWN') {
    throw new Error('ROI_INPUT_INVALID: declared value origin UNKNOWN cannot support a measurement basis; provide a supported origin.');
  }

  const hasBefore = beforeActive != null || beforeWaiting != null;
  const hasAfter = afterActive != null || afterWaiting != null;

  let basis: OutcomeBasis;
  let timeSavedPerRun: RoiRange | null = null;
  let waitingSavedPerRun: RoiRange | null = null;

  if (hasBefore && hasAfter) {
    // Before + after comparison: honest basis from the declared origins.
    basis = compareBasis(beforeOrigin, afterOrigin);

    // Active work-time delta. Waiting time is elapsed queue time and is never
    // folded into the labour saving.
    if (beforeActive != null && afterActive != null) {
      const activeDelta = Math.max(0, beforeActive - afterActive);
      timeSavedPerRun = { low: activeDelta, base: activeDelta, high: activeDelta };
    }

    // Waiting/cycle-time delta, reported separately, never monetized.
    if (beforeWaiting != null && afterWaiting != null) {
      const waitingDelta = Math.max(0, beforeWaiting - afterWaiting);
      waitingSavedPerRun = { low: waitingDelta, base: waitingDelta, high: waitingDelta };
    }
  } else if (hasBefore && !hasAfter) {
    if (expectedReductionPct != null) {
      // Stated delta over a before-basis. A calculation from an estimate stays
      // based on an estimate; a measured/calculated basis stays CALCULATED.
      basis =
        beforeOrigin === 'ESTIMATED' || beforeOrigin === 'DECLARED' ? 'ESTIMATED' : 'CALCULATED';
      const pct = Math.min(100, Math.max(0, expectedReductionPct));
      const base = round((beforeActive ?? 0) * (pct / 100));
      timeSavedPerRun = { low: round(base * 0.5), base, high: round(base * 1.5) };
    } else if (beforeOrigin != null) {
      // Explicit origin without any delta: expose the honest basis and an
      // actionable unavailable savings state — never a fabricated guess.
      basis = beforeOrigin === 'MEASURED' || beforeOrigin === 'CALCULATED'
        ? (beforeOrigin === 'MEASURED' ? 'MEASURED' : 'CALCULATED')
        : 'ESTIMATED';
      timeSavedPerRun = null;
    } else {
      // Legacy before-only ladder (no declared origin, no stated delta):
      // explicitly labelled estimate. Preserved for existing callers.
      basis = 'ESTIMATED';
      const cycle = (beforeActive ?? 0) + (beforeWaiting ?? 0);
      timeSavedPerRun = { low: 0, base: round(cycle * 0.1), high: round(cycle * 0.2) };
    }
  } else {
    // Nothing to compare: generic assumptions only.
    basis = 'ASSUMED';
    timeSavedPerRun = { low: 0, base: 0, high: 0 };
  }

  const timeSavedMonthly: RoiRange | null =
    timeSavedPerRun != null && runs != null
      ? {
          low: round(timeSavedPerRun.low * runs),
          base: round(timeSavedPerRun.base * runs),
          high: round(timeSavedPerRun.high * runs),
        }
      : null;

  const waitingSavedMonthly: RoiRange | null =
    waitingSavedPerRun != null && runs != null
      ? {
          low: round(waitingSavedPerRun.low * runs),
          base: round(waitingSavedPerRun.base * runs),
          high: round(waitingSavedPerRun.high * runs),
        }
      : null;

  // G2: cash is derived ONLY from active-time savings x runs x people x rate.
  // Unknown people/rate/frequency or a non-positive delta produce no cash
  // figure (capacity valuation, never realized savings).
  let cash: RoiRange | null = null;
  if (timeSavedPerRun != null && runs != null && people != null && hourly != null && timeSavedPerRun.base > 0) {
    const perRun = timeSavedPerRun;
    cash = {
      low: round(((perRun.low * runs * people) / 60) * hourly.low),
      base: round(((perRun.base * runs * people) / 60) * hourly.base),
      high: round(((perRun.high * runs * people) / 60) * hourly.high),
    };
  }

  const provenanceType: RoiProvenanceType = BASIS_TO_PROVENANCE[basis];

  // G1: a caller-supplied provenance label can never relabel the honest basis.
  if (inputs.provenanceType != null && inputs.provenanceType !== provenanceType) {
    throw new Error(`ROI_INPUT_INVALID: provenanceType ${inputs.provenanceType} contradicts the derived basis ${basis} (${provenanceType}).`);
  }

  return {
    basis,
    provenanceType,
    timeSavedMinutesPerRun: timeSavedPerRun,
    timeSavedMinutesPerMonth: timeSavedMonthly,
    waitingTimeSavedMinutesPerRun: waitingSavedPerRun,
    waitingTimeSavedMinutesPerMonth: waitingSavedMonthly,
    cashSavedHufPerMonth: cash,
    provenance: {
      formulaVersion: ROI_ENGINE_VERSION,
      computedAt: new Date().toISOString(),
      type: provenanceType,
      inputs: {
        runsPerMonth: runs,
        beforeActiveMinutes: beforeActive,
        beforeWaitingMinutes: beforeWaiting,
        afterActiveMinutes: afterActive,
        afterWaitingMinutes: afterWaiting,
        beforeOrigin,
        afterOrigin,
        expectedActiveReductionPct: expectedReductionPct ?? null,
        hourlyCostHuf: hourly,
        peopleAffected: people,
      },
      timeSavedIsNotCashSaved: true,
      cashIsCapacityValuationNotRealizedSavings: true,
      explanationHu:
        'A megtakarított idő a mért vagy becsült AKTÍV perc különbözete alkalmonként, szorozva a havi gyakorisággal (a várakozási idő külön szerepel, és soha nem számít bele a munkamegtakarításba). A pénzben kifejezett érték kizárólag aktív-idő megtakarításból, óradíj-becsléssel és érintett létszámmal készülő kapacitás-értékelés, nem azonos sem a megtakarított idővel, sem realizált pénzmegtakarítással.',
    },
  };
}
