"use client";

/**
 * Kontextusforrások — additive case-context source surface.
 *
 * Deterministic internal workflow, no external AI:
 *   1. paste context text OR select an eligible linked Communication
 *   2. optionally enter manual sensitive terms (ephemeral, component state only)
 *   3. save the raw source (immutable server-side)
 *   4. Detect  → candidates + sourceHash + optionsDigest
 *   5. review → explicit per-candidate approval (nothing auto-approved)
 *   6. Anonymize → one-shot apply; stale reviews fail closed and require Detect again
 *   7. raw source and anonymized derivative are shown separately
 *
 * Compact source index on the left, one selected source detail on the right.
 * Selection is local UI state only — no server persistence.
 *
 * The V1 Kontextus surface (CaseContextView) is untouched; this section renders
 * below it on the same route.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getCaseWorkspace, type CaseWorkspace } from "@/lib/api";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader } from "@/components/adminiculum/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { Modal } from "@/components/ui/Modal";
import { FormField, Select, Textarea } from "@/components/ui/Form";
import {
  STALE_REVIEW_CODES,
  anonymizeCaseContextSource,
  createCommunicationCaseContextSource,
  createPastedCaseContextSource,
  detectCaseContextSource,
  listCaseContextSources,
  type CaseContextSourceDTO,
  type ManualSensitiveTerm,
  type ReviewCandidate,
} from "@/lib/caseContextSources";
import { CandidateReviewList } from "./CandidateReviewList";
import { ManualTermsEditor } from "./ManualTermsEditor";

type SourceMode = "PASTE" | "COMMUNICATION";

type ResultView = "ANONYMIZED" | "RAW";

/**
 * Errors are tagged with the canonical source they belong to so a failure for
 * one source is never rendered beneath another selected source.
 */
type SourceError = {
  sourceId: string;
  message: string;
};

type ReviewState = {
  sourceId: string;
  sourceHash: string;
  optionsDigest: string;
  candidates: ReviewCandidate[];
  approvedIds: ReadonlySet<string>;
  termsAtDetect: ManualSensitiveTerm[];
};

const errorBoxClass =
  "rounded-[5px] border border-[var(--adm-semantic-danger-border)] bg-[var(--adm-semantic-danger-soft)] px-3 py-2 text-[12px] text-[var(--adm-semantic-danger)]";

const STALE_REVIEW_MESSAGE =
  "Az ellenőrzés már nem aktuális. Futtasd újra az ellenőrzést, majd hagyd jóvá újra a kiválasztott elemeket.";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

function sameTerms(a: ManualSensitiveTerm[], b: ManualSensitiveTerm[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((term, index) => b[index]?.term === term.term && b[index]?.category === term.category);
}

function errorMessageForCreate(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "EMPTY_RAW_TEXT":
        return "A beillesztett szöveg üres vagy csak szóközökből áll. Írj be szöveget a mentéshez.";
      case "RAW_TEXT_TOO_LARGE":
        return "A szöveg túl hosszú ahhoz, hogy kontextusforrásként menthető legyen.";
      case "COMMUNICATION_ID_REQUIRED":
        return "Válassz ki egy kommunikációt az átvételhez.";
      case "COMMUNICATION_NOT_FOUND":
        return "A kiválasztott kommunikáció már nem érhető el.";
      case "COMMUNICATION_CASE_MISMATCH":
        return "A kiválasztott kommunikáció nem ehhez az ügyhöz tartozik.";
      case "COMMUNICATION_SOURCE_GAP":
        return "Ennek a kommunikációnak nincs átvehető törzsszövege.";
      default:
        return fallback;
    }
  }
  return fallback;
}

function detectErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Ehhez a forráshoz most nincs hozzáférésed.";
  if (error instanceof ApiError && error.status === 404) return "A forrás már nem érhető el. Frissítsd a listát.";
  return "Az ellenőrzés most nem sikerült. Próbáld újra.";
}

function sourceTitle(source: CaseContextSourceDTO, communications: CaseWorkspace["communications"]): string {
  if (source.origin === "COMMUNICATION") {
    const communication = communications.find((item) => item.id === source.sourceCommunicationId);
    return communication?.subject ? communication.subject : "Kommunikáció";
  }
  return "Beillesztett szöveg";
}

export function CaseContextV2({ caseId }: { caseId: string }) {
  const [sources, setSources] = useState<CaseContextSourceDTO[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [resultView, setResultView] = useState<ResultView>("RAW");

  const [communications, setCommunications] = useState<CaseWorkspace["communications"]>([]);
  const [communicationsLoading, setCommunicationsLoading] = useState(true);
  const [communicationsError, setCommunicationsError] = useState(false);

  const [createModal, setCreateModal] = useState<SourceMode | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [selectedCommunicationId, setSelectedCommunicationId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [manualTerms, setManualTerms] = useState<ManualSensitiveTerm[]>([]);

  const [review, setReview] = useState<ReviewState | null>(null);
  const [detectingSourceId, setDetectingSourceId] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<SourceError | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<SourceError | null>(null);
  const [zeroApprovalOpen, setZeroApprovalOpen] = useState(false);

  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    setSourcesError(null);
    try {
      setSources(await listCaseContextSources(caseId));
    } catch {
      setSourcesError("A mentett kontextusforrások most nem tölthetők be.");
    } finally {
      setSourcesLoading(false);
    }
  }, [caseId]);

  const loadCommunications = useCallback(async () => {
    setCommunicationsLoading(true);
    setCommunicationsError(false);
    try {
      const workspace = await getCaseWorkspace(caseId);
      setCommunications(workspace.communications ?? []);
    } catch {
      setCommunications([]);
      setCommunicationsError(true);
    } finally {
      setCommunicationsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadSources();
    void loadCommunications();
  }, [loadSources, loadCommunications]);

  useEffect(() => {
    if (sources.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    setSelectedSourceId((current) => (current && sources.some((source) => source.id === current) ? current : sources[0]!.id));
  }, [sources]);

  useEffect(() => {
    const next = sources.find((source) => source.id === selectedSourceId);
    setResultView(next?.anonymizedText !== null ? "ANONYMIZED" : "RAW");
  }, [sources, selectedSourceId]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  const openCreateModal = (mode: SourceMode) => {
    setCreateModal((current) => (current === mode ? null : mode));
    setCreateError(null);
  };

  const closeCreateModal = () => {
    setCreateModal(null);
    setCreateError(null);
  };

  const handleCreatePasted = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      if (!pasteText.trim()) {
        setCreateError("A beillesztett szöveg üres vagy csak szóközökből áll. Írj be szöveget a mentéshez.");
        return;
      }
      const created = await createPastedCaseContextSource(caseId, pasteText);
      setPasteText("");
      await loadSources();
      if (created?.id) setSelectedSourceId(created.id);
      setCreateModal(null);
    } catch (error) {
      setCreateError(errorMessageForCreate(error, "A forrás mentése nem sikerült. Próbáld újra."));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFromCommunication = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      if (!selectedCommunicationId) {
        setCreateError("Válassz ki egy kommunikációt az átvételhez.");
        return;
      }
      const created = await createCommunicationCaseContextSource(caseId, selectedCommunicationId);
      setSelectedCommunicationId("");
      await loadSources();
      if (created?.id) setSelectedSourceId(created.id);
      setCreateModal(null);
    } catch (error) {
      setCreateError(errorMessageForCreate(error, "A kommunikáció átvétele nem sikerült. Próbáld újra."));
    } finally {
      setCreating(false);
    }
  };

  const handleDetect = async (source: CaseContextSourceDTO) => {
    setDetectingSourceId(source.id);
    setDetectError(null);
    setApplyError(null);
    setReview(null);
    try {
      const response = await detectCaseContextSource(caseId, source.id, manualTerms);
      setReview({
        sourceId: source.id,
        sourceHash: response.sourceHash,
        optionsDigest: response.optionsDigest,
        candidates: response.candidates,
        approvedIds: new Set<string>(),
        termsAtDetect: manualTerms.map((term) => ({ ...term })),
      });
    } catch (error) {
      setDetectError({ sourceId: source.id, message: detectErrorMessage(error) });
    } finally {
      setDetectingSourceId(null);
    }
  };

  const handleToggleCandidate = (candidateId: string) => {
    setReview((current) => {
      if (!current) return current;
      const next = new Set(current.approvedIds);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return { ...current, approvedIds: next };
    });
  };

  const handleSelectAll = () => {
    setReview((current) => {
      if (!current) return current;
      return { ...current, approvedIds: new Set(current.candidates.map((candidate) => candidate.id)) };
    });
  };

  const handleClearSelection = () => {
    setReview((current) => {
      if (!current) return current;
      return { ...current, approvedIds: new Set<string>() };
    });
  };

  const runApply = async () => {
    if (!review) return;
    // Capture the canonical reviewed source id before the request so an async
    // failure is attributed to the source that was actually being applied,
    // never to whatever source happens to be selected when the request fails.
    const sourceId = review.sourceId;
    setApplying(true);
    setApplyError(null);
    try {
      await anonymizeCaseContextSource(caseId, sourceId, {
        sourceHash: review.sourceHash,
        optionsDigest: review.optionsDigest,
        manualTerms: review.termsAtDetect,
        approvedCandidateIds: [...review.approvedIds],
      });
      setReview(null);
      setResultView("ANONYMIZED");
      await loadSources();
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONTEXT_SOURCE_ALREADY_ANONYMIZED") {
        setReview(null);
        setApplyError({ sourceId, message: "Ehhez a forráshoz már készült anonimizált változat." });
        await loadSources();
      } else if (error instanceof ApiError && STALE_REVIEW_CODES.has(String(error.code ?? ""))) {
        setReview(null);
        setApplyError({ sourceId, message: STALE_REVIEW_MESSAGE });
      } else if (error instanceof ApiError && error.status === 403) {
        setApplyError({ sourceId, message: "Ehhez a forráshoz most nincs hozzáférésed." });
      } else if (error instanceof ApiError && error.status === 404) {
        setReview(null);
        setApplyError({ sourceId, message: "A forrás már nem érhető el. Frissítsd a listát." });
      } else {
        setApplyError({ sourceId, message: "Az anonimizálás most nem sikerült. Próbáld újra." });
      }
    } finally {
      setApplying(false);
    }
  };

  const handleApply = () => {
    if (!review) return;
    if (review.approvedIds.size === 0) {
      setZeroApprovalOpen(true);
      return;
    }
    void runApply();
  };

  const confirmZeroApproval = () => {
    setZeroApprovalOpen(false);
    void runApply();
  };

  const termsChangedSinceDetect = review !== null && !sameTerms(manualTerms, review.termsAtDetect);
  const isReviewed = review !== null && selectedSource !== null && review.sourceId === selectedSource.id;
  const approvedCount = review?.approvedIds.size ?? 0;
  const candidateCount = review?.candidates.length ?? 0;

  const renderSourceDetail = () => {
    if (!selectedSource) return null;
    const source = selectedSource;
    const hasResult = source.anonymizedText !== null;
    const isDetecting = detectingSourceId === source.id;
    const appliedCount = source.anonymizationSnapshot?.appliedCount;
    const warnings = source.anonymizationSnapshot?.warnings ?? [];

    return (
      <div className="min-w-0 space-y-4" data-testid={`ccv2-source-detail-${source.id}`}>
        <AdminPanel>
          <AdminSectionHeader
            title={sourceTitle(source, communications)}
            subtitle={`Mentve: ${formatDateTime(source.createdAt)}${source.createdBy ? ` · ${source.createdBy.name}` : ""}`}
            action={
              <AdminBadge tone={hasResult ? "green" : "neutral"} data-testid={`ccv2-source-state-${source.id}`}>
                {hasResult ? "Anonimizált" : "Nyers forrás"}
              </AdminBadge>
            }
          />
          <div className="space-y-3 px-4 py-3">
            {hasResult ? (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Eredmény nézet">
                <AdminButton
                  size="sm"
                  variant={resultView === "ANONYMIZED" ? "primary" : "neutral"}
                  aria-pressed={resultView === "ANONYMIZED"}
                  onClick={() => setResultView("ANONYMIZED")}
                  data-testid={`ccv2-source-toggle-anonymized-${source.id}`}
                >
                  Anonimizált változat
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant={resultView === "RAW" ? "primary" : "neutral"}
                  aria-pressed={resultView === "RAW"}
                  onClick={() => setResultView("RAW")}
                  data-testid={`ccv2-source-toggle-raw-${source.id}`}
                >
                  Nyers forrás
                </AdminButton>
              </div>
            ) : null}

            {!hasResult || resultView === "RAW" ? (
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Nyers forrás</p>
                <p
                  data-testid={`ccv2-source-raw-${source.id}`}
                  className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[5px] border border-[rgba(22,32,26,0.10)] bg-[var(--adm-surface)] px-3 py-2 text-[12.5px] leading-5 text-[var(--adm-text)]"
                >
                  {source.rawText}
                </p>
                <p className="mt-1.5 text-[11px] text-[var(--adm-text-muted)]">
                  A mentett forrás szövege nem módosítható; javításhoz ments új forrást.
                </p>
              </div>
            ) : null}

            {hasResult && resultView === "ANONYMIZED" ? (
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-green-800)]">Anonimizált változat</p>
                <p
                  data-testid={`ccv2-source-anonymized-${source.id}`}
                  className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[5px] border border-[var(--adm-semantic-success-border)] bg-[var(--adm-semantic-success-soft)] px-3 py-2 text-[12.5px] leading-5 text-[var(--adm-text)]"
                >
                  {source.anonymizedText}
                </p>
                {typeof appliedCount === "number" ? (
                  <p className="mt-1.5 text-[11px] font-semibold text-[var(--adm-semantic-success)]" data-testid={`ccv2-source-applied-count-${source.id}`}>
                    {appliedCount} elem cserélve
                  </p>
                ) : null}
                {warnings.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {warnings.map((warning, index) => (
                      <li key={index} className="text-[11px] text-[var(--adm-semantic-warning)]">
                        {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </AdminPanel>

        {!hasResult ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {termsChangedSinceDetect && isReviewed ? (
              <p data-testid="ccv2-review-stale-note" className="min-w-0 flex-1 rounded-[5px] border border-[var(--adm-semantic-danger-border)] bg-[var(--adm-semantic-danger-soft)] px-3 py-2 text-[11.5px] text-[var(--adm-semantic-danger)]">
                A saját kifejezések módosultak az ellenőrzés óta. Futtasd újra az ellenőrzést, mielőtt alkalmaznád az anonimizálást.
              </p>
            ) : (
              <p className="text-[11px] text-[var(--adm-text-muted)]">
                {isReviewed ? "Csak a jóváhagyott elemek kerülnek lecserélésre." : "Az anonimizáláshoz futtasd az ellenőrzést, hagyd jóvá a jelölteket, majd alkalmazd."}
              </p>
            )}
            <AdminButton
              size="sm"
              variant="primary"
              disabled={isDetecting || applying}
              onClick={() => void handleDetect(source)}
              data-testid={`ccv2-source-detect-${source.id}`}
            >
              {isDetecting ? "Ellenőrzés…" : isReviewed ? "Ellenőrzés újrafuttatása" : "Ellenőrzés indítása"}
            </AdminButton>
          </div>
        ) : null}

        {detectError && detectError.sourceId === source.id ? (
          <p role="alert" data-testid="ccv2-detect-error" className={errorBoxClass}>
            {detectError.message}
          </p>
        ) : null}

        {applyError && applyError.sourceId === source.id ? (
          <p role="alert" data-testid="ccv2-stale-error" className={errorBoxClass}>
            {applyError.message}
          </p>
        ) : null}

        {!hasResult ? <ManualTermsEditor terms={manualTerms} onChange={setManualTerms} disabled={creating || applying} /> : null}

        {isReviewed ? (
          <div data-testid="ccv2-review" className="rounded-[8px] border border-[rgba(22,32,26,0.15)] bg-white">
            <div className="border-b border-[rgba(22,32,26,0.10)] px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-[var(--adm-text)]">Jelölt elemek — emberi ellenőrzés</p>
                <span className="text-[11.5px] font-semibold text-[var(--adm-text-muted)]" data-testid="ccv2-approved-count">
                  Jóváhagyva: {approvedCount} / {candidateCount}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AdminButton size="xs" variant="neutral" disabled={applying} onClick={handleSelectAll} data-testid="ccv2-select-all">
                  Összes kijelölése
                </AdminButton>
                <AdminButton size="xs" variant="neutral" disabled={applying || approvedCount === 0} onClick={handleClearSelection} data-testid="ccv2-clear-selection">
                  Kijelölés törlése
                </AdminButton>
              </div>
            </div>
            <CandidateReviewList
              candidates={review.candidates}
              rawText={source.rawText}
              approvedIds={review.approvedIds}
              onToggle={handleToggleCandidate}
              disabled={applying}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
              <p className="text-[11px] text-[var(--adm-text-muted)]">Csak a jóváhagyott elemek kerülnek lecserélésre.</p>
              <AdminButton
                size="sm"
                variant="primary"
                disabled={applying || termsChangedSinceDetect}
                onClick={handleApply}
                data-testid="ccv2-anonymize-apply"
              >
                {applying ? "Alkalmazás…" : "Jóváhagyott elemek alkalmazása"}
              </AdminButton>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mt-6" data-testid="case-context-v2">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-medium leading-tight text-[var(--adm-text)]">Kontextusforrások</h2>
          <p className="mt-1 max-w-2xl text-[11.5px] text-[var(--adm-text-muted)]">
            Az ügyhöz tartozó, feldolgozásra előkészített források.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton
            size="sm"
            variant="neutral"
            onClick={() => openCreateModal("COMMUNICATION")}
            data-testid="ccv2-source-mode-communication"
          >
            Kommunikációból
          </AdminButton>
          <AdminButton size="sm" variant="primary" onClick={() => openCreateModal("PASTE")} data-testid="ccv2-source-mode-paste">
            + Szöveg hozzáadása
          </AdminButton>
        </div>
      </div>

      {sourcesLoading ? (
        <div className="mt-4">
          <CompactState title="A források betöltése…" />
        </div>
      ) : sourcesError ? (
        <div className="mt-4">
          <SafePanelError detail={sourcesError} onRetry={() => void loadSources()} />
        </div>
      ) : sources.length === 0 ? (
        <div className="mt-4">
          <AdminPanel>
            <p data-testid="ccv2-sources-empty" className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">
              Ehhez az ügyhöz még nincs mentett kontextusforrás.
            </p>
          </AdminPanel>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ul
            data-testid="ccv2-sources-list"
            className="h-max divide-y divide-[var(--adm-border)] rounded-[8px] border border-[rgba(22,32,26,0.10)] bg-white"
          >
            {sources.map((source) => {
              const selected = source.id === selectedSourceId;
              const hasResult = source.anonymizedText !== null;
              return (
                <li key={source.id}>
                  <button
                    type="button"
                    data-testid={`ccv2-source-${source.id}`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => setSelectedSourceId(source.id)}
                    className={`w-full px-4 py-3 text-left ${selected ? "bg-[var(--adm-sage-100)]" : "hover:bg-[var(--adm-surface)]"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--adm-text)]">
                        {sourceTitle(source, communications)}
                      </span>
                      <span
                        className={`shrink-0 text-[10.5px] font-semibold ${hasResult ? "text-[var(--adm-semantic-success)]" : "text-[var(--adm-text-muted)]"}`}
                      >
                        {hasResult ? "Anonimizált" : "Nyers forrás"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--adm-text-muted)]">{formatDateTime(source.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {renderSourceDetail()}
        </div>
      )}

      <Modal
        open={createModal === "PASTE"}
        onClose={closeCreateModal}
        title="Szöveg hozzáadása"
        description="Illeszd be a szöveget, amelyet kontextusforrásként szeretnél menteni."
        maxWidth="lg"
        footer={
          <>
            <AdminButton size="sm" variant="neutral" onClick={closeCreateModal} disabled={creating}>
              Mégse
            </AdminButton>
            <AdminButton
              size="sm"
              variant="primary"
              disabled={creating || !pasteText.trim()}
              onClick={() => void handleCreatePasted()}
              data-testid="ccv2-create-source"
            >
              {creating ? "Mentés…" : "Forrás mentése"}
            </AdminButton>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Szöveg" help="A mentett forrás szövege nem módosítható; javításhoz ments új forrást.">
            <Textarea
              id="ccv2-paste-textarea"
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder="Illeszd ide a további ügykontextust…"
              rows={6}
              data-testid="ccv2-paste-textarea"
              className="resize-y"
            />
          </FormField>
          {createError ? (
            <p role="alert" data-testid="ccv2-create-error" className={errorBoxClass}>
              {createError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={createModal === "COMMUNICATION"}
        onClose={closeCreateModal}
        title="Kommunikációból"
        description="Vegyél át egy kapcsolt kommunikációt kontextusforrásként."
        maxWidth="lg"
        footer={
          <>
            <AdminButton size="sm" variant="neutral" onClick={closeCreateModal} disabled={creating}>
              Mégse
            </AdminButton>
            <AdminButton
              size="sm"
              variant="primary"
              disabled={creating || !selectedCommunicationId}
              onClick={() => void handleCreateFromCommunication()}
              data-testid="ccv2-create-from-communication"
            >
              {creating ? "Átvétel…" : "Átvétel forrásként"}
            </AdminButton>
          </>
        }
      >
        {communicationsLoading ? (
          <p className="text-[12px] text-[var(--adm-text-muted)]">A kapcsolt kommunikáció betöltése…</p>
        ) : communicationsError ? (
          <div className="space-y-3" data-testid="ccv2-communications-error">
            <p className="text-[12px] text-[var(--adm-text)]">A kommunikációk most nem tölthetők be.</p>
            <AdminButton size="sm" variant="neutral" onClick={() => void loadCommunications()} data-testid="ccv2-communications-retry">
              Újrapróbálom
            </AdminButton>
          </div>
        ) : communications.length === 0 ? (
          <p data-testid="ccv2-communications-empty" className="text-[12px] text-[var(--adm-text-muted)]">
            Ehhez az ügyhöz nincs átvehető kommunikáció.
          </p>
        ) : (
          <div className="space-y-3">
            <FormField label="Kommunikáció">
              <Select
                id="ccv2-communication-select"
                value={selectedCommunicationId}
                onChange={(event) => setSelectedCommunicationId(event.target.value)}
                data-testid="ccv2-communication-select"
              >
                <option value="">Válassz kommunikációt…</option>
                {communications.map((communication) => (
                  <option key={communication.id} value={communication.id}>
                    {[communication.subject || "Nincs tárgy", communication.sender, communication.timestamp ? formatDateTime(communication.timestamp) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </Select>
            </FormField>
            {createError ? (
              <p role="alert" data-testid="ccv2-create-error" className={errorBoxClass}>
                {createError}
              </p>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal
        open={zeroApprovalOpen}
        onClose={() => setZeroApprovalOpen(false)}
        title="Egy elemet sem hagytál jóvá."
        maxWidth="md"
        footer={
          <>
            <AdminButton size="sm" variant="neutral" onClick={() => setZeroApprovalOpen(false)} data-testid="ccv2-zero-approval-cancel">
              Vissza az ellenőrzéshez
            </AdminButton>
            <AdminButton size="sm" variant="primary" onClick={confirmZeroApproval} disabled={applying} data-testid="ccv2-zero-approval-confirm">
              Folytatás változatlan szöveggel
            </AdminButton>
          </>
        }
      >
        <p className="text-[13px] leading-6 text-[var(--adm-text)]" data-testid="ccv2-zero-approval-body">
          A létrejövő változat megegyezik a nyers szöveggel. Biztosan így szeretnéd lezárni az ellenőrzést?
        </p>
      </Modal>
    </div>
  );
}
