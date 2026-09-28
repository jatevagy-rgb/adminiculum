"use client";

/**
 * Case Context V2 — manual sensitive terms editor.
 *
 * Manual terms are EPHEMERAL by design: they live only in component state of
 * this surface, are never written to localStorage/sessionStorage/URL and are
 * only ever sent to the detect/anonymize endpoints. Deleting or unmounting
 * this editor forgets them.
 */

import React from "react";
import { AdminButton, AdminPanel, AdminSectionHeader } from "@/components/adminiculum/ui";
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
    <AdminPanel data-testid="ccv2-manual-terms">
      <AdminSectionHeader
        title="Manuális érzékeny kifejezések (opcionális)"
        subtitle="Ezek a kifejezések csak a detektálás és az anonimizálás idejére léteznek. Nem kerülnek mentésre, és az oldal elhagyásával elvesznek."
      />
      <div className="space-y-2 px-4 py-3">
        {terms.length === 0 ? (
          <p data-testid="ccv2-manual-terms-empty" className="text-[12px] text-[var(--adm-text-muted)]">
            Nincs megadott manuális kifejezés. A detektálás így csak a beépített, determinisztikus szabályokat használja.
          </p>
        ) : (
          <ul className="space-y-2">
            {terms.map((term, index) => (
              <li key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px_auto]" data-testid={`ccv2-manual-term-${index}`}>
                <input
                  type="text"
                  value={term.term}
                  disabled={disabled}
                  onChange={(event) => updateTerm(index, { term: event.target.value })}
                  placeholder="pl. Kovács József"
                  aria-label={`Manuális kifejezés ${index + 1}`}
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
                  variant="danger"
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
    </AdminPanel>
  );
}
