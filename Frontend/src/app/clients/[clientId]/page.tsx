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
  uploadCaseDocument,
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
import { ClientHouseStylePanel } from "@/components/clients/ClientHouseStylePanel";
import { ClientColorSelector } from "@/components/clients/ClientColorSelector";
import { ClientCompanyFoundation } from "@/components/clients/ClientCompanyFoundation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";

type DossierDocument = DocumentItem & { caseNumber: string; caseId: string };

type InitialDocumentState = {
  id: string;
  file: File;
  status: "QUEUED" | "UPLOADING" | "UPLOADED" | "FAILED";
  message?: string;
};

const WORKFLOW_TEMPLATES = [
  {
    key: "SIMPLE",
    label: "Egyszerű ügyintézés",
    description: "Egy induló feladat a felelős ügyvédnek.",
    steps: ["Ügyindító áttekintés"],
  },
  {
    key: "CONTRACT_REVIEW_TRIAD",
    label: "Szerződés-review",
    description: "Gyula és Amanda párhuzamosan dolgozik, Csanád csak mindkettő után kapja meg a review-t.",
    steps: ["Gyula: szerződés első jogi átnézése", "Amanda: ügyfél- és compliance-ellenőrzés", "Csanád: végső partneri review"],
  },
] as const;

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === "string" ? reader.result : "";
    resolve(result.includes(",") ? result.split(",").pop() || "" : result);
  };
  reader.onerror = () => reject(reader.error || new Error("File read failed"));
  reader.readAsDataURL(file);
});

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
  return (
    <AuthenticatedApp section="clients">
      <ClientDetailContent />
    </AuthenticatedApp>
  );
}

function ClientDetailContent() {
  const params = useParams();
  const router = useRouter();
  const clientId = (params?.clientId as string) || "";

  const [client, setClient] = useState<Client | null>(null);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [savingPortal, setSavingPortal] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [casesLoadError, setCasesLoadError] = useState<string | null>(null);

  const savePortalSettings = async (patch: Partial<Pick<Client, 'relationshipMode' | 'portalAccessEnabled' | 'connectedSystemState'>>) => {
    if (!client) return;
    setSavingPortal(true);
    try { setClient(await updateClient(client.id, patch)); }
    finally { setSavingPortal(false); }
  };

  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [caseFormData, setCaseFormData] = useState<CreateCaseData>({
    clientName: "",
    clientId: "",
    matterType: "OTHER",
    priority: "MEDIUM",
    description: "",
    deadline: "",
    workflowTemplateKey: "SIMPLE",
  });
  const [workflowAssignees, setWorkflowAssignees] = useState<Record<string, string>>({});
  const [initialDocuments, setInitialDocuments] = useState<InitialDocumentState[]>([]);
  const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [caseCreateError, setCaseCreateError] = useState<string | null>(null);

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
    setCaseCreateError(null);
    try {
      const created = await createCase({
        clientName: caseFormData.clientName,
        clientId: client?.id,
        matterType: caseFormData.matterType,
        priority: caseFormData.priority,
        description: caseFormData.description,
        deadline: caseFormData.deadline || undefined,
        workflowTemplateKey: caseFormData.workflowTemplateKey || "SIMPLE",
        workflowAssignees,
      });
      for (const queued of initialDocuments) {
        setInitialDocuments((current) => current.map((item) => item.id === queued.id ? { ...item, status: "UPLOADING", message: "Feltöltés folyamatban..." } : item));
        try {
          const fileContentBase64 = await fileToBase64(queued.file);
          await uploadCaseDocument({
            caseId: created.id,
            fileName: queued.file.name,
            fileContentBase64,
            mimeType: queued.file.type || undefined,
            documentType: "OTHER",
          });
          setInitialDocuments((current) => current.map((item) => item.id === queued.id ? { ...item, status: "UPLOADED", message: "Feltöltve és rögzítve." } : item));
        } catch (uploadError) {
          setInitialDocuments((current) => current.map((item) => item.id === queued.id ? { ...item, status: "FAILED", message: uploadError instanceof Error ? uploadError.message : "A dokumentum feltöltése nem sikerült." } : item));
          throw new Error("Az ügy létrejött, de legalább egy induló dokumentum feltöltése nem sikerült. Próbálja újra az ügy dokumentumai között.");
        }
      }
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
      setWorkflowAssignees({});
      setInitialDocuments([]);
      await loadClientData();
      router.push(`/cases/${created.id}/documents`);
    } catch (err) {
      console.error("Create case failed:", err);
      let message = "Nem sikerült létrehozni az ügyet.";
      if (err instanceof Error && err.name === "ApiError") {
        message = (err as any).message || message;
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      setCaseCreateError(message);
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
      colorKey: client.colorKey || null,
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
        colorKey: editFormData.colorKey ?? null,
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
    return <div className="flex-1 adm-board-page p-6"><div className="adm-board-empty text-xs text-[var(--adm-text-muted)]">Ügyfél dosszié betöltése...</div></div>;
  }

  if (!client || error) {
    return (
      <div className="flex-1 adm-board-page p-6">
        <div className="adm-board-empty">
          <p className="text-xs text-[var(--adm-terracotta-700)] mb-3">{error || "Az ügyfél nem található."}</p>
          <Link href="/clients" className="text-xs text-[var(--adm-ochre-500)] hover:underline">Vissza az ügyfelekhez</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
      <div className="adm-board-container grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <main className="min-w-0 space-y-5">
          <header className="adm-board-hero p-5 lg:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[var(--adm-radius-md)] bg-[var(--adm-green-800)] text-2xl font-serif text-white shadow-[0_8px_20px_rgba(31,74,51,0.14)]">
                  {client.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Ügyfél dosszié</p>
                   <h1 className="mt-1 font-serif text-[32px] leading-tight text-[var(--adm-text)]">{client.name}</h1>
                  <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Kapcsolt ügyek, dokumentumok és kommunikációk belső operatív nézete</p>
                </div>
              </div>
              <section className="mt-5 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Client Portal control plane</p><h2 className="mt-1 font-serif text-xl text-[var(--adm-text)]">Ügyfélkapcsolati működés</h2></div><span className="rounded-full bg-[var(--adm-gold-soft,#f3ead2)] px-3 py-1 text-xs font-semibold">{client.portalAccessEnabled ? 'Portál előkészítve' : 'Portál hozzáférés kikapcsolva'}</span></div>
                <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]"><span>Működési mód</span><select value={client.relationshipMode || 'PORTAL_CENTRIC'} disabled={savingPortal} onChange={(event) => void savePortalSettings({ relationshipMode: event.target.value as Client['relationshipMode'] })} className="rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]"><option value="PORTAL_CENTRIC">Portálközpontú</option><option value="EMAIL_CENTRIC">E-mail központú</option><option value="CONNECTED_SYSTEM">Kapcsolt rendszer</option></select></label><label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={Boolean(client.portalAccessEnabled)} disabled={savingPortal} onChange={(event) => void savePortalSettings({ portalAccessEnabled: event.target.checked })} />Portál elérhetőségének előkészítése</label></div>
                {client.relationshipMode === 'CONNECTED_SYSTEM' ? (
                  <div className="mt-3 rounded border border-[var(--adm-border)] bg-white/70 p-3">
                    <label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]"><span>Kapcsolt rendszer állapota</span><input value={client.connectedSystemState || ''} disabled={savingPortal} onChange={(event) => setClient((current) => current ? { ...current, connectedSystemState: event.target.value } : current)} onBlur={(event) => void savePortalSettings({ connectedSystemState: event.target.value })} placeholder="Nincs konfigurálva" className="rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]" /></label>
                    <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Ez az állapot a külső ügykezelő rendszer kapcsolatának konfigurációját jelzi. Nem jelent automatikus szinkronizációt.</p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Normál ügyfélfelületnél nincs kapcsolt-rendszer állapot a fő adminisztrációban.</p>
                )}
              </section>

              <div className="flex gap-2">
                <button onClick={openEditClient} className="adm-link-button px-4 py-2 text-xs">
                  Ügyfél szerkesztése
                </button>
                <button onClick={() => setShowNewCaseModal(true)} className="adm-link-button adm-link-button-primary px-4 py-2 text-xs">
                  Új ügy
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="adm-board-strip p-3"><p className="font-serif text-2xl">{dossierStats.activeCases}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Aktív ügy</p></div>
              <div className="adm-board-strip p-3"><p className="font-serif text-2xl">{dossierStats.totalCases}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Összes ügy</p></div>
              <div className="adm-board-strip p-3"><p className="font-serif text-2xl">{dossierStats.documents}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Friss dokumentum</p></div>
              <div className="adm-board-strip p-3"><p className="font-serif text-2xl">{dossierStats.communications}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Friss kommunikáció</p></div>
            </div>
          </header>

          <section className="adm-board-panel p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--adm-text)]">Kapcsolt ügyek</h2>
              <span className="text-[10px] text-[var(--adm-text-muted)]">{cases.length} ügy</span>
            </div>

            {casesLoadError && (
              <div className="mb-3 p-3 border border-[var(--adm-terracotta-100)] bg-[#fef2f2] text-xs text-[#8b3a3a]">
                {casesLoadError}
              </div>
            )}

            {cases.length === 0 ? (
              <div className="adm-board-empty min-h-[130px] p-4 text-xs text-[var(--adm-text-soft)]">
                <p>Ehhez az ügyfélhez még nincs kapcsolt ügy.</p>
                <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Új ügy indításával az ügylista és a dosszié automatikusan összekapcsolódik.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[var(--adm-text-muted)] uppercase tracking-[0.12em]">
                    <tr>
                      <th className="p-3 text-left">Ügyszám</th>
                      <th className="p-3 text-left">Cím</th>
                      <th className="p-3 text-left">Státusz</th>
                      <th className="p-3 text-left">Felelős</th>
                      <th className="p-3 text-left">Frissítve</th>
                      <th className="p-3 text-left">Művelet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((item) => (
                      <tr key={item.id} className="adm-board-list-row">
                        <td className="p-3 font-mono text-[var(--adm-text-muted)]">{item.caseNumber}</td>
                        <td className="p-3 text-[var(--adm-text)]">
                          <p className="font-semibold">{item.title}</p>
                          <p className="text-[10px] text-[var(--adm-text-muted)] mt-0.5">{item.matterType}</p>
                        </td>
                        <td className="p-3">{statusLabel(item.status)}</td>
                        <td className="p-3">{item.assignedLawyer?.name || "Nincs kijelölve"}</td>
                        <td className="p-3">{formatDate(item.updatedAt)}</td>
                        <td className="p-3">
                          <Link href={`/cases/${item.id}`} className="text-[var(--adm-ochre-500)] hover:underline">Ügy megnyitása</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="adm-board-panel p-5">
              <h2 className="text-sm font-semibold text-[var(--adm-text)] mb-4">Kapcsolt dokumentumok</h2>
              {documents.length === 0 ? (
                <div className="adm-board-empty min-h-[130px] p-4 text-xs text-[var(--adm-text-soft)]">
                  <p>Nincs elérhető kapcsolt dokumentum.</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Dokumentum feltöltés vagy generálás után itt jelennek meg a kapcsolt fájlok.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <Link key={doc.id} href={`/cases/${doc.caseId}/documents`} className="adm-board-list-row block p-3">
                      <p className="text-xs font-semibold text-[var(--adm-text)] truncate">{doc.fileName}</p>
                      <p className="text-[10px] text-[var(--adm-text-muted)] mt-1">{doc.caseNumber} · {doc.documentType || "Dokumentum"} · {formatDate(doc.createdAt)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="adm-board-panel p-5">
              <h2 className="text-sm font-semibold text-[var(--adm-text)] mb-4">Kapcsolt kommunikációk</h2>
              {communications.length === 0 ? (
                <div className="adm-board-empty min-h-[130px] p-4 text-xs text-[var(--adm-text-soft)]">
                  <p>Nincs kapcsolt kommunikációs esemény.</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Az ügy- és ügyfélszintű kommunikációk itt egyesítve jelennek meg.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {communications.map((comm) => (
                    <Link
                      key={comm.id}
                      href={comm.caseId ? `/cases/${comm.caseId}/communications` : `/clients/${clientId}`}
                      className="adm-board-list-row block p-3"
                    >
                      <p className="text-xs font-semibold text-[var(--adm-text)] truncate">{comm.subject || "Kommunikációs bejegyzés"}</p>
                      <p className="text-[10px] text-[var(--adm-text-muted)] mt-1">{comm.type} · {comm.senderName || comm.senderEmail || "Ismeretlen feladó"} · {formatDate(comm.createdAt)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
      </main>

      <aside className="min-w-0 space-y-4">
        <div className="adm-board-panel p-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Ügyfélazonosság és kapcsolódó adatok</h2>

          <div className="mt-3 space-y-2 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white/70 p-3 text-xs">
            <p><span className="text-[var(--adm-text-muted)]">Email:</span> {client.email || "—"}</p>
            <p><span className="text-[var(--adm-text-muted)]">Telefon:</span> {client.phone || "—"}</p>
            <p><span className="text-[var(--adm-text-muted)]">Cím:</span> {client.address || "—"}</p>
            <p><span className="text-[var(--adm-text-muted)]">Adószám:</span> {client.taxNumber || "—"}</p>
            <p><span className="text-[var(--adm-text-muted)]">Cégjegyzékszám:</span> {client.companyRegistrationNumber || "—"}</p>
            <p><span className="text-[var(--adm-text-muted)]">Képviselő:</span> {client.authorizedRepresentative || "—"}</p>
            <p><span className="text-[var(--adm-text-muted)]">Kapcsolattartó:</span> {client.contactPerson || "—"}</p>
          </div>

          <div className="mt-4 border-t border-[var(--adm-border)] pt-3">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2">Gyors műveletek</h3>
            <div className="space-y-1">
              <button onClick={() => setShowNewCaseModal(true)} className="adm-link-button w-full px-3 py-2 text-left text-xs">Új ügy indítása</button>
              <button onClick={openEditClient} className="adm-link-button w-full px-3 py-2 text-left text-xs">Ügyféladat szerkesztése</button>
              <Link href={`/clients/${clientId}/workgroups`} className="adm-link-button block px-3 py-2 text-xs">Munkacsoportok</Link>
            </div>
          </div>

          <section id="house-style" className="mt-4 scroll-mt-24 border-t border-[var(--adm-border)] pt-3">
            <div className="rounded border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-3">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)] mb-1">House style</h3>
              <p className="text-[10px] text-[var(--adm-text-muted)]">
                Ügyfél-specifikus dokumentumstílus és külső prompt-copy instrukciós kontextus.
              </p>
            </div>
            <div className="mt-3">
              <ClientHouseStylePanel clientId={clientId} clientName={client.name} />
            </div>
          </section>

          <section id="vallalati-mukodes" className="mt-4 scroll-mt-24 border-t border-[var(--adm-border)] pt-3">
            <ClientCompanyFoundation clientId={clientId} />
          </section>
        </div>
      </aside>
      </div>

      {showNewCaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="adm-wizard-modal w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="adm-wizard-header p-6 border-b"><h2 className="text-lg font-serif text-[var(--adm-text)]">Új ügy</h2></div>
            <div className="adm-wizard-body p-6 space-y-4">
              <div>
                <label className="block text-xs text-[var(--adm-text-muted)] mb-1">Ügytípus</label>
                <select value={caseFormData.matterType} onChange={(e) => setCaseFormData({ ...caseFormData, matterType: e.target.value })} className="adm-modal-field w-full px-3 py-2 text-sm">
                  <option value="REAL_ESTATE_SALE">Ingatlan adásvétel</option>
                  <option value="LEASE">Bérlet</option>
                  <option value="EMPLOYMENT">Munkaviszony</option>
                  <option value="CORPORATE">Cégjogi</option>
                  <option value="LITIGATION">Peres</option>
                  <option value="OTHER">Egyéb</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--adm-text-muted)] mb-1">Prioritás</label>
                <select value={caseFormData.priority} onChange={(e) => setCaseFormData({ ...caseFormData, priority: e.target.value })} className="adm-modal-field w-full px-3 py-2 text-sm">
                  <option value="LOW">Alacsony</option>
                  <option value="MEDIUM">Közepes</option>
                  <option value="HIGH">Magas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--adm-text-muted)] mb-1">Határidő</label>
                <input type="date" value={caseFormData.deadline || ""} onChange={(e) => setCaseFormData({ ...caseFormData, deadline: e.target.value })} className="adm-modal-field w-full px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--adm-text-muted)] mb-1">Résztvevők (opcionális)</label>
                <div className="border border-[var(--adm-border)] rounded text-sm max-h-28 overflow-y-auto">
                  {availableUsers.length === 0 ? (
                    <div className="p-2 text-xs text-[var(--adm-text-soft)]">Betöltés...</div>
                  ) : (
                    availableUsers.map((user) => (
                      <label key={user.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--adm-surface)] cursor-pointer">
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
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--adm-ochre-500)] text-white text-[10px] rounded-full">
                          {user?.name || id}
                          <button onClick={() => setSelectedCollaboratorIds(selectedCollaboratorIds.filter((cid) => cid !== id))} className="hover:text-white/70 ml-1">×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <section className="rounded border border-[var(--adm-border)] bg-white/70 p-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Munkafolyamat</label>
                <select
                  value={caseFormData.workflowTemplateKey || "SIMPLE"}
                  onChange={(event) => {
                    setCaseFormData({ ...caseFormData, workflowTemplateKey: event.target.value });
                    setWorkflowAssignees({});
                  }}
                  className="adm-modal-field mt-2 w-full px-3 py-2 text-sm"
                >
                  {WORKFLOW_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
                </select>
                {WORKFLOW_TEMPLATES.filter((template) => template.key === (caseFormData.workflowTemplateKey || "SIMPLE")).map((template) => (
                  <div key={template.key} className="mt-3 space-y-2 text-xs text-[var(--adm-text-muted)]">
                    <p>{template.description}</p>
                    <ol className="space-y-1">
                      {template.steps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
                    </ol>
                    {template.key === "CONTRACT_REVIEW_TRIAD" ? (
                      <div className="grid gap-2 md:grid-cols-3">
                        {[
                          ["legal-review", "Gyula"],
                          ["compliance-check", "Amanda"],
                          ["partner-final-review", "Csanád"],
                        ].map(([stepKey, label]) => (
                          <label key={stepKey} className="grid gap-1">
                            <span>{label} felelőse</span>
                            <select value={workflowAssignees[stepKey] || ""} onChange={(event) => setWorkflowAssignees((current) => ({ ...current, [stepKey]: event.target.value }))} className="adm-modal-field px-2 py-2 text-xs">
                              <option value="">Alapértelmezett felelős</option>
                              {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </section>
              <section className="rounded border border-[var(--adm-border)] bg-white/70 p-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Induló dokumentumok</label>
                <p className="mt-1 text-xs text-[var(--adm-text-muted)]">A fájlok az ügy létrejötte után a kanonikus ügy-dokumentum feltöltésen mennek át; hiba esetén nincs hamis sikerüzenet.</p>
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    const selectedFiles = Array.from(event.target.files || []);
                    setInitialDocuments((current) => [
                      ...current,
                      ...selectedFiles.map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}`, file, status: "QUEUED" as const, message: "Feltöltésre vár." })),
                    ]);
                    event.target.value = "";
                  }}
                  className="mt-3 block w-full text-xs text-[var(--adm-text-muted)]"
                />
                {initialDocuments.length ? (
                  <div className="mt-3 space-y-2">
                    {initialDocuments.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded border border-[var(--adm-border)] px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--adm-text)]">{item.file.name}</p>
                          <p className="text-[var(--adm-text-muted)]">{Math.ceil(item.file.size / 1024)} KB · {item.message || item.status}</p>
                        </div>
                        {item.status === "QUEUED" || item.status === "FAILED" ? <button type="button" onClick={() => setInitialDocuments((current) => current.filter((doc) => doc.id !== item.id))} className="text-[var(--adm-terracotta-700)]">Eltávolítás</button> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
              <div>
                <label className="block text-xs text-[var(--adm-text-muted)] mb-1">Leírás</label>
                <textarea value={caseFormData.description} onChange={(e) => setCaseFormData({ ...caseFormData, description: e.target.value })} rows={3} className="adm-modal-field w-full px-3 py-2 text-sm" />
              </div>
              {caseCreateError ? (
                <div className="rounded border border-[#f0d2cc] bg-[#fff4f2] px-3 py-2 text-xs text-[#8b3a3a]">
                  {caseCreateError}
                </div>
              ) : null}
            </div>
            <div className="adm-wizard-footer p-6 border-t flex justify-end gap-2">
              <button onClick={() => setShowNewCaseModal(false)} className="px-4 py-2 text-xs border border-[var(--adm-border)] rounded">Mégsem</button>
              <button onClick={handleCreateCase} disabled={isSavingCase} className="px-4 py-2 text-xs bg-[var(--adm-ochre-500)] text-white rounded disabled:opacity-50">{isSavingCase ? "Létrehozás..." : "Létrehozás"}</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="adm-wizard-modal w-full max-w-md mx-4">
            <div className="adm-wizard-header p-6 border-b"><h2 className="text-lg font-serif text-[var(--adm-text)]">Ügyfél szerkesztése</h2></div>
            <div className="adm-wizard-body p-6 space-y-3">
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
                  <label className="block text-xs text-[var(--adm-text-muted)] mb-1">{label}</label>
                  <input
                    value={(editFormData as Record<string, string | undefined>)[key] || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, [key]: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--adm-border)] rounded text-sm"
                  />
                </div>
              ))}
              <ClientColorSelector
                value={editFormData.colorKey || null}
                onChange={(colorKey) => setEditFormData((current) => ({ ...current, colorKey }))}
                disabled={isSavingClient}
              />
              <div>
                <label className="block text-xs text-[var(--adm-text-muted)] mb-1">Cím</label>
                <textarea value={editFormData.address || ""} onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })} rows={2} className="w-full px-3 py-2 border border-[var(--adm-border)] rounded text-sm" />
              </div>
            </div>
            <div className="adm-wizard-footer p-6 border-t flex justify-end gap-2">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-xs border border-[var(--adm-border)] rounded">Mégsem</button>
              <button onClick={handleSaveClient} disabled={isSavingClient || !editFormData.name?.trim()} className="px-4 py-2 text-xs bg-[var(--adm-ochre-500)] text-white rounded disabled:opacity-50">{isSavingClient ? "Mentés..." : "Mentés"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

