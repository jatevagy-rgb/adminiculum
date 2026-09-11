"use client";

import { useState } from "react";
import Link from "next/link";
import {
  cancelAdminInvitationNotification,
  inviteAdminWorkspaceMember,
  listAdminWorkspaces,
  revokeAdminInvitation,
  transitionAdminWorkspaceMembership,
  type AdminWorkspaceDTO,
  type WorkspaceMembershipDTO,
} from "@/lib/clientPortalAdminApi";

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktív",
  INVITED: "Meghívás elküldve",
  PENDING_APPROVAL: "Jóváhagyásra vár",
  SUSPENDED: "Felfüggesztve",
  REVOKED: "Visszavonva",
  EXPIRED: "Meghívás lejárt",
};

const DELIVERY_LABELS: Record<string, string> = {
  PENDING: "Kézbesítés folyamatban",
  SENDING: "Küldés alatt",
  SENT: "E-mail elküldve",
  FAILED_RETRYABLE: "E-mail-küldés jelenleg nem érhető el",
  FAILED_FINAL: "E-mail-küldés sikertelen",
  CANCELLED: "Kézbesítés visszavonva",
  NOT_REQUIRED: "Meglévő azonosítóhoz rögzítve",
};

function deliverySummary(deliveryStatus?: string | null, codeSafe?: string | null): string {
  if (codeSafe === "MAIL_PROVIDER_NOT_CONFIGURED") return "Meghívás rögzítve – e-mail-küldés jelenleg nem érhető el.";
  return DELIVERY_LABELS[String(deliveryStatus || "")] || "Meghívás rögzítve; kézbesítés állapota ellenőrizhető.";
}

function roleLabel(role: WorkspaceMembershipDTO["role"], mode: AdminWorkspaceDTO["mode"]): string {
  if (mode === "INDIVIDUAL") return role === "REPRESENTATIVE" ? "Meghatalmazott / kapcsolattartó" : "Ügyfél";
  if (role === "APPROVER") return "Jóváhagyó / vezetői kapcsolattartó";
  if (role === "REPRESENTATIVE") return "Szervezeti kapcsolattartó";
  return "Portálfelhasználó";
}

function roleOptionsFor(mode: AdminWorkspaceDTO["mode"]): { value: WorkspaceMembershipDTO["role"]; label: string }[] {
  if (mode === "INDIVIDUAL") {
    return [
      { value: "MEMBER", label: "Ügyfél" },
      { value: "REPRESENTATIVE", label: "Meghatalmazott / kapcsolattartó" },
    ];
  }
  if (mode === "ORGANIZATION") {
    return [
      { value: "MEMBER", label: "Portálfelhasználó" },
      { value: "REPRESENTATIVE", label: "Szervezeti kapcsolattartó" },
      { value: "APPROVER", label: "Jóváhagyó / vezetői kapcsolattartó" },
    ];
  }
  return [
    { value: "MEMBER", label: "Portálfelhasználó" },
    { value: "REPRESENTATIVE", label: "Szervezeti kapcsolattartó" },
  ];
}

function formatPortalDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("hu-HU") : "—";
}

const inputCls = "rounded-lg border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]";

export function ClientPortalMemberAdmin({ clientId, workspaces, onRefresh }: { clientId: string; workspaces: AdminWorkspaceDTO[]; onRefresh: () => Promise<void> }) {
  const manageable = workspaces.filter((workspace) => workspace.status !== "ARCHIVED");
  const [selectedId, setSelectedId] = useState("");
  const selected = manageable.length === 1 ? manageable[0] : manageable.find((workspace) => workspace.id === selectedId) || null;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ email: "", displayName: "", role: "MEMBER" as WorkspaceMembershipDTO["role"], messageSafe: "", expiresAt: "" });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "A művelet nem sikerült.");
    } finally {
      setBusy(false);
    }
  };

  const submitInvite = () => run(async () => {
    if (!selected) return;
    const result = await inviteAdminWorkspaceMember(selected.id, {
      email: draft.email.trim(),
      displayName: draft.displayName.trim() || undefined,
      role: draft.role,
      messageSafe: draft.messageSafe.trim() || undefined,
      expiresAt: draft.expiresAt || undefined,
    });
    if (result.state === "PENDING_APPROVAL" && result.membershipId) {
      // Existing verified identity: bind the membership and approve it to ACTIVE
      // through the canonical transition so the account needs no re-registration.
      const fresh = await listAdminWorkspaces(clientId);
      const membership = fresh.items.flatMap((workspace) => workspace.memberships).find((item) => item.id === result.membershipId);
      if (membership && membership.status === "PENDING_APPROVAL") {
        await transitionAdminWorkspaceMembership(membership.id, "approve", membership.revision);
      }
      setNotice("Meglévő portálfiók hozzáadva ehhez az ügyfélfelülethez.");
    } else {
      const delivery = deliverySummary(result.deliveryStatus, result.deliveryCodeSafe);
      setNotice(result.emailSent ? `Meghívás elküldve. ${delivery}` : `Meghívás rögzítve. ${delivery}`);
    }
    setDraft((current) => ({ ...current, email: "", displayName: "", messageSafe: "" }));
  });

  const membershipAction = (membership: WorkspaceMembershipDTO, action: "approve" | "suspend" | "revoke", okText: string) =>
    () => run(async () => {
      await transitionAdminWorkspaceMembership(membership.id, action, membership.revision);
      setNotice(okText);
    });

  return (
    <section className="adm-board-panel p-5" data-testid="client-portal-member-admin">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Client Portal control plane</p>
      <h2 className="mt-1 font-serif text-xl text-[var(--adm-text)]">Portál felhasználók</h2>

      {manageable.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--adm-text-muted)]">
          Ehhez az ügyfélhez még nincs aktív portál munkatér. Munkatér létrehozása a{" "}
          <Link href="/client-portal-admin" className="underline">portál adminisztrációban</Link> érhető el.
        </p>
      ) : (
        <>
          {manageable.length > 1 ? (
            <label className="mt-4 grid max-w-md gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
              <span>Cél portál munkatér</span>
              <select data-testid="workspace-select" value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)} className={inputCls}>
                <option value="">Válasszon munkateret…</option>
                {manageable.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.mode === "INDIVIDUAL" ? "Magánügyfél" : "Szervezeti"}</option>
                ))}
              </select>
            </label>
          ) : null}

          {!selected && manageable.length > 1 ? (
            <p className="mt-4 text-sm text-[var(--adm-text-muted)]">Az ügyfélhez több portál munkatér tartozik. Válassza ki a kezelni kívánt munkateret.</p>
          ) : null}

          {selected ? (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-2" data-testid="member-list">
                {selected.memberships.length ? selected.memberships.map((member) => (
                  <div key={member.id} className="rounded-lg border border-[var(--adm-border)] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <b>{member.identityDisplayName || member.identityEmail || "Ügyfélfelhasználó"}</b>
                        {member.identityEmail ? <span className="ml-2 text-[var(--adm-text-muted)]">{member.identityEmail}</span> : null}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${member.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-[var(--adm-bg,#faf8f3)] text-[var(--adm-text-muted)]"}`}>
                        {MEMBERSHIP_STATUS_LABELS[member.status] || member.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      {roleLabel(member.role, selected.mode)} · meghívva: {formatPortalDate(member.invitedAt)}
                      {member.approvedAt ? ` · jóváhagyva: ${formatPortalDate(member.approvedAt)}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {member.status === "PENDING_APPROVAL" || member.status === "SUSPENDED" ? (
                        <button type="button" disabled={busy} onClick={membershipAction(member, "approve", "Portálfelhasználó jóváhagyva.")} className="adm-link-button px-3 py-1 text-xs">Jóváhagyás</button>
                      ) : null}
                      {member.status === "ACTIVE" || member.status === "PENDING_APPROVAL" ? (
                        <button type="button" disabled={busy} onClick={membershipAction(member, "suspend", "Portálfelhasználó felfüggesztve.")} className="adm-link-button px-3 py-1 text-xs">Felfüggesztés</button>
                      ) : null}
                      {member.status !== "REVOKED" && member.status !== "EXPIRED" ? (
                        <button type="button" disabled={busy} onClick={membershipAction(member, "revoke", "Portálfelhasználó visszavonva.")} className="adm-link-button px-3 py-1 text-xs">Visszavonás</button>
                      ) : null}
                    </div>
                  </div>
                )) : <p className="text-sm text-[var(--adm-text-muted)]">Még nincs portálfelhasználó ebben a munkatérben.</p>}
              </div>

              {selected.invitations.length ? (
                <div className="grid gap-2" data-testid="invitation-list">
                  {selected.invitations.map((invitation) => {
                    const revocable = invitation.status !== "USED" && invitation.status !== "REVOKED";
                    const notificationRetrying = (invitation.deliveryStatus || "").toUpperCase().includes("FAILED") || (invitation.deliveryStatus || "").toUpperCase().includes("RETRY") || (invitation.deliveryStatus || "").toUpperCase() === "PENDING";
                    return (
                      <div key={invitation.id} className="rounded-lg bg-[var(--adm-surface)] p-3 text-xs text-[var(--adm-text-muted)]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold text-[var(--adm-text)]">{invitation.intendedEmail || "—"}</span>
                            <span> · {deliverySummary(invitation.deliveryStatus, invitation.deliveryCodeSafe)} · lejár: {formatPortalDate(invitation.expiresAt)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {notificationRetrying ? (
                              <button type="button" disabled={busy} className="adm-link-button px-3 py-1 text-xs" onClick={() => run(async () => { await cancelAdminInvitationNotification(invitation.id); setNotice("Az értesítés újraküldése leállítva."); })}>Értesítés leállítása</button>
                            ) : null}
                            {revocable ? (
                              <button type="button" disabled={busy} className="adm-link-button px-3 py-1 text-xs" onClick={() => run(async () => { await revokeAdminInvitation(invitation.id); setNotice("Meghívás visszavonva; a tagságot nem érinti."); })}>Meghívás visszavonása</button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-bg,#faf8f3)] p-4" data-testid="invite-form">
                <p className="font-semibold text-[var(--adm-text)]">Felhasználó meghívása</p>
                <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Meglévő hitelesített portálfiók esetén a munkatér-tagság közvetlenül hozzáadódik; új e-mail cím esetén meghívó készül. Ügyhozzáférés nem jön létre automatikusan.</p>
                <div className="mt-3 grid gap-2 lg:grid-cols-5">
                  <input type="email" required value={draft.email} onChange={(event) => setDraft((value) => ({ ...value, email: event.target.value }))} placeholder="E-mail *" className={inputCls} />
                  <input value={draft.displayName} onChange={(event) => setDraft((value) => ({ ...value, displayName: event.target.value }))} placeholder="Név (opcionális)" className={inputCls} />
                  <select aria-label="Portál szerep" value={draft.role} onChange={(event) => setDraft((value) => ({ ...value, role: event.target.value as WorkspaceMembershipDTO["role"] }))} className={inputCls}>
                    {roleOptionsFor(selected.mode).map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                  <input type="date" aria-label="Lejárat" value={draft.expiresAt} onChange={(event) => setDraft((value) => ({ ...value, expiresAt: event.target.value }))} className={inputCls} />
                  <button type="button" disabled={busy || !draft.email.trim()} onClick={submitInvite} className="adm-link-button px-4 py-2 text-xs font-semibold">Meghívás</button>
                  <textarea value={draft.messageSafe} onChange={(event) => setDraft((value) => ({ ...value, messageSafe: event.target.value }))} placeholder="Ügyfélnek szánt rövid üzenet (opcionális)" className={`min-h-20 lg:col-span-5 ${inputCls}`} />
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {notice ? <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p> : null}
      {actionError ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{actionError}</p> : null}
    </section>
  );
}
