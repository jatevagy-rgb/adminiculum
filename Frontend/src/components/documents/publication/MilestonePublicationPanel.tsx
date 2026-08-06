"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import {
  getMilestoneDraft,
  listEligibleMilestoneSteps,
  publishMilestoneRevision,
  saveMilestoneDraft,
  type CustomerMilestone,
  type EligibleMilestoneStep,
  type MilestoneCompletionState,
  type MilestoneDraftItem,
  type MilestonePreview,
} from "@/lib/clientPublicationApi";

const COMPLETION_STATE_LABELS: Record<MilestoneCompletionState, string> = {
  NOT_STARTED: "Előttünk áll",
  IN_PROGRESS: "Folyamatban",
  COMPLETED: "Kész",
};

const COMPLETION_STATES: MilestoneCompletionState[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];

const PUBLISH_CONFIRMATION =
  "A közzététel új, változatlan ügyfélverziót hoz létre. A belső munkafolyamat későbbi módosításai ezt nem változtatják meg. Folytatja?";

function makePublicKey(existing: MilestoneDraftItem[]): string {
  const used = new Set(existing.map((item) => item.publicKey));
  let index = existing.length + 1;
  let candidate = `mf-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `mf-${index}`;
  }
  return candidate;
}

function CustomerPreviewList({ milestones, progressPercentage }: { milestones: CustomerMilestone[]; progressPercentage: number | null }) {
  const ordered = milestones.slice().sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <div data-testid="milestone-customer-preview">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyfél DTO előnézet</p>
        {typeof progressPercentage === "number" ? (
          <span data-testid="milestone-preview-progress" className="text-sm font-semibold text-[var(--adm-text)]">{progressPercentage}%</span>
        ) : (
          <span data-testid="milestone-preview-progress" className="text-xs font-semibold text-[var(--adm-text-muted)]">Nincs súlyozott előrehaladás</span>
        )}
      </div>
      {ordered.length ? (
        <ol className="mt-2 space-y-2">
          {ordered.map((milestone) => (
            <li key={milestone.reference} className="rounded-[10px] bg-[var(--adm-surface)] p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[var(--adm-text)]">{milestone.title}</b>
                <AdminBadge tone={milestone.state === "COMPLETED" ? "green" : milestone.state === "IN_PROGRESS" ? "gold" : "neutral"}>{COMPLETION_STATE_LABELS[milestone.state as MilestoneCompletionState] || milestone.state}</AdminBadge>
              </div>
              {milestone.description ? <p className="mt-1 text-[var(--adm-text-muted)]">{milestone.description}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Az ügyfél még nem lát mérföldkövet.</p>
      )}
    </div>
  );
}

export function MilestonePublicationPanel({ caseId }: { caseId: string }) {
  const [eligible, setEligible] = useState<EligibleMilestoneStep[]>([]);
  const [draft, setDraft] = useState<MilestoneDraftItem[]>([]);
  const [preview, setPreview] = useState<MilestonePreview | null>(null);
  const [publishedMilestones, setPublishedMilestones] = useState<CustomerMilestone[]>([]);
  const [publishedProgress, setPublishedProgress] = useState<number | null>(null);
  const [publicationStatus, setPublicationStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!caseId) return;
    const [eligiblePage, draftState] = await Promise.all([
      listEligibleMilestoneSteps(caseId),
      getMilestoneDraft(caseId),
    ]);
    setEligible(eligiblePage.items);
    setDraft(draftState.draft);
    setPublishedMilestones(draftState.publishedMilestones);
    setPublishedProgress(draftState.publishedProgress);
    setPublicationStatus(draftState.publicationStatus);
  }, [caseId]);

  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "A mérföldkövek betöltése nem sikerült.")); }, [load]);

  const usedTaskIds = useMemo(() => new Set(draft.map((item) => item.sourceTaskId).filter(Boolean) as string[]), [draft]);
  const weightSum = useMemo(() => draft.reduce((total, item) => total + (typeof item.weight === "number" ? item.weight : 0), 0), [draft]);

  const updateItem = (index: number, patch: Partial<MilestoneDraftItem>) => {
    setDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
    setPreview(null);
  };

  const addFromStep = (step: EligibleMilestoneStep) => {
    setDraft((current) => [
      ...current,
      {
        publicKey: makePublicKey(current),
        sourceTaskId: step.taskId,
        safeTitle: "",
        safeDescription: "",
        displayOrder: current.length + 1,
        weight: 1,
        completionState: step.suggestedState,
        completedAt: null,
      },
    ]);
    setPreview(null);
  };

  const addBlank = () => {
    setDraft((current) => [
      ...current,
      { publicKey: makePublicKey(current), sourceTaskId: null, safeTitle: "", safeDescription: "", displayOrder: current.length + 1, weight: 1, completionState: "NOT_STARTED", completedAt: null },
    ]);
    setPreview(null);
  };

  const removeItem = (index: number) => {
    setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, displayOrder: itemIndex + 1 })));
    setPreview(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next.map((item, itemIndex) => ({ ...item, displayOrder: itemIndex + 1 }));
    });
    setPreview(null);
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A mérföldkő művelet nem sikerült.");
    } finally {
      setBusy(false);
    }
  };

  const saveAndPreview = () =>
    run(async () => {
      const ordered = draft.map((item, index) => ({ ...item, displayOrder: index + 1 }));
      const result = await saveMilestoneDraft(caseId, ordered);
      setDraft(result.draft);
      setPreview(result.preview);
      setNotice("Tervezet mentve. Az előnézet a pontos ügyfél DTO-t mutatja.");
    });

  const publish = () =>
    run(async () => {
      if (typeof window !== "undefined" && !window.confirm(PUBLISH_CONFIRMATION)) return;
      const result = await publishMilestoneRevision(caseId);
      setPublishedMilestones(result.milestones);
      setPublishedProgress(result.progressPercentage);
      setNotice(`Új ügyfélverzió közzétéve (v${result.revisionNumber}).`);
      await load();
    });

  return (
    <section data-testid="milestone-publication-panel" className="min-w-0 space-y-4 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyfélbiztos mérföldkövek</p>
          <h4 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Előrehaladás közzététele</h4>
          <p className="mt-1 max-w-2xl text-xs text-[var(--adm-text-muted)]">A tervezet nem látható az ügyfélnek. Csak explicit közzététel hoz létre változatlan ügyfélverziót; a belső feladatok későbbi módosítása nem írja felül.</p>
        </div>
        <AdminBadge tone={publicationStatus === "PUBLISHED" ? "green" : "neutral"}>{publicationStatus ? `Publikáció: ${publicationStatus}` : "Nincs publikáció"}</AdminBadge>
      </div>

      {error ? <p data-testid="milestone-error" className="rounded-[12px] border border-[#F2DAD6] bg-[var(--adm-terracotta-100)] p-3 text-sm font-semibold text-[var(--adm-terracotta-700)]">{error}</p> : null}
      {notice ? <p data-testid="milestone-notice" className="rounded-[12px] border border-[#CDE3D4] bg-[#EDF6EF] p-3 text-sm font-semibold text-[#2E5B3C]">{notice}</p> : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton size="sm" variant="neutral" disabled={busy} onClick={addBlank}>Üres mérföldkő</AdminButton>
            <span data-testid="milestone-weight-sum" className="text-xs text-[var(--adm-text-muted)]">Súlyok összege: {weightSum}</span>
          </div>

          {draft.length === 0 ? (
            <p className="rounded-[12px] bg-[var(--adm-surface)] p-3 text-sm text-[var(--adm-text-muted)]">Még nincs mérföldkő tervezet. Adj hozzá lépést a jobb oldali listából, vagy hozz létre üreset.</p>
          ) : null}

          <ol data-testid="milestone-draft-list" className="space-y-3">
            {draft.map((item, index) => {
              const invalidTitle = !item.safeTitle.trim();
              const invalidWeight = typeof item.weight === "number" && item.weight <= 0;
              return (
                <li key={item.publicKey} data-testid={`milestone-draft-item-${index}`} className="rounded-[12px] border border-[rgba(22,32,26,0.12)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">#{index + 1}</span>
                    <div className="flex gap-1">
                      <AdminButton size="sm" variant="muted" disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</AdminButton>
                      <AdminButton size="sm" variant="muted" disabled={busy || index === draft.length - 1} onClick={() => move(index, 1)}>↓</AdminButton>
                      <AdminButton size="sm" variant="muted" disabled={busy} onClick={() => removeItem(index)}>Törlés</AdminButton>
                    </div>
                  </div>
                  <input
                    value={item.safeTitle}
                    onChange={(event) => updateItem(index, { safeTitle: event.target.value })}
                    className={`mt-2 min-w-0 w-full rounded border px-3 py-2 text-sm ${invalidTitle ? "border-[#E4A0A0]" : "border-[rgba(22,32,26,0.16)]"}`}
                    placeholder="Ügyfélbiztos cím (kötelező)"
                    data-testid={`milestone-title-${index}`}
                  />
                  <textarea
                    value={item.safeDescription ?? ""}
                    onChange={(event) => updateItem(index, { safeDescription: event.target.value })}
                    className="mt-2 min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
                    placeholder="Ügyfélbiztos leírás (opcionális) — ne tartalmazzon belső nevet, feladatot vagy azonosítót"
                    rows={2}
                  />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-[var(--adm-text-muted)]">
                      Súly (előrehaladáshoz)
                      <input
                        type="number"
                        min={1}
                        value={item.weight ?? ""}
                        onChange={(event) => updateItem(index, { weight: event.target.value === "" ? null : Number(event.target.value) })}
                        className={`mt-1 min-w-0 w-full rounded border px-3 py-2 text-sm ${invalidWeight ? "border-[#E4A0A0]" : "border-[rgba(22,32,26,0.16)]"}`}
                        data-testid={`milestone-weight-${index}`}
                      />
                    </label>
                    <label className="text-xs text-[var(--adm-text-muted)]">
                      Állapot
                      <select
                        value={item.completionState}
                        onChange={(event) => updateItem(index, { completionState: event.target.value as MilestoneCompletionState })}
                        className="mt-1 min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
                        data-testid={`milestone-state-${index}`}
                      >
                        {COMPLETION_STATES.map((state) => (
                          <option key={state} value={state}>{COMPLETION_STATE_LABELS[state]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {item.sourceTaskId ? <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Belső forráslépéshez kötve (az ügyfél ezt nem látja).</p> : null}
                  {invalidWeight ? <p className="mt-1 text-[10px] font-semibold text-[var(--adm-terracotta-700)]">A súly pozitív szám legyen, vagy hagyd üresen.</p> : null}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap gap-2">
            <AdminButton variant="gold" disabled={busy || draft.length === 0} onClick={saveAndPreview} data-testid="milestone-save-preview">Mentés és előnézet</AdminButton>
            <AdminButton variant="primary" disabled={busy || draft.length === 0} onClick={publish} data-testid="milestone-publish">Új ügyfélverzió közzététele</AdminButton>
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="min-w-0 rounded-[12px] border border-[rgba(22,32,26,0.12)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Jelölt munkafolyamat-lépések</p>
            {eligible.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Nincs jelölt lépés ehhez az ügyhöz.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {eligible.map((step) => (
                  <li key={step.taskId} className="rounded-[10px] bg-[var(--adm-surface)] p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <b className="min-w-0 break-words text-[var(--adm-text)]">{step.internalTitle}</b>
                      <AdminBadge tone="neutral">{step.internalStatus}</AdminBadge>
                    </div>
                    <AdminButton className="mt-2 w-full justify-start" size="sm" variant="neutral" disabled={busy || usedTaskIds.has(step.taskId)} onClick={() => addFromStep(step)}>
                      {usedTaskIds.has(step.taskId) ? "Már hozzáadva" : "Hozzáadás mérföldkőként"}
                    </AdminButton>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {preview ? (
            <div className="min-w-0 rounded-[12px] border border-[rgba(22,32,26,0.12)] p-3">
              <CustomerPreviewList milestones={preview.milestones} progressPercentage={preview.progressPercentage} />
            </div>
          ) : null}

          <div className="min-w-0 rounded-[12px] border border-[rgba(22,32,26,0.12)] p-3" data-testid="milestone-published">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyfélnek publikált előrehaladás</p>
            {publishedMilestones.length || typeof publishedProgress === "number" ? (
              <CustomerPreviewList milestones={publishedMilestones} progressPercentage={publishedProgress} />
            ) : (
              <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Még nincs közzétett ügyfélverzió.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
