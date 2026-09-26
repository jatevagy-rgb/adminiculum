import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  leadasHandoffMode,
  type LeadasHandoffMode,
} from "../src/lib/taskWorkflowPresentation";
import type { TaskSubmission, TaskSubmissionWorkflow } from "../src/lib/taskLifecycleApi";

// Focused coverage for CASE-WORKSPACE-LEADAS-1: a clear green "Leadás" entry
// that hands off into the already-existing canonical submission workflow. It
// must reuse the canonical readiness/zeroTimeConfirmed semantics without
// duplicating them and without mutating task status.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const overview = () => read("src/components/cases/CaseWorkspaceOverview.tsx");
const handoff = () => read("src/components/cases/CaseSubmissionHandoff.tsx");
const timeDialog = () => read("src/components/cases/CaseTimeEntryDialog.tsx");
const submissionWorkspace = () => read("src/components/tasks/TaskSubmissionWorkspace.tsx");

function draftWith(overrides: Partial<TaskSubmission> = {}): TaskSubmission {
  return {
    id: "sub-1",
    taskId: "task-1",
    revisionNumber: 1,
    status: "DRAFT",
    createdBy: { id: "u1", displayName: "Kovács Anna", role: "LAWYER" },
    submittedBy: null,
    assignedReviewer: { id: "u2", displayName: "Nagy Péter", role: "LAWYER" },
    workSummary: null,
    remainingIssues: null,
    reviewerNote: null,
    requestedAttention: null,
    externalActionRequired: false,
    externalActionType: null,
    zeroTimeConfirmed: false,
    createdAt: "2026-09-20T09:00:00.000Z",
    updatedAt: "2026-09-20T09:00:00.000Z",
    submittedAt: null,
    returnedAt: null,
    approvedAt: null,
    supersededAt: null,
    externalCompletedAt: null,
    reviewDecision: null,
    documents: [],
    timeEntries: [],
    documentCount: 0,
    linkedTimeMinutes: 0,
    ...overrides,
  };
}

function workflowWith(overrides: Partial<TaskSubmissionWorkflow> = {}): TaskSubmissionWorkflow {
  const base: TaskSubmissionWorkflow = {
    task: {
      id: "task-1",
      title: "Feltöltés",
      description: null,
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      dueDate: null,
      caseId: "case-1",
      matterId: "matter-1",
      assignee: null,
      case: { id: "case-1", caseNumber: "U-1", title: "Ügy", client: { id: "c1", name: "Ügyfél" } },
    },
    activeDraft: null,
    submissions: [],
    latestSubmittedRevision: null,
    latestDecision: null,
    currentReviewer: null,
    readiness: null,
    permittedActions: {
      read: true,
      createDraft: true,
      editDraft: false,
      attachDocument: false,
      attachTimeEntry: false,
      assignReviewer: false,
      submit: false,
      reviewSubmitted: false,
      reviseReturned: false,
      recordExternalCompletion: false,
    },
    nextActionCode: "CONTINUE_SUBMISSION",
  };
  return { ...base, ...overrides };
}

describe("Case Workspace Leadás entry repair", () => {
  it("1. exposes a clear primary green 'Leadás' action", () => {
    const src = overview();
    assert.match(src, /variant="primary"[\s\S]{0,320}data-testid="task-submission-leadas"[\s\S]{0,40}>\s*Leadás\s*</);
    assert.doesNotMatch(src, /Leadás megnyitása/);
  });

  it("2. enters the canonical existing submission workflow (never a second one)", () => {
    const src = overview();
    assert.match(src, /<TaskSubmissionWorkspace item=\{selectedLifecycleTask\}/);
    assert.match(src, /setSelectedLifecycleTask\(item\)/);
    assert.match(handoff(), /onContinue/);
    // The handoff is a read-then-continue step; status changes happen only inside
    // the canonical workspace/backend.
    assert.doesNotMatch(handoff(), /submitTaskSubmissionForReview|approveTaskSubmission|returnTaskSubmission/);
  });

  it("3. does not directly mutate task status", () => {
    for (const src of [overview(), handoff()]) {
      assert.doesNotMatch(src, /Task\.status\s*=/);
      assert.doesNotMatch(src, /validateTaskTransition/);
      assert.doesNotMatch(src, /submitTask\(|completeTask\(/);
      assert.doesNotMatch(src, /approveTaskSubmission\(|returnTaskSubmission\(/);
    }
  });

  it("4. keeps using the existing TaskSubmissionWorkspace surface", () => {
    assert.match(overview(), /import \{ TaskSubmissionWorkspace \} from "@\/components\/tasks\/TaskSubmissionWorkspace"/);
    assert.match(overview(), /onWorkflowChanged=\{refresh\}/);
    assert.match(submissionWorkspace(), /Leadás piszkozat/);
    assert.match(submissionWorkspace(), /zeroTimeConfirmed/);
  });

  it("5. does not fabricate a missing-time warning when a recorded time exists", () => {
    const withTime = workflowWith({
      activeDraft: draftWith({ linkedTimeMinutes: 45 }),
      permittedActions: { ...workflowWith().permittedActions, editDraft: true },
      readiness: { ready: true, missingPrerequisites: [], blockingErrors: [], warnings: [] },
    });
    assert.equal(leadasHandoffMode(withTime), "CONTINUE" as LeadasHandoffMode);

    const withZeroConfirmed = workflowWith({
      activeDraft: draftWith({ zeroTimeConfirmed: true }),
      permittedActions: { ...workflowWith().permittedActions, editDraft: true },
      readiness: { ready: true, missingPrerequisites: [], blockingErrors: [], warnings: [] },
    });
    assert.equal(leadasHandoffMode(withZeroConfirmed), "CONTINUE" as LeadasHandoffMode);
  });

  it("6. offers canonical 'Munkaidő rögzítése' when no time exists", () => {
    const needsTime = workflowWith({
      activeDraft: draftWith(),
      permittedActions: { ...workflowWith().permittedActions, editDraft: true },
      readiness: { ready: false, missingPrerequisites: ["TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED"], blockingErrors: [], warnings: [] },
    });
    assert.equal(leadasHandoffMode(needsTime), "OFFER_TIME" as LeadasHandoffMode);
    const src = handoff();
    assert.match(src, /data-testid="case-submission-record-time"/);
    assert.match(src, />\s*Munkaidő rögzítése\s*</);
    assert.match(src, /onRecordTime/);
  });

  it("7. offers 'Kihagyás'", () => {
    const src = handoff();
    assert.match(src, /data-testid="case-submission-skip-time"/);
    assert.match(src, /data-testid="case-submission-skip-time"[\s\S]{0,160}Kihagyás/);
  });

  it("8. 'Kihagyás' uses the canonical zeroTimeConfirmed semantics", () => {
    const src = handoff();
    assert.match(src, /updateTaskSubmissionDraft\(item\.id, draft\.id, \{ zeroTimeConfirmed: true \}\)/);
    assert.match(src, /createTaskSubmissionDraft\(item\.id\)/);
    // No second boolean / frontend-only fake state.
    assert.doesNotMatch(src, /localStorage|sessionStorage|useState<boolean>.*skip/i);
  });

  it("9. missing time alone is not a permanent blocker for Leadás", () => {
    const needsTime = workflowWith({
      activeDraft: draftWith(),
      permittedActions: { ...workflowWith().permittedActions, editDraft: true },
      readiness: { ready: false, missingPrerequisites: ["TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED"], blockingErrors: [], warnings: [] },
    });
    assert.equal(leadasHandoffMode(needsTime), "OFFER_TIME" as LeadasHandoffMode);
    // OFFER_TIME still reaches the workspace through the skip path.
    assert.match(handoff(), /onContinue\(\);/);
    // Unknown workflow never traps the user.
    assert.equal(leadasHandoffMode(null), "CONTINUE" as LeadasHandoffMode);
  });

  it("10. preserves assignment/lifecycle authorization semantics", () => {
    const src = overview();
    assert.match(src, /listTaskLifecycleItems\(\)/);
    assert.match(src, /lifecycle\.filter\(\(task\) => task\.case\.id === caseId\)/);
    assert.match(src, /disabled=\{!lifecycleItem\}/);
    assert.doesNotMatch(handoff(), /isAdmin|hasPermission|authorize\(|requireRole|roleMatrix/i);
  });

  it("11. leaves the approve/return review workflow untouched", () => {
    const workspace = submissionWorkspace();
    assert.match(workspace, /submitTaskSubmissionForReview/);
    assert.match(workspace, /reviseTaskSubmission/);
    assert.match(workspace, /recordTaskExternalCompletion/);
    assert.doesNotMatch(handoff(), /reviewDecision|APPROVED|RETURNED/);
  });

  it("12. keeps the #384 primary notes tile present", () => {
    const src = overview();
    assert.match(src, /<CaseWorkspaceNotesSection/);
    assert.match(src, /data-testid="case-notes-primary"/);
    assert.match(src, /id="ck-notes-primary"/);
  });

  it("13. introduces no backend/schema/migration change", () => {
    const src = handoff();
    assert.doesNotMatch(src, /Backend\/|prisma|migration/i);
    assert.doesNotMatch(src, /fetchApi|fetch\(/);
    assert.doesNotMatch(src, /\/submissions\/.*\/submit/);
    // The time-entry reuse is an optional prop on the existing dialog only.
    assert.match(timeDialog(), /initialTaskId\?: string/);
  });
});
