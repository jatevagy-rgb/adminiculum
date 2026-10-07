"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { GrowJourney } from "@/components/clients/GrowJourney";
import {
  GROW_TABS,
  GrowWorkbench,
  type GrowWorkbenchTab,
} from "@/components/clients/GrowWorkbench";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getClient, getCurrentUser, type Client } from "@/lib/api";
import { growApi } from "@/lib/growApi";
import { SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { useRouteGeneration } from "@/lib/routeGeneration";

const TAB_IDS = GROW_TABS.map((t) => t.id) as string[];

function resolveTab(view: string | null, tab: string | null): GrowWorkbenchTab | "journey" {
  // Legacy deep links are preserved: `?view=diagnostics` maps to the
  // canonical Diagnosztika tab, `?view=journey` keeps the full detail/
  // publication flow reachable.
  if (view === "journey") return "journey";
  if (view === "diagnostics") return "diagnosztika";
  if (tab && TAB_IDS.includes(tab)) return tab as GrowWorkbenchTab;
  return "attekintes";
}

function GrowPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const tab = searchParams.get("tab");
  const opportunityId = searchParams.get("opportunity");
  const clientId = String(params?.clientId || "");
  const route = useRouteGeneration(clientId);
  const [client, setClient] = useState<Client | null>(null);
  const [loadedClientId, setLoadedClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [authorityError, setAuthorityError] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [canPreparePublication, setCanPreparePublication] = useState(false);
  const [organizationMode, setOrganizationMode] = useState(false);

  const activeTab = resolveTab(view, tab);

  useEffect(() => {
    if (!clientId) return;
    const generation = route.generation;
    let cancelled = false;
    const isActive = () => !cancelled && route.isActive(generation);
    // Reset route-scoped state so a previous client can never render under the
    // new URL while the new identity resolves.
    setError(null);
    setModeError(null);
    setContextLoading(true);
    setAuthorityError(false);
    setCanManage(false);
    setCanPublish(false);
    setCanPreparePublication(false);
    setOrganizationMode(false);
    void (async () => {
      let clientResult: Client;
      try {
        clientResult = await getClient(clientId);
      } catch (cause) {
        if (isActive()) setError(readFailureMessage(cause));
        return;
      }
      if (!isActive()) return;
      setClient(clientResult);
      setLoadedClientId(clientId);

      // The organization-mode lookup is a distinct, independently failing
      // module: a failure must never masquerade as a legitimate business gate.
      const [workspaceResult, userResult] = await Promise.allSettled([
        growApi.listOpportunityPublicationWorkspaces(clientId),
        getCurrentUser(),
      ]);
      if (!isActive()) return;
      if (workspaceResult.status === "fulfilled") {
        setOrganizationMode(workspaceResult.value.organizationMode);
      } else {
        setModeError(readFailureMessage(workspaceResult.reason));
      }
      if (userResult.status === "fulfilled") {
        const role = userResult.value.role;
        setCanManage(["ADMIN", "PARTNER"].includes(role));
        setCanPublish(["ADMIN", "PARTNER", "LAWYER"].includes(role));
        // Draft preparation/submission uses client-read access, not publisher authority.
        setCanPreparePublication(["ADMIN", "PARTNER", "LAWYER", "COLLAB_LAWYER"].includes(role));
      } else setAuthorityError(true);
      setContextLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, route]);

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? (
            <div
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              {error}
            </div>
          ) : null}
          {client && loadedClientId === clientId ? (
            <>
              {contextLoading ? (
                <p role="status" className="adm-board-panel p-5 text-sm">A Grow hozzáférés és ügyfélmód betöltése…</p>
              ) : modeError ? (
                <SafePanelError detail={modeError} />
              ) : organizationMode ? (
                <>
                  {authorityError ? <SafePanelError detail="A műveleti jogosultságok nem ellenőrizhetők. Az adatok csak olvashatók; ez nem jelent műveleti engedélyt." /> : null}
                  <ClientWorkspaceTabs
                    clientId={client.id}
                    active="grow"
                    organizationMode={organizationMode}
                  />

                  {/* Primary Grow navigation: operational workbench tabs */}
                  <nav
                    data-testid="grow-sub-nav"
                    aria-label="Grow nézetek"
                    className="flex flex-wrap items-center gap-1 border-b border-[var(--adm-border)] pb-2"
                  >
                    {GROW_TABS.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <Link
                          key={item.id}
                          href={`/clients/${client.id}/grow?tab=${item.id}`}
                          data-testid={`grow-subnav-${item.id}`}
                          aria-current={isActive ? "page" : undefined}
                          className={`rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isActive
                              ? "bg-[var(--adm-green-800)] text-white"
                              : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>

                  {activeTab === "journey" ? (
                    <GrowJourney key={client.id} clientId={client.id} clientName={client.name} canManage={canManage} canPublish={canPublish} canPreparePublication={canPreparePublication} />
                  ) : (
                    <GrowWorkbench
                      key={client.id}
                      clientId={client.id}
                      clientName={client.name}
                      activeTab={activeTab}
                      requestedOpportunityId={opportunityId}
                      canManage={canManage}
                      canPublish={canPublish}
                    />
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  A Grow felület csak szervezeti ügyfélmódban érhető el.
                </div>
              )}
            </>
          ) : !error ? (
            <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">
              Ügyfél betöltése…
            </div>
          ) : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}

function readFailureMessage(cause: unknown): string {
  const status = (cause as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return "Nincs jogosultsága a Grow adatok megtekintéséhez.";
  if (status === 404 || status === 503 || status === 502 || status === 504) return "A Grow adatok jelenleg nem érhetők el. Ez nem jelent üres ügyféladatot.";
  return "A Grow adatok betöltése sikertelen. Ez nem jelent üres ügyféladatot.";
}

export default function GrowPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedApp section="clients">
          <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
            <div className="adm-board-container p-5 text-sm text-[var(--adm-text-muted)]">
              Betöltés…
            </div>
          </div>
        </AuthenticatedApp>
      }
    >
      <GrowPageContent />
    </Suspense>
  );
}
