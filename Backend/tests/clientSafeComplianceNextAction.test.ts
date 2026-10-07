import { buildNextAction, type MissingInformationItem } from '../src/modules/compliance/clientSafeComplianceService';

const missing = (portalAnswerable: boolean, questionKey: string | null): MissingInformationItem => ({
  label: 'Ügyfél számára biztonságos adatcímke', portalAnswerable, questionKey,
});

describe('customer-safe Compliance next action', () => {
  it('only requests portal input for an actual answerable question', () => {
    expect(buildNextAction('MORE_INFORMATION_NEEDED', [missing(true, 'company_employee_count')])).toBe('Kérjük, töltse ki a hiányzó információkat a portálon.');
    expect(buildNextAction('REVIEW_RECOMMENDED', [missing(true, 'company_employee_count')])).toBe('Kérjük, töltse ki a hiányzó információkat a portálon.');
  });

  it('never turns missing office-only or stale facts into customer portal work', () => {
    const office = 'Irodai adatellenőrzés vagy belső frissítés szükséges. Öntől jelenleg nincs várt teendő.';
    expect(buildNextAction('MORE_INFORMATION_NEEDED', [])).toBe(office);
    expect(buildNextAction('MORE_INFORMATION_NEEDED', [missing(false, null)])).toBe(office);
    expect(buildNextAction('MORE_INFORMATION_NEEDED', [missing(true, null)])).toBe(office);
    expect(buildNextAction('MORE_INFORMATION_NEEDED', [missing(true, ' ')])).toBe(office);
    expect(buildNextAction('REVIEW_RECOMMENDED', [])).toBe('Belső felülvizsgálat javasolt. Öntől jelenleg nincs várt teendő.');
  });

  it('preserves lawyer review and in-progress statements without certifying legal outcomes', () => {
    expect(buildNextAction('LAWYER_REVIEW_REQUIRED', [])).toBe('Ügyvédi áttekintés javasolt.');
    expect(buildNextAction('ACTION_IN_PROGRESS', [])).toBe('A terület állapota a portálon nyomon követhető.');
    expect(buildNextAction('RESOLVED', [])).toBeNull();
  });
});
