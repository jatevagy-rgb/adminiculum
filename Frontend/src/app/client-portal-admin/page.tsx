"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader } from "@/components/adminiculum/ui";
import { getCases, getClients, type CaseListItem, type Client } from "@/lib/api";
import {
  approveMembershipRequest,
  createIdentityGrant,
  GRANT_PERMISSIONS,
  listActiveMemberships,
  listMembershipQueue,
  rejectMembershipRequest,
  transitionMembership,
  type ActiveMembershipDTO,
  type MembershipRequestDTO,
} from "@/lib/clientPortalAdminApi";

const DEFAULT_PERMISSIONS = ["MATTER_READ", "DOCUMENT_READ", "DOCUMENT_DOWNLOAD", "UPDATE_READ"];

function ApproveForm({ request, clients, busy, onApprove, onReject }: {
  request: MembershipRequestDTO;
  clients: Client[];
  busy: boolean;
  onApprove: (clientId: string) => void;
  onReject: (reason: string) => void;
}) {
  const [clientId, setClientId] = useState<string>(request.requestedClientId || "");
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 grid gap-3 border-t border-[var(--adm-border)] pt-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
        <span>Szervezet (Client) hozzárendelése *</span>
        <select
          data-testid="approve-client-select"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm text-[var(--adm-text)]"
        >
          <option value="">— Válasszon ügyfelet —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="flex items-end">
        <AdminButton
          data-testid="approve-membership-btn"
          variant="gold"
          disabled={busy || !clientId}
          onClick={() => onApprove(clientId)}
        >
          Tagság jóváhagyása
        </AdminButton>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)] sm:col-span-2">
        <span>Elutasítás indoka (client-safe)</span>
        <div className="flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm text-[var(--adm-text)]"
            placeholder="Opcionális indok"
          />
          <AdminButton data-testid="reject-membership-btn" variant="muted" disabled={busy} onClick={() => onReject(reason)}>
            Elutasítás
          </AdminButton>
        </div>
      </label>
    </div>
  );
}

function GrantForm({ membership, cases, busy, onGrant }: {
  membership: ActiveMembershipDTO;
  cases: CaseListItem[];
  busy: boolean;
  onGrant: (payload: { caseId: string; permissions: string[]; validUntil: string | null }) => void;
}) {
  const [caseId, setCaseId] = useState("");
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS);
  const [validUntil, setValidUntil] = useState("");
  const toggle = (p: string) => setPermissions((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  const clientCases = useMemo(
    () => cases.filter((c) => !membership.clientId || c.clientId === membership.clientId),
    [cases, membership.clientId],
  );
  return (
    <div className="mt-3 grid gap-3 border-t border-[var(--adm-border)] pt-3">
      <label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
        <span>Ügy (case) *</span>
        <select
          data-testid="grant-case-select"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm text-[var(--adm-text)]"
        >
          <option value="">— Válasszon ügyet —</option>
          {(clientCases.length ? clientCases : cases).map((c) => (
            <option key={c.id} value={c.id}>{c.caseNumber} · {c.title}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2 text-xs">
        {GRANT_PERMISSIONS.map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => toggle(p)}
            className={`rounded-full border px-3 py-1 ${permissions.includes(p) ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)] text-[var(--adm-text)]" : "border-[var(--adm-border)] text-[var(--adm-text-muted)]"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
        <span>Érvényesség vége (opcionális)</span>
        <input
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          className="w-fit rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm text-[var(--adm-text)]"
        />
      </label>
      <AdminButton
        data-testid="create-grant-btn"
        variant="gold"
        disabled={busy || !caseId || !permissions.length}
        onClick={() => onGrant({ caseId, permissions, validUntil: validUntil || null })}
      >
        Ügyhozzáférés (grant) létrehozása
      </AdminButton>
    </div>
  );
}

function PageBody() {
  const [queue, setQueue] = useState<MembershipRequestDTO[]>([]);
  const [memberships, setMemberships] = useState<ActiveMembershipDTO[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [q, m, cl, cs] = await Promise.all([
        listMembershipQueue(),
        listActiveMemberships(),
        getClients(),
        getCases(1, 100),
      ]);
      setQueue(q.items);
      setMemberships(m.items);
      setClients(cl.data);
      setCases(cs.data);
    } catch {
      setFeedback({ tone: "err", text: "A portál-adminisztráció betöltése nem sikerült." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const run = useCallback(async (fn: () => Promise<void>, okText: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await fn();
      setFeedback({ tone: "ok", text: okText });
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
      setFeedback({ tone: "err", text: `Művelet sikertelen: ${msg.slice(0, 200)}` });
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const pending = queue.filter((r) => r.status === "PENDING_REVIEW");

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5" data-testid="client-portal-admin">
      <AdminSectionHeader
        eyebrow="Ügyfélportál"
        title="Ügyfélportál adminisztráció"
        subtitle="Tagsági kérelmek elbírálása és személyazonosság-alapú ügyhozzáférés (grant). Csak a jóváhagyott tagság ad hozzáférést, és önmagában a tagság még nem tesz láthatóvá ügyanyagot."
      />

      {feedback && (
        <div
          data-testid="admin-feedback"
          className={`rounded-xl border p-3 text-sm ${feedback.tone === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {feedback.text}
        </div>
      )}

      <AdminPanel className="p-5">
        <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Tagsági kérelmek ({pending.length})</h2>
        {loading ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
        {!loading && pending.length === 0 ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs elbírálásra váró tagsági kérelem.</p> : null}
        <div className="mt-3 grid gap-3">
          {pending.map((r) => (
            <div key={r.id} data-testid="membership-request-row" className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--adm-text)]">{r.requestedOrganizationName || "(nincs megadva)"}</p>
                  <p className="text-xs text-[var(--adm-text-muted)]">{r.corporateEmail || "—"} · kért csoport: {r.requestedGroupName || "—"}</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--adm-text-soft)]">identity: {r.clientPortalIdentityId}</p>
                </div>
                <AdminBadge tone="gold">{r.status}</AdminBadge>
              </div>
              <ApproveForm
                request={r}
                clients={clients}
                busy={busy}
                onApprove={(clientId) => run(() => approveMembershipRequest(r.id, { clientId, revision: r.revision }).then(() => undefined), "Tagság jóváhagyva. Most adjon ügyhozzáférést (grant).")}
                onReject={(reason) => run(() => rejectMembershipRequest(r.id, { revision: r.revision, rejectionReasonSafe: reason }).then(() => undefined), "Tagsági kérelem elutasítva.")}
              />
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel className="p-5">
        <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Aktív tagságok és ügyhozzáférések</h2>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">A tagság önmagában nem ad ügyanyag-hozzáférést. Külön, személyazonosság-alapú grant szükséges egy konkrét ügyhöz.</p>
        {!loading && memberships.length === 0 ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs aktív tagság.</p> : null}
        <div className="mt-3 grid gap-3">
          {memberships.map((m) => (
            <div key={m.id} data-testid="active-membership-row" className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--adm-text)]">{m.identityDisplayName || m.identityEmail || m.clientPortalIdentityId}</p>
                  <p className="text-xs text-[var(--adm-text-muted)]">{m.identityEmail} · szervezet: {m.clientName || m.clientId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <AdminBadge tone={m.identityStatus === "ACTIVE" ? "green" : "neutral"}>identity {m.identityStatus}</AdminBadge>
                  <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionMembership(m.id, "revoke").then(() => undefined), "Tagság visszavonva.")}>Tagság visszavonása</AdminButton>
                </div>
              </div>
              {m.activeGrants.length > 0 && (
                <div className="mt-3 grid gap-1">
                  {m.activeGrants.map((g) => (
                    <div key={g.id} data-testid="active-grant-row" className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-2 text-xs text-[var(--adm-text-muted)]">
                      Ügy: <span className="font-mono">{g.caseId.slice(0, 8)}</span> · {g.permissions.join(", ")}{g.validUntil ? ` · lejár: ${new Date(g.validUntil).toLocaleDateString("hu-HU")}` : ""}
                    </div>
                  ))}
                </div>
              )}
              <GrantForm
                membership={m}
                cases={cases}
                busy={busy}
                onGrant={({ caseId, permissions, validUntil }) => run(
                  () => createIdentityGrant({ membershipId: m.id, caseId, permissions, validUntil }).then(() => undefined),
                  "Ügyhozzáférés létrehozva. Az ügyfél a portál frissítése után látja a közzétett ügyet.",
                )}
              />
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}

export default function Page() {
  return (
    <AuthenticatedApp section="client-portal-admin">
      <PageBody />
    </AuthenticatedApp>
  );
}
