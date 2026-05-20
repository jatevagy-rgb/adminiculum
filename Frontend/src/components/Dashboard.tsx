"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCommunications,
  getMyTasks,
  getCases,
  getDashboardStats,
  getCurrentUser,
  getNewsFeed,
  type CommunicationItem,
  type TaskItem,
  type CaseListItem,
  type DashboardStats,
  type CurrentUser,
} from "@/lib/api";
import { useUiPack } from "@/lib/uiPack";
import { WorkspaceLayout, Panel, Card, SectionBlock } from "@/components/ui/WorkspacePrimitives";

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

const formatRelativeDate = (iso?: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("hu-HU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("hu-HU", { dateStyle: "short" });
};

const mapStatusLabel = (status?: string) => {
  if (!status) return "Ismeretlen állapot";
  const normalized = status.trim().toUpperCase();
  switch (normalized) {
    case "TODO":
    case "ASSIGNED":
    case "PENDING":
      return "Teendő";
    case "IN_PROGRESS":
      return "Folyamatban";
    case "SUBMITTED":
    case "REVIEW_NEEDED":
      return "Review alatt";
    case "COMPLETED":
    case "APPROVED":
    case "FINALIZED":
      return "Kész";
    case "REJECTED":
      return "Visszaküldve";
    case "BLOCKED":
      return "Blokkolva";
    case "CANCELLED":
      return "Törölve";
    case "ACTIVE":
    case "OPEN":
      return "Aktív";
    case "ARCHIVED":
      return "Archivált";
    case "DRAFT":
      return "Piszkozat";
    default:
      return "Ismeretlen állapot";
  }
};

export function Dashboard() {
  const [uiPack] = useUiPack();
  const isSignal = uiPack === "signal_tiles_console";

  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [myCases, setMyCases] = useState<CaseListItem[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [legalNews, setLegalNews] = useState<NewsFeedResult>({ articles: [], isLoading: true });
  const [ecofinNews, setEcofinNews] = useState<NewsFeedResult>({ articles: [], isLoading: true });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);

      const [communicationPage, myTasks, casesData, stats] = await Promise.all([
        getCommunications({ limit: 8 }),
        getMyTasks(),
        getCases(1, 10, user.id),
        getDashboardStats(),
      ]);

      setCommunications(communicationPage.communications);
      setTasks(myTasks);
      setMyCases(casesData.data);
      setDashboardStats(stats);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
      setError(err instanceof Error ? err.message : "Háttéradat betöltése sikertelen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const loadLegal = async () => {
      try {
        const result = await getNewsFeed("legal");
        setLegalNews({ articles: result.articles || [], error: result.error, isLoading: false });
      } catch {
        setLegalNews({
          articles: [],
          error: "A hírfolyam jelenleg nem érhető el.",
          isLoading: false,
        });
      }
    };

    const loadEcofin = async () => {
      try {
        const result = await getNewsFeed("ecofin");
        setEcofinNews({ articles: result.articles || [], error: result.error, isLoading: false });
      } catch {
        setEcofinNews({
          articles: [],
          error: "A hírfolyam jelenleg nem érhető el.",
          isLoading: false,
        });
      }
    };

    loadLegal();
    loadEcofin();
  }, []);

  const externalMessages = useMemo(
    () => communications.filter((item) => item.type !== "NOTE").slice(0, 4),
    [communications]
  );

  const internalNotes = useMemo(
    () => communications.filter((item) => item.type === "NOTE").slice(0, 4),
    [communications]
  );

  const assignedTasks = useMemo(
    () => tasks.filter((task) => task.status.toLowerCase() !== "completed").slice(0, 4),
    [tasks]
  );

  const pendingReviews = useMemo(() => {
    const reviewRegex = /review|approval|pending|waiting/i;
    return tasks.filter((task) => reviewRegex.test(task.status)).slice(0, 4);
  }, [tasks]);

  const nextSteps = useMemo(() => {
    const taskSteps = assignedTasks.slice(0, 3).map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      href: `/tasks?taskId=${task.id}`,
      meta: task.case?.caseNumber ? `${task.case.caseNumber} · Feladat` : "Feladat",
    }));
    const caseSteps = myCases.slice(0, 2).map((c) => ({
      id: `case-${c.id}`,
      title: c.title || c.caseNumber,
      href: `/cases/${c.id}`,
      meta: `${c.caseNumber} · Ügy`,
    }));
    return [...taskSteps, ...caseSteps].slice(0, 4);
  }, [assignedTasks, myCases]);

  const upcomingDeadlines = useMemo(() => {
    return tasks
      .filter((task) => !!task.dueDate && task.status.toLowerCase() !== "completed")
      .sort((a, b) => new Date(a.dueDate || "").getTime() - new Date(b.dueDate || "").getTime())
      .slice(0, 5);
  }, [tasks]);

  const toneTitle = isSignal ? "text-[#F8FAFC]" : "text-[#0F172A]";
  const toneMuted = isSignal ? "text-[#93A8C9]" : "text-[#64748B]";

  const rowCardTone = isSignal
    ? "rounded-md border border-[#243B63] bg-[#16253D] text-[#D6E2F2]"
    : "rounded-md border border-[#E2E8F0] bg-white text-[#1E293B]";

  const renderMessageRow = (item: CommunicationItem) => (
    <Card key={item.id} uiPack={uiPack} className={rowCardTone}>
      <p className={`text-[10px] uppercase tracking-[0.22em] ${toneMuted}`}>{formatRelativeDate(item.createdAt)}</p>
      <h3 className={`text-sm font-semibold mt-1 ${toneTitle}`}>{item.subject || "Nincs tárgy"}</h3>
      <p className={`text-xs mt-2 line-clamp-3 ${toneMuted}`}>{item.summary || item.content || "Nincs előnézet."}</p>
      <div className="text-xs mt-2 flex items-center justify-between">
        <span className={toneMuted}>{item.senderName || item.recipientName || "Külső kommunikáció"}</span>
        {item.case && (
          <Link href={`/cases/${item.case.id}`} className="text-[#38BDF8] hover:underline">
            {item.case.caseNumber}
          </Link>
        )}
      </div>
    </Card>
  );

  const renderTaskRow = (task: TaskItem) => (
    <Card key={task.id} uiPack={uiPack} className={rowCardTone}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`text-sm font-semibold ${toneTitle}`}>
          <Link href={`/tasks?taskId=${task.id}`} className="hover:text-[#38BDF8]">{task.title}</Link>
        </h3>
        <span className="inline-flex items-center rounded-full border border-[#D8CDB6] bg-[#FAF5EA] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5A4A2A]">
          {mapStatusLabel(task.status)}
        </span>
      </div>
      <p className={`text-xs mt-2 line-clamp-3 ${toneMuted}`}>{task.description || "Nincs leírás."}</p>
      {task.dueDate && (
        <p className={`text-[10px] uppercase tracking-[0.22em] mt-2 ${toneMuted}`}>
          Határidő {new Date(task.dueDate).toLocaleDateString("hu-HU", { dateStyle: "short" })}
        </p>
      )}
    </Card>
  );

  const renderCaseRow = (c: CaseListItem) => (
    <Card key={c.id} uiPack={uiPack} className={rowCardTone}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`text-sm font-semibold ${toneTitle}`}>
          <Link href={`/cases/${c.id}`} className="hover:text-[#38BDF8]">{c.caseNumber}</Link>
        </h3>
        <span className="inline-flex items-center rounded-full border border-[#D8CDB6] bg-[#FAF5EA] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5A4A2A]">
          {mapStatusLabel(c.status)}
        </span>
      </div>
      <p className={`text-xs mt-1 ${toneMuted}`}>{c.clientName} • {c.matterType}</p>
      <p className={`text-[10px] uppercase tracking-[0.2em] mt-2 ${toneMuted}`}>Frissítve {formatDate(c.updatedAt)}</p>
    </Card>
  );

  const renderNewsRow = (article: NewsArticle, idx: number) => (
    <Card key={`${article.title}-${idx}`} uiPack={uiPack} className={rowCardTone}>
      <p className={`text-[10px] uppercase tracking-[0.2em] ${toneMuted}`}>{article.date}</p>
      <h3 className={`text-sm font-semibold mt-1 line-clamp-2 ${toneTitle}`}>{article.title}</h3>
      {article.description && <p className={`text-xs mt-1 line-clamp-2 ${toneMuted}`}>{article.description}</p>}
      <div className="text-[10px] mt-2 flex items-center justify-between">
        <span className={toneMuted}>{article.source}</span>
        {article.url && (
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-[#38BDF8] hover:underline">
            Megnyitás →
          </a>
        )}
      </div>
    </Card>
  );

  const headerPanel = (
    <Panel uiPack={uiPack} className="dashboard-surface rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={`text-[30px] leading-none ${toneTitle}`}>Mai jogi munkapad</h1>
          <p className={`text-xs mt-2 ${toneMuted}`}>
            Aktív ügyek, review-k, határidők és következő lépések egy helyen.
          </p>
          {currentUser?.name && <p className={`text-[11px] mt-2 ${toneMuted}`}>Bejelentkezve: {currentUser.name}</p>}
        </div>
        <Link
          href="/cases"
          className={`text-[10px] uppercase tracking-[0.24em] border px-3 py-2 ${
            isSignal ? "border-[#334155] text-[#E2E8F0] bg-[#0F172A]" : "border-[#1F3B2D] text-[#1F3B2D] bg-white"
          }`}
        >
          Megnyitás
        </Link>
      </div>
      {error && <div className="mt-4 bg-[#FEF3F2] border border-[#FCCFC7] text-[#8E2A2A] p-3 text-xs rounded-lg">{error}</div>}
    </Panel>
  );

  const quickActions = (
    <Panel uiPack={uiPack} className="rounded-xl p-4">
      <SectionBlock title="Gyors útvonalak" subtitle="Leggyakoribb műveletek">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Link href="/cases" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Ügyek</Link>
          <Link href="/cases?newCase=1" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Új ügy</Link>
          <Link href="/reviews" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Review sor</Link>
          <Link href="/notifications" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Értesítések</Link>
          <Link href="/time-entries" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Munkaórák</Link>
          <Link href="/clause-library" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Záradék könyvtár</Link>
        </div>
      </SectionBlock>
    </Panel>
  );

  return (
    <div className="dashboard-surface space-y-4">
      {headerPanel}

      <WorkspaceLayout
        uiPack={uiPack}
        right={
          <div className="p-4 space-y-4">
            {quickActions}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Következő lépések" subtitle="Mai fókuszpontok">
                {loading ? (
                  <p className={`text-xs ${toneMuted}`}>Betöltés...</p>
                ) : nextSteps.length ? (
                  <div className="space-y-2">
                    {nextSteps.map((step) => (
                      <Card key={step.id} uiPack={uiPack} className={rowCardTone}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={`text-sm font-semibold ${toneTitle}`}>{step.title}</p>
                            <p className={`text-[11px] mt-1 ${toneMuted}`}>{step.meta}</p>
                          </div>
                          <Link href={step.href} className="text-[#38BDF8] text-xs hover:underline">
                            Megnyitás
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className={`text-xs ${toneMuted}`}>Nincs kijelölt következő lépés.</p>
                )}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Review alatt / rám vár" subtitle="Saját review teendők">
                {loading ? <p className={`text-xs ${toneMuted}`}>Betöltés...</p> : pendingReviews.length ? <div className="space-y-2">{pendingReviews.map(renderTaskRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs review-ra váró dokumentum.</p>}
              </SectionBlock>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Határidők" subtitle="Közelgő teendők">
                {loading ? (
                  <p className={`text-xs ${toneMuted}`}>Betöltés...</p>
                ) : upcomingDeadlines.length ? (
                  <div className="space-y-2">
                    {upcomingDeadlines.map(renderTaskRow)}
                  </div>
                ) : (
                  <p className={`text-xs ${toneMuted}`}>Nincs közelgő határidő.</p>
                )}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Aktív ügyek" subtitle="Saját portfólió">
                {loading ? <p className={`text-xs ${toneMuted}`}>Betöltés...</p> : myCases.length ? <div className="space-y-2">{myCases.slice(0, 5).map(renderCaseRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs hozzád rendelt ügy.</p>}
              </SectionBlock>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Kommunikáció" subtitle="Külső és belső üzenetek">
                {loading ? (
                  <p className={`text-xs ${toneMuted}`}>Betöltés...</p>
                ) : externalMessages.length || internalNotes.length ? (
                  <div className="space-y-2">
                    {externalMessages.slice(0, 2).map(renderMessageRow)}
                    {internalNotes.slice(0, 2).map(renderMessageRow)}
                  </div>
                ) : (
                  <p className={`text-xs ${toneMuted}`}>Nincs friss kommunikáció.</p>
                )}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Irodai hírek / Piaci jelzések" subtitle="Másodlagos információs blokk">
                <div className="grid gap-2">
                  {legalNews.articles.slice(0, 2).map(renderNewsRow)}
                  {ecofinNews.articles.slice(0, 2).map(renderNewsRow)}
                  {!legalNews.articles.length && !ecofinNews.articles.length && (
                    <p className={`text-xs ${toneMuted}`}>Nincs elérhető hírjelzés.</p>
                  )}
                </div>
              </SectionBlock>
            </Panel>
          </div>
        </div>
      </WorkspaceLayout>
    </div>
  );
}
