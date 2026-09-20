/**
 * Deterministic upcoming-deadline selection for the customer portal.
 *
 * The deadline block is user-facing, so "today" means the browser/user's LOCAL
 * calendar day. A date-only value (`2026-09-20`) is a literal calendar date and
 * never shifts by timezone. An ISO timestamp (`2026-09-20T23:30:00Z`) is an
 * instant, so it is converted to the user's local calendar day — the same day the
 * user sees it rendered as. Deriving the current day from `toISOString()` would
 * use the UTC calendar date and mis-classify deadlines around local midnight.
 *
 * Past values are deliberately left untouched by the caller: an overdue customer
 * action must keep appearing on its canonical Teendők / attention surface.
 */

export const UPCOMING_DEADLINE_LIMIT = 3;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The user's local calendar day (`YYYY-MM-DD`) for an instant, or null when invalid. */
export function localDayKey(date: Date): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The calendar day (`YYYY-MM-DD`) a value belongs to, or null when unusable.
 * Date-only values stay literal; timestamps use the local calendar day.
 */
export function deadlineDayKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  return localDayKey(new Date(trimmed));
}

/** True when the value's local day is today or in the future relative to `now`. */
export function isUpcomingDeadline(value: string | null | undefined, now: Date): boolean {
  const day = deadlineDayKey(value);
  const today = localDayKey(now);
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
