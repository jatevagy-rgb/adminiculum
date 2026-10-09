"use client";

import type { DashboardOperationalOverview, TaskItem, WorkflowAgendaResponse } from "@/lib/api";
import type { TaskReviewQueueItem } from "@/lib/taskLifecycleApi";
import { agendaRows, deadlineBucket, isOpenWork } from "@/lib/agendaPresentation";
import { decisionOrderReason, exactReviewHref, orderDecisionQueue } from "@/lib/reviewQueuePresentation";
import { formatDeadline } from "@/lib/businessDateTime";
import { QuietLink } from "@/components/ui";

type Props = {
  agenda: WorkflowAgendaResponse | null;
  overdue: WorkflowAgendaResponse | null;
  reviews: TaskReviewQueueItem[] | null;
  tasks: TaskItem[] | null;
  operational: DashboardOperationalOverview | null;
  loading: boolean;
  now?: Date;
};

function AttentionSection({ id, title, href, loading, unavailable, empty, children }: {
  id: string; title: string; href: string; loading: boolean; unavailable: boolean; empty: boolean; children: React.ReactNode;
}) {
  return <section aria-labelledby={id} className="min-w-0 rounded-xl border border-[var(--adm-border-canonical)] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--adm-border-canonical)] px-4 py-3"><h2 id={id} className="text-lg font-semibold text-[var(--adm-green-800)]">{title}</h2><QuietLink href={href} size="sm">Teljes munkanézet</QuietLink></div>
    {loading ? <p role="status" className="p-4 text-sm">Betöltés…</p> : <>
      {unavailable ? <p role="status" className="p-4 text-sm text-[var(--adm-terracotta-700)]">Egyes források most nem érhetők el. Ez nem jelent üres munkasort.</p> : null}
      {empty && !unavailable ? <p className="p-4 text-sm text-[var(--adm-text-secondary)]">Nincs ilyen tétel a betöltött adatok között.</p> : null}
      {children}
    </>}
  </section>;
}

function AttentionRow({ title, detail, href, action = "Megnyitás" }: { title: string; detail: string; href?: string | null; action?: string }) {
  return <li className="flex flex-col gap-2 border-b border-[var(--adm-border-canonical)] p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0"><p className="break-words text-sm font-semibold">{title}</p><p className="mt-1 break-words text-xs leading-5 text-[var(--adm-text-secondary)]">{detail}</p></div>
    {href ? <QuietLink href={href} size="sm" className="shrink-0">{action}</QuietLink> : <span className="text-xs text-[var(--adm-text-secondary)]">Megnyitás nem elérhető</span>}
  </li>;
}

/** Only composes already-authorized read DTOs; never grants decision or mutation authority. */
export function HomeAttention({ agenda, overdue, reviews, tasks, operational, loading, now = new Date() }: Props) {
  const urgent = agendaRows([agenda, overdue], now).filter((item) => ["OVERDUE", "TODAY"].includes(deadlineBucket(item, now)));
  const decisions = orderDecisionQueue(reviews || [], now);
  const blocked = (tasks || []).filter((task) => isOpenWork(task.status) && task.status.toUpperCase() === "BLOCKED");
  const waiting = (operational?.items || []).filter((item) => item.groupCode === "CLIENT_WAITING");
  const resume = operational?.resume.item;
  const resumeHref = resume?.nextActionCode === "OPEN_REVIEW"
    ? exactReviewHref({ taskId: resume.taskId, submissionId: resume.submissionId || undefined, source: resume.submissionId ? "TASK_SUBMISSION" : "LEGACY_TASK" })
    : resume?.href;
  return <div className="space-y-4" aria-label="Napi figyelem">
    <p className="text-sm text-[var(--adm-text-secondary)]">Sürgős munka → döntések → elakadások és várakozás → folytatás. A listák rögzített forrásokra mutatnak.</p>
    <div className="grid gap-4 xl:grid-cols-2">
      <AttentionSection id="home-urgent" title="Sürgős" href="/agenda" loading={loading} unavailable={!agenda || !overdue} empty={urgent.length === 0}>
        <ul>{urgent.slice(0, 5).map((item) => <AttentionRow key={item.id} title={item.title} detail={`${deadlineBucket(item, now) === "OVERDUE" ? "Lejárt" : "Ma"} · ${formatDeadline(item.dueAt, item.temporalType || (item.allDay ? "DATE_ONLY" : "TIMESTAMP"))} · ${item.source.displayName || "Forrás neve nincs rögzítve"}`} href={item.capabilities.canOpen ? item.href : null} />)}</ul>
        {!loading && (urgent.length > 5 || agenda?.pagination.hasMore || overdue?.pagination.hasMore) ? <p className="px-4 pb-3 text-xs text-[var(--adm-text-secondary)]">Részleges előnézet; a teljes betöltött lista és további tételek az Agendában.</p> : null}
      </AttentionSection>
      <AttentionSection id="home-decisions" title="Döntések" href="/reviews" loading={loading} unavailable={reviews === null} empty={decisions.length === 0}>
        <ul>{decisions.slice(0, 5).map((item) => <AttentionRow key={item.id} title={item.title} detail={`${item.case.caseNumber} · ${decisionOrderReason(item, now)}${item.readOnly ? " · Csak megtekintés" : ""}`} href={exactReviewHref(item)} action={item.source === "TASK_SUBMISSION" ? "Leadás megnyitása" : "Feladat megnyitása"} />)}</ul>
        {!loading && decisions.length > 5 ? <p className="px-4 pb-3 text-xs text-[var(--adm-text-secondary)]">Az első 5 tétel; a teljes döntési sor a Review munkanézetben.</p> : null}
      </AttentionSection>
      <AttentionSection id="home-waiting" title="Elakadások és várakozás" href="/tasks" loading={loading} unavailable={tasks === null || !operational} empty={blocked.length + waiting.length === 0}>
        <ul>
          {blocked.slice(0, 3).map((task) => <AttentionRow key={`task:${task.id}`} title={task.title} detail={`Rögzített elakadás · ${task.case.caseNumber} · ${task.case.clientName}`} href={`/tasks?taskId=${encodeURIComponent(task.id)}`} />)}
          {waiting.slice(0, 3).map((item) => <AttentionRow key={`case:${item.id}`} title={item.title} detail={`${item.waitingLabel} · ${item.client.displayName}`} href={item.nextAction.href || item.openHref} />)}
        </ul>
        {!loading && (blocked.length > 3 || waiting.length > 3) ? <p className="px-4 pb-3 text-xs text-[var(--adm-text-secondary)]">Részleges előnézet; az ügyek és saját feladatok munkanézeteiben további tételek találhatók.</p> : null}
      </AttentionSection>
      <AttentionSection id="home-resume" title="Munka folytatása" href="/tasks" loading={loading} unavailable={!operational} empty={!resume}>
        <ul>{resume ? <AttentionRow title={resume.title} detail={`${resume.case.caseNumber} · ${resume.case.client.displayName}`} href={resumeHref} action={resume.actionLabel} /> : null}</ul>
      </AttentionSection>
    </div>
  </div>;
}
