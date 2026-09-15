/**
 * CUSTOMER PORTAL CALENDAR — pure projection.
 *
 * This module is deliberately free of Prisma, HTTP and authorization code. It
 * only turns ALREADY customer-safe source rows (published matter revisions,
 * published action requests, customer-visible requests, explicitly published
 * contract dates, ACHIEVED company milestones) into a customer-safe calendar.
 *
 * Hard rules carried from the internal calendar, but restricted to customer-safe
 * sources only:
 *  - No new persistence; read projection only.
 *  - A null/invalid source date produces NO item (never invent dates).
 *  - Only the allowlisted customer-safe categories below can ever be emitted;
 *    internal Task dueDate, Case.deadline and CaseIntakeDeadline are NOT
 *    representable here and have no category.
 *  - Stable, deterministic ordering.
 */

export const CUSTOMER_CALENDAR_CATEGORIES = [
  'MATTER_TARGET',
  'PUBLISHED_DEADLINE',
  'ACTION_REQUEST',
  'CUSTOMER_REQUEST',
  'CONTRACT_DATE',
  'COMPANY_MILESTONE',
] as const;

export type CustomerCalendarCategory = (typeof CUSTOMER_CALENDAR_CATEGORIES)[number];

export const CUSTOMER_CALENDAR_CATEGORY_LABELS: Record<CustomerCalendarCategory, string> = {
  MATTER_TARGET: 'Ügy célhatárideje',
  PUBLISHED_DEADLINE: 'Közzétett határidő',
  ACTION_REQUEST: 'Ügyintézési teendő',
  CUSTOMER_REQUEST: 'Adat- vagy dokumentumkérés',
  CONTRACT_DATE: 'Szerződés kulcsdátuma',
  COMPANY_MILESTONE: 'Vállalati mérföldkő',
};

/** OPEN = customer action expected; DONE = customer-visible but completed; INFO = informational date. */
export type CustomerCalendarStatus = 'OPEN' | 'DONE' | 'INFO';

export interface CustomerCalendarSourceItem {
  category: CustomerCalendarCategory;
  /** Stable customer-safe identity of the underlying record (never an internal Case/Task id). */
  sourceKey: string;
  title: string;
  /** ISO-8601 date/datetime, or null. Null source dates are dropped, never derived. */
  date: string | Date | null;
  status: CustomerCalendarStatus;
  /** Customer-safe portal destination. */
  href: string;
  matterTitle?: string | null;
}

export interface CustomerCalendarItem {
  id: string;
  category: CustomerCalendarCategory;
  categoryLabel: string;
  title: string;
  date: string;
  day: string;
  status: CustomerCalendarStatus;
  href: string;
  matterTitle: string | null;
}

export interface CustomerCalendarCategorySummary {
  key: CustomerCalendarCategory;
  label: string;
  count: number;
}

export interface CustomerCalendarCounts {
  total: number;
  open: number;
  overdue: number;
  dueToday: number;
  dueNext7Days: number;
  dueNext30Days: number;
}

export interface CustomerCalendarProjection {
  items: CustomerCalendarItem[];
  categories: CustomerCalendarCategorySummary[];
  counts: CustomerCalendarCounts;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a stored date/datetime into an ISO string. Returns null for
 * missing/invalid values so callers can omit the item (never invent a date).
 */
export function normalizeSourceDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const raw = String(value).trim();
  if (!raw) return null;
  if (ISO_DAY.test(raw)) return `${raw}T00:00:00.000Z`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function calendarDay(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(day: string, days: number): string {
  const base = new Date(`${day}T00:00:00.000Z`);
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Build the customer calendar projection for an inclusive [from, to] day range.
 * `today` is the authoritative server day (YYYY-MM-DD) used for KPI buckets.
 * Items outside the range are dropped; null/invalid dates are dropped.
 */
export function buildCustomerCalendar(
  sources: CustomerCalendarSourceItem[],
  range: { from: string; to: string; today: string },
): CustomerCalendarProjection {
  const categoryOrder = new Map(CUSTOMER_CALENDAR_CATEGORIES.map((category, index) => [category, index]));
  const seen = new Set<string>();
  const items: CustomerCalendarItem[] = [];

  for (const source of sources) {
    const iso = normalizeSourceDate(source.date);
    if (!iso) continue;
    const day = calendarDay(iso);
    if (day < range.from || day > range.to) continue;
    const id = `${source.category}:${source.sourceKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      category: source.category,
      categoryLabel: CUSTOMER_CALENDAR_CATEGORY_LABELS[source.category],
      title: source.title,
      date: iso,
      day,
      status: source.status,
      href: source.href,
      matterTitle: source.matterTitle ?? null,
    });
  }

  items.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    const left = categoryOrder.get(a.category) ?? 0;
    const right = categoryOrder.get(b.category) ?? 0;
    if (left !== right) return left - right;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });

  const today = range.today;
  const plus7 = addDays(today, 7);
  const plus30 = addDays(today, 30);

  let open = 0;
  let overdue = 0;
  let dueToday = 0;
  let dueNext7Days = 0;
  let dueNext30Days = 0;
  const perCategory = new Map<CustomerCalendarCategory, number>();

  for (const item of items) {
    perCategory.set(item.category, (perCategory.get(item.category) ?? 0) + 1);
    if (item.status !== 'OPEN') continue;
    open += 1;
    if (item.day < today) overdue += 1;
    else if (item.day === today) dueToday += 1;
    else if (item.day <= plus7) dueNext7Days += 1;
    else if (item.day <= plus30) dueNext30Days += 1;
  }

  const categories = CUSTOMER_CALENDAR_CATEGORIES
    .filter((category) => (perCategory.get(category) ?? 0) > 0)
    .map((category) => ({ key: category, label: CUSTOMER_CALENDAR_CATEGORY_LABELS[category], count: perCategory.get(category) as number }));

  return {
    items,
    categories,
    counts: { total: items.length, open, overdue, dueToday, dueNext7Days, dueNext30Days },
  };
}
