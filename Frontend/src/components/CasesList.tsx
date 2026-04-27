"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createCase, type CreateCaseData, type CreateCaseResponse, getCases, type CaseListItem, getUsers, addCaseCollaborator, type User, getClients, type Client } from "@/lib/api";

// Client color palette - deterministic mapping per clientName
const CLIENT_COLOR_PALETTE = [
  { bg: "#2D6A4F", border: "#1B4332", label: "dark-green" },
  { bg: "#1D3557", border: "#0D1B2A", label: "dark-blue" },
  { bg: "#9B2226", border: "#6D1618", label: "dark-red" },
  { bg: "#5C4D3C", border: "#3D3229", label: "brown" },
  { bg: "#4A1942", border: "#2E0F2B", label: "dark-purple" },
  { bg: "#1B4332", border: "#0F2922", label: "forest" },
  { bg: "#2C3E50", border: "#1A252F", label: "dark-slate" },
  { bg: "#6B3E26", border: "#4A2B1A", label: "dark-brown" },
];

const getClientColor = (clientName?: string | null): { bg: string; border: string; label: string } => {
  if (!clientName) return CLIENT_COLOR_PALETTE[0];
  // Deterministic index based on clientName string - same name always gets same color
  let hash = 0;
  for (let i = 0; i < clientName.length; i++) {
    hash = clientName.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return CLIENT_COLOR_PALETTE[Math.abs(hash) % CLIENT_COLOR_PALETTE.length];
};

const statusChip: Record<string, string> = {
  OPEN: "bg-[#E8F0E8] text-[#065F46] border-[#9EE7C7]",
  ON_HOLD: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  CLOSED: "bg-[#E5E7EB] text-[#374151] border-[#CBD5F5]",
  DRAFT: "bg-[#EAF0E7] text-[#2C4A35] border-[#BFD1C3]",
  "IN REVIEW": "bg-[#F6F1E3] text-[#67572A] border-[#DCCEA0]",
  APPROVED: "bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]",
  CLIENT_INPUT: "bg-[#EFE9DC] text-[#6B675D] border-[#D7D0C3]",
  ARCHIVED: "bg-[#F3F4F6] text-[#64748B] border-[#E5E7EB]",
};

const matterTypes = [
  { value: "REAL_ESTATE", label: "Real Estate" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "LITIGATION", label: "Litigation" },
  { value: "EMPLOYMENT", label: "Employment" },
  { value: "CONTRACT", label: "Contract" },
  { value: "MERGERS_ACQUISITIONS", label: "M&A" },
  { value: "IP", label: "IP" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "OTHER", label: "Other" },
];

export function CasesList() {
  const router = useRouter();
  const [practiceArea, setPracticeArea] = useState("all");
  const [clientName, setClientName] = useState("");
  const [riskLevel, setRiskLevel] = useState("all");
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [newCaseData, setNewCaseData] = useState<CreateCaseData>({
    clientName: "",
    matterType: "",
    priority: "MEDIUM",
    description: "",
    clientRole: "",
    deadline: "",
  });
  const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [backendCases, setBackendCases] = useState<CaseListItem[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [caseLoadError, setCaseLoadError] = useState<string | null>(null);


  const handleCreateCase = async () => {
    if ((!newCaseData.clientName.trim() && !newCaseData.clientId) || !newCaseData.matterType) {
      setCreateError("Client (existing or new name) and matter type are required");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const result = await createCase(newCaseData);
      // Attach selected collaborators after case is created
      for (const userId of selectedCollaboratorIds) {
        try {
          await addCaseCollaborator(result.id, userId, 'COLLABORATOR');
        } catch (collabErr) {
          console.warn(`Failed to add collaborator ${userId}:`, collabErr);
        }
      }
      setShowNewCaseModal(false);
      setNewCaseData({ clientName: "", clientId: "", matterType: "", priority: "MEDIUM", description: "", clientRole: "", deadline: "" });
      setSelectedCollaboratorIds([]);
      // Navigate using result.id (CUID) - the backend getCaseById queries by id, not caseNumber
      router.push(`/cases/${result.id}`);
    } catch (err) {
      console.error("Failed to create case:", err);
      setCreateError(err instanceof Error ? err.message : "Failed to create case");
    } finally {
      setIsCreating(false);
    }
  };

  const deriveRiskLevel = useCallback((priority?: string) => {
    if (!priority) return "Medium";
    const normalized = priority.toLowerCase();
    if (normalized.includes("high") || normalized.includes("urgent")) return "High";
    if (normalized.includes("low")) return "Low";
    return "Medium";
  }, []);

  const chipClassForStatus = useCallback((status?: string) => {
    const normalized = status?.toUpperCase() ?? "";
    return statusChip[normalized] || "bg-[#EFE9DC] text-[#6B675D] border-[#D7D0C3]";
  }, []);

  const loadCases = useCallback(async () => {
    setIsLoadingCases(true);
    setCaseLoadError(null);
    try {
      const response = await getCases(1, 200);
      setBackendCases(response.data);
    } catch (err) {
      console.error("Failed to load cases:", err);
      setCaseLoadError(err instanceof Error ? err.message : "Failed to load cases");
    } finally {
      setIsLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // Load available users when the new case modal opens
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

  const filteredCases = useMemo(() => {
    const normalizedQuery = clientName.trim().toLowerCase();
    return backendCases.filter((item) => {
      const practiceMatch = practiceArea === "all" || item.matterType === practiceArea;
      const clientMatch = !normalizedQuery || (item.clientName ?? "").toLowerCase().includes(normalizedQuery);
      const riskMatch = riskLevel === "all" || deriveRiskLevel(item.priority) === riskLevel;
      return practiceMatch && clientMatch && riskMatch;
    });
  }, [backendCases, practiceArea, clientName, riskLevel, deriveRiskLevel]);

  return (
    <section className="space-y-4">
      <div className="bg-white border border-[#DDD7CA] p-4">
        <h2 className="text-sm font-semibold text-[#1F2821]">Kanonikus ügylista</h2>
        <p className="text-xs text-[#7B776D] mt-1">
          Ez a központi ügyfelület: innen lehet ügyet keresni, szűrni, megnyitni és új ügyet indítani.
        </p>
      </div>

      <div className="bg-white border border-[#DDD7CA] p-4 flex flex-wrap items-end gap-3">
        <label className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D]">
          Szakterület
          <select value={practiceArea} onChange={(e) => setPracticeArea(e.target.value)} className="mt-2 h-9 w-44 block border border-[#DDD7CA] bg-[#FAF8F2] px-2 text-xs text-[#1F2821]">
            <option value="all">All</option>
            {matterTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D]">
          Ügyfél neve
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-2 h-9 w-48 block border border-[#DDD7CA] bg-[#FAF8F2] px-2 text-xs text-[#1F2821]" placeholder="Search client" />
        </label>
        <label className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D]">
          Kockázati szint
          <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="mt-2 h-9 w-40 block border border-[#DDD7CA] bg-[#FAF8F2] px-2 text-xs text-[#1F2821]">
            <option value="all">All</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </label>
        <button
          className="ml-auto h-9 px-4 border border-[#1A2E21] text-[#1A2E21] text-[10px] uppercase tracking-[0.28em]"
          onClick={() => {
            setPracticeArea("all");
            setClientName("");
            setRiskLevel("all");
          }}
        >
          Reset Filters
        </button>
        <button
          onClick={() => setShowNewCaseModal(true)}
          className="h-9 px-4 bg-[#1A2E21] text-white text-[10px] uppercase tracking-[0.28em] hover:bg-[#2A3E31] transition-colors"
        >
          + New Case
        </button>
      </div>

      <div className="bg-white border border-[#DDD7CA] overflow-hidden">
        {isLoadingCases ? (
          <div className="py-12 text-center text-xs text-[#7B776D]">Loading cases from backend...</div>
        ) : caseLoadError ? (
          <div className="p-6 text-center text-xs text-[#A63D40] border-b border-[#DDD7CA]">
            <p>{caseLoadError}</p>
            <button onClick={loadCases} className="mt-3 text-[#C9A227] underline">Retry</button>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-[#F6F2E8] border-b border-[#DDD7CA]">
              <tr className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D]">
                <th className="px-4 py-3">Case #</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Ügy címe</th>
                <th className="px-4 py-3">Szakterület</th>
                <th className="px-4 py-3">Státusz</th>
                <th className="px-4 py-3">Felelős</th>
                <th className="px-4 py-3">Kockázat</th>
                <th className="px-4 py-3">Művelet</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[#ECE6DA] last:border-b-0 hover:bg-[#FBF9F3] cursor-pointer"
                  onClick={() => router.push(`/cases/${item.id}`)}
                >
                  <td className="px-4 py-4 text-xs text-[#1F2821] font-semibold">{item.caseNumber}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.clientColor || getClientColor(item.clientName).bg }}
                        title={`Ügyfélszín: ${item.clientColor ? item.clientColor : getClientColor(item.clientName).label}`}
                      />
                      <span className="text-sm text-[#1F2821]">{item.clientName || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-[#514D45]">{item.title}</td>
                  <td className="px-4 py-4 text-sm text-[#514D45] capitalize">{item.matterType?.toLowerCase().replace(/_/g, " ") || "—"}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-1 text-[10px] uppercase tracking-[0.24em] border ${chipClassForStatus(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {item.assignedLawyer ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[#514D45]">{item.assignedLawyer.name}</span>
                        {(item.collaboratorCount ?? 0) > 0 && (
                          <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-medium bg-[#8B5CF6] text-white rounded-full" title={`${item.collaboratorCount} résztvevő`}>
                            +{item.collaboratorCount}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#9C9890] italic">Nincs hozzárendelve</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-[#6B675F]">
                      {deriveRiskLevel(item.priority)}
                    </span>
                  </td>
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => router.push(`/cases/${item.id}`)}
                      className="text-[10px] uppercase tracking-[0.24em] border border-[#DDD7CA] px-3 py-1 text-[#514D45] hover:text-[#1A2E21]"
                    >
                      Megnyitás
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-[#7B776D]">
                    <p>Nincs találat a beállított szűrőkre.</p>
                    <p className="mt-1 text-[11px] text-[#9C9890]">Az ügyek új ügy létrehozásával vagy meglévő ügyadatok alapján jelennek meg itt.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border border-[#DDD7CA] p-4 flex flex-wrap gap-3 items-center justify-between">
        <p className="text-xs text-[#6C685F]">Megjelenítve: {filteredCases.length} / {backendCases.length} ügy</p>
        <span className="text-[10px] uppercase tracking-[0.24em] text-[#6C685F]">Az ARCHIVED státusz archivált ügyet jelez</span>
      </div>

      {/* New Case Modal */}
      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg shadow-2xl border border-[#e4e2dd]">
            <div className="bg-[#06190d] px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-['Newsreader'] font-bold text-white">New Case</h2>
                <p className="text-xs text-white/60 mt-1">Create a new case to get started</p>
              </div>
              <button
                onClick={() => setShowNewCaseModal(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#434843] mb-2">Meglévő ügyfél (opcionális)</label>
                  <select
                    value={newCaseData.clientId || ""}
                    onChange={(e) => {
                      const nextClientId = e.target.value;
                      const linkedClient = availableClients.find((client) => client.id === nextClientId);
                      setNewCaseData({
                        ...newCaseData,
                        clientId: nextClientId || undefined,
                        clientName: linkedClient?.name || newCaseData.clientName,
                      });
                    }}
                    className="w-full p-3 border border-[#DDD7CA] text-sm text-[#1F2821] focus:outline-none focus:border-[#06190d]"
                  >
                    <option value="">Nincs kiválasztva</option>
                    {availableClients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#434843] mb-2">Ügyfél neve *</label>
                  <input
                    type="text"
                    value={newCaseData.clientName}
                    onChange={(e) => setNewCaseData({ ...newCaseData, clientName: e.target.value, clientId: undefined })}
                    placeholder="Enter client name"
                    className="w-full p-3 border border-[#DDD7CA] text-sm text-[#1F2821] placeholder-[#9C9890] focus:outline-none focus:border-[#06190d]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#434843] mb-2">Matter Type *</label>
                  <select
                    value={newCaseData.matterType}
                    onChange={(e) => setNewCaseData({ ...newCaseData, matterType: e.target.value })}
                    className="w-full p-3 border border-[#DDD7CA] text-sm text-[#1F2821] focus:outline-none focus:border-[#06190d]"
                  >
                    <option value="">Select matter type</option>
                    {matterTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#434843] mb-2">Priority</label>
                  <select
                    value={newCaseData.priority}
                    onChange={(e) => setNewCaseData({ ...newCaseData, priority: e.target.value })}
                    className="w-full p-3 border border-[#DDD7CA] text-sm text-[#1F2821] focus:outline-none focus:border-[#06190d]"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#434843] mb-2">Ügyfél szerepe</label>
                  <select
                    value={newCaseData.clientRole}
                    onChange={(e) => setNewCaseData({ ...newCaseData, clientRole: e.target.value })}
                    className="w-full p-3 border border-[#DDD7CA] text-sm text-[#1F2821] focus:outline-none focus:border-[#06190d]"
                  >
                    <option value="">Nincs megadva</option>
                    <option value="megbízó">Megbízó</option>
                    <option value="ellenérdekű fél">Ellenérdekű fél</option>
                    <option value="partner">Partner</option>
                    <option value="other">Egyéb</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#434843] mb-2">Határidő</label>
                  <input
                    type="date"
                    value={newCaseData.deadline || ""}
                    onChange={(e) => setNewCaseData({ ...newCaseData, deadline: e.target.value })}
                    className="w-full p-3 border border-[#DDD7CA] text-sm text-[#1F2821] focus:outline-none focus:border-[#06190d]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#434843] mb-2">Résztvevők (opcionális)</label>
                  <div className="border border-[#DDD7CA] text-sm text-[#1F2821] max-h-28 overflow-y-auto">
                    {availableUsers.length === 0 ? (
                      <div className="p-2 text-xs text-[#9C9890]">Felhasználók betöltése...</div>
                    ) : (
                      availableUsers.map((user) => (
                        <label
                          key={user.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-[#FBF9F3] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCollaboratorIds.includes(user.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCollaboratorIds([...selectedCollaboratorIds, user.id]);
                              } else {
                                setSelectedCollaboratorIds(selectedCollaboratorIds.filter((id) => id !== user.id));
                              }
                            }}
                            className="accent-[#06190d]"
                          />
                          <span className="text-xs text-[#1F2821]">{user.name || user.email}</span>
                          <span className="text-[10px] text-[#7B776D]">({user.role})</span>
                        </label>
                      ))
                    )}
                  </div>
                  {selectedCollaboratorIds.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedCollaboratorIds.map((id) => {
                        const user = availableUsers.find((u) => u.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#8B5CF6] text-white text-[10px] rounded-full"
                          >
                            {user?.name || id}
                            <button
                              onClick={() => setSelectedCollaboratorIds(selectedCollaboratorIds.filter((cid) => cid !== id))}
                              className="hover:text-white/70 ml-1"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#434843] mb-2">Description</label>
                  <textarea
                    value={newCaseData.description}
                    onChange={(e) => setNewCaseData({ ...newCaseData, description: e.target.value })}
                    placeholder="Brief case description (optional)"
                    rows={3}
                    className="w-full p-3 border border-[#DDD7CA] text-sm text-[#1F2821] placeholder-[#9C9890] focus:outline-none focus:border-[#06190d] resize-none"
                  />
                </div>
                {createError && (
                  <div className="p-3 bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a] text-xs">{createError}</div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e4e2dd] flex justify-end gap-3">
              <button
                onClick={() => setShowNewCaseModal(false)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCase}
                disabled={isCreating}
                className="px-6 py-2 text-xs font-bold uppercase tracking-widest bg-[#06190d] text-white hover:opacity-90 disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create Case"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
