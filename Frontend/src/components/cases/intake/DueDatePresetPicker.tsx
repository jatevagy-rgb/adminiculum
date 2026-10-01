"use client";

/**
 * Due presets for task/case planning (WORD_WF02 W04).
 *
 * Offers the five canonical presets (1/4/8 hours, 2/5 days — calendar
 * durations, see lib/duePresets.ts) plus the existing custom absolute-date
 * option as a secondary choice. The preset is resolved ONCE at selection time
 * into `resolvedIso`; that value is what parents persist and what the countdown
 * is derived from. Ticking the countdown never writes anywhere.
 */
import { useState } from "react";
import {
  DUE_PRESET_OPTIONS,
  type DuePresetKey,
  isDuePresetKey,
  resolvePresetDueAt,
  resolveCustomDueAt,
  presetOption,
  formatDueCountdown,
  type DueCountdown,
} from "@/lib/duePresets";

export interface DueSelection {
  /** Canonical preset or null when custom/empty. */
  presetKey: DuePresetKey | null;
  /** Secondary custom absolute date (YYYY-MM-DD). */
  customDate: string;
  /** Secondary custom time (HH:mm), optional. */
  customTime: string;
  /** The single canonical persisted moment, resolved once at selection time. */
  resolvedIso: string | null;
}

export const EMPTY_DUE_SELECTION: DueSelection = {
  presetKey: null,
  customDate: "",
  customTime: "",
  resolvedIso: null,
};

/** Resolve a preset now and keep the secondary custom fields for a later switch. */
export function commitPreset(previous: DueSelection, key: DuePresetKey, now: Date = new Date()): DueSelection {
  return {
    presetKey: key,
    customDate: previous.customDate,
    customTime: previous.customTime,
    resolvedIso: resolvePresetDueAt(key, now).toISOString(),
  };
}

/** Resolve a custom absolute date now (defaults to 09:00 like the intake deadline). */
export function commitCustom(previous: DueSelection, date: string, time: string): DueSelection {
  const resolved = resolveCustomDueAt(date, time);
  return {
    presetKey: null,
    customDate: date,
    customTime: time,
    resolvedIso: resolved ? resolved.toISOString() : null,
  };
}

export function resolvedDueCountdown(selection: DueSelection, now: Date = new Date()): DueCountdown | null {
  if (!selection.resolvedIso) return null;
  const parsed = new Date(selection.resolvedIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDueCountdown(parsed, now);
}

const chipBase =
  "inline-flex min-h-[40px] items-center justify-center rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-blue-700)] disabled:opacity-50";
const chipActive = "border-[var(--adm-green-700)] bg-[var(--adm-green-700)] text-white";
const chipIdle = "border-[rgba(16,22,19,0.22)] bg-white text-[var(--adm-text)] hover:bg-[var(--adm-surface)]";

export function DueDatePresetPicker({
  value,
  onChange,
  error,
  idPrefix = "due",
  disabled,
}: {
  value: DueSelection;
  onChange: (next: DueSelection) => void;
  error?: string;
  idPrefix?: string;
  disabled?: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(Boolean(value.customDate) && value.presetKey === null);
  const countdown = resolvedDueCountdown(value);
  const presetLabel = value.presetKey ? presetOption(value.presetKey).label : null;

  return (
    <div data-testid="due-preset-picker" className="mt-1">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Határidő-választás">
        {DUE_PRESET_OPTIONS.map((option) => {
          const active = value.presetKey === option.key;
          return (
            <button
              key={option.key}
              type="button"
              data-testid={`due-preset-${option.key}`}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(commitPreset(value, option.key))}
              className={`${chipBase} ${active ? chipActive : chipIdle}`}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          data-testid="due-custom-toggle"
          aria-pressed={customOpen && value.presetKey === null}
          disabled={disabled}
          onClick={() => setCustomOpen((open) => !open)}
          className={`${chipBase} ${customOpen && value.presetKey === null ? chipActive : chipIdle}`}
        >
          Egyedi dátum
        </button>
        {value.resolvedIso ? (
          <button
            type="button"
            data-testid="due-clear"
            disabled={disabled}
            onClick={() => {
              setCustomOpen(false);
              onChange(EMPTY_DUE_SELECTION);
            }}
            className={`${chipBase} ${chipIdle}`}
          >
            Nincs határidő
          </button>
        ) : null}
      </div>

      {customOpen && value.presetKey === null ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
            Dátum
            <input
              id={`${idPrefix}-custom-date`}
              type="date"
              data-testid="due-custom-date"
              disabled={disabled}
              value={value.customDate}
              onChange={(event) => {
                const next = commitCustom(value, event.target.value, value.customTime);
                onChange(next);
              }}
              className="mt-1 w-full rounded-md border border-[var(--adm-border)] bg-white px-3 py-2 text-[13px] text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none disabled:opacity-60"
            />
          </label>
          <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
            Időpont
            <input
              id={`${idPrefix}-custom-time`}
              type="time"
              data-testid="due-custom-time"
              disabled={disabled}
              value={value.customTime}
              onChange={(event) => {
                const next = commitCustom(value, value.customDate, event.target.value);
                onChange(next);
              }}
              className="mt-1 w-full rounded-md border border-[var(--adm-border)] bg-white px-3 py-2 text-[13px] text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none disabled:opacity-60"
            />
          </label>
        </div>
      ) : null}

      <p
        data-testid="due-resolved-preview"
        className={`mt-1.5 text-[11.5px] font-semibold ${countdown ? (countdown.expired ? "text-[var(--adm-terracotta-700)]" : "text-[var(--adm-blue-700)]") : "text-[var(--adm-text-muted)]"}`}
      >
        {countdown
          ? `${presetLabel ? `${presetLabel} · ` : ""}${countdown.dateLabel} · ${countdown.countdown}`
          : "Számított határidő: —"}
      </p>
      {error ? (
        <p role="alert" data-testid="due-error" className="mt-1 text-[11px] font-semibold text-[var(--adm-terracotta-700)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
