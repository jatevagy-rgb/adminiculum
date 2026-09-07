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

  it('returns canonical attribution for unlinked single-case and multi-case matters', () => {
    const base = { matterId: 'matter-a', matter: { cases: [{ id: 'case-a' }] } };
    expect(resolveTimeEntryAttribution(base)).toEqual({ attributionKind: 'EXACT_CASE', resolvedCaseId: 'case-a' });
    expect(resolveTimeEntryAttribution({ ...base, matter: { cases: [{ id: 'case-a' }, { id: 'case-b' }] } })).toEqual({ attributionKind: 'AMBIGUOUS', resolvedCaseId: null });
  });

  it('gives persisted task provenance precedence over a matching direct case', () => {
    expect(resolveTimeEntryAttribution({
      matterId: 'matter-a',
      caseId: 'case-a',
      matter: { cases: [{ id: 'case-a' }] },
      task: { caseId: 'case-a', matterId: 'matter-a', workPackageItem: null },
    })).toEqual({ attributionKind: 'TASK_DERIVED_CASE', resolvedCaseId: 'case-a' });
  });

  it('fails safely when persisted direct case and task case disagree', () => {
    expect(resolveTimeEntryAttribution({
      matterId: 'matter-a',
      caseId: 'case-b',
      matter: { cases: [{ id: 'case-a' }, { id: 'case-b' }] },
      task: { caseId: 'case-a', matterId: 'matter-a', workPackageItem: null },
    })).toEqual({ attributionKind: 'AMBIGUOUS', resolvedCaseId: null });
  });

  it('keeps consistent case-first task attribution when matter is null', () => {
    expect(resolveTimeEntryAttribution({
      matterId: null,
      caseId: 'case-a',
      matter: null,
      task: { caseId: 'case-a', matterId: null, workPackageItem: null },
    })).toEqual({ attributionKind: 'TASK_DERIVED_CASE', resolvedCaseId: 'case-a' });
  });

  it('keeps a direct case exact when no task is linked', () => {
    expect(resolveTimeEntryAttribution({ caseId: 'case-a', matterId: null, matter: null, task: null }))
      .toEqual({ attributionKind: 'EXACT_CASE', resolvedCaseId: 'case-a' });
  });
});
