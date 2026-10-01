"use client";

import { useCallback, useEffect, useState } from "react";
import { SafePanelError } from "@/components/ui";
import {
  getPortalOrganizationCompany,
  getPortalOrganizationContracts,
  type PortalOrgCompany,
  type PortalOrgContract,
} from "@/lib/clientPortalApi";
import { ApiError } from "@/lib/api";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";
import { PortalCompanyProfileV3 } from "./PortalCompanyProfileV3";
import { PortalCompanySections } from "./PortalCompanySections";

/**
 * Client Portal 3.0 company cockpit — the /portal/vallalat ORGANIZATION body.
 * Consumes the canonical organization company overview (summary-scope
 * authorized) and the canonical published contracts projection. It is an
 * operational cockpit, not a BI dashboard: no score percentages, no invented
 * industry/risk data.
 */
export function PortalCompanyV3() {
  const [company, setCompany] = useState<PortalOrgCompany | null>(null);
  const [contracts, setContracts] = useState<PortalOrgContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setDenied(false);
    setError(false);
    Promise.all([
      getPortalOrganizationCompany().then((result) => setCompany(result)),
      getPortalOrganizationContracts().then((result) => setContracts(result.items || [])).catch(() => setContracts([])),
    ])
      .catch((failure) => {
        if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) setDenied(true);
        else setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadNonce]);

  const refreshCompany = useCallback(() => {
    void getPortalOrganizationCompany().then((result) => setCompany(result)).catch(() => undefined);
  }, []);

  if (loading) {
    return (
      <div aria-label="Vállalat betöltése" data-testid="portal-company-loading" className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
        ))}
      </div>
    );
  }

  if (denied) {
    return (
      <div data-testid="portal-company-v3">
        <PortalEmptyInline>Ez a tartalom nem érhető el ezen az ügyfélfelületen.</PortalEmptyInline>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div data-testid="portal-company-v3">
        <SafePanelError detail="A vállalati áttekintés jelenleg nem tölthető be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="portal-company-v3">
      <header className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-4 sm:px-5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">{company.companyName}</h1>
        {company.profileHeadline ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--adm-text-primary)]">{company.profileHeadline}</p> : null}
        {typeof company.employeeCount === "number" ? (
          <p className="mt-2 text-sm text-[var(--adm-text-secondary)]">Munkavállalók száma: {company.employeeCount}</p>
        ) : null}
      </header>

      <PortalCompanyProfileV3 onProfileUpdated={refreshCompany} />

      <PortalCompanySections company={company} contracts={contracts} />
    </div>
  );
}
