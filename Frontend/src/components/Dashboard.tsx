"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  tone: "green" | "gold" | "purple" | "red" | "sage" | "ink" | "navy" | "amber" | "neutral";
  zeroHint: string;
};

type KpiToneStyle = { bar: string; dot: string; surface: string; num: string };

const KPI_STYLES: Record<KpiCardProps["tone"], KpiToneStyle> = {
  green: { bar: "bg-[var(--adm-green-800)]", dot: "bg-[var(--adm-green-800)]", surface: "bg-[#F3F7F2]", num: "text-[var(--adm-green-900)]" },
  sage: { bar: "bg-[var(--adm-sage-700)]", dot: "bg-[var(--adm-sage-700)]", surface: "bg-[#F2F6F0]", num: "text-[var(--adm-green-900)]" },
  navy: { bar: "bg-[#14213D]", dot: "bg-[#14213D]", surface: "bg-[#F0F2F7]", num: "text-[#14213D]" },
  ink: { bar: "bg-[#243044]", dot: "bg-[#243044]", surface: "bg-[#F1F3F6]", num: "text-[#243044]" },
  amber: { bar: "bg-[#FCA311]", dot: "bg-[#FCA311]", surface: "bg-[#FFF6E6]", num: "text-[#8A5A06]" },
  gold: { bar: "bg-[var(--adm-ochre-500)]", dot: "bg-[var(--adm-ochre-500)]", surface: "bg-[#FBF5E8]", num: "text-[#6B4B14]" },
  purple: { bar: "bg-[#5B4499]", dot: "bg-[#5B4499]", surface: "bg-[#F4F1FA]", num: "text-[#5B4499]" },
  red: { bar: "bg-[var(--adm-terracotta-700)]", dot: "bg-[var(--adm-terracotta-700)]", surface: "bg-[#FBF0ED]", num: "text-[var(--adm-terracotta-700)]" },
  neutral: { bar: "bg-[#B7BEB6]", dot: "bg-[#B7BEB6]", surface: "bg-[#F6F6F4]", num: "text-[var(--adm-text)]" },
};

function KpiCard({ label, value, tone, zeroHint }: KpiCardProps) {
  const s = KPI_STYLES[tone];
  return (
    <div className={`relative overflow-hidden rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] ${s.surface} px-3 pb-2.5 pt-3 shadow-[var(--adm-shadow-sm)]`}>
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

function workflowPill(label: string, state: "ok" | "progress" | "review" | "missing") {
  const tone =
    state === "ok"
      ? "bg-[#DCE8DE] text-[#2E6A4A]"
      : state === "progress"
      ? "bg-[#E3EAF3] text-[#3C5575]"
      : state === "review"
      ? "bg-[#E4DDF2] text-[#5B4499]"
      : "bg-[var(--adm-ivory-100)] text-[var(--adm-text-soft)]";
  return <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>;
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="adm-board-empty min-h-[150px] p-4 text-center">
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
      setError(e instanceof Error ? e.message : "Hiba történt a dashboard betöltésekor.");
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

  const kpis = useMemo(() => {
    const review = tasks.filter((task) => mapTaskBucket(task) === "review").length;
    const urgent = tasks.filter((task) => mapTaskBucket(task) === "urgent").length;
    const depends = tasks.filter((task) => mapTaskBucket(task) === "depends").length;
    const waiting = tasks.filter((task) => mapTaskBucket(task) === "waiting").length;
    const ready = tasks.filter((task) => mapTaskBucket(task) === "ready").length;
    const done = tasks.filter((task) => mapTaskBucket(task) === "done").length;

    return { waiting, depends, review, urgent, ready, done };
  }, [tasks]);

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

  const asyncHandoffItems = useMemo(() => {
    const taskItems = openTasks.slice(0, 2).map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      meta: task.case?.caseNumber ? `${task.case.caseNumber} · Feladat` : "Feladat",
      detail: task.dueDate ? `Határidő: ${displayDate(task.dueDate)}` : "Nincs megadott határidő",
      href: `/tasks?taskId=${task.id}`,
    }));

    const documentItems = recentDocuments.slice(0, 2).map((item) => ({
      id: `document-${item.id}`,
      title: mapRecentDocLabel(item.type || item.text),
      meta: "Dokumentum aktivitás",
      detail: displayDateTimeShort(item.timestamp),
      href: item.caseId ? `/documents/compare?caseId=${item.caseId}` : "/documents/compare",
    }));

    const caseItems = attentionCases.slice(0, 2).map((caseItem) => ({
      id: `case-${caseItem.id}`,
      title: caseItem.title || caseItem.caseNumber,
      meta: caseItem.caseNumber || "Ügy",
      detail: caseItem.deadline ? `Határidő: ${displayDate(caseItem.deadline)}` : `Prioritás: ${caseItem.priority || "nincs megadva"}`,
      href: `/cases/${caseItem.id}`,
    }));

    return [...taskItems, ...documentItems, ...caseItems].slice(0, 5);
  }, [attentionCases, openTasks, recentDocuments]);

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
    { href: "/cases", label: "Ügyek", description: "Aktív ügyek áttekintése" },
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

  // "Mai sor" — a mixed actionable queue (review + átadás + határidő), not a count duplicate.
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
    const readyTask = tasks.find((task) => mapTaskBucket(task) === "ready");
    if (readyTask) {
      items.push({
        id: `mai-handoff-${readyTask.id}`,
        kind: "Átadás",
        title: readyTask.title,
        detail: `${readyTask.case?.caseNumber || "Átadásra kész tétel"}`,
        href: `/tasks?taskId=${readyTask.id}`,
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
    return items;
  }, [reviewQueue, tasks, upcomingDeadlines]);

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
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--adm-sage-300)]">
                Mai működési kép
              </p>
              <p className="text-[10.5px] leading-4 text-[var(--adm-ivory-100)]/60">
                Munkamenet- és rendszerállapot — nem munkaszámláló.
              </p>
              <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
                <div className="adm-stat-box flex items-center justify-between gap-2 p-2.5">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-sage-300)]">Feladatlista</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--adm-ivory-100)]/80">
                      {loading ? "Betöltés…" : taskListAvailable ? "Elérhető" : "Átmenetileg nem elérhető"}
                    </p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${loading ? "bg-[var(--adm-sage-300)]" : taskListAvailable ? "bg-[#7FBA8B]" : "bg-[#FCA311]"}`} />
                </div>
                <div className="adm-stat-box flex items-center justify-between gap-2 p-2.5">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-sage-300)]">Dokumentumfigyelés</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--adm-ivory-100)]/80">
                      {documentSignalCount === 0 ? "Nincs új jelzés" : `${documentSignalCount} jelzés`}
                    </p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${documentSignalCount === 0 ? "bg-[var(--adm-sage-300)]" : "bg-[#FCA311]"}`} />
                </div>
                <div className="adm-stat-box flex items-center justify-between gap-2 p-2.5">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-sage-300)]">Helyi munkamenet</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--adm-ivory-100)]/80">
                      {localWorkspaceDraftCount === 0 ? "Nincs helyi vázlat" : `${localWorkspaceDraftCount} helyi vázlat`}
                    </p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${localWorkspaceDraftCount === 0 ? "bg-[var(--adm-sage-300)]" : "bg-[#7FBA8B]"}`} />
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* 3 — KPI / rubrika strip (distinct categories, real counts only) */}
        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Nyitott ügyek" value={openCasesCount} tone="green" zeroHint="Nincs betöltött nyitott ügy" />
          <KpiCard label="Mai teendők" value={openTasks.length} tone="ink" zeroHint="Nincs nyitott teendő" />
          <KpiCard label="Közeli határidők" value={upcomingDeadlines.length} tone="amber" zeroHint="Nincs közeli határidő" />
          <KpiCard label="Review jelzések" value={reviewDocumentCount} tone="navy" zeroHint="Nincs review jelzés" />
          <KpiCard label="Átadási csomagok" value={kpis.ready} tone="sage" zeroHint="Nincs átadásra kész tétel" />
          <KpiCard label="Helyi vázlatok" value={localWorkspaceDraftCount} tone="neutral" zeroHint="Nincs helyi vázlat" />
        </section>

        {/* 4 + 5 — Dominant "Itt folytasd" workbench + review/handoff side column */}
        <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.38fr)_minmax(330px,0.72fr)]">
          <article className={`adm-panel adm-panel-primary adm-panel-accent-green ${isSparseFocus ? "p-4" : "p-4 lg:p-5"}`}>
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
                  <span className="inline-flex rounded-full bg-[var(--adm-sage-100)] px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-[var(--adm-green-800)]">{card.label}</span>
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
            <article className="adm-panel adm-panel-accent-amber p-3.5">
              <p className="adm-kicker text-[#8A5A06]">Mai sor</p>
              <h3 className="adm-heading mt-1 text-[24px]">Review · átadás · határidő</h3>
              {loading ? <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Betöltés...</p> : null}
              {!loading && maiSorItems.length === 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="adm-board-empty adm-board-empty-compact">
                    <p className="text-xs font-semibold text-[var(--adm-text)]">Üres a mai sor</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Review-, átadási és határidős tételek itt jelennek meg.</p>
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
                      ? "bg-[#E1E6F0] text-[#14213D]"
                      : item.kind === "Határidő"
                      ? "bg-[#FCE7C3] text-[#8a5a06]"
                      : "bg-[var(--adm-sage-100)] text-[var(--adm-green-800)]";
                  const kindBorder =
                    item.kind === "Review"
                      ? "border-l-[#14213D]"
                      : item.kind === "Határidő"
                      ? "border-l-[#FCA311]"
                      : "border-l-[var(--adm-green-800)]";
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

            <article className="adm-panel p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="adm-heading text-[22px]">Gyors megnyitás</h3>
                <span className="text-[11px] text-[var(--adm-text-muted)]">Munkaterületek</span>
              </div>
              <div className="mt-3 grid gap-2">
                {quickOpenLinks.map((link, i) => {
                  const marker = ["var(--adm-green-800)", "#14213D", "#FCA311", "var(--adm-sage-700)"][i % 4];
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-2.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2.5 hover:bg-[var(--adm-sand-100)]"
                    >
                      <span className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: marker }} />
                      <span className="flex-1">
                        <span className="block text-xs font-semibold text-[var(--adm-green-800)]">{link.label}</span>
                        <span className="mt-0.5 block text-[10.5px] text-[var(--adm-text-muted)]">{link.description}</span>
                      </span>
                      <span className="text-[var(--adm-text-soft)]">→</span>
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
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-[#14213D] bg-[#14213D]/[0.03] px-4 py-3 lg:px-5">
              <div>
                <p className="adm-kicker text-[#14213D]">Kommunikáció</p>
                <h3 className="adm-heading mt-0.5 text-[24px] leading-tight">Kommunikációs figyelő</h3>
              </div>
              <span className="rounded-[var(--adm-radius-sm)] border border-[#14213D]/25 bg-[#14213D]/5 px-3 py-1 text-[10.5px] font-semibold text-[#14213D]">
                Foundation · Outlook előkészítés
              </span>
            </div>

            {/* Communication rubrikák (distinct from the main KPI strip) */}
            <div className="grid grid-cols-2 gap-2 px-4 pt-3 md:grid-cols-4 lg:px-5">
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[#14213D] bg-[var(--adm-surface)] px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Külső kommunikáció</p>
                <p className="mt-0.5 font-serif text-[24px] leading-none text-[var(--adm-text)]">{externalComms.length}</p>
              </div>
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[var(--adm-green-800)] bg-[var(--adm-surface)] px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Belső kommunikáció</p>
                <p className="mt-0.5 font-serif text-[24px] leading-none text-[var(--adm-text)]">{internalComms.length}</p>
              </div>
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[#FCA311] bg-[var(--adm-surface)] px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Válaszra vár</p>
                <p className="mt-0.5 font-serif text-[24px] leading-none text-[var(--adm-text-soft)]">—</p>
              </div>
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 border-l-[#B7BEB6] bg-[var(--adm-surface)] px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Figyelt ügyfelek</p>
                <p className="mt-0.5 font-serif text-[24px] leading-none text-[var(--adm-text-soft)]">{watchedClientExamples.length}<span className="ml-1 align-middle text-[10px] font-sans text-[var(--adm-text-muted)]">példa</span></p>
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2 lg:px-5">
              <div className="rounded-[var(--adm-radius-sm)] border border-[#14213D]/15 border-l-[3px] border-l-[#14213D] bg-[#14213D]/[0.025] p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#14213D]"><span className="h-1.5 w-1.5 rounded-full bg-[#14213D]" />Külső</p>
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
              <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-green-800)]/15 border-l-[3px] border-l-[var(--adm-green-800)] bg-[var(--adm-green-800)]/[0.025] p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-green-800)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--adm-green-800)]" />Belső</p>
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
            <article className="adm-panel adm-panel-accent-green p-3.5">
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

            <article className="adm-panel adm-panel-accent-amber p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FCA311]" />
                <h3 className="adm-heading text-[20px]">Válaszra vár</h3>
              </div>
              <div className="mt-2.5 space-y-2">
                <div className="rounded-[var(--adm-radius-sm)] border border-[#FCA311]/25 border-l-[3px] border-l-[#FCA311] bg-[#FFF7E8] p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A5A06]">Tőlünk várnak választ</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Foundation állapot — a válaszra váró jelzés az Outlook-bekötés után aktiválható.</p>
                </div>
                <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-[3px] border-l-[#B7BEB6] bg-[var(--adm-surface)] p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Mi várunk válaszra</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Foundation állapot — kimenő kommunikáció követése későbbi fejlesztés.</p>
                </div>
              </div>
            </article>
          </aside>
        </section>

        {/* 7 — Lower support panels (lower visual weight) */}
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.6fr)]">
          <div className="space-y-5">
            <article className="adm-panel adm-panel-accent-green p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="adm-kicker text-[var(--adm-green-800)]">Átadások és aktivitás</p>
                  <h3 className="adm-heading mt-1 text-[20px]">Aszinkron ügyátadás</h3>
                  <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[var(--adm-text-muted)]">
                    Meglévő feladatokból, ügyadatokból, dokumentum aktivitásból és helyi böngészős vázlatokból
                    összeállított munkafolyamat-nézet. Ez nem backend audit log.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[10.5px]">
                  <div className="rounded border border-[var(--adm-border)] border-t-2 border-t-[#14213D] bg-[var(--adm-surface)] px-2 py-1.5">
                    <p className="font-serif text-[18px] leading-none text-[#14213D]">{openTasks.length}</p>
                    <p className="mt-1 text-[var(--adm-text-muted)]">feladat</p>
                  </div>
                  <div className="rounded border border-[var(--adm-border)] border-t-2 border-t-[var(--adm-green-800)] bg-[var(--adm-surface)] px-2 py-1.5">
                    <p className="font-serif text-[18px] leading-none text-[var(--adm-green-900)]">{attentionCases.length}</p>
                    <p className="mt-1 text-[var(--adm-text-muted)]">ügy</p>
                  </div>
                  <div className="rounded border border-[var(--adm-border)] border-t-2 border-t-[#B7BEB6] bg-[var(--adm-surface)] px-2 py-1.5">
                    <p className="font-serif text-[18px] leading-none text-[var(--adm-text)]">{localWorkspaceDraftCount}</p>
                    <p className="mt-1 text-[var(--adm-text-muted)]">vázlat</p>
                  </div>
                </div>
              </div>
              {loading ? <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Átadási nézet betöltése...</p> : null}
              {!loading && asyncHandoffItems.length === 0 ? (
                <p className="mt-3 rounded border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-[11px] text-[var(--adm-text-muted)]">
                  Nincs rögzített átadás. Nincs helyi böngészős munkavázlat.
                </p>
              ) : null}
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {asyncHandoffItems.slice(0, 4).map((item) => (
                  <Link key={item.id} href={item.href} className="block rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 hover:bg-white">
                    <p className="text-xs font-semibold text-[var(--adm-text)]">{item.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.meta} · {item.detail}</p>
                  </Link>
                ))}
              </div>
            </article>

            <article className="adm-panel adm-panel-accent-navy overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--adm-border)] bg-[#14213D]/[0.03] px-5 py-3">
                <h3 className="adm-heading text-[22px]">Aktív ügyek</h3>
                <Link href="/cases" className="adm-link-button px-3 py-1.5 text-xs">Összes ügy</Link>
              </div>
              {loading ? <p className="px-5 py-4 text-xs text-[var(--adm-text-muted)]">Ügyek betöltése...</p> : null}
              {!loading && cases.length === 0 ? (
                <div className="space-y-2 p-5">
                  <EmptyState title="Még nincs aktív ügy" subtitle="Nyiss egy új ügyet, és itt azonnal megjelenik a dokumentumfolyamat állapota." />
                  <div className="text-center">
                    <Link href="/cases?newCase=1" className="adm-link-button adm-link-button-primary px-3 py-1.5 text-[11px]">Új ügy indítása</Link>
                  </div>
                </div>
              ) : null}
              {!loading && cases.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-[var(--adm-surface)] text-[10px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">
                      <tr>
                        <th className="px-3 py-2">Ügy</th>
                        <th className="px-3 py-2">Ügyfél</th>
                        <th className="px-3 py-2">Felelős</th>
                        <th className="px-3 py-2">Dokumentum workflow</th>
                        <th className="px-3 py-2">Akció</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.slice(0, 8).map((item) => (
                        <tr key={item.id} className="border-t border-[var(--adm-border)] hover:bg-[var(--adm-surface)]">
                          <td className="px-3 py-3">
                            <p className="font-semibold text-[var(--adm-text)]">{item.caseNumber}</p>
                            <p className="text-[11px] text-[var(--adm-text-muted)]">{item.title || "Névtelen ügy"}</p>
                          </td>
                          <td className="px-3 py-3 text-[var(--adm-text)]">{item.clientName || "Nincs ügyfél"}</td>
                          <td className="px-3 py-3">
                            {item.assignedLawyer ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2E6A4A] text-[10px] font-bold text-white">
                                  {initials(item.assignedLawyer.name)}
                                </span>
                                <span className="text-[11px] text-[var(--adm-text)]">{item.assignedLawyer.name}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[var(--adm-text-soft)]">Nincs kijelölve</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {workflowPill("Eredeti", "ok")}
                              {workflowPill("Módosított", "progress")}
                              {workflowPill("Elemzés", "missing")}
                              {workflowPill("Jóváhagyás", "review")}
                            </div>
                            <p className="mt-1 text-[10px] text-[var(--adm-text-soft)]">Nincs dokumentumállapot</p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              <Link href={`/cases/${item.id}/documents`} className="rounded border border-[var(--adm-border-strong)] bg-white px-2 py-1 text-[11px] text-[var(--adm-green-800)]">Dokumentumtár</Link>
                              <Link href={`/documents/compare?caseId=${item.id}`} className="rounded border border-[var(--adm-border-strong)] bg-white px-2 py-1 text-[11px] text-[var(--adm-green-800)]">Workspace</Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </article>

            <article className="adm-panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-5 py-3">
                <h3 className="adm-heading text-[20px]">Csapatmunka board — előnézet</h3>
                <Link href="/tasks" className="adm-link-button px-3 py-1.5 text-xs">Teljes board</Link>
              </div>
              <div className="overflow-x-auto p-4">
                <div className="grid min-w-[860px] grid-cols-4 gap-3 xl:min-w-0">
                  {["Előkészítés", "Review", "Javítás", "Átadásra kész"].map((col) => {
                    const stageClass =
                      col === "Review" ? "adm-stage-review" : col === "Javítás" ? "adm-stage-fix" : col === "Átadásra kész" ? "adm-stage-ready" : "adm-stage-prep";
                    return (
                    <div key={col} className="overflow-hidden rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)]">
                      <p className={`adm-stage-head px-3 py-2 text-[11px] uppercase tracking-[0.1em] ${stageClass}`}>{col}</p>
                      <div className="space-y-2 p-3">
                        {tasks
                          .filter((t) => {
                            const bucket = mapTaskBucket(t);
                            if (col === "Előkészítés") return bucket === "waiting";
                            if (col === "Review") return bucket === "review";
                            if (col === "Javítás") return bucket === "depends";
                            return bucket === "ready";
                          })
                          .slice(0, 2)
                          .map((t) => (
                            <div key={t.id} className="rounded border border-[var(--adm-border)] bg-white p-2 text-[11px]">
                              <p className="font-semibold text-[var(--adm-text)]">{t.title}</p>
                              <p className="mt-1 text-[var(--adm-text-muted)]">{t.case?.caseNumber || "Feladat"}</p>
                            </div>
                          ))}
                        {tasks.filter((t) => {
                          const bucket = mapTaskBucket(t);
                          if (col === "Előkészítés") return bucket === "waiting";
                          if (col === "Review") return bucket === "review";
                          if (col === "Javítás") return bucket === "depends";
                          return bucket === "ready";
                        }).length === 0 ? (
                          <div className="rounded border border-dashed border-[var(--adm-border)] bg-[#F8F2E0] p-2 text-[10px] text-[var(--adm-text-soft)]">Nincs tétel ebben az oszlopban</div>
                        ) : null}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </article>
          </div>

          <aside className="grid content-start gap-5">
            <article className="adm-panel adm-panel-accent-amber p-5">
              <h3 className="flex items-center gap-2 border-b border-[var(--adm-border)] pb-3 font-serif text-[20px] text-[var(--adm-text)]"><span className="h-2.5 w-2.5 rounded-full bg-[#FCA311]" />Mai &amp; holnapi határidők</h3>
              <div className="mt-3 space-y-2 text-xs">
                {upcomingDeadlines.length === 0 ? <EmptyState title="Nincs közeli határidő" subtitle="A mai és holnapi határidők itt fognak gyűlni." /> : null}
                {upcomingDeadlines.map((task) => (
                  <Link key={task.id} href={`/tasks?taskId=${task.id}`} className="block rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2 hover:bg-white">
                    <p className="font-semibold text-[var(--adm-text)]">{task.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{displayDate(task.dueDate)} · {task.case?.caseNumber || "Feladat"}</p>
                  </Link>
                ))}
              </div>
            </article>

            <article className="adm-panel adm-panel-accent-navy p-5">
              <h3 className="flex items-center gap-2 border-b border-[var(--adm-border)] pb-3 font-serif text-[20px] text-[var(--adm-text)]"><span className="h-2.5 w-2.5 rounded-full bg-[#14213D]" />Legutóbbi dokumentumok</h3>
              <div className="mt-3 space-y-2 text-xs">
                {recentDocuments.length === 0 ? <EmptyState title="Nincs dokumentum előzmény" subtitle="A legfrissebb feltöltések és módosítások itt jelennek meg." /> : null}
                {recentDocuments.map((item) => (
                  <Link key={item.id} href={item.caseId ? `/documents/compare?caseId=${item.caseId}` : "/documents/compare"} className="flex items-start gap-2.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2 hover:bg-white">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#14213D]/10 text-[8px] font-bold uppercase tracking-tight text-[#14213D]">DOC</span>
                    <span>
                      <span className="block font-semibold text-[var(--adm-text)]">{mapRecentDocLabel(item.type || item.text)}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--adm-text-muted)]">{displayDateTimeShort(item.timestamp)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </article>

            <article className="adm-panel adm-panel-accent-green p-5">
              <h3 className="flex items-center gap-2 border-b border-[var(--adm-border)] pb-3 font-serif text-[20px] text-[var(--adm-text)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--adm-green-800)]" />Hírek / jogi-piaci jelzések</h3>
              <div className="mt-3 space-y-2 text-xs">
                {legalNews.isLoading ? <p className="text-[var(--adm-text-soft)]">Hírfeed betöltése...</p> : null}
                {!legalNews.isLoading && (legalNews.error || legalSignals.length === 0) ? (
                  <div className="rounded border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-2 text-[var(--adm-text-muted)]">
                    Előkészítés alatt — a hírfeed későbbi patchben aktiválható.
                  </div>
                ) : null}
                {legalSignals.map((article, index) => (
                  <div key={`${article.title}-${index}`} className="rounded border border-[var(--adm-border)] border-l-[3px] border-l-[var(--adm-green-800)] bg-[var(--adm-surface)] p-2">
                    <p className="font-semibold text-[var(--adm-text)]">{article.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--adm-text-muted)]"><span className="inline-flex rounded-full bg-[var(--adm-sage-100)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--adm-green-800)]">{article.source}</span>{article.date}</p>
                    {article.url ? (
                      <a href={article.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">
                        Megnyitás
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>
      </div>
    </div>
  );
}
