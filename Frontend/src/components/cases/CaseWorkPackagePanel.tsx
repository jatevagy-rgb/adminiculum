"use client";

import { useCallback, useEffect, useState } from "react";
import { createCaseWorkPackageTask, getCaseWorkPackage, getUsers, updateCaseWorkPackageItem, type CaseWorkPackage, type User } from "@/lib/api";
import { AdminButton } from "@/components/adminiculum/ui";

export function CaseWorkPackagePanel({ caseId }: { caseId: string }) {
  const [pack, setPack] = useState<CaseWorkPackage | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [openTaskItem, setOpenTaskItem] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setPack(await getCaseWorkPackage(caseId)); } catch (cause) { setError(cause instanceof Error ? cause.message : "A munkacsomag nem tölthető be."); }
  }, [caseId]);
  useEffect(() => { void load(); void getUsers().then(setUsers).catch(() => undefined); }, [load]);

  if (error) return <section className="rounded-lg border border-[rgba(22,32,26,0.10)] bg-white p-4 text-sm text-[#8B2A2A]">{error}</section>;
  if (!pack) return <section className="rounded-lg border border-[rgba(22,32,26,0.10)] bg-white p-4 text-sm text-[#7A8479]">Munkacsomag betöltése…</section>;
  const percent = pack.progress.totalItems ? Math.round((pack.progress.completedItems / pack.progress.totalItems) * 100) : 0;
  const updateItem = async (itemId: string, body: { status?: string; responsibleId?: string | null }) => {
    setBusy(itemId); setError(null);
    try { setPack(await updateCaseWorkPackageItem(caseId, itemId, { expectedRevision: pack.revision, ...body })); } catch (cause) { setError(cause instanceof Error ? cause.message : "A módosítás nem sikerült."); } finally { setBusy(null); }
  };
  const createTask = async (itemId: string) => {
    if (!taskTitle.trim()) return;
    setBusy(itemId); setError(null);
    try { setPack((await createCaseWorkPackageTask(caseId, itemId, { title: taskTitle.trim() })).package); setTaskTitle(""); setOpenTaskItem(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "A feladat létrehozása nem sikerült."); } finally { setBusy(null); }
  };
  return <section aria-label="Munkacsomag" className="rounded-lg border border-[rgba(22,32,26,0.10)] bg-white shadow-[0_1px_2px_rgba(22,32,26,0.05)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(22,32,26,0.08)] px-4 py-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Operatív kontextus</p><h2 className="font-serif text-xl font-medium text-[#16201A]">Munkacsomag</h2></div>
      <div className="min-w-[170px]"><div className="flex justify-between text-[11px] font-semibold text-[#526056]"><span>{pack.progress.completedItems}/{pack.progress.totalItems} kész</span><span>{percent}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E8E7DD]"><div className="h-full bg-[#123B27]" style={{ width: `${percent}%` }} /></div></div>
    </div>
    <div className="grid gap-2 p-3">
      {pack.items.slice(0, 6).map((item) => <article key={item.id} className="rounded-[5px] border border-[rgba(22,32,26,0.08)] px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-[13px] font-semibold text-[#16201A]">{item.label}</h3><p className="mt-0.5 text-[11px] text-[#7A8479]">{item.status === "COMPLETED" ? "Kész" : item.status === "DISABLED" ? "Blokkolt" : "Folyamatban"} · {item.taskSummary.total} kapcsolódó feladat</p></div><span className="text-[11px] font-semibold text-[#526056]">{item.responsible?.displayName || "Nincs felelős"}</span></div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><AdminButton size="xs" variant={item.status === "COMPLETED" ? "muted" : "neutral"} disabled={busy === item.id} onClick={() => void updateItem(item.id, { status: item.status === "COMPLETED" ? "ACTIVE" : "COMPLETED" })}>{item.status === "COMPLETED" ? "Újranyitás" : "Állapot: kész"}</AdminButton><select aria-label={`${item.label} felelőse`} value={item.responsible?.id || ""} disabled={busy === item.id} onChange={(event) => void updateItem(item.id, { responsibleId: event.target.value || null })} className="rounded-[5px] border border-[rgba(22,32,26,0.15)] bg-white px-2 py-1 text-[11px]"><option value="">Felelős kijelölése</option>{users.filter((user) => user.isActive !== false).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><AdminButton size="xs" variant="primary" disabled={busy === item.id} onClick={() => setOpenTaskItem(openTaskItem === item.id ? null : item.id)}>Feladat létrehozása</AdminButton></div>
        {openTaskItem === item.id ? <div className="mt-2 flex gap-2"><input autoFocus value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Feladat megnevezése" className="min-w-0 flex-1 rounded-[5px] border border-[rgba(22,32,26,0.15)] px-2 py-1 text-[12px]" /><AdminButton size="xs" variant="primary" disabled={busy === item.id || !taskTitle.trim()} onClick={() => void createTask(item.id)}>Létrehozás</AdminButton></div> : null}
      </article>)}
      {pack.items.length > 6 ? <p className="px-1 text-[11px] text-[#7A8479]">További modulok az operatív részletekben.</p> : null}
    </div>
  </section>;
}
