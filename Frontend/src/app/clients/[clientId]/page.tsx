"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  getClient,
  getCases,
  createCase,
  updateClient,
  getCaseDocuments,
  getCommunications,
  getUsers,
  addCaseCollaborator,
  type Client,
  type CaseListItem,
  type CreateCaseData,
  type DocumentItem,
  type CommunicationItem,
  type User,
} from "@/lib/api";

type DossierDocument = DocumentItem & { caseNumber: string; caseId: string };

const formatDate = (value?: string) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    CLIENT_INPUT: "Ügyfél input",
    DRAFT: "Vázlat",
    IN_REVIEW: "Felülvizsgálat",
    APPROVED: "Jóváhagyott",
    SENT_TO_CLIENT: "Ügyfélnek küldve",
    CLIENT_FEEDBACK: "Ügyfél visszajelzés",
    FINAL: "Végleges",
    CLOSED: "Lezárt",
  };
  return map[status] || status;
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = (params?.clientId as string) || "";

  const [client, setClient] = useState<Client | null>(null);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [casesLoadError, setCasesLoadError] = useState<string | null>(null);

  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [caseFormData, setCaseFormData] = useState<CreateCaseData>({
    clientName: "",
    clientId: "",
    matterType: "OTHER",
    priority: "MEDIUM",
    description: "",
    deadline: "",
  });
  const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isSavingCase, setIsSavingCase] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Client>>({});
  const [isSavingClient, setIsSavingClient] = useState(false);

  const loadClientData = useCallback(async () => {
    if (!clientId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [clientData, directClientComms] = await Promise.all([
        getClient(clientId),
        getCommunications({ clientId, limit: 15 }).catch(() => ({ communications: [], pagination: { total: 0, limit: 0, offset: 0 } })),
      ]);

      const casesResponse = await getCases(1, 100, undefined, clientId).catch(() => null);
      if (!casesResponse) {
        setCasesLoadError("A kapcsolt ügyek listája jelenleg nem elérhető.");
      } else {
        setCasesLoadError(null);
      }

      const relatedCases = casesResponse?.data || [];
      setClient(clientData);
      setCases(relatedCases);

      setCaseFormData((prev) => ({ ...prev, clientName: clientData.name, clientId: clientData.id }));

      const [documentsByCase, commsByCase] = await Promise.all([
        Promise.all(
          relatedCases.map(async (item) => {
            const docs = await getCaseDocuments(item.id).catch(() => [] as DocumentItem[]);
            return docs.map((doc) => ({ ...doc, caseId: item.id, caseNumber: item.caseNumber }));
          })
        ),
        Promise.all(
          relatedCases.map(async (item) => {
            const comms = await getCommunications({ caseId: item.id, limit: 8 }).catch(() => ({ communications: [] as CommunicationItem[], pagination: { total: 0, limit: 0, offset: 0 } }));
            return comms.communications;
          })
        ),
      ]);

      const mergedDocuments = documentsByCase.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDocuments(mergedDocuments.slice(0, 12));

      const commMap = new Map<string, CommunicationItem>();
      for (const comm of directClientComms.communications) {
        commMap.set(comm.id, comm);
      }
      for (const comm of commsByCase.flat()) {
        commMap.set(comm.id, comm);
      }
      const mergedCommunications = Array.from(commMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setCommunications(mergedCommunications.slice(0, 12));
    } catch (err) {
      console.error("Failed to load client dossier:", err);
      setError("Nem sikerült betölteni az ügyfél dossziét.");
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadClientData();
  }, [loadClientData]);

  // Load available users when the new case modal opens
  useEffect(() => {
    if (showNewCaseModal) {
      getUsers()
        .then(setAvailableUsers)
        .catch((err) => console.warn("Failed to load users:", err));
    }
  }, [showNewCaseModal]);

  const handleCreateCase = async () => {
    if (!caseFormData.clientName?.trim() || !caseFormData.matterType) return;
    setIsSavingCase(true);
    try {
      const created = await createCase({
        clientName: caseFormData.clientName,
        clientId: client?.id,
        matterType: caseFormData.matterType,
        priority: caseFormData.priority,
        description: caseFormData.description,
        deadline: caseFormData.deadline || undefined,
      });
      // Attach selected collaborators after case is created
      for (const userId of selectedCollaboratorIds) {
        try {
          await addCaseCollaborator(created.id, userId, 'COLLABORATOR');
        } catch (collabErr) {
          console.warn(`Failed to add collaborator ${userId}:`, collabErr);
        }
      }
      setShowNewCaseModal(false);
      setCaseFormData((prev) => ({ ...prev, deadline: "" }));
      setSelectedCollaboratorIds([]);
      await loadClientData();
      router.push(`/cases/${created.id}`);
    } catch (err) {
      console.error("Create case failed:", err);
      alert("Nem sikerült létrehozni az ügyet.");
    } finally {
      setIsSavingCase(false);
    }
  };

  const openEditClient = () => {
    if (!client) return;
    setEditFormData({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      taxNumber: client.taxNumber || "",
      companyRegistrationNumber: client.companyRegistrationNumber || "",
      authorizedRepresentative: client.authorizedRepresentative || "",
      contactPerson: client.contactPerson || "",
      color: client.color || "",
    });
    setShowEditModal(true);
  };

  const handleSaveClient = async () => {
    if (!editFormData.name?.trim()) return;
    setIsSavingClient(true);
    try {
      await updateClient(clientId, {
        name: editFormData.name,
        email: editFormData.email || undefined,
        phone: editFormData.phone || undefined,
        address: editFormData.address || undefined,
        taxNumber: editFormData.taxNumber || undefined,
        companyRegistrationNumber: editFormData.companyRegistrationNumber || undefined,
        authorizedRepresentative: editFormData.authorizedRepresentative || undefined,
        contactPerson: editFormData.contactPerson || undefined,
        color: editFormData.color || undefined,
      });
      setShowEditModal(false);
      await loadClientData();
    } catch (err) {
      console.error("Update client failed:", err);
      alert("Nem sikerült menteni az ügyfél adatait.");
    } finally {
      setIsSavingClient(false);
    }
  };

  const dossierStats = useMemo(() => {
    const activeCases = cases.filter((item) => item.status !== "CLOSED").length;
    return {
      activeCases,
      totalCases: cases.length,
      documents: documents.length,
      communications: communications.length,
    };
  }, [cases, documents.length, communications.length]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-[#7B776D]">Ügyfél dosszié betöltése...</div>;
  }

  if (!client || error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs text-[#DC2626] mb-3">{error || "Az ügyfél nem található."}</p>
          <Link href="/clients" className="text-xs text-[#C9A227] hover:underline">Vissza az ügyfelekhez</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-56 border-r border-[#DDD7CA] bg-[#F6F2E8] flex flex-col">
        <div className="p-4 border-b border-[#DDD7CA]"><p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Navigáció</p></div>
        <nav className="flex-1 p-2 space-y-1">
          <Link href="/cases" className="block px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded">Ügyek</Link>
          <Link href="/clients" className="block px-3 py-2 text-xs text-white bg-[#C9A227] rounded">Ügyfelek</Link>
          <Link href={`/clients/${clientId}/workgroups`} className="block px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded">Munkacsoportok</Link>
        </nav>
        <div className="p-3 border-t border-[#DDD7CA]"><Link href="/" className="block px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded">Műszerfal</Link></div>
      </aside>

      <main className="flex-1 overflow-y-auto border-r border-[#DDD7CA]">
        <div className="max-w-6xl mx-auto p-8 space-y-6">
          <header className="border border-[#DDD7CA] bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#C9A227] text-white flex items-center justify-center text-2xl font-serif">
                  {client.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Ügyfél dosszié</p>
                  <h1 className="text-2xl font-serif text-[#1F2821] mt-1">{client.name}</h1>
                  <p className="text-xs text-[#7B776D] mt-1">Kapcsolt ügyek, dokumentumok és kommunikációk operatív nézete</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={openEditClient} className="px-4 py-2 border border-[#DDD7CA] text-xs text-[#514D45] hover:bg-[#F6F2E8] rounded">
                  Ügyfél szerkesztése
                </button>
                <button onClick={() => setShowNewCaseModal(true)} className="px-4 py-2 bg-[#C9A227] text-white text-xs rounded hover:bg-[#B8911F]">
                  Új ügy
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              <div className="border border-[#EEE7D9] bg-[#F6F2E8] p-3"><p className="text-lg font-serif">{dossierStats.activeCases}</p><p className="text-[10px] text-[#7B776D]">Aktív ügy</p></div>
              <div className="border border-[#EEE7D9] bg-[#F6F2E8] p-3"><p className="text-lg font-serif">{dossierStats.totalCases}</p><p className="text-[10px] text-[#7B776D]">Összes ügy</p></div>
              <div className="border border-[#EEE7D9] bg-[#F6F2E8] p-3"><p className="text-lg font-serif">{dossierStats.documents}</p><p className="text-[10px] text-[#7B776D]">Friss dokumentum</p></div>
              <div className="border border-[#EEE7D9] bg-[#F6F2E8] p-3"><p className="text-lg font-serif">{dossierStats.communications}</p><p className="text-[10px] text-[#7B776D]">Friss kommunikáció</p></div>
            </div>
          </header>

          <section className="border border-[#DDD7CA] bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#1F2821]">Kapcsolt ügyek</h2>
              <span className="text-[10px] text-[#7B776D]">{cases.length} ügy</span>
            </div>

            {casesLoadError && (
              <div className="mb-3 p-3 border border-[#d4b8b8] bg-[#fef2f2] text-xs text-[#8b3a3a]">
                {casesLoadError}
              </div>
            )}

            {cases.length === 0 ? (
              <div className="p-4 border border-dashed border-[#DDD7CA] text-xs text-[#9C9890]">
                <p>Ehhez az ügyfélhez még nincs kapcsolt ügy.</p>
                <p className="mt-1 text-[11px] text-[#7B776D]">Új ügy indításával az ügylista és a dosszié automatikusan összekapcsolódik.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F6F2E8] text-[#7B776D] uppercase tracking-[0.12em]">
                    <tr>
                      <th className="p-3 text-left">Ügyszám</th>
                      <th className="p-3 text-left">Cím</th>
                      <th className="p-3 text-left">Státusz</th>
                      <th className="p-3 text-left">Felelős</th>
                      <th className="p-3 text-left">Frissítve</th>
                      <th className="p-3 text-left">Művelet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEE7D9]">
                    {cases.map((item) => (
                      <tr key={item.id} className="hover:bg-[#FBF9F3]">
                        <td className="p-3 font-mono text-[#514D45]">{item.caseNumber}</td>
                        <td className="p-3 text-[#1F2821]">
                          <p className="font-semibold">{item.title}</p>
                          <p className="text-[10px] text-[#7B776D] mt-0.5">{item.matterType}</p>
                        </td>
                        <td className="p-3">{statusLabel(item.status)}</td>
                        <td className="p-3">{item.assignedLawyer?.name || "Nincs kijelölve"}</td>
                        <td className="p-3">{formatDate(item.updatedAt)}</td>
                        <td className="p-3">
                          <Link href={`/cases/${item.id}`} className="text-[#C9A227] hover:underline">Ügy megnyitása</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid lg:grid-cols-2 gap-4">
            <div className="border border-[#DDD7CA] bg-white p-6">
              <h2 className="text-sm font-semibold text-[#1F2821] mb-4">Kapcsolt dokumentumok</h2>
              {documents.length === 0 ? (
                <div className="p-4 border border-dashed border-[#DDD7CA] text-xs text-[#9C9890]">
                  <p>Nincs elérhető kapcsolt dokumentum.</p>
                  <p className="mt-1 text-[11px] text-[#7B776D]">Dokumentum feltöltés vagy generálás után itt jelennek meg a kapcsolt fájlok.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <Link key={doc.id} href={`/cases/${doc.caseId}/documents`} className="block p-3 border border-[#EEE7D9] hover:bg-[#FBF9F3]">
                      <p className="text-xs font-semibold text-[#1F2821] truncate">{doc.fileName}</p>
                      <p className="text-[10px] text-[#7B776D] mt-1">{doc.caseNumber} · {doc.documentType || "Dokumentum"} · {formatDate(doc.createdAt)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-[#DDD7CA] bg-white p-6">
              <h2 className="text-sm font-semibold text-[#1F2821] mb-4">Kapcsolt kommunikációk</h2>
              {communications.length === 0 ? (
                <div className="p-4 border border-dashed border-[#DDD7CA] text-xs text-[#9C9890]">
                  <p>Nincs kapcsolt kommunikációs esemény.</p>
                  <p className="mt-1 text-[11px] text-[#7B776D]">Az ügy- és ügyfélszintű kommunikációk itt egyesítve jelennek meg.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {communications.map((comm) => (
                    <Link
                      key={comm.id}
                      href={comm.caseId ? `/cases/${comm.caseId}/communications` : `/clients/${clientId}`}
                      className="block p-3 border border-[#EEE7D9] hover:bg-[#FBF9F3]"
                    >
                      <p className="text-xs font-semibold text-[#1F2821] truncate">{comm.subject || "Kommunikációs bejegyzés"}</p>
                      <p className="text-[10px] text-[#7B776D] mt-1">{comm.type} · {comm.senderName || comm.senderEmail || "Ismeretlen feladó"} · {formatDate(comm.createdAt)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <aside className="w-80 bg-white overflow-y-auto">
        <div className="p-4 space-y-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Ügyfélazonosság és kapcsolódó adatok</h2>

          <div className="border border-[#DDD7CA] p-3 space-y-2 text-xs">
            <p><span className="text-[#7B776D]">Email:</span> {client.email || "—"}</p>
            <p><span className="text-[#7B776D]">Telefon:</span> {client.phone || "—"}</p>
            <p><span className="text-[#7B776D]">Cím:</span> {client.address || "—"}</p>
            <p><span className="text-[#7B776D]">Adószám:</span> {client.taxNumber || "—"}</p>
            <p><span className="text-[#7B776D]">Cégjegyzékszám:</span> {client.companyRegistrationNumber || "—"}</p>
            <p><span className="text-[#7B776D]">Képviselő:</span> {client.authorizedRepresentative || "—"}</p>
            <p><span className="text-[#7B776D]">Kapcsolattartó:</span> {client.contactPerson || "—"}</p>
          </div>

          <div className="pt-2 border-t border-[#EEE7D9]">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Gyors műveletek</h3>
            <div className="space-y-1">
              <button onClick={() => setShowNewCaseModal(true)} className="w-full text-left px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Új ügy indítása</button>
              <button onClick={openEditClient} className="w-full text-left px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Ügyféladat szerkesztése</button>
              <Link href={`/clients/${clientId}/workgroups`} className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Munkacsoportok</Link>
            </div>
          </div>
        </div>
      </aside>

      {showNewCaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-[#DDD7CA]"><h2 className="text-lg font-serif text-[#1F2821]">Új ügy</h2></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-[#7B776D] mb-1">Ügytípus</label>
                <select value={caseFormData.matterType} onChange={(e) => setCaseFormData({ ...caseFormData, matterType: e.target.value })} className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm">
                  <option value="REAL_ESTATE_SALE">Ingatlan adásvétel</option>
                  <option value="LEASE">Bérlet</option>
                  <option value="EMPLOYMENT">Munkaviszony</option>
                  <option value="CORPORATE">Cégjogi</option>
                  <option value="LITIGATION">Peres</option>
                  <option value="OTHER">Egyéb</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#7B776D] mb-1">Prioritás</label>
                <select value={caseFormData.priority} onChange={(e) => setCaseFormData({ ...caseFormData, priority: e.target.value })} className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm">
                  <option value="LOW">Alacsony</option>
                  <option value="MEDIUM">Közepes</option>
                  <option value="HIGH">Magas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#7B776D] mb-1">Határidő</label>
                <input type="date" value={caseFormData.deadline || ""} onChange={(e) => setCaseFormData({ ...caseFormData, deadline: e.target.value })} className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#7B776D] mb-1">Résztvevők (opcionális)</label>
                <div className="border border-[#DDD7CA] rounded text-sm max-h-28 overflow-y-auto">
                  {availableUsers.length === 0 ? (
                    <div className="p-2 text-xs text-[#9C9890]">Betöltés...</div>
                  ) : (
                    availableUsers.map((user) => (
                      <label key={user.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#FBF9F3] cursor-pointer">
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
                          className="accent-[#C9A227]"
                        />
                        <span className="text-xs">{user.name || user.email}</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedCollaboratorIds.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedCollaboratorIds.map((id) => {
                      const user = availableUsers.find((u) => u.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#8B5CF6] text-white text-[10px] rounded-full">
                          {user?.name || id}
                          <button onClick={() => setSelectedCollaboratorIds(selectedCollaboratorIds.filter((cid) => cid !== id))} className="hover:text-white/70 ml-1">×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-[#7B776D] mb-1">Leírás</label>
                <textarea value={caseFormData.description} onChange={(e) => setCaseFormData({ ...caseFormData, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm" />
              </div>
            </div>
            <div className="p-6 border-t border-[#DDD7CA] flex justify-end gap-2">
              <button onClick={() => setShowNewCaseModal(false)} className="px-4 py-2 text-xs border border-[#DDD7CA] rounded">Mégsem</button>
              <button onClick={handleCreateCase} disabled={isSavingCase} className="px-4 py-2 text-xs bg-[#C9A227] text-white rounded disabled:opacity-50">{isSavingCase ? "Létrehozás..." : "Létrehozás"}</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#DDD7CA]"><h2 className="text-lg font-serif text-[#1F2821]">Ügyfél szerkesztése</h2></div>
            <div className="p-6 space-y-3">
              {[
                ["Név", "name"],
                ["Email", "email"],
                ["Telefon", "phone"],
                ["Adószám", "taxNumber"],
                ["Cégjegyzékszám", "companyRegistrationNumber"],
                ["Képviselő", "authorizedRepresentative"],
                ["Kapcsolattartó", "contactPerson"],
              ].map(([label, key]) => (
                <div key={key}>
                  <label className="block text-xs text-[#7B776D] mb-1">{label}</label>
                  <input
                    value={(editFormData as Record<string, string | undefined>)[key] || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, [key]: e.target.value })}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  />
                </div>
              ))}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-[#7B776D] mb-1">Ügyfélszín</label>
                  <input
                    type="color"
                    value={editFormData.color || "#C9A227"}
                    onChange={(e) => setEditFormData({ ...editFormData, color: e.target.value })}
                    className="w-full h-10 border border-[#DDD7CA] rounded cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-[#7B776D] mb-1">Előnézet</label>
                  <div
                    className="h-10 rounded border border-[#DDD7CA] flex items-center justify-center text-xs"
                    style={{ backgroundColor: editFormData.color || "#C9A227" }}
                  >
                    <span style={{ color: editFormData.color ? "#fff" : "#7B776D" }}>{editFormData.color || "—"}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#7B776D] mb-1">Cím</label>
                <textarea value={editFormData.address || ""} onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })} rows={2} className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm" />
              </div>
            </div>
            <div className="p-6 border-t border-[#DDD7CA] flex justify-end gap-2">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-xs border border-[#DDD7CA] rounded">Mégsem</button>
              <button onClick={handleSaveClient} disabled={isSavingClient || !editFormData.name?.trim()} className="px-4 py-2 text-xs bg-[#C9A227] text-white rounded disabled:opacity-50">{isSavingClient ? "Mentés..." : "Mentés"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

