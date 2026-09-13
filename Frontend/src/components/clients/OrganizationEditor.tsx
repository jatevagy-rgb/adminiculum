"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCurrentUser } from "@/lib/api";
import { clientOrganizationApi, type OrgGroupDTO, type OrgPersonDTO } from "@/lib/clientOrganizationApi";
import { inviteAdminWorkspaceMember, transitionAdminWorkspaceMembership, type AdminWorkspaceDTO } from "@/lib/clientPortalAdminApi";
import { derivePortalMembership } from "@/lib/organizationPortalMembership";
import { editedOrganizationFields } from "@/lib/organizationEditorPayload";

const field = "mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-800)]";
export type OrganizationEditorAction = { mode: "person" | "group"; selectedId?: string; groupId?: string | null; remove?: boolean } | null;

/** Internal manager UI. Organization hierarchy and portal membership retain separate service boundaries. */
export function OrganizationEditor({ clientId, groups, persons, workspaces, action, onManagePermissionChanged, onSaved }: {
  clientId: string; groups: OrgGroupDTO[]; persons: OrgPersonDTO[]; workspaces: AdminWorkspaceDTO[]; action: OrganizationEditorAction;
  onManagePermissionChanged: (allowed: boolean) => void; onSaved: () => Promise<void>;
}) {
  const [canManage, setCanManage] = useState(false);
  const [mode, setMode] = useState<"person" | "group" | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const [removeOpen, setRemoveOpen] = useState(false);
  const [retryPersonId, setRetryPersonId] = useState<string | null>(null);
  const organizationWorkspaces = useMemo(() => workspaces.filter((workspace) => workspace.status === "ACTIVE" && workspace.mode === "ORGANIZATION"), [workspaces]);

  useEffect(() => {
    let active = true;
    void getCurrentUser().then((user) => {
      const allowed = ["ADMIN", "PARTNER"].includes(user.role);
      if (active) { setCanManage(allowed); onManagePermissionChanged(allowed); }
    }).catch(() => { if (active) { setCanManage(false); onManagePermissionChanged(false); } });
    return () => { active = false; };
  }, [clientId, onManagePermissionChanged]);

  useEffect(() => {
    if (!action || !canManage) return;
    setMode(action.mode); setSelectedId(action.selectedId || ""); setGroupId(action.groupId || null);
    setEditedFields(new Set()); setError(null); setFeedback(null); setRemoveOpen(Boolean(action.remove)); setRetryPersonId(null);
  }, [action, canManage]);

  const person = persons.find((item) => item.id === selectedId);
  const group = groups.find((item) => item.id === selectedId);
  const start = (nextMode: "person" | "group") => { setMode(nextMode); setSelectedId(""); setGroupId(null); setEditedFields(new Set()); setError(null); setFeedback(null); setRemoveOpen(false); setRetryPersonId(null); };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !canManage || !mode) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) || "").trim();
    const nullable = (key: string) => value(key) || null;
    if (mode === "person" && data.get("invitePortal") === "on" && organizationWorkspaces.length > 1 && !value("portalWorkspaceId")) {
      setError("Több aktív szervezeti munkaterület van. A meghíváshoz válasszon munkaterületet.");
      return;
    }
    setBusy(true); setError(null); setFeedback(null);
    let savedPerson: OrgPersonDTO | null = null;
    try {
      if (mode === "group") {
        const patch = { name: value("name"), descriptionSafe: nullable("descriptionSafe"), parentGroupId: nullable("parentGroupId") };
        if (selectedId) await clientOrganizationApi.updateGroup(selectedId, editedOrganizationFields(patch, editedFields));
        else await clientOrganizationApi.createGroup(clientId, patch);
      } else {
        const patch = { name: value("name"), jobTitle: nullable("jobTitle"), email: nullable("email"), phone: nullable("phone"), organizationGroupId: nullable("organizationGroupId"), managerPersonId: nullable("managerPersonId"), deputyPersonId: nullable("deputyPersonId"), responsibilitiesSummary: nullable("responsibilitiesSummary") };
        const saved = selectedId ? await clientOrganizationApi.updatePerson(selectedId, editedOrganizationFields(patch, editedFields)) : await clientOrganizationApi.createPerson(clientId, patch);
        savedPerson = saved;
        if (data.get("invitePortal") === "on") {
          if (!patch.email) setFeedback("A személy mentve. Portálmeghívóhoz e-mail-cím szükséges.");
          else if (organizationWorkspaces.length === 0) setFeedback("A személy mentve. Nincs aktív szervezeti portál-munkaterület, ezért nem készült meghívó.");
          else {
            const workspaceId = organizationWorkspaces.length === 1 ? organizationWorkspaces[0].id : value("portalWorkspaceId");
            if (!workspaceId) throw new Error("PORTAL_WORKSPACE_SELECTION_REQUIRED");
            const invitation = await inviteAdminWorkspaceMember(workspaceId, { email: patch.email, displayName: saved.name, role: "MEMBER" });
            setFeedback(invitation.message || `A személy mentve. Portálstátusz: ${invitation.state}.`);
          }
        }
      }
      await onSaved();
      setMode(null); setRemoveOpen(false); setRetryPersonId(null);
    } catch (caught) {
      if (savedPerson) {
        await onSaved();
        setSelectedId(savedPerson.id); setMode("person"); setRetryPersonId(savedPerson.id);
        setFeedback("A személy mentve, de a portálmeghívás nem sikerült.");
      } else setError(caught instanceof Error && caught.message === "PORTAL_WORKSPACE_SELECTION_REQUIRED" ? "Több aktív szervezeti munkaterület van. A meghíváshoz válasszon munkaterületet." : "A mentés nem sikerült. Ellenőrizze a mezőket, a hierarchiát és a szerkesztési jogosultságot.");
    } finally { setBusy(false); }
  };

  const removePerson = async () => {
    if (!person || busy || !canManage) return;
    setBusy(true); setError(null); setFeedback(null);
    try {
      const revoke = document.querySelector<HTMLInputElement>(`#revoke-${person.id}`)?.checked;
      const portal = derivePortalMembership(person, workspaces);
      if (revoke && portal.membership) {
        if (!["REVOKED", "EXPIRED"].includes(portal.membership.status)) await transitionAdminWorkspaceMembership(portal.membership.id, "revoke", portal.membership.revision);
      }
      await clientOrganizationApi.transitionPerson(person.id, "ENDED");
      setMode(null); setRemoveOpen(false); await onSaved(); setFeedback("A személy szervezeti státusza lezárva.");
    } catch { setError("A személy lezárása nem sikerült."); } finally { setBusy(false); }
  };

  if (!canManage) return null;
  return <section className="adm-board-panel p-5" aria-label="Szervezet szerkesztése">
    <div className="flex flex-wrap gap-3"><button type="button" className="adm-link-button px-3 py-2" disabled={busy} onClick={() => start("person")}>Személy hozzáadása / szerkesztése</button><button type="button" className="adm-link-button px-3 py-2" disabled={busy} onClick={() => start("group")}>Szervezeti egység hozzáadása / szerkesztése</button></div>
    {mode ? <>
      <label className="mt-4 block text-sm">Szerkesztendő rekord<select className={field} value={selectedId} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setGroupId(null); setEditedFields(new Set()); setError(null); }}><option value="">Új {mode === "person" ? "személy" : "szervezeti egység"}</option>{(mode === "person" ? persons : groups).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <form key={`${mode}:${selectedId}:${groupId || ""}`} onSubmit={save} onChange={(event) => { const target = event.target; if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) { if (target.name) setEditedFields((current) => new Set([...current, target.name])); } }} className="mt-4 space-y-4">
        <fieldset disabled={busy} className="grid gap-4 text-sm sm:grid-cols-2"><legend className="sr-only">Szervezeti adatok</legend><label>Név<input name="name" required defaultValue={(mode === "person" ? person : group)?.name || ""} className={field} /></label>
          {mode === "person" ? <><label>Pozíció<input name="jobTitle" defaultValue={person?.jobTitle || ""} className={field} /></label><label>E-mail<input name="email" type="email" defaultValue={person?.email || ""} className={field} /></label><label>Telefon<input name="phone" type="tel" defaultValue={person?.phone || ""} className={field} /></label><label>Szervezeti egység<select name="organizationGroupId" defaultValue={person?.organizationGroupId || groupId || ""} className={field}><option value="">Nincs megadva</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{([['managerPersonId', 'Vezető'], ['deputyPersonId', 'Helyettes']] as const).map(([key, label]) => <label key={key}>{label}<select name={key} defaultValue={person?.[key] || ""} className={field}><option value="">Nincs megadva</option>{persons.filter((item) => item.id !== selectedId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}<label>Felelősségek összefoglalása<textarea name="responsibilitiesSummary" defaultValue={person?.responsibilitiesSummary || ""} className={field} /></label>
            <div className="sm:col-span-2 rounded-lg bg-[var(--adm-ivory-100)] p-3"><label className="flex gap-2 text-sm"><input name="invitePortal" type="checkbox" defaultChecked={!selectedId || retryPersonId === selectedId} />Meghívás az ügyfélportálra ezzel az e-mail-címmel</label>{organizationWorkspaces.length > 1 ? <label className="mt-2 block">Aktív szervezeti munkaterület<select name="portalWorkspaceId" className={field} defaultValue=""><option value="">Válasszon munkaterületet</option>{organizationWorkspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label> : null}<p className="mt-2 text-xs text-[var(--adm-text-muted)]">A meghívó csak portál-tagságot kezdeményez; ügy- vagy dokumentumhozzáférést nem ad.</p></div></> : <><label>Felettes szervezeti egység<select name="parentGroupId" defaultValue={group?.parentGroupId || groupId || ""} className={field}><option value="">Legfelső szint</option>{groups.filter((item) => item.id !== selectedId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Leírás<textarea name="descriptionSafe" defaultValue={group?.descriptionSafe || ""} className={field} /></label></>}
        </fieldset><p className="text-xs text-[var(--adm-text-muted)]">A szervezeti módosítás nem ad portál-, ügy- vagy dokumentumhozzáférést. A hierarchiát a rendszer mentéskor ellenőrzi.</p>{error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}{feedback ? <p role="status" className="text-sm text-[var(--adm-text-muted)]">{feedback}</p> : null}<div className="flex gap-3"><button type="submit" disabled={busy} className="adm-link-button adm-link-button-primary px-3 py-2">{busy ? "Mentés…" : "Mentés"}</button><button type="button" disabled={busy} className="adm-link-button px-3 py-2" onClick={() => setMode(null)}>Mégse</button></div>
      </form>
      {mode === "person" && person ? <div className="mt-5 border-t border-[var(--adm-border)] pt-4">{removeOpen ? <><label className="flex gap-2 text-sm"><input id={`revoke-${person.id}`} type="checkbox" defaultChecked={Boolean(person.portalMembershipId)} disabled={!person.portalMembershipId} />A portálhozzáférést is visszavonjuk?</label><button type="button" onClick={() => void removePerson()} disabled={busy} className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800">Eltávolítás a szervezetből</button></> : <button type="button" onClick={() => setRemoveOpen(true)} className="text-sm font-semibold text-red-800 underline">Eltávolítás a szervezetből</button>}</div> : null}
    </> : null}
    {feedback ? <p role="status" className="mt-4 text-sm text-[var(--adm-text-muted)]">{feedback}</p> : null}
  </section>;
}
