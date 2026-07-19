import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ApiError } from "../src/lib/api";
import { StableMutationAttempt, type TaskReviewQueueItem, type TaskSubmission } from "../src/lib/taskLifecycleApi";
import {
  ATTENTION_LABELS,
  READINESS_COMPLETED_LABELS,
  READINESS_LABELS,
  TASK_WORKFLOW_COLUMNS,
  isExternalApprovalPending,
  isReturnFormValid,
  isSubmissionReadOnly,
  isSubmissionReadyForUi,
  nextActorLabel,
  nextActionLabel,
  reviewUrgency,
  safeReviewProjectionKeys,
  sortReviewQueue,
  sortRevisionHistory,
  submissionDisabledReason,
  submissionStatusLabel,
  taskWorkflowErrorMessage,
} from "../src/lib/taskWorkflowPresentation";

function queueItem(overrides: Partial<TaskReviewQueueItem> = {}): TaskReviewQueueItem {
  return {
    id: "task-1",
    source: "TASK_SUBMISSION",
    taskId: "task-1",
    submissionId: "submission-1",
    revisionNumber: 1,
    title: "Szerződés ellenőrzése",
    status: "SUBMITTED",
    taskStatus: "IN_REVIEW",
    priority: "MEDIUM",
    dueDate: "2026-07-22T10:00:00.000Z",
    submittedAt: "2026-07-19T08:00:00.000Z",
    submittedBy: { id: "worker-1", displayName: "Munkatárs", role: "LAWYER" },
    assignedReviewer: { id: "reviewer-1", displayName: "Reviewer", role: "PARTNER" },
    requestedAttention: "APPROVAL",
    externalActionRequired: false,
    workSummaryPreview: "Elkészült a felülvizsgálat.",
    submissionDocumentCount: 1,
    linkedTimeMinutes: 60,
    nextActionCode: "OPEN_REVIEW",
    case: { id: "case-1", caseNumber: "CASE-1", title: "Ügy", clientName: "Ügyfél", matterType: "Szerződés" },
    ...overrides,
  };
}

function submission(overrides: Partial<TaskSubmission> = {}): TaskSubmission {
  const user = { id: "user-1", displayName: "Munkatárs", role: "LAWYER" };
  return {
    id: "submission-1",
    taskId: "task-1",
    revisionNumber: 1,
    status: "DRAFT",
    createdBy: user,
    submittedBy: null,
    assignedReviewer: { id: "reviewer-1", displayName: "Reviewer", role: "PARTNER" },
    workSummary: null,
    remainingIssues: null,
    reviewerNote: null,
    requestedAttention: null,
    externalActionRequired: false,
    externalActionType: null,
    zeroTimeConfirmed: false,
    createdAt: "2026-07-19T08:00:00.000Z",
    updatedAt: "2026-07-19T08:00:00.000Z",
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

test("task and Leadás columns are separate and the combined heading is absent", () => {
  assert.ok(TASK_WORKFLOW_COLUMNS.includes("Állapot"));
  assert.ok(TASK_WORKFLOW_COLUMNS.includes("Leadás"));
  assert.equal(TASK_WORKFLOW_COLUMNS.includes("Review / Leadás" as never), false);
  const source = readFileSync(path.resolve(process.cwd(), "src/app/tasks/page.tsx"), "utf8");
  assert.doesNotMatch(source, />Review \/ Leadás</);
});

test("every authoritative nextActionCode maps and unknown actions stay inert", () => {
  const codes = ["START_TASK", "OPEN_TASK", "CONTINUE_SUBMISSION", "VIEW_SUBMISSION", "OPEN_REVIEW", "CONTINUE_RETURNED_WORK", "RECORD_EXTERNAL_COMPLETION", "VIEW_COMPLETED"];
  for (const code of codes) assert.ok(nextActionLabel(code));
  assert.equal(nextActionLabel("DELETE_TASK"), null);
});

test("draft is editable only with backend permission and submitted revisions are read-only", () => {
  assert.equal(isSubmissionReadOnly("DRAFT", true), false);
  assert.equal(isSubmissionReadOnly("DRAFT", false), true);
  assert.equal(isSubmissionReadOnly("SUBMITTED", true), true);
  assert.equal(isSubmissionReadOnly("RETURNED", true), true);
});

test("readiness labels cover every backend code and submission gating respects dirty/eligibility state", () => {
  const required = ["WORK_SUMMARY_REQUIRED", "REVIEW_ATTENTION_REQUIRED", "REVIEWER_REQUIRED", "REVIEWER_INELIGIBLE", "SELF_REVIEW_NOT_ALLOWED", "OUTPUT_REQUIRED", "TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED", "TASK_STATE_NOT_SUBMITTABLE", "SUBMISSION_NOT_DRAFT", "DOCUMENT_SCOPE_INVALID", "TIME_ENTRY_SCOPE_INVALID"] as const;
  for (const code of required) assert.ok(READINESS_LABELS[code]);
  assert.equal(isSubmissionReadyForUi(true, false, true, true), true);
  assert.equal(isSubmissionReadyForUi(true, true, true, true), false);
  assert.equal(isSubmissionReadyForUi(true, false, false, true), false);
  assert.equal(isSubmissionReadyForUi(false, false, true, true), false);
  assert.equal(submissionDisabledReason(true, true, true, true, true), "Előbb mentse a piszkozatot.");
  assert.equal(submissionDisabledReason(true, false, true, false, true), "Válasszon jogosult reviewert.");
  assert.equal(submissionDisabledReason(true, false, false, false, true), null);
});

test("next actor follows backend nextActionCode without role-name authorization inference", () => {
  const base = {
    nextActionCode: "OPEN_REVIEW",
    currentReviewer: { id: "reviewer-1", displayName: "Reviewer", role: "PARTNER" },
    task: {
      id: "task-1",
      title: "Feladat",
      description: null,
      status: "IN_REVIEW",
      priority: "MEDIUM",
      dueDate: null,
      caseId: "case-1",
      matterId: "matter-1",
      assignee: { id: "worker-1", displayName: "Munkatárs", role: "LAWYER" },
      case: { id: "case-1", caseNumber: "CASE-1", title: "Ügy", client: { id: "client-1", name: "Ügyfél" } },
    },
  };
  assert.equal(nextActorLabel(base), "Reviewer");
  assert.equal(nextActorLabel({ ...base, nextActionCode: "CONTINUE_RETURNED_WORK" }), "Munkatárs");
  assert.equal(nextActorLabel({ ...base, nextActionCode: "VIEW_COMPLETED" }), "Nincs további teendő");
});

test("eligible reviewer list is backend-shaped and no submitter inference is needed", () => {
  const reviewers = [
    { id: "reviewer-1", displayName: "Reviewer", role: "PARTNER", preference: "CASE_RESPONSIBLE_LAWYER" as const },
  ];
  assert.deepEqual(reviewers.map((reviewer) => reviewer.id), ["reviewer-1"]);
  assert.equal(reviewers.some((reviewer) => reviewer.id === "worker-1"), false);
});

test("document, time and zero-time presentation uses persisted fields", () => {
  const linked = submission({ documentCount: 2, linkedTimeMinutes: 95 });
  assert.equal(linked.documentCount, 2);
  assert.equal(linked.linkedTimeMinutes, 95);
  assert.equal(linked.zeroTimeConfirmed, false);
  const zero = submission({ zeroTimeConfirmed: true, linkedTimeMinutes: 0 });
  assert.equal(zero.zeroTimeConfirmed, true);
  assert.equal(zero.linkedTimeMinutes, 0);
});

test("one mutation attempt keeps its key until completed and deliberate next action gets a new key", () => {
  const attempt = new StableMutationAttempt("submit");
  const first = attempt.begin();
  assert.equal(attempt.key(), first);
  assert.equal(attempt.key(), first);
  attempt.complete();
  const second = attempt.key();
  assert.notEqual(second, first);
});

test("review attention remains distinct from deadline urgency", () => {
  const item = queueItem({ requestedAttention: "SIGNATURE", dueDate: "2026-07-18T10:00:00.000Z" });
  assert.equal(ATTENTION_LABELS[item.requestedAttention || ""], "Aláírás");
  assert.equal(reviewUrgency(item, new Date("2026-07-19T08:00:00.000Z")), "CRITICAL");
});

test("review queue sorting is critical deadline, earliest deadline, then oldest submission", () => {
  const ordered = sortReviewQueue([
    queueItem({ taskId: "later", submissionId: "later", dueDate: "2026-07-25T10:00:00.000Z" }),
    queueItem({ taskId: "old", submissionId: "old", dueDate: "2026-07-18T10:00:00.000Z", submittedAt: "2026-07-18T08:00:00.000Z" }),
    queueItem({ taskId: "new", submissionId: "new", dueDate: "2026-07-18T10:00:00.000Z", submittedAt: "2026-07-19T08:00:00.000Z" }),
  ], new Date("2026-07-19T08:00:00.000Z"));
  assert.deepEqual(ordered.map((item) => item.taskId), ["old", "new", "later"]);
});

test("review detail projection excludes raw body, paths and provider payload keys", () => {
  const keys = safeReviewProjectionKeys();
  for (const forbidden of ["body", "workspaceText", "storagePath", "providerPayload"]) assert.equal(keys.includes(forbidden), false);
  assert.ok(keys.includes("reviewVersion"));
  assert.ok(keys.includes("permittedActions"));
});

test("return needs both note and corrections", () => {
  assert.equal(isReturnFormValid("Megjegyzés", "Javítsa a dátumot"), true);
  assert.equal(isReturnFormValid("", "Javítás"), false);
  assert.equal(isReturnFormValid("Megjegyzés", " "), false);
});

test("external approval remains pending until explicit completion", () => {
  assert.equal(isExternalApprovalPending(submission({ status: "APPROVED", externalActionRequired: true, externalCompletedAt: null })), true);
  assert.equal(isExternalApprovalPending(submission({ status: "APPROVED", externalActionRequired: true, externalCompletedAt: "2026-07-19T10:00:00.000Z" })), false);
  assert.equal(isExternalApprovalPending(submission({ status: "APPROVED", externalActionRequired: false })), false);
});

test("revision history is newest-first and returned revision stays explicitly labeled", () => {
  const revisions = sortRevisionHistory([submission({ id: "v1", revisionNumber: 1, status: "RETURNED" }), submission({ id: "v2", revisionNumber: 2, status: "DRAFT" })]);
  assert.deepEqual(revisions.map((revision) => revision.revisionNumber), [2, 1]);
  assert.equal(submissionStatusLabel(revisions[1].status, revisions[1].revisionNumber), "Visszaküldve · 1. verzió");
});

test("known backend errors are localized and raw backend text is not rendered", () => {
  const error = new ApiError(409, "raw prisma conflict", "/tasks/x", "REVIEW_ALREADY_DECIDED");
  assert.equal(taskWorkflowErrorMessage(error), "Erről a Leadásról már döntés született.");
  assert.doesNotMatch(taskWorkflowErrorMessage(error), /prisma/i);
});

test("completed readiness labels describe fulfilled prerequisites", () => {
  assert.equal(READINESS_COMPLETED_LABELS.WORK_SUMMARY_REQUIRED, "Az elvégzett munka összefoglalása megadva.");
  assert.equal(READINESS_COMPLETED_LABELS.TASK_STATE_NOT_SUBMITTABLE, "A feladat jelenlegi állapotában leadható.");
});
