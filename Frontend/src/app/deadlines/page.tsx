"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { Alert, Badge, Button, EmptyState, PageHeader, QuietLink, StatusChip } from "@/components/ui";
import {
  completeTask,
  getWorkflowAgenda,
  rescheduleTaskDeadline,
  type WorkflowAgendaResponse,
  type WorkflowDeadlineItem,
  type WorkflowDeadlineUrgency,
} from "@/lib/api";

const URGENCY_LABELS: Record<WorkflowDeadlineUrgency, string> = {
  OVERDUE: "Lejárt",
  TODAY: "Ma",
  TOMORROW: "Holnap",
  THIS_WEEK: "Ezen a héten",
  LATER: "Később",
};

const SOURCE_LABELS: Record<string, string> = {
  TASK: "Feladat-határidő",
  CASE_DEADLINE: "Ügyhatáridő",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Nyitott",
  COMPLETED: "Kész",
  CANCELLED: "Törölve",
  SUPERSEDED: "Felülírva",
};

function formatDateTime(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
}

function inputDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function AgendaItemCard({
  item,
  timezone,
  busyId,
  onComplete,
  onReschedule,
}: {
  item: WorkflowDeadlineItem;
  timezone: string;
  busyId: string | null;
  onComplete: (item: WorkflowDeadlineItem) => void;
  onReschedule: (item: WorkflowDeadlineItem, dueAt: string) => void;
}) {
  const [draftDueAt, setDraftDueAt] = useState(inputDateTime(item.dueAt));
  const busy = busyId === item.id;

  return (
    <article className="px-3 py-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_170px_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={item.urgency === "OVERDUE" ? "danger" : item.urgency === "TODAY" ? "warning" : item.urgency === "TOMORROW" ? "gold" : "neutral"}>{URGENCY_LABELS[item.urgency]}</StatusChip>
            <span className="text-xs text-[#6B7280]">{SOURCE_LABELS[item.sourceType] || item.sourceType}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-[#1F2937]">{item.title}</h3>
          {item.safeDescription && <p className="mt-1 truncate text-xs text-[#6B7280]">{item.safeDescription}</p>}
        </div>
        <div className="text-xs text-[#6B7280]">
          <p className="font-semibold text-[#1F2937]">{item.source.displayName || "Kapcsolódó ügy"}</p>
          <p>{item.responsibility.assignee?.displayName || item.responsibility.responsibleLawyer?.displayName || "Nincs kijelölve"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#1F2937]">{formatDateTime(item.dueAt, timezone)}</p>
          <p className="text-xs text-[#6B7280]">{STATUS_LABELS[item.status] || item.status}</p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
          {item.href && (
            <QuietLink href={item.href} size="sm">Feladat megnyitása</QuietLink>
          )}
          <QuietLink href={`/cases/${encodeURIComponent(item.caseId)}`} size="sm">Ügy megnyitása</QuietLink>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.capabilities.canComplete && item.sourceType === "TASK" && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onComplete(item)}>Kész</Button>
        )}
        {item.capabilities.canReschedule && item.sourceType === "TASK" && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <input
              type="datetime-local"
              value={draftDueAt}
              onChange={(event) => setDraftDueAt(event.target.value)}
              className="h-8 rounded-[8px] border border-[#E5E7E6] bg-white px-2 py-1 text-xs text-[#1F2937]"
              aria-label="Új határidő"
            />
            <Button size="sm" variant="neutral" disabled={busy || !draftDueAt} onClick={() => onReschedule(item, draftDueAt)}>Átütemezés</Button>
          </div>
        )}
      </div>
    </article>
  );
}

function DeadlinesAgendaContent() {
  const searchParams = useSearchParams();
  const queryScope = searchParams?.get("scope");
  const initialScope = queryScope === "CASE"
    ? "CASE"
    : queryScope === "MY_CASES"
      ? "MY_CASES"
      : "MY_WORK";
  const initialCaseId = searchParams?.get("caseId") || "";
  const initialView = searchParams?.get("view") === "day" ? "day" : searchParams?.get("view") === "week" ? "week" : "agenda";
  const [agenda, setAgenda] = useState<WorkflowAgendaResponse | null>(null);
  const [scope, setScope] = useState<"MY_WORK" | "MY_CASES" | "CASE">(initialScope);
  const [caseId] = useState(initialCaseId);
  const [status, setStatus] = useState<"OPEN" | "COMPLETED" | "ALL">("OPEN");
  const [urgencyFilter, setUrgencyFilter] = useState<WorkflowDeadlineUrgency | "ALL">("ALL");
  const [calendarView, setCalendarView] = useState<"agenda" | "day" | "week">(initialView);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAgenda = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getWorkflowAgenda({ scope, status, caseId: scope === "CASE" ? caseId : undefined, limit: 100 });
      setAgenda(result);
    } catch (err) {
      console.error("Agenda load failed:", err);
      setError("Az agenda most nem érhető el.");
    } finally {
      setLoading(false);
    }
  }, [caseId, scope, status]);

  useEffect(() => {
    loadAgenda();
  }, [loadAgenda]);

  const flatItems = useMemo(() => agenda?.days.flatMap((day) => day.items) || [], [agenda]);
  const visibleItems = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const viewItems = flatItems.filter((item) => {
      if (calendarView === "agenda") return true;
      const due = new Date(item.dueAt);
      if (Number.isNaN(due.getTime())) return false;
      const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
      if (calendarView === "day") return dueDay === start;
      return dueDay >= start && dueDay < start + 7 * 24 * 60 * 60 * 1000;
    });
    return urgencyFilter === "ALL" ? viewItems : viewItems.filter((item) => item.urgency === urgencyFilter);
  }, [calendarView, flatItems, urgencyFilter]);
  const groupedItems = useMemo(() => {
    const order: WorkflowDeadlineUrgency[] = ["OVERDUE", "TODAY", "TOMORROW", "THIS_WEEK", "LATER"];
    return order
      .map((urgency) => ({
        urgency,
        items: visibleItems.filter((item) => item.urgency === urgency),
      }))
      .filter((group) => group.items.length > 0);
  }, [visibleItems]);

  const completeDeadline = async (item: WorkflowDeadlineItem) => {
    if (item.sourceType !== "TASK") return;
    setBusyId(item.id);
    try {
      await completeTask(item.sourceId, true);
      await loadAgenda();
    } catch (err) {
      console.error("Deadline completion failed:", err);
      await loadAgenda();
    } finally {
      setBusyId(null);
    }
  };

  const rescheduleDeadline = async (item: WorkflowDeadlineItem, dueAt: string) => {
    if (item.sourceType !== "TASK") return;
    setBusyId(item.id);
    try {
      await rescheduleTaskDeadline(item.sourceId, new Date(dueAt).toISOString());
      await loadAgenda();
    } catch (err) {
      console.error("Deadline reschedule failed:", err);
      await loadAgenda();
    } finally {
      setBusyId(null);
    }
  };

  const selectCalendarView = (view: "agenda" | "day" | "week") => {
    setCalendarView(view);
    const params = new URLSearchParams(window.location.search);
    if (view === "agenda") params.delete("view"); else params.set("view", view);
    window.history.replaceState(null, "", params.toString() ? `/deadlines?${params.toString()}` : "/deadlines");
  };

  return (
    <div className="deadlines-surface min-h-screen bg-white text-[#1F2937]">
      <div className="mx-auto max-w-[1480px] p-4">
        <PageHeader
          title="Határidők"
          subtitle={agenda ? `${agenda.range.from} – ${agenda.range.to}` : "Aktuális munkasor"}
          primaryAction={<Link href="/tasks?newTask=1" className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#0F3D32] bg-[#0F3D32] px-4 text-sm font-medium text-white hover:bg-[#062B22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32] focus-visible:ring-offset-2">Új határidős feladat</Link>}
          actions={<>
            <Button size="sm" variant={scope === "MY_WORK" ? "primary" : "neutral"} aria-pressed={scope === "MY_WORK"} onClick={() => setScope("MY_WORK")}>Saját munkám</Button>
            <Button size="sm" variant={scope === "MY_CASES" ? "primary" : "neutral"} aria-pressed={scope === "MY_CASES"} onClick={() => setScope("MY_CASES")}>Saját ügyeim</Button>
            {scope === "CASE" && (
              <Badge tone="green">Ügy agenda</Badge>
            )}
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Állapot szűrő" className="h-8 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-1 text-xs font-medium text-[#1F2937]">
              <option value="OPEN">Nyitott</option>
              <option value="COMPLETED">Lezárt</option>
              <option value="ALL">Összes</option>
            </select>
          </>}
        />

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Naptárnézet">
          {([[
            "agenda",
            "Munkasor",
          ], ["day", "Napi nézet"], ["week", "Heti nézet"]] as Array<["agenda" | "day" | "week", string]>).map(([view, label]) => (
            <Button key={view} size="sm" variant={calendarView === view ? "primary" : "neutral"} aria-pressed={calendarView === view} onClick={() => selectCalendarView(view)}>{label}</Button>
          ))}
        </div>

        <div className="mt-3 grid gap-0 overflow-hidden rounded-[12px] border border-[#E5E7E6] bg-white sm:grid-cols-5">
          {[
            ["OVERDUE", "Lejárt", agenda?.summary.overdue ?? 0],
            ["TODAY", "Ma", agenda?.summary.today ?? 0],
            ["TOMORROW", "Holnap", agenda?.summary.tomorrow ?? 0],
            ["THIS_WEEK", "Ezen a héten", agenda?.summary.thisWeek ?? 0],
            ["LATER", "Később", agenda?.summary.later ?? 0],
          ].map(([valueKey, label, value]) => (
            <button key={label} type="button" aria-pressed={urgencyFilter === valueKey} onClick={() => setUrgencyFilter(urgencyFilter === valueKey ? "ALL" : valueKey as WorkflowDeadlineUrgency)} className={`flex items-center justify-between border-r border-[#E5E7E6] px-3 py-3 text-left last:border-r-0 ${urgencyFilter === valueKey ? "bg-[#F8FAF9] outline outline-1 outline-inset outline-[#0F3D32]" : "bg-white hover:bg-[#F8FAF9]"}`}>
              <p className="text-xs font-semibold text-[#6B7280]">{label}</p>
              <p className="text-base font-bold text-[#1F2937]">{value}</p>
            </button>
          ))}
        </div>

        {error && <Alert variant="error" className="mt-4">{error}</Alert>}

        {loading ? (
          <p className="mt-5 text-xs text-[var(--adm-text-muted)]">Határidők betöltése…</p>
        ) : visibleItems.length === 0 ? (
          <div className="mt-4 rounded-[12px] border border-[#E5E7E6] bg-white p-4">
            <EmptyState title="Nincs határidős tétel ebben a nézetben." action={<Button size="sm" variant="neutral" onClick={() => { setUrgencyFilter("ALL"); setStatus("OPEN"); }}>Szűrők törlése</Button>} />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groupedItems.map((group) => (
              <section key={group.urgency} className="overflow-hidden rounded-[12px] border border-[#E5E7E6] bg-white">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="px-3 pt-3 text-xs font-bold uppercase tracking-[0.18em] text-[#6B7280]">{URGENCY_LABELS[group.urgency]}</h2>
                  <span className="px-3 pt-3 text-xs text-[#6B7280]">{group.items.length} tétel</span>
                </div>
                <div className="divide-y divide-[#E5E7E6]">
                  {group.items.map((item) => (
                    <AgendaItemCard key={item.id} item={item} timezone={agenda?.timezone || "Europe/Budapest"} busyId={busyId} onComplete={completeDeadline} onReschedule={rescheduleDeadline} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeadlinesPage() {
  return (
    <AuthenticatedApp section="calendar">
      <Suspense fallback={<div className="p-6 text-xs text-[var(--adm-text-muted)]">Agenda betöltése…</div>}>
        <DeadlinesAgendaContent />
      </Suspense>
    </AuthenticatedApp>
  );
}
