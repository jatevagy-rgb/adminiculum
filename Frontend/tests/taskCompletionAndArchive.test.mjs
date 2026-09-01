import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (rel) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
const rx = (t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

test("Case Workspace opens the canonical submission/review workspace", () => {
  const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
  const submissionWorkspace = read("src/components/tasks/TaskSubmissionWorkspace.tsx");
  assert.match(overview, /TaskSubmissionWorkspace/);
  assert.match(overview, /IN_REVIEW.*SUBMITTED/);
  assert.match(submissionWorkspace, rx("Jóváhagyva"));
  assert.match(overview, rx("Review megnyitása"));
});

test("Defect 1 backend: a workflow step is completable by its responsible (not only an independent reviewer)", () => {
  const workItems = read("../Backend/src/modules/cases/workItems.ts");
  assert.match(workItems, /workflowInstanceId/);
  assert.match(workItems, /const isWorkflowStep = Boolean\(task\.workflowInstanceId\)/);
  assert.match(workItems, /workflowReviewer = isWorkflowStep && \(assignedWorker \|\| taskSupervisor \|\| REVIEWER_ROLES\.has\(role\)\)/);
  assert.match(workItems, /canApprove = \(reviewer \|\| workflowReviewer\)/);
});

test("Defect 2: case archive uses the lifecycle service, surfaces errors, and offers a forced close", () => {
  const detail = read("src/components/CaseDetail.tsx");
  assert.match(detail, /closeCaseLifecycle\(caseRecord\.id, force\)/);
  assert.match(detail, /archiveCaseLifecycle\(caseRecord\.id\)/);
  assert.doesNotMatch(detail, /updateCaseStatus\(caseRecord\.id, 'ARCHIVED'/);
  assert.match(detail, /CLOSURE_BLOCKED/);
  assert.match(detail, /data-testid="case-complete-error"/);
  assert.match(detail, /data-testid="case-force-archive"/);
  assert.match(detail, rx("Feladatok lezárása és ügy archiválása"));
});

test("Defect 2 backend: forced close cancels open tasks + bypasses blockers", () => {
  const lifecycle = read("../Backend/src/modules/cases/lifecycleService.ts");
  assert.match(lifecycle, /opts: \{ force\?: boolean \}/);
  assert.match(lifecycle, /action === 'CLOSE' && opts\.force \? \[\] : blockers/);
  assert.match(lifecycle, /status: \{ notIn: CLOSED_TASK_STATUSES \}/);
  assert.match(lifecycle, /FORCE_CLOSE_CANCEL_TASKS/);
});
