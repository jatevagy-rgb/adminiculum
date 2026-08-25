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
import { DemoContentBanner } from "@/components/client-portal/PortalPresentationPrimitives";
import type { ComplianceFindingView } from "@/components/clients/compliance/ComplianceOverview";

const labelCls = "rounded bg-white border border-[var(--adm-border)] px-2 py-1 text-xs text-[var(--adm-text-muted)]";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{children}</h2>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5">
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
      setError("A vĂˇllalati mĹ±kĂ¶dĂ©s adatai jelenleg nem tĂ¶lthetĹ‘k be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const loadCompliance = useCallback(async () => {
    setComplianceLoading(true);
    setComplianceError(null);
    try { setComplianceFindings((await complianceOverviewApi.getOverview(clientId)).findings); }
    catch { setComplianceError("A compliance ĂˇttekintĂ©s jelenleg nem tĂ¶lthetĹ‘ be."); }
    finally { setComplianceLoading(false); }
  }, [clientId]);

  useEffect(() => { void loadCompliance(); }, [loadCompliance]);

  const activeContracts = (overview?.contracts || []).filter((c) => c.status === 'ACTIVE');
  const openObligations = (overview?.obligations || []).filter((o) => o.status === 'OPEN' || o.status === 'IN_PROGRESS');

  return (
    <div className="space-y-5" data-testid="client-company-workspace">
      <DemoContentBanner enabled={process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_CONTENT_ENABLED === 'true' || clientName.includes('Demo Kft')} />
      <header className="rounded-[var(--adm-radius-md)] border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">VĂˇllalati mĹ±kĂ¶dĂ©s</p>
        <h1 className="mt-1 font-serif text-2xl text-[var(--adm-text)]">{clientName}</h1>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
          A cĂ©g mĹ±kĂ¶dĂ©sĂ©nek egyetlen ĂˇttekintĂ©se: mi tĂ¶rtĂ©nik, mi igĂ©nyel figyelmet Ă©s ki felel Ă©rte.
        </p>
        <Link href={`/clients/${clientId}`} className="mt-3 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">
          â† Vissza az ĂĽgyfĂ©l dossziĂ©hoz
        </Link>
      </header>

      {loading ? <p className="text-sm text-[var(--adm-text-muted)]">BetĂ¶ltĂ©sâ€¦</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      {!loading && !error && overview ? (
        <>
          {/* ĂttekintĂ©s â€” Mire kell most figyelni? */}
          <Panel title="ĂttekintĂ©s">
            {overview.attention.length ? (
              <ul className="grid gap-2">
                {overview.attention.map((item) => (
                  <li key={item.code} className="rounded bg-[var(--adm-ivory-100)] px-3 py-2 text-sm text-[var(--adm-text)]">
                    {attentionItemText(item.code, item.count)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Minden lĂ©nyeges terĂĽleten kijelĂ¶lt felelĹ‘s Ă©s friss Ăˇllapot lĂˇthatĂł.</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded border border-[var(--adm-border)] bg-white p-3">
                <p className="font-serif text-2xl text-[var(--adm-text)]">{activeContracts.length}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">AktĂ­v szerzĹ‘dĂ©s</p>
              </div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-3">
                <p className="font-serif text-2xl text-[var(--adm-text)]">{openObligations.length}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Nyitott kĂ¶telezettsĂ©g</p>
              </div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-3">
                <p className="font-serif text-2xl text-[var(--adm-text)]">{overview.assessments.length}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">FelmĂ©rĂ©s</p>
              </div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-3">
                <p className="font-serif text-2xl text-[var(--adm-text)]">{overview.organization.personCount}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Szervezeti szemĂ©ly</p>
              </div>
            </div>
          </Panel>

          {/* CĂ©gkĂ©p â€” profil + csoportosĂ­tott tĂ©nyek */}
          <Panel title="CĂ©gkĂ©p">
            {overview.profile?.summary ? <p className="text-sm text-[var(--adm-text)]">{overview.profile.summary}</p> : null}
            {overview.factGroups.length ? (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {overview.factGroups.map((group) => (
                  <div key={group.key} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{group.label}</p>
                    <ul className="mt-2 space-y-1.5">
                      {group.facts.map((fact) => (
                        <li key={fact.id} className="text-sm text-[var(--adm-text)]">
                          <span className="text-[var(--adm-text-muted)]">{companyFactTypeLabel(fact.type)}:</span> {fact.value}
                          <span className="ml-1 text-xs text-[var(--adm-text-muted)]">({factVerificationLabel(fact.verificationStatus)}{fact.isCurrent ? '' : ' Â· korĂˇbbi vagy jĂ¶vĹ‘beli adat'})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Ehhez az ĂĽgyfĂ©lhez mĂ©g nincs rĂ¶gzĂ­tett cĂ©gtĂ©ny.</p>
            )}
          </Panel>

          {/* FelmĂ©rĂ©sek â€” eredmĂ©nyek Ă©s fontos megĂˇllapĂ­tĂˇsok */}
          <Panel title="FelmĂ©rĂ©sek">
            <p className="mb-3 text-xs text-[var(--adm-text-muted)]">
              BelsĹ‘ Ă©rtĂ©kelĂ©si megĂˇllapĂ­tĂˇsok; nem igazolt jogi kĂ¶telezettsĂ©gek.
            </p>
            {overview.assessments.length ? (
              <ul className="space-y-2">
                {overview.assessments.map((assessment) => (
                  <li key={assessment.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <b className="text-[var(--adm-text)]">{assessment.title}</b>
                        <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{assessmentTypeLabel(assessment.type)}</span>
                      </div>
                      <span className={labelCls}>{assessmentStatusLabel(assessment.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      {assessment.findingCount} megĂˇllapĂ­tĂˇs
                      {assessment.completedAt ? ` Â· lezĂˇrva: ${formatWorkspaceDate(assessment.completedAt)}` : ''}
                      {assessment.reviewAt ? ` Â· felĂĽlvizsgĂˇlat: ${formatWorkspaceDate(assessment.reviewAt)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">MĂ©g nincs aktĂ­v felmĂ©rĂ©s.</p>
            )}
          </Panel>

          <ComplianceOverviewPanel findings={complianceFindings} loading={complianceLoading} error={complianceError} onRetry={loadCompliance} />
          <ComplianceProposalPanel clientId={clientId} findings={complianceFindings} />

          {/* SzerzĹ‘dĂ©sek Ă©s kĂ¶telezettsĂ©gek */}
          <Panel title="SzerzĹ‘dĂ©sek Ă©s kĂ¶telezettsĂ©gek">
            {overview.contracts.length ? (
              <ul className="space-y-2">
                {overview.contracts.map((contract) => (
                  <li key={contract.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <b className="text-[var(--adm-text)]">{contract.title}</b>
                        <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{contractTypeLabel(contract.contractType)}</span>
                      </div>
                      <span className={labelCls}>{contractStatusLabel(contract.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      {contract.counterpartySummary ? `SzerzĹ‘dĹ‘ fĂ©l/felek: ${contract.counterpartySummary} Â· ` : ''}
                      HatĂˇly: {formatWorkspaceDate(contract.effectiveDate)} â€“ {formatWorkspaceDate(contract.expiryDate)}
                      {contract.nextCriticalDate ? ` Â· KĂ¶vetkezĹ‘ dĂˇtum: ${formatWorkspaceDate(contract.nextCriticalDate)}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      ĂśgyfĂ©loldali felelĹ‘s: {ownerDisplayText(contract.businessOwnerDisplay)}
                      {contract.businessOwnerPersonActive === false ? ' (nem aktĂ­v)' : ''}
                      {contract.lawFirmOwnerName ? ` Â· Irodai felelĹ‘s: ${contract.lawFirmOwnerName}` : ''}
                      {contract.openObligationCount ? ` Â· Nyitott kĂ¶telezettsĂ©g: ${contract.openObligationCount}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Ehhez az ĂĽgyfĂ©lhez mĂ©g nincs rĂ¶gzĂ­tett szerzĹ‘dĂ©s.</p>
            )}

            {openObligations.length ? (
              <div className="mt-4 border-t border-[var(--adm-border)] pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Nyitott kĂ¶telezettsĂ©gek</p>
                <ul className="mt-2 space-y-1.5">
                  {openObligations.map((obligation) => (
                    <li key={obligation.id} className="rounded bg-[var(--adm-ivory-100)] px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <b className="text-[var(--adm-text)]">{obligation.title}</b>
                          <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{obligationStatusLabel(obligation.status)}</span>
                        </div>
                        <span className={labelCls}>FelelĹ‘s: {ownerDisplayText(obligation.ownerDisplay)}{obligation.ownerPersonActive === false ? ' (nem aktĂ­v)' : ''}</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                        {obligation.sourceContractTitle ? `Kapcsolt szerzĹ‘dĂ©s: ${obligation.sourceContractTitle}` : ''}
                        {obligation.nextDueDate ? ` Â· EsedĂ©kessĂ©g: ${formatWorkspaceDate(obligation.nextDueDate)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          {/* Szervezet Ă©s felelĹ‘ssĂ©gek */}
          <Panel title="Szervezet Ă©s felelĹ‘ssĂ©gek">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-sm text-[var(--adm-text-muted)]">
                  {overview.organization.groupCount} szervezeti egysĂ©g Â· {overview.organization.personCount} szemĂ©ly
                  ({overview.organization.activePersonCount} aktĂ­v)
                </p>
                {overview.organization.keyPersons.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {overview.organization.keyPersons.map((person) => (
                      <li key={person.id} className="rounded bg-[var(--adm-surface)] px-3 py-2 text-sm">
                        <b className="text-[var(--adm-text)]">{person.name}</b>
                        {person.jobTitle ? <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{person.jobTitle}</span> : null}
                        <span className="ml-2 text-xs text-[var(--adm-text-muted)]">({personStatusLabel(person.employmentStatus)})</span>
                        {person.groupName ? <p className="text-xs text-[var(--adm-text-muted)]">EgysĂ©g: {person.groupName}</p> : null}
                        {person.responsibilityLabels.length ? (
                          <p className="text-xs text-[var(--adm-text-muted)]">FelelĹ‘ssĂ©g: {person.responsibilityLabels.join(', ')}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--adm-text-muted)]">MĂ©g nincs rĂ¶gzĂ­tett kulcsfontossĂˇgĂş felelĹ‘s szemĂ©ly.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">FelelĹ‘ssĂ©gi hiĂˇnyossĂˇgok</p>
                {overview.gaps.contractsWithoutOwnerCount + overview.gaps.obligationsWithoutOwnerCount + overview.gaps.inactiveOwnerCount > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {overview.gaps.contractsWithoutOwner.length ? (
                      <li className="text-sm text-[var(--adm-text)]">{attentionItemText('CONTRACTS_WITHOUT_OWNER', overview.gaps.contractsWithoutOwner.length)}</li>
                    ) : null}
                    {overview.gaps.obligationsWithoutOwner.length ? (
                      <li className="text-sm text-[var(--adm-text)]">{attentionItemText('OBLIGATIONS_WITHOUT_OWNER', overview.gaps.obligationsWithoutOwner.length)}</li>
                    ) : null}
                    {overview.gaps.inactiveOwnerPersons.length ? (
                      <li className="text-sm text-[var(--adm-text)]">{attentionItemText('INACTIVE_OWNER_PERSONS', overview.gaps.inactiveOwnerPersons.length)}</li>
                    ) : null}
                  </ul>
                ) : overview.contracts.length || overview.obligations.length ? (
                  <p className="text-sm text-[var(--adm-text-muted)]">Minden aktĂ­v szerzĹ‘dĂ©shez Ă©s nyitott kĂ¶telezettsĂ©ghez van kijelĂ¶lt felelĹ‘s.</p>
                ) : (
                  <p className="text-sm text-[var(--adm-text-muted)]">Ehhez az ĂĽgyfĂ©lhez mĂ©g nincs rĂ¶gzĂ­tett szerzĹ‘dĂ©s vagy kĂ¶telezettsĂ©g.</p>
                )}
              </div>
            </div>
            <Link href={`/clients/${clientId}#szervezet`} className="mt-3 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">
              MegnyitĂˇs a szervezeti rĂ©szleteknĂ©l â†’
            </Link>
          </Panel>

          {/* FejlĹ‘dĂ©si terv */}
          <Panel title="FejlĹ‘dĂ©si terv">
            {overview.initiatives.length ? (
              <ul className="space-y-2">
                {overview.initiatives.map((initiative) => (
                  <li key={initiative.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-[var(--adm-text)]">{initiative.title}</b>
                      <span className={labelCls}>{initiativeStatusLabel(initiative.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      ĂśgyfĂ©loldali felelĹ‘s: {ownerDisplayText(initiative.clientOwnerDisplay)}{initiative.clientOwnerPersonActive === false ? ' (nem aktĂ­v)' : ''}
                      {initiative.lawFirmOwnerName ? ` Â· Irodai felelĹ‘s: ${initiative.lawFirmOwnerName}` : ''}
                      {initiative.targetAt ? ` Â· CĂ©l: ${formatWorkspaceDate(initiative.targetAt)}` : ''}
                    </p>
                    {initiative.nextMilestone ? (
                      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                        KĂ¶vetkezĹ‘ mĂ©rfĂ¶ldkĹ‘: {initiative.nextMilestone.title} ({companyMilestoneStatusLabel(initiative.nextMilestone.status)}
                        {initiative.nextMilestone.targetDate ? `, cĂ©l: ${formatWorkspaceDate(initiative.nextMilestone.targetDate)}` : ''})
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Ehhez az ĂĽgyfĂ©lhez mĂ©g nincs rĂ¶gzĂ­tett fejlesztĂ©si kezdemĂ©nyezĂ©s.</p>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

