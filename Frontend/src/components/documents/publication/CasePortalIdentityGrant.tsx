"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import {
  createIdentityGrant,
  GRANT_PERMISSIONS,
  listActiveMemberships,
  type ActiveMembershipDTO,
} from "@/lib/clientPortalAdminApi";

const DEFAULT_PERMISSIONS = ["MATTER_READ", "DOCUMENT_READ", "DOCUMENT_DOWNLOAD", "UPDATE_READ"];

/**
 * Case-level identity-based grant for External ID customers. Lists active
 * organization memberships (optionally scoped to this case's client) and grants
 * the exact ClientPortalIdentity access to THIS case. Never uses the legacy
 * clientUserId path.
 */
export function CasePortalIdentityGrant({ caseId, clientId }: { caseId: string; clientId: string | null }) {
  const [memberships, setMemberships] = useState<ActiveMembershipDTO[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS);
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await listActiveMemberships();
      setMemberships(res.items);
    } catch {
      /* internal, non-admin users simply see no memberships */
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const scoped = useMemo(
    () => memberships.filter((m) => !clientId || m.clientId === clientId),
    [memberships, clientId],
  );
  const options = scoped.length ? scoped : memberships;
  const toggle = (p: string) => setPermissions((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const grant = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await createIdentityGrant({ membershipId, caseId, permissions, validUntil: validUntil || null });
      setFeedback({ tone: "ok", text: "Identity grant létrehozva erre az ügyre." });
      await reload();
    } catch (e) {
      setFeedback({ tone: "err", text: (e instanceof Error ? e.message : "Hiba").slice(0, 160) });
    } finally {
      setBusy(false);
    }
  }, [membershipId, caseId, permissions, validUntil, reload]);

  return (
    <div data-testid="case-identity-grant" className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
      <h4 className="font-serif text-lg font-semibold text-[var(--adm-text)]">External ID ügyfél — identity grant</h4>
      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Csak jóváhagyott tagsághoz köthető. A tagság önmagában nem ad hozzáférést.</p>
      {options.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Nincs elérhető aktív tagság ehhez az ügyfélhez.</p>
      ) : (
        <>
          <select
            data-testid="case-identity-membership-select"
            value={membershipId}
            onChange={(e) => setMembershipId(e.target.value)}
            className="mt-3 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
          >
            <option value="">— Válasszon tagságot —</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>{m.identityEmail || m.identityDisplayName || m.clientPortalIdentityId.slice(0, 8)}</option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-1">
            {GRANT_PERMISSIONS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => toggle(p)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${permissions.includes(p) ? "border-[var(--adm-gold,#b99b45)] bg-[#f3ead2]" : "border-[rgba(22,32,26,0.16)] text-[var(--adm-text-muted)]"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="mt-2 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
          />
          <AdminButton
            data-testid="case-identity-grant-btn"
            className="mt-2 w-full justify-start"
            variant="gold"
            disabled={busy || !membershipId || !permissions.length}
            onClick={grant}
          >
            Identity grant létrehozása
          </AdminButton>
        </>
      )}
      {feedback && (
        <p className={`mt-2 text-xs ${feedback.tone === "ok" ? "text-green-700" : "text-red-700"}`}>{feedback.text}</p>
      )}
    </div>
  );
}
