"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  getCaseDocuments,
  getCaseAnonymousDocuments,
  getAnonymousDocumentsBySource,
  saveRehydratedResultAsDocument,
  downloadDocument,
  type DocumentItem,
  type CaseContractListItem,
  type AnonymousDocumentListItem,
} from "@/lib/api";
import { VerifiedDocumentContext } from './VerifiedDocumentContext';
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { AnonymizeModal } from "@/components/documents/AnonymizeModal";
import { AnonymizationCapabilityNotice, useAnonymizationCapability } from "@/components/documents/anonymizationCapability";
import { RehydrateModal } from "@/components/documents/RehydrateModal";

// ============================================================================
// DocumentAIFlow — case-scoped document AI workflow leaf (WF03).
//
// One multi-document workflow: uploaded originals -> anonymized TXT work
// copies -> saved final AI analysis documents. The final column lists real
// Document rows saved by the rehydration flow (documentType AI_ANALYSIS),
// never a guessed "first document". Scanner status gates anonymization.
//
// This leaf consumes existing API paths and existing Anonymize/Rehydrate
// modals. It is mounted by the case workspace host; it does not edit shared
// API clients, route mounts or the outer hosts.
// ============================================================================

export interface DocumentAIFlowProps {
  caseId: string;
  clientId?: string | null;
  clientName?: string;
  clientRole?: string;
  readOnly?: boolean;
  onChanged?: () => void;
}

const REHYDRATION_LABELS: Record<string, string> = {
  COMPLETE: "Teljes",
  PARTIAL: "Részleges",
  FAILED: "Sikertelen",
  PENDING: "Függőben",
};

const SCAN_LABELS: Record<string, string> = {
  PENDING_SCAN: "Vizsgálat folyamatban",
  CLEAN: "Tiszta",
  SCAN_FAILED: "Vizsgálat hibás",
  INFECTED: "Karantén",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("hu-HU");
}

function sanitizeFileName(name: string | null | undefined): string {
  const base = (name || "anonimizalt").replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ._-]+/g, "_");
  return base.endsWith(".txt") ? base : `${base}.txt`;
}

/** Canonical uploaded-Document -> AnonymizeModal contract adaptation.
 *  Presentation-only: the modal consumes `contract.id` as the source document
 *  identity and displays the remaining fields; nothing here is persisted.
 *  Unknown identity stays unknown: no invented v1 or created date. */
function toAnonymizeContract(document: DocumentItem): CaseContractListItem {
  return {
    id: document.id,
    title: document.fileName || "Feltöltött dokumentum",
    templateName: "",
    category: document.documentType || "Feltöltött irat",
    status: "Feltöltve",
    fileName: document.fileName || "document",
    fileSize: 0,
    generatedAt: document.createdAt ?? "",
    revisionNumber: document.version != null ? Number(document.version) : undefined,
    isCurrentRevision: true,
    isFinalRevision: false,
  };
}

/** Keep the server-side file name for any downloaded binary; only remove
 *  path-dangerous characters. The extension is preserved so a DOCX/PDF final
 *  document is never renamed into .txt bytes. */
function safeDownloadName(name: string | null | undefined): string {
  const base = (name || "dokumentum").replace(/[\\/:*?"<>|]+/g, "_").trim();
  return base || "dokumentum";
}

function rehydrationBadgeStatus(status: string | null): "active" | "warning" | "error" | "pending" {
  if (status === "COMPLETE") return "active";
  if (status === "PARTIAL") return "warning";
  if (status === "FAILED") return "error";
  return "pending";
}

function scanBadgeStatus(status: string | null | undefined): "active" | "warning" | "error" | "pending" {
  if (status === "CLEAN") return "active";
  if (status === "SCAN_FAILED") return "warning";
  if (status === "INFECTED") return "error";
  return "pending";
}

export function DocumentAIFlow({
  caseId,
  clientId,
  clientName,
  clientRole,
  readOnly = false,
  onChanged,
}: DocumentAIFlowProps) {
  const anonymization = useAnonymizationCapability(caseId);
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [anonymousList, setAnonymousList] = useState<AnonymousDocumentListItem[]>([]);
  const [anonymousError, setAnonymousError] = useState<string | null>(null);
  const [anonymousReadDisabled, setAnonymousReadDisabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const [anonymizeTarget, setAnonymizeTarget] = useState<CaseContractListItem | null>(null);
  const [rehydrateTarget, setRehydrateTarget] = useState<{
    anonymousDocId: string;
    name: string;
  } | null>(null);

  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [saveBusyId, setSaveBusyId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Stale-response guard: every read/action completes only while its request
  // generation is current. A delayed response from a previous case can never
  // populate this case's lists, open a modal target or report a result.
  const requestRef = useRef(0);
  const scopeRef = useRef<string>(caseId);
  scopeRef.current = caseId;

  const loadAll = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setDocumentsError(null);
    setAnonymousError(null);
    setAnonymousReadDisabled(false);

    const [docsResult, anonResult] = await Promise.allSettled([
      getCaseDocuments(caseId),
      getCaseAnonymousDocuments(caseId),
    ]);

    if (requestId !== requestRef.current) return;

    if (docsResult.status === "fulfilled") {
      setDocuments(docsResult.value);
    } else {
      setDocuments(null);
      setDocumentsError("A dokumentumok listája nem tölthető be.");
    }

    if (anonResult.status === "fulfilled") {
      setAnonymousList(anonResult.value);
    } else {
      setAnonymousList([]);
      const disabled = anonResult.reason instanceof ApiError && anonResult.reason.status === 501 && anonResult.reason.code === "FEATURE_DISABLED";
      setAnonymousReadDisabled(disabled);
      if (!disabled) setAnonymousError("Az anonimizált munkapéldányok listája nem érhető el.");
    }

    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Case switch resets every per-case surface: modal targets and in-flight
  // busy/error indicators must never carry over into the next case. The first
  // mount is skipped. The loadAll effect invalidates stale reads through the
  // requestRef generation guard; action handlers are scope-guarded by caseId.
  const mountedCaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (mountedCaseRef.current === null) {
      mountedCaseRef.current = caseId;
      return;
    }
    if (mountedCaseRef.current === caseId) return;
    mountedCaseRef.current = caseId;
    setAnonymizeTarget(null);
    setRehydrateTarget(null);
    setDownloadBusyId(null);
    setSaveBusyId(null);
    setDownloadError(null);
    setSaveError(null);
    setDocuments(null);
    setAnonymousList([]);
    setAnonymousReadDisabled(false);
  }, [caseId]);

  const originals = useMemo(
    () => (documents || []).filter((doc) => doc.documentType !== "AI_ANALYSIS"),
    [documents],
  );
  const finals = useMemo(
    () => (documents || []).filter((doc) => doc.documentType === "AI_ANALYSIS"),
    [documents],
  );

  const artifactsBySource = useMemo(() => {
    const map = new Map<string, AnonymousDocumentListItem[]>();
    for (const item of anonymousList) {
      const bucket = map.get(item.sourceDocId) || [];
      bucket.push(item);
      map.set(item.sourceDocId, bucket);
    }
    return map;
  }, [anonymousList]);

  const handleDownloadTxt = async (artifact: AnonymousDocumentListItem) => {
    const caseScope = caseId;
    setDownloadBusyId(artifact.id);
    setDownloadError(null);
    try {
      const bySource = await getAnonymousDocumentsBySource(artifact.sourceDocId);
      if (scopeRef.current !== caseScope) return;
      const withText = bySource.find((item) => item.id === artifact.id);
      if (!withText?.redactedText) {
        throw new Error("A szanitizált szöveg nem érhető el.");
      }
      const blob = new Blob([withText.redactedText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = sanitizeFileName(artifact.name);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      if (scopeRef.current === caseScope) setDownloadError("A szanitizált TXT letöltése nem sikerült.");
    } finally {
      if (scopeRef.current === caseScope) setDownloadBusyId(null);
    }
  };

  const handleDownloadFinal = async (doc: DocumentItem) => {
    const caseScope = caseId;
    setDownloadBusyId(doc.id);
    setDownloadError(null);
    try {
      const blob = await downloadDocument(doc.id);
      if (scopeRef.current !== caseScope) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      // The server-side file name (extension and all) is preserved; only
      // path-dangerous characters are stripped.
      anchor.download = safeDownloadName(doc.fileName);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      if (scopeRef.current === caseScope) setDownloadError("A végleges dokumentum letöltése nem sikerült.");
    } finally {
      if (scopeRef.current === caseScope) setDownloadBusyId(null);
    }
  };

  const handleSaveFinal = async (artifact: AnonymousDocumentListItem) => {
    const caseScope = caseId;
    setSaveBusyId(artifact.id);
    setSaveError(null);
    try {
      const result = await saveRehydratedResultAsDocument(artifact.id);
      if (scopeRef.current !== caseScope) return;
      if (!result.success) {
        throw new Error(result.error || "A mentés nem sikerült.");
      }
      await loadAll();
      onChanged?.();
    } catch (error) {
      if (scopeRef.current === caseScope) setSaveError(error instanceof Error ? error.message : "A mentés nem sikerült.");
    } finally {
      if (scopeRef.current === caseScope) setSaveBusyId(null);
    }
  };

  const canSaveFinal = (status: string | null) => status === "COMPLETE" || status === "PARTIAL";

  return (
    <section aria-label="Dokumentum AI-munkafolyamat" className="space-y-4">
      <VerifiedDocumentContext key={`${caseId}:${clientId}`} caseId={caseId} clientId={clientId ?? null} documents={documents ?? []} readOnly={readOnly} onCreated={()=>void loadAll()}/>
      {(documentsError || anonymousError) && (
        <Alert
          variant="error"
          title="A munkafolyamat adatai nem teljesek"
          action={
            <Button size="sm" variant="secondary" onClick={() => void loadAll()}>
              Újra
            </Button>
          }
        >
          {documentsError && <p>{documentsError}</p>}
          {anonymousError && <p>{anonymousError}</p>}
        </Alert>
      )}

      {(downloadError || saveError) && (
        <Alert variant="error" onDismiss={() => { setDownloadError(null); setSaveError(null); }}>
          {downloadError && <p>{downloadError}</p>}
          {saveError && <p>{saveError}</p>}
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {/* Originals */}
        <div className="rounded-[12px] border border-[var(--adm-border-canonical)] bg-white p-4">
          <h2 className="font-serif text-base font-semibold text-[var(--adm-text-primary)] mb-3">
            Eredeti dokumentumok
          </h2>
          {!readOnly ? <AnonymizationCapabilityNotice status={anonymization.status} onRetry={anonymization.retry} /> : null}
          {loading && documents === null ? (
            <p className="text-xs text-[var(--adm-text-secondary)]">Betöltés…</p>
          ) : originals.length === 0 ? (
            <EmptyState
              title="Nincs feltöltött dokumentum"
              description="Ebben az ügyben még nincs anonimizálható eredeti dokumentum."
            />
          ) : (
            <ul className="space-y-3">
              {originals.map((doc) => {
                const infected = doc.securityScanStatus === "INFECTED";
                return (
                  <li key={doc.id} className="rounded-[8px] border border-[var(--adm-border-canonical)] p-3 space-y-2">
                    <p className="text-sm font-medium text-[var(--adm-text-primary)] break-words">{doc.fileName}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {doc.version ? <Badge tone="neutral">v{doc.version}</Badge> : null}
                      {doc.securityScanStatus && (
                        <Badge status={scanBadgeStatus(doc.securityScanStatus)}>
                          {SCAN_LABELS[doc.securityScanStatus] || doc.securityScanStatus}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--adm-text-secondary)]">Feltöltve: {fmtDate(doc.createdAt)}</p>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={infected || anonymousReadDisabled || anonymization.status !== "AVAILABLE"}
                        onClick={() => setAnonymizeTarget(toAnonymizeContract(doc))}
                      >
                        Anonimizálás
                      </Button>
                    )}
                    {infected && (
                      <p className="text-[11px] text-[var(--adm-terracotta-700)]">
                        Karanténban lévő dokumentum nem anonimizálható.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Anonymized work copies */}
        <div className="rounded-[12px] border border-[var(--adm-border-canonical)] bg-white p-4">
          <h2 className="font-serif text-base font-semibold text-[var(--adm-text-primary)] mb-3">
            Anonimizált munkapéldányok
          </h2>
          {anonymousReadDisabled && anonymousList.length === 0 ? (
            <p className="text-xs text-[var(--adm-text-secondary)]">Az anonimizált munkapéldányok listája a kikapcsolt funkció mellett nem olvasható.</p>
          ) : anonymousList.length === 0 && !anonymousError ? (
            <EmptyState
              title="Még nincs munkapéldány"
              description="Az anonimizálás után itt jelennek meg a szanitizált TXT munkapéldányok."
            />
          ) : (
            <ul className="space-y-3">
              {Array.from(artifactsBySource.entries()).map(([sourceDocId, artifacts]) => {
                const sourceDoc = documents?.find((doc) => doc.id === sourceDocId);
                return (
                  <li key={sourceDocId} className="space-y-2">
                    {sourceDoc && (
                      <p className="text-[11px] font-medium text-[var(--adm-text-secondary)] truncate" title={sourceDoc.fileName}>
                        {sourceDoc.fileName}
                      </p>
                    )}
                    {artifacts.map((artifact) => {
                      const saveAllowed = canSaveFinal(artifact.rehydrationStatus);
                      return (
                        <div key={artifact.id} className="rounded-[8px] border border-[var(--adm-border-canonical)] p-3 space-y-2">
                          <p className="text-sm font-medium text-[var(--adm-text-primary)] break-words">{artifact.name}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge status={rehydrationBadgeStatus(artifact.rehydrationStatus)}>
                              {REHYDRATION_LABELS[artifact.rehydrationStatus || "PENDING"] || "Függőben"}
                            </Badge>
                            {artifact.aiTask && <Badge tone="teal">{artifact.aiTask}</Badge>}
                          </div>
                          <p className="text-[11px] text-[var(--adm-text-secondary)]">Készült: {fmtDate(artifact.createdAt)}</p>
                          {artifact.rehydrationStatus === "PARTIAL" && (
                            <p className="text-[11px] text-[var(--adm-semantic-warning)]">
                              A visszaazonosítás részleges — ellenőrizze a megmaradt helyettesítőket.
                            </p>
                          )}
                          {!readOnly && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="neutral"
                                isLoading={downloadBusyId === artifact.id}
                                onClick={() => void handleDownloadTxt(artifact)}
                              >
                                TXT letöltés
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setRehydrateTarget({
                                    anonymousDocId: artifact.id,
                                    name: artifact.name,
                                  })
                                }
                              >
                                AI-válasz rehidratálás
                              </Button>
                              <Button
                                size="sm"
                                variant="success"
                                disabled={!saveAllowed}
                                title={
                                  saveAllowed
                                    ? undefined
                                    : "Végleges mentés csak sikeres vagy részleges visszaazonosítás után lehetséges."
                                }
                                isLoading={saveBusyId === artifact.id}
                                onClick={() => void handleSaveFinal(artifact)}
                              >
                                Végleges mentés
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Final AI analysis */}
        <div className="rounded-[12px] border border-[var(--adm-border-canonical)] bg-white p-4">
          <h2 className="font-serif text-base font-semibold text-[var(--adm-text-primary)] mb-3">
            Végleges AI-elemzés
          </h2>
          {finals.length === 0 ? (
            <EmptyState
              title="Még nincs mentett elemzés"
              description="A rehidratált AI-válasz végleges mentése után itt jelenik meg új dokumentumként."
            />
          ) : (
            <ul className="space-y-3">
              {finals.map((doc) => (
                <li key={doc.id} className="rounded-[8px] border border-[var(--adm-border-canonical)] p-3 space-y-2">
                  <p className="text-sm font-medium text-[var(--adm-text-primary)] break-words">{doc.fileName}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {doc.version ? <Badge tone="neutral">v{doc.version}</Badge> : null}
                  </div>
                  <p className="text-[11px] text-[var(--adm-text-secondary)]">Létrehozva: {fmtDate(doc.createdAt)}</p>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="neutral"
                      isLoading={downloadBusyId === doc.id}
                      onClick={() => void handleDownloadFinal(doc)}
                    >
                      Letöltés
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {anonymizeTarget && !anonymousReadDisabled && anonymization.status === "AVAILABLE" && (
        <AnonymizeModal
          isOpen={!!anonymizeTarget}
          onClose={() => {
            setAnonymizeTarget(null);
            void loadAll();
          }}
          contract={anonymizeTarget}
          caseId={caseId}
          clientId={clientId || undefined}
          clientName={clientName}
          clientRole={clientRole}
          onSuccess={() => {
            void loadAll();
            onChanged?.();
          }}
        />
      )}

      {rehydrateTarget && (
        <RehydrateModal
          isOpen={!!rehydrateTarget}
          onClose={() => setRehydrateTarget(null)}
          anonymousDocId={rehydrateTarget.anonymousDocId}
          anonymousDocName={rehydrateTarget.name}
          caseId={caseId}
          onSuccess={() => void loadAll()}
          onSaveSuccess={() => {
            void loadAll();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}
