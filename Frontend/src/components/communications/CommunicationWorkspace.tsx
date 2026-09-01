"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ClientAccent } from "@/components/clients/ClientAccent";
import {
  ApiError,
  createCaseFromCommunication,
  extractTaskFromCommunication,
  getCases,
  getCaseTasks,
  getClients,
  getCommunicationTasks,
  getCommunications,
  linkCommunicationToCase,
  linkCommunicationToTask,
  getOutlookStatus,
  runOutlookSync,
  type CaseListItem,
  type Client,
  type CommunicationItem,
  type TaskItem,
  type TaskListItem,
  type OutlookStatus,
} from "@/lib/api";
import { classifyAudience, toCommunicationSignal } from "@/lib/communicationIntake";

const closedTaskStatuses = new Set(["DONE", "COMPLETED", "APPROVED", "FINALIZED", "CANCELLED", "ARCHIVED"]);

const viewOptions = [
  { label: "Összes", value: "all" },
  { label: "Bejövő", value: "incoming" },
  { label: "Kimenő", value: "outgoing" },
  { label: "Belső", value: "internal" },
  { label: "Feldolgozásra vár", value: "pending" },
] as const;

const caseMatterTypeOptions = [
  { value: "REAL_ESTATE_SALE", label: "Ingatlan adásvétel" },
  { value: "LEASE", label: "Bérlet" },
  { value: "EMPLOYMENT", label: "Munkaviszony" },
  { value: "CORPORATE", label: "Cégjogi" },
  { value: "LITIGATION", label: "Peres" },
  { value: "OTHER", label: "Egyéb" },
];

type Feedback = { tone: "success" | "error" | "info"; message: string };

export default function CommunicationWorkspace() {
  const [activeView, setActiveView] = useState("all");
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [offset, setOffset] = useState(0);
  const [linkedTasks, setLinkedTasks] = useState<TaskListItem[]>([]);
  const [linkedTasksLoading, setLinkedTasksLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [caseFilter, setCaseFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [relationFilter, setRelationFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [outlookStatus, setOutlookStatus] = useState<OutlookStatus | null>(null);
  const [outlookSyncing, setOutlookSyncing] = useState(false);
  const [outlookMessage, setOutlookMessage] = useState<string | null>(null);

  const [assignTarget, setAssignTarget] = useState<CommunicationItem | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignFeedback, setAssignFeedback] = useState<Feedback | null>(null);

  const [taskTarget, setTaskTarget] = useState<CommunicationItem | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState<Feedback | null>(null);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  const [linkTaskTarget, setLinkTaskTarget] = useState<CommunicationItem | null>(null);
  const [caseTasks, setCaseTasks] = useState<TaskItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [caseTasksLoading, setCaseTasksLoading] = useState(false);
  const [linkTaskBusy, setLinkTaskBusy] = useState(false);
  const [linkTaskFeedback, setLinkTaskFeedback] = useState<Feedback | null>(null);

  const [createCaseTarget, setCreateCaseTarget] = useState<CommunicationItem | null>(null);
  const [caseTitle, setCaseTitle] = useState("");
  const [matterType, setMatterType] = useState("OTHER");
  const [casePriority, setCasePriority] = useState("MEDIUM");
  const [caseDeadline, setCaseDeadline] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseFeedback, setCaseFeedback] = useState<Feedback | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view") || "all";
    if (viewOptions.some((option) => option.value === view)) setActiveView(view);
    const communicationId = params.get("communicationId");
    if (communicationId) setSelectedId(communicationId);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getCommunications({ limit: pageSize, offset }),
      getCases(1, 200).catch(() => null),
      getClients().catch(() => null),
    ])
      .then(([communicationResult, caseResult, clientResult]) => {
        if (!mounted) return;
        const items = Array.isArray(communicationResult.communications) ? communicationResult.communications : [];
        setCommunications(items);
        setTotal(communicationResult.pagination?.total ?? items.length);
        setCases(caseResult?.data || []);
        setClients(clientResult?.data || []);
        setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || null);
      })
      .catch((error) => {
        console.error("Communications load failed:", error);
        if (!mounted) return;
        setCommunications([]);
        setLoadError("A kommunikációs lista most nem érhető el.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [offset, pageSize]);

  useEffect(() => {
    let mounted = true;
    getOutlookStatus()
      .then((status) => { if (mounted) setOutlookStatus(status); })
      .catch(() => { if (mounted) setOutlookStatus({ available: false, reason: "UNAVAILABLE", message: "Az Outlook nincs összekötve." }); });
    return () => { mounted = false; };
  }, []);

  const syncOutlook = async () => {
    if (!outlookStatus?.available || outlookSyncing) return;
    setOutlookSyncing(true);
    setOutlookMessage(null);
    try {
      const result = await runOutlookSync();
      if (!result.success) {
        setOutlookMessage("Az Outlook szinkronizálása nem sikerült.");
        return;
      }
      setOutlookMessage("Az Outlook szinkronizálása kész.");
      const refreshed = await getOutlookStatus();
      setOutlookStatus(refreshed);
    } catch {
      setOutlookMessage("Az Outlook szinkronizálása nem sikerült.");
    } finally {
      setOutlookSyncing(false);
    }
  };

  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);
  const clientById = useMemo(() => new Map(clients.map((item) => [item.id, item])), [clients]);

  const filtered = useMemo(() => {
    const globalQuery = search.trim().toLocaleLowerCase("hu-HU");
    const contactQuery = contactFilter.trim().toLocaleLowerCase("hu-HU");
    const emailQuery = emailFilter.trim().toLocaleLowerCase("hu-HU");
    const subjectQuery = subjectFilter.trim().toLocaleLowerCase("hu-HU");
    const now = Date.now();

    return communications.filter((item) => {
      const audience = classifyAudience(item);
      const signal = toCommunicationSignal(item);
      const relatedCase = item.caseId ? caseById.get(item.caseId) : null;
      const relatedClient = item.clientId ? clientById.get(item.clientId) : null;

      if (activeView === "incoming" && signal.direction !== "incoming") return false;
      if (activeView === "outgoing" && signal.direction !== "outgoing") return false;
      if (activeView === "internal" && audience !== "internal") return false;
      if (activeView === "pending" && item.triage !== "NEEDS_ASSIGNMENT") return false;
      if (clientFilter !== "all" && item.clientId !== clientFilter) return false;
      if (caseFilter !== "all" && item.caseId !== caseFilter) return false;
      if (directionFilter !== "all" && signal.direction !== directionFilter) return false;
      if (audienceFilter !== "all" && audience !== audienceFilter) return false;
      if (relationFilter === "linked" && !item.caseId && !item.clientId && !item.documentId) return false;
      if (relationFilter === "unlinked" && (item.caseId || item.clientId || item.documentId)) return false;
      if (relationFilter === "tasks" && item.sourceTaskCount <= 0) return false;
      if (relationFilter === "withoutTasks" && item.sourceTaskCount > 0) return false;
      if (dateFilter !== "all") {
        const timestamp = new Date(item.createdAt).getTime();
        if (Number.isNaN(timestamp)) return false;
        const age = now - timestamp;
        if (dateFilter === "today" && age > 24 * 60 * 60 * 1000) return false;
        if (dateFilter === "week" && age > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === "month" && age > 31 * 24 * 60 * 60 * 1000) return false;
      }

      const contact = `${item.senderName || ""} ${item.recipientName || ""}`.toLocaleLowerCase("hu-HU");
      const email = `${item.senderEmail || ""} ${item.recipientEmail || ""}`.toLocaleLowerCase("hu-HU");
      const subject = `${item.subject || ""} ${item.summary || ""} ${item.contentPreview || ""}`.toLocaleLowerCase("hu-HU");
      const global = `${contact} ${email} ${subject} ${relatedClient?.name || ""} ${relatedCase?.caseNumber || ""} ${relatedCase?.title || ""}`.toLocaleLowerCase("hu-HU");
      return (!globalQuery || global.includes(globalQuery))
        && (!contactQuery || contact.includes(contactQuery))
        && (!emailQuery || email.includes(emailQuery))
        && (!subjectQuery || subject.includes(subjectQuery));
    });
  }, [activeView, audienceFilter, caseById, caseFilter, clientById, clientFilter, communications, contactFilter, dateFilter, directionFilter, emailFilter, relationFilter, search, subjectFilter]);

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  const selectedCommunicationId = selected?.id || null;
  const selectedSourceTaskCount = selected?.sourceTaskCount || 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + pageSize < total;

  useEffect(() => {
    let mounted = true;
    if (!selectedCommunicationId || selectedSourceTaskCount <= 0) {
      setLinkedTasks([]);
      setLinkedTasksLoading(false);
      return;
    }
    setLinkedTasksLoading(true);
    getCommunicationTasks(selectedCommunicationId)
      .then((tasks) => {
        if (mounted) setLinkedTasks(tasks);
      })
      .catch((error) => {
        console.error("Linked communication tasks load failed:", error);
        if (mounted) setLinkedTasks([]);
      })
      .finally(() => {
        if (mounted) setLinkedTasksLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedCommunicationId, selectedSourceTaskCount]);

  const selectView = (view: string) => {
    setActiveView(view);
    const url = view === "all" ? "/communications" : `/communications?view=${view}`;
    window.history.replaceState(null, "", url);
  };

  const clearFilters = () => {
    setSearch("");
    setContactFilter("");
    setEmailFilter("");
    setSubjectFilter("");
    setClientFilter("all");
    setCaseFilter("all");
    setDirectionFilter("all");
    setAudienceFilter("all");
    setRelationFilter("all");
    setDateFilter("all");
    setShowAdvancedFilters(false);
  };

  const updateCommunication = (id: string, patch: Partial<CommunicationItem>) => {
    setCommunications((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const openAssign = (item: CommunicationItem) => {
    setAssignTarget(item);
    setSelectedCaseId("");
    setAssignFeedback(null);
  };

  const submitAssign = async () => {
    if (!assignTarget || !selectedCaseId) return;
    setAssignBusy(true);
    setAssignFeedback(null);
    try {
      const result = await linkCommunicationToCase(assignTarget.id, selectedCaseId);
      updateCommunication(assignTarget.id, { caseId: selectedCaseId });
      setAssignFeedback({ tone: "success", message: result.message || "A kommunikáció ügyhöz rendelve." });
    } catch (error) {
      setAssignFeedback(apiFeedback(error, "Nem sikerült ügyhöz rendelni."));
    } finally {
      setAssignBusy(false);
    }
  };

  const openTask = (item: CommunicationItem) => {
    setTaskTarget(item);
    setTaskTitle(item.subject ? `Feladat: ${item.subject}` : "");
    setTaskDescription("");
    setTaskDueDate("");
    setTaskPriority("MEDIUM");
    setTaskFeedback(null);
    setCreatedTaskId(null);
  };

  const submitTask = async () => {
    if (!taskTarget?.caseId || !taskTitle.trim()) return;
    setTaskBusy(true);
    setTaskFeedback(null);
    try {
      const result = await extractTaskFromCommunication(taskTarget.id, {
        title: taskTitle.trim(),
        description: taskDescription.trim() || taskTarget.summary || undefined,
        dueDate: taskDueDate || undefined,
        priority: taskPriority,
        caseId: taskTarget.caseId,
      });
      updateCommunication(taskTarget.id, { sourceTaskCount: taskTarget.sourceTaskCount + 1 });
      setCreatedTaskId(result.task?.id || null);
      setTaskFeedback({ tone: "success", message: result.task?.title ? `Feladat létrehozva: ${result.task.title}` : "Feladat létrehozva." });
    } catch (error) {
      setTaskFeedback(apiFeedback(error, "Nem sikerült feladatot létrehozni."));
    } finally {
      setTaskBusy(false);
    }
  };

  const openLinkTask = async (item: CommunicationItem) => {
    if (!item.caseId) return;
    setLinkTaskTarget(item);
    setSelectedTaskId("");
    setCaseTasks([]);
    setLinkTaskFeedback(null);
    setCaseTasksLoading(true);
    try {
      const result = await getCaseTasks(item.caseId);
      setCaseTasks(result.filter((task) =>
        !closedTaskStatuses.has(String(task.status).toUpperCase())
        && (!task.sourceCommunicationId || task.sourceCommunicationId === item.id)
      ));
    } catch (error) {
      console.error("Case tasks load failed:", error);
      setLinkTaskFeedback({ tone: "error", message: "Az ügy nyitott feladatai most nem érhetők el." });
    } finally {
      setCaseTasksLoading(false);
    }
  };

  const submitLinkTask = async () => {
    if (!linkTaskTarget || !selectedTaskId) return;
    setLinkTaskBusy(true);
    setLinkTaskFeedback(null);
    try {
      const result = await linkCommunicationToTask(linkTaskTarget.id, selectedTaskId);
      if (result.linked) updateCommunication(linkTaskTarget.id, { sourceTaskCount: linkTaskTarget.sourceTaskCount + 1 });
      setLinkedTasks(await getCommunicationTasks(linkTaskTarget.id).catch(() => []));
      setLinkTaskFeedback({ tone: "success", message: result.linked ? "A kommunikáció a feladathoz kapcsolva." : "Ez a feladat már ehhez a kommunikációhoz tartozik." });
    } catch (error) {
      setLinkTaskFeedback(apiFeedback(error, "Nem sikerült a feladathoz kapcsolni."));
    } finally {
      setLinkTaskBusy(false);
    }
  };

  const openCreateCase = (item: CommunicationItem) => {
    setCreateCaseTarget(item);
    setCaseTitle(item.subject || "");
    setMatterType("OTHER");
    setCasePriority("MEDIUM");
    setCaseDeadline("");
    setCaseDescription(item.subject ? `Kommunikációból indított ügy. Tárgy: ${item.subject}.` : "Kommunikációból indított ügy.");
    setCaseFeedback(null);
    setCreatedCaseId(null);
  };

  const submitCreateCase = async () => {
    if (!createCaseTarget || !caseTitle.trim()) return;
    if (!createCaseTarget.clientId) {
      setCaseFeedback({ tone: "error", message: "Az ügy indításához a kommunikációt előbb ügyfélhez kell kapcsolni." });
      return;
    }
    setCaseBusy(true);
    setCaseFeedback(null);
    try {
      const result = await createCaseFromCommunication(createCaseTarget.id, {
        title: caseTitle.trim(),
        matterType,
        priority: casePriority,
        deadline: caseDeadline || undefined,
        description: caseDescription.trim() || undefined,
      });
      updateCommunication(createCaseTarget.id, { caseId: result.case.id });
      setCreatedCaseId(result.case.id);
      setCaseFeedback({ tone: "success", message: `Ügy létrehozva: ${result.case.caseNumber}` });
    } catch (error) {
      setCaseFeedback(apiFeedback(error, "Nem sikerült új ügyet indítani."));
    } finally {
      setCaseBusy(false);
    }
  };

  return (
    <main className="adm-dash-stage min-h-screen px-3 pb-4 pt-3 sm:px-5 xl:px-6">
      <div className="mx-auto w-full max-w-[1480px] space-y-3">
        <header className="adm-panel overflow-hidden bg-white">
          <div className="border-b-[3px] border-[var(--adm-blue-500)] px-4 py-3 lg:px-5">
            <p className="adm-kicker text-[var(--adm-blue-700)]">Kommunikáció</p>
            <h1 className="adm-heading mt-1 text-[28px] leading-tight">Kommunikációs munkatér</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--adm-text-muted)]">
              <span>{outlookStatus?.available ? "Outlook összekötve." : "Az Outlook nincs összekötve."}</span>
              <button type="button" onClick={() => void syncOutlook()} disabled={!outlookStatus?.available || outlookSyncing} className="border border-[var(--adm-border)] bg-white px-2 py-1 font-semibold disabled:opacity-50">{outlookSyncing ? "Szinkronizálás…" : "Szinkronizálás most"}</button>
              {outlookMessage ? <span role="status">{outlookMessage}</span> : null}
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto bg-[var(--adm-surface)] px-4 py-2 lg:px-5" aria-label="Kommunikációs gyorsnézetek">
            <span className="mr-1 shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Gyorsnézetek</span>
            {viewOptions.map((option) => (
              <button key={option.value} type="button" onClick={() => selectView(option.value)} className={`shrink-0 border px-3 py-1.5 text-[11px] font-bold ${activeView === option.value ? "border-[var(--adm-blue-950)] bg-[var(--adm-blue-950)] text-white" : "border-[var(--adm-border)] bg-white text-[var(--adm-text-muted)]"}`}>
                {option.label}
              </button>
            ))}
          </nav>
        </header>

        <section className="adm-panel bg-white p-3" aria-label="Kommunikáció szűrése">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés e-mailben, tárgyban, ügyben" className="adm-board-field px-3 py-2 text-[11px] xl:col-span-2" />
            <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden ügyfél</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
            <select value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden ügy</option>{cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.caseNumber} · {caseItem.title}</option>)}</select>
            <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden irány</option><option value="incoming">Bejövő</option><option value="outgoing">Kimenő</option></select>
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden dátum</option><option value="today">Elmúlt 24 óra</option><option value="week">Elmúlt 7 nap</option><option value="month">Elmúlt 31 nap</option></select>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--adm-border)] pt-2">
            <button type="button" onClick={() => setShowAdvancedFilters((current) => !current)} aria-expanded={showAdvancedFilters} className="border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-text-muted)]">{showAdvancedFilters ? "További szűrők elrejtése" : "További szűrők"}</button>
            <button type="button" onClick={clearFilters} className="px-2 py-1.5 text-[10px] font-semibold text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">Szűrők törlése</button>
          </div>
          {showAdvancedFilters ? (
            <div className="mt-2 grid gap-2 border-t border-[var(--adm-border)] pt-2 md:grid-cols-2 xl:grid-cols-3">
              <input value={contactFilter} onChange={(event) => setContactFilter(event.target.value)} placeholder="Feladó / címzett neve" className="adm-board-field px-3 py-2 text-[11px]" />
              <input value={emailFilter} onChange={(event) => setEmailFilter(event.target.value)} placeholder="Email cím" className="adm-board-field px-3 py-2 text-[11px]" />
              <input value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} placeholder="Tárgy" className="adm-board-field px-3 py-2 text-[11px]" />
              <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Belső és külső</option><option value="external">Külső</option><option value="internal">Belső</option></select>
              <select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]"><option value="all">Minden kapcsolat</option><option value="linked">Kapcsolt</option><option value="unlinked">Nincs besorolva</option><option value="tasks">Feladathoz kapcsolt</option><option value="withoutTasks">Feladat nélkül</option></select>
              <select disabled className="adm-board-field px-3 py-2 text-[11px] opacity-70" aria-label="Kommunikációs státusz"><option>Státusz: nincs perzisztált adat</option></select>
            </div>
          ) : null}
        </section>

        {loadError ? <div className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">{loadError}</div> : null}

        <div className="grid min-h-[520px] gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="adm-panel min-w-0 overflow-hidden bg-white">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 className="adm-heading text-[20px]">Kommunikáció</h2>
              <span className="text-[10px] font-semibold text-[var(--adm-text-muted)]">{filtered.length} találat ezen az oldalon · {total} összesen</span>
            </div>
            <div className="hidden grid-cols-[1.05fr_1.45fr_0.9fr_0.75fr_0.6fr] border-b border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)] md:grid">
              <span>Feladó / forrás</span><span>Tárgy / jelzés</span><span>Ügyfél / ügy</span><span>Státusz</span><span>Idő</span>
            </div>
            {loading ? <EmptyState title="Kommunikáció betöltése…" /> : filtered.length === 0 ? <EmptyState title="Nincs találat." detail="Módosítsd a szűrőket." /> : (
              <div className="divide-y divide-[var(--adm-border)]">
                {filtered.map((item) => {
                  const signal = toCommunicationSignal(item);
                  const relatedCase = item.caseId ? caseById.get(item.caseId) : null;
                  const relatedClient = item.clientId ? clientById.get(item.clientId) : null;
                  return (
                    <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`relative grid w-full gap-2 px-3 py-3 pl-5 text-left md:grid-cols-[1.05fr_1.45fr_0.9fr_0.75fr_0.6fr] ${selected?.id === item.id ? "bg-[var(--adm-sand-100)]/55" : "hover:bg-[var(--adm-surface)]"}`}>
                      <ClientAccent colorKey={item.clientColorKey} className="absolute inset-y-0 left-0 w-1" />
                      <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.senderName || item.senderEmail || item.recipientName || "Nincs forrásadat"}</span><span className="mt-1 block truncate text-[10px] text-[var(--adm-text-muted)]">{formatContact(item)}</span></span>
                      <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-[var(--adm-blue-950)]">{item.subject || "Nincs tárgy"}</span><span className="mt-1 block truncate text-[10px] text-[var(--adm-text-muted)]">{item.summary || item.contentPreview || formatCommunicationType(item.type)}</span></span>
                      <span className="min-w-0 text-[10px] text-[var(--adm-text-muted)]"><span className="block truncate font-semibold text-[var(--adm-text)]">{relatedClient?.name || (item.clientId ? "Ügyfélhez sorolt" : "Nincs ügyfél")}</span><span className="mt-1 block truncate">{relatedCase ? `${relatedCase.caseNumber} · ${relatedCase.title}` : item.caseId ? "Ügyhöz sorolt" : "Nincs ügy"}</span></span>
                      <span className="flex flex-wrap items-start gap-1"><StatusChip>{sourceLabel(item)}</StatusChip><StatusChip>{signal.direction === "incoming" ? "Bejövő" : "Kimenő"}</StatusChip><StatusChip>{classifyAudience(item) === "external" ? "Külső" : "Belső"}</StatusChip>{item.triage === "NEEDS_ASSIGNMENT" ? <StatusChip>Feldolgozásra vár</StatusChip> : null}{item.sourceTaskCount > 0 ? <StatusChip>{item.sourceTaskCount} feladat</StatusChip> : null}</span>
                      <time className="text-[10px] font-semibold text-[var(--adm-text-muted)]">{formatDate(item.createdAt)}</time>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--adm-border)] p-3">
              <label className="text-[10px] font-semibold text-[var(--adm-text-muted)]">Oldalméret <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0); }} className="adm-board-field ml-2 px-2 py-1 text-[10px]"><option value={20}>20</option><option value={50}>50</option></select></label>
              <span className="text-[10px] text-[var(--adm-text-muted)]">{total ? `${offset + 1}–${Math.min(offset + pageSize, total)} / ${total}` : "0 találat"}</span>
              <div className="flex gap-2"><button type="button" disabled={!hasPrevious || loading} onClick={() => setOffset(Math.max(0, offset - pageSize))} className="border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40">Előző</button><button type="button" disabled={!hasNext || loading} onClick={() => setOffset(offset + pageSize)} className="border border-[var(--adm-blue-700)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-blue-700)] disabled:opacity-40">Következő</button></div>
            </div>
          </section>

          <aside className="adm-panel self-start bg-white">
            {!selected ? <EmptyState title="Válassz kommunikációt." /> : <CommunicationDetail item={selected} relatedCase={selected.caseId ? caseById.get(selected.caseId) : undefined} relatedClient={selected.clientId ? clientById.get(selected.clientId) : undefined} linkedTasks={linkedTasks} linkedTasksLoading={linkedTasksLoading} onAssign={openAssign} onCreateCase={openCreateCase} onCreateTask={openTask} onLinkTask={(item) => void openLinkTask(item)} />}
          </aside>
        </div>
      </div>

      {assignTarget ? <SimpleModal title="Meglévő ügyhöz rendelés" subtitle={assignTarget.subject || "Nincs tárgy"} busy={assignBusy} feedback={assignFeedback} onClose={() => setAssignTarget(null)} onSubmit={submitAssign} submitLabel="Ügyhöz rendelés" submitDisabled={!selectedCaseId}>
        <select value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)} className="adm-modal-field w-full px-3 py-2 text-sm"><option value="">Válassz ügyet…</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} · {item.title}</option>)}</select>
      </SimpleModal> : null}

      {taskTarget ? <SimpleModal title="Új feladat" subtitle={taskTarget.subject || "Nincs tárgy"} busy={taskBusy} feedback={taskFeedback} onClose={() => setTaskTarget(null)} onSubmit={submitTask} submitLabel="Feladat létrehozása" submitDisabled={!taskTitle.trim()} successLink={createdTaskId ? { href: `/tasks?taskId=${encodeURIComponent(createdTaskId)}`, label: "Feladat megnyitása" } : undefined}>
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Cím<input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm" /></label>
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Leírás<textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} rows={3} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm" /></label>
        <div className="grid grid-cols-2 gap-2"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Határidő<input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm" /></label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Prioritás<select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm"><option value="LOW">Alacsony</option><option value="MEDIUM">Közepes</option><option value="HIGH">Magas</option><option value="URGENT">Sürgős</option></select></label></div>
      </SimpleModal> : null}

      {linkTaskTarget ? <SimpleModal title="Meglévő feladathoz" subtitle={linkTaskTarget.subject || "Nincs tárgy"} busy={linkTaskBusy || caseTasksLoading} feedback={linkTaskFeedback} onClose={() => setLinkTaskTarget(null)} onSubmit={submitLinkTask} submitLabel="Feladathoz kapcsolás" submitDisabled={!selectedTaskId || caseTasksLoading}>
        <select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)} disabled={caseTasksLoading} className="adm-modal-field w-full px-3 py-2 text-sm"><option value="">{caseTasksLoading ? "Feladatok betöltése…" : caseTasks.length ? "Válassz nyitott feladatot…" : "Nincs nyitott feladat az ügyön"}</option>{caseTasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {task.status}</option>)}</select>
      </SimpleModal> : null}

      {/* W1B_TRANSITIONAL_CASE_CREATION: retained only until the canonical Case Type / Work Package surface lands. */}
      {createCaseTarget ? <SimpleModal title="Új ügy indítása" subtitle={createCaseTarget.subject || "Nincs tárgy"} busy={caseBusy} feedback={caseFeedback} onClose={() => setCreateCaseTarget(null)} onSubmit={submitCreateCase} submitLabel="Ügy létrehozása" submitDisabled={!caseTitle.trim() || !createCaseTarget.clientId} successLink={createdCaseId ? { href: `/cases/${encodeURIComponent(createdCaseId)}`, label: "Ügy megnyitása" } : undefined}>
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Ügy címe<input value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm" /></label>
        {!createCaseTarget.clientId ? <p className="text-[11px] text-[var(--adm-text-muted)]">Az ügy indításához a kommunikációt előbb ügyfélhez kell kapcsolni.</p> : null}
        <div className="grid grid-cols-2 gap-2"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Ügytípus<select value={matterType} onChange={(event) => setMatterType(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm">{caseMatterTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Prioritás<select value={casePriority} onChange={(event) => setCasePriority(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm"><option value="LOW">Alacsony</option><option value="MEDIUM">Közepes</option><option value="HIGH">Magas</option><option value="URGENT">Sürgős</option></select></label></div>
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Határidő<input type="date" value={caseDeadline} onChange={(event) => setCaseDeadline(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm" /></label>
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Leírás<textarea value={caseDescription} onChange={(event) => setCaseDescription(event.target.value)} rows={3} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm" /></label>
      </SimpleModal> : null}
    </main>
  );
}

function CommunicationDetail({ item, relatedCase, relatedClient, linkedTasks, linkedTasksLoading, onAssign, onCreateCase, onCreateTask, onLinkTask }: { item: CommunicationItem; relatedCase?: CaseListItem; relatedClient?: Client; linkedTasks: TaskListItem[]; linkedTasksLoading: boolean; onAssign: (item: CommunicationItem) => void; onCreateCase: (item: CommunicationItem) => void; onCreateTask: (item: CommunicationItem) => void; onLinkTask: (item: CommunicationItem) => void }) {
  const signal = toCommunicationSignal(item);
  return (
      <div>
      <div className="relative border-b border-[var(--adm-border)] px-4 py-3 pl-5"><ClientAccent colorKey={item.clientColorKey} className="absolute inset-y-0 left-0 w-1" /><p className="adm-kicker text-[var(--adm-blue-700)]">Kiválasztott kommunikáció</p><h2 className="adm-heading mt-1 text-[19px]">{item.subject || "Nincs tárgy"}</h2></div>
      <div className="space-y-4 p-4">
        <div><p className="text-[12px] font-semibold text-[var(--adm-text)]">{item.senderName || item.senderEmail || "Nincs feladóadat"}</p><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{formatContact(item)}</p></div>
        {item.summary || item.contentPreview ? <p className="border-l-2 border-[var(--adm-blue-500)] pl-3 text-[11px] leading-5 text-[var(--adm-text-muted)]">{item.summary || item.contentPreview}</p> : null}
        <div className="flex flex-wrap gap-1"><StatusChip>{sourceLabel(item)}</StatusChip><StatusChip>{signal.direction === "incoming" ? "Bejövő" : "Kimenő"}</StatusChip><StatusChip>{signal.audience === "external" ? "Külső" : "Belső"}</StatusChip><StatusChip>{formatCommunicationType(item.type)}</StatusChip>{item.attachmentCount > 0 ? <StatusChip>{item.attachmentCount} melléklet</StatusChip> : null}{item.sourceTaskCount > 0 ? <StatusChip>{item.sourceTaskCount} feladat</StatusChip> : null}</div>
        <dl className="grid grid-cols-[92px_1fr] gap-2 text-[11px]"><dt className="text-[var(--adm-text-muted)]">Ügyfél</dt><dd className="font-semibold text-[var(--adm-text)]">{relatedClient?.name || (item.clientId ? "Ügyfélhez sorolt" : "Nincs ügyfél")}</dd><dt className="text-[var(--adm-text-muted)]">Ügy</dt><dd className="font-semibold text-[var(--adm-text)]">{relatedCase ? `${relatedCase.caseNumber} · ${relatedCase.title}` : item.caseId ? "Ügyhöz sorolt" : "Nincs ügy"}</dd><dt className="text-[var(--adm-text-muted)]">Idő</dt><dd className="font-semibold text-[var(--adm-text)]">{formatDate(item.createdAt)}</dd></dl>
        {item.sourceTaskCount > 0 ? <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Kapcsolt feladat</p>{linkedTasksLoading ? <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">Betöltés…</p> : linkedTasks.length ? <div className="mt-2 space-y-1">{linkedTasks.map((task) => <Link key={task.id} href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block text-[11px] font-semibold text-[var(--adm-blue-700)] hover:underline">{task.title} · {task.status}</Link>)}</div> : <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">A feladatkapcsolat részlete nem érhető el.</p>}</div> : null}
        <div className="flex flex-wrap gap-2">{item.caseId ? <Link href={`/cases/${encodeURIComponent(item.caseId)}`} className="adm-link-button px-3 py-2 text-[10px]">Ügy megnyitása</Link> : null}{item.clientId ? <Link href={`/clients/${encodeURIComponent(item.clientId)}`} className="adm-link-button px-3 py-2 text-[10px]">Ügyfél megnyitása</Link> : null}{item.caseId && item.documentId ? <Link href={`/documents/compare?caseId=${encodeURIComponent(item.caseId)}&documentId=${encodeURIComponent(item.documentId)}`} className="adm-link-button px-3 py-2 text-[10px]">Dokumentum megnyitása</Link> : null}</div>
        <div className="border-t border-[var(--adm-border)] pt-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Következő lépés</p><div className="grid gap-2">{item.caseId ? <><button type="button" onClick={() => onCreateTask(item)} className="bg-[var(--adm-green-800)] px-3 py-2 text-[11px] font-semibold text-white">Új feladat létrehozása</button><button type="button" onClick={() => onLinkTask(item)} className="border border-[var(--adm-blue-700)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-blue-700)]">Meglévő feladathoz</button></> : <><button type="button" onClick={() => onAssign(item)} className="bg-[var(--adm-blue-700)] px-3 py-2 text-[11px] font-semibold text-white">Meglévő ügyhöz rendelés</button><button type="button" onClick={() => onCreateCase(item)} className="border border-[var(--adm-blue-700)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-blue-700)]">Új ügy indítása</button></>}</div></div>
      </div>
    </div>
  );
}

function SimpleModal({ title, subtitle, children, busy, feedback, onClose, onSubmit, submitLabel, submitDisabled, successLink }: { title: string; subtitle: string; children: ReactNode; busy: boolean; feedback: Feedback | null; onClose: () => void; onSubmit: () => void; submitLabel: string; submitDisabled?: boolean; successLink?: { href: string; label: string } }) {
  const succeeded = feedback?.tone === "success";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md border border-[var(--adm-border)] bg-white shadow-2xl">
        <div className="border-b border-[var(--adm-border)] px-4 py-3"><h2 className="adm-heading text-[19px]">{title}</h2><p className="mt-1 truncate text-[10px] text-[var(--adm-text-muted)]">{subtitle}</p></div>
        <div className="space-y-3 p-4">{children}{feedback ? <p className={`border px-3 py-2 text-[11px] font-semibold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : feedback.tone === "info" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-800"}`}>{feedback.message}</p> : null}{succeeded && successLink ? <Link href={successLink.href} className="adm-link-button inline-flex px-3 py-2 text-[10px]">{successLink.label}</Link> : null}</div>
        <div className="flex justify-end gap-2 border-t border-[var(--adm-border)] px-4 py-3"><button type="button" disabled={busy} onClick={onClose} className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">{succeeded ? "Bezárás" : "Mégse"}</button>{!succeeded ? <button type="button" disabled={busy || submitDisabled} onClick={onSubmit} className="bg-[var(--adm-blue-700)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{busy ? "Mentés…" : submitLabel}</button> : null}</div>
      </div>
    </div>
  );
}

function StatusChip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-1 text-[9px] font-bold text-[var(--adm-blue-700)]">{children}</span>;
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <div className="p-5 text-center"><p className="text-[12px] font-semibold text-[var(--adm-text)]">{title}</p>{detail ? <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{detail}</p> : null}</div>;
}

function apiFeedback(error: unknown, fallback: string): Feedback {
  if (error instanceof ApiError && error.status === 501) return { tone: "info", message: "A művelet nincs bekapcsolva ezen a környezeten." };
  if (error instanceof ApiError && error.status === 401) return { tone: "error", message: "Jelentkezz be újra, majd próbáld újra." };
  if (error instanceof ApiError && error.status === 409) {
    const knownConflict = error.message === "A kommunikáció már ehhez az ügyhöz tartozik." || error.message === "Ez a feladat már ehhez a kommunikációhoz tartozik.";
    return { tone: "error", message: knownConflict ? error.message : "A művelet ütközik a jelenlegi állapottal." };
  }
  return { tone: "error", message: fallback };
}

function formatContact(item: CommunicationItem) {
  if (item.senderEmail && item.recipientEmail) return `${item.senderEmail} → ${item.recipientEmail}`;
  return item.senderEmail || item.recipientEmail || item.recipientName || "Nincs kapcsolati adat";
}

function sourceLabel(item: CommunicationItem) {
  if (isDemoFixture(item)) return "Demo adat";
  if (item.source === "OUTLOOK") return "Outlook";
  if (item.source === "MANUAL") return "Rögzített kommunikáció";
  return item.type === "NOTE" ? "Belső" : "Kommunikáció";
}

function isDemoFixture(item: CommunicationItem) {
  return [item.senderEmail, item.recipientEmail].some((email) => String(email || "").toLowerCase().endsWith("@fixture.invalid"));
}

function formatCommunicationType(type: CommunicationItem["type"]) {
  return ({ EMAIL: "E-mail", PHONE: "Telefon", MEETING: "Megbeszélés", LETTER: "Levél", NOTE: "Jegyzet" } as const)[type] || type;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
