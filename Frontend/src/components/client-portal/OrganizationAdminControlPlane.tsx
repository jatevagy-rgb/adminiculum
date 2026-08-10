"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminBadge, AdminButton, AdminPanel } from "@/components/adminiculum/ui";
import { type CaseListItem, type Client } from "@/lib/api";
import {
  assignUnitMembership,
  createCaseParticipant,
  createWorkspaceUnit,
  createSummaryScope,
  GRANT_PERMISSIONS,
  listCaseParticipants,
  listSummaryScopes,
  listUnitMemberships,
  listWorkspaceUnits,
  revokeUnitMembership,
  revokeCaseParticipant,
  transitionSummaryScope,
  unlinkWorkspaceUnit,
  updateCaseParticipant,
  type ActiveMembershipDTO,
  type AdminWorkspaceDTO,
  type CaseParticipantDTO,
  type OrganizationUnitAdminDTO,
  type OrganizationUnitRole,
  type ParticipantRole,
  type SummaryScopeDTO,
  type UnitMembershipDTO,
} from "@/lib/clientPortalAdminApi";
import { workforceInteractionApi, type InternalInteractionRow } from "@/lib/clientInteractionApi";

type Props = {
  clients: Client[];
  cases: CaseListItem[];
  memberships: ActiveMembershipDTO[];
  workspaces: AdminWorkspaceDTO[];
  questions: InternalInteractionRow[];
  busy: boolean;
  run: (fn: () => Promise<void>, okText: string) => void;
};

const input = "rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-sm text-[var(--adm-text)]";
const label = "grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]";
const PARTICIPANT_ROLES: ParticipantRole[] = ["REQUESTER", "CLIENT_OWNER", "PARTICIPANT", "OBSERVER"];
const UNIT_ROLES: OrganizationUnitRole[] = ["MEMBER", "CONTACT", "APPROVER", "MANAGER"];

const PARTICIPANT_LABELS: Record<ParticipantRole, string> = {
  REQUESTER: "Kérelmező",
  CLIENT_OWNER: "Ügyféloldali felelős",
  PARTICIPANT: "Résztvevő",
  OBSERVER: "Megfigyelő",
};

const UNIT_ROLE_LABELS: Record<OrganizationUnitRole, string> = {
  MEMBER: "Tag",
  CONTACT: "Kapcsolattartó",
  APPROVER: "Jóváhagyó",
  MANAGER: "Egységvezető",
};

const PERMISSION_LABELS: Record<string, string> = {
  MATTER_READ: "ügyösszefoglaló",
  CLIENT_TIMELINE_READ: "ügyfél-idővonal",
  DOCUMENT_READ: "dokumentumok",
  DOCUMENT_DOWNLOAD: "dokumentumletöltés",
  DOCUMENT_UPLOAD: "dokumentumfeltöltés",
  MESSAGE_READ: "kommunikáció megtekintése",
  MESSAGE_SEND: "kommunikáció küldése",
  ACTION_REQUEST_READ: "ügyfélteendők",
  UPDATE_READ: "frissítések",
};

function permissionSummary(permissions: string[]) {
  return permissions.map((permission) => PERMISSION_LABELS[permission] || permission).join(", ");
}

export function OrganizationAdminControlPlane({ clients, cases, memberships, workspaces, questions, busy, run }: Props) {
  const orgWorkspaces = useMemo(() => workspaces.filter((workspace) => workspace.mode === "ORGANIZATION"), [workspaces]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantRole, setParticipantRole] = useState<ParticipantRole>("PARTICIPANT");
  const [permissions, setPermissions] = useState<string[]>(["MATTER_READ", "UPDATE_READ"]);
  const [summaryEmail, setSummaryEmail] = useState("");
  const [summaryGroupId, setSummaryGroupId] = useState("");
  const [threadSubject, setThreadSubject] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [selectedWorkspaceMemberId, setSelectedWorkspaceMemberId] = useState("");
  const [unitMembershipGroupId, setUnitMembershipGroupId] = useState("");
  const [unitMembershipRole, setUnitMembershipRole] = useState<OrganizationUnitRole>("MEMBER");
  const [units, setUnits] = useState<OrganizationUnitAdminDTO[]>([]);
  const [unitMemberships, setUnitMemberships] = useState<UnitMembershipDTO[]>([]);
  const [participants, setParticipants] = useState<CaseParticipantDTO[]>([]);
  const [scopes, setScopes] = useState<SummaryScopeDTO[]>([]);

  const workspace = orgWorkspaces.find((item) => item.id === workspaceId) || null;
  const client = clients.find((item) => item.id === workspace?.clientId) || null;
  const workspaceCases = useMemo(() => cases.filter((item) => !workspace || item.clientId === workspace.clientId), [cases, workspace]);
  const selectedCase = workspaceCases.find((item) => item.id === caseId) || null;
  const workspaceMembers = memberships.filter((membership) => !workspace || membership.clientId === workspace.clientId);
  const activeMemberByIdentity = useMemo(() => new Map(workspaceMembers.map((membership) => [membership.clientPortalIdentityId, membership])), [workspaceMembers]);
  const workspaceMemberOptions = useMemo(
    () => (workspace?.memberships || [])
      .filter((membership) => membership.status === "ACTIVE")
      .map((membership) => ({ ...membership, profile: activeMemberByIdentity.get(membership.clientPortalIdentityId) || null })),
    [activeMemberByIdentity, workspace?.memberships],
  );

  const reloadOrgData = useCallback(async () => {
    if (!workspaceId) {
      setUnits([]);
      setScopes([]);
      setParticipants([]);
      setUnitMemberships([]);
      return;
    }
    const [unitPage, scopePage] = await Promise.all([listWorkspaceUnits(workspaceId), listSummaryScopes(workspaceId)]);
    setUnits(unitPage.items || []);
    setScopes(scopePage.items || []);
    if (selectedWorkspaceMemberId) {
      const unitMembershipPage = await listUnitMemberships(workspaceId, selectedWorkspaceMemberId);
      setUnitMemberships(unitMembershipPage.items || []);
    } else {
      setUnitMemberships([]);
    }
    if (caseId) {
      const participantPage = await listCaseParticipants(workspaceId, caseId);
      setParticipants(participantPage.items || []);
    } else {
      setParticipants([]);
    }
  }, [caseId, selectedWorkspaceMemberId, workspaceId]);

  useEffect(() => { void reloadOrgData().catch(() => undefined); }, [reloadOrgData]);

  const togglePermission = (permission: string) => {
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  };

  return (
    <AdminPanel className="space-y-5 p-5" data-testid="organization-admin-control-plane">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">CP1 szervezeti ügyfélportál</p>
        <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Szervezeti felépítés és ügyféloldali hozzáférések</h2>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
          A szervezeti szerepkör önmagában nem biztosít hozzáférést az egység egyedi ügyeihez, dokumentumaihoz vagy üzeneteihez.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <label className={label}>
          <span>Ügyfélfelület</span>
          <select className={input} value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); setCaseId(""); setSelectedWorkspaceMemberId(""); setUnitMembershipGroupId(""); }}>
            <option value="">— Szervezeti felület —</option>
            {orgWorkspaces.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.clientName}</option>)}
          </select>
        </label>
        <label className={label}>
          <span>Ügy</span>
          <select className={input} value={caseId} onChange={(event) => setCaseId(event.target.value)} disabled={!workspaceId}>
            <option value="">— Case —</option>
            {workspaceCases.map((item) => <option key={item.id} value={item.id}>{item.caseNumber || item.id.slice(0, 8)} · {item.title}</option>)}
          </select>
        </label>
        <div className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-bg,#faf8f3)] p-3 text-xs text-[var(--adm-text-muted)]">
          <b className="text-[var(--adm-text)]">Kiválasztás</b>
          <p>{client?.name || "Nincs ügyfél"} · {workspace?.name || "nincs felület"} · {selectedCase?.title || "nincs ügy"}</p>
        </div>
      </div>

      <section className="grid gap-3 rounded-xl border border-[var(--adm-border)] p-4">
        <h3 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Szervezeti egységek</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input className={input} value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} placeholder="pl. HR, Compliance" />
          <AdminButton variant="gold" disabled={busy || !workspace || !newUnitName.trim()} onClick={() => run(async () => {
            if (!workspace) return;
            await createWorkspaceUnit(workspace.id, { name: newUnitName.trim() });
            setNewUnitName("");
            await reloadOrgData();
          }, "Szervezeti egység létrehozva és ügyfélfelülethez kapcsolva.")}>Egység létrehozása</AdminButton>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {units.map((unit) => <div key={unit.id} className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--adm-text)]">{unit.name}</span>
              <AdminBadge tone={unit.status === "ACTIVE" ? "green" : "neutral"}>{unit.status === "ACTIVE" ? "Aktív" : unit.status}</AdminBadge>
            </div>
            <AdminButton className="mt-2" size="sm" variant="muted" disabled={busy} onClick={() => run(() => unlinkWorkspaceUnit(unit.id).then(reloadOrgData), "Szervezeti egység leválasztva az ügyfélfelületről.")}>Leválasztás</AdminButton>
          </div>)}
          {!units.length ? <p className="text-xs text-[var(--adm-text-muted)]">Nincs kapcsolt szervezeti egység.</p> : null}
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-[var(--adm-border)] p-4" data-testid="organization-unit-membership-admin">
        <div>
          <h3 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Céges felhasználók → Szervezeti egységek</h3>
          <p className="text-xs text-[var(--adm-text-muted)]">
            Portálszerep és szervezeti egységen belüli szerep külön jogosultság. A HR-tagság nem ad automatikusan HR-ügyet; Case-hozzáférés csak explicit résztvevő/grant után jön létre.
          </p>
        </div>
        <div className="grid gap-2 xl:grid-cols-4">
          <label className={label}>
            <span>Céges felhasználó</span>
            <select className={input} value={selectedWorkspaceMemberId} onChange={(event) => setSelectedWorkspaceMemberId(event.target.value)} disabled={!workspaceId}>
              <option value="">— aktív portáltag —</option>
              {workspaceMemberOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.profile?.identityDisplayName || member.profile?.identityEmail || member.clientPortalIdentityId} · Portálszerep: {member.role === "REPRESENTATIVE" ? "Szervezeti kapcsolattartó" : member.role === "APPROVER" ? "Portál jóváhagyó" : "Portálfelhasználó"}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            <span>Szervezeti egység</span>
            <select className={input} value={unitMembershipGroupId} onChange={(event) => setUnitMembershipGroupId(event.target.value)} disabled={!selectedWorkspaceMemberId}>
              <option value="">— egység —</option>
              {units.filter((unit) => unit.status === "ACTIVE").map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <label className={label}>
            <span>Egységen belüli szerep</span>
            <select className={input} value={unitMembershipRole} onChange={(event) => setUnitMembershipRole(event.target.value as OrganizationUnitRole)} disabled={!selectedWorkspaceMemberId}>
              {UNIT_ROLES.map((role) => <option key={role} value={role}>{UNIT_ROLE_LABELS[role]}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <AdminButton className="w-full" variant="gold" disabled={busy || !workspaceId || !selectedWorkspaceMemberId || !unitMembershipGroupId} onClick={() => run(async () => {
              await assignUnitMembership(workspaceId, selectedWorkspaceMemberId, { groupId: unitMembershipGroupId, unitRole: unitMembershipRole });
              setUnitMembershipGroupId("");
              await reloadOrgData();
            }, "Szervezeti egység-tagság rögzítve; Case-hozzáférés nem jött létre.")}>Egységhez rendelés</AdminButton>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {unitMemberships.map((membership) => (
            <div key={membership.id} className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b>{membership.organizationGroupName || "Szervezeti egység"}</b> · {UNIT_ROLE_LABELS[membership.unitRole] || membership.unitRole}</span>
                <AdminBadge tone={membership.status === "ACTIVE" ? "green" : "neutral"}>{membership.status === "ACTIVE" ? "Aktív" : membership.status === "SUSPENDED" ? "Felfüggesztve" : "Visszavonva"}</AdminBadge>
              </div>
              <p className="mt-1 text-[var(--adm-text-muted)]">{membership.identityDisplayName || membership.identityEmail || "Portáltag"} · Ez nem ügyhozzáférés.</p>
              <AdminButton className="mt-2" size="sm" variant="muted" disabled={busy || membership.status === "REVOKED"} onClick={() => run(() => revokeUnitMembership(membership.id).then(reloadOrgData), "Szervezeti egység-tagság visszavonva.")}>Egység eltávolítása</AdminButton>
            </div>
          ))}
          {selectedWorkspaceMemberId && !unitMemberships.length ? <p className="text-xs text-[var(--adm-text-muted)]">A kiválasztott felhasználó még nincs szervezeti egységhez rendelve.</p> : null}
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-[var(--adm-border)] p-4">
        <h3 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Ügyféloldali résztvevők</h3>
        <p className="text-xs text-[var(--adm-text-muted)]">WORKSPACE MEMBERSHIP ≠ CASE ACCESS. A résztvevő csak explicit Case granttel lát ügyet, dokumentumot vagy üzenetet.</p>
        <div className="grid gap-2 lg:grid-cols-3">
          <input className={input} value={participantEmail} onChange={(event) => setParticipantEmail(event.target.value)} placeholder="Hitelesített e-mail vagy identity" />
          <select className={input} value={participantRole} onChange={(event) => setParticipantRole(event.target.value as ParticipantRole)}>
            {PARTICIPANT_ROLES.map((role) => <option key={role} value={role}>{PARTICIPANT_LABELS[role]}</option>)}
          </select>
          <AdminButton variant="gold" disabled={busy || !workspaceId || !caseId || !participantEmail.trim() || !permissions.length} onClick={() => run(async () => {
            await createCaseParticipant({ workspaceId, caseId, email: participantEmail.trim(), participantRole, permissions });
            setParticipantEmail("");
            await reloadOrgData();
          }, "Ügyféloldali résztvevő hozzáadva vagy azonos grant reaktiválva.")}>Résztvevő hozzáadása</AdminButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {GRANT_PERMISSIONS.map((permission) => <label key={permission} className="inline-flex items-center gap-2 rounded-full border border-[var(--adm-border)] px-3 py-1 text-xs"><input type="checkbox" checked={permissions.includes(permission)} onChange={() => togglePermission(permission)} />{PERMISSION_LABELS[permission] || permission}</label>)}
        </div>
        <div className="grid gap-2">
          {participants.map((participant) => <div key={participant.id} className="rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><b>{PARTICIPANT_LABELS[participant.participantRole as ParticipantRole] || participant.participantRole || "Résztvevő"}</b> · {participant.clientPortalIdentityId || "identity e-mail alapján"}</span>
              <AdminBadge tone={participant.status === "ACTIVE" ? "green" : "neutral"}>{participant.status}</AdminBadge>
            </div>
            <p className="mt-1 text-[var(--adm-text-muted)]">{permissionSummary(participant.permissions)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PARTICIPANT_ROLES.map((role) => <AdminButton key={role} size="sm" variant="neutral" disabled={busy || participant.participantRole === role} onClick={() => run(() => updateCaseParticipant(participant.id, { revision: participant.revision, participantRole: role }).then(reloadOrgData), `${PARTICIPANT_LABELS[role]} szerep beállítva.`)}>{PARTICIPANT_LABELS[role]}</AdminButton>)}
              <AdminButton size="sm" variant="muted" disabled={busy || participant.status === "REVOKED"} onClick={() => run(() => revokeCaseParticipant(participant.id).then(reloadOrgData), "Ügyféloldali résztvevő visszavonva.")}>Visszavonás</AdminButton>
            </div>
          </div>)}
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-[var(--adm-border)] p-4">
        <h3 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Ügyfélkommunikáció</h3>
        <p className="text-xs text-[var(--adm-text-muted)]">Belső tervezet — az ügyfél még nem látja. A válasz csak explicit küldéssel jelenik meg.</p>
        <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
          <input className={input} value={threadSubject} onChange={(event) => setThreadSubject(event.target.value)} placeholder="Új kérdésszál tárgya" />
          <AdminButton variant="gold" disabled={busy || !caseId || !threadSubject.trim()} onClick={() => run(async () => {
            const created = await workforceInteractionApi.createQuestionThread({ caseId, subjectSafe: threadSubject.trim(), category: "CASE_COMMUNICATION" });
            setSelectedThreadId(created.thread.id);
            setThreadSubject("");
          }, "Ügyfélkommunikációs szál létrehozva belső oldalon.")}>Szál létrehozása</AdminButton>
        </div>
        <div className="grid gap-2 lg:grid-cols-[1fr_2fr_auto_auto]">
          <select className={input} value={selectedThreadId} onChange={(event) => setSelectedThreadId(event.target.value)}>
            <option value="">— Szál —</option>
            {questions.map((thread) => <option key={thread.id} value={thread.id}>{thread.subject || thread.clientSafeTitle || thread.id.slice(0, 8)}</option>)}
          </select>
          <input className={input} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="Belső tervezet szövege" />
          <AdminButton variant="neutral" disabled={busy || !selectedThreadId || !draftBody.trim()} onClick={() => run(async () => {
            await workforceInteractionApi.draftAnswer(selectedThreadId, draftBody.trim());
            setDraftBody("");
          }, "Belső tervezet rögzítve; az ügyfél még nem látja.")}>Tervezet</AdminButton>
          <AdminButton variant="muted" disabled={busy || !selectedThreadId} onClick={() => run(() => workforceInteractionApi.archiveQuestion(selectedThreadId).then(() => undefined), "Kérdésszál archiválva.")}>Archiválás</AdminButton>
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-[var(--adm-border)] p-4">
        <h3 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Vezetői rálátás</h3>
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Ez a rálátás kizárólag összesített adatokat biztosít. Nem ad hozzáférést egyedi ügyekhez, dokumentumokhoz vagy üzenetekhez.</p>
        <div className="grid gap-2 lg:grid-cols-4">
          <input className={input} value={summaryEmail} onChange={(event) => setSummaryEmail(event.target.value)} placeholder="Hitelesített e-mail" />
          <select className={input} value={summaryGroupId} onChange={(event) => setSummaryGroupId(event.target.value)}>
            <option value="">Teljes szervezeti összesítő</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>Szervezeti egység összesítő: {unit.name}</option>)}
          </select>
          <AdminButton variant="gold" disabled={busy || !workspaceId || !summaryEmail.trim()} onClick={() => run(async () => {
            await createSummaryScope({ workspaceId, email: summaryEmail.trim(), scopeType: summaryGroupId ? "UNIT" : "ORGANIZATION", organizationGroupId: summaryGroupId || undefined });
            setSummaryEmail("");
            await reloadOrgData();
          }, "Vezetői összesítő rálátás létrehozva.")}>Rálátás létrehozása</AdminButton>
        </div>
        <div className="grid gap-2">
          {scopes.map((scope) => <div key={scope.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-xs">
            <span>{scope.scopeType === "UNIT" ? "Szervezeti egység összesítő" : "Teljes szervezeti összesítő"} · {scope.organizationGroupId || "összes egység"}</span>
            <span className="flex gap-2"><AdminBadge tone={scope.status === "ACTIVE" ? "green" : "neutral"}>{scope.status}</AdminBadge><AdminButton size="sm" variant="muted" disabled={busy || scope.status === "REVOKED"} onClick={() => run(() => transitionSummaryScope(scope.id, "revoke").then(reloadOrgData), "Vezetői rálátás visszavonva.")}>Visszavonás</AdminButton></span>
          </div>)}
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-[var(--adm-border)] p-4">
        <h3 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Ügyfélnek megosztott dokumentumok</h3>
        <p className="text-xs text-[var(--adm-text-muted)]">A dokumentum publikálása továbbra is a Case dokumentum panelen történik: Dokumentum kiválasztása → pontos verzió → Teljes ügyfélfelület vagy Kiválasztott résztvevők → előnézet → publish / revoke / supersede.</p>
        <p className="text-xs text-[var(--adm-text-muted)]">Kiválasztott résztvevő csak aktív workspace-tag és pontos Case-résztvevő lehet; raw WORKSPACE vagy SELECTED_PARTICIPANTS enum nem jelenhet meg normál UI-ban.</p>
      </section>
    </AdminPanel>
  );
}
