import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveTaskSelection } from "../src/lib/taskDeepLinkSelection";

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

test("the task page binds the resolver to lifecycle data and reports unavailable targets generically", () => {
  const page = readFileSync(path.resolve(process.cwd(), "src/app/tasks/page.tsx"), "utf8");
  assert.match(page, /resolveTaskSelection\(deepLinkedTaskId, tasks, selectedTaskId, dismissedDeepLinkId\)/);
  assert.match(page, /selected=\{resolvedSelectedTaskId === task\.id\}/);
  assert.match(page, /listTaskLifecycleItems\(\)/);
  assert.match(page, /!isLoading && !error && deepLinkedTaskId && !tasks\.some/);
  assert.match(page, /nem található, vagy nincs jogosultsága/);
});
