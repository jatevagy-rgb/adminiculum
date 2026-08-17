"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader } from "@/components/adminiculum/ui";
import { createClient, getCases, getClients, updateClient, type CaseListItem, type Client } from "@/lib/api";
import { localizedInteractionStatus, workforceInteractionApi, type InternalInteractionRow } from "@/lib/clientInteractionApi";
import { ClientInteractionInternalActions } from "@/components/client-portal/ClientInteractionInternalActions";
import { ClientRequestComposer } from "@/components/client-portal/ClientRequestComposer";
import { OrganizationAdminControlPlane } from "@/components/client-portal/OrganizationAdminControlPlane";
import {
  approveMembershipRequest,
  cancelAdminInvitationNotification,
  createAdminWorkspace,
  createIdentityGrant,
  createWorkspaceUnit,
  GRANT_PERMISSIONS,
  inviteAdminWorkspaceMember,
  listSummaryScopes,
  listWorkspaceUnits,
  revokeAdminInvitation,
  listAdminWorkspaces,
  listActiveMemberships,
  listMembershipQueue,
  rejectMembershipRequest,
  transitionAdminWorkspace,
  transitionAdminWorkspaceMembership,
  transitionMembership,
  transitionSummaryScope,
  updateAdminWorkspace,
  type ActiveMembershipDTO,
  type AdminWorkspaceDTO,
  type ApproveMembershipPayload,
  type CustomerSurfaceMode,
  type MembershipRequestDTO,
  type OrganizationUnitAdminDTO,
  type OrganizationUnitRole,
  type PortalMembershipRole,
  type SummaryScopeDTO,
} from "@/lib/clientPortalAdminApi";

const DEFAULT_PERMISSIONS = ["MATTER_READ", "DOCUMENT_READ", "DOCUMENT_DOWNLOAD", "UPDATE_READ"];

function formatGrantDate(value: string | null) {
  return value ? new Date(value).toLocaleString("hu-HU") : "—";
}

const MODE_LABELS: Record<string, string> = { INDIVIDUAL: "Magánügyfél", ORGANIZATION: "Szervezeti ügyfél", CASE_RELAY: "Szervezeti ügyfél" };
const COMMUNICATION_LABELS: Record<string, string> = { PORTAL_PRIMARY: "Portál elsődleges", EMAIL_LINKED: "E-mailhez kapcsolt", EXTERNAL_ONLY: "Külső rendszer" };
const CONNECTED_STATE_LABELS: Record<string, string> = { NOT_CONFIGURED: "Nincs konfigurálva", CONFIGURATION_REQUIRED: "Konfiguráció szükséges", READY: "Kész", DISABLED: "Kikapcsolva" };
const DELIVERY_LABELS: Record<string, string> = { PENDING: "Kézbesítés folyamatban", SENDING: "Küldés alatt", SENT: "E-mail elküldve", FAILED_RETRYABLE: "E-mail-küldés jelenleg nem érhető el", FAILED_FINAL: "E-mail-küldés sikertelen", CANCELLED: "Kézbesítés visszavonva", NOT_REQUIRED: "Meglévő azonosítóhoz rögzítve" };
const PORTAL_ROLE_LABELS: Record<PortalMembershipRole, string> = { MEMBER: "Portálfelhasználó", REPRESENTATIVE: "Szervezeti kapcsolattartó", APPROVER: "Szervezeti kapcsolattartó" };
const UNIT_ROLE_LABELS: Record<OrganizationUnitRole, string> = { MEMBER: "Tag", CONTACT: "Kapcsolattartó", APPROVER: "Jóváhagyó", MANAGER: "Egységvezető" };
const PERMISSION_LABELS: Record<string, string> = {
  MATTER_READ: "Ügy megtekintése",
  CLIENT_TIMELINE_READ: "Ügyfél-idővonal",
  DOCUMENT_READ: "Dokumentumok megtekintése",
  DOCUMENT_DOWNLOAD: "Dokumentum letöltése",
  DOCUMENT_UPLOAD: "Dokumentum feltöltése",
  MESSAGE_READ: "Kommunikáció megtekintése",
  MESSAGE_SEND: "Üzenet küldése",
  ACTION_REQUEST_READ: "Ügyfélteendők megtekintése",
  ACTION_REQUEST_COMPLETE: "Ügyfélteendő lezárása",
  UPDATE_READ: "Frissítések megtekintése",
};
const RELATIONSHIP_LABELS: Record<string, string> = { PORTAL_CENTRIC: "Portálon keresztül", EMAIL_CENTRIC: "Elsősorban e-mailben", CONNECTED_SYSTEM: "Kapcsolt rendszer" };

const inputCls = "rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm text-[var(--adm-text)]";
const labelCls = "grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]";

function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] || permission;
}

function permissionList(permissions: string[]): string {
  return permissions.map(permissionLabel).join(", ") || "Nincs megadva";
}

function portalStatusLabel(status: string): string {
  if (status === "ACTIVE") return "Portál aktív";
  if (status === "SUSPENDED") return "Portál szünetel";
  if (status === "ARCHIVED") return "Archivált";
  return status;
}

function membershipStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    ACTIVE: "Aktív",
    INVITED: "Meghívás elküldve",
    PENDING_REVIEW: "Jóváhagyásra vár",
    SUSPENDED: "Felfüggesztve",
    REVOKED: "Visszavonva",
    EXPIRED: "Meghívás lejárt",
    USED: "Felhasználva",
  };
  return status ? labels[status] || status : "Nincs állapot";
}

function deliverySummary(deliveryStatus?: string | null, codeSafe?: string | null) {
  if (codeSafe === "MAIL_PROVIDER_NOT_CONFIGURED") return "Meghívás rögzítve – e-mail-küldés jelenleg nem érhető el.";
  return DELIVERY_LABELS[String(deliveryStatus || "")] || "Meghívás rögzítve; kézbesítés állapota ellenőrizhető.";
}

function ApproveForm({ request, clients, workspaces, busy, onApprove, onReject }: {
  request: MembershipRequestDTO;
  clients: Client[];
  workspaces: AdminWorkspaceDTO[];
  busy: boolean;
  onApprove: (payload: Omit<ApproveMembershipPayload, "revision">) => void;
  onReject: (payload: { clientSafeDecisionMessage: string; internalDecisionNote: string }) => void;
}) {
  const [assignmentMode, setAssignmentMode] = useState<"" | "EXISTING_CLIENT" | "NEW_CLIENT">("");
  const [actualMode, setActualMode] = useState<CustomerSurfaceMode>((request.requestedMode as CustomerSurfaceMode) || "INDIVIDUAL");
  const [existingClientId, setExistingClientId] = useState<string>(request.requestedClientId || "");
  const [existingWorkspaceId, setExistingWorkspaceId] = useState<string>("");
  const [createWorkspaceName, setCreateWorkspaceName] = useState<string>("");
  const [newClient, setNewClient] = useState({ name: request.requestedOrganizationName || request.displayNameSnapshot || "", email: "", phone: "", companyRegistrationNumber: "", taxNumber: "", contactPerson: request.displayNameSnapshot || "" });
  const [portalRole, setPortalRole] = useState<PortalMembershipRole>("MEMBER");
  const [orgGroupId, setOrgGroupId] = useState<string>("");
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [unitRole, setUnitRole] = useState<OrganizationUnitRole>("MEMBER");
  const [decisionMessage, setDecisionMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const isOrg = actualMode === "ORGANIZATION";
  const existingClient = clients.find((c) => c.id === existingClientId) || null;
  const eligibleWorkspaces = useMemo(
    () => workspaces.filter((w) => w.clientId === existingClientId && w.status === "ACTIVE" && w.mode === actualMode),
    [workspaces, existingClientId, actualMode],
  );
  // Auto-select the single compatible surface for an existing client.
  const surfaceState: "auto" | "select" | "create" =
    eligibleWorkspaces.length === 1 ? "auto" : eligibleWorkspaces.length > 1 ? "select" : "create";
  const modeDiverges = Boolean(request.requestedMode && request.requestedMode !== actualMode);
  const defaultWorkspaceName = `${assignmentMode === "NEW_CLIENT" ? (newClient.name || "Ügyfél") : (existingClient?.name || "Ügyfél")} – ${MODE_LABELS[actualMode]}`;

  const canApprove = assignmentMode === "NEW_CLIENT"
    ? newClient.name.trim().length > 0
    : Boolean(existingClientId) && (surfaceState === "auto" || (surfaceState === "select" && existingWorkspaceId) || surfaceState === "create");

  function buildPayload(): Omit<ApproveMembershipPayload, "revision"> {
    const base: Omit<ApproveMembershipPayload, "revision"> = {
      assignmentMode: assignmentMode === "NEW_CLIENT" ? "NEW_CLIENT" : "EXISTING_CLIENT",
      actualMode,
      portalMembershipRole: portalRole,
      clientSafeDecisionMessage: decisionMessage.trim() || undefined,
      internalDecisionNote: internalNote.trim() || undefined,
    };
    if (assignmentMode === "NEW_CLIENT") {
      base.newClientInput = { name: newClient.name.trim(), email: newClient.email.trim() || undefined, phone: newClient.phone.trim() || undefined, companyRegistrationNumber: newClient.companyRegistrationNumber.trim() || undefined, taxNumber: newClient.taxNumber.trim() || undefined, contactPerson: newClient.contactPerson.trim() || undefined };
      base.createWorkspaceInput = { name: createWorkspaceName.trim() || defaultWorkspaceName, mode: actualMode };
    } else {
      base.existingClientId = existingClientId;
      if (surfaceState === "auto") base.existingWorkspaceId = eligibleWorkspaces[0].id;
      else if (surfaceState === "select") base.existingWorkspaceId = existingWorkspaceId;
      else base.createWorkspaceInput = { name: createWorkspaceName.trim() || defaultWorkspaceName, mode: actualMode };
    }
    if (isOrg) {
      if (orgGroupId) base.organizationGroupId = orgGroupId;
      else if (newGroupName.trim()) base.newOrganizationGroupName = newGroupName.trim();
      if (base.organizationGroupId || base.newOrganizationGroupName) base.unitRole = unitRole;
    }
    return base;
  }

  const surfaceSummary = assignmentMode === "NEW_CLIENT" || surfaceState === "create"
    ? `Új ügyfélfelület: ${createWorkspaceName.trim() || defaultWorkspaceName}`
    : surfaceState === "auto"
      ? `${eligibleWorkspaces[0].name} (automatikusan kiválasztva)`
      : (workspaces.find((w) => w.id === existingWorkspaceId)?.name || "—");
  const approveLabel = assignmentMode === "NEW_CLIENT"
    ? `Új ${MODE_LABELS[actualMode].toLowerCase()} létrehozása és hozzáférés jóváhagyása`
    : `Hozzárendelés a(z) ${existingClient?.name || "kiválasztott"} ügyfélhez`;

  return (
    <div className="mt-3 grid gap-4 border-t border-[var(--adm-border)] pt-3" data-testid="approve-form">
      {/* Section: Hozzárendelés módja */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">Hozzárendelés</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" data-testid="assign-existing" onClick={() => setAssignmentMode("EXISTING_CLIENT")} className={`rounded-full border px-3 py-1.5 text-sm ${assignmentMode === "EXISTING_CLIENT" ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)] text-[var(--adm-text)]" : "border-[var(--adm-border)] text-[var(--adm-text-muted)]"}`}>Meglévő ügyfélhez rendelem</button>
          <button type="button" data-testid="assign-new" onClick={() => setAssignmentMode("NEW_CLIENT")} className={`rounded-full border px-3 py-1.5 text-sm ${assignmentMode === "NEW_CLIENT" ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)] text-[var(--adm-text)]" : "border-[var(--adm-border)] text-[var(--adm-text-muted)]"}`}>Új ügyfelet hozok létre</button>
        </div>
      </div>

      {assignmentMode && (
        <label className={labelCls}>
          <span>Ügyfélfelület módja</span>
          <select value={actualMode} onChange={(e) => { setActualMode(e.target.value as CustomerSurfaceMode); setExistingWorkspaceId(""); }} className={inputCls}>
            <option value="INDIVIDUAL">Magánügyfél</option>
            <option value="ORGANIZATION">Szervezeti ügyfél</option>
            <option value="CASE_RELAY">Ügyátvezető</option>
          </select>
          {modeDiverges ? <span className="text-[11px] text-amber-700">A kérelmező {MODE_LABELS[request.requestedMode as string] || request.requestedMode} felületet választott, de Ön {MODE_LABELS[actualMode]} felülethez rendeli. A hozzáférést az adminisztrátori döntés határozza meg.</span> : null}
        </label>
      )}

      {/* EXISTING CLIENT FLOW */}
      {assignmentMode === "EXISTING_CLIENT" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            <span>Meglévő ügyfél *</span>
            <select data-testid="approve-client-select" value={existingClientId} onChange={(e) => { setExistingClientId(e.target.value); setExistingWorkspaceId(""); }} className={inputCls}>
              <option value="">— Válasszon ügyfelet —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {existingClientId && (
            <label className={labelCls}>
              <span>Ügyfélfelület</span>
              {surfaceState === "auto" ? (
                <span className="rounded-lg bg-[var(--adm-bg,#faf8f3)] px-3 py-2 text-sm text-[var(--adm-text)]" data-testid="surface-auto">{eligibleWorkspaces[0].name} · automatikusan kiválasztva</span>
              ) : surfaceState === "select" ? (
                <select data-testid="approve-workspace-select" value={existingWorkspaceId} onChange={(e) => setExistingWorkspaceId(e.target.value)} className={inputCls}>
                  <option value="">— Válasszon ügyfélfelületet —</option>
                  {eligibleWorkspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              ) : (
                <div className="grid gap-1" data-testid="surface-create">
                  <span className="text-[11px] text-amber-700">Nincs megfelelő aktív ügyfélfelület. A jóváhagyással létrejön egy új.</span>
                  <input value={createWorkspaceName} onChange={(e) => setCreateWorkspaceName(e.target.value)} placeholder={defaultWorkspaceName} className={inputCls} />
                </div>
              )}
            </label>
          )}
        </div>
      )}

      {/* NEW CLIENT FLOW */}
      {assignmentMode === "NEW_CLIENT" && (
        <div className="grid gap-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-bg,#faf8f3)] p-3 sm:grid-cols-2" data-testid="new-client-form">
          <label className={labelCls}><span>Ügyfél neve *</span><input value={newClient.name} onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))} className={inputCls} /></label>
          <label className={labelCls}><span>Kapcsolattartó neve</span><input value={newClient.contactPerson} onChange={(e) => setNewClient((p) => ({ ...p, contactPerson: e.target.value }))} className={inputCls} /></label>
          <label className={labelCls}><span>Hitelesített e-mail</span><input value={request.verifiedEmailSnapshot || "—"} readOnly aria-readonly="true" className={`${inputCls} cursor-not-allowed opacity-70`} /></label>
          <label className={labelCls}><span>Telefonszám</span><input value={newClient.phone} onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))} className={inputCls} /></label>
          {isOrg ? <>
            <label className={labelCls}><span>Cégjegyzékszám</span><input value={newClient.companyRegistrationNumber} onChange={(e) => setNewClient((p) => ({ ...p, companyRegistrationNumber: e.target.value }))} className={inputCls} /></label>
            <label className={labelCls}><span>Adószám</span><input value={newClient.taxNumber} onChange={(e) => setNewClient((p) => ({ ...p, taxNumber: e.target.value }))} className={inputCls} /></label>
          </> : null}
          <label className={`${labelCls} sm:col-span-2`}><span>Ügyfélfelület neve</span><input value={createWorkspaceName} onChange={(e) => setCreateWorkspaceName(e.target.value)} placeholder={defaultWorkspaceName} className={inputCls} /></label>
        </div>
      )}

      {/* Roles + organizational unit */}
      {assignmentMode && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            <span>Portálon belüli szerep</span>
            <select value={portalRole} onChange={(e) => setPortalRole(e.target.value as PortalMembershipRole)} className={inputCls}>
              {(Object.keys(PORTAL_ROLE_LABELS) as PortalMembershipRole[]).map((r) => <option key={r} value={r}>{PORTAL_ROLE_LABELS[r]}</option>)}
            </select>
            <span className="text-[11px] text-[var(--adm-text-muted)]">A portálon belüli általános szerep. Ügyhozzáférést önmagában nem ad.</span>
          </label>
          {isOrg && (
            <div className="grid gap-2 rounded-lg border border-[var(--adm-border)] p-2 sm:col-span-2 sm:grid-cols-2" data-testid="org-unit-fields">
              <label className={labelCls}>
                <span>Szervezeti egység</span>
                <input value={newGroupName} onChange={(e) => { setNewGroupName(e.target.value); setOrgGroupId(""); }} placeholder="pl. HR, Sales, Finance — üresen hagyható" className={inputCls} />
                <span className="text-[11px] text-[var(--adm-text-muted)]">A HR/Sales/Finance szervezeti egység, nem szerepkör. Üresen is jóváhagyható.</span>
              </label>
              <label className={labelCls}>
                <span>Szervezeti egységen belüli szerep</span>
                <select value={unitRole} onChange={(e) => setUnitRole(e.target.value as OrganizationUnitRole)} className={inputCls}>
                  {(Object.keys(UNIT_ROLE_LABELS) as OrganizationUnitRole[]).map((r) => <option key={r} value={r}>{UNIT_ROLE_LABELS[r]}</option>)}
                </select>
                <span className="text-[11px] text-amber-700">Ez a szerep önmagában nem biztosít hozzáférést az egység ügyeihez, üzeneteihez vagy dokumentumaihoz.</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Decision message */}
      {assignmentMode && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}><span>Ügyfélnek szánt döntési üzenet (opcionális)</span><input value={decisionMessage} onChange={(e) => setDecisionMessage(e.target.value)} placeholder="Az ügyfél ezt látja" className={inputCls} /></label>
          <label className={labelCls}><span>Belső megjegyzés (nem látja az ügyfél)</span><input value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="Csak belső használatra" className={inputCls} /></label>
        </div>
      )}

      {/* Approve with confirmation summary */}
      {assignmentMode && !confirming && (
        <div><AdminButton data-testid="approve-membership-btn" variant="gold" disabled={busy || !canApprove} onClick={() => setConfirming(true)}>{approveLabel}</AdminButton></div>
      )}
      {assignmentMode && confirming && (
        <div className="grid gap-2 rounded-xl border border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)]/40 p-3 text-sm" data-testid="approve-confirm">
          <p className="font-semibold text-[var(--adm-text)]">Összegzés a jóváhagyás előtt</p>
          <ul className="grid gap-0.5 text-[var(--adm-text-muted)]">
            <li>Ügyfél: {assignmentMode === "NEW_CLIENT" ? `${newClient.name || "—"} (új)` : existingClient?.name || "—"}</li>
            <li>Ügyfélfelület: {surfaceSummary} · {MODE_LABELS[actualMode]}</li>
            <li>Portál szerep: {PORTAL_ROLE_LABELS[portalRole]}</li>
            {isOrg ? <li>Szervezeti egység: {orgGroupId || newGroupName.trim() || "—"} · {UNIT_ROLE_LABELS[unitRole]}</li> : null}
          </ul>
          <p className="font-semibold text-[var(--adm-text)]">Ügyhozzáférés nem kerül automatikusan létrehozásra.</p>
          <div className="flex gap-2">
            <AdminButton data-testid="approve-confirm-btn" variant="gold" disabled={busy} onClick={() => onApprove(buildPayload())}>Jóváhagyás megerősítése</AdminButton>
            <AdminButton variant="neutral" disabled={busy} onClick={() => setConfirming(false)}>Vissza</AdminButton>
          </div>
        </div>
      )}

      {/* Rejection */}
      <label className={`${labelCls} border-t border-[var(--adm-border)] pt-3`}>
        <span>Elutasítás ügyfélnek szánt indoka (opcionális)</span>
        <div className="flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={`min-w-0 flex-1 ${inputCls}`} placeholder="Az ügyfél ezt látja; a belső megjegyzés külön kezelt" />
          <AdminButton data-testid="reject-membership-btn" variant="muted" disabled={busy} onClick={() => onReject({ clientSafeDecisionMessage: reason.trim(), internalDecisionNote: internalNote.trim() })}>Elutasítás</AdminButton>
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
            {permissionLabel(p)}
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
        Ügyhozzáférés létrehozása
      </AdminButton>
    </div>
  );
}

function WorkspaceGrantForm({ workspace, membership, cases, busy, onGrant }: {
  workspace: AdminWorkspaceDTO;
  membership: AdminWorkspaceDTO['memberships'][number];
  cases: CaseListItem[];
  busy: boolean;
  onGrant: (payload: { caseId: string; permissions: string[]; validUntil: string | null }) => void;
}) {
  const [caseId, setCaseId] = useState('');
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS);
  const [validUntil, setValidUntil] = useState('');
  const available = cases.filter((item) => item.clientId === workspace.clientId);
  const togglePermission = (permission: string) => {
    setPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  };
  return (
    <div className="mt-3 grid gap-3 border-t border-[var(--adm-border)] pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-64 gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
          <span>Explicit ügyhozzáférés</span>
          <select value={caseId} onChange={(event) => setCaseId(event.target.value)} className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm">
            <option value="">— Válasszon ügyet —</option>
            {available.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} · {item.title}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
          <span>Érvényesség vége (opcionális)</span>
          <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 text-xs" aria-label="Grant jogosultságok">
        {GRANT_PERMISSIONS.map((permission) => (
          <button
            type="button"
            key={permission}
            onClick={() => togglePermission(permission)}
            className={`rounded-full border px-3 py-1 ${permissions.includes(permission) ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)] text-[var(--adm-text)]" : "border-[var(--adm-border)] text-[var(--adm-text-muted)]"}`}
          >
            {permissionLabel(permission)}
          </button>
        ))}
      </div>
      <AdminButton
        size="sm"
        variant="gold"
        disabled={busy || !caseId || !permissions.length || membership.status !== 'ACTIVE'}
        onClick={() => onGrant({ caseId, permissions, validUntil: validUntil || null })}
      >
        Ügyhozzáférés létrehozása
      </AdminButton>
    </div>
  );
}

function WorkspaceSettings({ workspace, busy, run }: { workspace: AdminWorkspaceDTO; busy: boolean; run: (fn: () => Promise<void>, okText: string) => Promise<void> }) {
  const [value, setValue] = useState({ name: workspace.name, communicationMode: workspace.communicationMode, connectedSystemState: workspace.connectedSystemState });
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-[var(--adm-border)] p-3 sm:grid-cols-3">
      <input aria-label="Munkatér neve" value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm" />
      <select aria-label="Kommunikációs mód" value={value.communicationMode} onChange={(event) => setValue((current) => ({ ...current, communicationMode: event.target.value as AdminWorkspaceDTO['communicationMode'] }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm">
        <option value="PORTAL_PRIMARY">Portál elsődleges</option>
        <option value="EMAIL_LINKED">E-mailhez kapcsolt</option>
        <option value="EXTERNAL_ONLY">Külső rendszer</option>
      </select>
      {workspace.mode === "CASE_RELAY" ? (
        <select aria-label="Kapcsolt rendszer állapota" value={value.connectedSystemState} onChange={(event) => setValue((current) => ({ ...current, connectedSystemState: event.target.value as AdminWorkspaceDTO['connectedSystemState'] }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm">
          <option value="NOT_CONFIGURED">Nincs konfigurálva</option>
          <option value="CONFIGURATION_REQUIRED">Konfiguráció szükséges</option>
          <option value="READY">Kész</option>
          <option value="DISABLED">Kikapcsolva</option>
        </select>
      ) : null}
      <AdminButton size="sm" variant="neutral" disabled={busy || !value.name.trim()} onClick={() => run(() => updateAdminWorkspace(workspace.id, { ...value, connectedSystemState: workspace.mode === "CASE_RELAY" ? value.connectedSystemState : workspace.connectedSystemState, revision: workspace.revision }).then(() => undefined), "Munkatér beállításai frissítve.")}>Beállítások mentése</AdminButton>
      {workspace.mode === "CASE_RELAY" ? <p className="text-xs text-[var(--adm-text-muted)] sm:col-span-3">Ez az állapot a külső ügykezelő rendszer kapcsolatának konfigurációját jelzi. Nem jelent automatikus szinkronizációt.</p> : null}
    </div>
  );
}

function InvitationForm({ workspace, busy, run }: { workspace: AdminWorkspaceDTO; busy: boolean; run: (fn: () => Promise<void>, okText: string) => Promise<void> }) {
  const [draft, setDraft] = useState({ email: "", displayName: "", role: "MEMBER" as AdminWorkspaceDTO["memberships"][number]["role"], messageSafe: "", expiresAt: "" });
  const roleOptions = workspace.mode === "INDIVIDUAL"
    ? [{ value: "MEMBER", label: "Ügyfél" }, { value: "REPRESENTATIVE", label: "Meghatalmazott / kapcsolattartó" }]
    : [{ value: "MEMBER", label: "Portálfelhasználó" }, { value: "REPRESENTATIVE", label: "Szervezeti adminisztrátor / kapcsolattartó" }];
  const submit = async () => {
    const result = await inviteAdminWorkspaceMember(workspace.id, {
      email: draft.email,
      displayName: draft.displayName || undefined,
      role: draft.role,
      messageSafe: draft.messageSafe || undefined,
      expiresAt: draft.expiresAt || undefined,
    });
    setDraft((current) => ({ ...current, email: "", displayName: "", messageSafe: "" }));
    void result;
  };
  return (
    <div className="mt-4 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-bg,#faf8f3)] p-3">
      <p className="font-semibold text-[var(--adm-text)]">Ügyfélfelhasználó meghívása</p>
      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Meghívás létrehozható tagsági kérelem nélkül. Elfogadáskor csak munkatér-tagság jön létre, ügyhozzáférés nem.</p>
      <div className="mt-3 grid gap-2 lg:grid-cols-5">
        <input type="email" value={draft.email} onChange={(event) => setDraft((value) => ({ ...value, email: event.target.value }))} placeholder="E-mail" className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm" />
        <input value={draft.displayName} onChange={(event) => setDraft((value) => ({ ...value, displayName: event.target.value }))} placeholder="Név" className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm" />
        <select value={draft.role} onChange={(event) => setDraft((value) => ({ ...value, role: event.target.value as typeof draft.role }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm">
          {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
        </select>
        <input type="date" value={draft.expiresAt} onChange={(event) => setDraft((value) => ({ ...value, expiresAt: event.target.value }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm" />
        <AdminButton size="sm" variant="neutral" disabled={busy || !draft.email.trim()} onClick={() => run(submit, "Meghívás rögzítve; ügyhozzáférés nem jött létre.")}>Meghívás küldése</AdminButton>
        <textarea value={draft.messageSafe} onChange={(event) => setDraft((value) => ({ ...value, messageSafe: event.target.value }))} placeholder="Ügyfélnek szánt rövid üzenet (opcionális)" className="min-h-20 rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm lg:col-span-5" />
      </div>
      <div className="mt-3 grid gap-2">
        {workspace.invitations.length ? workspace.invitations.map((invitation) => {
          const revocable = invitation.status !== "USED" && invitation.status !== "REVOKED";
          const notificationRetrying = (invitation.deliveryStatus || "").toUpperCase().includes("FAILED") || (invitation.deliveryStatus || "").toUpperCase().includes("RETRY") || (invitation.deliveryStatus || "").toUpperCase() === "PENDING";
          return (
            <div key={invitation.id} className="rounded-lg bg-white p-2 text-xs text-[var(--adm-text-muted)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-[var(--adm-text)]">{invitation.intendedEmail || "—"}</span>
                  <span> · {deliverySummary(invitation.deliveryStatus, invitation.deliveryCodeSafe)} · lejár: {formatGrantDate(invitation.expiresAt)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {notificationRetrying ? <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => cancelAdminInvitationNotification(invitation.id).then(() => undefined), "Az értesítés újraküldése leállítva.")}>Értesítés leállítása</AdminButton> : null}
                  {revocable ? <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => revokeAdminInvitation(invitation.id).then(() => undefined), "Meghívás visszavonva; a tagságot nem érinti.")}>Meghívás visszavonása</AdminButton> : null}
                </div>
              </div>
              <details className="mt-1"><summary className="cursor-pointer">Technikai részletek</summary><p className="font-mono">invitation: {invitation.id} · status: {invitation.status} · delivery: {invitation.deliveryStatus || "—"}</p></details>
            </div>
          );
        }) : <p className="text-xs text-[var(--adm-text-muted)]">Nincs aktív meghívás.</p>}
      </div>
    </div>
  );
}

function modeFromActivation(type: "INDIVIDUAL" | "ORGANIZATION", relationship: "PORTAL_CENTRIC" | "EMAIL_CENTRIC" | "CONNECTED_SYSTEM"): AdminWorkspaceDTO["mode"] {
  if (type === "INDIVIDUAL") return "INDIVIDUAL";
  return relationship === "CONNECTED_SYSTEM" ? "CASE_RELAY" : "ORGANIZATION";
}

function communicationFromRelationship(relationship: "PORTAL_CENTRIC" | "EMAIL_CENTRIC" | "CONNECTED_SYSTEM"): AdminWorkspaceDTO["communicationMode"] {
  if (relationship === "EMAIL_CENTRIC") return "EMAIL_LINKED";
  if (relationship === "CONNECTED_SYSTEM") return "EXTERNAL_ONLY";
  return "PORTAL_PRIMARY";
}

function relationshipFromWorkspace(workspace: AdminWorkspaceDTO, client?: Client | null): "PORTAL_CENTRIC" | "EMAIL_CENTRIC" | "CONNECTED_SYSTEM" {
  if (workspace.mode === "CASE_RELAY" || client?.relationshipMode === "CONNECTED_SYSTEM") return "CONNECTED_SYSTEM";
  if (workspace.communicationMode === "EMAIL_LINKED" || client?.relationshipMode === "EMAIL_CENTRIC") return "EMAIL_CENTRIC";
  return "PORTAL_CENTRIC";
}

function activationFromWorkspace(workspace: AdminWorkspaceDTO): { customerType: "INDIVIDUAL" | "ORGANIZATION"; relationship: "PORTAL_CENTRIC" | "EMAIL_CENTRIC" | "CONNECTED_SYSTEM" } {
  return {
    customerType: workspace.mode === "INDIVIDUAL" ? "INDIVIDUAL" : "ORGANIZATION",
    relationship: relationshipFromWorkspace(workspace, null),
  };
}

function activeGrantCountForClient(clientId: string, memberships: ActiveMembershipDTO[]): number {
  return memberships
    .filter((membership) => membership.clientId === clientId)
    .flatMap((membership) => membership.activeGrants)
    .filter((grant) => grant.status === "ACTIVE").length;
}

function ActivationWizard({ clients, workspaces, busy, run, onActivated }: {
  clients: Client[];
  workspaces: AdminWorkspaceDTO[];
  busy: boolean;
  run: (fn: () => Promise<void>, okText: string) => Promise<void>;
  onActivated: (workspaceId: string) => void;
}) {
  const [clientSource, setClientSource] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", companyRegistrationNumber: "", taxNumber: "", contactPerson: "" });
  const [customerType, setCustomerType] = useState<"INDIVIDUAL" | "ORGANIZATION">("INDIVIDUAL");
  const [relationship, setRelationship] = useState<"PORTAL_CENTRIC" | "EMAIL_CENTRIC" | "CONNECTED_SYSTEM">("PORTAL_CENTRIC");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryName, setPrimaryName] = useState("");
  const [portalRole, setPortalRole] = useState<PortalMembershipRole>("REPRESENTATIVE");
  const [unitName, setUnitName] = useState("");

  const client = clients.find((item) => item.id === clientId) || null;
  const mode = modeFromActivation(customerType, relationship);
  const communicationMode = communicationFromRelationship(relationship);
  const targetName = clientSource === "new" ? newClient.name.trim() : client?.name || "";
  const existing = clientSource === "existing" ? workspaces.find((workspace) => workspace.clientId === clientId && workspace.mode === mode && workspace.status !== "ARCHIVED") || null : null;
  const derivedName = targetName ? `${targetName} - ${MODE_LABELS[mode]}` : "Ügyfélportál";
  const canActivate = clientSource === "new" ? Boolean(newClient.name.trim()) : Boolean(clientId);
  const roleOptions = useMemo<Array<{ value: PortalMembershipRole; label: string }>>(() => customerType === "INDIVIDUAL"
    ? [
      { value: "MEMBER", label: "Ügyfél" },
      { value: "REPRESENTATIVE", label: "Meghatalmazott / kapcsolattartó" },
    ]
    : [
      { value: "MEMBER", label: "Portálfelhasználó" },
      { value: "REPRESENTATIVE", label: "Szervezeti adminisztrátor / kapcsolattartó" },
    ], [customerType]);

  useEffect(() => {
    if (customerType === "INDIVIDUAL" && relationship === "CONNECTED_SYSTEM") setRelationship("PORTAL_CENTRIC");
    if (!roleOptions.some((option) => option.value === portalRole)) setPortalRole(roleOptions[0].value);
  }, [customerType, portalRole, relationship, roleOptions]);

  useEffect(() => {
    if (clientSource !== "existing" || !clientId) return;
    const activeSurfaces = workspaces.filter((workspace) => workspace.clientId === clientId && workspace.status === "ACTIVE");
    if (activeSurfaces.length !== 1) return;
    const derived = activationFromWorkspace(activeSurfaces[0]);
    setCustomerType(derived.customerType);
    setRelationship(derived.relationship);
  }, [clientId, clientSource, workspaces]);

  const activate = async () => {
    let targetClient = client;
    if (clientSource === "new") {
      if (!newClient.name.trim()) return;
      targetClient = await createClient({
        name: newClient.name.trim(),
        email: newClient.email.trim() || primaryEmail.trim() || undefined,
        phone: newClient.phone.trim() || undefined,
        companyRegistrationNumber: customerType === "ORGANIZATION" ? newClient.companyRegistrationNumber.trim() || undefined : undefined,
        taxNumber: customerType === "ORGANIZATION" ? newClient.taxNumber.trim() || undefined : undefined,
        contactPerson: newClient.contactPerson.trim() || primaryName.trim() || undefined,
      });
    }
    if (!targetClient) return;
    let workspace = existing;
    await updateClient(targetClient.id, {
      portalAccessEnabled: true,
      relationshipMode: relationship,
      connectedSystemState: relationship === "CONNECTED_SYSTEM" ? "READY" : null,
    });
    if (!workspace) {
      workspace = await createAdminWorkspace({
        clientId: targetClient.id,
        name: derivedName,
        mode,
        communicationMode,
        connectedSystemState: mode === "CASE_RELAY" ? "READY" : "NOT_CONFIGURED",
      });
    } else {
      workspace = await updateAdminWorkspace(workspace.id, {
        name: workspace.name || derivedName,
        communicationMode,
        connectedSystemState: mode === "CASE_RELAY" ? "READY" : workspace.connectedSystemState,
        revision: workspace.revision,
      });
      if (workspace.status === "SUSPENDED") workspace = await transitionAdminWorkspace(workspace.id, "activate", workspace.revision);
    }
    if (primaryEmail.trim()) {
      await inviteAdminWorkspaceMember(workspace.id, {
        email: primaryEmail.trim(),
        displayName: primaryName.trim() || undefined,
        role: portalRole,
      });
    }
    if (customerType === "ORGANIZATION" && unitName.trim()) {
      await listWorkspaceUnits(workspace.id).then(async (page) => {
        if (!page.items.some((unit) => unit.name.toLowerCase() === unitName.trim().toLowerCase())) {
          await createWorkspaceUnit(workspace.id, { name: unitName.trim() });
        }
      });
    }
    onActivated(workspace.id);
  };

  return (
    <AdminPanel className="p-5" data-testid="activation-wizard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyfélportál aktiválása</p>
          <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Client-first aktiváció</h2>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Az aktiválás a kanonikus ügyfélből indul, vagy itt hoz létre új ügyfelet ugyanazon ügyfélkezelési folyamaton keresztül. Ügyhozzáférés nem jön létre automatikusan.</p>
        </div>
        <AdminBadge tone="gold">Ügyfélportál aktív lesz</AdminBadge>
      </div>
      <div className="mt-5 grid gap-4">
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold text-[var(--adm-text)]">1. Ügyfél kiválasztása</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="activation-existing-client" onClick={() => setClientSource("existing")} className={`rounded-full border px-4 py-2 text-sm ${clientSource === "existing" ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)]" : "border-[var(--adm-border)]"}`}>Meglévő ügyfél</button>
            <button type="button" data-testid="activation-new-client" onClick={() => setClientSource("new")} className={`rounded-full border px-4 py-2 text-sm ${clientSource === "new" ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)]" : "border-[var(--adm-border)]"}`}>+ Új ügyfél létrehozása</button>
          </div>
          {clientSource === "existing" ? (
            <select data-testid="activation-client-select" value={clientId} onChange={(event) => setClientId(event.target.value)} className={inputCls}>
              <option value="">Válasszon meglévő ügyfelet</option>
              {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          ) : (
            <div className="grid gap-2 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-bg,#faf8f3)] p-3 md:grid-cols-2" data-testid="activation-new-client-form">
              <input className={inputCls} value={newClient.name} onChange={(event) => setNewClient((current) => ({ ...current, name: event.target.value }))} placeholder="Ügyfél neve *" />
              <input className={inputCls} value={newClient.email} onChange={(event) => setNewClient((current) => ({ ...current, email: event.target.value }))} placeholder="Ügyfél e-mail" />
              <input className={inputCls} value={newClient.phone} onChange={(event) => setNewClient((current) => ({ ...current, phone: event.target.value }))} placeholder="Telefonszám" />
              <input className={inputCls} value={newClient.contactPerson} onChange={(event) => setNewClient((current) => ({ ...current, contactPerson: event.target.value }))} placeholder="Kapcsolattartó" />
              {customerType === "ORGANIZATION" ? <>
                <input className={inputCls} value={newClient.companyRegistrationNumber} onChange={(event) => setNewClient((current) => ({ ...current, companyRegistrationNumber: event.target.value }))} placeholder="Cégjegyzékszám" />
                <input className={inputCls} value={newClient.taxNumber} onChange={(event) => setNewClient((current) => ({ ...current, taxNumber: event.target.value }))} placeholder="Adószám" />
              </> : null}
            </div>
          )}
        </section>
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold text-[var(--adm-text)]">2. Milyen ügyfél?</h3>
          <div className="flex flex-wrap gap-2">
            {(["INDIVIDUAL", "ORGANIZATION"] as const).map((type) => <button key={type} type="button" data-testid={`activation-type-${type}`} onClick={() => setCustomerType(type)} className={`rounded-full border px-4 py-2 text-sm ${customerType === type ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)]" : "border-[var(--adm-border)]"}`}>{MODE_LABELS[type]}</button>)}
          </div>
        </section>
        {customerType === "ORGANIZATION" ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold text-[var(--adm-text)]">3. Hogyan dolgozunk együtt?</h3>
            <div className="grid gap-2 md:grid-cols-3">
              {(["PORTAL_CENTRIC", "EMAIL_CENTRIC", "CONNECTED_SYSTEM"] as const).map((value) => <button key={value} type="button" data-testid={`relationship-${value}`} onClick={() => setRelationship(value)} className={`rounded-lg border p-3 text-left text-sm ${relationship === value ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)]" : "border-[var(--adm-border)]"}`}><b>{RELATIONSHIP_LABELS[value]}</b><span className="mt-1 block text-xs text-[var(--adm-text-muted)]">{value === "CONNECTED_SYSTEM" ? "Kapcsolt rendszer, CASE_RELAY áttekintés." : value === "EMAIL_CENTRIC" ? "E-mail az elsődleges, portál státuszhoz és dokumentumokhoz." : "Portál az elsődleges együttműködési felület."}</span></button>)}
            </div>
          </section>
        ) : null}
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold text-[var(--adm-text)]">4. Portál beállítása</h3>
          <p className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-sm text-[var(--adm-text-muted)]">{targetName ? `${derivedName} · ${MODE_LABELS[mode]} · ${COMMUNICATION_LABELS[communicationMode]}` : "A név és mód az ügyfél megadása után automatikusan készül."}</p>
        </section>
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold text-[var(--adm-text)]">5. Felhasználók</h3>
          <div className="grid gap-2 lg:grid-cols-4">
            <input className={inputCls} value={primaryEmail} onChange={(event) => setPrimaryEmail(event.target.value)} placeholder="Elsődleges felhasználó e-mail" />
            <input className={inputCls} value={primaryName} onChange={(event) => setPrimaryName(event.target.value)} placeholder="Név (opcionális)" />
            <select className={inputCls} value={portalRole} onChange={(event) => setPortalRole(event.target.value as PortalMembershipRole)}>
              {roleOptions.map((option) => <option key={option.value} value={option.value} data-testid={`activation-role-${customerType}-${option.value}`}>{option.label}</option>)}
            </select>
          </div>
        </section>
        {customerType === "ORGANIZATION" ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold text-[var(--adm-text)]">6. Szervezeti egységek</h3>
            <input className={inputCls} value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="Első szervezeti egység (opcionális)" />
          </section>
        ) : null}
        <section className="grid gap-2 rounded-xl border border-[var(--adm-border)] p-3">
          <h3 className="text-sm font-semibold text-[var(--adm-text)]">7. Összegzés és aktiválás</h3>
          <p className="text-sm text-[var(--adm-text-muted)]">{targetName || "Nincs ügyfél megadva"} · {MODE_LABELS[mode]} · {customerType === "ORGANIZATION" ? RELATIONSHIP_LABELS[relationship] : "Magánügyfél portál"} · ügyhozzáférés nem jön létre.</p>
          <AdminButton data-testid="activate-client-portal" variant="gold" disabled={busy || !canActivate} onClick={() => run(activate, "Ügyfélportál aktív. Következő lépés: felhasználó meghívása, szervezeti egység vagy vezetői rálátás beállítása.")}>Ügyfélportál aktiválása</AdminButton>
        </section>
      </div>
    </AdminPanel>
  );
}

function ClientPortalDetail({ workspace, client, memberships, cases, units, scopes, busy, run, onBack }: {
  workspace: AdminWorkspaceDTO;
  client: Client | null;
  memberships: ActiveMembershipDTO[];
  cases: CaseListItem[];
  units: OrganizationUnitAdminDTO[];
  scopes: SummaryScopeDTO[];
  busy: boolean;
  run: (fn: () => Promise<void>, okText: string) => Promise<void>;
  onBack: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const relationship = relationshipFromWorkspace(workspace, client);
  const clientMemberships = memberships.filter((item) => item.clientId === workspace.clientId);
  const activeGrants = clientMemberships.flatMap((item) => item.activeGrants);
  const tabs = ["overview", "users", ...(workspace.mode !== "INDIVIDUAL" ? ["units"] : []), "access", ...(workspace.mode !== "INDIVIDUAL" ? ["leadership"] : []), "settings", "audit"];
  const tabLabels: Record<string, string> = { overview: "Áttekintés", users: "Felhasználók", units: "Szervezeti egységek", access: "Ügyhozzáférések", leadership: "Vezetői rálátás", settings: "Beállítások", audit: "Audit" };
  return (
    <AdminPanel className="p-5" data-testid="client-portal-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-xs text-[var(--adm-text-muted)] hover:underline">← Vissza az ügyfélportálokhoz</button>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-[var(--adm-text)]">{client?.name || workspace.clientName || workspace.name}</h2>
          <p className="text-sm text-[var(--adm-text-muted)]">{MODE_LABELS[workspace.mode]} · {portalStatusLabel(workspace.status)}</p>
        </div>
        <AdminBadge tone={workspace.status === "ACTIVE" ? "green" : "neutral"}>{portalStatusLabel(workspace.status)}</AdminBadge>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-full border px-3 py-1.5 text-sm ${tab === item ? "border-[var(--adm-gold)] bg-[var(--adm-gold-soft,#f3ead2)]" : "border-[var(--adm-border)]"}`}>{tabLabels[item]}</button>)}
      </div>
      {tab === "overview" ? <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Ügyféltípus", MODE_LABELS[workspace.mode]],
          ["Együttműködés", RELATIONSHIP_LABELS[relationship]],
          ["Portál státusza", portalStatusLabel(workspace.status)],
          ["Aktív felhasználók", String(workspace.activeMembershipCount)],
          ["Aktív ügyhozzáférések", String(activeGrants.length)],
          ...(workspace.mode !== "INDIVIDUAL" ? [["Szervezeti egységek", String(units.length)], ["Vezetői rálátások", String(scopes.filter((scope) => scope.status === "ACTIVE").length)]] : []),
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3"><p className="text-xs text-[var(--adm-text-muted)]">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}
      </div> : null}
      {tab === "users" ? <div className="mt-5 grid gap-3">
        <InvitationForm workspace={workspace} busy={busy} run={run} />
        {workspace.memberships.map((member) => {
          const profile = clientMemberships.find((item) => item.clientPortalIdentityId === member.clientPortalIdentityId);
          return <div key={member.id} className="rounded-lg border border-[var(--adm-border)] p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span><b>{profile?.identityDisplayName || profile?.identityEmail || "Ügyfélfelhasználó"}</b><span className="ml-2 text-[var(--adm-text-muted)]">{profile?.identityEmail || ""}</span></span><AdminBadge tone={member.status === "ACTIVE" ? "green" : "neutral"}>{membershipStatusLabel(member.status)}</AdminBadge></div><p className="mt-1 text-xs text-[var(--adm-text-muted)]">{PORTAL_ROLE_LABELS[member.role]} · meghívva: {formatGrantDate(member.invitedAt)}</p><div className="mt-2 flex gap-2">{member.status === "ACTIVE" ? <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionAdminWorkspaceMembership(member.id, "suspend", member.revision).then(() => undefined), "Portálfelhasználó felfüggesztve.")}>Felfüggesztés</AdminButton> : null}<AdminButton size="sm" variant="muted" disabled={busy || member.status === "REVOKED"} onClick={() => run(() => transitionAdminWorkspaceMembership(member.id, "revoke", member.revision).then(() => undefined), "Portálfelhasználó visszavonva.")}>Visszavonás</AdminButton></div></div>;
        })}
      </div> : null}
      {tab === "units" ? <div className="mt-5"><p className="mb-3 text-sm text-[var(--adm-text-muted)]">Canonical ClientOrganizationGroup egységek.</p>{units.map((unit) => <div key={unit.id} className="mb-2 rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-sm"><b>{unit.name}</b> · {unit.status}</div>)}</div> : null}
      {tab === "access" ? <div className="mt-5 grid gap-3">
        <p className="text-sm text-[var(--adm-text-muted)]">Áttekintés és visszavonás. Napi ügyhozzáférés létrehozása továbbra is a Case workflow felületén az elsődleges.</p>
        {activeGrants.length ? activeGrants.map((grant) => {
          const linkedCase = cases.find((item) => item.id === grant.caseId);
          return <div key={grant.id} className="rounded-lg border border-[var(--adm-border)] p-3 text-sm"><b>{linkedCase ? `${linkedCase.caseNumber} · ${linkedCase.title}` : "Ügyhozzáférés"}</b><p className="mt-1 text-xs text-[var(--adm-text-muted)]">{permissionList(grant.permissions)} · érvényes: {formatGrantDate(grant.validUntil)}</p><details className="mt-2 text-xs"><summary className="cursor-pointer">Technikai adatok</summary><p className="font-mono">grant: {grant.id} · case: {grant.caseId} · revision: {grant.revision}</p></details></div>;
        }) : <p className="text-sm text-[var(--adm-text-muted)]">Nincs aktív ügyhozzáférés.</p>}
        {workspace.memberships.filter((member) => member.status === "ACTIVE").map((member) => (
          <WorkspaceGrantForm
            key={`workspace-grant-${member.id}`}
            workspace={workspace}
            membership={member}
            cases={cases}
            busy={busy}
            onGrant={({ caseId, permissions, validUntil }) => run(
              () => createIdentityGrant({ workspaceMembershipId: member.id, caseId, permissions, validUntil }).then(() => undefined),
              "Ügyhozzáférés létrehozva. Az ügyfél a portál frissítése után látja a közzétett ügyet.",
            )}
          />
        ))}
      </div> : null}
      {tab === "leadership" ? <div className="mt-5 grid gap-2">{scopes.length ? scopes.map((scope) => <div key={scope.id} className="rounded-lg border border-[var(--adm-border)] p-3 text-sm"><b>{scope.scopeType === "UNIT" ? "Szervezeti egység rálátás" : "Teljes szervezeti rálátás"}</b><span className="ml-2 text-[var(--adm-text-muted)]">{scope.status}</span><p className="mt-1 text-xs text-[var(--adm-text-muted)]">Aggregate-only. Nem ad ügyhozzáférést.</p><AdminButton className="mt-2" size="sm" variant="muted" disabled={busy || scope.status === "REVOKED"} onClick={() => run(() => transitionSummaryScope(scope.id, "revoke").then(() => undefined), "Vezetői rálátás visszavonva.")}>Visszavonás</AdminButton></div>) : <p className="text-sm text-[var(--adm-text-muted)]">Nincs vezetői rálátás.</p>}</div> : null}
      {tab === "settings" ? <div className="mt-5 grid gap-3"><WorkspaceSettings workspace={workspace} busy={busy} run={run} /><div className="flex gap-2">{workspace.status !== "ACTIVE" ? <AdminButton variant="neutral" disabled={busy || workspace.status === "ARCHIVED"} onClick={() => run(() => transitionAdminWorkspace(workspace.id, "activate", workspace.revision).then(() => undefined), "Ügyfélportál aktiválva.")}>Aktiválás</AdminButton> : <AdminButton variant="muted" disabled={busy} onClick={() => run(() => transitionAdminWorkspace(workspace.id, "suspend", workspace.revision).then(() => undefined), "Ügyfélportál felfüggesztve.")}>Felfüggesztés</AdminButton>}<AdminButton variant="muted" disabled={busy || workspace.status === "ARCHIVED"} onClick={() => run(() => transitionAdminWorkspace(workspace.id, "archive", workspace.revision).then(() => undefined), "Ügyfélportál archiválva.")}>Archiválás</AdminButton></div></div> : null}
      {tab === "audit" ? <div className="mt-5 grid gap-3 text-xs"><details open><summary className="cursor-pointer font-semibold">Technikai adatok / Audit</summary><p className="mt-2 font-mono">workspace: {workspace.id} · client: {workspace.clientId} · mode: {workspace.mode} · communication: {workspace.communicationMode}</p><div className="mt-2 space-y-1">{workspace.events.length ? workspace.events.map((event) => <p key={event.id}>{formatGrantDate(event.createdAt)} · {event.action} · {event.fromStatus || "—"} → {event.toStatus || "—"}</p>) : <p>Nincs esemény.</p>}</div></details></div> : null}
    </AdminPanel>
  );
}

function WorkspaceAdministration({ workspaces, clients, memberships, cases, busy, run }: { workspaces: AdminWorkspaceDTO[]; clients: Client[]; memberships: ActiveMembershipDTO[]; cases: CaseListItem[]; busy: boolean; run: (fn: () => Promise<void>, okText: string) => Promise<void> }) {
  const [view, setView] = useState<"active" | "archived">("active");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [unitCounts, setUnitCounts] = useState<Record<string, number>>({});
  const [scopeCounts, setScopeCounts] = useState<Record<string, number>>({});
  const [detailUnits, setDetailUnits] = useState<OrganizationUnitAdminDTO[]>([]);
  const [detailScopes, setDetailScopes] = useState<SummaryScopeDTO[]>([]);
  const visible = workspaces.filter((workspace) => view === "active" ? workspace.status === "ACTIVE" : workspace.status === "ARCHIVED");
  const selected = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || null;
  const selectedClient = selected ? clients.find((client) => client.id === selected.clientId) || null : null;

  useEffect(() => {
    let cancelled = false;
    async function loadCounts() {
      const orgLike = workspaces.filter((workspace) => workspace.mode !== "INDIVIDUAL");
      const pairs = await Promise.all(orgLike.map(async (workspace) => {
        const [units, scopes] = await Promise.all([
          listWorkspaceUnits(workspace.id).catch(() => ({ items: [] as OrganizationUnitAdminDTO[] })),
          listSummaryScopes(workspace.id).catch(() => ({ items: [] as SummaryScopeDTO[] })),
        ]);
        return [workspace.id, units.items.length, scopes.items.filter((scope) => scope.status === "ACTIVE").length] as const;
      }));
      if (!cancelled) {
        setUnitCounts(Object.fromEntries(pairs.map(([id, units]) => [id, units])));
        setScopeCounts(Object.fromEntries(pairs.map(([id, _units, scopes]) => [id, scopes])));
      }
    }
    void loadCounts();
    return () => { cancelled = true; };
  }, [workspaces]);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (!selected || selected.mode === "INDIVIDUAL") {
        setDetailUnits([]);
        setDetailScopes([]);
        return;
      }
      const [units, scopes] = await Promise.all([listWorkspaceUnits(selected.id), listSummaryScopes(selected.id)]);
      if (!cancelled) {
        setDetailUnits(units.items || []);
        setDetailScopes(scopes.items || []);
      }
    }
    void loadDetail().catch(() => undefined);
    return () => { cancelled = true; };
  }, [selected]);

  if (selected) {
    return <ClientPortalDetail workspace={selected} client={selectedClient} memberships={memberships} cases={cases} units={detailUnits} scopes={detailScopes} busy={busy} run={run} onBack={() => setSelectedWorkspaceId("")} />;
  }

  return (
    <div className="grid gap-5">
      <ActivationWizard clients={clients} workspaces={workspaces} busy={busy} run={run} onActivated={setSelectedWorkspaceId} />
      <AdminPanel className="p-5" data-testid="client-centric-portal-list">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Ügyfélportálok</h2>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Alapértelmezésben csak az aktív ügyfélportálok látszanak; acceptance/archív adatok az Archiváltak nézetben maradnak auditálhatók.</p>
          </div>
          <div className="flex gap-2">
            <AdminButton size="sm" variant={view === "active" ? "gold" : "neutral"} onClick={() => setView("active")}>Aktív ügyfélportálok</AdminButton>
            <AdminButton size="sm" variant={view === "archived" ? "gold" : "neutral"} onClick={() => setView("archived")}>Archiváltak</AdminButton>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-[var(--adm-text-muted)]"><tr>{["Ügyfél", "Típus", "Együttműködés", "Portál státusza", "Aktív felhasználók", "Szervezeti egységek", "Aktív ügyhozzáférések", "Vezetői rálátások", "Utolsó változás", ""].map((head) => <th key={head} className="px-3 py-2">{head}</th>)}</tr></thead>
            <tbody>
              {visible.map((workspace) => {
                const client = clients.find((item) => item.id === workspace.clientId);
                return <tr key={workspace.id} className="bg-[var(--adm-surface)] shadow-sm"><td className="rounded-l-lg px-3 py-3 font-semibold">{workspace.clientName || client?.name || workspace.name}</td><td className="px-3 py-3">{MODE_LABELS[workspace.mode]}</td><td className="px-3 py-3">{RELATIONSHIP_LABELS[relationshipFromWorkspace(workspace, client)]}</td><td className="px-3 py-3"><AdminBadge tone={workspace.status === "ACTIVE" ? "green" : "neutral"}>{portalStatusLabel(workspace.status)}</AdminBadge></td><td className="px-3 py-3">{workspace.activeMembershipCount}</td><td className="px-3 py-3">{unitCounts[workspace.id] || 0}</td><td className="px-3 py-3">{activeGrantCountForClient(workspace.clientId, memberships)}</td><td className="px-3 py-3">{scopeCounts[workspace.id] || 0}</td><td className="px-3 py-3">{workspace.events[0]?.createdAt ? formatGrantDate(workspace.events[0].createdAt) : "—"}</td><td className="rounded-r-lg px-3 py-3 text-right"><AdminButton size="sm" variant="neutral" onClick={() => setSelectedWorkspaceId(workspace.id)}>Megnyitás</AdminButton></td></tr>;
              })}
            </tbody>
          </table>
          {!visible.length ? <p className="mt-4 text-sm text-[var(--adm-text-muted)]">{view === "active" ? "Nincs aktív ügyfélportál ebben a nézetben." : "Nincs archivált ügyfélportál."}</p> : null}
        </div>
      </AdminPanel>
    </div>
  );
}

function PageBody() {
  const [queue, setQueue] = useState<MembershipRequestDTO[]>([]);
  const [memberships, setMemberships] = useState<ActiveMembershipDTO[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceDTO[]>([]);
  const [interactionQueues, setInteractionQueues] = useState<{
    requests: InternalInteractionRow[];
    questions: InternalInteractionRow[];
    submissions: InternalInteractionRow[];
    notifications: InternalInteractionRow[];
  }>({ requests: [], questions: [], submissions: [], notifications: [] });
  const [clients, setClients] = useState<Client[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [q, m, ws, cl, cs, req, question, submission, notification] = await Promise.all([
        listMembershipQueue(),
        listActiveMemberships(),
        listAdminWorkspaces(),
        getClients(),
        getCases(1, 100),
        workforceInteractionApi.listRequests({ limit: 8 }),
        workforceInteractionApi.listQuestions({ limit: 8 }),
        workforceInteractionApi.listSubmissions({ limit: 8 }),
        workforceInteractionApi.listNotifications({ status: "FAILED_RETRYABLE", limit: 8 }),
      ]);
      setQueue(q.items);
      setMemberships(m.items);
      setWorkspaces(ws.items);
      setClients(cl.data);
      setCases(cs.data);
      setInteractionQueues({
        requests: req.items || [],
        questions: question.items || [],
        submissions: submission.items || [],
        notifications: notification.items || [],
      });
    } catch {
      setLoadError("Az ügyfélportál-kezelő adatai nem tölthetők be.");
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

      <details className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-5">
        <summary className="cursor-pointer font-serif text-xl font-semibold text-[var(--adm-text)]">Átmeneti globális ügyfélkérés indítás</summary>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--adm-text-muted)]">A napi ügyfélteendők elsődleges helye az adott ügy ügyfélkapcsolati panelje. Ez a globális indítás csak átmeneti admin eszköz.</p>
          </div>
          <ClientRequestComposer cases={cases} clients={clients} onChanged={reload} />
        </div>
      </details>

      {feedback && (
        <div
          data-testid="admin-feedback"
          className={`rounded-xl border p-3 text-sm ${feedback.tone === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {feedback.text}
        </div>
      )}

      {loadError ? (
        <AdminPanel className="p-5" data-testid="client-portal-admin-load-error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">{loadError}</h2>
              <p className="mt-1 text-sm text-[var(--adm-text-muted)]">A workforce vezérlőpult elérhető marad a portál ügyféloldali olvasási kapcsolójától függetlenül, de az adatok betöltése most nem sikerült.</p>
            </div>
            <AdminButton variant="gold" disabled={loading} onClick={() => void reload()}>
              {loading ? "Újratöltés…" : "Újrapróbálás"}
            </AdminButton>
          </div>
        </AdminPanel>
      ) : null}

      {loadError ? null : (
      <>

      <WorkspaceAdministration workspaces={workspaces} clients={clients} memberships={memberships} cases={cases} busy={busy} run={run} />

      <details className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-5">
        <summary className="cursor-pointer font-serif text-xl font-semibold text-[var(--adm-text)]">Haladó szervezeti adminisztráció / Audit</summary>
        <div className="mt-4">
          <OrganizationAdminControlPlane
            clients={clients}
            cases={cases}
            memberships={memberships}
            workspaces={workspaces}
            questions={interactionQueues.questions}
            busy={busy}
            run={run}
          />
        </div>
      </details>

      <details className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-5">
        <summary className="cursor-pointer font-serif text-xl font-semibold text-[var(--adm-text)]">Operatív ügyfélportál sorok</summary>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Case-access alapján szűrt, ügyfélportál-specifikus munkasorok. Nem helyettesíti az Ügyek, Teendők vagy Kommunikáció oldalakat.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <InteractionQueueCard title="Bekérések" items={interactionQueues.requests} empty="Nincs aktív bekérés." onRequestAction={(item, action) => run(async () => {
            if (item.revision == null) throw new Error("A kérés verziója nem érhető el.");
            if (action === "publish") await workforceInteractionApi.publishRequest(item.id, item.revision);
            else if (action === "cancel") await workforceInteractionApi.cancelRequest(item.id, item.revision);
            else await workforceInteractionApi.completeRequest(item.id, item.revision);
          }, action === "publish" ? "Kérés közzétéve." : action === "cancel" ? "Kérés visszavonva." : "Kérés lezárva.")} />
          <InteractionQueueCard title="Kérdések" items={interactionQueues.questions} empty="Nincs megválaszolatlan kérdés." />
          <InteractionQueueCard title="Beküldések" items={interactionQueues.submissions} empty="Nincs új beküldés." />
          <InteractionQueueCard title="Sikertelen értesítések" items={interactionQueues.notifications} empty="Nincs újrapróbálható hiba." />
        </div>
        <div className="mt-5 border-t border-[var(--adm-border)] pt-4">
          <h3 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Ügyfélportál műveletek</h3>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Kérdés megválaszolása (piszkozat majd kifejezett küldés), beküldött fájlok elbírálása (CLEAN után emelhető az ügybe) és sikertelen értesítések újraküldése.</p>
          <div className="mt-3">
            <ClientInteractionInternalActions
              questions={interactionQueues.questions}
              submissions={interactionQueues.submissions}
              notifications={interactionQueues.notifications}
              onDone={reload}
            />
          </div>
        </div>
      </details>

      <AdminPanel className="p-5">
        <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Tagsági kérelmek ({pending.length})</h2>
        {loading ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
        {!loading && pending.length === 0 ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs elbírálásra váró tagsági kérelem.</p> : null}
        <div className="mt-3 grid gap-3">
          {pending.map((r) => (
            <div key={r.id} data-testid="membership-request-row" className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                {/* Kérelem adatai */}
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--adm-text)]">{r.displayNameSnapshot || r.requestedOrganizationName || "(nincs megadva)"}</p>
                  <p className="text-xs text-[var(--adm-text-muted)]">{r.verifiedEmailSnapshot || r.corporateEmail || "—"} · kért felület: {r.requestedMode ? MODE_LABELS[r.requestedMode] || r.requestedMode : "—"}</p>
                  <p className="text-xs text-[var(--adm-text-muted)]">cég: {r.requestedOrganizationName || "—"} · egység: {r.requestedGroupName || "—"} · munkakör: {r.claimedJobTitle || "—"}</p>
                  {r.noteSafe ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">megjegyzés: {r.noteSafe}</p> : null}
                  <details className="mt-1 text-[11px] text-[var(--adm-text-soft)]"><summary className="cursor-pointer">Technikai adatok</summary><p className="mt-1 font-mono">identity: {r.clientPortalIdentityId}</p></details>
                </div>
                <AdminBadge tone="gold">{r.status === "PENDING_REVIEW" ? "Jóváhagyásra vár" : r.status === "REJECTED" ? "Elutasítva" : r.status}</AdminBadge>
              </div>
              <ApproveForm
                request={r}
                clients={clients}
                workspaces={workspaces}
                busy={busy}
                onApprove={(payload) => run(() => approveMembershipRequest(r.id, { ...payload, revision: r.revision }).then(() => undefined), "Jóváhagyva. Aktív ügyfélfelület-tagság létrejött; ügyanyaghoz külön, kifejezett ügyhozzáférés szükséges.")}
                onReject={(payload) => run(() => rejectMembershipRequest(r.id, { ...payload, revision: r.revision }).then(() => undefined), "Tagsági kérelem elutasítva.")}
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
                  <AdminBadge tone={m.identityStatus === "ACTIVE" ? "green" : "neutral"}>{membershipStatusLabel(m.identityStatus)}</AdminBadge>
                  <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionMembership(m.id, "revoke").then(() => undefined), "Tagság visszavonva.")}>Tagság visszavonása</AdminButton>
                </div>
              </div>
              {m.activeGrants.length > 0 && (
                <div className="mt-3 grid gap-1">
                  {m.activeGrants.map((g) => (
                    <div key={g.id} data-testid="active-grant-row" className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-xs text-[var(--adm-text-muted)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>Ügy: <span className="font-mono">{g.caseId ? g.caseId.slice(0, 8) : "—"}</span></span>
                        <AdminBadge tone={g.status === "ACTIVE" ? "green" : "neutral"}>{membershipStatusLabel(g.status)}</AdminBadge>
                      </div>
                      <dl data-testid="grant-technical-details" className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-2">
                        <div><dt className="font-semibold">Grant ID</dt><dd><code className="select-all break-all">{g.id}</code></dd></div>
                        <div><dt className="font-semibold">Revision</dt><dd>{g.revision}</dd></div>
                        <div><dt className="font-semibold">Jogosultságok</dt><dd>{permissionList(g.permissions)}</dd></div>
                        <div><dt className="font-semibold">Érvényes eddig</dt><dd>{formatGrantDate(g.validUntil)}</dd></div>
                        <div><dt className="font-semibold">Létrehozva</dt><dd>{formatGrantDate(g.createdAt)}</dd></div>
                        <div><dt className="font-semibold">Módosítva</dt><dd>{formatGrantDate(g.updatedAt)}</dd></div>
                        {g.revokedAt ? <div><dt className="font-semibold">Visszavonva</dt><dd>{formatGrantDate(g.revokedAt)}</dd></div> : null}
                      </dl>
                      <div data-testid={`grant-lifecycle-${g.id}`} className="mt-2 border-t border-[var(--adm-border)] pt-2">
                        <p className="font-semibold">Lifecycle</p>
                        {g.lifecycleEvents.length ? g.lifecycleEvents.map((event) => <p key={event.id}>{formatGrantDate(event.createdAt)} · {event.action} · {event.fromStatus || "—"} → {event.toStatus || "—"}</p>) : <p>Nincs rögzített lifecycle esemény.</p>}
                      </div>
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
      </>
      )}
    </div>
  );
}

function InteractionQueueCard({ title, items, empty, onRequestAction }: { title: string; items: InternalInteractionRow[]; empty: string; onRequestAction?: (item: InternalInteractionRow, action: "publish" | "cancel" | "complete") => void }) {
  return (
    <div className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--adm-text)]">{title}</h3>
        <AdminBadge tone={items.length ? "gold" : "neutral"}>{items.length}</AdminBadge>
      </div>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <div key={item.id} className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-2 text-xs">
            <p className="font-semibold text-[var(--adm-text)]">{item.clientSafeTitle || item.subject || item.type || "Ügyfélportál elem"}</p>
            <p className="mt-1 text-[var(--adm-text-muted)]">{localizedInteractionStatus(item.status)}{item.caseId ? ` · ügy: ${item.caseId.slice(0, 8)}` : ""}</p>
            {onRequestAction && (item.status === "DRAFT" || item.status === "READY_TO_PUBLISH" || item.status === "PUBLISHED" || item.status === "SUBMITTED" || item.status === "CORRECTION_REQUESTED" || item.status === "UNDER_INTERNAL_REVIEW") ? <div className="mt-2 flex flex-wrap gap-1"><AdminButton size="sm" variant="muted" disabled={item.revision == null || item.status === "PUBLISHED"} onClick={() => onRequestAction(item, "publish")}>Közzététel</AdminButton><AdminButton size="sm" variant="muted" disabled={item.revision == null || item.status === "SUBMITTED" || item.status === "CORRECTION_REQUESTED" || item.status === "UNDER_INTERNAL_REVIEW"} onClick={() => onRequestAction(item, "cancel")}>Visszavonás</AdminButton><AdminButton size="sm" variant="gold" disabled={item.revision == null || item.status === "DRAFT" || item.status === "READY_TO_PUBLISH"} onClick={() => onRequestAction(item, "complete")}>Lezárás</AdminButton></div> : null}
          </div>
        )) : <p className="text-xs text-[var(--adm-text-muted)]">{empty}</p>}
      </div>
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
