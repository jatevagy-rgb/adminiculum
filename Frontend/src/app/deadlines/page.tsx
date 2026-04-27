"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { useUiPack } from "@/lib/uiPack";
import {
  getCaseDeadlines,
  getCases,
  getCurrentUser,
  getMyTasks,
  type CaseListItem,
  type DeadlineItem,
  type TaskItem,
} from "@/lib/api";

type DeadlineSourceType = "task" | "review-task" | "case-deadline" | "case-level";
type DeadlineBucket = "overdue" | "today" | "week" | "later";

type DeadlineBoardItem = {
  id: string;
  sourceType: DeadlineSourceType;
  title: string;
  dueDate: string;
  bucket: DeadlineBucket;
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  clientName?: string;
  status: string;
  description?: string;
  taskId?: string;
  link: string;
  linkLabel: string;
  secondaryLink?: string;
  secondaryLinkLabel?: string;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfToday = () => {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  d.setMilliseconds(-1);
  return d;
};

const endOfWeek = () => {
  const d = startOfToday();
  const day = d.getDay();
  const toSunday = (7 - day) % 7;
  d.setDate(d.getDate() + toSunday + 1);
  d.setMilliseconds(-1);
  return d;
};

const toDate = (value: string) => new Date(value);

const getBucket = (dueDate: string): DeadlineBucket => {
  const due = toDate(dueDate).getTime();
  const todayStart = startOfToday().getTime();
  const todayEnd = endOfToday().getTime();
  const weekEnd = endOfWeek().getTime();

  if (due < todayStart) return "overdue";
  if (due >= todayStart && due <= todayEnd) return "today";
  if (due > todayEnd && due <= weekEnd) return "week";
  return "later";
};

const formatDueDate = (value: string) => {
  try {
    return new Date(value).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
};

const daysDiffFromToday = (value: string) => {
  const start = startOfToday().getTime();
  const due = toDate(value).getTime();
  return Math.floor((due - start) / (1000 * 60 * 60 * 24));
};

const dueLabel = (item: DeadlineBoardItem) => {
  const diff = daysDiffFromToday(item.dueDate);
  if (item.bucket === "overdue") {
    const overdueDays = Math.abs(diff);
    return overdueDays === 0 ? "Lejárt (ma)" : `Lejárt ${overdueDays} napja`;
  }
  if (item.bucket === "today") return "Ma esedékes";
  if (item.bucket === "week") return diff === 1 ? "Holnap esedékes" : `${diff} napon belül esedékes`;
  return `${diff} nap múlva esedékes`;
};

const byDueDateAsc = (a: DeadlineBoardItem, b: DeadlineBoardItem) => toDate(a.dueDate).getTime() - toDate(b.dueDate).getTime();

const bucketOrder: DeadlineBucket[] = ["overdue", "today", "week", "later"];

const bucketTitle: Record<DeadlineBucket, string> = {
  overdue: "Lejárt",
  today: "Ma esedékes",
  week: "Ezen a héten",
  later: "Később",
};

const bucketEmpty: Record<DeadlineBucket, string> = {
  overdue: "Nincs lejárt, rögzített határidő.",
  today: "Ma nincs esedékes, rögzített határidő.",
  week: "A héten nincs további rögzített határidő.",
  later: "Nincs későbbi, rögzített határidő.",
};

// Visual badge config for source type
const sourceBadge: Record<DeadlineSourceType, { label: string; bg: string; text: string; dot: string }> = {
  "task":          { label: "Feladat",        bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  "review-task":   { label: "Review",         bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  "case-deadline": { label: "Ügyhatáridő",    bg: "bg-purple-50",  text: "text-purple-700",  dot: "bg-purple-500" },
  "case-level":    { label: "Ügy határidő",   bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

export default function DeadlinesPage() {
  return (
    <AuthenticatedApp section="calendar">
      <DeadlinesBoardContent />
    </AuthenticatedApp>
  );
}

function DeadlinesBoardContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DeadlineBoardItem[]>([]);

  const [uiPack] = useUiPack();
  const isSignalTiles = uiPack === "signal_tiles_console";
  const p = {
    bg: isSignalTiles ? "bg-[#0C1222]" : "bg-[#F6F2E8]",
    bgAlt: isSignalTiles ? "bg-[#111827]" : "bg-[#F0EBE0]",
    bgHover: isSignalTiles ? "hover:bg-[#1a2744]" : "hover:bg-[#EAE3D5]",
    bgCard: isSignalTiles ? "bg-[#0F1923]" : "bg-white",
    bgSection: isSignalTiles ? "bg-[#0A1020]" : "bg-[#FAF8F2]",
    text: isSignalTiles ? "text-[#CBD5E1]" : "text-[#514D45]",
    textMuted: isSignalTiles ? "text-[#94A3B8]" : "text-[#7B776D]",
    textDark: isSignalTiles ? "text-[#F1F5F9]" : "text-[#1F2821]",
    border: isSignalTiles ? "border-[#1E3A5F]" : "border-[#DDD7CA]",
    borderLight: isSignalTiles ? "border-[#1E3A5F]" : "border-[#E8E2D6]",
    badge: isSignalTiles ? "bg-[#1E3A5F] text-[#67E8F9]" : "bg-[#E8E2D6] text-[#7B776D]",
    accent: isSignalTiles ? "text-cyan-400" : "text-[#8B7355]",
    accentBg: isSignalTiles ? "bg-cyan-400/10" : "bg-[#F6F2E8]",
    success: isSignalTiles ? "text-emerald-400" : "text-emerald-700",
    warning: isSignalTiles ? "text-amber-400" : "text-amber-700",
    danger: isSignalTiles ? "text-red-400" : "text-red-700",
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const me = await getCurrentUser();
        const [myTasks, myCases] = await Promise.all([getMyTasks(), getCases(1, 120, me.id)]);

        const taskItems: DeadlineBoardItem[] = myTasks
          .filter((task: TaskItem) => Boolean(task.dueDate))
          .map((task: TaskItem) => {
            const dueDate = task.dueDate as string;
            return {
              id: `task-${task.id}`,
              sourceType: String(task.status || "").toUpperCase().includes("REVIEW") ? "review-task" : "task",
              title: task.title,
              dueDate,
              bucket: getBucket(dueDate),
              caseId: task.case.id,
              caseNumber: task.case.caseNumber,
              caseTitle: task.case.matterType || "Ügy",
              clientName: task.case.clientName,
              status: task.status || "TODO",
              description: task.description || undefined,
              taskId: task.id,
              link: `/tasks?taskId=${task.id}`,
              linkLabel: "Feladat megnyitása",
              secondaryLink: `/cases/${task.case.id}`,
              secondaryLinkLabel: "Ügy megnyitása",
            };
          });

        const caseDeadlineGroups = await Promise.all(
          myCases.data.map(async (caseItem: CaseListItem) => {
            const deadlines = await getCaseDeadlines(caseItem.id).catch(() => [] as DeadlineItem[]);
            return { caseItem, deadlines };
          })
        );

        const caseDeadlineItems: DeadlineBoardItem[] = caseDeadlineGroups.flatMap(({ caseItem, deadlines }) =>
          deadlines
            .filter((deadline) => Boolean(deadline.dueDate))
            .map((deadline) => ({
              id: `case-deadline-${deadline.id}`,
              sourceType: "case-deadline" as const,
              title: deadline.extractedPhrase || "Ügyhatáridő",
              dueDate: deadline.dueDate,
              bucket: getBucket(deadline.dueDate),
              caseId: caseItem.id,
              caseNumber: caseItem.caseNumber,
              caseTitle: caseItem.title || "Ügy",
              clientName: caseItem.clientName,
              status: deadline.status || "OPEN",
              description: deadline.ruleSet ? `Forrás: ${deadline.ruleSet}` : undefined,
              link: `/cases/${caseItem.id}`,
              linkLabel: "Ügy megnyitása",
              secondaryLink: undefined,
              secondaryLinkLabel: undefined,
            }))
        );

        // Case-level deadline items — from the Case.deadline field surfaced by the PATCH endpoint
        const caseLevelItems: DeadlineBoardItem[] = myCases.data
          .filter((c: CaseListItem) => Boolean(c.deadline))
          .map((c: CaseListItem) => {
            const dueDate = c.deadline as string;
            return {
              id: `case-level-${c.id}`,
              sourceType: "case-level" as const,
              title: c.title || "Ügyhatáridő",
              dueDate,
              bucket: getBucket(dueDate),
              caseId: c.id,
              caseNumber: c.caseNumber,
              caseTitle: c.title || "Ügy",
              clientName: c.clientName,
              status: c.status || "OPEN",
              description: `Ügy állapota: ${c.status || "OPEN"}`,
              link: `/cases/${c.id}`,
              linkLabel: "Ügy megnyitása",
              secondaryLink: undefined,
              secondaryLinkLabel: undefined,
            };
          });

        setItems([...taskItems, ...caseDeadlineItems, ...caseLevelItems].sort(byDueDateAsc));
      } catch (err) {
        console.error("Deadlines board load failed:", err);
        setError("A határidők board betöltése sikertelen.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<DeadlineBucket, DeadlineBoardItem[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
    };
    items.forEach((item) => map[item.bucket].push(item));
    return map;
  }, [items]);

  const summary = useMemo(() => ({
    overdue: grouped.overdue.length,
    today: grouped.today.length,
    week: grouped.week.length,
    total: items.length,
  }), [grouped, items.length]);

  return (
    <div className={`flex-1 overflow-y-auto deadlines-surface ${p.bg}`}>
      <div className="max-w-6xl mx-auto p-8">
        <h1 className={`text-2xl font-serif ${p.textDark}`}>Határidők</h1>
        <p className={`text-xs ${p.textMuted} mt-1`}>
          Rögzített határidős tételek feladatokból és ügyhatáridő rekordokból. Ez nem teljes naptárrendszer, hanem operatív due-date board.
        </p>

        <div className="mt-5 grid md:grid-cols-4 gap-2 text-[11px]">
          <div className={`p-3 border ${p.border} ${isSignalTiles ? "bg-red-400/10" : "bg-[#FEF2F2]"}`}>
            <p className={`text-lg font-serif ${p.textDark}`}>{summary.overdue}</p>
            <p className={p.textMuted}>Lejárt</p>
          </div>
          <div className={`p-3 border ${p.border} ${isSignalTiles ? "bg-amber-400/10" : "bg-[#FFFBEB]"}`}>
            <p className={`text-lg font-serif ${p.textDark}`}>{summary.today}</p>
            <p className={p.textMuted}>Ma esedékes</p>
          </div>
          <div className={`p-3 border ${p.border} ${p.bgSection}`}>
            <p className={`text-lg font-serif ${p.textDark}`}>{summary.week}</p>
            <p className={p.textMuted}>Ezen a héten</p>
          </div>
          <div className={`p-3 border ${p.border} ${p.bgCard}`}>
            <p className={`text-lg font-serif ${p.textDark}`}>{summary.total}</p>
            <p className={p.textMuted}>Összes rögzített tétel</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 text-xs bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a]">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-xs text-[#7B776D]">Határidő board betöltése...</div>
        ) : items.length === 0 ? (
          <div className="mt-6 p-6 border border-dashed border-[#DDD7CA] bg-[#FAF8F2]">
            <p className="text-sm text-[#514D45]">Nincs rögzített határidős tétel.</p>
            <p className="text-xs text-[#7B776D] mt-2">
              Ez a board a meglévő workflowkból rögzített due date mezőket mutatja (feladat-határidők, ügyhatáridő rekordok).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/tasks" className="px-3 py-2 text-xs border border-[#DDD7CA] bg-white hover:bg-[#FBF9F3]">Feladatok</Link>
              <Link href="/notifications" className="px-3 py-2 text-xs border border-[#DDD7CA] bg-white hover:bg-[#FBF9F3]">Értesítések</Link>
              <Link href="/cases" className="px-3 py-2 text-xs border border-[#DDD7CA] bg-white hover:bg-[#FBF9F3]">Ügyek</Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {bucketOrder.map((bucket) => (
              <section key={bucket}>
                <div className={`flex items-center justify-between mb-2`}>
                  <h2 className={`text-[12px] uppercase tracking-[0.2em] ${p.textMuted}`}>{bucketTitle[bucket]}</h2>
                  <span className={`text-[10px] ${p.textMuted}`}>{grouped[bucket].length} tétel</span>
                </div>

                {grouped[bucket].length === 0 ? (
                  <div className={`p-3 border border-dashed ${p.border} text-xs ${p.textMuted}`}>{bucketEmpty[bucket]}</div>
                ) : (
                  <div className="space-y-2">
                    {grouped[bucket].map((item) => (
                      <article key={item.id} className={`p-4 border ${p.border} ${p.bgCard}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceBadge[item.sourceType].bg} ${sourceBadge[item.sourceType].text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sourceBadge[item.sourceType].dot}`} />
                                {sourceBadge[item.sourceType].label}
                              </span>
                              <span className={`text-xs ${p.text} truncate`}>
                                {item.caseNumber} · {item.caseTitle}
                                {item.clientName ? ` · ${item.clientName}` : ""}
                              </span>
                            </div>
                            <p className={`text-sm font-semibold ${p.textDark} mt-1`}>{item.title}</p>
                            {item.description && <p className={`text-[11px] ${p.textMuted} mt-0.5`}>{item.description}</p>}
                          </div>
                          <div className="text-right">
                            <p className={`text-[10px] uppercase tracking-[0.15em] ${p.textMuted}`}>{dueLabel(item)}</p>
                            <p className={`text-[11px] ${p.textDark} mt-1`}>{formatDueDate(item.dueDate)}</p>
                            <p className={`text-[10px] ${p.textMuted} mt-1`}>Státusz: {item.status}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link href={item.link} className={`px-3 py-1.5 text-[11px] border ${p.border} ${p.bgHover}`}>{item.linkLabel}</Link>
                          {item.secondaryLink && item.secondaryLinkLabel && (
                            <Link href={item.secondaryLink} className={`px-3 py-1.5 text-[11px] border ${p.border} ${p.bgCard} ${p.bgHover}`}>{item.secondaryLinkLabel}</Link>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
