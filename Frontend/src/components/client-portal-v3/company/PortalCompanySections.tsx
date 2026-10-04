import Link from "next/link";
import type { PortalOrgCompany, PortalOrgContract } from "@/lib/clientPortalApi";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function SectionPanel({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return (
    <section data-testid={testid} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
      <h2 className="border-b border-[var(--adm-border-canonical)] px-4 py-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="text-sm text-[var(--adm-text-secondary)]">{label}</p>
      <span className="text-sm font-medium text-[var(--adm-text-primary)]">{value}</span>
    </div>
  );
}

const quietLinkClass = "text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2";

/**
 * Organization structure + operations + operating context + milestones +
 * contracts — the non-profile cockpit sections of the V3 company page.
 */
export function PortalCompanySections({ company, contracts }: { company: PortalOrgCompany; contracts: PortalOrgContract[] }) {
  const activeContracts = contracts.filter((contract) => contract.isActive);
  const visibleAreas = company.visibleMattersByArea.filter((area) => area.visibleMatterCount > 0);

  return (
    <>
      <SectionPanel title="Szervezet" testid="portal-company-organization">
        {company.groups.length ? (
          <ul>
            {company.groups.map((group) => (
              <li key={group.id} className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                <p className="text-sm font-medium text-[var(--adm-text-primary)]">{group.name}</p>
                {group.parentGroupId ? <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">Része egy magasabb szintű egységnek.</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-3">
            <PortalEmptyInline>Jelenleg nincs közzétett szervezeti egység.</PortalEmptyInline>
          </div>
        )}
        <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--adm-text-primary)]">Összesen {company.totalVisibleMatterCount} látható közzétett ügy</p>
          {visibleAreas.length ? (
            <ul className="mt-2 space-y-1">
              {visibleAreas.map((area) => (
                <li key={area.areaName} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="text-[var(--adm-text-secondary)]">{area.areaName}</span>
                  <span className="font-medium text-[var(--adm-text-primary)]">{area.visibleMatterCount} közzétett ügy</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </SectionPanel>

      <SectionPanel title="Rendszerek és folyamatok" testid="portal-company-operations">
        {(company.systems ?? []).length === 0 && (company.processes ?? []).length === 0 ? (
          <div className="px-4 py-3">
            <PortalEmptyInline>Jelenleg nincs közzétett rendszer vagy folyamat.</PortalEmptyInline>
          </div>
        ) : (
          <>
            {(company.systems ?? []).length ? (
              <ul>
                {(company.systems ?? []).map((system) => (
                  <li key={system.id} className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                    <p className="text-sm font-medium text-[var(--adm-text-primary)]">{system.name}</p>
                    {system.purpose ? <p className="mt-0.5 break-words text-xs text-[var(--adm-text-secondary)]">{system.purpose}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {(company.processes ?? []).length ? (
              <ul>
                {(company.processes ?? []).map((process) => (
                  <li key={process.id} className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                    <p className="text-sm font-medium text-[var(--adm-text-primary)]">{process.name}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </SectionPanel>

      <SectionPanel title="Kapcsolódó működési áttekintés" testid="portal-company-context">
        {company.documentsSummary ? (
          <SummaryRow label="Közzétett dokumentumok" value={`${company.documentsSummary.visibleDocumentCount} db`} />
        ) : null}
        {company.complianceSummary ? (
          <>
            <SummaryRow label="Megfelelési témakörök" value={String(company.complianceSummary.topicCount)} />
            <SummaryRow label="Öntől várnak további adatot" value={String(company.complianceSummary.moreInformationNeededCount)} />
            <SummaryRow label="Irodai feldolgozás alatt" value={String(company.complianceSummary.actionInProgressCount)} />
          </>
        ) : null}
        {company.developmentSummary ? (
          <>
            <SummaryRow label="Fejlesztési kezdeményezések" value={String(company.developmentSummary.initiativeCount)} />
            <SummaryRow label="Aktív kezdeményezés" value={String(company.developmentSummary.activeInitiativeCount)} />
          </>
        ) : null}
        {company.outcomeSummary ? (
          <SummaryRow label="Eredmények (mért / számított / becsült)" value={`${company.outcomeSummary.measuredCount} / ${company.outcomeSummary.calculatedCount} / ${company.outcomeSummary.estimatedCount}`} />
        ) : null}
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--adm-border-canonical)] px-4 py-3">
          <Link href="/portal/dokumentumok" className={quietLinkClass}>Dokumentumok</Link>
          <Link href="/portal/fejlesztes" className={quietLinkClass}>Fejlesztés</Link>
          <Link href="/portal/megfeleles" className={quietLinkClass}>Megfelelés</Link>
        </div>
      </SectionPanel>

      <SectionPanel title="Közzétett vállalati mérföldkövek" testid="portal-company-milestones">
        {company.milestones.length ? (
          <ul>
            {company.milestones.map((milestone) => (
              <li key={milestone.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                <p className="text-sm font-medium text-[var(--adm-text-primary)]">{milestone.title}</p>
                {milestone.date ? <p className="text-xs text-[var(--adm-text-secondary)]">{formatDate(milestone.date)}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-3">
            <PortalEmptyInline>Az iroda még nem tett közzé vállalati mérföldkövet.</PortalEmptyInline>
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="Szerződések" testid="portal-company-contracts">
        {contracts.length ? (
          <ul>
            {activeContracts.slice(0, 3).map((contract) => (
              <li key={contract.reference} className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--adm-text-primary)]">{contract.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">
                      {contract.statusLabel}
                      {contract.relatedMatterTitle ? ` · ${contract.relatedMatterTitle}` : ""}
                      {contract.keyDate ? ` · Kulcsdátum: ${formatDate(contract.keyDate)}` : ""}
                      {contract.expiryDate ? ` · Lejárat: ${formatDate(contract.expiryDate)}` : ""}
                    </p>
                    {contract.expiresThisMonth && contract.expiryDate ? (
                      <p className="mt-1 text-xs font-semibold text-[var(--adm-brand-terracotta)]">Ebben a hónapban lejár</p>
                    ) : null}
                  </div>
                  {contract.publishedDoc?.downloadAvailable ? (
                    <Link
                      href={`/portal/documents/${encodeURIComponent(contract.publishedDoc.publicationId)}`}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-brand-green)] transition-colors hover:bg-[var(--adm-brand-green)] hover:text-[var(--adm-canvas-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                    >
                      Dokumentum megnyitása
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-3">
            <PortalEmptyInline>Jelenleg nincs közzétett szerződés.</PortalEmptyInline>
          </div>
        )}
        <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3">
          <Link href="/portal/szerzodesek" className={quietLinkClass}>Szerződések megnyitása</Link>
        </div>
      </SectionPanel>
    </>
  );
}
