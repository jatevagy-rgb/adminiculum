/**
 * GROW — intervention taxonomy (canonical, backend-owned).
 *
 * This is explicit typed domain data + deterministic selection logic, NOT
 * frontend copy. Every intervention carries:
 *   - code
 *   - customer-facing Hungarian label
 *   - allowed problem domains
 *   - supporting signal requirements
 *   - contraindications
 *   - supported outcome metrics
 *   - humanReviewRequired (always true)
 *
 * Safety guardrails (enforced here, not in UI copy):
 *   LONG_CYCLE_TIME alone            !-> REDESIGN_APPROVAL_ROUTING
 *   MULTI_SYSTEM_PROCESS alone       !-> CONSOLIDATE_SYSTEMS
 *   SINGLE_PERSON_DEPENDENCY alone   !-> CLARIFY_PROCESS_OWNERSHIP
 *   MANUAL_DATA_ENTRY alone          !-> DIGITIZE_INTAKE (needs an intake signal)
 *   AUTOMATE_REPETITIVE_STEP is blocked by PROCESS_VARIABILITY,
 *   REWORK_PRESENT or UNCLEAR_PROCESS_OWNERSHIP; REDESIGN_BEFORE_AUTOMATING is
 *   offered instead.
 */

export const INTERVENTION_CODES = [
  'STANDARDIZE_PROCESS',
  'REDESIGN_APPROVAL_ROUTING',
  'DIGITIZE_INTAKE',
  'CONSOLIDATE_SYSTEMS',
  'INTEGRATE_SYSTEMS',
  'AUTOMATE_REPETITIVE_STEP',
  'CLARIFY_PROCESS_OWNERSHIP',
  'TRAIN_DIGITAL_SKILLS',
  'ALIGN_IT_WITH_BUSINESS_GOALS',
  'IMPLEMENT_PROCESS_MEASUREMENT',
  'PHASE_DIGITAL_INVESTMENT',
  'REMOVE_NON_VALUE_ADDING_STEP',
  'REDESIGN_BEFORE_AUTOMATING',
] as const;
export type InterventionCode = (typeof INTERVENTION_CODES)[number];

export type ProcessSignal =
  | 'LONG_CYCLE_TIME'
  | 'HIGH_WAITING_SHARE'
  | 'APPROVAL_HEAVY'
  | 'MULTI_SYSTEM_PROCESS'
  | 'HIGH_SYSTEM_SWITCHES'
  | 'MANUAL_DATA_ENTRY'
  | 'REPEATED_DATA_ENTRY'
  | 'REPETITIVE_STEP'
  | 'SINGLE_PERSON_DEPENDENCY'
  | 'UNASSIGNED_STEPS'
  | 'UNMEASURED_COST'
  | 'PROCESS_VARIABILITY'
  | 'REWORK_PRESENT'
  | 'UNCLEAR_PROCESS_OWNERSHIP';

export interface InterventionDefinition {
  code: InterventionCode;
  labelHu: string;
  allowedDomains: string[];
  /** All of these signals must be present. */
  requiredSignals: ProcessSignal[];
  /** At least one of these signals must be present (when non-empty). */
  requiredAnySignals?: ProcessSignal[];
  /** If any of these is present, the intervention is not offered. */
  contraindications: ProcessSignal[];
  supportedOutcomeMetrics: string[];
  humanReviewRequired: true;
}

const AUTOMATION_DEFERRAL_SIGNALS: ProcessSignal[] = [
  'PROCESS_VARIABILITY',
  'REWORK_PRESENT',
  'UNCLEAR_PROCESS_OWNERSHIP',
];

export const INTERVENTIONS: readonly InterventionDefinition[] = [
  {
    code: 'STANDARDIZE_PROCESS',
    labelHu: 'Folyamat standardizálása',
    allowedDomains: ['MANUAL_ADMIN_LOAD', 'REWORK', 'DUPLICATE_DATA_ENTRY', 'GENERAL_FLOW'],
    requiredSignals: [],
    contraindications: [],
    supportedOutcomeMetrics: ['TOTAL_ACTIVE_MINUTES', 'REWORK_INDICATOR', 'TOTAL_CYCLE_MINUTES'],
    humanReviewRequired: true,
  },
  {
    code: 'REDESIGN_APPROVAL_ROUTING',
    labelHu: 'Jóváhagyási útvonal újratervezése',
    allowedDomains: ['APPROVAL_DELAY'],
    // LONG_CYCLE_TIME alone is explicitly NOT sufficient.
    requiredSignals: ['APPROVAL_HEAVY'],
    contraindications: [],
    supportedOutcomeMetrics: ['TOTAL_WAITING_MINUTES', 'WAITING_SHARE', 'TOTAL_CYCLE_MINUTES'],
    humanReviewRequired: true,
  },
  {
    code: 'DIGITIZE_INTAKE',
    labelHu: 'Beviteli adatrögzítés digitalizálása',
    allowedDomains: ['MANUAL_ADMIN_LOAD', 'DUPLICATE_DATA_ENTRY'],
    // MANUAL_DATA_ENTRY alone does not distinguish intake; the domain restriction
    // keeps this from being offered for pure re-typing / integration problems.
    requiredSignals: ['MANUAL_DATA_ENTRY'],
    contraindications: [],
    supportedOutcomeMetrics: ['TOTAL_ACTIVE_MINUTES', 'DATA_ENTRY_STEP_COUNT'],
    humanReviewRequired: true,
  },
  {
    code: 'CONSOLIDATE_SYSTEMS',
    labelHu: 'Rendszerek összevonása',
    allowedDomains: ['SYSTEM_SWITCHING'],
    // MULTI_SYSTEM_PROCESS alone is explicitly NOT sufficient.
    requiredSignals: ['HIGH_SYSTEM_SWITCHES'],
    contraindications: [],
    supportedOutcomeMetrics: ['SYSTEM_COUNT', 'SYSTEM_SWITCH_COUNT'],
    humanReviewRequired: true,
  },
  {
    code: 'INTEGRATE_SYSTEMS',
    labelHu: 'Rendszerek integrálása',
    allowedDomains: ['SYSTEM_SWITCHING'],
    requiredSignals: ['HIGH_SYSTEM_SWITCHES'],
    contraindications: [],
    supportedOutcomeMetrics: ['SYSTEM_SWITCH_COUNT', 'HANDOFF_STEP_COUNT'],
    humanReviewRequired: true,
  },
  {
    code: 'AUTOMATE_REPETITIVE_STEP',
    labelHu: 'Ismétlődő lépés automatizálása',
    allowedDomains: ['DUPLICATE_DATA_ENTRY', 'MANUAL_ADMIN_LOAD'],
    requiredSignals: [],
    requiredAnySignals: ['REPETITIVE_STEP', 'REPEATED_DATA_ENTRY'],
    contraindications: AUTOMATION_DEFERRAL_SIGNALS,
    supportedOutcomeMetrics: ['TOTAL_ACTIVE_MINUTES', 'DATA_ENTRY_STEP_COUNT'],
    humanReviewRequired: true,
  },
  {
    code: 'CLARIFY_PROCESS_OWNERSHIP',
    labelHu: 'Folyamatfelelősség tisztázása',
    allowedDomains: ['UNCLEAR_OWNERSHIP'],
    // SINGLE_PERSON_DEPENDENCY alone is explicitly NOT sufficient.
    requiredSignals: ['UNASSIGNED_STEPS'],
    contraindications: [],
    supportedOutcomeMetrics: ['UNASSIGNED_STEP_COUNT', 'PROCESS_OWNER_PRESENT', 'RESPONSIBLE_PERSON_CHANGE_COUNT'],
    humanReviewRequired: true,
  },
  {
    code: 'TRAIN_DIGITAL_SKILLS',
    labelHu: 'Digitális készségek fejlesztése',
    allowedDomains: ['SYSTEM_SWITCHING'],
    requiredSignals: ['MULTI_SYSTEM_PROCESS'],
    contraindications: [],
    supportedOutcomeMetrics: ['SYSTEM_SWITCH_COUNT', 'TOTAL_ACTIVE_MINUTES'],
    humanReviewRequired: true,
  },
  {
    code: 'ALIGN_IT_WITH_BUSINESS_GOALS',
    labelHu: 'IT és üzleti célok összehangolása',
    allowedDomains: ['SYSTEM_SWITCHING', 'GENERAL_FLOW'],
    requiredSignals: [],
    contraindications: [],
    supportedOutcomeMetrics: ['SYSTEM_COUNT', 'SYSTEM_SWITCH_COUNT'],
    humanReviewRequired: true,
  },
  {
    code: 'IMPLEMENT_PROCESS_MEASUREMENT',
    labelHu: 'Folyamatmérés bevezetése',
    allowedDomains: ['UNMEASURED_COST', 'GENERAL_FLOW'],
    requiredSignals: [],
    contraindications: [],
    supportedOutcomeMetrics: ['TOTAL_ACTIVE_MINUTES', 'TOTAL_WAITING_MINUTES', 'TOTAL_CYCLE_MINUTES'],
    humanReviewRequired: true,
  },
  {
    code: 'PHASE_DIGITAL_INVESTMENT',
    labelHu: 'Digitális beruházás szakaszolása',
    allowedDomains: ['UNMEASURED_COST'],
    requiredSignals: [],
    contraindications: [],
    supportedOutcomeMetrics: ['TOTAL_ACTIVE_MINUTES', 'TOTAL_CYCLE_MINUTES'],
    humanReviewRequired: true,
  },
  {
    code: 'REMOVE_NON_VALUE_ADDING_STEP',
    labelHu: 'Nem értékteremtő lépés elhagyása',
    allowedDomains: ['MANUAL_ADMIN_LOAD', 'APPROVAL_DELAY'],
    requiredSignals: [],
    contraindications: [],
    supportedOutcomeMetrics: ['TOTAL_ACTIVE_MINUTES', 'HANDOFF_STEP_COUNT', 'TOTAL_CYCLE_MINUTES'],
    humanReviewRequired: true,
  },
  {
    code: 'REDESIGN_BEFORE_AUTOMATING',
    labelHu: 'Újratervezés automatizálás előtt',
    allowedDomains: ['DUPLICATE_DATA_ENTRY', 'MANUAL_ADMIN_LOAD', 'REWORK', 'GENERAL_FLOW'],
    requiredSignals: [],
    requiredAnySignals: AUTOMATION_DEFERRAL_SIGNALS,
    contraindications: [],
    supportedOutcomeMetrics: ['REWORK_INDICATOR', 'TOTAL_ACTIVE_MINUTES', 'TOTAL_CYCLE_MINUTES'],
    humanReviewRequired: true,
  },
];

const BY_CODE = new Map<InterventionCode, InterventionDefinition>(INTERVENTIONS.map((i) => [i.code, i]));

export function interventionLabelHu(code: string): string {
  return BY_CODE.get(code as InterventionCode)?.labelHu ?? code;
}

export function deriveProcessSignals(input: {
  metrics: Record<string, number | boolean | null>;
  surveyCategories?: string[];
  measured: boolean;
  declared: boolean;
}): ProcessSignal[] {
  const m = input.metrics ?? {};
  const num = (code: string): number | null => {
    const v = m[code];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const categories = new Set((input.surveyCategories ?? []).map((c) => String(c).toUpperCase()));
  const signals = new Set<ProcessSignal>();

  const waitingShare = num('WAITING_SHARE');
  const approvals = num('APPROVAL_STEP_COUNT');
  const dataEntry = num('DATA_ENTRY_STEP_COUNT');
  const systemSwitches = num('SYSTEM_SWITCH_COUNT');
  const systemCount = num('SYSTEM_COUNT');
  const unassigned = num('UNASSIGNED_STEP_COUNT');
  const cycle = num('TOTAL_CYCLE_MINUTES');
  const active = num('TOTAL_ACTIVE_MINUTES');
  const ownerPresent = m['PROCESS_OWNER_PRESENT'];

  if (waitingShare != null && waitingShare >= 0.4) signals.add('HIGH_WAITING_SHARE');
  if (approvals != null && approvals >= 3) signals.add('APPROVAL_HEAVY');
  if ((cycle != null && cycle >= 480) || (active != null && active >= 240)) signals.add('LONG_CYCLE_TIME');
  if (systemCount != null && systemCount >= 4) signals.add('MULTI_SYSTEM_PROCESS');
  if (systemSwitches != null && systemSwitches >= 3) signals.add('HIGH_SYSTEM_SWITCHES');
  if (dataEntry != null && dataEntry >= 1) signals.add('MANUAL_DATA_ENTRY');
  if (dataEntry != null && dataEntry >= 2) signals.add('REPETITIVE_STEP');
  if (dataEntry != null && dataEntry >= 3) signals.add('REPEATED_DATA_ENTRY');
  if ((unassigned != null && unassigned >= 2) || ownerPresent === false) signals.add('UNASSIGNED_STEPS');
  if (!input.measured) signals.add('UNMEASURED_COST');

  if (categories.has('REWORK')) signals.add('REWORK_PRESENT');
  if (categories.has('UNCLEAR_OWNERSHIP')) signals.add('UNCLEAR_PROCESS_OWNERSHIP');
  if (categories.has('GENERAL_CONCERN') && !input.measured) signals.add('PROCESS_VARIABILITY');

  return [...signals];
}

/**
 * Deterministically selects the safe interventions for a diagnosis. Returns the
 * canonical codes (subset of INTERVENTION_CODES), order-stable.
 */
export function selectInterventions(input: {
  domainKey: string;
  signals: ProcessSignal[];
  measured: boolean;
}): InterventionCode[] {
  const signals = new Set(input.signals);
  const selected: InterventionCode[] = [];
  for (const def of INTERVENTIONS) {
    if (!def.allowedDomains.includes(input.domainKey)) continue;
    if ((def.requiredSignals ?? []).some((s) => !signals.has(s))) continue;
    if (def.requiredAnySignals && def.requiredAnySignals.length && !def.requiredAnySignals.some((s) => signals.has(s))) continue;
    if (def.contraindications.some((s) => signals.has(s))) continue;
    selected.push(def.code);
  }
  return selected;
}
