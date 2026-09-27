"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { clientCompanyApi, type CompanyBusinessProcessStep } from "@/lib/clientCompanyApi";
import { stepTypeLabel } from "@/lib/processMapProjection";
import type { CompanyPersonOption } from "./BusinessSystemPanel";

const STEP_TYPE_OPTIONS: Array<[string, string]> = [
  ["MANUAL", "Kézi lépés"],
  ["DATA_ENTRY", "Adatrögzítés"],
  ["APPROVAL", "Jóváhagyás"],
  ["REVIEW", "Ellenőrzés"],
  ["HANDOFF", "Átadás"],
  ["AUTOMATED", "Automatikus"],
  ["WAITING", "Várakozás"],
  ["OTHER", "Egyéb"],
];

type EstimateParse = number | null | "invalid";

function parseEstimate(raw: string): EstimateParse {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return "invalid";
  return value;
}

function stepErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Nincs jogosultság a lépés módosításához.";
    }
    if (error.status === 404) {
      return "A folyamat vagy a lépés már nem található.";
    }
    if (error.status === 400) {
      return "A lépés a megadott adatokkal nem menthető.";
    }
    if (error.status === 0 || error.status === 502 || error.status === 503) {
      return "A lépés mentése jelenleg nem érhető el. Próbáld újra később.";
    }
  }
  return "A lépés mentése nem sikerült.";
}

function sortSteps(steps: CompanyBusinessProcessStep[]): CompanyBusinessProcessStep[] {
  return [...steps].sort((a, b) => (a.position !== b.position ? a.position - b.position : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function BusinessProcessStepsPanel({
  processId,
  processName,
  systems,
  people,
  onSaved,
  onClose,
}: {
  processId: string;
  processName: string;
  systems: Array<{ id: string; name: string }>;
  people: CompanyPersonOption[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [steps, setSteps] = useState<CompanyBusinessProcessStep[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<CompanyBusinessProcessStep | null>(null);
  const [stepName, setStepName] = useState("");
  const [stepType, setStepType] = useState("MANUAL");
  const [approval, setApproval] = useState(false);
  const [systemId, setSystemId] = useState("");
  const [responsiblePersonId, setResponsiblePersonId] = useState("");
  const [activeRaw, setActiveRaw] = useState("");
  const [waitingRaw, setWaitingRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refreshSteps = useCallback(async () => {
    const fresh = await clientCompanyApi.getBusinessProcess(processId);
    setSteps(sortSteps(fresh.steps ?? []));
  }, [processId]);

  useEffect(() => {
    void refreshSteps().catch((err) => setError(stepErrorMessage(err)));
  }, [refreshSteps]);

  const resetStepForm = () => {
    setStepName("");
    setStepType("MANUAL");
    setApproval(false);
    setSystemId("");
    setResponsiblePersonId("");
    setActiveRaw("");
    setWaitingRaw("");
    setFormError(null);
  };

  const openAddStep = () => {
    setEditingStep(null);
    resetStepForm();
    setFormOpen(true);
  };

  const openEditStep = (step: CompanyBusinessProcessStep) => {
    setEditingStep(step);
    setStepName(step.name);
    setStepType(step.stepType);
    setApproval(Boolean(step.isApproval));
    setSystemId(step.systemId ?? "");
    setResponsiblePersonId(step.responsiblePersonId ?? "");
    setActiveRaw(step.estimatedActiveMinutes?.toString() ?? "");
    setWaitingRaw(step.estimatedWaitingMinutes?.toString() ?? "");
    setFormError(null);
    setFormOpen(true);
  };

  const submitStep = async () => {
    const trimmedName = stepName.trim();
    if (!trimmedName) {
      setFormError("A lépés neve kötelező.");
      return;
    }
    const active = parseEstimate(activeRaw);
    const waiting = parseEstimate(waitingRaw);
    if (active === "invalid" || waiting === "invalid") {
      setFormError("A becslés egész, nem negatív perc lehet.");
      return;
    }
    const isApproval = stepType === "APPROVAL" || approval;
    const payload = {
      name: trimmedName,
      stepType,
      isApproval,
      systemId: systemId || null,
      responsiblePersonId: responsiblePersonId || null,
      estimatedActiveMinutes: active,
      estimatedWaitingMinutes: waiting,
    };
    setBusy(true);
    setFormError(null);
    try {
      if (editingStep) {
        await clientCompanyApi.updateBusinessProcessStep(editingStep.id, payload);
      } else {
        await clientCompanyApi.addBusinessProcessStep(processId, payload);
      }
      await refreshSteps();
      onSaved();
      resetStepForm();
      setFormOpen(false);
    } catch (err) {
      setFormError(stepErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setBusy(true);
    setError(null);
    try {
      const reordered = await clientCompanyApi.reorderBusinessProcessSteps(processId, next.map((s) => s.id));
      setSteps(sortSteps(reordered));
      onSaved();
    } catch (err) {
      setError(stepErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-process-steps-title"
      data-testid="business-process-steps-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--adm-border)] bg-white p-5 text-left shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 id="business-process-steps-title" className="adm-heading text-lg">
              {processName}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">Folyamat lépései sorrendben</p>
          </div>
          <button type="button" onClick={onClose} className="adm-link-button px-3 py-1.5 text-xs">
            Bezárás
          </button>
        </div>

        {!formOpen && steps.length === 0 ? (
          <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-[var(--adm-text-muted)]">
            Még nincs lépés.
          </p>
        ) : null}

        {!formOpen && steps.length > 0 ? (
          <ol className="mt-4 space-y-2" aria-label="Folyamat lépései sorrendben">
            {steps.map((step, index) => (
              <li
                key={step.id}
                className="flex items-start gap-3 rounded-lg border border-[var(--adm-border)] bg-white px-3 py-2"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--adm-border)] text-[10px] font-bold text-[var(--adm-text-muted)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--adm-text)]">{step.name}</p>
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--adm-text-muted)]">
                      {stepTypeLabel(step.stepType)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">
                    {step.systemName ?? "Nincs rendszer"} · {step.responsiblePersonName ?? "Nincs felelős"}
                    {step.estimatedActiveMinutes != null ? ` · aktív: ${step.estimatedActiveMinutes} p` : ""}
                    {step.estimatedWaitingMinutes != null ? ` · várakozás: ${step.estimatedWaitingMinutes} p` : ""}
                    {step.isApproval ? " · jóváhagyás" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void move(index, -1)}
                    disabled={busy || index === 0}
                    aria-label={`Lépés feljebb: ${step.name}`}
                    className="rounded-md border border-[var(--adm-border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--adm-text-muted)] hover:bg-stone-50 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(index, 1)}
                    disabled={busy || index === steps.length - 1}
                    aria-label={`Lépés lejjebb: ${step.name}`}
                    className="rounded-md border border-[var(--adm-border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--adm-text-muted)] hover:bg-stone-50 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditStep(step)}
                    className="adm-link-button px-2.5 py-1 text-xs"
                  >
                    Szerkesztés
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {formOpen ? (
          <div className="mt-4 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--adm-green-800)]">
              {editingStep ? "Lépés szerkesztése" : "Új lépés"}
            </h4>
            <div className="mt-3 space-y-3">
              <div className="grid gap-1">
                <label htmlFor="step-name" className="text-xs font-semibold text-[var(--adm-text-muted)]">
                  Lépés neve <span className="text-red-700">*</span>
                </label>
                <input
                  id="step-name"
                  autoFocus
                  required
                  value={stepName}
                  onChange={(event) => setStepName(event.target.value)}
                  className="adm-modal-field px-3 py-2 text-sm"
                  data-testid="step-name-input"
                />
              </div>

              <div className="grid gap-1">
                <label htmlFor="step-type" className="text-xs font-semibold text-[var(--adm-text-muted)]">
                  Lépés típusa
                </label>
                <select
                  id="step-type"
                  value={stepType}
                  onChange={(event) => {
                    const next = event.target.value;
                    setStepType(next);
                    if (next === "APPROVAL") setApproval(true);
                  }}
                  className="adm-modal-field px-3 py-2 text-sm"
                >
                  {STEP_TYPE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1">
                <label htmlFor="step-system" className="text-xs font-semibold text-[var(--adm-text-muted)]">
                  Rendszer
                </label>
                <select
                  id="step-system"
                  value={systemId}
                  onChange={(event) => setSystemId(event.target.value)}
                  className="adm-modal-field px-3 py-2 text-sm"
                >
                  <option value="">Nincs rendszer</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1">
                <label htmlFor="step-responsible" className="text-xs font-semibold text-[var(--adm-text-muted)]">
                  Felelős személy
                </label>
                <select
                  id="step-responsible"
                  value={responsiblePersonId}
                  onChange={(event) => setResponsiblePersonId(event.target.value)}
                  className="adm-modal-field px-3 py-2 text-sm"
                >
                  <option value="">Nincs kijelölve</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label htmlFor="step-active-minutes" className="text-xs font-semibold text-[var(--adm-text-muted)]">
                    Aktív munkaidő becslése (perc)
                  </label>
                  <input
                    id="step-active-minutes"
                    inputMode="numeric"
                    value={activeRaw}
                    onChange={(event) => setActiveRaw(event.target.value)}
                    placeholder="nincs becslés"
                    className="adm-modal-field px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <label htmlFor="step-waiting-minutes" className="text-xs font-semibold text-[var(--adm-text-muted)]">
                    Várakozás becslése (perc)
                  </label>
                  <input
                    id="step-waiting-minutes"
                    inputMode="numeric"
                    value={waitingRaw}
                    onChange={(event) => setWaitingRaw(event.target.value)}
                    placeholder="nincs becslés"
                    className="adm-modal-field px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-[var(--adm-text-muted)]">
                <input
                  type="checkbox"
                  checked={stepType === "APPROVAL" || approval}
                  disabled={stepType === "APPROVAL"}
                  onChange={(event) => setApproval(event.target.checked)}
                />
                Jóváhagyási pont
              </label>
              <p className="text-[11px] text-[var(--adm-text-muted)]">
                A becslések emberi becslések, nem mért időadatok. Üres mező = nincs becslés.
              </p>
            </div>

            {formError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setFormError(null);
                }}
                className="adm-link-button px-3 py-1.5 text-xs"
              >
                Mégse
              </button>
              <button
                type="button"
                onClick={() => void submitStep()}
                disabled={busy}
                data-testid="save-step"
                className="adm-link-button adm-link-button-primary px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {busy ? "Mentés…" : "Mentés"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={openAddStep}
              data-testid="add-step"
              className="adm-link-button px-3 py-1.5 text-xs font-semibold"
            >
              {steps.length === 0 ? "+ Első lépés hozzáadása" : "+ Lépés hozzáadása"}
            </button>
          </div>
        )}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
