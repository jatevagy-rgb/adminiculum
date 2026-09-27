"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { clientCompanyApi, type CompanyBusinessProcess } from "@/lib/clientCompanyApi";
import type { CompanyPersonOption } from "./BusinessSystemPanel";

export type ProcessEditValue = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  criticality: string;
  frequency: string;
  ownerPersonId: string | null;
};

const CRITICALITY_OPTIONS: Array<[string, string]> = [
  ["LOW", "Alacsony"],
  ["MEDIUM", "Közepes"],
  ["HIGH", "Magas"],
  ["CRITICAL", "Kritikus"],
];

const FREQUENCY_OPTIONS: Array<[string, string]> = [
  ["DAILY", "Napi"],
  ["WEEKLY", "Heti"],
  ["MONTHLY", "Havi"],
  ["QUARTERLY", "Negyedéves"],
  ["YEARLY", "Éves"],
  ["AD_HOC", "Eseti"],
];

function processErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Nincs jogosultság a folyamat módosításához.";
    }
    if (error.status === 404) {
      return "A folyamat már nem található.";
    }
    if (error.status === 0 || error.status === 502 || error.status === 503) {
      return "A folyamat mentése jelenleg nem érhető el. Próbáld újra később.";
    }
  }
  return "A folyamat mentése nem sikerült.";
}

export function BusinessProcessPanel({
  clientId,
  process,
  people,
  onSaved,
  onClose,
}: {
  clientId: string;
  process: ProcessEditValue | null;
  people: CompanyPersonOption[];
  onSaved: (created: CompanyBusinessProcess | null) => void;
  onClose: () => void;
}) {
  const isEdit = process !== null;
  const [name, setName] = useState(process?.name ?? "");
  const [category, setCategory] = useState(process?.category ?? "");
  const [description, setDescription] = useState(process?.description ?? "");
  const [criticality, setCriticality] = useState(process?.criticality || "MEDIUM");
  const [frequency, setFrequency] = useState(process?.frequency || "DAILY");
  const [ownerPersonId, setOwnerPersonId] = useState(process?.ownerPersonId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("A folyamat neve kötelező.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: trimmedName,
      category: category.trim() || undefined,
      description: description.trim() || undefined,
      criticality,
      frequency,
      ownerPersonId: ownerPersonId || null,
    };
    try {
      if (isEdit && process) {
        await clientCompanyApi.updateBusinessProcess(process.id, payload);
        onSaved(null);
      } else {
        const created = await clientCompanyApi.createBusinessProcess(clientId, payload);
        const withSteps: CompanyBusinessProcess = { ...created, steps: created.steps ?? [] };
        onSaved(withSteps);
      }
    } catch (err) {
      setError(processErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-process-panel-title"
      data-testid="business-process-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--adm-border)] bg-white p-5 text-left shadow-xl">
        <h3 id="business-process-panel-title" className="adm-heading text-lg">
          {isEdit ? "Folyamat szerkesztése" : "Folyamat rögzítése"}
        </h3>

        <div className="mt-4 space-y-3">
          <div className="grid gap-1">
            <label htmlFor="process-name" className="text-xs font-semibold text-[var(--adm-text-muted)]">
              Név <span className="text-red-700">*</span>
            </label>
            <input
              id="process-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="adm-modal-field px-3 py-2 text-sm"
              data-testid="process-name-input"
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="process-category" className="text-xs font-semibold text-[var(--adm-text-muted)]">
              Kategória
            </label>
            <input
              id="process-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="pl. Procurement"
              className="adm-modal-field px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="process-description" className="text-xs font-semibold text-[var(--adm-text-muted)]">
              Leírás
            </label>
            <textarea
              id="process-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className="adm-modal-field px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="process-criticality" className="text-xs font-semibold text-[var(--adm-text-muted)]">
                Kritikusság
              </label>
              <select
                id="process-criticality"
                value={criticality}
                onChange={(event) => setCriticality(event.target.value)}
                className="adm-modal-field px-3 py-2 text-sm"
              >
                {CRITICALITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1">
              <label htmlFor="process-frequency" className="text-xs font-semibold text-[var(--adm-text-muted)]">
                Gyakoriság
              </label>
              <select
                id="process-frequency"
                value={frequency}
                onChange={(event) => setFrequency(event.target.value)}
                className="adm-modal-field px-3 py-2 text-sm"
              >
                {FREQUENCY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1">
            <label htmlFor="process-owner" className="text-xs font-semibold text-[var(--adm-text-muted)]">
              Folyamatgazda
            </label>
            <select
              id="process-owner"
              value={ownerPersonId}
              onChange={(event) => setOwnerPersonId(event.target.value)}
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
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="adm-link-button px-4 py-2 text-xs">
            Mégse
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            data-testid="save-process"
            className="adm-link-button adm-link-button-primary px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {busy ? "Mentés…" : isEdit ? "Mentés" : "Létrehozás és lépések"}
          </button>
        </div>
      </div>
    </div>
  );
}
