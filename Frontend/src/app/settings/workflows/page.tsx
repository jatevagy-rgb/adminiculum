"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminButton } from "@/components/adminiculum/ui";
import { PageHeader, Card, CardHeader, CardContent, Badge, Alert, EmptyState } from "@/components/ui";
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
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
      <PageHeader
        kicker="Beállítások → Munkafolyamatok"
        title="Munkafolyamat-sablonok"
        subtitle="Újrahasználható munkafolyamat-sablonok lépésekkel, felelősökkel és függőségekkel. Egy aktivált verzió változatlan; szerkesztéshez új verzió készül. A már elindított ügyek a saját pillanatképüket őrzik."
        actions={
          <Link
            href="/settings"
            className="inline-flex h-8 items-center justify-center rounded-[6px] border border-[#E5E7E6] bg-white px-3 text-xs font-semibold text-[#1F2937] transition-colors hover:bg-[#F8FAF9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32] focus-visible:ring-offset-2"
          >
            ← Beállítások
          </Link>
        }
        primaryAction={
          <AdminButton variant="primary" size="sm" onClick={startNew} data-testid="wf-new">
            Új munkafolyamat
          </AdminButton>
        }
      />

      {error ? <Alert variant="error" data-testid="wf-error" className="mt-4">{error}</Alert> : null}
      {notice ? <Alert variant="success" data-testid="wf-notice" className="mt-4">{notice}</Alert> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]">
        {/* Template list */}
        <div className="space-y-4" data-testid="wf-list">
          {loading ? <p className="text-sm text-[#6B7280]">Betöltés…</p> : null}
          {!loading && grouped.length === 0 ? (
            <EmptyState
              title="Még nincs egyéni sablon."
              description="A beépített sablonok (pl. Szerződés-review) mindig elérhetők az Új ügy űrlapon."
              action={
                <AdminButton variant="primary" size="sm" onClick={startNew}>
                  Új munkafolyamat
                </AdminButton>
              }
            />
          ) : null}
          {grouped.map((g) => (
            <Card key={g.key} className="overflow-hidden">
              <CardHeader className="border-b border-[#E5E7E6] bg-[#F8FAF9] px-4 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">{g.key}</span>
              </CardHeader>
              <CardContent className="space-y-2.5 p-3">
                {g.versions.map((t) => (
                  <div key={t.id} data-testid="wf-template-row" className="rounded-lg border border-[#E5E7E6] bg-white p-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <b className="text-sm font-semibold text-[#1F2937]">{t.name}</b>
                        <span className="ml-2 text-xs text-[#6B7280]">v{t.version} · {t.steps.length} lépés · {t.usageCount} használat</span>
                      </div>
                      <Badge tone={t.status === "ACTIVE" ? "green" : t.status === "DRAFT" ? "gold" : "neutral"}>{t.status}</Badge>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[#E5E7E6] pt-2">
                      {t.status === "DRAFT" ? <AdminButton size="xs" variant="neutral" disabled={busy} onClick={() => startEditDraft(t)}>Szerkesztés</AdminButton> : null}
                      {t.status === "DRAFT" ? <AdminButton size="xs" variant="gold" disabled={busy} onClick={() => run(() => activateWorkflowTemplate(t.id), "Sablon aktiválva.")}>Aktiválás</AdminButton> : null}
                      {t.status === "ACTIVE" ? <AdminButton size="xs" variant="neutral" disabled={busy} onClick={() => run(() => createWorkflowTemplateVersion(t.id, {}), "Új verzió (tervezet) létrehozva.")}>Új verzió</AdminButton> : null}
                      <AdminButton size="xs" variant="muted" disabled={busy} onClick={() => run(() => duplicateWorkflowTemplate(t.id, {}), "Másolat létrehozva.")}>Másolat</AdminButton>
                      {t.status !== "ARCHIVED" ? <AdminButton size="xs" variant="muted" disabled={busy} onClick={() => run(() => archiveWorkflowTemplate(t.id), "Sablon archiválva.")}>Archiválás</AdminButton> : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Editor */}
        {editingId ? (
          <Card className="p-4 sm:p-5 shadow-sm" data-testid="wf-editor">
            <h2 className="font-serif text-lg font-semibold text-[#1F2937]">{editingId === "new" ? "Új munkafolyamat" : "Tervezet szerkesztése"}</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sablon neve"
              className="mt-3 block w-full rounded-md border border-[#E5E7E6] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
              data-testid="wf-name"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Leírás (opcionális)"
              rows={2}
              className="mt-2 block w-full rounded-md border border-[#E5E7E6] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
            />
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">Lépések</p>
            <ol className="mt-2 space-y-2.5">
              {steps.map((s, i) => (
                <li key={i} className="rounded-lg border border-[#E5E7E6] bg-[#F8FAF9] p-3" data-testid="wf-step">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B7280]">#{i + 1} · {s.key}</span>
                    <AdminButton size="xs" variant="muted" onClick={() => removeStep(i)}>Törlés</AdminButton>
                  </div>
                  <input
                    value={s.title}
                    onChange={(e) => setStep(i, { title: e.target.value })}
                    placeholder="Lépés címe"
                    className="mt-1.5 block w-full rounded-md border border-[#E5E7E6] bg-white px-2.5 py-1.5 text-sm text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
                  />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select
                      value={s.defaultAssigneeId}
                      onChange={(e) => setStep(i, { defaultAssigneeId: e.target.value })}
                      className="block w-full rounded-md border border-[#E5E7E6] bg-white px-2.5 py-1.5 text-xs text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
                    >
                      <option value="">Alapértelmezett felelős…</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-xs text-[#4B5563]">
                      <input
                        type="checkbox"
                        checked={s.publicMilestoneCandidate}
                        onChange={(e) => setStep(i, { publicMilestoneCandidate: e.target.checked })}
                        data-testid={`wf-candidate-${i}`}
                        className="rounded border-[#E5E7E6] text-[#0F3D32] focus:ring-[#0F3D32]"
                      />
                      Ügyfél-mérföldkő jelölt
                    </label>
                  </div>
                  {s.publicMilestoneCandidate ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_90px]">
                      <input
                        value={s.suggestedMilestoneTitle}
                        onChange={(e) => setStep(i, { suggestedMilestoneTitle: e.target.value })}
                        placeholder="Javasolt ügyfélbiztos cím"
                        className="block w-full rounded-md border border-[#E5E7E6] bg-white px-2.5 py-1.5 text-xs text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
                      />
                      <input
                        type="number"
                        min={1}
                        value={s.suggestedWeight}
                        onChange={(e) => setStep(i, { suggestedWeight: e.target.value })}
                        placeholder="Súly"
                        className="block w-full rounded-md border border-[#E5E7E6] bg-white px-2.5 py-1.5 text-xs text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
                      />
                    </div>
                  ) : null}
                  {i > 0 ? (
                    <div className="mt-2 border-t border-[#E5E7E6] pt-2">
                      <p className="text-[10px] font-semibold text-[#6B7280]">Akkor induljon, ha elkészült:</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {steps.slice(0, i).map((prev) => (
                          <label key={prev.key} className="flex items-center gap-1 rounded-full border border-[#E5E7E6] bg-white px-2.5 py-0.5 text-[11px] text-[#374151]">
                            <input
                              type="checkbox"
                              checked={s.dependsOn.includes(prev.key)}
                              onChange={(e) => setStep(i, { dependsOn: e.target.checked ? [...s.dependsOn, prev.key] : s.dependsOn.filter((k) => k !== prev.key) })}
                              className="rounded border-[#E5E7E6] text-[#0F3D32] focus:ring-[#0F3D32]"
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
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E5E7E6] pt-3">
              <AdminButton size="sm" variant="neutral" onClick={addStep}>+ Lépés</AdminButton>
              <AdminButton size="sm" variant="primary" disabled={busy || !name.trim() || steps.every((s) => !s.title.trim())} onClick={save} data-testid="wf-save">Mentés</AdminButton>
              <AdminButton size="sm" variant="muted" onClick={resetEditor}>Bezárás</AdminButton>
            </div>
          </Card>
        ) : (
          <div className="rounded-lg border border-dashed border-[#E5E7E6] bg-white p-6 text-sm text-[#6B7280] shadow-xs">
            Válassz egy tervezetet szerkesztésre, vagy hozz létre új munkafolyamatot. Aktiváláskor a rendszer ellenőrzi, hogy a lépések sorrendje érvényes-e, és a függőségek nem alkotnak kört.
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowTemplatesSettingsPage() {
  return (
    <AuthenticatedApp>
      <div className="min-h-screen bg-[#F8FAF9]">
        <WorkflowTemplatesAdmin />
      </div>
    </AuthenticatedApp>
  );
}
