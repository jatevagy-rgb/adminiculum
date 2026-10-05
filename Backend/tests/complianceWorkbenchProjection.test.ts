import { missingFactWorkbenchRow } from '../src/modules/compliance/complianceWorkbenchService';

describe('Compliance Workbench missing-fact presentation projection', () => {
  const area = (applicabilityId: string) => ({
    applicabilityId,
    title: 'Azonos megjelenő követelmény',
    outcome: 'INSUFFICIENT_FACTS',
    subjectLabel: null,
    evaluationAt: '2026-10-05T00:00:00.000Z',
  });

  it('uses the authoritative human label when present', () => {
    const row = missingFactWorkbenchRow('client-a', area('app-a'), { factKey: 'registered_office', label: 'Székhely' });
    expect(row.title).toBe('Azonos megjelenő követelmény — Székhely');
    expect(row.requirementsTarget).toEqual({ clientId: 'client-a', applicabilityId: 'app-a', factKey: 'registered_office' });
  });

  it('uses a neutral title fallback and never leaks a missing fact key', () => {
    const row = missingFactWorkbenchRow('client-a', area('app-a'), { factKey: 'whistle_special_sector', label: null });
    expect(row.title).toBe('Azonos megjelenő követelmény — Ügyvédi pontosítás szükséges.');
    expect(row.title).not.toContain('whistle_special_sector');
    expect(row.requirementsTarget).toEqual({ clientId: 'client-a', applicabilityId: 'app-a', factKey: 'whistle_special_sector' });
  });

  it('keeps identical titles distinct by client, applicability and fact identity', () => {
    const first = missingFactWorkbenchRow('client-a', area('app-a'), { factKey: 'fact-one', label: null });
    const second = missingFactWorkbenchRow('client-a', area('app-b'), { factKey: 'fact-two', label: null });
    expect(first.title).toBe(second.title);
    expect(first.requirementsTarget).not.toEqual(second.requirementsTarget);
    expect(first.id).not.toBe(second.id);
  });
});
