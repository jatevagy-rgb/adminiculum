"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SafePanelError } from "@/components/ui";
import {
  getPortalActionCenter,
  getPortalMatter,
  getPortalOrganizationCase,
  getPortalOrganizationCases,
  type PortalActionItem,
  type PortalDocument,
  type PortalOrganizationCaseDetail,
  type PortalSafeUpdate,
} from "@/lib/clientPortalApi";
import { clientSafeError, customerInteractionApi } from "@/lib/clientInteractionApi";
import { PortalRequestDetailV3 } from "../request/PortalRequestDetailV3";
import { PortalInteractionCardV3 } from "../interaction/PortalInteractionCardV3";
import { PortalActionRow } from "../actions/PortalActionRow";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";
import { PortalMatterDocumentsSection, PortalMatterUpdatesSection } from "./PortalMatterSections";
import { PortalMatterMilestones } from "./PortalMatterMilestones";
import { PortalMatterStatusTrack } from "./PortalMatterStatusTrack";

type FullMatter = Awaited<ReturnType<typeof getPortalMatter>>;

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Client Portal 3.0 matter workspace — the ORGANIZATION body of
 * /portal/matters/:matterPublicationId.
 *
 * Identity rule: the matterPublicationId from the URL is resolved against the
 * grant-scoped organization case list to the canonical publicReference, then
 * the grant-scoped case detail and the canonical published matter snapshot are
 * loaded. No internal Case id is used as route identity, no title matching, no
 * browser-supplied caseId as authorization input.
 */
export function PortalMatterWorkspaceV3({ matterPublicationId, requestId }: { matterPublicationId?: string; requestId?: string }) {
  const [detail, setDetail] = useState<PortalOrganizationCaseDetail | null>(null);
  const [matter, setMatter] = useState<FullMatter | null>(null);
  const [matterActions, setMatterActions] = useState<PortalActionItem[] | null>(null);
  const [requestDetail, setRequestDetail] = useState<{ request: Awaited<ReturnType<typeof customerInteractionApi.getRequest>>; submission?: Awaited<ReturnType<typeof customerInteractionApi.listSubmissions>>["items"][number] } | null>(null);
  const [requestUnavailable, setRequestUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDetail(null);
    setMatter(null);
    setRequestDetail(null);
    setRequestUnavailable(false);
    try {
      // Exact resolution: find the grant-scoped case row for the published
      // matter id (or legacy public reference), then use its publicReference.
      const casesPage = await getPortalOrganizationCases({ limit: 100 });
      const caseRow = (casesPage.items || []).find((item) => item.matterPublicationId === matterPublicationId || item.publicReference === matterPublicationId);
      if (!caseRow) {
        setError("NOT_FOUND");
        setLoading(false);
        return;
      }
      const caseDetail = await getPortalOrganizationCase(caseRow.publicReference);
      setDetail(caseDetail);
      const published = await getPortalMatter(caseDetail.matterPublicationId);
      setMatter(published);
      if (requestId) {
        try {
          const request = await customerInteractionApi.getRequest(published.caseId, requestId);
          const submissionPage = await customerInteractionApi.listSubmissions(published.caseId, requestId);
          setRequestDetail({ request, submission: (submissionPage.items || [])[0] });
        } catch {
          setRequestUnavailable(true);
        }
      }
      // Matter-scoped customer actions from the canonical Action Center —
      // exact relation via the canonical matterPublicationId field, never
      // title text.
      try {
        const actionCenter = await getPortalActionCenter();
        setMatterActions(actionCenter.items.filter((item) => item.matterPublicationId === caseDetail.matterPublicationId));
      } catch {
        setMatterActions(null);
      }
    } catch (failure) {
      setError(clientSafeError(failure));
    } finally {
      setLoading(false);
    }
  }, [matterPublicationId, requestId]);

  useEffect(() => {
    void load();
  }, [load, reloadNonce]);

  const relationshipLabel = useMemo(() => (detail?.relationshipToCase === "SHARED" ? "Megosztott velem" : "Saját ügy"), [detail]);
  const targetDate = formatDate(detail?.publicTargetDate);
  const latestUpdateAt = formatDate(matter?.lastClientVisibleUpdateAt || matter?.latestUpdateAt);

  if (loading) {
    return (
      <div aria-label="Ügy betöltése" data-testid="portal-matter-workspace-loading" className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
        ))}
      </div>
    );
  }

  if (error === "NOT_FOUND") {
    return (
      <div data-testid="portal-matter-workspace">
        <PortalEmptyInline>Ez a tartalom nem érhető el ezen az ügyfélfelületen.</PortalEmptyInline>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="portal-matter-workspace">
        <SafePanelError detail="Az ügy részletei jelenleg nem tölthetők be. Próbálja újra." onRetry={() => setReloadNonce((value) => value + 1)} />
      </div>
    );
  }

  if (!detail || !matter) {
    return (
      <div data-testid="portal-matter-workspace">
        <PortalEmptyInline>Ez a tartalom nem érhető el ezen az ügyfélfelületen.</PortalEmptyInline>
      </div>
    );
  }

  if (requestId) {
    if (requestDetail) {
      return (
        <div data-testid="portal-matter-workspace">
          <PortalRequestDetailV3
            caseId={matter.caseId}
            publicationId={detail.matterPublicationId}
            request={requestDetail.request}
            submission={requestDetail.submission}
            matter={matter}
            canSendMessages={Boolean(detail.capabilities.allowMessages)}
            onChanged={async () => {
              setReloadNonce((value) => value + 1);
            }}
          />
        </div>
      );
    }
    if (requestUnavailable) {
      return (
        <div data-testid="portal-matter-workspace">
          <PortalEmptyInline>A bekérés jelenleg nem érhető el ezen az ügyfélfelületen. Előfordulhat, hogy lezárult, vagy nincs hozzá jogosultsága.</PortalEmptyInline>
        </div>
      );
    }
    return (
      <div data-testid="portal-matter-workspace">
        <PortalEmptyInline>A bekérés betöltése…</PortalEmptyInline>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="portal-matter-workspace">
      <header data-testid="portal-matter-context-header" className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">{detail.publicTitle}</h1>
          <p className="text-sm text-[var(--adm-text-secondary)]">{detail.publicReference}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--adm-text-secondary)]">
          <span className="font-medium text-[var(--adm-text-primary)]">{detail.publicStatus}</span>
          {detail.organizationUnitName ? <span>{detail.organizationUnitName}</span> : null}
          <span>{relationshipLabel}</span>
          {targetDate ? <span>Közzétett céldátum: {targetDate}</span> : null}
          {latestUpdateAt ? <span>Utolsó frissítés: {latestUpdateAt}</span> : null}
        </div>
      </header>

      <PortalMatterStatusTrack current={detail.currentStatusText} waitingOn={detail.waitingOn} nextStep={detail.nextStep} />

      <PortalMatterMilestones milestones={detail.safeMilestones} progressPercentage={detail.progressPercentage} />

      <section data-testid="portal-matter-actions" className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
        <h2 className="border-b border-[var(--adm-border-canonical)] px-4 py-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Önre váró teendők</h2>
        {matterActions !== null && matterActions.length > 0 ? (
          <ul>
            {matterActions.map((item) => (
              <PortalActionRow key={item.id} item={item} />
            ))}
          </ul>
        ) : null}
        {matterActions !== null && matterActions.length === 0 ? (
          <div className="px-4 py-3">
            <PortalEmptyInline>Jelenleg nincs Önre váró teendő ebben az ügyben.</PortalEmptyInline>
          </div>
        ) : null}
        {matterActions === null ? (
          <div className="px-4 py-3">
            {matter.actionRequests && matter.actionRequests.length > 0 ? (
              <ul>
                {matter.actionRequests.map((action) => (
                  <li key={action.id} className="border-b border-[var(--adm-border-canonical)] px-4 py-4 last:border-b-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--adm-text-primary)]">{action.title}</p>
                        <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{action.typeLabel}{action.dueAt ? ` · Határidő: ${formatDate(action.dueAt)}` : ""}</p>
                        <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{action.readOnlyNote}</p>
                      </div>
                      <Link
                        href={`/portal/action-requests/${encodeURIComponent(action.id)}`}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-brand-green)] transition-colors hover:bg-[var(--adm-brand-green)] hover:text-[var(--adm-canvas-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                      >
                        Megnyitás
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <PortalEmptyInline>Jelenleg nincs Önre váró teendő ebben az ügyben.</PortalEmptyInline>
            )}
          </div>
        ) : null}
      </section>

      {detail.capabilities.showDocuments ? (
        <PortalMatterDocumentsSection documents={(matter.documents ?? []) as PortalDocument[]} />
      ) : null}

      {detail.capabilities.showMessages ? (
        <section data-testid="portal-matter-communication" className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
          <h2 className="border-b border-[var(--adm-border-canonical)] px-4 py-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Kommunikáció</h2>
          <div className="p-4">
            <PortalInteractionCardV3 caseId={matter.caseId} allowAsk={detail.capabilities.allowMessages} matterPublicationId={detail.matterPublicationId} scope="questions" />
          </div>
        </section>
      ) : null}

      <section data-testid="portal-matter-requests" className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
        <h2 className="border-b border-[var(--adm-border-canonical)] px-4 py-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Adat- és dokumentumkérések</h2>
        <div className="p-4">
          <PortalInteractionCardV3 caseId={matter.caseId} matterPublicationId={detail.matterPublicationId} scope="requests" />
        </div>
      </section>

      <PortalMatterUpdatesSection updates={(matter.updates ?? []) as PortalSafeUpdate[]} />

      {matter.history ? (
        <section
          data-testid="portal-matter-history"
          aria-label="Megosztott ügytörténet"
          className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]"
        >
          <h2 className="border-b border-[var(--adm-border-canonical)] px-4 py-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Megosztott ügytörténet</h2>
          {matter.history.items.length > 0 ? (
            <ul className="divide-y divide-[var(--adm-border-canonical)]">
              {matter.history.items.map((item) => (
                <li key={item.sourceKey} className="px-4 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-sm font-semibold text-[var(--adm-text-primary)]">{item.title}</h3>
                    <p className="text-xs text-[var(--adm-text-secondary)]">
                      {formatDate(item.occurredAt)}
                      {item.minutes !== null ? ` · ${item.minutes} perc` : ""}
                    </p>
                  </div>
                  {item.body !== null ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--adm-text-secondary)]">{item.body}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3">
              <PortalEmptyInline>Nincs megosztott ügytörténeti elem.</PortalEmptyInline>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
