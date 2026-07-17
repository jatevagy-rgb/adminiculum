"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CompactState, OperationalPageHeader, QuietLink, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import {
  blockTask,
  completeTask,
  createTask,
  getCaseCollaborators,
  getCaseSummary,
  getCaseWorkItems,
  getCases,
  getCurrentUser,
  getUsers,
  reassignTask,
  startTask,
  submitTask,
  unblockTask,
  type CaseCollaborator,
  type CaseListItem,
  type CaseSummaryResponse,
  type CaseWorkItemCapabilities,
  type CreateTaskData,
  type CurrentUser,
  type User,
} from "@/lib/api";

type LedgerTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  assignedTo?: { id: string; name: string } | null;
  workflowCategory?: string;
  urgency?: string;
  capabilities?: CaseWorkItemCapabilities;
  source?: {
    type?: "DOCUMENT" | "COMMUNICATION" | "DEADLINE" | "CASE" | null;
    id?: string | null;
    displayName?: string | null;
    href?: string | null;
  } | null;
  case: {
    id: string;
    caseNumber: string;
    clientName: string;
    matterType: string;
    title?: string;
  };
};

type QuickFilter = "all" | "mine" | "overdue" | "review";

const TASK_TYPES = [
  { value: "CONTRACT_REVIEW", label: "Szerződés ellenőrzése" },
  { value: "CONTRACT_DRAFTING", label: "Szerződés szerkesztése" },
  { value: "DOCUMENT_TRANSLATION", label: "Dokumentum fordítás" },
  { value: "LEGAL_RESEARCH", label: "Jogi kutatás" },
  { value: "CLIENT_COMMUNICATION", label: "Ügyfélkommunikáció" },
  { value: "ADMIN_SUPPORT", label: "Adminisztratív támogatás" },
];

const statusLabel: Record<string, string> = {
  TODO: "Teendő",
  ASSIGNED: "Teendő",
  PENDING: "Teendő",
  IN_PROGRESS: "Folyamatban",
  IN_REVIEW: "Review alatt",
  UNDER_REVIEW: "Review alatt",
  SUBMITTED: "Beküldve",
  REVIEW_NEEDED: "Review alatt",
  REVIEW_SUBMITTED: "Beküldve",
  DONE: "Kész",
  COMPLETED: "Kész",
  APPROVED: "Jóváhagyva",
  FINALIZED: "Kész",
  REJECTED: "Visszaküldve",
  DECLINED: "Visszaküldve",
  BLOCKED: "Elakadt",
  CANCELLED: "Törölve",
  ARCHIVED: "Archivált",
};

const priorityLabel: Record<string, string> = {
  URGENT: "Magas",
  HIGH: "Magas",
  MEDIUM: "Közepes",
  LOW: "Alacsony",
};

const closedStatuses = new Set(["DONE", "COMPLETED", "APPROVED", "FINALIZED", "CANCELLED", "ARCHIVED"]);

function isOpen(status?: string | null) {
  return !closedStatuses.has(String(status || "").toUpperCase());
}

function isOverdue(task: LedgerTask) {
  if (!task.dueDate || !isOpen(task.status)) return false;
  const due = new Date(task.dueDate);
  return !Number.isNaN(due.getTime()) && due.getTime() < new Date().setHours(0, 0, 0, 0);
}

function isReview(task: LedgerTask) {
  const status = String(task.status || "").toUpperCase();
  return ["IN_REVIEW", "UNDER_REVIEW", "SUBMITTED", "REVIEW_NEEDED", "REVIEW_SUBMITTED"].includes(status) || task.workflowCategory === "REVIEW";
}

function matchesStatusGroup(task: LedgerTask, filter: string) {
  const status = String(task.status || "").toUpperCase();
  if (filter === "open") return isOpen(status);
  if (filter === "in_progress") return status === "IN_PROGRESS";
  if (filter === "submitted") return status === "SUBMITTED" || status === "REVIEW_SUBMITTED";
  if (filter === "review") return ["IN_REVIEW", "UNDER_REVIEW", "REVIEW_NEEDED"].includes(status);
  if (filter === "closed") return closedStatuses.has(status);
  if (filter === "blocked") return status === "BLOCKED";
  return true;
}

function matchesDueWindow(task: LedgerTask, filter: string) {
  if (filter === "all") return true;
  if (filter === "none") return !task.dueDate;
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  if (filter === "overdue") return dueDay < start && isOpen(task.status);
  if (filter === "today") return dueDay === start;
  if (filter === "week") return dueDay >= start && dueDay < start + 7 * 24 * 60 * 60 * 1000;
  return true;
}

function taskAttentionLabel(task: LedgerTask) {
  if (isOverdue(task)) return "Lejárt";
  if (isReview(task)) return "Review szükséges";
  if (["URGENT", "HIGH"].includes(String(task.priority).toUpperCase())) return "Kiemelt";
  return "Normál";
}

function taskSubmissionLabel(task: LedgerTask) {
  const status = String(task.status || "").toUpperCase();
  if (["SUBMITTED", "IN_REVIEW", "UNDER_REVIEW", "REVIEW_NEEDED", "REVIEW_SUBMITTED"].includes(status)) return "Leadva, review-ra vár";
  if (closedStatuses.has(status)) return "Lezárt";
  if (status === "IN_PROGRESS") return "Folyamatban";
  if (status === "BLOCKED") return "Elakadt";
  return "Még nincs leadás";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("hu-HU");
}

function taskStatusTone(status?: string): "green" | "gold" | "amber" | "burgundy" | "neutral" | "blue" {
  const value = String(status || "").toUpperCase();
  if (["DONE", "COMPLETED", "APPROVED", "FINALIZED"].includes(value)) return "green";
  if (["IN_REVIEW", "SUBMITTED", "REVIEW_NEEDED", "REVIEW_SUBMITTED"].includes(value)) return "gold";
  if (value === "BLOCKED" || value === "REJECTED") return "burgundy";
  if (value === "IN_PROGRESS") return "blue";
  return "neutral";
}

export default function TasksPage() {
  return (
    <AuthenticatedApp section="tasks">
      <TasksPageContent />
    </AuthenticatedApp>
  );
}

function TasksPageContent() {
  const searchParams = useSearchParams();
  const deepLinkedTaskId = searchParams?.get("taskId") || null;
  const deepLinkedCaseId = searchParams?.get("caseId") || null;
  const openCreateFromQuery = searchParams?.get("newTask") === "1";

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<LedgerTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(deepLinkedTaskId);
  const [selectedCaseSummary, setSelectedCaseSummary] = useState<CaseSummaryResponse | null>(null);
  const [caseCollaborators, setCaseCollaborators] = useState<CaseCollaborator[]>([]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [caseFilter, setCaseFilter] = useState(deepLinkedCaseId || "all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusGroupFilter, setStatusGroupFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [createData, setCreateData] = useState<CreateTaskData>({
    caseId: deepLinkedCaseId || "",
    title: "",
    type: "CONTRACT_REVIEW",
    priority: "MEDIUM",
    description: "",
    dueDate: "",
    assignedTo: "",
  });
  const focusedRowRef = useRef<HTMLTableRowElement | null>(null);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const [caseResponse, userResponse, me] = await Promise.all([getCases(1, 200), getUsers(), getCurrentUser()]);
      const caseList = caseResponse.data;
      const tasksByCase = await Promise.all(
        caseList.map(async (caseItem) => {
          const workItems = await getCaseWorkItems(caseItem.id).catch(() => null);
          return (workItems?.items || [])
            .filter((item) => item.type === "TASK")
            .map((task) => ({
              id: task.id,
              title: task.title,
              description: task.safeDescription ?? null,
              status: task.status,
              priority: task.priority || "MEDIUM",
              dueDate: task.dueAt ?? null,
              workflowCategory: task.workflowCategory,
              urgency: task.urgency,
              capabilities: task.capabilities,
              source: task.source,
              assignedTo: task.assignee ? { id: task.assignee.id, name: task.assignee.displayName } : null,
              case: {
                id: caseItem.id,
                caseNumber: caseItem.caseNumber,
                clientName: caseItem.clientName,
                matterType: caseItem.matterType,
                title: caseItem.title,
              },
            })) as LedgerTask[];
        }),
      );
      const merged = new Map<string, LedgerTask>();
      tasksByCase.flat().forEach((task) => merged.set(task.id, task));
      setCases(caseList);
      setUsers(userResponse);
      setCurrentUser(me);
      setTasks(Array.from(merged.values()));
      if (deepLinkedTaskId && merged.has(deepLinkedTaskId)) setSelectedTaskId(deepLinkedTaskId);
    } catch (loadError) {
      console.error("Failed to load tasks:", loadError);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [deepLinkedTaskId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (openCreateFromQuery) setShowCreateModal(true);
  }, [openCreateFromQuery]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) || null, [selectedTaskId, tasks]);

  useEffect(() => {
    if (!selectedTask) {
      setSelectedCaseSummary(null);
      setCaseCollaborators([]);
      return;
    }
    Promise.all([
      getCaseSummary(selectedTask.case.id).catch(() => null),
      getCaseCollaborators(selectedTask.case.id).catch(() => [] as CaseCollaborator[]),
    ]).then(([summary, collaborators]) => {
      setSelectedCaseSummary(summary);
      setCaseCollaborators(collaborators);
    });
  }, [selectedTask]);

  useEffect(() => {
    if (deepLinkedTaskId && selectedTask && focusedRowRef.current) {
      focusedRowRef.current.scrollIntoView({ block: "center" });
    }
  }, [deepLinkedTaskId, selectedTask]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("hu-HU");
    return tasks
      .filter((task) => {
        if (quickFilter === "mine" && task.assignedTo?.id !== currentUser?.id) return false;
        if (quickFilter === "overdue" && !isOverdue(task)) return false;
        if (quickFilter === "review" && !isReview(task)) return false;
        if (clientFilter !== "all" && task.case.clientName !== clientFilter) return false;
        if (caseFilter !== "all" && task.case.id !== caseFilter) return false;
        if (assigneeFilter !== "all" && (task.assignedTo?.id || "unassigned") !== assigneeFilter) return false;
        if (!matchesStatusGroup(task, statusGroupFilter)) return false;
        if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
        if (!matchesDueWindow(task, dueFilter)) return false;
        if (reviewFilter === "required" && !isReview(task)) return false;
        if (reviewFilter === "none" && isReview(task)) return false;
        if (!query) return true;
        return `${task.title} ${task.description || ""} ${task.case.caseNumber} ${task.case.clientName}`
          .toLocaleLowerCase("hu-HU")
          .includes(query);
      })
      .sort((left, right) => {
        if (isOverdue(left) !== isOverdue(right)) return isOverdue(left) ? -1 : 1;
        if (left.dueDate && right.dueDate) return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
        return left.title.localeCompare(right.title, "hu-HU");
      });
  }, [assigneeFilter, caseFilter, clientFilter, currentUser?.id, dueFilter, priorityFilter, quickFilter, reviewFilter, search, statusGroupFilter, tasks]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      mine: tasks.filter((task) => task.assignedTo?.id === currentUser?.id && isOpen(task.status)).length,
      overdue: tasks.filter(isOverdue).length,
      review: tasks.filter(isReview).length,
    }),
    [currentUser?.id, tasks],
  );

  const runAction = async (task: LedgerTask, action: "start" | "submit" | "approve" | "return" | "block" | "unblock") => {
    setBusyKey(`${task.id}:${action}`);
    try {
      if (action === "start") await startTask(task.id);
      if (action === "submit") await submitTask(task.id);
      if (action === "approve") await completeTask(task.id, true);
      if (action === "return") await completeTask(task.id, false);
      if (action === "block") await blockTask(task.id, "DEPENDENCY");
      if (action === "unblock") await unblockTask(task.id);
      await loadTasks();
    } catch (actionError) {
      console.error("Task action failed:", actionError);
      window.alert("A feladatművelet nem hajtható végre.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleReassign = async (task: LedgerTask, userId: string) => {
    if (!userId) return;
    setBusyKey(`${task.id}:reassign`);
    try {
      await reassignTask(task.id, userId);
      await loadTasks();
    } catch (actionError) {
      console.error("Task reassignment failed:", actionError);
      window.alert("Az átadás nem hajtható végre.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreateTask = async () => {
    if (!createData.caseId || !createData.title.trim() || !createData.type) {
      window.alert("Az ügy, a cím és a típus kötelező.");
      return;
    }
    setIsSaving(true);
    try {
      await createTask({
        ...createData,
        dueDate: createData.dueDate || undefined,
        assignedTo: createData.assignedTo || undefined,
      });
      setShowCreateModal(false);
      setCreateData({
        caseId: deepLinkedCaseId || "",
        title: "",
        type: "CONTRACT_REVIEW",
        priority: "MEDIUM",
        description: "",
        dueDate: "",
        assignedTo: "",
      });
      await loadTasks();
    } catch (createError) {
      console.error("Task creation failed:", createError);
      window.alert("A feladat létrehozása sikertelen.");
    } finally {
      setIsSaving(false);
    }
  };

  const primaryActionFor = (task: LedgerTask) => {
    if (task.capabilities?.canStart) return { label: "Indítás", action: "start" as const };
    if (task.capabilities?.canSubmitForReview) return { label: "Review-ra küldés", action: "submit" as const };
    if (task.capabilities?.canApprove) return { label: "Jóváhagyás", action: "approve" as const };
    if (task.capabilities?.canReturnForCorrection) return { label: "Visszaküldés", action: "return" as const };
    if (task.capabilities?.canUnblock) return { label: "Feloldás", action: "unblock" as const };
    return null;
  };

  const quickFilters: Array<{ id: QuickFilter; label: string; count: number }> = [
    { id: "all", label: "Összes", count: counts.all },
    { id: "mine", label: "Saját", count: counts.mine },
    { id: "overdue", label: "Lejárt", count: counts.overdue },
    { id: "review", label: "Review", count: counts.review },
  ];
  const clientNames = useMemo(() => Array.from(new Set(tasks.map((task) => task.case.clientName).filter(Boolean))).sort((left, right) => left.localeCompare(right, "hu-HU")), [tasks]);
  const assigneeOptions = useMemo(() => Array.from(new Map(tasks.filter((task) => task.assignedTo).map((task) => [task.assignedTo!.id, task.assignedTo!])).values()).sort((left, right) => left.name.localeCompare(right.name, "hu-HU")), [tasks]);

  return (
    <div className="min-h-full bg-[var(--adm-ivory-50)] p-4 lg:p-5">
      <div className="mx-auto max-w-[1440px] space-y-3">
        <OperationalPageHeader
          title="Feladatok és határidők"
          primaryAction={<AdminButton variant="primary" onClick={() => setShowCreateModal(true)}>Új feladat</AdminButton>}
        />

        <section className="flex flex-col gap-2 border border-[var(--adm-border)] bg-white p-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1">
            {quickFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setQuickFilter(filter.id)}
                className={`px-3 py-2 text-[11px] font-semibold ${quickFilter === filter.id ? "bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)]" : "bg-[var(--adm-surface)] text-[var(--adm-text)] hover:bg-[var(--adm-sand-100)]"}`}
              >
                {filter.label} <span className="ml-1 opacity-70">{filter.count}</span>
              </button>
            ))}
          </div>
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:ml-3 xl:grid-cols-4">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Feladat, ügy vagy ügyfél keresése" className="adm-board-field min-w-0 px-3 py-2 text-[11px]" />
            <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">
              <option value="all">Minden ügyfél</option>
              {clientNames.map((clientName) => <option key={clientName} value={clientName}>{clientName}</option>)}
            </select>
            <select value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">
              <option value="all">Minden ügy</option>
              {cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.caseNumber}</option>)}
            </select>
            <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">
              <option value="all">Minden felelős</option>
              <option value="unassigned">Nincs felelős</option>
              {assigneeOptions.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
            </select>
            <select value={statusGroupFilter} onChange={(event) => setStatusGroupFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">
              <option value="all">Minden státusz</option>
              <option value="open">Nyitott</option>
              <option value="in_progress">Folyamatban</option>
              <option value="submitted">Leadott</option>
              <option value="review">Jóváhagyásra vár</option>
              <option value="blocked">Elakadt</option>
              <option value="closed">Lezárt</option>
            </select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">
              <option value="all">Minden prioritás</option>
              <option value="URGENT">Magas</option>
              <option value="HIGH">Magas</option>
              <option value="MEDIUM">Közepes</option>
              <option value="LOW">Alacsony</option>
            </select>
            <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">
              <option value="all">Minden határidő</option>
              <option value="overdue">Lejárt</option>
              <option value="today">Ma</option>
              <option value="week">Következő 7 nap</option>
              <option value="none">Nincs határidő</option>
            </select>
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">
              <option value="all">Minden review állapot</option>
              <option value="required">Review szükséges</option>
              <option value="none">Nem vár review-ra</option>
            </select>
          </div>
        </section>

        {error ? <SafePanelError onRetry={() => void loadTasks()} /> : null}

        <div className={`grid min-h-0 gap-3 ${selectedTask ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
          <section className="min-w-0 overflow-hidden border border-[var(--adm-border)] bg-white">
            {isLoading ? (
              <div className="p-4"><CompactState title="Feladatok betöltése…" /></div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-4">
                <CompactState
                  title={tasks.length === 0 ? "Nincs rögzített feladat." : "Nincs találat a kiválasztott nézetben."}
                  detail={tasks.length === 0 ? "Hozz létre feladatot egy meglévő ügyhöz." : "Módosítsd a szűrőket."}
                  action={<AdminButton size="sm" variant="primary" onClick={() => setShowCreateModal(true)}>Új feladat</AdminButton>}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1210px] text-left">
                  <thead className="border-b border-[var(--adm-border)] bg-[var(--adm-surface)]">
                    <tr className="text-[10px] uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">
                      <th className="px-3 py-2.5">Feladat</th>
                      <th className="px-3 py-2.5">Ügy</th>
                      <th className="px-3 py-2.5">Ügyfél</th>
                      <th className="px-3 py-2.5">Prioritás</th>
                      <th className="px-3 py-2.5">Határidő</th>
                      <th className="px-3 py-2.5">Felelős</th>
                      <th className="px-3 py-2.5">Státusz</th>
                      <th className="px-3 py-2.5">Review / leadás</th>
                      <th className="px-3 py-2.5 text-right">Következő lépés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--adm-border)]">
                    {filteredTasks.map((task) => {
                      const primaryAction = primaryActionFor(task);
                      const active = selectedTaskId === task.id;
                      return (
                        <tr
                          key={task.id}
                          ref={task.id === deepLinkedTaskId ? focusedRowRef : undefined}
                          className={active ? "bg-[var(--adm-sand-100)]/45" : "hover:bg-[var(--adm-surface)]"}
                        >
                          <td className="px-3 py-2.5">
                            <button type="button" onClick={() => setSelectedTaskId(task.id)} className="max-w-[320px] text-left">
                              <span className="block truncate text-[13px] font-semibold text-[var(--adm-text)]">{task.title}</span>
                              {task.description ? <span className="mt-0.5 block truncate text-[10px] text-[var(--adm-text-muted)]">{task.description}</span> : null}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-[var(--adm-text-muted)]">
                            <Link href={`/cases/${task.case.id}`} className="font-semibold text-[var(--adm-text)] hover:underline">{task.case.caseNumber}</Link>
                            {task.case.title ? <span className="mt-0.5 block max-w-[180px] truncate">{task.case.title}</span> : null}
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-[var(--adm-text-muted)]">{task.case.clientName || "Nincs ügyféladat"}</td>
                          <td className="px-3 py-2.5 text-[11px] font-semibold text-[var(--adm-text)]">{priorityLabel[task.priority] || "Közepes"}</td>
                          <td className={`px-3 py-2.5 text-[11px] ${isOverdue(task) ? "font-semibold text-[var(--adm-terracotta-700)]" : "text-[var(--adm-text-muted)]"}`}>{formatDate(task.dueDate)}</td>
                          <td className="px-3 py-2.5 text-[11px] text-[var(--adm-text-muted)]">{task.assignedTo?.name || "Nincs felelős"}</td>
                          <td className="px-3 py-2.5"><AdminStatusPill tone={taskStatusTone(task.status)}>{statusLabel[String(task.status).toUpperCase()] || "Nincs állapotadat"}</AdminStatusPill></td>
                          <td className="px-3 py-2.5 text-[10px] text-[var(--adm-text-muted)]">
                            <span className="block font-semibold text-[var(--adm-text)]">Javasolt: {taskAttentionLabel(task)}</span>
                            <span className="mt-0.5 block">{taskSubmissionLabel(task)}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {primaryAction ? (
                              <AdminButton size="sm" variant="primary" disabled={busyKey === `${task.id}:${primaryAction.action}`} onClick={() => void runAction(task, primaryAction.action)}>
                                {primaryAction.label}
                              </AdminButton>
                            ) : (
                              <AdminButton size="sm" variant="neutral" onClick={() => setSelectedTaskId(task.id)}>Megnyitás</AdminButton>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedTask ? (
            <aside className="self-start border border-[var(--adm-border)] bg-white">
              <div className="flex items-start justify-between border-b border-[var(--adm-border)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Feladat</p>
                  <h2 className="mt-1 text-[15px] font-semibold text-[var(--adm-text)]">{selectedTask.title}</h2>
                </div>
                <button type="button" onClick={() => setSelectedTaskId(null)} className="px-2 text-lg text-[var(--adm-text-muted)]" aria-label="Feladatpanel bezárása">×</button>
              </div>
              <div className="space-y-4 p-4">
                {selectedTask.description ? <p className="text-[12px] leading-5 text-[var(--adm-text-muted)]">{selectedTask.description}</p> : null}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <dt className="text-[var(--adm-text-muted)]">Ügy</dt>
                  <dd className="text-right font-semibold"><Link href={`/cases/${selectedTask.case.id}`} className="hover:underline">{selectedTask.case.caseNumber}</Link></dd>
                  <dt className="text-[var(--adm-text-muted)]">Ügyfél</dt>
                  <dd className="text-right font-semibold">{selectedTask.case.clientName}</dd>
                  <dt className="text-[var(--adm-text-muted)]">Határidő</dt>
                  <dd className="text-right font-semibold">{formatDate(selectedTask.dueDate)}</dd>
                  <dt className="text-[var(--adm-text-muted)]">Felelős</dt>
                  <dd className="text-right font-semibold">{selectedTask.assignedTo?.name || "Nincs felelős"}</dd>
                  <dt className="text-[var(--adm-text-muted)]">Státusz</dt>
                  <dd className="text-right font-semibold">{statusLabel[String(selectedTask.status).toUpperCase()] || "Nincs állapotadat"}</dd>
                  <dt className="text-[var(--adm-text-muted)]">Prioritás</dt>
                  <dd className="text-right font-semibold">{priorityLabel[selectedTask.priority] || "Közepes"}</dd>
                  <dt className="text-[var(--adm-text-muted)]">Javasolt figyelem</dt>
                  <dd className="text-right font-semibold">{taskAttentionLabel(selectedTask)}</dd>
                </dl>

                {selectedTask.source?.type === "COMMUNICATION" ? (
                  <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Kapcsolt kommunikáció</p>
                    <p className="mt-1 truncate text-[11px] font-semibold text-[var(--adm-text)]">{selectedTask.source.displayName || "Kommunikációs forrás"}</p>
                    <div className="mt-2"><QuietLink href={selectedTask.source.href || `/cases/${selectedTask.case.id}/communications`}>Kommunikáció megnyitása</QuietLink></div>
                  </div>
                ) : null}

                <label className="block text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">
                  Átadás
                  <select defaultValue="" onChange={(event) => void handleReassign(selectedTask, event.target.value)} className="adm-board-field mt-2 w-full px-3 py-2 text-[11px]">
                    <option value="" disabled>Felelős kiválasztása</option>
                    {caseCollaborators.map((collaborator) => (
                      <option key={collaborator.id} value={collaborator.user.id}>{collaborator.user.name}</option>
                    ))}
                    {users.filter((user) => !caseCollaborators.some((collaborator) => collaborator.user.id === user.id)).map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap gap-2">
                  {selectedTask.capabilities?.canBlock ? (
                    <AdminButton size="sm" variant="danger" onClick={() => void runAction(selectedTask, "block")}>Elakadtként jelölés</AdminButton>
                  ) : null}
                  {selectedTask.capabilities?.canUnblock ? (
                    <AdminButton size="sm" variant="neutral" onClick={() => void runAction(selectedTask, "unblock")}>Elakadás feloldása</AdminButton>
                  ) : null}
                </div>

                {["SUBMITTED", "IN_REVIEW", "UNDER_REVIEW", "REVIEW_NEEDED", "REVIEW_SUBMITTED", "DONE", "COMPLETED", "APPROVED", "FINALIZED"].includes(String(selectedTask.status).toUpperCase()) ? (
                  <div className="border-t border-[var(--adm-border)] pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Leadás</p>
                    <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">{taskSubmissionLabel(selectedTask)}</p>
                    <div className="mt-3"><QuietLink href={`/cases/${selectedTask.case.id}/handoff`}>Leadás megnyitása</QuietLink></div>
                  </div>
                ) : null}

                <div className="border-t border-[var(--adm-border)] pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Ügykörnyezet</p>
                  <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">
                    {selectedCaseSummary ? `${selectedCaseSummary.stats.totalDocuments} dokumentum · ${selectedCaseSummary.stats.pendingReview} review alatt` : "Az ügyösszegzés jelenleg nem érhető el."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <QuietLink href={`/cases/${selectedTask.case.id}`}>Ügy megnyitása</QuietLink>
                    <QuietLink href={`/cases/${selectedTask.case.id}/documents`}>Dokumentumok</QuietLink>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="create-task-title">
          <div className="w-full max-w-lg border border-[var(--adm-border)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-5 py-4">
              <h2 id="create-task-title" className="font-serif text-[22px] text-[var(--adm-text)]">Új feladat</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-lg text-[var(--adm-text-muted)]" aria-label="Bezárás">×</button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
                Ügy
                <select value={createData.caseId} onChange={(event) => setCreateData((current) => ({ ...current, caseId: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">
                  <option value="">Válassz ügyet</option>
                  {cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.caseNumber} · {caseItem.clientName}</option>)}
                </select>
              </label>
              <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
                Cím
                <input value={createData.title} onChange={(event) => setCreateData((current) => ({ ...current, title: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
                  Típus
                  <select value={createData.type} onChange={(event) => setCreateData((current) => ({ ...current, type: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">
                    {TASK_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
                  Prioritás
                  <select value={createData.priority} onChange={(event) => setCreateData((current) => ({ ...current, priority: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">
                    <option value="LOW">Alacsony</option>
                    <option value="MEDIUM">Közepes</option>
                    <option value="HIGH">Magas</option>
                    <option value="URGENT">Magas</option>
                  </select>
                </label>
              </div>
              <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
                Leírás
                <textarea value={createData.description || ""} onChange={(event) => setCreateData((current) => ({ ...current, description: event.target.value }))} rows={3} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
                  Határidő
                  <input type="date" value={createData.dueDate || ""} onChange={(event) => setCreateData((current) => ({ ...current, dueDate: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" />
                </label>
                <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
                  Felelős
                  <select value={createData.assignedTo || ""} onChange={(event) => setCreateData((current) => ({ ...current, assignedTo: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">
                    <option value="">Nincs kijelölve</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--adm-border)] px-5 py-4">
              <AdminButton variant="neutral" onClick={() => setShowCreateModal(false)}>Mégse</AdminButton>
              <AdminButton variant="primary" disabled={isSaving} onClick={() => void handleCreateTask()}>{isSaving ? "Mentés…" : "Feladat létrehozása"}</AdminButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
