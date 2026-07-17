"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getCaseSummary,
  getCases,
  getCurrentUser,
  getReviewTasks,
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
  clientId?: string;
  clientName: string;
  status: string;
  priority: string;
  assigneeName: string;
  submitterName: string;
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
  sourceCommunicationId?: string | null;
};

type AttentionLevel = "scan" | "approve" | "sign" | "edit" | "deep";

const ATTENTION_CONFIG: Record<AttentionLevel, { label: string; className: string }> = {
  scan: { label: "Gyors átfutás", className: "border-[var(--adm-border)] bg-[var(--adm-ivory-100)] text-[var(--adm-text-muted)]" },
  approve: { label: "Jóváhagyás", className: "border-[#f5d89a] bg-[#fef3e2] text-[#8B6B3A]" },
  sign: { label: "Aláírás", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  edit: { label: "Szerkesztés", className: "border-[var(--adm-terracotta-100)] bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)]" },
  deep: { label: "Részletes ellenőrzés", className: "border-[var(--adm-blue-700)]/25 bg-[var(--adm-blue-100)]/35 text-[var(--adm-blue-700)]" },
};

const REVIEW_EFFORT: Record<AttentionLevel, string> = {
  scan: "kb. 5 perc",
  approve: "kb. 10–15 perc",
  sign: "kb. 5–10 perc",
  edit: "kb. 20–30 perc",
  deep: "30+ perc",
};

function getAttentionLevel(item: QueueItem): AttentionLevel {
  const status = item.status.toUpperCase();
  const priority = item.priority.toUpperCase();
  if (status === "REJECTED") return "edit";
  if (item.source === "document" && ["APPROVED", "FINALIZED", "FINAL"].includes(status)) return "sign";
  if (["URGENT", "HIGH"].includes(priority)) return "deep";
  if (["SUBMITTED", "IN_REVIEW", "REVIEW_NEEDED", "REVIEW_SUBMITTED"].includes(status)) return "approve";
  return "scan";
}

// Status label and styling mapping
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; badge?: string }> = {
  IN_REVIEW: { label: "Review alatt", color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", border: "border-[#f5d89a]", badge: "Folyamatban" },
  REVIEW_NEEDED: { label: "Review alatt", color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", border: "border-[#f5d89a]", badge: "Folyamatban" },
  REVIEW_SUBMITTED: { label: "Review alatt", color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", border: "border-[#f5d89a]", badge: "Folyamatban" },
  SUBMITTED: { label: "Review alatt", color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", border: "border-[#f5d89a]", badge: "Folyamatban" },
  APPROVED: { label: "Jóváhagyva", color: "text-[#059669]", bg: "bg-[#ECFDF5]", border: "border-[#a7f3d0]", badge: "Kész" },
  REJECTED: { label: "Visszaküldve", color: "text-[var(--adm-terracotta-700)]", bg: "bg-[var(--adm-terracotta-100)]", border: "border-[#fca5a5]", badge: "Vissza" },
  GENERATED: { label: "Generálva", color: "text-[var(--adm-text-muted)]", bg: "bg-[var(--adm-ivory-200)]", border: "border-[var(--adm-border)]", badge: "Generálva" },
  PENDING: { label: "Függőben", color: "text-[var(--adm-text-muted)]", bg: "bg-[var(--adm-ivory-100)]", border: "border-[var(--adm-border)]", badge: "Függőben" },
  DRAFT: { label: "Piszkozat", color: "text-[var(--adm-text-muted)]", bg: "bg-[var(--adm-ivory-100)]", border: "border-[var(--adm-border)]", badge: "Piszkozat" },
  FINALIZED: { label: "Véglegesítve", color: "text-[#059669]", bg: "bg-[#ECFDF5]", border: "border-[#a7f3d0]", badge: "Kész" },
  IN_PROGRESS: { label: "Folyamatban", color: "text-[#2563EB]", bg: "bg-[#EFF6FF]", border: "border-[#bfdbfe]", badge: "Folyamatban" },
  TODO: { label: "Teendő", color: "text-[var(--adm-text-muted)]", bg: "bg-[var(--adm-ivory-200)]", border: "border-[var(--adm-border)]", badge: "Teendő" },
  DONE: { label: "Kész", color: "text-[#059669]", bg: "bg-[#ECFDF5]", border: "border-[#a7f3d0]", badge: "Kész" },
  COMPLETED: { label: "Befejezve", color: "text-[#059669]", bg: "bg-[#ECFDF5]", border: "border-[#a7f3d0]", badge: "Kész" },
  BLOCKED: { label: "Elakadt", color: "text-[var(--adm-terracotta-700)]", bg: "bg-[var(--adm-terracotta-100)]", border: "border-[#fca5a5]", badge: "Elakadt" },
  CANCELLED: { label: "Törölve", color: "text-[var(--adm-text-muted)]", bg: "bg-[var(--adm-ivory-100)]", border: "border-[var(--adm-border)]", badge: "Törölve" },
};

const getStatusConfig = (status: string) => {
  const upper = status.toUpperCase();
  return STATUS_CONFIG[upper] || STATUS_CONFIG[upper.replace(/-/g, "_")] || {
    label: "Ismeretlen állapot",
    color: "text-[var(--adm-text-muted)]",
    bg: "bg-[var(--adm-ivory-200)]",
    border: "border-[var(--adm-border)]",
    badge: "Ismeretlen",
  };
};

// Priority config
const PRIORITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  URGENT: { color: "text-[var(--adm-terracotta-700)]", bg: "bg-[var(--adm-terracotta-100)]", label: "Sürgős" },
  HIGH: { color: "text-[#8B6B3A]", bg: "bg-[#fef3e2]", label: "Magas" },
  MEDIUM: { color: "text-[var(--adm-text-muted)]", bg: "bg-[var(--adm-ivory-200)]", label: "Közepes" },
  LOW: { color: "text-[var(--adm-text-muted)]", bg: "bg-[var(--adm-ivory-100)]", label: "Alacsony" },
};

const getPriorityConfig = (priority: string) => {
  const upper = priority.toUpperCase();
  return PRIORITY_CONFIG[upper] || { color: "text-[var(--adm-text-muted)]", bg: "bg-[var(--adm-ivory-100)]", label: priority };
};

// Action urgency classification
type ActionUrgency = "needs_action" | "waiting" | "done" | "blocked";
const getActionUrgency = (status: string): ActionUrgency => {
  const upper = status.toUpperCase();
  // Done states — no action needed
  if (["APPROVED", "DONE", "COMPLETED", "FINAL"].includes(upper)) return "done";
  // Blocked — external dependency (cancelled)
  if (["BLOCKED", "CANCELLED"].includes(upper)) return "blocked";
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

const getDocumentTypeLabel = (documentType?: string) => {
  if (!documentType) return null;
  const normalized = documentType.toUpperCase();
  if (normalized === "MODIFIED_WORKING_COPY") return "Módosított munkapéldány";
  if (normalized === "UPLOADED") return "Feltöltött dokumentum";
  if (normalized === "UPLOADED_ORIGINAL") return "Feltöltött eredeti dokumentum";
  if (normalized === "GENERATED") return "Generált dokumentum";
  if (normalized === "GENERATED_DOCUMENT") return "Generált dokumentum";
  return "Ismeretlen dokumentumtípus";
};

const daysUntil = (iso?: string) => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const daysSince = (iso?: string) => {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
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
    bg: isSignalTiles ? "bg-[#0C1222]" : "bg-[var(--adm-ivory-100)]",
    bgAlt: isSignalTiles ? "bg-[#111827]" : "bg-[var(--adm-ivory-100)]",
    bgHover: isSignalTiles ? "hover:bg-[#1a2744]" : "hover:bg-[var(--adm-ivory-200)]",
    bgCard: isSignalTiles ? "bg-[#0F1923]" : "bg-white",
    bgSection: isSignalTiles ? "bg-[#0A1020]" : "bg-[var(--adm-surface)]",
    text: isSignalTiles ? "text-[#CBD5E1]" : "text-[var(--adm-text-muted)]",
    textMuted: isSignalTiles ? "text-[#94A3B8]" : "text-[var(--adm-text-muted)]",
    textDark: isSignalTiles ? "text-[#F1F5F9]" : "text-[var(--adm-text)]",
    border: isSignalTiles ? "border-[#1E3A5F]" : "border-[var(--adm-border)]",
    borderLight: isSignalTiles ? "border-[#1E3A5F]" : "border-[var(--adm-border)]",
    badge: isSignalTiles ? "bg-[#1E3A5F] text-[#67E8F9]" : "bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)]",
    accent: isSignalTiles ? "text-cyan-400" : "text-[#8B7355]",
    accentBg: isSignalTiles ? "bg-cyan-400/10" : "bg-[var(--adm-ivory-100)]",
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
  const [submitterFilter, setSubmitterFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [caseFilter, setCaseFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState<AttentionLevel | "all">("all");
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
        item.taskId === taskId
          ? { ...item, assigneeName: newAssigneeName }
          : item
      ));
      setReviewSelectedAssignee('');
      setReviewShowReassign(false);
    } catch (err) {
      console.error('[Reviews] Failed to reassign task', err);
    }
  };

  const loadReviewQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
        const me = await getCurrentUser();
        const [assignedCases, reviewTaskRows] = await Promise.all([
          getCases(1, 200, ["ADMIN", "PARTNER"].includes(String(me.role).toUpperCase()) ? undefined : me.id),
          getReviewTasks(),
        ]);

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

        const reviewTasks: QueueItem[] = reviewTaskRows
          .map((task: TaskItem) => ({
            id: `task-${task.id}`,
            source: "task",
            title: task.title,
            caseId: task.case.id,
            caseNumber: task.case.caseNumber,
            caseTitle: task.case.title || task.case.caseNumber,
            clientId: task.case.clientId,
            clientName: task.case.clientName || "Nincs ügyféladat",
            status: task.status,
            priority: task.priority,
            assigneeName: task.assignedTo?.name || "Nincs kijelölve",
            submitterName: task.assignedBy?.name || "Nincs beküldőadat",
            timestamp: task.submittedAt || task.updatedAt || task.createdAt || "",
            dueDate: task.dueDate,
            nextActionLabel: getNextActionLabel(task.status, "task"),
            collaboratorCount: caseCollaboratorMap[task.case.id] ?? 0,
            openHref: `/tasks?taskId=${task.id}`,
            fallbackHref: `/cases/${task.case.id}`,
            taskId: task.id,
            sourceCommunicationId: task.sourceCommunicationId,
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
              clientId: row.caseItem.clientId,
              clientName: row.caseItem.clientName || "Nincs ügyféladat",
              status: doc.status,
              priority: row.caseItem.priority,
              assigneeName: row.caseItem.assignedLawyer?.name || "Nincs kijelölve",
              submitterName: "Nincs beküldőadat",
              timestamp: doc.createdAt,
              documentId: doc.id,
              documentType: doc.documentType,
              version: doc.version,
              nextActionLabel: getNextActionLabel(doc.status, "document"),
              daysWaiting: daysSince(doc.createdAt),
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
      setError("A review sor most nem érhető el.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviewQueue();
  }, [loadReviewQueue]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return queue.filter((item) => {
      const statusMatch = statusFilter === "all" || item.status === statusFilter;
      const submitterMatch = submitterFilter === "all" || item.submitterName === submitterFilter;
      const assigneeMatch = assigneeFilter === "all" || item.assigneeName === assigneeFilter;
      const caseMatch = caseFilter === "all" || item.caseId === caseFilter;
      const clientMatch = clientFilter === "all" || item.clientName === clientFilter;
      const dateMatch = (() => {
        if (dateFilter === "all") return true;
        const timestamp = new Date(item.timestamp).getTime();
        if (Number.isNaN(timestamp)) return false;
        const age = Date.now() - timestamp;
        if (dateFilter === "today") return age >= 0 && age <= 24 * 60 * 60 * 1000;
        if (dateFilter === "week") return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
        return age >= 0 && age <= 31 * 24 * 60 * 60 * 1000;
      })();
      const urgentMatch =
        !urgentOnly ||
        item.priority === "URGENT" ||
        item.priority === "HIGH" ||
        (item.dueDate ? (daysUntil(item.dueDate) ?? 99) <= 1 : false);
      const attentionMatch = attentionFilter === "all" || getAttentionLevel(item) === attentionFilter;
      const searchMatch =
        !s ||
        item.title.toLowerCase().includes(s) ||
        item.caseNumber.toLowerCase().includes(s) ||
        item.caseTitle.toLowerCase().includes(s) ||
        item.clientName.toLowerCase().includes(s);
      return statusMatch && submitterMatch && assigneeMatch && caseMatch && clientMatch && dateMatch && urgentMatch && attentionMatch && searchMatch;
    });
  }, [attentionFilter, queue, statusFilter, submitterFilter, assigneeFilter, caseFilter, clientFilter, dateFilter, urgentOnly, search]);

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
  const hasActiveFilters =
    statusFilter !== "all" ||
    submitterFilter !== "all" ||
    assigneeFilter !== "all" ||
    caseFilter !== "all" ||
    clientFilter !== "all" ||
    dateFilter !== "all" ||
    urgentOnly ||
    attentionFilter !== "all" ||
    search.trim().length > 0;
  const assignees = useMemo(() => Array.from(new Set(queue.map((item) => item.assigneeName))).sort(), [queue]);
  const statuses = useMemo(() => Array.from(new Set(queue.map((item) => item.status))).sort(), [queue]);
  const cases = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    queue.forEach((item) => map.set(item.caseId, { id: item.caseId, label: item.caseNumber }));
    return Array.from(map.values());
  }, [queue]);
  const clients = useMemo(() => Array.from(new Set(queue.map((item) => item.clientName))).sort(), [queue]);
  const submitters = useMemo(() => Array.from(new Set(queue.map((item) => item.submitterName))).sort(), [queue]);

  return (
    <div className={`flex-1 flex min-h-0 reviews-surface ${p.bg}`}>
      <main className={`flex-1 overflow-y-auto adm-board-page reviews-main ${p.border}`}>
        <div className="adm-board-container max-w-[1320px]">
          <div className="adm-board-hero mb-4 p-4">
            <p className="adm-kicker">Jóváhagyási munkasor</p>
            <h1 className={`mt-1 text-[32px] leading-tight font-serif ${p.textDark}`}>Review sor</h1>
            <p className={`mt-1 text-xs ${p.textMuted}`}>Jóváhagyásra vagy visszaküldésre váró munkapéldányok és feladatok.</p>
          </div>

          {/* Queue statistics bar */}
          {!isLoading && queueStats.total > 0 && (
            <div className={`mb-4 flex flex-wrap gap-3 p-3 ${isSignalTiles ? "bg-slate-800 border-slate-600" : "adm-board-panel-tight"} border rounded`}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-[var(--adm-text)]">{queueStats.total}</span>
                <span className="text-[10px] text-[var(--adm-text-muted)]">összes</span>
              </div>
              {queueStats.needsAction > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#fef3e2] border border-[#f5d89a] rounded">
                  <span className="text-sm font-semibold text-[#8B6B3A]">{queueStats.needsAction}</span>
                  <span className="text-[10px] text-[#8B6B3A]">cselekvés szükséges</span>
                </div>
              )}
              {queueStats.waiting > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--adm-ivory-200)] border border-[var(--adm-border)] rounded">
                  <span className="text-sm font-semibold text-[var(--adm-text-muted)]">{queueStats.waiting}</span>
                  <span className="text-[10px] text-[var(--adm-text-muted)]">várakozó</span>
                </div>
              )}
              {queueStats.blocked > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--adm-terracotta-100)] border border-[#fca5a5] rounded">
                  <span className="text-sm font-semibold text-[var(--adm-terracotta-700)]">{queueStats.blocked}</span>
                  <span className="text-[10px] text-[var(--adm-terracotta-700)]">blokkolva</span>
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

          <div className="adm-board-panel-tight mb-2 flex flex-wrap gap-1 p-2" aria-label="Ellenőrzési igény">
            <button type="button" onClick={() => setAttentionFilter("all")} className={`border px-2.5 py-1.5 text-[10px] font-semibold ${attentionFilter === "all" ? "border-[var(--adm-green-800)] bg-[var(--adm-green-800)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>Minden igény</button>
            {(Object.entries(ATTENTION_CONFIG) as Array<[AttentionLevel, (typeof ATTENTION_CONFIG)[AttentionLevel]]>).map(([level, config]) => (
              <button key={level} type="button" onClick={() => setAttentionFilter(level)} className={`border px-2.5 py-1.5 text-[10px] font-semibold ${attentionFilter === level ? config.className : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>{config.label}</button>
            ))}
          </div>

          <div className="adm-board-panel-tight mb-4 grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés" className={`adm-board-field w-full px-2 py-2 text-xs ${p.textDark}`} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`adm-board-field w-full px-2 py-2 text-xs ${p.textDark}`}>
              <option value="all">Minden státusz</option>
              {statuses.map((status) => {
                const cfg = getStatusConfig(status);
                return <option key={status} value={status}>{cfg.label}</option>;
              })}
            </select>
            <select value={submitterFilter} onChange={(e) => setSubmitterFilter(e.target.value)} className={`adm-board-field w-full px-2 py-2 text-xs ${p.textDark}`}>
              <option value="all">Minden beküldő</option>
              {submitters.map((submitter) => <option key={submitter} value={submitter}>{submitter}</option>)}
            </select>
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className={`adm-board-field w-full px-2 py-2 text-xs ${p.textDark}`}>
              <option value="all">Minden felelős</option>
              {assignees.map((assignee) => (
                <option key={assignee} value={assignee}>{assignee}</option>
              ))}
            </select>
            <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} className={`adm-board-field w-full px-2 py-2 text-xs ${p.textDark}`}>
              <option value="all">Minden ügy</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={`adm-board-field w-full px-2 py-2 text-xs ${p.textDark}`}>
              <option value="all">Minden ügyfél</option>
              {clients.map((client) => <option key={client} value={client}>{client}</option>)}
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={`adm-board-field w-full px-2 py-2 text-xs ${p.textDark}`}>
              <option value="all">Minden beküldési idő</option>
              <option value="today">Elmúlt 24 óra</option>
              <option value="week">Elmúlt 7 nap</option>
              <option value="month">Elmúlt 31 nap</option>
            </select>
            <label className={`adm-board-field flex items-center gap-2 px-2 text-xs ${p.textDark}`}>
              <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
              Csak sürgős
            </label>
          </div>
          {isLoading ? (
            <div className="adm-board-empty text-xs text-[var(--adm-text-muted)]">Review sor betöltése…</div>
          ) : error ? (
            <div className="adm-board-empty border-[var(--adm-terracotta-100)] bg-[var(--adm-terracotta-100)]">
              <p className="font-serif text-lg text-[#8B3A3A]">{error}</p>
              <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Próbáld újra, vagy nyisd meg az ügyeket és dokumentumokat közvetlenül.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={loadReviewQueue} className="rounded border border-[#8B3A3A] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#8B3A3A] hover:bg-[#FFF0ED]">Újrapróbálás</button>
                <Link href="/cases" className="rounded adm-board-panel-tight px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">Ügyek megnyitása</Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="adm-board-empty text-xs text-[var(--adm-text-muted)]">
              <p className="font-serif text-lg text-[var(--adm-text)]">{queue.length === 0 ? "Nincs review-ra váró dokumentum." : "Nincs találat a kiválasztott szűrőkkel."}</p>
              <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">
                {queue.length === 0
                  ? "A review-ra küldött munkapéldányok és feladatok itt jelennek meg."
                  : hasActiveFilters
                    ? "Módosítsd a keresést vagy a szűrőket a teljes review sor megjelenítéséhez."
                    : "Jelenleg nincs megjeleníthető review tétel."}
              </p>
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
                      const attention = ATTENTION_CONFIG[getAttentionLevel(item)];
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`w-full text-left p-4 border rounded transition-colors ${selected?.id === item.id ? "border-[var(--adm-ochre-500)] bg-[var(--adm-surface)]" : "border-[var(--adm-border)] bg-white hover:bg-[var(--adm-surface)]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-[var(--adm-text)]">{item.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                                  {statusCfg.label}
                                </span>
                                {item.documentType && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)] border border-[var(--adm-border)]">
                                    {getDocumentTypeLabel(item.documentType)}
                                  </span>
                                )}
                                {item.version && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)]">
                                    v{item.version}
                                  </span>
                                )}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityCfg.bg} ${priorityCfg.color}`}>
                                  {priorityCfg.label}
                                </span>
                                <span title="Nem beküldő által választott adat; a meglévő státusz és prioritás alapján számított javaslat" className={`border px-1.5 py-0.5 text-[10px] ${attention.className}`}>
                                  Javasolt: {attention.label}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--adm-text-muted)] mt-1">{item.caseNumber} · {item.caseTitle} · {item.clientName}</p>
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span className="text-[10px] text-[var(--adm-text-muted)]">
                                  <span className="font-medium">Munkavégző:</span> {item.assigneeName}
                                </span>
                                <span className="text-[10px] text-[var(--adm-text-muted)]"><span className="font-medium">Beküldő:</span> {item.submitterName}</span>
                                <span className="text-[10px] text-[var(--adm-text-muted)]">Becsült review: {REVIEW_EFFORT[getAttentionLevel(item)]}</span>
                                {(item.collaboratorCount ?? 0) > 0 && (
                                  <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-medium bg-[#8B5CF6] text-white rounded-full" title={`${item.collaboratorCount} résztvevő`}>
                                    +{item.collaboratorCount}
                                  </span>
                                )}
                                {item.dueDate && (
                                  <span className={`text-[10px] ${
                                    (daysUntil(item.dueDate) ?? 99) < 0
                                      ? "text-[var(--adm-terracotta-700)] font-medium"
                                      : (daysUntil(item.dueDate) ?? 99) === 0
                                      ? "text-[#8B6B3A] font-medium"
                                      : "text-[#166534] font-medium"
                                  }`}>
                                    Határidő: {formatDateShort(item.dueDate)}
                                    {(daysUntil(item.dueDate) ?? 99) < 0 && " (lejárt)"}
                                    {(daysUntil(item.dueDate) ?? 99) === 0 && " (ma esedékes)"}
                                  </span>
                                )}
                                {item.daysWaiting !== null && item.daysWaiting !== undefined && (
                                  <span className={`text-[10px] ${(item.daysWaiting ?? 0) >= 3 ? "text-[var(--adm-terracotta-700)]" : "text-[var(--adm-text-soft)]"}`}>
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
                              <span className="text-[10px] text-[var(--adm-text-soft)]">{formatDate(item.timestamp)}</span>
                              <div className="mt-1">
                                <Link href={item.openHref} onClick={(e) => e.stopPropagation()} className="inline-block px-2 py-1 text-[10px] bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)] hover:bg-[#173824] rounded">
                                  Review megnyitása
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
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2 flex items-center gap-2">
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
                          className={`w-full text-left p-4 border border-[var(--adm-border)] rounded transition-colors ${selected?.id === item.id ? "border-[var(--adm-ochre-500)] bg-[var(--adm-surface)]" : "border-[var(--adm-border)] bg-white hover:bg-[var(--adm-surface)]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap opacity-80">
                                <p className="text-sm font-semibold text-[var(--adm-text)]">{item.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                                  {statusCfg.label}
                                </span>
                                {item.documentType && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)] border border-[var(--adm-border)]">
                                    {getDocumentTypeLabel(item.documentType)}
                                  </span>
                                )}
                                {item.version && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)]">
                                    v{item.version}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--adm-text-muted)] mt-1">{item.caseNumber} · {item.caseTitle}</p>
                              <p className="text-[10px] text-[var(--adm-text-soft)] mt-1">Felelős: {item.assigneeName}</p>
                              {(item.collaboratorCount ?? 0) > 0 && (
                                <p className="text-[10px] text-[#8B5CF6] mt-0.5">+{item.collaboratorCount} résztvevő az ügyön</p>
                              )}
                              <p className="text-[10px] text-[#8B6B3A] mt-1">→ {item.nextActionLabel}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] text-[var(--adm-text-soft)]">{formatDate(item.timestamp)}</span>
                              <div className="mt-1">
                                <Link href={item.openHref} onClick={(e) => e.stopPropagation()} className="inline-block px-2 py-1 text-[10px] border border-[var(--adm-ochre-500)] text-[var(--adm-ochre-500)] hover:bg-[var(--adm-surface)] rounded">
                                  Review megnyitása
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
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-terracotta-700)] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#DC2626]"></span>
                    Elakadt ({groupedByUrgency.blocked.length})
                  </h2>
                  <div className="space-y-2">
                    {groupedByUrgency.blocked.map((item) => {
                      const statusCfg = getStatusConfig(item.status);
                      const priorityCfg = getPriorityConfig(item.priority);
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`w-full text-left p-4 border border-[#fca5a5] rounded transition-colors ${selected?.id === item.id ? "border-[#DC2626] bg-[var(--adm-terracotta-100)]" : "border-[#fca5a5] bg-[var(--adm-terracotta-100)] hover:bg-[#fef2f2]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-[var(--adm-text)]">{item.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                                  {statusCfg.label}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--adm-text-muted)] mt-1">{item.caseNumber} · {item.caseTitle}</p>
                              <p className="text-[10px] text-[var(--adm-text-soft)] mt-1">Felelős: {item.assigneeName}</p>
                              {(item.collaboratorCount ?? 0) > 0 && (
                                <p className="text-[10px] text-[#8B5CF6] mt-0.5">+{item.collaboratorCount} résztvevő az ügyön</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] text-[var(--adm-text-soft)]">{formatDate(item.timestamp)}</span>
                              <div className="mt-1">
                                <Link href={item.openHref} onClick={(e) => e.stopPropagation()} className="inline-block px-2 py-1 text-[10px] border border-[#DC2626] text-[var(--adm-terracotta-700)] hover:bg-white rounded">
                                  Review megnyitása
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
                                <p className="text-sm font-semibold text-[var(--adm-text)]">{item.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                                  {statusCfg.label}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--adm-text-muted)] mt-1">{item.caseNumber} · {item.caseTitle}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] text-[var(--adm-text-soft)]">{formatDate(item.timestamp)}</span>
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
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Kiválasztott review elem</h2>
          {!selected ? (
            <p className="text-xs text-[var(--adm-text-soft)]">Válassz review tételt a részletekhez.</p>
          ) : (
            <>
              {/* Status and priority badges */}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const statusCfg = getStatusConfig(selected.status);
                  const priorityCfg = getPriorityConfig(selected.priority);
                  const urgency = getActionUrgency(selected.status);
                  const attention = ATTENTION_CONFIG[getAttentionLevel(selected)];
                  return (
                    <>
                      <span className={`text-xs px-2 py-1 rounded border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
                        {statusCfg.label}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${priorityCfg.bg} ${priorityCfg.color}`}>
                        {priorityCfg.label} prioritás
                      </span>
                      <span title="Nem beküldő által választott adat; a meglévő státusz és prioritás alapján számított javaslat" className={`border px-2 py-1 text-xs ${attention.className}`}>
                        Javasolt: {attention.label}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        urgency === "needs_action" ? "bg-[#fef3e2] text-[#8B6B3A]" :
                        urgency === "blocked" ? "bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)]" :
                        urgency === "done" ? "bg-[#ECFDF5] text-[#059669]" :
                        "bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)]"
                      }`}>
                        {urgency === "needs_action" ? "Cselekvés szükséges" :
                         urgency === "blocked" ? "Elakadt" :
                         urgency === "done" ? "Kész" : "Várakozó"}
                      </span>
                    </>
                  );
                })()}
              </div>

              <div className="border border-[var(--adm-border)] p-3 space-y-2">
                <p className="text-sm font-semibold text-[var(--adm-text)]">{selected.title}</p>
                <p className="text-xs text-[var(--adm-text-muted)]">{selected.caseNumber} · {selected.caseTitle} · {selected.clientName}</p>
                {selected.documentType && (
                  <p className="text-[11px] text-[var(--adm-text-muted)]">
                    Típus: <span className="font-medium text-[var(--adm-text-muted)]">{getDocumentTypeLabel(selected.documentType)}</span>
                    {selected.version && ` · v${selected.version}`}
                  </p>
                )}
                {selected.dueDate && (
                  <p className={`text-[11px] ${
                    (daysUntil(selected.dueDate) ?? 99) < 0
                      ? "text-[var(--adm-terracotta-700)] font-medium"
                      : (daysUntil(selected.dueDate) ?? 99) === 0
                      ? "text-[#8B6B3A] font-medium"
                      : "text-[#166534] font-medium"
                  }`}>
                    Határidő: {formatDateShort(selected.dueDate)}
                    {(daysUntil(selected.dueDate) ?? 99) < 0 && " (lejárt)"}
                    {(daysUntil(selected.dueDate) ?? 99) === 0 && " (ma esedékes)"}
                  </p>
                )}
                <p className="text-[11px] text-[var(--adm-text-muted)]">Beküldve / sorba került: {formatDate(selected.timestamp)}</p>
                <p className="text-[11px] text-[var(--adm-text-muted)]">Beküldő: {selected.submitterName}</p>
                <p className="text-[11px] text-[var(--adm-text-muted)]">Becsült review idő: {REVIEW_EFFORT[getAttentionLevel(selected)]}</p>
                {selected.daysWaiting !== null && selected.daysWaiting !== undefined && (
                  <p className={`text-[11px] font-medium ${(selected.daysWaiting ?? 0) >= 3 ? "text-[var(--adm-terracotta-700)]" : "text-[var(--adm-text-muted)]"}`}>
                    {selected.daysWaiting === 0 ? "Ma került a sorba" : `${selected.daysWaiting} napja a sorban`}
                  </p>
                )}
                <p className="text-[11px] text-[#8B6B3A] font-medium mt-1">
                  Következő: {selected.nextActionLabel}
                </p>
                {selected.sourceCommunicationId ? (
                  <p className="text-[11px]"><Link href={`/notifications?communicationId=${encodeURIComponent(selected.sourceCommunicationId)}`} className="font-semibold text-[var(--adm-blue-700)] hover:underline">Kapcsolt kommunikáció megnyitása</Link></p>
                ) : (
                  <p className="text-[11px] text-[var(--adm-text-muted)]">Nincs kapcsolt kommunikáció.</p>
                )}
              </div>

              {/* Reviewer/Assignee Info */}
              <div className="border border-[var(--adm-border)] p-3 bg-[var(--adm-ivory-100)]">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Felelős</h3>
                  {selected.source === "task" && (
                    <button
                      type="button"
                      className="text-[10px] px-2 py-1 border border-[var(--adm-ochre-500)] text-[#8B6B3A] rounded hover:bg-[var(--adm-surface)]"
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
                  <p className="text-sm font-semibold text-[var(--adm-text)]">
                    {selected.assigneeName || "Nincs kijelölve"}
                  </p>
                  {(selected.collaboratorCount ?? 0) > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-medium bg-[#8B5CF6] text-white rounded-full" title={`${selected.collaboratorCount} résztvevő`}>
                      +{selected.collaboratorCount}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--adm-text-soft)] mt-0.5">
                  {selected.assigneeName ? "Ez a személy felelős a feladatért" : "A feladat még nincs kiosztva"}
                </p>
                {(selected.collaboratorCount ?? 0) > 0 && (
                  <p className="text-[10px] text-[#8B5CF6] mt-0.5">
                    +{selected.collaboratorCount} résztvevő az ügyön
                  </p>
                )}
                {selected.source === "task" && reviewShowReassign && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] text-[var(--adm-text-muted)]">
                      Kollaborátorok előre sorolva a kiosztáshoz.
                    </p>
                    <select
                      className="w-full px-2 py-2 adm-board-panel-tight text-xs"
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
                <Link href={selected.openHref} className="block px-3 py-2 text-xs border border-[#1F4A33] bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)] text-center font-semibold hover:bg-[#173824]">
                  Megnyitás
                </Link>
                <Link href={`/cases/${selected.caseId}/documents`} className="adm-link-button block px-3 py-2 text-xs text-center">
                  Dokumentumtár
                </Link>
                <Link href={`/cases/${selected.caseId}/handoff`} className="block px-3 py-2 text-xs border border-[var(--adm-ochre-500)] bg-[var(--adm-sand-100)] text-[#7B5E2E] hover:bg-[#f5ecd8] text-center">
                  Leadás
                </Link>
                <Link
                  href={
                    selected.source === "task" && selected.taskId
                      ? `/tasks?taskId=${selected.taskId}`
                      : selected.fallbackHref
                  }
                  className="adm-link-button block px-3 py-2 text-xs text-center"
                >
                  Kapcsolt workflow nézet
                </Link>
                <Link
                  href={
                    selected.documentId
                      ? `/documents/compare?caseId=${encodeURIComponent(selected.caseId)}&documentId=${encodeURIComponent(selected.documentId)}`
                      : `/documents/compare?caseId=${encodeURIComponent(selected.caseId)}`
                  }
                  className="adm-link-button block px-3 py-2 text-xs text-center"
                >
                  Szerződés-workspace
                </Link>
                <Link href={`/cases/${selected.caseId}`} className="adm-link-button block px-3 py-2 text-xs text-center">
                  Ügy megnyitása
                </Link>
              </div>

              <div className="pt-2 border-t border-[var(--adm-border)]">
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2">Kapcsolt ügy összegzés</h3>
                {caseSummaries[selected.caseId] ? (
                  <div className="text-xs text-[var(--adm-text-muted)] space-y-1">
                    <p>Dokumentumok: {caseSummaries[selected.caseId].stats.totalDocuments}</p>
                    <p>Review alatt: {caseSummaries[selected.caseId].stats.pendingReview}</p>
                    <p>Jóváhagyott: {caseSummaries[selected.caseId].stats.approvedDocuments}</p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--adm-text-soft)]">Ügy-összegzés nem érhető el.</p>
                )}
              </div>
            </>
          )}

          <div className="pt-2 border-t border-[var(--adm-border)]">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2">Kapcsolt felületek</h3>
            <div className="space-y-1">
              <Link href="/tasks" className="adm-link-button block px-3 py-2 text-xs">Feladatok</Link>
              <Link href="/notifications" className="adm-link-button block px-3 py-2 text-xs">Értesítések</Link>
              <Link href="/documents/compare" className="adm-link-button block px-3 py-2 text-xs">Verzió-összevetés</Link>
              <Link href="/cases" className="adm-link-button block px-3 py-2 text-xs">Ügylista</Link>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

