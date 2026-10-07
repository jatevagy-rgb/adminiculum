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
    assert.match(overview, /CaseSubmissionHandoff/);
    assert.match(overview, /data-testid="task-submission-leadas"/);
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

  it("portals the Leadás time dialog to the viewport layer with internal scrolling", () => {
    const dialog = read("src/components/cases/CaseTimeEntryDialog.tsx");
    assert.match(dialog, /createPortal\([\s\S]*document\.body/);
    assert.match(dialog, /role="dialog" aria-modal="true"/);
    assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(dialog, /overflow-y-auto p-5/);
    assert.match(dialog, /onClick=\{onClose\}/);
    assert.match(dialog, /onSaved\(\)/);
  });

  it("portals anonymization without changing its form and submission handlers", () => {
    const dialog = read("src/components/documents/AnonymizeModal.tsx");
    assert.match(dialog, /if \(!isOpen \|\| !mounted\) return null/);
    assert.match(dialog, /createPortal\([\s\S]*document\.body/);
    assert.match(dialog, /role="dialog" aria-modal="true" aria-labelledby="anonymize-modal-title"/);
    assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(dialog, /min-h-0 flex-1 overflow-y-auto/);
    assert.match(dialog, /onClick=\{onClose\}/);
    assert.match(dialog, /onClick=\{handleAnonymize\}/);
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

