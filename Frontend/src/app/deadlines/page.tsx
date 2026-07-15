"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
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
  const danger = item.urgency === "OVERDUE";

  return (
    <article className={`border bg-white px-3 py-3 shadow-[0_1px_0_rgba(2,48,71,0.04)] ${danger ? "border-[#d4b8b8]" : "border-[var(--adm-border)]"}`}>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_170px_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${danger ? "border-[#d4b8b8] bg-[#FEF2F2] text-[#8b3a3a]" : "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]"}`}>
              {URGENCY_LABELS[item.urgency]}
            </span>
            <span className="text-[10px] text-[var(--adm-text-muted)]">{SOURCE_LABELS[item.sourceType] || item.sourceType}</span>
          </div>
          <h3 className="mt-1 truncate text-[14px] font-semibold text-[var(--adm-text)]">{item.title}</h3>
          {item.safeDescription && <p className="mt-1 truncate text-[11px] text-[var(--adm-text-muted)]">{item.safeDescription}</p>}
        </div>
        <div className="text-[11px] text-[var(--adm-text-muted)]">
          <p className="font-semibold text-[var(--adm-text)]">{item.source.displayName || "Kapcsolódó ügy"}</p>
          <p>{item.responsibility.assignee?.displayName || item.responsibility.responsibleLawyer?.displayName || "Nincs kijelölve"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[var(--adm-text)]">{formatDateTime(item.dueAt, timezone)}</p>
          <p className="text-[10px] text-[var(--adm-text-muted)]">{STATUS_LABELS[item.status] || item.status}</p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
          {item.href && (
            <Link href={item.href} className="border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-text)]">
              Feladat megnyitása
            </Link>
          )}
          <Link href={`/cases/${encodeURIComponent(item.caseId)}`} className="border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-text)]">
            Ügy megnyitása
          </Link>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.capabilities.canComplete && item.sourceType === "TASK" && (
          <button type="button" disabled={busy} onClick={() => onComplete(item)} className="bg-[var(--adm-green-800)] px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50">
            Kész
          </button>
        )}
        {item.capabilities.canReschedule && item.sourceType === "TASK" && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <input
              type="datetime-local"
              value={draftDueAt}
              onChange={(event) => setDraftDueAt(event.target.value)}
              className="border border-[var(--adm-border)] bg-white px-2 py-1 text-[10px] text-[var(--adm-text)]"
              aria-label="Új határidő"
            />
            <button type="button" disabled={busy || !draftDueAt} onClick={() => onReschedule(item, draftDueAt)} className="border border-[var(--adm-ochre-500)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--adm-ochre-500)] disabled:opacity-50">
              Átütemezés
            </button>
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
  const [agenda, setAgenda] = useState<WorkflowAgendaResponse | null>(null);
  const [scope, setScope] = useState<"MY_WORK" | "MY_CASES" | "CASE">(initialScope);
  const [caseId] = useState(initialCaseId);
  const [status, setStatus] = useState<"OPEN" | "COMPLETED" | "ALL">("OPEN");
  const [urgencyFilter, setUrgencyFilter] = useState<WorkflowDeadlineUrgency | "ALL">("ALL");
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
  const visibleItems = useMemo(
    () => urgencyFilter === "ALL" ? flatItems : flatItems.filter((item) => item.urgency === urgencyFilter),
    [flatItems, urgencyFilter]
  );
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

  return (
    <div className="deadlines-surface min-h-screen bg-[var(--adm-surface)]">
      <div className="mx-auto max-w-[1480px] p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-[28px] text-[var(--adm-text)]">Határidők</h1>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
              {agenda ? `${agenda.range.from} – ${agenda.range.to}` : "Aktuális munkasor"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/tasks" className="border border-[var(--adm-green-800)] bg-[var(--adm-green-800)] px-3 py-2 text-[10px] font-semibold text-white">Feladat létrehozása</Link>
            <button type="button" onClick={() => setScope("MY_WORK")} className={`border px-3 py-2 text-[10px] font-semibold ${scope === "MY_WORK" ? "border-[var(--adm-green-800)] bg-[var(--adm-green-800)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>Saját munkám</button>
            <button type="button" onClick={() => setScope("MY_CASES")} className={`border px-3 py-2 text-[10px] font-semibold ${scope === "MY_CASES" ? "border-[var(--adm-green-800)] bg-[var(--adm-green-800)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>Saját ügyeim</button>
            {scope === "CASE" && (
              <span className="border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-[10px] font-semibold text-[var(--adm-text)]">
                Ügy agenda
              </span>
            )}
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[10px] font-semibold text-[var(--adm-text)]">
              <option value="OPEN">Nyitott</option>
              <option value="COMPLETED">Lezárt</option>
              <option value="ALL">Összes</option>
            </select>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-5">
          {[
            ["OVERDUE", "Lejárt", agenda?.summary.overdue ?? 0],
            ["TODAY", "Ma", agenda?.summary.today ?? 0],
            ["TOMORROW", "Holnap", agenda?.summary.tomorrow ?? 0],
            ["THIS_WEEK", "Ezen a héten", agenda?.summary.thisWeek ?? 0],
            ["LATER", "Később", agenda?.summary.later ?? 0],
          ].map(([valueKey, label, value]) => (
            <button key={label} type="button" onClick={() => setUrgencyFilter(urgencyFilter === valueKey ? "ALL" : valueKey as WorkflowDeadlineUrgency)} className={`border p-3 text-center ${urgencyFilter === valueKey ? "border-[var(--adm-ochre-500)] bg-[var(--adm-ivory-100)]" : "border-[var(--adm-border)] bg-white hover:bg-[var(--adm-surface)]"}`}>
              <p className="text-[18px] font-bold text-[var(--adm-text)]">{value}</p>
              <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{label}</p>
            </button>
          ))}
        </div>

        {error && <p className="mt-4 border border-[#d4b8b8] bg-[#FEF2F2] p-3 text-xs text-[#8b3a3a]">{error}</p>}

        {loading ? (
          <p className="mt-8 text-center text-xs text-[var(--adm-text-muted)]">Agenda betöltése…</p>
        ) : visibleItems.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--adm-border)] bg-white p-6">
            <p className="text-sm font-semibold text-[var(--adm-text)]">Nincs határidős tétel ebben a nézetben.</p>
            <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Módosítsd a szűrőket, vagy adj határidőt egy feladathoz vagy ügyhöz.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/tasks" className="border border-[var(--adm-border)] bg-white px-3 py-2 text-xs">Feladatok</Link>
              <Link href="/cases" className="border border-[var(--adm-border)] bg-white px-3 py-2 text-xs">Ügyek</Link>
              <button type="button" onClick={() => { setUrgencyFilter("ALL"); setStatus("OPEN"); }} className="border border-[var(--adm-border)] bg-white px-3 py-2 text-xs">Szűrők törlése</button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {groupedItems.map((group) => (
              <section key={group.urgency} className="rounded-xl border border-[var(--adm-border)] bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">{URGENCY_LABELS[group.urgency]}</h2>
                  <span className="text-[10px] text-[var(--adm-text-muted)]">{group.items.length} tétel</span>
                </div>
                <div className="space-y-2">
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
