"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientOrganization } from "@/components/clients/ClientOrganization";
import { getClient, type Client } from "@/lib/api";

export default function OrganizationPage() {
  const params = useParams();
  const clientId = String(params?.clientId || "");
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    void getClient(clientId).then(setClient).catch(() => setError(true));
  }, [clientId]);

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Az ügyfél nem található vagy nincs hozzáférése.</div> : null}
          {client ? (
            <>
              <nav aria-label="Ügyfél munkaterületei" className="flex flex-wrap gap-2">
                <a href={`/clients/${client.id}`} className="adm-link-button px-4 py-2 text-xs">Ügyfél áttekintése</a>
                <a href={`/clients/${client.id}/vallalati-mukodes`} className="adm-link-button px-4 py-2 text-xs">Vállalati működés</a>
                <a href={`/clients/${client.id}/workgroups`} className="adm-link-button px-4 py-2 text-xs">Munkacsoportok</a>
              </nav>
              <ClientOrganization clientId={client.id} clientName={client.name} />
            </>
          ) : !error ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ügyfél betöltése…</div> : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}
