import { WORKFLOW_TEMPLATES, validateWorkflowDag } from '../src/modules/cases/caseWorkflowOrchestration';

describe('case workflow DAG behaviour', () => {
  it('keeps the required Gyula/Amanda to Csanad workflow as a blocked downstream DAG', () => {
    const template = WORKFLOW_TEMPLATES.CONTRACT_REVIEW_TRIAD;
    expect(() => validateWorkflowDag(template.steps)).not.toThrow();
    expect(template.steps.map((step) => step.title)).toEqual([
      'Szerződés első jogi átnézése',
      'Ügyfél- és compliance-ellenőrzés',
      'Végső partneri review',
    ]);
    expect(template.steps.find((step) => step.key === 'partner-final-review')?.dependsOn).toEqual(['legal-review', 'compliance-check']);
  });

  it('rejects self-dependencies and cycles', () => {
    expect(() => validateWorkflowDag([{ key: 'a', title: 'A', dependsOn: ['a'] }])).toThrow('cannot depend on itself');
    expect(() => validateWorkflowDag([
      { key: 'a', title: 'A', dependsOn: ['b'] },
      { key: 'b', title: 'B', dependsOn: ['a'] },
    ])).toThrow('acyclic');
  });
});
