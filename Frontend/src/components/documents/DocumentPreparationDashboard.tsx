"use client";

/**
 * Case Workspace document preparation surface (DOCUMENT-PREP-DASHBOARD-1).
 *
 * The legal preparation workflow starts with: what is my task, what is the
 * current situation, what are the risks, and can I anonymize this document for
 * safe AI work. This component answers those four questions for the selected
 * document on the CASE WORKSPACE overview — it is not the Document Workspace
 * reader, which stays a separate phase.
 *
 * Every signal is read from an existing canonical API. Nothing is synthesised:
 * no fake risk scores, no invented point counts, no fabricated AI results, no
 * hardcoded backend template ids. Capabilities that are demoted here (review,
 * comparison, version history) remain reachable elsewhere.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  deleteDocument,
  downloadDocument,
  getAnonymousDocumentsBySource,
  getDocumentWorkContext,
  listDocumentLegalAnalyses,
  type AnonymousDocumentItem,
  type CaseContractListItem,
  type CaseWorkspace,
  type DocumentWorkCard,
  type LegalAnalysisSummaryRecord,
} from "@/lib/api";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { ConfirmationDialog } from "@/components/ui";
import { AnonymizeModal } from "@/components/documents/AnonymizeModal";
import { AIPromptPreparationModal } from "@/components/ai-prompts/AIPromptPreparationModal";
import { DocumentWorkContextEditor, DocumentWorkStatusBadge } from "@/components/documents/DocumentWorkCard";
import { formatDocDate, workStatusLabel } from "@/lib/documents/workContext";
import {
  CLIPBOARD_COPY_FAILURE_MESSAGE,
  copyTextToClipboard,
  documentDeleteErrorMessage,
  latestDocumentActivity,
  pickLatestAnonymousDocument,
  redactedItemCount,
  resolveDefaultPreparationDocumentId,
  summarizeRiskMatrix,
} from "@/lib/documents/documentPreparation";

type WorkspaceDoc = CaseWorkspace["documents"][number];

export interface DocumentPreparationDashboardProps {
  caseId: string;
  documents: WorkspaceDoc[];
  activeDocuments: CaseWorkspace["cockpit"]["activeDocuments"];
  activity?: CaseWorkspace["activity"];
  clientId?: string | null;
  clientName?: string | null;
  clientRole?: string | null;
  onOpenDocument: (documentId: string) => void;
  onRefresh?: () => void;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("hu-HU");
}

/**
 * Mirrors the canonical uploaded-Document -> CaseContractListItem adaptation used
 * by the Document Workspace before it opens AnonymizeModal. The source shape is
 * the Case Workspace document projection, so the same display contract holds.
 */
function toAnonymizeContract(document: WorkspaceDoc): CaseContractListItem {
  return {
    id: document.id,
    title: document.fileName || "Feltöltött dokumentum",
    templateName: "",
    category: document.category || document.type || "Feltöltött irat",
    status: "Feltöltve",
    fileName: document.fileName || "document",
    fileSize: 0,
    generatedAt: document.uploadedAt || new Date().toISOString(),
    revisionNumber: Number(document.version) || 1,
    isCurrentRevision: true,
    isFinalRevision: false,
  };
}

export function DocumentPreparationDashboard({
  caseId,
  documents,
  activeDocuments,
  activity,
  clientId,
  clientName,
  clientRole,
  onOpenDocument,
  onRefresh,
}: DocumentPreparationDashboardProps) {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(() =>
    resolveDefaultPreparationDocumentId(documents, activeDocuments),
  );
  const [card, setCard] = useState<DocumentWorkCard | null>(null);
  const [analyses, setAnalyses] = useState<LegalAnalysisSummaryRecord[]>([]);
  const [anonymous, setAnonymous] = useState<AnonymousDocumentItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [analysesError, setAnalysesError] = useState(false);
  const [anonymousError, setAnonymousError] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [downloading, setDownloading] = useState(false);
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [editingWorkContext, setEditingWorkContext] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestRef = useRef(0);

  // Reconcile selection with the current document list: a deleted or otherwise
  // absent selection falls back to the default document. The document identity
  // itself is always the canonical document id; it is never forked here.
  useEffect(() => {
    setSelectedDocumentId((current) => {
      if (current && documents.some((doc) => doc.id === current)) return current;
      return resolveDefaultPreparationDocumentId(documents, activeDocuments);
    });
  }, [documents, activeDocuments]);

  const selectedDocument = documents.find((doc) => doc.id === selectedDocumentId) ?? null;

  const loadDocument = useCallback(
    async (documentId: string) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setDataLoading(true);
      setDataError(null);
      setAnalysesError(false);
      setAnonymousError(false);
      setCard(null);
      try {
        // Settled results keep request failure distinct from a successful empty
        // response: 403/500/network must never read as "nothing here".
        const [cardResult, analysesResult, anonymousResult] = await Promise.allSettled([
          getDocumentWorkContext(documentId),
          listDocumentLegalAnalyses(documentId, { caseId, documentSourceType: "DOCUMENT" }),
          getAnonymousDocumentsBySource(documentId),
        ]);
        if (requestRef.current !== requestId) return;
        if (cardResult.status === "fulfilled") {
          setCard(cardResult.value);
        } else {
          setCard(null);
          setDataError("A dokumentum munkakontextusa nem tölthető be.");
        }
        if (analysesResult.status === "fulfilled") {
          setAnalyses(analysesResult.value);
        } else {
          setAnalyses([]);
          setAnalysesError(true);
        }
        if (anonymousResult.status === "fulfilled") {
          setAnonymous(anonymousResult.value);
        } else {
          setAnonymous([]);
          setAnonymousError(true);
        }
      } finally {
        if (requestRef.current === requestId) setDataLoading(false);
      }
    },
    [caseId],
  );

  useEffect(() => {
    if (!selectedDocumentId) {
      requestRef.current += 1;
      setCard(null);
      setAnalyses([]);
      setAnonymous([]);
      setDataLoading(false);
      setDataError(null);
      setAnalysesError(false);
      setAnonymousError(false);
      return;
    }
    setCopyState("idle");
    void loadDocument(selectedDocumentId);
  }, [selectedDocumentId, loadDocument]);

  const latestAnonymous = pickLatestAnonymousDocument(anonymous);
  const latestAnonymousCount = redactedItemCount(latestAnonymous);
  const matrix = summarizeRiskMatrix(analyses);
  const lastActivity = selectedDocumentId ? latestDocumentActivity(activity, selectedDocumentId) : null;

  const workStatus = card?.workStatus ?? selectedDocument?.workStatus ?? null;
  const responsibleName = card?.responsible?.name || selectedDocument?.responsible?.name || null;
  const openPointCount =
    typeof selectedDocument?.reviewSummary?.openPointCount === "number"
      ? selectedDocument.reviewSummary.openPointCount
      : null;
  const currentVersion = selectedDocument?.reviewSummary?.currentVersionNumber ?? card?.currentVersion ?? null;
  const lastEventLabel = lastActivity
    ? `${fmtDateTime(lastActivity.occurredAt)}${lastActivity.actionLabel ? ` · ${lastActivity.actionLabel}` : ""}`
    : selectedDocument?.uploadedAt
      ? `Feltöltve: ${fmtDateTime(selectedDocument.uploadedAt)}`
      : "Nincs rögzített esemény.";

  const handleCopyAnonymous = useCallback(async () => {
    if (!latestAnonymous) return;
    const ok = await copyTextToClipboard(latestAnonymous.redactedText);
    setCopyState(ok ? "ok" : "fail");
    if (ok) globalThis.setTimeout(() => setCopyState("idle"), 2000);
  }, [latestAnonymous]);

  const handleDownload = useCallback(async () => {
    if (!selectedDocument) return;
    setDownloading(true);
    setActionError(null);
    try {
      const blob = await downloadDocument(selectedDocument.id);
      const url = URL.createObjectURL(blob);
      const anchor = globalThis.document.createElement("a");
      anchor.href = url;
      anchor.download = selectedDocument.fileName || "document";
      globalThis.document.body.appendChild(anchor);
      anchor.click();
      globalThis.document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Letöltés sikertelen.");
    } finally {
      setDownloading(false);
    }
  }, [selectedDocument]);

  const confirmDelete = useCallback(async () => {
    if (!selectedDocument || deleting) return;
    const deletedId = selectedDocument.id;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDocument(deletedId);
      setDeleteOpen(false);
      // Select the next valid document immediately so stale deleted data can
      // never stay visible, then let the Case Workspace refresh reconcile.
      const remaining = documents.filter((doc) => doc.id !== deletedId);
      setSelectedDocumentId(resolveDefaultPreparationDocumentId(remaining, activeDocuments));
      onRefresh?.();
    } catch (error) {
      setDeleteError(documentDeleteErrorMessage(error instanceof ApiError ? error.status : undefined));
    } finally {
      setDeleting(false);
    }
  }, [selectedDocument, deleting, documents, activeDocuments, onRefresh]);

  if (documents.length === 0) {
    return (
      <section
        aria-label="Dokumentum-előkészítés"
        data-testid="document-preparation-dashboard"
        className="rounded-lg border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4"
      >
        <h3 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Dokumentum-előkészítés</h3>
        <p className="mt-1 text-[12.5px] text-[var(--adm-text-secondary)]">Nincs dokumentum az előkészítéshez.</p>
      </section>
    );
  }

  return (
    <section aria-label="Dokumentum-előkészítés" data-testid="document-preparation-dashboard" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Dokumentum-előkészítés</h3>
          <p className="mt-0.5 text-[12px] text-[var(--adm-text-secondary)]">
            Válaszd ki a dokumentumot, majd nézd meg a feladatot, a helyzetállást, a kockázati mátrixot és az anonimizált változatot.
          </p>
        </div>
        <label className="block w-full text-[11.5px] font-semibold text-[var(--adm-text-secondary)] sm:w-auto">
          Előkészítendő dokumentum
          <select
            data-testid="preparation-document-select"
            value={selectedDocumentId ?? ""}
            onChange={(event) => setSelectedDocumentId(event.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-2.5 py-1.5 text-[13px] font-normal text-[var(--adm-text-primary)] sm:min-w-[240px]"
          >
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.fileName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {actionError ? (
        <p role="alert" data-testid="preparation-action-error" className="text-[12px] font-semibold text-[var(--adm-brand-terracotta)]">
          {actionError}
        </p>
      ) : null}

      <section
        data-testid="document-preparation-header"
        className="rounded-lg border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--adm-brand-green)]">Kiválasztott dokumentum</p>
            <h4 data-testid="preparation-document-title" className="mt-1 truncate font-serif text-xl font-semibold text-[var(--adm-text-primary)]">
              {card?.title || selectedDocument?.fileName || "Névtelen dokumentum"}
            </h4>
            <p data-testid="preparation-document-filename" className="mt-0.5 truncate text-[11.5px] text-[var(--adm-text-secondary)]">
              {selectedDocument?.fileName || "Nincs eredeti fájlnév"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--adm-text-secondary)]">
              {workStatus ? (
                <DocumentWorkStatusBadge status={workStatus} />
              ) : (
                <AdminStatusPill tone="neutral">Állapot nincs megadva</AdminStatusPill>
              )}
              <span>
                Felelős: <span className="font-semibold text-[var(--adm-text-primary)]">{responsibleName || "Nincs kijelölve"}</span>
              </span>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <AdminButton
              data-testid="preparation-open"
              variant="primary"
              size="sm"
              onClick={() => {
                if (selectedDocument) onOpenDocument(selectedDocument.id);
              }}
            >
              Megnyitás
            </AdminButton>
            <AdminButton variant="neutral" size="sm" disabled={downloading} onClick={() => void handleDownload()}>
              {downloading ? "Letöltés…" : "Letöltés"}
            </AdminButton>
            {latestAnonymous ? (
              <AdminButton
                variant="neutral"
                size="sm"
                className="max-w-full"
                onClick={() => void handleCopyAnonymous()}
              >
                {copyState === "ok" ? "Másolva ✓" : "Anonimizált szöveg másolása"}
              </AdminButton>
            ) : (
              <AdminButton
                variant="neutral"
                size="sm"
                className="max-w-full"
                onClick={() => setAnonymizeOpen(true)}
              >
                Anonimizálás
              </AdminButton>
            )}
            <AdminButton
              data-testid="preparation-delete"
              variant="ghost"
              size="sm"
              className="text-[var(--adm-brand-terracotta)]"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              Törlés
            </AdminButton>
          </div>
        </div>
        {copyState === "fail" ? (
          <p role="alert" data-testid="preparation-copy-error" className="mt-2 text-[11.5px] font-semibold text-[var(--adm-brand-terracotta)]">
            {CLIPBOARD_COPY_FAILURE_MESSAGE}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Tile 1 — Feladat: the green operational emphasis. */}
        <section
          data-testid="preparation-tile-feladat"
          className="rounded-lg border border-[var(--adm-border-canonical)] border-l-4 border-l-[var(--adm-brand-green)] bg-[var(--adm-canvas-white)] p-4"
        >
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--adm-brand-green)]">Feladat</p>
          {dataLoading ? (
            <p className="mt-2 text-[12.5px] text-[var(--adm-text-secondary)]">Betöltés…</p>
          ) : (
            <>
              <p
                data-testid="preparation-work-instruction"
                className={`mt-2 whitespace-pre-line text-[13.5px] leading-6 ${
                  card?.workInstruction ? "text-[var(--adm-text-primary)]" : "text-[var(--adm-text-secondary)]"
                }`}
              >
                {card?.workInstruction || "Nincs rögzített munkautasítás."}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                <div>
                  <dt className="text-[11px] text-[var(--adm-text-secondary)]">Felelős</dt>
                  <dd data-testid="preparation-owner" className="font-semibold text-[var(--adm-text-primary)]">
                    {card?.responsible?.name || selectedDocument?.responsible?.name || "Nincs"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[var(--adm-text-secondary)]">Határidő</dt>
                  <dd data-testid="preparation-due" className="font-semibold text-[var(--adm-text-primary)]">
                    {formatDocDate(card?.dueDate)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-[var(--adm-text-secondary)]">Következő lépés</dt>
                  <dd data-testid="preparation-next-step" className="font-semibold text-[var(--adm-text-primary)]">
                    {card?.nextStep || "Nincs"}
                  </dd>
                </div>
                {card && card.linkedTasks.length > 0 ? (
                  <div className="col-span-2">
                    <dt className="text-[11px] text-[var(--adm-text-secondary)]">Kapcsolt feladat</dt>
                    <dd data-testid="preparation-linked-task" className="font-semibold text-[var(--adm-text-primary)]">
                      {card.linkedTasks.map((task) => task.title).join(", ")}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {dataError ? (
                <p className="mt-2 text-[11.5px] font-semibold text-[var(--adm-brand-terracotta)]">{dataError}</p>
              ) : null}
              <div className="mt-3">
                <AdminButton
                  data-testid="preparation-edit-work-context"
                  variant="neutral"
                  size="xs"
                  disabled={!card}
                  onClick={() => setEditingWorkContext(true)}
                >
                  Munkautasítás szerkesztése
                </AdminButton>
              </div>
            </>
          )}
        </section>

        {/* Tile 2 — Helyzetállás: neutral status. */}
        <section
          data-testid="preparation-tile-helyzetallas"
          className="rounded-lg border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-4"
        >
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">Helyzetállás</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            <div data-testid="preparation-status">
              <dt className="text-[11px] text-[var(--adm-text-secondary)]">Állapot</dt>
              <dd className="font-semibold text-[var(--adm-text-primary)]">{workStatus ? workStatusLabel(workStatus) : "Nincs adat"}</dd>
            </div>
            <div data-testid="preparation-current-version">
              <dt className="text-[11px] text-[var(--adm-text-secondary)]">Aktuális változat</dt>
              <dd className="font-semibold text-[var(--adm-text-primary)]">{currentVersion != null ? `v${currentVersion}` : "Nincs adat"}</dd>
            </div>
            <div data-testid="preparation-open-points">
              <dt className="text-[11px] text-[var(--adm-text-secondary)]">Nyitott felülvizsgálati pontok</dt>
              <dd className="font-semibold text-[var(--adm-text-primary)]">{openPointCount != null ? openPointCount : "Nincs adat"}</dd>
            </div>
            <div data-testid="preparation-last-event" className="col-span-2">
              <dt className="text-[11px] text-[var(--adm-text-secondary)]">Utolsó dokumentumesemény</dt>
              <dd className="font-semibold text-[var(--adm-text-primary)]">{lastEventLabel}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <AdminButton data-testid="preparation-summary-action" variant="neutral" size="xs" onClick={() => setAiOpen(true)}>
              Rövid összefoglaló készítése
            </AdminButton>
          </div>
        </section>

        {/* Tile 3 — Kockázati mátrix: canonical teal intelligence accent. */}
        <section
          data-testid="preparation-tile-kockazat"
          className="rounded-lg border border-[var(--adm-border-canonical)] border-l-4 border-l-[var(--adm-palette-teal)] bg-[var(--adm-canvas-white)] p-4"
        >
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--adm-palette-teal)]">Kockázati mátrix</p>
          {analysesError ? (
            <>
              <p data-testid="preparation-risk-unavailable" className="mt-2 text-[13px] text-[var(--adm-text-secondary)]">
                A kockázati elemzés állapota most nem tölthető be.
              </p>
              <div className="mt-3">
                <AdminButton
                  data-testid="preparation-risk-retry"
                  variant="neutral"
                  size="xs"
                  disabled={dataLoading}
                  onClick={() => {
                    if (selectedDocumentId) void loadDocument(selectedDocumentId);
                  }}
                >
                  Újrapróbálás
                </AdminButton>
              </div>
            </>
          ) : matrix.hasMatrix ? (
            <>
              <p data-testid="preparation-risk-recorded" className="mt-2 text-[13.5px] font-semibold text-[var(--adm-text-primary)]">
                Kockázati elemzés rögzítve
              </p>
              {matrix.latestUpdatedAt ? (
                <p data-testid="preparation-risk-updated" className="mt-1 text-[11.5px] text-[var(--adm-text-secondary)]">
                  Frissítve: {fmtDateTime(matrix.latestUpdatedAt)}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p data-testid="preparation-risk-empty" className="mt-2 text-[13px] text-[var(--adm-text-secondary)]">
                {dataLoading ? "Betöltés…" : "Még nincs kockázati mátrix."}
              </p>
              <div className="mt-3">
                <AdminButton
                  data-testid="preparation-risk-action"
                  variant="neutral"
                  size="xs"
                  disabled={dataLoading}
                  onClick={() => setAiOpen(true)}
                >
                  Kockázati mátrix készítése
                </AdminButton>
              </div>
            </>
          )}
        </section>

        {/* Tile 4 — Anonimizált változat: privacy / utility. */}
        <section
          data-testid="preparation-tile-anonim"
          className="rounded-lg border border-[var(--adm-border-canonical)] border-l-4 border-l-[var(--adm-brand-terracotta)] bg-[var(--adm-canvas-white)] p-4"
        >
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--adm-brand-terracotta)]">Anonimizált változat</p>
          {anonymousError ? (
            <>
              <p data-testid="preparation-anonymized-unavailable" className="mt-2 text-[13px] text-[var(--adm-text-secondary)]">
                Az anonimizált változat állapota most nem tölthető be.
              </p>
              <div className="mt-3">
                <AdminButton
                  data-testid="preparation-anonymized-retry"
                  variant="neutral"
                  size="xs"
                  disabled={dataLoading}
                  onClick={() => {
                    if (selectedDocumentId) void loadDocument(selectedDocumentId);
                  }}
                >
                  Újrapróbálás
                </AdminButton>
              </div>
            </>
          ) : latestAnonymous ? (
            <>
              <p data-testid="preparation-anonymized-ready" className="mt-2 text-[13.5px] font-semibold text-[var(--adm-text-primary)]">
                Kész
              </p>
              <p data-testid="preparation-anonymized-meta" className="mt-1 text-[11.5px] text-[var(--adm-text-secondary)]">
                {formatDocDate(latestAnonymous.createdAt)}
                {latestAnonymousCount != null ? ` · ${latestAnonymousCount} elem anonimizálva` : ""}
              </p>
              <div className="mt-3">
                <AdminButton
                  data-testid="preparation-copy-anonymized"
                  variant="neutral"
                  size="xs"
                  onClick={() => void handleCopyAnonymous()}
                >
                  {copyState === "ok" ? "Másolva ✓" : "Anonimizált szöveg másolása"}
                </AdminButton>
              </div>
            </>
          ) : (
            <>
              <p data-testid="preparation-anonymized-empty" className="mt-2 text-[13px] text-[var(--adm-text-secondary)]">
                {dataLoading ? "Betöltés…" : "Nincs anonimizált változat."}
              </p>
              <div className="mt-3">
                <AdminButton
                  data-testid="preparation-anonymize-action"
                  variant="neutral"
                  size="xs"
                  disabled={dataLoading}
                  onClick={() => setAnonymizeOpen(true)}
                >
                  Anonimizálás indítása
                </AdminButton>
              </div>
            </>
          )}
          {copyState === "fail" ? (
            <p role="alert" data-testid="preparation-copy-error-tile" className="mt-2 text-[11.5px] font-semibold text-[var(--adm-brand-terracotta)]">
              {CLIPBOARD_COPY_FAILURE_MESSAGE}
            </p>
          ) : null}
        </section>
      </div>

      {editingWorkContext && card && selectedDocument ? (
        <div className="rounded-lg border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
          <DocumentWorkContextEditor
            card={card}
            onClose={() => setEditingWorkContext(false)}
            onSaved={(next) => {
              setCard(next);
              setEditingWorkContext(false);
              onRefresh?.();
            }}
          />
        </div>
      ) : null}

      {anonymizeOpen && selectedDocument ? (
        <AnonymizeModal
          isOpen
          onClose={() => setAnonymizeOpen(false)}
          contract={toAnonymizeContract(selectedDocument)}
          caseId={caseId}
          clientId={clientId ?? undefined}
          clientName={clientName ?? undefined}
          clientRole={clientRole ?? undefined}
          onSuccess={() => {
            if (selectedDocumentId) void loadDocument(selectedDocumentId);
            onRefresh?.();
          }}
        />
      ) : null}

      {aiOpen && selectedDocument ? (
        <AIPromptPreparationModal
          caseId={caseId}
          documentId={selectedDocument.id}
          onClose={() => setAiOpen(false)}
        />
      ) : null}

      <ConfirmationDialog
        open={deleteOpen}
        title="Dokumentum törlése"
        description="Ez a művelet nem vonható vissza."
        confirmLabel="Végleges törlés"
        busy={deleting}
        busyLabel="Törlés…"
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) {
            setDeleteOpen(false);
            setDeleteError(null);
          }
        }}
      >
        <p className="text-[12.5px] font-semibold text-[var(--adm-text-primary)]">
          {selectedDocument?.fileName || "Névtelen dokumentum"}
        </p>
        <p className="mt-1 text-[11.5px] text-[var(--adm-text-secondary)]">
          A rendszer ellenőrzi, hogy nincs-e kapcsolódó feladat, anonimizált változat, jogi elemzés vagy nyitott review-javaslat.
        </p>
        {deleteError ? (
          <p role="alert" data-testid="preparation-delete-error" className="mt-2 text-[11.5px] font-semibold text-[var(--adm-brand-terracotta)]">
            {deleteError}
          </p>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}
