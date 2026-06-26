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

type KpiToneStyle = { accent: string; headText: string; surface: string; num: string };

const KPI_STYLES: Record<KpiCardProps["tone"], KpiToneStyle> = {
  green: { accent: "#014337", headText: "#FFFFFF", surface: "bg-[#EAF3EE]", num: "text-[var(--adm-green-900)]" },
  navy: { accent: "#023047", headText: "#FFFFFF", surface: "bg-[#E8F0F4]", num: "text-[var(--adm-blue-950)]" },
  petrol: { accent: "#126782", headText: "#FFFFFF", surface: "bg-[#E5F2F6]", num: "text-[var(--adm-blue-700)]" },
  cyan: { accent: "#219EBC", headText: "#06323F", surface: "bg-[#E6F6FA]", num: "text-[var(--adm-blue-700)]" },
  yellow: { accent: "#FFB703", headText: "#5A3E00", surface: "bg-[#FFF3CB]", num: "text-[var(--adm-warm-600)]" },
  amber: { accent: "#FD9E02", headText: "#5A3E00", surface: "bg-[#FFF0D7]", num: "text-[var(--adm-warm-600)]" },
  orange: { accent: "#FB8500", headText: "#4A2600", surface: "bg-[#FFEADA]", num: "text-[#8A3E00]" },
  red: { accent: "#9E2A2B", headText: "#FFFFFF", surface: "bg-[#F8EAEA]", num: "text-[var(--adm-critical-600)]" },
  darkRed: { accent: "#540B0E", headText: "#FFFFFF", surface: "bg-[#F1E4E5]", num: "text-[var(--adm-critical-950)]" },
  neutral: { accent: "#E5E5E5", headText: "#2A2F33", surface: "bg-[#F4F5F6]", num: "text-[var(--adm-text)]" },
};

function KpiCard({ label, value, tone, zeroHint }: KpiCardProps) {
  const s = KPI_STYLES[tone];
  return (
    <div
      className="adm-kpi-cell relative flex flex-col overflow-hidden rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white shadow-[var(--adm-shadow-sm)]"
      style={{ "--adm-kpi-accent": s.accent } as CSSProperties}
    >
      <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ backgroundColor: s.accent }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.headText, opacity: 0.85 }} />
        <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: s.headText }}>{label}</p>
      </div>
      <div className={`flex-1 px-3 pb-2.5 pt-2 ${s.surface}`}>
        <p className={`font-serif text-[30px] leading-none ${value === 0 ? "text-[var(--adm-text-soft)]" : s.num}`}>{value}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-[var(--adm-text-muted)]">{value === 0 ? zeroHint : "Aktív tétel"}</p>
      </div>
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

// Future-ready communication row (real data shape: sender, subject, metadata, status chip).
function CommRow({ sig, family }: { sig: CommunicationSignal; family: "external" | "internal" }) {
  const rail = family === "external" ? "var(--adm-blue-500)" : "var(--adm-blue-700)";
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-2.5">
      <span className="mt-0.5 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: rail }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-[var(--adm-text)]">
          {sig.senderName || sig.senderEmail || (family === "external" ? "Külső fél" : "Belső")}
        </p>
        <p className="truncate text-xs font-semibold text-[var(--adm-text)]">{sig.subject}</p>
        <p className="mt-0.5 truncate text-[10px] text-[var(--adm-text-muted)]">
          {sig.receivedAt ? displayDateTimeShort(sig.receivedAt) : "Nincs időbélyeg"}{sig.hasAttachments ? " · 📎" : ""}
        </p>
      </div>
      {sig.requiresReview ? (
        <span className="shrink-0 rounded-full bg-[#FFF3CB] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--adm-warm-600)]">Besorolás</span>
      ) : (
        <span className="shrink-0 rounded-full bg-[var(--adm-blue-100)]/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--adm-blue-700)]">
          {family === "external" ? "Külső" : "Belső"}
        </span>
      )}
    </div>
  );
}

// Honest foundation slot — demonstrates the future row structure without fake data.
function CommFoundationRow() {
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-white/50 px-2.5 py-2 opacity-70">
      <span className="h-8 w-1 shrink-0 rounded-full bg-[var(--adm-neutral-100)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Feladó · Tárgy</p>
        <p className="text-[10px] text-[var(--adm-text-soft)]">Outlook-bekötés után jelenik meg.</p>
      </div>
      <span className="shrink-0 rounded-full border border-dashed border-[var(--adm-border-strong)] px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-[var(--adm-text-soft)]">Állapot</span>
    </div>
  );
}

// Future-ready news / legal-signal row (real data: title, source, category tag, open action).
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

function NewsFoundationRow() {
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-white/50 px-2.5 py-2 opacity-70">
      <div className="min-w-0 flex-1">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Jogi jelzés · Forrás</p>
        <p className="text-[10px] text-[var(--adm-text-soft)]">További jelzések a hírfeed aktiválásakor.</p>
      </div>
      <span className="shrink-0 rounded-full border border-dashed border-[var(--adm-border-strong)] px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-[var(--adm-text-soft)]">Megnyitás</span>
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
  // Real client-linked communication, if any (foundation preview of future per-client sorting).
  const clientLinkedComms = useMemo(
    () => communicationSignals.filter((s) => s.proposedClientName).slice(0, 4),
    [communicationSignals],
  );
  // Agenda foundation built from real deadline tasks (no live calendar claim).
  const agendaItems = useMemo(
    () =>
      upcomingDeadlines.slice(0, 5).map((task) => ({
        id: task.id,
        title: task.title,
        date: task.dueDate,
        caseNumber: task.case?.caseNumber || "Feladat",
        urgent: mapTaskBucket(task) === "urgent",
      })),
    [upcomingDeadlines],
  );

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

        {/* 6 — Kommunikációs figyelő: dominant full-width workbench (8 external + 8 internal capacity) */}
        <section>
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

            <div className="grid gap-3 p-4 md:grid-cols-2 lg:px-5">
              <div className="adm-signal-card rounded-[var(--adm-radius-sm)] border-l-[3px] border-l-[var(--adm-blue-500)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-blue-700)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--adm-blue-500)]" />Külső kommunikáció</p>
                  <span className="text-[9.5px] font-semibold text-[var(--adm-text-soft)]">{Math.min(externalComms.length, 8)}/8</span>
                </div>
                {externalComms.length === 0 ? (
                  <p className="mt-1.5 text-[10.5px] leading-4 text-[var(--adm-text-muted)]">Nincs új külső kommunikáció. Ügyfélüzenetek, ellenoldali levelek, hatósági/bírósági jelzések, partneri válaszok.</p>
                ) : null}
                <div className="mt-2 space-y-1.5">
                  {externalComms.slice(0, 8).map((sig) => <CommRow key={sig.id} sig={sig} family="external" />)}
                  {Array.from({ length: Math.max(0, 6 - Math.min(externalComms.length, 8)) }).map((_, i) => <CommFoundationRow key={`ext-found-${i}`} />)}
                </div>
                <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Kapacitás: 8 sor · Outlook előkészítés</p>
              </div>
              <div className="adm-signal-card rounded-[var(--adm-radius-sm)] border-l-[3px] border-l-[var(--adm-blue-700)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-blue-700)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--adm-blue-700)]" />Belső kommunikáció</p>
                  <span className="text-[9.5px] font-semibold text-[var(--adm-text-soft)]">{Math.min(internalComms.length, 8)}/8</span>
                </div>
                {internalComms.length === 0 ? (
                  <p className="mt-1.5 text-[10.5px] leading-4 text-[var(--adm-text-muted)]">Nincs új belső kommunikáció. Belső megjegyzések, review-visszajelzések, átadási kommentek, kolléga kérdései.</p>
                ) : null}
                <div className="mt-2 space-y-1.5">
                  {internalComms.slice(0, 8).map((sig) => <CommRow key={sig.id} sig={sig} family="internal" />)}
                  {Array.from({ length: Math.max(0, 6 - Math.min(internalComms.length, 8)) }).map((_, i) => <CommFoundationRow key={`int-found-${i}`} />)}
                </div>
                <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Kapacitás: 8 sor · Outlook előkészítés</p>
              </div>
            </div>
            <p className="border-t border-[var(--adm-border)] px-4 py-2.5 text-[10.5px] text-[var(--adm-text-muted)] lg:px-5">
              Outlook-integráció később, jóváhagyott Microsoft Graph bekötéssel aktiválható. A jelenlegi nézet a meglévő kommunikációs adatokból dolgozik.
            </p>
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
                  Előkészítés alatt — a hírfeed későbbi patchben aktiválható. A lista 8 jogi jelzés megjelenítésére készül.
                </p>
              ) : null}
              <div className="grid gap-1.5 md:grid-cols-2">
                {legalSignals.slice(0, 8).map((article, index) => <NewsRow key={`${article.title}-${index}`} article={article} />)}
                {legalSignals.length > 0 ? Array.from({ length: Math.max(0, 6 - Math.min(legalSignals.length, 8)) }).map((_, i) => <NewsFoundationRow key={`news-found-${i}`} />) : null}
              </div>
              <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Kapacitás: 8 jogi jelzés · valós forrásokból</p>
            </div>
          </article>

          <aside className="grid content-start gap-3">
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

            <article className="adm-panel adm-rail-panel p-3.5" style={{ borderTop: "3px solid var(--adm-blue-500)" }}>
              <p className="adm-kicker text-[var(--adm-blue-700)]">Kiemelt ügyfélkör</p>
              <h3 className="adm-heading mt-0.5 text-[20px]">Ügyfélhez sorolt kommunikáció</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {watchedClientExamples.map((name) => (
                  <span key={name} className="adm-watch-chip">{name}</span>
                ))}
                <span className="adm-watch-chip adm-watch-chip-muted">példa</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {clientLinkedComms.length === 0 ? (
                  <>
                    <p className="text-[10.5px] leading-4 text-[var(--adm-text-muted)]">
                      Az automatikus ügyfélhez rendelés későbbi kommunikációs munkafolyamat. A dashboard itt fogja mutatni a kiemelt ügyfelekhez tartozó friss leveleket és jelzéseket.
                    </p>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={`client-found-${i}`} className="flex items-center gap-2.5 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-white/50 px-2.5 py-2 opacity-70">
                        <span className="h-7 w-1 shrink-0 rounded-full bg-[var(--adm-blue-500)]/40" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">Ügyfél · Feladó</p>
                          <p className="text-[10px] text-[var(--adm-text-soft)]">Ügyfélhez sorolt levél itt jelenik meg.</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-dashed border-[var(--adm-border-strong)] px-2 py-0.5 text-[8.5px] font-bold uppercase text-[var(--adm-text-soft)]">Megnyitás</span>
                      </div>
                    ))}
                  </>
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
                      href={`/tasks?taskId=${item.id}`}
                      className={`block rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] border-l-4 bg-white p-2.5 ${item.urgent ? "border-l-[var(--adm-critical-600)] hover:bg-[#FBEDED]" : "border-l-[var(--adm-warm-400)] hover:bg-[#FFF9E8]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold text-[var(--adm-text)]">{item.title}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] ${item.urgent ? "bg-[#F4DADA] text-[var(--adm-critical-600)]" : "bg-[#FFF3CB] text-[var(--adm-warm-600)]"}`}>{item.urgent ? "Sürgős" : "Határidő"}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{displayDate(item.date)} · {item.caseNumber}</p>
                    </Link>
                  ))}
                  <p className="text-[10px] text-[var(--adm-text-muted)]">Tárgyalások és belső egyeztetések naptári bekötése későbbi fejlesztés.</p>
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
