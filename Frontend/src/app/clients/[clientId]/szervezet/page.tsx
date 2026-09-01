"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientOrganization } from "@/components/clients/ClientOrganization";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getClient, type Client } from "@/lib/api";
import { listAdminWorkspaces } from "@/lib/clientPortalAdminApi";

export default function OrganizationPage() {
  const params = useParams();
  const clientId = String(params?.clientId || "");
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState(false);
  const [organizationMode, setOrganizationMode] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([getClient(clientId), listAdminWorkspaces(clientId).catch(() => ({ items: [] }))]).then(([clientResult, workspaces]) => {
      setClient(clientResult);
      setOrganizationMode(workspaces.items.some((item) => item.mode === "ORGANIZATION" && item.status !== "ARCHIVED"));
    }).catch(() => setError(true));
  }, [clientId]);

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Az ügyfél nem található vagy nincs hozzáférése.</div> : null}
          {client ? (
            <>
              {organizationMode ? <><ClientWorkspaceTabs clientId={client.id} active="organization" organizationMode /><ClientOrganization clientId={client.id} clientName={client.name} /></> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ez a szervezeti felület csak szervezeti ügyfélmódban érhető el.</div>}
            </>
          ) : !error ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ügyfél betöltése…</div> : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}
