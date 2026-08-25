"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCommunications,
  getCommunicationById,
  runOutlookSync,
  linkCommunicationToClient,
  linkCommunicationToCase,
  ignoreCommunication,
  unignoreCommunication,
  getCases,
  getClients,
  type CommunicationItem,
  type CommunicationDetail,
  type OutlookSyncSummary,
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

export default function CommunicationsOverview() {
  const router = useRouter();
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<OutlookSyncSummary | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [cases, setCases] = useState<CaseOption[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [assignCase, setAssignCase] = useState<Record<string, string>>({});
  const [assignClient, setAssignClient] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CommunicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "needs-assignment" | "unlinked">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCommunications({ limit: 50 });
      setCommunications(data.communications);
      setSelectedId((current) => current || data.communications[0]?.id || null);
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
  }, []);

  useEffect(() => {
    void load();
    void loadLookups();
  }, [load, loadLookups]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    setDetailLoading(true);
    void getCommunicationById(selectedId)
      .then(setSelected)
      .catch(() => setSelected(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setSyncSummary(null);
    try {
      const result = await runOutlookSync();
      setSyncSummary(result.summary);
      setSyncMessage({ type: "success", text: "Az Outlook szinkron kész." });
      await load();
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

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("hu-HU", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const needsAssignment = communications.filter((c) => c.triage === "NEEDS_ASSIGNMENT").length;
  const visibleCommunications = communications.filter((communication) => {
    if (filter === "needs-assignment") return communication.triage === "NEEDS_ASSIGNMENT";
    if (filter === "unlinked") return !communication.caseId;
    return true;
  });

  return (
    <div className="min-h-screen bg-[var(--adm-ivory-50)]">
      <header className="border-b border-[#DDD7CA] bg-[#FAF8F2] px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#1F2821]">Bejövő kommunikáció</h1>
            <p className="mt-1 text-xs text-[#7B776D]">
              Beérkező és rögzített kommunikáció áttekintése
              {needsAssignment > 0 ? ` · ${needsAssignment} feldolgozásra vár` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Kommunikáció szűrése">
            {[
              ["all", "Összes"],
              ["needs-assignment", "Feldolgozásra vár"],
              ["unlinked", "Nincs ügyhöz kapcsolva"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value as typeof filter)}
                className={`rounded border px-3 py-1.5 text-[11px] font-semibold ${filter === value ? "border-[#1F4A33] bg-[#1F4A33] text-white" : "border-[#DDD7CA] bg-white text-[#514D45]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 text-xs uppercase tracking-[0.12em] bg-[#1F4A33] text-[#FBF6E7] hover:bg-[#173824] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? "Frissítés..." : "Bejövő levelezés frissítése"}
          </button>
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
            <p className="mt-1 text-xs text-[#7B776D]">A bejövő levelezés frissítésével új üzenetek kerülhetnek ide.</p>
          </div>
        ) : visibleCommunications.length === 0 ? (
          <div className="rounded border border-[#DDD7CA] bg-white p-8 text-center">
            <p className="text-sm text-[#514D45]">Nincs a szűrésnek megfelelő kommunikáció.</p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="overflow-x-auto rounded border border-[#DDD7CA] bg-white">
            <table className="w-full min-w-[680px] text-left text-sm">
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
                {visibleCommunications.map((comm) => (
                  <tr key={comm.id} className={`align-top hover:bg-[#FAF8F2] ${selectedId === comm.id ? "bg-[#FAF8F2]" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1F2821]">{comm.senderName || comm.senderEmail || "Ismeretlen feladó"}</p>
                      <p className="text-[11px] text-[#7B776D]">
                        {comm.direction === "INBOUND" ? "Bejövő" : comm.direction === "OUTBOUND" ? "Kimenő" : "Rögzített"}
                        {comm.source === "OUTLOOK" ? " · Külső levelezés" : ""}
                      </p>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <button
                        onClick={() => setSelectedId(comm.id)}
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
                      {comm.triage === "NEEDS_ASSIGNMENT" ? (
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
                                  <option key={cl.id} value={cl.id}>
                                    {cl.name}
                                  </option>
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
          <aside className="min-w-0 rounded border border-[#DDD7CA] bg-white p-4" aria-live="polite">
            {detailLoading ? (
              <p className="text-sm text-[#7B776D]">Kommunikáció betöltése…</p>
            ) : selected ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Kiválasztott kommunikáció</p>
                  <h2 className="mt-1 break-words font-serif text-xl font-semibold text-[#1F2821]">{selected.subject || "Tárgy nélkül"}</h2>
                  <p className="mt-1 text-xs text-[#7B776D]">{selected.senderName || selected.senderEmail || "Ismeretlen feladó"} · {formatDate(selected.receivedAt || selected.createdAt)}</p>
                </div>
                <div className="space-y-2 text-sm text-[#1F2821]">
                  <p><strong>Ügyfél:</strong> {selected.client?.name || "Nincs ügyfélhez kapcsolva"}</p>
                  <p><strong>Ügy:</strong> {selected.case ? `${selected.case.caseNumber} — ${selected.case.title}` : "Nincs ügyhöz kapcsolva"}</p>
                  {selected.recipientName || selected.recipientEmail ? <p><strong>Címzett:</strong> {selected.recipientName || selected.recipientEmail}</p> : null}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#3D4842]">{selected.content || selected.contentPreview || "Ehhez a kommunikációhoz nem érhető el tartalom."}</p>
                <div className="flex flex-wrap gap-2">
                  {selected.caseId ? <button type="button" onClick={() => router.push(`/cases/${selected.caseId}`)} className="rounded bg-[#1F4A33] px-3 py-2 text-xs font-semibold text-white">Ügy megnyitása</button> : null}
                  {selected.attachments.length > 0 ? <span className="rounded border border-[#DDD7CA] px-3 py-2 text-xs text-[#514D45]">{selected.attachments.length} melléklet</span> : null}
                </div>
                {selected.relatedTasks.length > 0 ? (
                  <div className="border-t border-[#EEE9DE] pt-3">
                    <p className="text-xs font-semibold text-[#1F2821]">Kapcsolódó feladatok</p>
                    <ul className="mt-2 space-y-1 text-xs text-[#514D45]">{selected.relatedTasks.map((task) => <li key={task.id}>{task.title}</li>)}</ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[#7B776D]">Válassz kommunikációt a részletek megtekintéséhez.</p>
            )}
          </aside>
          </div>
        )}
      </main>
    </div>
  );
}
