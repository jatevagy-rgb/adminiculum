"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addCaseCollaborator,
  createCase,
  createClient,
  createTask,
  getCases,
  getClients,
  getUsers,
  type CaseListItem,
  type Client,
  type CreateCaseData,
  type CreateClientData,
  type User,
} from "@/lib/api";
import { AdminBadge, AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";

const CLIENT_COLOR_PALETTE = [
  { bg: "#1F4A33", border: "#173824", label: "legal-green" },
  { bg: "#2D4A7C", border: "#1D3557", label: "blue" },
  { bg: "#8B2A2A", border: "#6D1618", label: "burgundy" },
  { bg: "#B58A2A", border: "#8E6A1B", label: "gold" },
  { bg: "#4A6B4A", border: "#3A4B33", label: "sage" },
];

const getClientColor = (clientName?: string | null): { bg: string; border: string; label: string } => {
  if (!clientName) return CLIENT_COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < clientName.length; i++) {
    hash = clientName.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return CLIENT_COLOR_PALETTE[Math.abs(hash) % CLIENT_COLOR_PALETTE.length];
};

const statusLabel: Record<string, string> = {
  OPEN: "Nyitott",
  ON_HOLD: "Függőben",
  CLOSED: "Lezárt",
  DRAFT: "Piszkozat",
  ARCHIVED: "Archivált",
};

const matterTypes = [
  { value: "REAL_ESTATE", label: "Ingatlanjog" },
  { value: "CORPORATE", label: "Társasági jog" },
  { value: "CONTRACT", label: "Szerződés" },
  { value: "LITIGATION", label: "Peres ügy" },
  { value: "EMPLOYMENT", label: "Munkajog" },
  { value: "IP", label: "Szellemi tulajdon" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "MERGERS_ACQUISITIONS", label: "M&A / tranzakció" },
  { value: "OTHER", label: "Egyéb" },
  { value: "CUSTOM", label: "Saját ügytípus megadása" },
];

const clientRoles = [
  "Megbízó",
  "Ellenérdekű fél",
  "Eladó",
  "Vevő",
  "Bérbeadó",
  "Bérlő",
  "Felperes",
  "Alperes",
  "Ajándékozó",
  "Megajándékozott",
  "Munkáltató",
  "Munkavállaló",
  "Vállalkozó",
  "Megrendelő",
  "Megbízott",
  "Alvállalkozó",
  "Zálogkötelezett",
  "Társtulajdonos",
  "Egyéb / saját szerep",
];

const PILOT_PARTICIPANT_EMAILS = [
  "hubay.gyula@balintfy.onmicrosoft.com",
  "csanad@trugly.eu",
  "sommer.anna@balintfy.onmicrosoft.com",
  "szucs.amanda@balintfy.onmicrosoft.com",
];

const INTERNAL_PARTICIPANT_ROLES = new Set([
  "ADMIN",
  "PARTNER",
  "LAWYER",
  "COLLAB_LAWYER",
  "TRAINEE",
  "LEGAL_ASSISTANT",
]);

const CORE_CLIENTS = [
  "blackbelt technology kft",
  "blackbelt",
  "saubermacher-magyarorszag kft",
  "saubermacher",
  "balintfy es tarsai ugyvedi iroda",
  "balintfy",
];

const CORE_CLIENT_DEFAULTS: Record<string, Partial<Client>> = {
  blackbelt: {
    name: "BlackBelt Technology Kft.",
    address: "1027 Budapest, Ganz utca 16. 3. em., Magyarország",
    taxNumber: "24334934-2-41",
    companyRegistrationNumber: "01-09-356381",
    phone: "70/9309191",
    email: "aczifra@t-online.hu",
    contactPerson: "Sövegjártó Róbert",
  },
  saubermacher: {
    name: "Saubermacher-Magyarország Kft.",
    address: "1181 Budapest, Zádor u. 5.",
    taxNumber: "13559212-2-43",
    companyRegistrationNumber: "03-09-113748",
  },
  balintfy: {
    name: "Bálintfy és Társai Ügyvédi Iroda",
    address: "1051 Budapest",
    contactPerson: "dr. HUBAY Gyula Máté",
  },
};

const STEP_DEFAULT_TITLES = ["Előkészítés", "Ügyvédi review", "Javítás / véglegesítés"] as const;

const getStepTitle = (index: number, role?: string | null): string => {
  if (index < STEP_DEFAULT_TITLES.length) return STEP_DEFAULT_TITLES[index];
  return "Következő munkalépés";
};

const getRoleLabel = (role?: string | null): string => {
  if (!role) return "";
  switch (role.toUpperCase()) {
    case "PARTNER": return "Partner";
    case "LAWYER": return "Ügyvéd";
    case "TRAINEE": return "Ügyvédjelölt";
    case "LEGAL_ASSISTANT": return "Asszisztens";
    default: return role;
  }
};

const normalizePersonName = (value?: string | null) =>
  String(value || "")
    .toLocaleLowerCase("hu-HU")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

type ClientMode = "existing" | "new";
type DeadlineMode = "none" | "date" | "days" | "hours" | "minutes";

type WorkplanStepDraft = {
  id: string;
  title: string;
  assigneeUserId: string;
  dueDate: string;
  note: string;
};

const defaultCaseData: CreateCaseData = {
  clientName: "",
  matterType: "",
  priority: "MEDIUM",
  description: "",
  clientRole: "",
  deadline: "",
};

const defaultNewClient: CreateClientData = {
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  taxNumber: "",
  companyRegistrationNumber: "",
  address: "",
};

function toInputDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMatterType(value?: string | null) {
  const found = matterTypes.find((item) => item.value === value);
  return found?.label || value?.replace(/_/g, " ").toLocaleLowerCase("hu-HU") || "Nincs megadva";
}

function formatDeadlinePreview(value?: string) {
  if (!value) return "Nincs határidő";
  try {
    return new Date(value).toLocaleString("hu-HU", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return value;
  }
}

export function CasesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [practiceArea, setPracticeArea] = useState("all");
  const [clientName, setClientName] = useState("");
  const [workPriorityFilter, setWorkPriorityFilter] = useState("all");
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [newCaseData, setNewCaseData] = useState<CreateCaseData>(defaultCaseData);
  const [customMatterType, setCustomMatterType] = useState("");
  const [customClientRole, setCustomClientRole] = useState("");
  const [clientMode, setClientMode] = useState<ClientMode>("existing");
  const [newClientData, setNewClientData] = useState<CreateClientData>(defaultNewClient);
  const [clientType, setClientType] = useState<"Magánszemély" | "Cég">("Cég");
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [clientMessage, setClientMessage] = useState<string | null>(null);
  const [deadlineMode, setDeadlineMode] = useState<DeadlineMode>("none");
  const [relativeDeadlineValue, setRelativeDeadlineValue] = useState("3");
  const [reminder, setReminder] = useState("Nincs emlékeztető");
  const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<string[]>([]);
  const [workplanSteps, setWorkplanSteps] = useState<WorkplanStepDraft[]>([]);
  const [workplanPreset, setWorkplanPreset] = useState("none");
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [showOtherClients, setShowOtherClients] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [backendCases, setBackendCases] = useState<CaseListItem[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [caseLoadError, setCaseLoadError] = useState<string | null>(null);
  const requestedNewCase = searchParams?.get("newCase") === "1";
  const requestedClientId = searchParams?.get("clientId") || "";
  const [initialClientApplied, setInitialClientApplied] = useState(false);

  const selectedClient = useMemo(
    () => availableClients.find((client) => client.id === newCaseData.clientId) || null,
    [availableClients, newCaseData.clientId],
  );

  const getCoreClientKey = useCallback((client: Client): "blackbelt" | "saubermacher" | "balintfy" | null => {
    const normalized = normalizePersonName(client.name);
    if (normalized.includes("blackbelt")) return "blackbelt";
    if (normalized.includes("saubermacher") || normalized.includes("sauber macher")) return "saubermacher";
    if (normalized.includes("balintfy")) return "balintfy";
    return null;
  }, []);

  const hydrateCoreClient = useCallback((client: Client): Client => {
    const key = getCoreClientKey(client);
    if (!key) return client;
    const defaults = CORE_CLIENT_DEFAULTS[key];
    return {
      ...client,
      name: defaults.name || client.name,
      address: client.address || defaults.address,
      taxNumber: client.taxNumber || defaults.taxNumber,
      companyRegistrationNumber: client.companyRegistrationNumber || defaults.companyRegistrationNumber,
      phone: client.phone || defaults.phone,
      email: client.email || defaults.email,
      contactPerson: client.contactPerson || defaults.contactPerson,
    };
  }, [getCoreClientKey]);

  const orderedClients = useMemo(() => {
    const score = (client: Client) => {
      const normalized = normalizePersonName(client.name);
      const index = CORE_CLIENTS.findIndex((name) => normalized.includes(name));
      return index === -1 ? 100 : index;
    };
    const sorted = [...availableClients].map(hydrateCoreClient).sort((a, b) => {
      const scoreDiff = score(a) - score(b);
      if (scoreDiff !== 0) return scoreDiff;
      return a.name.localeCompare(b.name, "hu-HU");
    });
    const seenCore = new Set<string>();
    return sorted.filter((client) => {
      const key = getCoreClientKey(client);
      if (!key) return showOtherClients;
      if (seenCore.has(key)) return showOtherClients;
      seenCore.add(key);
      return true;
    });
  }, [availableClients, getCoreClientKey, hydrateCoreClient, showOtherClients]);

  const visibleParticipants = useMemo(() => {
    const eligibleUsers = availableUsers.filter((user) =>
      INTERNAL_PARTICIPANT_ROLES.has(String(user.role || "").toUpperCase()) &&
      PILOT_PARTICIPANT_EMAILS.includes(String(user.email || "").toLowerCase())
    );
    if (eligibleUsers.length === 0) return [];
    return [...eligibleUsers].sort((left, right) => {
      const leftPriority = PILOT_PARTICIPANT_EMAILS.indexOf(String(left.email || "").toLowerCase());
      const rightPriority = PILOT_PARTICIPANT_EMAILS.indexOf(String(right.email || "").toLowerCase());
      const normalizedLeftPriority = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
      const normalizedRightPriority = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;
      if (normalizedLeftPriority !== normalizedRightPriority) {
        return normalizedLeftPriority - normalizedRightPriority;
      }
      return String(left.name || left.email).localeCompare(String(right.name || right.email), "hu-HU");
    });
  }, [availableUsers]);

  const selectableParticipantIds = useMemo(
    () => new Set(visibleParticipants.map((user) => user.id)),
    [visibleParticipants],
  );

  const selectClientForCase = useCallback((client: Client) => {
    const hydrated = hydrateCoreClient(client);
    setClientMode("existing");
    setNewCaseData((prev) => ({ ...prev, clientId: hydrated.id, clientName: hydrated.name }));
  }, [hydrateCoreClient]);

  const applyWorkplanPreset = useCallback((preset: string) => {
    setWorkplanPreset(preset);
    const id = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (preset === "none") {
      setWorkplanSteps([]);
      return;
    }
    if (preset === "simple") {
      setWorkplanSteps([
        { id: id(), title: "Előkészítés", assigneeUserId: "", dueDate: "", note: "Iratok és első munkapéldány előkészítése." },
        { id: id(), title: "Ügyvédi review", assigneeUserId: "", dueDate: "", note: "Tartalmi és kockázati ellenőrzés." },
      ]);
      return;
    }
    if (preset === "trainee-partner") {
      setWorkplanSteps([
        { id: id(), title: "Előkészítés", assigneeUserId: "", dueDate: "", note: "Ügyvédjelölt előkészítése." },
        { id: id(), title: "Partner jóváhagyás", assigneeUserId: "", dueDate: "", note: "Partner átnézés és végső jóváhagyás." },
      ]);
      return;
    }
    if (preset === "three-step") {
      const findId = (namePart: string) => {
        const found = visibleParticipants.find((u) =>
          normalizePersonName(u.name).includes(namePart)
        );
        return found ? found.id : "";
      };
      const amandaId = findId("szűcs amanda");
      const csanadId = findId("trugly csanád");
      const hubayId = findId("hubay gyula") || findId("hubay gyula máté");
      setWorkplanSteps([
        { id: id(), title: "Előkészítés", assigneeUserId: amandaId, dueDate: "", note: "Amanda előkészíti az iratot és a hiánypontokat." },
        { id: id(), title: "Ügyvédi review", assigneeUserId: csanadId, dueDate: "", note: "Csanád átnézi a munkapéldányt." },
        { id: id(), title: "Partner jóváhagyás", assigneeUserId: hubayId, dueDate: "", note: "Partner átnézés és végső jóváhagyás." },
      ]);
      return;
    }
    if (preset === "custom" && workplanSteps.length === 0) {
      setWorkplanSteps([{ id: id(), title: "Előkészítés", assigneeUserId: "", dueDate: "", note: "" }]);
    }
  }, [visibleParticipants, workplanSteps.length]);

  const updateWorkplanStep = (stepId: string, patch: Partial<WorkplanStepDraft>) => {
    setWorkplanSteps((prev) => prev.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  };

  const moveUpStep = (index: number) => {
    if (index === 0) return;
    setWorkplanSteps((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDownStep = (index: number) => {
    setWorkplanSteps((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const removeWorkplanStep = (stepId: string) => {
    setWorkplanSteps((prev) => prev.filter((step) => step.id !== stepId));
    if (workplanSteps.length <= 1) setWorkplanPreset("none");
  };

  const addWorkplanStep = () => {
    setWorkplanSteps((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, title: "", assigneeUserId: "", dueDate: "", note: "" }]);
    setWorkplanPreset("custom");
  };

  const addParticipantToWorkplan = (user: User) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const currentCount = workplanSteps.length;
    const title = getStepTitle(currentCount);
    setWorkplanSteps((prev) => [...prev, { id, title, assigneeUserId: user.id, dueDate: "", note: "" }]);
    setWorkplanPreset("custom");
  };

  const effectiveMatterType = newCaseData.matterType === "CUSTOM" ? customMatterType.trim() : newCaseData.matterType;
  const effectiveClientRole = newCaseData.clientRole === "Egyéb / saját szerep" ? customClientRole.trim() : newCaseData.clientRole;

  const handleCreateCase = async () => {
    const clientOk = clientMode === "existing" ? Boolean(newCaseData.clientId) : Boolean(newClientData.name.trim());
    if (!clientOk) {
      setCreateError(clientMode === "existing" ? "Válassz ki egy mentett ügyfelet az ügy létrehozásához." : "Az új ügyfél hivatalos neve kötelező.");
      return;
    }
    if (!newCaseData.description?.trim()) {
      setCreateError("Az ügy megnevezése kötelező.");
      return;
    }
    if (!effectiveMatterType) {
      setCreateError("Az ügy típusa kötelező.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      let clientId = newCaseData.clientId;
      let caseClientName = newCaseData.clientName.trim();
      if (clientMode === "new" && newClientData.name.trim()) {
        const createdClient = await createClient({ ...newClientData, name: newClientData.name.trim() });
        setAvailableClients((prev) => [createdClient, ...prev.filter((client) => client.id !== createdClient.id)]);
        clientId = createdClient.id;
        caseClientName = createdClient.name;
      }
      const payloadMatterType = newCaseData.matterType === "CUSTOM" ? "OTHER" : newCaseData.matterType;
      const payloadDescription = newCaseData.matterType === "CUSTOM" && customMatterType.trim()
        ? `${newCaseData.description?.trim() || ""} — ügytípus: ${customMatterType.trim()}`
        : newCaseData.description;
      const result = await createCase({
        ...newCaseData,
        clientId,
        clientName: caseClientName || selectedClient?.name || newClientData.name.trim(),
        matterType: payloadMatterType || "OTHER",
        description: payloadDescription,
        clientRole: effectiveClientRole,
      });
      let workplanPartialFailure = false;
      for (const userId of selectedCollaboratorIds) {
        if (!selectableParticipantIds.has(userId)) continue;
        try {
          await addCaseCollaborator(result.id, userId, "COLLABORATOR");
        } catch (collabErr) {
          console.warn(`Failed to add collaborator ${userId}:`, collabErr);
          workplanPartialFailure = true;
        }
      }
      const validWorkplanSteps = workplanSteps.filter((step) => step.title.trim());
      for (let index = 0; index < validWorkplanSteps.length; index += 1) {
        const step = validWorkplanSteps[index];
        try {
          await createTask({
            caseId: result.id,
            title: `${index + 1}. ${step.title.trim()}`,
            type: index === 0 ? "DRAFT_CONTRACT" : index === validWorkplanSteps.length - 1 ? "APPROVAL" : "REVIEW_CONTRACT",
            description: ["Munkaterv / review-útvonal", step.note.trim()].filter(Boolean).join(" — "),
            priority: "MEDIUM",
            dueDate: step.dueDate || undefined,
            assignedTo: step.assigneeUserId && selectableParticipantIds.has(step.assigneeUserId) ? step.assigneeUserId : undefined,
          });
        } catch (taskErr) {
          console.warn(`Failed to create workplan step ${index + 1}:`, taskErr);
          workplanPartialFailure = true;
        }
      }
      setShowNewCaseModal(false);
      setNewCaseData(defaultCaseData);
      setNewClientData(defaultNewClient);
      setCustomMatterType("");
      setCustomClientRole("");
      setSelectedCollaboratorIds([]);
      setWorkplanSteps([]);
      setWorkplanPreset("none");
      setClientMode("existing");
      if (workplanPartialFailure) {
        setCreateError("Az ügy létrejött. Figyelmeztetés: a munkaterv vagy a résztvevők egy része nem mentődött le. Az ügyet a Dokumentumtárban éred el.");
        setIsCreating(false);
        setTimeout(() => {
          setCreateError(null);
          router.push(`/cases/${result.id}/documents`);
        }, 4000);
      } else {
        router.push(`/cases/${result.id}/documents`);
      }
    } catch (err) {
      console.error("Failed to create case:", err);
      let displayMessage = "Az ügy létrehozása sikertelen.";
      if (err instanceof Error && err.name === "ApiError") {
        const apiErr = err as any;
        displayMessage = (apiErr as any).status === 0
          ? "A szerver nem érhető el. Kérjük, próbáld később."
          : (apiErr as any).message || displayMessage;
      } else if (err instanceof Error) {
        displayMessage = err.message || displayMessage;
      }
      setCreateError(displayMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveClientOnly = async () => {
    if (!newClientData.name.trim()) {
      setClientMessage("Az ügyfél neve kötelező.");
      return;
    }
    setIsSavingClient(true);
    setClientMessage(null);
    try {
      const created = await createClient({ ...newClientData, name: newClientData.name.trim() });
      setAvailableClients((prev) => [created, ...prev.filter((client) => client.id !== created.id)]);
      setNewCaseData((prev) => ({ ...prev, clientId: created.id, clientName: created.name }));
      setClientMode("existing");
      setClientMessage("Az új ügyfél mentve és kiválasztva.");
    } catch (err) {
      setClientMessage(err instanceof Error ? err.message : "Az ügyfél mentése sikertelen.");
    } finally {
      setIsSavingClient(false);
    }
  };

  const updateDeadline = (mode: DeadlineMode, rawValue = relativeDeadlineValue) => {
    setDeadlineMode(mode);
    if (mode === "none") {
      setNewCaseData((prev) => ({ ...prev, deadline: "" }));
      return;
    }
    if (mode === "date") {
      const next = newCaseData.deadline || toInputDateTimeLocal(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
      setNewCaseData((prev) => ({ ...prev, deadline: next }));
      return;
    }
    const amount = Math.max(1, Number.parseInt(rawValue || "1", 10) || 1);
    const multiplier = mode === "days" ? 24 * 60 * 60 * 1000 : mode === "hours" ? 60 * 60 * 1000 : 60 * 1000;
    setNewCaseData((prev) => ({ ...prev, deadline: toInputDateTimeLocal(new Date(Date.now() + amount * multiplier)) }));
  };

  const deriveWorkPriorityLabel = useCallback((priority?: string) => {
    if (!priority) return "Közepes";
    const normalized = priority.toLowerCase();
    if (normalized.includes("high") || normalized.includes("urgent")) return "Magas";
    if (normalized.includes("low")) return "Alacsony";
    return "Közepes";
  }, []);

  const loadCases = useCallback(async () => {
    setIsLoadingCases(true);
    setCaseLoadError(null);
    try {
      const response = await getCases(1, 200);
      setBackendCases(response.data);
    } catch (err) {
      console.error("Failed to load cases:", err);
      setCaseLoadError(err instanceof Error ? err.message : "Az ügylista betöltése sikertelen.");
    } finally {
      setIsLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (showNewCaseModal) {
      getUsers()
        .then(setAvailableUsers)
        .catch((err) => console.warn("Failed to load users for collaborator selection:", err));
      getClients()
        .then((result) => setAvailableClients(result.data || []))
        .catch((err) => console.warn("Failed to load clients for case linkage:", err));
    }
  }, [showNewCaseModal]);

  useEffect(() => {
    if (!requestedNewCase || initialClientApplied) return;
    setShowNewCaseModal(true);
    setClientMode("existing");
    if (!requestedClientId) {
      setInitialClientApplied(true);
    }
  }, [requestedNewCase, requestedClientId, initialClientApplied]);

  useEffect(() => {
    if (!requestedNewCase || !requestedClientId || initialClientApplied || availableClients.length === 0) return;
    const client = availableClients.find((item) => item.id === requestedClientId);
    if (client) {
      selectClientForCase(client);
      setInitialClientApplied(true);
    }
  }, [requestedNewCase, requestedClientId, initialClientApplied, availableClients, selectClientForCase]);

  const filteredCases = useMemo(() => {
    const normalizedQuery = clientName.trim().toLowerCase();
    return backendCases.filter((item) => {
      const practiceMatch = practiceArea === "all" || item.matterType === practiceArea;
      const clientMatch = !normalizedQuery || (item.clientName ?? "").toLowerCase().includes(normalizedQuery);
      const workPriorityMatch = workPriorityFilter === "all" || deriveWorkPriorityLabel(item.priority) === workPriorityFilter;
      return practiceMatch && clientMatch && workPriorityMatch;
    });
  }, [backendCases, practiceArea, clientName, workPriorityFilter, deriveWorkPriorityLabel]);

  const caseEntrypointStats = useMemo(() => {
    const openCases = backendCases.filter((item) => String(item.status || "").toUpperCase() === "OPEN").length;
    const assignedCases = backendCases.filter((item) => Boolean(item.assignedLawyer?.name)).length;
    const highAttentionCases = backendCases.filter((item) => deriveWorkPriorityLabel(item.priority) === "Magas").length;
    return { openCases, assignedCases, highAttentionCases };
  }, [backendCases, deriveWorkPriorityLabel]);

  return (
    <section className="space-y-4">
      <div className="adm-board-hero grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Home Office ügyindító</p>
          <h1 className="mt-1 font-serif text-[31px] font-medium leading-tight text-[var(--adm-text)]">Ügyek — jogi műveleti lista</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-[var(--adm-text-muted)]">
            A dashboard gyorslinkje innen vezet tovább az ügy dokumentumtárába, feladataiba és review munkanézeteibe. A lista valós betöltött ügyadatokra épül; a pontos priorizálás későbbi backend-alapú fejlesztés.
          </p>
          <div className="mt-3 grid max-w-3xl gap-2 text-[11px] text-[var(--adm-text-muted)] sm:grid-cols-3">
            <span className="adm-board-strip px-3 py-2"><b className="block font-serif text-xl text-[var(--adm-text)]">{caseEntrypointStats.openCases}</b>Nyitott ügy</span>
            <span className="adm-board-strip px-3 py-2"><b className="block font-serif text-xl text-[var(--adm-text)]">{caseEntrypointStats.assignedCases}</b>Felelőssel</span>
            <span className="adm-board-strip border-[#E6C987] bg-[var(--adm-sand-100)] px-3 py-2"><b className="block font-serif text-xl text-[#7A5311]">{caseEntrypointStats.highAttentionCases}</b>Magas prioritás</span>
          </div>
          <div className="adm-board-tabs mt-3">
            <span className="adm-board-tab adm-board-tab-active">Aktív ügyek</span>
            <span className="adm-board-tab">Rám vár</span>
            <span className="adm-board-tab">Lezárt ügyek</span>
          </div>
        </div>
        <div className="adm-board-rail flex flex-col justify-center gap-3 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-sage-300)]">Munkasorrend</p>
          <p className="text-[11px] leading-5 text-[var(--adm-ivory-100)]/75">Új ügyet a szűrősor elsődleges gombja indít. Ez a panel a folytatási irányokat tartja külön.</p>
          <div className="grid gap-1.5 text-[11px]">
            <button type="button" onClick={() => router.push("/tasks")} className="rounded-[var(--adm-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-left font-semibold text-[var(--adm-ivory-50)] hover:bg-white/10">Feladatokból folytatom</button>
            <button type="button" onClick={() => router.push("/reviews")} className="rounded-[var(--adm-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-left font-semibold text-[var(--adm-ivory-50)] hover:bg-white/10">Review sorból indulok</button>
          </div>
        </div>
      </div>

      <div className="adm-board-panel-tight flex flex-wrap items-end gap-3 p-3">
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">
          Szakterület
          <select value={practiceArea} onChange={(e) => setPracticeArea(e.target.value)} className="adm-board-field mt-2 block h-10 w-48 px-2 text-xs">
            <option value="all">Mind</option>
            {matterTypes.filter((type) => type.value !== "CUSTOM").map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">
          Ügyfél neve
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="adm-board-field mt-2 block h-10 w-52 px-2 text-xs" placeholder="Ügyfél keresése" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">
          Munkaprioritás
          <select value={workPriorityFilter} onChange={(e) => setWorkPriorityFilter(e.target.value)} className="adm-board-field mt-2 block h-10 w-44 px-2 text-xs">
            <option value="all">Mind</option>
            <option value="Alacsony">Alacsony</option>
            <option value="Közepes">Közepes</option>
            <option value="Magas">Magas</option>
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <AdminButton variant="neutral" onClick={() => { setPracticeArea("all"); setClientName(""); setWorkPriorityFilter("all"); }}>Szűrők törlése</AdminButton>
          <AdminButton variant="primary" onClick={() => setShowNewCaseModal(true)}>Új ügy létrehozása</AdminButton>
        </div>
      </div>

      <div className="adm-board-panel overflow-hidden p-3">
        {isLoadingCases ? (
          <div className="py-12 text-center text-xs text-[var(--adm-text-muted)]">Ügyek betöltése...</div>
        ) : caseLoadError ? (
          <div className="border-b border-[rgba(22,32,26,0.10)] p-6 text-center text-xs text-[var(--adm-terracotta-700)]">
            <p>{caseLoadError}</p>
            <button onClick={loadCases} className="mt-3 text-[var(--adm-ochre-500)] underline">Újrapróbálkozás</button>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">
                <th className="px-3 py-1.5">Ügyszám</th>
                <th className="px-3 py-1.5">Ügyfél</th>
                <th className="px-3 py-1.5">Ügy címe</th>
                <th className="px-3 py-1.5">Szakterület</th>
                <th className="px-3 py-1.5">Státusz</th>
                <th className="px-3 py-1.5">Felelős</th>
                <th className="px-3 py-1.5">Munkaprioritás</th>
                <th className="px-3 py-1.5 text-right">Művelet</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((item) => (
                <tr key={item.id} className="adm-board-list-row cursor-pointer" onClick={() => router.push(`/cases/${item.id}/documents`)}>
                  <td className="px-3 py-3 text-xs font-semibold text-[var(--adm-text)]">{item.caseNumber}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: item.clientColor || getClientColor(item.clientName).bg }} />
                      <span className="text-sm text-[var(--adm-text)]">{item.clientName || "Nincs megadva"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-[#3D4842]">{item.title}</td>
                  <td className="px-3 py-3 text-sm text-[#3D4842]">{formatMatterType(item.matterType)}</td>
                  <td className="px-3 py-3"><AdminStatusPill tone={item.status === "OPEN" ? "green" : "neutral"}>{statusLabel[item.status] || item.status}</AdminStatusPill></td>
                  <td className="px-3 py-3 text-xs text-[#3D4842]">{item.assignedLawyer?.name || "Nincs hozzárendelve"}</td>
                  <td className="px-3 py-3"><AdminBadge tone={deriveWorkPriorityLabel(item.priority) === "Magas" ? "amber" : "neutral"}>{deriveWorkPriorityLabel(item.priority)}</AdminBadge></td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <AdminButton className="min-w-[92px] justify-center" size="sm" variant="primary" onClick={() => router.push(`/cases/${item.id}`)}>Megnyitás</AdminButton>
                      <AdminButton className="min-w-[112px] justify-center" size="sm" variant="neutral" onClick={() => router.push(`/cases/${item.id}/documents`)}>Dokumentumtár</AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-[var(--adm-text-muted)]">
                    <p>Nincs megjeleníthető ügy.</p>
                    <p className="mt-1">Nincs találat a beállított szűrőkre; módosítsd a szűrést vagy hozz létre új ügyet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="adm-board-panel-tight flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-xs text-[var(--adm-text-muted)]">Megjelenítve: {filteredCases.length} / {backendCases.length} ügy</p>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Az új ügy létrehozása után a Dokumentumtár nyílik meg</span>
      </div>

      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16201A]/70 p-4 pb-10 backdrop-blur-sm">
          <div className="adm-wizard-modal w-full max-w-5xl">
            <div className="adm-wizard-header flex items-center justify-between border-b-[3px] border-[var(--adm-ochre-500)] bg-[var(--adm-green-950)] px-5 py-3 text-[#F4EFDB]">
              <div className="flex items-center gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--adm-ochre-500)] font-serif text-xl text-[var(--adm-ochre-500)]">A</div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-ochre-500)]">Adminiculum</p>
                  <h2 className="font-serif text-[25px] font-medium">Új ügy létrehozása</h2>
                </div>
              </div>
              <button onClick={() => setShowNewCaseModal(false)} className="rounded-[var(--adm-radius-sm)] border border-white/20 px-3 py-1 text-sm text-white/80 hover:text-white">Bezárás</button>
            </div>

            <div className="adm-wizard-body px-5 pb-4">
              <div className="sticky top-0 z-[1] mt-0 border-b border-[rgba(22,32,26,0.08)] bg-[var(--adm-ivory-50)] py-3">
                <div className="rounded-lg border border-[rgba(181,138,42,0.28)] bg-[var(--adm-sand-100)] px-4 py-2 text-xs text-[#4D5A53]">
                Ügyindítási munkafolyamat: töltsd ki a kötelező mezőket, majd állítsd be a résztvevőket és a munkatervet.
                </div>
                <div className="mt-3 grid gap-2 text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--adm-text-muted)] md:grid-cols-6">
                  {["Ügyfél", "Ügy típusa", "Szerep", "Határidő", "Résztvevők", "Munkaterv"].map((step, index) => (
                    <span key={step} className={`adm-wizard-step ${index < 2 ? "adm-wizard-step-active text-[var(--adm-green-800)]" : ""}`}>
                      <span className="adm-wizard-step-index">{index + 1}</span>
                      <span>{step}</span>
                    </span>
                  ))}
                </div>
              </div>
              <section className="mt-3 rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.10)] bg-white px-4 py-3 shadow-[var(--adm-shadow-sm)]">
                <div className="mb-3 flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#F2E4BD] bg-[rgba(181,138,42,0.10)] text-xs font-semibold text-[#8E6A1B]">1</span><h3 className="font-serif text-xl font-medium">Ügyfél</h3><span className="text-[11px] font-semibold text-[var(--adm-terracotta-700)]">kötelező</span></div>
                <p className="mb-3 text-xs text-[var(--adm-text-muted)]">Válassz meglévő ügyfelet, vagy rögzíts új ügyféladatot az ügyindításhoz.</p>
                <div className="mb-4 inline-flex rounded-md border border-[rgba(22,32,26,0.20)] bg-[var(--adm-sand-100)] p-1">
                  <button onClick={() => setClientMode("existing")} className={`rounded px-4 py-1.5 text-xs font-semibold ${clientMode === "existing" ? "bg-[var(--adm-green-800)] text-[#F4EFDB]" : "text-[#3D4842]"}`}>Meglévő ügyfél</button>
                  <button onClick={() => setClientMode("new")} className={`rounded px-4 py-1.5 text-xs font-semibold ${clientMode === "new" ? "bg-[var(--adm-green-800)] text-[#F4EFDB]" : "text-[#3D4842]"}`}>Új ügyfél hozzáadása</button>
                </div>
                {clientMode === "existing" ? (
                  <>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Ügyfél keresése</label>
                    <select
                      value={newCaseData.clientId || ""}
                      onChange={(e) => {
                        const nextClientId = e.target.value;
                        const linkedClient = availableClients.find((client) => client.id === nextClientId);
                        if (linkedClient) {
                          selectClientForCase(linkedClient);
                        } else {
                          setNewCaseData({ ...newCaseData, clientId: undefined, clientName: "" });
                        }
                      }}
                      className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] bg-white px-3 py-3 text-sm text-[var(--adm-text)] outline-none focus:border-[#1F4A33]"
                    >
                      <option value="">Válassz meglévő ügyfelet</option>
                      {orderedClients.map((client) => {
                        const isCore = Boolean(getCoreClientKey(client));
                        return <option key={client.id} value={client.id}>{client.name}{isCore ? " · kiemelt ügyfél" : ""}</option>;
                      })}
                    </select>
                    <button type="button" onClick={() => setShowOtherClients((value) => !value)} className="mt-2 text-[11px] font-semibold text-[#8E6A1B] underline underline-offset-2">
                      {showOtherClients ? "Egyéb / teszt ügyfelek elrejtése" : "Egyéb / teszt ügyfelek megjelenítése"}
                    </button>
                    {selectedClient ? (
                      <article className="mt-3 grid grid-cols-[38px_1fr] gap-3 rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.10)] border-l-4 border-l-[#1F4A33] bg-[var(--adm-surface)] p-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-800)] font-serif text-lg text-[#F4EFDB]">{selectedClient.name.slice(0, 1).toUpperCase()}</div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><h4 className="font-serif text-lg font-medium leading-tight">{hydrateCoreClient(selectedClient).name}</h4><AdminBadge tone="green">{getCoreClientKey(selectedClient) ? "Kiemelt ügyfél" : selectedClient.taxNumber || selectedClient.companyRegistrationNumber ? "Cég" : "Ügyfél"}</AdminBadge></div>
                          <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] text-[#3D4842] md:grid-cols-2">
                            <p>Kapcsolattartó: <b>{hydrateCoreClient(selectedClient).contactPerson || selectedClient.authorizedRepresentative || "Nincs megadva"}</b></p>
                            <p>Email: <b>{hydrateCoreClient(selectedClient).email || "Nincs megadva"}</b></p>
                            <p>Telefon: <b>{hydrateCoreClient(selectedClient).phone || "Nincs megadva"}</b></p>
                            <p>Adószám: <b>{hydrateCoreClient(selectedClient).taxNumber || "Nincs megadva"}</b></p>
                          </div>
                        </div>
                      </article>
                    ) : null}
                  </>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="md:col-span-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Hivatalos név<input value={newClientData.name} onChange={(e) => { setNewClientData({ ...newClientData, name: e.target.value }); setNewCaseData((prev) => ({ ...prev, clientName: e.target.value, clientId: undefined })); }} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" /></label>
                    <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Rövid név<input value={newCaseData.clientName} onChange={(e) => setNewCaseData((prev) => ({ ...prev, clientName: e.target.value, clientId: undefined }))} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" /></label>
                    <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Típus<select value={clientType} onChange={(e) => setClientType(e.target.value as "Magánszemély" | "Cég")} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal"><option>Magánszemély</option><option>Cég</option></select></label>
                    <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Kapcsolattartó<input value={newClientData.contactPerson || ""} onChange={(e) => setNewClientData({ ...newClientData, contactPerson: e.target.value })} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" /></label>
                    <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Email<input value={newClientData.email || ""} onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" /></label>
                    <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Telefon<input value={newClientData.phone || ""} onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" /></label>
                    {clientType === "Cég" ? <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Adószám<input value={newClientData.taxNumber || ""} onChange={(e) => setNewClientData({ ...newClientData, taxNumber: e.target.value })} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" /></label> : null}
                    {clientType === "Cég" ? <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Cégjegyzékszám / nyilvántartási szám<input value={newClientData.companyRegistrationNumber || ""} onChange={(e) => setNewClientData({ ...newClientData, companyRegistrationNumber: e.target.value })} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" /></label> : null}
                    <label className="md:col-span-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Székhely / cím<input value={newClientData.address || ""} onChange={(e) => setNewClientData({ ...newClientData, address: e.target.value })} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" placeholder="pl. 1051 Budapest, ..." /></label>
                    <div className="md:col-span-2 flex flex-wrap items-center gap-3"><AdminButton variant="muted" onClick={handleSaveClientOnly} disabled={isSavingClient || !newClientData.name.trim()}>{isSavingClient ? "Ügyfél mentése..." : "Ügyfél mentése adatbázisba"}</AdminButton><p className="text-xs text-[var(--adm-text-muted)]">Az ügy létrehozásakor az új ügyfél mentett adatbázis-rekordként kapcsolódik az ügyhöz.</p>{clientMessage ? <p className="text-xs text-[var(--adm-text-muted)]">{clientMessage}</p> : null}</div>
                  </div>
                )}
              </section>

              <section className="mt-3 rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.10)] bg-white px-4 py-3 shadow-[var(--adm-shadow-sm)]">
                <div className="mb-3 flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#F2E4BD] bg-[rgba(181,138,42,0.10)] text-xs font-semibold text-[#8E6A1B]">2</span><h3 className="font-serif text-xl font-medium">Ügy típusa</h3><span className="text-[11px] font-semibold text-[var(--adm-terracotta-700)]">kötelező</span></div>
                <p className="mb-3 text-xs text-[var(--adm-text-muted)]">Nevezd meg röviden az ügyet, majd jelöld ki a legjobb ügytípus kategóriát.</p>
                <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Ügy megnevezése<input value={newCaseData.description || ""} onChange={(e) => setNewCaseData({ ...newCaseData, description: e.target.value })} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm normal-case tracking-normal" placeholder="pl. Meggyes utca 12. — ajándékozási szerződés" /></label>
                <div className="mt-4 flex flex-wrap gap-2">
                  {matterTypes.map((type) => <button key={type.value} onClick={() => setNewCaseData({ ...newCaseData, matterType: type.value })} className={`rounded-full border px-3 py-1.5 text-xs ${newCaseData.matterType === type.value ? "border-[#173824] bg-[var(--adm-green-800)] text-[#F4EFDB]" : "border-[rgba(22,32,26,0.20)] bg-white text-[#3D4842]"}`}>{type.label}</button>)}
                </div>
                {newCaseData.matterType === "CUSTOM" ? <input value={customMatterType} onChange={(e) => setCustomMatterType(e.target.value)} className="mt-3 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm" placeholder="Saját ügytípus" /> : null}
              </section>

              <section className="mt-3 rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.10)] bg-white px-4 py-3 shadow-[var(--adm-shadow-sm)]">
                <div className="mb-3 flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#F2E4BD] bg-[rgba(181,138,42,0.10)] text-xs font-semibold text-[#8E6A1B]">3</span><h3 className="font-serif text-xl font-medium">Ügyfél szerepe</h3><span className="text-[11px] text-[#A6AEA3]">opcionális</span></div>
                <p className="mb-3 text-xs text-[var(--adm-text-muted)]">Állítsd be, milyen minőségben képviseled az ügyfelet ebben az ügyben.</p>
                <div className="flex flex-wrap gap-2">{clientRoles.map((role) => <button key={role} onClick={() => setNewCaseData({ ...newCaseData, clientRole: role })} className={`rounded-full border px-3 py-1.5 text-xs ${newCaseData.clientRole === role ? "border-[#173824] bg-[var(--adm-green-800)] text-[#F4EFDB]" : "border-[rgba(22,32,26,0.20)] bg-white text-[#3D4842]"}`}>{role}</button>)}</div>
                {newCaseData.clientRole === "Egyéb / saját szerep" ? <input value={customClientRole} onChange={(e) => setCustomClientRole(e.target.value)} className="mt-3 w-full rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm" placeholder="pl. társtulajdonos" /> : null}
              </section>

              <section className="mt-3 rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.10)] bg-white px-4 py-3 shadow-[var(--adm-shadow-sm)]">
                <div className="mb-3 flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#F2E4BD] bg-[rgba(181,138,42,0.10)] text-xs font-semibold text-[#8E6A1B]">4</span><h3 className="font-serif text-xl font-medium">Határidő</h3><span className="text-[11px] text-[#A6AEA3]">opcionális</span></div>
                <p className="mb-3 text-xs text-[var(--adm-text-muted)]">Rögzíts pontos határidőt vagy relatív időablakot, ha az ügy menete ezt igényli.</p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{[{ id: "none", label: "Nincs határidő" }, { id: "date", label: "Pontos dátum" }, { id: "days", label: "X nap múlva" }, { id: "hours", label: "X óra múlva" }, { id: "minutes", label: "X perc múlva" }].map((mode) => <button key={mode.id} onClick={() => updateDeadline(mode.id as DeadlineMode)} className={`rounded border p-3 text-left text-xs font-semibold ${deadlineMode === mode.id ? "border-[#173824] bg-[var(--adm-green-800)] text-[#F4EFDB]" : "border-[rgba(22,32,26,0.20)] bg-white text-[#3D4842]"}`}>{mode.label}</button>)}</div>
                {deadlineMode === "date" ? <input type="datetime-local" value={newCaseData.deadline || ""} onChange={(e) => setNewCaseData({ ...newCaseData, deadline: e.target.value })} className="mt-3 rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm" /> : null}
                {["days", "hours", "minutes"].includes(deadlineMode) ? <input type="number" min={1} value={relativeDeadlineValue} onChange={(e) => { setRelativeDeadlineValue(e.target.value); updateDeadline(deadlineMode, e.target.value); }} className="mt-3 w-32 rounded border border-[rgba(22,32,26,0.20)] px-3 py-2 text-sm" /> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="text-[var(--adm-text-muted)]">Emlékeztető:</span>{["Nincs emlékeztető", "1 órával előtte", "1 nappal előtte", "3 nappal előtte", "1 héttel előtte"].map((item) => <button key={item} onClick={() => setReminder(item)} className={`rounded-full border px-3 py-1 ${reminder === item ? "border-[#173824] bg-[var(--adm-green-800)] text-[#F4EFDB]" : "border-[rgba(22,32,26,0.20)] bg-white"}`}>{item}</button>)}</div>
                <div className="mt-3 rounded-md border border-[#C5D3C8] bg-[#E2E8DA] p-3 text-sm text-[var(--adm-green-800)]">Határidő: <b>{formatDeadlinePreview(newCaseData.deadline)}</b>{reminder !== "Nincs emlékeztető" ? ` — emlékeztető: ${reminder}` : ""}</div>
              </section>

              <section className="mt-3 rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.10)] bg-white px-4 py-3 shadow-[var(--adm-shadow-sm)]">
                <div className="mb-3 flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#F2E4BD] bg-[rgba(181,138,42,0.10)] text-xs font-semibold text-[#8E6A1B]">5</span><h3 className="font-serif text-xl font-medium">Résztvevők</h3><span className="text-[11px] text-[#A6AEA3]">opcionális</span></div>
                <p className="mb-3 text-xs text-[var(--adm-text-muted)]">Válaszd ki, kik dolgoznak együtt az ügyön és kik kerüljenek be a review-útvonalba.</p>
                <div className="flex flex-wrap gap-2">
                  {visibleParticipants.map((user) => {
                    const active = selectedCollaboratorIds.includes(user.id);
                    const alreadyInWorkplan = workplanSteps.some((step) => step.assigneeUserId === user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        title={alreadyInWorkplan ? `${user.name} már az útvonalban` : "Hozzáadás útvonalhoz"}
                        onClick={() => {
                          if (alreadyInWorkplan) return;
                          addParticipantToWorkplan(user);
                        }}
                        disabled={alreadyInWorkplan}
                        className={`rounded-full border px-3 py-1.5 text-xs ${
                          active
                            ? "border-[#1F4A33] bg-[#E2E8DA] text-[var(--adm-green-800)]"
                            : alreadyInWorkplan
                              ? "border-[#4A6B4A] bg-[#D9E3CC] text-[#4A6B4A] cursor-default"
                              : "border-[rgba(22,32,26,0.20)] bg-white text-[#3D4842] hover:border-[#173824] hover:bg-[var(--adm-ivory-200)]"
                        }`}
                      >
                        {user.name || user.email}
                        {!alreadyInWorkplan ? (
                          <span className="ml-1 text-[9px] opacity-60">+ útvonal</span>
                        ) : alreadyInWorkplan ? (
                          <span className="ml-1 text-[9px] opacity-60">✓ útvonalban</span>
                        ) : (
                          <span className="ml-1 text-[var(--adm-text-muted)]">· {user.role}</span>
                        )}
                      </button>
                    );
                  })}
                  {visibleParticipants.length === 0 ? <span className="text-xs text-[var(--adm-text-muted)]">Még nincs aktív belső felhasználó a pilot résztvevőkhöz.</span> : null}
                </div>
                <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Résztvevőket később is hozzáadhatsz az ügy oldaláról.</p>
              </section>

              <section className="mt-3 rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.10)] bg-white px-4 py-3 shadow-[var(--adm-shadow-sm)]">
                <div className="mb-3 flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#F2E4BD] bg-[rgba(181,138,42,0.10)] text-xs font-semibold text-[#8E6A1B]">6</span><h3 className="font-serif text-xl font-medium">Munkaterv / review-útvonal</h3><span className="text-[11px] text-[#A6AEA3]">opcionális</span></div>
                <p className="mb-3 text-xs text-[var(--adm-text-muted)]">Építsd fel, ki milyen sorrendben dolgozik az ügyön.</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["none", "Nincs munkaterv"],
                    ["simple", "Egyszerű"],
                    ["trainee-partner", "Jelölt → partner"],
                    ["three-step", "Jelölt → ügyvéd → partner"],
                    ["custom", "Saját"],
                  ].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => applyWorkplanPreset(value)} className={`rounded-full border px-3 py-1.5 text-xs ${workplanPreset === value ? "border-[#173824] bg-[var(--adm-green-800)] text-[#F4EFDB]" : "border-[rgba(22,32,26,0.20)] bg-white text-[#3D4842]"}`}>{label}</button>
                  ))}
                </div>
                {workplanSteps.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {workplanSteps.length > 1 && (
                      <p className="text-[10px] text-[var(--adm-text-soft)]">⟳ Sorrend módosítása: fogd meg és húzd a lépést, vagy használd a fel/le gombokat.</p>
                    )}
                    {workplanSteps.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 rounded border border-[#C5D3C8] bg-[#E2E8DA] p-2 text-xs">
                        <span className="text-[#4A6B4A] font-semibold">Útvonal:</span>
                        {workplanSteps.map((step, idx) => {
                          const assignee = visibleParticipants.find((u) => u.id === step.assigneeUserId);
                          const name = assignee ? assignee.name : step.title || "?";
                          return (
                            <span key={step.id} className="flex items-center gap-1">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--adm-green-800)] text-[9px] font-bold text-[#F4EFDB]">{idx + 1}</span>
                              <span className="font-medium text-[var(--adm-green-800)]">{name}</span>
                              {idx < workplanSteps.length - 1 && <span className="mx-1 text-[var(--adm-text-muted)]">→</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="space-y-2">
                      {workplanSteps.map((step, index) => {
                        const assignee = visibleParticipants.find((u) => u.id === step.assigneeUserId);
                        return (
                          <div
                            key={step.id}
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(index)); e.currentTarget.classList.add("opacity-60"); }}
                            onDragEnd={(e) => { e.currentTarget.classList.remove("opacity-60"); }}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-[var(--adm-ochre-500)]"); }}
                            onDragLeave={(e) => { e.currentTarget.classList.remove("border-[var(--adm-ochre-500)]"); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.currentTarget.classList.remove("border-[var(--adm-ochre-500)]");
                              const fromIndex = parseInt(e.dataTransfer.getData("text/plain") || "-1", 10);
                              if (fromIndex !== -1 && fromIndex !== index) {
                                setWorkplanSteps((prev) => {
                                  const next = [...prev];
                                  const [moved] = next.splice(fromIndex, 1);
                                  next.splice(index, 0, moved);
                                  return next;
                                });
                              }
                            }}
                            className="rounded-lg border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-3 cursor-grab active:cursor-grabbing"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--adm-green-800)] text-[10px] font-bold text-[#F4EFDB]">{index + 1}</span>
                              <input value={step.title} onChange={(e) => updateWorkplanStep(step.id, { title: e.target.value })} placeholder="Feladat megnevezése" className="flex-1 rounded border border-[rgba(22,32,26,0.20)] bg-white px-2 py-1.5 text-xs text-[var(--adm-text)] outline-none focus:border-[#1F4A33]" />
                              {assignee && (
                                <span className="shrink-0 rounded-full border border-[#4A6B4A] bg-[#D9E3CC] px-2 py-0.5 text-[10px] text-[#4A6B4A]">{assignee.name}{assignee.role ? ` · ${getRoleLabel(assignee.role)}` : ''}</span>
                              )}
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[1fr_180px_130px]">
                              <select value={step.assigneeUserId} onChange={(e) => updateWorkplanStep(step.id, { assigneeUserId: e.target.value })} className="rounded border border-[rgba(22,32,26,0.20)] bg-white px-2 py-1.5 text-xs text-[var(--adm-text)] outline-none focus:border-[#1F4A33]">
                                <option value="">Felelős</option>
                                {visibleParticipants.map((user) => <option key={user.id} value={user.id}>{user.name}{user.role && user.role !== 'LAWYER' ? ` (${user.role === 'PARTNER' ? 'partner' : user.role === 'TRAINEE' ? 'ügyvédjelölt' : user.role})` : ''}</option>)}
                              </select>
                              <input type="date" value={step.dueDate} onChange={(e) => updateWorkplanStep(step.id, { dueDate: e.target.value })} className="rounded border border-[rgba(22,32,26,0.20)] bg-white px-2 py-1.5 text-xs text-[var(--adm-text)] outline-none focus:border-[#1F4A33]" />
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => moveUpStep(index)} disabled={index === 0} className="flex h-6 w-6 items-center justify-center rounded border border-[rgba(22,32,26,0.20)] text-[10px] text-[#3D4842] disabled:opacity-30 hover:bg-[var(--adm-ivory-200)]" title="Fel">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path d="M5 15l7-7 7 7"/></svg>
                                </button>
                                <button type="button" onClick={() => moveDownStep(index)} disabled={index === workplanSteps.length - 1} className="flex h-6 w-6 items-center justify-center rounded border border-[rgba(22,32,26,0.20)] text-[10px] text-[#3D4842] disabled:opacity-30 hover:bg-[var(--adm-ivory-200)]" title="Le">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path d="M19 9l-7 7-7-7"/></svg>
                                </button>
                                <button type="button" onClick={() => removeWorkplanStep(step.id)} className="flex h-6 w-6 items-center justify-center rounded border border-[rgba(181,42,42,0.30)] text-[var(--adm-terracotta-700)] hover:bg-[#FFF0EE]" title="Lépés törlése">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                              </div>
                            </div>
                            <textarea value={step.note} onChange={(e) => updateWorkplanStep(step.id, { note: e.target.value })} rows={1} placeholder="Leírás / megjegyzés" className="mt-2 w-full resize-none rounded border border-[rgba(22,32,26,0.20)] bg-white px-2 py-1.5 text-xs text-[var(--adm-text)] outline-none focus:border-[#1F4A33]" />
                          </div>
                        );
                      })}
                    </div>
                    <AdminButton size="sm" variant="muted" onClick={addWorkplanStep}>+ Lépés hozzáadása</AdminButton>
                    <p className="text-[11px] text-[var(--adm-text-muted)]">A lépések valós ügyfeladatként jönnek létre. Felelős csak akkor kerül mentésre, ha létező felhasználót választasz.</p>
                  </div>
                ) : (
                  <div className="mt-4 rounded border border-dashed border-[rgba(22,32,26,0.20)] bg-[#FFFBEF] p-5 text-center">
                    <p className="text-sm font-medium text-[#3D4842]">Építsd fel, ki milyen sorrendben dolgozik az ügyön.</p>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Válassz egy sablont vagy adj lépéseket egyénileg. A fenti résztvevők közül egy kattintással is hozzáadhatsz valakit az útvonalhoz.</p>
                  </div>
                )}
              </section>

              {createError ? <div className="mb-4 rounded border border-[#F2DAD6] bg-[#F2DAD6] p-3 text-xs font-semibold text-[var(--adm-terracotta-700)]">{createError}</div> : null}
            </div>

            <div className="adm-wizard-footer flex flex-col gap-3 border-t px-5 py-3 shadow-[0_-8px_22px_rgba(22,32,26,0.06)] sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-[11.5px] leading-5 text-[var(--adm-text-muted)]">Az ügy létrehozása után a Dokumentumtárba lépünk, ahol feltöltheted az első iratot.</p>
              <div className="flex shrink-0 justify-end gap-2"><AdminButton variant="ghost" onClick={() => setShowNewCaseModal(false)}>Mégse</AdminButton><AdminButton variant="primary" size="lg" onClick={handleCreateCase} disabled={isCreating}>{isCreating ? "Létrehozás..." : "Ügy létrehozása"}</AdminButton></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
