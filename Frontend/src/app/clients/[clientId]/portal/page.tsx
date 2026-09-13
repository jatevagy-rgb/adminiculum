"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import { getClient, updateClient, type Client } from "@/lib/api";
import { getClientColorDefinition } from "@/lib/clientColors";
import { listAdminWorkspaces, type AdminWorkspaceDTO } from "@/lib/clientPortalAdminApi";
import { ClientPortalMemberAdmin } from "@/components/client-portal/ClientPortalMemberAdmin";

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
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceDTO[]>([]);
  const workspace = workspaces.find((item) => item.status !== "ARCHIVED") || workspaces[0] || null;
  const [error, setError] = useState<string | null>(null);
  const [savingPortal, setSavingPortal] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const savePortalSettings = async (patch: Partial<Pick<Client, "relationshipMode" | "portalAccessEnabled" | "connectedSystemState">>) => {
    if (!client) return;
    setSavingPortal(true);
    setSaveFeedback(null);
    try {
      const updated = await updateClient(client.id, patch);
      setClient(updated);
      setSaveFeedback("A portálbeállítások mentve.");
    } catch (err) {
      setSaveFeedback("A portálbeállítások mentése nem sikerült. Próbálja újra.");
    } finally {
      setSavingPortal(false);
    }
  };

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([getClient(clientId), listAdminWorkspaces(clientId)])
      .then(([clientResult, workspaces]) => {
        setClient(clientResult);
        setWorkspaces(workspaces.items);
      })
      .catch(() => setError("A portál adatai jelenleg nem érhetők el."));
  }, [clientId]);

  const refreshWorkspaces = async () => {
    const result = await listAdminWorkspaces(clientId);
    setWorkspaces(result.items);
  };

  const organizationMode = workspace?.mode === "ORGANIZATION" || workspace?.mode === "CASE_RELAY";
  const clientColorDef = client ? getClientColorDefinition(client.colorKey) : null;
  // A numeric count is shown only when the client-scoped case set is complete
  // (pagination.total covered by fetched items) and terminal statuses are

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


              {/* 1. Státusz */}
              <section className="adm-board-panel p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Státusz</p>
                <h2 className="mt-1 font-serif text-xl text-[var(--adm-text)]">Portál állapota</h2>
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

              {/* 2. Tagság · 3. Meghívások és kérések */}
              <ClientPortalMemberAdmin clientId={clientId} workspaces={workspaces} onRefresh={refreshWorkspaces} />

              {/* 4. Hozzáférés és kapcsolat · 5. Kapcsolt rendszerek */}
              <section className="adm-board-panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Hozzáférés és kapcsolat</p>
                    <h2 className="mt-1 font-serif text-xl text-[var(--adm-text)]">Portál-hozzáférés és működés</h2>
                  </div>
                  <span className="rounded-full bg-[var(--adm-gold-soft,#f3ead2)] px-3 py-1 text-xs font-semibold">
                    {client.portalAccessEnabled ? "Portál előkészítve" : "Portál hozzáférés kikapcsolva"}
                  </span>
                </div>
                <p role="status" aria-live="polite" className="mt-3 text-sm">{savingPortal ? "Mentés…" : saveFeedback}</p>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Portál beállításai</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
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
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Kapcsolt rendszerek</p>
                    <label className="mt-2 grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
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

              {/* 6. Publikált tartalom */}
              <section className="adm-board-panel p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Publikált tartalom</p>
                <h2 className="mt-1 font-serif text-xl text-[var(--adm-text)]">Ügyfélnek látható tartalmak</h2>
                <p className="mt-3 text-sm text-[var(--adm-text-muted)]">
                  A dokumentum- és mérföldkő-publikációk ügyszinten készülnek és változatlanul jelennek meg az ügyfélportálon. Új publikáció az ügy dokumentumai közül indítható.
                </p>
                <Link href={`/cases?clientId=${encodeURIComponent(clientId)}`} className="adm-link-button mt-4 inline-block px-4 py-2 text-xs">Ügyek megnyitása publikációhoz</Link>
              </section>

              {/* 7. Technikai részletek (másodlagos) */}
              <section className="adm-board-panel p-5">
                <details>
                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-muted)] focus-visible:outline focus-visible:outline-2">Technikai részletek és audit</summary>
                  <dl className="mt-3 grid gap-1 text-xs text-[var(--adm-text-muted)] sm:grid-cols-2">
                    <div><dt className="font-semibold">Ügyfél-azonosító</dt><dd className="font-mono">{client.id}</dd></div>
                    {workspace ? (
                      <div><dt className="font-semibold">Munkatér-azonosító</dt><dd className="font-mono">{workspace.id}</dd></div>
                    ) : null}
                    <div><dt className="font-semibold">Kapcsolati mód (nyers)</dt><dd className="font-mono">{client.relationshipMode || "PORTAL_CENTRIC"}</dd></div>
                  </dl>
                </details>
              </section>
            </>
          ) : !error ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ügyfél betöltése…</div> : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}
