import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const workspace = fs.readFileSync(path.resolve('src/components/cases/CaseWorkspaceOverview.tsx'), 'utf8');

describe('Case Workspace task submission convergence', () => {
  it('opens the canonical submission workspace for lifecycle work', () => {
    assert.match(workspace, /TaskSubmissionWorkspace/);
    assert.match(workspace, /listTaskLifecycleItems/);
    assert.match(workspace, /onWorkflowChanged=\{refresh\}/);
    assert.match(workspace, /Review megnyitása/);
    assert.match(workspace, /Leadás megnyitása/);
  });

  it('does not retain direct submission approval shortcuts', () => {
    assert.doesNotMatch(workspace, /import .*submitTask|import .*completeTask/);
    assert.doesNotMatch(workspace, /completeTask\(/);
    assert.doesNotMatch(workspace, /submitTask\(/);
  });
});
