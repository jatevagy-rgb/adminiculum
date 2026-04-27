"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getCaseDeadlines,
  getCaseSummary,
  getCases,
  getCommunications,
  getCurrentUser,
  getDashboardStats,
  getMyTasks,
  type CaseListItem,
  type CommunicationItem,
  type DeadlineItem,
  type TaskItem,
} from "@/lib/api";

type FeedCategory = "critical" | "review" | "high" | "deadline" | "activity";

type ActionCard = {
  id: string;
  category: FeedCategory;
  sourceLabel: string;
  title: string;
  summary: string;
  timeLabel: string;
  actionLabel: string;
  href: string;
  caseNumber?: string;
  severity: "kritikus" | "fontos" | "normál";
};

const severityChip: Record<ActionCard["severity"], string> = {
  kritikus: "bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]",
  fontos: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  normál: "bg-[#E5E7EB] text-[#374151] border-[#CBD5E1]",
};

const categoryLabels: Record<FeedCategory, string> = {
  critical: "Kritikus ma",
  review: "Felülvizsgálatra vár",
  high: "Magas prioritás",
  deadline: "Határidős",
  activity: "Általános aktivitás",
};

const emptyCategoryGuidance: Record<FeedCategory, string> = {
  critical: "Nincs kritikus tétel. Kritikus jelzés akkor jelenik meg, ha sürgős vagy lejárt feladat keletkezik.",
  review: "Nincs aktív review tétel. Review jelzés akkor érkezik, ha dokumentum vagy feladat review státuszba kerül.",
  high: "Nincs magas prioritású ügy vagy feladat. Ez a szakasz HIGH/URGENT prioritás esetén töltődik.",
  deadline: "Nincs közeli határidő. A szakasz feladat-határidőkből és ügyhatáridő kivonatokból épül.",
  activity: "Nincs friss operatív aktivitás. Az ügy- és kommunikációs műveletek után jelennek meg új elemek.",
};

const formatDateTime = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
};

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("hu-HU", { dateStyle: "short" });
  } catch {
    return iso;
  }
};

const daysUntil = (iso?: string) => {
  if (!iso) return null;
  const now = new Date();
  const due = new Date(iso);
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export default function NotificationsPage() {
  return (
    <AuthenticatedApp section="notifications">
      <NotificationsPageContent />
    </AuthenticatedApp>
  );
}

function NotificationsPageContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<ActionCard[]>([]);
  const [activeCategory, setActiveCategory] = useState<FeedCategory | "all">("all");

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const me = await getCurrentUser();
        const [myTasks, dashboard, comms, assignedCases, allAccessibleCases] = await Promise.all([
          getMyTasks(),
          getDashboardStats(),
          getCommunications({ limit: 12 }),
          getCases(1, 50, me.id),
          getCases(1, 100),
        ]);

        setTasks(myTasks);
        setCommunications(comms.communications);

        const casesForOperationalSignals = (allAccessibleCases.data.length > 0 ? allAccessibleCases.data : assignedCases.data).slice(0, 20);

        const caseSummaries = await Promise.all(
          casesForOperationalSignals.map(async (caseItem: CaseListItem) => ({
            caseItem,
            summary: await getCaseSummary(caseItem.id).catch(() => null),
          }))
        );

        const caseDeadlinesRaw = await Promise.all(
          casesForOperationalSignals.map(async (caseItem: CaseListItem) => {
            const items = await getCaseDeadlines(caseItem.id).catch(() => [] as DeadlineItem[]);
            return items.map((d) => ({ ...d, caseNumber: caseItem.caseNumber }));
          })
        );
        const resolvedDeadlines = caseDeadlinesRaw.flat();

        const builtCards: ActionCard[] = [];

        for (const task of myTasks) {
          const dueInDays = daysUntil(task.dueDate);
          const isCriticalDue = typeof dueInDays === "number" && dueInDays <= 0;
          const isDueSoon = typeof dueInDays === "number" && dueInDays <= 3;

          if ((task.priority === "URGENT" || isCriticalDue) && task.status !== "DONE") {
            builtCards.push({
              id: `critical-task-${task.id}`,
              category: "critical",
              sourceLabel: "Forrás: Feladat",
              title: task.title,
              summary: `Feladat azonnali figyelmet kér (${task.case.caseNumber})`,
              timeLabel: task.dueDate ? `Határidő: ${formatDate(task.dueDate)}` : "Határidő nincs megadva",
              actionLabel: "Feladathoz ugrás",
              href: `/tasks?taskId=${task.id}`,
              caseNumber: task.case.caseNumber,
              severity: "kritikus",
            });
          }

          if (task.status === "IN_REVIEW") {
            builtCards.push({
              id: `review-task-${task.id}`,
              category: "review",
              sourceLabel: "Forrás: Feladat",
              title: task.title,
              summary: `Felülvizsgálatra vár (${task.case.caseNumber})`,
              timeLabel: task.dueDate ? `Határidő: ${formatDate(task.dueDate)}` : "Felülvizsgálat folyamatban",
              actionLabel: "Review megnyitása",
              href: `/tasks?taskId=${task.id}`,
              caseNumber: task.case.caseNumber,
              severity: "fontos",
            });
          }

          if (task.priority === "HIGH" && task.status !== "DONE") {
            builtCards.push({
              id: `high-task-${task.id}`,
              category: "high",
              sourceLabel: "Forrás: Feladat",
              title: task.title,
              summary: `Magas prioritású feladat (${task.case.clientName})`,
              timeLabel: task.dueDate ? `Határidő: ${formatDate(task.dueDate)}` : "Határidő nincs",
              actionLabel: "Feladathoz ugrás",
              href: `/tasks?taskId=${task.id}`,
              caseNumber: task.case.caseNumber,
              severity: "fontos",
            });
          }

          if (isDueSoon && task.status !== "DONE") {
            builtCards.push({
              id: `deadline-task-${task.id}`,
              category: "deadline",
              sourceLabel: "Forrás: Feladat",
              title: task.title,
              summary: `Közelgő határidő (${task.case.caseNumber})`,
              timeLabel: task.dueDate ? `Esedékes: ${formatDate(task.dueDate)}` : "Határidő nincs",
              actionLabel: "Határidő részletei",
              href: `/tasks?taskId=${task.id}`,
              caseNumber: task.case.caseNumber,
              severity: dueInDays !== null && dueInDays <= 1 ? "kritikus" : "fontos",
            });
          }
        }

        for (const { caseItem, summary } of caseSummaries) {
          if (summary?.last5TimelineEvents?.length) {
            summary.last5TimelineEvents.slice(0, 2).forEach((event) => {
              builtCards.push({
                id: `case-event-${caseItem.id}-${event.id}`,
                category: "activity",
                sourceLabel: "Forrás: Ügyidővonal",
                title: `${caseItem.caseNumber} · ${event.type}`,
                summary: "Ügyidővonal esemény",
                timeLabel: formatDateTime(event.createdAt),
                actionLabel: "Ügy megnyitása",
                href: `/cases/${caseItem.id}`,
                caseNumber: caseItem.caseNumber,
                severity: "normál",
              });
            });
          }

          if (!summary?.activeDocuments?.length) continue;
          for (const document of summary.activeDocuments) {
            const normalizedStatus = String(document.status || "").toUpperCase();
            if (!normalizedStatus.includes("REVIEW")) continue;
            builtCards.push({
              id: `review-doc-${caseItem.id}-${document.id}`,
              category: "review",
              sourceLabel: "Forrás: Dokumentum",
              title: document.fileName,
              summary: `${caseItem.caseNumber} · dokumentum felülvizsgálatra vár`,
              timeLabel: `Frissítve: ${formatDateTime(document.createdAt)}`,
              actionLabel: "Review megnyitása",
              href: `/cases/${caseItem.id}/review/${document.id}`,
              caseNumber: caseItem.caseNumber,
              severity: "fontos",
            });
          }

          const casePriority = String(caseItem.priority || "").toUpperCase();
          if (casePriority === "HIGH" || casePriority === "URGENT") {
            builtCards.push({
              id: `case-priority-${caseItem.id}`,
              category: "high",
              sourceLabel: "Forrás: Ügy",
              title: caseItem.title,
              summary: `${caseItem.caseNumber} · kiemelt prioritású ügy`,
              timeLabel: `Utolsó frissítés: ${formatDateTime(caseItem.updatedAt)}`,
              actionLabel: "Ügy megnyitása",
              href: `/cases/${caseItem.id}`,
              caseNumber: caseItem.caseNumber,
              severity: casePriority === "URGENT" ? "kritikus" : "fontos",
            });
          }
        }

        for (const deadline of resolvedDeadlines) {
          const dueInDays = daysUntil(deadline.dueDate);
          if (dueInDays !== null && dueInDays <= 3) {
            builtCards.push({
              id: `case-deadline-${deadline.id}`,
              category: "deadline",
              sourceLabel: "Forrás: Ügyhatáridő",
              title: deadline.extractedPhrase,
              summary: `${deadline.caseNumber || "Ügy"} · kivonatolt határidő`,
              timeLabel: `Esedékes: ${formatDate(deadline.dueDate)}`,
              actionLabel: "Határidő forrásdokumentum",
              href: `/cases/${deadline.caseId}/documents`,
              caseNumber: deadline.caseNumber,
              severity: dueInDays <= 1 ? "kritikus" : "fontos",
            });
          }
        }

        for (const comm of comms.communications.slice(0, 6)) {
          if (comm.type === "NOTE") continue;
          builtCards.push({
            id: `comm-${comm.id}`,
            category: "activity",
            sourceLabel: "Forrás: Kommunikáció",
            title: comm.subject || "Új kommunikáció",
            summary: `Külső frissítés: ${comm.senderName || comm.senderEmail || "Ismeretlen feladó"}`,
            timeLabel: formatDateTime(comm.createdAt),
            actionLabel: "Kommunikáció megnyitása",
            href: comm.caseId
              ? `/cases/${comm.caseId}/communications`
              : comm.clientId
                ? `/clients/${comm.clientId}`
                : "/cases",
            caseNumber: comm.case?.caseNumber,
            severity: "normál",
          });
        }

        for (const activity of dashboard.recentActivity.slice(0, 8)) {
          builtCards.push({
            id: `activity-${activity.id}`,
            category: "activity",
            sourceLabel: "Forrás: Műszerfal aktivitás",
            title: activity.text,
            summary: "Műszerfal aktivitás",
            timeLabel: formatDateTime(activity.timestamp),
            actionLabel: "Kapcsolt ügy megnyitása",
            href: activity.caseId ? `/cases/${activity.caseId}` : "/cases",
            severity: "normál",
          });
        }

        setCards(builtCards);
      } catch (err) {
        console.error("Notification center load failed:", err);
        setError("Az értesítési központ betöltése sikertelen.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const filteredCards = useMemo(() => {
    if (activeCategory === "all") return cards;
    return cards.filter((card) => card.category === activeCategory);
  }, [cards, activeCategory]);

  const grouped = useMemo(
    () =>
      (Object.keys(categoryLabels) as FeedCategory[]).map((category) => ({
        category,
        label: categoryLabels[category],
        items: filteredCards.filter((card) => card.category === category),
      })),
    [filteredCards]
  );

  const briefing = useMemo(() => {
    const critical = cards.filter((item) => item.severity === "kritikus").length;
    const review = cards.filter((item) => item.category === "review").length;
    const dueSoon = cards.filter((item) => item.category === "deadline").length;
    return { critical, review, dueSoon, assignedTasks: tasks.length, communications: communications.length };
  }, [cards, tasks.length, communications.length]);

  return (
    <div className="flex-1 flex min-h-0">
      <main className="flex-1 overflow-y-auto border-r border-[#DDD7CA]">
        <div className="max-w-5xl mx-auto p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-serif text-[#1F2821]">Értesítési és műveleti központ</h1>
            <p className="text-xs text-[#7B776D] mt-1">Valós feladat-, ügy-, kommunikáció- és aktivitásalapú operatív bejövő nézet</p>
          </div>

          {error && <div className="mb-4 p-3 text-xs bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a]">{error}</div>}

          {isLoading ? (
            <div className="py-12 text-center text-xs text-[#7B776D]">Értesítések betöltése...</div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <section key={group.category}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[12px] uppercase tracking-[0.2em] text-[#7B776D]">{group.label}</h2>
                    <span className="text-[10px] text-[#9C9890]">{group.items.length} elem</span>
                  </div>
                  {group.items.length === 0 ? (
                    <div className="p-4 border border-dashed border-[#DDD7CA] text-xs text-[#9C9890]">
                      <p>{emptyCategoryGuidance[group.category]}</p>
                      <p className="mt-2 text-[11px] text-[#7B776D]">Következő lépés: ügyek, feladatok és review műveletek után itt jelennek meg a kapcsolódó jelek.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <Link key={item.id} href={item.href} className="block p-4 border border-[#DDD7CA] bg-white hover:bg-[#FBF9F3]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[#1F2821]">{item.title}</p>
                              <p className="text-[10px] text-[#7B776D] mt-1">{item.sourceLabel}</p>
                              <p className="text-xs text-[#514D45] mt-1">{item.summary}</p>
                              <p className="text-[10px] text-[#9C9890] mt-2">{item.timeLabel}</p>
                              <p className="text-[10px] text-[#C9A227] mt-2">{item.actionLabel}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-[9px] uppercase px-2 py-1 border ${severityChip[item.severity]}`}>{item.severity}</span>
                              {item.caseNumber && <span className="text-[10px] text-[#7B776D]">{item.caseNumber}</span>}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      <aside className="w-80 bg-white overflow-y-auto">
        <div className="p-4 space-y-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Napi operatív összefoglaló</h2>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 border border-[#DDD7CA] bg-[#F6F2E8]">
              <p className="text-lg font-serif text-[#1F2821]">{briefing.critical}</p>
              <p className="text-[10px] text-[#7B776D]">Kritikus</p>
            </div>
            <div className="p-3 border border-[#DDD7CA] bg-[#F6F2E8]">
              <p className="text-lg font-serif text-[#1F2821]">{briefing.review}</p>
              <p className="text-[10px] text-[#7B776D]">Review</p>
            </div>
            <div className="p-3 border border-[#DDD7CA] bg-[#F6F2E8]">
              <p className="text-lg font-serif text-[#1F2821]">{briefing.dueSoon}</p>
              <p className="text-[10px] text-[#7B776D]">Határidős</p>
            </div>
            <div className="p-3 border border-[#DDD7CA] bg-[#F6F2E8]">
              <p className="text-lg font-serif text-[#1F2821]">{briefing.assignedTasks}</p>
              <p className="text-[10px] text-[#7B776D]">Saját feladat</p>
            </div>
          </div>

          <div className="pt-2 border-t border-[#EEE7D9]">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Gyors útvonalak</h3>
            <div className="space-y-1">
              <Link href="/tasks" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Feladatkezelő</Link>
              <Link href="/deadlines" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Határidők board</Link>
              <Link href="/reviews" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Review sor</Link>
              <Link href="/cases" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Ügylista</Link>
              <Link href="/clients" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Ügyfelek</Link>
              <Link href="/documents/compare" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Dokumentum összevetés</Link>
              <Link href="/time-entries" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Munkaórák</Link>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

