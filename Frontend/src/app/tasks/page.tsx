"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  completeTask,
  createTask,
  getCaseCollaborators,
  getCaseSummary,
  getCases,
  getCaseTasks,
  getUsers,
  reassignTask,
  startTask,
  submitTask,
  getMyTasks,
  type CaseCollaborator,
  type CaseListItem,
  type CaseSummaryResponse,
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
  URGENT: "bg-[#FEF2F2] text-[#B91C1C] border-[#FCA5A5]",
  HIGH: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  MEDIUM: "bg-[#EDE9FE] text-[#5B21B6] border-[#C4B5FD]",
  LOW: "bg-[#EAF0E7] text-[#2C4A35] border-[#BFD1C3]",
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
  DONE: "bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]",
  COMPLETED: "bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]",
  APPROVED: "bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]",
  FINALIZED: "bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]",
  REJECTED: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
  DECLINED: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
  BLOCKED: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
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
      const [casesResponse, usersResponse, myTasks] = await Promise.all([getCases(1, 200), getUsers(), getMyTasks()]);
      const caseList = casesResponse.data;
      setCases(caseList);
      setUsers(usersResponse);

      const myTasksMapped: LedgerTask[] = myTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description ?? null,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate ?? null,
        assignedTo: task.assignedTo
          ? {
              id: task.assignedTo.id,
              name: task.assignedTo.name,
              role: task.assignedTo.role,
            }
          : null,
        case: {
          id: task.case.id,
          caseNumber: task.case.caseNumber,
          clientName: task.case.clientName,
          matterType: task.case.matterType,
          title: undefined,
        },
      }));

      const tasksByCase = await Promise.all(
        caseList.map(async (caseItem) => {
          const caseTasks = await getCaseTasks(caseItem.id).catch(() => [] as any[]);
          return caseTasks.map((task: any) => ({
            id: task.id,
            title: task.title,
            description: task.description ?? null,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate ?? null,
            assignedTo: task.assignedTo
              ? {
                  id: task.assignedTo.id,
                  name: task.assignedTo.name,
                  role: task.assignedTo.role,
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
      [...myTasksMapped, ...tasksByCase.flat()].forEach((task) => {
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
      setError("A feladatok betöltése sikertelen.");
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

  const runTaskAction = async (taskId: string, action: "start" | "submit" | "approve" | "reject") => {
    setIsActionLoading(taskId + action);
    try {
      if (action === "start") await startTask(taskId);
      if (action === "submit") await submitTask(taskId);
      if (action === "approve") await completeTask(taskId, true);
      if (action === "reject") await completeTask(taskId, false);
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
      return { label: "lejárt", className: "text-[#B91C1C]" };
    }
    if (due.getTime() >= todayStart.getTime() && due.getTime() < tomorrowStart.getTime()) {
      return { label: "ma esedékes", className: "text-[#B45309]" };
    }
    return { label: "határidős", className: "text-[#2C4A35]" };
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
      <main className="flex-1 overflow-y-auto border-r border-[#DDD7CA]">
        <div className="max-w-5xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-serif text-[#1F2821]">Feladatok és határidők</h1>
              <p className="text-xs text-[#7B776D] mt-1">{filteredTasks.length} feladat a szűrés szerint</p>
              <p className="text-[10px] text-[#9C9890] mt-1">Operatív munkasor: teendők, review alatti elemek és határidős feladatok.</p>
              {deepLinkedTaskId && (
                <p className="text-[10px] text-[#8B7355] mt-1">Deep-linkelt feladat nézet aktív.</p>
              )}
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-[#1A2E21] text-white text-xs uppercase tracking-[0.2em] hover:bg-[#243D2D]"
            >
              + Új feladat
            </button>
          </div>

          <section className="mb-4 grid gap-3 border border-[#D8CFB6] bg-[#FFFDF7] p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">Home Office feladatindító</p>
              <h2 className="mt-1 font-serif text-xl font-medium text-[#1F2821]">Itt válaszd ki a következő operatív lépést</h2>
              <p className="mt-2 text-xs leading-5 text-[#5F675F]">
                A feladatlista valós ügyhöz kötött teendőket mutat, munkaprioritás szerint rendezve. A határidőket és az ügyvédi kontextust továbbra is külön kell mérlegelni.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#514D45]">
                <span className="rounded-full border border-[#D8CFB6] bg-white px-3 py-1">Nyitott feladatok: {taskEntrypointStats.openTasks}</span>
                <span className="rounded-full border border-[#D8CFB6] bg-white px-3 py-1">Nincs felelős: {taskEntrypointStats.unassignedTasks}</span>
                <span className="rounded-full border border-[#E6C987] bg-[#FAEFCF] px-3 py-1">Ma esedékes: {taskEntrypointStats.dueToday}</span>
              </div>
            </div>
            <div className="rounded-[10px] border border-[#EEE7D9] bg-[#FBF9F3] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Gyors folytatás</p>
              <p className="mt-1 text-[11px] leading-5 text-[#6D6A62]">Válassz feladatot a jobb oldali kontextushoz, vagy nyisd meg az ügylistát, ha ügyből indulnál.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/cases" className="rounded border border-[#D8CFB6] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#1F2821] hover:bg-[#FBF6E7]">Ügyek megnyitása</Link>
                <Link href="/documents/compare" className="rounded border border-[#D8CFB6] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#1F2821] hover:bg-[#FBF6E7]">Dokumentum-review</Link>
              </div>
            </div>
          </section>

          {error && <div className="mb-4 p-3 text-xs bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a]">{error}</div>}

          {isLoading ? (
            <div className="py-10 text-center text-xs text-[#7B776D]">Feladatok betöltése...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#7B776D] border border-dashed border-[#DDD7CA] space-y-1">
              <p>Nincs betöltött feladat.</p>
              <p>Nincs megjeleníthető feladat a jelenlegi szűrés szerint.</p>
              <p>Új feladat létrehozásához válassz ügyet, majd add meg a feladat címét és határidejét.</p>
              <p>A feladatok ügyhöz kapcsolódnak; az ügyből következik az ügyfélkörnyezet.</p>
              <p>A pontos priorizálás későbbi backend-alapú fejlesztés.</p>
            </div>
          ) : (
            <div className="border border-[#DDD7CA] bg-white overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#F6F2E8] border-b border-[#DDD7CA]">
                  <tr className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">
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
                  {filteredTasks.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`border-b border-[#EEE7D9] cursor-pointer ${selectedTaskId === task.id ? "bg-[#FBF9F3]" : "hover:bg-[#FBF9F3]"}`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#1F2821]">{task.title}</p>
                        <p className="text-[11px] text-[#7B776D] truncate max-w-[280px]">{task.description || "Nincs leírás"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#514D45]">{task.case.caseNumber}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] uppercase px-2 py-1 border ${priorityChip[task.priority] || priorityChip.MEDIUM}`}>
                          {priorityLabel[String(task.priority || "").toUpperCase()] || "Közepes"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#514D45]">
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString("hu-HU") : "Nincs határidő"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#514D45]">{task.assignedTo?.name || "Nincs hozzárendelve"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] uppercase px-2 py-1 border ${statusChip[String(task.status || "").toUpperCase()] || statusChip.TODO}`}>
                          {statusLabel[String(task.status || "").toUpperCase()] || "Ismeretlen állapot"}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {task.status === "TODO" && (
                          <button
                            onClick={() => runTaskAction(task.id, "start")}
                            disabled={isActionLoading === task.id + "start"}
                            className="text-[10px] px-2 py-1 bg-[#1A2E21] text-white"
                          >
                            Indítás
                          </button>
                        )}
                        {task.status === "IN_PROGRESS" && (
                          <button
                            onClick={() => runTaskAction(task.id, "submit")}
                            disabled={isActionLoading === task.id + "submit"}
                            className="text-[10px] px-2 py-1 bg-[#B45309] text-white"
                          >
                            Beküldés
                          </button>
                        )}
                        {task.status === "IN_REVIEW" && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => runTaskAction(task.id, "approve")}
                              disabled={isActionLoading === task.id + "approve"}
                              className="text-[10px] px-2 py-1 bg-[#059669] text-white"
                            >
                              Jóváhagy
                            </button>
                            <button
                              onClick={() => runTaskAction(task.id, "reject")}
                              disabled={isActionLoading === task.id + "reject"}
                              className="text-[10px] px-2 py-1 bg-[#DC2626] text-white"
                            >
                              Visszaad
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <aside className="w-80 bg-white overflow-y-auto">
        <div className="p-4 space-y-5">
          <div>
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Feladat kontextus</h2>
            {!selectedTask ? (
              <p className="text-xs text-[#9C9890]">Válassz feladatot a részletekhez.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[#1F2821]">{selectedTask.title}</p>
                <p className="text-xs text-[#514D45]">{selectedTask.description || "Nincs részletes leírás"}</p>
                        <p className="text-[11px] text-[#7B776D]">Prioritás: {priorityLabel[String(selectedTask.priority || "").toUpperCase()] || "Közepes"}</p>
                        <p className="text-[11px] text-[#7B776D]">Státusz: {statusLabel[String(selectedTask.status || "").toUpperCase()] || "Ismeretlen állapot"}</p>
                        <p className="text-[11px] text-[#7B776D]">
                          Határidő: {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString("hu-HU") : "Nincs határidő"}
                        </p>
                        {(() => {
                          const dueBadge = getDueBadge(selectedTask.dueDate);
                          if (!dueBadge) return null;
                          return <p className={`text-[11px] font-semibold ${dueBadge.className}`}>{dueBadge.label}</p>;
                        })()}
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mt-3">
                  Átadás
                  <select
                    onChange={(e) => handleReassign(selectedTask.id, e.target.value)}
                    className="mt-1 w-full px-2 py-2 border border-[#DDD7CA] text-xs"
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

          <div className="border-t border-[#EEE7D9] pt-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Kapcsolt ügy</h3>
            {!selectedTask ? (
              <p className="text-xs text-[#9C9890]">Nincs kiválasztott ügy.</p>
            ) : (
              <div className="space-y-2">
                <Link href={`/cases/${selectedTask.case.id}`} className="text-sm font-semibold text-[#1F2821] hover:text-[#C9A227]">
                  {selectedTask.case.caseNumber}
                </Link>
                <p className="text-xs text-[#514D45]">{selectedTask.case.clientName || "Ismeretlen ügyfél"}</p>
                <p className="text-xs text-[#7B776D]">{selectedTask.case.matterType || "Nincs ügytípus"}</p>
                {selectedCaseSummary ? (
                  <div className="mt-2 p-2 bg-[#F6F2E8] border border-[#EEE7D9]">
                    <p className="text-[11px] text-[#514D45]">Dokumentumok: {selectedCaseSummary.stats.totalDocuments}</p>
                    <p className="text-[11px] text-[#514D45]">Ellenőrzés alatt: {selectedCaseSummary.stats.pendingReview}</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#9C9890]">Ügy-összegzés nem érhető el.</p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-[#EEE7D9] pt-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Friss ügyesemények</h3>
            {!selectedCaseSummary?.last5TimelineEvents?.length ? (
              <p className="text-xs text-[#9C9890]">Nincs megjeleníthető idővonal-esemény.</p>
            ) : (
              <div className="space-y-2">
                {selectedCaseSummary.last5TimelineEvents.slice(0, 4).map((item) => (
                  <div key={item.id} className="p-2 border border-[#EEE7D9]">
                    <p className="text-[11px] font-semibold text-[#1F2821]">{item.type}</p>
                    <p className="text-[10px] text-[#7B776D]">{new Date(item.createdAt).toLocaleString("hu-HU")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#EEE7D9] pt-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Kapcsolt munkafolyamatok</h3>
            <div className="space-y-1">
              <Link href="/reviews" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Review sor</Link>
              <Link href="/notifications" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Értesítések</Link>
              <Link
                href={selectedTask ? `/documents/compare?caseId=${encodeURIComponent(selectedTask.case.id)}` : "/documents/compare"}
                className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
              >
                Szerződés-workspace
              </Link>
              <Link
                href={selectedTask ? `/cases/${selectedTask.case.id}/documents` : "/cases"}
                className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
              >
                Dokumentumtár
              </Link>
              <Link
                href={selectedTask ? `/cases/${selectedTask.case.id}/communications` : "/cases"}
                className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
              >
                Kommunikáció
              </Link>
              <Link
                href={selectedTask ? `/cases/${selectedTask.case.id}/handoff` : "/cases"}
                className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
              >
                Leadási csomag
              </Link>
              <Link href="/time-entries" className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Munkaórák</Link>
            </div>
          </div>
        </div>
      </aside>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg border border-[#DDD7CA]">
            <div className="px-6 py-4 border-b border-[#DDD7CA]">
              <h2 className="text-lg font-serif text-[#1F2821]">Új feladat</h2>
            </div>
            <div className="p-6 space-y-4">
              <label className="block text-xs text-[#7B776D]">
                Ügy *
                <select
                  value={createData.caseId}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, caseId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[#DDD7CA] text-sm"
                >
                  <option value="">Válassz ügyet</option>
                  {cases.map((caseItem) => (
                    <option key={caseItem.id} value={caseItem.id}>
                      {caseItem.caseNumber} · {caseItem.clientName}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-[#9C9890]">
                  Az ügy kiválasztása határozza meg az ügyfélkörnyezetet.
                </span>
                {selectedCreateCase?.clientName && (
                  <span className="mt-1 block text-[10px] font-semibold text-[#514D45]">
                    Kapcsolt ügyfél: {selectedCreateCase.clientName}
                  </span>
                )}
              </label>

              <label className="block text-xs text-[#7B776D]">
                Cím *
                <input
                  value={createData.title}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[#DDD7CA] text-sm"
                  placeholder="Feladat címe"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-[#7B776D]">
                  Típus *
                  <select
                    value={createData.type}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, type: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-[#DDD7CA] text-sm"
                  >
                    {TASK_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-[#7B776D]">
                  Prioritás
                  <select
                    value={createData.priority}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, priority: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-[#DDD7CA] text-sm"
                  >
                    <option value="LOW">Alacsony</option>
                    <option value="MEDIUM">Közepes</option>
                    <option value="HIGH">Magas</option>
                    <option value="URGENT">Sürgős</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-[#7B776D]">
                  Határidő
                  <input
                    type="date"
                    value={createData.dueDate || ""}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, dueDate: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-[#DDD7CA] text-sm"
                  />
                </label>
                <label className="block text-xs text-[#7B776D]">
                  Felelős
                  {collaboratorsLoading ? (
                    <span className="mt-1 w-full px-3 py-2 border border-[#DDD7CA] text-xs text-[#9C9890] block">
                      Résztvevők betöltése...
                    </span>
                  ) : (
                    <select
                      value={createData.assignedTo || ""}
                      onChange={(e) => setCreateData((prev) => ({ ...prev, assignedTo: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-[#DDD7CA] text-sm"
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

              <label className="block text-xs text-[#7B776D]">
                Leírás
                <textarea
                  value={createData.description || ""}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[#DDD7CA] text-sm"
                  rows={3}
                  placeholder="Feladat részletei"
                />
              </label>
            </div>
            <div className="px-6 py-4 border-t border-[#DDD7CA] flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-[#DDD7CA] text-xs uppercase tracking-[0.2em] text-[#514D45]"
                disabled={isSaving}
              >
                Mégsem
              </button>
              <button
                onClick={handleCreateTask}
                className="px-4 py-2 bg-[#1A2E21] text-white text-xs uppercase tracking-[0.2em]"
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

