"use client";

import { useEffect, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { createWorkPackageCaseType, listWorkPackageCaseTypes, listWorkPackageTemplates, type WorkPackageCaseType, type WorkPackageTemplate } from "@/lib/api";

export default function WorkPackagesPage() {
  return <AuthenticatedApp><WorkPackagesContent /></AuthenticatedApp>;
}

function WorkPackagesContent() {
  const [types, setTypes] = useState<WorkPackageCaseType[]>([]);
  const [selected, setSelected] = useState<WorkPackageCaseType | null>(null);
  const [templates, setTemplates] = useState<WorkPackageTemplate[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const result = await listWorkPackageCaseTypes();
    setTypes(result.items);
    const next = selected ? result.items.find((item) => item.id === selected.id) || result.items[0] : result.items[0];
    setSelected(next || null);
    if (next) setTemplates((await listWorkPackageTemplates(next.id)).items);
  }
  useEffect(() => { void load().catch(() => setMessage("A beállítások nem tölthetők be.")); }, []);
  async function addType(event: React.FormEvent) {
    event.preventDefault();
    try { await createWorkPackageCaseType({ name, slug }); setName(""); setSlug(""); setMessage("Az ügytípus létrejött."); await load(); }
    catch { setMessage("Az ügytípus nem hozható létre."); }
  }
  return <div className="adm-board-page flex-1 overflow-y-auto"><div className="adm-board-container max-w-[1280px]">
    <header className="mb-6"><p className="text-xs uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Beállítások</p><h1 className="mt-2 text-3xl font-serif text-[var(--adm-text)]">Ügytípusok és munkacsomagok</h1><p className="mt-2 text-sm text-[var(--adm-text-muted)]">Az ügytípusokhoz tartozó munkacsablonok kezelése.</p></header>
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border border-[var(--adm-border)] bg-white p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-[var(--adm-text)]">Ügytípusok</h2><span className="text-xs text-[var(--adm-text-muted)]">{types.length}</span></div>
        <div className="space-y-1">{types.map((type) => <button key={type.id} type="button" onClick={async () => { setSelected(type); setTemplates((await listWorkPackageTemplates(type.id)).items); }} className={`w-full border px-3 py-2 text-left text-sm ${selected?.id === type.id ? "border-[var(--adm-ochre-500)] bg-[var(--adm-ivory-100)]" : "border-transparent hover:border-[var(--adm-border)]"}`}>{type.name}</button>)}</div>
        <form onSubmit={addType} className="mt-5 border-t border-[var(--adm-border)] pt-4"><h3 className="mb-3 text-sm font-semibold">Új ügytípus</h3><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Megnevezés" className="mb-2 w-full border px-2 py-2 text-sm" /><input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Azonosító, pl. munkajog" className="mb-2 w-full border px-2 py-2 text-sm" /><button className="w-full border border-[var(--adm-ochre-500)] px-3 py-2 text-sm">Létrehozás</button></form>
      </aside>
      <main className="border border-[var(--adm-border)] bg-white p-5"><h2 className="text-xl font-semibold text-[var(--adm-text)]">{selected?.name || "Válassz ügytípust"}</h2>{selected && <><p className="mt-1 text-sm text-[var(--adm-text-muted)]">{selected.isActive ? "Aktív ügytípus" : "Inaktív ügytípus"}</p><div className="mt-6"><h3 className="text-sm font-semibold text-[var(--adm-text)]">Munkacsablonok</h3><div className="mt-3 space-y-2">{templates.map((template) => <div key={template.id} className="border border-[var(--adm-border)] p-3"><div className="flex items-center justify-between"><span className="font-medium">{template.name}</span><span className="text-xs text-[var(--adm-text-muted)]">{template.status === "ACTIVE" ? "Aktív" : template.status === "DRAFT" ? "Szerkesztés alatt" : "Archivált"} · {template.version}. verzió</span></div><p className="mt-1 text-xs text-[var(--adm-text-muted)]">{template.items.length} munkalépés</p></div>)}</div>{templates.length === 0 && <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Ehhez az ügytípushoz még nincs munkacsablon.</p>}</div></>}</main>
    </div>{message && <p className="mt-4 text-sm text-[var(--adm-text-muted)]">{message}</p>}
  </div></div>;
}
