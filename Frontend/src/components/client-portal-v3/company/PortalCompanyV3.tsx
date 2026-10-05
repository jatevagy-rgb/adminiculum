"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { SafePanelError } from "@/components/ui";
import {
  getPortalOrganizationCompany,
  getPortalOrganizationContracts,
  type PortalOrgCompany,
  type PortalOrgContract,
} from "@/lib/clientPortalApi";
import { ApiError } from "@/lib/api";
import { PortalCompanyProfileV3 } from "./PortalCompanyProfileV3";
import { PortalCompanySections } from "./PortalCompanySections";

/**
 * Client Portal 3.0 company cockpit — the /portal/vallalat ORGANIZATION body.
 * Consumes the canonical organization company overview (summary-scope
 * authorized) and the canonical published contracts projection. It is an
 * operational cockpit, not a BI dashboard: no score percentages, no invented
 * industry/risk data.
 *
 * The authorization gate stays in the backend. This surface only classifies the
 * denial truthfully: the known organization summary-scope denial gets a
 * restrained, recoverable restricted-access state, while authentication,
 * not-found, service-unavailable and unexpected failures stay distinct.
 */

const RESTRICTED_SCOPE_CODE = "CLIENT_SUMMARY_SCOPE_FORBIDDEN";

type CompanyLoadFailure =
  | "RESTRICTED"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "ERROR";

/**
 * Maps a read failure to its customer-safe presentation. Only the canonical
 * organization summary-scope denial (403 + CLIENT_SUMMARY_SCOPE_FORBIDDEN) maps
 * to the restricted-access state; every other failure keeps its own semantics.
 */
export function classifyCompanyFailure(failure: unknown): CompanyLoadFailure {
  if (failure instanceof ApiError) {
    if (failure.status === 403 && failure.code === RESTRICTED_SCOPE_CODE) return "RESTRICTED";
    if (failure.status === 401) return "UNAUTHENTICATED";
    if (failure.status === 404) return "NOT_FOUND";
    if (failure.status === 503) return "UNAVAILABLE";
  }
  return "ERROR";
}

const STATE_CARD =
  "rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-5 sm:px-5";
const PRIMARY_ACTION =
  "inline-flex h-10 items-center rounded-[8px] bg-[var(--adm-brand-green)] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2";

/**
 * Low-profile truthful state card shared by the authentication, not-found and
 * service-unavailable presentations. Copy stays customer-safe: no internal
 * codes, scope names, membership identifiers or permission names.
 */
function CompanyStateCard({
  testId,
  title,
  children,
}: {
  testId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={STATE_CARD} data-testid={testId}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">Vállalat</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)]">{title}</h1>
      <div className="mt-2 space-y-4 text-sm leading-6 text-[var(--adm-text-secondary)]">{children}</div>
    </section>
  );
}

function BackToOverview() {
  return (
    <Link href="/portal" className={PRIMARY_ACTION}>
      Vissza az áttekintéshez
    </Link>
  );
}

export function PortalCompanyV3() {
  const [company, setCompany] = useState<PortalOrgCompany | null>(null);
  const [contracts, setContracts] = useState<PortalOrgContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<CompanyLoadFailure | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setFailure(null);
    Promise.all([
      getPortalOrganizationCompany().then((result) => setCompany(result)),
      getPortalOrganizationContracts().then((result) => setContracts(result.items || [])).catch(() => setContracts([])),
    ])
      .catch((rejection) => setFailure(classifyCompanyFailure(rejection)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadNonce]);

  const retry = useCallback(() => setReloadNonce((value) => value + 1), []);

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

  if (failure === "RESTRICTED") {
    return (
      <div data-testid="portal-company-v3">
        <CompanyStateCard testId="portal-company-restricted" title="A vállalati áttekintés nem érhető el">
          <p>A vállalati áttekintés a jelenlegi hozzáférésével nem érhető el.</p>
          <BackToOverview />
        </CompanyStateCard>
      </div>
    );
  }

  if (failure === "UNAUTHENTICATED") {
    return (
      <div data-testid="portal-company-v3">
        <CompanyStateCard testId="portal-company-unauthenticated" title="A vállalati áttekintés nem jeleníthető meg">
          <p>A munkamenet nem érvényes. Jelentkezzen be újra, majd nyissa meg ismét ezt az oldalt.</p>
          <BackToOverview />
        </CompanyStateCard>
      </div>
    );
  }

  if (failure === "NOT_FOUND") {
    return (
      <div data-testid="portal-company-v3">
        <CompanyStateCard testId="portal-company-not-found" title="A vállalati áttekintés nem található">
          <p>A keresett vállalati áttekintés nem található vagy már nem elérhető.</p>
          <BackToOverview />
        </CompanyStateCard>
      </div>
    );
  }

  if (failure === "UNAVAILABLE") {
    return (
      <div data-testid="portal-company-v3">
        <CompanyStateCard testId="portal-company-unavailable" title="A vállalati áttekintés átmenetileg nem érhető el">
          <p>A szolgáltatás jelenleg nem elérhető. Kérjük, próbálja újra később.</p>
          <button type="button" onClick={retry} className={PRIMARY_ACTION}>
            Újrapróbálás
          </button>
        </CompanyStateCard>
      </div>
    );
  }

  if (failure === "ERROR" || !company) {
    return (
      <div data-testid="portal-company-v3">
        <SafePanelError detail="A vállalati áttekintés jelenleg nem tölthető be. Próbálja újra." onRetry={retry} />
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
