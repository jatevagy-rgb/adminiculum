"use client";

import { useState, useEffect } from "react";
import {
  ApiError,
  archiveHandoffPackage,
  createCaseHandoffPackage,
  listCaseHandoffPackages,
  updateHandoffPackage,
  type LawyerHandoffPackageRecord,
  type LawyerHandoffStatus,
} from "@/lib/api";

type HandoffPackagePanelProps = {
  caseId: string;
  refreshKey?: number;
  sourceDocumentId?: string | null;
  generatedContractId?: string | null;
  initialSummary?: string;
  contextLabel?: string;
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
        return "Egészítsd ki a csomagot, majd küldd be ügyvédi review-ra.";
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
      return "A csomag ügyvéd által jóváhagyva.";
    case "REJECTED":
      return "A csomag javításra visszaküldve.";
    case "ARCHIVED":
      return "Archivált csomag.";
    default:
      return "";
  }
}

function getHandoffErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Jogosultság hiányzik az átadási csomag művelethez.";
    if (error.status === 501) return "A funkció jelenleg nem elérhető ebben a környezetben.";
    if (error.status === 404) return "Az átadási csomag vagy kapcsolódó ügy nem található.";
  }
  return "A művelet nem sikerült. Próbáld újra később.";
}

export function HandoffPackagePanel({
  caseId,
  refreshKey = 0,
  sourceDocumentId,
  generatedContractId,
  initialSummary,
  contextLabel,
}: HandoffPackagePanelProps) {
  const [packages, setPackages] = useState<LawyerHandoffPackageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingPackage, setIsCreatingPackage] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [submittingPackageId, setSubmittingPackageId] = useState<string | null>(null);
  const [archivingPackageId, setArchivingPackageId] = useState<string | null>(null);

  const hasDocumentContext = Boolean(sourceDocumentId || generatedContractId);
  const activePackages = packages.filter((pkg) => pkg.status !== "ARCHIVED");

  useEffect(() => {
    if (!caseId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listCaseHandoffPackages(caseId)
      .then((data) => {
        if (!cancelled) {
          setPackages(data.filter((pkg) => pkg.status !== "ARCHIVED"));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError("Nem sikerült betölteni a leadási csomagokat.");
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
      setPackages((prev) => prev.map((p) => (p.id === pkgId ? updated : p)).filter((p) => p.status !== "ARCHIVED"));
      setEditingPackageId(null);
      setSummaryDraft("");
      setSummaryMessage("Előkészítő összefoglaló mentve.");
    } catch (err) {
      setSummaryError(getHandoffErrorMessage(err));
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!hasDocumentContext) {
      setCreateError("Válassz ügyhöz tartozó dokumentumot az átadási csomag létrehozásához.");
      return;
    }

    setIsCreatingPackage(true);
    setCreateMessage(null);
    setCreateError(null);
    setSummaryMessage(null);
    setSummaryError(null);

    try {
      const created = await createCaseHandoffPackage(caseId, {
        sourceDocumentId: sourceDocumentId || undefined,
        generatedContractId: generatedContractId || undefined,
        preparerSummary: initialSummary?.trim() || undefined,
        packageType: "STANDARD",
      });
      setPackages((prev) => [created, ...prev.filter((pkg) => pkg.id !== created.id && pkg.status !== "ARCHIVED")]);
      setCreateMessage("Átadási csomag piszkozatként létrehozva.");
    } catch (err) {
      setCreateError(getHandoffErrorMessage(err));
    } finally {
      setIsCreatingPackage(false);
    }
  };

  const handleSubmitForReview = async (pkgId: string) => {
    setSummaryMessage(null);
    setSummaryError(null);
    setSubmittingPackageId(pkgId);
    try {
      const updated = await updateHandoffPackage(pkgId, { status: "SUBMITTED" });
      setPackages((prev) => prev.map((p) => (p.id === pkgId ? updated : p)).filter((p) => p.status !== "ARCHIVED"));
      setSummaryMessage("Leadási csomag beküldve ügyvédi review-ra.");
    } catch (err) {
      setSummaryError(getHandoffErrorMessage(err));
    } finally {
      setSubmittingPackageId(null);
    }
  };

  const handleArchivePackage = async (pkg: LawyerHandoffPackageRecord) => {
    const confirmed = window.confirm(
      "Archiválod ezt az átadási csomagot? Az audit miatt megmarad, de az aktív listából eltűnik."
    );
    if (!confirmed) return;

    setArchivingPackageId(pkg.id);
    setSummaryMessage(null);
    setSummaryError(null);
    try {
      await archiveHandoffPackage(pkg.id);
      setPackages((prev) => prev.filter((item) => item.id !== pkg.id));
      setSummaryMessage("Átadási csomag archiválva. Az audit miatt megmarad, de az aktív listából eltűnt.");
    } catch (err) {
      setSummaryError(getHandoffErrorMessage(err));
    } finally {
      setArchivingPackageId(null);
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
      className="adm-board-panel p-4"
      aria-label="Ügyvédi leadási csomagok"
    >
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
        <span className="material-symbols-outlined text-lg text-[var(--adm-green-950)] hidden">folder_special</span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--adm-green-950)]">
          Átadási csomagok
        </h3>
        <span className="rounded-full border border-[#D8C58E] bg-[var(--adm-sand-100)] px-2.5 py-1 text-[10px] font-semibold text-[#6D5418]">
          {activePackages.length} aktív
        </span>
      </div>
      <p className="mb-2 text-[11px] leading-5 text-[var(--adm-text-muted)]">Ügyvédi review-ra előkészített belső munkacsomag.</p>
      {contextLabel ? (
        <p className="mb-2 rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-[9px] text-[var(--adm-text-muted)]">
          Kapcsolt munkadokumentum: <span className="font-semibold">{contextLabel}</span>
        </p>
      ) : null}
      <p className="mb-3 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-ivory-100)] px-3 py-2 text-[10px] leading-4 text-[var(--adm-text-muted)]">
        Ez a csomag előkészítő munkairat. Ügyvédi jóváhagyás nélkül nem minősül végleges jogi állásfoglalásnak.
      </p>

      <div className="mb-3 adm-board-panel-tight p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold text-[var(--adm-text)]">Új átadási csomag</p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--adm-text-muted)]">
              {hasDocumentContext
                ? "A kiválasztott ügy- és dokumentumkörnyezetből piszkozat készíthető."
                : "Válassz munkadokumentumot a dokumentumtárban vagy a szerződés-workspace-ben a létrehozáshoz."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateDraft}
            disabled={!hasDocumentContext || isCreatingPackage}
            className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreatingPackage ? "Létrehozás..." : "Mentés piszkozatként"}
          </button>
        </div>
        {createMessage ? <p className="mt-2 text-[9px] font-semibold text-[var(--adm-green-800)]">{createMessage}</p> : null}
        {createError ? <p className="mt-2 text-[9px] font-semibold text-[var(--adm-terracotta-700)]">{createError}</p> : null}
      </div>

      {isLoading && (
        <p className="text-[10px] text-[var(--adm-text-muted)] italic py-2">Átadási csomagok betöltése…</p>
      )}

      {error && (
        <p className="text-[10px] text-[var(--adm-terracotta-700)] py-2">{error}</p>
      )}

      {!isLoading && !error && activePackages.length === 0 && (
        <div className="adm-board-empty min-h-[150px] px-4 py-5 text-center">
          <span className="material-symbols-outlined text-2xl text-[#c3c8c1]">inbox</span>
          <p className="text-[11px] text-[var(--adm-text-muted)] mt-2">
            Nincs aktív átadási csomag ehhez az ügyhöz.
          </p>
          <p className="mt-1 text-[9px] text-[var(--adm-text-muted)]">
            Az archivált csomagok az audit miatt megmaradnak, de az aktív listában nem jelennek meg.
          </p>
        </div>
      )}

      {!isLoading && !error && activePackages.length > 0 && (
        <div className="space-y-3">
          {activePackages.map((pkg) => {
            const pkgMissing = getMissingItems(pkg);
            const hasMissingMandatory = pkgMissing.length > 0;
            const canPkgSubmit = canSubmit(pkg);
            const submitDisabled = isSubmitDisabled(pkg);
            const nextAction = getNextAction(pkg);

            return (
              <div
                key={pkg.id}
                className="adm-board-list-row p-3.5"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs font-bold text-[var(--adm-green-950)]">
                    Ügyvédi leadási csomag
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

                {/* Csomag tartalma */}
                <div className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-[#FAFAF8] p-3 mb-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--adm-text-muted)] mb-1">Csomag tartalma</p>
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
                      <span className="text-[9px] text-[var(--adm-text-muted)]">Kommunikációs összefoglaló</span>
                      <span className="text-[9px] text-[var(--adm-text-muted)]">Későbbi patchben</span>
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
                    A csomag alapadatai beküldésre előkészítve.
                  </p>
                )}

                {/* Következő lépés */}
                <p className="text-[9px] text-[var(--adm-text-muted)] italic mb-2">Következő lépés: {nextAction}</p>

                {/* Timestamps */}
                <div className="flex items-center gap-3 text-[9px] text-[var(--adm-text-muted)] mb-2 border-t border-[var(--adm-border)] pt-2">
                  <span>
                    Létrehozva:{" "}
                    {pkg.createdAt
                      ? new Date(pkg.createdAt).toLocaleDateString("hu-HU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  <span>
                    Frissítve:{" "}
                    {pkg.updatedAt
                      ? new Date(pkg.updatedAt).toLocaleDateString("hu-HU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>

                {editingPackageId === pkg.id ? (
                  <div className="border-t border-[var(--adm-border)] pt-2">
                    <p className="text-[10px] font-semibold text-[var(--adm-text)] mb-1">Előkészítő összefoglaló</p>
                    <p className="text-[9px] text-[var(--adm-text-muted)] mb-2">
                      Ide kerüljön, mit kell az ügyvédnek ellenőriznie, milyen döntési pontok vannak, és mi nem használható fel jóváhagyás nélkül.
                    </p>
                    <textarea
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      rows={3}
                      placeholder="Írd le röviden, mit tartalmaz a leadási csomag, milyen módosítások történtek, és mire figyeljen az ügyvéd."
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
                      <button
                        onClick={() => startEditing(pkg)}
                        className="text-[9px] font-bold uppercase tracking-widest text-[var(--adm-green-950)] hover:underline"
                      >
                        Szerkesztés
                      </button>
                      {canPkgSubmit && (
                        <button
                          onClick={() => handleSubmitForReview(pkg.id)}
                          disabled={submittingPackageId === pkg.id || submitDisabled}
                          className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[var(--adm-ochre-500)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {submittingPackageId === pkg.id ? "Beküldés..." : "Beküldés ügyvédi review-ra"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleArchivePackage(pkg)}
                        disabled={archivingPackageId === pkg.id}
                        className="rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-[var(--adm-border)] bg-[var(--adm-surface)] text-[#7B5E2E] hover:bg-[var(--adm-ivory-100)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {archivingPackageId === pkg.id ? "Archiválás..." : "Archiválás"}
                      </button>
                    </div>
                    <details className="mt-1">
                      <summary className="text-[9px] text-[var(--adm-text-muted)] cursor-pointer">További műveletek</summary>
                      <div className="mt-1 space-y-1">
                        <p className="text-[9px] text-[var(--adm-text-muted)]">Export későbbi patchben.</p>
                        <p className="text-[9px] text-[var(--adm-text-muted)]">Jóváhagyási workflow későbbi patchben.</p>
                      </div>
                    </details>
                    <details className="mt-1">
                      <summary className="text-[9px] text-[var(--adm-text-muted)] cursor-pointer">Technikai részletek</summary>
                      <div className="mt-1 space-y-1 text-[9px] text-[var(--adm-text-muted)]">
                        <p>Csomag azonosító: {pkg.id}</p>
                        <p>Státusz: {getStatusLabel(pkg.status)}</p>
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
