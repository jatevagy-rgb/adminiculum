"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getClient,
  getCases,
  updateClient,
  getCaseDocuments,
  getClientCommunicationSummary,
  type Client,
  type CaseListItem,
  type DocumentItem,
  type ClientCommunicationSummaryItem,
} from "@/lib/api";
import { ClientHouseStylePanel } from "@/components/clients/ClientHouseStylePanel";
import { ClientColorSelector } from "@/components/clients/ClientColorSelector";
import { ClientCompanyFoundation } from "@/components/clients/ClientCompanyFoundation";
import { ClientContractLibrary } from "@/components/clients/ClientContractLibrary";
import { ClientOrganization } from "@/components/clients/ClientOrganization";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { CompactNewCaseDialog } from "@/components/cases/CompactNewCaseDialog";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { listAdminWorkspaces, type AdminWorkspaceDTO } from "@/lib/clientPortalAdminApi";

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
  return (
    <AuthenticatedApp section="clients">
      <ClientDetailContent />
    </AuthenticatedApp>
  );
}

function ClientDetailContent() {
  const params = useParams();
  const clientId = (params?.clientId as string) || "";

  const [client, setClient] = useState<Client | null>(null);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [communications, setCommunications] = useState<ClientCommunicationSummaryItem[]>([]);
  const [portalWorkspace, setPortalWorkspace] = useState<AdminWorkspaceDTO | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [casesLoadError, setCasesLoadError] = useState<string | null>(null);

  const [showNewCaseModal, setShowNewCaseModal] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Client>>({});
  const [isSavingClient, setIsSavingClient] = useState(false);

  const loadClientData = useCallback(async () => {
    if (!clientId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [clientData, directClientComms, portalWorkspaces] = await Promise.all([
        getClient(clientId),
        getClientCommunicationSummary(clientId, 15).catch(() => ({
          communications: [],
          client: { id: clientId, name: "" },
        })),
        listAdminWorkspaces(clientId).catch(() => ({ items: [] })),
      ]);

      const casesResponse = await getCases(1, 100, undefined, clientId).catch(() => null);
      if (!casesResponse) {
        setCasesLoadError("A kapcsolt ügyek listája jelenleg nem elérhető.");
      } else {
        setCasesLoadError(null);
      }

      const relatedCases = casesResponse?.data || [];
      setClient(clientData);
      setPortalWorkspace(portalWorkspaces.items.find((item) => item.status !== "ARCHIVED") || portalWorkspaces.items[0] || null);
      setCases(relatedCases);

      const documentsByCase = await Promise.all(
        relatedCases.map(async (item) => {
          const docs = await getCaseDocuments(item.id).catch(() => [] as DocumentItem[]);
          return docs.map((doc) => ({ ...doc, caseId: item.id, caseNumber: item.caseNumber }));
        }),
      );

      const mergedDocuments = documentsByCase.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDocuments(mergedDocuments.slice(0, 12));

      setCommunications(directClientComms.communications.slice(0, 12));
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--adm-radius-md)] bg-[var(--adm-green-800)] text-2xl font-serif text-white shadow-[0_8px_20px_rgba(31,74,51,0.14)]">
                  {client.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Ügyfél dosszié</p>
                  <h1 className="mt-1 font-serif text-[32px] leading-tight text-[var(--adm-text)] break-words">{client.name}</h1>
                  <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Kapcsolt ügyek, dokumentumok és kommunikációk belső operatív nézete</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link href={`/clients/${clientId}/vallalati-mukodes`} className="adm-link-button px-4 py-2 text-xs">
                  Vállalati működés
                </Link>
                <Link href={`/clients/${clientId}/szervezet`} className="adm-link-button px-4 py-2 text-xs">
                  Szervezet
                </Link>
                <button onClick={openEditClient} className="adm-link-button px-4 py-2 text-xs">
                  Ügyfél szerkesztése
                </button>
                <button onClick={() => setShowNewCaseModal(true)} className="adm-link-button adm-link-button-primary px-4 py-2 text-xs">
                  Új ügy
                </button>
                <Link
                  href={cases.find((item) => item.status !== "CLOSED") ? `/cases/${cases.find((item) => item.status !== "CLOSED")?.id}/documents` : `/cases?clientId=${encodeURIComponent(clientId)}`}
                  className="adm-link-button px-4 py-2 text-xs"
                >
                  Dokumentum hozzáadása
                </Link>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="adm-board-strip p-3"><p className="font-serif text-2xl">{dossierStats.activeCases}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Aktív ügy</p></div>
              <div className="adm-board-strip p-3"><p className="font-serif text-2xl">{dossierStats.totalCases}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Összes ügy</p></div>
              <div className="adm-board-strip p-3"><p className="font-serif text-2xl">{dossierStats.documents}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Friss dokumentum</p></div>
              <div className="adm-board-strip p-3"><p className="font-serif text-2xl">{dossierStats.communications}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Friss kommunikáció</p></div>
            </div>
            <div className="mt-5">
              <ClientWorkspaceTabs
                clientId={clientId}
                active="overview"
                organizationMode={portalWorkspace?.mode === "ORGANIZATION" || portalWorkspace?.mode === "CASE_RELAY"}
              />
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
                      <p className="text-[10px] text-[var(--adm-text-muted)] mt-1">
                        {comm.sender || "Ismeretlen feladó"} · {comm.caseNumber || "Ügy nélkül"} · {formatDate(comm.timestamp || undefined)}
                      </p>
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
              <Link href={`/clients/${clientId}/workgroups`} className="adm-link-button block px-3 py-2 text-xs">Munkacsoportok</Link>
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--adm-border)] pt-3">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)] mb-2">Ügyfélportál</h3>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[var(--adm-text-muted)]">Állapot:</span>
              <span className="font-semibold text-[var(--adm-text)]">
                {client.portalAccessEnabled ? "Előkészítve" : "Nincs előkészítve"}
              </span>
            </div>
            <Link
              href={`/clients/${clientId}/portal`}
              className="adm-link-button block px-3 py-2 text-center text-xs"
            >
              Portál megnyitása
            </Link>
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

          <section id="szerzodes-tar" className="mt-4 scroll-mt-24 border-t border-[var(--adm-border)] pt-3">
            <ClientContractLibrary clientId={clientId} />
          </section>

          <section id="szervezet" className="mt-4 scroll-mt-24 border-t border-[var(--adm-border)] pt-3">
            <ClientOrganization clientId={clientId} />
          </section>
        </div>
      </aside>
      </div>

      <CompactNewCaseDialog
        open={showNewCaseModal}
        onClose={() => setShowNewCaseModal(false)}
        initialClientId={client?.id}
      />


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
