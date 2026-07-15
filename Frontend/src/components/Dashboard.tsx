"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCases,
  getCommunications,
  getCurrentUser,
  getDashboardStats,
  getIntakeQueue,
  getWorkflowAgenda,
  getMyTasks,
  getNewsFeed,
  getUnreadNotificationsCount,
  type CaseListItem,
  type CommunicationItem,
  type CurrentUser,
  type DashboardStats,
  type IntakeQueueResponse,
  type TaskItem,
  type WorkflowAgendaResponse,
  type WorkflowDeadlineItem,
} from "@/lib/api";
import { toCommunicationSignal, type CommunicationSignal } from "@/lib/communicationIntake";

type NewsArticle = {
  title: string;
  source: string;
  date: string;
  url?: string;
  description?: string;
};

type NewsFeedResult = {
  articles: NewsArticle[];
  error?: string;
  isLoading: boolean;
};

type KpiCardProps = {
  label: string;
  value: number;
  tone: "green" | "navy" | "petrol" | "cyan" | "yellow" | "amber" | "orange" | "red" | "darkRed" | "neutral";
  zeroHint: string;
  href: string;
};

type KpiToneStyle = { bg: string; ink: string; light: boolean };

// Color-owned tiles: the whole tile background IS the semantic color (set inline so no
// class rule can repaint it pale). A translucent inner panel holds the count.
const KPI_STYLES: Record<KpiCardProps["tone"], KpiToneStyle> = {
  petrol: { bg: "#126782", ink: "#FFFFFF", light: false },
  navy: { bg: "#023047", ink: "#FFFFFF", light: false },
  cyan: { bg: "#219EBC", ink: "#FFFFFF", light: false },
  green: { bg: "#0A5A45", ink: "#FFFFFF", light: false },
  amber: { bg: "#FD9E02", ink: "#3E2400", light: true },
  yellow: { bg: "#FFB703", ink: "#4A3300", light: true },
  orange: { bg: "#FB8500", ink: "#FFFFFF", light: false },
  red: { bg: "#9E2A2B", ink: "#FFFFFF", light: false },
  darkRed: { bg: "#540B0E", ink: "#FFFFFF", light: false },
  neutral: { bg: "#E5E5E5", ink: "#2A2F33", light: true },
};

function KpiCard({ label, value, tone, zeroHint, href }: KpiCardProps) {
  const s = KPI_STYLES[tone];
  const panelBg = s.light ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.15)";
  const panelBorder = s.light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.26)";
  return (
    <Link href={href} className="adm-work-tile" style={{ background: s.bg, color: s.ink }}>
      <span className="adm-work-tile__label">{label}</span>
      <span className="adm-work-tile__body" style={{ background: panelBg, borderColor: panelBorder }}>
        <span className="adm-work-tile__count">{value}</span>
        <span className="adm-work-tile__caption">{value === 0 ? zeroHint : "Aktív tétel"}</span>
      </span>
    </Link>
  );
}

/**
 * Bounded intake panel (WORKFLOW-CORE-INTAKE-MATTER-OPENING-1): my intakes
 * requiring attention, ready/blocked counts, next few items, link to /intake.
 * Uses the canonical intake API; renders nothing when there is no intake work.
 */
function DashboardIntakePanel() {
  const [queue, setQueue] = useState<IntakeQueueResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getIntakeQueue({ scope: "MY_INTAKES", limit: 5 })
      .then((response) => {
        if (!cancelled) setQueue(response);
      })
      .catch(() => {
        if (!cancelled) setQueue(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!queue || queue.summary.total === 0) return null;

  return (
    <section>
      <article className="adm-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3 lg:px-5">
          <div>
            <p className="adm-kicker text-[var(--adm-green-800)]">Ügyfelvétel</p>
            <h3 className="adm-heading mt-0.5 text-[20px] leading-tight">Beérkezési sor</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-text-muted)]">
              Aktiválható: {queue.summary.readyForActivation}
            </span>
            <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-text-muted)]">
              Hiányos: {queue.summary.blocked}
            </span>
            <Link href="/intake" className="adm-link-button px-3 py-1.5 text-[11px]">
              Ügyfelvételi sor
            </Link>
          </div>
        </div>
        <ul className="divide-y divide-[var(--adm-border)]">
          {queue.items.slice(0, 5).map((item) => (
            <li key={item.caseId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-5">
              <div className="min-w-0">
                <Link href={item.href} className="text-[12px] font-semibold text-[var(--adm-text)] hover:underline">
                  {item.displayName}
                </Link>
                <p className="text-[10.5px] text-[var(--adm-text-muted)]">
                  {item.nextStep ? item.nextStep.label : "Aktiválásra kész"}
                </p>
              </div>
              <span className="text-[10.5px] font-semibold text-[var(--adm-text-soft)]">
                {item.readiness.completedRequiredItems}/{item.readiness.totalRequiredItems}
              </span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

function initials(name: string): string {
  const parts = name
    .split(" ")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "--";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function displayDate(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("hu-HU", { month: "2-digit", day: "2-digit" });
}

function displayDateTimeShort(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapRecentDocLabel(input?: string | null): string {
  const value = (input || "").toUpperCase();
  if (!value) return "Feltöltött dokumentum";
  if (value.includes("DOCUMENT_UPLOADED")) return "Feltöltött dokumentum";
  if (value.includes("DOCUMENT_DOWNLOADED")) return "Letöltött dokumentum";
  if (value.includes("DOCUMENT_UPDATED")) return "Frissített dokumentum";
  if (value.includes("WORKSPACE")) return "Munkapéldány esemény";
  if (value.includes("HANDOFF")) return "Leadási csomag esemény";
  if (value.includes("REVIEW")) return "Review dokumentum";
  return "Feltöltött dokumentum";
}

function isLegalSignal(article: NewsArticle): boolean {
  const text = `${article.title || ""} ${article.description || ""} ${article.source || ""}`.toLowerCase();
  const legalTokens = [
    "jogi",
    "jog",
    "regul",
    "compliance",
    "court",
    "bírós",
    "adó",
    "tax",
    "gdpr",
    "kormány",
    "eu",
    "m&a",
    "vállalat",
    "piac",
    "gazdas",
    "törvény",
    "rendelet",
    "jogszab",
  ];
  return legalTokens.some((token) => text.includes(token));
}

function mapTaskBucket(task: TaskItem): "review" | "waiting" | "depends" | "urgent" | "ready" | "done" {
  const status = (task.status || "").toUpperCase();
  if (["COMPLETED", "DONE", "APPROVED", "FINALIZED"].includes(status)) return "done";
  if (["SUBMITTED", "REVIEW_NEEDED", "IN_REVIEW"].includes(status)) return "review";
  if (["READY", "READY_FOR_HANDOFF"].includes(status)) return "ready";
  if (["BLOCKED", "WAITING", "PENDING_CLIENT"].includes(status)) return "depends";
  if (task.dueDate) {
    const due = new Date(task.dueDate).getTime();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (!Number.isNaN(due) && due - now <= dayMs) return "urgent";
  }
  return "waiting";
}

function humanizeDashboardError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes("authentication token") || value.includes("unauthorized") || value.includes("401")) {
    return "A munkamenet frissítése szükséges. Jelentkezz be újra, vagy frissítsd az oldalt.";
  }
  if (value.includes("failed to fetch") || value.includes("network")) {
    return "A dashboard adatai most nem érhetők el. Próbáld újra pár perc múlva.";
  }
  return "A dashboard fő adatai átmenetileg nem érhetők el.";
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="adm-board-empty adm-board-empty-compact p-3 text-left">
      <p className="text-xs font-semibold text-[var(--adm-text)]">{title}</p>
      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{subtitle}</p>
    </div>
  );
}

// Read-only communication row (real data shape: sender, subject, metadata, status chip).
function CommRow({ sig, family }: { sig: CommunicationSignal; family: "external" | "internal" }) {
  const rail = family === "external" ? "#219EBC" : "#126782";
  const sender = sig.senderName || sig.senderEmail || (family === "external" ? "Külső fél" : "Belső");
  const tag = sig.proposedClientName || sig.proposedCaseTitle || (sig.proposedCaseId ? "Ügyhöz rendelve" : null);
  return (
    <div className="flex items-stretch gap-2.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-2.5 shadow-[0_1px_0_rgba(2,48,71,0.04)] transition-colors hover:bg-[#F7FBFD]">
      <span className="w-1.5 shrink-0 rounded-full" style={{ backgroundColor: rail }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-bold text-[var(--adm-text)]">{sender}</p>
          <span className="shrink-0 text-[9px] text-[var(--adm-text-soft)]">{sig.receivedAt ? displayDateTimeShort(sig.receivedAt) : ""}</span>
        </div>
        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--adm-text)]">{sig.subject}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {tag ? (
            <span className="inline-flex max-w-[140px] truncate rounded-full bg-[var(--adm-blue-100)]/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--adm-blue-700)]">{tag}</span>
          ) : (
            <span className="inline-flex rounded-full bg-[var(--adm-ivory-100)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--adm-text-soft)]">Nincs ügyfél/ügy</span>
          )}
          {sig.hasAttachments ? <span className="inline-flex rounded-full bg-[var(--adm-ivory-100)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--adm-text-muted)]">Melléklet</span> : null}
          {sig.requiresReview ? (
            <span className="ml-auto inline-flex rounded-full bg-[#FFF3CB] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--adm-warm-600)]">Besorolás</span>
          ) : (
            <span className="ml-auto inline-flex rounded-full bg-[#E7F6EA] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--adm-green-800)]">Besorolva</span>
          )}
        </div>
      </div>
    </div>
  );
}

function NewsRow({ article }: { article: NewsArticle }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-[3px] border-l-[var(--adm-green-800)] bg-white p-2.5">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-semibold text-[var(--adm-text)]">{article.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--adm-text-muted)]">
          <span className="inline-flex rounded-full bg-[var(--adm-blue-100)]/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--adm-blue-700)]">{article.source || "Forrás"}</span>
          <span className="inline-flex rounded-full bg-[var(--adm-green-800)]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--adm-green-800)]">Jogi jelzés</span>
          <span>{article.date}</span>
        </p>
      </div>
      {article.url ? (
        <a href={article.url} target="_blank" rel="noreferrer" className="shrink-0 self-center rounded-[var(--adm-radius-sm)] border border-[var(--adm-border-strong)] px-2.5 py-1 text-[10px] font-semibold text-[var(--adm-green-800)] hover:bg-[var(--adm-blue-100)]/20">
          Megnyitás
        </a>
      ) : null}
    </div>
  );
}

export function Dashboard() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agenda, setAgenda] = useState<WorkflowAgendaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [legalNews, setLegalNews] = useState<NewsFeedResult>({ articles: [], isLoading: true });
  const [localWorkspaceDraftCount, setLocalWorkspaceDraftCount] = useState(0);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setWarnings([]);
    setError(null);

    try {
      const me = await getCurrentUser();
      setCurrentUser(me);

      const [comm, myTasks, myCases, dashboardStats, workflowAgenda] = await Promise.all([
        getCommunications({ limit: 8 }).catch(() => null),
        getMyTasks().catch(() => null),
        getCases(1, 12, me.id).catch(() => null),
        getDashboardStats().catch(() => null),
        getWorkflowAgenda({ scope: "MY_WORK", status: "OPEN", limit: 8 }).catch(() => null),
      ]);

      const nextWarnings: string[] = [];

      if (comm) setCommunications(comm.communications || []);
      else {
        setCommunications([]);
        nextWarnings.push("Kommunikációs feed átmenetileg nem érhető el.");
      }

      if (myTasks) setTasks(myTasks);
      else {
        setTasks([]);
        nextWarnings.push("Feladatlista átmenetileg nem érhető el.");
      }

      if (myCases) setCases(myCases.data || []);
      else {
        setCases([]);
        nextWarnings.push("Ügylista átmenetileg nem érhető el.");
      }

      if (dashboardStats) setStats(dashboardStats);
      else {
        setStats(null);
        nextWarnings.push("Dashboard statisztikák most nem érhetők el.");
      }

      if (workflowAgenda) setAgenda(workflowAgenda);
      else {
        setAgenda(null);
        nextWarnings.push("Agenda határidőnézet átmenetileg nem érhető el.");
      }

      setWarnings(nextWarnings);

      if (!myTasks && !myCases && !dashboardStats && !workflowAgenda) {
        setError("A dashboard fő adatai nem érhetők el.");
      }
    } catch (e) {
      setError(humanizeDashboardError(e instanceof Error ? e.message : ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const run = async () => {
      try {
        const result = await getNewsFeed("legal");
        setLegalNews({ articles: result.articles || [], error: result.error, isLoading: false });
      } catch {
        setLegalNews({
          articles: [],
          error: "A hírfeed most nem érhető el.",
          isLoading: false,
        });
      }
    };
    run();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const localDraftCount = Array.from({ length: window.localStorage.length }).filter((_, index) => {
        const key = window.localStorage.key(index);
        return key?.startsWith("adminiculum:litigation-workspace:local-draft:v1:");
      }).length;
      setLocalWorkspaceDraftCount(localDraftCount);
    } catch {
      setLocalWorkspaceDraftCount(0);
    }
  }, []);

  const activeCase = cases[0] || null;
  const reviewQueue = tasks.filter((task) => mapTaskBucket(task) === "review").slice(0, 6);

  const upcomingDeadlines = useMemo<WorkflowDeadlineItem[]>(() => {
    return (agenda?.days || []).flatMap((day) => day.items).slice(0, 8);
  }, [agenda]);

  const recentDocuments = useMemo(() => {
    if (!stats?.recentActivity?.length) return [] as DashboardStats["recentActivity"];
    return stats.recentActivity
      .filter((item) => /document|dokument/i.test(item.type || "") || /dokument|fájl|file/i.test(item.text || ""))
      .slice(0, 5);
  }, [stats]);

  const legalSignals = useMemo(() => {
    if (!legalNews.articles.length) return [];
    return legalNews.articles.filter(isLegalSignal).slice(0, 8);
  }, [legalNews.articles]);

  const homeOfficeFocusTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const bucket = mapTaskBucket(task);
        return bucket === "urgent" || bucket === "review" || bucket === "waiting" || bucket === "depends";
      })
      .slice(0, 3);
  }, [tasks]);

  const reviewDocumentCount = stats?.stats.inReview ?? reviewQueue.length;

  const openTasks = useMemo(() => tasks.filter((task) => mapTaskBucket(task) !== "done"), [tasks]);

  const attentionCases = useMemo(() => {
    return cases
      .filter((caseItem) => {
        const priority = (caseItem.priority || "").toUpperCase();
        return Boolean(caseItem.deadline) || priority === "HIGH" || priority === "URGENT";
      })
      .slice(0, 3);
  }, [cases]);

  const nextWorkCards = useMemo(() => {
    const focusTask = homeOfficeFocusTasks[0] || openTasks[0] || null;
    const focusCase = attentionCases[0] || cases[0] || null;
    const focusDocument = recentDocuments[0] || null;

    const cards: Array<{
      id: string;
      label: string;
      title: string;
      detail: string;
      href: string;
      action: string;
    }> = [];

    if (focusTask) {
      cards.push({
        id: `next-task-${focusTask.id}`,
        label: "Első teendő",
        title: focusTask.title,
        detail: focusTask.dueDate
          ? `${focusTask.case?.caseNumber || "Feladat"} · Határidő: ${displayDate(focusTask.dueDate)}`
          : `${focusTask.case?.caseNumber || "Feladat"} · Nincs megadott határidő`,
        href: `/tasks?taskId=${focusTask.id}`,
        action: "Feladat megnyitása",
      });
    }

    if (focusCase) {
      cards.push({
        id: `next-case-${focusCase.id}`,
        label: "Aktív ügy",
        title: focusCase.title || focusCase.caseNumber,
        detail: focusCase.deadline
          ? `${focusCase.caseNumber || "Ügy"} · Határidő: ${displayDate(focusCase.deadline)}`
          : `${focusCase.caseNumber || "Ügy"} · Meglévő ügyadatból`,
        href: `/cases/${focusCase.id}`,
        action: "Ügy megnyitása",
      });
    }

    if (focusDocument) {
      cards.push({
        id: `next-document-${focusDocument.id}`,
        label: "Dokumentumjelzés",
        title: mapRecentDocLabel(focusDocument.type || focusDocument.text),
        detail: `Meglévő dokumentum aktivitás · ${displayDateTimeShort(focusDocument.timestamp)}`,
        href: focusDocument.caseId ? `/documents/compare?caseId=${focusDocument.caseId}` : "/documents/compare",
        action: "Dokumentum-ellenőrzés folytatása",
      });
    }

    if (localWorkspaceDraftCount > 0) {
      cards.push({
        id: "next-litigation-local-draft",
        label: "Helyi böngészős vázlat",
        title: `${localWorkspaceDraftCount} helyi peres munkavázlat`,
        detail: "Csak ezen az eszközön elérhető helyi jelzés.",
        href: "/litigation-workspace",
        action: "Peres munkatér folytatása",
      });
    }

    return cards.slice(0, 4);
  }, [attentionCases, cases, homeOfficeFocusTasks, localWorkspaceDraftCount, openTasks, recentDocuments]);

  const quickOpenLinks = [
    { href: "/cases", label: "Ügyek", description: "Aktív ügyek és új ügy indítása" },
    { href: "/tasks", label: "Feladatok", description: "Mai teendők és review sor" },
    { href: "/workload", label: "Munkateher", description: "Felelősség, feladat és rögzített idő" },
    { href: "/documents/compare", label: "Dokumentum-review", description: "Összevetés és szerződésmunka" },
    { href: "/litigation-workspace", label: "Peres munkatér", description: "Stratégiai peres jegyzetek" },
  ];

  const greetingName = currentUser?.name || "dr. Hubay Máté";
  const isSparseFocus = nextWorkCards.length <= 1;

  // System / work-session state for the dark "Mai működési kép" panel (not a KPI duplicate).
  const taskListAvailable = !warnings.includes("Feladatlista átmenetileg nem érhető el.");
  const documentSignalCount = recentDocuments.length;

  // KPI rubrikák — distinct categories, existing computed counts only.
  const openCasesCount = useMemo(
    () => cases.filter((item) => String(item.status || "").toUpperCase() === "OPEN").length,
    [cases],
  );

  const communicationSignals = useMemo<CommunicationSignal[]>(
    () =>
      communications.map((item) =>
        toCommunicationSignal({
          id: item.id,
          type: item.type,
          subject: item.subject,
          senderName: item.senderName,
          senderEmail: item.senderEmail,
          recipientEmail: item.recipientEmail,
          summary: item.summary,
          caseId: item.caseId,
          clientId: item.clientId,
          createdAt: item.createdAt,
          case: item.case,
          client: item.client ? { id: item.client.id, name: item.client.name } : null,
          attachmentCount: item.attachmentCount,
        }),
      ),
    [communications],
  );
  const externalComms = useMemo(() => communicationSignals.filter((s) => s.audience === "external"), [communicationSignals]);
  const internalComms = useMemo(() => communicationSignals.filter((s) => s.audience === "internal"), [communicationSignals]);

  const maiSorItems = useMemo(() => {
    const items: Array<{ id: string; kind: string; title: string; detail: string; href: string }> = [];
    const review = reviewQueue[0];
    if (review) {
      items.push({
        id: `mai-review-${review.id}`,
        kind: "Review",
        title: review.title,
        detail: `${review.case?.caseNumber || "Review tétel"} · Határidő: ${displayDate(review.dueDate)}`,
        href: `/tasks?taskId=${review.id}`,
      });
    }
    const deadline = upcomingDeadlines.find((item) => item.status === "OPEN");
    if (deadline) {
      items.push({
        id: `mai-deadline-${deadline.sourceId}`,
        kind: "Határidő",
        title: deadline.title,
        detail: `${displayDate(deadline.dueAt)} · ${deadline.source.displayName || deadline.sourceType}`,
        href: deadline.href || deadline.source.href || "/deadlines",
      });
    }
    const importantCommunication = externalComms.find((signal) => signal.requiresReview) || externalComms[0];
    if (importantCommunication) {
      items.push({
        id: `mai-communication-${importantCommunication.id}`,
        kind: "Kommunikáció",
        title: importantCommunication.subject,
        detail: `${importantCommunication.senderName || importantCommunication.senderEmail || "Külső fél"} · kommunikációs munkatér`,
        href: "/notifications?view=external",
      });
    }
    return items;
  }, [externalComms, reviewQueue, upcomingDeadlines]);

  const watchedClientExamples = ["BlackBelt", "Saubermacher", "Bálintfy"];
  const clientLinkedComms = useMemo(
    () => communicationSignals.filter((s) => s.proposedClientName).slice(0, 4),
    [communicationSignals],
  );
  const agendaItems = useMemo(
    () =>
      upcomingDeadlines.slice(0, 5).map((item) => ({
        id: item.id,
        title: item.title,
        date: item.dueAt,
        caseNumber: item.source.displayName || item.sourceType,
        href: item.href || item.source.href || "/deadlines",
        urgent: item.urgency === "OVERDUE" || item.urgency === "TODAY",
        label: item.urgency === "OVERDUE" ? "Lejárt" : item.urgency === "TODAY" ? "Ma" : "Határidő",
      })),
    [upcomingDeadlines],
  );
  return (
    <div className="adm-dash-stage min-h-full px-3 pb-4 pt-3 sm:px-5 xl:px-6">
      <div className="mx-auto w-full max-w-[1440px] space-y-2.5">
        {/* 1 + 2 — Command-center hero with dark "Mai működési kép" status column */}
        <section className="adm-command-hero">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_318px]">
            <div className="flex min-h-[118px] flex-col justify-between p-4 lg:px-5 lg:py-4">
              <div>
                <p className="adm-kicker">Adminiculum · Műszerfal</p>
                <h1 className="adm-hero-title mt-1 max-w-4xl text-[clamp(30px,3.6vw,46px)] leading-[0.94]">
                  Napi munkapad
                </h1>
                <p className="mt-1.5 max-w-3xl text-[12px] leading-4 text-[var(--adm-text-muted)]">
                  Jó reggelt, {greetingName}. A következő ügy, feladat és dokumentumjelzés egyetlen munkasorban.
                </p>
              </div>

              <div className="mt-2.5">
                {error ? (
                  <div className="mb-4 rounded-[var(--adm-radius-sm)] border border-[var(--adm-terracotta-100)] bg-[var(--adm-terracotta-100)] px-3 py-2 text-xs text-[var(--adm-terracotta-700)]">
                    {error}
                  </div>
                ) : warnings.length > 0 ? (
                  <div className="mb-4 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-xs text-[var(--adm-text-muted)]">
                    {warnings.slice(0, 2).join(" ")}
                  </div>
                ) : null}
                <div className="adm-action-row text-xs">
                  <Link href="/cases?newCase=1" className="adm-link-button adm-link-button-primary px-3.5 py-2.5">
                    Új ügy
                  </Link>
                  <Link
                    href={activeCase ? `/cases/${activeCase.id}/documents` : "/cases"}
                    className="adm-link-button adm-action-secondary px-3.5 py-2.5"
                  >
                    Dokumentum feltöltése
                  </Link>
                  <Link href="/reviews" className="adm-link-button adm-action-secondary px-3.5 py-2.5">
                    Review sor
                  </Link>
                  <Link href="/tasks" className="adm-link-button adm-action-secondary px-3.5 py-2.5">
                    Mai sor
                  </Link>
                </div>
              </div>
            </div>

            <aside className="adm-dark-status flex flex-col gap-2 border-t border-white/10 p-3 xl:border-l xl:border-t-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--adm-blue-100)]">
                Mai működési kép
              </p>
              <p className="text-[10.5px] leading-4 text-[var(--adm-ivory-100)]/60">
                Munkamenet- és rendszerállapot — nem munkaszámláló.
              </p>
              <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
                <div className="adm-stat-box flex items-center justify-between gap-2 p-2.5">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-blue-100)]">Feladatlista</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--adm-ivory-100)]/80">
                      {loading ? "Betöltés…" : taskListAvailable ? "Elérhető" : "Átmenetileg nem elérhető"}
                    </p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${loading ? "bg-[var(--adm-blue-100)]" : taskListAvailable ? "bg-[var(--adm-blue-500)]" : "bg-[var(--adm-warm-600)]"}`} />
                </div>
                <div className="adm-stat-box flex items-center justify-between gap-2 p-2.5">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-blue-100)]">Dokumentumfigyelés</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--adm-ivory-100)]/80">
                      {documentSignalCount === 0 ? "Nincs új jelzés" : `${documentSignalCount} jelzés`}
                    </p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${documentSignalCount === 0 ? "bg-[var(--adm-blue-100)]" : "bg-[var(--adm-warm-400)]"}`} />
                </div>
                <div className="adm-stat-box flex items-center justify-between gap-2 p-2.5">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-blue-100)]">Helyi munkamenet</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--adm-ivory-100)]/80">
                      {localWorkspaceDraftCount === 0 ? "Nincs helyi vázlat" : `${localWorkspaceDraftCount} helyi vázlat`}
                    </p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${localWorkspaceDraftCount === 0 ? "bg-[var(--adm-blue-100)]" : "bg-[var(--adm-blue-500)]"}`} />
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* 3 — Work-section tile dock: fully colored semantic navigation tiles */}
        <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Nyitott ügyek" value={openCasesCount} tone="petrol" zeroHint="Nincs betöltött nyitott ügy" href="/cases" />
          <KpiCard label="Mai teendők" value={openTasks.length} tone="amber" zeroHint="Nincs nyitott teendő" href="/tasks" />
          <KpiCard label="Közeli határidők" value={upcomingDeadlines.length} tone="yellow" zeroHint="Nincs közeli határidő" href="/deadlines" />
          <KpiCard label="Review tételek" value={reviewDocumentCount} tone="navy" zeroHint="Nincs review tétel" href="/reviews" />
          <KpiCard label="Külső kommunikáció" value={externalComms.length} tone="cyan" zeroHint="Nincs új külső jelzés" href="/notifications?view=external" />
          <KpiCard label="Belső kommunikáció" value={internalComms.length} tone="petrol" zeroHint="Nincs új belső jelzés" href="/notifications?view=internal" />
        </section>

        {/* 3b — Bounded intake panel (renders only when intake work exists) */}
        <DashboardIntakePanel />

        {/* 4 + 5 — Dominant "Itt folytasd" workbench + review/handoff side column */}
        <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.38fr)_minmax(330px,0.72fr)]">
          <article className={`adm-panel adm-panel-primary adm-panel-accent-green adm-focus-panel ${isSparseFocus ? "p-4 pl-5" : "p-4 pl-5 lg:p-5 lg:pl-6"}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="adm-kicker text-[var(--adm-green-800)]">Elsődleges munkasor</p>
                <h2 className="adm-heading mt-1 text-[28px] leading-tight">Itt folytasd</h2>
                <p className="mt-1 max-w-3xl text-[11.5px] leading-5 text-[var(--adm-text-muted)]">
                  A legjobb következő nyitási pont: feladat, ügy vagy dokumentum — közvetlenül a megfelelő munkatérbe.
                </p>
              </div>
              <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1 text-[11px] font-semibold text-[#6B4B14]">
                {nextWorkCards.length === 0 ? "Nincs javaslat" : "Következő lépés"}
              </span>
            </div>

            {loading ? <p className="mt-4 text-xs text-[var(--adm-text-muted)]">Fókuszjavaslatok betöltése...</p> : null}
            {!loading && nextWorkCards.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="Nincs kiemelt fókuszfeladat"
                  subtitle="Nincs olyan betöltött ügy, feladat vagy dokumentumjelzés, amely most külön figyelmet kér."
                />
              </div>
            ) : null}

            <div className={`mt-3 grid gap-2 ${isSparseFocus ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
              {nextWorkCards.map((card) => (
                <Link
                  key={card.id}
                  href={card.href}
                  className="adm-board-list-row border-l-4 border-l-[var(--adm-green-800)] p-3"
                >
                  <span className="inline-flex rounded-full bg-[#EAF3EE] px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-[var(--adm-green-800)]">{card.label}</span>
                  <p className="mt-1.5 text-sm font-semibold text-[var(--adm-text)]">{card.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--adm-text-muted)]">{card.detail}</p>
                  <span className="mt-2.5 inline-flex items-center gap-1 rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-800)] px-3 py-1.5 text-[11px] font-bold text-[var(--adm-ivory-50)]">
                    {card.action} <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ))}
            </div>
          </article>

          <aside className="grid content-start gap-3">
            <article className="adm-panel adm-panel-accent-amber adm-daily-panel p-3.5">
              <p className="adm-kicker text-[var(--adm-warm-600)]">Mai sor</p>
              <h3 className="adm-heading mt-1 text-[24px]">Review · határidő · kommunikáció</h3>
              {loading ? <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Betöltés...</p> : null}
              {!loading && maiSorItems.length === 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="adm-board-empty adm-board-empty-compact">
                    <p className="text-xs font-semibold text-[var(--adm-text)]">Üres a mai sor</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Review-, határidős és fontos kommunikációs tételek itt jelennek meg.</p>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 space-y-2">
                {maiSorItems.map((item) => {
                  const kindClass =
                    item.kind === "Review"
                      ? "bg-[#E8F0F4] text-[var(--adm-blue-950)]"
                      : item.kind === "Határidő"
                      ? "bg-[#FFF3CB] text-[#8a5a06]"
                      : "bg-[#E6F6FA] text-[var(--adm-blue-700)]";
                  const kindBorder =
                    item.kind === "Review"
                      ? "border-l-[var(--adm-blue-950)]"
                      : item.kind === "Határidő"
                      ? "border-l-[var(--adm-warm-400)]"
                      : "border-l-[var(--adm-blue-500)]";
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`block rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 ${kindBorder} bg-[var(--adm-surface)] p-3 hover:bg-white`}
                    >
                      <span className={`inline-flex rounded px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] ${kindClass}`}>{item.kind}</span>
                      <p className="mt-1.5 text-xs font-semibold text-[var(--adm-text)]">{item.title}</p>
                      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.detail}</p>
                    </Link>
                  );
                })}
              </div>
            </article>

          </aside>
        </section>

        {/* 6 — Kommunikációs figyelő: dominant full-width workbench (8 external + 8 internal capacity) */}
        <section>
          <article className="adm-panel adm-panel-primary overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-[var(--adm-blue-500)] bg-[var(--adm-blue-100)]/20 px-4 py-3 lg:px-5">
              <div>
                <p className="adm-kicker text-[var(--adm-blue-700)]">Kommunikáció</p>
                <h3 className="adm-heading mt-0.5 text-[24px] leading-tight">Kommunikációs figyelő</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-500)]/30 bg-[var(--adm-blue-100)]/35 px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-blue-700)]">
                  {Math.min(communicationSignals.length, 16)}/16 jelzés
                </span>
                <Link href="/notifications" className="adm-link-button px-3 py-1.5 text-[11px]">
                  Munkatér
                </Link>
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2 lg:px-5">
              <div className="adm-signal-card rounded-[var(--adm-radius-sm)] border-l-[3px] border-l-[var(--adm-blue-500)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-blue-700)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--adm-blue-500)]" />Külső kommunikáció</p>
                  <span className="text-[9.5px] font-semibold text-[var(--adm-text-soft)]">{Math.min(externalComms.length, 8)}/8</span>
                </div>
                {externalComms.length === 0 ? (
                  <div className="mt-2 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-white/75 p-2.5">
                    <p className="text-[10.5px] leading-4 text-[var(--adm-text-muted)]">Nincs új külső kommunikáció. A panel legfeljebb 8 levélelőnézetet mutat: feladó, tárgy, ügyfél/ügy, státusz.</p>
                  </div>
                ) : null}
                <div className={externalComms.length > 0 ? "mt-2 space-y-1.5" : "hidden"}>
                  {externalComms.slice(0, 8).map((sig) => <CommRow key={sig.id} sig={sig} family="external" />)}
                </div>
                <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Kapacitás: 8 levélelőnézet</p>
              </div>
              <div className="adm-signal-card rounded-[var(--adm-radius-sm)] border-l-[3px] border-l-[var(--adm-blue-700)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-blue-700)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--adm-blue-700)]" />Belső kommunikáció</p>
                  <span className="text-[9.5px] font-semibold text-[var(--adm-text-soft)]">{Math.min(internalComms.length, 8)}/8</span>
                </div>
                {internalComms.length === 0 ? (
                  <div className="mt-2 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-white/75 p-2.5">
                    <p className="text-[10.5px] leading-4 text-[var(--adm-text-muted)]">Nincs új belső kommunikáció. A panel legfeljebb 8 belső jelzést mutat: feladó, tárgy, ügy/ügyfél, státusz.</p>
                  </div>
                ) : null}
                <div className={internalComms.length > 0 ? "mt-2 space-y-1.5" : "hidden"}>
                  {internalComms.slice(0, 8).map((sig) => <CommRow key={sig.id} sig={sig} family="internal" />)}
                </div>
                <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Kapacitás: 8 belső jelzés</p>
              </div>
            </div>
          </article>
        </section>

        {/* 7 — Hírek/jelzések (wide, 8-capacity) + attention/watch rail */}
        <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.66fr)]">
          <article className="adm-panel adm-panel-accent-green overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--adm-border)] bg-[var(--adm-green-800)]/[0.04] px-4 py-3 lg:px-5">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--adm-green-800)]" />
                <div>
                  <p className="adm-kicker text-[var(--adm-green-800)]">Kitekintés</p>
                  <h3 className="adm-heading mt-0.5 text-[22px]">Hírek / jogi-piaci jelzések</h3>
                </div>
              </div>
              <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-text-muted)]">{Math.min(legalSignals.length, 8)}/8 jelzés</span>
            </div>
            <div className="p-4 lg:px-5">
              {legalNews.isLoading ? <p className="text-xs text-[var(--adm-text-soft)]">Hírfeed betöltése...</p> : null}
              {!legalNews.isLoading && (legalNews.error || legalSignals.length === 0) ? (
                <p className="rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-2.5 text-[11px] text-[var(--adm-text-muted)]">
                  Nincs elérhető jogi-piaci jelzés a jelenlegi nézetben.
                </p>
              ) : null}
              <div className="grid gap-1.5 md:grid-cols-2">
                {legalSignals.slice(0, 8).map((article, index) => <NewsRow key={`${article.title}-${index}`} article={article} />)}
              </div>
              <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Kapacitás: 8 jogi jelzés · valós forrásokból</p>
            </div>
          </article>

          <aside className="grid content-start gap-3">
            <article className="adm-panel adm-rail-panel p-3.5" style={{ borderTop: "3px solid var(--adm-blue-500)" }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="adm-kicker text-[var(--adm-blue-700)]">Kiemelt ügyfélkör</p>
                  <h3 className="adm-heading mt-0.5 text-[20px]">Ügyfélhez sorolt kommunikáció</h3>
                </div>
                <Link href="/notifications?view=clients" className="adm-link-button px-2.5 py-1.5 text-[10.5px]">
                  Munkatér
                </Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {watchedClientExamples.map((name) => (
                  <span key={name} className="adm-watch-chip">{name}</span>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                {clientLinkedComms.length === 0 ? (
                  <p className="rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-2.5 text-[10.5px] leading-4 text-[var(--adm-text-muted)]">
                    Nincs ügyfélhez sorolt kommunikáció a jelenlegi nézetben. Itt csak valós ügyfélkapcsolattal érkező read-only tételek jelennek meg.
                  </p>
                ) : (
                  clientLinkedComms.map((sig) => (
                    <div key={sig.id} className="flex items-start gap-2.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-[3px] border-l-[var(--adm-blue-500)] bg-white p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-[var(--adm-blue-700)]">{sig.proposedClientName}</p>
                        <p className="truncate text-xs font-semibold text-[var(--adm-text)]">{sig.subject}</p>
                        <p className="mt-0.5 truncate text-[10px] text-[var(--adm-text-muted)]">{sig.senderName || sig.senderEmail || "Feladó"}{sig.receivedAt ? ` · ${displayDateTimeShort(sig.receivedAt)}` : ""}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--adm-blue-100)]/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--adm-blue-700)]">Besorolva</span>
                    </div>
                  ))
                )}
              </div>
            </article>
          </aside>
        </section>

        {/* 8 — Secondary operational rail: agenda (replaces duplicate deadlines), documents, quick open */}
        <section className="grid items-start gap-3 xl:grid-cols-3">
          <article className="adm-panel adm-panel-accent-amber adm-rail-panel p-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
              <div>
                <p className="adm-kicker text-[var(--adm-warm-600)]">Naptár</p>
                <h3 className="adm-heading mt-0.5 text-[20px]">Naptár / agenda</h3>
              </div>
              <Link href="/deadlines" className="adm-link-button px-3 py-1.5 text-[11px]">Határidők</Link>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {agendaItems.length === 0 ? (
                <div className="adm-board-empty adm-board-empty-compact">
                  <p className="text-xs font-semibold text-[var(--adm-text)]">Nincs mai naptári esemény a jelenlegi nézetben.</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Később tárgyalások, határidők és belső egyeztetések jelennek meg itt.</p>
                </div>
              ) : (
                <>
                  {agendaItems.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`block rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 bg-white p-2.5 ${item.urgent ? "border-l-[var(--adm-critical-600)] hover:bg-[#FBEDED]" : "border-l-[var(--adm-warm-400)] hover:bg-[#FFF9E8]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold text-[var(--adm-text)]">{item.title}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] ${item.urgent ? "bg-[#F4DADA] text-[var(--adm-critical-600)]" : "bg-[#FFF3CB] text-[var(--adm-warm-600)]"}`}>{item.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{displayDate(item.date)} · {item.caseNumber}</p>
                    </Link>
                  ))}
                  <p className="text-[10px] text-[var(--adm-text-muted)]">A lista a backend agenda szerződésből érkező saját nyitott határidőket mutatja.</p>
                </>
              )}
            </div>
          </article>

          <article className="adm-panel adm-panel-accent-navy adm-rail-panel p-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
              <div>
                <p className="adm-kicker text-[var(--adm-blue-950)]">Dokumentum</p>
                <h3 className="adm-heading mt-0.5 text-[20px]">Legutóbbi dokumentumok</h3>
              </div>
              <Link href="/documents/compare" className="adm-link-button px-3 py-1.5 text-[11px]">Összevetés</Link>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {recentDocuments.length === 0 ? (
                <EmptyState title="Nincs dokumentum előzmény" subtitle="A legfrissebb feltöltések és módosítások itt jelennek meg." />
              ) : null}
              {recentDocuments.slice(0, 4).map((item) => (
                <Link key={item.id} href={item.caseId ? `/documents/compare?caseId=${item.caseId}` : "/documents/compare"} className="flex items-start gap-2.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-2.5 hover:bg-[#EEF6FA]">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--adm-blue-950)]/10 text-[8px] font-bold uppercase tracking-tight text-[var(--adm-blue-950)]">DOC</span>
                  <span>
                    <span className="block font-semibold text-[var(--adm-text)]">{mapRecentDocLabel(item.type || item.text)}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--adm-text-muted)]">{displayDateTimeShort(item.timestamp)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </article>

          <article className="adm-panel adm-rail-panel p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--adm-border)] pb-3">
              <div>
                <p className="adm-kicker text-[var(--adm-green-800)]">Továbblépés</p>
                <h3 className="adm-heading mt-0.5 text-[20px]">Gyors megnyitás</h3>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {quickOpenLinks.map((link, i) => {
                const marker = ["var(--adm-green-800)", "var(--adm-blue-950)", "var(--adm-warm-500)", "#000000"][i % 4];
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-2 hover:bg-[var(--adm-blue-100)]/25"
                  >
                    <span className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: marker }} />
                    <span className="flex-1">
                      <span className="block text-xs font-semibold text-[var(--adm-text)]">{link.label}</span>
                      <span className="mt-0.5 block text-[10.5px] text-[var(--adm-text-muted)]">{link.description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
