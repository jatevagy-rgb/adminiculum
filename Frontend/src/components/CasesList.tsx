"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CompactNewCaseDialog } from "@/components/cases/CompactNewCaseDialog";
import {
  ApiError,
  addCaseCollaborator,
  createCase,
  createClient,
  createTask,
  getCases,
  getCaseAttention,
  type CaseAttentionItem,
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
import { AdminButton } from "@/components/adminiculum/ui";
import { PageHeader, Badge, StatusChip, EmptyState } from "@/components/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";

import { matchesCaseScope, caseStatusLabel, casePriorityLabel, caseDeadline, attentionForCase, matchesOperationalFilter, nextActionLabel, loadCaseAttentionPages } from '@/lib/casesOperational';

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
  const [scopeFilter, setScopeFilter] = useState<"ACTIVE" | "MINE" | "CLOSED">(() => {
    const rawScope = searchParams?.get("scope")?.toUpperCase();
    if (rawScope === "ACTIVE" || rawScope === "MINE" || rawScope === "CLOSED") {
      return rawScope;
    }
    return "ACTIVE";
  });
  const [practiceArea, setPracticeArea] = useState("all");
  const [clientName, setClientName] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>(() => (searchParams?.get("clientId") || "").trim());
  const [workPriorityFilter, setWorkPriorityFilter] = useState("all");
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [showOtherClients, setShowOtherClients] = useState(false);
  const [backendCases, setBackendCases] = useState<CaseListItem[]>([]);
  const [operationalFilter, setOperationalFilter] = useState('all');
  const [attentionCoverage, setAttentionCoverage] = useState<{ clientId: string; items: Map<string, CaseAttentionItem> }>({ clientId: '', items: new Map() });
  const attentionItems = useMemo(() => attentionCoverage.clientId === selectedClientId ? attentionCoverage.items : new Map<string, CaseAttentionItem>(), [attentionCoverage, selectedClientId]);
  useEffect(() => {
    let cancelled = false;
    setAttentionCoverage({ clientId: selectedClientId, items: new Map() });
    void loadCaseAttentionPages(getCaseAttention, selectedClientId || undefined).then(items => {
      if (!cancelled) setAttentionCoverage({ clientId: selectedClientId, items });
    });
    return () => { cancelled = true; };
  }, [selectedClientId]);
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
    return casePriorityLabel(priority);
  }, []);

  const loadCases = useCallback(async (clientIdScope?: string) => {
    setIsLoadingCases(true);
    setCaseLoadError(null);
    try {
      const [response, me] = await Promise.all([
        getCases(1, 200, undefined, clientIdScope || undefined),
        getCurrentUser(),
      ]);
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
    loadCases(selectedClientId);
  }, [loadCases, selectedClientId]);

  useEffect(() => {
    if (showNewCaseModal || selectedClientId) {
      getUsers()
        .then(setAvailableUsers)
        .catch((err) => console.warn("Failed to load users for collaborator selection:", err));
      getClients()
        .then((result) => setAvailableClients(result.data || []))
        .catch((err) => console.warn("Failed to load clients for case linkage:", err));
    }
  }, [showNewCaseModal, selectedClientId]);

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
      const scopeMatch = matchesCaseScope(item, scopeFilter, currentUser?.id);
      const practiceMatch = practiceArea === "all" || item.matterType === practiceArea;
      const clientIdMatch = !selectedClientId || item.clientId === selectedClientId;
      const clientMatch = !normalizedQuery || (item.clientName ?? "").toLowerCase().includes(normalizedQuery);
      const workPriorityMatch = workPriorityFilter === "all" || deriveWorkPriorityLabel(item.priority) === workPriorityFilter;
      return scopeMatch && practiceMatch && clientIdMatch && clientMatch && workPriorityMatch && matchesOperationalFilter(item, attentionForCase(attentionItems, item.id), operationalFilter);
    });
  }, [backendCases, clientName, currentUser?.id, deriveWorkPriorityLabel, practiceArea, scopeFilter, selectedClientId, workPriorityFilter, attentionItems, operationalFilter]);

  const caseEntrypointStats = useMemo(() => {
    const activeCases = backendCases.filter(
      (item) => matchesCaseScope(item, 'ACTIVE'),
    ).length;
    const assignedCases = backendCases.filter((item) => Boolean(item.assignedLawyer?.name)).length;
    const highAttentionCases = backendCases.filter((item) => deriveWorkPriorityLabel(item.priority) === "Magas").length;
    return { activeCases, assignedCases, highAttentionCases };
  }, [backendCases, deriveWorkPriorityLabel]);

  const filteredClientLabel = useMemo(() => {
    if (!selectedClientId) return null;
    const fromCases = backendCases.find((c) => c.clientId === selectedClientId)?.clientName;
    if (fromCases) return `Ügyfél: ${fromCases}`;
    const fromClients = availableClients.find((c) => c.id === selectedClientId)?.name;
    if (fromClients) return `Ügyfél: ${fromClients}`;
    return "Ügyfél szerinti szűrés aktív";
  }, [backendCases, availableClients, selectedClientId]);

  return (
    <section className="space-y-4">
      <PageHeader
        title="Ügyek"
        badge={
          <Badge tone="neutral" className="text-xs px-2 py-0.5">
            {filteredCases.length} ügy a betöltött {backendCases.length} közül (legfeljebb 200)
          </Badge>
        }
        subtitle="Válassz ügyet a következő feladat, dokumentum vagy határidő megnyitásához."
        primaryAction={
          <AdminButton variant="primary" onClick={() => setShowNewCaseModal(true)}>
            Új ügy
          </AdminButton>
        }
      />

      <div className="rounded-lg border border-[#E5E7E6] bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Nézet</span>
            <div className="flex overflow-hidden rounded-md border border-[#E5E7E6]">
              {[
                ["ACTIVE", "Aktív", caseEntrypointStats.activeCases],
                ["MINE", "Hozzám rendelve", backendCases.filter((item) => matchesCaseScope(item, 'MINE', currentUser?.id)).length],
                ["CLOSED", "Lezárt", backendCases.filter((item) => matchesCaseScope(item, 'CLOSED')).length],
              ].map(([value, label, count]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setScopeFilter(value as "ACTIVE" | "MINE" | "CLOSED")}
                  className={`border-l border-[#E5E7E6] px-3 py-1.5 text-[11px] font-medium transition-colors first:border-l-0 ${
                    scopeFilter === value
                      ? "bg-[#0F3D32] text-white"
                      : "bg-[#F8FAF9] text-[#374151] hover:bg-[#EAEFEA]"
                  }`}
                >
                  {label} <span className="ml-1 opacity-70">{count}</span>
                </button>
              ))}
            </div>
          </div>
          <span className="hidden self-stretch border-l border-[#E5E7E6] lg:block" aria-hidden="true" />
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
            Szakterület
            <select
              value={practiceArea}
              onChange={(e) => setPracticeArea(e.target.value)}
              className="block h-9 w-44 rounded-md border border-[#E5E7E6] bg-white px-2.5 text-xs text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
            >
              <option value="all">Mind</option>
              {matterTypes.filter((type) => type.value !== "CUSTOM").map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
              Ügyfél
              <input
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  if (selectedClientId) setSelectedClientId("");
                }}
                className="mt-1 block h-9 w-48 rounded-md border border-[#E5E7E6] bg-white px-2.5 text-xs text-[#1F2937] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
                placeholder="Ügyfél keresése"
              />
            </label>
            {selectedClientId && (
              <div className="flex items-center gap-1 rounded border border-[#BCE4CE] bg-[#E8F5EE] px-2 py-0.5 text-[10px] text-[#0F3D32]">
                <span className="font-medium">{filteredClientLabel}</span>
                <button
                  type="button"
                  onClick={() => setSelectedClientId("")}
                  className="ml-auto font-bold text-[#0F3D32]/70 hover:text-[#0F3D32]"
                  title="Ügyfélszűrő törlése"
                  aria-label="Ügyfélszűrő törlése"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
            Munkaprioritás
            <select
              value={workPriorityFilter}
              onChange={(e) => setWorkPriorityFilter(e.target.value)}
              className="block h-9 w-40 rounded-md border border-[#E5E7E6] bg-white px-2.5 text-xs text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
            >
              <option value="all">Mind</option>
              <option value="Alacsony">Alacsony</option>
              <option value="Közepes">Közepes</option>
              <option value="Magas">Magas</option>
              <option value="Sürgős">Sürgős</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
            Teendők
            <select
              aria-label="Teendők szűrése"
              value={operationalFilter}
              onChange={(e) => setOperationalFilter(e.target.value)}
              className="block h-9 w-40 rounded-md border border-[#E5E7E6] bg-white px-2.5 text-xs text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
            >
              <option value="all">Mind</option>
              <option value="attention">Figyelmet igényel</option>
              <option value="deadline">Határidős</option>
            </select>
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <AdminButton
              size="sm"
              variant="neutral"
              onClick={() => {
                setPracticeArea("all");
                setClientName("");
                setSelectedClientId("");
                setWorkPriorityFilter("all");
                setOperationalFilter('all');
              }}
            >
              Szűrők törlése
            </AdminButton>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E5E7E6] bg-white shadow-sm">
        {isLoadingCases ? (
          <div className="p-4"><CompactState title="Ügyek betöltése…" /></div>
        ) : caseLoadError ? (
          <div className="p-4"><SafePanelError onRetry={() => void loadCases(selectedClientId)} /></div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-[#E5E7E6] bg-[#F8FAF9] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                <th className="px-3 py-2.5">Ügy</th>
                <th className="px-3 py-2.5">Határidő</th>
                <th className="px-3 py-2.5">Következő teendő</th>
                <th className="px-3 py-2.5">Ügyfél</th>
                <th className="px-3 py-2.5">Státusz</th>
                <th className="px-3 py-2.5">Felelős</th>
                <th className="px-3 py-2.5">Prioritás</th>
                <th className="px-3 py-2.5 text-right">Művelet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7E6]">
              {filteredCases.map((item) => {
                const attention = attentionForCase(attentionItems, item.id);
                const deadline = caseDeadline(item, attention);
                return (
                <tr
                  key={item.id}
                  className="cursor-pointer transition-colors hover:bg-[#F8FAF9] focus-within:bg-[#F8FAF9]"
                  onClick={() => router.push(`/cases/${item.id}`)}
                >
                  <td className={`max-w-[300px] border-l-[4px] px-3 py-2.5 align-top ${getClientAccentBorderClass(item.clientColorKey)}`}>
                    <span className="block truncate text-[13px] font-semibold text-[#1F2937]">{getCaseDisplayTitle(item)}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-[#6B7280]">{item.caseNumber} · {formatMatterType(item.matterType)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-top">
                    {deadline.dueAt ? (
                      <span className={`block text-[13px] font-semibold ${deadline.overdue ? 'text-red-700' : 'text-[#1F2937]'}`}>{deadline.label}</span>
                    ) : (
                      <span className={`block text-xs text-[#6B7280]${deadline.state === 'UNKNOWN' ? ' italic' : ''}`}>{deadline.label}</span>
                    )}
                    {deadline.overdue ? <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-red-700">Lejárt</span> : null}
                    {deadline.sourceLabel ? <span className="mt-0.5 block text-[10px] text-[#6B7280]">{deadline.sourceLabel}</span> : null}
                  </td>
                  <td className="max-w-[300px] px-3 py-2.5 align-top">
                    {attention.state === 'KNOWN' && (attention.attention.urgency === 'URGENT' || attention.attention.urgency === 'ATTENTION') ? (
                      <span className={`mb-0.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] ${attention.attention.urgency === 'URGENT' ? 'text-red-700' : 'text-amber-800'}`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {attention.attention.urgency === 'URGENT' ? 'Sürgős' : 'Figyelmet igényel'}
                      </span>
                    ) : null}
                    <span className={`block text-xs leading-5 line-clamp-2 ${attention.state === 'UNKNOWN' ? 'italic text-[#6B7280]' : 'text-[#374151]'}`}>{nextActionLabel(attention)}</span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-[13px] text-[#1F2937]">{item.clientName || "Nincs megadva"}</td>
                  <td className="px-3 py-2.5 align-top">
                    <StatusChip
                      status={item.status === 'ACTIVE' ? 'active' : item.status === 'ON_HOLD' ? 'warning' : 'closed'}
                    >
                      {caseStatusLabel(item.status)}
                    </StatusChip>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs">{item.assignedLawyer?.name ? <span className="text-[#374151]">{item.assignedLawyer.name}</span> : <span className="text-[#9CA3AF]">Nincs felelős</span>}</td>
                  <td className="px-3 py-2.5 align-top">
                    <Badge
                      status={item.priority === 'URGENT' ? 'urgent' : item.priority === 'HIGH' ? 'warning' : 'completed'}
                      tone={item.priority === 'URGENT' ? 'terracotta' : item.priority === 'HIGH' ? 'gold' : 'neutral'}
                    >
                      {deriveWorkPriorityLabel(item.priority)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 align-top text-right" onClick={(e) => e.stopPropagation()}>
                    <AdminButton size="sm" variant="neutral" className="border-[#0F3D32] text-[#0F3D32] hover:bg-[#E8F5EE]" onClick={() => router.push(`/cases/${item.id}`)}>Ügy megnyitása</AdminButton>
                  </td>
                </tr>
              ); })}
              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8">
                    <EmptyState
                      className="border-0 bg-transparent py-4"
                      title="Nincs megjeleníthető ügy."
                      description="Módosítsd a szűrőket, vagy hozz létre új ügyet."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <CompactNewCaseDialog
        open={showNewCaseModal}
        onClose={() => setShowNewCaseModal(false)}
        initialClientId={requestedClientId || undefined}
      />
    </section>
  );
}
