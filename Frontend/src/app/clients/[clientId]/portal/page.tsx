"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getClient, getCases, updateClient, type CaseListItem, type Client } from "@/lib/api";
import { isClosedCase } from "@/lib/casesOperational";
import { getClientColorDefinition } from "@/lib/clientColors";
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
  const [caseScope, setCaseScope] = useState<{ items: CaseListItem[]; total: number } | null>(null);
  const [caseScopeFailed, setCaseScopeFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingPortal, setSavingPortal] = useState(false);

  const savePortalSettings = async (patch: Partial<Pick<Client, "relationshipMode" | "portalAccessEnabled" | "connectedSystemState">>) => {
    if (!client) return;
    setSavingPortal(true);
    try {
      const updated = await updateClient(client.id, patch);
      setClient(updated);
    } catch (err) {
      console.error("Failed to save portal settings:", err);
    } finally {
      setSavingPortal(false);
    }
  };

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([getClient(clientId), listAdminWorkspaces(clientId)])
      .then(([clientResult, workspaces]) => {
        setClient(clientResult);
        setWorkspace(workspaces.items.find((item) => item.status !== "ARCHIVED") || workspaces.items[0] || null);
      })
      .catch(() => setError("A portál adatai jelenleg nem érhetők el."));
    void getCases(1, 100, undefined, clientId)
      .then((result) => setCaseScope({ items: result.data || [], total: result.pagination?.total ?? (result.data?.length ?? 0) }))
      .catch(() => setCaseScopeFailed(true));
  }, [clientId]);

  const organizationMode = workspace?.mode === "ORGANIZATION" || workspace?.mode === "CASE_RELAY";
  const clientColorDef = client ? getClientColorDefinition(client.colorKey) : null;
  // A numeric count is shown only when the client-scoped case set is complete
  // (pagination.total covered by fetched items) and terminal statuses are
  // excluded via the canonical isClosedCase semantics.
  const caseScopeComplete = Boolean(caseScope && !caseScopeFailed && caseScope.total <= caseScope.items.length);
  const openCasesCount = caseScopeComplete ? caseScope!.items.filter((item) => !isClosedCase(item.status)).length : null;

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
          {client ? (
            <>
              <ClientWorkspaceTabs clientId={client.id} active="portal" organizationMode={organizationMode} />
              <header className={`adm-board-panel p-5 ${clientColorDef?.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Ügyfél munkaterület · Portál</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h1 className="font-serif text-3xl text-[var(--adm-text)]">{client.name}</h1>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[var(--adm-gold-soft,#f3ead2)] px-3 py-1 text-xs font-semibold">
                      {client.portalAccessEnabled ? "Portál előkészítve" : "Portál hozzáférés kikapcsolva"}
                    </span>
                    {workspace ? (
                      <>
                        <span className="rounded-full border border-[var(--adm-border)] px-3 py-1 text-xs font-semibold text-[var(--adm-text-muted)]">
                          Portál: {statusLabels[workspace.status]}
                        </span>
                        <span className="rounded-full border border-[var(--adm-border)] px-3 py-1 text-xs font-semibold text-[var(--adm-text-muted)]">
                          {modeLabels[workspace.mode]}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--adm-text-muted)]">A portál státusza és ügyfélnek szánt kapcsolódó felület egy helyen.</p>
              </header>

              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {organizationMode ? (
                  <Link
                    href={`/clients/${encodeURIComponent(clientId)}/szervezet`}
                    className={`adm-board-panel p-4 transition-colors hover:border-[var(--adm-ochre-500)] ${clientColorDef?.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Szervezeti felépítés</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">Szervezeti térkép megnyitása →</p>
                  </Link>
                ) : null}
                <Link
                  href="/deadlines"
                  className={`adm-board-panel p-4 transition-colors hover:border-[var(--adm-ochre-500)] ${clientColorDef?.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Naptár</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">Határidő agenda megnyitása →</p>
                </Link>
                <Link
                  href={`/communications?clientId=${encodeURIComponent(clientId)}`}
                  className={`adm-board-panel p-4 transition-colors hover:border-[var(--adm-ochre-500)] ${clientColorDef?.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Kommunikáció</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">Ügyfél kommunikáció megnyitása →</p>
                </Link>
                <Link
                  href={`/cases?clientId=${encodeURIComponent(clientId)}&scope=ACTIVE`}
                  className={`adm-board-panel p-4 transition-colors hover:border-[var(--adm-ochre-500)] ${clientColorDef?.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Nyitott ügyek</p>
                  {openCasesCount !== null ? (
                    <p className="mt-2 font-serif text-2xl text-[var(--adm-text)]">{openCasesCount}</p>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">Nyitott ügyek megnyitása →</p>
                  )}
                  <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Kapcsolt ügyek megnyitása →</p>
                </Link>
                <Link
                  href={`/cases?clientId=${encodeURIComponent(clientId)}&scope=CLOSED`}
                  className={`adm-board-panel p-4 transition-colors hover:border-[var(--adm-ochre-500)] ${clientColorDef?.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Lezárt ebben a hónapban</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">Lezárt ügyek megnyitása →</p>
                  <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Nincs hiteles lezárási időpont-forrás.</p>
                </Link>
                <Link
                  href={`/time-entries?clientId=${encodeURIComponent(clientId)}`}
                  className={`adm-board-panel p-4 transition-colors hover:border-[var(--adm-ochre-500)] ${clientColorDef?.key ? `border-t-2 ${clientColorDef.accentTopBorderClass}` : ""}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Munkaórák</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">Munkaórák megnyitása →</p>
                </Link>
              </section>

              <section className="adm-board-panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Client Portal control plane</p>
                    <h2 className="mt-1 font-serif text-xl text-[var(--adm-text)]">Portál beállításai</h2>
                  </div>
                  <span className="rounded-full bg-[var(--adm-gold-soft,#f3ead2)] px-3 py-1 text-xs font-semibold">
                    {client.portalAccessEnabled ? "Portál előkészítve" : "Portál hozzáférés kikapcsolva"}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
                    <span>Működési mód</span>
                    <select
                      value={client.relationshipMode || "PORTAL_CENTRIC"}
                      disabled={savingPortal}
                      onChange={(event) => void savePortalSettings({ relationshipMode: event.target.value as Client["relationshipMode"] })}
                      className="rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]"
                    >
                      <option value="PORTAL_CENTRIC">Portálközpontú</option>
                      <option value="EMAIL_CENTRIC">E-mail központú</option>
                      <option value="CONNECTED_SYSTEM">Kapcsolt rendszer</option>
                    </select>
                  </label>
                  <label className="flex items-end gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(client.portalAccessEnabled)}
                      disabled={savingPortal}
                      onChange={(event) => void savePortalSettings({ portalAccessEnabled: event.target.checked })}
                    />
                    Portál elérhetőségének előkészítése
                  </label>
                </div>
                {client.relationshipMode === "CONNECTED_SYSTEM" ? (
                  <div className="mt-3 rounded border border-[var(--adm-border)] bg-white/70 p-3">
                    <label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
                      <span>Kapcsolt rendszer állapota</span>
                      <input
                        value={client.connectedSystemState || ""}
                        disabled={savingPortal}
                        onChange={(event) => setClient((current) => current ? { ...current, connectedSystemState: event.target.value } : current)}
                        onBlur={(event) => void savePortalSettings({ connectedSystemState: event.target.value })}
                        placeholder="Nincs konfigurálva"
                        className="rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]"
                      />
                    </label>
                    <p className="mt-2 text-xs text-[var(--adm-text-muted)]">
                      Ez az állapot a külső ügykezelő rendszer kapcsolatának konfigurációját jelzi. Nem jelent automatikus szinkronizációt.
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[var(--adm-text-muted)]">
                    Normál ügyfélfelületnél nincs kapcsolt-rendszer állapot a fő adminisztrációban.
                  </p>
                )}
              </section>

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
