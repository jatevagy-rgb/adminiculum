"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SafePanelError } from "@/components/ui";
import { getPortalOrganizationContracts, type PortalOrgContract } from "@/lib/clientPortalApi";
import {
  contractDateRows,
  selectActiveContracts,
  selectExpiringThisMonthContracts,
} from "@/components/client-portal/OrganizationPortalViews";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

/**
 * Client Portal 3.0 contracts body — the /portal/szerzodesek ORGANIZATION
 * surface. Consumes the canonical published contracts projection
 * (getPortalOrganizationContracts) and reuses the exported canonical date /
 * active / expiring selectors. Only status-backed fields are shown: no
 * fabricated renewal state and no fabricated expiry alerts.
 */

function formatDate(value?: string | null) {
  if (!value) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

const CARD =
  "min-w-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4 sm:p-5";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-secondary)]";
const MUTED = "text-[var(--adm-text-secondary)]";

export function PortalContractsV3() {
  const [contracts, setContracts] = useState<PortalOrgContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPortalOrganizationContracts();
      setContracts(result.items || []);
    } catch (err) {
      setContracts([]);
      setError(err instanceof Error ? err.message : "A szerződések jelenleg nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadNonce]);

  const active = selectActiveContracts(contracts);
  const expiringThisMonth = selectExpiringThisMonthContracts(contracts);

  if (loading) {
    return (
      <div aria-label="Szerződések betöltése" data-testid="portal-contracts-loading" className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
        ))}
      </div>
    );
  }

  if (error && contracts.length === 0) {
    return (
      <div data-testid="portal-contracts-v3">
        <SafePanelError detail={error} onRetry={() => setReloadNonce((value) => value + 1)} />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="portal-contracts-v3">
      <header className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-4 sm:px-5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
          Szerződések
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--adm-text-secondary)]">
          Csak azok a szerződéses dokumentumok láthatók, amelyeket az iroda közzétett az Ön számára.
        </p>
      </header>

      {contracts.length === 0 ? (
        <section
          data-testid="portal-contracts-empty"
          className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-6 text-center"
        >
          <PortalEmptyInline>
            Jelenleg nincs közzétett szerződéses áttekintés. Ha elkészül egy közzétehető szerződéses dokumentum, az itt fog
            megjelenni.
          </PortalEmptyInline>
        </section>
      ) : (
        <>
          <section className={CARD}>
            <dl className="grid gap-3 sm:grid-cols-2" data-testid="org-contract-summary">
              <div className="rounded-[8px] bg-[var(--adm-canvas-subtle)] p-4">
                <dt className="text-sm font-semibold text-[var(--adm-text-primary)]">Aktív szerződések</dt>
                <dd className="mt-1 text-2xl font-semibold text-[var(--adm-text-primary)]">{active.length}</dd>
              </div>
              <div className="rounded-[8px] bg-[var(--adm-canvas-subtle)] p-4">
                <dt className="text-sm font-semibold text-[var(--adm-text-primary)]">
                  Ebben a hónapban lejáró szerződések
                </dt>
                <dd className="mt-1 text-2xl font-semibold text-[var(--adm-text-primary)]">{expiringThisMonth.length}</dd>
              </div>
            </dl>
          </section>

          <section className={CARD}>
            <p className={EYEBROW}>Közzétett dokumentumok</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Közzétett szerződések</h2>
            <ul className="mt-4 space-y-3">
              {contracts.map((contract) => {
                const dateRows = contractDateRows(contract);
                return (
                  <li
                    key={contract.reference}
                    data-testid="portal-contract-row"
                    className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold text-[var(--adm-text-primary)]">{contract.title}</h3>
                        {contract.relatedMatterTitle ? (
                          <p className={`mt-1 text-xs ${MUTED}`}>Kapcsolódó ügy: {contract.relatedMatterTitle}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 text-xs font-semibold text-[var(--adm-text-primary)]">
                          {contract.statusLabel}
                        </span>
                        {contract.expiresThisMonth && contract.expiryDate ? (
                          <span className="text-xs font-semibold text-[var(--adm-brand-terracotta)]">
                            Ebben a hónapban lejár
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      {dateRows.map((row) => (
                        <div key={row.key}>
                          <dt className="font-semibold text-[var(--adm-text-primary)]">{row.label}</dt>
                          <dd className={`text-xs ${MUTED}`}>{formatDate(row.value)}</dd>
                        </div>
                      ))}
                      {!dateRows.length ? (
                        <div>
                          <dt className="font-semibold text-[var(--adm-text-primary)]">Kulcsdátum</dt>
                          <dd className={`text-xs ${MUTED}`}>{formatDate(contract.keyDate)}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="font-semibold text-[var(--adm-text-primary)]">Közzétett dokumentum</dt>
                        <dd className={`text-xs ${MUTED}`}>
                          {contract.publishedDoc
                            ? `${contract.publishedDoc.title || contract.title} · ${contract.publishedDoc.versionLabel}`
                            : "Nincs letölthető dokumentum"}
                        </dd>
                      </div>
                    </dl>

                    {contract.publishedDoc?.downloadAvailable ? (
                      <Link
                        href={`/portal/documents/${encodeURIComponent(contract.publishedDoc.publicationId)}`}
                        className="mt-3 inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                      >
                        Dokumentum megnyitása
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
