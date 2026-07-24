"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CaseIntakeDialog } from "@/components/cases/intake/CaseIntakeDialog";
import type { CaseIntakeResult } from "@/lib/api";
import {
  ApiError,
  addCaseCollaborator,
  createCase,
  createClient,
  createTask,
  getCases,
  getClients,
  getCurrentUser,
  getUsers,
  type CaseListItem,
  type Client,
  type CreateCaseData,
  type CreateClientData,
  type CurrentUser,
  type User,
} from "@/lib/api";
import { getCaseDisplayTitle, getCaseMatterTypeLabel } from "@/lib/caseLabels";
import { getClientAccentBorderClass } from "@/lib/clientColors";
import { AdminBadge, AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { CompactState, OperationalPageHeader, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";

const statusLabel: Record<string, string> = {
  OPEN: "Nyitott",
  ON_HOLD: "Függőben",
  CLOSED: "Lezárt",
  DRAFT: "Piszkozat",
  ARCHIVED: "Archivált",
  CLIENT_INPUT: "Ügyféltől érkezett",
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
  return getCaseMatterTypeLabel(value);
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
  const [scopeFilter, setScopeFilter] = useState<"ACTIVE" | "MINE" | "CLOSED">("ACTIVE");
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
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

  const wizardSteps = useMemo(() => {
    const hasClient = clientMode === "existing"
      ? Boolean(newCaseData.clientId)
      : Boolean(newClientData.name.trim() || newCaseData.clientName.trim());
    const hasMatter = Boolean((newCaseData.description || "").trim() && newCaseData.matterType);
    const hasRole = Boolean(newCaseData.clientRole);
    const hasDeadline = deadlineMode !== "none" || Boolean(newCaseData.deadline);
    const hasParticipants = selectedCollaboratorIds.length > 0;
    const hasWorkplan = workplanSteps.length > 0;
    const items = [
      { label: "Ügyfél", complete: hasClient },
      { label: "Ügy típusa", complete: hasMatter },
      { label: "Szerep", complete: hasRole },
      { label: "Határidő", complete: hasDeadline },
      { label: "Résztvevők", complete: hasParticipants },
      { label: "Munkaterv", complete: hasWorkplan },
    ];
    const firstIncompleteIndex = items.findIndex((item) => !item.complete);
    const currentIndex = firstIncompleteIndex === -1 ? items.length - 1 : firstIncompleteIndex;
    return items.map((item, index) => ({
      ...item,
      current: index === currentIndex,
    }));
  }, [clientMode, deadlineMode, newCaseData.clientId, newCaseData.clientName, newCaseData.clientRole, newCaseData.deadline, newCaseData.description, newCaseData.matterType, newClientData.name, selectedCollaboratorIds.length, workplanSteps.length]);

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
      const displayMessage =
        err instanceof ApiError && err.status === 0
          ? "A szolgáltatás nem érhető el. Próbáld újra később."
          : err instanceof ApiError && err.status === 409
            ? "Az ügy nem hozható létre a megadott adatokkal."
            : "Az ügy létrehozása sikertelen.";
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
      console.error("Failed to create client:", err);
      setClientMessage("Az ügyfél mentése sikertelen.");
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
      const [response, me] = await Promise.all([getCases(1, 200), getCurrentUser()]);
      setBackendCases(response.data);
      setCurrentUser(me);
    } catch (err) {
      console.error("Failed to load cases:", err);
      setCaseLoadError("Az ügylista betöltése sikertelen.");
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
      const status = String(item.status || "").toUpperCase();
      const scopeMatch =
        scopeFilter === "ACTIVE"
          ? !["CLOSED", "ARCHIVED"].includes(status)
          : scopeFilter === "CLOSED"
            ? ["CLOSED", "ARCHIVED"].includes(status)
            : item.assignedLawyer?.id === currentUser?.id && !["CLOSED", "ARCHIVED"].includes(status);
      const practiceMatch = practiceArea === "all" || item.matterType === practiceArea;
      const clientMatch = !normalizedQuery || (item.clientName ?? "").toLowerCase().includes(normalizedQuery);
      const workPriorityMatch = workPriorityFilter === "all" || deriveWorkPriorityLabel(item.priority) === workPriorityFilter;
      return scopeMatch && practiceMatch && clientMatch && workPriorityMatch;
    });
  }, [backendCases, clientName, currentUser?.id, deriveWorkPriorityLabel, practiceArea, scopeFilter, workPriorityFilter]);

  const caseEntrypointStats = useMemo(() => {
    const activeCases = backendCases.filter(
      (item) => !["CLOSED", "ARCHIVED"].includes(String(item.status || "").toUpperCase()),
    ).length;
    const assignedCases = backendCases.filter((item) => Boolean(item.assignedLawyer?.name)).length;
    const highAttentionCases = backendCases.filter((item) => deriveWorkPriorityLabel(item.priority) === "Magas").length;
    return { activeCases, assignedCases, highAttentionCases };
  }, [backendCases, deriveWorkPriorityLabel]);

  return (
    <section className="space-y-3">
      <OperationalPageHeader
        title="Ügyek"
        count={`${filteredCases.length} ügy`}
        subtitle="Válassz ügyet a következő feladat, dokumentum vagy határidő megnyitásához."
        primaryAction={<AdminButton variant="primary" onClick={() => setShowNewCaseModal(true)}>Új ügy</AdminButton>}
      />

      <div className="flex flex-col gap-3 border border-[var(--adm-border)] bg-white p-3 lg:flex-row lg:items-end">
        <div className="flex flex-wrap gap-1">
          {[
            ["ACTIVE", "Aktív", caseEntrypointStats.activeCases],
            ["MINE", "Rám vár", backendCases.filter((item) => item.assignedLawyer?.id === currentUser?.id && !["CLOSED", "ARCHIVED"].includes(String(item.status || "").toUpperCase())).length],
            ["CLOSED", "Lezárt", backendCases.filter((item) => ["CLOSED", "ARCHIVED"].includes(String(item.status || "").toUpperCase())).length],
          ].map(([value, label, count]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setScopeFilter(value as "ACTIVE" | "MINE" | "CLOSED")}
              className={`px-3 py-2 text-[11px] font-semibold ${scopeFilter === value ? "bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)]" : "bg-[var(--adm-surface)] text-[var(--adm-text)] hover:bg-[var(--adm-sand-100)]"}`}
            >
              {label} <span className="ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">
          Szakterület
          <select value={practiceArea} onChange={(e) => setPracticeArea(e.target.value)} className="adm-board-field mt-1 block h-9 w-44 px-2 text-xs">
            <option value="all">Mind</option>
            {matterTypes.filter((type) => type.value !== "CUSTOM").map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">
          Ügyfél
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="adm-board-field mt-1 block h-9 w-48 px-2 text-xs" placeholder="Ügyfél keresése" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">
          Munkaprioritás
          <select value={workPriorityFilter} onChange={(e) => setWorkPriorityFilter(e.target.value)} className="adm-board-field mt-1 block h-9 w-40 px-2 text-xs">
            <option value="all">Mind</option>
            <option value="Alacsony">Alacsony</option>
            <option value="Közepes">Közepes</option>
            <option value="Magas">Magas</option>
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <AdminButton size="sm" variant="neutral" onClick={() => { setPracticeArea("all"); setClientName(""); setWorkPriorityFilter("all"); }}>Szűrők törlése</AdminButton>
        </div>
      </div>

      <div className="overflow-hidden border border-[var(--adm-border)] bg-white">
        {isLoadingCases ? (
          <div className="p-4"><CompactState title="Ügyek betöltése…" /></div>
        ) : caseLoadError ? (
          <div className="p-4"><SafePanelError onRetry={() => void loadCases()} /></div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left">
            <thead>
              <tr className="border-b border-[var(--adm-border)] bg-[var(--adm-surface)] text-[10px] uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">
                <th className="px-3 py-2.5">Ügyszám</th>
                <th className="px-3 py-2.5">Ügyfél</th>
                <th className="px-3 py-2.5">Ügy</th>
                <th className="px-3 py-2.5">Szakterület</th>
                <th className="px-3 py-2.5">Státusz</th>
                <th className="px-3 py-2.5">Felelős</th>
                <th className="px-3 py-2.5">Prioritás</th>
                <th className="px-3 py-2.5 text-right">Következő lépés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--adm-border)]">
              {filteredCases.map((item) => (
                <tr key={item.id} className="cursor-pointer hover:bg-[var(--adm-surface)]" onClick={() => router.push(`/cases/${item.id}`)}>
                  <td className={`border-l-[5px] px-3 py-2.5 text-xs font-semibold text-[var(--adm-text)] ${getClientAccentBorderClass(item.clientColorKey)}`}>{item.caseNumber}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--adm-text)]">{item.clientName || "Nincs megadva"}</span>
                    </div>
                  </td>
                  <td className="max-w-[280px] px-3 py-2.5 text-[13px] text-[#3D4842]"><span className="block truncate">{getCaseDisplayTitle(item)}</span></td>
                  <td className="px-3 py-2.5 text-[12px] text-[#3D4842]">{formatMatterType(item.matterType)}</td>
                  <td className="px-3 py-2.5"><AdminStatusPill tone={item.status === "OPEN" ? "green" : "neutral"}>{statusLabel[item.status] || item.status}</AdminStatusPill></td>
                  <td className="px-3 py-2.5 text-xs text-[#3D4842]">{item.assignedLawyer?.name || "Nincs felelős"}</td>
                  <td className="px-3 py-2.5"><AdminBadge tone={deriveWorkPriorityLabel(item.priority) === "Magas" ? "amber" : "neutral"}>{deriveWorkPriorityLabel(item.priority)}</AdminBadge></td>
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <AdminButton size="sm" variant="primary" onClick={() => router.push(`/cases/${item.id}`)}>Ügy megnyitása</AdminButton>
                  </td>
                </tr>
              ))}
              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4"><CompactState title="Nincs megjeleníthető ügy." detail="Módosítsd a szűrőket, vagy hozz létre új ügyet." /></td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <CaseIntakeDialog
        open={showNewCaseModal}
        onClose={() => setShowNewCaseModal(false)}
        initialClientId={requestedClientId || undefined}
        onCreated={(result: CaseIntakeResult) => {
          setShowNewCaseModal(false);
          // One transactional create; go straight to the new matter cockpit.
          router.push(`/cases/${result.case.id}`);
        }}
      />
    </section>
  );
}
