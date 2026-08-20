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
  companyFindingSeverityLabel,
  companyFindingStatusLabel,
  initiativeStatusLabel,
  companyMilestoneStatusLabel,
} from "@/lib/clientCompanyApi";
import { contractStatusLabel, contractTypeLabel, obligationStatusLabel } from "@/lib/clientContractsApi";
import { personStatusLabel } from "@/lib/clientOrganizationApi";

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

  const activeContracts = (overview?.contracts || []).filter((c) => c.status === 'ACTIVE');
  const openObligations = (overview?.obligations || []).filter((o) => o.status === 'OPEN' || o.status === 'IN_PROGRESS');

  return (
    <div className="space-y-5" data-testid="client-company-workspace">
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
          {/* Áttekintés — Mire kell most figyelni? */}
          <Panel title="Áttekintés">
            {overview.attention.length ? (
              <ul className="grid gap-2">
                {overview.attention.map((item) => (
                  <li key={item.code} className="rounded bg-[var(--adm-ivory-100)] px-3 py-2 text-sm text-[var(--adm-text)]">
                    {attentionItemText(item.code, item.count)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Minden lényeges területen kijelölt felelős és friss állapot látható.</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded border border-[var(--adm-border)] bg-white p-3">
                <p className="font-serif text-2xl text-[var(--adm-text)]">{activeContracts.length}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Aktív szerződés</p>
              </div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-3">
                <p className="font-serif text-2xl text-[var(--adm-text)]">{openObligations.length}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Nyitott kötelezettség</p>
              </div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-3">
                <p className="font-serif text-2xl text-[var(--adm-text)]">{overview.assessments.length}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Felmérés</p>
              </div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-3">
                <p className="font-serif text-2xl text-[var(--adm-text)]">{overview.organization.personCount}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Szervezeti személy</p>
              </div>
            </div>
          </Panel>

          {/* Cégkép — profil + csoportosított tények */}
          <Panel title="Cégkép">
            {overview.profile?.summary ? <p className="text-sm text-[var(--adm-text)]">{overview.profile.summary}</p> : null}
            {overview.factGroups.length ? (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {overview.factGroups.map((group) => (
                  <div key={group.key} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{group.label}</p>
                    <ul className="mt-2 space-y-1.5">
                      {[...group.facts]
                        .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent))
                        .map((fact) => (
                          <li key={fact.id} className="text-sm text-[var(--adm-text)]">
                            <span className="text-[var(--adm-text-muted)]">{companyFactTypeLabel(fact.type)}:</span> {fact.value}
                            <span className="ml-1 text-xs text-[var(--adm-text-muted)]">
                              ({factVerificationLabel(fact.verificationStatus)})
                              {!fact.isCurrent ? ` · korábbi (${formatWorkspaceDate(fact.validFrom)})` : ''}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs rögzített cégtény.</p>
            )}
          </Panel>

          {/* Felmérések — eredmények és fontos megállapítások */}
          <Panel title="Felmérések">
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
                      {assessment.findingCount} megállapítás
                      {assessment.completedAt ? ` · lezárva: ${formatWorkspaceDate(assessment.completedAt)}` : ''}
                      {assessment.reviewAt ? ` · felülvizsgálat: ${formatWorkspaceDate(assessment.reviewAt)}` : ''}
                    </p>
                    {assessment.importantFindings.length ? (
                      <ul className="mt-2 space-y-1">
                        {assessment.importantFindings.map((finding) => (
                          <li key={finding.id} className="rounded bg-white px-2 py-1.5 text-sm">
                            <span className="text-[var(--adm-text)]">{finding.title}</span>
                            <span className="ml-2 text-xs text-[var(--adm-text-muted)]">
                              {companyFindingSeverityLabel(finding.severity)} · {companyFindingStatusLabel(finding.status)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Még nincs aktív felmérés.</p>
            )}
          </Panel>

          {/* Szerződések és kötelezettségek */}
          <Panel title="Szerződések és kötelezettségek">
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
                      {contract.partnerName ? `Partner: ${contract.partnerName} · ` : ''}
                      Hatály: {formatWorkspaceDate(contract.effectiveDate)} – {formatWorkspaceDate(contract.expiryDate)}
                      {contract.nextCriticalDate ? ` · Következő dátum: ${formatWorkspaceDate(contract.nextCriticalDate)}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      Ügyféloldali felelős: {ownerDisplayText(contract.businessOwnerDisplay)}
                      {contract.businessOwnerPersonActive === false ? ' (nem aktív)' : ''}
                      {contract.lawFirmOwnerName ? ` · Irodai felelős: ${contract.lawFirmOwnerName}` : ''}
                      {contract.openObligationCount ? ` · Nyitott kötelezettség: ${contract.openObligationCount}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs rögzített szerződés.</p>
            )}

            {openObligations.length ? (
              <div className="mt-4 border-t border-[var(--adm-border)] pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Nyitott kötelezettségek</p>
                <ul className="mt-2 space-y-1.5">
                  {openObligations.map((obligation) => (
                    <li key={obligation.id} className="rounded bg-[var(--adm-ivory-100)] px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <b className="text-[var(--adm-text)]">{obligation.title}</b>
                          <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{obligationStatusLabel(obligation.status)}</span>
                        </div>
                        <span className={labelCls}>Felelős: {ownerDisplayText(obligation.ownerDisplay)}</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                        {obligation.sourceContractTitle ? `Kapcsolt szerződés: ${obligation.sourceContractTitle}` : ''}
                        {obligation.nextDueDate ? ` · Esedékesség: ${formatWorkspaceDate(obligation.nextDueDate)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          {/* Szervezet és felelősségek */}
          <Panel title="Szervezet és felelősségek">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-sm text-[var(--adm-text-muted)]">
                  {overview.organization.groupCount} szervezeti egység · {overview.organization.personCount} személy
                  ({overview.organization.activePersonCount} aktív)
                </p>
                {overview.organization.keyPersons.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {overview.organization.keyPersons.map((person) => (
                      <li key={person.id} className="rounded bg-[var(--adm-surface)] px-3 py-2 text-sm">
                        <b className="text-[var(--adm-text)]">{person.name}</b>
                        {person.jobTitle ? <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{person.jobTitle}</span> : null}
                        <span className="ml-2 text-xs text-[var(--adm-text-muted)]">({personStatusLabel(person.employmentStatus)})</span>
                        {person.groupName ? <p className="text-xs text-[var(--adm-text-muted)]">Egység: {person.groupName}</p> : null}
                        {person.responsibilityLabels.length ? (
                          <p className="text-xs text-[var(--adm-text-muted)]">Felelősség: {person.responsibilityLabels.join(', ')}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--adm-text-muted)]">Még nincs rögzített kulcsfontosságú felelős személy.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Felelősségi hiányosságok</p>
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
                  <p className="text-sm text-[var(--adm-text-muted)]">Minden aktív szerződéshez és nyitott kötelezettséghez van kijelölt felelős.</p>
                ) : (
                  <p className="text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs rögzített szerződés vagy kötelezettség.</p>
                )}
              </div>
            </div>
            <Link href={`/clients/${clientId}#szervezet`} className="mt-3 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">
              Megnyitás a szervezeti részleteknél →
            </Link>
          </Panel>

          {/* Fejlődési terv */}
          <Panel title="Fejlődési terv">
            {overview.initiatives.length ? (
              <ul className="space-y-2">
                {overview.initiatives.map((initiative) => (
                  <li key={initiative.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-[var(--adm-text)]">{initiative.title}</b>
                      <span className={labelCls}>{initiativeStatusLabel(initiative.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      Ügyféloldali felelős: {ownerDisplayText(initiative.clientOwnerDisplay)}
                      {initiative.lawFirmOwnerName ? ` · Irodai felelős: ${initiative.lawFirmOwnerName}` : ''}
                      {initiative.targetAt ? ` · Cél: ${formatWorkspaceDate(initiative.targetAt)}` : ''}
                    </p>
                    {initiative.nextMilestone ? (
                      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                        Következő mérföldkő: {initiative.nextMilestone.title} ({companyMilestoneStatusLabel(initiative.nextMilestone.status)}
                        {initiative.nextMilestone.targetDate ? `, cél: ${formatWorkspaceDate(initiative.nextMilestone.targetDate)}` : ''})
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs rögzített fejlesztési kezdeményezés.</p>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}