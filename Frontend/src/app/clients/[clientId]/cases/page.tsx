"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getCases, getClient, type CaseListItem, type Client } from "@/lib/api";
import { listAdminWorkspaces } from "@/lib/clientPortalAdminApi";

const statusLabels: Record<string, string> = {
  CLOSED: "Lezárt",
  IN_REVIEW: "Felülvizsgálat alatt",
  CLIENT_INPUT: "Ügyfél válaszára vár",
  DRAFT: "Vázlat",
};

export default function ClientCasesPage() {
  const params = useParams();
  const clientId = String(params?.clientId || "");
  const [client, setClient] = useState<Client | null>(null);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [organizationMode, setOrganizationMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([
      getClient(clientId),
      getCases(1, 100, undefined, clientId),
      listAdminWorkspaces(clientId).catch(() => ({ items: [] })),
    ]).then(([clientResult, casesResult, workspaces]) => {
      setClient(clientResult);
      setCases(casesResult.data || []);
      setOrganizationMode(workspaces.items.some((item) => item.mode !== "INDIVIDUAL" && item.status !== "ARCHIVED"));
    }).catch(() => setError("Az ügyfélhez kapcsolt ügyek jelenleg nem érhetők el."));
  }, [clientId]);

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
          {client ? (
            <>
              <ClientWorkspaceTabs clientId={client.id} active="cases" organizationMode={organizationMode} />
              <header className="adm-board-panel p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Ügyfél munkaterület</p>
                <h1 className="mt-1 font-serif text-3xl text-[var(--adm-text)]">{client.name}</h1>
                <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Az ügyfélhez kapcsolt ügyek ebben a kontextusban maradnak.</p>
              </header>
              <section className="adm-board-panel p-5">
                <h2 className="font-serif text-xl text-[var(--adm-text)]">Ügyek</h2>
                {cases.length ? (
                  <div className="mt-4 grid gap-3">
                    {cases.map((item) => (
                      <Link key={item.id} href={`/cases/${encodeURIComponent(item.id)}`} className="rounded-xl border border-[var(--adm-border)] p-4 hover:border-[var(--adm-ochre-500)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-[var(--adm-text)]">{item.title}</h3>
                            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">{item.caseNumber} · {statusLabels[item.status] || item.status}</p>
                          </div>
                          <span className="text-xs font-semibold text-[var(--adm-ochre-500)]">Ügy megnyitása →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs kapcsolt ügy.</p>}
              </section>
            </>
          ) : !error ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ügyfél betöltése…</div> : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}
