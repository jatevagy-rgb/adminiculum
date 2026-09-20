/**
 * Deterministic upcoming-deadline selection for the customer portal.
 *
 * A deadline is "upcoming" when its calendar day is today or later. Both date-only
 * values (`2026-09-20`) and ISO timestamps (`2026-09-20T12:00:00.000Z`) are keyed by
 * the literal date part of the value, so a same-day deadline is never pushed into
 * the past by a local/UTC timezone conversion.
 *
 * Past values are deliberately left untouched by the caller: an overdue customer
 * action must keep appearing on its canonical Teendők / attention surface.
 */

export const UPCOMING_DEADLINE_LIMIT = 3;

const DAY_KEY = /^(\d{4}-\d{2}-\d{2})/;

/** The calendar day (`YYYY-MM-DD`) a value belongs to, or null when unusable. */
export function deadlineDayKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = DAY_KEY.exec(value.trim());
  return match ? match[1] : null;
}

/** True when the value's day is today or in the future relative to `now`. */
export function isUpcomingDeadline(value: string | null | undefined, now: Date): boolean {
  const day = deadlineDayKey(value);
  const today = deadlineDayKey(now.toISOString());
  return day !== null && today !== null && day >= today;
}

/**
 * Keep only upcoming deadlines, order them ascending by day and cap the list.
 * Equal days keep their input order, so the result is deterministic.
 */
export function selectUpcomingDeadlines<T extends { dueAt: string | null }>(
  rows: readonly T[],
  now: Date,
  limit: number = UPCOMING_DEADLINE_LIMIT,
): T[] {
  return rows
    .filter((row) => isUpcomingDeadline(row.dueAt, now))
    .sort((a, b) => String(deadlineDayKey(a.dueAt)).localeCompare(String(deadlineDayKey(b.dueAt))))
    .slice(0, limit);
}
