import type { TaskItem, WorkflowAgendaResponse, WorkflowDeadlineItem } from "./api";
import { businessDateKey, type DeadlineTemporalType } from "./businessDateTime";

export const AGENDA_BUCKETS = ["OVERDUE", "TODAY", "NEXT_7_DAYS", "LATER", "NO_RECORDED_DEADLINE"] as const;
export type AgendaBucket = typeof AGENDA_BUCKETS[number];
export const AGENDA_BUCKET_LABELS: Record<AgendaBucket, string> = {
  OVERDUE: "Lejárt", TODAY: "Ma", NEXT_7_DAYS: "Következő 7 nap",
  LATER: "Később", NO_RECORDED_DEADLINE: "Nincs határidő rögzítve",
};
const CLOSED = new Set(["DONE", "COMPLETED", "CANCELLED", "SUPERSEDED"]);
export const isOpenWork = (status: string) => !CLOSED.has(status.toUpperCase());

/** Classifies presentation only. Never writes or repairs a canonical deadline. */
export function agendaBucket(value: string | null | undefined, temporalType: DeadlineTemporalType, now = new Date()): AgendaBucket {
  if (!value) return "NO_RECORDED_DEADLINE";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "NO_RECORDED_DEADLINE";
  const today = businessDateKey(now);
  const day = temporalType === "DATE_ONLY" ? value.slice(0, 10) : businessDateKey(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return "NO_RECORDED_DEADLINE";
  if (temporalType === "TIMESTAMP" ? date.getTime() < now.getTime() : day < today) return "OVERDUE";
  if (day === today) return "TODAY";
  // UTC is used only to count civil days, so a Budapest DST day is never 23/25 hours here.
  const days = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 7 ? "NEXT_7_DAYS" : "LATER";
}

export function deadlineBucket(item: WorkflowDeadlineItem, now = new Date()): AgendaBucket {
  return agendaBucket(item.dueAt, item.temporalType || (item.allDay ? "DATE_ONLY" : "TIMESTAMP"), now);
}

export function agendaRows(responses: Array<WorkflowAgendaResponse | null>, now = new Date()): WorkflowDeadlineItem[] {
  const byIdentity = new Map<string, WorkflowDeadlineItem>();
  for (const response of responses) for (const day of response?.days || []) for (const item of day.items) {
    // Same canonical row may be returned by both the calendar and overdue queue.
    // Equal titles/dates are not identity and must never collapse different sources.
    if (isOpenWork(item.status)) byIdentity.set(item.id, item);
  }
  return [...byIdentity.values()].sort((a, b) => {
    const bucket = AGENDA_BUCKETS.indexOf(deadlineBucket(a, now)) - AGENDA_BUCKETS.indexOf(deadlineBucket(b, now));
    return bucket || safeTimestamp(a.dueAt) - safeTimestamp(b.dueAt) || a.id.localeCompare(b.id);
  });
}

export function safeTimestamp(value?: string | null): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function undatedTasks(tasks: TaskItem[]): TaskItem[] {
  // Malformed values are not silently relabelled as missing or assigned to today.
  return tasks.filter((task) => isOpenWork(task.status) && !task.dueDate)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function appendAgendaPage(previous: WorkflowAgendaResponse | null, next: WorkflowAgendaResponse): WorkflowAgendaResponse {
  return { ...next, days: [...(previous?.days || []), ...next.days] };
}
