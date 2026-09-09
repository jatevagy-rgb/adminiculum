// Pure calendar-range helpers for the client calendar view. Extracted into a
// lib module so the date arithmetic is unit-testable without rendering.
import type { ClientCalendarItem } from "./clientCalendarApi";

export type ViewKey = "day" | "month" | "year" | "five-year";

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const parseKey = (key: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Item dates are ISO-8601 instants; the calendar groups by their UTC day. */
export const itemDayKey = (item: ClientCalendarItem) => item.date.slice(0, 10);

// Period stepping must land on the immediately adjacent period on a valid day.
// Raw setMonth/setFullYear overflow would skip months (Jan 31 + 1 month ->
// March 2/3), so the day-of-month clamps to the target month's last day.
export const shiftClamped = (date: Date, months: number): Date => {
  const day = date.getDate();
  const shifted = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return shifted;
};

export function rangeForView(view: ViewKey, anchor: Date): { from: string; to: string } {
  const y = anchor.getFullYear();
  if (view === "day") {
    const key = dateKey(anchor);
    return { from: key, to: key };
  }
  if (view === "month") {
    const from = new Date(y, anchor.getMonth(), 1);
    const to = new Date(y, anchor.getMonth() + 1, 0);
    return { from: dateKey(from), to: dateKey(to) };
  }
  if (view === "year") {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: `${y}-01-01`, to: `${y + 4}-12-31` };
}

export function stepAnchor(view: ViewKey, anchor: Date, direction: -1 | 1): Date {
  if (view === "day") {
    // Adjacent-day stepping rolls across month boundaries correctly on its own.
    const d = new Date(anchor);
    d.setDate(d.getDate() + direction);
    return d;
  }
  const months = view === "month" ? direction : view === "year" ? 12 * direction : 60 * direction;
  return shiftClamped(anchor, months);
}
