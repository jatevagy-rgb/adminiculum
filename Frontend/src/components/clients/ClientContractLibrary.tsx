"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clientContractsApi,
  contractStatusLabel,
  contractTypeLabel,
  partyRoleLabel,
  obligationStatusLabel,
  entitlementStatusLabel,
  entitlementTypeLabel,
  formatDate,
  type ContractRecordDTO,
  type ClientObligationDTO,
  type ContractEntitlementDTO,
} from "@/lib/clientContractsApi";

const emptyText = "Nincs megjeleníthető elem.";
const labelCls = "rounded bg-white border border-[var(--adm-border)] px-2 py-1 text-xs text-[var(--adm-text-muted)]";

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <section className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{title}</h3>
      <div className="mt-3">{empty ? <p className="text-sm text-[var(--adm-text-muted)]">{emptyText}</p> : children}</div>
    </section>
  );
}

export function ClientContractLibrary({ clientId }: { clientId: string }) {
  const [contracts, setContracts] = useState<(ContractRecordDTO & { parties?: { displayName: string; roleCode: string }[] })[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContractRecordDTO & { parties: { id: string; roleCode: string; displayName: string }[]; obligations: ClientObligationDTO[]; entitlements: ContractEntitlementDTO[]; amendments: ContractRecordDTO[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await clientContractsApi.listContracts(clientId);
      setContracts(result.items);
    } catch {
      setError("A szerződéstár adatai nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (contractId: string) => {
    if (expandedId === contractId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(contractId);
    setDetail(null);
    try {
      setDetail(await clientContractsApi.getContract(contractId));
    } catch {
      setDetail(null);
      setError("A szerződés részletei nem tölthetők be.");
    }
  };

  const partnerName = (c: ContractRecordDTO & { parties?: { displayName: string; roleCode: string }[] }): string => {
    const partner = (c.parties || []).find((p) => p.roleCode === "SUPPLIER") || (c.parties || [])[0];
    return partner ? partner.displayName : "—";
  };

  return (
    <div className="space-y-4" data-testid="client-contract-library">
      <div className="rounded border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-3">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)] mb-1">Szerződéstár</h3>
        <p className="text-[10px] text-[var(--adm-text-muted)]">Ügyfélszerződések, módosítások, kötelezettségek és jogosultságok.</p>
      </div>
      {loading ? <p className="text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {!loading && !error ? (
        <Section title="Szerződések" empty={!contracts.length}>
          <div className="grid gap-2">
            {contracts.map((contract) => (
              <div key={contract.id} className="rounded bg-white border border-[var(--adm-border)] p-2 text-sm">
                <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => void toggle(contract.id)} aria-expanded={expandedId === contract.id}>
                  <div className="min-w-0">
                    <b className="text-[var(--adm-text)]">{contract.title}</b>
                    <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{contractTypeLabel(contract.contractType)}</span>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Partner: {partnerName(contract)}</p>
                  </div>
                  <span className={labelCls}>{contractStatusLabel(contract.status)}</span>
                </button>
                <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                  Hatály: {formatDate(contract.effectiveDate)} – {formatDate(contract.expiryDate)}
                  {contract.nextCriticalDate ? ` · Következő szerződéses dátum: ${formatDate(contract.nextCriticalDate)}` : ""}
                </p>
                {expandedId === contract.id && detail ? (
                  <div className="mt-3 space-y-3 border-t border-[var(--adm-border)] pt-3">
                    <div className="grid gap-2 text-xs text-[var(--adm-text-muted)] sm:grid-cols-2">
                      <span>Aláírva: {formatDate(detail.signatureDate)}</span>
                      <span>Hatályos: {formatDate(detail.effectiveDate)} – {formatDate(detail.expiryDate)}</span>
                      {detail.businessOwnerLabel ? <span>Üzleti felelős: {detail.businessOwnerLabel}</span> : null}
                      {detail.autoRenewal ? <span>Automatikus megújulás</span> : null}
                      {detail.noticePeriodDays != null ? <span>Felmondási idő: {detail.noticePeriodDays} nap</span> : null}
                      <span>Kanonikus dokumentum: {detail.canonicalDocumentVersionId ? "rögzítve" : "nincs rögzítve"}</span>
                    </div>
                    {detail.amendments.length ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Módosítások</p>
                        <div className="mt-1 grid gap-1">
                          {detail.amendments.map((amendment) => (
                            <p key={amendment.id} className="rounded bg-[var(--adm-ivory-100)] p-2 text-xs text-[var(--adm-text)]">{amendment.title}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {detail.obligations.length ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kötelezettségek</p>
                        <div className="mt-1 grid gap-1">
                          {detail.obligations.map((obligation) => (
                            <div key={obligation.id} className="rounded bg-[var(--adm-ivory-100)] p-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <b className="text-[var(--adm-text)]">{obligation.title}</b>
                                <span className={labelCls}>{obligationStatusLabel(obligation.status)}</span>
                              </div>
                              {obligation.nextDueDate ? <p className="mt-1 text-[var(--adm-text-muted)]">Esedékesség: {formatDate(obligation.nextDueDate)}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {detail.entitlements.length ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Jogosultságok</p>
                        <div className="mt-1 grid gap-1">
                          {detail.entitlements.map((entitlement) => (
                            <div key={entitlement.id} className="rounded bg-[var(--adm-ivory-100)] p-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <b className="text-[var(--adm-text)]">{entitlementTypeLabel(entitlement.type)} — {entitlement.title}</b>
                                <span className={labelCls}>{entitlementStatusLabel(entitlement.status)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
