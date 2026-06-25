"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  getCases,
  getCommunications,
  getCurrentUser,
  getDashboardStats,
  getMyTasks,
  getNewsFeed,
  getUnreadNotificationsCount,
  type CaseListItem,
  type CommunicationItem,
  type CurrentUser,
  type DashboardStats,
  type TaskItem,
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
};

type KpiToneStyle = { accent: string; bar: string; dot: string; surface: string; num: string };

const KPI_STYLES: Record<KpiCardProps["tone"], KpiToneStyle> = {
  green: { accent: "#014337", bar: "bg-[var(--adm-green-800)]", dot: "bg-[var(--adm-green-800)]", surface: "bg-[#EAF3EE]", num: "text-[var(--adm-green-900)]" },
  navy: { accent: "#023047", bar: "bg-[var(--adm-blue-950)]", dot: "bg-[var(--adm-blue-950)]", surface: "bg-[#E8F0F4]", num: "text-[var(--adm-blue-950)]" },
  petrol: { accent: "#126782", bar: "bg-[var(--adm-blue-700)]", dot: "bg-[var(--adm-blue-700)]", surface: "bg-[#E5F2F6]", num: "text-[var(--adm-blue-700)]" },
  cyan: { accent: "#219EBC", bar: "bg-[var(--adm-blue-500)]", dot: "bg-[var(--adm-blue-500)]", surface: "bg-[#E6F6FA]", num: "text-[var(--adm-blue-700)]" },
  yellow: { accent: "#FFB703", bar: "bg-[var(--adm-warm-400)]", dot: "bg-[var(--adm-warm-400)]", surface: "bg-[#FFF3CB]", num: "text-[var(--adm-warm-600)]" },
  amber: { accent: "#FD9E02", bar: "bg-[var(--adm-warm-500)]", dot: "bg-[var(--adm-warm-500)]", surface: "bg-[#FFF0D7]", num: "text-[var(--adm-warm-600)]" },
  orange: { accent: "#FB8500", bar: "bg-[var(--adm-warm-600)]", dot: "bg-[var(--adm-warm-600)]", surface: "bg-[#FFEADA]", num: "text-[#8A3E00]" },
  red: { accent: "#9E2A2B", bar: "bg-[var(--adm-critical-600)]", dot: "bg-[var(--adm-critical-600)]", surface: "bg-[#F8EAEA]", num: "text-[var(--adm-critical-600)]" },
  darkRed: { accent: "#540B0E", bar: "bg-[var(--adm-critical-950)]", dot: "bg-[var(--adm-critical-950)]", surface: "bg-[#F1E4E5]", num: "text-[var(--adm-critical-950)]" },
  neutral: { accent: "#E5E5E5", bar: "bg-[var(--adm-neutral-100)]", dot: "bg-[#A7ADB2]", surface: "bg-[#F4F5F6]", num: "text-[var(--adm-text)]" },
};

function KpiCard({ label, value, tone, zeroHint }: KpiCardProps) {
  const s = KPI_STYLES[tone];
  return (
    <div
      className={`adm-kpi-cell relative overflow-hidden rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] ${s.surface} px-3 pb-2.5 pl-4 pt-3 shadow-[var(--adm-shadow-sm)]`}
      style={{ "--adm-kpi-accent": s.accent } as CSSProperties}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${s.bar}`} />
      <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        {label}
      </p>
      <p className={`mt-1.5 font-serif text-[30px] leading-none ${value === 0 ? "text-[var(--adm-text-soft)]" : s.num}`}>{value}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-[var(--adm-text-muted)]">{value === 0 ? zeroHint : "Aktív tétel"}</p>
    </div>
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

export function Dashboard() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
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

      const [comm, myTasks, myCases, dashboardStats] = await Promise.all([
        getCommunications({ limit: 8 }).catch(() => null),
        getMyTasks().catch(() => null),
        getCases(1, 12, me.id).catch(() => null),
        getDashboardStats().catch(() => null),
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

      setWarnings(nextWarnings);

      if (!myTasks && !myCases && !dashboardStats) {
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
          error: "Előkészítés alatt — a hírfeed későbbi patchben aktiválható.",
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

  const upcomingDeadlines = useMemo(() => {
    return tasks
      .filter((task) => !!task.dueDate && mapTaskBucket(task) !== "done")
      .sort((a, b) => new Date(a.dueDate || "").getTime() - new Date(b.dueDate || "").getTime())
      .slice(0, 5);
  }, [tasks]);

  const recentDocuments = useMemo(() => {
    if (!stats?.recentActivity?.length) return [] as DashboardStats["recentActivity"];
    return stats.recentActivity
      .filter((item) => /document|dokument/i.test(item.type || "") || /dokument|fájl|file/i.test(item.text || ""))
      .slice(0, 5);
  }, [stats]);

  const legalSignals = useMemo(() => {
    if (!legalNews.articles.length) return [];
    return legalNews.articles.filter(isLegalSignal).slice(0, 3);
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
        label: "Feladatlista",
        title: focusTask.title,
        detail: focusTask.dueDate
          ? `${focusTask.case?.caseNumber || "Feladat"} · Határidő: ${displayDate(focusTask.dueDate)}`
          : `${focusTask.case?.caseNumber || "Feladat"} · Nincs megadott határidő`,
        href: "/tasks",
        action: "Feladatok megnyitása",
      });
    }

    if (focusCase) {
      cards.push({
        id: `next-case-${focusCase.id}`,
        label: "Ügylista",
        title: focusCase.title || focusCase.caseNumber,
        detail: focusCase.deadline
          ? `${focusCase.caseNumber || "Ügy"} · Határidő: ${displayDate(focusCase.deadline)}`
          : `${focusCase.caseNumber || "Ügy"} · Meglévő ügyadatból`,
        href: "/cases",
        action: "Ügy megnyitása",
      });
    }

    if (focusDocument) {
      cards.push({
        id: `next-document-${focusDocument.id}`,
        label: "Dokumentumjelzés",
        title: mapRecentDocLabel(focusDocument.type || focusDocument.text),
        detail: `Meglévő dokumentum aktivitás · ${displayDateTimeShort(focusDocument.timestamp)}`,
        href: "/documents/compare",
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
    { href: "/cases", label: "Ügyek", description: "Ügylista és ügyindítás" },
    { href: "/tasks", label: "Feladatok", description: "Rám váró feladatok" },
    { href: "/documents/compare", label: "Dokumentum-összehasonlítás", description: "Szerződés-workspace" },
    { href: "/litigation-workspace", label: "Peres munkatér", description: "Peres stratégiai térkép" },
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

  // Communication intake foundation (OI1A) — derived from existing communications data only.
  // No Outlook/Graph connection; classification is a transparent heuristic, not a live feed.
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
          attachmentCount: item._count?.attachments,
        }),
      ),
    [communications],
  );
  const externalComms = useMemo(() => communicationSignals.filter((s) => s.audience === "external"), [communicationSignals]);
  const internalComms = useMemo(() => communicationSignals.filter((s) => s.audience === "internal"), [communicationSignals]);

  // "Mai sor" — a mixed actionable queue (review + deadline + important communication), not a count duplicate.
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
    const deadline = upcomingDeadlines.find((task) => mapTaskBucket(task) !== "review");
    if (deadline) {
      items.push({
        id: `mai-deadline-${deadline.id}`,
        kind: "Határidő",
        title: deadline.title,
        detail: `${displayDate(deadline.dueDate)} · ${deadline.case?.caseNumber || "Feladat"}`,
        href: `/tasks?taskId=${deadline.id}`,
      });
    }
    const importantCommunication = externalComms.find((signal) => signal.requiresReview) || externalComms[0];
    if (importantCommunication) {
      items.push({
        id: `mai-communication-${importantCommunication.id}`,
        kind: "Kommunikáció",
        title: importantCommunication.subject,
        detail: `${importantCommunication.senderName || importantCommunication.senderEmail || "Külső fél"} · besorolás / válasz ellenőrzése`,
        href: importantCommunication.proposedCaseId ? `/cases/${importantCommunication.proposedCaseId}/communications` : "/notifications",
      });
    }
    return items;
  }, [externalComms, reviewQueue, upcomingDeadlines]);

  // Foundation example list only — clearly labelled, not persisted, not live configuration.
  const watchedClientExamples = ["BlackBelt", "Saubermacher", "Bálintfy"];

  return (
    <div className="adm-dash-stage min-h-full px-3 pb-5 pt-3 sm:px-5 xl:px-6">
      <div className="mx-auto w-full max-w-[1440px] space-y-3">
        {/* 1 + 2 — Command-center hero with dark "Mai működési kép" status column */}
        <section className="adm-command-hero">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_318px]">
            <div className="flex min-h-[156px] flex-col justify-between p-[18px] lg:p-5">
              <div>
                <p className="adm-kicker">Adminiculum · Műszerfal</p>
                <h1 className="adm-hero-title mt-1.5 max-w-4xl text-[clamp(34px,4.4vw,58px)] leading-[0.92]">
                  Műszerfal
                </h1>
                <p className="mt-2 max-w-3xl text-[12.5px] leading-5 text-[var(--adm-text-muted)]">
                  Jó reggelt, {greetingName}. Mai ügyek, teendők, review-jelzések és dokumentumaktivitás egy helyen.
                </p>
              </div>

              <div className="mt-3">
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
                    Dokumentum feltöltés
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

        {/* 3 — KPI / rubrika strip (distinct categories, real counts only) */}
        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Nyitott ügyek" value={openCasesCount} tone="green" zeroHint="Nincs betöltött nyitott ügy" />
          <KpiCard label="Mai teendők" value={openTasks.length} tone="orange" zeroHint="Nincs nyitott teendő" />
          <KpiCard label="Közeli határidők" value={upcomingDeadlines.length} tone="yellow" zeroHint="Nincs közeli határidő" />
          <KpiCard label="Review tételek" value={reviewDocumentCount} tone="navy" zeroHint="Nincs review tétel" />
          <KpiCard label="Külső kommunikáció" value={externalComms.length} tone="cyan" zeroHint="Nincs új külső jelzés" />
          <KpiCard label="Belső kommunikáció" value={internalComms.length} tone="petrol" zeroHint="Nincs új belső jelzés" />
        </section>

        {/* 4 + 5 — Dominant "Itt folytasd" workbench + review/handoff side column */}
        <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.38fr)_minmax(330px,0.72fr)]">
          <article className={`adm-panel adm-panel-primary adm-panel-accent-green adm-focus-panel ${isSparseFocus ? "p-4 pl-5" : "p-4 pl-5 lg:p-5 lg:pl-6"}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="adm-kicker text-[var(--adm-green-800)]">Elsődleges munkasor</p>
                <h2 className="adm-heading mt-1 text-[28px] leading-tight">Itt folytasd</h2>
                <p className="mt-1 max-w-3xl text-[11.5px] leading-5 text-[var(--adm-text-muted)]">
                  Meglévő feladatokból, ügyekből, dokumentumjelzésekből és helyi böngészős vázlatokból adott
                  nyitási javaslat. A pontos priorizálás későbbi backend-alapú fejlesztés.
                </p>
              </div>
              <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1 text-[11px] font-semibold text-[#6B4B14]">
                {nextWorkCards.length} javaslat
              </span>
            </div>

            {loading ? <p className="mt-4 text-xs text-[var(--adm-text-muted)]">Fókuszjavaslatok betöltése...</p> : null}
            {!loading && nextWorkCards.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="Nincs kiemelt fókuszfeladat"
                  subtitle="Nincs helyi böngészős munkavázlat vagy betöltött prioritás. A dashboard üres állapotban is megtartja a command-center szerkezetet."
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
                    Folytatás <span aria-hidden="true">→</span>
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
                  <div className="flex flex-wrap gap-2">
                    <Link href="/reviews" className="adm-link-button px-3 py-2 text-[11px]">Review sor</Link>
                    <Link href="/cases?newCase=1" className="adm-link-button adm-link-button-primary px-3 py-2 text-[11px]">Új ügy</Link>
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

        {/* 6 — Communication watcher foundation (OI1A) */}
        <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
          <article className="adm-panel adm-panel-primary overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-[var(--adm-blue-500)] bg-[var(--adm-blue-100)]/20 px-4 py-3 lg:px-5">
              <div>
                <p className="adm-kicker text-[var(--adm-blue-700)]">Kommunikáció</p>
                <h3 className="adm-heading mt-0.5 text-[24px] leading-tight">Kommunikációs figyelő</h3>
              </div>
              <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-500)]/30 bg-[var(--adm-blue-100)]/35 px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-blue-700)]">
                Foundation · Outlook előkészítés
              </span>
            </div>

            {/* Communication rubrikák (distinct from the main KPI strip) */}
            <div className="grid grid-cols-2 gap-2 px-4 pt-3 md:grid-cols-4 lg:px-5">
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[var(--adm-blue-500)] bg-white px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Külső kommunikáció</p>
                <p className="mt-0.5 font-serif text-[24px] leading-none text-[var(--adm-text)]">{externalComms.length}</p>
              </div>
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[var(--adm-blue-700)] bg-white px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Belső kommunikáció</p>
                <p className="mt-0.5 font-serif text-[24px] leading-none text-[var(--adm-text)]">{internalComms.length}</p>
              </div>
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[var(--adm-warm-400)] bg-white px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Válaszra vár</p>
                <p className="mt-0.5 font-serif text-[24px] leading-none text-[var(--adm-text-soft)]">—</p>
              </div>
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[var(--adm-neutral-100)] bg-white px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Figyelt ügyfelek</p>
                <p className="mt-0.5 font-serif text-[24px] leading-none text-[var(--adm-text-soft)]">{watchedClientExamples.length}<span className="ml-1 align-middle text-[10px] font-sans text-[var(--adm-text-muted)]">példa</span></p>
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2 lg:px-5">
              <div className="adm-signal-card rounded-[var(--adm-radius-sm)] border-l-[3px] border-l-[var(--adm-blue-500)] p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-blue-700)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--adm-blue-500)]" />Külső</p>
                {externalComms.length === 0 ? (
                  <div className="mt-2 adm-board-empty adm-board-empty-compact">
                    <p className="text-xs font-semibold text-[var(--adm-text)]">Nincs új külső kommunikáció.</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Ügyfélüzenetek, ellenoldali levelek, hatósági/bírósági jelzések, partneri válaszok.</p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {externalComms.slice(0, 4).map((sig) => (
                      <div key={sig.id} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2.5">
                        <p className="text-xs font-semibold text-[var(--adm-text)]">{sig.subject}</p>
                        <p className="mt-0.5 text-[10.5px] text-[var(--adm-text-muted)]">
                          {sig.senderName || sig.senderEmail || "Külső fél"}{sig.receivedAt ? ` · ${displayDateTimeShort(sig.receivedAt)}` : ""}
                          {sig.hasAttachments ? " · 📎" : ""}
                        </p>
                        {sig.requiresReview ? <p className="mt-1 text-[10px] font-semibold text-[#8a5a06]">Besorolás javasolt (ügyfél/ügy)</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="adm-signal-card rounded-[var(--adm-radius-sm)] border-l-[3px] border-l-[var(--adm-blue-700)] p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-blue-700)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--adm-blue-700)]" />Belső</p>
                {internalComms.length === 0 ? (
                  <div className="mt-2 adm-board-empty adm-board-empty-compact">
                    <p className="text-xs font-semibold text-[var(--adm-text)]">Nincs új belső kommunikáció.</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Belső megjegyzések, review-visszajelzések, átadási kommentek, kolléga kérdései.</p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {internalComms.slice(0, 4).map((sig) => (
                      <div key={sig.id} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2.5">
                        <p className="text-xs font-semibold text-[var(--adm-text)]">{sig.subject}</p>
                        <p className="mt-0.5 text-[10.5px] text-[var(--adm-text-muted)]">
                          {sig.senderName || sig.senderEmail || "Belső"}{sig.receivedAt ? ` · ${displayDateTimeShort(sig.receivedAt)}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="border-t border-[var(--adm-border)] px-4 py-2.5 text-[10.5px] text-[var(--adm-text-muted)] lg:px-5">
              Outlook-integráció későbbi, jóváhagyott Microsoft Graph bekötéssel aktiválható. A jelenlegi nézet a meglévő kommunikációs adatokból dolgozik.
            </p>
          </article>

          <aside className="grid content-start gap-3">
            <article className="adm-panel adm-panel-accent-green adm-rail-panel p-3.5">
              <p className="adm-kicker text-[var(--adm-green-800)]">Figyelt ügyfelek</p>
              <h3 className="adm-heading mt-0.5 text-[20px]">Kiemelt ügyfélkör</h3>
              <p className="mt-1.5 text-[11px] leading-5 text-[var(--adm-text-muted)]">
                Későbbi beállításban kiválasztható, mely ügyfelek kommunikációja és aktivitása jelenjen meg kiemelten.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {watchedClientExamples.map((name) => (
                  <span key={name} className="adm-watch-chip">{name}</span>
                ))}
                <span className="adm-watch-chip adm-watch-chip-muted">példa</span>
              </div>
              <div className="mt-3 adm-board-empty adm-board-empty-compact">
                <p className="text-[11px] font-semibold text-[var(--adm-text)]">Figyelt ügyfelek aktivitása</p>
                <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">A figyelt ügyfelekhez kapcsolódó új kommunikációk, dokumentumok és határidők itt jelennek meg.</p>
              </div>
            </article>

            <article className="adm-panel adm-panel-accent-amber adm-rail-panel p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--adm-warm-400)]" />
                <h3 className="adm-heading text-[20px]">Válaszra vár</h3>
              </div>
              <div className="mt-2.5 space-y-2">
                <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-warm-400)]/35 border-l-[3px] border-l-[var(--adm-warm-400)] bg-[#FFF3CB] p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-warm-600)]">Tőlünk várnak választ</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Foundation állapot — a válaszra váró jelzés az Outlook-bekötés után aktiválható.</p>
                </div>
                <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-[3px] border-l-[var(--adm-neutral-100)] bg-white p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Mi várunk válaszra</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Foundation állapot — kimenő kommunikáció követése későbbi fejlesztés.</p>
                </div>
              </div>
            </article>
          </aside>
        </section>

        {/* 7 — Compact support rail: useful dashboard signals only, no second case/task board */}
        <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,0.74fr)_minmax(0,0.86fr)_minmax(300px,0.56fr)]">
          <article className="adm-panel adm-panel-accent-amber adm-rail-panel p-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
              <div>
                <p className="adm-kicker text-[var(--adm-warm-600)]">Határidő</p>
                <h3 className="adm-heading mt-0.5 text-[20px]">Közeli határidők</h3>
              </div>
              <Link href="/tasks" className="adm-link-button px-3 py-1.5 text-[11px]">Feladatok</Link>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {upcomingDeadlines.length === 0 ? (
                <EmptyState title="Nincs közeli határidő" subtitle="A mai és holnapi határidők kompakt jelzésként jelennek meg." />
              ) : null}
              {upcomingDeadlines.slice(0, 4).map((task) => (
                <Link key={task.id} href={`/tasks?taskId=${task.id}`} className="block rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[var(--adm-warm-400)] bg-white p-2.5 hover:bg-[#FFF9E8]">
                  <p className="font-semibold text-[var(--adm-text)]">{task.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{displayDate(task.dueDate)} · {task.case?.caseNumber || "Feladat"}</p>
                </Link>
              ))}
            </div>
          </article>

          <article className="adm-panel adm-panel-accent-navy adm-rail-panel p-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
              <div>
                <p className="adm-kicker text-[var(--adm-blue-950)]">Dokumentum</p>
                <h3 className="adm-heading mt-0.5 text-[20px]">Legutóbbi dokumentumok</h3>
              </div>
              <Link href="/documents/compare" className="adm-link-button px-3 py-1.5 text-[11px]">Workspace</Link>
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

          <div className="grid content-start gap-3">
            <article className="adm-panel adm-rail-panel p-4">
              <div className="flex items-center justify-between gap-2">
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

            <article className="adm-panel adm-panel-accent-green adm-rail-panel p-4">
              <div className="flex items-start gap-2 border-b border-[var(--adm-border)] pb-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--adm-green-800)]" />
                <div>
                  <p className="adm-kicker text-[var(--adm-green-800)]">Kitekintés</p>
                  <h3 className="adm-heading mt-0.5 text-[20px]">Hírek / jogi-piaci jelzések</h3>
                </div>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                {legalNews.isLoading ? <p className="text-[var(--adm-text-soft)]">Hírfeed betöltése...</p> : null}
                {!legalNews.isLoading && (legalNews.error || legalSignals.length === 0) ? (
                  <div className="rounded border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-2 text-[var(--adm-text-muted)]">
                    Előkészítés alatt — a hírfeed későbbi patchben aktiválható.
                  </div>
                ) : null}
                {legalSignals.slice(0, 2).map((article, index) => (
                  <div key={`${article.title}-${index}`} className="rounded border border-[var(--adm-border)] border-l-[3px] border-l-[var(--adm-green-800)] bg-[var(--adm-surface)] p-2">
                    <p className="font-semibold text-[var(--adm-text)]">{article.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--adm-text-muted)]"><span className="inline-flex rounded-full bg-[var(--adm-blue-100)]/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--adm-blue-700)]">{article.source}</span>{article.date}</p>
                    {article.url ? (
                      <a href={article.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">
                        Megnyitás
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
