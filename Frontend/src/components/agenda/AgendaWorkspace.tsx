"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, PageHeader, QuietLink } from "@/components/ui";
import { getMyTasks, getWorkflowAgenda, type TaskItem, type WorkflowAgendaResponse } from "@/lib/api";
import { AGENDA_BUCKETS, AGENDA_BUCKET_LABELS, agendaRows, appendAgendaPage, deadlineBucket, undatedTasks, type AgendaBucket } from "@/lib/agendaPresentation";
import { formatDeadline } from "@/lib/businessDateTime";

type Queue = "CALENDAR" | "OVERDUE";
type Scope = "MY_WORK" | "MY_CASES";

export function AgendaWorkspace() {
  const [scope, setScope] = useState<Scope>("MY_WORK");
  const [bucket, setBucket] = useState<AgendaBucket | "ALL">("ALL");
  const [calendar, setCalendar] = useState<WorkflowAgendaResponse | null>(null);
  const [overdue, setOverdue] = useState<WorkflowAgendaResponse | null>(null);
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState<Queue | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const generation = useRef(0);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setMore(null);
    setCalendar(null);
    setOverdue(null);
    setTasks(null);
    setFailed([]);
    const results = await Promise.allSettled([
      getWorkflowAgenda({ scope, status: "OPEN", queue: "CALENDAR", limit: 100 }),
      getWorkflowAgenda({ scope, status: "OPEN", queue: "OVERDUE", limit: 100 }),
      scope === "MY_WORK" ? getMyTasks() : Promise.resolve(null),
    ]);
    if (request !== generation.current) return;
    const [calendarResult, overdueResult, taskResult] = results;
    setCalendar(calendarResult.status === "fulfilled" ? calendarResult.value : null);
    setOverdue(overdueResult.status === "fulfilled" ? overdueResult.value : null);
    setTasks(taskResult.status === "fulfilled" ? taskResult.value : null);
    setFailed(results.flatMap((result, index) => result.status === "rejected" ? [["Dátumos tételek", "Lejárt tételek", "Határidő nélküli saját feladatok"][index]] : []));
    setNow(new Date());
    setLoading(false);
  }, [scope]);

  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const loadMore = async (queue: Queue) => {
    const current = queue === "CALENDAR" ? calendar : overdue;
    if (!current?.pagination.hasMore || more || loading) return;
    const request = generation.current;
    setMore(queue);
    try {
      const next = await getWorkflowAgenda({
        scope, status: "OPEN", queue, from: current.range.from.slice(0, 10), to: current.range.to.slice(0, 10),
        limit: current.pagination.limit, offset: current.pagination.offset + current.pagination.limit,
      });
      if (request !== generation.current) return;
      if (queue === "CALENDAR") setCalendar((previous) => appendAgendaPage(previous, next));
      else setOverdue((previous) => appendAgendaPage(previous, next));
      setFailed((previous) => previous.filter((label) => label !== "További tételek"));
    } catch {
      if (request === generation.current) setFailed((previous) => [...new Set([...previous, "További tételek"])]);
    } finally { if (request === generation.current) setMore(null); }
  };

  const rows = useMemo(() => agendaRows([calendar, overdue], now), [calendar, overdue, now]);
  const undated = useMemo(() => undatedTasks(tasks || []), [tasks]);
  const partial = Boolean(calendar?.pagination.hasMore || overdue?.pagination.hasMore);
  const knownRange = calendar?.range;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 bg-white px-4 py-5 sm:px-6">
      <PageHeader title="Agenda" subtitle="Rögzített dátumok, nyitott munkák. Europe/Budapest." actions={<QuietLink href="/deadlines">Határidők kezelése</QuietLink>} />
      <nav className="flex flex-wrap gap-4" aria-label="Munkanézetek">
        <QuietLink href="/reviews">Döntések</QuietLink><QuietLink href="/tasks">Feladatok</QuietLink><QuietLink href="/workload">Munkaterhelés</QuietLink>
      </nav>
      <details className="rounded-lg border border-[var(--adm-border-canonical)] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--adm-green-800)] focus-visible:outline focus-visible:outline-2">Szűrés és dátumtartomány</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Munkakör
          <select aria-label="Munkakör" value={scope} onChange={(event) => setScope(event.target.value as Scope)} className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--adm-border-canonical)] bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-800)]">
            <option value="MY_WORK">Saját munkáim</option><option value="MY_CASES">Elérhető ügyeim</option>
          </select>
        </label>
        <label className="text-sm font-medium">Dátumcsoport
          <select aria-label="Dátumcsoport" value={bucket} onChange={(event) => setBucket(event.target.value as AgendaBucket | "ALL")} className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--adm-border-canonical)] bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-800)]">
            <option value="ALL">Minden dátumcsoport</option>{AGENDA_BUCKETS.map((value) => <option key={value} value={value}>{AGENDA_BUCKET_LABELS[value]}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--adm-text-secondary)]">
        A jelenlegi nézet ügy- és feladathatáridőket mutat. A dokumentumok, ellenőrzések, kötelezettségek és ügyfélkérések dátumai még nem teljes körűek.
        {knownRange ? ` Dátumtartomány: ${knownRange.from.slice(0, 10)} – ${knownRange.to.slice(0, 10)}; a korábbi lejárt tételek külön betöltődnek.` : ""}
        {scope === "MY_WORK" ? " A határidő nélküli lista csak saját nyitott feladatokat tartalmaz." : " Az elérhető ügyek teljes határidő nélküli listája még nem áll rendelkezésre."}
      </p>
      </details>
      {failed.length > 0 ? <Alert variant="error" title="Az agenda részben nem tölthető be." action={<Button size="sm" variant="neutral" onClick={() => void load()}>Újratöltés</Button>}>{failed.join(" · ")}. A betöltött tételek továbbra is használhatók; a hiányzó adatok nem jelentenek üres listát.</Alert> : null}
      {loading ? <p role="status" className="py-8">Agenda betöltése…</p> : (
        <div className="space-y-4">
          {AGENDA_BUCKETS.filter((value) => bucket === "ALL" || value === bucket).map((value) => {
            const items = rows.filter((item) => deadlineBucket(item, now) === value);
            const missing = value === "NO_RECORDED_DEADLINE";
            return <section key={value} aria-labelledby={`agenda-${value}`} className="rounded-xl border border-[var(--adm-border-canonical)] bg-white">
              <h2 id={`agenda-${value}`} className="border-b border-[var(--adm-border-canonical)] px-4 py-3 text-base font-semibold"><span className={value === "OVERDUE" ? "text-[var(--adm-terracotta-700)]" : "text-[var(--adm-green-800)]"}>{AGENDA_BUCKET_LABELS[value]}</span> <span className="text-xs font-normal text-[var(--adm-text-secondary)]">· {items.length + (missing ? undated.length : 0)} betöltött tétel</span></h2>
              <ul className="divide-y divide-[var(--adm-border-canonical)]">
                {items.map((item) => <li key={item.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(150px,0.5fr)_auto] md:items-center">
                  <div className="min-w-0"><Badge tone="neutral">{item.sourceType === "TASK" ? "Feladat" : item.sourceType === "CASE_DEADLINE" ? "Ügyhatáridő" : "Rögzített forrás"}</Badge><h3 className="mt-1 break-words text-sm font-semibold">{item.title}</h3><p className="mt-1 break-words text-xs text-[var(--adm-text-secondary)]">{item.source.displayName || "Forrás neve nincs rögzítve"}</p></div>
                  <div className="text-xs"><p>{formatDeadline(item.dueAt, item.temporalType || (item.allDay ? "DATE_ONLY" : "TIMESTAMP"))}</p><p className="mt-1 text-[var(--adm-text-secondary)]">{item.responsibility.assignee?.displayName || item.responsibility.responsibleLawyer?.displayName || "Felelős nincs rögzítve"}</p></div>
                  {item.capabilities.canOpen && item.href ? <QuietLink href={item.href}>Forrás megnyitása</QuietLink> : <span className="text-xs text-[var(--adm-text-secondary)]">Megnyitás nem elérhető</span>}
                </li>)}
                {missing ? undated.map((task) => <li key={`task:${task.id}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{task.title}</h3><p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{task.case.caseNumber} · {task.case.clientName}</p></div><QuietLink href={`/tasks?taskId=${encodeURIComponent(task.id)}`}>Feladat megnyitása</QuietLink></li>) : null}
              </ul>
              {items.length === 0 && (!missing || undated.length === 0) ? <p className="p-4 text-sm text-[var(--adm-text-secondary)]">{missing && (scope !== "MY_WORK" || tasks === null) ? "A határidő nélküli lista nem érhető el ebben a nézetben." : "A betöltött adatok között nincs ilyen tétel."}</p> : null}
            </section>;
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {calendar?.pagination.hasMore ? <Button variant="neutral" disabled={Boolean(more) || loading} onClick={() => void loadMore("CALENDAR")}>További dátumos tételek</Button> : null}
        {overdue?.pagination.hasMore ? <Button variant="neutral" disabled={Boolean(more) || loading} onClick={() => void loadMore("OVERDUE")}>További lejárt tételek</Button> : null}
        {more ? <span role="status">További tételek betöltése…</span> : null}
        {partial ? <p className="text-xs text-[var(--adm-text-secondary)]">A lista részleges. A csoportok számai a betöltött, azonosító szerint egyesített tételekre vonatkoznak.</p> : null}
      </div>
      <QuietLink href="/" size="sm">Vissza a napi figyelemhez</QuietLink>
    </main>
  );
}
