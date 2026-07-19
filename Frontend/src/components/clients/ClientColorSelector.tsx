"use client";

import {
  CLIENT_COLOR_OPTIONS,
  NEUTRAL_CLIENT_COLOR,
  getClientColorDefinition,
  type ClientColorKey,
} from "@/lib/clientColors";

interface ClientColorSelectorProps {
  value: ClientColorKey | null;
  onChange: (value: ClientColorKey | null) => void;
  disabled?: boolean;
}

export function ClientColorSelector({ value, onChange, disabled = false }: ClientColorSelectorProps) {
  const options = [NEUTRAL_CLIENT_COLOR, ...CLIENT_COLOR_OPTIONS];

  return (
    <fieldset disabled={disabled}>
      <legend className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Ügyfélszín</legend>
      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Vizuális azonosító; nem állapot vagy prioritás.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = value === option.key;
          const definition = getClientColorDefinition(option.key);
          return (
            <label
              key={option.key || "NONE"}
              className={`flex cursor-pointer items-center gap-3 rounded-[8px] border bg-white px-3 py-2 text-[12px] font-semibold text-[var(--adm-text)] transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--adm-green-800)] ${checked ? `${definition.borderClass} ring-1 ${definition.ringClass}` : "border-[var(--adm-border)]"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:bg-[var(--adm-surface)]"}`}
            >
              <input
                type="radio"
                name="clientColorKey"
                value={option.key || ""}
                checked={checked}
                onChange={() => onChange(option.key)}
                className="sr-only"
              />
              <span aria-hidden="true" className={`h-5 w-5 rounded-full border border-black/10 ${option.key ? option.accentClass : "bg-white"}`} />
              <span>{option.label}</span>
              {checked ? <span className="ml-auto text-[10px] text-[var(--adm-text-muted)]">Kiválasztva</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
