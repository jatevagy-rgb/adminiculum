import assert from "node:assert/strict";
import test from "node:test";
import { agendaBucket, agendaRows, appendAgendaPage, undatedTasks } from "../src/lib/agendaPresentation";
import { decisionOrderReason, decisionUrgency, exactReviewHref, orderDecisionQueue, reviewQueueTimeLabel } from "../src/lib/reviewQueuePresentation";
import type { TaskItem, WorkflowAgendaResponse, WorkflowDeadlineItem } from "../src/lib/api";
import type { TaskReviewQueueItem } from "../src/lib/taskLifecycleApi";

const now = new Date("2026-10-09T10:00:00Z");
export function deadline(id: string, changes: Partial<WorkflowDeadlineItem> = {}): WorkflowDeadlineItem {
  return {
    id, sourceType: "TASK", sourceId: id, caseId: "case-a", title: id, dueAt: "2026-10-09T14:00:00Z",
    allDay: false, temporalType: "TIMESTAMP", status: "OPEN", urgency: "TODAY", importance: "NORMAL", legalSignificance: null,
    responsibility: {}, source: { type: "TASK", id },
    capabilities: { canOpen: true, canComplete: false, canReopen: false, canReschedule: false, canCancel: false, canCreateTask: false },
    href: `/tasks?taskId=${id}`, ...changes,
  };
}
export function agenda(items: WorkflowDeadlineItem[], changes: Partial<WorkflowAgendaResponse> = {}): WorkflowAgendaResponse {
  return {
    generatedAt: now.toISOString(), timezone: "Europe/Budapest", range: { from: "2026-10-09", to: "2026-10-23" }, scope: "MY_WORK",
    summary: { overdue: 0, today: items.length, tomorrow: 0, thisWeek: 0, later: 0, completedRecently: 0 },
    days: [{ date: "2026-10-09", items }], pagination: { offset: 0, limit: 100, hasMore: false },
    availability: { taskDueDates: true, caseDeadlines: true, hearings: false, reminders: false, teamScope: false, externalCalendar: false },
    ...changes,
  };
}
function review(id: string, changes: Partial<TaskReviewQueueItem> = {}): TaskReviewQueueItem {
  return { id, source: "TASK_SUBMISSION", taskId: id, submissionId: `submission-${id}`, title: id, status: "SUBMITTED", priority: "MEDIUM", nextActionCode: "OPEN_REVIEW", case: { id: "case-a", caseNumber: "A", clientName: "Client A", matterType: "OTHER" }, ...changes };
}

test("missing and malformed dates never become Today", () => {
  for (const value of [null, undefined, "", "bad-date"]) assert.equal(agendaBucket(value, "TIMESTAMP", now), "NO_RECORDED_DEADLINE");
  assert.equal(agendaBucket("2026-02-30", "DATE_ONLY", now), "NO_RECORDED_DEADLINE");
});
test("timed deadlines compare the instant, including today and exactly now", () => {
  assert.equal(agendaBucket("2026-10-09T09:59:59Z", "TIMESTAMP", now), "OVERDUE");
  assert.equal(agendaBucket(now.toISOString(), "TIMESTAMP", now), "TODAY");
  assert.equal(agendaBucket("2026-10-09T14:00:00Z", "TIMESTAMP", now), "TODAY");
});
test("civil dates stay today through Budapest midnight", () => {
  assert.equal(agendaBucket("2026-10-09", "DATE_ONLY", new Date("2026-10-09T21:59:59Z")), "TODAY");
  assert.equal(agendaBucket("2026-10-09", "DATE_ONLY", new Date("2026-10-09T22:00:00Z")), "OVERDUE");
  assert.equal(agendaBucket("2026-10-09T00:00:00Z", "DATE_ONLY", now), "TODAY");
});
test("next seven days is inclusive, later remains separate", () => {
  assert.equal(agendaBucket("2026-10-10", "DATE_ONLY", now), "NEXT_7_DAYS");
  assert.equal(agendaBucket("2026-10-16", "DATE_ONLY", now), "NEXT_7_DAYS");
  assert.equal(agendaBucket("2026-10-17", "DATE_ONLY", now), "LATER");
});
test("Budapest DST spring forward does not shorten seven civil days", () => {
  assert.equal(agendaBucket("2026-04-04", "DATE_ONLY", new Date("2026-03-28T12:00:00Z")), "NEXT_7_DAYS");
  assert.equal(agendaBucket("2026-04-05", "DATE_ONLY", new Date("2026-03-28T12:00:00Z")), "LATER");
});
test("Budapest DST fall back and leap day classify without host timezone", () => {
  assert.equal(agendaBucket("2026-10-31", "DATE_ONLY", new Date("2026-10-24T12:00:00Z")), "NEXT_7_DAYS");
  assert.equal(agendaBucket("2028-02-29", "DATE_ONLY", new Date("2028-02-28T12:00:00Z")), "NEXT_7_DAYS");
  assert.equal(agendaBucket("2026-10-25T01:30:00Z", "TIMESTAMP", new Date("2026-10-25T01:00:00Z")), "TODAY");
});
test("duplicate queue overlap collapses canonical identity, never title or date", () => {
  const one = deadline("one", { title: "Same" });
  const two = deadline("two", { title: "Same" });
  const rows = agendaRows([agenda([two, one]), agenda([one])], now);
  assert.deepEqual(rows.map((row) => row.id), ["one", "two"]);
});
test("closed rows are excluded from open attention, even if sent by a partial source", () => {
  const rows = agendaRows([agenda(["OPEN", "COMPLETED", "CANCELLED", "SUPERSEDED"].map((status) => deadline(status, { status: status as WorkflowDeadlineItem["status"] })))], now);
  assert.deepEqual(rows.map((row) => row.id), ["OPEN"]);
});
test("appending pages retains paging metadata and dedupes when presented", () => {
  const next = agenda([deadline("b")], { pagination: { offset: 100, limit: 100, hasMore: true } });
  const result = appendAgendaPage(agenda([deadline("a")]), next);
  assert.equal(result.pagination.offset, 100);
  assert.equal(result.pagination.hasMore, true);
  assert.deepEqual(agendaRows([result], now).map((row) => row.id), ["a", "b"]);
});
test("undated work excludes closed and malformed values instead of inventing dates", () => {
  const tasks = [
    { id: "a", status: "PENDING" }, { id: "b", status: "DONE" }, { id: "c", status: "PENDING", dueDate: "invalid" },
    { id: "d", status: "PENDING", dueDate: "2026-10-09" },
  ] as TaskItem[];
  assert.deepEqual(undatedTasks(tasks).map((task) => task.id), ["a"]);
});
test("review order is overdue, explicit attention, deadline, submitted time, stable identity", () => {
  const items = [
    review("unclassified", { dueDate: "2026-10-10T12:00:00Z" }),
    review("recorded", { requestedAttention: "QUICK_SCAN", dueDate: "2026-10-15T12:00:00Z" }),
    review("overdue", { dueDate: "2026-10-09T09:00:00Z" }),
    review("later-identity", { requestedAttention: "SIGNATURE", dueDate: "2026-10-15T12:00:00Z", submittedAt: "2026-10-01T12:00:00Z" }),
    review("earlier-identity", { requestedAttention: "DETAILED_REVIEW", dueDate: "2026-10-15T12:00:00Z", submittedAt: "2026-10-01T12:00:00Z" }),
  ];
  assert.deepEqual(orderDecisionQueue(items, now).map((item) => item.id), ["overdue", "earlier-identity", "later-identity", "recorded", "unclassified"]);
  assert.equal(items[0].id, "unclassified");
});
test("review explanation exposes recorded basis and missing date honestly", () => {
  assert.match(decisionOrderReason(review("a", { dueDate: "2026-10-08", requestedAttention: "APPROVAL" }), now), /Lejárt.*Kért figyelem/);
  assert.match(decisionOrderReason(review("a"), now), /Nincs érvényes határidő/);
  assert.equal(decisionUrgency(review("a", { dueDate: "2026-10-09T09:59:00Z" }), now), "CRITICAL");
  assert.equal(decisionUrgency(review("a", { dueDate: "2026-10-09T00:00:00Z" }), now), "CRITICAL");
});
test("exact review link preserves both encoded identities and legacy stays task-only", () => {
  const link = new URL(exactReviewHref(review("task /1", { submissionId: "sub&2" })), "https://local.test");
  assert.equal(link.searchParams.get("taskId"), "task /1");
  assert.equal(link.searchParams.get("submissionId"), "sub&2");
  assert.equal(link.searchParams.get("view"), "review");
  assert.equal(exactReviewHref(review("legacy", { source: "LEGACY_TASK", submissionId: undefined })), "/tasks?taskId=legacy");
});
test("queue zero sum is not evidence of explicit zero confirmation", () => {
  assert.equal(reviewQueueTimeLabel({ linkedTimeMinutes: 30 }), "30 perc rögzítve");
  for (const value of [undefined, 0, NaN]) assert.equal(reviewQueueTimeLabel({ linkedTimeMinutes: value }), "Időállapot: a Leadás részleteiben");
});
