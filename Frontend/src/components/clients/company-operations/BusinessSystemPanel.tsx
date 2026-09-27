"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { clientCompanyApi } from "@/lib/clientCompanyApi";

export type CompanyPersonOption = {
  id: string;
  name: string;
};

export type SystemEditValue = {
  id: string;
  name: string;
  category: string;
  purpose: string | null;
  ownerPersonId: string | null;
};

function systemErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "DUPLICATE_SYSTEM_NAME") {
      return "Ilyen nevű rendszer már szerepel ennél az ügyfélnél.";
    }
    if (error.status === 403) {
      return "Nincs jogosultság a rendszer módosításához.";
    }
    if (error.status === 404) {
      return "A rendszer már nem található.";
    }
    if (error.status === 0 || error.status === 502 || error.status === 503) {
      return "A rendszer mentése jelenleg nem érhető el. Próbáld újra később.";
    }
  }
  return "A rendszer mentése nem sikerült.";
}

export function BusinessSystemPanel({
  clientId,
  system,
  people,
  onSaved,
  onClose,
}: {
  clientId: string;
  system: SystemEditValue | null;
  people: CompanyPersonOption[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const isEdit = system !== null;
  const [name, setName] = useState(system?.name ?? "");
  const [category, setCategory] = useState(system?.category ?? "");
  const [purpose, setPurpose] = useState(system?.purpose ?? "");
  const [ownerPersonId, setOwnerPersonId] = useState(system?.ownerPersonId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("A rendszer neve kötelező.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: trimmedName,
      category: category.trim() || undefined,
      purpose: purpose.trim() || undefined,
      ownerPersonId: ownerPersonId || null,
    };
    try {
      if (isEdit && system) {
        await clientCompanyApi.updateBusinessSystem(system.id, payload);
      } else {
        await clientCompanyApi.createBusinessSystem(clientId, payload);
      }
      onSaved();
    } catch (err) {
      setError(systemErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-system-panel-title"
      data-testid="business-system-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--adm-border)] bg-white p-5 text-left shadow-xl">
        <h3 id="business-system-panel-title" className="adm-heading text-lg">
          {isEdit ? "Rendszer szerkesztése" : "Rendszer rögzítése"}
        </h3>

        <div className="mt-4 space-y-3">
          <div className="grid gap-1">
            <label htmlFor="system-name" className="text-xs font-semibold text-[var(--adm-text-muted)]">
              Név <span className="text-red-700">*</span>
            </label>
            <input
              id="system-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="adm-modal-field px-3 py-2 text-sm"
              data-testid="system-name-input"
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="system-category" className="text-xs font-semibold text-[var(--adm-text-muted)]">
              Kategória
            </label>
            <input
              id="system-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="pl. SOFTWARE"
              className="adm-modal-field px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="system-purpose" className="text-xs font-semibold text-[var(--adm-text-muted)]">
              Cél / mire használják
            </label>
            <textarea
              id="system-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              rows={2}
              className="adm-modal-field px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="system-owner" className="text-xs font-semibold text-[var(--adm-text-muted)]">
              Felelős személy
            </label>
            <select
              id="system-owner"
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
            data-testid="save-system"
            className="adm-link-button adm-link-button-primary px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {busy ? "Mentés…" : "Mentés"}
          </button>
        </div>
      </div>
    </div>
  );
}
