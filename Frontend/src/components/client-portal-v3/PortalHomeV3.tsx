"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SafePanelError } from "@/components/ui";
import {
  getPortalActionCenter,
  getPortalOrgHome,
  type PortalActionCenter,
  type PortalActionItem,
  type PortalOrgHome,
} from "@/lib/clientPortalApi";
import { PortalActionRow } from "./actions/PortalActionRow";
import { PortalEmptyInline } from "./shared/PortalEmptyInline";

const URGENCY_ORDER: Record<PortalActionItem["urgency"], number> = { OVERDUE: 0, DUE_SOON: 1, NORMAL: 2 };

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function SectionPanel({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return (
    <section data-testid={testid} className="overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
      <h2 className="border-b border-[var(--adm-border-canonical)] px-4 py-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function CompactSummaryRow({ label, value, href, linkLabel }: { label: string; value: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="text-sm text-[var(--adm-text-secondary)]">{label}</p>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[var(--adm-text-primary)]">{value}</span>
        {href && linkLabel ? (
          <Link href={href} className="text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2">
            {linkLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Client Portal 3.0 ORGANIZATION home — the /portal body. Consumes the
 * canonical org-home read model and the unified Action Center; it never
 * reproduces Action Center source selection client-side.
 */
export function PortalHomeV3({ identityName }: { identityName?: string | null }) {
  const [home, setHome] = useState<PortalOrgHome | null>(null);
  const [actions, setActions] = useState<PortalActionCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [homeError, setHomeError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setHomeError(false);
    setActionError(false);
    Promise.all([
      getPortalOrgHome().then((result) => setHome(result)).catch(() => setHomeError(true)),
      getPortalActionCenter().then((result) => setActions(result)).catch(() => setActionError(true)),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadNonce]);

  const topActions = (actions?.items ?? [])
    .slice()
    .sort((left, right) => URGENCY_ORDER[left.urgency] - URGENCY_ORDER[right.urgency])
    .slice(0, 3);
  const matters = home?.matters ?? [];
  const recentDocuments = (home?.recentDocuments ?? []).slice(0, 3);
  const grow = home?.growSummary;
  const compliance = home?.complianceSummary;
  const customerName = home?.customer?.name || identityName || "Szervezeti ügyfélfelület";

  return (
    <div className="space-y-5" data-testid="portal-home-v3">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">{customerName}</h1>
        <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">Szervezeti ügyfélfelület — az Ön aktuális ügyei és teendői.</p>
      </div>

      {loading ? (
        <div aria-label="Főoldal betöltése" data-testid="portal-home-v3-loading" className="space-y-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
          ))}
        </div>
      ) : null}

      {!loading && actionError && !actions ? (
        <SafePanelError detail="A teendők jelenleg nem tölthetők be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}

      {!loading && !actionError && topActions.length > 0 ? (
        <SectionPanel title="Most Önre vár" testid="portal-home-v3-actions">
          <ul>
            {topActions.map((item) => (
              <PortalActionRow key={item.id} item={item} />
            ))}
          </ul>
          {(actions?.items.length ?? 0) > topActions.length ? (
            <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3">
              <Link href="/portal/teendoim" className="text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2">
                Összes teendő megnyitása
              </Link>
            </div>
          ) : null}
        </SectionPanel>
      ) : null}

      {!loading && !homeError ? (
        <>
          <SectionPanel title="Ügyeink" testid="portal-home-v3-matters">
            {matters.length === 0 ? (
              <div className="px-4 py-3">
                <PortalEmptyInline>Jelenleg nincs közzétett aktív ügy.</PortalEmptyInline>
              </div>
            ) : (
              <ul>
                {matters.slice(0, 3).map((matter, index) => {
                  const targetDate = formatDate(matter.publicTargetDate);
                  return (
                    <li key={matter.matterPublicationId} className="border-b border-[var(--adm-border-canonical)] px-4 py-4 last:border-b-0">
                      <Link
                        href={`/portal/matters/${encodeURIComponent(matter.matterPublicationId)}`}
                        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className={`font-medium text-[var(--adm-text-primary)] ${index === 0 ? "text-base" : "text-sm"}`}>{matter.publicTitle}</p>
                          <p className="text-xs text-[var(--adm-text-secondary)]">{matter.publicReference}</p>
                        </div>
                        <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                          {matter.publicStatus}
                          {matter.waitingOn ? ` · ${matter.waitingOn}` : ""}
                          {targetDate ? ` · Határidő: ${targetDate}` : ""}
                        </p>
                        {index === 0 && matter.nextStep ? <p className="mt-1 text-sm text-[var(--adm-text-primary)]">{matter.nextStep}</p> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionPanel>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionPanel title="Fejlesztés" testid="portal-home-v3-grow">
              {grow && (grow.activeInitiativesCount > 0 || grow.knownProcessesCount > 0) ? (
                <div>
                  <CompactSummaryRow label="Aktív fejlesztési kezdeményezés" value={String(grow.activeInitiativesCount)} />
                  <CompactSummaryRow label="Ismert folyamat" value={String(grow.knownProcessesCount)} />
                  {grow.initiatives.slice(0, 2).map((initiative) => (
                    <div key={initiative.id} className="border-t border-[var(--adm-border-canonical)] px-4 py-3">
                      <p className="text-sm font-medium text-[var(--adm-text-primary)]">{initiative.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">{initiative.statusLabel}</p>
                    </div>
                  ))}
                  <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3">
                    <Link href="/portal/fejlesztes" className="text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2">
                      Fejlesztés megnyitása
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3">
                  <PortalEmptyInline>Jelenleg nincs közzétett fejlesztési adat.</PortalEmptyInline>
                </div>
              )}
            </SectionPanel>

            <SectionPanel title="Megfelelés" testid="portal-home-v3-compliance">
              {compliance && (compliance.attentionCount + compliance.inProgressCount + compliance.noActionExpectedCount) > 0 ? (
                <div>
                  <CompactSummaryRow label="Önre váró megfelelési adatkérés" value={String(compliance.attentionCount)} />
                  <CompactSummaryRow label="Irodai feldolgozás alatt" value={String(compliance.inProgressCount)} />
                  {compliance.topics.slice(0, 2).map((topic) => (
                    <div key={topic.topicId} className="border-t border-[var(--adm-border-canonical)] px-4 py-3">
                      <p className="text-sm font-medium text-[var(--adm-text-primary)]">{topic.topicLabel}</p>
                      {topic.nextAction ? <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">{topic.nextAction}</p> : null}
                    </div>
                  ))}
                  <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3">
                    <Link href="/portal/megfeleles" className="text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2">
                      Megfelelés megnyitása
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3">
                  <PortalEmptyInline>Jelenleg nincs közzétett megfelelési adat.</PortalEmptyInline>
                </div>
              )}
            </SectionPanel>
          </div>

          {recentDocuments.length > 0 ? (
            <SectionPanel title="Legutóbbi dokumentumok" testid="portal-home-v3-documents">
              <ul>
                {recentDocuments.map((document) => (
                  <li key={document.id} className="border-b border-[var(--adm-border-canonical)] px-4 py-3 last:border-b-0">
                    <Link
                      href={`/portal/documents/${encodeURIComponent(document.id)}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                    >
                      <span className="text-sm font-medium text-[var(--adm-text-primary)]">{document.title}</span>
                      <span className="text-xs text-[var(--adm-text-secondary)]">
                        {document.matterTitle ? `${document.matterTitle} · ` : ""}
                        {formatDate(document.publishedAt || null) || ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionPanel>
          ) : null}
        </>
      ) : null}

      {!loading && homeError ? (
        <SafePanelError detail="A főoldal tartalma jelenleg nem tölthető be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}
    </div>
  );
}
