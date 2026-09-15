"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { GrowJourney } from "@/components/clients/GrowJourney";
import { GrowDiagnosticWorkbench } from "@/components/clients/diagnostic-workbench/GrowDiagnosticWorkbench";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getClient, type Client } from "@/lib/api";
import { listAdminWorkspaces } from "@/lib/clientPortalAdminApi";

function GrowPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const clientId = String(params?.clientId || "");
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState(false);
  const [organizationMode, setOrganizationMode] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([
      getClient(clientId),
      listAdminWorkspaces(clientId).catch(() => ({ items: [] })),
    ])
      .then(([clientResult, workspaces]) => {
        setClient(clientResult);
        setOrganizationMode(
          workspaces.items.some(
            (item) =>
              item.status !== "ARCHIVED" &&
              (item.mode === "ORGANIZATION" || item.mode === "CASE_RELAY")
          )
        );
      })
      .catch(() => setError(true));
  }, [clientId]);

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
          {client ? (
            <>
              {organizationMode ? (
                <>
                  <ClientWorkspaceTabs
                    clientId={client.id}
                    active="grow"
                    organizationMode={organizationMode}
                  />

                  {/* Secondary Grow sub-navigation: Journey vs Diagnostics */}
                  <div
                    data-testid="grow-sub-nav"
                    className="flex items-center gap-2 border-b border-[var(--adm-border)] pb-2 text-xs font-medium"
                  >
                    <Link
                      href={`/clients/${client.id}/grow`}
                      data-testid="grow-subnav-journey"
                      className={`rounded-md px-3 py-1.5 transition-colors ${
                        view !== "diagnostics"
                          ? "bg-[var(--adm-surface)] font-semibold text-[var(--adm-text)] shadow-xs"
                          : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
                      }`}
                    >
                      Munkafolyamat
                    </Link>
                    <Link
                      href={`/clients/${client.id}/grow?view=diagnostics`}
                      data-testid="grow-subnav-diagnostics"
                      className={`rounded-md px-3 py-1.5 transition-colors ${
                        view === "diagnostics"
                          ? "bg-[var(--adm-surface)] font-semibold text-[var(--adm-text)] shadow-xs"
                          : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
                      }`}
                    >
                      Diagnosztika
                    </Link>
                  </div>

                  {/* Additive view branching: preserve default GrowJourney */}
                  {view === "diagnostics" ? (
                    <GrowDiagnosticWorkbench
                      clientId={client.id}
                      clientName={client.name}
                    />
                  ) : (
                    <GrowJourney clientId={client.id} clientName={client.name} />
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
