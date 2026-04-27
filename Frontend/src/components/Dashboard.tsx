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
  isFallback?: boolean;
};

const LEGAL_BASELINE_ARTICLES: NewsArticle[] = [
  {
    title: "Hírfolyam ideiglenesen nem elérhető",
    source: "Adminiculum baseline",
    date: "Most",
    description: "A külső jogi feed jelenleg nem tölthető be. A dashboard további moduljai változatlanul működnek.",
  },
];

const ECOFIN_BASELINE_ARTICLES: NewsArticle[] = [
  {
    title: "Gazdasági feed ideiglenesen nem elérhető",
    source: "Adminiculum baseline",
    date: "Most",
    description: "A külső gazdasági feed jelenleg nem tölthető be. A felület stabil baseline módban fut.",
  },
];

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
        if (result.articles.length > 0) {
          setLegalNews({ articles: result.articles, error: result.error, isLoading: false });
        } else {
          setLegalNews({
            articles: LEGAL_BASELINE_ARTICLES,
            error: result.error || "A hírfolyam jelenleg nem érhető el.",
            isLoading: false,
            isFallback: true,
          });
        }
      } catch {
        setLegalNews({
          articles: LEGAL_BASELINE_ARTICLES,
          error: "A hírfolyam jelenleg nem érhető el.",
          isLoading: false,
          isFallback: true,
        });
      }
    };

    const loadEcofin = async () => {
      try {
        const result = await getNewsFeed("ecofin");
        if (result.articles.length > 0) {
          setEcofinNews({ articles: result.articles, error: result.error, isLoading: false });
        } else {
          setEcofinNews({
            articles: ECOFIN_BASELINE_ARTICLES,
            error: result.error || "A hírfolyam jelenleg nem érhető el.",
            isLoading: false,
            isFallback: true,
          });
        }
      } catch {
        setEcofinNews({
          articles: ECOFIN_BASELINE_ARTICLES,
          error: "A hírfolyam jelenleg nem érhető el.",
          isLoading: false,
          isFallback: true,
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

  const signalStrip = useMemo(
    () => [
      {
        id: "high-priority",
        label: "High-priority tasks",
        value: assignedTasks.filter((task) => /urgent|high|asap/i.test(String(task.status))).length,
        hint: "Végrehajtási nyomás",
      },
      {
        id: "review-pressure",
        label: "Review pressure",
        value: pendingReviews.length,
        hint: "Review backlog",
      },
      {
        id: "external-signal",
        label: "External signal",
        value: externalMessages.length,
        hint: "Ügyfélkommunikáció",
      },
      {
        id: "owned-cases",
        label: "Owned cases",
        value: myCases.length,
        hint: "Aktív portfólió",
      },
    ],
    [assignedTasks, pendingReviews.length, externalMessages.length, myCases.length]
  );

  const insightKpis = useMemo(() => {
    const s = dashboardStats?.stats;
    return [
      { id: "total", label: "Összes ügy", value: s?.totalCases ?? myCases.length },
      { id: "review", label: "Review alatt", value: s?.inReview ?? pendingReviews.length },
      { id: "pending", label: "Ügyfélre vár", value: s?.pendingClient ?? 0 },
      { id: "month", label: "Lezárt (hó)", value: s?.completedThisMonth ?? 0 },
    ];
  }, [dashboardStats?.stats, myCases.length, pendingReviews.length]);

  const toneTitle = isSignal ? "text-[#F8FAFC]" : "text-[#0F172A]";
  const toneMuted = isSignal ? "text-[#93A8C9]" : "text-[#64748B]";

  const rowCardTone = isSignal
    ? "rounded-md border border-[#243B63] bg-[#16253D] text-[#D6E2F2]"
    : "rounded-md border border-[#E2E8F0] bg-white text-[#1E293B]";

  const renderMessageRow = (item: CommunicationItem) => (
    <Card key={item.id} uiPack={uiPack} className={rowCardTone}>
      <p className={`text-[10px] uppercase tracking-[0.22em] ${toneMuted}`}>{formatRelativeDate(item.createdAt)}</p>
      <h3 className={`text-sm font-semibold mt-1 ${toneTitle}`}>{item.subject || "(No subject)"}</h3>
      <p className={`text-xs mt-2 line-clamp-3 ${toneMuted}`}>{item.summary || item.content || "No preview available."}</p>
      <div className="text-xs mt-2 flex items-center justify-between">
        <span className={toneMuted}>{item.senderName || item.recipientName || "External"}</span>
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
        <span className={`text-[10px] uppercase tracking-[0.22em] ${toneMuted}`}>{task.status}</span>
      </div>
      <p className={`text-xs mt-2 line-clamp-3 ${toneMuted}`}>{task.description || "No description provided."}</p>
      {task.dueDate && (
        <p className={`text-[10px] uppercase tracking-[0.22em] mt-2 ${toneMuted}`}>
          Due {new Date(task.dueDate).toLocaleDateString("hu-HU", { dateStyle: "short" })}
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
        <span className={`text-[10px] uppercase tracking-[0.2em] ${toneMuted}`}>{c.status}</span>
      </div>
      <p className={`text-xs mt-1 ${toneMuted}`}>{c.clientName} • {c.matterType}</p>
      <p className={`text-[10px] uppercase tracking-[0.2em] mt-2 ${toneMuted}`}>Updated {formatDate(c.updatedAt)}</p>
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
          <h1 className={`text-[30px] leading-none ${toneTitle}`}>Mai jogi műveletek</h1>
          <p className={`text-xs mt-2 ${toneMuted}`}>
            {isSignal
              ? "Operator dashboard: gyors jelzés, prioritás és műveleti fókusz."
              : "Overview dashboard: KPI és moduláris áttekintő rács jelentés-orientált ritmussal."}
          </p>
          {currentUser?.name && <p className={`text-[11px] mt-2 ${toneMuted}`}>Bejelentkezve: {currentUser.name}</p>}
        </div>
        <button
          onClick={loadData}
          className={`text-[10px] uppercase tracking-[0.3em] border px-3 py-2 ${
            isSignal ? "border-[#334155] text-[#E2E8F0] bg-[#0F172A]" : "border-[#CBD5E1] text-[#1E293B] bg-white"
          }`}
        >
          Refresh
        </button>
      </div>
      {error && <div className="mt-4 bg-[#FEF3F2] border border-[#FCCFC7] text-[#8E2A2A] p-3 text-xs rounded-lg">{error}</div>}
    </Panel>
  );

  const quickActions = (
    <Panel uiPack={uiPack} className="rounded-xl p-4">
      <SectionBlock title="Gyors útvonalak" subtitle="Workflow jump points">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Link href="/cases" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Ügylista</Link>
          <Link href="/tasks" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Feladatok</Link>
          <Link href="/reviews" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Review sor</Link>
          <Link href="/notifications" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Értesítések</Link>
        </div>
      </SectionBlock>
    </Panel>
  );

  if (isSignal) {
    return (
      <div className="dashboard-surface space-y-4">
        {headerPanel}

        <Panel uiPack={uiPack} className="rounded-xl p-4">
          <SectionBlock title="Signal strip" subtitle="Azonnali operatív állapotkép">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {signalStrip.map((s) => (
                <Card key={s.id} uiPack={uiPack} emphasis="primary">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#93A8C9]">{s.label}</p>
                  <p className="text-3xl text-white mt-2">{s.value}</p>
                  <p className="text-[11px] text-[#93A8C9] mt-1">{s.hint}</p>
                </Card>
              ))}
            </div>
          </SectionBlock>
        </Panel>

        <Panel uiPack={uiPack} className="rounded-xl p-4">
          <SectionBlock title="Legal + Ecofin feed" subtitle="Piaci és jogi kontextus">
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#93A8C9] mb-2">Jogi signal</p>
                {(legalNews.articles.length ? legalNews.articles : LEGAL_BASELINE_ARTICLES).slice(0, 3).map(renderNewsRow)}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#93A8C9] mb-2">Ecofin signal</p>
                {(ecofinNews.articles.length ? ecofinNews.articles : ECOFIN_BASELINE_ARTICLES).slice(0, 3).map(renderNewsRow)}
              </div>
            </div>
          </SectionBlock>
        </Panel>

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
                <SectionBlock title="Task control" subtitle="Aktív feladatvégrehajtás">
                  {loading ? <p className={`text-xs ${toneMuted}`}>Loading tasks...</p> : assignedTasks.length ? <div className="space-y-2">{assignedTasks.map(renderTaskRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs aktív feladat.</p>}
                </SectionBlock>
              </Panel>
              <Panel uiPack={uiPack} className="rounded-xl p-4">
                <SectionBlock title="Review control" subtitle="Approval workflow nyomás">
                  {loading ? <p className={`text-xs ${toneMuted}`}>Checking review queue...</p> : pendingReviews.length ? <div className="space-y-2">{pendingReviews.map(renderTaskRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs reviewra váró tétel.</p>}
                </SectionBlock>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel uiPack={uiPack} className="rounded-xl p-4">
                <SectionBlock title="Case radar" subtitle="Saját ügy-portfólió">
                  {loading ? <p className={`text-xs ${toneMuted}`}>Loading your cases...</p> : myCases.length ? <div className="space-y-2">{myCases.slice(0, 5).map(renderCaseRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs hozzád rendelt ügy.</p>}
                </SectionBlock>
              </Panel>
              <Panel uiPack={uiPack} className="rounded-xl p-4">
                <SectionBlock title="Message signal" subtitle="Külső + belső kommunikáció">
                  {loading ? (
                    <p className={`text-xs ${toneMuted}`}>Refreshing communications...</p>
                  ) : (
                    <div className="space-y-2">
                      {externalMessages.slice(0, 2).map(renderMessageRow)}
                      {internalNotes.slice(0, 2).map(renderMessageRow)}
                    </div>
                  )}
                </SectionBlock>
              </Panel>
            </div>
          </div>
        </WorkspaceLayout>
      </div>
    );
  }

  return (
    <div className="dashboard-surface space-y-4">
      {headerPanel}

      <Panel uiPack={uiPack} className="rounded-xl p-4">
        <SectionBlock title="Legal + Ecofin feed" subtitle="Piaci és jogi kontextus">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#64748B] mb-2">Jogi signal</p>
              {(legalNews.articles.length ? legalNews.articles : LEGAL_BASELINE_ARTICLES).slice(0, 3).map(renderNewsRow)}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#64748B] mb-2">Ecofin signal</p>
              {(ecofinNews.articles.length ? ecofinNews.articles : ECOFIN_BASELINE_ARTICLES).slice(0, 3).map(renderNewsRow)}
            </div>
          </div>
        </SectionBlock>
      </Panel>

      <Panel uiPack={uiPack} className="rounded-xl p-4">
        <SectionBlock title="KPI áttekintés" subtitle="Napi összkép és státusz-metrikák">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {insightKpis.map((kpi) => (
              <Card key={kpi.id} uiPack={uiPack} emphasis="primary">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#64748B]">{kpi.label}</p>
                <p className="text-3xl text-[#0F172A] mt-2">{kpi.value}</p>
              </Card>
            ))}
          </div>
        </SectionBlock>
      </Panel>

      <WorkspaceLayout uiPack={uiPack}>
        <div className="space-y-4">
          {quickActions}
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Külső üzenetek" subtitle="Ügyfélkommunikáció">
                {loading ? <p className={`text-xs ${toneMuted}`}>Loading external messages...</p> : externalMessages.length ? <div className="space-y-2">{externalMessages.map(renderMessageRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs új külső üzenet.</p>}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Belső jegyzetek" subtitle="Csapatfrissítések">
                {loading ? <p className={`text-xs ${toneMuted}`}>Refreshing internal notes...</p> : internalNotes.length ? <div className="space-y-2">{internalNotes.map(renderMessageRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs friss belső jegyzet.</p>}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Feladatok" subtitle="Aktív teendők">
                {loading ? <p className={`text-xs ${toneMuted}`}>Loading tasks...</p> : assignedTasks.length ? <div className="space-y-2">{assignedTasks.map(renderTaskRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs aktív feladat.</p>}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Review sor" subtitle="Approval workflow">
                {loading ? <p className={`text-xs ${toneMuted}`}>Checking review queue...</p> : pendingReviews.length ? <div className="space-y-2">{pendingReviews.map(renderTaskRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs reviewra váró tétel.</p>}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl p-4">
              <SectionBlock title="Saját ügyeim" subtitle="Felelősségi portfólió">
                {loading ? <p className={`text-xs ${toneMuted}`}>Loading your cases...</p> : myCases.length ? <div className="space-y-2">{myCases.slice(0, 4).map(renderCaseRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs hozzád rendelt ügy.</p>}
              </SectionBlock>
            </Panel>

          </div>
        </div>
      </WorkspaceLayout>
    </div>
  );
}
