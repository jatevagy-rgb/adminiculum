"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  clientWorkspaceApi,
  ownerDisplayText,
  attentionItemText,
  formatWorkspaceDate,
  type CompanyWorkspaceOverview,
} from "@/lib/clientWorkspaceApi";
import {
  companyFactTypeLabel,
  factVerificationLabel,
  assessmentTypeLabel,
  assessmentStatusLabel,
  initiativeStatusLabel,
  companyMilestoneStatusLabel,
} from "@/lib/clientCompanyApi";
import { contractStatusLabel, contractTypeLabel, obligationStatusLabel } from "@/lib/clientContractsApi";
import { personStatusLabel } from "@/lib/clientOrganizationApi";
import { ComplianceOverviewPanel, ComplianceProposalPanel } from "@/components/clients/compliance/ComplianceOverview";
import { complianceOverviewApi } from "@/lib/complianceOverviewApi";
import type { ComplianceFindingView } from "@/components/clients/compliance/ComplianceOverview";
import { DemoContentBanner } from "@/components/client-portal/PortalPresentationPrimitives";

const labelCls = "rounded bg-white border border-[var(--adm-border)] px-2 py-1 text-xs text-[var(--adm-text-muted)]";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{children}</h2>;
}

function Panel({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5 ${id ? "scroll-mt-24" : ""}`}>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ClientCompanyWorkspace({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [overview, setOverview] = useState<CompanyWorkspaceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [complianceFindings, setComplianceFindings] = useState<ComplianceFindingView[]>([]);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await clientWorkspaceApi.getOverview(clientId));
    } catch {
      setError("A vállalati működés adatai jelenleg nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const loadCompliance = useCallback(async () => {
    setComplianceLoading(true);
    setComplianceError(null);
    try { setComplianceFindings((await complianceOverviewApi.getOverview(clientId)).findings); }
    catch { setComplianceError("A compliance áttekintés jelenleg nem tölthető be."); }
    finally { setComplianceLoading(false); }
  }, [clientId]);

  useEffect(() => { void loadCompliance(); }, [loadCompliance]);

  const activeContracts = (overview?.contracts || []).filter((c) => c.status === 'ACTIVE');
  const openObligations = (overview?.obligations || []).filter((o) => o.status === 'OPEN' || o.status === 'IN_PROGRESS');

  return (
    <div className="space-y-5" data-testid="client-company-workspace">
      <DemoContentBanner enabled={process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_CONTENT_ENABLED === 'true'} />
      <header className="rounded-[var(--adm-radius-md)] border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Vállalati működés</p>
        <h1 className="mt-1 font-serif text-2xl text-[var(--adm-text)]">{clientName}</h1>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
          A cég működésének egyetlen áttekintése: mi történik, mi igényel figyelmet és ki felel érte.
        </p>
        <Link href={`/clients/${clientId}`} className="mt-3 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">
          ← Vissza az ügyfél dossziéhoz
        </Link>
      </header>

      {loading ? <p className="text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      {!loading && !error && overview ? (
        <>
          {/* 1. Figyelmet igényel */}
          <Panel title="Figyelmet igényel">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Azonnali beavatkozás</p>
                {overview.attention.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {overview.attention.map((item) => (
                      <li key={item.code} className="rounded bg-[var(--adm-terracotta-100)] px-3 py-2 text-sm text-[var(--adm-terracotta-950)]">
                        {attentionItemText(item.code, item.count)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Nincs kritikus figyelmet igénylő tétel.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Felelősségi hiányosságok</p>
                {overview.gaps.contractsWithoutOwnerCount + overview.gaps.obligationsWithoutOwnerCount + overview.gaps.inactiveOwnerCount > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {overview.gaps.contractsWithoutOwner.length ? (
                      <li className="rounded bg-[var(--adm-amber-100)] px-3 py-2 text-sm text-[var(--adm-amber-950)]">{attentionItemText('CONTRACTS_WITHOUT_OWNER', overview.gaps.contractsWithoutOwner.length)}</li>
                    ) : null}
                    {overview.gaps.obligationsWithoutOwner.length ? (
                      <li className="rounded bg-[var(--adm-amber-100)] px-3 py-2 text-sm text-[var(--adm-amber-950)]">{attentionItemText('OBLIGATIONS_WITHOUT_OWNER', overview.gaps.obligationsWithoutOwner.length)}</li>
                    ) : null}
                    {overview.gaps.inactiveOwnerPersons.length ? (
                      <li className="rounded bg-[var(--adm-amber-100)] px-3 py-2 text-sm text-[var(--adm-amber-950)]">{attentionItemText('INACTIVE_OWNER_PERSONS', overview.gaps.inactiveOwnerPersons.length)}</li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Minden elemhez aktív felelős van kijelölve.</p>
                )}
              </div>
            </div>
          </Panel>

          {/* 2. Mi változott? */}
          <Panel title="Mi változott?">
            <p className="text-sm text-[var(--adm-text-muted)]">Jelenleg nincs külön változás-összesítő adatforrás.</p>
          </Panel>

          {/* 3. Következő lépés */}
          <Panel title="Következő lépés">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Aktív ügyek</p>
                {overview.cases.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {overview.cases.slice(0, 2).map((c) => (
                      <li key={c.id} className="rounded bg-[var(--adm-surface)] px-3 py-2 text-sm">
                        <Link href={"/cases/" + encodeURIComponent(c.id)} className="text-[var(--adm-ochre-500)] hover:underline font-semibold">{c.title}</Link>
                        <p className="text-xs text-[var(--adm-text-muted)] mt-1">{c.status || 'Folyamatban'}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Nincs aktív ügy a szervezethez.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Határidők</p>
                {overview.obligations.filter(o => o.nextDueDate).length ? (
                  <ul className="mt-2 space-y-1.5">
                    {overview.obligations.filter(o => o.nextDueDate).slice(0, 2).map((o) => (
                      <li key={o.id} className="rounded bg-[var(--adm-surface)] px-3 py-2 text-sm">
                        <b>{o.title}</b>
                        <p className="text-xs text-[var(--adm-terracotta-700)] mt-1">Esedékes: {formatWorkspaceDate(o.nextDueDate)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Nincs közeledő regisztrált határidő.</p>
                )}
              </div>
            </div>
          </Panel>

          {/* 4. Cégprofil */}
          <Panel title="Cégprofil">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {overview.factGroups.map((group) => (
                <div key={group.key}>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{group.label}</p>
                  <ul className="mt-2 space-y-1">
                    {group.facts.map((fact) => (
                      <li key={fact.id} className="flex justify-between text-sm">
                        <span className="text-[var(--adm-text-muted)]">{companyFactTypeLabel(fact.type)}</span>
                        <b className="text-[var(--adm-text)]">{fact.value}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>

          {/* 5. Releváns területek (Compliance) */}
          <Panel id="compliance" title="Releváns területek">
            {complianceLoading ? (
              <p className="text-sm text-[var(--adm-text-muted)]">Területek betöltése...</p>
            ) : complianceError ? (
              <p className="text-sm text-[var(--adm-terracotta-700)]">{complianceError}</p>
            ) : complianceFindings.length > 0 ? (
              <ComplianceOverviewPanel findings={complianceFindings} />
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Belső értékelési megállapítások; nem igazolt jogi kötelezettségek. Nincs megjeleníthető.</p>
            )}
            <div className="mt-4 border-t border-[var(--adm-border)] pt-3">
              <ComplianceProposalPanel clientId={clientId} findings={complianceFindings} />
            </div>
          </Panel>

          {/* 6. Szerződések / kötelezettségek */}
          <Panel title="Szerződések / kötelezettségek">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Szerződések ({overview.contracts.length})</p>
                <ul className="mt-2 space-y-1.5">
                  {overview.contracts.slice(0, 3).map((contract) => (
                    <li key={contract.id} className="rounded bg-[var(--adm-surface)] px-3 py-2 text-sm flex justify-between items-center">
                      <span className="truncate pr-2 font-medium">{contract.title}</span>
                      <span className={labelCls}>{contractStatusLabel(contract.status)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kötelezettségek ({overview.obligations.length})</p>
                <ul className="mt-2 space-y-1.5">
                  {overview.obligations.slice(0, 3).map((obl) => (
                    <li key={obl.id} className="rounded bg-[var(--adm-surface)] px-3 py-2 text-sm flex justify-between items-center">
                      <span className="truncate pr-2 font-medium">{obl.title}</span>
                      <span className={labelCls}>{obligationStatusLabel(obl.status)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>

          {/* 7. Felelősök / kezdeményezések */}
          <Panel title="Felelősök / kezdeményezések">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kulcsszemélyek ({overview.organization.keyPersons.length})</p>
                <ul className="mt-2 space-y-1.5">
                  {overview.organization.keyPersons.slice(0, 3).map((person) => (
                    <li key={person.id} className="rounded bg-[var(--adm-surface)] px-3 py-2 text-sm">
                      <b className="text-[var(--adm-text)]">{person.name}</b>
                      {person.jobTitle ? <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{person.jobTitle}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kezdeményezések ({overview.initiatives.length})</p>
                <ul className="mt-2 space-y-1.5">
                  {overview.initiatives.slice(0, 3).map((init) => (
                    <li key={init.id} className="rounded bg-[var(--adm-surface)] px-3 py-2 text-sm">
                      <b className="text-[var(--adm-text)]">{init.title}</b>
                      <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{initiativeStatusLabel(init.status)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Link href={"/clients/" + encodeURIComponent(clientId) + "/szervezet"} className="mt-3 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">
              Szervezeti részletek megtekintése →
            </Link>
          </Panel>

        </>
      ) : null}
    </div>
  );
}
