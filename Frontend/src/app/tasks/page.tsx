"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CompactState, OperationalPageHeader } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { TaskSubmissionWorkspace } from "@/components/tasks/TaskSubmissionWorkspace";
import { WorkflowDialog } from "@/components/tasks/WorkflowDialog";
import {
  createTask,
  getCases,
  getCurrentUser,
  getUsers,
  startTask,
  type CaseListItem,
  type CreateTaskData,
  type CurrentUser,
  type User,
} from "@/lib/api";
import { listTaskLifecycleItems, type TaskLifecycleListItem } from "@/lib/taskLifecycleApi";
import {
  formatDate,
  nextActionLabel,
  PRIORITY_LABELS,
  submissionLabelFromItem,
  taskStatusLabel,
  taskWorkflowErrorMessage,
} from "@/lib/taskWorkflowPresentation";

type QuickFilter = "all" | "overdue" | "review" | "returned";

const TASK_TYPES = [
  { value: "CONTRACT_REVIEW", label: "Szerződés ellenőrzése" },
  { value: "CONTRACT_DRAFTING", label: "Szerződés szerkesztése" },
  { value: "DOCUMENT_TRANSLATION", label: "Dokumentum fordítás" },
  { value: "LEGAL_RESEARCH", label: "Jogi kutatás" },
  { value: "CLIENT_COMMUNICATION", label: "Ügyfélkommunikáció" },
  { value: "ADMIN_SUPPORT", label: "Adminisztratív támogatás" },
];

const CLOSED_TASK_STATUSES = new Set(["DONE", "COMPLETED", "CANCELLED"]);

function isOpen(item: TaskLifecycleListItem): boolean {
  return !CLOSED_TASK_STATUSES.has(String(item.status).toUpperCase());
}

function isOverdue(item: TaskLifecycleListItem): boolean {
  if (!item.dueDate || !isOpen(item)) return false;
  const due = new Date(item.dueDate);
  return !Number.isNaN(due.getTime()) && due.getTime() < new Date().setHours(0, 0, 0, 0);
}

function statusTone(status?: string | null): "green" | "gold" | "burgundy" | "neutral" | "blue" {
  const value = String(status || "").toUpperCase();
  if (["DONE", "COMPLETED"].includes(value)) return "green";
  if (["IN_REVIEW", "SUBMITTED"].includes(value)) return "gold";
  if (["BLOCKED", "RETURNED"].includes(value)) return "burgundy";
  if (value === "IN_PROGRESS") return "blue";
  return "neutral";
}

function submissionTone(status?: string | null): "green" | "gold" | "burgundy" | "neutral" | "blue" {
  const value = String(status || "").toUpperCase();
  if (value === "APPROVED") return "green";
  if (value === "SUBMITTED") return "gold";
  if (value === "RETURNED") return "burgundy";
  if (value === "DRAFT") return "blue";
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
  const [currentUser, setCurrentUser] = useState<CurrentUser>({ id: "", email: "", name: "Én", role: "" });
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<TaskLifecycleListItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(deepLinkedTaskId);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [search, setSearch] = useState("");
  const [caseFilter, setCaseFilter] = useState(deepLinkedCaseId || "all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
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
    setError(null);
    try {
      const [taskRows, caseResponse, userResponse, me] = await Promise.all([
        listTaskLifecycleItems(),
        getCases(1, 200),
        getUsers(),
        getCurrentUser(),
      ]);
      setTasks(taskRows);
      setCases(caseResponse.data);
      setUsers(userResponse);
      setCurrentUser(me);
      if (deepLinkedTaskId && taskRows.some((task) => task.id === deepLinkedTaskId)) setSelectedTaskId(deepLinkedTaskId);
    } catch (loadError) {
      setError(taskWorkflowErrorMessage(loadError));
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
    if (deepLinkedTaskId && selectedTask && focusedRowRef.current) focusedRowRef.current.scrollIntoView({ block: "center" });
  }, [deepLinkedTaskId, selectedTask]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("hu-HU");
    return tasks
      .filter((task) => {
        const submissionStatus = String(task.submissionStatus || "").toUpperCase();
        if (quickFilter === "overdue" && !isOverdue(task)) return false;
        if (quickFilter === "review" && submissionStatus !== "SUBMITTED") return false;
        if (quickFilter === "returned" && submissionStatus !== "RETURNED") return false;
        if (caseFilter !== "all" && task.case.id !== caseFilter) return false;
        if (statusFilter === "open" && !isOpen(task)) return false;
        if (statusFilter !== "all" && statusFilter !== "open" && String(task.status).toUpperCase() !== statusFilter) return false;
        if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
        if (!query) return true;
        return `${task.title} ${task.description || ""} ${task.case.caseNumber} ${task.case.clientName} ${task.case.matterType}`.toLocaleLowerCase("hu-HU").includes(query);
      })
      .sort((left, right) => {
        if (isOverdue(left) !== isOverdue(right)) return isOverdue(left) ? -1 : 1;
        const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
        return leftDue !== rightDue ? leftDue - rightDue : left.title.localeCompare(right.title, "hu-HU");
      });
  }, [caseFilter, priorityFilter, quickFilter, search, statusFilter, tasks]);

  const counts = useMemo(() => ({
    all: tasks.length,
    overdue: tasks.filter(isOverdue).length,
    review: tasks.filter((task) => String(task.submissionStatus || "").toUpperCase() === "SUBMITTED").length,
    returned: tasks.filter((task) => String(task.submissionStatus || "").toUpperCase() === "RETURNED").length,
  }), [tasks]);

  const primaryAction = (task: TaskLifecycleListItem) => {
    const label = nextActionLabel(task.nextActionCode);
    if (!label) return { kind: "none" as const, label: "Nincs biztonságos művelet" };
    if (task.nextActionCode === "START_TASK") return { kind: "start" as const, label };
    if (task.nextActionCode === "OPEN_REVIEW" && task.currentSubmittedRevisionId) {
      return { kind: "review" as const, label, href: `/reviews?taskId=${encodeURIComponent(task.id)}&submissionId=${encodeURIComponent(task.currentSubmittedRevisionId)}` };
    }
    return { kind: "workspace" as const, label };
  };

  const startSelectedTask = async (task: TaskLifecycleListItem) => {
    setBusyTaskId(task.id);
    setError(null);
    try {
      await startTask(task.id);
      setSelectedTaskId(task.id);
      await loadTasks();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleCreateTask = async () => {
    if (!createData.caseId || !createData.title.trim() || !createData.type) {
      setError("Az ügy, a cím és a típus kötelező.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await createTask({ ...createData, dueDate: createData.dueDate || undefined, assignedTo: createData.assignedTo || undefined });
      setShowCreateModal(false);
      setCreateData({ caseId: deepLinkedCaseId || "", title: "", type: "CONTRACT_REVIEW", priority: "MEDIUM", description: "", dueDate: "", assignedTo: "" });
      await loadTasks();
    } catch (createError) {
      setError(taskWorkflowErrorMessage(createError));
    } finally {
      setIsSaving(false);
    }
  };

  const quickFilters: Array<{ id: QuickFilter; label: string; count: number }> = [
    { id: "all", label: "Összes", count: counts.all },
    { id: "overdue", label: "Lejárt", count: counts.overdue },
    { id: "review", label: "Review alatt", count: counts.review },
    { id: "returned", label: "Visszaküldve", count: counts.returned },
  ];

  return (
    <div className="adm-board-page flex-1 overflow-y-auto">
      <div className="adm-board-container space-y-4">
        <OperationalPageHeader title="Feladatok" count={`${filteredTasks.length} tétel`} subtitle="A feladat állapota és a Leadás revision külön látható; a következő műveletet a backend határozza meg." primaryAction={<AdminButton variant="primary" onClick={() => setShowCreateModal(true)}>Új feladat</AdminButton>} secondaryActions={<Link href="/reviews" className="adm-link-button px-3 py-2 text-[11px]">Review munkatér</Link>} />

        <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">{quickFilters.map((filter) => <button key={filter.id} type="button" onClick={() => setQuickFilter(filter.id)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${quickFilter === filter.id ? "border-[var(--adm-green-800)] bg-[var(--adm-green-800)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text)]"}`}>{filter.label} <span className="ml-1 opacity-70">{filter.count}</span></button>)}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,2fr)_minmax(180px,1fr)_minmax(160px,1fr)_minmax(150px,1fr)]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés feladat, ügy vagy ügyfél szerint" aria-label="Feladatok keresése" className="adm-board-field px-3 py-2 text-[11px]" />
            <select value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)} aria-label="Ügy szűrő" className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden ügy</option>{cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.caseNumber} · {caseItem.clientName}</option>)}</select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Feladatállapot szűrő" className="adm-board-field px-3 py-2 text-[11px]"><option value="open">Nyitott feladatok</option><option value="all">Minden állapot</option><option value="PENDING">Teendő</option><option value="IN_PROGRESS">Folyamatban</option><option value="IN_REVIEW">Review alatt</option><option value="DONE">Lezárva</option></select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Prioritás szűrő" className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden prioritás</option><option value="URGENT">Magas</option><option value="HIGH">Magas</option><option value="MEDIUM">Közepes</option><option value="LOW">Alacsony</option></select>
          </div>
        </section>

        {error ? <div role="alert"><CompactState tone="error" title="A feladatművelet nem fejeződött be." detail={error} action={<AdminButton size="sm" variant="neutral" onClick={() => void loadTasks()}>Adatok újratöltése</AdminButton>} /></div> : null}

        <section className="overflow-hidden rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white">
          {isLoading ? <div className="p-4"><CompactState title="Feladatok betöltése…" /></div> : filteredTasks.length === 0 ? <div className="p-4"><CompactState title={tasks.length === 0 ? "Nincs kijelölt feladat." : "Nincs találat a kiválasztott nézetben."} detail={tasks.length === 0 ? "Új feladat egy meglévő ügyhöz hozható létre." : "Módosítsa a keresést vagy a szűrőket."} action={<AdminButton size="sm" variant="primary" onClick={() => setShowCreateModal(true)}>Új feladat</AdminButton>} /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left">
                <thead className="border-b border-[var(--adm-border)] bg-[var(--adm-surface)]"><tr className="text-[10px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]"><th scope="col" className="px-3 py-2.5">Feladat</th><th scope="col" className="px-3 py-2.5">Ügy / ügyfél</th><th scope="col" className="px-3 py-2.5">Felelős</th><th scope="col" className="px-3 py-2.5">Prioritás</th><th scope="col" className="px-3 py-2.5">Határidő</th><th scope="col" className="px-3 py-2.5">Állapot</th><th scope="col" className="px-3 py-2.5">Leadás</th><th scope="col" className="px-3 py-2.5 text-right">Következő lépés</th></tr></thead>
                <tbody className="divide-y divide-[var(--adm-border)]">{filteredTasks.map((task) => { const action = primaryAction(task); return <tr key={task.id} ref={task.id === deepLinkedTaskId ? focusedRowRef : undefined} className={selectedTaskId === task.id ? "bg-[var(--adm-sand-100)]/45" : "hover:bg-[var(--adm-surface)]"}><td className="px-3 py-3"><button type="button" onClick={() => setSelectedTaskId(task.id)} className="max-w-[290px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><span className="block truncate text-[13px] font-semibold text-[var(--adm-text)]">{task.title}</span>{task.description ? <span className="mt-1 block truncate text-[11px] text-[var(--adm-text-muted)]">{task.description}</span> : null}</button></td><td className="px-3 py-3 text-[11px]"><Link href={`/cases/${task.case.id}`} className="font-semibold text-[var(--adm-text)] hover:underline">{task.case.caseNumber}</Link><span className="mt-1 block max-w-[180px] truncate text-[var(--adm-text-muted)]">{task.case.clientName} · {task.case.matterType}</span></td><td className="px-3 py-3 text-[11px] text-[var(--adm-text-muted)]">{task.assignedToId === currentUser?.id ? currentUser.name || "Én" : task.assignedToId ? "Kijelölt felelős" : "Nincs felelős"}</td><td className="px-3 py-3 text-[11px] font-semibold">{PRIORITY_LABELS[task.priority] || "Közepes"}</td><td className={`px-3 py-3 text-[11px] ${isOverdue(task) ? "font-semibold text-[var(--adm-terracotta-700)]" : "text-[var(--adm-text-muted)]"}`}>{formatDate(task.dueDate)}</td><td className="px-3 py-3"><AdminStatusPill tone={statusTone(task.status)}>{taskStatusLabel(task.status)}</AdminStatusPill></td><td className="px-3 py-3"><AdminStatusPill tone={submissionTone(task.submissionStatus)}>{submissionLabelFromItem(task)}</AdminStatusPill>{task.assignedReviewer?.displayName ? <span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">Reviewer: {task.assignedReviewer.displayName}</span> : null}</td><td className="px-3 py-3 text-right">{action.kind === "start" ? <AdminButton size="sm" variant="primary" disabled={busyTaskId === task.id} onClick={() => void startSelectedTask(task)}>{action.label}</AdminButton> : action.kind === "review" ? <Link href={action.href} className="adm-link-button adm-link-button-primary px-3 py-2 text-[11px]">{action.label}</Link> : action.kind === "workspace" ? <AdminButton size="sm" variant={task.nextActionCode === "CONTINUE_RETURNED_WORK" ? "warning" : "neutral"} onClick={() => setSelectedTaskId(task.id)}>{action.label}</AdminButton> : <span className="text-[10px] text-[var(--adm-text-muted)]">{action.label}</span>}</td></tr>; })}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {selectedTask ? <TaskSubmissionWorkspace item={selectedTask} onClose={() => setSelectedTaskId(null)} onWorkflowChanged={loadTasks} /> : null}

      <WorkflowDialog open={showCreateModal} title="Új feladat" description="A feladat egy meglévő ügyhöz kapcsolódik." primaryLabel="Feladat létrehozása" primaryDisabled={!createData.caseId || !createData.title.trim() || !createData.type} busy={isSaving} onClose={() => setShowCreateModal(false)} onConfirm={() => void handleCreateTask()}>
        <div className="space-y-4">
          <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Ügy<select autoFocus value={createData.caseId} onChange={(event) => setCreateData((current) => ({ ...current, caseId: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"><option value="">Válasszon ügyet</option>{cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.caseNumber} · {caseItem.clientName}</option>)}</select></label>
          <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Cím<input value={createData.title} onChange={(event) => setCreateData((current) => ({ ...current, title: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Típus<select value={createData.type} onChange={(event) => setCreateData((current) => ({ ...current, type: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">{TASK_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Prioritás<select value={createData.priority} onChange={(event) => setCreateData((current) => ({ ...current, priority: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"><option value="LOW">Alacsony</option><option value="MEDIUM">Közepes</option><option value="HIGH">Magas</option><option value="URGENT">Magas</option></select></label></div>
          <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Leírás<textarea rows={3} value={createData.description || ""} onChange={(event) => setCreateData((current) => ({ ...current, description: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Határidő<input type="date" value={createData.dueDate || ""} onChange={(event) => setCreateData((current) => ({ ...current, dueDate: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" /></label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Felelős<select value={createData.assignedTo || ""} onChange={(event) => setCreateData((current) => ({ ...current, assignedTo: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"><option value="">Nincs kijelölve</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></div>
        </div>
      </WorkflowDialog>
    </div>
  );
}
