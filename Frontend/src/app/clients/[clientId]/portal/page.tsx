"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getClient, type Client } from "@/lib/api";
import { listAdminWorkspaces, type AdminWorkspaceDTO } from "@/lib/clientPortalAdminApi";

const modeLabels: Record<AdminWorkspaceDTO["mode"], string> = {
  INDIVIDUAL: "Magánügyfél",
  ORGANIZATION: "Szervezeti ügyfél",
  CASE_RELAY: "Szervezeti ügyfél",
};

const statusLabels: Record<AdminWorkspaceDTO["status"], string> = {
  ACTIVE: "Aktív",
  SUSPENDED: "Szünetel",
  ARCHIVED: "Archivált",
};

export default function ClientPortalContextPage() {
  const params = useParams();
  const clientId = String(params?.clientId || "");
  const [client, setClient] = useState<Client | null>(null);
  const [workspace, setWorkspace] = useState<AdminWorkspaceDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([getClient(clientId), listAdminWorkspaces(clientId)])
      .then(([clientResult, workspaces]) => {
        setClient(clientResult);
        setWorkspace(workspaces.items.find((item) => item.status !== "ARCHIVED") || workspaces.items[0] || null);
      })
      .catch(() => setError("A portál adatai jelenleg nem érhetők el."));
  }, [clientId]);

  const organizationMode = workspace?.mode === "ORGANIZATION" || workspace?.mode === "CASE_RELAY";

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
          {client ? (
            <>
              <ClientWorkspaceTabs clientId={client.id} active="portal" organizationMode={organizationMode} />
              <header className="adm-board-panel p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Ügyfél munkaterület · Portál</p>
                <h1 className="mt-1 font-serif text-3xl text-[var(--adm-text)]">{client.name}</h1>
                <p className="mt-2 text-sm text-[var(--adm-text-muted)]">A portál státusza és ügyfélnek szánt kapcsolódó felület egy helyen.</p>
              </header>
              <section className="adm-board-panel p-5">
                <h2 className="font-serif text-xl text-[var(--adm-text)]">Portál állapota</h2>
                {workspace ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-[var(--adm-surface)] p-4"><p className="text-2xl font-semibold text-[var(--adm-text)]">{statusLabels[workspace.status]}</p><p className="mt-1 text-xs text-[var(--adm-text-muted)]">Státusz</p></div>
                    <div className="rounded-xl bg-[var(--adm-surface)] p-4"><p className="text-2xl font-semibold text-[var(--adm-text)]">{modeLabels[workspace.mode]}</p><p className="mt-1 text-xs text-[var(--adm-text-muted)]">Mód</p></div>
                    <div className="rounded-xl bg-[var(--adm-surface)] p-4"><p className="text-2xl font-semibold text-[var(--adm-text)]">{workspace.activeMembershipCount}</p><p className="mt-1 text-xs text-[var(--adm-text-muted)]">Aktív tag</p></div>
                  </div>
                ) : <p className="mt-4 text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs létrehozott portál.</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href="/client-portal-admin" className="adm-link-button px-4 py-2 text-xs">Portál adminisztráció megnyitása</Link>
                  {organizationMode ? <Link href={`/clients/${encodeURIComponent(clientId)}/szervezet`} className="adm-link-button px-4 py-2 text-xs">Szervezeti kontextus</Link> : null}
                </div>
              </section>
            </>
          ) : !error ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ügyfél betöltése…</div> : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}
