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
  tone: "green" | "gold" | "purple" | "red" | "sage" | "ink";
  zeroHint: string;
};

function kpiTone(tone: KpiCardProps["tone"]) {
  switch (tone) {
    case "green":
      return "border-l-[#1F4A33] bg-[#FFFDF7]";
    case "gold":
      return "border-l-[#B58A2A] bg-[#FFFDF7]";
    case "purple":
      return "border-l-[#5B4499] bg-[#FFFDF7]";
    case "red":
      return "border-l-[#8A2B2B] bg-[#FFFDF7]";
    case "sage":
      return "border-l-[#2E6A4A] bg-[#FFFDF7]";
    default:
      return "border-l-[#36433C] bg-[#FFFDF7]";
  }
}

function kpiDot(tone: KpiCardProps["tone"]) {
  switch (tone) {
    case "green":
      return "bg-[#1F4A33]";
    case "gold":
      return "bg-[#B58A2A]";
    case "purple":
      return "bg-[#5B4499]";
    case "red":
      return "bg-[#8A2B2B]";
    case "sage":
      return "bg-[#2E6A4A]";
    default:
      return "bg-[#36433C]";
  }
}

function KpiCard({ label, value, tone, zeroHint }: KpiCardProps) {
  return (
    <div className={`rounded-xl border border-[#D9CFB7] border-l-4 px-3 py-3 shadow-[0_1px_0_rgba(21,32,26,0.06)] ${kpiTone(tone)}`}>
      <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#5F6A62]">
        <span className={`h-2 w-2 rounded-full ${kpiDot(tone)}`} />
        {label}
      </p>
      <p className="mt-1 font-serif text-[34px] leading-none text-[#15201A]">{value}</p>
      <p className="mt-1 text-[10px] text-[#6A756D]">{value === 0 ? zeroHint : "Aktív tétel"}</p>
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
      : "bg-[#F3EFE4] text-[#8A938B]";
  return <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>;
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#D9CFB7] bg-[#FBF6E7] p-5 text-center">
      <div className="mx-auto mb-2 h-8 w-8 rounded-full border border-[#CFBE98] bg-[#F8EDCD]" />
      <p className="text-xs font-semibold text-[#36433C]">{title}</p>
      <p className="mt-1 text-[11px] text-[#5F6A62]">{subtitle}</p>
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

  const waitingTasks = useMemo(() => {
    return tasks.filter((task) => {
      const bucket = mapTaskBucket(task);
      return bucket === "waiting" || bucket === "urgent" || bucket === "depends";
    });
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

  const quickOpenLinks = [
    { href: "/cases", label: "Ügyek", description: "Aktív ügyek áttekintése" },
    { href: "/tasks", label: "Feladatok", description: "Rám váró feladatok" },
    { href: "/documents/compare", label: "Dokumentum-összehasonlítás", description: "Szerződés-workspace" },
    { href: "/litigation-workspace", label: "Peres munkatér", description: "Peres stratégiai térkép" },
    { href: "/editor-lab", label: "Szerkesztő labor", description: "Belső szerkesztő tesztfelület" },
  ];

  const greetingName = currentUser?.name || "dr. Hubay Máté";

  return (
    <div className="min-h-full bg-[#EFE7CF] px-3 pb-4 pt-2 sm:px-4 xl:px-6">
      <div className="mx-auto w-full max-w-[1860px] space-y-2.5">
        <section className="rounded-xl border border-[#D9CFB7] bg-[#FFFDF7] px-4 py-2.5 shadow-[0_1px_0_rgba(21,32,26,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#5F6A62]">Command Center</p>
              <h1 className="font-serif text-[28px] leading-none text-[#15201A]">Jó reggelt, {greetingName}!</h1>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/cases?newCase=1" className="rounded-md border border-[#173824] bg-[#1F4A33] px-3 py-2 font-semibold text-[#F4EFDB]">Új ügy</Link>
              <Link
                href={activeCase ? `/cases/${activeCase.id}/documents` : "/cases"}
                className="rounded-md border border-[#D4C8AA] bg-[#F8EDCD] px-3 py-2 font-semibold text-[#6B4B14]"
              >
                Dokumentum feltöltés
              </Link>
              <Link href="/reviews" className="rounded-md border border-[#D4C8AA] bg-[#FFFFFF] px-3 py-2 font-semibold text-[#1F4A33]">Review sor</Link>
            </div>
          </div>
          {error ? <div className="mt-2 rounded-md border border-[#DFB1AC] bg-[#F3D9D6] px-3 py-2 text-xs text-[#8A2B2B]">{error}</div> : null}
          {!error && warnings.length > 0 ? (
            <div className="mt-2 rounded-md border border-[#D9CFB7] bg-[#FBF6E7] px-3 py-2 text-xs text-[#5F6A62]">{warnings.slice(0, 2).join(" ")}</div>
          ) : null}
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiCard label="Rám vár" value={kpis.waiting} tone="gold" zeroHint="Nincs nyitott tétel" />
          <KpiCard label="Tőlem függ" value={kpis.depends} tone="ink" zeroHint="Nincs blokkolt tétel" />
          <KpiCard label="Review alatt" value={kpis.review} tone="purple" zeroHint="Nincs review alatt" />
          <KpiCard label="Sürgős ma" value={kpis.urgent} tone="red" zeroHint="Nincs sürgős határidő" />
          <KpiCard label="Átadásra kész" value={kpis.ready} tone="sage" zeroHint="Nincs átadásra kész" />
          <KpiCard label="Kész ezen a héten" value={kpis.done} tone="green" zeroHint="Még nincs lezárt tétel" />
        </section>

        <section className="rounded-xl border border-[#D9CFB7] bg-[#FFFDF7] p-4 shadow-[0_1px_0_rgba(21,32,26,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#5F6A62]">Home Office munkanézet</p>
              <h2 className="font-serif text-[24px] leading-tight text-[#15201A]">Mai ügyvédi fókusz</h2>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#5F6A62]">
                A home office nézet egyelőre meglévő adatokból és gyorslinkekből dolgozik. A részletes aktivitási napló későbbi fejlesztés.
              </p>
            </div>
            <span className="rounded-full border border-[#D4C8AA] bg-[#FBF6E7] px-3 py-1 text-[11px] font-semibold text-[#6B4B14]">
              Nem valós idejű kollaboráció
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_0.9fr_0.95fr]">
            <div className="rounded-lg border border-[#E8DFC9] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif text-[18px] text-[#15201A]">Mai fókusz</h3>
                <span className="text-[11px] font-semibold text-[#6B4B14]">{homeOfficeFocusTasks.length} tétel</span>
              </div>
              {loading ? <p className="mt-3 text-xs text-[#5F6A62]">Fókuszpontok betöltése...</p> : null}
              {!loading && homeOfficeFocusTasks.length === 0 ? (
                <p className="mt-3 rounded border border-dashed border-[#D9CFB7] bg-[#FBF6E7] px-3 py-2 text-[11px] text-[#5F6A62]">
                  Nincs betöltött teendő.
                </p>
              ) : null}
              <div className="mt-3 space-y-2">
                {homeOfficeFocusTasks.map((task) => (
                  <Link key={task.id} href={`/tasks?taskId=${task.id}`} className="block rounded border border-[#E8DFC9] bg-[#FBF6E7] px-3 py-2 hover:bg-[#F8EDCD]">
                    <p className="text-xs font-semibold text-[#15201A]">{task.title}</p>
                    <p className="mt-1 text-[11px] text-[#5F6A62]">
                      {task.case?.caseNumber || "Feladat"} · Határidő: {displayDate(task.dueDate)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-lg border border-[#E8DFC9] bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#5F6A62]">Rám váró feladatok</p>
                <p className="mt-1 font-serif text-[28px] leading-none text-[#15201A]">{waitingTasks.length}</p>
                <p className="mt-1 text-[11px] text-[#5F6A62]">{waitingTasks.length === 0 ? "Nincs betöltött teendő." : "Meglévő feladatlistából számolva."}</p>
              </div>
              <div className="rounded-lg border border-[#E8DFC9] bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#5F6A62]">Ellenőrzésre váró dokumentumok</p>
                <p className="mt-1 font-serif text-[28px] leading-none text-[#15201A]">{reviewDocumentCount}</p>
                <p className="mt-1 text-[11px] text-[#5F6A62]">{reviewDocumentCount === 0 ? "Nincs ellenőrzésre váró dokumentum." : "Dashboard/review adatokból számolva."}</p>
              </div>
              <div className="rounded-lg border border-[#E8DFC9] bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#5F6A62]">Félbehagyott munkák</p>
                <p className="mt-1 font-serif text-[28px] leading-none text-[#15201A]">{localWorkspaceDraftCount}</p>
                <p className="mt-1 text-[11px] text-[#5F6A62]">
                  {localWorkspaceDraftCount === 0 ? "Nincs helyi böngészős vázlat." : "Csak ezen az eszközön mentett helyi vázlat."}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-[#E8DFC9] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif text-[18px] text-[#15201A]">Gyors megnyitás</h3>
                <span className="text-[11px] text-[#5F6A62]">Munkaterületek</span>
              </div>
              <div className="mt-3 grid gap-2">
                {quickOpenLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-3 py-2 hover:bg-[#F8EDCD]">
                    <p className="text-xs font-semibold text-[#1F4A33]">{link.label}</p>
                    <p className="mt-0.5 text-[10.5px] text-[#5F6A62]">{link.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-[#D9CFB7] bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#5F6A62]">Átadások és aktivitás</p>
                <h3 className="mt-1 font-serif text-[20px] text-[#15201A]">Aszinkron ügyátadás</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#5F6A62]">
                  Meglévő feladatokból, ügyadatokból, dokumentum aktivitásból és helyi böngészős vázlatokból összeállított munkafolyamat-nézet.
                  A részletes aktivitási napló későbbi fejlesztés.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="rounded border border-[#E8DFC9] bg-[#FBF6E7] px-2 py-1.5">
                  <p className="font-serif text-[18px] leading-none text-[#15201A]">{openTasks.length}</p>
                  <p className="mt-1 text-[#5F6A62]">nyitott feladat</p>
                </div>
                <div className="rounded border border-[#E8DFC9] bg-[#FBF6E7] px-2 py-1.5">
                  <p className="font-serif text-[18px] leading-none text-[#15201A]">{attentionCases.length}</p>
                  <p className="mt-1 text-[#5F6A62]">figyelmet kérő ügy</p>
                </div>
                <div className="rounded border border-[#E8DFC9] bg-[#FBF6E7] px-2 py-1.5">
                  <p className="font-serif text-[18px] leading-none text-[#15201A]">{localWorkspaceDraftCount}</p>
                  <p className="mt-1 text-[#5F6A62]">helyi vázlat</p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-lg border border-[#E8DFC9] bg-[#FFFDF7] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F6A62]">Legutóbbi munkafolyamatok</p>
                  <Link href="/tasks" className="text-[11px] font-semibold text-[#1F4A33] hover:underline">
                    Feladatok megnyitása
                  </Link>
                </div>
                {loading ? <p className="mt-3 text-xs text-[#5F6A62]">Átadási nézet betöltése...</p> : null}
                {!loading && asyncHandoffItems.length === 0 ? (
                  <p className="mt-3 rounded border border-dashed border-[#D9CFB7] bg-[#FBF6E7] px-3 py-2 text-[11px] text-[#5F6A62]">
                    Nincs rögzített átadás. Nincs helyi böngészős munkavázlat.
                  </p>
                ) : null}
                <div className="mt-3 space-y-2">
                  {asyncHandoffItems.map((item) => (
                    <Link key={item.id} href={item.href} className="block rounded border border-[#E8DFC9] bg-white px-3 py-2 hover:bg-[#FBF6E7]">
                      <p className="text-xs font-semibold text-[#15201A]">{item.title}</p>
                      <p className="mt-1 text-[11px] text-[#5F6A62]">{item.meta} · {item.detail}</p>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-[#E8DFC9] bg-[#FFFDF7] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F6A62]">Folytatás gyorsan</p>
                <div className="mt-3 grid gap-2 text-[11px]">
                  <Link href="/tasks" className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-3 py-2 font-semibold text-[#1F4A33] hover:bg-[#F8EDCD]">
                    Feladatok megnyitása
                  </Link>
                  <Link href="/cases" className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-3 py-2 font-semibold text-[#1F4A33] hover:bg-[#F8EDCD]">
                    Ügyek megnyitása
                  </Link>
                  <Link href="/documents/compare" className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-3 py-2 font-semibold text-[#1F4A33] hover:bg-[#F8EDCD]">
                    Dokumentum-ellenőrzés
                  </Link>
                  <Link href="/litigation-workspace" className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-3 py-2 font-semibold text-[#1F4A33] hover:bg-[#F8EDCD]">
                    Peres munkatér
                  </Link>
                  <Link href="/editor-lab" className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-3 py-2 font-semibold text-[#1F4A33] hover:bg-[#F8EDCD]">
                    Editor labor
                  </Link>
                </div>
                <p className="mt-3 text-[10.5px] leading-5 text-[#5F6A62]">
                  Ez nem backend audit log, hanem aszinkron munkanézet meglévő adatokból és helyi böngészős jelzésekből.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-12 gap-3">
          <div className="col-span-12 space-y-3 xl:col-span-9">
            <article className="rounded-xl border border-[#D9CFB7] bg-[#FFFFFF] shadow-[0_1px_0_rgba(21,32,26,0.06)]">
              <div className="flex items-center justify-between border-b border-[#E8DFC9] px-4 py-3">
                <h2 className="font-serif text-[24px] text-[#15201A]">Mai teendők · Review sor</h2>
                <Link href="/reviews" className="rounded-md border border-[#D4C8AA] bg-[#FBF6E7] px-2 py-1 text-xs font-semibold text-[#1F4A33] hover:bg-[#F8EDCD]">Teljes sor</Link>
              </div>
              <div className="space-y-2 p-3">
                {loading ? <p className="px-2 py-3 text-xs text-[#5F6A62]">Betöltés...</p> : null}
                {!loading && reviewQueue.length === 0 ? (
                  <div className="space-y-2">
                    <EmptyState title="Még nincs review tétel" subtitle="A beérkező dokumentumok és feladatok itt jelennek meg áttekinthető sorban." />
                    <div className="flex justify-center gap-2">
                      <Link href="/reviews" className="rounded-md border border-[#D4C8AA] bg-white px-2 py-1 text-[11px] font-semibold text-[#1F4A33]">Teljes review sor</Link>
                      <Link href="/cases?newCase=1" className="rounded-md border border-[#173824] bg-[#1F4A33] px-2 py-1 text-[11px] font-semibold text-[#F4EFDB]">Új ügy</Link>
                    </div>
                  </div>
                ) : null}
                {reviewQueue.map((task) => (
                  <div key={task.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#E8DFC9] bg-[#FBF6E7] p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#15201A]">{task.title}</p>
                      <p className="mt-1 text-[11px] text-[#5F6A62]">{task.case?.caseNumber ? `${task.case.caseNumber} · Ügy review` : "Review tétel"}</p>
                      <p className="mt-1 text-[11px] text-[#5F6A62]">Határidő: {displayDate(task.dueDate)}</p>
                    </div>
                    <Link href={`/tasks?taskId=${task.id}`} className="shrink-0 rounded-md border border-[#D4C8AA] bg-white px-2 py-1 text-[11px] font-semibold text-[#1F4A33]">Megnyitás</Link>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-xl border border-[#D9CFB7] bg-[#FFFFFF] shadow-[0_1px_0_rgba(21,32,26,0.06)]">
              <div className="flex items-center justify-between border-b border-[#E8DFC9] px-4 py-3">
                <h2 className="font-serif text-[24px] text-[#15201A]">Aktív ügyek</h2>
                <Link href="/cases" className="rounded-md border border-[#D4C8AA] bg-[#FBF6E7] px-2 py-1 text-xs font-semibold text-[#1F4A33] hover:bg-[#F8EDCD]">Összes ügy</Link>
              </div>
              {loading ? <p className="px-4 py-4 text-xs text-[#5F6A62]">Ügyek betöltése...</p> : null}
              {!loading && cases.length === 0 ? (
                <div className="p-4 space-y-2">
                  <EmptyState title="Még nincs aktív ügy" subtitle="Nyiss egy új ügyet, és itt azonnal megjelenik a dokumentumfolyamat állapota." />
                  <div className="text-center">
                    <Link href="/cases?newCase=1" className="inline-flex rounded-md border border-[#173824] bg-[#1F4A33] px-3 py-1.5 text-[11px] font-semibold text-[#F4EFDB]">Új ügy indítása</Link>
                  </div>
                </div>
              ) : null}
              {!loading && cases.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-[#FBF6E7] text-[10px] uppercase tracking-[0.12em] text-[#5F6A62]">
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
                        <tr key={item.id} className="border-t border-[#EFE5CC] hover:bg-[#FBF6E7]">
                          <td className="px-3 py-3">
                            <p className="font-semibold text-[#15201A]">{item.caseNumber}</p>
                            <p className="text-[11px] text-[#5F6A62]">{item.title || "Névtelen ügy"}</p>
                          </td>
                          <td className="px-3 py-3 text-[#36433C]">{item.clientName || "Nincs ügyfél"}</td>
                          <td className="px-3 py-3">
                            {item.assignedLawyer ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2E6A4A] text-[10px] font-bold text-white">
                                  {initials(item.assignedLawyer.name)}
                                </span>
                                <span className="text-[11px] text-[#36433C]">{item.assignedLawyer.name}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#8A938B]">Nincs kijelölve</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {workflowPill("Eredeti", "ok")}
                              {workflowPill("Módosított", "progress")}
                              {workflowPill("Elemzés", "missing")}
                              {workflowPill("Jóváhagyás", "review")}
                            </div>
                            <p className="mt-1 text-[10px] text-[#8A938B]">Nincs dokumentumállapot</p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              <Link href={`/cases/${item.id}/documents`} className="rounded border border-[#D4C8AA] bg-white px-2 py-1 text-[11px] text-[#1F4A33]">Dokumentumtár</Link>
                              <Link href={`/documents/compare?caseId=${item.id}`} className="rounded border border-[#D4C8AA] bg-white px-2 py-1 text-[11px] text-[#1F4A33]">Workspace</Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </article>

            <article className="rounded-xl border border-[#D9CFB7] bg-[#FFFFFF] shadow-[0_1px_0_rgba(21,32,26,0.06)]">
              <div className="flex items-center justify-between border-b border-[#E8DFC9] px-4 py-3">
                <h2 className="font-serif text-[22px] text-[#15201A]">Csapatmunka board — előnézet</h2>
                <Link href="/tasks" className="rounded-md border border-[#D4C8AA] bg-[#FBF6E7] px-2 py-1 text-xs font-semibold text-[#1F4A33] hover:bg-[#F8EDCD]">Teljes board</Link>
              </div>
              <div className="overflow-x-auto p-3">
                <div className="grid min-w-[860px] grid-cols-4 gap-3 xl:min-w-0">
                  {["Előkészítés", "Review", "Javítás", "Átadásra kész"].map((col) => (
                    <div key={col} className="rounded-lg border border-[#E8DFC9] bg-[#FBF6E7] p-2">
                      <p className="text-[11px] font-semibold text-[#36433C]">{col}</p>
                      <div className="mt-2 space-y-2">
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
                            <div key={t.id} className="rounded border border-[#D9CFB7] bg-white p-2 text-[11px]">
                              <p className="font-semibold text-[#15201A]">{t.title}</p>
                              <p className="mt-1 text-[#5F6A62]">{t.case?.caseNumber || "Feladat"}</p>
                            </div>
                          ))}
                        {tasks.filter((t) => {
                          const bucket = mapTaskBucket(t);
                          if (col === "Előkészítés") return bucket === "waiting";
                          if (col === "Review") return bucket === "review";
                          if (col === "Javítás") return bucket === "depends";
                          return bucket === "ready";
                        }).length === 0 ? (
                          <div className="rounded border border-dashed border-[#D9CFB7] bg-[#F8F2E0] p-2 text-[10px] text-[#8A938B]">Nincs tétel ebben az oszlopban</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>

          <aside className="col-span-12 space-y-3 xl:col-span-3">
            <article className="rounded-xl border border-[#D9CFB7] bg-[#FFFFFF] p-3 shadow-[0_1px_0_rgba(21,32,26,0.06)]">
              <h3 className="border-b border-[#E8DFC9] pb-2 font-serif text-[22px] text-[#15201A]">Gyors műveletek</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <Link href="/cases?newCase=1" className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-2 py-2 text-center font-semibold text-[#1F4A33]">Új ügy</Link>
                <Link href="/reviews" className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-2 py-2 text-center font-semibold text-[#1F4A33]">Review sor</Link>
                <Link href={activeCase ? `/cases/${activeCase.id}/documents` : "/cases"} className="rounded border border-[#D4C8AA] bg-[#FBF6E7] px-2 py-2 text-center font-semibold text-[#1F4A33]">Dokumentum feltöltés</Link>
                <button type="button" disabled className="cursor-not-allowed rounded border border-dashed border-[#D4C8AA] bg-[#F3EFE4] px-2 py-2 text-center font-semibold text-[#8A938B]" title="Hamarosan">Munkaóra rögzítés · Hamarosan</button>
              </div>
            </article>

            <article className="rounded-xl border border-[#D9CFB7] bg-[#FFFFFF] p-3 shadow-[0_1px_0_rgba(21,32,26,0.06)]">
              <h3 className="border-b border-[#E8DFC9] pb-2 font-serif text-[22px] text-[#15201A]">Mai & holnapi határidők</h3>
              <div className="mt-2 space-y-2 text-xs">
                {upcomingDeadlines.length === 0 ? <EmptyState title="Nincs közeli határidő" subtitle="A mai és holnapi határidők itt fognak gyűlni." /> : null}
                {upcomingDeadlines.map((task) => (
                  <div key={task.id} className="rounded border border-[#E8DFC9] bg-[#FBF6E7] p-2">
                    <p className="font-semibold text-[#15201A]">{task.title}</p>
                    <p className="mt-1 text-[11px] text-[#5F6A62]">{displayDate(task.dueDate)} · {task.case?.caseNumber || "Feladat"}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-xl border border-[#D9CFB7] bg-[#FFFFFF] p-3 shadow-[0_1px_0_rgba(21,32,26,0.06)]">
              <h3 className="border-b border-[#E8DFC9] pb-2 font-serif text-[22px] text-[#15201A]">Legutóbbi dokumentumok</h3>
              <div className="mt-2 space-y-2 text-xs">
                {recentDocuments.length === 0 ? <EmptyState title="Nincs dokumentum előzmény" subtitle="A legfrissebb feltöltések és módosítások itt jelennek meg." /> : null}
                {recentDocuments.map((item) => (
                  <div key={item.id} className="rounded border border-[#E8DFC9] bg-[#FBF6E7] p-2">
                    <p className="font-semibold text-[#15201A]">{mapRecentDocLabel(item.type || item.text)}</p>
                    <p className="mt-1 text-[11px] text-[#5F6A62]">{displayDateTimeShort(item.timestamp)}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-xl border border-[#D9CFB7] bg-[#FFFFFF] p-3 shadow-[0_1px_0_rgba(21,32,26,0.06)]">
              <h3 className="border-b border-[#E8DFC9] pb-2 font-serif text-[22px] text-[#15201A]">Hírek / jogi-piaci jelzések</h3>
              <div className="mt-2 space-y-2 text-xs">
                {legalNews.isLoading ? <p className="text-[#8A938B]">Hírfeed betöltése...</p> : null}
                {!legalNews.isLoading && (legalNews.error || legalSignals.length === 0) ? (
                  <div className="rounded border border-dashed border-[#D9CFB7] bg-[#FBF6E7] p-2 text-[#5F6A62]">
                    Előkészítés alatt — a hírfeed későbbi patchben aktiválható.
                  </div>
                ) : null}
                {legalSignals.map((article, index) => (
                  <div key={`${article.title}-${index}`} className="rounded border border-[#E8DFC9] bg-[#FBF6E7] p-2">
                    <p className="font-semibold text-[#15201A]">{article.title}</p>
                    <p className="mt-1 text-[11px] text-[#5F6A62]">{article.source} · {article.date}</p>
                    {article.url ? (
                      <a href={article.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-semibold text-[#1F4A33] hover:underline">
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
