"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getCommunications,
  getCases,
  getClients,
  linkCommunicationToCase,
  extractTaskFromCommunication,
  createCaseFromCommunication,
  ApiError,
  type CommunicationItem,
  type CaseListItem,
  type Client,
} from "@/lib/api";

const CASE_MATTER_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "REAL_ESTATE_SALE", label: "Ingatlan adásvétel" },
  { value: "LEASE", label: "Bérlet" },
  { value: "EMPLOYMENT", label: "Munkaviszony" },
  { value: "CORPORATE", label: "Cégjogi" },
  { value: "LITIGATION", label: "Peres" },
  { value: "OTHER", label: "Egyéb" },
];
import { classifyAudience, toCommunicationSignal } from "@/lib/communicationIntake";

const filters = [
  "Összes",
  "Külső",
  "Belső",
  "Válaszra vár",
  "Ügyfélhez sorolt",
  "Ügyhöz sorolt",
  "Feladathoz kapcsolt",
];

const filterViews: Record<string, string> = {
  Összes: "all",
  Külső: "external",
  Belső: "internal",
  "Válaszra vár": "replies",
  "Ügyfélhez sorolt": "clients",
  "Ügyhöz sorolt": "cases",
  "Feladathoz kapcsolt": "tasks",
};

const viewFilters = Object.fromEntries(Object.entries(filterViews).map(([label, view]) => [view, label]));

const filterTone: Record<string, string> = {
  Összes: "var(--adm-blue-950)",
  Külső: "var(--adm-blue-500)",
  Belső: "var(--adm-blue-700)",
  "Válaszra vár": "var(--adm-warm-500)",
  "Ügyfélhez sorolt": "var(--adm-blue-500)",
  "Ügyhöz sorolt": "var(--adm-blue-700)",
  "Feladathoz kapcsolt": "var(--adm-blue-950)",
};

const communicationColumns = ["Feladó / forrás", "Tárgy / jelzés", "Ügyfél / ügy", "Státusz", "Idő"];

const COMMUNICATION_LIST_LIMIT = 50;
type CommunicationAudience = "external" | "internal";

export default function NotificationsPage() {
  return (
    <AuthenticatedApp section="notifications">
      <CommunicationWorkspace />
    </AuthenticatedApp>
  );
}

type AssignFeedback = { tone: "success" | "error" | "info"; message: string };

function CommunicationWorkspace() {
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Manual lawyer intake: assign an already-listed communication to an EXISTING case.
  // Not email ingestion, not provider sync, not AI triage — a human-confirmed link only.
  const [assignTarget, setAssignTarget] = useState<CommunicationItem | null>(null);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesLoaded, setCasesLoaded] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [assignFeedback, setAssignFeedback] = useState<AssignFeedback | null>(null);

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view") || "all";
    const nextFilter = viewFilters[view] || filters[0];
    setActiveFilter(nextFilter);
  }, []);

  const openAssign = (item: CommunicationItem) => {
    setAssignTarget(item);
    setSelectedCaseId("");
    setAssignFeedback(null);
    if (casesLoaded || casesLoading) return;
    setCasesLoading(true);
    getCases(1, 200)
      .then((response) => {
        setCases(Array.isArray(response.data) ? response.data : []);
        setCasesLoaded(true);
      })
      .catch((error) => {
        console.error("Cases load for assignment failed:", error);
        setAssignFeedback({
          tone: "error",
          message: "Az ügylista most nem érhető el. Próbáld újra később.",
        });
      })
      .finally(() => setCasesLoading(false));
  };

  const closeAssign = () => {
    if (isLinking) return;
    setAssignTarget(null);
    setSelectedCaseId("");
    setAssignFeedback(null);
  };

  const submitAssign = async () => {
    if (!assignTarget || !selectedCaseId) return;
    setIsLinking(true);
    setAssignFeedback(null);
    try {
      const result = await linkCommunicationToCase(assignTarget.id, selectedCaseId);
      if (result?.success) {
        // Honest local update: the backend confirmed the link, so reflect the new caseId.
        setCommunications((prev) =>
          prev.map((item) => (item.id === assignTarget.id ? { ...item, caseId: selectedCaseId } : item)),
        );
        setAssignFeedback({ tone: "success", message: result.message || "A kommunikáció ügyhöz rendelve." });
      } else {
        setAssignFeedback({ tone: "error", message: "Nem sikerült ügyhöz rendelni." });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 501) {
        setAssignFeedback({
          tone: "info",
          message: "Az ügyhöz rendelés még nincs bekapcsolva ezen a környezeten.",
        });
      } else if (error instanceof ApiError && error.status === 401) {
        setAssignFeedback({
          tone: "error",
          message: "A művelet nem érhető el. Jelentkezz be újra, majd próbáld újra.",
        });
      } else {
        setAssignFeedback({
          tone: "error",
          message: "Nem sikerült ügyhöz rendelni. Ellenőrizd a kapcsolatot vagy próbáld újra.",
        });
      }
    } finally {
      setIsLinking(false);
    }
  };

  // Manual lawyer task extraction from a communication that already has a case.
  // Not AI, not automatic email processing — a human-entered task that the backend
  // tags with sourceCommunicationId for later context.
  const [taskTarget, setTaskTarget] = useState<CommunicationItem | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState<AssignFeedback | null>(null);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  const openTask = (item: CommunicationItem) => {
    setTaskTarget(item);
    setTaskTitle(item.subject ? `Feladat: ${item.subject}` : "");
    setTaskDescription("");
    setTaskDueDate("");
    setTaskPriority("MEDIUM");
    setTaskFeedback(null);
    setCreatedTaskId(null);
  };

  const closeTask = () => {
    if (isCreatingTask) return;
    setTaskTarget(null);
    setTaskFeedback(null);
    setCreatedTaskId(null);
  };

  const submitTask = async () => {
    if (!taskTarget || !taskTarget.caseId || !taskTitle.trim()) return;
    setIsCreatingTask(true);
    setTaskFeedback(null);
    try {
      const result = await extractTaskFromCommunication(taskTarget.id, {
        title: taskTitle.trim(),
        description: taskDescription.trim() || taskTarget.summary || undefined,
        dueDate: taskDueDate || undefined,
        priority: taskPriority,
        caseId: taskTarget.caseId,
      });
      if (result?.success) {
        // Honest local update: backend confirmed creation, so bump the count.
        setCommunications((prev) =>
          prev.map((item) =>
            item.id === taskTarget.id ? { ...item, sourceTaskCount: item.sourceTaskCount + 1 } : item,
          ),
        );
        // Only surface a task link when the response carries a real task id.
        setCreatedTaskId(result.task?.id ?? null);
        setTaskFeedback({
          tone: "success",
          message: result.task?.title ? `Feladat létrehozva: ${result.task.title}` : "Feladat létrehozva.",
        });
      } else {
        setTaskFeedback({ tone: "error", message: "Nem sikerült feladatot létrehozni." });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 501) {
        setTaskFeedback({
          tone: "info",
          message: "A feladat létrehozása kommunikációból még nincs bekapcsolva ezen a környezeten.",
        });
      } else if (error instanceof ApiError && error.status === 401) {
        setTaskFeedback({
          tone: "error",
          message: "A művelet nem érhető el. Jelentkezz be újra, majd próbáld újra.",
        });
      } else {
        setTaskFeedback({
          tone: "error",
          message: "Nem sikerült feladatot létrehozni. Ellenőrizd a kapcsolatot vagy próbáld újra.",
        });
      }
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Manual lawyer intake: create a NEW case from an unlinked communication.
  // Wired ONLY to the atomic createCaseFromCommunication endpoint — the case
  // create + communication link happen in one server-side transaction, so the
  // old unsafe createCase()+linkCommunicationToCase() two-step is never used and
  // an orphan case cannot be produced from the client.
  const [createCaseTarget, setCreateCaseTarget] = useState<CommunicationItem | null>(null);
  const [ccTitle, setCcTitle] = useState("");
  const [ccMatterType, setCcMatterType] = useState("OTHER");
  const [ccPriority, setCcPriority] = useState("MEDIUM");
  const [ccDeadline, setCcDeadline] = useState("");
  const [ccDescription, setCcDescription] = useState("");
  const [ccClientId, setCcClientId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const [ccFeedback, setCcFeedback] = useState<AssignFeedback | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);

  const openCreateCase = (item: CommunicationItem) => {
    setCreateCaseTarget(item);
    setCcTitle(item.subject ? item.subject : "");
    setCcMatterType("OTHER");
    setCcPriority("MEDIUM");
    setCcDeadline("");
    setCcClientId("");
    setCcDescription(
      item.subject
        ? `Kommunikációból indított ügy. Tárgy: ${item.subject}.`
        : "Kommunikációból indított ügy.",
    );
    setCcFeedback(null);
    setCreatedCaseId(null);
    // A client FK is required server-side. If the communication has no clientId,
    // load the client list so the lawyer can pick one (no fabricated linkage).
    if (!item.clientId && !clientsLoaded && !clientsLoading) {
      setClientsLoading(true);
      getClients()
        .then((response) => {
          setClients(Array.isArray(response.data) ? response.data : []);
          setClientsLoaded(true);
        })
        .catch((error) => {
          console.error("Clients load for case creation failed:", error);
          setCcFeedback({ tone: "error", message: "Az ügyféllista most nem érhető el. Próbáld újra később." });
        })
        .finally(() => setClientsLoading(false));
    }
  };

  const closeCreateCase = () => {
    if (isCreatingCase) return;
    setCreateCaseTarget(null);
    setCcFeedback(null);
    setCreatedCaseId(null);
  };

  const submitCreateCase = async () => {
    if (!createCaseTarget || !ccTitle.trim()) return;
    const resolvedClientId = createCaseTarget.clientId || ccClientId;
    if (!resolvedClientId) return;
    setIsCreatingCase(true);
    setCcFeedback(null);
    try {
      const result = await createCaseFromCommunication(createCaseTarget.id, {
        title: ccTitle.trim(),
        matterType: ccMatterType,
        clientId: resolvedClientId,
        priority: ccPriority,
        deadline: ccDeadline || undefined,
        description: ccDescription.trim() || undefined,
      });
      if (result?.success && result.case?.id) {
        // Honest local update: backend committed case + link in one transaction.
        const newCaseId = result.case.id;
        setCommunications((prev) =>
          prev.map((item) => (item.id === createCaseTarget.id ? { ...item, caseId: newCaseId } : item)),
        );
        setCreatedCaseId(newCaseId);
        setCcFeedback({
          tone: "success",
          message: result.case.caseNumber
            ? `Ügy létrehozva: ${result.case.caseNumber}`
            : "Ügy létrehozva, a kommunikáció hozzárendelve.",
        });
      } else {
        setCcFeedback({ tone: "error", message: "Nem sikerült új ügyet indítani." });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 501) {
          setCcFeedback({
            tone: "info",
            message: "Az új ügy indítása kommunikációból még nincs bekapcsolva ezen a környezeten.",
          });
        } else if (error.status === 404) {
          setCcFeedback({
            tone: "info",
            message: "Az új ügy indítása még nem érhető el ezen a backend verzión, vagy a kommunikáció már nem található.",
          });
        } else if (error.status === 409) {
          setCcFeedback({
            tone: "error",
            message: "Ez a kommunikáció már ügyhöz van rendelve. Frissítse a listát.",
          });
        } else if (error.status === 400) {
          setCcFeedback({ tone: "error", message: error.message || "Hiányzó vagy hibás ügyadatok." });
        } else if (error.status === 401) {
          setCcFeedback({
            tone: "error",
            message: "A művelet nem érhető el. Jelentkezz be újra, majd próbáld újra.",
          });
        } else {
          setCcFeedback({
            tone: "error",
            message: "Nem sikerült új ügyet indítani. Ellenőrizd a kapcsolatot vagy próbáld újra.",
          });
        }
      } else {
        setCcFeedback({
          tone: "error",
          message: "Nem sikerült új ügyet indítani. Ellenőrizd a kapcsolatot vagy próbáld újra.",
        });
      }
    } finally {
      setIsCreatingCase(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function loadReadOnlyCommunications() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await getCommunications({ limit: COMMUNICATION_LIST_LIMIT });
        if (!mounted) return;
        setCommunications(Array.isArray(result.communications) ? result.communications : []);
      } catch (error) {
        console.error("Read-only communications load failed:", error);
        if (!mounted) return;
        setCommunications([]);
        setLoadError("A kommunikációs lista most nem érhető el. A munkatér üres állapotban marad.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadReadOnlyCommunications();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredCommunications = useMemo(
    () => applyWorkspaceFilter(communications, activeFilter),
    [activeFilter, communications],
  );
  const externalCommunications = useMemo(
    () => filteredCommunications.filter((item) => classifyCommunicationAudience(item) === "external"),
    [filteredCommunications],
  );
  const internalCommunications = useMemo(
    () => filteredCommunications.filter((item) => classifyCommunicationAudience(item) === "internal"),
    [filteredCommunications],
  );
  const externalEmpty = getPanelEmptyCopy("external", activeFilter);
  const internalEmpty = getPanelEmptyCopy("internal", activeFilter);

  return (
    <main className="adm-dash-stage min-h-screen px-3 pb-4 pt-3 sm:px-5 xl:px-6">
      <section className="mx-auto w-full max-w-[1440px] space-y-3">
        <header className="adm-panel adm-panel-primary overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-[var(--adm-blue-500)] bg-white px-4 py-3 lg:px-5">
            <div>
              <p className="adm-kicker text-[var(--adm-blue-700)]">Kommunikáció</p>
              <h1 className="adm-heading mt-1 text-[28px] leading-tight">Kommunikációs munkatér</h1>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[var(--adm-text-muted)]">
                Levelek, belső jelzések és ügyhöz kapcsolható kommunikáció read-only listában.
              </p>
            </div>
            <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-500)]/30 bg-[var(--adm-blue-100)]/35 px-3 py-1 text-[10.5px] font-semibold text-[var(--adm-blue-700)]">
              Read-only lista
            </span>
          </div>

          <nav className="flex gap-1 overflow-x-auto bg-[var(--adm-surface)] px-4 py-2.5 lg:px-5" aria-label="Kommunikációs szűrők">
            {filters.map((filter) => {
              const isActive = activeFilter === filter;
              const tone = filterTone[filter] || "var(--adm-blue-500)";
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setActiveFilter(filter);
                    const view = filterViews[filter];
                    const url = view === "all" ? "/notifications" : `/notifications?view=${view}`;
                    window.history.replaceState(null, "", url);
                  }}
                  className="shrink-0 rounded-[var(--adm-radius-sm)] border px-3 py-1.5 text-[11px] font-bold transition-colors"
                  style={{
                    borderColor: isActive ? tone : "var(--adm-border)",
                    background: isActive ? tone : "#FFFFFF",
                    color: isActive ? "#FFFFFF" : "var(--adm-text-muted)",
                  }}
                >
                  {filter}
                </button>
              );
            })}
          </nav>
        </header>

        {loadError ? (
          <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">
            {loadError}
          </div>
        ) : null}

        <section className="grid gap-3 xl:grid-cols-2">
          <CommunicationPanel
            title="Külső kommunikáció"
            accent="var(--adm-blue-500)"
            countLabel={`${Math.min(externalCommunications.length, 8)}/8`}
            capacityLabel="Kapacitás: 8 levélelőnézet"
            items={externalCommunications.slice(0, 8)}
            isLoading={isLoading}
            emptyTitle={externalEmpty.title}
            emptyText={externalEmpty.text}
            onAssign={openAssign}
            onCreateTask={openTask}
            onCreateCase={openCreateCase}
          />
          <CommunicationPanel
            title="Belső kommunikáció"
            accent="var(--adm-blue-700)"
            countLabel={`${Math.min(internalCommunications.length, 8)}/8`}
            capacityLabel="Kapacitás: 8 belső jelzés"
            items={internalCommunications.slice(0, 8)}
            isLoading={isLoading}
            emptyTitle={internalEmpty.title}
            emptyText={internalEmpty.text}
            onAssign={openAssign}
            onCreateTask={openTask}
            onCreateCase={openCreateCase}
          />
        </section>

        <section className="adm-panel overflow-hidden">
          <div className="border-b border-[var(--adm-border)] bg-white px-4 py-3 lg:px-5">
            <p className="adm-kicker text-[var(--adm-blue-950)]">Munkába rendezés</p>
            <h2 className="adm-heading mt-0.5 text-[22px]">Kommunikáció feldolgozása</h2>
          </div>
          <div className="grid gap-3 p-3 lg:grid-cols-[1.15fr_0.9fr_0.95fr] lg:p-4">
            <WorkflowTool accent="var(--adm-blue-950)" kicker="Besorolás" title="Ügyhöz rendezés">
              <div className="flex flex-wrap items-center gap-2">
                {["Levél/jelzés", "Ügyfél", "Ügy", "Feladat"].map((step, index) => (
                  <span key={step} className="inline-flex items-center gap-2">
                    <span className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-950)]/20 bg-white px-2.5 py-1 text-[10.5px] font-bold text-[var(--adm-blue-950)]">
                      {step}
                    </span>
                    {index < 3 ? <span className="text-[var(--adm-text-soft)]">→</span> : null}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] font-semibold text-[var(--adm-text-muted)]">
                A besorolás később megjegyezhető lesz.
              </p>
            </WorkflowTool>

            <WorkflowTool accent="var(--adm-warm-500)" kicker="Válaszállapot" title="Válasz követése">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <ReplyLane label="Tőlünk várnak választ" />
                <ReplyLane label="Mi várunk válaszra" />
              </div>
              <p className="mt-3 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-warm-400)]/45 bg-[#FFF8E2] px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">
                A read-only lista nem tartalmaz válaszállapot-mezőt. Követéshez későbbi perzisztált kommunikációs modell kell.
              </p>
            </WorkflowTool>

            <WorkflowTool accent="var(--adm-blue-700)" kicker="Feladathoz kapcsolás" title="Munka kiadása">
              <div className="grid grid-cols-2 gap-2">
                {["Levél / szál", "Feladat", "Ügy", "Felelős"].map((item) => (
                  <span key={item} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-2.5 py-2 text-[11px] font-bold text-[var(--adm-text)]">
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] font-semibold text-[var(--adm-text-muted)]">
                Feladatkiadáskor a releváns levél vagy szál kapcsolható lesz.
              </p>
            </WorkflowTool>
          </div>
        </section>
      </section>

      {assignTarget ? (
        <AssignToCaseModal
          target={assignTarget}
          cases={cases}
          casesLoading={casesLoading}
          selectedCaseId={selectedCaseId}
          onSelectCase={setSelectedCaseId}
          isLinking={isLinking}
          feedback={assignFeedback}
          onClose={closeAssign}
          onSubmit={submitAssign}
        />
      ) : null}

      {taskTarget ? (
        <TaskFromCommunicationModal
          target={taskTarget}
          title={taskTitle}
          description={taskDescription}
          dueDate={taskDueDate}
          priority={taskPriority}
          onChangeTitle={setTaskTitle}
          onChangeDescription={setTaskDescription}
          onChangeDueDate={setTaskDueDate}
          onChangePriority={setTaskPriority}
          isCreating={isCreatingTask}
          feedback={taskFeedback}
          createdTaskId={createdTaskId}
          onClose={closeTask}
          onSubmit={submitTask}
        />
      ) : null}

      {createCaseTarget ? (
        <CreateCaseFromCommunicationModal
          target={createCaseTarget}
          title={ccTitle}
          matterType={ccMatterType}
          priority={ccPriority}
          deadline={ccDeadline}
          description={ccDescription}
          clientId={ccClientId}
          clients={clients}
          clientsLoading={clientsLoading}
          onChangeTitle={setCcTitle}
          onChangeMatterType={setCcMatterType}
          onChangePriority={setCcPriority}
          onChangeDeadline={setCcDeadline}
          onChangeDescription={setCcDescription}
          onChangeClientId={setCcClientId}
          isCreating={isCreatingCase}
          feedback={ccFeedback}
          createdCaseId={createdCaseId}
          onClose={closeCreateCase}
          onSubmit={submitCreateCase}
        />
      ) : null}
    </main>
  );
}

function CreateCaseFromCommunicationModal({
  target,
  title,
  matterType,
  priority,
  deadline,
  description,
  clientId,
  clients,
  clientsLoading,
  onChangeTitle,
  onChangeMatterType,
  onChangePriority,
  onChangeDeadline,
  onChangeDescription,
  onChangeClientId,
  isCreating,
  feedback,
  createdCaseId,
  onClose,
  onSubmit,
}: {
  target: CommunicationItem;
  title: string;
  matterType: string;
  priority: string;
  deadline: string;
  description: string;
  clientId: string;
  clients: Client[];
  clientsLoading: boolean;
  onChangeTitle: (value: string) => void;
  onChangeMatterType: (value: string) => void;
  onChangePriority: (value: string) => void;
  onChangeDeadline: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeClientId: (value: string) => void;
  isCreating: boolean;
  feedback: AssignFeedback | null;
  createdCaseId: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const subject = target.subject || target.summary || target.contentPreview || "Nincs tárgy";
  const succeeded = feedback?.tone === "success";
  const hasOwnClient = Boolean(target.clientId);
  const needsClientPick = !hasOwnClient;
  const clientReady = hasOwnClient || Boolean(clientId);
  const feedbackStyle =
    feedback?.tone === "success"
      ? "border-[var(--adm-blue-500)]/40 bg-[var(--adm-blue-100)]/35 text-[var(--adm-blue-700)]"
      : feedback?.tone === "info"
        ? "border-[var(--adm-warm-400)]/55 bg-[#FFF8E2] text-[var(--adm-warm-600)]"
        : "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white shadow-[0_18px_40px_rgba(2,48,71,0.18)]">
        <div className="border-b border-[var(--adm-border)] px-4 py-3">
          <p className="adm-kicker text-[var(--adm-blue-700)]">Kézi besorolás</p>
          <h2 className="adm-heading mt-0.5 text-[18px]">Új ügy indítása</h2>
          <p className="mt-1 truncate text-[11px] text-[var(--adm-text-muted)]">{subject}</p>
          <p className="mt-1 text-[10.5px] font-semibold text-[var(--adm-text-soft)]">
            Az ügy létrehozása és a kommunikáció hozzárendelése egy szerveroldali tranzakcióban történik.
          </p>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="cc-title">
              Ügy címe
            </label>
            <input
              id="cc-title"
              value={title}
              onChange={(event) => onChangeTitle(event.target.value)}
              disabled={isCreating || succeeded}
              className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>

          {needsClientPick ? (
            <div>
              <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="cc-client">
                Ügyfél
              </label>
              <select
                id="cc-client"
                value={clientId}
                onChange={(event) => onChangeClientId(event.target.value)}
                disabled={clientsLoading || isCreating || succeeded}
                className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">{clientsLoading ? "Ügyfelek betöltése…" : "Válassz ügyfelet…"}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-[var(--adm-text-soft)]">
                A kommunikációhoz nincs ügyfél rendelve, ezért az ügyfelet ki kell választani.
              </p>
            </div>
          ) : (
            <p className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-[10.5px] font-semibold text-[var(--adm-text-muted)]">
              Ügyfél a kommunikációból átvéve.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="cc-matter">
                Ügytípus
              </label>
              <select
                id="cc-matter"
                value={matterType}
                onChange={(event) => onChangeMatterType(event.target.value)}
                disabled={isCreating || succeeded}
                className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
              >
                {CASE_MATTER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="cc-priority">
                Prioritás
              </label>
              <select
                id="cc-priority"
                value={priority}
                onChange={(event) => onChangePriority(event.target.value)}
                disabled={isCreating || succeeded}
                className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="LOW">Alacsony</option>
                <option value="MEDIUM">Közepes</option>
                <option value="HIGH">Magas</option>
                <option value="URGENT">Sürgős</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="cc-deadline">
              Határidő (opcionális)
            </label>
            <input
              id="cc-deadline"
              type="date"
              value={deadline}
              onChange={(event) => onChangeDeadline(event.target.value)}
              disabled={isCreating || succeeded}
              className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="cc-description">
              Leírás (opcionális)
            </label>
            <textarea
              id="cc-description"
              value={description}
              onChange={(event) => onChangeDescription(event.target.value)}
              disabled={isCreating || succeeded}
              rows={3}
              className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>

          {feedback ? (
            <p className={`rounded-[var(--adm-radius-sm)] border px-3 py-2 text-[11px] font-semibold ${feedbackStyle}`}>
              {feedback.message}
            </p>
          ) : null}
          {succeeded && createdCaseId ? (
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={`/cases/${encodeURIComponent(createdCaseId)}`}
                className="inline-flex rounded-full border border-[var(--adm-blue-500)]/45 bg-white px-2.5 py-1 text-[10.5px] font-bold text-[var(--adm-blue-700)] transition-colors hover:border-[var(--adm-blue-500)] hover:bg-[var(--adm-blue-100)]/35"
              >
                Ügy megnyitása
              </Link>
              <Link
                href={`/cases/${encodeURIComponent(createdCaseId)}/communications`}
                className="inline-flex rounded-full border border-[var(--adm-blue-500)]/45 bg-white px-2.5 py-1 text-[10.5px] font-bold text-[var(--adm-blue-700)] transition-colors hover:border-[var(--adm-blue-500)] hover:bg-[var(--adm-blue-100)]/35"
              >
                Ügy kommunikációi
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--adm-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--adm-text-muted)] disabled:opacity-50"
          >
            {succeeded ? "Bezárás" : "Mégsem"}
          </button>
          {succeeded ? null : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!title.trim() || !clientReady || isCreating || clientsLoading}
              className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-700)] bg-[var(--adm-blue-700)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {isCreating ? "Indítás…" : "Új ügy indítása"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskFromCommunicationModal({
  target,
  title,
  description,
  dueDate,
  priority,
  onChangeTitle,
  onChangeDescription,
  onChangeDueDate,
  onChangePriority,
  isCreating,
  feedback,
  createdTaskId,
  onClose,
  onSubmit,
}: {
  target: CommunicationItem;
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeDueDate: (value: string) => void;
  onChangePriority: (value: string) => void;
  isCreating: boolean;
  feedback: AssignFeedback | null;
  createdTaskId: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const subject = target.subject || target.summary || target.contentPreview || "Nincs tárgy";
  const succeeded = feedback?.tone === "success";
  const feedbackStyle =
    feedback?.tone === "success"
      ? "border-[var(--adm-blue-500)]/40 bg-[var(--adm-blue-100)]/35 text-[var(--adm-blue-700)]"
      : feedback?.tone === "info"
        ? "border-[var(--adm-warm-400)]/55 bg-[#FFF8E2] text-[var(--adm-warm-600)]"
        : "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white shadow-[0_18px_40px_rgba(2,48,71,0.18)]">
        <div className="border-b border-[var(--adm-border)] px-4 py-3">
          <p className="adm-kicker text-[var(--adm-blue-700)]">Kézi feladatkiadás</p>
          <h2 className="adm-heading mt-0.5 text-[18px]">Feladat kinyerése</h2>
          <p className="mt-1 truncate text-[11px] text-[var(--adm-text-muted)]">{subject}</p>
          {target.caseId ? (
            <p className="mt-0.5 text-[10.5px] font-semibold text-[var(--adm-text-soft)]">
              Ügyhöz kötött kommunikációból — a feladat ugyanahhoz az ügyhöz jön létre.
            </p>
          ) : null}
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="task-title">
              Feladat címe
            </label>
            <input
              id="task-title"
              value={title}
              onChange={(event) => onChangeTitle(event.target.value)}
              disabled={isCreating || succeeded}
              placeholder="Feladat címe"
              className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="task-description">
              Leírás (opcionális)
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(event) => onChangeDescription(event.target.value)}
              disabled={isCreating || succeeded}
              rows={3}
              className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="task-due">
                Határidő (opcionális)
              </label>
              <input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(event) => onChangeDueDate(event.target.value)}
                disabled={isCreating || succeeded}
                className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="task-priority">
                Prioritás
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(event) => onChangePriority(event.target.value)}
                disabled={isCreating || succeeded}
                className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="LOW">Alacsony</option>
                <option value="MEDIUM">Közepes</option>
                <option value="HIGH">Magas</option>
                <option value="URGENT">Sürgős</option>
              </select>
            </div>
          </div>

          {feedback ? (
            <p className={`rounded-[var(--adm-radius-sm)] border px-3 py-2 text-[11px] font-semibold ${feedbackStyle}`}>
              {feedback.message}
            </p>
          ) : null}
          {succeeded && createdTaskId ? (
            <Link
              href={`/tasks?taskId=${encodeURIComponent(createdTaskId)}`}
              className="inline-flex rounded-full border border-[var(--adm-blue-500)]/45 bg-white px-2.5 py-1 text-[10.5px] font-bold text-[var(--adm-blue-700)] transition-colors hover:border-[var(--adm-blue-500)] hover:bg-[var(--adm-blue-100)]/35"
            >
              Feladat megnyitása
            </Link>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--adm-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--adm-text-muted)] disabled:opacity-50"
          >
            {succeeded ? "Bezárás" : "Mégsem"}
          </button>
          {succeeded ? null : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!title.trim() || isCreating}
              className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-700)] bg-[var(--adm-blue-700)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {isCreating ? "Létrehozás…" : "Feladat kinyerése"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AssignToCaseModal({
  target,
  cases,
  casesLoading,
  selectedCaseId,
  onSelectCase,
  isLinking,
  feedback,
  onClose,
  onSubmit,
}: {
  target: CommunicationItem;
  cases: CaseListItem[];
  casesLoading: boolean;
  selectedCaseId: string;
  onSelectCase: (caseId: string) => void;
  isLinking: boolean;
  feedback: AssignFeedback | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const subject = target.subject || target.summary || target.contentPreview || "Nincs tárgy";
  const succeeded = feedback?.tone === "success";
  const feedbackStyle =
    feedback?.tone === "success"
      ? "border-[var(--adm-blue-500)]/40 bg-[var(--adm-blue-100)]/35 text-[var(--adm-blue-700)]"
      : feedback?.tone === "info"
        ? "border-[var(--adm-warm-400)]/55 bg-[#FFF8E2] text-[var(--adm-warm-600)]"
        : "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white shadow-[0_18px_40px_rgba(2,48,71,0.18)]">
        <div className="border-b border-[var(--adm-border)] px-4 py-3">
          <p className="adm-kicker text-[var(--adm-blue-700)]">Kézi besorolás</p>
          <h2 className="adm-heading mt-0.5 text-[18px]">Meglévő ügyhöz rendelés</h2>
          <p className="mt-1 truncate text-[11px] text-[var(--adm-text-muted)]">{subject}</p>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <label className="block text-[11px] font-bold text-[var(--adm-text-muted)]" htmlFor="assign-case-select">
              Ügy kiválasztása
            </label>
            <select
              id="assign-case-select"
              value={selectedCaseId}
              onChange={(event) => onSelectCase(event.target.value)}
              disabled={casesLoading || isLinking || succeeded}
              className="adm-modal-field mt-1 w-full px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">{casesLoading ? "Ügyek betöltése…" : "Válassz ügyet…"}</option>
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.caseNumber} — {item.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10.5px] text-[var(--adm-text-soft)]">
              Csak meglévő ügyhöz rendelés. A besorolást a felelős jogász erősíti meg.
            </p>
          </div>

          {feedback ? (
            <p className={`rounded-[var(--adm-radius-sm)] border px-3 py-2 text-[11px] font-semibold ${feedbackStyle}`}>
              {feedback.message}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--adm-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLinking}
            className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--adm-text-muted)] disabled:opacity-50"
          >
            {succeeded ? "Bezárás" : "Mégsem"}
          </button>
          {succeeded ? null : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!selectedCaseId || isLinking || casesLoading}
              className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-blue-700)] bg-[var(--adm-blue-700)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {isLinking ? "Rendezés…" : "Ügyhöz rendelés"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CommunicationPanel({
  title,
  accent,
  countLabel,
  capacityLabel,
  items,
  isLoading,
  emptyTitle,
  emptyText,
  onAssign,
  onCreateTask,
  onCreateCase,
}: {
  title: string;
  accent: string;
  countLabel: string;
  capacityLabel: string;
  items: CommunicationItem[];
  isLoading: boolean;
  emptyTitle: string;
  emptyText: string;
  onAssign: (item: CommunicationItem) => void;
  onCreateTask: (item: CommunicationItem) => void;
  onCreateCase: (item: CommunicationItem) => void;
}) {
  return (
    <article className="adm-panel flex min-h-[340px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-4 text-white" style={{ background: accent }}>
        <h2 className="adm-heading text-[24px] text-white">{title}</h2>
        <span className="rounded-[var(--adm-radius-sm)] border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">
          {countLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="grid grid-cols-[1.05fr_1.2fr_1fr_0.75fr_0.55fr] overflow-hidden rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white">
          {communicationColumns.map((column) => (
            <div key={column} className="border-r border-[var(--adm-border)] px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--adm-text-soft)] last:border-r-0">
              {column}
            </div>
          ))}
        </div>
        {isLoading ? (
          <div className="mt-3 flex min-h-[155px] flex-1 items-center rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
            <p className="text-xs font-semibold text-[var(--adm-text-muted)]">Kommunikációs lista betöltése…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-3 flex min-h-[155px] flex-1 items-center rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
            <div>
              <p className="text-xs font-semibold text-[var(--adm-text)]">{emptyTitle}</p>
              <p className="mt-1 max-w-xl text-[11px] leading-4 text-[var(--adm-text-muted)]">{emptyText}</p>
            </div>
          </div>
        ) : (
          <ul className="mt-3 grid gap-2">
            {items.map((item) => (
              <CommunicationRow
                key={item.id}
                item={item}
                onAssign={onAssign}
                onCreateTask={onCreateTask}
                onCreateCase={onCreateCase}
              />
            ))}
          </ul>
        )}
        <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">{capacityLabel}</p>
      </div>
    </article>
  );
}

function CommunicationRow({
  item,
  onAssign,
  onCreateTask,
  onCreateCase,
}: {
  item: CommunicationItem;
  onAssign: (item: CommunicationItem) => void;
  onCreateTask: (item: CommunicationItem) => void;
  onCreateCase: (item: CommunicationItem) => void;
}) {
  const source = item.senderName || item.senderEmail || item.recipientName || item.recipientEmail || "Nincs megadott forrás";
  const contactLine = formatContactLine(item);
  const subject = item.subject || item.summary || item.contentPreview || "Nincs tárgy";
  const linkedContext = formatLinkedContext(item);
  const statusBadges = formatStatusBadges(item);
  const preview = item.summary || item.contentPreview;
  const timestamp = formatDateShort(item.createdAt);

  return (
    <li className="grid gap-2 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-3 text-[11px] text-[var(--adm-text)] shadow-[0_1px_0_rgba(2,48,71,0.04)] md:grid-cols-[1.05fr_1.35fr_0.9fr_0.8fr_0.55fr] md:items-start">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-[12px] font-bold text-[var(--adm-text)]">{source}</p>
        <p className="truncate text-[10.5px] text-[var(--adm-text-muted)]">{contactLine}</p>
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-soft)]">{formatCommunicationType(item.type)}</p>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="truncate text-[12px] font-bold text-[var(--adm-blue-950)]">{subject}</p>
        {preview ? <p className="line-clamp-2 text-[10.5px] leading-4 text-[var(--adm-text-muted)]">{preview}</p> : null}
        <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-soft)]">
          Létrehozó: {item.createdById ? "rögzített" : "nincs adat"}
        </p>
      </div>
      <p className="min-w-0 truncate rounded-[var(--adm-radius-sm)] bg-[var(--adm-surface)] px-2 py-1.5 font-semibold text-[var(--adm-text-muted)]">
        {linkedContext}
      </p>
      <div className="flex min-w-0 flex-wrap gap-1">
        {statusBadges.map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-1 text-[9.5px] font-bold text-[var(--adm-blue-700)]"
          >
            {badge}
          </span>
        ))}
      </div>
      <time className="whitespace-nowrap text-[10.5px] font-semibold text-[var(--adm-text-soft)]" dateTime={item.createdAt}>
        {timestamp}
      </time>
      <CommunicationContextLinks
        item={item}
        onAssign={onAssign}
        onCreateTask={onCreateTask}
        onCreateCase={onCreateCase}
      />
    </li>
  );
}

function CommunicationContextLinks({
  item,
  onAssign,
  onCreateTask,
  onCreateCase,
}: {
  item: CommunicationItem;
  onAssign: (item: CommunicationItem) => void;
  onCreateTask: (item: CommunicationItem) => void;
  onCreateCase: (item: CommunicationItem) => void;
}) {
  const links: Array<{ href: string; label: string }> = [];

  if (item.caseId) {
    links.push({ href: `/cases/${encodeURIComponent(item.caseId)}`, label: "Ügy megnyitása" });
    links.push({ href: `/cases/${encodeURIComponent(item.caseId)}/communications`, label: "Ügy kommunikációi" });
  }

  if (item.clientId) {
    links.push({ href: `/clients/${encodeURIComponent(item.clientId)}`, label: "Ügyfél megnyitása" });
  }

  if (item.caseId && item.documentId) {
    const query = new URLSearchParams({ caseId: item.caseId, documentId: item.documentId });
    links.push({ href: `/documents/compare?${query.toString()}`, label: "Dokumentum kontextus" });
  }

  // Read-only triage signals derived purely from the record we already loaded.
  // These are honest "jelzés" hints (suggestions), not provider sync, AI, or a persisted thread.
  const signal = toCommunicationSignal({
    id: item.id,
    type: item.type,
    subject: item.subject,
    senderName: item.senderName,
    senderEmail: item.senderEmail,
    recipientEmail: item.recipientEmail,
    summary: item.summary,
    caseId: item.caseId,
    clientId: item.clientId,
    createdAt: item.createdAt,
    attachmentCount: item.attachmentCount,
  });
  const directionLabel = signal.direction === "outgoing" ? "Kimenő" : "Bejövő";
  const needsCase = !item.caseId;

  return (
    <div className="flex flex-wrap items-center gap-1.5 md:col-span-5">
      <span className="rounded-full border border-[var(--adm-border)] bg-white px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--adm-text-soft)]">
        Jelzés: {directionLabel}
      </span>
      {needsCase ? (
        <span className="rounded-full border border-dashed border-[var(--adm-warm-400)]/55 bg-[#FFF8E2] px-2.5 py-1 text-[9.5px] font-bold text-[var(--adm-warm-600)]">
          Még nincs ügyhöz rendelve
        </span>
      ) : null}
      {needsCase ? (
        <button
          type="button"
          onClick={() => onAssign(item)}
          className="rounded-full border border-[var(--adm-blue-500)]/45 bg-white px-2.5 py-1 text-[9.5px] font-bold text-[var(--adm-blue-700)] transition-colors hover:border-[var(--adm-blue-500)] hover:bg-[var(--adm-blue-100)]/35"
        >
          Meglévő ügyhöz rendelés
        </button>
      ) : null}
      {needsCase ? (
        <button
          type="button"
          onClick={() => onCreateCase(item)}
          className="rounded-full border border-[var(--adm-blue-700)]/45 bg-white px-2.5 py-1 text-[9.5px] font-bold text-[var(--adm-blue-700)] transition-colors hover:border-[var(--adm-blue-700)] hover:bg-[var(--adm-blue-100)]/35"
        >
          Új ügy indítása
        </button>
      ) : null}
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2.5 py-1 text-[9.5px] font-bold text-[var(--adm-blue-700)] transition-colors hover:border-[var(--adm-blue-500)] hover:bg-[var(--adm-blue-100)]/35"
        >
          {link.label}
        </Link>
      ))}
      {item.caseId ? (
        <button
          type="button"
          onClick={() => onCreateTask(item)}
          className="rounded-full border border-[var(--adm-blue-700)]/45 bg-white px-2.5 py-1 text-[9.5px] font-bold text-[var(--adm-blue-700)] transition-colors hover:border-[var(--adm-blue-700)] hover:bg-[var(--adm-blue-100)]/35"
        >
          Feladat kinyerése
        </button>
      ) : null}
      {item.sourceTaskCount > 0 ? (
        <span className="rounded-full border border-dashed border-[var(--adm-border)] bg-white px-2.5 py-1 text-[9.5px] font-bold text-[var(--adm-text-muted)]">
          Feladatkapcsolat: csak darabszám
        </span>
      ) : null}
    </div>
  );
}

function WorkflowTool({
  accent,
  kicker,
  title,
  children,
}: {
  accent: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="adm-kicker" style={{ color: accent }}>{kicker}</p>
      <h3 className="adm-heading mt-1 text-[18px]">{title}</h3>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function ReplyLane({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-warm-400)]/35 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-warm-600)]">{label}</p>
      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Későbbi állapotmodell</p>
    </div>
  );
}

function applyWorkspaceFilter(items: CommunicationItem[], activeFilter: string): CommunicationItem[] {
  const view = filterViews[activeFilter] || "all";
  if (view === "external") return items.filter((item) => classifyCommunicationAudience(item) === "external");
  if (view === "internal") return items.filter((item) => classifyCommunicationAudience(item) === "internal");
  if (view === "clients") return items.filter((item) => Boolean(item.clientId));
  if (view === "cases") return items.filter((item) => Boolean(item.caseId));
  if (view === "tasks") return items.filter((item) => item.sourceTaskCount > 0);
  if (view === "replies") return [];
  return items;
}

function classifyCommunicationAudience(item: CommunicationItem): CommunicationAudience {
  return classifyAudience({
    id: item.id,
    type: item.type,
    senderEmail: item.senderEmail,
    recipientEmail: item.recipientEmail,
    clientId: item.clientId,
  });
}

function getPanelEmptyCopy(audience: CommunicationAudience, activeFilter: string): { title: string; text: string } {
  const isExternal = audience === "external";
  const channel = isExternal ? "külső" : "belső";
  const view = filterViews[activeFilter] || "all";

  if (view === "replies") {
    return {
      title: `Nincs megjeleníthető ${channel} válaszállapot.`,
      text: "A jelenlegi read-only lista nem tartalmaz megbízható válaszállapot-mezőt. Ha erre munkafolyamat épül, későbbi perzisztált kommunikációs modell szükséges.",
    };
  }

  if (view === "clients") {
    return {
      title: `Nincs ügyfélhez sorolt ${channel} kommunikáció.`,
      text: "Csak olyan read-only tételek jelennek meg itt, amelyek valós clientId mezővel érkeznek.",
    };
  }

  if (view === "cases") {
    return {
      title: `Nincs ügyhöz sorolt ${channel} kommunikáció.`,
      text: "Csak olyan tételek jelennek meg itt, amelyek valós caseId mezővel érkeznek.",
    };
  }

  if (view === "tasks") {
    return {
      title: `Nincs feladathoz kapcsolt ${channel} kommunikáció.`,
      text: "A lista csak a read-only szerződésben kapott sourceTaskCount alapján jelez feladatkapcsolatot.",
    };
  }

  return {
    title: `Nincs új ${channel} kommunikáció.`,
    text: isExternal
      ? "A bejövő és kimenő külső tételek itt jelennek meg, ha a read-only lista valós rekordot ad vissza."
      : "A belső jelzések és review-visszajelzések itt jelennek meg, ha a read-only lista valós rekordot ad vissza.",
  };
}

function formatContactLine(item: CommunicationItem): string {
  if (item.senderEmail && item.recipientEmail) return `${item.senderEmail} → ${item.recipientEmail}`;
  if (item.senderEmail) return item.senderEmail;
  if (item.recipientEmail) return `Címzett: ${item.recipientEmail}`;
  if (item.recipientName) return `Címzett: ${item.recipientName}`;
  return "Kapcsolati adat nélkül";
}

function formatLinkedContext(item: CommunicationItem): string {
  if (item.clientId && item.caseId) return "Ügyfél + ügy";
  if (item.clientId) return "Ügyfélhez sorolt";
  if (item.caseId) return "Ügyhöz sorolt";
  if (item.documentId) return "Dokumentumhoz kapcsolt";
  return "Nincs besorolva";
}

function formatStatusBadges(item: CommunicationItem): string[] {
  const badges: string[] = [];
  if (item.sourceTaskCount > 0) badges.push(`${item.sourceTaskCount} feladat`);
  if (item.attachmentCount > 0) badges.push(`${item.attachmentCount} melléklet`);
  if (item.clientId || item.caseId || item.documentId) badges.push("Kapcsolt");
  if (badges.length === 0) badges.push("Read-only");
  return badges;
}

function formatCommunicationType(type: CommunicationItem["type"]): string {
  const labels: Record<CommunicationItem["type"], string> = {
    EMAIL: "E-mail",
    PHONE: "Telefon",
    MEETING: "Megbeszélés",
    LETTER: "Levél",
    NOTE: "Jegyzet",
  };
  return labels[type] || type;
}

function formatDateShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
