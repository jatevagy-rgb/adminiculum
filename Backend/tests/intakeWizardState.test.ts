/**
 * Pure intake-wizard state tests — INTAKE-QUEUE-UX-HARDENING-1.
 *
 * The wizard step/validation rules live in a framework-free Frontend module
 * and are imported directly (established cross-project pattern). Validation is
 * operational form-completeness only — no legal inference, no persistence.
 */

import fs from 'fs';
import path from 'path';
import {
  buildWizardSummary,
  canNavigateToStep,
  canSubmitWizard,
  firstInvalidStep,
  INITIAL_INTAKE_WIZARD_DATA,
  INTAKE_WIZARD_STEPS,
  isValidDeadlineInput,
  type IntakeWizardData,
  validateWizardStep,
} from '../../Frontend/src/lib/intake/intakeWizardState';

function data(overrides: Partial<IntakeWizardData> = {}): IntakeWizardData {
  return { ...INITIAL_INTAKE_WIZARD_DATA, ...overrides };
}

const completeData = (): IntakeWizardData =>
  data({
    clientMode: 'EXISTING',
    selectedClient: { id: 'client-1', displayName: 'Teszt Kft.' },
    clientRole: 'MEGBÍZÓ',
    description: 'Rövid belső leírás',
  });

describe('step validation', () => {
  it('client step: EXISTING mode requires a selected client', () => {
    const invalid = validateWizardStep('client', data());
    expect(invalid.ok).toBe(false);
    expect(invalid.errors[0]).toContain('meglévő ügyfelet');

    const valid = validateWizardStep('client', data({ selectedClient: { id: 'c1', displayName: 'X' } }));
    expect(valid.ok).toBe(true);
  });

  it('client step: NEW mode requires a name and a well-formed optional email', () => {
    expect(validateWizardStep('client', data({ clientMode: 'NEW' })).ok).toBe(false);
    expect(validateWizardStep('client', data({ clientMode: 'NEW', newClientName: '   ' })).ok).toBe(false);
    expect(validateWizardStep('client', data({ clientMode: 'NEW', newClientName: 'Új Kft.' })).ok).toBe(true);
    expect(
      validateWizardStep('client', data({ clientMode: 'NEW', newClientName: 'Új Kft.', newClientEmail: 'rossz-cim' })).ok
    ).toBe(false);
    expect(
      validateWizardStep('client', data({ clientMode: 'NEW', newClientName: 'Új Kft.', newClientEmail: 'jo@cim.hu' })).ok
    ).toBe(true);
  });

  it('matter step requires client role and description (trimmed)', () => {
    const invalid = validateWizardStep('matter', data({ clientRole: ' ', description: '' }));
    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toHaveLength(2);
    expect(validateWizardStep('matter', data({ clientRole: 'VEVŐ', description: 'x' })).ok).toBe(true);
  });

  it('responsibility and conflict steps are always passable (optional/informational)', () => {
    expect(validateWizardStep('responsibility', data()).ok).toBe(true);
    expect(validateWizardStep('conflict', data()).ok).toBe(true);
  });

  it('opening plan accepts empty or valid YYYY-MM-DD deadlines only', () => {
    expect(validateWizardStep('openingPlan', data()).ok).toBe(true);
    expect(validateWizardStep('openingPlan', data({ initialDeadline: '2026-08-01' })).ok).toBe(true);
    expect(validateWizardStep('openingPlan', data({ initialDeadline: '01/08/2026' })).ok).toBe(false);
    expect(validateWizardStep('openingPlan', data({ initialDeadline: '2026-13-40' })).ok).toBe(false);
  });

  it('review aggregates client + matter + plan errors', () => {
    const review = validateWizardStep('review', data());
    expect(review.ok).toBe(false);
    expect(review.errors.length).toBeGreaterThanOrEqual(3);
    expect(validateWizardStep('review', completeData()).ok).toBe(true);
  });
});

describe('deadline input format', () => {
  it('accepts real dates and rejects malformed or impossible ones', () => {
    expect(isValidDeadlineInput('2026-02-28')).toBe(true);
    expect(isValidDeadlineInput('2026-02-30')).toBe(false); // impossible date
    expect(isValidDeadlineInput('2026-2-8')).toBe(false);
    expect(isValidDeadlineInput('')).toBe(false);
  });
});

describe('navigation rules', () => {
  it('firstInvalidStep points at the earliest incomplete step', () => {
    expect(firstInvalidStep(data())).toBe('client');
    expect(firstInvalidStep(data({ selectedClient: { id: 'c1', displayName: 'X' } }))).toBe('matter');
    expect(firstInvalidStep(completeData())).toBeNull();
  });

  it('backward navigation is always allowed; forward requires earlier steps valid', () => {
    const incomplete = data();
    expect(canNavigateToStep(0, 3, incomplete)).toBe(true); // backwards
    expect(canNavigateToStep(2, 0, incomplete)).toBe(false); // forward past invalid client
    expect(canNavigateToStep(2, 0, completeData())).toBe(true);
    const lastIndex = INTAKE_WIZARD_STEPS.length - 1;
    expect(canNavigateToStep(lastIndex, 0, completeData())).toBe(true);
  });

  it('submission is gated on the aggregated review validation', () => {
    expect(canSubmitWizard(data())).toBe(false);
    expect(canSubmitWizard(completeData())).toBe(true);
    expect(canSubmitWizard({ ...completeData(), initialDeadline: 'nem-datum' })).toBe(false);
  });
});

describe('review summary', () => {
  it('describes exactly what will be created, with truthful fallbacks', () => {
    const summary = buildWizardSummary(completeData(), { matterTypeLabel: 'Egyéb', responsibleLawyerName: null });
    const byLabel = Object.fromEntries(summary.map((line) => [line.label, line.value]));
    expect(byLabel['Ügyfél']).toContain('meglévő — Teszt Kft.');
    expect(byLabel['Felelős ügyvéd']).toBe('később kerül kijelölésre');
    expect(byLabel['Nyitó feladatok']).toBe('0 db');
    expect(byLabel['Kezdő határidő']).toBe('nincs');
  });
});

describe('module safety', () => {
  it('holds no browser persistence and no network access', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'Frontend', 'src', 'lib', 'intake', 'intakeWizardState.ts'),
      'utf8'
    );
    const lower = source.toLowerCase();
    for (const forbidden of ['localstorage', 'sessionstorage', 'indexeddb', 'fetch(', 'xmlhttprequest', 'document.cookie']) {
      expect(`${forbidden}:${lower.includes(forbidden)}`).toBe(`${forbidden}:false`);
    }
  });
});
