"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCases,
  getClients,
  getCommunications,
  getDashboardStats,
  getIntakeQueue,
  getMyTasks,
  getNewsFeed,
  getWorkflowAgenda,
  type CaseListItem,
  type Client,
  type CommunicationItem,
  type DashboardStats,
  type IntakeQueueResponse,
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

type SummaryCardProps = {
  label: string;
  value: number | null;
  emptyLabel: string;
  href: string;
  tone: "petrol" | "amber" | "gold" | "navy" | "terracotta" | "green";
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

function isSameLocalDay(value: string, reference = new Date()) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
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

function SummaryCard({ label, value, emptyLabel, href, tone }: SummaryCardProps) {
  const toneClass =
    tone === "amber"
      ? "bg-[#FD9E02] text-[#3E2400]"
      : tone === "gold"
        ? "bg-[#FFB703] text-[#4A3300]"
        : tone === "terracotta"
          ? "bg-[var(--adm-terracotta-700)] text-white"
          : tone === "green"
            ? "bg-[var(--adm-green-800)] text-white"
        : tone === "navy"
          ? "bg-[#023047] text-white"
          : "bg-[#126782] text-white";
  const panelClass = tone === "amber" || tone === "gold" ? "bg-black/[0.07] border-black/[0.12]" : "bg-white/[0.14] border-white/[0.24]";

  return (
    <Link href={href} className={`${toneClass} min-h-[92px] p-3 transition-transform hover:-translate-y-0.5`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-85">{label}</span>
      <span className={`mt-2 flex items-end justify-between gap-3 border px-3 py-2 ${panelClass}`}>
        <span className="font-serif text-[27px] font-medium leading-none">{value ?? "—"}</span>
        <span className="text-right text-[10px] font-semibold opacity-85">
          {value === null ? "Most nem elérhető" : value === 0 ? emptyLabel : "Aktív tétel"}
        </span>
      </span>
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
  const [intake, setIntake] = useState<IntakeQueueResponse | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [availability, setAvailability] = useState<DashboardAvailability>(unavailableDashboardData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setAvailability(unavailableDashboardData);
    try {
      const [taskResult, caseResult, clientResult, communicationResult, agendaResult, statsResult, intakeResult] = await Promise.all([
        getMyTasks().catch(() => null),
        getCases(1, 200).catch(() => null),
        getClients().catch(() => null),
        getCommunications({ limit: 50 }).catch(() => null),
        getWorkflowAgenda({ scope: "MY_WORK", status: "OPEN", limit: 12 }).catch(() => null),
        getDashboardStats().catch(() => null),
        getIntakeQueue({ scope: "MY_INTAKES", limit: 4 }).catch(() => null),
      ]);

      setTasks(taskResult || []);
      setCases(caseResult?.data || []);
      setClients(clientResult?.data || []);
      setCommunications(communicationResult?.communications || []);
      setAgenda(agendaResult);
      setStats(statsResult);
      setIntake(intakeResult);
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
  const queue = focusItems.filter((item) => item.id !== primary?.id).slice(0, 4);
  const activeCase = cases[0] || null;
  const caseCount = availability.cases
    ? cases.filter((item) => !closedCaseStatuses.has(String(item.status || "").toUpperCase())).length
    : null;
  const deadlineCount = availability.agenda ? deadlines.length : null;
  const reviewCount = availability.stats
    ? stats?.stats.inReview ?? 0
    : availability.tasks
      ? reviewTasks.length
      : null;
  const todayTaskCount = availability.agenda ? agenda?.summary.today ?? 0 : null;
  const externalCommunicationCount = availability.communications
    ? communications.filter((item) => classifyAudience(item) === "external").length
    : null;
  const internalCommunicationCount = availability.communications
    ? communications.filter((item) => classifyAudience(item) === "internal").length
    : null;
  const todayCalendarItems = deadlines
    .filter((item) => isSameLocalDay(item.dueAt))
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
  const nextCalendarItem = todayCalendarItems[0] || null;
  const clientCommunicationOptions = useMemo(() => {
    const referencedClientIds = new Set(communications.map((item) => item.clientId).filter(Boolean));
    return clients.filter((client) => referencedClientIds.has(client.id));
  }, [clients, communications]);
  const clientCommunications = communications
    .filter((item) => item.clientId === selectedClientId)
    .slice(0, 6);
  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);
  const focusDataComplete = availability.tasks && availability.cases && availability.agenda && availability.stats;

  useEffect(() => {
    if (!selectedClientId && clientCommunicationOptions[0]) {
      setSelectedClientId(clientCommunicationOptions[0].id);
      return;
    }
    if (selectedClientId && !clientCommunicationOptions.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(clientCommunicationOptions[0]?.id || "");
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

        <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6" aria-label="Napi munka összefoglaló">
          <SummaryCard label="Nyitott ügyek" value={caseCount} emptyLabel="Nincs ügy" href="/cases" tone="petrol" />
          <SummaryCard label="Mai teendők" value={todayTaskCount} emptyLabel="Nincs mai teendő" href="/deadlines?view=day" tone="amber" />
          <SummaryCard label="Közeli határidők" value={deadlineCount} emptyLabel="Nincs közeli határidő" href="/deadlines" tone="gold" />
          <SummaryCard label="Review tételek" value={reviewCount} emptyLabel="Nincs review tétel" href="/reviews" tone="navy" />
          <SummaryCard label="Külső kommunikáció" value={externalCommunicationCount} emptyLabel="Nincs külső tétel" href="/notifications?view=external" tone="terracotta" />
          <SummaryCard label="Belső kommunikáció" value={internalCommunicationCount} emptyLabel="Nincs belső tétel" href="/notifications?view=internal" tone="green" />
        </section>

        <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="dashboard-calendar-heading">
          <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
            <h2 id="dashboard-calendar-heading" className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Napi események és határidők</h2>
            <div className="flex gap-2"><QuietLink href="/deadlines?view=day">Napi nézet</QuietLink><QuietLink href="/deadlines?view=week">Heti nézet</QuietLink></div>
          </div>
          {nextCalendarItem ? (
            <div className="divide-y divide-[var(--adm-border)]">
              {todayCalendarItems.slice(0, 3).map((item, index) => (
                <Link key={item.id} href={item.href || item.source.href || "/deadlines?view=day"} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--adm-surface)]">
                  <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</span><span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">{index === 0 ? "Következő" : "Mai tétel"} · {item.source.displayName || item.sourceType}</span></span>
                  <time className="shrink-0 text-[12px] font-semibold text-[var(--adm-warm-600)]">{new Date(item.dueAt).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}</time>
                </Link>
              ))}
              <div className="flex justify-end px-4 py-2"><QuietLink href="/tasks?newTask=1">Új határidős feladat</QuietLink></div>
            </div>
          ) : (
            <div className="p-4"><CompactState title="Mára nincs naptári tétel." action={<QuietLink href="/tasks?newTask=1">Új határidős feladat</QuietLink>} /></div>
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
          <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="dashboard-work-heading">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 id="dashboard-work-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Mai teendők</h2>
              <QuietLink href="/tasks">Minden feladat</QuietLink>
            </div>
            {queue.length > 0 ? (
              <div className="divide-y divide-[var(--adm-border)]">
                {queue.map((item) => <FocusRow key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="p-4"><CompactState title="Nincs további kiemelt tétel." detail="A nyitott feladatok a Feladatok oldalon érhetők el." /></div>
            )}
          </section>

          <div className="space-y-4">
            <section className="border border-[var(--adm-border)] bg-white">
              <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
                <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Közelgő határidők</h2>
                <QuietLink href="/deadlines">Határidők</QuietLink>
              </div>
              <div className="divide-y divide-[var(--adm-border)]">
                {deadlines.slice(0, 4).map((item) => (
                  <Link key={item.id} href={item.href || item.source.href || "/deadlines"} className="block px-4 py-3 hover:bg-[var(--adm-surface)]">
                    <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.title}</p>
                    <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{formatDate(item.dueAt)} · {item.source.displayName || item.sourceType}</p>
                  </Link>
                ))}
                {!loading && deadlines.length === 0 ? <div className="p-4"><CompactState title="Nincs közeli határidő." /></div> : null}
              </div>
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
                <div className="p-4"><CompactState title="Nincs review-ra váró tétel." /></div>
              )}
            </section>
          </div>
        </div>

        {intake?.summary.total ? (
          <section className="border border-[var(--adm-border)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Beérkezési sor</h2>
              <QuietLink href="/intake">Ügyfelvétel</QuietLink>
            </div>
            <div className="divide-y divide-[var(--adm-border)]">
              {intake.items.slice(0, 4).map((item) => (
                <Link key={item.caseId} href={item.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--adm-surface)]">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.displayName}</span>
                    <span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">{item.nextStep?.label || "Aktiválásra kész"}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--adm-text-muted)]">{item.readiness.completedRequiredItems}/{item.readiness.totalRequiredItems}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="border border-[var(--adm-border)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Kommunikáció</h2>
              <QuietLink href="/notifications">Kommunikációs munkatér</QuietLink>
            </div>
            <div className="grid md:grid-cols-2 md:divide-x md:divide-[var(--adm-border)]">
              {(["external", "internal"] as const).map((audience) => {
                const items = communications.filter((item) => classifyAudience(item) === audience).slice(0, 3);
                return <div key={audience} className="min-w-0"><div className="border-b border-[var(--adm-border)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">{audience === "external" ? "Külső" : "Belső"}</div>{items.length ? <div className="divide-y divide-[var(--adm-border)]">{items.map((item) => <Link key={item.id} href={`/notifications?view=${audience}`} className="block min-w-0 px-4 py-3 hover:bg-[var(--adm-surface)]"><p className="truncate text-[11px] font-semibold text-[var(--adm-text)]">{item.senderName || item.senderEmail || "Kommunikáció"}</p><p className="mt-1 truncate text-[12px] text-[var(--adm-text)]">{item.subject || "Nincs tárgy"}</p></Link>)}</div> : <div className="p-4"><CompactState title={`Nincs ${audience === "external" ? "külső" : "belső"} kommunikáció.`} /></div>}</div>;
              })}
            </div>
        </section>

        <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="dashboard-client-communications-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
            <h2 id="dashboard-client-communications-heading" className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Ügyfélhez sorolt kommunikáció</h2>
            <QuietLink href="/notifications?view=clients">Minden ügyfélkommunikáció</QuietLink>
          </div>
          {clientCommunicationOptions.length ? (
            <>
              <div className="flex gap-1 overflow-x-auto border-b border-[var(--adm-border)] bg-[var(--adm-surface)] px-4 py-2">
                {clientCommunicationOptions.map((client) => <button key={client.id} type="button" onClick={() => setSelectedClientId(client.id)} className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold ${selectedClientId === client.id ? "bg-[var(--adm-green-800)] text-white" : "border border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>{client.name}</button>)}
              </div>
              <div className="divide-y divide-[var(--adm-border)]">
                {clientCommunications.map((item) => {
                  const relatedCase = item.caseId ? caseById.get(item.caseId) : null;
                  return <Link key={item.id} href="/notifications?view=clients" className="grid gap-1 px-4 py-3 hover:bg-[var(--adm-surface)] sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-center"><span className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.subject || "Nincs tárgy"}</span><span className="truncate text-[10px] text-[var(--adm-text-muted)]">{relatedCase ? `${relatedCase.caseNumber} · ${getCaseDisplayTitle(relatedCase)}` : "Nincs ügyhöz rendelve"}</span><time className="text-[10px] text-[var(--adm-text-muted)]">{formatDateTime(item.createdAt)}</time></Link>;
                })}
              </div>
            </>
          ) : <div className="p-4"><CompactState title="Nincs ügyfélhez sorolt kommunikáció." /></div>}
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
