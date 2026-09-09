"use client";
import { useState, useEffect, useCallback } from "react";
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
import { HourlyRateCard } from "@/components/billing/HourlyRateCard";
import { ClientColorSelector } from "@/components/clients/ClientColorSelector";
import { ClientCompanyFoundation } from "@/components/clients/ClientCompanyFoundation";
import { ClientContractLibrary } from "@/components/clients/ClientContractLibrary";
import { ClientOrganizationPreview } from "@/components/clients/ClientOrganizationPreview";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getClientColorDefinition } from "@/lib/clientColors";
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
  const [hasOrganizationCapability, setHasOrganizationCapability] = useState(false);

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
    setHasOrganizationCapability(false);

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
      setHasOrganizationCapability(
        portalWorkspaces.items.some(
          (item) =>
            item.status !== "ARCHIVED" &&
            (item.mode === "ORGANIZATION" || item.mode === "CASE_RELAY"),
        ),
      );
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

  const organizationMode = hasOrganizationCapability;
  const clientColorDef = getClientColorDefinition(client.colorKey);


  return (
    <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
      <main className="adm-board-container space-y-6">
        <header className="adm-board-hero p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--adm-radius-md)] ${clientColorDef.key ? clientColorDef.accentClass : "bg-[var(--adm-green-800)]"} text-2xl font-serif text-white shadow-[0_8px_20px_rgba(31,74,51,0.14)] ring-2 ${clientColorDef.key ? clientColorDef.ringClass : "ring-transparent"} ring-offset-2 ring-offset-white`}>
                {client.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Ügyfél dosszié</p>
                  {clientColorDef.key && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${clientColorDef.borderClass} ${clientColorDef.softBackgroundClass} text-[var(--adm-text)]`}>
                      <span className={`h-2 w-2 rounded-full ${clientColorDef.accentClass}`} aria-hidden="true" />
                      {clientColorDef.label} kategória
                    </span>
                  )}
                </div>
                <h1 className="mt-1 font-serif text-[32px] leading-tight text-[var(--adm-text)] break-words">{client.name}</h1>
                <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Kapcsolt ügyek, dokumentumok és kommunikációk belső operatív nézete</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button onClick={() => setShowNewCaseModal(true)} className="adm-link-button adm-link-button-primary px-4 py-2 text-xs">
                Új ügy
              </button>
              <Link href={`/clients/${encodeURIComponent(clientId)}/portal`} className="adm-link-button px-4 py-2 text-xs font-semibold">
                Ügyfélportál kezelése
              </Link>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-ochre-500)]">
                  ••• Haladó
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-52 rounded border border-[var(--adm-border)] bg-white p-2 shadow-lg">
                  {organizationMode ? (
                    <Link
                      className="block rounded px-3 py-2 text-xs hover:bg-[var(--adm-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-ochre-500)]"
                      href={`/clients/${encodeURIComponent(clientId)}/workgroups`}
                    >
                      Munkacsoportok
                    </Link>
                  ) : null}
                  <Link
                    className="block rounded px-3 py-2 text-xs hover:bg-[var(--adm-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-ochre-500)]"
                    href={`/clients/${encodeURIComponent(clientId)}#house-style`}
                  >
                    Dokumentumstílus
                  </Link>
                </div>
              </details>
            </div>
          </div>

        </header>
        <ClientWorkspaceTabs clientId={clientId} active="overview" organizationMode={organizationMode} />

        <section aria-labelledby="client-overview-heading" className="adm-board-panel p-5">
          <h2 id="client-overview-heading" className="font-serif text-xl text-[var(--adm-text)]">Ügyfél áttekintés</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {organizationMode ? <Link href={`/clients/${encodeURIComponent(clientId)}/szervezet`} className="adm-link-button p-4 text-sm font-semibold">Szervezeti felépítés →</Link> : null}
            <div className="adm-board-strip p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Naptár</p><p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">Ügyfélnaptár kialakítás alatt</p></div>
            <Link href={`/communications?clientId=${encodeURIComponent(clientId)}`} className="adm-link-button p-4 text-sm font-semibold">Kommunikáció →</Link>
            <Link href={`/cases?clientId=${encodeURIComponent(clientId)}&scope=ACTIVE`} className="adm-link-button p-4 text-sm font-semibold">Nyitott ügyek →</Link>
            <Link href={`/cases?clientId=${encodeURIComponent(clientId)}&scope=CLOSED`} className="adm-link-button p-4 text-sm font-semibold">Lezárt ügyek megnyitása →</Link>
            <Link href={`/time-entries?clientId=${encodeURIComponent(clientId)}`} className="adm-link-button p-4 text-sm font-semibold">Munkaórák →</Link>
          </div>
        </section>

        {/* 2. Integrated Client Basics & Operational Hub */}
        <section aria-label="Ügyfél alapadatok és környezet" className="grid grid-cols-1 gap-5">
          {/* Card 1: Identity & Contact */}
          <div className={`adm-board-panel p-5 flex flex-col justify-between ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[var(--adm-border)]">
                <div className="flex items-center gap-2">
                  {clientColorDef.key && (
                    <span className={`h-2 w-2 rounded-full ${clientColorDef.accentClass}`} aria-hidden="true" />
                  )}
                  <h2 className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--adm-text-muted)]">
                    Ügyfélazonosság és kapcsolódó adatok
                  </h2>
                </div>
                <button
                  onClick={openEditClient}
                  className="text-xs text-[var(--adm-ochre-600)] hover:underline font-medium"
                >
                  Szerkesztés
                </button>
              </div>

              <div className="mt-3 space-y-2 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white/70 p-3 text-xs">
                <p><span className="text-[var(--adm-text-muted)]">Email:</span> {client.email || "—"}</p>
                <p><span className="text-[var(--adm-text-muted)]">Telefon:</span> {client.phone || "—"}</p>
                <p><span className="text-[var(--adm-text-muted)]">Cím:</span> {client.address || "—"}</p>
                {(organizationMode || client.taxNumber) ? <p><span className="text-[var(--adm-text-muted)]">Adószám:</span> {client.taxNumber || "—"}</p> : null}
                {(organizationMode || client.companyRegistrationNumber) ? <p><span className="text-[var(--adm-text-muted)]">Cégjegyzékszám:</span> {client.companyRegistrationNumber || "—"}</p> : null}
                {(organizationMode || client.authorizedRepresentative) ? <p><span className="text-[var(--adm-text-muted)]">Képviselő:</span> {client.authorizedRepresentative || "—"}</p> : null}
                <p><span className="text-[var(--adm-text-muted)]">Kapcsolattartó:</span> {client.contactPerson || "—"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Connected Working Lists */}
        <section className={`adm-board-panel p-5 ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {clientColorDef.key && (
                <span className={`h-2 w-2 rounded-full ${clientColorDef.accentClass}`} aria-hidden="true" />
              )}
              <h2 className="text-sm font-semibold text-[var(--adm-text)]">Kapcsolt ügyek</h2>
            </div>
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

        {/* Compact secondary tools — non-duplicated working destinations
            recovered from the removed quick-actions card. */}
        <section aria-label="További eszközök" className={`adm-board-panel p-5 ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            {clientColorDef.key && (
              <span className={`h-2 w-2 rounded-full ${clientColorDef.accentClass}`} aria-hidden="true" />
            )}
            <h2 className="text-sm font-semibold text-[var(--adm-text)]">További eszközök</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/time-entries?clientId=${encodeURIComponent(clientId)}`} className="adm-link-button px-3 py-2 text-xs">Munkaórák</Link>
            <Link href={`/clients/${encodeURIComponent(clientId)}/szamlazas`} className="adm-link-button px-3 py-2 text-xs">Számlázás előkészítése</Link>
            <Link href={cases.find((item) => item.status !== "CLOSED") ? `/cases/${cases.find((item) => item.status !== "CLOSED")?.id}/documents` : `/cases?clientId=${encodeURIComponent(clientId)}`} className="adm-link-button px-3 py-2 text-xs">Dokumentum hozzáadása</Link>
            {organizationMode && (
              <Link href={`/clients/${encodeURIComponent(clientId)}/workgroups`} className="adm-link-button px-3 py-2 text-xs">Munkacsoportok</Link>
            )}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className={`adm-board-panel p-5 ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {clientColorDef.key && (
                  <span className={`h-2 w-2 rounded-full ${clientColorDef.accentClass}`} aria-hidden="true" />
                )}
                <h2 className="text-sm font-semibold text-[var(--adm-text)]">Kapcsolt dokumentumok</h2>
              </div>
              <span className="text-[10px] text-[var(--adm-text-muted)]">{documents.length} friss dokumentum</span>
            </div>
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

          <div className={`adm-board-panel p-5 ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {clientColorDef.key && (
                  <span className={`h-2 w-2 rounded-full ${clientColorDef.accentClass}`} aria-hidden="true" />
                )}
                <h2 className="text-sm font-semibold text-[var(--adm-text)]">Kapcsolt kommunikációk</h2>
              </div>
              <span className="text-[10px] text-[var(--adm-text-muted)]">{communications.length} esemény</span>
            </div>
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

          <HourlyRateCard clientId={clientId} />
          <details
            id="house-style"
            className={`adm-board-panel p-5 scroll-mt-24 ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}
          >
            <summary className="cursor-pointer font-semibold text-sm">Dokumentumstílus</summary>
            <div className="rounded border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                {clientColorDef.key && (
                  <span className={`h-2 w-2 rounded-full ${clientColorDef.accentClass}`} aria-hidden="true" />
                )}
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">House style</h3>
              </div>
              <p className="text-[10px] text-[var(--adm-text-muted)]">
                Ügyfél-specifikus dokumentumstílus és külső prompt-copy instrukciós kontextus.
              </p>
            </div>
            <ClientHouseStylePanel clientId={clientId} clientName={client.name} />
          </details>
        {/* 4. Corporate Governance & Organizational Snapshots */}
        <section aria-label="Vállalati és szervezeti modulok" className="space-y-5">
          <div className="flex items-center justify-between border-b border-[var(--adm-border)] pb-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">
                Vállalati governance és háttér
              </p>
              <h2 className="mt-0.5 font-serif text-lg text-[var(--adm-text)]">
                Működés, szerződések és szervezeti struktúra
              </h2>
            </div>
            {clientColorDef.key && (
              <span className={`h-2 w-2 rounded-full ${clientColorDef.accentClass}`} aria-hidden="true" />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section id="vallalati-mukodes" className={`adm-board-panel p-5 scroll-mt-24 ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
              <ClientCompanyFoundation clientId={clientId} />
            </section>

            <section id="szerzodes-tar" className={`adm-board-panel p-5 scroll-mt-24 ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
              <ClientContractLibrary clientId={clientId} />
            </section>
          </div>

          {organizationMode && (
            <section id="szervezet" className={`adm-board-panel p-5 scroll-mt-24 ${clientColorDef.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
              <ClientOrganizationPreview clientId={clientId} clientName={client.name} />
            </section>
          )}
        </section>
      </main>

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
