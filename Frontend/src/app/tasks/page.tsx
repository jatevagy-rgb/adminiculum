"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  completeTask,
  blockTask,
  createTask,
  getCaseCollaborators,
  getCaseSummary,
  getCaseWorkItems,
  getCases,
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
  type User,
} from "@/lib/api";

type LedgerTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  assignedTo?: { id: string; name: string; role?: string } | null;
  workflowCategory?: string;
  urgency?: string;
  capabilities?: CaseWorkItemCapabilities;
  sourceHref?: string | null;
  case: {
    id: string;
    caseNumber: string;
    clientName: string;
    matterType: string;
    title?: string;
  };
};

const TASK_TYPES = [
  { value: "CONTRACT_REVIEW", label: "Szerződés ellenőrzése" },
  { value: "CONTRACT_DRAFTING", label: "Szerződés szerkesztése" },
  { value: "DOCUMENT_TRANSLATION", label: "Dokumentum fordítás" },
  { value: "LEGAL_RESEARCH", label: "Jogi kutatás" },
  { value: "CLIENT_COMMUNICATION", label: "Ügyfélkommunikáció" },
  { value: "ADMIN_SUPPORT", label: "Adminisztratív támogatás" },
];

const priorityChip: Record<string, string> = {
  URGENT: "bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)] border-[#FCA5A5]",
  HIGH: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  MEDIUM: "bg-[#EDE9FE] text-[#5B21B6] border-[#C4B5FD]",
  LOW: "bg-[var(--adm-sage-100)] text-[var(--adm-green-800)] border-[#BFD1C3]",
};

const statusChip: Record<string, string> = {
  TODO: "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]",
  ASSIGNED: "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]",
  PENDING: "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]",
  IN_PROGRESS: "bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]",
  IN_REVIEW: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  SUBMITTED: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  REVIEW_NEEDED: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  REVIEW_SUBMITTED: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  DONE: "bg-[var(--adm-sage-100)] text-[var(--adm-green-800)] border-[#A6C0AF]",
  COMPLETED: "bg-[var(--adm-sage-100)] text-[var(--adm-green-800)] border-[#A6C0AF]",
  APPROVED: "bg-[var(--adm-sage-100)] text-[var(--adm-green-800)] border-[#A6C0AF]",
  FINALIZED: "bg-[var(--adm-sage-100)] text-[var(--adm-green-800)] border-[#A6C0AF]",
  REJECTED: "bg-[var(--adm-terracotta-100)] text-[#991B1B] border-[#FCA5A5]",
  DECLINED: "bg-[var(--adm-terracotta-100)] text-[#991B1B] border-[#FCA5A5]",
  BLOCKED: "bg-[var(--adm-terracotta-100)] text-[#991B1B] border-[#FCA5A5]",
  CANCELLED: "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]",
  ARCHIVED: "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]",
};

const statusLabel: Record<string, string> = {
  TODO: "Teendő",
  ASSIGNED: "Teendő",
  PENDING: "Teendő",
  IN_PROGRESS: "Folyamatban",
  IN_REVIEW: "Review alatt",
  SUBMITTED: "Beküldve",
  REVIEW_NEEDED: "Review alatt",
  REVIEW_SUBMITTED: "Beküldve",
  DONE: "Kész",
  COMPLETED: "Kész",
  APPROVED: "Jóváhagyva",
  FINALIZED: "Kész",
  REJECTED: "Visszaküldve",
  DECLINED: "Visszaküldve",
  BLOCKED: "Blokkolva",
  CANCELLED: "Törölve",
  ARCHIVED: "Archivált",
};

const priorityLabel: Record<string, string> = {
  URGENT: "Magas",
  HIGH: "Magas",
  MEDIUM: "Közepes",
  LOW: "Alacsony",
};

export default function TasksPage() {
  return (
    <AuthenticatedApp section="tasks">
      <TasksPageContent />
    </AuthenticatedApp>
  );
}

function TasksPageContent() {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<LedgerTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const deepLinkedTaskId = searchParams ? searchParams.get("taskId") ?? null : null;
  const [selectedCaseSummary, setSelectedCaseSummary] = useState<CaseSummaryResponse | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [caseCollaborators, setCaseCollaborators] = useState<CaseCollaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [caseFilter, setCaseFilter] = useState("all");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [createData, setCreateData] = useState<CreateTaskData>({
    caseId: "",
    title: "",
    type: "CONTRACT_REVIEW",
    priority: "MEDIUM",
    description: "",
    dueDate: "",
    assignedTo: "",
  });

  const loadTasksWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [casesResponse, usersResponse] = await Promise.all([getCases(1, 200), getUsers()]);
      const caseList = casesResponse.data;
      setCases(caseList);
      setUsers(usersResponse);

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
            sourceHref: task.source?.href || null,
            assignedTo: task.assignee
              ? {
                  id: task.assignee.id,
                  name: task.assignee.displayName,
                  role: undefined,
                }
              : null,
            case: {
              id: caseItem.id,
              caseNumber: caseItem.caseNumber,
              clientName: caseItem.clientName,
              matterType: caseItem.matterType,
              title: caseItem.title,
            },
          })) as LedgerTask[];
        })
      );

      const mergedById = new Map<string, LedgerTask>();
      tasksByCase.flat().forEach((task) => {
        if (!mergedById.has(task.id)) {
          mergedById.set(task.id, task);
        }
      });

      const flattened = Array.from(mergedById.values())
        .sort((a, b) => {
          const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
          return (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
        });

      setTasks(flattened);
      if (deepLinkedTaskId && flattened.some((t) => t.id === deepLinkedTaskId)) {
        setSelectedTaskId(deepLinkedTaskId);
      } else if (flattened.length > 0 && !selectedTaskId) {
        setSelectedTaskId(flattened[0].id);
      }
    } catch (err) {
      console.error("Failed to load task workstation:", err);
      setError("A feladatlista most nem érhető el.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedTaskId, deepLinkedTaskId]);

  useEffect(() => {
    loadTasksWorkspace();
  }, [loadTasksWorkspace]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  // Deep-link focus: which task was opened via /tasks?taskId=..., and whether it loaded.
  const deepLinkedTask = useMemo(
    () => (deepLinkedTaskId ? tasks.find((task) => task.id === deepLinkedTaskId) ?? null : null),
    [tasks, deepLinkedTaskId],
  );
  const deepLinkMissing = Boolean(deepLinkedTaskId) && !isLoading && !deepLinkedTask;
  const deepLinkRowRef = useRef<HTMLTableRowElement | null>(null);
  const deepLinkScrolledRef = useRef(false);
  useEffect(() => {
    if (deepLinkedTask && deepLinkRowRef.current && !deepLinkScrolledRef.current) {
      deepLinkRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      deepLinkScrolledRef.current = true;
    }
  }, [deepLinkedTask]);

  const selectedCreateCase = useMemo(
    () => cases.find((caseItem) => caseItem.id === createData.caseId) ?? null,
    [cases, createData.caseId]
  );

  useEffect(() => {
    const loadSummaryAndCollaborators = async () => {
      if (!selectedTask?.case?.id) {
        setSelectedCaseSummary(null);
        setCaseCollaborators([]);
        return;
      }
      try {
        const [summary, collaborators] = await Promise.all([
          getCaseSummary(selectedTask.case.id),
          getCaseCollaborators(selectedTask.case.id).catch(() => [] as CaseCollaborator[]),
        ]);
        setSelectedCaseSummary(summary);
        setCaseCollaborators(collaborators);
      } catch {
        setSelectedCaseSummary(null);
        setCaseCollaborators([]);
      }
    };
    loadSummaryAndCollaborators();
  }, [selectedTask?.case?.id]);

  // Load collaborators when case selection changes in create modal
  useEffect(() => {
    if (!createData.caseId) {
      setCaseCollaborators([]);
      return;
    }
    setCollaboratorsLoading(true);
    getCaseCollaborators(createData.caseId)
      .then((collabs) => setCaseCollaborators(collabs))
      .catch(() => setCaseCollaborators([]))
      .finally(() => setCollaboratorsLoading(false));
  }, [createData.caseId]);

  const filteredTasks = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const isOpenTask = !["DONE", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(String(task.status || "").toUpperCase());
      const statusMatch = statusFilter === "all" || (statusFilter === "OPEN" ? isOpenTask : task.status === statusFilter);
      const priorityMatch = priorityFilter === "all" || task.priority === priorityFilter;
      const assigneeMatch =
        assigneeFilter === "all" ||
        (assigneeFilter === "unassigned" && !task.assignedTo) ||
        task.assignedTo?.id === assigneeFilter;
      const caseMatch = caseFilter === "all" || task.case.id === caseFilter;
      const searchMatch =
        !normalized ||
        task.title.toLowerCase().includes(normalized) ||
        (task.description || "").toLowerCase().includes(normalized) ||
        task.case.caseNumber.toLowerCase().includes(normalized) ||
        (task.case.clientName || "").toLowerCase().includes(normalized);
      return statusMatch && priorityMatch && assigneeMatch && caseMatch && searchMatch;
    });
  }, [tasks, search, statusFilter, priorityFilter, assigneeFilter, caseFilter]);

  const taskEntrypointStats = useMemo(() => {
    const isOpen = (status?: string) => !["DONE", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(String(status || "").toUpperCase());
    const openTasks = tasks.filter((task) => isOpen(task.status));
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const dueToday = openTasks.filter((task) => {
      if (!task.dueDate) return false;
      const due = new Date(task.dueDate);
      return due.getTime() >= todayStart.getTime() && due.getTime() < tomorrowStart.getTime();
    }).length;

    return {
      openTasks: openTasks.length,
      unassignedTasks: openTasks.filter((task) => !task.assignedTo).length,
      dueToday,
    };
  }, [tasks]);

  const runTaskAction = async (taskId: string, action: "start" | "submit" | "approve" | "reject" | "block" | "unblock") => {
    setIsActionLoading(taskId + action);
    try {
      if (action === "start") await startTask(taskId);
      if (action === "submit") await submitTask(taskId);
      if (action === "approve") await completeTask(taskId, true);
      if (action === "reject") await completeTask(taskId, false);
      if (action === "block") await blockTask(taskId, "DEPENDENCY");
      if (action === "unblock") await unblockTask(taskId);
      await loadTasksWorkspace();
    } catch (err) {
      console.error("Task action failed:", err);
      alert("A feladatművelet sikertelen.");
    } finally {
      setIsActionLoading(null);
    }
  };

  const getDueBadge = (dueDate?: string | null) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    if (due.getTime() < todayStart.getTime()) {
      return { label: "lejárt", className: "text-[var(--adm-terracotta-700)]" };
    }
    if (due.getTime() >= todayStart.getTime() && due.getTime() < tomorrowStart.getTime()) {
      return { label: "ma esedékes", className: "text-[#B45309]" };
    }
    return { label: "határidős", className: "text-[var(--adm-green-800)]" };
  };

  const handleReassign = async (taskId: string, newAssigneeId: string) => {
    if (!newAssigneeId) return;
    setIsActionLoading(taskId + "reassign");
    try {
      await reassignTask(taskId, newAssigneeId);
      await loadTasksWorkspace();
    } catch (err) {
      console.error("Task reassignment failed:", err);
      alert("Az átadás sikertelen.");
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCreateTask = async () => {
    if (!createData.caseId || !createData.title.trim() || !createData.type) {
      alert("Az ügy, cím és típus kötelező.");
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
        caseId: "",
        title: "",
        type: "CONTRACT_REVIEW",
        priority: "MEDIUM",
        description: "",
        dueDate: "",
        assignedTo: "",
      });
      await loadTasksWorkspace();
    } catch (err) {
      console.error("Task creation failed:", err);
      alert("A feladat létrehozása sikertelen.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex min-h-0">
      <main className="flex-1 overflow-y-auto adm-board-page">
        <div className="adm-board-container max-w-[1320px]">
          <div className="adm-board-hero mb-4 flex items-center justify-between gap-4 p-4">
            <div>
              <p className="adm-kicker">Operatív munkasor</p>
              <h1 className="mt-1 font-serif text-[32px] leading-tight text-[var(--adm-text)]">Feladatok és határidők</h1>
              <p className="text-xs text-[var(--adm-text-muted)] mt-1">{filteredTasks.length} feladat a szűrés szerint</p>
              <p className="text-[10px] text-[var(--adm-text-soft)] mt-1">Operatív munkasor: teendők, review alatti elemek és határidős feladatok.</p>
              {deepLinkedTask ? (
                <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-sand-300)] bg-[var(--adm-sand-100)] px-2.5 py-1 text-[11px] text-[var(--adm-text)]">
                  <span className="font-bold uppercase tracking-[0.12em] text-[#6B4B14]">Megnyitott feladat</span>
                  <span className="font-semibold">{deepLinkedTask.title}</span>
                  <span className="text-[var(--adm-text-muted)]">· {deepLinkedTask.case.caseNumber}</span>
                </p>
              ) : deepLinkMissing ? (
                <p className="mt-2 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2.5 py-1 text-[11px] text-[var(--adm-text-muted)]">
                  A hivatkozott feladat nem szerepel a betöltött listában — lehet, hogy lezárult, vagy másik felelőshöz tartozik.
                </p>
              ) : null}
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-[var(--adm-radius-sm)] px-4 py-2 bg-[var(--adm-green-950)] text-white text-xs uppercase tracking-[0.2em] hover:bg-[#243D2D]"
            >
              + Új feladat
            </button>
          </div>

          <section className="adm-board-panel-tight mb-4 grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Home Office feladatindító</p>
              <h2 className="mt-1 font-serif text-xl font-medium text-[var(--adm-text)]">Itt válaszd ki a következő operatív lépést</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--adm-text-muted)]">
                A feladatlista valós ügyhöz kötött teendőket mutat, munkaprioritás szerint rendezve. A határidőket és az ügyvédi kontextust továbbra is külön kell mérlegelni.
              </p>
              <div className="adm-board-tabs mt-3 text-[11px] text-[var(--adm-text-muted)]">
                <span className="adm-board-tab adm-board-tab-active">Nyitott: {taskEntrypointStats.openTasks}</span>
                <span className="adm-board-tab">Nincs felelős: {taskEntrypointStats.unassignedTasks}</span>
                <span className="adm-board-tab">Ma esedékes: {taskEntrypointStats.dueToday}</span>
              </div>
            </div>
            <div className="adm-board-rail p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Gyors folytatás</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--adm-ivory-100)]/75">Válassz feladatot a jobb oldali kontextushoz, vagy nyisd meg az ügylistát, ha ügyből indulnál.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/cases" className="rounded adm-board-panel-tight px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">Ügyek megnyitása</Link>
                <Link href="/documents/compare" className="rounded adm-board-panel-tight px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">Dokumentum-review</Link>
              </div>
            </div>
          </section>

          {isLoading ? (
            <div className="adm-board-empty text-xs text-[var(--adm-text-muted)]">Feladatok betöltése...</div>
          ) : error ? (
            <div className="adm-board-empty border-[var(--adm-terracotta-100)] bg-[var(--adm-terracotta-100)]">
              <p className="font-serif text-lg text-[#7A2F2F]">{error}</p>
              <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Próbáld újra, vagy indulj egy meglévő ügyből.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={loadTasksWorkspace} className="rounded border border-[#8B3A3A] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#8B3A3A] hover:bg-[#FFF0ED]">Újrapróbálás</button>
                <button onClick={() => setShowCreateModal(true)} className="rounded bg-[var(--adm-green-950)] px-3 py-1.5 text-[11px] font-semibold text-white">Új feladat</button>
                <Link href="/cases" className="rounded adm-board-panel-tight px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">Ügyek megnyitása</Link>
              </div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="adm-board-empty space-y-2 text-xs text-[var(--adm-text-muted)]">
              <p className="font-serif text-lg text-[var(--adm-text)]">{tasks.length === 0 ? "Nincs betöltött feladat." : "Nincs találat a kiválasztott szűrőkkel."}</p>
              <p>{tasks.length === 0 ? "Új feladat létrehozásához válassz ügyet, majd add meg a feladat címét és határidejét." : "Módosítsd a szűrőket, vagy nyisd meg az ügylistát másik munkafolyamat választásához."}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={() => setShowCreateModal(true)} className="rounded bg-[var(--adm-green-950)] px-3 py-1.5 text-[11px] font-semibold text-white">Új feladat</button>
                <Link href="/cases" className="rounded adm-board-panel-tight px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">Ügyek megnyitása</Link>
              </div>
            </div>
          ) : (
            <div className="adm-board-panel-tight overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[var(--adm-ivory-100)] border-b border-[var(--adm-border)]">
                  <tr className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">
                    <th className="px-4 py-3">Feladat</th>
                    <th className="px-4 py-3">Ügy</th>
                    <th className="px-4 py-3">Prioritás</th>
                    <th className="px-4 py-3">Határidő</th>
                    <th className="px-4 py-3">Felelős</th>
                    <th className="px-4 py-3">Státusz</th>
                    <th className="px-4 py-3">Művelet</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => {
                    const isDeepLinked = task.id === deepLinkedTaskId;
                    return (
                    <tr
                      key={task.id}
                      ref={isDeepLinked ? deepLinkRowRef : undefined}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`border-b border-[var(--adm-border)] cursor-pointer ${
                        isDeepLinked
                          ? "bg-[var(--adm-sand-100)] shadow-[inset_4px_0_0_var(--adm-ochre-500)]"
                          : selectedTaskId === task.id
                            ? "bg-[var(--adm-surface)]"
                            : "hover:bg-[var(--adm-surface)]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[var(--adm-text)]">{task.title}</p>
                        <p className="text-[11px] text-[var(--adm-text-muted)] truncate max-w-[280px]">{task.description || "Nincs leírás"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--adm-text-muted)]">{task.case.caseNumber}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] uppercase px-2 py-1 border ${priorityChip[task.priority] || priorityChip.MEDIUM}`}>
                          {priorityLabel[String(task.priority || "").toUpperCase()] || "Közepes"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--adm-text-muted)]">
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString("hu-HU") : "Nincs határidő"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--adm-text-muted)]">{task.assignedTo?.name || "Nincs hozzárendelve"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] uppercase px-2 py-1 border ${statusChip[String(task.status || "").toUpperCase()] || statusChip.TODO}`}>
                          {statusLabel[String(task.status || "").toUpperCase()] || "Ismeretlen állapot"}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {task.capabilities?.canStart && (
                          <button
                            onClick={() => runTaskAction(task.id, "start")}
                            disabled={isActionLoading === task.id + "start"}
                            className="text-[10px] px-2 py-1 bg-[var(--adm-green-950)] text-white"
                          >
                            Indítás
                          </button>
                        )}
                        {task.capabilities?.canSubmitForReview && (
                          <button
                            onClick={() => runTaskAction(task.id, "submit")}
                            disabled={isActionLoading === task.id + "submit"}
                            className="text-[10px] px-2 py-1 bg-[#B45309] text-white"
                          >
                            Beküldés
                          </button>
                        )}
                        {(task.capabilities?.canApprove || task.capabilities?.canReturnForCorrection) && (
                          <div className="flex gap-1">
                            {task.capabilities?.canApprove && (
                              <button
                                onClick={() => runTaskAction(task.id, "approve")}
                                disabled={isActionLoading === task.id + "approve"}
                                className="text-[10px] px-2 py-1 bg-[#059669] text-white"
                              >
                                Jóváhagy
                              </button>
                            )}
                            {task.capabilities?.canReturnForCorrection && (
                              <button
                                onClick={() => runTaskAction(task.id, "reject")}
                                disabled={isActionLoading === task.id + "reject"}
                                className="text-[10px] px-2 py-1 bg-[#DC2626] text-white"
                              >
                                Visszaad
                              </button>
                            )}
                          </div>
                        )}
                        {task.capabilities?.canBlock && (
                          <button
                            onClick={() => runTaskAction(task.id, "block")}
                            disabled={isActionLoading === task.id + "block"}
                            className="ml-1 text-[10px] px-2 py-1 border border-[#DC2626] text-[#991B1B]"
                          >
                            Blokkol
                          </button>
                        )}
                        {task.capabilities?.canUnblock && (
                          <button
                            onClick={() => runTaskAction(task.id, "unblock")}
                            disabled={isActionLoading === task.id + "unblock"}
                            className="ml-1 text-[10px] px-2 py-1 bg-[#059669] text-white"
                          >
                            Felold
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <aside className="w-80 bg-white overflow-y-auto">
        <div className="p-4 space-y-5">
          <div>
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2">Feladat kontextus</h2>
            {!selectedTask ? (
              <p className="text-xs text-[var(--adm-text-soft)]">Válassz feladatot a részletekhez.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--adm-text)]">{selectedTask.title}</p>
                <p className="text-xs text-[var(--adm-text-muted)]">{selectedTask.description || "Nincs részletes leírás"}</p>
                        <p className="text-[11px] text-[var(--adm-text-muted)]">Prioritás: {priorityLabel[String(selectedTask.priority || "").toUpperCase()] || "Közepes"}</p>
                        <p className="text-[11px] text-[var(--adm-text-muted)]">Státusz: {statusLabel[String(selectedTask.status || "").toUpperCase()] || "Ismeretlen állapot"}</p>
                        <p className="text-[11px] text-[var(--adm-text-muted)]">
                          Határidő: {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString("hu-HU") : "Nincs határidő"}
                        </p>
                        {(() => {
                          const dueBadge = getDueBadge(selectedTask.dueDate);
                          if (!dueBadge) return null;
                          return <p className={`text-[11px] font-semibold ${dueBadge.className}`}>{dueBadge.label}</p>;
                        })()}
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mt-3">
                  Átadás
                  <select
                    onChange={(e) => handleReassign(selectedTask.id, e.target.value)}
                    className="mt-1 w-full px-2 py-2 border border-[var(--adm-border)] text-xs"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Felelős kiválasztása
                    </option>
                    {caseCollaborators.length > 0 && (
                      <>
                        <option value="" disabled className="text-[#8B5CF6] font-medium">— Résztvevők —</option>
                        {caseCollaborators.map((collab) => (
                          <option key={collab.id} value={collab.user.id}>
                            {collab.user.name}
                          </option>
                        ))}
                        <option value="" disabled>— Többi felhasználó —</option>
                      </>
                    )}
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  {caseCollaborators.length > 0 && (
                    <p className="text-[10px] text-[#8B5CF6] mt-0.5">
                      {caseCollaborators.length} résztvevő az ügyön
                    </p>
                  )}
                </label>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--adm-border)] pt-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2">Kapcsolt ügy</h3>
            {!selectedTask ? (
              <p className="text-xs text-[var(--adm-text-soft)]">Nincs kiválasztott ügy.</p>
            ) : (
              <div className="space-y-2">
                <Link href={`/cases/${selectedTask.case.id}`} className="text-sm font-semibold text-[var(--adm-text)] hover:text-[var(--adm-ochre-500)]">
                  {selectedTask.case.caseNumber}
                </Link>
                <p className="text-xs text-[var(--adm-text-muted)]">{selectedTask.case.clientName || "Ismeretlen ügyfél"}</p>
                <p className="text-xs text-[var(--adm-text-muted)]">{selectedTask.case.matterType || "Nincs ügytípus"}</p>
                {selectedCaseSummary ? (
                  <div className="mt-2 p-2 bg-[var(--adm-ivory-100)] border border-[var(--adm-border)]">
                    <p className="text-[11px] text-[var(--adm-text-muted)]">Dokumentumok: {selectedCaseSummary.stats.totalDocuments}</p>
                    <p className="text-[11px] text-[var(--adm-text-muted)]">Ellenőrzés alatt: {selectedCaseSummary.stats.pendingReview}</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--adm-text-soft)]">Ügy-összegzés nem érhető el.</p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--adm-border)] pt-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2">Friss ügyesemények</h3>
            {!selectedCaseSummary?.last5TimelineEvents?.length ? (
              <p className="text-xs text-[var(--adm-text-soft)]">Nincs megjeleníthető idővonal-esemény.</p>
            ) : (
              <div className="space-y-2">
                {selectedCaseSummary.last5TimelineEvents.slice(0, 4).map((item) => (
                  <div key={item.id} className="p-2 border border-[var(--adm-border)]">
                    <p className="text-[11px] font-semibold text-[var(--adm-text)]">{item.type}</p>
                    <p className="text-[10px] text-[var(--adm-text-muted)]">{new Date(item.createdAt).toLocaleString("hu-HU")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--adm-border)] pt-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2">Kapcsolt munkafolyamatok</h3>
            <div className="space-y-1">
              <Link href="/reviews" className="adm-link-button block px-3 py-2 text-xs">Review sor</Link>
              <Link href="/notifications" className="adm-link-button block px-3 py-2 text-xs">Értesítések</Link>
              <Link
                href={selectedTask ? `/documents/compare?caseId=${encodeURIComponent(selectedTask.case.id)}` : "/documents/compare"}
                className="adm-link-button block px-3 py-2 text-xs"
              >
                Szerződés-workspace
              </Link>
              <Link
                href={selectedTask ? `/cases/${selectedTask.case.id}/documents` : "/cases"}
                className="adm-link-button block px-3 py-2 text-xs"
              >
                Dokumentumtár
              </Link>
              <Link
                href={selectedTask ? `/cases/${selectedTask.case.id}/communications` : "/cases"}
                className="adm-link-button block px-3 py-2 text-xs"
              >
                Kommunikáció
              </Link>
              <Link
                href={selectedTask ? `/cases/${selectedTask.case.id}/handoff` : "/cases"}
                className="adm-link-button block px-3 py-2 text-xs"
              >
                Leadási csomag
              </Link>
              <Link href="/time-entries" className="adm-link-button block px-3 py-2 text-xs">Munkaórák</Link>
            </div>
          </div>
        </div>
      </aside>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg border border-[var(--adm-border)]">
            <div className="px-6 py-4 border-b border-[var(--adm-border)]">
              <h2 className="text-lg font-serif text-[var(--adm-text)]">Új feladat</h2>
            </div>
            <div className="p-6 space-y-4">
              <label className="block text-xs text-[var(--adm-text-muted)]">
                Ügy *
                <select
                  value={createData.caseId}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, caseId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[var(--adm-border)] text-sm"
                >
                  <option value="">Válassz ügyet</option>
                  {cases.map((caseItem) => (
                    <option key={caseItem.id} value={caseItem.id}>
                      {caseItem.caseNumber} · {caseItem.clientName}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-[var(--adm-text-soft)]">
                  Az ügy kiválasztása határozza meg az ügyfélkörnyezetet.
                </span>
                {selectedCreateCase?.clientName && (
                  <span className="mt-1 block text-[10px] font-semibold text-[var(--adm-text-muted)]">
                    Kapcsolt ügyfél: {selectedCreateCase.clientName}
                  </span>
                )}
              </label>

              <label className="block text-xs text-[var(--adm-text-muted)]">
                Cím *
                <input
                  value={createData.title}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[var(--adm-border)] text-sm"
                  placeholder="Feladat címe"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-[var(--adm-text-muted)]">
                  Típus *
                  <select
                    value={createData.type}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, type: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-[var(--adm-border)] text-sm"
                  >
                    {TASK_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-[var(--adm-text-muted)]">
                  Prioritás
                  <select
                    value={createData.priority}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, priority: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-[var(--adm-border)] text-sm"
                  >
                    <option value="LOW">Alacsony</option>
                    <option value="MEDIUM">Közepes</option>
                    <option value="HIGH">Magas</option>
                    <option value="URGENT">Sürgős</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-[var(--adm-text-muted)]">
                  Határidő
                  <input
                    type="date"
                    value={createData.dueDate || ""}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, dueDate: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-[var(--adm-border)] text-sm"
                  />
                </label>
                <label className="block text-xs text-[var(--adm-text-muted)]">
                  Felelős
                  {collaboratorsLoading ? (
                    <span className="mt-1 w-full px-3 py-2 border border-[var(--adm-border)] text-xs text-[var(--adm-text-soft)] block">
                      Résztvevők betöltése...
                    </span>
                  ) : (
                    <select
                      value={createData.assignedTo || ""}
                      onChange={(e) => setCreateData((prev) => ({ ...prev, assignedTo: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-[var(--adm-border)] text-sm"
                    >
                      <option value="">Nincs hozzárendelve</option>
                      {caseCollaborators.length > 0 && (
                        <>
                          <option value="" disabled className="text-[#8B5CF6] font-medium">— Résztvevők —</option>
                          {caseCollaborators.map((collab) => (
                            <option key={collab.id} value={collab.user.id}>
                              {collab.user.name}
                            </option>
                          ))}
                          <option value="" disabled>— Többi felhasználó —</option>
                        </>
                      )}
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {caseCollaborators.length > 0 && !collaboratorsLoading && (
                    <p className="text-[10px] text-[#8B5CF6] mt-0.5">
                      {caseCollaborators.length} résztvevő az ügyön — előnyben részesítve
                    </p>
                  )}
                </label>
              </div>

              <label className="block text-xs text-[var(--adm-text-muted)]">
                Leírás
                <textarea
                  value={createData.description || ""}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[var(--adm-border)] text-sm"
                  rows={3}
                  placeholder="Feladat részletei"
                />
              </label>
            </div>
            <div className="px-6 py-4 border-t border-[var(--adm-border)] flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-[var(--adm-border)] text-xs uppercase tracking-[0.2em] text-[var(--adm-text-muted)]"
                disabled={isSaving}
              >
                Mégsem
              </button>
              <button
                onClick={handleCreateTask}
                className="px-4 py-2 bg-[var(--adm-green-950)] text-white text-xs uppercase tracking-[0.2em]"
                disabled={isSaving}
              >
                {isSaving ? "Mentés..." : "Létrehozás"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

