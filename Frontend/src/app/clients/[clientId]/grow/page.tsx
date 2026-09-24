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
import { getClient, type Client } from "@/lib/api";
import { listAdminWorkspaces } from "@/lib/clientPortalAdminApi";
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
  const clientId = String(params?.clientId || "");
  const route = useRouteGeneration(clientId);
  const [client, setClient] = useState<Client | null>(null);
  const [loadedClientId, setLoadedClientId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [modeError, setModeError] = useState(false);
  const [organizationMode, setOrganizationMode] = useState(false);

  const activeTab = resolveTab(view, tab);

  useEffect(() => {
    if (!clientId) return;
    const generation = route.generation;
    // Reset route-scoped state so a previous client can never render under the
    // new URL while the new identity resolves.
    setError(false);
    setModeError(false);
    setOrganizationMode(false);
    void (async () => {
      let clientResult: Client;
      try {
        clientResult = await getClient(clientId);
      } catch {
        if (route.isActive(generation)) setError(true);
        return;
      }
      if (!route.isActive(generation)) return;
      setClient(clientResult);
      setLoadedClientId(clientId);

      // The organization-mode lookup is a distinct, independently failing
      // module: a failure must never masquerade as a legitimate business gate.
      try {
        const workspaces = await listAdminWorkspaces(clientId);
        if (!route.isActive(generation)) return;
        setOrganizationMode(
          workspaces.items.some(
            (item) =>
              item.status !== "ARCHIVED" &&
              (item.mode === "ORGANIZATION" || item.mode === "CASE_RELAY")
          )
        );
      } catch {
        if (route.isActive(generation)) setModeError(true);
      }
    })();
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
              Az ügyfél nem található vagy nincs hozzáférése.
            </div>
          ) : null}
          {client && loadedClientId === clientId ? (
            <>
              {modeError ? (
                <SafePanelError detail="A szervezeti ügyfélmód ellenőrzése jelenleg nem elérhető. Ez nem jelenti azt, hogy az ügyfél nem szervezeti módú." />
              ) : organizationMode ? (
                <>
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
                    <GrowJourney clientId={client.id} clientName={client.name} />
                  ) : (
                    <GrowWorkbench
                      clientId={client.id}
                      clientName={client.name}
                      activeTab={activeTab}
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
