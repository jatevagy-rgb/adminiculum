"use client";

/**
 * Case Context V2 — "További kontextus" additive surface.
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
 * The V1 Kontextus surface (CaseContextView) is untouched; this section renders
 * below it on the same route.
 */

import React, { useCallback, useEffect, useState } from "react";
import { ApiError, getCaseWorkspace, type CaseWorkspace } from "@/lib/api";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader } from "@/components/adminiculum/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import {
  STALE_REVIEW_CODES,
  anonymizeCaseContextSource,
  categoryLabel,
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

type ReviewState = {
  sourceId: string;
  sourceHash: string;
  optionsDigest: string;
  candidates: ReviewCandidate[];
  approvedIds: ReadonlySet<string>;
  termsAtDetect: ManualSensitiveTerm[];
};

const inputClass =
  "w-full rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-3 py-1.5 text-[12px] text-[var(--adm-text)] placeholder-[var(--adm-text-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-brand-green)]";

const errorBoxClass =
  "rounded-[5px] border border-[var(--adm-semantic-danger-border)] bg-[var(--adm-semantic-danger-soft)] px-3 py-2 text-[12px] text-[var(--adm-semantic-danger)]";

const STALE_REVIEW_MESSAGE =
  "A felülvizsgálat elavult: a forrás vagy a detektálási beállítások időközben megváltoztak. Futtasd újra a Detektálást, és hagyd jóvá újra a jelölteket.";

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

export function CaseContextV2({ caseId }: { caseId: string }) {
  const [sources, setSources] = useState<CaseContextSourceDTO[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  const [communications, setCommunications] = useState<CaseWorkspace["communications"]>([]);
  const [communicationsLoading, setCommunicationsLoading] = useState(true);

  const [sourceMode, setSourceMode] = useState<SourceMode>("PASTE");
  const [pasteText, setPasteText] = useState("");
  const [selectedCommunicationId, setSelectedCommunicationId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [manualTerms, setManualTerms] = useState<ManualSensitiveTerm[]>([]);

  const [review, setReview] = useState<ReviewState | null>(null);
  const [detectingSourceId, setDetectingSourceId] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

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
    try {
      const workspace = await getCaseWorkspace(caseId);
      setCommunications(workspace.communications ?? []);
    } catch {
      setCommunications([]);
    } finally {
      setCommunicationsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadSources();
    void loadCommunications();
  }, [loadSources, loadCommunications]);

  const handleCreatePasted = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      if (!pasteText.trim()) {
        setCreateError("A beillesztett szöveg üres vagy csak szóközökből áll. Írj be szöveget a mentéshez.");
        return;
      }
      await createPastedCaseContextSource(caseId, pasteText);
      setPasteText("");
      await loadSources();
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
      await createCommunicationCaseContextSource(caseId, selectedCommunicationId);
      setSelectedCommunicationId("");
      await loadSources();
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
    } catch {
      setDetectError("A detektálás most nem sikerült. Próbáld újra.");
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

  const handleApply = async () => {
    if (!review) return;
    setApplying(true);
    setApplyError(null);
    try {
      await anonymizeCaseContextSource(caseId, review.sourceId, {
        sourceHash: review.sourceHash,
        optionsDigest: review.optionsDigest,
        manualTerms: review.termsAtDetect,
        approvedCandidateIds: [...review.approvedIds],
      });
      setReview(null);
      await loadSources();
    } catch (error) {
      if (error instanceof ApiError && STALE_REVIEW_CODES.has(String(error.code ?? ""))) {
        setReview(null);
        setApplyError(STALE_REVIEW_MESSAGE);
      } else {
        setApplyError("Az anonimizálás most nem sikerült. Próbáld újra.");
      }
    } finally {
      setApplying(false);
    }
  };

  const termsChangedSinceDetect = review !== null && !sameTerms(manualTerms, review.termsAtDetect);

  return (
    <div className="mt-6 space-y-5" data-testid="case-context-v2">
      <AdminPanel data-testid="ccv2-create-panel">
        <AdminSectionHeader
          eyebrow="Kontextus V2"
          title="További kontextus"
          subtitle="Illessz be további ügykontextust, vagy vegyél át egy kapcsolt kommunikációt forrásként. A detektálás és az anonimizálás belső, determinisztikus folyamat — külső AI-szolgáltatás nem vesz részt benne."
        />
        <div className="space-y-4 px-4 py-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Forrás típusa">
            <AdminButton
              size="sm"
              variant={sourceMode === "PASTE" ? "primary" : "neutral"}
              onClick={() => setSourceMode("PASTE")}
              data-testid="ccv2-source-mode-paste"
              role="tab"
              aria-selected={sourceMode === "PASTE"}
            >
              Szöveg beillesztése
            </AdminButton>
            <AdminButton
              size="sm"
              variant={sourceMode === "COMMUNICATION" ? "primary" : "neutral"}
              onClick={() => setSourceMode("COMMUNICATION")}
              data-testid="ccv2-source-mode-communication"
              role="tab"
              aria-selected={sourceMode === "COMMUNICATION"}
            >
              Kommunikációból
            </AdminButton>
          </div>

          {sourceMode === "PASTE" ? (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="Illeszd ide a további ügykontextust…"
                rows={6}
                data-testid="ccv2-paste-textarea"
                className={`${inputClass} resize-y`}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-[var(--adm-text-muted)]">
                  A mentett forrás szövege nem módosítható; javításhoz ments új forrást.
                </p>
                <AdminButton
                  size="sm"
                  variant="primary"
                  disabled={creating || !pasteText.trim()}
                  onClick={() => void handleCreatePasted()}
                  data-testid="ccv2-create-source"
                >
                  {creating ? "Mentés…" : "Forrás mentése"}
                </AdminButton>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {communicationsLoading ? (
                <p className="text-[12px] text-[var(--adm-text-muted)]">A kapcsolt kommunikáció betöltése…</p>
              ) : communications.length === 0 ? (
                <p data-testid="ccv2-communications-empty" className="text-[12px] text-[var(--adm-text-muted)]">
                  Ehhez az ügyhöz nincs kapcsolt kommunikáció, amelyet forrásként át lehetne venni.
                </p>
              ) : (
                <>
                  <select
                    value={selectedCommunicationId}
                    onChange={(event) => setSelectedCommunicationId(event.target.value)}
                    data-testid="ccv2-communication-select"
                    className={inputClass}
                  >
                    <option value="">Válassz kommunikációt…</option>
                    {communications.map((communication) => (
                      <option key={communication.id} value={communication.id}>
                        {[communication.subject || "Nincs tárgy", communication.sender, communication.timestamp ? formatDateTime(communication.timestamp) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-[var(--adm-text-muted)]">
                      A törzsszöveget a szerver veszi át a kiválasztott kommunikációból; a forrás hivatkozással őrzi meg annak eredetét.
                    </p>
                    <AdminButton
                      size="sm"
                      variant="primary"
                      disabled={creating || !selectedCommunicationId}
                      onClick={() => void handleCreateFromCommunication()}
                      data-testid="ccv2-create-from-communication"
                    >
                      {creating ? "Átvétel…" : "Átvétel forrásként"}
                    </AdminButton>
                  </div>
                </>
              )}
            </div>
          )}

          {createError ? (
            <p role="alert" data-testid="ccv2-create-error" className={errorBoxClass}>
              {createError}
            </p>
          ) : null}
        </div>
      </AdminPanel>

      <ManualTermsEditor terms={manualTerms} onChange={setManualTerms} disabled={creating || applying} />

      {sourcesLoading ? (
        <CompactState title="A mentett források betöltése…" />
      ) : sourcesError ? (
        <SafePanelError detail={sourcesError} onRetry={() => void loadSources()} />
      ) : sources.length === 0 ? (
        <AdminPanel>
          <p data-testid="ccv2-sources-empty" className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">
            Ehhez az ügyhöz még nincs mentett további kontextusforrás.
          </p>
        </AdminPanel>
      ) : (
        <div className="space-y-4" data-testid="ccv2-sources-list">
          {sources.map((source) => {
            const isReviewed = review?.sourceId === source.id;
            const approvedCount = review?.approvedIds.size ?? 0;
            const candidateCount = review?.candidates.length ?? 0;
            return (
              <AdminPanel key={source.id} data-testid={`ccv2-source-${source.id}`}>
                <AdminSectionHeader
                  title={source.origin === "COMMUNICATION" ? "Kommunikációból átvett forrás" : "Beillesztett forrás"}
                  subtitle={`Mentve: ${formatDateTime(source.createdAt)}${source.createdBy ? ` · ${source.createdBy.name}` : ""}`}
                  action={
                    <div className="flex shrink-0 items-center gap-2">
                      {source.anonymizedText !== null ? <AdminBadge tone="green">Anonimizálva</AdminBadge> : <AdminBadge tone="neutral">Nyers</AdminBadge>}
                      <AdminBadge tone={source.origin === "COMMUNICATION" ? "blue" : "gold"}>
                        {source.origin === "COMMUNICATION" ? "Kommunikáció" : "Beillesztés"}
                      </AdminBadge>
                    </div>
                  }
                />
                <div className="space-y-4 px-4 py-3">
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Eredeti forrásszöveg</p>
                    <p
                      data-testid={`ccv2-source-raw-${source.id}`}
                      className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-[5px] border border-[rgba(22,32,26,0.10)] bg-[var(--adm-surface)] px-3 py-2 text-[12.5px] leading-5 text-[var(--adm-text)]"
                    >
                      {source.rawText}
                    </p>
                  </div>

                  {source.anonymizedText !== null ? (
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-green-800)]">Anonimizált változat</p>
                      <p
                        data-testid={`ccv2-source-anonymized-${source.id}`}
                        className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-[5px] border border-[var(--adm-semantic-success-border)] bg-[var(--adm-semantic-success-soft)] px-3 py-2 text-[12.5px] leading-5 text-[var(--adm-text)]"
                      >
                        {source.anonymizedText}
                      </p>
                      {source.anonymizationSnapshot ? (
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--adm-text-muted)]" data-testid={`ccv2-source-snapshot-${source.id}`}>
                          <span>Lecserélt elemek: {source.anonymizationSnapshot.appliedCount}</span>
                          {Object.entries(source.anonymizationSnapshot.categoryCounts)
                            .filter(([, count]) => count > 0)
                            .map(([category, count]) => (
                              <span key={category}>
                                {categoryLabel(category as Parameters<typeof categoryLabel>[0])}: {count}
                              </span>
                            ))}
                          <span>Helyettesítés: memóriában, nem visszafejthetően tárolva</span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-[var(--adm-text-muted)]">
                        Az anonimizáláshoz futtasd a Detektálást, hagyd jóvá a jelölteket, majd alkalmazd az anonimizálást.
                      </p>
                      <AdminButton
                        size="sm"
                        variant="gold"
                        disabled={detectingSourceId === source.id || applying}
                        onClick={() => void handleDetect(source)}
                        data-testid={`ccv2-source-detect-${source.id}`}
                      >
                        {detectingSourceId === source.id ? "Detektálás…" : "Detektálás"}
                      </AdminButton>
                    </div>
                  )}

                  {isReviewed ? (
                    <div data-testid="ccv2-review" className="rounded-[5px] border border-[rgba(22,32,26,0.15)]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(22,32,26,0.10)] px-4 py-2.5">
                        <p className="text-[12.5px] font-semibold text-[var(--adm-text)]">
                          Felülvizsgálat — jelöltek áttekintése
                        </p>
                        <span className="text-[11.5px] font-semibold text-[var(--adm-text-muted)]" data-testid="ccv2-approved-count">
                          Jóváhagyva: {approvedCount} / {candidateCount}
                        </span>
                      </div>
                      <CandidateReviewList
                        candidates={review.candidates}
                        rawText={source.rawText}
                        approvedIds={review.approvedIds}
                        onToggle={handleToggleCandidate}
                        disabled={applying}
                      />
                      <div className="space-y-2 border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
                        {termsChangedSinceDetect ? (
                          <p data-testid="ccv2-review-stale-note" className="rounded-[5px] border border-[var(--adm-semantic-danger-border)] bg-[var(--adm-semantic-danger-soft)] px-3 py-2 text-[11.5px] text-[var(--adm-semantic-danger)]">
                            A manuális kifejezések módosultak a detektálás óta. Futtasd újra a Detektálást, mielőtt alkalmaznád az anonimizálást.
                          </p>
                        ) : null}
                        <p className="text-[11px] text-[var(--adm-text-muted)]">
                          Csak a kifejezetten jóváhagyott jelöltek kerülnek alkalmazásra; a nem jóváhagyottak érintetlenül maradnak a szövegben.
                        </p>
                        <AdminButton
                          size="sm"
                          variant="primary"
                          disabled={applying || termsChangedSinceDetect}
                          onClick={() => void handleApply()}
                          data-testid="ccv2-anonymize-apply"
                        >
                          {applying ? "Anonimizálás…" : "Anonimizálás alkalmazása"}
                        </AdminButton>
                      </div>
                    </div>
                  ) : null}
                </div>
              </AdminPanel>
            );
          })}
        </div>
      )}

      {detectError ? (
        <p role="alert" data-testid="ccv2-detect-error" className={errorBoxClass}>
          {detectError}
        </p>
      ) : null}

      {applyError ? (
        <p role="alert" data-testid="ccv2-stale-error" className={errorBoxClass}>
          {applyError}
        </p>
      ) : null}
    </div>
  );
}
