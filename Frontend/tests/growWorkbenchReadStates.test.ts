import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readWorkbenchPanel, workbenchReadFailure, workbenchReadSucceeded, type WorkbenchReadState } from "../src/components/clients/growWorkbenchState";

const source = readFileSync(new URL("../src/components/clients/GrowWorkbench.tsx", import.meta.url), "utf8");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("successful empty is distinct from loading, unauthorized, unavailable and failed reads", async () => {
  for (const [reason, expected] of [
    [{ status: 401 }, "UNAUTHORIZED"], [{ status: 403 }, "UNAUTHORIZED"],
    [{ status: 404 }, "UNAVAILABLE"], [{ status: 503 }, "UNAVAILABLE"],
    [{ status: 0 }, "UNAVAILABLE"], [{ status: 500 }, "ERROR"], [new Error("broken"), "ERROR"],
  ] as const) {
    const states: WorkbenchReadState[] = [];
    let received = false;
    await readWorkbenchPanel(async () => { throw reason; }, () => true, () => true, () => { received = true; }, (state) => states.push(state));
    assert.deepEqual(states, ["LOADING", expected]);
    assert.equal(received, false, "failure must not substitute [] or null");
    assert.equal(workbenchReadFailure(reason), expected);
    assert.equal(workbenchReadSucceeded(expected), false);
  }
  for (const value of [[], ["real"]]) {
    const states: WorkbenchReadState[] = [];
    await readWorkbenchPanel(async () => value, (items) => !items.length, () => true, (items) => assert.equal(items, value), (state) => states.push(state));
    assert.deepEqual(states, ["LOADING", value.length ? "READY" : "EMPTY"]);
    assert.equal(workbenchReadSucceeded(states[1]), true);
  }
});

test("one rejected or pending panel does not suppress a successful sibling", async () => {
  const slow = deferred<string[]>();
  const states: Record<string, WorkbenchReadState> = {};
  const values: Record<string, string[]> = {};
  const run = (key: string, read: () => Promise<string[]>) => readWorkbenchPanel(read, (v) => !v.length, () => true, (v) => { values[key] = v; }, (s) => { states[key] = s; });
  const pending = run("slow", () => slow.promise);
  await Promise.all([run("good", async () => ["real"]), run("bad", async () => { throw { status: 500 }; })]);
  assert.deepEqual(states, { slow: "LOADING", good: "READY", bad: "ERROR" });
  assert.deepEqual(values, { good: ["real"] });
  slow.resolve([]);
  await pending;
  assert.equal(states.slow, "EMPTY");
});

test("late success and failure cannot update a new client or retry generation", async () => {
  for (const reject of [false, true]) {
    const request = deferred<string[]>();
    let generation = 1;
    const states: WorkbenchReadState[] = [];
    let receives = 0;
    const pending = readWorkbenchPanel(() => request.promise, (v) => !v.length, () => generation === 1, () => { receives++; }, (s) => states.push(s));
    generation = 2;
    if (reject) request.reject({ status: 403 }); else request.resolve(["old client"]);
    await pending;
    assert.equal(receives, 0);
    assert.deepEqual(states, ["LOADING"]);
  }
});

test("successful retry replaces error; successful null remains legitimate empty", async () => {
  const states: WorkbenchReadState[] = [];
  const receive = (value: null) => assert.equal(value, null);
  await readWorkbenchPanel<null>(async () => { throw new Error(); }, (v) => v === null, () => true, receive, (s) => states.push(s));
  await readWorkbenchPanel(async () => null, (v) => v === null, () => true, receive, (s) => states.push(s));
  assert.deepEqual(states, ["LOADING", "ERROR", "LOADING", "EMPTY"]);
});

test("workbench capability contract defaults closed and does not resolve its own role", () => {
  assert.match(source, /canManage = false/);
  assert.match(source, /canPublish = false/);
  assert.doesNotMatch(source, /getCurrentUser|\["ADMIN", "PARTNER", "LAWYER"\]/);
  assert.match(source, /canManage \? showControls \|\| isDeepLinkTarget/);
  assert.match(source, /if \(!canManage \|\| busy \|\| !isCurrent\(\)\) return/);
  assert.match(source, /canManage \? <GrowIntake/);
  assert.match(source, /canPublish \? <Link/);
});

test("failed panels cannot render false empty decisions or fabricated zero counters", () => {
  assert.doesNotMatch(source, /\.catch\(\(\) => (\(\{ items: \[\]|null|\[\])/);
  assert.match(source, /value: opportunitiesLoadFailed \? "—" : String\(pendingReview.length\)/);
  for (const key of ["diagnostics", "initiatives", "outcomes"]) {
    assert.match(source, new RegExp(`value: workbenchReadSucceeded\\(readStates\\.${key}\\)`));
  }
  assert.match(source, /<ReadPanel state=\{readState\} label="Döntések"[\s\S]*?data-testid="grow-decisions-pending"/);
  assert.match(source, /requestedOpportunityId && workbenchReadSucceeded\(readState\) && !opportunitiesLoadFailed && !requestedOpportunity/);
});

test("context invalidates local state and all three mutation response paths", () => {
  assert.match(source, /key=\{`\$\{props.clientId\}:\$\{Boolean\(props.canManage\)\}:\$\{Boolean\(props.canPublish\)\}`\}/);
  assert.match(source, /useLayoutEffect\(\(\) => \{\s+committed.current = scope/);
  assert.match(source, /committed.current = null/);
  assert.match(source, /await growApi.reviewOpportunity[^;]+;\s+if \(!isCurrent\(\)\) return;/);
  assert.match(source, /await growApi.recordOutcome[\s\S]*?if \(!isCurrent\(\)\) return;\s+setMessage/);
  assert.match(source, /await growApi.startInitiative[^;]+; if \(isCurrent\(\)\) onChanged\(\)/);
});

test("canonical Journey details retain identity and outcomes reuse signed comparison", () => {
  assert.match(source, /grow\?view=journey&destination=home/);
  assert.match(source, /grow\?view=journey&destination=detail&opportunity=\$\{encodeURIComponent\(item.id\)\}/);
  assert.match(source, /grow\?view=journey&destination=progress/);
  assert.match(source, /<GrowOutcomeComparison outcome=\{o\} \/>/);
  assert.match(source, /o.initiative\?\.id === i.id/);
});
