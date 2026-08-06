"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader } from "@/components/adminiculum/ui";
import { getCases, getClients, type CaseListItem, type Client } from "@/lib/api";
import { localizedInteractionStatus, workforceInteractionApi, type InternalInteractionRow } from "@/lib/clientInteractionApi";
import { ClientInteractionInternalActions } from "@/components/client-portal/ClientInteractionInternalActions";
import { ClientRequestComposer } from "@/components/client-portal/ClientRequestComposer";
import {
  approveMembershipRequest,
  createAdminWorkspace,
  createIdentityGrant,
  GRANT_PERMISSIONS,
  inviteAdminWorkspaceMember,
  listAdminWorkspaces,
  listActiveMemberships,
  listMembershipQueue,
  rejectMembershipRequest,
  transitionAdminWorkspace,
  transitionAdminWorkspaceMembership,
  transitionMembership,
  updateAdminWorkspace,
  type ActiveMembershipDTO,
  type AdminWorkspaceDTO,
  type ApproveMembershipPayload,
  type CustomerSurfaceMode,
  type MembershipRequestDTO,
  type OrganizationUnitRole,
  type PortalMembershipRole,
} from "@/lib/clientPortalAdminApi";

const DEFAULT_PERMISSIONS = ["MATTER_READ", "DOCUMENT_READ", "DOCUMENT_DOWNLOAD", "UPDATE_READ"];

function formatGrantDate(value: string | null) {
  return value ? new Date(value).toLocaleString("hu-HU") : "—";
}

const MODE_LABELS: Record<string, string> = { INDIVIDUAL: "Magánügyfél", ORGANIZATION: "Szervezeti ügyfél", CASE_RELAY: "Ügyátvezető" };
const COMMUNICATION_LABELS: Record<string, string> = { PORTAL_PRIMARY: "Portál elsődleges", EMAIL_LINKED: "E-mailhez kapcsolt", EXTERNAL_ONLY: "Külső rendszer" };
const CONNECTED_STATE_LABELS: Record<string, string> = { NOT_CONFIGURED: "Nincs konfigurálva", CONFIGURATION_REQUIRED: "Konfiguráció szükséges", READY: "Kész", DISABLED: "Kikapcsolva" };
const DELIVERY_LABELS: Record<string, string> = { PENDING: "Kézbesítés folyamatban", SENDING: "Küldés alatt", SENT: "E-mail elküldve", FAILED_RETRYABLE: "E-mail-küldés jelenleg nem érhető el", FAILED_FINAL: "E-mail-küldés sikertelen", CANCELLED: "Kézbesítés visszavonva", NOT_REQUIRED: "Meglévő azonosítóhoz rögzítve" };
const PORTAL_ROLE_LABELS: Record<PortalMembershipRole, string> = { MEMBER: "Portálfelhasználó", REPRESENTATIVE: "Szervezeti kapcsolattartó", APPROVER: "Hozzáférés-jóváhagyó" };
const UNIT_ROLE_LABELS: Record<OrganizationUnitRole, string> = { MEMBER: "Tag", CONTACT: "Kapcsolattartó", APPROVER: "Jóváhagyó", MANAGER: "Egységvezető" };

const inputCls = "rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm text-[var(--adm-text)]";
const labelCls = "grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]";

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

function WorkspaceGrantForm({ workspace, membership, cases, busy, onGrant }: { workspace: AdminWorkspaceDTO; membership: AdminWorkspaceDTO['memberships'][number]; cases: CaseListItem[]; busy: boolean; onGrant: (caseId: string) => void }) {
  const [caseId, setCaseId] = useState('');
  const available = cases.filter((item) => item.clientId === workspace.clientId);
  return <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--adm-border)] pt-3"><label className="grid min-w-64 gap-1 text-xs font-semibold text-[var(--adm-text-muted)]"><span>Explicit ügyhozzáférés</span><select value={caseId} onChange={(event) => setCaseId(event.target.value)} className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm"><option value="">— Válasszon ügyet —</option>{available.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} · {item.title}</option>)}</select></label><AdminButton size="sm" variant="gold" disabled={busy || !caseId || membership.status !== 'ACTIVE'} onClick={() => onGrant(caseId)}>Grant létrehozása</AdminButton></div>;
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
          {(Object.keys(PORTAL_ROLE_LABELS) as Array<typeof draft.role>).map((role) => <option key={role} value={role}>{PORTAL_ROLE_LABELS[role]}</option>)}
        </select>
        <input type="date" value={draft.expiresAt} onChange={(event) => setDraft((value) => ({ ...value, expiresAt: event.target.value }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm" />
        <AdminButton size="sm" variant="neutral" disabled={busy || !draft.email.trim()} onClick={() => run(submit, "Meghívás rögzítve; ügyhozzáférés nem jött létre.")}>Meghívás küldése</AdminButton>
        <textarea value={draft.messageSafe} onChange={(event) => setDraft((value) => ({ ...value, messageSafe: event.target.value }))} placeholder="Ügyfélnek szánt rövid üzenet (opcionális)" className="min-h-20 rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm lg:col-span-5" />
      </div>
      <div className="mt-3 grid gap-2">
        {workspace.invitations.length ? workspace.invitations.map((invitation) => (
          <div key={invitation.id} className="rounded-lg bg-white p-2 text-xs text-[var(--adm-text-muted)]">
            <span className="font-semibold text-[var(--adm-text)]">{invitation.intendedEmail || "—"}</span>
            <span> · {deliverySummary(invitation.deliveryStatus, invitation.deliveryCodeSafe)} · lejár: {formatGrantDate(invitation.expiresAt)}</span>
            <details className="mt-1"><summary className="cursor-pointer">Technikai részletek</summary><p className="font-mono">invitation: {invitation.id} · status: {invitation.status} · delivery: {invitation.deliveryStatus || "—"}</p></details>
          </div>
        )) : <p className="text-xs text-[var(--adm-text-muted)]">Nincs aktív meghívás.</p>}
      </div>
    </div>
  );
}

function WorkspaceAdministration({ workspaces, clients, cases, busy, run }: { workspaces: AdminWorkspaceDTO[]; clients: Client[]; cases: CaseListItem[]; busy: boolean; run: (fn: () => Promise<void>, okText: string) => Promise<void> }) {
  const [draft, setDraft] = useState({ clientId: '', name: '', mode: 'INDIVIDUAL' as AdminWorkspaceDTO['mode'], communicationMode: 'PORTAL_PRIMARY' as AdminWorkspaceDTO['communicationMode'], connectedSystemState: 'NOT_CONFIGURED' as AdminWorkspaceDTO['connectedSystemState'] });
  return <AdminPanel className="p-5" data-testid="workspace-administration">
    <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Ügyfélmunkaterek</h2>
    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">A munkatér-tagság nem tesz automatikusan láthatóvá ügyet. Az ügyhozzáférés, publikáció, dokumentum-, üzenet- és számlázási hozzáférés külön döntés.</p>
    <div className="mt-4 grid gap-3 rounded-xl border border-[var(--adm-border)] p-4 lg:grid-cols-6">
      <select value={draft.clientId} onChange={(event) => setDraft((value) => ({ ...value, clientId: event.target.value }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm"><option value="">Ügyfél kiválasztása</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      <input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="Munkatér neve" className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm" />
      <select value={draft.mode} onChange={(event) => setDraft((value) => ({ ...value, mode: event.target.value as AdminWorkspaceDTO['mode'] }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm"><option value="INDIVIDUAL">Magánügyfél</option><option value="ORGANIZATION">Szervezeti ügyfél</option><option value="CASE_RELAY">Ügyátvezető</option></select>
      <select value={draft.communicationMode} onChange={(event) => setDraft((value) => ({ ...value, communicationMode: event.target.value as AdminWorkspaceDTO['communicationMode'] }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm"><option value="PORTAL_PRIMARY">Portál az elsődleges</option><option value="EMAIL_LINKED">E-mailhez kapcsolt</option><option value="EXTERNAL_ONLY">Külső rendszer</option></select>
      {draft.mode === 'CASE_RELAY' ? <select value={draft.connectedSystemState} onChange={(event) => setDraft((value) => ({ ...value, connectedSystemState: event.target.value as AdminWorkspaceDTO['connectedSystemState'] }))} className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm"><option value="NOT_CONFIGURED">Nincs konfigurálva</option><option value="CONFIGURATION_REQUIRED">Konfiguráció szükséges</option><option value="READY">Kész</option><option value="DISABLED">Kikapcsolva</option></select> : <span className="rounded-lg bg-[var(--adm-bg,#faf8f3)] px-3 py-2 text-xs text-[var(--adm-text-muted)]">Kapcsolt rendszer állapota csak ügyátvezető felületnél releváns.</span>}
      <AdminButton variant="gold" disabled={busy || !draft.clientId || !draft.name.trim()} onClick={() => run(() => createAdminWorkspace(draft).then(() => undefined), 'Munkatér létrehozva. Nincs automatikus tagság vagy ügyhozzáférés.')}>Munkatér létrehozása</AdminButton>
    </div>
    <div className="mt-4 grid gap-4">{workspaces.map((workspace) => <article key={workspace.id} className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{workspace.name}</p><p className="text-xs text-[var(--adm-text-muted)]">{workspace.clientName} · {MODE_LABELS[workspace.mode]} · {COMMUNICATION_LABELS[workspace.communicationMode]}{workspace.mode === 'CASE_RELAY' ? ` · ${CONNECTED_STATE_LABELS[workspace.connectedSystemState]}` : ''}</p><p className="mt-1 text-xs text-[var(--adm-text-muted)]">Aktív tagság: {workspace.activeMembershipCount} · Meghívás: {workspace.pendingInvitationCount} · Jóváhagyásra vár: {workspace.pendingApprovalCount}</p></div><div className="flex flex-wrap gap-2"><AdminBadge tone={workspace.status === 'ACTIVE' ? 'green' : 'neutral'}>{workspace.status === 'ACTIVE' ? 'Aktív' : workspace.status === 'SUSPENDED' ? 'Felfüggesztve' : 'Archiválva'}</AdminBadge>{workspace.status !== 'ACTIVE' ? <AdminButton size="sm" variant="neutral" disabled={busy || workspace.status === 'ARCHIVED'} onClick={() => run(() => transitionAdminWorkspace(workspace.id, 'activate', workspace.revision).then(() => undefined), 'Munkatér aktiválva.')}>Aktiválás</AdminButton> : <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionAdminWorkspace(workspace.id, 'suspend', workspace.revision).then(() => undefined), 'Munkatér felfüggesztve.')}>Felfüggesztés</AdminButton>}<AdminButton size="sm" variant="muted" disabled={busy || workspace.status === 'ARCHIVED'} onClick={() => run(() => transitionAdminWorkspace(workspace.id, 'archive', workspace.revision).then(() => undefined), 'Munkatér archiválva.')}>Archiválás</AdminButton></div></div>
      {workspace.mode === 'CASE_RELAY' && workspace.connectedSystemState !== 'READY' ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Nincs automatikus szinkronizáció. A kapcsolt rendszer konfigurációja még nem kész.</p> : null}
      <WorkspaceSettings workspace={workspace} busy={busy} run={run} />
      <InvitationForm workspace={workspace} busy={busy} run={run} />
      <div className="mt-3 grid gap-2">{workspace.memberships.map((membership) => <div key={membership.id} className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span>Identity: {membership.clientPortalIdentityId.slice(0, 8)} · {membership.role}</span><div className="flex gap-2"><AdminBadge tone={membership.status === 'ACTIVE' ? 'green' : 'neutral'}>{membership.status}</AdminBadge>{membership.status === 'PENDING_APPROVAL' ? <AdminButton size="sm" variant="gold" disabled={busy} onClick={() => run(() => transitionAdminWorkspaceMembership(membership.id, 'approve', membership.revision).then(() => undefined), 'Munkatér-tagság jóváhagyva; grant nem jött létre.')}>Jóváhagyás</AdminButton> : null}{membership.status === 'ACTIVE' ? <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionAdminWorkspaceMembership(membership.id, 'suspend', membership.revision).then(() => undefined), 'Munkatér-tagság felfüggesztve.')}>Felfüggesztés</AdminButton> : null}<AdminButton size="sm" variant="muted" disabled={busy || membership.status === 'REVOKED'} onClick={() => run(() => transitionAdminWorkspaceMembership(membership.id, 'revoke', membership.revision).then(() => undefined), 'Munkatér-tagság visszavonva.')}>Visszavonás</AdminButton></div></div>{membership.status === 'ACTIVE' ? <WorkspaceGrantForm workspace={workspace} membership={membership} cases={cases} busy={busy} onGrant={(caseId) => run(() => createIdentityGrant({ workspaceMembershipId: membership.id, caseId, permissions: DEFAULT_PERMISSIONS }).then(() => undefined), 'Explicit ügyhozzáférés létrehozva.')}/> : null}</div>)}</div>
      <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">Lifecycle / audit</summary><div className="mt-2 space-y-1">{workspace.events.length ? workspace.events.map((event) => <p key={event.id}>{formatGrantDate(event.createdAt)} · {event.action} · {event.fromStatus || '—'} → {event.toStatus || '—'}</p>) : <p>Nincs esemény.</p>}</div></details>
    </article>)}</div>
  </AdminPanel>;
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
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
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

      <AdminPanel className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Kérések létrehozása</h2>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Globális indításkor csak az engedélyezett ügyfelek és ügyek választhatók. A tervezet külön publikálható.</p>
        </div>
        <ClientRequestComposer cases={cases} clients={clients} onChanged={reload} />
      </AdminPanel>

      {feedback && (
        <div
          data-testid="admin-feedback"
          className={`rounded-xl border p-3 text-sm ${feedback.tone === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {feedback.text}
        </div>
      )}

      <WorkspaceAdministration workspaces={workspaces} clients={clients} cases={cases} busy={busy} run={run} />

      <AdminPanel className="p-5">
        <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Operatív ügyfélportál sorok</h2>
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
      </AdminPanel>

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
                  <AdminBadge tone={m.identityStatus === "ACTIVE" ? "green" : "neutral"}>identity {m.identityStatus}</AdminBadge>
                  <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionMembership(m.id, "revoke").then(() => undefined), "Tagság visszavonva.")}>Tagság visszavonása</AdminButton>
                </div>
              </div>
              {m.activeGrants.length > 0 && (
                <div className="mt-3 grid gap-1">
                  {m.activeGrants.map((g) => (
                    <div key={g.id} data-testid="active-grant-row" className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-xs text-[var(--adm-text-muted)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>Ügy: <span className="font-mono">{g.caseId ? g.caseId.slice(0, 8) : "—"}</span></span>
                        <AdminBadge tone={g.status === "ACTIVE" ? "green" : "neutral"}>{g.status}</AdminBadge>
                      </div>
                      <dl data-testid="grant-technical-details" className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-2">
                        <div><dt className="font-semibold">Grant ID</dt><dd><code className="select-all break-all">{g.id}</code></dd></div>
                        <div><dt className="font-semibold">Revision</dt><dd>{g.revision}</dd></div>
                        <div><dt className="font-semibold">Permissions</dt><dd>{g.permissions.join(", ") || "—"}</dd></div>
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
