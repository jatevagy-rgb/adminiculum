import type { TaskReviewQueueItem } from "./taskLifecycleApi";
import { agendaBucket, safeTimestamp } from "./agendaPresentation";
import { ATTENTION_LABELS, type ReviewUrgency } from "./taskWorkflowPresentation";
import { formatDeadline } from "./businessDateTime";

export function exactReviewHref(item: Pick<TaskReviewQueueItem, "taskId" | "submissionId" | "source">): string {
  const query = new URLSearchParams({ taskId: item.taskId });
  if (item.source === "TASK_SUBMISSION" && item.submissionId) {
    query.set("submissionId", item.submissionId);
    query.set("view", "review");
  }
  return `/tasks?${query.toString()}`;
}

const hasExplicitAttention = (item: TaskReviewQueueItem) => Boolean(item.requestedAttention && ATTENTION_LABELS[item.requestedAttention]);
// taskSubmission.service serializes Task.dueDate. The agenda service maps that
// same persisted source to TIMESTAMP/allDay:false; midnight is not a date-only flag.
const isOverdue = (item: TaskReviewQueueItem, now: Date) => agendaBucket(item.dueDate, "TIMESTAMP", now) === "OVERDUE";

export function decisionUrgency(item: TaskReviewQueueItem, now = new Date()): ReviewUrgency {
  const bucket = agendaBucket(item.dueDate, "TIMESTAMP", now);
  if (bucket === "OVERDUE") return "CRITICAL";
  if (bucket === "TODAY" || item.priority === "URGENT") return "URGENT";
  if (bucket === "NEXT_7_DAYS") return "SOON";
  return bucket === "LATER" ? "LATER" : "NONE";
}

/** Attention categories are not urgency ranks. Recorded attention precedes unclassified work. */
export function orderDecisionQueue(items: TaskReviewQueueItem[], now = new Date()): TaskReviewQueueItem[] {
  return [...items].sort((a, b) =>
    Number(isOverdue(b, now)) - Number(isOverdue(a, now))
    || Number(hasExplicitAttention(b)) - Number(hasExplicitAttention(a))
    || safeTimestamp(a.dueDate) - safeTimestamp(b.dueDate)
    || safeTimestamp(a.submittedAt) - safeTimestamp(b.submittedAt)
    || a.id.localeCompare(b.id)
    || (a.submissionId || "").localeCompare(b.submissionId || ""));
}

export function decisionOrderReason(item: TaskReviewQueueItem, now = new Date()): string {
  const reasons: string[] = [];
  if (isOverdue(item, now)) reasons.push("Lejárt rögzített határidő");
  if (hasExplicitAttention(item)) reasons.push(`Kért figyelem: ${ATTENTION_LABELS[item.requestedAttention!]}`);
  reasons.push(safeTimestamp(item.dueDate) === Number.MAX_SAFE_INTEGER ? "Nincs érvényes határidő rögzítve" : `Rögzített határidő: ${formatDeadline(item.dueDate)}`);
  return reasons.join(" · ");
}

export function reviewQueueTimeLabel(item: Pick<TaskReviewQueueItem, "linkedTimeMinutes">): string {
  const minutes = item.linkedTimeMinutes;
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    // The queue does not expose zeroTimeConfirmed. Do not turn its zero sum into confirmed zero.
    return "Időállapot: a Leadás részleteiben";
  }
  return `${minutes} perc rögzítve`;
}
