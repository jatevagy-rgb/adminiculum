"use client";

/**
 * Case Context V2 — manual sensitive terms editor.
 *
 * Manual terms are EPHEMERAL by design: they live only in component state of
 * this surface, are never written to localStorage/sessionStorage/URL and are
 * only ever sent to the detect/anonymize endpoints. Deleting or unmounting
 * this editor forgets them.
 *
 * Compact disclosure: collapsed by default while empty, opens automatically
 * as soon as a term is added.
 */

import React, { useEffect, useState } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import {
  SENSITIVE_CATEGORY_LABELS,
  SENSITIVE_CATEGORY_ORDER,
  type ManualSensitiveTerm,
  type SensitiveCategory,
} from "@/lib/caseContextSources";

const inputClass =
  "w-full rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-3 py-1.5 text-[12px] text-[var(--adm-text)] placeholder-[var(--adm-text-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-brand-green)]";

export function ManualTermsEditor({
  terms,
  onChange,
  disabled = false,
}: {
  terms: ManualSensitiveTerm[];
  onChange: (terms: ManualSensitiveTerm[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(terms.length > 0);

  useEffect(() => {
    if (terms.length > 0) setOpen(true);
  }, [terms.length]);

  const updateTerm = (index: number, patch: Partial<ManualSensitiveTerm>) => {
    onChange(terms.map((term, termIndex) => (termIndex === index ? { ...term, ...patch } : term)));
  };

  const removeTerm = (index: number) => {
    onChange(terms.filter((_, termIndex) => termIndex !== index));
  };

  const addTerm = () => {
    onChange([...terms, { term: "", category: "PERSON" }]);
  };

  return (
    <div data-testid="ccv2-manual-terms" className="rounded-[8px] border border-[rgba(22,32,26,0.10)] bg-white">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        data-testid="ccv2-manual-terms-toggle"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-[var(--adm-text)]">Saját kifejezések (opcionális)</span>
          <span className="mt-0.5 block text-[11px] text-[var(--adm-text-muted)]">
            A megadott kifejezések csak ehhez az ellenőrzéshez használhatók, az oldal elhagyásakor nem maradnak meg.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">
          {terms.length > 0 ? <span data-testid="ccv2-manual-terms-count">{terms.length} kifejezés</span> : null}
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open ? (
        <div data-testid="ccv2-manual-terms-body" className="space-y-2 border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
          {terms.length === 0 ? (
            <p data-testid="ccv2-manual-terms-empty" className="text-[11.5px] text-[var(--adm-text-muted)]">
              Még nincs megadott kifejezés.
            </p>
          ) : (
            <ul className="space-y-2">
              {terms.map((term, index) => (
                <li key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]" data-testid={`ccv2-manual-term-${index}`}>
                  <input
                    type="text"
                    value={term.term}
                    disabled={disabled}
                    onChange={(event) => updateTerm(index, { term: event.target.value })}
                    placeholder="pl. Kovács József"
                    aria-label={`Saját kifejezés ${index + 1}`}
                    data-testid={`ccv2-manual-term-input-${index}`}
                    className={inputClass}
                  />
                  <select
                    value={term.category}
                    disabled={disabled}
                    onChange={(event) => updateTerm(index, { category: event.target.value as SensitiveCategory })}
                    aria-label={`Kifejezés kategóriája ${index + 1}`}
                    data-testid={`ccv2-manual-term-category-${index}`}
                    className={inputClass}
                  >
                    {SENSITIVE_CATEGORY_ORDER.map((category) => (
                      <option key={category} value={category}>
                        {SENSITIVE_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => removeTerm(index)}
                    data-testid={`ccv2-manual-term-remove-${index}`}
                  >
                    Eltávolítás
                  </AdminButton>
                </li>
              ))}
            </ul>
          )}
          <AdminButton size="sm" variant="muted" disabled={disabled} onClick={addTerm} data-testid="ccv2-manual-term-add">
            Kifejezés hozzáadása
          </AdminButton>
        </div>
      ) : null}
    </div>
  );
}
