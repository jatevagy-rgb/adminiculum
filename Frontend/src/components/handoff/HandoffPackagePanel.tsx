"use client";

import { useState, useEffect } from "react";
import {
  ApiError,
  archiveHandoffPackage,
  getCaseResponsibility,
  getCurrentUser,
  listCaseHandoffPackages,
  reviewHandoffPackage,
  updateHandoffPackage,
  type LawyerHandoffDecision,
  type LawyerHandoffPackageRecord,
  type LawyerHandoffStatus,
} from "@/lib/api";

type HandoffPackagePanelProps = {
  caseId: string;
  mode: "legacy-continuation";
  refreshKey?: number;
  compact?: boolean;
};

const STATUS_LABELS: Record<LawyerHandoffStatus, string> = {
  DRAFT: "Piszkozat",
  PREPARED: "Előkészítve",
  SUBMITTED: "Beküldve",
  IN_REVIEW: "Review alatt",
  APPROVED: "Jóváhagyva",
  REJECTED: "Visszaküldve",
  ARCHIVED: "Archiválva",
};

function getStatusColor(status: LawyerHandoffStatus): string {
  switch (status) {
    case "APPROVED":
      return "bg-[var(--adm-sage-100)] text-[var(--adm-green-800)]";
    case "REJECTED":
      return "bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)]";
    case "IN_REVIEW":
      return "bg-[#e4e2e1] text-[#656464]";
    case "SUBMITTED":
      return "bg-[#e4e2e1] text-[#656464]";
    case "ARCHIVED":
      return "bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)]";
    case "PREPARED":
      return "bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)]";
    case "DRAFT":
    default:
      return "bg-[#f5f3ee] text-[#434843]";
  }
}

function getStatusLabel(status: LawyerHandoffStatus): string {
  return STATUS_LABELS[status] ?? "Ismeretlen állapot";
}

function getMissingItems(pkg: LawyerHandoffPackageRecord): string[] {
  const missing: string[] = [];
  if (!pkg.sourceDocumentId && !pkg.generatedContractId) {
    missing.push("forrásdokumentum vagy generált dokumentum");
  }
  if (!pkg.legalAnalysisId) {
    missing.push("jogi elemzés");
  }
  if (!pkg.preparerSummary?.trim()) {
    missing.push("előkészítő összefoglaló");
  }
  return missing;
}

function getNextAction(pkg: LawyerHandoffPackageRecord): string {
  switch (pkg.status) {
    case "DRAFT": {
      const missing = getMissingItems(pkg);
      if (missing.length > 0) {
        return "Egészítsd ki a Leadást, majd küldd be ügyvédi review-ra.";
      }
      return "Beküldhető ügyvédi review-ra.";
    }
    case "PREPARED":
      return "Beküldhető ügyvédi review-ra.";
    case "SUBMITTED":
      return "Várakozik ügyvédi review-ra.";
    case "IN_REVIEW":
      return "Ügyvédi review folyamatban.";
    case "APPROVED":
      return "A Leadás ügyvéd által jóváhagyva.";
    case "REJECTED":
      return "A Leadás javításra visszaküldve.";
    case "ARCHIVED":
      return "Archivált Leadás.";
    default:
      return "";
  }
}

function getHandoffErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Jogosultság hiányzik a Leadás művelethez.";
    if (error.status === 501) return "A funkció jelenleg nem elérhető ebben a környezetben.";
    if (error.status === 404) return "A Leadás vagy a kapcsolódó ügy nem található.";
  }
  return "A művelet nem sikerült. Próbáld újra később.";
}

const REVIEW_DECISION_LABELS: Record<LawyerHandoffDecision, string> = {
  APPROVED: "Jóváhagyva",
  REJECTED_NEEDS_REVISION: "Visszaküldve javításra",
  REJECTED_BLOCKING: "Visszaküldve blokkoló okkal",
};

const REVIEW_PRIVILEGED_ROLES = new Set(["ADMIN", "PARTNER"]);
const REVIEWER_ROLES = new Set(["LAWYER", "COLLAB_LAWYER"]);

function isReviewableStatus(status: LawyerHandoffStatus): boolean {
  return status === "SUBMITTED" || status === "IN_REVIEW";
}

/**
 * Mirrors the backend `requireHandoffReviewAccess` gate so the decision actions
 * are only offered to an authorised reviewer. The backend remains authoritative.
 */
function canReviewerDecide(params: {
  currentUserId: string | null;
  currentUserRole: string | null;
  assignedLawyerId: string | null;
  preparedById?: string | null;
}): boolean {
  const { currentUserId, currentUserRole, assignedLawyerId, preparedById } = params;
  if (!currentUserId) return false;
  if (preparedById && preparedById === currentUserId) return false;
  const role = (currentUserRole || "").toUpperCase();
  if (REVIEW_PRIVILEGED_ROLES.has(role)) return true;
  return Boolean(assignedLawyerId && assignedLawyerId === currentUserId && REVIEWER_ROLES.has(role));
}

function getReviewErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "HANDOFF_SELF_REVIEW_FORBIDDEN") {
      return "A saját Leadásod nem hagyhatod jóvá és nem küldheted vissza.";
    }
    if (error.code === "HANDOFF_REVIEW_FORBIDDEN") {
      return "Nincs jogosultságod ehhez az ügyvédi döntéshez.";
    }
    if (error.code === "REVIEW_COMMENT_REQUIRED") {
      return "Visszaküldéshez reviewer megjegyzés szükséges.";
    }
    if (error.code === "REVIEW_ALREADY_DECIDED") {
      return "Erről a Leadásról már született ügyvédi döntés.";
    }
    if (error.code === "HANDOFF_NOT_READY") {
      return "A Leadás még nem küldhető review-ra.";
    }
    if (error.status === 403) return "Nincs jogosultságod ehhez az ügyvédi döntéshez.";
    if (error.status === 501) return "A funkció jelenleg nem elérhető ebben a környezetben.";
    if (error.status === 404) return "A Leadás vagy a kapcsolódó ügy nem található.";
  }
  return "A döntés rögzítése nem sikerült. Próbáld újra később.";
}

export function HandoffPackagePanel({
  caseId,
  mode,
  refreshKey = 0,
  compact = false,
}: HandoffPackagePanelProps) {
  const [packages, setPackages] = useState<LawyerHandoffPackageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [submittingPackageId, setSubmittingPackageId] = useState<string | null>(null);
  const [archivingPackageId, setArchivingPackageId] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [assignedLawyerId, setAssignedLawyerId] = useState<string | null>(null);
  const [reviewPackageId, setReviewPackageId] = useState<string | null>(null);
  const [reviewCommentDraft, setReviewCommentDraft] = useState("");
  const [reviewDecisionInFlight, setReviewDecisionInFlight] = useState<LawyerHandoffDecision | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);


  useEffect(() => {
    if (!caseId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setPackages([]);

    listCaseHandoffPackages(caseId, { includeArchived: true })
      .then((data) => {
        if (!cancelled) {
          setPackages(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getHandoffErrorMessage(err));
          console.error("listCaseHandoffPackages error:", err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, refreshKey]);

  useEffect(() => {
    if (!caseId) {
      setCurrentUserId(null);
      setCurrentUserRole(null);
      setAssignedLawyerId(null);
      return;
    }

    let cancelled = false;
    setCurrentUserId(null);
    setCurrentUserRole(null);
    setAssignedLawyerId(null);

    void Promise.allSettled([getCurrentUser(), getCaseResponsibility(caseId)]).then(
      ([userResult, responsibilityResult]) => {
        if (cancelled) return;
        if (userResult.status === "fulfilled") {
          setCurrentUserId(userResult.value?.id || null);
          setCurrentUserRole(userResult.value?.role || null);
        } else {
          console.error("Handoff reviewer identity load failed:", userResult.reason);
        }
        if (responsibilityResult.status === "fulfilled") {
          setAssignedLawyerId(responsibilityResult.value?.responsibleLawyer?.id || null);
        } else {
          console.error("Handoff case responsibility load failed:", responsibilityResult.reason);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [caseId, refreshKey]);

  const startEditing = (pkg: LawyerHandoffPackageRecord) => {
    setEditingPackageId(pkg.id);
    setSummaryDraft(pkg.preparerSummary || "");
    setSummaryMessage(null);
    setSummaryError(null);
  };

  const cancelEditing = () => {
    setEditingPackageId(null);
    setSummaryDraft("");
    setSummaryMessage(null);
    setSummaryError(null);
  };

  const handleSaveSummary = async (pkgId: string) => {
    setIsSavingSummary(true);
    setSummaryMessage(null);
    setSummaryError(null);
    try {
      const updated = await updateHandoffPackage(pkgId, { preparerSummary: summaryDraft });
      setPackages((prev) => prev.map((p) => (p.id === pkgId ? updated : p)));
      setEditingPackageId(null);
      setSummaryDraft("");
      setSummaryMessage("Előkészítő összefoglaló mentve.");
    } catch (err) {
      setSummaryError(getHandoffErrorMessage(err));
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleSubmitForReview = async (pkgId: string) => {
    setSummaryMessage(null);
    setSummaryError(null);
    setSubmittingPackageId(pkgId);
    try {
      const updated = await updateHandoffPackage(pkgId, { status: "SUBMITTED" });
      setPackages((prev) => prev.map((p) => (p.id === pkgId ? updated : p)));
      setSummaryMessage("Leadás beküldve ügyvédi review-ra.");
    } catch (err) {
      setSummaryError(getHandoffErrorMessage(err));
    } finally {
      setSubmittingPackageId(null);
    }
  };

  const handleArchivePackage = async (pkg: LawyerHandoffPackageRecord) => {
    const confirmed = window.confirm(
      "Archiválod ezt a korábbi Leadást? A rekord és minden hivatkozása megmarad az előzményekben, de kikerül az aktív munkából. Ez megváltoztathatja az ügy lezárhatóságát."
    );
    if (!confirmed) return;

    setArchivingPackageId(pkg.id);
    setSummaryMessage(null);
    setSummaryError(null);
    try {
      const archived = await archiveHandoffPackage(pkg.id);
      setPackages((prev) => prev.map((item) => item.id === pkg.id ? archived : item));
      setSummaryMessage("Leadás archiválva. A rekord az előzményekben továbbra is olvasható; az aktív munkát és az ügy lezárhatóságát már nem blokkolja.");
    } catch (err) {
      setSummaryError(getHandoffErrorMessage(err));
    } finally {
      setArchivingPackageId(null);
    }
  };

  const openReviewForm = (pkgId: string) => {
    setReviewPackageId(pkgId);
    setReviewCommentDraft("");
    setReviewError(null);
    setReviewFeedback(null);
  };

  const cancelReviewForm = () => {
    setReviewPackageId(null);
    setReviewCommentDraft("");
    setReviewError(null);
  };

  const handleReviewDecision = async (
    pkg: LawyerHandoffPackageRecord,
    decision: LawyerHandoffDecision
  ) => {
    const comment = reviewCommentDraft.trim();
    if (decision !== "APPROVED" && !comment) {
      setReviewError("Visszaküldéshez reviewer megjegyzés szükséges.");
      return;
    }

    setReviewError(null);
    setReviewFeedback(null);
    setReviewDecisionInFlight(decision);
    try {
      const updated = await reviewHandoffPackage(pkg.id, {
        decision,
        reviewComment: comment || undefined,
      });
      setPackages((prev) =>
        prev.map((item) => (item.id === pkg.id ? updated : item))
      );
      setReviewPackageId(null);
      setReviewCommentDraft("");
      setReviewFeedback(
        decision === "APPROVED"
          ? "Leadás jóváhagyva. A döntés a Leadás adatlapján megmarad."
          : "Leadás visszaküldve javításra. A reviewer megjegyzés a Leadás adatlapján megmarad."
      );
    } catch (err) {
      setReviewError(getReviewErrorMessage(err));
    } finally {
      setReviewDecisionInFlight(null);
    }
  };

  const canSubmit = (pkg: LawyerHandoffPackageRecord): boolean => {
    return pkg.status === "DRAFT" || pkg.status === "PREPARED";
  };

  const isSubmitDisabled = (pkg: LawyerHandoffPackageRecord): boolean => {
    return (
      !pkg.preparerSummary?.trim() ||
      (!pkg.sourceDocumentId && !pkg.generatedContractId)
    );
  };

  return (
    <section
      className={compact ? "min-w-0 w-full space-y-3 [overflow-wrap:anywhere]" : "adm-board-panel min-w-0 p-4 [overflow-wrap:anywhere]"}
      aria-label="Korábbi leadások"
      data-testid="legacy-handoff-history"
      data-mode={mode}
    >
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
        <span className="material-symbols-outlined text-lg text-[var(--adm-green-950)] hidden">folder_special</span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--adm-green-950)]">
          Korábbi leadások
        </h3>
        <span className="rounded-full border border-[#D8C58E] bg-[var(--adm-sand-100)] px-2.5 py-1 text-[10px] font-semibold text-[#6D5418]">
          {packages.length} korábbi rekord
        </span>
      </div>
      <p className="mb-3 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-ivory-100)] px-3 py-2 text-[11px] leading-4 text-[var(--adm-text-muted)]">
        Itt kizárólag a korábban létrehozott leadások folytathatók és olvashatók vissza. Új Leadást az ügy feladatainál lehet indítani. Az archivált rekordok is megmaradnak.
      </p>
      {summaryMessage ? <p role="status" className="mb-3 text-sm text-[var(--adm-green-800)]">{summaryMessage}</p> : null}
      {summaryError ? <p role="alert" className="mb-3 text-sm text-[var(--adm-terracotta-700)]">{summaryError}</p> : null}

      {reviewFeedback ? (
        <p className="mb-3 rounded-[var(--adm-radius-sm)] border border-[var(--adm-green-800)] bg-[var(--adm-sage-100)] px-3 py-2 text-[10px] font-semibold text-[var(--adm-green-800)]">
          {reviewFeedback}
        </p>
      ) : null}

      {isLoading && (
        <p role="status" className="text-sm text-[var(--adm-text-muted)] py-2">Korábbi leadások betöltése…</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--adm-terracotta-700)] py-2">{error}</p>
      )}

      {!isLoading && !error && packages.length === 0 && (
        <div className="adm-board-empty px-4 py-4 text-center">
          <p className="text-[12px] font-semibold text-[var(--adm-text)]">
            Nincs korábbi Leadás ehhez az ügyhöz.
          </p>
          <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">
            Új munkához válassz feladatot az ügy feladatai között.
          </p>
        </div>
      )}

      {!isLoading && !error && packages.length > 0 && (
        <div className="space-y-3">
          {packages.map((pkg) => {
            const pkgMissing = getMissingItems(pkg);
            const hasMissingMandatory = pkgMissing.length > 0;
            const canPkgSubmit = canSubmit(pkg);
            const submitDisabled = isSubmitDisabled(pkg);
            const nextAction = getNextAction(pkg);
            const isPreparer = Boolean(currentUserId && pkg.preparedById === currentUserId);
            const canWrite = Boolean(currentUserId && (isPreparer || REVIEW_PRIVILEGED_ROLES.has((currentUserRole || "").toUpperCase())));
            const canDecide = canReviewerDecide({
              currentUserId,
              currentUserRole,
              assignedLawyerId,
              preparedById: pkg.preparedById,
            });
            const underReview = isReviewableStatus(pkg.status);
            const isReviewSubmitting = reviewDecisionInFlight !== null;

            return (
              <div
                key={pkg.id}
                data-testid="legacy-handoff-record"
                data-status={pkg.status}
                className="adm-board-list-row p-3.5"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs font-bold text-[var(--adm-green-950)]">
                    Leadás
                  </p>
                  <span
                    className={`text-[8px] px-1.5 py-0.5 font-bold uppercase tracking-widest shrink-0 ${getStatusColor(pkg.status)}`}
                  >
                    {getStatusLabel(pkg.status)}
                  </span>
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-3 text-[9px] text-[var(--adm-text-muted)]">
                  <span className="px-1.5 py-0.5 rounded bg-[var(--adm-ivory-100)] border border-[var(--adm-border)]">Azonosító: {pkg.id.slice(0, 8)}</span>
                  <span>Létrehozva: {pkg.createdAt ? new Date(pkg.createdAt).toLocaleDateString("hu-HU") : "—"}</span>
                  <span>Frissítve: {pkg.updatedAt ? new Date(pkg.updatedAt).toLocaleDateString("hu-HU") : "—"}</span>
                </div>

                {/* Leadás tartalma */}
                <div className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-[#FAFAF8] p-3 mb-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--adm-text-muted)] mb-1">Leadás tartalma</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[var(--adm-text-muted)]">Forrásdokumentum</span>
                      {pkg.sourceDocumentId ? (
                        <span className="text-[9px] text-[var(--adm-green-800)] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[var(--adm-terracotta-700)]">Hiányzik</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[var(--adm-text-muted)]">Anonimizált szöveg</span>
                      {pkg.anonymizedDocumentId ? (
                        <span className="text-[9px] text-[var(--adm-green-800)] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[var(--adm-text-muted)]">Nincs csatolva</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[var(--adm-text-muted)]">Módosított munkapéldány</span>
                      {pkg.generatedContractId ? (
                        <span className="text-[9px] text-[var(--adm-green-800)] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[var(--adm-text-muted)]">Nincs csatolva</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[var(--adm-text-muted)]">Jogi elemzés</span>
                      {pkg.legalAnalysisId ? (
                        <span className="text-[9px] text-[var(--adm-green-800)] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[var(--adm-terracotta-700)]">Hiányzik</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[var(--adm-text-muted)]">Ügyvédi review jegyzetek</span>
                      {pkg.reviewNotesId ? (
                        <span className="text-[9px] text-[var(--adm-green-800)] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[var(--adm-text-muted)]">Nincs csatolva</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[var(--adm-text-muted)]">Előkészítő összefoglaló</span>
                      {pkg.preparerSummary?.trim() ? (
                        <span className="text-[9px] text-[var(--adm-green-800)] font-bold">Megadva</span>
                      ) : (
                        <span className="text-[9px] text-[var(--adm-terracotta-700)]">Hiányzik</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Missing items / completeness helper */}
                {canPkgSubmit && hasMissingMandatory && (
                  <p className="text-[9px] text-[var(--adm-terracotta-700)] mb-1">
                    Beküldés előtt érdemes pótolni: {pkgMissing.join(", ")}.
                  </p>
                )}
                {canPkgSubmit && !hasMissingMandatory && (
                  <p className="text-[9px] text-[var(--adm-green-800)] font-bold mb-1">
                    A Leadás alapadatai beküldésre előkészítve.
                  </p>
                )}

                {/* Következő lépés */}
                <p className="text-[9px] text-[var(--adm-text-muted)] italic mb-2">Következő lépés: {nextAction}</p>

                {underReview ? (
                  <div className="mb-2 rounded-[var(--adm-radius-md)] border border-[#D8C58E] bg-[var(--adm-sand-100)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#6D5418]">Ügyvédi review</p>
                      <span className="text-[9px] text-[#6D5418]">
                        {pkg.packageType === "FINAL_APPROVAL" ? "Végleges jóváhagyás" : "Standard leadás"}
                      </span>
                    </div>
                    <p className="mt-1 text-[9px] text-[var(--adm-text-muted)]">
                      Beküldve: {pkg.submittedAt ? new Date(pkg.submittedAt).toLocaleString("hu-HU") : "—"}
                    </p>
                    {pkg.preparerSummary?.trim() ? (
                      <p className="mt-1 whitespace-pre-wrap text-[9px] text-[var(--adm-text-muted)]">
                        Előkészítő összefoglaló: {pkg.preparerSummary}
                      </p>
                    ) : null}

                    {canDecide ? (
                      reviewPackageId === pkg.id ? (
                        <div className="mt-2 border-t border-[#D8C58E] pt-2">
                          <label
                            htmlFor={`handoff-review-comment-${pkg.id}`}
                            className="text-[9px] font-semibold text-[var(--adm-text)]"
                          >
                            Reviewer megjegyzés (visszaküldésnél kötelező, jóváhagyásnál nem kötelező)
                          </label>
                          <textarea
                            id={`handoff-review-comment-${pkg.id}`}
                            value={reviewCommentDraft}
                            onChange={(event) => setReviewCommentDraft(event.target.value)}
                            rows={3}
                            placeholder="Írd le a döntés indokát, a szükséges javításokat vagy a jóváhagyás megjegyzését."
                            className="adm-board-field mt-1 w-full resize-none px-2 py-1.5 text-[10px] placeholder:text-[var(--adm-text-muted)]"
                          />
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleReviewDecision(pkg, "APPROVED")}
                              disabled={isReviewSubmitting}
                              className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {reviewDecisionInFlight === "APPROVED" ? "Rögzítés..." : "Jóváhagyás"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewDecision(pkg, "REJECTED_NEEDS_REVISION")}
                              disabled={isReviewSubmitting || !reviewCommentDraft.trim()}
                              className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[var(--adm-terracotta-700)] text-[var(--adm-ivory-50)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {reviewDecisionInFlight === "REJECTED_NEEDS_REVISION" ? "Rögzítés..." : "Visszaküldés javításra"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewDecision(pkg, "REJECTED_BLOCKING")}
                              disabled={isReviewSubmitting || !reviewCommentDraft.trim()}
                              className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-terracotta-700)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--adm-terracotta-700)] hover:bg-[#f7ece9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {reviewDecisionInFlight === "REJECTED_BLOCKING" ? "Rögzítés..." : "Visszaküldés blokkoló okkal"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelReviewForm}
                              disabled={isReviewSubmitting}
                              className="text-[9px] font-bold uppercase tracking-widest text-[var(--adm-text-muted)] hover:underline disabled:opacity-50"
                            >
                              Mégse
                            </button>
                          </div>
                          {!reviewCommentDraft.trim() ? (
                            <p className="mt-1 text-[9px] text-[var(--adm-text-muted)]">
                              Visszaküldéshez reviewer megjegyzés szükséges.
                            </p>
                          ) : null}
                          {reviewError ? (
                            <p className="mt-1 text-[9px] font-semibold text-[var(--adm-terracotta-700)]">{reviewError}</p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openReviewForm(pkg.id)}
                            className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)] hover:opacity-90 transition-colors"
                          >
                            Ügyvédi döntés
                          </button>
                          <span className="text-[9px] text-[var(--adm-text-muted)]">
                            Jóváhagyás vagy visszaküldés reviewer megjegyzéssel.
                          </span>
                        </div>
                      )
                    ) : (
                      <p className="mt-2 rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-[9px] text-[var(--adm-text-muted)]">
                        {isPreparer
                          ? "A saját Leadásod nem hagyhatod jóvá és nem küldheted vissza."
                          : "Ügyvédi döntésre vár — a döntést a kijelölt ügyvéd vagy adminisztrátor hozhatja meg."}
                      </p>
                    )}
                  </div>
                ) : null}

                {pkg.reviewDecision ? (
                  <div className="mb-2 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-[var(--adm-ivory-100)] p-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--adm-text-muted)]">Ügyvédi döntés</p>
                    <p className="mt-1 text-[10px] font-semibold text-[var(--adm-text)]">
                      {REVIEW_DECISION_LABELS[pkg.reviewDecision] ?? pkg.reviewDecision}
                    </p>
                    {pkg.reviewedAt ? (
                      <p className="mt-0.5 text-[9px] text-[var(--adm-text-muted)]">
                        Döntés ideje: {new Date(pkg.reviewedAt).toLocaleString("hu-HU")}
                      </p>
                    ) : null}
                    {pkg.reviewComment ? (
                      <p className="mt-1 whitespace-pre-wrap text-[9px] text-[var(--adm-text-muted)]">
                        Reviewer megjegyzés: {pkg.reviewComment}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {canWrite && pkg.status !== "ARCHIVED" && editingPackageId === pkg.id ? (
                  <div className="border-t border-[var(--adm-border)] pt-2">
                    <label htmlFor={`handoff-summary-${pkg.id}`} className="text-[10px] font-semibold text-[var(--adm-text)] mb-1">Előkészítő összefoglaló</label>
                    <p className="text-[9px] text-[var(--adm-text-muted)] mb-2">
                      Ide kerüljön, mit kell az ügyvédnek ellenőriznie, milyen döntési pontok vannak, és mi nem használható fel jóváhagyás nélkül.
                    </p>
                    <textarea
                      id={`handoff-summary-${pkg.id}`}
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      rows={3}
                      placeholder="Írd le röviden, mit tartalmaz a Leadás, milyen módosítások történtek, és mire figyeljen az ügyvéd."
                      className="adm-board-field w-full px-2 py-1.5 text-[10px] placeholder:text-[var(--adm-text-muted)] resize-none"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleSaveSummary(pkg.id)}
                        disabled={isSavingSummary}
                        className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSavingSummary ? "Mentés..." : "Mentés"}
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={isSavingSummary}
                        className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-[#c3c8c1] text-[var(--adm-text-muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Mégse
                      </button>
                    </div>
                    {summaryMessage && (
                      <p className="text-[9px] text-[var(--adm-green-800)] mt-1">{summaryMessage}</p>
                    )}
                    {summaryError && (
                      <p className="text-[9px] text-[var(--adm-terracotta-700)] mt-1">{summaryError}</p>
                    )}
                  </div>
                ) : (
                  <div className="border-t border-[var(--adm-border)] pt-2">
                    <p className="text-[10px] font-semibold text-[var(--adm-text)] mb-1">Előkészítő összefoglaló</p>
                    <p className="text-[9px] text-[var(--adm-text-muted)] mb-2">
                      Ide kerüljön, mit kell az ügyvédnek ellenőriznie, milyen döntési pontok vannak, és mi nem használható fel jóváhagyás nélkül.
                    </p>
                    {pkg.preparerSummary ? (
                      <p className="text-[10px] text-[var(--adm-text-muted)] whitespace-pre-wrap">{pkg.preparerSummary}</p>
                    ) : (
                      <p className="text-[10px] text-[var(--adm-text-muted)] italic">Nincs még előkészítő összefoglaló.</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {canWrite && pkg.status !== "ARCHIVED" ? <button
                        onClick={() => startEditing(pkg)}
                        className="text-[9px] font-bold uppercase tracking-widest text-[var(--adm-green-950)] hover:underline"
                      >
                        Szerkesztés
                      </button> : null}
                      {canWrite && canPkgSubmit && (
                        <button
                          onClick={() => handleSubmitForReview(pkg.id)}
                          disabled={submittingPackageId === pkg.id || submitDisabled}
                          className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[var(--adm-ochre-500)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {submittingPackageId === pkg.id ? "Beküldés..." : "Beküldés ügyvédi review-ra"}
                        </button>
                      )}
                      {canWrite && pkg.status !== "ARCHIVED" ? <button
                        type="button"
                        onClick={() => handleArchivePackage(pkg)}
                        disabled={archivingPackageId === pkg.id}
                        className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-[var(--adm-border)] bg-[var(--adm-surface)] text-[#7B5E2E] hover:bg-[var(--adm-ivory-100)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {archivingPackageId === pkg.id ? "Archiválás..." : "Archiválás"}
                      </button> : null}
                    </div>
                    <details className="mt-1">
                      <summary className="text-[9px] text-[var(--adm-text-muted)] cursor-pointer">További műveletek</summary>
                      <div className="mt-1 space-y-1">
                        <p className="text-[9px] text-[var(--adm-text-muted)]">Az export nem érhető el.</p>
                        <p className="text-[9px] text-[var(--adm-text-muted)]">A korábbi leadás döntése ezen az adatlapon követhető; az új feladatleadások külön munkafolyamatot használnak.</p>
                      </div>
                    </details>
                    <details className="mt-1">
                      <summary className="text-[9px] text-[var(--adm-text-muted)] cursor-pointer">Technikai részletek</summary>
                      <div className="mt-1 space-y-1 text-[9px] text-[var(--adm-text-muted)]">
                        <p>Leadás azonosító: {pkg.id}</p>
                        <p>Ügy azonosító: {pkg.caseId}</p>
                        <p>Csomagtípus: {pkg.packageType === "FINAL_APPROVAL" ? "Végleges jóváhagyás" : "Standard leadás"}</p>
                        <p>Státusz: {getStatusLabel(pkg.status)}</p>
                        <p>Forrásdokumentum: {pkg.sourceDocumentId || "—"}</p>
                        <p>Anonimizált dokumentum: {pkg.anonymizedDocumentId || "—"}</p>
                        <p>Generált szerződés: {pkg.generatedContractId || "—"}</p>
                        <p>Jogi elemzés: {pkg.legalAnalysisId || "—"}</p>
                        <p>Review jegyzetek: {pkg.reviewNotesId || "—"}</p>
                        <p>Előkészítő: {pkg.preparedById || "—"}</p>
                        <p>Beküldve: {pkg.submittedAt || "—"}</p>
                        <p>Reviewer: {pkg.reviewedById || "—"}</p>
                        <p>Döntés ideje: {pkg.reviewedAt || "—"}</p>
                        <p>Döntés: {pkg.reviewDecision ? REVIEW_DECISION_LABELS[pkg.reviewDecision] || "Ismeretlen döntés" : "—"}</p>
                        <p>Létrehozva: {pkg.createdAt || "—"}</p>
                        <p>Frissítve: {pkg.updatedAt || "—"}</p>
                      </div>
                    </details>
                    {canPkgSubmit && !pkg.preparerSummary?.trim() && (
                      <p className="text-[9px] text-[var(--adm-terracotta-700)] mt-1">Beküldés előtt add meg az előkészítő összefoglalót.</p>
                    )}
                    {canPkgSubmit && !pkg.sourceDocumentId && !pkg.generatedContractId && (
                      <p className="text-[9px] text-[var(--adm-terracotta-700)] mt-1">Beküldéshez legalább egy forrás- vagy generált dokumentum szükséges.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[8px] text-[var(--adm-text-muted)] mt-3 italic border-t border-[var(--adm-border)] pt-2">
        A panel belső előkészítést támogat, nem helyettesíti a végleges ügyvédi jóváhagyási folyamatot.
      </p>
    </section>
  );
}
