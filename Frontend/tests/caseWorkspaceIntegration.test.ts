import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("W2C Case Workspace integration", () => {
  it("keeps task lifecycle actions in the canonical submission workspace", () => {
    const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
    assert.match(overview, /TaskSubmissionWorkspace/);
    assert.match(overview, /listTaskLifecycleItems/);
    assert.match(overview, /onWorkflowChanged=\{refresh\}/);
    assert.match(overview, /Review megnyitása/);
    assert.match(overview, /Leadás megnyitása/);
    assert.doesNotMatch(overview, /validateTaskTransition|Task\.status\s*=|submitTask\(|completeTask\(/);
  });

  it("records time from the Case without requiring Matter selection", () => {
    const dialog = read("src/components/cases/CaseTimeEntryDialog.tsx");
    const api = read("src/lib/caseTimeBillingApi.ts");
    assert.match(dialog, /caseId/);
    assert.match(dialog, /minutes/);
    assert.match(dialog, /description/);
    assert.match(dialog, /taskId/);
    assert.match(dialog, /workDate/);
    assert.match(dialog, /recordCaseTime/);
    assert.doesNotMatch(dialog, /matterId|Matter/);
    assert.doesNotMatch(api, /matterId/);
  });

  it("keeps the Case cockpit connected to task, time, document and communication projections", () => {
    const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
    assert.match(overview, /CaseTimeBillingSummary/);
    assert.match(overview, /ck-tasks/);
    assert.match(overview, /ck-documents/);
    assert.match(overview, /ck-comms/);
    assert.match(overview, /time-entries\?caseId=/);
  });
});

