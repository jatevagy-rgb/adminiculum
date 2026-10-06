import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveTaskSelection, taskLifecycleItemFromWorkflow } from "../src/lib/taskDeepLinkSelection";
import type { TaskSubmissionWorkflow } from "../src/lib/taskLifecycleApi";

const tasks = [
  { id: "A", status: "PENDING" },
  { id: "B", status: "IN_PROGRESS" },
  { id: "completed", status: "DONE" },
];

test("direct load and refresh resolve the exact requested task", () => {
  assert.equal(resolveTaskSelection("A", tasks, null), "A");
  assert.equal(resolveTaskSelection("A", tasks, null), "A");
});

test("same-route navigation resolves B instead of the previous A selection", () => {
  assert.equal(resolveTaskSelection("B", tasks, "A"), "B");
});

test("a stale target clears the previous selection without substituting another task", () => {
  assert.equal(resolveTaskSelection("stale-X", tasks, "A"), null);
});

test("Back and Forward resolve each URL identity exactly", () => {
  assert.equal(resolveTaskSelection("B", tasks, "A"), "B");
  assert.equal(resolveTaskSelection("A", tasks, "B"), "A");
  assert.equal(resolveTaskSelection("B", tasks, "A"), "B");
});

test("a valid task resolves even when the visible filter excludes it", () => {
  const visibleTasks = tasks.filter((task) => task.status !== "DONE");
  assert.equal(visibleTasks.some((task) => task.id === "completed"), false);
  assert.equal(resolveTaskSelection("completed", tasks, null), "completed");
});

test("completed tasks remain resolvable by exact ID", () => {
  assert.equal(resolveTaskSelection("completed", tasks, null), "completed");
});

test("an unavailable or unauthorized ID does not select accessible task data", () => {
  assert.equal(resolveTaskSelection("unauthorized", tasks, "A"), null);
});

test("no URL target preserves manual selection and closing a deep link dismisses only that target", () => {
  assert.equal(resolveTaskSelection(null, tasks, "A"), "A");
  assert.equal(resolveTaskSelection("A", tasks, "B", "A"), null);
  assert.equal(resolveTaskSelection("B", tasks, "A", "A"), "B");
});

const workflow: TaskSubmissionWorkflow = {
  task: {
    id: "task-1",
    title: "Leadás feladat",
    description: "Leírás",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    dueDate: "2026-10-07T00:00:00.000Z",
    caseId: "case-1",
    matterId: "matter-1",
    assignee: { id: "user-1", displayName: "Worker", role: "LAWYER" },
    case: {
      id: "case-1",
      caseNumber: "C-001",
      title: "Ügy",
      client: { id: "client-1", name: "Ügyfél" },
    },
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

test("maps the guarded workflow read onto the canonical workspace item without widening the list", () => {
  const item = taskLifecycleItemFromWorkflow(workflow);
  assert.equal(item.id, "task-1");
  assert.equal(item.title, "Leadás feladat");
  assert.equal(item.status, "IN_PROGRESS");
  assert.equal(item.priority, "MEDIUM");
  assert.equal(item.dueDate, "2026-10-07T00:00:00.000Z");
  assert.equal(item.matterId, "matter-1");
  assert.equal(item.assignedToId, "user-1");
  assert.equal(item.case.id, "case-1");
  assert.equal(item.case.caseNumber, "C-001");
  assert.equal(item.case.clientName, "Ügyfél");
  assert.equal(item.case.clientId, "client-1");
  assert.equal(item.nextActionCode, "OPEN_TASK");
});

test("maps exact task identity with no source-title substitution", () => {
  const item = taskLifecycleItemFromWorkflow(workflow);
  assert.equal(item.id, workflow.task.id);
  assert.equal(item.title, workflow.task.title);
  assert.equal(item.case.caseNumber, workflow.task.case.caseNumber);
});

test("the task page binds the resolver to lifecycle data and reports unavailable targets generically", () => {
  const page = readFileSync(path.resolve(process.cwd(), "src/app/tasks/page.tsx"), "utf8");
  assert.match(page, /resolveTaskSelection\(deepLinkedTaskId, effectiveTasks, selectedTaskId, dismissedDeepLinkId\)/);
  assert.match(page, /selected=\{resolvedSelectedTaskId === task\.id\}/);
  assert.match(page, /listTaskLifecycleItems\(\)/);
  assert.match(page, /useTaskDeepLink\(\{ deepLinkedTaskId, tasks, isLoading \}\)/);
  assert.match(page, /!isLoading && !error && deepLinkedTaskId && !tasks\.some/);
  assert.match(page, /deepLinkState === "unavailable"/);
  assert.match(page, /nem található, vagy nincs jogosultsága/);
});
