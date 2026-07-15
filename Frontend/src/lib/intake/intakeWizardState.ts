/**
 * Intake wizard state helpers — INTAKE-QUEUE-UX-HARDENING-1.
 *
 * Pure, framework-free step/validation logic for the /intake new-matter
 * wizard, extracted so the route component stays presentational and the rules
 * are unit-testable in Node. No persistence of any kind: wizard data lives in
 * React state for the current session only, and every mutation continues to go
 * through the existing authorized backend endpoints. Validation here is
 * operational form-completeness only — it makes no legal judgment and infers
 * nothing from free text.
 */

export const INTAKE_WIZARD_STEPS = [
  { id: 'client', label: 'Ügyfél' },
  { id: 'matter', label: 'Ügy' },
  { id: 'responsibility', label: 'Felelősség' },
  { id: 'conflict', label: 'Összeférhetetlenség' },
  { id: 'openingPlan', label: 'Nyitási terv' },
  { id: 'review', label: 'Áttekintés' },
] as const;

export type IntakeWizardStepId = (typeof INTAKE_WIZARD_STEPS)[number]['id'];

export interface IntakeWizardData {
  clientMode: 'EXISTING' | 'NEW';
  selectedClient: { id: string; displayName: string } | null;
  newClientName: string;
  newClientEmail: string;
  newClientPhone: string;
  matterType: string;
  clientRole: string;
  description: string;
  responsibleLawyerId: string;
  collaboratorIds: string[];
  selectedTaskCodes: string[];
  initialDeadline: string;
}

export interface StepValidationResult {
  ok: boolean;
  errors: string[];
}

const VALID = { ok: true, errors: [] } as const satisfies StepValidationResult;

/** Light shape check only — real validation stays server-side. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Explicit YYYY-MM-DD (the date input format) that parses to a real date. */
export function isValidDeadlineInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Parse and re-format in UTC so the check is timezone-independent; an
  // impossible date (e.g. 02-30) rolls over and fails the round-trip.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateWizardStep(step: IntakeWizardStepId, data: IntakeWizardData): StepValidationResult {
  switch (step) {
    case 'client': {
      const errors: string[] = [];
      if (data.clientMode === 'EXISTING') {
        if (!data.selectedClient) errors.push('Válasszon ki egy meglévő ügyfelet a találatok közül.');
      } else {
        if (!data.newClientName.trim()) errors.push('Az új ügyfél neve kötelező.');
        if (data.newClientEmail.trim() && !looksLikeEmail(data.newClientEmail.trim())) {
          errors.push('Az e-mail cím formátuma érvénytelen.');
        }
      }
      return { ok: errors.length === 0, errors };
    }
    case 'matter': {
      const errors: string[] = [];
      if (!data.clientRole.trim()) errors.push('Az ügyfél szerepe kötelező (pl. MEGBÍZÓ, VEVŐ).');
      if (!data.description.trim()) errors.push('A rövid belső ügyleírás kötelező.');
      return { ok: errors.length === 0, errors };
    }
    case 'responsibility':
    case 'conflict':
      // Responsible lawyer / collaborators are optional at intake; the
      // conflict step is an informational (truthfully unavailable) notice.
      return VALID;
    case 'openingPlan': {
      const errors: string[] = [];
      if (data.initialDeadline && !isValidDeadlineInput(data.initialDeadline)) {
        errors.push('A kezdő határidő formátuma érvénytelen (ÉÉÉÉ-HH-NN).');
      }
      return { ok: errors.length === 0, errors };
    }
    case 'review': {
      const aggregated = [
        ...validateWizardStep('client', data).errors,
        ...validateWizardStep('matter', data).errors,
        ...validateWizardStep('openingPlan', data).errors,
      ];
      return { ok: aggregated.length === 0, errors: aggregated };
    }
    default:
      return VALID;
  }
}

/** The earliest step with validation errors, or null when all steps pass. */
export function firstInvalidStep(data: IntakeWizardData): IntakeWizardStepId | null {
  for (const step of INTAKE_WIZARD_STEPS) {
    if (step.id === 'review') continue;
    if (!validateWizardStep(step.id, data).ok) return step.id;
  }
  return null;
}

/**
 * Forward navigation requires every earlier step to be valid; navigating
 * backwards is always allowed.
 */
export function canNavigateToStep(targetIndex: number, currentIndex: number, data: IntakeWizardData): boolean {
  if (targetIndex <= currentIndex) return true;
  for (let index = 0; index < targetIndex; index += 1) {
    const step = INTAKE_WIZARD_STEPS[index];
    if (step.id === 'review') continue;
    if (!validateWizardStep(step.id, data).ok) return false;
  }
  return true;
}

/** Whether the final create action may run (client + matter + plan valid). */
export function canSubmitWizard(data: IntakeWizardData): boolean {
  return validateWizardStep('review', data).ok;
}

export interface WizardSummaryLine {
  label: string;
  value: string;
}

/** Review-step summary of exactly what will be created (pure, display-only). */
export function buildWizardSummary(
  data: IntakeWizardData,
  lookups: { matterTypeLabel?: string | null; responsibleLawyerName?: string | null }
): WizardSummaryLine[] {
  return [
    {
      label: 'Ügyfél',
      value:
        data.clientMode === 'EXISTING'
          ? `meglévő — ${data.selectedClient?.displayName || '(nincs kiválasztva)'}`
          : `új — ${data.newClientName.trim() || '(név nélkül)'}`,
    },
    {
      label: 'Ügy',
      value: `${lookups.matterTypeLabel || data.matterType} · szerep: ${data.clientRole.trim() || '—'}`,
    },
    { label: 'Felelős ügyvéd', value: lookups.responsibleLawyerName || 'később kerül kijelölésre' },
    { label: 'Munkatársak', value: `${data.collaboratorIds.length} fő` },
    { label: 'Nyitó feladatok', value: `${data.selectedTaskCodes.length} db` },
    { label: 'Kezdő határidő', value: data.initialDeadline || 'nincs' },
  ];
}

export const INITIAL_INTAKE_WIZARD_DATA: IntakeWizardData = {
  clientMode: 'EXISTING',
  selectedClient: null,
  newClientName: '',
  newClientEmail: '',
  newClientPhone: '',
  matterType: 'OTHER',
  clientRole: '',
  description: '',
  responsibleLawyerId: '',
  collaboratorIds: [],
  selectedTaskCodes: [],
  initialDeadline: '',
};
