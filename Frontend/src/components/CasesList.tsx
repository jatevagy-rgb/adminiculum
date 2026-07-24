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
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [showOtherClients, setShowOtherClients] = useState(false);
  const [backendCases, setBackendCases] = useState<CaseListItem[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [caseLoadError, setCaseLoadError] = useState<string | null>(null);
  const requestedNewCase = searchParams?.get("newCase") === "1";
  const requestedClientId = searchParams?.get("clientId") || "";
  const [initialClientApplied, setInitialClientApplied] = useState(false);

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

  // ?newCase=1 opens the intake dialog. Any ?clientId is handed to the dialog as
  // initialClientId — it no longer needs pre-seeding into local wizard state.
  useEffect(() => {
    if (!requestedNewCase || initialClientApplied) return;
    setShowNewCaseModal(true);
    setInitialClientApplied(true);
  }, [requestedNewCase, initialClientApplied]);

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
