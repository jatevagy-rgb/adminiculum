/**
 * Due-preset helpers for case intake and task planning (WORD_WF02 W04).
 *
 * The five canonical presets — 1/4/8 hours, 2/5 days — mirror the existing
 * relative-deadline semantics of the backend (POST /cases/intake
 * `RELATIVE_UNITS` in Backend/src/modules/cases/intakeCreate.service.ts):
 * a "nap" is 24 hours (calendar semantics), a "hét" is 7 days. There is NO
 * business-day logic anywhere in the canonical path, so these presets are
 * labeled and documented as calendar durations.
 *
 * A preset is resolved to ONE absolute moment at selection time
 * (`resolvePresetDueAt`). That resolved value is what gets persisted
 * (Task.dueDate accepts a full ISO date-time), so the stored deadline never
 * drifts with the client clock and survives reload. The countdown shown in the
 * UI is derived from that persisted moment — ticking it never writes to the
 * server, and an expired deadline keeps growing as "lejárt …", it never resets
 * back to a future state.
 */

export type DuePresetKey = "1h" | "4h" | "8h" | "2d" | "5d";

export interface DuePresetOption {
  key: DuePresetKey;
  label: string;
  /** Calendar hours (1 day = 24 hours). */
  hours: number;
}

export const DUE_PRESET_OPTIONS: DuePresetOption[] = [
  { key: "1h", label: "1 óra", hours: 1 },
  { key: "4h", label: "4 óra", hours: 4 },
  { key: "8h", label: "8 óra", hours: 8 },
  { key: "2d", label: "2 nap", hours: 48 },
  { key: "5d", label: "5 nap", hours: 120 },
];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function isDuePresetKey(value: string | null | undefined): value is DuePresetKey {
  return value != null && DUE_PRESET_OPTIONS.some((o) => o.key === value);
}

export function presetOption(key: DuePresetKey): DuePresetOption {
  const found = DUE_PRESET_OPTIONS.find((o) => o.key === key);
  if (!found) throw new Error(`Unknown due preset: ${key}`);
  return found;
}

/** Resolve a preset to the single canonical absolute moment (calendar hours). */
export function resolvePresetDueAt(key: DuePresetKey, now: Date = new Date()): Date {
  const option = presetOption(key);
  return new Date(now.getTime() + option.hours * HOUR_MS);
}

/**
 * Custom absolute date (secondary option, preserved from the previous UI).
 * `time` defaults to 09:00 like the canonical intake deadline default.
 */
export function resolveCustomDueAt(date: string, time?: string, now: Date = new Date()): Date | null {
  if (!date) return null;
  const parsed = new Date(`${date}T${time || "09:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Local date part (YYYY-MM-DD) of a moment — used to seed the custom input. */
export function toDatePart(moment: Date): string {
  const y = moment.getFullYear();
  const m = String(moment.getMonth() + 1).padStart(2, "0");
  const d = String(moment.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface DueCountdown {
  /** Human local date-time of the due moment. */
  dateLabel: string;
  /** Short remaining/elapsed countdown, Hungarian. */
  countdown: string;
  expired: boolean;
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a due moment with a derived countdown.
 *
 * `now` is a parameter so tests and callers stay deterministic; the production
 * caller passes `new Date()` per render. An expired deadline only ever shows an
 * elapsed label ("lejárt …") — computing it again later yields a larger elapsed
 * value, never a future countdown.
 */
export function formatDueCountdown(dueAt: Date, now: Date = new Date()): DueCountdown {
  const dateLabel = dueAt.toLocaleString("hu-HU", { dateStyle: "long", timeStyle: "short" });
  const deltaMs = dueAt.getTime() - now.getTime();

  if (deltaMs < 0) {
    const elapsed = -deltaMs;
    const days = Math.floor(elapsed / DAY_MS);
    const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
    const minutes = Math.floor((elapsed % HOUR_MS) / 60_000);
    if (days > 0) return { dateLabel, expired: true, countdown: `lejárt ${days} napja` };
    if (hours > 0) return { dateLabel, expired: true, countdown: `lejárt ${hours} órája` };
    if (minutes >= 1) return { dateLabel, expired: true, countdown: `lejárt ${minutes} perce` };
    return { dateLabel, expired: true, countdown: "éppen lejárt" };
  }

  const days = Math.floor(deltaMs / DAY_MS);
  const hours = Math.floor((deltaMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((deltaMs % HOUR_MS) / 60_000);
  if (days > 0) {
    const parts = [`${days} nap`];
    if (hours > 0) parts.push(`${hours} óra`);
    return { dateLabel, expired: false, countdown: `${parts.join(" ")} múlva` };
  }
  if (hours > 0) {
    const parts = [`${hours} óra`];
    if (minutes > 0) parts.push(`${minutes} perc`);
    return { dateLabel, expired: false, countdown: `${parts.join(" ")} múlva` };
  }
  if (minutes >= 1) return { dateLabel, expired: false, countdown: `${minutes} perc múlva` };
  return { dateLabel, expired: false, countdown: "kevesebb mint 1 perc múlva" };
}

/** Countdown derived from a persisted ISO due value (null-safe). */
export function countdownFromIso(dueIso: string | null | undefined, now: Date = new Date()): DueCountdown | null {
  if (!dueIso) return null;
  const parsed = new Date(dueIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDueCountdown(parsed, now);
}

/** Stable clock label helper for tests and display. */
export function isoOf(moment: Date): string {
  return `${moment.getFullYear()}-${two(moment.getMonth() + 1)}-${two(moment.getDate())}T${two(moment.getHours())}:${two(moment.getMinutes())}:${two(moment.getSeconds())}`;
}
