"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getCurrentUser } from "@/lib/api";
import { clientOrganizationApi, type OrgGroupDTO, type OrgPersonDTO } from "@/lib/clientOrganizationApi";

const field = "mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-800)]";

/** Internal editing only. The existing service remains the authority for access and hierarchy validation. */
export function OrganizationEditor({ clientId, groups, persons, onSaved }: {
  clientId: string; groups: OrgGroupDTO[]; persons: OrgPersonDTO[]; onSaved: () => Promise<void>;
}) {
  const [canManage, setCanManage] = useState(false);
  const [mode, setMode] = useState<"person" | "group" | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getCurrentUser().then((user) => { if (active) setCanManage(["ADMIN", "PARTNER"].includes(user.role)); }).catch(() => { if (active) setCanManage(false); });
    return () => { active = false; };
  }, [clientId]);
  const person = persons.find((item) => item.id === selectedId);
  const group = groups.find((item) => item.id === selectedId);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !canManage) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) || "").trim();
    const nullable = (key: string) => value(key) || null;
    setBusy(true);
    setError(null);
    try {
      if (mode === "person") {
        const patch = { name: value("name"), jobTitle: nullable("jobTitle"), email: nullable("email"), phone: nullable("phone"), organizationGroupId: nullable("organizationGroupId"), managerPersonId: nullable("managerPersonId"), deputyPersonId: nullable("deputyPersonId"), responsibilitiesSummary: nullable("responsibilitiesSummary") };
        if (selectedId) await clientOrganizationApi.updatePerson(selectedId, patch);
        else await clientOrganizationApi.createPerson(clientId, patch);
      } else if (mode === "group") {
        const patch = { name: value("name"), descriptionSafe: nullable("descriptionSafe"), parentGroupId: nullable("parentGroupId") };
        if (selectedId) await clientOrganizationApi.updateGroup(selectedId, patch);
        else await clientOrganizationApi.createGroup(clientId, patch);
      }
      setMode(null);
      await onSaved();
    } catch {
      setError("A mentés nem sikerült. Ellenőrizze a mezőket, a hierarchiát és a szerkesztési jogosultságot.");
    } finally { setBusy(false); }
  };

  if (!canManage) return null;
  return (
    <section className="adm-board-panel p-5" aria-label="Szervezet szerkesztése">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="adm-link-button px-3 py-2" disabled={busy} onClick={() => { setMode("person"); setSelectedId(""); setError(null); }}>Személy hozzáadása / szerkesztése</button>
        <button type="button" className="adm-link-button px-3 py-2" disabled={busy} onClick={() => { setMode("group"); setSelectedId(""); setError(null); }}>Szervezeti egység hozzáadása / szerkesztése</button>
      </div>
      {mode ? <>
        <label className="mt-4 block text-sm">Szerkesztendő rekord
          <select className={field} value={selectedId} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setError(null); }}>
            <option value="">Új {mode === "person" ? "személy" : "szervezeti egység"}</option>
            {(mode === "person" ? persons : groups).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <form key={`${mode}:${selectedId}`} onSubmit={save} className="mt-4 space-y-4">
          <fieldset disabled={busy} className="grid gap-4 text-sm sm:grid-cols-2">
            <legend className="sr-only">Szervezeti adatok</legend>
            <label>Név<input name="name" required defaultValue={(mode === "person" ? person : group)?.name || ""} className={field} /></label>
            {mode === "person" ? <>
              <label>Pozíció<input name="jobTitle" defaultValue={person?.jobTitle || ""} className={field} /></label>
              <label>E-mail<input name="email" type="email" defaultValue={person?.email || ""} className={field} /></label>
              <label>Telefon<input name="phone" type="tel" defaultValue={person?.phone || ""} className={field} /></label>
              <label>Szervezeti egység<select name="organizationGroupId" defaultValue={person?.organizationGroupId || ""} className={field}><option value="">Nincs megadva</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {([['managerPersonId', 'Vezető'], ['deputyPersonId', 'Helyettes']] as const).map(([key, label]) => <label key={key}>{label}<select name={key} defaultValue={person?.[key] || ""} className={field}><option value="">Nincs megadva</option>{persons.filter((item) => item.id !== selectedId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
              <label>Felelősségek összefoglalása<textarea name="responsibilitiesSummary" defaultValue={person?.responsibilitiesSummary || ""} className={field} /></label>
            </> : <>
              <label>Felettes szervezeti egység<select name="parentGroupId" defaultValue={group?.parentGroupId || ""} className={field}><option value="">Legfelső szint</option>{groups.filter((item) => item.id !== selectedId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Leírás<textarea name="descriptionSafe" defaultValue={group?.descriptionSafe || ""} className={field} /></label>
            </>}
          </fieldset>
          <p className="text-xs text-[var(--adm-text-muted)]">A szervezeti módosítás nem ad portál-hozzáférést. A hierarchiát a rendszer mentéskor ellenőrzi.</p>
          {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
          <div className="flex gap-3"><button type="submit" disabled={busy} className="adm-link-button adm-link-button-primary px-3 py-2">{busy ? "Mentés…" : "Mentés"}</button><button type="button" disabled={busy} className="adm-link-button px-3 py-2" onClick={() => setMode(null)}>Mégse</button></div>
        </form>
      </> : null}
    </section>
  );
}
