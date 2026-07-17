"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCases,
  getClients,
  getCommunications,
  getDashboardStats,
  getMyTasks,
  getNewsFeed,
  getWorkflowAgenda,
  type CaseListItem,
  type Client,
  type CommunicationItem,
  type DashboardStats,
  type TaskItem,
  type WorkflowAgendaResponse,
  type WorkflowDeadlineItem,
} from "@/lib/api";
import { getCaseDisplayTitle } from "@/lib/caseLabels";
import { classifyAudience } from "@/lib/communicationIntake";
import { CompactState, OperationalPageHeader, QuietLink, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";

type NewsArticle = {
  title: string;
  source: string;
  date: string;
  url?: string;
};

type FocusItem = {
  id: string;
  label: string;
  title: string;
  meta: string;
  href: string;
  action: string;
  tone: "green" | "amber" | "blue";
};

type DashboardAvailability = {
  tasks: boolean;
  cases: boolean;
  agenda: boolean;
  stats: boolean;
  communications: boolean;
};

const unavailableDashboardData: DashboardAvailability = {
  tasks: false,
  cases: false,
  agenda: false,
  stats: false,
  communications: false,
};

const completedStatuses = new Set(["COMPLETED", "DONE", "APPROVED", "FINALIZED", "ARCHIVED", "CANCELLED"]);
const closedCaseStatuses = new Set(["CLOSED", "COMPLETED", "ARCHIVED", "CANCELLED"]);

function formatDate(value?: string | null) {
  if (!value) return "Nincs határidő";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("hu-HU");
}

function formatDateTime(value?: string | null) {
  if (!value) return "Nincs időadat";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function toLocalDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCalendarDay(date: Date) {
  return {
    weekday: date.toLocaleDateString("hu-HU", { weekday: "short" }).replace(".", ""),
    day: date.toLocaleDateString("hu-HU", { day: "2-digit" }),
  };
}

function formatCalendarSelection(date: Date) {
  return date.toLocaleDateString("hu-HU", { month: "long", day: "numeric", weekday: "long" });
}

function formatDeadlineTime(item: WorkflowDeadlineItem) {
  if (item.allDay) return "Egész nap";
  const date = new Date(item.dueAt);
  return Number.isNaN(date.getTime()) ? "Nincs időadat" : date.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

function isReviewTask(task: TaskItem) {
  const status = String(task.status || "").toUpperCase();
  return ["SUBMITTED", "REVIEW_NEEDED", "IN_REVIEW"].includes(status) || /review|ellenőrz/i.test(task.title);
}

function isOpenTask(task: TaskItem) {
  return !completedStatuses.has(String(task.status || "").toUpperCase());
}

function taskUrgency(task: TaskItem) {
  if (!task.dueDate) return 3;
  const due = new Date(task.dueDate).getTime();
  if (Number.isNaN(due)) return 3;
  const delta = due - Date.now();
  if (delta < 0) return 0;
  if (delta < 24 * 60 * 60 * 1000) return 1;
  return 2;
}

function formatActivityText(type?: string | null, text?: string | null) {
  const normalized = String(type || text || "").toUpperCase();
  if (normalized.includes("CASE_ASSIGNED")) return "Ügy kiosztva";
  if (normalized.includes("CASE_CREATED")) return "Ügy létrehozva";
  if (normalized.includes("CASE_STATUS_CHANGED")) return "Ügyállapot frissítve";
  if (normalized.includes("TASK_ASSIGNED")) return "Feladat kiosztva";
  if (normalized.includes("TASK_STARTED")) return "Feladat elindítva";
  if (normalized.includes("TASK_SUBMITTED")) return "Feladat leadva";
  if (normalized.includes("TASK_COMPLETED")) return "Feladat lezárva";
  if (normalized.includes("DOCUMENT_UPLOADED")) return "Dokumentum feltöltve";
  if (normalized.includes("DOCUMENT_UPDATED")) return "Dokumentum frissítve";
  if (normalized.includes("DOCUMENT_REVIEW")) return "Dokumentum review frissült";
  if (/^[A-Z0-9_ -]+$/.test(String(text || type || ""))) return "Legutóbbi ügyaktivitás";
  return text || "Legutóbbi aktivitás";
}

function FocusRow({ item, dominant = false }: { item: FocusItem; dominant?: boolean }) {
  const rail =
    item.tone === "amber"
      ? "border-l-[var(--adm-ochre-500)]"
      : item.tone === "blue"
        ? "border-l-[var(--adm-blue-700)]"
        : "border-l-[var(--adm-green-800)]";

  return (
    <Link
      href={item.href}
      className={`block border border-[var(--adm-border)] border-l-4 ${rail} bg-white px-4 py-3 transition-colors hover:bg-[var(--adm-surface)]`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{item.label}</p>
          <p className={`${dominant ? "mt-1 font-serif text-[24px] font-medium" : "mt-1 text-[14px] font-semibold"} truncate text-[var(--adm-text)]`}>
            {item.title}
          </p>
          <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.meta}</p>
        </div>
        <span className={`${dominant ? "bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)]" : "border border-[var(--adm-border)] bg-white text-[var(--adm-text)]"} shrink-0 px-3 py-2 text-[11px] font-semibold`}>
          {item.action} →
        </span>
      </div>
    </Link>
  );
}

export function DashboardFocused() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [agenda, setAgenda] = useState<WorkflowAgendaResponse | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [availability, setAvailability] = useState<DashboardAvailability>(unavailableDashboardData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toLocalDateKey(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setAvailability(unavailableDashboardData);
    try {
      const [taskResult, caseResult, clientResult, communicationResult, agendaResult, statsResult] = await Promise.all([
        getMyTasks().catch(() => null),
        getCases(1, 200).catch(() => null),
        getClients().catch(() => null),
        getCommunications({ limit: 50 }).catch(() => null),
        getWorkflowAgenda({ scope: "MY_WORK", status: "OPEN", limit: 50 }).catch(() => null),
        getDashboardStats().catch(() => null),
      ]);

      setTasks(taskResult || []);
      setCases(caseResult?.data || []);
      setClients(clientResult?.data || []);
      setCommunications(communicationResult?.communications || []);
      setAgenda(agendaResult);
      setStats(statsResult);
      setAvailability({
        tasks: taskResult !== null,
        cases: caseResult !== null,
        agenda: agendaResult !== null,
        stats: statsResult !== null,
        communications: communicationResult !== null,
      });
      setError(!taskResult || !caseResult || !agendaResult || !statsResult);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    getNewsFeed("legal")
      .then((result) => setNews((result.articles || []).slice(0, 4)))
      .catch(() => setNews([]));
  }, []);

  const openTasks = useMemo(
    () => tasks.filter(isOpenTask).sort((left, right) => taskUrgency(left) - taskUrgency(right)),
    [tasks],
  );
  const reviewTasks = useMemo(() => openTasks.filter(isReviewTask), [openTasks]);
  const deadlines = useMemo<WorkflowDeadlineItem[]>(
    () => (agenda?.days || []).flatMap((day) => day.items).filter((item) => item.status === "OPEN"),
    [agenda],
  );
  const recentDocuments = useMemo(
    () =>
      (stats?.recentActivity || [])
        .filter((item) => /document|dokument|irat/i.test(`${item.type} ${item.text}`))
        .filter((item) => !/deleted|töröl/i.test(`${item.type} ${item.text}`))
        .slice(0, 4),
    [stats],
  );

  const latestActivity = useMemo(
    () => (stats?.recentActivity || []).find((activity) =>
      activity.caseId
      && cases.some((item) => item.id === activity.caseId)
      && !/deleted|töröl/i.test(`${activity.type} ${activity.text}`)
    ) || null,
    [cases, stats],
  );
  const latestActivityCase = useMemo(
    () => cases.find((item) => item.id === latestActivity?.caseId) || null,
    [cases, latestActivity?.caseId],
  );

  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = [];
    const firstTask = openTasks[0];
    const firstDeadline = deadlines[0];
    const firstCase = cases.find((item) => Boolean(item.deadline)) || cases[0];

    if (firstTask) {
      items.push({
        id: `task-${firstTask.id}`,
        label: "Következő feladat",
        title: firstTask.title,
        meta: `${firstTask.case?.caseNumber || "Feladat"} · ${formatDate(firstTask.dueDate)}`,
        href: `/tasks?taskId=${encodeURIComponent(firstTask.id)}`,
        action: "Feladat megnyitása",
        tone: taskUrgency(firstTask) <= 1 ? "amber" : "green",
      });
    }
    if (firstDeadline) {
      items.push({
        id: `deadline-${firstDeadline.id}`,
        label: "Közelgő határidő",
        title: firstDeadline.title,
        meta: `${formatDate(firstDeadline.dueAt)} · ${firstDeadline.source.displayName || firstDeadline.sourceType}`,
        href: firstDeadline.href || firstDeadline.source.href || "/deadlines",
        action: "Határidő megnyitása",
        tone: "amber",
      });
    }
    if (firstCase) {
      items.push({
        id: `case-${firstCase.id}`,
        label: "Aktív ügy",
        title: getCaseDisplayTitle(firstCase),
        meta: `${firstCase.caseNumber} · ${firstCase.clientName || "Nincs ügyféladat"}`,
        href: `/cases/${encodeURIComponent(firstCase.id)}`,
        action: "Ügy megnyitása",
        tone: "green",
      });
    }
    return items;
  }, [cases, deadlines, openTasks]);

  const primary = latestActivity && latestActivityCase
    ? {
        id: latestActivity.id,
        label: getCaseDisplayTitle(latestActivityCase),
        title: formatActivityText(latestActivity.type, latestActivity.text),
        meta: `${latestActivityCase.caseNumber} · ${formatDateTime(latestActivity.timestamp)}`,
        href: latestActivity.href || `/cases/${encodeURIComponent(latestActivityCase.id)}`,
        action: "Munka folytatása",
        tone: "green" as const,
      }
    : focusItems[0] || null;
  const activeCase = cases[0] || null;
  const caseCount = availability.cases
    ? cases.filter((item) => !closedCaseStatuses.has(String(item.status || "").toUpperCase())).length
    : null;
  const externalCommunicationCount = availability.communications
    ? communications.filter((item) => classifyAudience(item) === "external").length
    : null;
  const internalCommunicationCount = availability.communications
    ? communications.filter((item) => classifyAudience(item) === "internal").length
    : null;
  const calendarDays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = toLocalDateKey(date);
      const items = deadlines
        .filter((item) => toLocalDateKey(item.dueAt) === key)
        .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
      return { date, key, items };
    });
  }, [deadlines]);
  const selectedCalendarDay = calendarDays.find((day) => day.key === selectedCalendarDate) || calendarDays[0];
  const selectedCalendarItems = selectedCalendarDay?.items || [];
  const calendarRangeLabel = calendarDays.length
    ? `${calendarDays[0].date.toLocaleDateString("hu-HU", { month: "short", day: "numeric" })} – ${calendarDays[calendarDays.length - 1].date.toLocaleDateString("hu-HU", { month: "short", day: "numeric" })}`
    : "Következő 7 nap";
  const clientCommunicationOptions = useMemo(() => {
    const referencedClientIds = new Set(communications.map((item) => item.clientId).filter(Boolean));
    return clients.filter((client) => referencedClientIds.has(client.id));
  }, [clients, communications]);
  const dashboardCommunications = communications
    .filter((item) => !selectedClientId || item.clientId === selectedClientId)
    .slice(0, 6);
  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);
  const clientById = useMemo(() => new Map(clients.map((item) => [item.id, item])), [clients]);
  const focusDataComplete = availability.tasks && availability.cases && availability.agenda && availability.stats;

  useEffect(() => {
    if (selectedClientId && !clientCommunicationOptions.some((client) => client.id === selectedClientId)) {
      setSelectedClientId("");
    }
  }, [clientCommunicationOptions, selectedClientId]);

  const quickActions = [
    { label: "Új ügy", href: "/cases?newCase=1", tone: "bg-[var(--adm-terracotta-700)] text-white" },
    { label: "Dokumentum feltöltése", href: activeCase ? `/cases/${activeCase.id}/documents` : "/cases", tone: "bg-[var(--adm-ochre-500)] text-[var(--adm-green-950)]" },
    { label: "Új feladat", href: "/tasks?newTask=1", tone: "bg-[var(--adm-blue-700)] text-white" },
    { label: "Kommunikáció", href: "/notifications", tone: "bg-[var(--adm-blue-500)] text-white" },
    { label: "Review sor", href: "/reviews", tone: "bg-[var(--adm-blue-950)] text-white" },
    { label: "Határidők", href: "/deadlines?view=week", tone: "bg-[var(--adm-warm-500)] text-white" },
    { label: "Munkaórák", href: "/time-entries", tone: "bg-[var(--adm-green-800)] text-white" },
  ];

  return (
    <div className="min-h-full bg-[var(--adm-ivory-50)] px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1380px] space-y-4">
        <OperationalPageHeader
          title="Műszerfal"
        />

        <section aria-labelledby="dashboard-actions-heading">
          <h2 id="dashboard-actions-heading" className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Gyors műveletek</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href} className={`${action.tone} flex min-h-[82px] items-end p-3 text-[12px] font-semibold transition-transform hover:-translate-y-0.5`}>
                {action.label}
              </Link>
            ))}
          </div>
        </section>

        {error ? <SafePanelError onRetry={() => void load()} detail="Egyes napi munkalisták most nem érhetők el; a betöltött adatok továbbra is használhatók." /> : null}

        <section aria-labelledby="dashboard-next-heading">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="dashboard-next-heading" className="font-serif text-[22px] font-medium text-[var(--adm-text)]">Itt folytasd</h2>
            {primary ? <span className="text-[11px] text-[var(--adm-text-muted)]">1 kiemelt lépés</span> : null}
          </div>
          {loading ? (
            <CompactState title="A következő lépés betöltése…" />
          ) : primary ? (
            <FocusRow item={primary} dominant />
          ) : !focusDataComplete ? (
            <CompactState
              title="A következő lépés most nem tölthető be teljesen."
              detail="Próbáld újra, vagy nyisd meg közvetlenül az ügyek és feladatok listáját."
              action={<QuietLink href="/tasks">Feladatok megnyitása</QuietLink>}
            />
          ) : (
            <CompactState
              title="Nincs kiemelt következő lépés."
              detail="Nyiss meg egy ügyet, vagy hozz létre új feladatot."
              action={<QuietLink href="/cases">Ügyek megnyitása</QuietLink>}
            />
          )}
        </section>

        <section aria-label="Nyitott ügyek összefoglaló">
          <Link href="/cases" className="inline-flex items-center gap-3 border border-[var(--adm-border)] border-l-4 border-l-[var(--adm-blue-700)] bg-white px-3 py-2 transition-colors hover:bg-[var(--adm-surface)]">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Nyitott ügyek</span>
            <span className="font-serif text-[21px] font-medium leading-none text-[var(--adm-text)]">{caseCount ?? "—"}</span>
            <span className="text-[10px] font-semibold text-[var(--adm-text-muted)]">
              {caseCount === null ? "Most nem elérhető" : caseCount === 0 ? "Nincs nyitott ügy" : "Ügylista"} →
            </span>
          </Link>
        </section>

        <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="dashboard-calendar-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
            <div>
              <h2 id="dashboard-calendar-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Napi események és határidők</h2>
              <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{calendarRangeLabel} · rögzített ügy- és feladathatáridők</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(agenda?.summary.overdue || 0) > 0 ? <QuietLink href="/deadlines">{agenda?.summary.overdue} lejárt</QuietLink> : null}
              <QuietLink href="/deadlines?view=day">Napi nézet</QuietLink>
              <QuietLink href="/deadlines?view=week">Heti nézet</QuietLink>
            </div>
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
            <div className="border-b border-[var(--adm-border)] p-3 lg:border-b-0 lg:border-r">
              <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Következő hét nap">
                {calendarDays.map((day, index) => {
                  const label = formatCalendarDay(day.date);
                  const selected = day.key === selectedCalendarDay?.key;
                  return (
                    <button key={day.key} type="button" role="tab" aria-selected={selected} onClick={() => setSelectedCalendarDate(day.key)} className={`min-w-0 border px-1 py-2 text-center transition-colors ${selected ? "border-[var(--adm-blue-950)] bg-[var(--adm-blue-950)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)] hover:bg-[var(--adm-surface)]"}`}>
                      <span className="block truncate text-[9px] font-bold uppercase tracking-[0.08em] opacity-75">{index === 0 ? "Ma" : label.weekday}</span>
                      <span className="mt-1 block font-serif text-[19px] leading-none">{label.day}</span>
                      <span className={`mx-auto mt-2 flex h-5 min-w-5 items-center justify-center px-1 text-[9px] font-bold ${selected ? "bg-white/15 text-white" : day.items.length ? "bg-[var(--adm-sand-100)] text-[var(--adm-warm-600)]" : "bg-[var(--adm-surface)] text-[var(--adm-text-muted)]"}`}>{day.items.length}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--adm-border)] pt-3 text-[10px] text-[var(--adm-text-muted)]">
                <span>Külső naptárszinkron nincs; csak Adminiculum-határidők látszanak.</span>
                <QuietLink href="/tasks?newTask=1">Új határidős feladat</QuietLink>
              </div>
            </div>
            <div className="min-w-0">
              <div className="border-b border-[var(--adm-border)] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">{selectedCalendarDay ? formatCalendarSelection(selectedCalendarDay.date) : "Kiválasztott nap"}</p>
              </div>
              {loading ? (
                <div className="p-4"><CompactState title="Naptár betöltése…" /></div>
              ) : selectedCalendarItems.length ? (
                <div className="divide-y divide-[var(--adm-border)]">
                  {selectedCalendarItems.slice(0, 4).map((item) => (
                    <Link key={item.id} href={item.href || item.source.href || "/deadlines"} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-[var(--adm-surface)]">
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.title}</span>
                        <span className="mt-1 block truncate text-[10px] text-[var(--adm-text-muted)]">{item.source.displayName || item.sourceType}</span>
                      </span>
                      <time className="shrink-0 text-[11px] font-semibold text-[var(--adm-warm-600)]">{formatDeadlineTime(item)}</time>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-4"><CompactState title="Erre a napra nincs rögzített határidő." detail="Másik napot választhatsz a heti sávban." /></div>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-3">
          <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="dashboard-work-heading">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 id="dashboard-work-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Mai teendők</h2>
              <QuietLink href="/tasks">Minden feladat</QuietLink>
            </div>
            {openTasks.length > 0 ? (
              <div className="divide-y divide-[var(--adm-border)]">
                {openTasks.slice(0, 3).map((task) => (
                  <Link key={task.id} href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block px-4 py-3 hover:bg-[var(--adm-surface)]">
                    <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{task.title}</p>
                    <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{task.case?.caseNumber || "Feladat"} · {formatDate(task.dueDate)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4"><CompactState title="Nincs nyitott teendő." /></div>
            )}
          </section>

          <section className="border border-[var(--adm-border)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Review-ra vár</h2>
              <QuietLink href="/reviews">Review sor</QuietLink>
            </div>
            {reviewTasks.length > 0 ? (
              <div className="divide-y divide-[var(--adm-border)]">
                {reviewTasks.slice(0, 3).map((task) => (
                  <Link key={task.id} href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block px-4 py-3 hover:bg-[var(--adm-surface)]">
                    <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{task.title}</p>
                    <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{task.case?.caseNumber || "Review tétel"} · {formatDate(task.dueDate)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4"><CompactState title="Nincs review-ra váró munka." detail="A leadott dokumentumok itt jelennek meg." /></div>
            )}
          </section>

          <section className="border border-[var(--adm-border)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Közelgő határidők</h2>
              <QuietLink href="/deadlines">Határidők</QuietLink>
            </div>
            <div className="divide-y divide-[var(--adm-border)]">
              {deadlines.slice(0, 3).map((item) => (
                <Link key={item.id} href={item.href || item.source.href || "/deadlines"} className="block px-4 py-3 hover:bg-[var(--adm-surface)]">
                  <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.title}</p>
                  <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{formatDate(item.dueAt)} · {item.source.displayName || item.sourceType}</p>
                </Link>
              ))}
              {!loading && deadlines.length === 0 ? <div className="p-4"><CompactState title="Nincs közeli határidő." /></div> : null}
            </div>
          </section>
        </div>

        <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="dashboard-communications-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
            <div>
              <h2 id="dashboard-communications-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Kommunikáció</h2>
              <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Legutóbbi tételek, opcionális ügyfélszűréssel.</p>
            </div>
            <div className="flex flex-wrap gap-2"><QuietLink href="/notifications">Összes</QuietLink><QuietLink href="/notifications?view=external">Külső ({externalCommunicationCount ?? "—"})</QuietLink><QuietLink href="/notifications?view=internal">Belső ({internalCommunicationCount ?? "—"})</QuietLink></div>
          </div>
          {clientCommunicationOptions.length ? (
            <div className="flex gap-1 overflow-x-auto border-b border-[var(--adm-border)] bg-[var(--adm-surface)] px-4 py-2" aria-label="Kommunikáció szűrése ügyfél szerint">
              <button type="button" onClick={() => setSelectedClientId("")} className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold ${!selectedClientId ? "bg-[var(--adm-green-800)] text-white" : "border border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>Minden ügyfél</button>
              {clientCommunicationOptions.map((client) => <button key={client.id} type="button" onClick={() => setSelectedClientId(client.id)} className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold ${selectedClientId === client.id ? "bg-[var(--adm-green-800)] text-white" : "border border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>{client.name}</button>)}
            </div>
          ) : null}
          {dashboardCommunications.length ? (
            <div className="divide-y divide-[var(--adm-border)]">
              {dashboardCommunications.map((item) => {
                const relatedCase = item.caseId ? caseById.get(item.caseId) : null;
                const relatedClient = item.clientId ? clientById.get(item.clientId) : null;
                const audience = classifyAudience(item);
                return (
                  <Link key={item.id} href={`/notifications?communicationId=${encodeURIComponent(item.id)}`} className="grid gap-1 px-4 py-3 hover:bg-[var(--adm-surface)] sm:grid-cols-[minmax(150px,0.7fr)_minmax(0,1.4fr)_minmax(180px,0.8fr)_auto] sm:items-center">
                    <span className="truncate text-[11px] font-semibold text-[var(--adm-text)]">{item.senderName || item.senderEmail || item.recipientName || "Nincs forrásadat"}</span>
                    <span className="truncate text-[12px] font-semibold text-[var(--adm-blue-950)]">{item.subject || "Nincs tárgy"}</span>
                    <span className="truncate text-[10px] text-[var(--adm-text-muted)]">{relatedClient?.name || "Nincs ügyfél"}{relatedCase ? ` · ${relatedCase.caseNumber}` : ""}</span>
                    <span className="flex items-center justify-between gap-3 sm:justify-end"><span className="border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-1 text-[9px] font-semibold text-[var(--adm-text-muted)]">{audience === "external" ? "Külső" : "Belső"}</span><time className="text-[10px] text-[var(--adm-text-muted)]">{formatDateTime(item.createdAt)}</time></span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="p-4"><CompactState title={selectedClientId ? "Ehhez az ügyfélhez nincs kommunikáció." : "Nincs megjeleníthető kommunikáció."} /></div>
          )}
        </section>

        {(recentDocuments.length > 0 || news.length > 0) ? (
          <details className="border border-[var(--adm-border)] bg-white">
            <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-[var(--adm-text)]">További jelzések</summary>
            <div className="grid gap-4 border-t border-[var(--adm-border)] p-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold text-[var(--adm-text)]">Legutóbbi dokumentumok</p>
                <div className="space-y-2">
                  {recentDocuments.map((item) => (
                    <Link key={item.id} href={item.caseId ? `/cases/${item.caseId}/documents` : "/documents/compare"} className="block text-[11px] text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">
                      {formatActivityText(item.type, item.text)}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold text-[var(--adm-text)]">Jogi hírek</p>
                <div className="space-y-2">
                  {news.map((article) => (
                    article.url ? (
                      <a key={`${article.title}-${article.date}`} href={article.url} target="_blank" rel="noreferrer" className="block text-[11px] text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">
                        {article.title}
                      </a>
                    ) : <p key={`${article.title}-${article.date}`} className="text-[11px] text-[var(--adm-text-muted)]">{article.title}</p>
                  ))}
                </div>
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
