/**
 * COMPANY PROFILE 2.0 — ADAPTIVE DISCOVERY ENGINE
 *
 * Pure, database-free logic that turns canonical fact state into:
 *   1. deterministic derivations for facts the workbook marks as derived;
 *   2. visibility decisions for the declarative questionnaire conditions.
 *
 * Three-valued on purpose. A gate whose controlling fact is still UNKNOWN is
 * NOT silently hidden: it is reported as UNDETERMINED so the caller can route
 * the area to clarification / lawyer review instead of guessing.
 *
 * No internal ids, rule keys or legal terminology ever appear in the outputs.
 */

import {
  CANONICAL_COMPANY_QUESTIONS,
  COMPANY_PROFILE_MODULE_ENTRY_TRIGGERS,
  type CompanyProfileModule,
  type CompanyProfileQuestionDefinition,
  type CompanyProfileVisibilityAtom,
  type CompanyProfileVisibilityCondition,
  baselineCompanyProfileQuestions,
} from './companyProfileQuestionCatalog';
import { getCanonicalCompanyFact } from './companyProfileFactCatalog';

export type CompanyProfileFactStatus = 'ANSWERED' | 'UNKNOWN' | 'UNANSWERED';

export type CompanyProfileFactValue = boolean | number | string | readonly string[];

export interface CompanyProfileFactState {
  readonly status: CompanyProfileFactStatus;
  readonly value?: CompanyProfileFactValue;
  /** True when the value was derived rather than directly answered. */
  readonly derived?: boolean;
}

export type CompanyProfileFactStateMap = Readonly<Record<string, CompanyProfileFactState>>;

const B2C_OPTION = 'Fogyasztók (B2C)';
const PUBLIC_SECTOR_OPTION = 'Közszféra';

function answered(value: CompanyProfileFactValue, derived = false): CompanyProfileFactState {
  return { status: 'ANSWERED', value, derived };
}

/** Builds a state map from a plain record, dropping undefined entries. */
export function buildFactStateMap(entries: Record<string, CompanyProfileFactState | undefined>): Record<string, CompanyProfileFactState> {
  const out: Record<string, CompanyProfileFactState> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value) out[key] = value;
  }
  return out;
}

function asArray(value: CompanyProfileFactValue | undefined): readonly string[] | null {
  if (Array.isArray(value)) return value as readonly string[];
  return null;
}

function truthyValue(value: CompanyProfileFactValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

// ============================================================================
// DETERMINISTIC DERIVATION
// ============================================================================

const MICRO_TURNOVER = 2_000_000;
const SMALL_TURNOVER = 10_000_000;
const MEDIUM_TURNOVER = 50_000_000;
const MEDIUM_BALANCE = 43_000_000;

/**
 * EU SME size class from headcount / turnover / balance-sheet total, following
 * the Commission Recommendation 2003/361/EC thresholds used across EU law.
 *
 * Returns null when the inputs are insufficient to classify (headcount below
 * the large threshold but financials still missing) — that must surface as a
 * follow-up question, never as a guess.
 */
export function deriveEuSmeSizeClass(input: {
  employeeCount?: number;
  annualNetRevenueEur?: number;
  balanceSheetTotalEur?: number;
}): string | null {
  const { employeeCount, annualNetRevenueEur, balanceSheetTotalEur } = input;
  if (typeof employeeCount !== 'number' || !Number.isFinite(employeeCount)) return null;
  if (employeeCount >= 250) return 'NAGY';

  const hasFinancials = typeof annualNetRevenueEur === 'number' || typeof balanceSheetTotalEur === 'number';
  if (!hasFinancials) return null;

  const within = (limit: number) => (typeof annualNetRevenueEur === 'number' && annualNetRevenueEur <= limit)
    || (typeof balanceSheetTotalEur === 'number' && balanceSheetTotalEur <= limit);

  if (employeeCount < 10 && within(MICRO_TURNOVER)) return 'MIKRO';
  if (employeeCount < 50 && within(SMALL_TURNOVER)) return 'KIS';
  if (employeeCount < 250 && within(MEDIUM_TURNOVER)) return 'KÖZEPES';
  // Below 250 staff but over the financial ceiling for each band.
  return within(MEDIUM_BALANCE) ? 'KÖZEPES' : 'NAGY';
}

/**
 * Applies every derivation the current state fully determines. Derived values
 * never overwrite a directly answered fact.
 *
 * Sector classifications (NIS2 sector, whistleblowing special sector, AML
 * obliged-entity, EU ETS) are intentionally NOT derived here: they require
 * TEÁOR/sector mapping plus legal classification, so they stay user/legal
 * classified rather than guessed.
 */
export function applyDeterministicDerivations(state: CompanyProfileFactStateMap): Record<string, CompanyProfileFactState> {
  const out: Record<string, CompanyProfileFactState> = { ...state };
  const current = (key: string): CompanyProfileFactState | undefined => out[key];

  const employeeState = current('employee_count');
  if (employeeState?.status === 'ANSWERED' && typeof employeeState.value === 'number') {
    if (current('has_employees')?.status !== 'ANSWERED') out.has_employees = answered(employeeState.value > 0, true);
  }

  const customerTypes = current('customer_types');
  if (customerTypes?.status === 'ANSWERED') {
    const values = asArray(customerTypes.value) ?? [];
    if (current('b2c_sales')?.status !== 'ANSWERED') out.b2c_sales = answered(values.includes(B2C_OPTION), true);
    if (current('public_sector_customer')?.status !== 'ANSWERED') out.public_sector_customer = answered(values.includes(PUBLIC_SECTOR_OPTION), true);
  }

  if (current('eu_sme_size_class')?.status !== 'ANSWERED') {
    const sizeClass = deriveEuSmeSizeClass({
      employeeCount: typeof employeeState?.value === 'number' ? employeeState.value : undefined,
      annualNetRevenueEur: numericValue(current('annual_net_revenue_eur')),
      balanceSheetTotalEur: numericValue(current('balance_sheet_total_eur')),
    });
    if (sizeClass) out.eu_sme_size_class = answered(sizeClass, true);
  }

  return out;
}

function numericValue(state: CompanyProfileFactState | undefined): number | undefined {
  return state?.status === 'ANSWERED' && typeof state.value === 'number' ? state.value : undefined;
}

// ============================================================================
// VISIBILITY
// ============================================================================

export type VisibilityResult = 'VISIBLE' | 'HIDDEN' | 'UNDETERMINED';

function evaluateAtom(atom: CompanyProfileVisibilityAtom, state: CompanyProfileFactStateMap): VisibilityResult {
  switch (atom.kind) {
    case 'factEquals': {
      const fact = state[atom.factKey];
      if (!fact || fact.status !== 'ANSWERED') return 'UNDETERMINED';
      return fact.value === atom.value ? 'VISIBLE' : 'HIDDEN';
    }
    case 'factGreaterThan': {
      const value = numericValue(state[atom.factKey]);
      if (value === undefined) return 'UNDETERMINED';
      return value > atom.value ? 'VISIBLE' : 'HIDDEN';
    }
    case 'factGreaterOrEqual': {
      const value = numericValue(state[atom.factKey]);
      if (value === undefined) return 'UNDETERMINED';
      return value >= atom.value ? 'VISIBLE' : 'HIDDEN';
    }
    case 'factTruthy': {
      const fact = state[atom.factKey];
      if (!fact || fact.status !== 'ANSWERED') return 'UNDETERMINED';
      return truthyValue(fact.value) ? 'VISIBLE' : 'HIDDEN';
    }
    case 'factContains': {
      const fact = state[atom.factKey];
      if (!fact || fact.status !== 'ANSWERED') return 'UNDETERMINED';
      const values = asArray(fact.value);
      if (values) return values.includes(atom.value) ? 'VISIBLE' : 'HIDDEN';
      return fact.value === atom.value ? 'VISIBLE' : 'HIDDEN';
    }
    case 'factNotContains': {
      const fact = state[atom.factKey];
      if (!fact || fact.status !== 'ANSWERED') return 'UNDETERMINED';
      const values = asArray(fact.value);
      if (values) return values.length > 0 && !values.includes(atom.value) ? 'VISIBLE' : 'HIDDEN';
      return fact.value !== atom.value && truthyValue(fact.value) ? 'VISIBLE' : 'HIDDEN';
    }
    case 'anyOf': {
      const results = atom.conditions.map((condition) => evaluateAtom(condition, state));
      if (results.includes('VISIBLE')) return 'VISIBLE';
      if (results.includes('UNDETERMINED')) return 'UNDETERMINED';
      return 'HIDDEN';
    }
    case 'allOf': {
      const results = atom.conditions.map((condition) => evaluateAtom(condition, state));
      if (results.includes('HIDDEN')) return 'HIDDEN';
      if (results.includes('UNDETERMINED')) return 'UNDETERMINED';
      return 'VISIBLE';
    }
    default: {
      const exhaustive: never = atom;
      return exhaustive;
    }
  }
}

export function evaluateVisibility(condition: CompanyProfileVisibilityCondition, state: CompanyProfileFactStateMap): VisibilityResult {
  if (condition === null) return 'VISIBLE';
  return evaluateAtom(condition, state);
}

export interface CompanyProfileVisibilityReport {
  readonly visible: readonly CompanyProfileQuestionDefinition[];
  /** Questions whose gate is still UNKNOWN / unanswered — route to clarification. */
  readonly undetermined: readonly CompanyProfileQuestionDefinition[];
  readonly hidden: readonly CompanyProfileQuestionDefinition[];
}

/**
 * Resolves which questions the client should currently see.
 *
 * Baseline questions are always visible unless explicitly gated (none are).
 * Adaptive questions are visible only when their gate is satisfied, hidden when
 * the gate is definitively false, and undetermined when the gate fact itself is
 * still unknown.
 */
export function resolveVisibleQuestions(
  rawState: CompanyProfileFactStateMap,
  options: { module?: CompanyProfileModule } = {},
): CompanyProfileVisibilityReport {
  const state = applyDeterministicDerivations(rawState);

  const visible: CompanyProfileQuestionDefinition[] = [];
  const undetermined: CompanyProfileQuestionDefinition[] = [];
  const hidden: CompanyProfileQuestionDefinition[] = [];

  for (const question of CANONICAL_COMPANY_QUESTIONS) {
    if (options.module && question.module !== options.module) continue;
    const result = evaluateVisibility(question.showWhen, state);
    if (result === 'VISIBLE') visible.push(question);
    else if (result === 'UNDETERMINED') undetermined.push(question);
    else hidden.push(question);
  }

  return { visible, undetermined, hidden };
}

/** Baseline questions are always part of the first discovery pass. */
export function resolveBaselineQuestions(): readonly CompanyProfileQuestionDefinition[] {
  return baselineCompanyProfileQuestions();
}

/** Modules whose entry trigger is active (or undetermined) for the given state. */
export function resolveActiveModules(rawState: CompanyProfileFactStateMap): { active: CompanyProfileModule[]; undetermined: CompanyProfileModule[] } {
  const state = applyDeterministicDerivations(rawState);
  const active: CompanyProfileModule[] = [];
  const undetermined: CompanyProfileModule[] = [];
  for (const { module, trigger } of COMPANY_PROFILE_MODULE_ENTRY_TRIGGERS) {
    const result = evaluateVisibility(trigger, state);
    if (result === 'VISIBLE') active.push(module);
    else if (result === 'UNDETERMINED') undetermined.push(module);
  }
  return { active, undetermined };
}

/**
 * A question whose answer is UNKNOWN can require lawyer review. This reports
 * the questions that carry an "unknown" option and are currently visible, so
 * the caller can offer that route without exposing engine terminology.
 */
export function questionsOfferingUnknownRoute(state: CompanyProfileFactStateMap): readonly CompanyProfileQuestionDefinition[] {
  return resolveVisibleQuestions(state).visible.filter((question) => question.answerType === 'BOOLEAN_UNKNOWN');
}

/** Every canonical fact key referenced by a visibility condition, for auditing. */
export function visibilityFactKeys(): readonly string[] {
  const keys = new Set<string>();
  const visit = (condition: CompanyProfileVisibilityCondition): void => {
    if (!condition) return;
    if (condition.kind === 'allOf' || condition.kind === 'anyOf') {
      condition.conditions.forEach(visit);
      return;
    }
    keys.add(condition.factKey);
  };
  for (const question of CANONICAL_COMPANY_QUESTIONS) visit(question.showWhen);
  for (const { trigger } of COMPANY_PROFILE_MODULE_ENTRY_TRIGGERS) visit(trigger);
  return [...keys];
}

/** Guard: every visibility condition must reference a canonical fact. */
export function assertVisibilityReferencesAreCanonical(): void {
  for (const factKey of visibilityFactKeys()) {
    if (!getCanonicalCompanyFact(factKey)) throw new Error(`Visibility condition references unknown canonical fact: ${factKey}`);
  }
}
