"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { CompactState } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton } from "@/components/adminiculum/ui";
import { Badge, Button, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeaderCell, DataTableRow, EmptyState, PageHeader, QuietLink, StatusChip } from "@/components/ui";
import { TaskSubmissionWorkspace } from "@/components/tasks/TaskSubmissionWorkspace";
import { WorkflowDialog } from "@/components/tasks/WorkflowDialog";
import {
  createTask,
  getCases,
  getCurrentUser,
  getUsers,
  startTask,
  updateTaskAttention,
  type CaseListItem,
  type CreateTaskData,
  type CurrentUser,
  type User,
} from "@/lib/api";
import { listTaskLifecycleItems, type TaskLifecycleListItem } from "@/lib/taskLifecycleApi";
import { TaskPlanningFields, EMPTY_TASK_PLANNING, type TaskPlanningValue } from "@/components/tasks/TaskPlanningFields";
import { getCaseResponsibleCandidates, type CaseResponsibleCandidate } from "@/lib/api";
import { getClientAccentBorderClass } from "@/lib/clientColors";
import {
  ATTENTION_PRESENTATIONS,
  UNCLASSIFIED_LABEL,
  attentionPresentation,
  formatEstimateRange,
  type AttentionCategory,
} from "@/lib/attentionCategory";
import {
  formatDate,
  nextActionLabel,
  PRIORITY_LABELS,
  submissionLabelFromItem,
  taskStatusLabel,
  taskWorkflowErrorMessage,
} from "@/lib/taskWorkflowPresentation";

type QuickFilter = "all" | "overdue" | "review" | "returned";
type AttentionFilter = "all" | AttentionCategory | "UNCLASSIFIED";

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

function attentionTone(category?: AttentionCategory | null): "green" | "gold" | "burgundy" | "neutral" | "blue" {
  if (category === "APPROVAL") return "green";
  if (category === "QUICK_SCAN" || category === "SIGNATURE") return "gold";
  if (category === "DETAILED_REVIEW") return "burgundy";
  if (category === "EDITING") return "blue";
  return "neutral";
}

function canonicalTone(tone: ReturnType<typeof statusTone>): "green" | "gold" | "danger" | "neutral" | "teal" {
  if (tone === "burgundy") return "danger";
  if (tone === "blue") return "teal";
  return tone;
}

function taskEffortText(task: { attentionCategory?: AttentionCategory | null; estimatedMinutes?: number | null }): string {
  if (!task.attentionCategory) return "Nincs becsült idő";
  if (task.estimatedMinutes) return formatEstimateRange(task.estimatedMinutes, task.estimatedMinutes);
  return "Automatikus becslés kategória alapján";
}

function TaskAttentionBadge({ task }: { task: TaskLifecycleListItem }) {
  const category = task.attentionCategory || null;
  const label = category ? attentionPresentation(category).label : UNCLASSIFIED_LABEL;
  return (
    <div className="min-w-[150px]">
      <StatusChip tone={canonicalTone(attentionTone(category))}>{label}</StatusChip>
      <span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">{taskEffortText(task)}</span>
    </div>
  );
}

function TaskAttentionFormFields({
  attentionCategory,
  estimatedMinutes,
  onChange,
}: {
  attentionCategory: AttentionCategory | null;
  estimatedMinutes: number | null;
  onChange: (next: { attentionCategory?: AttentionCategory | null; estimatedMinutes?: number | null }) => void;
}) {
  const explicit = estimatedMinutes != null;
  return (
    <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
          Figyelmi kategória
          <select
            value={attentionCategory || ""}
            onChange={(event) => onChange({ attentionCategory: event.target.value ? event.target.value as AttentionCategory : null })}
            className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
          >
            <option value="">{UNCLASSIFIED_LABEL}</option>
            {ATTENTION_PRESENTATIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
          Becsült idő
          <input
            type="number"
            min={1}
            max={480}
            step={1}
            value={estimatedMinutes ?? ""}
            onChange={(event) => onChange({ estimatedMinutes: event.target.value ? Number(event.target.value) : null })}
            placeholder="Automatikus"
            className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[var(--adm-text-muted)]">
        <span>{explicit ? `Egyedi becslés: ${formatEstimateRange(estimatedMinutes, estimatedMinutes)}` : attentionCategory ? "Automatikus becslés a kategória alapján." : "Nincs besorolva; időt nem becsülünk."}</span>
        {explicit ? <button type="button" onClick={() => onChange({ estimatedMinutes: null })} className="font-semibold text-[var(--adm-blue-700)] hover:underline">Automatikus becslés használata</button> : null}
      </div>
    </div>
  );
}

function TaskAttentionEditor({ task, onSaved }: { task: TaskLifecycleListItem; onSaved: () => Promise<void> }) {
  const [attentionCategory, setAttentionCategory] = useState<AttentionCategory | null>(task.attentionCategory || null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(task.estimatedMinutes ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setAttentionCategory(task.attentionCategory || null);
    setEstimatedMinutes(task.estimatedMinutes ?? null);
    setMessage(null);
  }, [task.id, task.attentionCategory, task.estimatedMinutes]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateTaskAttention(task.id, { attentionCategory, estimatedMinutes });
      setMessage("Figyelmi besorolás mentve.");
      await onSaved();
    } catch (error) {
      setMessage(taskWorkflowErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="fixed bottom-4 left-4 z-40 w-[min(420px,calc(100vw-2rem))] rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-3 shadow-[var(--adm-shadow-lg)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="adm-kicker text-[var(--adm-blue-700)]">Feladat munkaterhelés</p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--adm-text)]">{task.title}</h3>
        </div>
        <AdminButton size="sm" variant="primary" disabled={saving} onClick={() => void save()}>{saving ? "Mentés…" : "Mentés"}</AdminButton>
      </div>
      <div className="mt-3">
        <TaskAttentionFormFields attentionCategory={attentionCategory} estimatedMinutes={estimatedMinutes} onChange={(next) => {
          if ("attentionCategory" in next) setAttentionCategory(next.attentionCategory ?? null);
          if ("estimatedMinutes" in next) setEstimatedMinutes(next.estimatedMinutes ?? null);
        }} />
      </div>
      {message ? <p className="mt-2 text-[10.5px] text-[var(--adm-text-muted)]">{message}</p> : null}
    </aside>
  );
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
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>(() => {
    const raw = searchParams?.get("attentionCategory") || "all";
    if (raw === "UNCLASSIFIED") return raw;
    return ATTENTION_PRESENTATIONS.some((item) => item.value === raw) ? raw as AttentionCategory : "all";
  });
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
    attentionCategory: null,
    estimatedMinutes: null,
  });
  const [taskPlanning, setTaskPlanning] = useState<TaskPlanningValue>(EMPTY_TASK_PLANNING);
  const focusedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Case-scoped planning candidates: when a case is selected, reviewer/
  // collaborator/assignee options come from the authoritative backend projection.
  const [caseCandidates, setCaseCandidates] = useState<CaseResponsibleCandidate[]>([]);
  useEffect(() => {
    if (!createData.caseId) {
      setCaseCandidates([]);
      return;
    }
    let active = true;
    getCaseResponsibleCandidates(createData.caseId)
      .then((result) => { if (active) setCaseCandidates(result.items); })
      .catch(() => { if (active) setCaseCandidates([]); });
    return () => { active = false; };
  }, [createData.caseId]);
  const planningUsers = createData.caseId ? caseCandidates : users;
  const duplicatePlanningNames = useMemo(() => new Set(planningUsers.filter((candidate, _index, all) => all.filter((other) => other.name === candidate.name).length > 1).map((candidate) => candidate.name)), [planningUsers]);

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
        if (attentionFilter === "UNCLASSIFIED" && task.attentionCategory) return false;
        if (attentionFilter !== "all" && attentionFilter !== "UNCLASSIFIED" && task.attentionCategory !== attentionFilter) return false;
        if (!query) return true;
        return `${task.title} ${task.description || ""} ${task.case.caseNumber} ${task.case.clientName} ${task.case.matterType}`.toLocaleLowerCase("hu-HU").includes(query);
      })
      .sort((left, right) => {
        if (isOverdue(left) !== isOverdue(right)) return isOverdue(left) ? -1 : 1;
        const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
        return leftDue !== rightDue ? leftDue - rightDue : left.title.localeCompare(right.title, "hu-HU");
      });
  }, [attentionFilter, caseFilter, priorityFilter, quickFilter, search, statusFilter, tasks]);

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
      await createTask({
        ...createData,
        dueDate: createData.dueDate || undefined,
        assignedTo: createData.assignedTo || undefined,
        estimatedMinutes: createData.estimatedMinutes ?? null,
        taskDefinitionId: taskPlanning.taskDefinitionId,
        taskTypeLabel: taskPlanning.taskTypeLabel,
        saveToCatalogue: taskPlanning.saveToCatalogue,
        plannedReviewerId: taskPlanning.plannedReviewerId,
        collaboratorUserIds: taskPlanning.collaboratorUserIds.length ? taskPlanning.collaboratorUserIds : undefined,
      });
      setShowCreateModal(false);
      setTaskPlanning(EMPTY_TASK_PLANNING);
      setCreateData({ caseId: deepLinkedCaseId || "", title: "", type: "CONTRACT_REVIEW", priority: "MEDIUM", description: "", dueDate: "", assignedTo: "", attentionCategory: null, estimatedMinutes: null });
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
    <div className="min-h-screen bg-white text-[#1F2937]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader title="Feladatok" badge={<Badge tone="neutral">{filteredTasks.length} tétel</Badge>} primaryAction={<Button variant="primary" onClick={() => setShowCreateModal(true)}>Új feladat</Button>} actions={<QuietLink href="/reviews">Review munkatér</QuietLink>} />

        <section className="rounded-[12px] border border-[#E5E7E6] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">{quickFilters.map((filter) => <Button key={filter.id} size="sm" variant={quickFilter === filter.id ? "primary" : "neutral"} aria-pressed={quickFilter === filter.id} onClick={() => setQuickFilter(filter.id)}>{filter.label} <span className="ml-1 opacity-70">{filter.count}</span></Button>)}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,2fr)_minmax(180px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(170px,1fr)]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés feladat, ügy vagy ügyfél szerint" aria-label="Feladatok keresése" className="h-10 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]" />
            <select value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)} aria-label="Ügy szűrő" className="h-10 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]"><option value="all">Minden ügy</option>{cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.caseNumber} · {caseItem.clientName}</option>)}</select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Feladatállapot szűrő" className="h-10 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]"><option value="open">Nyitott feladatok</option><option value="all">Minden állapot</option><option value="PENDING">Teendő</option><option value="IN_PROGRESS">Folyamatban</option><option value="IN_REVIEW">Review alatt</option><option value="DONE">Lezárva</option></select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Prioritás szűrő" className="h-10 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]"><option value="all">Minden prioritás</option><option value="URGENT">Magas</option><option value="HIGH">Magas</option><option value="MEDIUM">Közepes</option><option value="LOW">Alacsony</option></select>
            <select value={attentionFilter} onChange={(event) => setAttentionFilter(event.target.value as AttentionFilter)} aria-label="Figyelmi kategória szűrő" className="h-10 rounded-[8px] border border-[#E5E7E6] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32]"><option value="all">Minden figyelmi kategória</option>{ATTENTION_PRESENTATIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}<option value="UNCLASSIFIED">{UNCLASSIFIED_LABEL}</option></select>
          </div>
        </section>

        {error ? <div role="alert"><CompactState tone="error" title="A feladatművelet nem fejeződött be." detail={error} action={<AdminButton size="sm" variant="neutral" onClick={() => void loadTasks()}>Adatok újratöltése</AdminButton>} /></div> : null}

        <section>
          {isLoading ? <div className="rounded-[12px] border border-[#E5E7E6] bg-white p-4"><CompactState title="Feladatok betöltése…" /></div> : filteredTasks.length === 0 ? <div className="rounded-[12px] border border-[#E5E7E6] bg-white p-4"><EmptyState title={tasks.length === 0 ? "Nincs kijelölt feladat." : "Nincs találat a kiválasztott nézetben."} description={tasks.length === 0 ? "Új feladat egy meglévő ügyhöz hozható létre." : "Módosítsa a keresést vagy a szűrőket."} action={<Button size="sm" variant="secondary" onClick={() => setShowCreateModal(true)}>Új feladat</Button>} /></div> : (
            <DataTable minWidth={1180}>
              <DataTableHead><tr><DataTableHeaderCell>Feladat</DataTableHeaderCell><DataTableHeaderCell>Ügy / ügyfél</DataTableHeaderCell><DataTableHeaderCell>Felelős</DataTableHeaderCell><DataTableHeaderCell>Figyelmi munka</DataTableHeaderCell><DataTableHeaderCell>Prioritás</DataTableHeaderCell><DataTableHeaderCell>Határidő</DataTableHeaderCell><DataTableHeaderCell>Állapot</DataTableHeaderCell><DataTableHeaderCell>Leadás</DataTableHeaderCell><DataTableHeaderCell align="right">Következő lépés</DataTableHeaderCell></tr></DataTableHead>
              <DataTableBody>
                  {filteredTasks.map((task) => {
                    const action = primaryAction(task);
                    return (
                      <DataTableRow key={task.id} ref={task.id === deepLinkedTaskId ? focusedRowRef : undefined} selected={selectedTaskId === task.id}>
                        <DataTableCell className={`border-l-[5px] ${getClientAccentBorderClass(task.case.clientColorKey)}`}>
                          <button type="button" onClick={() => setSelectedTaskId(task.id)} className="max-w-[290px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                            <span className="block truncate font-semibold text-[#1F2937]">{task.title}</span>
                            {task.description ? <span className="mt-1 block truncate text-xs text-[#6B7280]">{task.description}</span> : null}
                          </button>
                        </DataTableCell>
                        <DataTableCell>
                          <QuietLink href={`/cases/${task.case.id}`} size="sm">{task.case.caseNumber}</QuietLink>
                          <span className="mt-1 block max-w-[180px] truncate text-xs text-[#6B7280]">{task.case.clientName} · {task.case.matterType}</span>
                        </DataTableCell>
                        <DataTableCell muted>{task.assignedToId === currentUser?.id ? currentUser.name || "Én" : task.assignedToId ? "Kijelölt felelős" : "Nincs felelős"}</DataTableCell>
                        <DataTableCell>
                          <TaskAttentionBadge task={task} />
                        </DataTableCell>
                        <DataTableCell className="font-semibold">{PRIORITY_LABELS[task.priority] || "Közepes"}</DataTableCell>
                        <DataTableCell className={isOverdue(task) ? "font-semibold text-[#B85C4B]" : "text-[#6B7280]"}>{formatDate(task.dueDate)}</DataTableCell>
                        <DataTableCell><StatusChip tone={canonicalTone(statusTone(task.status))}>{taskStatusLabel(task.status)}</StatusChip></DataTableCell>
                        <DataTableCell>
                          <StatusChip tone={canonicalTone(submissionTone(task.submissionStatus))}>{submissionLabelFromItem(task)}</StatusChip>
                          {task.assignedReviewer?.displayName ? <span className="mt-1 block text-xs text-[#6B7280]">Reviewer: {task.assignedReviewer.displayName}</span> : null}
                        </DataTableCell>
                        <DataTableCell align="right">
                          {action.kind === "start" ? <Button size="sm" variant="primary" disabled={busyTaskId === task.id} onClick={() => void startSelectedTask(task)}>{action.label}</Button> : action.kind === "review" ? <QuietLink href={action.href} size="sm">{action.label}</QuietLink> : action.kind === "workspace" ? <Button size="sm" variant={task.nextActionCode === "CONTINUE_RETURNED_WORK" ? "accent" : "neutral"} onClick={() => setSelectedTaskId(task.id)}>{action.label}</Button> : <span className="text-xs text-[#6B7280]">{action.label}</span>}
                        </DataTableCell>
                      </DataTableRow>
                    );
                  })}
              </DataTableBody>
            </DataTable>
          )}
        </section>
      </main>

      {selectedTask ? <TaskAttentionEditor task={selectedTask} onSaved={loadTasks} /> : null}
      {selectedTask ? <TaskSubmissionWorkspace item={selectedTask} onClose={() => setSelectedTaskId(null)} onWorkflowChanged={loadTasks} /> : null}

      <WorkflowDialog open={showCreateModal} title="Új feladat" description="A feladat egy meglévő ügyhöz kapcsolódik." primaryLabel="Feladat létrehozása" primaryDisabled={!createData.caseId || !createData.title.trim() || !createData.type} busy={isSaving} onClose={() => setShowCreateModal(false)} onConfirm={() => void handleCreateTask()}>
        <div className="space-y-4">
          <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Ügy<select autoFocus value={createData.caseId} onChange={(event) => { setCreateData((current) => ({ ...current, caseId: event.target.value, assignedTo: "" })); setTaskPlanning(EMPTY_TASK_PLANNING); }} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"><option value="">Válasszon ügyet</option>{cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.caseNumber} · {caseItem.clientName}</option>)}</select></label>
          <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Cím<input value={createData.title} onChange={(event) => setCreateData((current) => ({ ...current, title: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Típus<select value={createData.type} onChange={(event) => setCreateData((current) => ({ ...current, type: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">{TASK_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Prioritás<select value={createData.priority} onChange={(event) => setCreateData((current) => ({ ...current, priority: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"><option value="LOW">Alacsony</option><option value="MEDIUM">Közepes</option><option value="HIGH">Magas</option><option value="URGENT">Magas</option></select></label></div>
          <TaskAttentionFormFields attentionCategory={createData.attentionCategory ?? null} estimatedMinutes={createData.estimatedMinutes ?? null} onChange={(next) => setCreateData((current) => ({ ...current, ...next }))} />
          <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Leírás<textarea rows={3} value={createData.description || ""} onChange={(event) => setCreateData((current) => ({ ...current, description: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Határidő<input type="date" value={createData.dueDate || ""} onChange={(event) => setCreateData((current) => ({ ...current, dueDate: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" /></label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Felelős<select value={createData.assignedTo || ""} onChange={(event) => setCreateData((current) => ({ ...current, assignedTo: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"><option value="">Nincs kijelölve</option>{planningUsers.map((user) => <option key={user.id} value={user.id}>{user.name}{duplicatePlanningNames.has(user.name) && user.email ? ` · ${user.email}` : ""}</option>)}</select></label></div>
          <TaskPlanningFields
            clientId={cases.find((c) => c.id === createData.caseId)?.clientId || null}
            users={planningUsers}
            assigneeId={createData.assignedTo || null}
            value={taskPlanning}
            onChange={(next) => setTaskPlanning((current) => ({ ...current, ...next }))}
          />
        </div>
      </WorkflowDialog>
    </div>
  );
}
