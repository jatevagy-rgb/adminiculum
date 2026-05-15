"use client";

import { useState, useEffect } from "react";
import {
  listCaseHandoffPackages,
  updateHandoffPackage,
  type LawyerHandoffPackageRecord,
  type LawyerHandoffStatus,
} from "@/lib/api";

type HandoffPackagePanelProps = {
  caseId: string;
  refreshKey?: number;
};

const STATUS_LABELS: Record<LawyerHandoffStatus, string> = {
  DRAFT: "Piszkozat",
  PREPARED: "Előkészítve",
  SUBMITTED: "Ügyvédi review-ra beküldve",
  IN_REVIEW: "Ügyvédi review alatt",
  APPROVED: "Jóváhagyva",
  REJECTED: "Visszaküldve",
  ARCHIVED: "Archiválva",
};

const REFERENCE_BADGES: Record<string, string> = {
  sourceDocumentId: "Eredeti dokumentum",
  anonymizedDocumentId: "Anonimizált szöveg",
  generatedContractId: "Módosított / generált dokumentum",
  legalAnalysisId: "Jogi elemzés",
  reviewNotesId: "Review jegyzetek",
};

function getStatusColor(status: LawyerHandoffStatus): string {
  switch (status) {
    case "APPROVED":
      return "bg-[#d1e8d3] text-[#23472F]";
    case "REJECTED":
      return "bg-[#ffdad6] text-[#ba1a1a]";
    case "IN_REVIEW":
      return "bg-[#e4e2e1] text-[#656464]";
    case "SUBMITTED":
      return "bg-[#e4e2e1] text-[#656464]";
    case "ARCHIVED":
      return "bg-[#EEE7D9] text-[#7B776D]";
    case "PREPARED":
      return "bg-[#EEE7D9] text-[#514D45]";
    case "DRAFT":
    default:
      return "bg-[#f5f3ee] text-[#434843]";
  }
}

function hasAnyLinkedContent(pkg: LawyerHandoffPackageRecord): boolean {
  return !!(
    pkg.sourceDocumentId ||
    pkg.anonymizedDocumentId ||
    pkg.generatedContractId ||
    pkg.legalAnalysisId ||
    pkg.reviewNotesId
  );
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

export function HandoffPackagePanel({ caseId, refreshKey = 0 }: HandoffPackagePanelProps) {
  const [packages, setPackages] = useState<LawyerHandoffPackageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [submittingPackageId, setSubmittingPackageId] = useState<string | null>(null);

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
          setPackages(data);
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
      setPackages((prev) => prev.map((p) => (p.id === pkgId ? updated : p)));
      setEditingPackageId(null);
      setSummaryDraft("");
      setSummaryMessage("Előkészítő összefoglaló mentve.");
    } catch {
      setSummaryError("Nem sikerült menteni az összefoglalót.");
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
      setSummaryMessage("Leadási csomag beküldve ügyvédi review-ra.");
    } catch {
      setSummaryError("Nem sikerült beküldeni a leadási csomagot.");
    } finally {
      setSubmittingPackageId(null);
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
      className="border border-[#DDD7CA] bg-[#FBF9F3] p-4"
      aria-label="Ügyvédi leadási csomagok"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-lg text-[#06190d]">folder_special</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#06190d]">
          Ügyvédi Leadási Csomagok
        </h3>
      </div>

      {isLoading && (
        <p className="text-[10px] text-[#7B776D] italic py-2">Betöltés...</p>
      )}

      {error && (
        <p className="text-[10px] text-[#ba1a1a] py-2">{error}</p>
      )}

      {!isLoading && !error && packages.length === 0 && (
        <div className="text-center py-6 border border-[#EEE7D9] bg-[#F6F2E8]">
          <span className="material-symbols-outlined text-2xl text-[#c3c8c1]">inbox</span>
          <p className="text-[11px] text-[#514D45] mt-2">
            Még nincs ügyvédi leadási csomag ehhez az ügyhöz.
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

            return (
              <div
                key={pkg.id}
                className="border border-[#DDD7CA] bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs font-bold text-[#06190d]">
                    Ügyvédi leadási csomag
                  </p>
                  <span
                    className={`text-[8px] px-1.5 py-0.5 font-bold uppercase tracking-widest shrink-0 ${getStatusColor(pkg.status)}`}
                  >
                    {STATUS_LABELS[pkg.status] ?? pkg.status}
                  </span>
                </div>

                {/* Csomag tartalma */}
                <div className="border border-[#EEE7D9] bg-[#FAFAF8] p-2 mb-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#7B776D] mb-1">Csomag tartalma</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#514D45]">Forrásdokumentum</span>
                      {pkg.sourceDocumentId ? (
                        <span className="text-[9px] text-[#23472F] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[#ba1a1a]">Hiányzik</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#514D45]">Anonimizált szöveg</span>
                      {pkg.anonymizedDocumentId ? (
                        <span className="text-[9px] text-[#23472F] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[#7B776D]">Nincs csatolva</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#514D45]">Generált / módosított dokumentum</span>
                      {pkg.generatedContractId ? (
                        <span className="text-[9px] text-[#23472F] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[#7B776D]">Nincs csatolva</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#514D45]">Jogi elemzés</span>
                      {pkg.legalAnalysisId ? (
                        <span className="text-[9px] text-[#23472F] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[#ba1a1a]">Hiányzik</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#514D45]">Review jegyzetek</span>
                      {pkg.reviewNotesId ? (
                        <span className="text-[9px] text-[#23472F] font-bold">Kapcsolva</span>
                      ) : (
                        <span className="text-[9px] text-[#7B776D]">Nincs csatolva</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#514D45]">Előkészítő összefoglaló</span>
                      {pkg.preparerSummary?.trim() ? (
                        <span className="text-[9px] text-[#23472F] font-bold">Megadva</span>
                      ) : (
                        <span className="text-[9px] text-[#ba1a1a]">Hiányzik</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Missing items / completeness helper */}
                {canPkgSubmit && hasMissingMandatory && (
                  <p className="text-[9px] text-[#ba1a1a] mb-1">
                    Beküldés előtt érdemes pótolni: {pkgMissing.join(", ")}.
                  </p>
                )}
                {canPkgSubmit && !hasMissingMandatory && (
                  <p className="text-[9px] text-[#23472F] font-bold mb-1">
                    A csomag alapadatai beküldésre előkészítve.
                  </p>
                )}

                {/* Következő lépés */}
                <p className="text-[9px] text-[#7B776D] italic mb-2">Következő lépés: {nextAction}</p>

                {/* Timestamps */}
                <div className="flex items-center gap-3 text-[9px] text-[#7B776D] mb-2 border-t border-[#EEE7D9] pt-2">
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
                  <div className="border-t border-[#EEE7D9] pt-2">
                    <textarea
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      rows={3}
                      placeholder="Írd le röviden, mit tartalmaz a leadási csomag, milyen módosítások történtek, és mire figyeljen az ügyvéd."
                      className="w-full px-2 py-1.5 text-[10px] border border-[#DDD7CA] bg-white text-[#1F2821] placeholder:text-[#7B776D] focus:outline-none focus:border-[#06190d] resize-none"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleSaveSummary(pkg.id)}
                        disabled={isSavingSummary}
                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[#06190d] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSavingSummary ? "Mentés..." : "Mentés"}
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={isSavingSummary}
                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-[#c3c8c1] text-[#7B776D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Mégse
                      </button>
                    </div>
                    {summaryMessage && (
                      <p className="text-[9px] text-[#23472F] mt-1">{summaryMessage}</p>
                    )}
                    {summaryError && (
                      <p className="text-[9px] text-[#ba1a1a] mt-1">{summaryError}</p>
                    )}
                  </div>
                ) : (
                  <div className="border-t border-[#EEE7D9] pt-2">
                    {pkg.preparerSummary ? (
                      <p className="text-[10px] text-[#514D45] whitespace-pre-wrap">{pkg.preparerSummary}</p>
                    ) : (
                      <p className="text-[10px] text-[#7B776D] italic">Nincs még előkészítő összefoglaló.</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <button
                        onClick={() => startEditing(pkg)}
                        className="text-[9px] font-bold uppercase tracking-widest text-[#06190d] hover:underline"
                      >
                        Szerkesztés
                      </button>
                      {canPkgSubmit && (
                        <button
                          onClick={() => handleSubmitForReview(pkg.id)}
                          disabled={submittingPackageId === pkg.id || submitDisabled}
                          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[#23472F] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {submittingPackageId === pkg.id ? "Beküldés..." : "Beküldés ügyvédi review-ra"}
                        </button>
                      )}
                    </div>
                    {canPkgSubmit && !pkg.preparerSummary?.trim() && (
                      <p className="text-[9px] text-[#ba1a1a] mt-1">Beküldés előtt add meg az előkészítő összefoglalót.</p>
                    )}
                    {canPkgSubmit && !pkg.sourceDocumentId && !pkg.generatedContractId && (
                      <p className="text-[9px] text-[#ba1a1a] mt-1">Beküldéshez legalább egy forrás- vagy generált dokumentum szükséges.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[8px] text-[#7B776D] mt-3 italic border-t border-[#EEE7D9] pt-2">
        Ez a csomag előkészítő munkairat. Ügyvédi jóváhagyás nélkül nem minősül végleges jogi állásfoglalásnak.
      </p>
    </section>
  );
}