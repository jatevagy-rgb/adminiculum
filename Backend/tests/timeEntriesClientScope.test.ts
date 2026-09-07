import { buildTimeEntryListWhere, resolveTimeEntryAttribution } from '../src/routes/timeEntries';

describe('T1 client/case time scope contracts', () => {
  const admin = 'admin';

  it('keeps global reads self-scoped and enables privileged team scope only for client/case views', () => {
    expect(buildTimeEntryListWhere({}, admin, true).where.userId).toBe(admin);
    expect(buildTimeEntryListWhere({ clientId: 'client-a' }, admin, true).where.userId).toBeUndefined();
    expect(buildTimeEntryListWhere({ caseId: 'case-a' }, admin, true).where.userId).toBeUndefined();
    expect(buildTimeEntryListWhere({ clientId: 'client-a' }, 'lawyer-a', false).where.userId).toBe('lawyer-a');
  });

  it('keeps explicit cross-user filtering forbidden for non-privileged users and authoritative client scope isolated', () => {
    expect(buildTimeEntryListWhere({ userId: 'lawyer-b' }, 'lawyer-a', false).forbidden).toBe(true);
    const scope = buildTimeEntryListWhere({ clientId: 'client-a' }, admin, true).where;
    expect(scope.AND[0].OR).toEqual(expect.arrayContaining([{ matter: { clientId: 'client-a' } }, { case: { clientId: 'client-a' } }]));
  });

  it('returns canonical attribution for single-case, multi-case, and valid task-linked entries', () => {
    const base = { matterId: 'matter-a', matter: { cases: [{ id: 'case-a' }] } };
    expect(resolveTimeEntryAttribution(base)).toEqual({ attributionKind: 'EXACT_CASE', resolvedCaseId: 'case-a' });
    expect(resolveTimeEntryAttribution({ ...base, matter: { cases: [{ id: 'case-a' }, { id: 'case-b' }] } })).toEqual({ attributionKind: 'AMBIGUOUS', resolvedCaseId: null });
    expect(resolveTimeEntryAttribution({ ...base, task: { caseId: 'case-a', matterId: 'matter-a', workPackageItem: null } })).toEqual({ attributionKind: 'TASK_DERIVED_CASE', resolvedCaseId: 'case-a' });
  });

  it('does not falsely label inconsistent task provenance as task-derived', () => {
    const result = resolveTimeEntryAttribution({
      matterId: 'matter-a',
      matter: { cases: [{ id: 'case-a' }, { id: 'case-b' }] },
      task: { caseId: 'case-b', matterId: 'matter-a', workPackageItem: { caseWorkPackage: { caseId: 'case-a' } } },
    });
    expect(result).not.toEqual({ attributionKind: 'TASK_DERIVED_CASE', resolvedCaseId: 'case-b' });
  });
});
