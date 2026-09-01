"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCases,
  getClients,
  getCommunications,
  getDashboardOperationalOverview,
  getDashboardStats,
  getMyTasks,
  getNewsFeed,
  getWorkflowAgenda,
  type CaseListItem,
  type Client,
  type CommunicationItem,
  type DashboardStats,
  type DashboardOperationalOverview,
  type TaskItem,
  type WorkflowAgendaResponse,
  type WorkflowDeadlineItem,
} from "@/lib/api";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { classifyAudience } from "@/lib/communicationIntake";
import {
  buildDashboardOperationalPresentation,
  DASHBOARD_SECONDARY_ACTIONS,
  getDashboardCaseTitle,
  getDashboardPrimaryActions,
  getNextSevenDayDeadlines,
  type DashboardPrimaryActionIcon,
} from "@/lib/dashboardPresentation";
import { taskStatusLabel } from "@/lib/taskWorkflowPresentation";
import {
  deriveDashboardAvailability,
  getDashboardGlobalFailure,
  getDashboardSectionFailure,
  UNAVAILABLE,
  type DashboardAvailability,
} from "@/lib/dashboardLoadState";
import {
  WORKLOAD_SUMMARY_CARDS,
  workloadSummaryCaption,
  workloadSummaryPanelClass,
  workloadSummaryToneClass,
  type WorkloadSummaryCardDef,
  type WorkloadSummaryValueKey,
} from "@/lib/dashboardWorkloadSummary";
import {
  attentionPresentation,
  formatEstimateRange,
  UNCLASSIFIED_LABEL,
  type AttentionCategory,
} from "@/lib/attentionCategory";
import { CompactState, OperationalPageHeader, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton } from "@/components/adminiculum/ui";
import { ClientAccent } from "@/components/clients/ClientAccent";

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
  status: string;
  tone: "green" | "amber" | "blue";
  clientColorKey?: string | null;
};


const completedStatuses = new Set(["COMPLETED", "DONE", "APPROVED", "FINALIZED", "ARCHIVED", "CANCELLED"]);
// Restored verbatim from the legacy "Napi munka összefoglaló" summary cards (DashboardFocused @ a948839).
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

function taskUrgency(task: Pick<TaskItem, "dueDate">) {
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

function DashboardIcon({ name, className = "h-5 w-5" }: { name: DashboardPrimaryActionIcon | "check" | "calendar" | "chevron"; className?: string }) {
  const paths: Record<DashboardPrimaryActionIcon | "check" | "calendar" | "chevron", React.ReactNode> = {
    case: <><path d="M4 7.5h16v11H4z" /><path d="M9 7.5V5h6v2.5M4 11h16M10 11v2h4v-2" /></>,
    task: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 2.5 2.5L16 9M8 7h8" /></>,
    document: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
    communication: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name]}
    </svg>
  );
}

function DashboardTextLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--adm-green-800)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2 ${className}`}
    >
      {children}<span aria-hidden="true">→</span>
    </Link>
  );
}

function DashboardEmptyState({ title, detail, icon = "check" }: { title: string; detail?: string; icon?: "check" | "calendar" }) {
  return (
    <div role="status" className="flex min-h-[74px] items-start gap-3 px-4 py-4 text-[var(--adm-text-muted)]">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--adm-surface)] text-[var(--adm-green-800)]">
        <DashboardIcon name={icon} className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-[12px] font-semibold text-[var(--adm-text)]">{title}</span>
        {detail ? <span className="mt-1 block text-[11px] leading-5">{detail}</span> : null}
      </span>
    </div>
  );
}

function DashboardPanel({
  title,
  action,
  children,
  labelledBy,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  labelledBy: string;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white shadow-[0_10px_28px_rgba(0,42,35,0.035)] ${className}`} aria-labelledby={labelledBy}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
        <h3 id={labelledBy} className="font-serif text-[19px] font-medium text-[var(--adm-text)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function workflowTone(code: string) {
  if (code === "DEADLINE_APPROACHING") return "border-[var(--adm-terracotta-700)] bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)]";
  if (code === "OFFICE_ACTION") return "border-[var(--adm-blue-500)] bg-[var(--adm-blue-100)] text-[var(--adm-blue-950)]";
  if (code === "REVIEW") return "border-[var(--adm-green-700)] bg-[var(--adm-ivory-100)] text-[var(--adm-green-800)]";
  if (code === "CLIENT_WAITING") return "border-[#8d76a8] bg-[#f4f0f8] text-[#5f4d72]";
  return "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]";
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
      className={`block rounded-xl border border-[var(--adm-border)] border-l-4 ${rail} bg-white px-5 py-4 shadow-[0_12px_32px_rgba(0,42,35,0.05)] transition-colors hover:bg-[var(--adm-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{item.label}</p>
          <p className={`${dominant ? "mt-1 font-serif text-[24px] font-medium" : "mt-1 text-[14px] font-semibold"} truncate text-[var(--adm-text)]`}>
            {item.title}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--adm-text-muted)]"><ClientAccent colorKey={item.clientColorKey} className="h-2 w-2 shrink-0 rounded-full" /><span>{item.meta}</span><span aria-hidden="true">·</span><span>{taskStatusLabel(item.status)}</span></p>
        </div>
        <span className={`${dominant ? "bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)]" : "border border-[var(--adm-border)] bg-white text-[var(--adm-text)]"} shrink-0 px-3 py-2 text-[11px] font-semibold`}>
          {item.action} →
        </span>
      </div>
    </Link>
  );
}

// Legacy "Napi munka összefoglaló" colored work-summary card, restored from
// DashboardFocused @ a948839 (removed by 10e1bd3 → a607f6e). The whole card
// background carries the semantic color; a translucent inner panel holds the
// count. Labels/tones/colors/caption come from @/lib/dashboardWorkloadSummary,
// the single source of truth shared with the tests.
function SummaryCard({ card, value }: { card: WorkloadSummaryCardDef; value: number | null }) {
  return (
    <Link href={card.href} className={`${workloadSummaryToneClass(card.tone)} min-h-[92px] p-3 transition-transform hover:-translate-y-0.5`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-85">{card.label}</span>
      <span className={`mt-2 flex items-end justify-between gap-3 border px-3 py-2 ${workloadSummaryPanelClass(card.tone)}`}>
        <span className="font-serif text-[27px] font-medium leading-none">{value ?? "—"}</span>
        <span className="text-right text-[10px] font-semibold opacity-85">
          {workloadSummaryCaption(value, card.emptyLabel)}
        </span>
      </span>
    </Link>
  );
}

type DashboardAttentionWorkload = NonNullable<DashboardOperationalOverview["attentionWorkload"]>;

function attentionCardClass(category: AttentionCategory | "UNCLASSIFIED", count: number): string {
  const quiet = count === 0 ? " opacity-70" : "";
  const tone =
    category === "QUICK_SCAN"
      ? "border-l-[var(--adm-ochre-500)] bg-[var(--adm-ivory-100)]"
      : category === "APPROVAL"
        ? "border-l-[var(--adm-green-700)] bg-[#EAF3EE]"
        : category === "SIGNATURE"
          ? "border-l-[#8d76a8] bg-[#f4f0f8]"
          : category === "EDITING"
            ? "border-l-[var(--adm-blue-500)] bg-[#EAF6FA]"
            : category === "DETAILED_REVIEW"
              ? "border-l-[var(--adm-terracotta-700)] bg-[#FBEFEB]"
              : "border-l-[var(--adm-border-strong)] bg-[var(--adm-surface)]";
  return `block rounded-xl border border-[var(--adm-border)] border-l-4 p-3 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2${quiet} ${tone}`;
}

// "Milyen munkák várnak rám?" — reads the attentionWorkload projection already
// present on the operational-overview response (no second fetch, no double count).
function DashboardAttentionWorkloadBlock({
  workload,
  loading,
  unavailable,
}: {
  workload: DashboardAttentionWorkload | null;
  loading: boolean;
  unavailable: boolean;
}) {
  const empty =
    Boolean(workload) &&
    workload!.categories.every((item) => item.count === 0) &&
    workload!.unclassified.count === 0;
  const noData = !loading && !unavailable && !workload;

  return (
    <section aria-labelledby="dashboard-attention-workload-heading">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="dashboard-attention-workload-heading" className="font-serif text-[22px] font-medium text-[var(--adm-text)]">Milyen munkák várnak rám?</h2>
          <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Csak az Önre kiosztott nyitott feladatokat számolja; a becslés tervezési jelzés, nem időnyilvántartás.</p>
        </div>
        <DashboardTextLink href="/tasks">Feladatok megnyitása</DashboardTextLink>
      </div>
      {loading ? (
        <div className="rounded-lg border border-[var(--adm-border)] bg-white"><DashboardEmptyState title="Munkaterhelési adatok betöltése…" /></div>
      ) : unavailable ? (
        <div className="rounded-lg border border-[var(--adm-border)] bg-white"><DashboardEmptyState title="A munkaterhelési adatok most nem érhetők el." /></div>
      ) : noData || empty ? (
        <div className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-ivory-100)]"><DashboardEmptyState title="Nincs besorolt, Önre váró feladat." detail="A besorolt feladatok kategóriánként itt jelennek meg." /></div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
          {workload!.categories.map((item) => {
            const presentation = attentionPresentation(item.attentionCategory);
            const duration = formatEstimateRange(item.minMinutes, item.maxMinutes);
            return (
              <Link key={item.attentionCategory} href={`/tasks?attentionCategory=${encodeURIComponent(item.attentionCategory)}`} className={attentionCardClass(item.attentionCategory, item.count)}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-[var(--adm-text)]">{presentation.label}</span>
                  <span aria-hidden="true" className="text-[13px]">{presentation.mark}</span>
                </span>
                <span className="mt-1 block font-serif text-[20px] font-medium text-[var(--adm-text)]">{item.count} feladat</span>
                <span className="mt-0.5 block text-[10.5px] text-[var(--adm-text-muted)]">{item.count === 0 ? "Nincs ilyen feladat" : duration}</span>
                {item.nearestDeadline ? <span className="mt-1 block text-[10px] font-semibold text-[var(--adm-text-soft)]">Legközelebbi: {formatDate(item.nearestDeadline)}</span> : null}
              </Link>
            );
          })}
          <Link href="/tasks?attentionCategory=UNCLASSIFIED" className={attentionCardClass("UNCLASSIFIED", workload!.unclassified.count)}>
            <span className="text-[12px] font-bold text-[var(--adm-text)]">{UNCLASSIFIED_LABEL}</span>
            <span className="mt-1 block font-serif text-[20px] font-medium text-[var(--adm-text)]">{workload!.unclassified.count} feladat</span>
            <span className="mt-0.5 block text-[10.5px] text-[var(--adm-text-muted)]">Időt nem becsülünk</span>
            {workload!.unclassified.nearestDeadline ? <span className="mt-1 block text-[10px] font-semibold text-[var(--adm-text-soft)]">Legközelebbi: {formatDate(workload!.unclassified.nearestDeadline)}</span> : null}
          </Link>
        </div>
      )}
    </section>
  );
}

export function DashboardFocused() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [agenda, setAgenda] = useState<WorkflowAgendaResponse | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [operational, setOperational] = useState<DashboardOperationalOverview | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [availability, setAvailability] = useState<DashboardAvailability>(UNAVAILABLE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toLocalDateKey(new Date()));
  const [signalsExpanded, setSignalsExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setAvailability(UNAVAILABLE);
    try {
      const [taskResult, caseResult, clientResult, communicationResult, agendaResult, statsResult, operationalResult] = await Promise.all([
        getMyTasks().catch(() => null),
        getCases(1, 200).catch(() => null),
        getClients().catch(() => null),
        getCommunications({ limit: 50 }).catch(() => null),
        getWorkflowAgenda({ scope: "MY_WORK", status: "OPEN", limit: 50 }).catch(() => null),
        getDashboardStats().catch(() => null),
        getDashboardOperationalOverview().catch(() => null),
      ]);

      setTasks(taskResult || []);
      setCases(caseResult?.data || []);
      setClients(clientResult?.data || []);
      setCommunications(communicationResult?.communications || []);
      setAgenda(agendaResult);
      setStats(statsResult);
      setOperational(operationalResult);
      const endpointResults = { taskResult, caseResult, agendaResult, statsResult, communicationResult, operationalResult };
      setAvailability(deriveDashboardAvailability(endpointResults));
      setError(getDashboardGlobalFailure(endpointResults));
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

  const primary = operational?.resume.item
    ? {
        id: operational.resume.item.id,
        label: getDashboardCaseTitle(operational.resume.item.case.title),
        title: operational.resume.item.title,
        meta: `${operational.resume.item.case.caseNumber} · ${operational.resume.item.case.client.displayName}${operational.resume.item.dueAt ? ` · ${formatDate(operational.resume.item.dueAt)}` : ""}`,
        href: operational.resume.item.href,
        action: operational.resume.item.actionLabel,
        status: operational.resume.item.status,
        tone: taskUrgency({ dueDate: operational.resume.item.dueAt || undefined }) <= 1 ? "amber" as const : "green" as const,
        clientColorKey: operational.resume.item.case.client.clientColorKey,
      }
    : null;
  const activeCase = cases[0] || null;
  const caseCount = availability.operational ? operational?.summary.openCaseCount ?? 0 : null;
  const externalCommunicationCount = availability.communications
    ? communications.filter((item) => classifyAudience(item) === "external").length
    : null;
  const internalCommunicationCount = availability.communications
    ? communications.filter((item) => classifyAudience(item) === "internal").length
    : null;
  // Legacy "Napi munka összefoglaló" card values, restored verbatim from a948839.
  // availability-gated so a failed source shows "Most nem elérhető" (null), never a fake 0.
  const summaryOpenCaseCount = availability.cases
    ? cases.filter((item) => !closedCaseStatuses.has(String(item.status || "").toUpperCase())).length
    : null;
  const summaryDeadlineCount = availability.agenda ? deadlines.length : null;
  // Legacy access hardened with optional chaining on the nested field so a
  // malformed (non-conforming 200) source degrades to a count rather than
  // crashing — required to keep the validated partial-load contract green.
  // Value is identical to the legacy for well-formed data.
  const summaryReviewCount = availability.stats
    ? stats?.stats?.inReview ?? 0
    : availability.tasks
      ? reviewTasks.length
      : null;
  const summaryTodayTaskCount = availability.agenda ? agenda?.summary?.today ?? 0 : null;
  const workloadSummaryValues: Record<WorkloadSummaryValueKey, number | null> = {
    openCases: summaryOpenCaseCount,
    todayTasks: summaryTodayTaskCount,
    deadlines: summaryDeadlineCount,
    reviews: summaryReviewCount,
    externalComms: externalCommunicationCount,
    internalComms: internalCommunicationCount,
  };
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
  const nextSevenDayDeadlines = useMemo(() => getNextSevenDayDeadlines(deadlines), [deadlines]);
  const clientCommunicationOptions = useMemo(() => {
    const referencedClientIds = new Set(communications.map((item) => item.clientId).filter(Boolean));
    return clients.filter((client) => referencedClientIds.has(client.id));
  }, [clients, communications]);
  const dashboardCommunications = communications
    .filter((item) => !selectedClientId || item.clientId === selectedClientId)
    .slice(0, 6);
  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);
  const clientById = useMemo(() => new Map(clients.map((item) => [item.id, item])), [clients]);
  const focusDataComplete = availability.operational;
  const criticalLoadFailed = error;
  const hasSectionFailure = getDashboardSectionFailure(availability, criticalLoadFailed, loading);
  const operationalPresentation = useMemo(
    () => operational ? buildDashboardOperationalPresentation(operational) : null,
    [operational],
  );

  useEffect(() => {
    if (selectedClientId && !clientCommunicationOptions.some((client) => client.id === selectedClientId)) {
      setSelectedClientId("");
    }
  }, [clientCommunicationOptions, selectedClientId]);

  const primaryActions = getDashboardPrimaryActions(activeCase?.id);

  return (
    <div className="min-h-full bg-[var(--adm-ivory-50)] px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1380px] space-y-7 pb-8">
        <OperationalPageHeader
          title="Műszerfal"
        />

        <section aria-labelledby="dashboard-actions-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="dashboard-actions-heading" className="font-serif text-[22px] font-medium text-[var(--adm-text)]">Gyors műveletek</h2>
              <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Gyakori munkalépések közvetlenül.</p>
            </div>
            <nav aria-label="További gyors műveletek" className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">További műveletek</span>
              {DASHBOARD_SECONDARY_ACTIONS.map((action) => (
                <DashboardTextLink key={action.href} href={action.href}>{action.label}</DashboardTextLink>
              ))}
            </nav>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {primaryActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white p-4 shadow-[0_8px_24px_rgba(0,42,35,0.035)] transition-[border-color,background-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-[var(--adm-green-700)] hover:bg-[var(--adm-ivory-100)] hover:shadow-[0_12px_28px_rgba(0,42,35,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--adm-ivory-100)] text-[var(--adm-green-800)] transition-colors group-hover:bg-white">
                    <DashboardIcon name={action.icon} />
                  </span>
                  <span aria-hidden="true" className="text-[16px] text-[var(--adm-text-muted)] transition-transform group-hover:translate-x-0.5">→</span>
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-[var(--adm-text)]">{action.label}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-[var(--adm-text-muted)]">{action.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {criticalLoadFailed ? <SafePanelError onRetry={() => void load()} detail="A műszerfal alapadatai nem tölthetők be." /> : null}
        {hasSectionFailure ? <CompactState tone="neutral" title="Egyes napi munkalisták most nem érhetők el." detail="A betöltött adatok továbbra is használhatók." action={<AdminButton size="sm" variant="neutral" onClick={() => void load()}>Újratöltés</AdminButton>} /> : null}

        <section aria-labelledby="dashboard-next-heading">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="dashboard-next-heading" className="font-serif text-[22px] font-medium text-[var(--adm-text)]">Itt folytasd</h2>
            {primary ? <span className="text-[11px] text-[var(--adm-text-muted)]">1 kiemelt lépés</span> : null}
          </div>
          {loading ? (
            <div className="rounded-lg border border-[var(--adm-border)] bg-white"><DashboardEmptyState title="A következő lépés betöltése…" /></div>
          ) : primary ? (
            <FocusRow item={primary} dominant />
          ) : !focusDataComplete ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--adm-border)] bg-white pr-4">
              <DashboardEmptyState title="A következő lépés most nem tölthető be teljesen." detail="Próbáld újra, vagy nyisd meg közvetlenül az ügyek és feladatok listáját." />
              <DashboardTextLink href="/tasks">Feladatok megnyitása</DashboardTextLink>
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-ivory-100)]">
              <DashboardEmptyState title="Nincs félbehagyott vagy azonnali beavatkozást igénylő munkája." detail="Az új feladatokat és határidőket az alábbi áttekintésekben találja." />
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6" aria-label="Napi munka összefoglaló">
          {WORKLOAD_SUMMARY_CARDS.map((card) => (
            <SummaryCard key={card.valueKey} card={card} value={workloadSummaryValues[card.valueKey]} />
          ))}
        </section>

        <DashboardAttentionWorkloadBlock
          workload={operational?.attentionWorkload ?? null}
          loading={loading}
          unavailable={!loading && !availability.operational}
        />

        <section className="overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white shadow-[0_10px_28px_rgba(0,42,35,0.035)]" aria-labelledby="dashboard-operational-cases-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
            <div>
              <h2 id="dashboard-operational-cases-heading" className="font-serif text-[22px] font-medium text-[var(--adm-text)]">Ügyek, ahol lépés szükséges</h2>
              <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Rögzített állapot, felelős, feladat és határidő alapján.</p>
            </div>
            <DashboardTextLink href="/cases" className="no-underline hover:no-underline">
              <span className="text-[var(--adm-text-muted)]">Nyitott ügyek:</span><span className="font-serif text-[20px] text-[var(--adm-text)]">{caseCount ?? "—"}</span>
            </DashboardTextLink>
          </div>
          {operational && operationalPresentation ? (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-[var(--adm-border)] bg-[var(--adm-surface)] px-4 py-2.5" aria-label="Operatív ügycsoportok">
                {operational.groups.map((group) => (
                  <span key={group.code} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--adm-text-muted)]"><span>{group.label}</span><span className="rounded-full bg-white px-1.5 py-0.5 text-[var(--adm-text)]">{group.count}</span></span>
                ))}
              </div>
              {operationalPresentation.unspecifiedCount > 0 ? (
                <div className="border-b border-[var(--adm-border)] bg-[var(--adm-ivory-100)] px-4 py-3">
                  <p className="text-[12px] font-semibold text-[var(--adm-text)]">{operationalPresentation.unspecifiedCount} ügyhöz nincs következő lépés rendelve.</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Ezek az ügyek könnyen kieshetnek a napi munkából.</p>
                </div>
              ) : null}
              {operationalPresentation.visibleCount ? (
                <div className="px-4 py-1">
                  {operationalPresentation.groups.map((group) => (
                    <section key={group.code} className="border-b border-[var(--adm-border)] py-3 last:border-b-0" aria-labelledby={`dashboard-case-group-${group.code}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <h3 id={`dashboard-case-group-${group.code}`} className="text-[12px] font-semibold text-[var(--adm-text)]">{group.label}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${workflowTone(group.code)}`}>{group.count}</span>
                      </div>
                      <div className="divide-y divide-[var(--adm-border)]">
                        {group.items.map((item) => (
                          <article key={item.id} className="relative grid gap-3 py-3 pl-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                            <ClientAccent colorKey={item.client.clientColorKey} className="absolute inset-y-3 left-0 w-1 rounded-full" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link href={item.openHref} className="truncate text-[14px] font-semibold text-[var(--adm-text)] hover:text-[var(--adm-green-800)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2">{getDashboardCaseTitle(item.title)}</Link>
                                {item.overdue ? <span className="text-[10px] font-bold text-[var(--adm-terracotta-700)]">Lejárt határidő</span> : null}
                              </div>
                              <p className="mt-1 truncate text-[11px] text-[var(--adm-text-muted)]">{item.client.displayName} · {item.caseNumber}</p>
                              <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-[var(--adm-text-muted)]">
                                <span>{getCaseStatusLabel(item.status)}</span><span aria-hidden="true">·</span>
                                <span>{item.responsible?.displayName || "Felelős nincs kijelölve"}</span><span aria-hidden="true">·</span>
                                <span>{item.waitingLabel}</span>
                                {item.nearestDeadline ? <><span aria-hidden="true">·</span><span className={item.overdue ? "font-semibold text-[var(--adm-terracotta-700)]" : ""}>{item.overdue ? "Lejárt" : "Határidő"}: {formatDate(item.nearestDeadline)}</span></> : null}
                              </p>
                            </div>
                            <DashboardTextLink href={item.nextAction.href} className="md:justify-self-end">{item.nextAction.label}</DashboardTextLink>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="text-[10px] text-[var(--adm-text-muted)]">Legfeljebb 6 ügy jelenik meg ezen az áttekintésen.</span>
                    <DashboardTextLink href="/cases">{operationalPresentation.hiddenCount > 0 ? `További ${operationalPresentation.hiddenCount} ügy megtekintése` : "Összes érintett ügy megnyitása"}</DashboardTextLink>
                  </div>
                </div>
              ) : <DashboardEmptyState title="Nincs nyitott, jogosultsági körébe tartozó ügy." />}
            </>
          ) : <DashboardEmptyState title="Az operatív ügyáttekintés most nem érhető el." />}
        </section>

        <section aria-labelledby="dashboard-daily-work-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="dashboard-daily-work-heading" className="font-serif text-[22px] font-medium text-[var(--adm-text)]">Mai munkám</h2>
              <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Konkrét feladatok, review-k és a következő hét határidői.</p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
          <DashboardPanel title="Mai feladataim" action={<DashboardTextLink href="/tasks">Minden feladat</DashboardTextLink>} labelledBy="dashboard-work-heading">
            {!availability.tasks ? (
              <DashboardEmptyState title="Mai feladatok most nem érhetők el." />
            ) : openTasks.length > 0 ? (
              <div className="divide-y divide-[var(--adm-border)]">
                {openTasks.slice(0, 3).map((task) => (
                  <Link key={task.id} href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="relative block px-4 py-3 pl-5 hover:bg-[var(--adm-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-green-800)]">
                    <ClientAccent colorKey={task.case?.clientColorKey} className="absolute inset-y-0 left-0 w-1" />
                    <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{task.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{task.case?.caseNumber || "Feladat"} · {formatDate(task.dueDate)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <DashboardEmptyState title="Nincs mára kijelölt feladata." />
            )}
          </DashboardPanel>

          <DashboardPanel title="Nekem kijelölt Review-k" action={<DashboardTextLink href="/reviews">Review sor</DashboardTextLink>} labelledBy="dashboard-review-heading">
            {!availability.tasks ? (
              <DashboardEmptyState title="Review adatok most nem érhetők el." />
            ) : reviewTasks.length > 0 ? (
              <div className="divide-y divide-[var(--adm-border)]">
                {reviewTasks.slice(0, 3).map((task) => (
                  <Link key={task.id} href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="relative block px-4 py-3 pl-5 hover:bg-[var(--adm-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-green-800)]">
                    <ClientAccent colorKey={task.case?.clientColorKey} className="absolute inset-y-0 left-0 w-1" />
                    <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{task.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{task.case?.caseNumber || "Review tétel"} · {formatDate(task.dueDate)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <DashboardEmptyState title="Nincs review-ra váró munkája." detail="A leadott dokumentumok itt jelennek meg." />
            )}
          </DashboardPanel>

          <DashboardPanel title="Következő 7 nap határidői" action={<DashboardTextLink href="/deadlines">Határidők</DashboardTextLink>} labelledBy="dashboard-deadline-heading">
            {!availability.agenda ? (
              <DashboardEmptyState title="Határidő adatok most nem érhetők el." />
            ) : (
            <div className="divide-y divide-[var(--adm-border)]">
              {nextSevenDayDeadlines.slice(0, 3).map((item) => (
                <Link key={item.id} href={item.href || item.source.href || "/deadlines"} className="relative block px-4 py-3 pl-5 hover:bg-[var(--adm-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-green-800)]">
                  <ClientAccent colorKey={caseById.get(item.caseId)?.clientColorKey} className="absolute inset-y-0 left-0 w-1" />
                  <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</p>
                  <p className={`mt-1 text-[11px] ${item.urgency === "OVERDUE" ? "font-semibold text-[var(--adm-terracotta-700)]" : "text-[var(--adm-text-muted)]"}`}>{item.urgency === "OVERDUE" ? "Lejárt · " : ""}{formatDate(item.dueAt)} · {item.source.displayName || item.sourceType}</p>
                </Link>
              ))}
              {!loading && nextSevenDayDeadlines.length === 0 ? <DashboardEmptyState title="Nincs közelgő határidő." icon="calendar" /> : null}
            </div>
            )}
          </DashboardPanel>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white shadow-[0_8px_24px_rgba(0,42,35,0.025)]" aria-labelledby="dashboard-calendar-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
            <div>
              <h2 id="dashboard-calendar-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Napi események és határidők</h2>
              <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{calendarRangeLabel} · rögzített ügy- és feladathatáridők</p>
            </div>
            <nav aria-label="Naptárnézetek" className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {(agenda?.summary.overdue || 0) > 0 ? <DashboardTextLink href="/deadlines">{agenda?.summary.overdue} lejárt</DashboardTextLink> : null}
              <DashboardTextLink href="/deadlines?view=day">Napi nézet</DashboardTextLink>
              <DashboardTextLink href="/deadlines?view=week">Heti nézet</DashboardTextLink>
            </nav>
          </div>
          {!availability.agenda ? (
            <DashboardEmptyState title="Naptáradatok most nem érhetők el." />
          ) : (
          <div className={selectedCalendarItems.length ? "grid lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]" : ""}>
            <div className={selectedCalendarItems.length ? "border-b border-[var(--adm-border)] p-3 lg:border-b-0 lg:border-r" : "p-3"}>
              <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Következő hét nap">
                {calendarDays.map((day, index) => {
                  const label = formatCalendarDay(day.date);
                  const selected = day.key === selectedCalendarDay?.key;
                  return (
                    <button key={day.key} type="button" role="tab" aria-selected={selected} onClick={() => setSelectedCalendarDate(day.key)} className={`min-w-0 rounded-lg border px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2 ${selected ? "border-[var(--adm-blue-950)] bg-[var(--adm-blue-950)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)] hover:bg-[var(--adm-surface)]"}`}>
                      <span className="block truncate text-[9px] font-bold uppercase tracking-[0.08em] opacity-75">{index === 0 ? "Ma" : label.weekday}</span>
                      <span className="mt-1 block font-serif text-[18px] leading-none">{label.day}</span>
                      <span className={`mx-auto mt-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-bold ${selected ? "bg-white/15 text-white" : day.items.length ? "bg-[var(--adm-sand-100)] text-[var(--adm-warm-600)]" : "bg-[var(--adm-surface)] text-[var(--adm-text-muted)]"}`}>{day.items.length}</span>
                    </button>
                  );
                })}
              </div>
              {loading ? <DashboardEmptyState title="Naptár betöltése…" icon="calendar" /> : !selectedCalendarItems.length ? <DashboardEmptyState title="Erre a napra nincs rögzített határidő." detail="Másik napot választhat a heti sávban." icon="calendar" /> : null}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--adm-border)] pt-3 text-[10px] text-[var(--adm-text-muted)]">
                <span>Csak rögzített Adminiculum-határidők.</span>
                <DashboardTextLink href="/tasks?newTask=1">Új határidős feladat</DashboardTextLink>
              </div>
            </div>
            {selectedCalendarItems.length ? (
              <div className="min-w-0">
                <div className="border-b border-[var(--adm-border)] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">{selectedCalendarDay ? formatCalendarSelection(selectedCalendarDay.date) : "Kiválasztott nap"}</p>
                </div>
                <div className="divide-y divide-[var(--adm-border)]">
                  {selectedCalendarItems.slice(0, 4).map((item) => (
                    <Link key={item.id} href={item.href || item.source.href || "/deadlines"} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-[var(--adm-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-green-800)]">
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.title}</span>
                        <span className="mt-1 block truncate text-[10px] text-[var(--adm-text-muted)]">{item.source.displayName || item.sourceType}</span>
                      </span>
                      <time className="shrink-0 text-[11px] font-semibold text-[var(--adm-warm-600)]">{formatDeadlineTime(item)}</time>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white" aria-labelledby="dashboard-communications-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
            <div>
              <h2 id="dashboard-communications-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Kommunikáció</h2>
              <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Legutóbbi tételek, opcionális ügyfélszűréssel.</p>
            </div>
            <nav aria-label="Kommunikációs nézetek" className="flex flex-wrap gap-x-4 gap-y-2"><DashboardTextLink href="/communications">Összes</DashboardTextLink><DashboardTextLink href="/communications?view=external">Külső ({externalCommunicationCount ?? "—"})</DashboardTextLink><DashboardTextLink href="/communications?view=internal">Belső ({internalCommunicationCount ?? "—"})</DashboardTextLink></nav>
          </div>
          {clientCommunicationOptions.length ? (
            <div className="flex gap-1 overflow-x-auto border-b border-[var(--adm-border)] bg-[var(--adm-surface)] px-4 py-2" aria-label="Kommunikáció szűrése ügyfél szerint">
              <button type="button" onClick={() => setSelectedClientId("")} className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold ${!selectedClientId ? "bg-[var(--adm-green-800)] text-white" : "border border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>Minden ügyfél</button>
              {clientCommunicationOptions.map((client) => <button key={client.id} type="button" onClick={() => setSelectedClientId(client.id)} className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold ${selectedClientId === client.id ? "bg-[var(--adm-green-800)] text-white" : "border border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>{client.name}</button>)}
            </div>
          ) : null}
          {!availability.communications ? (
            <DashboardEmptyState title="A kommunikációs adatok most nem érhetők el." />
          ) : dashboardCommunications.length ? (
            <div className="divide-y divide-[var(--adm-border)]">
              {dashboardCommunications.map((item) => {
                const relatedCase = item.caseId ? caseById.get(item.caseId) : null;
                const relatedClient = item.clientId ? clientById.get(item.clientId) : null;
                const audience = classifyAudience(item);
                return (
                  <Link key={item.id} href={`/communications?communicationId=${encodeURIComponent(item.id)}`} className="relative grid gap-1 px-4 py-3 pl-5 hover:bg-[var(--adm-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-green-800)] sm:grid-cols-[minmax(150px,0.7fr)_minmax(0,1.4fr)_minmax(180px,0.8fr)_auto] sm:items-center">
                    <ClientAccent colorKey={item.clientColorKey} className="absolute inset-y-0 left-0 w-1" />
                    <span className="truncate text-[11px] font-semibold text-[var(--adm-text)]">{item.senderName || item.senderEmail || item.recipientName || "Nincs forrásadat"}</span>
                    <span className="truncate text-[12px] font-semibold text-[var(--adm-blue-950)]">{item.subject || "Nincs tárgy"}</span>
                    <span className="truncate text-[10px] text-[var(--adm-text-muted)]">{relatedClient?.name || "Nincs ügyfél"}{relatedCase ? ` · ${relatedCase.caseNumber}` : ""}</span>
                    <span className="flex items-center justify-between gap-3 sm:justify-end"><span className="border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-1 text-[9px] font-semibold text-[var(--adm-text-muted)]">{audience === "external" ? "Külső" : "Belső"}</span><time className="text-[10px] text-[var(--adm-text-muted)]">{formatDateTime(item.createdAt)}</time></span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <DashboardEmptyState title={selectedClientId ? "Ehhez az ügyfélhez nincs kommunikáció." : "Nincs megjeleníthető kommunikáció."} />
          )}
        </section>

        {(recentDocuments.length > 0 || news.length > 0) ? (
          <details open={signalsExpanded} onToggle={(event) => setSignalsExpanded(event.currentTarget.open)} className="border-y border-[var(--adm-border)] bg-transparent">
            <summary aria-expanded={signalsExpanded} className="flex cursor-pointer list-none items-center justify-between gap-3 px-1 py-3 text-[12px] font-semibold text-[var(--adm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2">
              <span>További jelzések</span><DashboardIcon name="chevron" className={`h-4 w-4 transition-transform ${signalsExpanded ? "rotate-90" : ""}`} />
            </summary>
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
