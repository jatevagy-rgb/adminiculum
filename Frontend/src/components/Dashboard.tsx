"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCommunications,
  getMyTasks,
  getCases,
  getDashboardStats,
  getUnreadNotificationsCount,
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
  const [unreadNotifications, setUnreadNotifications] = useState<number | null>(null);
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

      const [communicationPage, myTasks, casesData, stats, unreadInfo] = await Promise.all([
        getCommunications({ limit: 8 }),
        getMyTasks(),
        getCases(1, 10, user.id),
        getDashboardStats(),
        getUnreadNotificationsCount().catch(() => null),
      ]);

      setCommunications(communicationPage.communications);
      setTasks(myTasks);
      setMyCases(casesData.data);
      setDashboardStats(stats);
      setUnreadNotifications(unreadInfo?.unreadCount ?? null);
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
  const reviewCount = pendingReviews.length;
  const caseCount = myCases.length;

  const activeCase = useMemo(() => myCases[0] ?? null, [myCases]);
  const activeCaseId = activeCase?.id ?? null;

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

  const nextPrimaryAction = useMemo(() => {
    const task = assignedTasks[0];
    if (task?.dueDate) {
      return {
        title: task.title,
        helper: `Határidő: ${new Date(task.dueDate).toLocaleDateString("hu-HU", { dateStyle: "short" })}`,
        href: `/tasks?taskId=${task.id}`,
        cta: "Feladat megnyitása",
      };
    }
    if (task) {
      return {
        title: task.title,
        helper: "Feladat végrehajtása folyamatban",
        href: `/tasks?taskId=${task.id}`,
        cta: "Feladat megnyitása",
      };
    }
    if (activeCaseId) {
      return {
        title: "Szerződés-workspace megnyitása",
        helper: "Az aktív ügyhöz tartozó munkaterület folytatásához.",
        href: `/documents/compare?caseId=${activeCaseId}`,
        cta: "Workspace megnyitása",
      };
    }
    return null;
  }, [activeCaseId, assignedTasks]);

  const toneTitle = isSignal ? "text-[#F8FAFC]" : "text-[#1F2A24]";
  const toneMuted = isSignal ? "text-[#93A8C9]" : "text-[#5F675F]";

  const rowCardTone = isSignal
    ? "rounded-md border border-[#243B63] bg-[#16253D] text-[#D6E2F2]"
    : "rounded-md border border-[#DDD7CA] border-l-4 border-l-[#B58A2A] bg-[#FFFDF7] text-[#1F2A24]";

  const renderMessageRow = (item: CommunicationItem) => (
    <Card key={item.id} uiPack={uiPack} className={rowCardTone}>
      <p className={`text-[10px] uppercase tracking-[0.22em] ${toneMuted}`}>{formatRelativeDate(item.createdAt)}</p>
      <h3 className={`text-sm font-semibold mt-1 ${toneTitle}`}>{item.subject || "Nincs tárgy"}</h3>
      <p className={`text-xs mt-2 line-clamp-3 ${toneMuted}`}>{item.summary || item.content || "Nincs előnézet."}</p>
      <div className="text-xs mt-2 flex items-center justify-between">
        <span className={toneMuted}>{item.senderName || item.recipientName || "Külső kommunikáció"}</span>
        {item.case && (
          <Link href={`/cases/${item.case.id}`} className="text-[#1F4A33] hover:underline">
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
          <Link href={`/tasks?taskId=${task.id}`} className="hover:text-[#1F4A33]">{task.title}</Link>
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
          <Link href={`/cases/${c.id}`} className="hover:text-[#1F4A33]">{c.caseNumber}</Link>
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
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-[#1F4A33] hover:underline">
            Megnyitás →
          </a>
        )}
      </div>
    </Card>
  );

  const headerPanel = (
    <Panel uiPack={uiPack} className="dashboard-surface rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={`text-[30px] leading-none ${toneTitle}`}>Mai jogi munkapad</h1>
          {currentUser?.name && <p className={`text-[11px] mt-2 ${toneMuted}`}>Bejelentkezve: {currentUser.name}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/cases" className={`inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] border px-3 py-2 ${isSignal ? "border-[#334155] text-[#E2E8F0] bg-[#0F172A]" : "border-[#173824] bg-[#1F4A33] text-[#F4EFDB]"}`}>Ügyek{typeof caseCount === "number" ? <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${isSignal ? "bg-[#1E293B] text-[#BFDBFE]" : "bg-[#F7F0D9] text-[#173824]"}`}>{caseCount}</span> : null}</Link>
          <Link href="/reviews" className={`inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] border px-3 py-2 ${isSignal ? "border-[#334155] text-[#E2E8F0] bg-[#0F172A]" : "border-[#8E6A1B] bg-[#B58A2A] text-[#1F2A24]"}`}>Review sor{typeof reviewCount === "number" ? <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${isSignal ? "bg-[#1E293B] text-[#BFDBFE]" : "bg-[#F7F0D9] text-[#8E6A1B]"}`}>{reviewCount}</span> : null}</Link>
          <Link href="/notifications" className={`inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] border px-3 py-2 ${isSignal ? "border-[#334155] text-[#E2E8F0] bg-[#0F172A]" : "border-[#4A6B4A] bg-[#E2E8DA] text-[#1F4A33]"}`}>Értesítések{typeof unreadNotifications === "number" ? <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${isSignal ? "bg-[#1E293B] text-[#BFDBFE]" : "bg-white text-[#1F4A33]"}`}>{unreadNotifications}</span> : null}</Link>
        </div>
      </div>
      {error && <div className="mt-4 bg-[#FEF3F2] border border-[#FCCFC7] text-[#8E2A2A] p-3 text-xs rounded-lg">{error}</div>}
    </Panel>
  );

  const quickActions = (
    <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-4">
      <SectionBlock title="Gyors útvonalak" subtitle="Leggyakoribb műveletek">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Link href="/cases" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Ügyek</Link>
          <Link href="/cases?newCase=1" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Új ügy</Link>
          <Link href="/reviews" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Review sor</Link>
          <Link href="/notifications" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Értesítések</Link>
          <Link href="/time-entries" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Munkaórák</Link>
          <Link href="/clause-library" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Záradék könyvtár</Link>
          <Link href="/settings" className={`px-3 py-2 border rounded-md ${isSignal ? "border-[#334155] hover:bg-[#16253D]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>Beállítások</Link>
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
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] border-l-4 border-l-[#1F4A33] bg-[#FFFDF7] p-4">
              <SectionBlock title="Aktív ügy" subtitle="Aktív munkaterület">
                {loading ? (
                  <p className={`text-xs ${toneMuted}`}>Betöltés...</p>
                ) : activeCase ? (
                  <div className="space-y-3">
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.18em] ${toneMuted}`}>{activeCase.caseNumber}</p>
                      <h3 className={`text-xl leading-tight ${toneTitle}`}>{activeCase.title || "Névtelen ügy"}</h3>
                      <p className={`text-xs mt-1 ${toneMuted}`}>{activeCase.clientName || "Ügyféladat nem elérhető"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/cases/${activeCase.id}`} className="rounded-md bg-[#1F4A33] px-3 py-2 text-xs font-semibold text-[#F4EFDB]">Ügy megnyitása</Link>
                      <Link href={`/cases/${activeCase.id}/documents`} className="rounded-md border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-2 text-xs font-semibold text-[#1F3B2D]">Dokumentumtár</Link>
                      <Link href={`/documents/compare?caseId=${activeCase.id}`} className="rounded-md border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-2 text-xs font-semibold text-[#1F3B2D]">Szerződés-workspace</Link>
                    </div>
                  </div>
                ) : (
                  <p className={`text-xs ${toneMuted}`}>Nincs aktív ügy kijelölve.</p>
                )}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl bg-[#1F4A33] p-4 text-[#F4EFDB] border border-[#173824]">
              <SectionBlock title="Következő lépés" subtitle="Napi prioritás">
                {loading ? (
                  <p className="text-xs text-[#D8D1BB]">Betöltés...</p>
                ) : nextPrimaryAction ? (
                  <div className="space-y-3">
                    <h3 className="text-lg leading-tight">{nextPrimaryAction.title}</h3>
                    <p className="text-xs text-[#D8D1BB]">{nextPrimaryAction.helper}</p>
                    <Link href={nextPrimaryAction.href} className="inline-flex rounded-md bg-[#B58A2A] px-3 py-2 text-xs font-semibold text-[#1F2A24]">
                      {nextPrimaryAction.cta}
                    </Link>
                  </div>
                ) : (
                  <p className="text-xs text-[#D8D1BB]">Nincs kijelölt következő lépés.</p>
                )}
              </SectionBlock>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] border-l-4 border-l-[#B58A2A] bg-[#FFFDF7] p-4">
              <SectionBlock title="Aktív dokumentum" subtitle="Munkapéldány fókusz">
                {activeCaseId ? (
                  <div className="space-y-3">
                    <p className={`text-xs ${toneMuted}`}>
                      Az aktív dokumentum az ügy Dokumentumtár nézetében érhető el.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/cases/${activeCaseId}/documents`} className="rounded-md bg-[#1F4A33] px-3 py-2 text-xs font-semibold text-[#F4EFDB]">
                        Dokumentumtár megnyitása
                      </Link>
                      <Link href={`/documents/compare?caseId=${activeCaseId}`} className="rounded-md border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-2 text-xs font-semibold text-[#1F3B2D]">
                        Workspace megnyitása
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className={`text-xs ${toneMuted}`}>Aktív ügy nélkül nincs kiválasztható dokumentum.</p>
                )}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-4">
              <SectionBlock title="Leadási csomag" subtitle="Ügyvédi review-előkészítés">
                {activeCaseId ? (
                  <div className="space-y-3">
                    <p className={`text-xs ${toneMuted}`}>Belső munkacsomag összeállítása az aktív ügyhöz.</p>
                    <Link href={`/cases/${activeCaseId}/handoff`} className="rounded-md bg-[#1F4A33] px-3 py-2 text-xs font-semibold text-[#F4EFDB] inline-flex">
                      Leadási csomag megnyitása
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className={`text-xs ${toneMuted}`}>Nincs aktív ügy kijelölve.</p>
                    <p className={`text-[11px] ${toneMuted}`}>Ügy kiválasztása után nyitható meg.</p>
                  </div>
                )}
              </SectionBlock>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-4">
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
                          <Link href={step.href} className="text-[#1F4A33] text-xs hover:underline">
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

            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-4">
              <SectionBlock title="Review alatt / rám vár" subtitle="Saját review teendők">
                {loading ? <p className={`text-xs ${toneMuted}`}>Betöltés...</p> : pendingReviews.length ? <div className="space-y-2">{pendingReviews.map(renderTaskRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs review-ra váró dokumentum.</p>}
              </SectionBlock>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-4">
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

            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-4">
              <SectionBlock title="Aktív ügyek" subtitle="Saját portfólió">
                {loading ? <p className={`text-xs ${toneMuted}`}>Betöltés...</p> : myCases.length ? <div className="space-y-2">{myCases.slice(0, 5).map(renderCaseRow)}</div> : <p className={`text-xs ${toneMuted}`}>Nincs hozzád rendelt ügy.</p>}
              </SectionBlock>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-4">
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
                {activeCaseId ? (
                  <div className="mt-3">
                    <Link href={`/cases/${activeCaseId}/communications`} className="text-xs font-semibold text-[#1F4A33] hover:underline">
                      Ügykommunikáció megnyitása →
                    </Link>
                  </div>
                ) : null}
              </SectionBlock>
            </Panel>

            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] bg-[#FFFDF7] p-4">
              <SectionBlock title="Munkaóra" subtitle="Aktív ügyhöz kapcsolódó időrögzítés">
                <div className="space-y-2">
                  <p className={`text-xs ${toneMuted}`}>
                    {activeCaseId
                      ? "Case-aware időrögzítés az aktív ügy munkacsomagjához."
                      : "Általános munkaóra-rögzítő nézet."}
                  </p>
                  <Link
                    href={activeCaseId ? `/time-entries?caseId=${activeCaseId}` : "/time-entries"}
                    className="inline-flex rounded-md border border-[#D8CDB6] bg-[#FAF5EA] px-3 py-2 text-xs font-semibold text-[#1F3B2D]"
                  >
                    Munkaórák megnyitása
                  </Link>
                </div>
              </SectionBlock>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-1">
            <Panel uiPack={uiPack} className="rounded-xl border border-[#D8CDB6] border-l-4 border-l-[#4A6B4A] bg-[#FFFDF7] p-3">
              <SectionBlock title="Irodai hírek / Piaci jelzések" subtitle="Másodlagos információs blokk">
                <div className="grid gap-2">
                  {legalNews.articles.slice(0, 1).map(renderNewsRow)}
                  {ecofinNews.articles.slice(0, 1).map(renderNewsRow)}
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
