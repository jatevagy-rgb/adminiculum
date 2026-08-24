import { classifyCaseAttribution } from '../src/modules/time-economics/service';

describe('case time attribution', () => {
  const matterId = 'matter-a';
  const caseA = 'case-a';

  it('attributes matter-only time when a Matter has exactly one Case', () => {
    expect(classifyCaseAttribution({ caseId: caseA, matterId, matterCaseIds: [caseA], task: null }))
      .toEqual({ mode: 'EXACT_CASE', attributable: true });
  });

  it('does not attribute matter-only time when a Matter has multiple Cases', () => {
    expect(classifyCaseAttribution({ caseId: caseA, matterId, matterCaseIds: [caseA, 'case-b'], task: null }))
      .toEqual({ mode: 'AMBIGUOUS', attributable: false });
  });

  it('uses a matching task to derive a Case for a multi-case Matter', () => {
    expect(classifyCaseAttribution({ caseId: caseA, matterId, matterCaseIds: [caseA, 'case-b'], task: { caseId: caseA, matterId } }))
      .toEqual({ mode: 'TASK_DERIVED_CASE', attributable: true });
  });

  it('does not claim case time for a Matter without Cases', () => {
    expect(classifyCaseAttribution({ caseId: caseA, matterId, matterCaseIds: [], task: null }))
      .toEqual({ mode: 'MATTER_ONLY', attributable: false });
  });

  it('rejects task attribution when the Task is linked to a different Matter or Case', () => {
    expect(classifyCaseAttribution({ caseId: caseA, matterId, matterCaseIds: [caseA], task: { caseId: 'case-b', matterId: 'matter-b' } }))
      .toEqual({ mode: 'AMBIGUOUS', attributable: false });
  });
});
