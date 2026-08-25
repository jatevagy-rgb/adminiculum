import { classifyTimeAttribution, attributionLabel } from '../src/modules/time-attribution/attribution';

describe('TIME-0 case time attribution classifier (pure)', () => {
  const matterId = 'matter-a';
  const caseA = 'case-a';
  const caseB = 'case-b';

  it('classifies direct Case as EXACT_CASE (Matter has exactly one Case)', () => {
    const result = classifyTimeAttribution({ matterId, matterCaseIds: [caseA], caseId: caseA });
    expect(result.classification).toBe('EXACT_CASE');
    expect(result.caseId).toBe(caseA);
  });

  it('classifies a single linked Task as TASK_DERIVED_CASE', () => {
    const result = classifyTimeAttribution({
      matterId,
      matterCaseIds: [caseA, caseB],
      caseId: caseA,
      task: { taskId: 'task-1', caseId: caseA, matterId },
    });
    expect(result.classification).toBe('TASK_DERIVED_CASE');
    expect(result.caseId).toBe(caseA);
    expect(result.taskId).toBe('task-1');
  });

  it('classifies a Matter with no Case as MATTER_ONLY (never inferred to a Case)', () => {
    const result = classifyTimeAttribution({ matterId, matterCaseIds: [], caseId: caseA });
    expect(result.classification).toBe('MATTER_ONLY');
    expect(result.caseId).toBeUndefined();
  });

  it('does NOT infer a Case from a Matter with multiple Cases and no Task', () => {
    const result = classifyTimeAttribution({ matterId, matterCaseIds: [caseA, caseB], caseId: caseA, task: null });
    expect(result.classification).toBe('AMBIGUOUS');
    expect(result.caseId).toBeUndefined();
  });

  it('returns AMBIGUOUS when the requested Case and the Task Case disagree', () => {
    const result = classifyTimeAttribution({
      matterId,
      matterCaseIds: [caseA, caseB],
      caseId: caseA,
      task: { taskId: 'task-2', caseId: caseB, matterId },
    });
    expect(result.classification).toBe('AMBIGUOUS');
  });

  it('returns AMBIGUOUS when the linked Task belongs to a different Matter', () => {
    const result = classifyTimeAttribution({
      matterId,
      matterCaseIds: [caseA],
      caseId: caseA,
      task: { taskId: 'task-3', caseId: caseA, matterId: 'matter-b' },
    });
    expect(result.classification).toBe('AMBIGUOUS');
  });

  it('never resolves cross-client / cross-matter Task to a Case', () => {
    const result = classifyTimeAttribution({
      matterId,
      matterCaseIds: [caseB],
      caseId: caseA,
      task: { taskId: 'task-4', caseId: caseB, matterId },
    });
    // requested Case A (not the Matter's single Case B) → ambiguous, never A.
    expect(result.classification).toBe('AMBIGUOUS');
  });

  it('exposes human labels, never raw enums for normal rendering', () => {
    expect(attributionLabel('EXACT_CASE')).toBe('Ügyhöz rendelt');
    expect(attributionLabel('TASK_DERIVED_CASE')).toBe('Feladatból azonosított');
    expect(attributionLabel('MATTER_ONLY')).toBe('Csak matter szinten');
    expect(attributionLabel('AMBIGUOUS')).toBe('Nem egyértelmű');
  });
});
