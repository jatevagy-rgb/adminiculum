import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, flatten, settle, textOf } from './helpers/asyncRaceHarness';
import * as presentation from '../src/lib/taskWorkflowPresentation';

function workflow(id: string) {
  return {
    task: { id, title: `Workflow ${id}`, status: 'IN_PROGRESS', priority: 'MEDIUM', dueDate: null,
      caseId: `case-${id}`, matterId: null, assignee: null,
      case: { id: `case-${id}`, caseNumber: id, client: { id: 'client', name: 'Synthetic client' } } },
    activeDraft: null, latestSubmittedRevision: null, submissions: [], readiness: null,
    nextActionCode: 'OPEN_TASK', permittedActions: {},
  };
}

function harness() {
  const calls: Array<{ id: string; result: ReturnType<typeof deferred> }> = [];
  const h = createRaceHarness('src/components/tasks/TaskSubmissionWorkspace.tsx', 'TaskSubmissionWorkspaceContent', {
    '@/lib/taskLifecycleApi': {
      StableMutationAttempt: class { begin() {} key() { return 'synthetic-key'; } complete() {} },
      readTaskSubmissionWorkflow: (id: string) => { const result = deferred(); calls.push({ id, result }); return result.promise; },
      listEligibleTaskReviewers: async () => [],
    },
    '@/lib/api': { getCaseDocuments: async () => [], getTimeEntries: async () => [] },
    '@/lib/taskWorkflowPresentation': presentation,
    '@/components/adminiculum/ui': { AdminButton: 'button', AdminStatusPill: 'span' },
    '@/components/adminiculum/OperationalPrimitives': { CompactState: 'state', SafePanelError: 'error' },
    '@/components/tasks/WorkflowDialog': { WorkflowDialog: 'dialog' },
    '@/components/tasks/TaskResponsibilityPanel': { TaskResponsibilityPanel: 'responsibility' },
  });
  const props = (id: string) => ({ item: { id, title: id, case: { caseNumber: id, clientName: 'Synthetic' } }, onClose() {}, onWorkflowChanged() {} });
  return { h, calls, props };
}

test('the submission workspace independently rejects late success and failure after A → B', async () => {
  for (const late of ['success', 'failure']) {
    const { h, calls, props } = harness();
    h.commit(props('A'));
    h.commit(props('B'));
    calls[1].result.resolve(workflow('B'));
    await settle();
    h.commit(props('B'));
    const before = textOf(h.render(props('B')));
    if (late === 'success') calls[0].result.resolve(workflow('A'));
    else calls[0].result.reject(new Error('synthetic late failure'));
    await settle();
    const tree = h.render(props('B'));
    assert.equal(textOf(tree), before);
    assert.equal(flatten(tree).some((node) => node.props?.role === 'alert'), false);
    assert.equal(h.slots()[0]?.task.id, 'B');
  }
});

test('A → B → A accepts only the newest A read and unmount rejects pending reads', async () => {
  const { h, calls, props } = harness();
  h.commit(props('A'));
  h.commit(props('B'));
  h.commit(props('A'));
  calls[2].result.resolve(workflow('A'));
  await settle();
  h.commit(props('A'));
  calls[0].result.resolve({ ...workflow('A'), task: { ...workflow('A').task, title: 'Stale A' } });
  calls[1].result.reject(new Error('late B'));
  await settle();
  assert.equal(h.slots()[0]?.task.title, 'Workflow A');
  h.commit(props('C'));
  h.unmount();
  calls[3].result.resolve(workflow('C'));
  await settle();
  assert.equal(h.slots()[0], null);
});
