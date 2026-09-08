"use client";

import { useEffect, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  createUsableCaseType, getCurrentUser, listWorkPackageCaseTypes, listWorkPackageTemplates,
  setWorkPackageCaseTypeActive, createWorkPackageTemplate, activateWorkPackageTemplate,
  type WorkPackageCaseType, type WorkPackageTemplate,
} from "@/lib/api";

export default function WorkPackagesPage() {
  return <AuthenticatedApp><WorkPackagesContent /></AuthenticatedApp>;
}

function WorkPackagesContent() {
  const [types, setTypes] = useState<WorkPackageCaseType[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [templates, setTemplates] = useState<WorkPackageTemplate[]>([]);
  const [name, setName] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const selected = types.find((type) => type.id === selectedId);
  const button = "rounded border border-[var(--adm-border)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-800)] disabled:opacity-50";

  useEffect(() => {
    let active = true;
    Promise.all([listWorkPackageCaseTypes(), getCurrentUser()])
      .then(([result, user]) => {
        if (!active) return;
        setTypes(result.items);
        setSelectedId((id) => result.items.some((type) => type.id === id) ? id : result.items[0]?.id || "");
        setCanManage(user.role === "ADMIN" || user.role === "PARTNER");
      }).catch(() => { if (active) setMessage("A beállítások nem tölthetők be."); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    let active = true;
    setTemplates([]);
    if (!selectedId) return;
    setLoadingTemplates(true);
    listWorkPackageTemplates(selectedId)
      .then((result) => { if (active) setTemplates(result.items); })
      .catch(() => { if (active) setMessage("A munkacsomagok nem tölthetők be."); })
      .finally(() => { if (active) setLoadingTemplates(false); });
    return () => { active = false; };
  }, [selectedId, revision]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (!canManage || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      setRevision((value) => value + 1);
    } catch (error) {
      setMessage(error && typeof error === "object" && "code" in error && error.code === "CASE_TYPE_NAME_EXISTS"
        ? "Ez az ügytípus már létezik. Válaszd ki a listából és ellenőrizd az aktiválását."
        : "A módosítás sikertelen. Próbáld újra.");
    } finally { setBusy(false); }
  }

  return <div className="adm-board-page flex-1 overflow-y-auto"><div className="adm-board-container max-w-[1280px]">
    <header className="mb-6"><p className="text-xs uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Beállítások</p><h1 className="mt-2 text-3xl font-serif text-[var(--adm-text)]">Ügytípusok és munkacsomagok</h1></header>
    {message && <p role="status" className="mb-4 rounded border border-[var(--adm-border)] p-3 text-sm">{message}</p>}
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-[var(--adm-border)] bg-white p-4">
        <h2 className="mb-3 font-semibold">Mentett ügytípusok</h2>
        <div className="space-y-1">{types.map((type) => <button key={type.id} type="button" disabled={busy} onClick={() => setSelectedId(type.id)} aria-pressed={selectedId === type.id} className={`w-full rounded border px-3 py-2 text-left text-sm ${selectedId === type.id ? "border-[var(--adm-ochre-500)] bg-[var(--adm-ivory-100)]" : "border-transparent hover:border-[var(--adm-border)]"}`}>
          {type.name}<span className="ml-2 text-xs text-[var(--adm-text-muted)]">{type.isActive ? "Aktív" : "Inaktív"}</span>
        </button>)}</div>
        {canManage && <form onSubmit={(event) => { event.preventDefault(); void run(async () => { const option = await createUsableCaseType(name.trim()); setName(""); setSelectedId(option.caseTypeDefinition.id); }, "Az ügytípus létrejött és már választható az Új ügy ablakban."); }} className="mt-5 border-t border-[var(--adm-border)] pt-4">
          <label htmlFor="case-type-name" className="mb-2 block text-sm font-semibold">Új ügytípus neve</label>
          <input id="case-type-name" required maxLength={200} disabled={busy} value={name} onChange={(e) => setName(e.target.value)} placeholder="Pl. Munkajog" className="mb-3 w-full rounded border px-3 py-2 text-sm" />
          <button disabled={busy || !name.trim()} className={`${button} w-full bg-[var(--adm-green-800)] text-white`}>{busy ? "Mentés…" : "Ügytípus mentése"}</button>
        </form>}
      </aside>
      <main className="rounded-lg border border-[var(--adm-border)] bg-white p-5">
        <h2 className="text-xl font-semibold">{selected?.name || "Válassz ügytípust"}</h2>
        {selected && <>
          <div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-sm">{selected.isActive ? "Aktív ügytípus" : "Inaktív ügytípus"}</span>
            {canManage && <button disabled={busy} className={button} onClick={() => void run(() => setWorkPackageCaseTypeActive(selected.id, !selected.isActive), "Az ügytípus állapota frissült.")}>{selected.isActive ? "Inaktiválás" : "Aktiválás"}</button>}
          </div>
          <h3 className="mt-6 font-semibold">Munkacsomagok</h3>
          {loadingTemplates ? <p className="mt-3 text-sm">Betöltés…</p> : <>
            {!templates.some((template) => template.status === "ACTIVE") && <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Az ügytípus használatához aktiválj egy munkacsomagot.</p>}
            <div className="mt-3 space-y-3">{templates.map((template) => <div key={template.id} className="rounded border border-[var(--adm-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{template.name}</span><span className="text-xs">{template.status === "ACTIVE" ? "Jelenleg használt" : template.status === "DRAFT" ? "Aktiválásra vár" : "Archivált"}</span></div>
              <p className="mt-1 text-xs text-[var(--adm-text-muted)]">{template.items.length ? `${template.items.length} munkalépés` : "Alap munkacsomag, előírt munkalépések nélkül"}</p>
              {canManage && template.status === "DRAFT" && <button disabled={busy} className={`${button} mt-3`} onClick={() => void run(() => activateWorkPackageTemplate(template.id), "A munkacsomag aktív. A korábban létrehozott ügyek változatlanok.")}>Munkacsomag aktiválása</button>}
              <details className="mt-2 text-xs text-[var(--adm-text-muted)]"><summary>Részletek</summary><p>{template.version}. verzió</p>{template.items.map((item) => <p key={item.id}>{item.label} · {item.isOptional ? "Opcionális" : "Kötelező"}</p>)}</details>
            </div>)}</div>
            {canManage && <button disabled={busy} className={`${button} mt-4`} onClick={() => void run(() => createWorkPackageTemplate({ caseTypeDefinitionId: selected.id, name: "Alap munkacsomag", items: [] }), "Az alap munkacsomag elkészült. Aktiválás után használható új ügyekhez.")}>Alap munkacsomag létrehozása</button>}
          </>}
        </>}
      </main>
    </div>
  </div></div>;
}
