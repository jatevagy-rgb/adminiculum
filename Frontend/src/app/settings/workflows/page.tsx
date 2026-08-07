"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminButton, AdminBadge } from "@/components/adminiculum/ui";
import {
  listWorkflowTemplatesAdmin,
  createWorkflowTemplate,
  updateWorkflowTemplateDraft,
  createWorkflowTemplateVersion,
  duplicateWorkflowTemplate,
  activateWorkflowTemplate,
  archiveWorkflowTemplate,
  getUsers,
  type WorkflowTemplateAdminDto,
  type WorkflowTemplateAdminStep,
  type User,
} from "@/lib/api";

type DraftStep = {
  key: string;
  title: string;
  dependsOn: string[];
  publicMilestoneCandidate: boolean;
  defaultAssigneeId: string;
  suggestedMilestoneTitle: string;
  suggestedWeight: string;
};

const emptyStep = (n: number): DraftStep => ({
  key: `lepes-${n}`, title: "", dependsOn: [], publicMilestoneCandidate: false,
  defaultAssigneeId: "", suggestedMilestoneTitle: "", suggestedWeight: "",
});

function toDraftSteps(steps: WorkflowTemplateAdminStep[]): DraftStep[] {
  return steps.map((s) => ({
    key: s.key, title: s.title, dependsOn: s.dependsOn || [], publicMilestoneCandidate: s.publicMilestoneCandidate,
    defaultAssigneeId: s.defaultAssigneeId || "", suggestedMilestoneTitle: s.suggestedMilestoneTitle || "",
    suggestedWeight: s.suggestedWeight != null ? String(s.suggestedWeight) : "",
  }));
}

function stepsPayload(steps: DraftStep[]) {
  return steps.filter((s) => s.title.trim()).map((s) => ({
    key: s.key, title: s.title.trim(), dependsOn: s.dependsOn,
    publicMilestoneCandidate: s.publicMilestoneCandidate,
    defaultAssigneeId: s.defaultAssigneeId || null,
    suggestedMilestoneTitle: s.suggestedMilestoneTitle.trim() || null,
    suggestedWeight: s.suggestedWeight ? Number(s.suggestedWeight) : null,
  }));
}

function WorkflowTemplatesAdmin() {
  const [items, setItems] = useState<WorkflowTemplateAdminDto[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Editor state: editing an existing DRAFT id (or "new"), plus draft fields.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([emptyStep(1)]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, u] = await Promise.all([listWorkflowTemplatesAdmin(), getUsers().catch(() => [])]);
      setItems(tpl.items);
      setUsers(u);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A sablonok betöltése nem sikerült.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const byKey = new Map<string, WorkflowTemplateAdminDto[]>();
    for (const t of items) {
      if (!byKey.has(t.key)) byKey.set(t.key, []);
      byKey.get(t.key)!.push(t);
    }
    return [...byKey.entries()].map(([key, versions]) => ({ key, versions: versions.sort((a, b) => b.version - a.version) }));
  }, [items]);

  const resetEditor = () => { setEditingId(null); setName(""); setDescription(""); setSteps([emptyStep(1)]); };

  const startNew = () => { resetEditor(); setEditingId("new"); };
  const startEditDraft = (t: WorkflowTemplateAdminDto) => {
    setEditingId(t.id); setName(t.name); setDescription(t.description || "");
    setSteps(t.steps.length ? toDraftSteps(t.steps) : [emptyStep(1)]);
  };

  const run = async (op: () => Promise<unknown>, ok: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await op(); setNotice(ok); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "A művelet nem sikerült."); }
    finally { setBusy(false); }
  };

  const save = () => run(async () => {
    const payloadSteps = stepsPayload(steps);
    if (editingId === "new") {
      const created = await createWorkflowTemplate({ name, description: description || null, steps: payloadSteps });
      setEditingId(created.id);
    } else if (editingId) {
      await updateWorkflowTemplateDraft(editingId, { name, description: description || null, steps: payloadSteps });
    }
  }, "Sablon mentve (tervezet).");

  const setStep = (i: number, patch: Partial<DraftStep>) => setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  const addStep = () => setSteps((s) => [...s, emptyStep(s.length + 1)]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i).map((st) => ({ ...st, dependsOn: st.dependsOn.filter((k) => s[i].key !== k) })));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Beállítások → Munkafolyamatok</p>
          <h1 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">Munkafolyamat-sablonok</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#3D4842]">Újrahasználható munkafolyamat-sablonok lépésekkel, felelősökkel és függőségekkel. Egy aktivált verzió változatlan; szerkesztéshez új verzió készül. A már elindított ügyek a saját pillanatképüket őrzik.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings" className="rounded-full border border-[var(--adm-border)] px-3 py-1.5 text-xs font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">← Beállítások</Link>
          <AdminButton variant="primary" size="sm" onClick={startNew} data-testid="wf-new">Új munkafolyamat</AdminButton>
        </div>
      </div>

      {error ? <p data-testid="wf-error" className="mt-3 rounded-[12px] border border-[#F2DAD6] bg-[var(--adm-terracotta-100)] p-3 text-sm font-semibold text-[var(--adm-terracotta-700)]">{error}</p> : null}
      {notice ? <p data-testid="wf-notice" className="mt-3 rounded-[12px] border border-[#CDE3D4] bg-[#EDF6EF] p-3 text-sm font-semibold text-[#2E5B3C]">{notice}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
        {/* Template list */}
        <div className="space-y-3" data-testid="wf-list">
          {loading ? <p className="text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
          {!loading && grouped.length === 0 ? <p className="rounded-[12px] bg-[var(--adm-surface)] p-4 text-sm text-[var(--adm-text-muted)]">Még nincs egyéni sablon. A beépített sablonok (pl. Szerződés-review) mindig elérhetők az Új ügy űrlapon.</p> : null}
          {grouped.map((g) => (
            <div key={g.key} className="rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">{g.key}</p>
              <div className="mt-2 space-y-2">
                {g.versions.map((t) => (
                  <div key={t.id} data-testid="wf-template-row" className="rounded-[10px] bg-[var(--adm-surface)] p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <b className="text-[var(--adm-text)]">{t.name}</b>
                        <span className="ml-2 text-xs text-[var(--adm-text-muted)]">v{t.version} · {t.steps.length} lépés · {t.usageCount} használat</span>
                      </div>
                      <AdminBadge tone={t.status === "ACTIVE" ? "green" : t.status === "DRAFT" ? "gold" : "neutral"}>{t.status}</AdminBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.status === "DRAFT" ? <AdminButton size="xs" variant="neutral" disabled={busy} onClick={() => startEditDraft(t)}>Szerkesztés</AdminButton> : null}
                      {t.status === "DRAFT" ? <AdminButton size="xs" variant="gold" disabled={busy} onClick={() => run(() => activateWorkflowTemplate(t.id), "Sablon aktiválva.")}>Aktiválás</AdminButton> : null}
                      {t.status === "ACTIVE" ? <AdminButton size="xs" variant="neutral" disabled={busy} onClick={() => run(() => createWorkflowTemplateVersion(t.id, {}), "Új verzió (tervezet) létrehozva.")}>Új verzió</AdminButton> : null}
                      <AdminButton size="xs" variant="muted" disabled={busy} onClick={() => run(() => duplicateWorkflowTemplate(t.id, {}), "Másolat létrehozva.")}>Másolat</AdminButton>
                      {t.status !== "ARCHIVED" ? <AdminButton size="xs" variant="muted" disabled={busy} onClick={() => run(() => archiveWorkflowTemplate(t.id), "Sablon archiválva.")}>Archiválás</AdminButton> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Editor */}
        {editingId ? (
          <div className="rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4" data-testid="wf-editor">
            <h2 className="font-serif text-lg font-semibold text-[var(--adm-text)]">{editingId === "new" ? "Új munkafolyamat" : "Tervezet szerkesztése"}</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sablon neve" className="mt-3 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" data-testid="wf-name" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Leírás (opcionális)" rows={2} className="mt-2 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" />
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Lépések</p>
            <ol className="mt-2 space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="rounded-[10px] border border-[rgba(22,32,26,0.12)] p-2" data-testid="wf-step">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-[var(--adm-text-muted)]">#{i + 1} · {s.key}</span>
                    <AdminButton size="xs" variant="muted" onClick={() => removeStep(i)}>Törlés</AdminButton>
                  </div>
                  <input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Lépés címe" className="mt-1 w-full rounded border border-[rgba(22,32,26,0.16)] px-2 py-1.5 text-sm" />
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    <select value={s.defaultAssigneeId} onChange={(e) => setStep(i, { defaultAssigneeId: e.target.value })} className="rounded border border-[rgba(22,32,26,0.16)] px-2 py-1.5 text-sm">
                      <option value="">Alapértelmezett felelős…</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-xs text-[var(--adm-text-muted)]">
                      <input type="checkbox" checked={s.publicMilestoneCandidate} onChange={(e) => setStep(i, { publicMilestoneCandidate: e.target.checked })} data-testid={`wf-candidate-${i}`} />
                      Ügyfél-mérföldkő jelölt
                    </label>
                  </div>
                  {s.publicMilestoneCandidate ? (
                    <div className="mt-1 grid gap-1 sm:grid-cols-[1fr_90px]">
                      <input value={s.suggestedMilestoneTitle} onChange={(e) => setStep(i, { suggestedMilestoneTitle: e.target.value })} placeholder="Javasolt ügyfélbiztos cím" className="rounded border border-[rgba(22,32,26,0.16)] px-2 py-1.5 text-sm" />
                      <input type="number" min={1} value={s.suggestedWeight} onChange={(e) => setStep(i, { suggestedWeight: e.target.value })} placeholder="Súly" className="rounded border border-[rgba(22,32,26,0.16)] px-2 py-1.5 text-sm" />
                    </div>
                  ) : null}
                  {i > 0 ? (
                    <div className="mt-1">
                      <p className="text-[10px] text-[var(--adm-text-muted)]">Akkor induljon, ha elkészült:</p>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        {steps.slice(0, i).map((prev) => (
                          <label key={prev.key} className="flex items-center gap-1 rounded-full border border-[rgba(22,32,26,0.16)] px-2 py-0.5 text-[11px]">
                            <input
                              type="checkbox"
                              checked={s.dependsOn.includes(prev.key)}
                              onChange={(e) => setStep(i, { dependsOn: e.target.checked ? [...s.dependsOn, prev.key] : s.dependsOn.filter((k) => k !== prev.key) })}
                            />
                            {prev.title || prev.key}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap gap-2">
              <AdminButton size="sm" variant="neutral" onClick={addStep}>+ Lépés</AdminButton>
              <AdminButton size="sm" variant="primary" disabled={busy || !name.trim() || steps.every((s) => !s.title.trim())} onClick={save} data-testid="wf-save">Mentés</AdminButton>
              <AdminButton size="sm" variant="muted" onClick={resetEditor}>Bezárás</AdminButton>
            </div>
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-[rgba(22,32,26,0.2)] p-4 text-sm text-[var(--adm-text-muted)]">
            Válassz egy tervezetet szerkesztésre, vagy hozz létre új munkafolyamatot. Aktiváláskor a rendszer ellenőrzi, hogy a függőségek körmentes DAG-ot alkotnak-e.
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowTemplatesSettingsPage() {
  return (
    <AuthenticatedApp>
      <div className="min-h-screen bg-[var(--adm-bg,#faf8f3)]">
        <WorkflowTemplatesAdmin />
      </div>
    </AuthenticatedApp>
  );
}
