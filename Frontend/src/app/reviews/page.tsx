"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getCaseSummary,
  getCases,
  getCurrentUser,
  getMyTasks,
  getCaseCollaborators,
  getUsers,
  reassignTask,
  type CaseListItem,
  type CaseCollaborator,
  type User,
  type CaseSummaryResponse,
  type TaskItem,
} from "@/lib/api";
import { useUiPack } from "@/lib/uiPack";

type QueueItem = {
  id: string;
  source: "task" | "document";
  title: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  status: string;
  priority: string;
  assigneeName: string;
  timestamp: string;
  dueDate?: string;
  documentId?: string;
  documentType?: string;
  version?: string;
  nextActionLabel: string;
  daysWaiting?: number | null;
  collaboratorCount?: number;
  openHref: string;
  fallbackHref: string;
  taskId?: string; // raw task.id for task-source items only
};

// Status label and styling mapping
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; badge?: string }> = {
  IN_REVIEW: { label: "Áttekintés alatt", color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", border: "border-[#f5d89a]", badge: "Folyamatban" },
  REVIEW_NEEDED: { label: "Review szükséges", color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", border: "border-[#f5d89a]", badge: "Folyamatban" },
  REVIEW_SUBMITTED: { label: "Review beküldve", color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", border: "border-[#f5d89a]", badge: "Folyamatban" },
  SUBMITTED: { label: "Beküldve", color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", border: "border-[#f5d89a]", badge: "Folyamatban" },
  APPROVED: { label: "Jóváhagyva", color: "text-[#059669]", bg: "bg-[#ECFDF5]", border: "border-[#a7f3d0]", badge: "Kész" },
  REJECTED: { label: "Elutasítva", color: "text-[#DC2626]", bg: "bg-[#FEF2F2]", border: "border-[#fca5a5]", badge: "Vissza" },
  GENERATED: { label: "Generálva", color: "text-[#514D45]", bg: "bg-[#ECE6DA]", border: "border-[#DDD7CA]", badge: "Generálva" },
  PENDING: { label: "Függőben", color: "text-[#7B776D]", bg: "bg-[#F6F2E8]", border: "border-[#DDD7CA]", badge: "Függőben" },
  IN_PROGRESS: { label: "Folyamatban", color: "text-[#2563EB]", bg: "bg-[#EFF6FF]", border: "border-[#bfdbfe]", badge: "Folyamatban" },
  TODO: { label: "Teendő", color: "text-[#514D45]", bg: "bg-[#ECE6DA]", border: "border-[#DDD7CA]", badge: "Teendő" },
  DONE: { label: "Kész", color: "text-[#059669]", bg: "bg-[#ECFDF5]", border: "border-[#a7f3d0]", badge: "Kész" },
  COMPLETED: { label: "Befejezve", color: "text-[#059669]", bg: "bg-[#ECFDF5]", border: "border-[#a7f3d0]", badge: "Kész" },
  BLOCKED: { label: "Blokkolva", color: "text-[#DC2626]", bg: "bg-[#FEF2F2]", border: "border-[#fca5a5]", badge: "Blokkolva" },
  CANCELLED: { label: "Törölve", color: "text-[#7B776D]", bg: "bg-[#F6F2E8]", border: "border-[#DDD7CA]", badge: "Törölve" },
};

const getStatusConfig = (status: string) => {
  const upper = status.toUpperCase();
  return STATUS_CONFIG[upper] || STATUS_CONFIG[upper.replace(/-/g, "_")] || {
    label: status,
    color: "text-[#514D45]",
    bg: "bg-[#ECE6DA]",
    border: "border-[#DDD7CA]",
    badge: status,
  };
};

// Priority config
const PRIORITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  URGENT: { color: "text-[#DC2626]", bg: "bg-[#FEF2F2]", label: "Sürgős" },
  HIGH: { color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", label: "Magas" },
  MEDIUM: { color: "text-[#514D45]", bg: "bg-[#ECE6DA]", label: "Közepes" },
  LOW: { color: "text-[#7B776D]", bg: "bg-[#F6F2E8]", label: "Alacsony" },
};

const getPriorityConfig = (priority: string) => {
  const upper = priority.toUpperCase();
  return PRIORITY_CONFIG[upper] || { color: "text-[#7B776D]", bg: "bg-[#F6F2E8]", label: priority };
};

// Action urgency classification
type ActionUrgency = "needs_action" | "waiting" | "done" | "blocked";
const getActionUrgency = (status: string): ActionUrgency => {
  const upper = status.toUpperCase();
  // Done states — no action needed
  if (["APPROVED", "DONE", "COMPLETED", "FINAL"].includes(upper)) return "done";
  // Blocked — external dependency (cancelled)
  if (["CANCELLED"].includes(upper)) return "blocked";
  // Needs action — rejected (returned with changes needed), in-review, submitted, generated, pending, in-progress, todo
  if (["REJECTED", "IN_REVIEW", "SUBMITTED", "IN_PROGRESS", "REVIEW_NEEDED", "REVIEW_SUBMITTED", "GENERATED", "PENDING", "TODO"].includes(upper)) return "needs_action";
  return "waiting";
};

// Human-readable next-action label for each status
const getNextActionLabel = (status: string, source: "task" | "document"): string => {
  const upper = status.toUpperCase();
  if (source === "document") {
    if (upper === "GENERATED") return "Review beküldése";
    if (["SUBMITTED", "IN_REVIEW", "REVIEW_NEEDED", "REVIEW_SUBMITTED"].includes(upper)) return "Review folytatása";
    if (upper === "REJECTED") return "Visszajelzés áttekintése";
    if (upper === "APPROVED") return "Jóváhagyott — aláírás";
    if (upper === "FINAL") return "Véglegesített dokumentum";
  }
  if (source === "task") {
    if (["IN_REVIEW", "SUBMITTED", "REVIEW_NEEDED", "REVIEW_SUBMITTED"].includes(upper)) return "Review folytatása";
    if (upper === "REJECTED") return "Feladat átdolgozása";
    if (upper === "TODO" || upper === "PENDING") return "Feladat áttekintése";
    if (upper === "IN_PROGRESS") return "Munka folytatása";
    if (["DONE", "COMPLETED", "APPROVED"].includes(upper)) return "Befejezett";
  }
  return "Megnyitás";
};

const formatDate = (v?: string) => {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return v;
  }
};

const formatDateShort = (v?: string) => {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("hu-HU", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return v;
  }
};

const daysUntil = (iso?: string) => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export default function ReviewsPage() {
  return (
    <AuthenticatedApp section="reviews">
      <ReviewsPageContent />
    </AuthenticatedApp>
  );
}

function ReviewsPageContent() {
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Collaborator-aware reassign state
  const [reviewAssignees, setReviewAssignees] = useState<User[]>([]);
  const [reviewReassignLoading, setReviewReassignLoading] = useState(false);
  const [reviewSelectedAssignee, setReviewSelectedAssignee] = useState<string>('');
  const [reviewShowReassign, setReviewShowReassign] = useState(false);
  const [reviewCollaboratorIds, setReviewCollaboratorIds] = useState<string[]>([]);

  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [caseFilter, setCaseFilter] = useState("all");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [caseSummaries, setCaseSummaries] = useState<Record<string, CaseSummaryResponse>>({});

  // Collaborator-aware review reassign
  const handleReviewReassign = async (caseId: string) => {
    if (!caseId) return;
    setReviewReassignLoading(true);
    try {
      const [collabs, users] = await Promise.all([
        getCaseCollaborators(caseId),
        getUsers(),
      ]);
      const collabUserIds = new Set(collabs.map((c: CaseCollaborator) => c.userId));
      const others = users.filter((u: User) => !collabUserIds.has(u.id));
      setReviewAssignees([...collabs.map(c => c.user), ...others]);
      setReviewCollaboratorIds(Array.from(collabUserIds));
    } catch (err) {
      console.error('[Reviews] Failed to load reassign candidates', err);
    } finally {
      setReviewReassignLoading(false);
    }
  };

  const handleReviewReassignConfirm = async (taskId: string, newAssigneeId: string, newAssigneeName: string) => {
    if (!taskId || !newAssigneeId) return;
    try {
      await reassignTask(taskId, newAssigneeId);
      setQueue(prev => prev.map(item =>
        item.id === taskId
          ? { ...item, assigneeName: newAssigneeName }
          : item
      ));
      setReviewSelectedAssignee('');
      setReviewShowReassign(false);
    } catch (err) {
      console.error('[Reviews] Failed to reassign task', err);
    }
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const me = await getCurrentUser();
        const [assignedCases, myTasks] = await Promise.all([getCases(1, 100, me.id), getMyTasks()]);

        const summaries = await Promise.all(
          assignedCases.data.map(async (caseItem: CaseListItem) => ({
            caseItem,
            summary: await getCaseSummary(caseItem.id).catch(() => null),
          }))
        );

        const summaryMap: Record<string, CaseSummaryResponse> = {};
        for (const row of summaries) {
          if (row.summary) {
            summaryMap[row.caseItem.id] = row.summary;
          }
        }
        setCaseSummaries(summaryMap);

        // Build case lookup for collaborator counts
        const caseCollaboratorMap: Record<string, number> = {};
        for (const caseItem of assignedCases.data) {
          caseCollaboratorMap[caseItem.id] = caseItem.collaboratorCount ?? 0;
        }

        const reviewTasks: QueueItem[] = myTasks
          .filter((task: TaskItem) =>
            ["IN_REVIEW", "SUBMITTED", "REVIEW_NEEDED", "REVIEW_SUBMITTED", "TODO", "PENDING", "IN_PROGRESS", "REJECTED"].includes(task.status.toUpperCase())
          )
          .map((task: TaskItem) => ({
            id: `task-${task.id}`,
            source: "task",
            title: task.title,
            caseId: task.case.id,
            caseNumber: task.case.caseNumber,
            caseTitle: task.case.clientName,
            status: task.status,
            priority: task.priority,
            assigneeName: task.assignedTo?.name || "Nincs kijelölve",
            timestamp: task.dueDate || new Date().toISOString(),
            dueDate: task.dueDate,
            nextActionLabel: getNextActionLabel(task.status, "task"),
            collaboratorCount: caseCollaboratorMap[task.case.id] ?? 0,
            openHref: `/tasks?taskId=${task.id}`,
            fallbackHref: `/cases/${task.case.id}`,
            taskId: task.id,
          }));

        const reviewDocuments: QueueItem[] = [];
        for (const row of summaries) {
          if (!row.summary) continue;
          for (const doc of row.summary.activeDocuments) {
            const normalizedStatus = String(doc.status || "").toUpperCase();
            // Include any document that is not fully finalized: GENERATED, SUBMITTED, IN_REVIEW, APPROVED
            // Exclude FINAL (finalized) and DRAFT (preliminary)
            if (["GENERATED", "SUBMITTED", "REVIEW", "IN_REVIEW", "REVIEW_NEEDED", "REVIEW_SUBMITTED", "APPROVED", "REJECTED", "PENDING"].every(s => !normalizedStatus.includes(s))) continue;
            reviewDocuments.push({
              id: `doc-${row.caseItem.id}-${doc.id}`,
              source: "document",
              title: doc.fileName,
              caseId: row.caseItem.id,
              caseNumber: row.caseItem.caseNumber,
              caseTitle: row.caseItem.title,
              status: doc.status,
              priority: row.caseItem.priority,
              assigneeName: row.caseItem.assignedLawyer?.name || "Nincs kijelölve",
              timestamp: doc.createdAt,
              documentId: doc.id,
              documentType: doc.documentType,
              version: doc.version,
              nextActionLabel: getNextActionLabel(doc.status, "document"),
              daysWaiting: daysUntil(doc.createdAt),
              collaboratorCount: caseCollaboratorMap[row.caseItem.id] ?? 0,
              openHref: `/cases/${row.caseItem.id}/review/${doc.id}`,
              fallbackHref: `/cases/${row.caseItem.id}/documents`,
            });
          }
        }

        const merged = [...reviewTasks, ...reviewDocuments].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setQueue(merged);
        if (merged.length > 0) setSelectedId(merged[0].id);
      } catch (err) {
        console.error("Review queue load failed:", err);
        setError("A review sor betöltése sikertelen.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return queue.filter((item) => {
      const statusMatch = statusFilter === "all" || item.status === statusFilter;
      const assigneeMatch = assigneeFilter === "all" || item.assigneeName === assigneeFilter;
      const caseMatch = caseFilter === "all" || item.caseId === caseFilter;
      const urgentMatch =
        !urgentOnly ||
        item.priority === "URGENT" ||
        item.priority === "HIGH" ||
        (item.dueDate ? (daysUntil(item.dueDate) ?? 99) <= 1 : false);
      const searchMatch =
        !s ||
        item.title.toLowerCase().includes(s) ||
        item.caseNumber.toLowerCase().includes(s) ||
        item.caseTitle.toLowerCase().includes(s);
      return statusMatch && assigneeMatch && caseMatch && urgentMatch && searchMatch;
    });
  }, [queue, statusFilter, assigneeFilter, caseFilter, urgentOnly, search]);

  // Group queue by action urgency for better clarity
  const groupedByUrgency = useMemo(() => {
    const groups: Record<ActionUrgency, QueueItem[]> = {
      needs_action: [],
      waiting: [],
      done: [],
      blocked: [],
    };
    for (const item of filtered) {
      const urgency = getActionUrgency(item.status);
      groups[urgency].push(item);
    }
    // Sort each group by priority and due date
    const sortByUrgency = (items: QueueItem[]) =>
      [...items].sort((a, b) => {
        const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const aP = priorityOrder[a.priority.toUpperCase()] ?? 4;
        const bP = priorityOrder[b.priority.toUpperCase()] ?? 4;
        if (aP !== bP) return aP - bP;
        // Then by due date (items with due dates come first)
        const aDays = daysUntil(a.dueDate);
        const bDays = daysUntil(b.dueDate);
        if (aDays !== null && bDays !== null) return aDays - bDays;
        if (aDays !== null) return -1;
        if (bDays !== null) return 1;
        // Then by timestamp (newest first)
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

    return {
      needs_action: sortByUrgency(groups.needs_action),
      waiting: sortByUrgency(groups.waiting),
      done: sortByUrgency(groups.done),
      blocked: sortByUrgency(groups.blocked),
    };
  }, [filtered]);

  // Queue statistics for header
  const queueStats = useMemo(() => ({
    total: filtered.length,
    needsAction: groupedByUrgency.needs_action.length,
    waiting: groupedByUrgency.waiting.length,
    done: groupedByUrgency.done.length,
    blocked: groupedByUrgency.blocked.length,
  }), [filtered.length, groupedByUrgency]);

  const selected = useMemo(() => filtered.find((item) => item.id === selectedId) || filtered[0] || null, [filtered, selectedId]);
  const assignees = useMemo(() => Array.from(new Set(queue.map((item) => item.assigneeName))).sort(), [queue]);
  const statuses = useMemo(() => Array.from(new Set(queue.map((item) => item.status))).sort(), [queue]);
  const cases = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    queue.forEach((item) => map.set(item.caseId, { id: item.caseId, label: item.caseNumber }));
    return Array.from(map.values());
  }, [queue]);

  return (
    <div className={`flex-1 flex min-h-0 reviews-surface ${p.bg}`}>
      <main className={`flex-1 overflow-y-auto border-r reviews-main ${p.border}`}>
        <div className="max-w-5xl mx-auto p-8">
          <h1 className={`text-2xl font-serif ${p.textDark} mb-1`}>Review sor</h1>
          <p className={`text-xs ${p.textMuted} mb-4`}>Döntésre váró feladatok és dokumentumok műveleti listája</p>

          {/* Queue statistics bar */}
          {!isLoading && queueStats.total > 0 && (
            <div className={`mb-4 flex flex-wrap gap-3 p-3 ${isSignalTiles ? "bg-slate-800 border-slate-600" : "bg-[#F6F2E8] border-[#DDD7CA]"} border rounded`}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-[#1F2821]">{queueStats.total}</span>
                <span className="text-[10px] text-[#7B776D]">összes</span>
              </div>
              {queueStats.needsAction > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#fef3e2] border border-[#f5d89a] rounded">
                  <span className="text-sm font-semibold text-[#8B6B3A]">{queueStats.needsAction}</span>
                  <span className="text-[10px] text-[#8B6B3A]">cselekvés szükséges</span>
                </div>
              )}
              {queueStats.waiting > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#ECE6DA] border border-[#DDD7CA] rounded">
                  <span className="text-sm font-semibold text-[#514D45]">{queueStats.waiting}</span>
                  <span className="text-[10px] text-[#7B776D]">várakozó</span>
                </div>
              )}
              {queueStats.blocked > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#FEF2F2] border border-[#fca5a5] rounded">
                  <span className="text-sm font-semibold text-[#DC2626]">{queueStats.blocked}</span>
                  <span className="text-[10px] text-[#DC2626]">blokkolva</span>
                </div>
              )}
              {queueStats.done > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#ECFDF5] border border-[#a7f3d0] rounded">
                  <span className="text-sm font-semibold text-[#059669]">{queueStats.done}</span>
                  <span className="text-[10px] text-[#059669]">kész</span>
                </div>
              )}
            </div>
          )}

          <div className="mb-4 grid md:grid-cols-5 gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés" className={`w-full px-2 py-2 border text-xs bg-white ${p.border} ${p.textDark}`} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`w-full px-2 py-2 border text-xs bg-white ${p.border} ${p.textDark}`}>
              <option value="all">Minden státusz</option>
              {statuses.map((status) => {
                const cfg = getStatusConfig(status);
                return <option key={status} value={status}>{cfg.label}</option>;
              })}
            </select>
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className={`w-full px-2 py-2 border text-xs bg-white ${p.border} ${p.textDark}`}>
              <option value="all">Minden felelős</option>
              {assignees.map((assignee) => (
                <option key={assignee} value={assignee}>{assignee}</option>
              ))}
            </select>
            <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} className={`w-full px-2 py-2 border text-xs bg-white ${p.border} ${p.textDark}`}>
              <option value="all">Minden ügy</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <label className={`flex items-center gap-2 text-xs px-2 border bg-white ${p.border} ${p.textDark}`}>
              <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
              Csak sürgős
            </label>
          </div>

          {error && <div className="mb-4 p-3 bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a] text-xs">{error}</div>}

          {isLoading ? (
            <div className="py-12 text-center text-xs text-[#7B776D]">Review sor betöltése...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#7B776D] border border-dashed border-[#DDD7CA]">
              <p>Nincs review tétel a jelenlegi szűrés mellett.</p>
              <p className="mt-2 text-[11px] text-[#9C9890]">A review sor akkor töltődik, ha feladat vagy dokumentum review státuszba kerül.</p>
              <div className="mt-3 flex justify-center gap-2">
                <Link href="/cases" className="px-3 py-2 border border-[#DDD7CA] hover:bg-[#FBF9F3]">Ügyek megnyitása</Link>
                <Link href="/tasks" className="px-3 py-2 border border-[#DDD7CA] hover:bg-[#FBF9F3]">Feladatok megnyitása</Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Needs Action Section */}
              {groupedByUrgency.needs_action.length > 0 && (
                <div>
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#8B6B3A] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#8B6B3A]"></span>
                    Cselekvés szükséges ({groupedByUrgency.needs_action.length})
                  </h2>
                  <div className="space-y-2">
                    {groupedByUrgency.needs_action.map((item) => {
                      const statusCfg = getStatusConfig(item.status);
                      const priorityCfg = getPriorityConfig(item.priority);
                      const urgency = getActionUrgency(item.status);
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`w-full text-left p-4 border rounded transition-colors ${selected?.id === item.id ? "border-[#C9A227] bg-[#FBF9F3]" : "border-[#DDD7CA] bg-white hover:bg-[#FBF9F3]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-[#1F2821]">{item.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                                  {statusCfg.label}
                                </span>
                                {item.documentType && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EEE7D9] text-[#514D45] border border-[#DDD7CA]">
                                    {item.documentType}
                                  </span>
                                )}
                                {item.version && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EEE7D9] text-[#7B776D]">
                                    v{item.version}
                                  </span>
                                )}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityCfg.bg} ${priorityCfg.color}`}>
                                  {priorityCfg.label}
                                </span>
                              </div>
                              <p className="text-xs text-[#514D45] mt-1">{item.caseNumber} · {item.caseTitle}</p>
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span className="text-[10px] text-[#7B776D]">
                                  <span className="font-medium">Felelős:</span> {item.assigneeName}
                                </span>
                                {(item.collaboratorCount ?? 0) > 0 && (
                                  <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-medium bg-[#8B5CF6] text-white rounded-full" title={`${item.collaboratorCount} résztvevő`}>
                                    +{item.collaboratorCount}
                                  </span>
                                )}
                                {item.dueDate && (
                                  <span className={`text-[10px] ${(daysUntil(item.dueDate) ?? 99) <= 1 ? "text-[#DC2626] font-medium" : "text-[#9C9890]"}`}>
                                    Határidő: {formatDateShort(item.dueDate)}
                                    {(daysUntil(item.dueDate) ?? 99) <= 0 && " (lejárt)"}
                                    {(daysUntil(item.dueDate) ?? 99) <= 1 && (daysUntil(item.dueDate) ?? 99) > 0 && " (ma)"}
                                  </span>
                                )}
                                {item.daysWaiting !== null && item.daysWaiting !== undefined && (
                                  <span className={`text-[10px] ${(item.daysWaiting ?? 0) >= 3 ? "text-[#DC2626]" : "text-[#9C9890]"}`}>
                                    {item.daysWaiting === 0 ? "Ma" : `${item.daysWaiting} napja`}
                                  </span>
                                )}
                              </div>
                              {/* Next action — now more prominent */}
                              <p className="text-[10px] text-[#8B6B3A] font-medium mt-1.5">
                                → {item.nextActionLabel}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] text-[#9C9890]">{formatDate(item.timestamp)}</span>
                              <div className="mt-1">
                                <Link href={item.openHref} onClick={(e) => e.stopPropagation()} className="inline-block px-2 py-1 text-[10px] bg-[#C9A227] text-white hover:bg-[#B8911F] rounded">
                                  {item.nextActionLabel}
                                </Link>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Waiting Section */}
              {groupedByUrgency.waiting.length > 0 && (
                <div>
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#7B776D]"></span>
                    Várakozó ({groupedByUrgency.waiting.length})
                  </h2>
                  <div className="space-y-2">
                    {groupedByUrgency.waiting.map((item) => {
                      const statusCfg = getStatusConfig(item.status);
                      const priorityCfg = getPriorityConfig(item.priority);
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`w-full text-left p-4 border border-[#EEE7D9] rounded transition-colors ${selected?.id === item.id ? "border-[#C9A227] bg-[#FBF9F3]" : "border-[#EEE7D9] bg-white hover:bg-[#FBF9F3]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap opacity-80">
                                <p className="text-sm font-semibold text-[#1F2821]">{item.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                                  {statusCfg.label}
                                </span>
                                {item.documentType && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EEE7D9] text-[#514D45] border border-[#DDD7CA]">
                                    {item.documentType}
                                  </span>
                                )}
                                {item.version && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EEE7D9] text-[#7B776D]">
                                    v{item.version}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#514D45] mt-1">{item.caseNumber} · {item.caseTitle}</p>
                              <p className="text-[10px] text-[#9C9890] mt-1">Felelős: {item.assigneeName}</p>
                              {(item.collaboratorCount ?? 0) > 0 && (
                                <p className="text-[10px] text-[#8B5CF6] mt-0.5">+{item.collaboratorCount} résztvevő az ügyön</p>
                              )}
                              <p className="text-[10px] text-[#8B6B3A] mt-1">→ {item.nextActionLabel}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] text-[#9C9890]">{formatDate(item.timestamp)}</span>
                              <div className="mt-1">
                                <Link href={item.openHref} onClick={(e) => e.stopPropagation()} className="inline-block px-2 py-1 text-[10px] border border-[#C9A227] text-[#C9A227] hover:bg-[#FBF9F3] rounded">
                                  {item.nextActionLabel}
                                </Link>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Blocked Section */}
              {groupedByUrgency.blocked.length > 0 && (
                <div>
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#DC2626] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#DC2626]"></span>
                    Blokkolva ({groupedByUrgency.blocked.length})
                  </h2>
                  <div className="space-y-2">
                    {groupedByUrgency.blocked.map((item) => {
                      const statusCfg = getStatusConfig(item.status);
                      const priorityCfg = getPriorityConfig(item.priority);
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`w-full text-left p-4 border border-[#fca5a5] rounded transition-colors ${selected?.id === item.id ? "border-[#DC2626] bg-[#FEF2F2]" : "border-[#fca5a5] bg-[#FEF2F2] hover:bg-[#fef2f2]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-[#1F2821]">{item.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                                  {statusCfg.label}
                                </span>
                              </div>
                              <p className="text-xs text-[#514D45] mt-1">{item.caseNumber} · {item.caseTitle}</p>
                              <p className="text-[10px] text-[#9C9890] mt-1">Felelős: {item.assigneeName}</p>
                              {(item.collaboratorCount ?? 0) > 0 && (
                                <p className="text-[10px] text-[#8B5CF6] mt-0.5">+{item.collaboratorCount} résztvevő az ügyön</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] text-[#9C9890]">{formatDate(item.timestamp)}</span>
                              <div className="mt-1">
                                <Link href={item.openHref} onClick={(e) => e.stopPropagation()} className="inline-block px-2 py-1 text-[10px] border border-[#DC2626] text-[#DC2626] hover:bg-white rounded">
                                  Megnyitás
                                </Link>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Done Section */}
              {groupedByUrgency.done.length > 0 && (
                <div>
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#059669] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#059669]"></span>
                    Kész ({groupedByUrgency.done.length})
                  </h2>
                  <div className="space-y-2">
                    {groupedByUrgency.done.map((item) => {
                      const statusCfg = getStatusConfig(item.status);
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`w-full text-left p-4 border border-[#a7f3d0] rounded transition-colors ${selected?.id === item.id ? "border-[#059669] bg-[#ECFDF5]" : "border-[#a7f3d0] bg-[#ECFDF5] hover:bg-[#ecfdf5]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap opacity-80">
                                <p className="text-sm font-semibold text-[#1F2821]">{item.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                                  {statusCfg.label}
                                </span>
                              </div>
                              <p className="text-xs text-[#514D45] mt-1">{item.caseNumber} · {item.caseTitle}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] text-[#9C9890]">{formatDate(item.timestamp)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <aside className="w-80 bg-white overflow-y-auto">
        <div className="p-4 space-y-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Kiválasztott review elem</h2>
          {!selected ? (
            <p className="text-xs text-[#9C9890]">Nincs kiválasztott tétel.</p>
          ) : (
            <>
              {/* Status and priority badges */}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const statusCfg = getStatusConfig(selected.status);
                  const priorityCfg = getPriorityConfig(selected.priority);
                  const urgency = getActionUrgency(selected.status);
                  return (
                    <>
                      <span className={`text-xs px-2 py-1 rounded border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
                        {statusCfg.label}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${priorityCfg.bg} ${priorityCfg.color}`}>
                        {priorityCfg.label} prioritás
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        urgency === "needs_action" ? "bg-[#fef3e2] text-[#8B6B3A]" :
                        urgency === "blocked" ? "bg-[#FEF2F2] text-[#DC2626]" :
                        urgency === "done" ? "bg-[#ECFDF5] text-[#059669]" :
                        "bg-[#ECE6DA] text-[#514D45]"
                      }`}>
                        {urgency === "needs_action" ? "Cselekvés szükséges" :
                         urgency === "blocked" ? "Blokkolva" :
                         urgency === "done" ? "Kész" : "Várakozó"}
                      </span>
                    </>
                  );
                })()}
              </div>

              <div className="border border-[#DDD7CA] p-3 space-y-2">
                <p className="text-sm font-semibold text-[#1F2821]">{selected.title}</p>
                <p className="text-xs text-[#514D45]">{selected.caseNumber} · {selected.caseTitle}</p>
                {selected.documentType && (
                  <p className="text-[11px] text-[#7B776D]">
                    Típus: <span className="font-medium text-[#514D45]">{selected.documentType}</span>
                    {selected.version && ` · v${selected.version}`}
                  </p>
                )}
                {selected.dueDate && (
                  <p className={`text-[11px] ${(daysUntil(selected.dueDate) ?? 99) <= 1 ? "text-[#DC2626] font-medium" : "text-[#7B776D]"}`}>
                    Határidő: {formatDateShort(selected.dueDate)}
                    {(daysUntil(selected.dueDate) ?? 99) <= 0 && " (lejárt)"}
                  </p>
                )}
                <p className="text-[11px] text-[#7B776D]">Létrehozva: {formatDate(selected.timestamp)}</p>
                {selected.daysWaiting !== null && selected.daysWaiting !== undefined && (
                  <p className={`text-[11px] font-medium ${(selected.daysWaiting ?? 0) >= 3 ? "text-[#DC2626]" : "text-[#7B776D]"}`}>
                    {selected.daysWaiting === 0 ? "Ma került a sorba" : `${selected.daysWaiting} napja a sorban`}
                  </p>
                )}
                <p className="text-[11px] text-[#8B6B3A] font-medium mt-1">
                  Következő: {selected.nextActionLabel}
                </p>
              </div>

              {/* Reviewer/Assignee Info */}
              <div className="border border-[#DDD7CA] p-3 bg-[#F6F2E8]">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Felelős</h3>
                  {selected.source === "task" && (
                    <button
                      type="button"
                      className="text-[10px] px-2 py-1 border border-[#C9A227] text-[#8B6B3A] rounded hover:bg-[#FBF9F3]"
                      onClick={() => {
                        setReviewShowReassign((prev) => !prev);
                        if (!reviewShowReassign) {
                          handleReviewReassign(selected.caseId);
                        }
                      }}
                    >
                      {reviewShowReassign ? "Bezárás" : "Átirányítás"}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[#1F2821]">
                    {selected.assigneeName || "Nincs kijelölve"}
                  </p>
                  {(selected.collaboratorCount ?? 0) > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-medium bg-[#8B5CF6] text-white rounded-full" title={`${selected.collaboratorCount} résztvevő`}>
                      +{selected.collaboratorCount}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#9C9890] mt-0.5">
                  {selected.assigneeName ? "Ez a személy felelős a feladatért" : "A feladat még nincs kiosztva"}
                </p>
                {(selected.collaboratorCount ?? 0) > 0 && (
                  <p className="text-[10px] text-[#8B5CF6] mt-0.5">
                    +{selected.collaboratorCount} résztvevő az ügyön
                  </p>
                )}
                {selected.source === "task" && reviewShowReassign && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] text-[#7B776D]">
                      Kollaborátorok előre sorolva a kiosztáshoz.
                    </p>
                    <select
                      className="w-full px-2 py-2 border border-[#DDD7CA] bg-white text-xs"
                      value={reviewSelectedAssignee}
                      onChange={(e) => {
                        const newAssigneeId = e.target.value;
                        setReviewSelectedAssignee(newAssigneeId);
                        const chosen = reviewAssignees.find((u) => u.id === newAssigneeId);
                        if (chosen) {
                          handleReviewReassignConfirm(selected.id.replace("task-", ""), newAssigneeId, chosen.name);
                        }
                      }}
                      disabled={reviewReassignLoading}
                    >
                      <option value="">Kiosztás módosítása…</option>
                      <optgroup label="Kollaborátorok">
                        {reviewAssignees
                          .filter((u) => reviewCollaboratorIds.includes(u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="További felhasználók">
                        {reviewAssignees
                          .filter((u) => !reviewCollaboratorIds.includes(u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>
                )}
              </div>

              {/* Action next hint */}
              <div className="space-y-1">
                <Link href={selected.openHref} className="block px-3 py-2 text-xs border border-[#C9A227] bg-[#FBF9F3] text-center font-semibold hover:bg-[#f5ecd8]">
                  {selected.nextActionLabel}
                </Link>
                <Link
                  href={
                    selected.source === "task" && selected.taskId
                      ? `/tasks?taskId=${selected.taskId}`
                      : selected.fallbackHref
                  }
                  className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] text-center"
                >
                  Kapcsolt workflow nézet
                </Link>
                <Link
                  href={
                    selected.documentId
                      ? `/documents/compare?caseId=${encodeURIComponent(selected.caseId)}&documentId=${encodeURIComponent(selected.documentId)}`
                      : `/documents/compare?caseId=${encodeURIComponent(selected.caseId)}`
                  }
                  className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] text-center"
                >
                  Verzió-összevetés
                </Link>
                <Link href={`/cases/${selected.caseId}`} className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] text-center">
                  Ügy megnyitása
                </Link>
              </div>

              <div className="pt-2 border-t border-[#EEE7D9]">
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Kapcsolt ügy összegzés</h3>
                {caseSummaries[selected.caseId] ? (
                  <div className="text-xs text-[#514D45] space-y-1">
                    <p>Dokumentumok: {caseSummaries[selected.caseId].stats.totalDocuments}</p>
                    <p>Review alatt: {caseSummaries[selected.caseId].stats.pendingReview}</p>
                    <p>Jóváhagyott: {caseSummaries[selected.caseId].stats.approvedDocuments}</p>
                  </div>
                ) : (
                  <p className="text-xs text-[#9C9890]">Ügy-összegzés nem érhető el.</p>
                )}
              </div>
            </>
          )}

          <div className="pt-2 border-t border-[#EEE7D9]">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Kapcsolt felületek</h3>
            <div className="space-y-1">
              <Link href="/tasks" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Feladatok</Link>
              <Link href="/notifications" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Értesítések</Link>
              <Link href="/documents/compare" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Verzió-összevetés</Link>
              <Link href="/cases" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Ügylista</Link>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

