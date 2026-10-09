import assert from "node:assert/strict";
import test from "node:test";
import { createRaceHarness, deferred, flatten, settle, textOf } from "./helpers/asyncRaceHarness";
import * as presentation from "../src/lib/agendaPresentation";
import * as reviewPresentation from "../src/lib/reviewQueuePresentation";
import * as businessTime from "../src/lib/businessDateTime";
import * as workflow from "../src/lib/taskWorkflowPresentation";
import { renderToStaticMarkup } from "react-dom/server";

const primitives = { Alert: "aside", Badge: "span", Button: "button", PageHeader: "header", QuietLink: "a" };
const response = (title: string, hasMore = false, offset = 0) => ({
  scope: "MY_WORK", timezone: "Europe/Budapest", generatedAt: new Date().toISOString(),
  range: { from: "2026-10-09", to: "2026-10-23" },
  summary: { overdue: 0, today: 1, tomorrow: 0, thisWeek: 0, later: 0, completedRecently: 0 },
  days: [{ date: "2026-10-09", items: [{
    id: title, title, sourceType: "TASK", sourceId: title, dueAt: "2026-10-09T14:00:00Z", allDay: false, status: "OPEN", caseId: "case-a",
    source: { type: "TASK", id: title }, responsibility: {}, capabilities: { canOpen: true }, href: `/tasks?taskId=${title}`,
  }] }], pagination: { limit: 100, offset, hasMore },
});

function workspaceHarness(getAgenda: (...args: any[]) => any, getTasks = () => Promise.resolve([])) {
  return createRaceHarness("src/components/agenda/AgendaWorkspace.tsx", "AgendaWorkspace", {
    "@/components/ui": primitives,
    "@/lib/api": { getWorkflowAgenda: getAgenda, getMyTasks: getTasks },
    "@/lib/agendaPresentation": presentation, "@/lib/businessDateTime": businessTime,
  });
}

test("agenda preserves the successful source when another source fails and retries without fake empty success", async () => {
  let failure = true;
  const h = workspaceHarness((params: any) => params.queue === "OVERDUE" && failure ? Promise.reject(new Error("denied")) : Promise.resolve(response(params.queue)));
  try {
    h.commit(); await settle();
    let tree = h.render();
    assert.match(textOf(tree), /CALENDAR/);
    assert.match(textOf(tree), /hiányzó adatok nem jelentenek üres listát/);
    failure = false;
    // Alert action is a named prop, not part of the children traversal.
    const alert = flatten(tree).find((node) => node.type === "aside");
    assert.ok(alert);
    alert.props.action.props.onClick();
    await settle();
    tree = h.render();
    assert.match(textOf(tree), /OVERDUE/);
    assert.equal(flatten(tree).some((node) => node.type === "aside"), false);
  } finally { h.unmount(); }
});

test("Home orders real attention before navigation and preserves exact review identity", () => {
  const h = createRaceHarness("src/components/agenda/HomeAttention.tsx", "HomeAttention", {
    "@/components/ui": primitives, "@/lib/agendaPresentation": presentation,
    "@/lib/reviewQueuePresentation": reviewPresentation, "@/lib/businessDateTime": businessTime,
  });
  const tree = h.render({
    agenda: response("today"), overdue: response("old"), loading: false, tasks: [], now: new Date("2026-10-09T10:00:00Z"),
    reviews: [{ id: "q", taskId: "task-q", submissionId: "submission-q", title: "Exact decision", source: "TASK_SUBMISSION", status: "SUBMITTED", priority: "MEDIUM", readOnly: true, case: { caseNumber: "QA" } }],
    operational: { items: [], resume: { item: null } },
  });
  const html = renderToStaticMarkup(tree);
  const labels = ["Sürgős", "Döntések", "Elakadások és várakozás", "Munka folytatása"];
  assert.deepEqual(labels.map((label) => html.indexOf(label)).sort((a, b) => a - b), labels.map((label) => html.indexOf(label)));
  assert.match(html, /taskId=task-q&amp;submissionId=submission-q&amp;view=review/);
  assert.match(html, /Csak megtekintés/);
  assert.doesNotMatch(html, /Jóváhagyás|Visszaküldés/);
});

test("Home missing sources remain unavailable rather than empty or zero", () => {
  const h = createRaceHarness("src/components/agenda/HomeAttention.tsx", "HomeAttention", {
    "@/components/ui": primitives, "@/lib/agendaPresentation": presentation,
    "@/lib/reviewQueuePresentation": reviewPresentation, "@/lib/businessDateTime": businessTime,
  });
  const html = renderToStaticMarkup(h.render({ agenda: null, overdue: null, loading: false, reviews: null, tasks: null, operational: null }));
  assert.equal((html.match(/Ez nem jelent üres munkasort/g) || []).length, 4);
  assert.doesNotMatch(html, /Nincs ilyen tétel/);
});

test("a late response from own work cannot replace the next authorized scope", async () => {
  const oldCalendar = deferred();
  const oldOverdue = deferred();
  const h = workspaceHarness((params: any) => params.scope === "MY_WORK" ? (params.queue === "CALENDAR" ? oldCalendar.promise : oldOverdue.promise) : Promise.resolve(response("scope-b")));
  try {
    h.commit();
    const scope = flatten(h.render()).find((node) => node.type === "select" && node.props.value === "MY_WORK");
    scope.props.onChange({ target: { value: "MY_CASES" } });
    h.commit(); await settle();
    assert.match(textOf(h.render()), /scope-b/);
    oldCalendar.resolve(response("private-old-a")); oldOverdue.resolve(response("private-old-a"));
    await settle();
    assert.doesNotMatch(textOf(h.render()), /private-old-a/);
    assert.match(textOf(h.render()), /scope-b/);
  } finally { h.unmount(); }
});

test("pagination appends the canonical next offset and preserves distinct source rows", async () => {
  const calls: any[] = [];
  const h = workspaceHarness((params: any) => {
    calls.push(params);
    return Promise.resolve(response(params.offset ? "page-two" : "page-one", !params.offset && params.queue === "CALENDAR", params.offset || 0));
  });
  try {
    h.commit(); await settle();
    const more = flatten(h.render()).find((node) => node.props.children === "További dátumos tételek");
    more.props.onClick(); await settle();
    assert.equal(calls.at(-1).offset, 100);
    assert.equal(calls.at(-1).from, "2026-10-09");
    assert.match(textOf(h.render()), /page-one/);
    assert.match(textOf(h.render()), /page-two/);
    assert.equal(flatten(h.render()).some((node) => node.props.children === "További dátumos tételek"), false);
  } finally { h.unmount(); }
});

test("a denied scope clears prior rows and never keeps revoked content as stale success", async () => {
  let denied = false;
  const h = workspaceHarness(() => denied ? Promise.reject(new Error("403")) : Promise.resolve(response("allowed-before")));
  try {
    h.commit(); await settle();
    assert.match(textOf(h.render()), /allowed-before/);
    denied = true;
    flatten(h.render()).find((node) => node.type === "select" && node.props.value === "MY_WORK").props.onChange({ target: { value: "MY_CASES" } });
    h.commit(); await settle();
    assert.doesNotMatch(textOf(h.render()), /allowed-before/);
    assert.match(textOf(h.render()), /hiányzó adatok/);
  } finally { h.unmount(); }
});

test("source canOpen false renders no source action, and completed rows stay out", async () => {
  const data = response("no-open");
  data.days[0].items[0].capabilities.canOpen = false;
  const h = workspaceHarness(() => Promise.resolve(data));
  try {
    h.commit(); await settle();
    assert.match(textOf(h.render()), /Megnyitás nem elérhető/);
    assert.equal(flatten(h.render()).some((node) => node.props.href === "/tasks?taskId=no-open"), false);
  } finally { h.unmount(); }
});

test("review queue links the exact submission while retaining read-only preview and denies stale route results", async () => {
  let search = new URLSearchParams("taskId=a&submissionId=sa");
  const old = deferred();
  let calls = 0;
  const item = (id: string) => ({ id, taskId: id, submissionId: `s${id}`, source: "TASK_SUBMISSION", title: `Review ${id}`, status: "SUBMITTED", priority: "MEDIUM", readOnly: true, actionable: false, nextActionCode: "OPEN_REVIEW", case: { id: "case-a", caseNumber: "A", clientName: "Client", matterType: "OTHER" } });
  const h = createRaceHarness("src/app/reviews/page.tsx", "ReviewsPageContent", {
    "next/navigation": { useSearchParams: () => search },
    "@/components/ui": primitives,
    "@/components/adminiculum/OperationalPrimitives": { CompactState: "div" },
    "@/components/adminiculum/ui": { AdminButton: "button" },
    "@/components/clients/ClientAccent": { ClientAccent: "span" },
    "@/components/tasks/TaskReviewWorkspace": { TaskReviewWorkspace: "preview" },
    "@/lib/taskLifecycleApi": { listTaskReviewQueue: () => ++calls === 1 ? old.promise : Promise.resolve([item("b")]) },
    "@/lib/taskWorkflowPresentation": workflow,
    "@/lib/reviewQueuePresentation": reviewPresentation,
  });
  try {
    h.commit();
    search = new URLSearchParams("taskId=b&submissionId=sb");
    h.commit(); await settle();
    old.resolve([item("a")]); await settle();
    const tree = h.render();
    assert.doesNotMatch(textOf(tree), /Review a/);
    assert.match(textOf(tree), /Csak megtekintés/);
    assert.ok(flatten(tree).some((node) => node.props.href === "/tasks?taskId=b&submissionId=sb&view=review"));
    assert.equal(flatten(tree).find((node) => node.type === "preview")?.props.item.submissionId, "sb");
    assert.doesNotMatch(textOf(tree), /0 perc/);
  } finally { h.unmount(); }
});
