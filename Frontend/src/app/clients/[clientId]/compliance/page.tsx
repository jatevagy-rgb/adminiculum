"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { ComplianceOverviewPanel, ComplianceProposalPanel } from "@/components/clients/compliance/ComplianceOverview";
import type { ComplianceFindingView } from "@/components/clients/compliance/ComplianceOverview";
import { complianceOverviewApi } from "@/lib/complianceOverviewApi";
import { getClient, type Client } from "@/lib/api";
import { listAdminWorkspaces } from "@/lib/clientPortalAdminApi";

export default function ClientCompliancePage() {
  const params = useParams();
  const clientId = String(params?.clientId || "");
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState(false);
  const [organizationMode, setOrganizationMode] = useState(false);
  const [complianceFindings, setComplianceFindings] = useState<ComplianceFindingView[]>([]);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([getClient(clientId), listAdminWorkspaces(clientId).catch(() => ({ items: [] }))]).then(([clientResult, workspaces]) => {
      setClient(clientResult);
      setOrganizationMode(
        workspaces.items.some(
          (item) =>
            item.status !== "ARCHIVED" &&
            (item.mode === "ORGANIZATION" || item.mode === "CASE_RELAY")
        )
      );
    }).catch(() => setError(true));
  }, [clientId]);

  const loadCompliance = useCallback(async () => {
    setComplianceLoading(true);
    setComplianceError(null);
    try { setComplianceFindings((await complianceOverviewApi.getOverview(clientId)).findings); }
    catch { setComplianceError("A compliance adatai jelenleg nem tölthetők be."); }
    finally { setComplianceLoading(false); }
  }, [clientId]);

  useEffect(() => { void loadCompliance(); }, [loadCompliance]);

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Az ügyfél nem található vagy nincs hozzáférése.</div> : null}
          {client ? (
            <>
              {organizationMode ? (
                <>
                  <header className="rounded-[var(--adm-radius-md)] border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Compliance</p>
                    <h1 className="mt-1 font-serif text-2xl text-[var(--adm-text)]">{client.name}</h1>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      A szervezet releváns megfelelőségi területei, megállapításai és a következő jogi lépések.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link href={`/clients/${encodeURIComponent(clientId)}`} className="text-xs text-[var(--adm-ochre-500)] hover:underline">
                        ← Ügyfél áttekintés
                      </Link>
                      <Link href={`/clients/${encodeURIComponent(clientId)}/vallalati-mukodes`} className="text-xs text-[var(--adm-ochre-500)] hover:underline">
                        Vállalati működés →
                      </Link>
                    </div>
                  </header>
                  <ClientWorkspaceTabs clientId={client.id} active="compliance" organizationMode={organizationMode} />
                  <ComplianceOverviewPanel
                    findings={complianceFindings}
                    loading={complianceLoading}
                    error={complianceError}
                    onRetry={() => { void loadCompliance(); }}
                  />
                  <ComplianceProposalPanel clientId={client.id} findings={complianceFindings} />
                </>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ez a compliance felület csak szervezeti ügyfélmódban érhető el.</div>
              )}
            </>
          ) : !error ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ügyfél betöltése…</div> : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}
