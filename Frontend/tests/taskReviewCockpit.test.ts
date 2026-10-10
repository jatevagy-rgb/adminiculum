import assert from "node:assert/strict";
import test from "node:test";
import { submittedOutputHref, submissionReviewHref, reviewTimeState } from "../src/lib/taskReviewCockpit";
import { reviewFixture, workflowFixture } from "./fixtures/taskReviewCockpit.fixture";
import { createRaceHarness, deferred, settle } from "./helpers/asyncRaceHarness";

test("output links retain exact submitted identity even when a newer version exists", () => {
  const review = reviewFixture();
  assert.equal(submittedOutputHref(review.case.id, review.outputs[0]), "/cases/case-1/documents?documentId=document-1&versionId=version-2");
  assert.equal(submittedOutputHref(review.case.id, review.outputs[1]), null);
});
test("historical review navigation includes both IDs and the canonical view", () => {
  const url = new URL(submissionReviewHref("task /?", "submission &"), "https://test.invalid");
  assert.equal(url.pathname, "/tasks");
  assert.equal(url.searchParams.get("taskId"), "task /?");
  assert.equal(url.searchParams.get("submissionId"), "submission &");
  assert.equal(url.searchParams.get("view"), "review");
});
test("missing time is unknown, not zero", () => {
  assert.deepEqual(reviewTimeState(reviewFixture()), { state: "MISSING", minutes: null, label: "A munkaidő nincs rögzítve" });
});
test("confirmed zero requires explicit submission confirmation", () => {
  const review = reviewFixture(); review.submission.zeroTimeConfirmed = true;
  assert.equal(reviewTimeState(review).state, "CONFIRMED_ZERO");
  assert.equal(reviewTimeState(review).minutes, 0);
});
test("recorded time takes precedence over a legacy zero flag", () => {
  const review = reviewFixture(); review.submission.zeroTimeConfirmed = true;
  review.time.entries.push({ id: "link", timeEntryId: "time", workType: "REVIEW", minutes: 25, billable: false, workDate: "2026-10-08" });
  review.time.totalMinutes = 25;
  assert.equal(reviewTimeState(review).state, "RECORDED");
  assert.equal(reviewTimeState(review).minutes, 25);
});

function harness(api: Record<string, unknown>) {
  class Attempt { begin() {} complete() {} key() { return "attempt"; } }
  return createRaceHarness("src/components/tasks/TaskReviewWorkspace.tsx", "TaskReviewWorkspace", {
    "@/lib/taskLifecycleApi": { StableMutationAttempt: Attempt, readTaskSubmissionWorkflow: async () => workflowFixture(), ...api },
    "@/lib/taskWorkflowPresentation": { EXTERNAL_ACTION_LABELS: {}, taskWorkflowErrorMessage: (e: Error) => e.message },
    "@/lib/taskReviewCockpit": { reviewTimeState },
    "@/components/tasks/TaskReviewCockpitContent": { TaskReviewCockpitContent: "cockpit" },
    "@/components/adminiculum/ui": { AdminButton: "button" },
    "@/components/adminiculum/OperationalPrimitives": { CompactState: "state", SafePanelError: "error" },
    "@/components/tasks/WorkflowDialog": { WorkflowDialog: "dialog" },
    "@/components/clients/ClientAccent": { ClientAccent: "accent" },
  });
}
const props = (taskId = "task-1", submissionId = "submission-1") => ({ item: { taskId, submissionId }, onClose() {}, onQueueChanged() {} });
function find(tree: any, type: string): any {
  if (!tree || typeof tree !== "object") return null;
  if (tree.type === type) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
  return null;
}

test("late response for an old exact identity cannot replace the current cockpit", async () => {
  const old = deferred();
  const newer = reviewFixture(); newer.task.id = "task-2"; newer.submission.id = "submission-2";
  const h = harness({ readTaskSubmissionReview: (id: string) => id === "task-1" ? old.promise : Promise.resolve(newer) });
  h.commit(props()); await settle();
  h.commit(props("task-2", "submission-2")); await settle();
  assert.equal(find(h.render(props("task-2", "submission-2")), "cockpit").props.review.submission.id, "submission-2");
  old.resolve(reviewFixture()); await settle();
  assert.equal(find(h.render(props("task-2", "submission-2")), "cockpit").props.review.submission.id, "submission-2");
});
test("failed optional instruction read retains authorized review with unavailable context", async () => {
  const h = harness({ readTaskSubmissionReview: async () => reviewFixture(), readTaskSubmissionWorkflow: async () => { throw new Error("forbidden context"); } });
  h.commit(props()); await settle();
  const cockpit = find(h.render(props()), "cockpit");
  assert.equal(cockpit.props.review.submission.id, "submission-1");
  assert.equal(cockpit.props.workflow, null);
});
test("failed review read never renders empty review facts or decisions", async () => {
  const h = harness({ readTaskSubmissionReview: async () => { throw new Error("forbidden review"); } });
  h.commit(props()); await settle();
  assert.equal(find(h.render(props()), "cockpit"), null);
  assert.ok(find(h.render(props()), "error"));
});
test("read-only permission projection exposes no decision controls", async () => {
  const review = reviewFixture(); review.permittedActions.approve = false; review.permittedActions.return = false;
  const h = harness({ readTaskSubmissionReview: async () => review });
  h.commit(props()); await settle();
  assert.equal(find(h.render(props()), "cockpit").props.actions, null);
});
