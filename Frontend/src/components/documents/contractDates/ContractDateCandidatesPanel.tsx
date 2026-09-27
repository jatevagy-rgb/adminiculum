"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  candidateStatusLabel,
  contractDateCandidatesApi,
  contractDateTypeLabel,
  formatCandidateDate,
  type ContractDateCandidateDTO,
} from "@/lib/contractDateCandidatesApi";
import { clientContractsApi, formatDate, type ClientObligationDTO, type ContractRecordDTO } from "@/lib/clientContractsApi";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";

type ContractDateCandidatesPanelProps = {
  documentId: string;
  /** Exact immutable version the extraction and candidates are bound to. */
  documentVersionId: string | null;
  clientId: string | null;
  /** Case-manage capability: gates the extraction button. */
  canManage: boolean;
};

const CONTRACT_LEVEL_TYPES = new Set(["EFFECTIVE", "EXPIRY", "NEXT_CRITICAL"]);

const DATE_TYPE_FIELD_LABELS: Record<string, string> = {
  EFFECTIVE: "Hatálybalépés",
  EXPIRY: "Lejárat",
  NEXT_CRITICAL: "Következő kritikus dátum",
};

function statusTone(status: string): "gold" | "green" | "neutral" {
  if (status === "CONFIRMED") return "green";
  if (status === "REJECTED") return "neutral";
  return "gold";
}

export function ContractDateCandidatesPanel({ documentId, documentVersionId, clientId, canManage }: ContractDateCandidatesPanelProps) {
  const [candidates, setCandidates] = useState<ContractDateCandidateDTO[]>([]);
  const [contracts, setContracts] = useState<ContractRecordDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  // Per-candidate confirm selections: contract (always) + obligation (occurrence types).
  const [targetContracts, setTargetContracts] = useState<Record<string, string>>({});
  const [targetObligations, setTargetObligations] = useState<Record<string, string>>({});
  const [obligationsByContract, setObligationsByContract] = useState<Record<string, ClientObligationDTO[]>>({});
  const [loadingObligationsFor, setLoadingObligationsFor] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const loadCandidates = useCallback(async () => {
    if (!documentId) return;
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const result = await contractDateCandidatesApi.list(documentId);
      if (seq === requestSeq.current) setCandidates(result.items);
    } catch (error) {
      if (seq === requestSeq.current) setActionError(error instanceof Error ? error.message : "A dátumjelöltek betöltése sikertelen.");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    setCandidates([]);
    setActionError(null);
    setExtractMessage(null);
    setTargetContracts({});
    setTargetObligations({});
    setObligationsByContract({});
    void loadCandidates();
  }, [documentId, loadCandidates]);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    clientContractsApi
      .listContracts(clientId)
      .then((result) => {
        if (active) setContracts(result.items);
      })
      .catch(() => {
        if (active) setActionError("A szerződéslista betöltése sikertelen.");
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  const pendingCandidates = useMemo(() => candidates.filter((candidate) => candidate.status === "PENDING"), [candidates]);
  const decidedCandidates = useMemo(() => candidates.filter((candidate) => candidate.status !== "PENDING"), [candidates]);

  const canonicalDatedContracts = useMemo(
    () =>
      contracts
        .filter((contract) => contract.effectiveDate || contract.expiryDate || contract.nextCriticalDate)
        .sort((a, b) => a.title.localeCompare(b.title, "hu")),
    [contracts],
  );

  const ensureObligations = useCallback(
    async (contractId: string) => {
      if (obligationsByContract[contractId] || loadingObligationsFor) return;
      setLoadingObligationsFor(contractId);
      try {
        const contract = await clientContractsApi.getContract(contractId);
        setObligationsByContract((existing) => ({ ...existing, [contractId]: contract.obligations ?? [] }));
      } catch {
        setActionError("A kötelezettségek betöltése sikertelen.");
      } finally {
        setLoadingObligationsFor(null);
      }
    },
    [obligationsByContract, loadingObligationsFor],
  );

  const handleExtract = async () => {
    if (!documentVersionId) return;
    setActionError(null);
    setIsExtracting(true);
    try {
      const result = await contractDateCandidatesApi.extract(documentVersionId);
      setExtractMessage(
        result.createdCount > 0
          ? `${result.createdCount} új dátumjelölt létrehozva a kiválasztott verzióból.`
          : `Nem található új dátumjelölt (${result.detectedCount} felismert, ${result.skippedExisting} már rögzített).`,
      );
      await loadCandidates();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "A dátumkinyerés sikertelen.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirm = async (candidate: ContractDateCandidateDTO) => {
    const targetContractId = targetContracts[candidate.id];
    if (!targetContractId) return;
    if (!CONTRACT_LEVEL_TYPES.has(candidate.dateType) && !targetObligations[candidate.id]) return;
    setActionError(null);
    setBusyCandidateId(candidate.id);
    try {
      await contractDateCandidatesApi.confirm(candidate.id, {
        targetContractId,
        obligationId: CONTRACT_LEVEL_TYPES.has(candidate.dateType) ? null : targetObligations[candidate.id] ?? null,
      });
      await loadCandidates();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "A megerősítés sikertelen.");
    } finally {
      setBusyCandidateId(null);
    }
  };

  const handleReject = async (candidate: ContractDateCandidateDTO) => {
    setActionError(null);
    setBusyCandidateId(candidate.id);
    try {
      await contractDateCandidatesApi.reject(candidate.id);
      await loadCandidates();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Az elutasítás sikertelen.");
    } finally {
      setBusyCandidateId(null);
    }
  };

  const selectableContracts = useMemo(() => contracts.filter((contract) => contract.status !== "SUPERSEDED" && contract.status !== "TERMINATED"), [contracts]);

  return (
    <section data-testid="contract-date-panel" className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Szerződéses dátumok</p>
        <h4 className="mt-1 font-serif text-lg font-semibold text-[var(--adm-text)]">Szerződéses dátumok</h4>
        <p className="mt-1 text-xs text-[#3D4842]">A kinyert dátumok javaslatok — csak jogász megerősítése után válnak kanonikus szerződéses adattá.</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <AdminButton
          data-testid="contract-date-extract-button"
          variant="neutral"
          size="xs"
          onClick={() => void handleExtract()}
          disabled={!documentVersionId || !canManage || isExtracting}
        >
          {isExtracting ? "Kinyerés..." : "Dátumok kinyerése ebből a verzióból"}
        </AdminButton>
        {documentVersionId ? null : (
          <p className="text-[11px] text-[var(--adm-text-muted)]">Válassz verziót a kinyeréshez.</p>
        )}
      </div>
      {extractMessage ? (
        <p data-testid="contract-date-extract-message" className="rounded border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-2 text-xs text-[#3D4842]">
          {extractMessage}
        </p>
      ) : null}
      {actionError ? (
        <p data-testid="contract-date-error" className="rounded border border-[#C98A8A] bg-[#FBEDEC] p-2 text-xs text-[#7A2E2E]">
          {actionError}
        </p>
      ) : null}

      <div className="space-y-1.5 rounded-[10px] border border-[rgba(22,32,26,0.10)] bg-[var(--adm-surface)] p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Megerősített kanonikus dátumok</p>
        {canonicalDatedContracts.length === 0 ? (
          <p data-testid="contract-date-no-confirmed" className="text-xs text-[var(--adm-text-muted)]">Még nincs megerősített szerződéses dátum.</p>
        ) : (
          <ul data-testid="contract-date-confirmed-list" className="space-y-2">
            {canonicalDatedContracts.map((contract) => (
              <li key={contract.id} className="rounded border border-[rgba(22,32,26,0.08)] bg-white p-2 text-xs text-[#3D4842]">
                <p className="font-semibold text-[var(--adm-text)]">{contract.title}</p>
                {contract.effectiveDate ? <p><b>{DATE_TYPE_FIELD_LABELS.EFFECTIVE}:</b> {formatDate(contract.effectiveDate)}</p> : null}
                {contract.expiryDate ? <p><b>{DATE_TYPE_FIELD_LABELS.EXPIRY}:</b> {formatDate(contract.expiryDate)}</p> : null}
                {contract.nextCriticalDate ? <p><b>{DATE_TYPE_FIELD_LABELS.NEXT_CRITICAL}:</b> {formatDate(contract.nextCriticalDate)}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5 rounded-[10px] border border-[#E7DECB] bg-[var(--adm-sand-100)] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-green-800)]">Jóváhagyásra váró dátumjelöltek</p>
          {pendingCandidates.length > 0 ? <AdminBadge tone="gold">{pendingCandidates.length}</AdminBadge> : null}
        </div>
        {isLoading && candidates.length === 0 ? (
          <p className="text-xs text-[var(--adm-text-muted)]">Betöltés...</p>
        ) : pendingCandidates.length === 0 ? (
          <p data-testid="contract-date-no-pending" className="text-xs text-[var(--adm-text-muted)]">Nincs jóváhagyásra váró dátumjelölt.</p>
        ) : (
          <ul data-testid="contract-date-pending-list" className="space-y-2">
            {pendingCandidates.map((candidate) => {
              const needsObligation = !CONTRACT_LEVEL_TYPES.has(candidate.dateType);
              const selectedContract = targetContracts[candidate.id] || "";
              const obligations = selectedContract ? obligationsByContract[selectedContract] ?? [] : [];
              const canConfirm =
                Boolean(selectedContract) && (!needsObligation || Boolean(targetObligations[candidate.id])) && busyCandidateId !== candidate.id;
              return (
                <li
                  key={candidate.id}
                  data-testid="contract-date-pending-item"
                  className="rounded border border-[rgba(22,32,26,0.10)] bg-white p-2.5 text-xs text-[#3D4842]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-[var(--adm-green-800)]">{contractDateTypeLabel(candidate.dateType)}</p>
                    <p className="font-semibold text-[var(--adm-text)]">{formatCandidateDate(candidate.proposedDate)}</p>
                  </div>
                  <p className="mt-1 line-clamp-2 italic text-[#3D4842]">“{candidate.sourceExcerpt}”</p>
                  <div className="mt-2 space-y-1.5">
                    <select
                      aria-label="Cél szerződés"
                      data-testid={`candidate-contract-select-${candidate.id}`}
                      value={selectedContract}
                      onChange={(event) => {
                        const contractId = event.target.value;
                        setTargetContracts((existing) => ({ ...existing, [candidate.id]: contractId }));
                        setTargetObligations((existing) => {
                          const next = { ...existing };
                          delete next[candidate.id];
                          return next;
                        });
                        if (contractId && needsObligation) void ensureObligations(contractId);
                      }}
                      className="w-full rounded border border-[rgba(22,32,26,0.16)] bg-white px-2 py-1.5 text-xs"
                    >
                      <option value="">Válassz szerződést...</option>
                      {selectableContracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>{contract.title}</option>
                      ))}
                    </select>
                    {needsObligation && selectedContract ? (
                      obligations.length === 0 ? (
                        <p className="text-[11px] text-[var(--adm-text-muted)]">A szerződéshez nincs kötelezettség rögzítve, ezért a dátum nem erősíthető meg.</p>
                      ) : (
                        <select
                          aria-label="Cél kötelezettség"
                          data-testid={`candidate-obligation-select-${candidate.id}`}
                          value={targetObligations[candidate.id] || ""}
                          onChange={(event) => setTargetObligations((existing) => ({ ...existing, [candidate.id]: event.target.value }))}
                          className="w-full rounded border border-[rgba(22,32,26,0.16)] bg-white px-2 py-1.5 text-xs"
                        >
                          <option value="">Válassz kötelezettséget...</option>
                          {obligations.map((obligation) => (
                            <option key={obligation.id} value={obligation.id}>{obligation.title}</option>
                          ))}
                        </select>
                      )
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <AdminButton
                      data-testid={`candidate-confirm-${candidate.id}`}
                      variant="primary"
                      size="xs"
                      disabled={!canConfirm}
                      onClick={() => void handleConfirm(candidate)}
                    >
                      {busyCandidateId === candidate.id ? "Folyamatban..." : "Megerősít"}
                    </AdminButton>
                    <AdminButton
                      data-testid={`candidate-reject-${candidate.id}`}
                      variant="neutral"
                      size="xs"
                      disabled={busyCandidateId === candidate.id}
                      onClick={() => void handleReject(candidate)}
                    >
                      Elutasít
                    </AdminButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {decidedCandidates.length > 0 ? (
        <div className="space-y-1.5 rounded-[10px] border border-[rgba(22,32,26,0.10)] bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Elbírált jelöltek</p>
          <ul data-testid="contract-date-decided-list" className="space-y-1.5">
            {decidedCandidates.map((candidate) => (
              <li key={candidate.id} className="flex items-center justify-between gap-2 text-xs text-[#3D4842]">
                <span className="truncate">{contractDateTypeLabel(candidate.dateType)} · {formatCandidateDate(candidate.proposedDate)}</span>
                <AdminBadge tone={statusTone(candidate.status)}>{candidateStatusLabel(candidate.status)}</AdminBadge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
