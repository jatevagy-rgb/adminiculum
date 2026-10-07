import { test } from "node:test";
import assert from "node:assert/strict";
import { createRaceHarness, deferred, settle } from "./helpers/asyncRaceHarness";
import { taskLifecycleItemFromWorkflow } from "../src/lib/taskDeepLinkSelection";

function makeWorkflow(id: string, title: string) {
  return {
    task: {
      id,
      title,
      description: null,
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      dueDate: null,
      caseId: `case-${id}`,
      matterId: null,
      assignee: null,
      case: { id: `case-${id}`, caseNumber: `C-${id}`, title, client: { id: "client-1", name: "Ügyfél" } },
    },
    activeDraft: null,
    submissions: [],
    latestSubmittedRevision: null,
    latestDecision: null,
    currentReviewer: null,
    responsibleLawyerFlow: false,
    responsibleLawyer: null,
    readiness: null,
    permittedActions: {
      read: true,
      createDraft: false,
      editDraft: false,
      attachDocument: false,
      attachTimeEntry: false,
      assignReviewer: false,
      submit: false,
      reviewSubmitted: false,
      reviseReturned: false,
      recordExternalCompletion: false,
    },
    nextActionCode: "OPEN_TASK",
  };
}

function makeHarness() {
  const pending: Record<string, ReturnType<typeof deferred>> = {};
  const calls: string[] = [];
  const readTaskSubmissionWorkflow = (taskId: string) => {
    calls.push(taskId);
    pending[taskId] = pending[taskId] || deferred();
    return pending[taskId].promise;
  };
  const h = createRaceHarness("src/lib/useTaskDeepLink.ts", "useTaskDeepLink", {
    "./taskLifecycleApi": { readTaskSubmissionWorkflow },
    "./taskDeepLinkSelection": { taskLifecycleItemFromWorkflow },
  });
  return { h, pending, calls };
}

test("authorized non-list task resolves through the guarded workflow reader", async () => {
  const { h, pending, calls } = makeHarness();

  let state = h.render({ deepLinkedTaskId: "X", tasks: [], isLoading: false });
  h.effects();
  assert.deepEqual(calls, ["X"], "guarded read issued for the non-list target");

  pending["X"].resolve(makeWorkflow("X", "X cím"));
  await settle();
  state = h.render({ deepLinkedTaskId: "X", tasks: [], isLoading: false });
  assert.equal(state.deepLinkState, "resolved");
  assert.equal(state.deepLinkedItem.id, "X");
  assert.equal(state.deepLinkedItem.title, "X cím");
});

test("a safe not-found/deny result surfaces unavailable and never substitutes another task", async () => {
  const { h, pending } = makeHarness();

  let state = h.render({ deepLinkedTaskId: "DENIED", tasks: [], isLoading: false });
  h.effects();

  pending["DENIED"].reject(new Error("404 TASK_NOT_FOUND"));
  await settle();
  state = h.render({ deepLinkedTaskId: "DENIED", tasks: [], isLoading: false });
  assert.equal(state.deepLinkState, "unavailable");
  assert.equal(state.deepLinkedItem, null);
});

test("an id already present in the personal list stays list-authoritative and does not trigger the guarded read", async () => {
  const { h, calls } = makeHarness();

  const inList = [{ id: "A", title: "A", status: "PENDING", priority: "MEDIUM", nextActionCode: "START_TASK", case: { id: "c", caseNumber: "C", clientName: "Ügyfél", matterType: "" } }];
  const state = h.render({ deepLinkedTaskId: "A", tasks: inList, isLoading: false });
  h.effects();
  assert.equal(state.deepLinkState, "idle");
  assert.equal(state.deepLinkedItem, null);
  assert.deepEqual(calls, [], "guarded read must not be issued when the id is already in the personal list");
});

test("late response for task A cannot replace newly requested task B", async () => {
  const { h, pending } = makeHarness();

  h.render({ deepLinkedTaskId: "A", tasks: [], isLoading: false });
  h.effects();

  h.render({ deepLinkedTaskId: "B", tasks: [], isLoading: false });
  h.effects();

  pending["B"].resolve(makeWorkflow("B", "B cím"));
  await settle();
  let state = h.render({ deepLinkedTaskId: "B", tasks: [], isLoading: false });
  assert.equal(state.deepLinkedItem.id, "B");
  assert.equal(state.deepLinkState, "resolved");

  pending["A"].resolve(makeWorkflow("A", "A cím"));
  await settle();
  state = h.render({ deepLinkedTaskId: "B", tasks: [], isLoading: false });
  assert.equal(state.deepLinkedItem.id, "B", "stale A response must not overwrite B");
  assert.equal(state.deepLinkState, "resolved");
});

test("no URL target preserves manual selection without any guarded read", async () => {
  const { h, calls } = makeHarness();

  const state = h.render({ deepLinkedTaskId: null, tasks: [], isLoading: false });
  h.effects();
  assert.equal(state.deepLinkState, "idle");
  assert.equal(state.deepLinkedItem, null);
  assert.deepEqual(calls, []);
});

test("clearing the URL and unmounting invalidate late guarded reads", async () => {
  for (const action of ["clear", "unmount"]) {
    const { h, pending } = makeHarness();
    h.commit({ deepLinkedTaskId: "A", tasks: [], isLoading: false });
    if (action === "clear") h.commit({ deepLinkedTaskId: null, tasks: [], isLoading: false });
    else h.unmount();
    pending.A.resolve(makeWorkflow("A", "stale A"));
    await settle();
    const state = h.render({ deepLinkedTaskId: action === "clear" ? null : "A", tasks: [], isLoading: false });
    assert.equal(state.deepLinkedItem, null);
  }
});
