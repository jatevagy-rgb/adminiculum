"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getTimeEntries,
  getMatters,
  getClients,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  type TimeEntry,
  type Matter,
  type Client,
  type CreateTimeEntryData,
  type UpdateTimeEntryData,
  getTimesheetReportTemplates,
  getTimesheetReportPresets,
  resolveTimesheetPreset,
  autofillTimesheetReportRows,
  generateTimesheetReportPayload,
  renderTimesheetReportOutput,
  renderTimesheetReportDocxOutput,
  listTimesheetReportInstances,
  getTimesheetReportInstance,
  createTimesheetReportInstance,
  updateTimesheetReportInstance,
  renderTimesheetReportInstanceOutput,
  renderTimesheetReportInstanceDocxOutput,
  listTimesheetReportArtifacts,
  getTimesheetReportArtifact,
  type TimesheetReportTemplate,
  type TimesheetPreset,
  type GeneratedTimesheetReportPayload,
  type RenderedTimesheetReportPayload,
  type TimesheetReportInstancePayload,
  type TimesheetReportArtifactPayload,
  type SaveTimesheetReportInstanceInput,
  getCaseSummary,
} from "@/lib/api";

const WORK_TYPES = ["TANÁCSADÁS", "IRATELENÉS", "FELÜLVIZSGÁLAT", "KOMMUNIKÁCIÓ", "KUTATÁS", "EGYÉB"];

// Maps Prisma WorkType enum values → Hungarian display labels used in the form
const WORK_TYPE_LABEL_MAP: Record<string, string> = {
  CLIENT_CALL: "KOMMUNIKÁCIÓ",  // Form uses KOMMUNIKÁCIÓ for client calls
  LEGAL_RESEARCH: "KUTATÁS",      // Form uses KUTATÁS for legal research
  DRAFTING: "IRATELENÉS",
  REVIEW: "FELÜLVIZSGÁLAT",
  OTHER: "EGYÉB",
};

// Maps Hungarian form labels → Prisma WorkType enum values (for saving)
// Note: TÁRGYALÁS and TANÁCSADÁS are deprecated form labels kept for backward
// compatibility. All client-call entries use KOMMUNIKÁCIÓ; all research entries
// use KUTATÁS as the canonical form label.
const WORK_TYPE_VALUE_MAP: Record<string, string> = {
  "KOMMUNIKÁCIÓ": "CLIENT_CALL",
  "IRATELENÉS": "DRAFTING",
  "FELÜLVIZSGÁLAT": "REVIEW",
  "KUTATÁS": "LEGAL_RESEARCH",
  "EGYÉB": "OTHER",
  // Deprecated: kept so existing data using these labels still round-trips
  "TÁRGYALÁS": "CLIENT_CALL",
  "TANÁCSADÁS": "LEGAL_RESEARCH",
};

type GroupedClient = {
  clientId: string;
  clientName: string;
  totalMinutes: number;
  totalEntries: number;
  cases: Array<{
    caseKey: string;
    caseId: string | null;
    caseNumber: string | null;
    caseTitle: string;
    sourceMatterId: string | null;
    linkageMode: "resolved-case" | "matter-only" | "ambiguous";
    candidateCaseCount: number;
    totalMinutes: number;
    entries: TimeEntry[];
  }>;
};

export default function TimeEntriesPage() {
  return (
    <AuthenticatedApp section="time-entries">
      <TimeEntriesPageContent />
    </AuthenticatedApp>
  );
}

function TimeEntriesPageContent() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [templates, setTemplates] = useState<TimesheetReportTemplate[]>([]);
  const [presets, setPresets] = useState<TimesheetPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [reportPeriod, setReportPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [reportClientName, setReportClientName] = useState<string>("");
  const [reportMatterName, setReportMatterName] = useState<string>("");
  const [reportCaseReference, setReportCaseReference] = useState<string>("");
  const [reportMonthlyClosure, setReportMonthlyClosure] = useState<string>("");
  const [reportPendingNote, setReportPendingNote] = useState<string>("");
  const [reportClientClosingText, setReportClientClosingText] = useState<string>("");
  const [reportDefaultLawyerName, setReportDefaultLawyerName] = useState<string>("");
  const [presetClientContextId, setPresetClientContextId] = useState<string>("");
  const [presetLawyerContextName, setPresetLawyerContextName] = useState<string>("");
  const [lastPresetResolution, setLastPresetResolution] = useState<TimesheetPreset["resolution"] | null>(null);
  const [reportCarriedHours, setReportCarriedHours] = useState<number>(0);
  const [reportOvertimeHours, setReportOvertimeHours] = useState<number>(0);
  const [reportAboveThresholdHours, setReportAboveThresholdHours] = useState<number>(0);
  const [autofillClientId, setAutofillClientId] = useState<string>("");
  const [autofillMatterId, setAutofillMatterId] = useState<string>("");
  const [autofillCaseId, setAutofillCaseId] = useState<string>("");
  const [autofillLawyerName, setAutofillLawyerName] = useState<string>("");
  const [autofillBillableOnly, setAutofillBillableOnly] = useState<boolean>(true);
  const [reportRows, setReportRows] = useState<Array<{ date?: string; description: string; lawyer: string; hours: number }>>([
    { date: new Date().toISOString().slice(0, 10), description: "", lawyer: "", hours: 1 },
  ]);
  const [generatedReport, setGeneratedReport] = useState<GeneratedTimesheetReportPayload | null>(null);
  const [renderedReport, setRenderedReport] = useState<RenderedTimesheetReportPayload | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isAutofillingRows, setIsAutofillingRows] = useState(false);
  const [savedReportInstances, setSavedReportInstances] = useState<TimesheetReportInstancePayload[]>([]);
  const [selectedReportInstanceId, setSelectedReportInstanceId] = useState<string | null>(null);
  const [isLoadingReportInstances, setIsLoadingReportInstances] = useState(false);
  const [isSavingReportInstance, setIsSavingReportInstance] = useState(false);
  const [reportArtifacts, setReportArtifacts] = useState<TimesheetReportArtifactPayload[]>([]);
  const [isLoadingReportArtifacts, setIsLoadingReportArtifacts] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [expandedCaseKeys, setExpandedCaseKeys] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<CreateTimeEntryData>({
    matterId: "",
    workType: "TANÁCSADÁS",
    description: "",
    minutes: 60,
    workDate: new Date().toISOString().split("T")[0],
    billable: true,
  });

  // Optional deep-link context: /time-entries?matterId=... or ?caseId=...
  const searchParams = useSearchParams();
  const deepLinkedMatterId = searchParams?.get("matterId") ?? null;
  const deepLinkedCaseId = searchParams?.get("caseId") ?? null;
  const [prefilledMatterId, setPrefilledMatterId] = useState<string | null>(null);
  const [caseResolutionState, setCaseResolutionState] = useState<{
    status: "idle" | "loading" | "found" | "not_found";
    caseLabel: string | null;
    matterId: string | null;
    matterLabel: string | null;
  }>({ status: "idle", caseLabel: null, matterId: null, matterLabel: null });

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLoadWarning(null);
    try {
      const [entriesResult, mattersResult, clientsResult] = await Promise.allSettled([
        getTimeEntries(),
        getMatters(),
        getClients(),
      ]);

      const nextWarnings: string[] = [];

      if (entriesResult.status !== "fulfilled") {
        throw entriesResult.reason;
      }
      setEntries(entriesResult.value);

      if (mattersResult.status === "fulfilled") {
        setMatters(mattersResult.value);
      } else {
        setMatters([]);
        nextWarnings.push("A munkacsomag adatok betöltése részlegesen sikertelen.");
      }

      if (clientsResult.status === "fulfilled") {
        setClients(clientsResult.value.data || []);
      } else {
        setClients([]);
        nextWarnings.push("Az ügyfél adatok átmenetileg nem érhetők el.");
      }

      setLoadWarning(nextWarnings[0] || null);
    } catch (err) {
      console.error("Failed to load work hours:", err);
      setError("Nem sikerült betölteni a munkaórákat.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const [data, presetsData] = await Promise.all([
          getTimesheetReportTemplates(),
          getTimesheetReportPresets(),
        ]);
        setTemplates(data);
        setPresets(presetsData);
        if (data.length > 0) {
          setSelectedTemplateId((current) => current || data[0].id);
        }
        if (presetsData.length > 0) {
          setSelectedPresetId((current) => current || presetsData[0].id);
        }
      } catch (err) {
        console.error("Failed to load timesheet report templates:", err);
      }
    };
    loadTemplates();
  }, []);

  const loadReportInstances = useCallback(async () => {
    setIsLoadingReportInstances(true);
    try {
      const items = await listTimesheetReportInstances(30);
      setSavedReportInstances(items);
    } catch (err) {
      console.error("Failed to load saved timesheet report instances:", err);
    } finally {
      setIsLoadingReportInstances(false);
    }
  }, []);

  useEffect(() => {
    loadReportInstances();
  }, [loadReportInstances]);

  const loadReportArtifacts = useCallback(async (instanceId: string) => {
    setIsLoadingReportArtifacts(true);
    try {
      const items = await listTimesheetReportArtifacts(instanceId, 50);
      setReportArtifacts(items);
    } catch (err) {
      console.error("Failed to load timesheet report artifacts:", err);
      setReportArtifacts([]);
    } finally {
      setIsLoadingReportArtifacts(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedReportInstanceId) {
      setReportArtifacts([]);
      return;
    }
    loadReportArtifacts(selectedReportInstanceId);
  }, [selectedReportInstanceId, loadReportArtifacts]);

  // Once matters are loaded, resolve deep-linked matterId or caseId to a real matter
  useEffect(() => {
    if (prefilledMatterId) return; // already resolved
    if (!matters.length) return;

    if (deepLinkedMatterId) {
      const hasMatch = matters.some((m) => m.id === deepLinkedMatterId);
      if (hasMatch) {
        setPrefilledMatterId(deepLinkedMatterId);
      }
      return;
    }

    if (deepLinkedCaseId) {
      // First try: find a time entry already linked to this case
      const entryWithCase = entries.find((e) => e.matter?.cases?.some((c) => c.id === deepLinkedCaseId));
      if (entryWithCase?.matterId) {
        setPrefilledMatterId(entryWithCase.matterId);
        setCaseResolutionState((s) => ({ ...s, status: "found", matterId: entryWithCase.matterId, matterLabel: null }));
        return;
      }

      // Second try: fetch case summary to get matterId directly
      setCaseResolutionState((s) => s.status === "idle" ? { ...s, status: "loading" } : s);
      getCaseSummary(deepLinkedCaseId)
        .then((summary) => {
          const caseLabel = summary.case.caseNumber
            ? `${summary.case.caseNumber} · ${summary.case.title}`
            : summary.case.title;
          const matterId = summary.case.matterId || null;
          const matterLabel = matterId ? (matters.find((m) => m.id === matterId)?.title || null) : null;
          if (matterId) {
            setPrefilledMatterId(matterId);
            setCaseResolutionState({ status: "found", caseLabel, matterId, matterLabel });
          } else {
            setCaseResolutionState({ status: "not_found", caseLabel, matterId: null, matterLabel: null });
          }
        })
        .catch(() => {
          setCaseResolutionState({ status: "not_found", caseLabel: null, matterId: null, matterLabel: null });
        });
    }
  }, [deepLinkedMatterId, deepLinkedCaseId, prefilledMatterId, matters, entries]);

  const formatMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} ó ${m} p` : `${m} p`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("hu-HU", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const matterById = useMemo(() => {
    const map = new Map<string, Matter>();
    for (const matter of matters) {
      map.set(matter.id, matter);
    }
    return map;
  }, [matters]);

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const client of clients) {
      map.set(client.id, client.name);
    }
    return map;
  }, [clients]);

  const matterCaseHintByMatterId = useMemo(() => {
    const map = new Map<string, { caseId: string; label: string }>();

    for (const entry of entries) {
      const linkedCases = entry.matter?.cases || [];
      if (!linkedCases.length) continue;

      const sortedCases = [...linkedCases].sort((a, b) => {
        const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTs - aTs;
      });
      const best = sortedCases[0];
      if (!best) continue;

      map.set(entry.matterId, {
        caseId: best.id,
        label: best.caseNumber ? `${best.caseNumber} · ${best.title}` : best.title,
      });
    }

    return map;
  }, [entries]);

  const groupedByClient: GroupedClient[] = useMemo(() => {
    const clientsMap = new Map<string, GroupedClient>();

    for (const entry of entries) {
      const sourceMatter = matterById.get(entry.matterId);
      const entryMatter = entry.matter || sourceMatter || null;
      const linkedCases = entry.matter?.cases || [];
      const resolvedCase = linkedCases.length === 1 ? linkedCases[0] : null;

      const resolvedClientId = entryMatter?.clientId || resolvedCase?.clientId || "unassigned";
      const resolvedClientName =
        entryMatter?.client?.name ||
        resolvedCase?.clientName ||
        clientNameById.get(resolvedClientId) ||
        "Nincs ügyfélhez rendelve";

      if (!clientsMap.has(resolvedClientId)) {
        clientsMap.set(resolvedClientId, {
          clientId: resolvedClientId,
          clientName: resolvedClientName,
          totalMinutes: 0,
          totalEntries: 0,
          cases: [],
        });
      }

      const clientBucket = clientsMap.get(resolvedClientId)!;
      clientBucket.totalMinutes += entry.minutes;
      clientBucket.totalEntries += 1;

      const linkageMode: GroupedClient["cases"][number]["linkageMode"] =
        resolvedCase ? "resolved-case" : linkedCases.length > 1 ? "ambiguous" : "matter-only";

      const caseKey =
        linkageMode === "resolved-case"
          ? `case-${resolvedCase!.id}`
          : linkageMode === "ambiguous"
            ? `ambiguous-matter-${entry.matterId || "unassigned"}`
            : `matter-${entry.matterId || "unassigned"}`;

      const caseTitle =
        linkageMode === "resolved-case"
          ? resolvedCase!.title
          : linkageMode === "ambiguous"
            ? `${entryMatter?.title || "Névtelen munkacsomag"} (több lehetséges ügy)`
            : `${entryMatter?.title || "Névtelen munkacsomag"} (ügykapcsolat nincs)`;

      const caseNumber = linkageMode === "resolved-case" ? resolvedCase!.caseNumber : null;

      let caseBucket = clientBucket.cases.find((item) => item.caseKey === caseKey);
      if (!caseBucket) {
        caseBucket = {
          caseKey,
          caseId: linkageMode === "resolved-case" ? resolvedCase!.id : null,
          caseNumber,
          caseTitle,
          sourceMatterId: entry.matterId || null,
          linkageMode,
          candidateCaseCount: linkedCases.length,
          totalMinutes: 0,
          entries: [],
        };
        clientBucket.cases.push(caseBucket);
      }

      caseBucket.totalMinutes += entry.minutes;
      caseBucket.entries.push(entry);
    }

    return Array.from(clientsMap.values())
      .map((clientGroup) => ({
        ...clientGroup,
        cases: clientGroup.cases
          .map((caseGroup) => ({
            ...caseGroup,
            entries: [...caseGroup.entries].sort((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime()),
          }))
          .sort((a, b) => b.totalMinutes - a.totalMinutes),
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [entries, matterById, clientNameById]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    let missingMatterCount = 0;
    let unresolvedCaseLinkCount = 0;

    for (const entry of entries) {
      const sourceMatter = matterById.get(entry.matterId);
      if (!sourceMatter) {
        missingMatterCount += 1;
        continue;
      }

      const linkedCases = entry.matter?.cases || [];
      if (linkedCases.length !== 1) {
        unresolvedCaseLinkCount += 1;
      }
    }

    console.info("[munkaorak:grouping_diagnostics]", {
      totalEntries: entries.length,
      totalClients: groupedByClient.length,
      missingMatterCount,
      unresolvedCaseLinkCount,
      exactResolvedCaseCount: entries.length - unresolvedCaseLinkCount - missingMatterCount,
      unresolvedRate:
        entries.length > 0
          ? Number(((unresolvedCaseLinkCount / entries.length) * 100).toFixed(2))
          : 0,
    });
  }, [entries, groupedByClient.length, matterById]);

  useEffect(() => {
    if (!groupedByClient.length) {
      setSelectedClientId(null);
      return;
    }
    if (!selectedClientId || !groupedByClient.some((group) => group.clientId === selectedClientId)) {
      setSelectedClientId(groupedByClient[0].clientId);
    }
  }, [groupedByClient, selectedClientId]);

  const selectedClientGroup = useMemo(
    () => groupedByClient.find((group) => group.clientId === selectedClientId) || null,
    [groupedByClient, selectedClientId]
  );

  const totals = useMemo(() => {
    const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
    const billableMinutes = entries.reduce((sum, entry) => sum + (entry.billable ? entry.minutes : 0), 0);
    const nonBillableMinutes = Math.max(totalMinutes - billableMinutes, 0);
    return {
      totalEntries: entries.length,
      totalMinutes,
      totalClients: groupedByClient.length,
      billableMinutes,
      nonBillableMinutes,
    };
  }, [entries, groupedByClient.length]);

  const modalCaseOptions = useMemo(
    () =>
      matters
        .map((matter) => {
          const clientName = matter.client?.name || clientNameById.get(matter.clientId) || "Ismeretlen ügyfél";
          const caseHint = matterCaseHintByMatterId.get(matter.id);
          return {
            matterId: matter.id,
            label: `${caseHint ? `${caseHint.label} · ` : ""}${matter.title} · ${clientName}`,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "hu")),
    [matters, clientNameById, matterCaseHintByMatterId]
  );

  const reportClientOptions = useMemo(
    () =>
      clients
        .map((client) => ({ id: client.id, name: client.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "hu")),
    [clients]
  );

  const reportMatterOptions = useMemo(
    () =>
      matters
        .filter((matter) => !autofillClientId || matter.clientId === autofillClientId)
        .map((matter) => ({
          id: matter.id,
          name: matter.title,
          clientId: matter.clientId,
          clientName: matter.client?.name || clientNameById.get(matter.clientId) || "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "hu")),
    [matters, autofillClientId, clientNameById]
  );

  const reportCaseOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const entry of entries) {
      const linkedCases = entry.matter?.cases || [];
      for (const linkedCase of linkedCases) {
        const matter = matterById.get(entry.matterId);
        if (autofillClientId) {
          const caseClientId = linkedCase.clientId || matter?.clientId;
          if (caseClientId !== autofillClientId) continue;
        }
        if (autofillMatterId && entry.matterId !== autofillMatterId) continue;
        if (!map.has(linkedCase.id)) {
          map.set(linkedCase.id, {
            id: linkedCase.id,
            label: linkedCase.caseNumber ? `${linkedCase.caseNumber} · ${linkedCase.title}` : linkedCase.title,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "hu"));
  }, [entries, matterById, autofillClientId, autofillMatterId]);

  const reportLawyerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      if (entry.user?.name) {
        map.set(entry.user.name, entry.user.name);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "hu"));
  }, [entries]);

  const handleCreate = () => {
    setEditingEntry(null);
    setFormData({
      matterId: prefilledMatterId ?? "",
      workType: "TANÁCSADÁS",
      description: "",
      minutes: 60,
      workDate: new Date().toISOString().split("T")[0],
      billable: true,
    });
    setShowModal(true);
  };

  const handleEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    // Map Prisma enum value back to Hungarian label for the form select
    const displayWorkType = WORK_TYPE_LABEL_MAP[entry.workType] ?? entry.workType;
    setFormData({
      matterId: entry.matterId,
      workType: displayWorkType,
      description: entry.description,
      minutes: entry.minutes,
      workDate: entry.workDate ? entry.workDate.split("T")[0] : "",
      billable: entry.billable ?? true,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.matterId?.trim()) {
      alert("Ügyhöz kapcsolt munkacsomag kiválasztása kötelező");
      return;
    }
    if (!formData.description?.trim()) {
      alert("Leírás megadása kötelező");
      return;
    }
    if (!formData.minutes || formData.minutes <= 0) {
      alert("A percek száma legyen nagyobb mint 0");
      return;
    }

    setIsSaving(true);
    try {
      if (editingEntry) {
        const updateData: UpdateTimeEntryData = {
          workType: WORK_TYPE_VALUE_MAP[formData.workType] ?? formData.workType,
          description: formData.description,
          minutes: formData.minutes,
          workDate: formData.workDate,
          billable: formData.billable,
        };
        await updateTimeEntry(editingEntry.id, updateData);
      } else {
        await createTimeEntry({
          matterId: formData.matterId,
          workType: WORK_TYPE_VALUE_MAP[formData.workType] ?? formData.workType,
          description: formData.description,
          minutes: formData.minutes,
          workDate: formData.workDate,
          billable: formData.billable,
        });
      }
      setShowModal(false);
      await loadEntries();
    } catch (err) {
      console.error("Failed to save work hour entry:", err);
      alert("Nem sikerült menteni a bejegyzést");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    try {
      await deleteTimeEntry(entryId);
      setDeleteConfirm(null);
      await loadEntries();
    } catch (err) {
      console.error("Failed to delete work hour entry:", err);
      alert("Nem sikerült törölni a bejegyzést");
    }
  };

  const toggleCaseExpanded = (caseKey: string) => {
    setExpandedCaseKeys((current) => ({ ...current, [caseKey]: !current[caseKey] }));
  };

  const addReportRow = () => {
    setReportRows((rows) => [...rows, { date: "", description: "", lawyer: "", hours: 1 }]);
  };

  const updateReportRow = (index: number, patch: Partial<{ date?: string; description: string; lawyer: string; hours: number }>) => {
    setReportRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeReportRow = (index: number) => {
    setReportRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  };

  const handleGenerateReportPayload = async () => {
    if (!selectedTemplateId || !reportPeriod || !reportClientName.trim()) {
      alert("Sablon, időszak és ügyfél kötelező");
      return;
    }

    setIsGeneratingReport(true);
    try {
      const payload = await generateTimesheetReportPayload({
        templateId: selectedTemplateId,
        reportPeriod,
        clientName: reportClientName.trim(),
        matterName: reportMatterName.trim() || undefined,
        caseReference: reportCaseReference.trim() || undefined,
        monthlyClosure: reportMonthlyClosure.trim() || undefined,
        pendingOpenMattersNote:
          [reportPendingNote.trim(), reportClientClosingText.trim()].filter(Boolean).join("\n") || undefined,
        carriedHours: Number(reportCarriedHours || 0),
        overtimeHours: Number(reportOvertimeHours || 0),
        aboveThresholdHours: Number(reportAboveThresholdHours || 0),
        rows: reportRows.map((row) => ({
          date: row.date,
          description: row.description,
          lawyer: row.lawyer,
          hours: Number(row.hours),
        })),
      });
      setGeneratedReport(payload);
      setRenderedReport(null);
    } catch (err) {
      console.error("Failed to generate timesheet report payload:", err);
      alert("Nem sikerült a munkaóra-kimutatás payload generálása");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleRenderReportOutput = async () => {
    if (!selectedTemplateId || !reportPeriod || !reportClientName.trim()) {
      alert("Sablon, időszak és ügyfél kötelező");
      return;
    }

    setIsGeneratingReport(true);
    try {
      const payload = selectedReportInstanceId
        ? await renderTimesheetReportInstanceOutput(selectedReportInstanceId)
        : await renderTimesheetReportOutput({
            templateId: selectedTemplateId,
            reportPeriod,
            clientName: reportClientName.trim(),
            matterName: reportMatterName.trim() || undefined,
            caseReference: reportCaseReference.trim() || undefined,
            monthlyClosure: reportMonthlyClosure.trim() || undefined,
            pendingOpenMattersNote:
              [reportPendingNote.trim(), reportClientClosingText.trim()].filter(Boolean).join("\n") || undefined,
            carriedHours: Number(reportCarriedHours || 0),
            overtimeHours: Number(reportOvertimeHours || 0),
            aboveThresholdHours: Number(reportAboveThresholdHours || 0),
            rows: reportRows.map((row) => ({
              date: row.date,
              description: row.description,
              lawyer: row.lawyer,
              hours: Number(row.hours),
            })),
          });
      setRenderedReport(payload);
      setGeneratedReport(payload);
      if (selectedReportInstanceId) {
        await loadReportArtifacts(selectedReportInstanceId);
      }
    } catch (err) {
      console.error("Failed to render timesheet report output:", err);
      alert("Nem sikerült az output-ready munkaóra-kimutatás renderelése");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleRenderReportDocxOutput = async () => {
    if (!selectedTemplateId || !reportPeriod || !reportClientName.trim()) {
      alert("Sablon, időszak és ügyfél kötelező");
      return;
    }

    setIsGeneratingReport(true);
    try {
      const payload = selectedReportInstanceId
        ? await renderTimesheetReportInstanceDocxOutput(selectedReportInstanceId)
        : await renderTimesheetReportDocxOutput({
            templateId: selectedTemplateId,
            reportPeriod,
            clientName: reportClientName.trim(),
            matterName: reportMatterName.trim() || undefined,
            caseReference: reportCaseReference.trim() || undefined,
            monthlyClosure: reportMonthlyClosure.trim() || undefined,
            pendingOpenMattersNote:
              [reportPendingNote.trim(), reportClientClosingText.trim()].filter(Boolean).join("\n") || undefined,
            carriedHours: Number(reportCarriedHours || 0),
            overtimeHours: Number(reportOvertimeHours || 0),
            aboveThresholdHours: Number(reportAboveThresholdHours || 0),
            rows: reportRows.map((row) => ({
              date: row.date,
              description: row.description,
              lawyer: row.lawyer,
              hours: Number(row.hours),
            })),
          });
      setRenderedReport(payload);
      setGeneratedReport(payload);
      if (selectedReportInstanceId) {
        await loadReportArtifacts(selectedReportInstanceId);
      }
    } catch (err) {
      console.error("Failed to render timesheet report DOCX output:", err);
      alert("Nem sikerült a DOCX output-ready munkaóra-kimutatás renderelése");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadRenderedOutput = () => {
    if (!renderedReport?.renderedOutput) return;
    let blob: Blob;
    if (renderedReport.renderedOutput.format === "DOCX_V1" && renderedReport.renderedOutput.contentBase64) {
      const binary = atob(renderedReport.renderedOutput.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: renderedReport.renderedOutput.mimeType });
    } else {
      blob = new Blob([renderedReport.renderedOutput.content || ""], { type: renderedReport.renderedOutput.mimeType });
    }
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = renderedReport.renderedOutput.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadArtifact = async (artifactId: string) => {
    if (!selectedReportInstanceId) return;
    try {
      const artifact = await getTimesheetReportArtifact(selectedReportInstanceId, artifactId);
      let blob: Blob;
      if (artifact.format === "DOCX_V1" && artifact.contentBase64) {
        const binary = atob(artifact.contentBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: artifact.mimeType });
      } else {
        blob = new Blob([artifact.content || ""], { type: artifact.mimeType });
      }
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download saved artifact:", err);
      alert("Nem sikerült letölteni a korábbi renderelt outputot");
    }
  };

  const handleApplyPreset = async () => {
    try {
      const resolvedContextClientName =
        reportClientOptions.find((item) => item.id === presetClientContextId)?.name ||
        reportClientName ||
        undefined;
      const resolvedContextLawyerName = presetLawyerContextName || reportDefaultLawyerName || undefined;

      const preset = await resolveTimesheetPreset({
        presetId: selectedPresetId || undefined,
        templateId: selectedTemplateId || undefined,
        clientId: presetClientContextId || autofillClientId || undefined,
        clientName: resolvedContextClientName,
        lawyerName: resolvedContextLawyerName,
      });

      if (preset.templateId) {
        setSelectedTemplateId(preset.templateId);
      }
      setReportMonthlyClosure((current) => (current.trim().length > 0 ? current : preset.defaults.monthlyClosure || ""));
      setReportPendingNote((current) => (current.trim().length > 0 ? current : preset.defaults.pendingOpenMattersNote || ""));
      setReportClientClosingText((current) => (current.trim().length > 0 ? current : preset.defaults.clientClosingText || ""));
      setReportDefaultLawyerName((current) => (current.trim().length > 0 ? current : preset.defaults.lawyerName || current));
      setLastPresetResolution(preset.resolution || null);
    } catch (err) {
      console.error("Failed to apply timesheet preset:", err);
      alert("Nem sikerült a preset alkalmazása");
    }
  };

  const handleAutofillRows = async () => {
    if (!reportPeriod) {
      alert("Időszak kötelező az automatikus sorbetöltéshez");
      return;
    }

    setIsAutofillingRows(true);
    try {
      const result = await autofillTimesheetReportRows({
        reportPeriod,
        clientId: autofillClientId || undefined,
        matterId: autofillMatterId || undefined,
        caseId: autofillCaseId || undefined,
        lawyerName: autofillLawyerName.trim() || undefined,
        billableOnly: autofillBillableOnly,
      });

      const fallbackLawyer = reportDefaultLawyerName.trim() || autofillLawyerName.trim();
      const mergedRows = result.rows.map((row) => ({
        date: row.date,
        description: row.description,
        lawyer: row.lawyer || fallbackLawyer || "",
        hours: Number(row.hours || 0),
      }));

      if (mergedRows.length === 0) {
        alert("A kiválasztott szűrőkre nem található mentett munkaóra");
      }

      setReportRows(mergedRows.length > 0 ? mergedRows : [{ date: "", description: "", lawyer: fallbackLawyer, hours: 1 }]);
    } catch (err) {
      console.error("Failed to autofill timesheet rows:", err);
      alert("Nem sikerült a sorok automatikus betöltése");
    } finally {
      setIsAutofillingRows(false);
    }
  };

  const buildInstanceInput = useCallback((): SaveTimesheetReportInstanceInput => {
    return {
      templateId: selectedTemplateId,
      reportPeriod,
      clientId: autofillClientId || undefined,
      clientName: reportClientName.trim() || undefined,
      matterId: autofillMatterId || undefined,
      matterName: reportMatterName.trim() || undefined,
      caseId: autofillCaseId || undefined,
      caseReference: reportCaseReference.trim() || undefined,
      presetId: selectedPresetId || undefined,
      monthlyClosure: reportMonthlyClosure.trim() || undefined,
      pendingOpenMattersNote: reportPendingNote.trim() || undefined,
      clientClosingText: reportClientClosingText.trim() || undefined,
      defaultLawyerName: reportDefaultLawyerName.trim() || undefined,
      carriedHours: Number(reportCarriedHours || 0),
      overtimeHours: Number(reportOvertimeHours || 0),
      aboveThresholdHours: Number(reportAboveThresholdHours || 0),
      rows: reportRows.map((row) => ({
        date: row.date,
        description: row.description,
        lawyer: row.lawyer,
        hours: Number(row.hours || 0),
      })),
      status: "DRAFT",
    };
  }, [
    selectedTemplateId,
    reportPeriod,
    autofillClientId,
    reportClientName,
    autofillMatterId,
    reportMatterName,
    autofillCaseId,
    reportCaseReference,
    selectedPresetId,
    reportMonthlyClosure,
    reportPendingNote,
    reportClientClosingText,
    reportDefaultLawyerName,
    reportCarriedHours,
    reportOvertimeHours,
    reportAboveThresholdHours,
    reportRows,
  ]);

  const applyLoadedInstanceToEditor = useCallback((instance: TimesheetReportInstancePayload) => {
    setSelectedReportInstanceId(instance.id);
    setSelectedTemplateId(instance.templateId);
    setReportPeriod(instance.reportPeriod);
    setReportClientName(instance.clientName || "");
    setReportMatterName(instance.matterName || "");
    setReportCaseReference(instance.caseReference || "");
    setReportMonthlyClosure(instance.monthlyClosure || "");
    setReportPendingNote(instance.pendingOpenMattersNote || "");
    setReportClientClosingText(instance.clientClosingText || "");
    setReportDefaultLawyerName(instance.defaultLawyerName || "");
    setReportCarriedHours(Number(instance.carriedHours || 0));
    setReportOvertimeHours(Number(instance.overtimeHours || 0));
    setReportAboveThresholdHours(Number(instance.aboveThresholdHours || 0));
    setAutofillClientId(instance.clientId || "");
    setAutofillMatterId(instance.matterId || "");
    setAutofillCaseId(instance.caseId || "");
    setReportRows(
      instance.rows.length > 0
        ? instance.rows.map((row) => ({
            date: row.date || row.taskDate || "",
            description: row.description,
            lawyer: row.lawyer,
            hours: Number(row.hours || 0),
          }))
        : [{ date: "", description: "", lawyer: "", hours: 1 }]
    );
    setGeneratedReport(null);
    setRenderedReport(null);
  }, []);

  const handleLoadReportInstance = async (instanceId: string) => {
    try {
      const instance = await getTimesheetReportInstance(instanceId);
      applyLoadedInstanceToEditor(instance);
    } catch (err) {
      console.error("Failed to load timesheet report instance:", err);
      alert("Nem sikerült betölteni a mentett riportot");
    }
  };

  const handleSaveReportInstance = async () => {
    if (!selectedTemplateId || !reportPeriod || !reportClientName.trim()) {
      alert("Sablon, időszak és ügyfél kötelező mentéshez");
      return;
    }

    setIsSavingReportInstance(true);
    try {
      const payload = buildInstanceInput();
      const saved = selectedReportInstanceId
        ? await updateTimesheetReportInstance(selectedReportInstanceId, payload)
        : await createTimesheetReportInstance(payload);
      setSelectedReportInstanceId(saved.id);
      await loadReportInstances();
    } catch (err) {
      console.error("Failed to save timesheet report instance:", err);
      alert("Nem sikerült menteni a riport példányt");
    } finally {
      setIsSavingReportInstance(false);
    }
  };

  return (
    <div className="flex-1 p-2 md:p-4 time-entries-surface bg-[#FBF6E7]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6 rounded-xl border border-[#DDD7CA] bg-white p-4">
            <div>
              <h1 className="text-2xl font-serif text-[#1F2821]">Munkaórák</h1>
              <p className="text-sm text-[#514D45] mt-1">Munkaóra-rögzítés és elszámolási munkapad</p>
              <p className="text-xs text-[#7B776D] mt-1">
                {totals.totalEntries} bejegyzés · {formatMinutes(totals.totalMinutes)} összesen
              </p>
              <p className="text-[10px] text-[#9C9890] mt-1">Nézet: ügyfél → ügy → bejegyzés</p>
            </div>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-[#1F4A33] text-[#FBF6E7] text-xs uppercase tracking-[0.2em] hover:bg-[#173824] transition-colors rounded self-start"
            >
              Munkaóra rögzítése
            </button>
          </div>

          {deepLinkedCaseId && caseResolutionState.status !== "idle" && (
            <div className="mb-5 rounded-xl border border-[#C9A227] bg-[#FBF9F3] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 bg-[#C9A227] text-white uppercase tracking-wide">Ügyhöz kapcsolt munkaóra</span>
                {caseResolutionState.status === "loading" ? (
                  <span className="text-xs text-[#7B776D]">Ügy betöltése...</span>
                ) : caseResolutionState.caseLabel ? (
                  <span className="text-xs text-[#1F2821] font-semibold">{caseResolutionState.caseLabel}</span>
                ) : (
                  <span className="text-xs text-[#1F2821]">Munkaóra-rögzítés ebben az ügyben</span>
                )}
                {caseResolutionState.matterLabel && (
                  <span className="text-[10px] text-[#7B776D]">· Munkacsomag: {caseResolutionState.matterLabel}</span>
                )}
                {caseResolutionState.status === "not_found" && (
                  <span className="text-[10px] text-[#9C9890] italic">
                    Az ügyhöz tartozó munkacsomag nem található. Válassz munkacsomagot kézzel.
                  </span>
                )}
                </div>
                <Link
                  href={`/cases/${deepLinkedCaseId}`}
                  className="px-3 py-1 text-[10px] border border-[#1F4A33] bg-[#1F4A33] text-[#FBF6E7] hover:bg-[#173824] rounded shrink-0"
                >
                  ← Vissza az ügyhöz
                </Link>
              </div>
              <p className="mt-2 text-[10px] text-[#7B776D]">
                Az időrögzítés az ügyhöz kapcsolt munkacsomaghoz történik, ha elérhető.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/cases/${deepLinkedCaseId}/documents`} className="px-2 py-1 text-[10px] border border-[#DDD7CA] bg-white text-[#1F2821] rounded hover:bg-[#F6F2E8]">
                  Dokumentumtár
                </Link>
                <Link href={`/cases/${deepLinkedCaseId}/communications`} className="px-2 py-1 text-[10px] border border-[#DDD7CA] bg-white text-[#1F2821] rounded hover:bg-[#F6F2E8]">
                  Kommunikáció
                </Link>
                <Link href={`/documents/compare?caseId=${deepLinkedCaseId}`} className="px-2 py-1 text-[10px] border border-[#B58A2A] bg-[#B58A2A] text-white rounded hover:bg-[#9C7723]">
                  Szerződés-workspace
                </Link>
                <Link href={`/cases/${deepLinkedCaseId}/handoff`} className="px-2 py-1 text-[10px] border border-[#DDD7CA] bg-white text-[#1F2821] rounded hover:bg-[#F6F2E8]">
                  Leadási csomag
                </Link>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 rounded border border-[#d4b8b8] bg-[#fef2f2] p-4 text-xs text-[#8b3a3a]">
              <p className="font-semibold">{error}</p>
              <p className="mt-1 text-[11px] text-[#6E4B4B]">
                A munkaóra-folyamat nem áll le: ellenőrizd a kapcsolatot, majd próbáld újra.
              </p>
              <button
                type="button"
                onClick={loadEntries}
                className="mt-2 inline-flex items-center justify-center rounded border border-[#8b3a3a] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#8b3a3a] hover:bg-[#fff7f6]"
              >
                Újrapróbálás
              </button>
            </div>
          )}
          {!error && loadWarning && <div className="mb-6 p-4 bg-[#FBF6E7] border border-[#E8DFC9] text-[#5F675F] text-xs rounded">{loadWarning}</div>}

          <div className="mb-6 border border-[#DDD7CA] rounded-xl bg-white p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#1F2821]">Munkaóra-kimutatás</h2>
              <p className="text-[10px] text-[#7B776D] mt-1">Preset, sorfeltöltés, riport és outputok egy munkapadban.</p>
            </div>

            <div className="border border-[#EEE7D9] rounded p-3 bg-[#FBF9F3] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#1F2821]">Mentett riport példányok</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadReportInstances}
                    disabled={isLoadingReportInstances}
                    className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded bg-white disabled:opacity-50"
                  >
                    {isLoadingReportInstances ? "Frissítés..." : "Frissít"}
                  </button>
                  <button
                    onClick={handleSaveReportInstance}
                    disabled={isSavingReportInstance}
                    className="px-3 py-1 text-[10px] rounded bg-[#1F4A33] text-[#FBF6E7] disabled:opacity-50"
                  >
                    {isSavingReportInstance ? "Mentés..." : selectedReportInstanceId ? "Példány frissítése" : "Új példány mentése"}
                  </button>
                </div>
              </div>
              <div className="max-h-40 overflow-auto border border-[#EEE7D9] rounded bg-white">
                {savedReportInstances.length === 0 ? (
                  <p className="p-2 text-[10px] text-[#7B776D]">Nincs mentett riport példány.</p>
                ) : (
                  savedReportInstances.map((instance) => {
                    const isActive = selectedReportInstanceId === instance.id;
                    return (
                      <button
                        key={instance.id}
                        onClick={() => handleLoadReportInstance(instance.id)}
                        className={`w-full text-left p-2 border-b border-[#F3EFE5] last:border-b-0 ${isActive ? "bg-[#F6F2E8]" : "hover:bg-[#FBF9F3]"}`}
                      >
                        <p className="text-xs text-[#1F2821]">
                          {instance.reportPeriod} · {instance.clientName || "Nincs ügyfél"}
                        </p>
                        <p className="text-[10px] text-[#7B776D]">
                          {instance.templateFamily} · {instance.rows.length} sor · {new Date(instance.updatedAt).toLocaleString("hu-HU")}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Preset</label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedPresetId}
                    onChange={(e) => setSelectedPresetId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  >
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={handleApplyPreset} className="px-3 py-2 text-[10px] border border-[#DDD7CA] rounded bg-white hover:bg-[#FBF9F3]">
                    Alkalmaz
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <select
                    value={presetClientContextId}
                    onChange={(e) => setPresetClientContextId(e.target.value)}
                    className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                  >
                    <option value="">Preset ügyfél kontextus (opcionális)</option>
                    {reportClientOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <>
                    <input
                      value={presetLawyerContextName}
                      onChange={(e) => setPresetLawyerContextName(e.target.value)}
                      className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                      placeholder="Preset jogász kontextus (opcionális)"
                      list="preset-lawyers"
                    />
                    <datalist id="preset-lawyers">
                      {reportLawyerOptions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </>
                </div>
                {lastPresetResolution && (
                  <div className="mt-2 p-2 border border-[#EEE7D9] rounded bg-[#FBF9F3]">
                    <p className="text-[10px] text-[#7B776D]">
                      Rétegek: {lastPresetResolution.appliedLayers.join(" → ")}
                    </p>
                    <p className="text-[10px] text-[#7B776D] mt-1">
                      Források — záradék: {lastPresetResolution.fieldSources.monthlyClosure || "—"}, pending: {lastPresetResolution.fieldSources.pendingOpenMattersNote || "—"}, jogász: {lastPresetResolution.fieldSources.lawyerName || "—"}, client záró: {lastPresetResolution.fieldSources.clientClosingText || "—"}
                    </p>
                    <p className="text-[10px] text-[#9C9890] mt-1">Kézi mező-értékek nem íródnak felül preset alkalmazáskor.</p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Sablon</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Időszak</label>
                <input
                  type="month"
                  value={reportPeriod}
                  onChange={(e) => setReportPeriod(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Ügyfél</label>
                <input
                  value={reportClientName}
                  onChange={(e) => setReportClientName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  placeholder="Pl. Alpha Zrt."
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Munkacsomag / ügy</label>
                <input
                  value={reportMatterName}
                  onChange={(e) => setReportMatterName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  placeholder="Pl. Munkajogi tanácsadás"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Ügyhivatkozás</label>
                <input
                  value={reportCaseReference}
                  onChange={(e) => setReportCaseReference(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  placeholder="Pl. 2026-031"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Havi záradék (preset/default)</label>
                <textarea
                  value={reportMonthlyClosure}
                  onChange={(e) => setReportMonthlyClosure(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  rows={2}
                  placeholder="Havi záradék"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Pending/open note (preset/default)</label>
                <textarea
                  value={reportPendingNote}
                  onChange={(e) => setReportPendingNote(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  rows={2}
                  placeholder="Nyitott tételek megjegyzése"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Áthozott órák</label>
                <input
                  type="number"
                  step={0.1}
                  value={reportCarriedHours}
                  onChange={(e) => setReportCarriedHours(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Túlóra</label>
                <input
                  type="number"
                  step={0.1}
                  value={reportOvertimeHours}
                  onChange={(e) => setReportOvertimeHours(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Küszöb feletti órák</label>
                <input
                  type="number"
                  step={0.1}
                  value={reportAboveThresholdHours}
                  onChange={(e) => setReportAboveThresholdHours(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Default jogász név</label>
                <input
                  value={reportDefaultLawyerName}
                  onChange={(e) => setReportDefaultLawyerName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  placeholder="Pl. Dr. Hubay"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Ügyfélnek szóló záró szöveg</label>
                <input
                  value={reportClientClosingText}
                  onChange={(e) => setReportClientClosingText(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  placeholder="Rövid lezáró üzenet"
                />
              </div>
            </div>

            <div className="border border-[#EEE7D9] rounded p-3 bg-[#FBF9F3] space-y-3">
              <p className="text-xs font-semibold text-[#1F2821]">Automatikus sorfeltöltés mentett munkaórákból</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={autofillClientId}
                  onChange={(e) => {
                    setAutofillClientId(e.target.value);
                    setAutofillMatterId("");
                    setAutofillCaseId("");
                  }}
                  className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                >
                  <option value="">Ügyfél (opcionális)</option>
                  {reportClientOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <select
                  value={autofillMatterId}
                  onChange={(e) => {
                    setAutofillMatterId(e.target.value);
                    setAutofillCaseId("");
                  }}
                  className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                >
                  <option value="">Munkacsomag (opcionális)</option>
                  {reportMatterOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <select
                  value={autofillCaseId}
                  onChange={(e) => setAutofillCaseId(e.target.value)}
                  className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                >
                  <option value="">Ügy (opcionális)</option>
                  {reportCaseOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
                <input
                  value={autofillLawyerName}
                  onChange={(e) => setAutofillLawyerName(e.target.value)}
                  className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                  placeholder="Jogász név (opcionális)"
                  list="autofill-lawyers"
                />
                <datalist id="autofill-lawyers">
                  {reportLawyerOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <label className="flex items-center gap-2 px-2 py-1 border border-[#DDD7CA] rounded text-xs">
                  <input
                    type="checkbox"
                    checked={autofillBillableOnly}
                    onChange={(e) => setAutofillBillableOnly(e.target.checked)}
                  />
                  Csak számlázható
                </label>
                <button
                  onClick={handleAutofillRows}
                  disabled={isAutofillingRows}
                  className="px-3 py-2 bg-[#1F4A33] text-[#FBF6E7] text-xs rounded disabled:opacity-50"
                >
                  {isAutofillingRows ? "Betöltés..." : "Munkaórák betöltése"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#1F2821]">Munka sorok</p>
                <button onClick={addReportRow} className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded">+ Sor</button>
              </div>
              {reportRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[140px_minmax(0,1fr)_180px_90px_80px] gap-2 items-center">
                  <input
                    type="date"
                    value={row.date || ""}
                    onChange={(e) => updateReportRow(idx, { date: e.target.value })}
                    className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                  />
                  <input
                    value={row.description}
                    onChange={(e) => updateReportRow(idx, { description: e.target.value })}
                    className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                    placeholder="Elvégzett jogi munka"
                  />
                  <input
                    value={row.lawyer}
                    onChange={(e) => updateReportRow(idx, { lawyer: e.target.value })}
                    className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                    placeholder="Jogász neve"
                  />
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={row.hours}
                    onChange={(e) => updateReportRow(idx, { hours: Number(e.target.value || 0) })}
                    className="px-2 py-1 border border-[#DDD7CA] rounded text-xs"
                  />
                  <button onClick={() => removeReportRow(idx)} className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded">
                    Töröl
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-[#7B776D]">Elszámolási előkészítés valós mentett munkaórák alapján</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleGenerateReportPayload}
                  disabled={isGeneratingReport}
                  className="px-3 py-2 bg-[#1F4A33] text-[#FBF6E7] text-xs rounded disabled:opacity-50"
                >
                  {isGeneratingReport ? "Generálás..." : "Riport generálása"}
                </button>
                <button
                  onClick={handleRenderReportOutput}
                  disabled={isGeneratingReport}
                  className="px-3 py-2 bg-[#8B7A56] text-white text-xs rounded disabled:opacity-50"
                >
                  {isGeneratingReport ? "Generálás..." : "Előnézet generálása"}
                </button>
                <button
                  onClick={handleRenderReportDocxOutput}
                  disabled={isGeneratingReport}
                  className="px-3 py-2 bg-[#C9A227] text-white text-xs rounded disabled:opacity-50"
                >
                  {isGeneratingReport ? "Generálás..." : "DOCX letöltése"}
                </button>
              </div>
            </div>

            {generatedReport && (
              <div className="bg-[#F6F2E8] border border-[#DDD7CA] rounded p-3">
                <p className="text-xs font-semibold text-[#1F2821]">Generált összesítés</p>
                <p className="text-[10px] text-[#7B776D] mt-1">
                  Sorok: {generatedReport.totals.rowCount} · Total: {generatedReport.totals.totalHours} óra · Final: {generatedReport.totals.finalHours} óra
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] text-[#7B776D]">Technikai részletek</summary>
                  <pre className="mt-2 text-[10px] text-[#514D45] overflow-auto max-h-48">
                    {JSON.stringify(generatedReport.exportPayload, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {renderedReport?.renderedOutput && (
              <div className="bg-[#F6F2E8] border border-[#DDD7CA] rounded p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#1F2821]">Generált kimutatás</p>
                  <button onClick={handleDownloadRenderedOutput} className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded bg-white">
                    Letöltés ({renderedReport.renderedOutput.fileName})
                  </button>
                </div>
                <p className="text-[10px] text-[#7B776D] mt-1">
                  Formátum: {renderedReport.renderedOutput.format} · MIME: {renderedReport.renderedOutput.mimeType}
                </p>
                {renderedReport.renderedOutput.format === "TEXT_V1" && renderedReport.renderedOutput.content ? (
                  <pre className="mt-2 text-[10px] text-[#514D45] overflow-auto max-h-48 whitespace-pre-wrap">
                    {renderedReport.renderedOutput.content}
                  </pre>
                ) : (
                  <p className="mt-2 text-[10px] text-[#514D45]">DOCX állomány elkészült, előnézet itt nem jelenik meg.</p>
                )}
              </div>
            )}

            <div className="bg-[#F6F2E8] border border-[#DDD7CA] rounded p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#1F2821]">Korábbi renderelt outputok</p>
                {selectedReportInstanceId && (
                  <button
                    onClick={() => loadReportArtifacts(selectedReportInstanceId)}
                    disabled={isLoadingReportArtifacts}
                    className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded bg-white disabled:opacity-50"
                  >
                    {isLoadingReportArtifacts ? "Frissítés..." : "Frissít"}
                  </button>
                )}
              </div>
              {!selectedReportInstanceId ? (
                <p className="mt-2 text-[10px] text-[#7B776D]">Válassz mentett riport példányt az output történethez.</p>
              ) : reportArtifacts.length === 0 ? (
                <p className="mt-2 text-[10px] text-[#7B776D]">Még nincs mentett renderelt output ehhez a riporthoz.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {reportArtifacts.map((artifact) => (
                    <div key={artifact.id} className="flex items-center justify-between gap-2 p-2 border border-[#EEE7D9] rounded bg-white">
                      <div>
                        <p className="text-[11px] text-[#1F2821]">{artifact.fileName}</p>
                        <p className="text-[10px] text-[#7B776D]">
                          {artifact.format} · {new Date(artifact.createdAt).toLocaleString("hu-HU")}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDownloadArtifact(artifact.id)}
                        className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded bg-white"
                      >
                        Letöltés
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="p-4 bg-white border border-[#DDD7CA] rounded-lg">
              <p className="text-2xl font-serif text-[#1F2821]">{formatMinutes(totals.totalMinutes)}</p>
              <p className="text-[10px] text-[#7B776D]">Összes munkaóra</p>
            </div>
            <div className="p-4 bg-white border border-[#DDD7CA] rounded-lg">
              <p className="text-2xl font-serif text-[#1F2821]">{totals.totalEntries}</p>
              <p className="text-[10px] text-[#7B776D]">Összes bejegyzés</p>
            </div>
            <div className="p-4 bg-[#ECF7F0] border border-[#CFE5D9] rounded-lg">
              <p className="text-2xl font-serif text-[#1F4A33]">{formatMinutes(totals.billableMinutes)}</p>
              <p className="text-[10px] text-[#315442]">Számlázható idő</p>
            </div>
            <div className="p-4 bg-white border border-[#DDD7CA] rounded-lg">
              <p className="text-2xl font-serif text-[#1F2821]">{totals.totalClients}</p>
              <p className="text-[10px] text-[#7B776D]">Érintett ügyfelek</p>
              <p className="text-[10px] text-[#9C9890] mt-1">Nem számlázható: {formatMinutes(totals.nonBillableMinutes)}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-xs text-[#9C9890]">Munkaórák betöltése...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-[#DDD7CA]">
              <p className="text-xs text-[#9C9890] mb-4">Még nincs rögzített munkaóra</p>
              <button onClick={handleCreate} className="px-4 py-2 bg-[#1F4A33] text-[#FBF6E7] text-xs rounded hover:bg-[#173824]">
                Első bejegyzés rögzítése
              </button>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
              <div className="border border-[#DDD7CA] bg-white rounded p-3 h-fit">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Ügyfelek</p>
                <p className="text-[10px] text-[#9C9890] mb-3">Összes munkaóra ügyfelenként</p>
                <div className="space-y-2">
                  {groupedByClient.map((clientGroup) => {
                    const isActive = clientGroup.clientId === selectedClientId;
                    return (
                      <button
                        key={clientGroup.clientId}
                        onClick={() => setSelectedClientId(clientGroup.clientId)}
                        className={`w-full text-left p-3 border rounded ${
                          isActive ? "border-[#C9A227] bg-[#FBF9F3]" : "border-[#EEE7D9] hover:bg-[#FBF9F3]"
                        }`}
                      >
                        <p className="text-sm font-semibold text-[#1F2821]">{clientGroup.clientName}</p>
                        <p className="text-[10px] text-[#7B776D] mt-1">
                          {formatMinutes(clientGroup.totalMinutes)} · {clientGroup.totalEntries} bejegyzés
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                {!selectedClientGroup ? (
                  <div className="p-6 border border-dashed border-[#DDD7CA] text-xs text-[#7B776D]">
                    Nincs megjeleníthető ügyfél-csoportosítás.
                  </div>
                ) : (
                  <>
                    <div className="p-4 border border-[#DDD7CA] bg-[#F6F2E8] rounded">
                      <p className="text-sm font-semibold text-[#1F2821]">{selectedClientGroup.clientName}</p>
                      <p className="text-[10px] text-[#7B776D] mt-1">
                        {formatMinutes(selectedClientGroup.totalMinutes)} · {selectedClientGroup.totalEntries} bejegyzés · {selectedClientGroup.cases.length} ügycsoport
                      </p>
                    </div>

                    {selectedClientGroup.cases.map((caseGroup) => {
                      const isExpanded = expandedCaseKeys[caseGroup.caseKey] ?? true;
                      return (
                        <div key={caseGroup.caseKey} className="border border-[#DDD7CA] rounded bg-white overflow-hidden">
                          <button
                            onClick={() => toggleCaseExpanded(caseGroup.caseKey)}
                            className="w-full px-4 py-3 bg-[#F6F2E8] border-b border-[#EEE7D9] flex items-center justify-between"
                          >
                            <div className="text-left">
                              <p className="text-sm font-semibold text-[#1F2821]">
                                {caseGroup.caseNumber ? `${caseGroup.caseNumber} · ${caseGroup.caseTitle}` : caseGroup.caseTitle}
                              </p>
                              <p className="text-[10px] text-[#7B776D] mt-1">
                                {caseGroup.entries.length} bejegyzés · {formatMinutes(caseGroup.totalMinutes)}
                              </p>
                              {caseGroup.linkageMode !== "resolved-case" && (
                                <p className="text-[10px] text-[#9C9890] mt-1">
                                  {caseGroup.linkageMode === "ambiguous"
                                    ? `Ügykapcsolat nem egyértelmű (${caseGroup.candidateCaseCount} lehetséges ügy)`
                                    : "Ügykapcsolat jelenleg nem érhető el ehhez a munkához"}
                                </p>
                              )}
                            </div>
                            <span className="text-[#7B776D] text-xs">{isExpanded ? "Elrejtés" : "Megnyitás"}</span>
                          </button>

                          {isExpanded && (
                            <div className="divide-y divide-[#EEE7D9]">
                              {caseGroup.entries.map((entry) => (
                                <div key={entry.id} className={`p-4 border-l-2 ${entry.billable ? "border-l-[#2F5E49]" : "border-l-[#CFC8BA]"}`}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-semibold text-[#1F2821]">Időtartam: {formatMinutes(entry.minutes)}</span>
                                        {(entry.billable || WORK_TYPE_LABEL_MAP[entry.workType]) && (
                                        <span className={`text-[10px] uppercase tracking-[0.1em] px-2 py-1 rounded ${entry.billable ? "bg-[#ECF7F0] text-[#1F4A33]" : "bg-[#ECE6DA] text-[#6B665D]"}`}>
                                          Munkatípus: {WORK_TYPE_LABEL_MAP[entry.workType] ?? "Egyéb"}
                                        </span>
                                      )}
                                      </div>
                                      <p className="text-xs text-[#514D45]"><span className="font-semibold text-[#1F2821]">Leírás:</span> {entry.description}</p>
                                      <div className="flex items-center gap-4 mt-2">
                                        {entry.department && <span className="text-[10px] text-[#7B776D]">{entry.department.name}</span>}
                                        <span className="text-[10px] text-[#9C9890]">Dátum: {formatDate(entry.workDate)}</span>
                                        <span className="text-[10px] text-[#7B776D]">{entry.billable ? "Számlázható" : "Nem számlázható"}</span>
                                        <span className="text-[10px] text-[#7B776D]">Munkacsomag: {caseGroup.caseTitle}</span>
                                        {caseGroup.caseId && (
                                          <Link href={`/cases/${caseGroup.caseId}`} className="text-[10px] text-[#C9A227] hover:underline">
                                            Ugrás az ügyre
                                          </Link>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleEdit(entry)}
                                        className="px-2 py-1 text-[10px] text-[#6D695F] hover:text-[#1F4A33] border border-[#EEE7D9] rounded"
                                      >
                                        Szerkeszt
                                      </button>
                                      {deleteConfirm === entry.id ? (
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => handleDelete(entry.id)}
                                            className="px-2 py-1 text-[10px] text-white bg-[#DC2626] rounded"
                                          >
                                            Törlés OK
                                          </button>
                                          <button
                                            onClick={() => setDeleteConfirm(null)}
                                            className="px-2 py-1 text-[10px] text-[#7B776D] border border-[#EEE7D9] rounded"
                                          >
                                            Mégsem
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setDeleteConfirm(entry.id)}
                                          className="px-2 py-1 text-[10px] text-[#7B776D] hover:text-[#DC2626] border border-[#EEE7D9] rounded"
                                        >
                                          Törlés
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
      

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-[#DDD7CA]">
              <h2 className="text-lg font-serif text-[#1F2821]">{editingEntry ? "Munkaóra bejegyzés szerkesztése" : "Munkaóra rögzítése"}</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Ügyhöz kapcsolt munkacsomag <span className="text-[#DC2626]">*</span>
                </label>
                <select
                  value={formData.matterId}
                  onChange={(e) => setFormData({ ...formData, matterId: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  disabled={!!editingEntry}
                >
                  <option value="">Válassz ügyhöz kapcsolt munkacsomagot...</option>
                  {modalCaseOptions.map((option) => (
                    <option key={option.matterId} value={option.matterId}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {!editingEntry && (
                  <p className="text-[10px] text-[#9C9890] mt-1">Azonosító mező nincs kitéve; ügy és ügyfél címkével választhatsz.</p>
                )}
              </div>

              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">Munkatípus</label>
                <select
                  value={formData.workType}
                  onChange={(e) => setFormData({ ...formData, workType: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                >
                  {WORK_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">Leírás</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  rows={3}
                  placeholder="Röviden írd le az elvégzett munkát..."
                />
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Gyors kategória</p>
                <p className="text-[10px] text-[#9C9890] mb-2">A kiválasztás csak a mezőket tölti ki, mentés nem történik automatikusan.</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Dokumentum átnézése", workType: "FELÜLVIZSGÁLAT" },
                    { label: "Szerződésmódosítás", workType: "IRATELENÉS" },
                    { label: "Kommunikáció", workType: "KOMMUNIKÁCIÓ" },
                    { label: "Partner review", workType: "FELÜLVIZSGÁLAT" },
                    { label: "Ügyfél egyeztetés", workType: "KOMMUNIKÁCIÓ" },
                    { label: "Adminisztráció", workType: "EGYÉB" },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, workType: preset.workType, description: f.description || preset.label }))}
                      className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded bg-white hover:bg-[#FBF9F3] hover:border-[#C9A227] transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.billable}
                    onChange={(e) => setFormData({ ...formData, billable: e.target.checked })}
                    className="w-4 h-4 accent-[#C9A227]"
                  />
                  <span className="text-xs text-[#514D45]">Számlázható</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">Időtartam (perc)</label>
                  <input
                    type="number"
                    value={formData.minutes}
                    onChange={(e) => setFormData({ ...formData, minutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                    min={1}
                    max={1440}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">Dátum</label>
                  <input
                    type="date"
                    value={formData.workDate}
                    onChange={(e) => setFormData({ ...formData, workDate: e.target.value })}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-[#DDD7CA] flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#514D45] border border-[#DDD7CA] hover:bg-[#ECE6DA] rounded"
                disabled={isSaving}
              >
                Mégsem
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !formData.matterId?.trim() || !formData.description?.trim()}
                className="px-4 py-2 text-xs uppercase tracking-[0.2em] bg-[#1F4A33] text-[#FBF6E7] hover:bg-[#173824] rounded disabled:opacity-50"
              >
                {isSaving ? "Mentés..." : "Mentés"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

