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

function SectionPanel({
  title,
  children,
  testid,
  accent,
  badge,
  action,
}: {
  title: string;
  children: React.ReactNode;
  testid?: string;
  accent?: "green" | "none";
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section
      data-testid={testid}
      className={`overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] shadow-sm transition-shadow hover:shadow-md ${
        accent === "green" ? "border-l-4 border-l-[var(--adm-brand-green)]" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-[var(--adm-border-canonical)] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-xl">
            {title}
          </h2>
          {badge}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CompactSummaryRow({ label, value, href, linkLabel }: { label: string; value: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 transition-colors hover:bg-[var(--adm-canvas-subtle)]/40">
      <p className="text-sm text-[var(--adm-text-secondary)]">{label}</p>
      <div className="flex items-center gap-3">
        <span className="rounded-[6px] bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 text-xs font-semibold text-[var(--adm-text-primary)] border border-[var(--adm-border-canonical)]">
          {value}
        </span>
        {href && linkLabel ? (
          <Link
            href={href}
            className="text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
          >
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
      getPortalOrgHome()
        .then((result) => setHome(result))
        .catch(() => {
          // A failed refresh must never leave the previous identity's success
          // on screen: clear and surface the error state instead.
          setHome(null);
          setHomeError(true);
        }),
      getPortalActionCenter()
        .then((result) => setActions(result))
        .catch(() => {
          // Same for the independent action API: failure is unknown, never
          // stale success or a fabricated zero.
          setActions(null);
          setActionError(true);
        }),
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
  // The only authoritative "featured matter" fact is the server-resolved
  // currentMatter (prefers OWN, then latest published update). Card order is
  // presentation only and never implies priority.
  const featuredMatterId = home?.currentMatter?.publicationId ?? null;
  // The complete granted+published matter count is canonical; the preview
  // array length is only used as a fallback for older backends.
  const mattersTotalShown = home?.mattersTotal ?? matters.length;
  const actionsTrusted = !actionError && actions !== null;
  const overdueCount = actionsTrusted ? (actions?.items ?? []).filter((item) => item.urgency === "OVERDUE").length : 0;

  return (
    <div className="space-y-6" data-testid="portal-home-v3">
      {/* Executive Welcome Card */}
      <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--adm-brand-green)]" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-brand-green)]">
                Szervezeti ügyfélfelület
              </span>
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
              {customerName}
            </h1>
            <p className="text-sm text-[var(--adm-text-secondary)]">
              Szervezeti ügyfélfelület — az Ön aktuális ügyei és teendői.
            </p>
          </div>
          {!loading && !homeError ? (
            <div className="flex items-center gap-2 sm:gap-3" data-testid="portal-home-v3-stats">
              <div className="flex min-w-[5.5rem] flex-col items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-2 text-center">
                <span className="text-lg font-bold text-[var(--adm-brand-deep)]">{mattersTotalShown}</span>
                <span className="text-[11px] font-medium text-[var(--adm-text-secondary)]">Közzétett ügy</span>
              </div>
              {actionsTrusted ? (
                <>
                  <div className="flex min-w-[5.5rem] flex-col items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-2 text-center">
                    <span className="text-lg font-bold text-[var(--adm-brand-green)]">{actions?.items.length ?? 0}</span>
                    <span className="text-[11px] font-medium text-[var(--adm-text-secondary)]">Teendő</span>
                  </div>
                  {overdueCount > 0 ? (
                    <div className="flex min-w-[5.5rem] flex-col items-center justify-center rounded-[8px] border border-[var(--adm-brand-terracotta)]/40 bg-[var(--adm-canvas-subtle)] px-3 py-2 text-center">
                      <span className="text-lg font-bold text-[var(--adm-brand-terracotta)]">{overdueCount}</span>
                      <span className="text-[11px] font-medium text-[var(--adm-brand-terracotta)]">Lejárt</span>
                    </div>
                  ) : null}
                </>
              ) : !loading ? (
                <button
                  type="button"
                  onClick={() => setReloadNonce((value) => value + 1)}
                  className="flex min-h-10 min-w-[5.5rem] flex-col items-center justify-center rounded-[8px] border border-dashed border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-2 text-center hover:bg-[var(--adm-canvas-subtle)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                  data-testid="portal-home-v3-actions-unavailable"
                >
                  <span className="text-xs font-bold text-[var(--adm-text-secondary)]">Teendők nem érhetők el</span>
                  <span className="text-[11px] font-semibold text-[var(--adm-brand-green)]">Újra</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div aria-label="Főoldal betöltése" data-testid="portal-home-v3-loading" className="space-y-4">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-28 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
          ))}
        </div>
      ) : null}

      {!loading && actionError && !actions ? (
        <SafePanelError detail="A teendők jelenleg nem tölthetők be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}

      {!loading && !actionError && topActions.length > 0 ? (
        <SectionPanel title="Most Önre vár" testid="portal-home-v3-actions"
          accent="green"
          badge={
            <span className="inline-flex items-center rounded-[6px] border border-[var(--adm-brand-green)]/30 bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 text-xs font-semibold text-[var(--adm-brand-green)]">
              {actions?.items.length ?? topActions.length} teendő
            </span>
          }
          action={
            <Link
              href="/portal/teendoim"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
            >
              <span>Megnyitás</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          }
        >
          <ul className="divide-y divide-[var(--adm-border-canonical)]">
            {topActions.map((item) => (
              <PortalActionRow key={item.id} item={item} />
            ))}
          </ul>
          {(actions?.items.length ?? 0) > topActions.length ? (
            <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3 sm:px-5">
              <Link
                href="/portal/teendoim"
                className="inline-flex h-10 items-center justify-center text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 sm:flex-row"
              >
                Összes teendő megnyitása &rarr;
              </Link>
            </div>
          ) : null}
        </SectionPanel>
      ) : null}

      {!loading && !homeError ? (
        <>
          <SectionPanel
            title="Ügyeink"
            testid="portal-home-v3-matters"
            action={
              matters.length > 0 ? (
                <Link
                  href="/portal/ugyek"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                >
                  <span>Összes ügy</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              ) : null
            }
          >
            {matters.length === 0 ? (
              <div className="px-4 py-4 sm:px-5">
                <PortalEmptyInline>Jelenleg nincs közzétett aktív ügy.</PortalEmptyInline>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--adm-border-canonical)]">
                {matters.slice(0, 3).map((matter) => {
                  const targetDate = formatDate(matter.publicTargetDate);
                  const isFeatured = featuredMatterId !== null && matter.matterPublicationId === featuredMatterId;
                  return (
                    <li
                      key={matter.matterPublicationId}
                      className={`p-4 transition-colors hover:bg-[var(--adm-canvas-subtle)]/40 sm:p-5 ${
                        isFeatured ? "bg-[var(--adm-canvas-subtle)]/20" : ""
                      }`}
                    >
                      <Link
                        href={`/portal/matters/${encodeURIComponent(matter.matterPublicationId)}`}
                        className="block rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                          <div className="flex items-center gap-2">
                            {isFeatured ? (
                              <span className="inline-flex items-center rounded-[6px] border border-[var(--adm-brand-green)]/30 bg-[var(--adm-canvas-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--adm-brand-green)]">
                                Kiemelt ügy
                              </span>
                            ) : null}
                            <p
                              className={`font-semibold text-[var(--adm-text-primary)] hover:text-[var(--adm-brand-green)] transition-colors ${
                                isFeatured ? "text-base sm:text-lg" : "text-sm"
                              }`}
                            >
                              {matter.publicTitle}
                            </p>
                          </div>
                          <span className="rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-2 py-0.5 text-xs font-mono font-medium text-[var(--adm-text-secondary)]">
                            {matter.publicReference}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--adm-text-secondary)]">
                          <span className="inline-flex items-center rounded-[6px] bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 font-medium text-[var(--adm-text-primary)]">
                            {matter.publicStatus}
                          </span>
                          {matter.waitingOn ? (
                            <span className="inline-flex items-center gap-1 font-medium text-[var(--adm-text-secondary)]">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--adm-semantic-warning)]" />
                              {matter.waitingOn}
                            </span>
                          ) : null}
                          {targetDate ? (
                            <span className="font-medium text-[var(--adm-text-secondary)]">
                              Határidő: {targetDate}
                            </span>
                          ) : null}
                        </div>
                        {isFeatured && matter.nextStep ? (
                          <div className="mt-3 flex items-start gap-2 rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)]/70 px-3 py-2">
                            <span className="shrink-0 text-xs font-bold text-[var(--adm-brand-green)]">
                              Következő lépés:
                            </span>
                            <p className="text-sm font-medium text-[var(--adm-text-primary)]">{matter.nextStep}</p>
                          </div>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionPanel>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionPanel
              title="Fejlesztés"
              testid="portal-home-v3-grow"
              action={
                <Link
                  href="/portal/fejlesztes"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                >
                  <span>Megnyitás</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              }
            >
              {grow && (grow.activeInitiativesCount > 0 || grow.knownProcessesCount > 0) ? (
                <div>
                  <CompactSummaryRow label="Aktív fejlesztési kezdeményezés" value={String(grow.activeInitiativesCount)} />
                  <CompactSummaryRow label="Ismert folyamat" value={String(grow.knownProcessesCount)} />
                  {grow.initiatives.slice(0, 2).map((initiative) => (
                    <div key={initiative.id} className="border-t border-[var(--adm-border-canonical)] px-4 py-3 sm:px-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{initiative.title}</p>
                        <span className="rounded-[6px] border border-[var(--adm-brand-green)]/30 bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 text-xs font-semibold text-[var(--adm-brand-green)]">
                          {initiative.statusLabel}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3 sm:px-5">
                    <Link
                      href="/portal/fejlesztes"
                      className="inline-flex h-10 items-center justify-center text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 sm:flex-row"
                    >
                      Fejlesztés megnyitása &rarr;
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 sm:px-5">
                  <PortalEmptyInline>Jelenleg nincs közzétett fejlesztési adat.</PortalEmptyInline>
                </div>
              )}
            </SectionPanel>

            <SectionPanel
              title="Megfelelés"
              testid="portal-home-v3-compliance"
              action={
                <Link
                  href="/portal/megfeleles"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                >
                  <span>Megnyitás</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              }
            >
              {compliance && (compliance.attentionCount + compliance.inProgressCount + compliance.noActionExpectedCount) > 0 ? (
                <div>
                  <CompactSummaryRow label="Önre váró megfelelési adatkérés" value={String(compliance.attentionCount)} />
                  <CompactSummaryRow label="Irodai feldolgozás alatt" value={String(compliance.inProgressCount)} />
                  {compliance.topics.slice(0, 2).map((topic) => (
                    <div key={topic.topicId} className="border-t border-[var(--adm-border-canonical)] px-4 py-3 sm:px-5">
                      <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{topic.topicLabel}</p>
                      {topic.nextAction ? (
                        <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                          Következő teendő: {topic.nextAction}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3 sm:px-5">
                    <Link
                      href="/portal/megfeleles"
                      className="inline-flex h-10 items-center justify-center text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 sm:flex-row"
                    >
                      Megfelelés megnyitása &rarr;
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 sm:px-5">
                  <PortalEmptyInline>Jelenleg nincs közzétett megfelelési adat.</PortalEmptyInline>
                </div>
              )}
            </SectionPanel>
          </div>

          {recentDocuments.length > 0 ? (
            <SectionPanel
              title="Legutóbbi dokumentumok"
              testid="portal-home-v3-documents"
              action={
                <Link
                  href="/portal/dokumentumok"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                >
                  <span>Összes dokumentum</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              }
            >
              <ul className="divide-y divide-[var(--adm-border-canonical)]">
                {recentDocuments.map((document) => (
                  <li key={document.id} className="transition-colors hover:bg-[var(--adm-canvas-subtle)]/40">
                    <Link
                      href={`/portal/documents/${encodeURIComponent(document.id)}`}
                      className="flex flex-col gap-1 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-secondary)]">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-[var(--adm-text-primary)] hover:text-[var(--adm-brand-green)] transition-colors">
                          {document.title}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-[var(--adm-text-secondary)] sm:text-right">
                        {document.matterTitle ? `${document.matterTitle} · ` : ""}
                        {formatDate(document.publishedAt || null) || ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="border-t border-[var(--adm-border-canonical)] px-4 py-3 sm:px-5">
                <Link
                  href="/portal/dokumentumok"
                  className="inline-flex h-10 items-center justify-center text-sm font-medium text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 sm:flex-row"
                >
                  Összes dokumentum megnyitása &rarr;
                </Link>
              </div>
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
