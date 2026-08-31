"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCommunications,
  runOutlookSync,
  linkCommunicationToClient,
  linkCommunicationToCase,
  ignoreCommunication,
  unignoreCommunication,
  createCaseFromCommunication,
  getCases,
  getClients,
  getUsers,
  getOutlookStatus,
  type CommunicationItem,
  type OutlookSyncSummary,
  type OutlookStatus,
} from "@/lib/api";

const triageLabels: Record<CommunicationItem["triage"], string> = {
  LINKED: "Ügyhöz kapcsolva",
  NEEDS_ASSIGNMENT: "Feldolgozásra vár",
  IGNORED: "Nem ügyhöz tartozó",
  DUPLICATE_OR_ERROR: "Ismétlődő / hiba",
};

const triageColors: Record<CommunicationItem["triage"], string> = {
  LINKED: "bg-[#10B981] text-white",
  NEEDS_ASSIGNMENT: "bg-[#F59E0B] text-white",
  IGNORED: "bg-[#9CA3AF] text-white",
  DUPLICATE_OR_ERROR: "bg-[#DC2626] text-white",
};

type CaseOption = { id: string; caseNumber: string; title: string; clientId: string | null };
type UserOption = { id: string; name: string; email: string };

type CreateCaseForm = {
  title: string;
  matterType: string;
  assignedLawyerId: string;
  deadline: string;
};

export default function CommunicationsOverview() {
  const router = useRouter();
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<OutlookSyncSummary | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [outlookStatus, setOutlookStatus] = useState<OutlookStatus | null>(null);

  const [cases, setCases] = useState<CaseOption[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assignCase, setAssignCase] = useState<Record<string, string>>({});
  const [assignClient, setAssignClient] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const [createCaseFor, setCreateCaseFor] = useState<string | null>(null);
  const [createCaseForm, setCreateCaseForm] = useState<CreateCaseForm>({
    title: "",
    matterType: "OTHER",
    assignedLawyerId: "",
    deadline: "",
  });
  const [creatingCase, setCreatingCase] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCommunications({ limit: 50 });
      setCommunications(data.communications);
    } catch {
      setError("A kommunikáció betöltése sikertelen.");
      setCommunications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLookups = useCallback(async () => {
    try {
      const caseResp = await getCases(1, 200);
      setCases(
        (caseResp.data || []).map((c: any) => ({
          id: c.id,
          caseNumber: c.caseNumber,
          title: c.title,
          clientId: c.clientId || null,
        })),
      );
    } catch {
      setCases([]);
    }
    try {
      const clientResp = await getClients();
      setClients((clientResp.data || []).map((c: any) => ({ id: c.id, name: c.name })));
    } catch {
      setClients([]);
    }
    try {
      const userResp = await getUsers();
      setUsers(userResp.map((u: any) => ({ id: u.id, name: u.name, email: u.email })));
    } catch {
      setUsers([]);
    }
  }, []);

  const loadOutlookStatus = useCallback(async () => {
    try {
      const status = await getOutlookStatus();
      setOutlookStatus(status);
    } catch {
      setOutlookStatus({ available: false, reason: "UNAVAILABLE", message: "Átmenetileg nem érhető el." });
    }
  }, []);

  useEffect(() => {
    void load();
    void loadLookups();
    void loadOutlookStatus();
  }, [load, loadLookups, loadOutlookStatus]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setSyncSummary(null);
    try {
      const result = await runOutlookSync();
      if (!result.success) {
        setSyncMessage({ type: "error", text: "Az Outlook szinkron nem sikerült. Próbáld újra később." });
        return;
      }
      setSyncSummary(result.summary);
      setSyncMessage({ type: "success", text: "Az Outlook szinkron kész." });
      await load();
      void loadOutlookStatus();
    } catch (err: any) {
      const msg = err?.message || "Az Outlook szinkron nem sikerült. Próbáld újra később.";
      setSyncMessage({ type: "error", text: msg });
    } finally {
      setSyncing(false);
    }
  };

  const handleLinkCase = async (communicationId: string) => {
    const caseId = assignCase[communicationId];
    if (!caseId) return;
    setAssigningId(communicationId);
    setSyncMessage(null);
    try {
      await linkCommunicationToCase(communicationId, caseId);
      await load();
    } catch {
      setSyncMessage({ type: "error", text: "Nem sikerült az ügyhöz kapcsolás." });
    } finally {
      setAssigningId(null);
    }
  };

  const handleLinkClient = async (communicationId: string) => {
    const clientId = assignClient[communicationId];
    if (!clientId) return;
    setAssigningId(communicationId);
    setSyncMessage(null);
    try {
      await linkCommunicationToClient(communicationId, clientId);
      await load();
    } catch {
      setSyncMessage({ type: "error", text: "Nem sikerült az ügyfélhez rendelés." });
    } finally {
      setAssigningId(null);
    }
  };

  const handleIgnore = async (communicationId: string) => {
    setSyncMessage(null);
    try {
      await ignoreCommunication(communicationId);
      await load();
    } catch {
      setSyncMessage({ type: "error", text: "A megjelölés nem sikerült." });
    }
  };

  const handleUnignore = async (communicationId: string) => {
    setSyncMessage(null);
    try {
      await unignoreCommunication(communicationId);
      await load();
    } catch {
      setSyncMessage({ type: "error", text: "A visszaállítás nem sikerült." });
    }
  };

  const handleCreateCase = async (communicationId: string) => {
    if (!createCaseForm.title.trim()) return;
    setCreatingCase(true);
    setSyncMessage(null);
    try {
      const result = await createCaseFromCommunication(communicationId, {
        title: createCaseForm.title.trim(),
        matterType: createCaseForm.matterType,
        assignedLawyerId: createCaseForm.assignedLawyerId || undefined,
        deadline: createCaseForm.deadline || undefined,
      });
      setCreateCaseFor(null);
      setCreateCaseForm({ title: "", matterType: "OTHER", assignedLawyerId: "", deadline: "" });
      setSyncMessage({ type: "success", text: `Ügy létrehozva: ${result.case.caseNumber}` });
      await load();
      router.push(`/cases/${result.case.id}`);
    } catch (err: any) {
      const msg = err?.message || "Nem sikerült az ügy létrehozása.";
      setSyncMessage({ type: "error", text: msg });
    } finally {
      setCreatingCase(false);
    }
  };

  const openCreateCaseForm = (comm: CommunicationItem) => {
    setCreateCaseFor(comm.id);
    setCreateCaseForm({
      title: comm.subject || "",
      matterType: "OTHER",
      assignedLawyerId: "",
      deadline: "",
    });
  };

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("hu-HU", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const needsAssignment = communications.filter((c) => c.triage === "NEEDS_ASSIGNMENT").length;

  return (
    <div className="min-h-screen bg-[var(--adm-ivory-50)]">
      <header className="border-b border-[#DDD7CA] bg-[#FAF8F2] px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#1F2821]">Ügykommunikáció</h1>
            <p className="mt-1 text-xs text-[#7B776D]">
              Outlook levelezés és rögzített kommunikáció áttekintése
              {needsAssignment > 0 ? ` · ${needsAssignment} feldolgozásra vár` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {outlookStatus && (
              <span className={`text-[11px] px-2 py-1 rounded ${outlookStatus.available ? "bg-[#F0FDF4] text-[#059669]" : "bg-[#F9FAFB] text-[#7B776D]"}`}>
                {outlookStatus.available ? "Outlook szinkronizálható" : outlookStatus.message}
                {outlookStatus.lastSyncAt ? ` · Utolsó: ${formatDate(outlookStatus.lastSyncAt)}` : ""}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing || !outlookStatus?.available}
              className="px-4 py-2 text-xs uppercase tracking-[0.12em] bg-[#1F4A33] text-[#FBF6E7] hover:bg-[#173824] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? "Szinkronizálás folyamatban…" : "Szinkronizálás most"}
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className={`mt-3 p-3 text-xs rounded ${syncMessage.type === "success" ? "bg-[#F0FDF4] text-[#059669]" : "bg-[#FEF2F2] text-[#DC2626]"}`}>
            {syncMessage.text}
          </div>
        )}
        {syncSummary && (
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded border border-[#DDD7CA] bg-white p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Importálva</p>
              <p className="mt-1 text-lg font-semibold text-[#1F4A33]">{syncSummary.imported}</p>
            </div>
            <div className="rounded border border-[#DDD7CA] bg-white p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Már ismert</p>
              <p className="mt-1 text-lg font-semibold text-[#514D45]">{syncSummary.alreadyKnown}</p>
            </div>
            <div className="rounded border border-[#DDD7CA] bg-white p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Feldolgozásra vár</p>
              <p className="mt-1 text-lg font-semibold text-[#B45309]">{syncSummary.needsAssignment}</p>
            </div>
            <div className="rounded border border-[#DDD7CA] bg-white p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Sikertelen</p>
              <p className="mt-1 text-lg font-semibold text-[#DC2626]">{syncSummary.failed}</p>
            </div>
          </div>
        )}
      </header>

      <main className="px-6 py-5">
        {error && (
          <div className="mb-4 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded">
            <p className="text-xs text-[#DC2626]">{error}</p>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-[#7B776D]">Kommunikáció betöltése…</p>
        ) : communications.length === 0 ? (
          <div className="rounded border border-[#DDD7CA] bg-white p-8 text-center">
            <p className="text-sm text-[#514D45]">Még nincs kommunikáció.</p>
            <p className="mt-1 text-xs text-[#7B776D]">{'A „Szinkronizálás most" gombbal importálhatod a bejövő levelezést.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-[#DDD7CA] bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#DDD7CA] bg-[#F6F2E8]">
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Feladó</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Tárgy</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Ügyfél</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Ügy</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Időpont</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Státusz</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-[#7B776D]">Műveletek</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEE9DE]">
                {communications.map((comm) => (
                  <tr key={comm.id} className="align-top hover:bg-[#FAF8F2]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1F2821]">{comm.senderName || comm.senderEmail || "Ismeretlen feladó"}</p>
                      <p className="text-[11px] text-[#7B776D]">
                        {comm.direction === "INBOUND" ? "Bejövő" : comm.direction === "OUTBOUND" ? "Kimenő" : "Rögzített"}
                        {comm.source === "OUTLOOK" ? " · Outlook" : ""}
                        {comm.providerConversationId ? " · szál" : ""}
                      </p>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <button
                        onClick={() => comm.caseId && router.push(`/cases/${comm.caseId}/communications`)}
                        className="text-left text-[#1F2821] hover:text-[#C9A227] line-clamp-2"
                      >
                        {comm.subject || "(tárgy nélkül)"}
                      </button>
                      {comm.contentPreview && <p className="mt-1 text-[11px] text-[#7B776D] line-clamp-2">{comm.contentPreview}</p>}
                      {comm.attachmentCount > 0 && (
                        <p className="mt-1 text-[10px] text-[#B45309]">{comm.attachmentCount} melléklet</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#1F2821]">{comm.client?.name || "—"}</td>
                    <td className="px-4 py-3">
                      {comm.caseId ? (
                        <button
                          onClick={() => router.push(`/cases/${comm.caseId}`)}
                          className="text-[#1F4A33] hover:text-[#C9A227]"
                        >
                          {comm.case?.caseNumber || "Ügy"}
                        </button>
                      ) : (
                        <span className="text-[#9C9890]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[#7B776D] whitespace-nowrap">{formatDate(comm.receivedAt || comm.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-1 text-[10px] font-medium ${triageColors[comm.triage]}`}>
                        {triageLabels[comm.triage]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {createCaseFor === comm.id ? (
                        <div className="space-y-2 min-w-[260px]">
                          <input
                            type="text"
                            value={createCaseForm.title}
                            onChange={(e) => setCreateCaseForm((f) => ({ ...f, title: e.target.value }))}
                            placeholder="Ügy tárgya"
                            className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-[11px] text-[#1F2821]"
                          />
                          <select
                            value={createCaseForm.matterType}
                            onChange={(e) => setCreateCaseForm((f) => ({ ...f, matterType: e.target.value }))}
                            className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-[11px] text-[#1F2821]"
                          >
                            <option value="OTHER">Egyéb</option>
                            <option value="CONTRACT">Szerződés</option>
                            <option value="LITIGATION">Peres</option>
                            <option value="ADVISORY">Tanácsadás</option>
                          </select>
                          <select
                            value={createCaseForm.assignedLawyerId}
                            onChange={(e) => setCreateCaseForm((f) => ({ ...f, assignedLawyerId: e.target.value }))}
                            className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-[11px] text-[#1F2821]"
                          >
                            <option value="">Felelős ügyvéd…</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={createCaseForm.deadline}
                            onChange={(e) => setCreateCaseForm((f) => ({ ...f, deadline: e.target.value }))}
                            className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-[11px] text-[#1F2821]"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCreateCase(comm.id)}
                              disabled={!createCaseForm.title.trim() || creatingCase}
                              className="px-2 py-1 text-[10px] uppercase bg-[#1F4A33] text-[#FBF6E7] disabled:opacity-40"
                            >
                              {creatingCase ? "Létrehozás…" : "Ügy létrehozása"}
                            </button>
                            <button
                              onClick={() => setCreateCaseFor(null)}
                              className="px-2 py-1 text-[10px] uppercase border border-[#DDD7CA] text-[#1F2821]"
                            >
                              Mégse
                            </button>
                          </div>
                        </div>
                      ) : comm.triage === "NEEDS_ASSIGNMENT" ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={assignCase[comm.id] || ""}
                              onChange={(e) => setAssignCase((s) => ({ ...s, [comm.id]: e.target.value }))}
                              className="flex-1 border border-[#DDD7CA] bg-white px-2 py-1 text-[11px] text-[#1F2821]"
                            >
                              <option value="">Ügy…</option>
                              {cases.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.caseNumber} — {c.title}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleLinkCase(comm.id)}
                              disabled={!assignCase[comm.id] || assigningId === comm.id}
                              className="px-2 py-1 text-[10px] uppercase bg-[#1F4A33] text-[#FBF6E7] disabled:opacity-40"
                            >
                              Ügyhöz
                            </button>
                          </div>
                          {clients.length > 0 && (
                            <div className="flex gap-2">
                              <select
                                value={assignClient[comm.id] || ""}
                                onChange={(e) => setAssignClient((s) => ({ ...s, [comm.id]: e.target.value }))}
                                className="flex-1 border border-[#DDD7CA] bg-white px-2 py-1 text-[11px] text-[#1F2821]"
                              >
                                <option value="">Ügyfél…</option>
                                {clients.map((cl) => (
                                  <option key={cl.id} value={cl.id}>{cl.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleLinkClient(comm.id)}
                                disabled={!assignClient[comm.id] || assigningId === comm.id}
                                className="px-2 py-1 text-[10px] uppercase border border-[#DDD7CA] text-[#1F2821] disabled:opacity-40"
                              >
                                Ügyfélhez
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => openCreateCaseForm(comm)}
                            className="text-[10px] text-[#1F4A33] underline hover:text-[#C9A227]"
                          >
                            Új ügy létrehozása ebből
                          </button>
                          <button
                            onClick={() => handleIgnore(comm.id)}
                            className="text-[10px] text-[#7B776D] underline hover:text-[#514D45]"
                          >
                            Nem ügyhöz tartozó
                          </button>
                        </div>
                      ) : comm.triage === "IGNORED" ? (
                        <button
                          onClick={() => handleUnignore(comm.id)}
                          className="text-[10px] text-[#7B776D] underline hover:text-[#514D45]"
                        >
                          Visszaállítás
                        </button>
                      ) : (
                        <span className="text-[#9C9890]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
