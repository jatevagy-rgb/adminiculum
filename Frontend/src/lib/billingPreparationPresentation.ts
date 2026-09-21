import type { BillingItem, BillingPreparationSummary, BillingReviewStatus } from './billingPreparationsApi';

/** Display-only formatting; authoritative amounts arrive as decimal strings. */

export function formatNetAmount(value: string | null): string {
  if (value === null) return '—';
  const negative = value.startsWith('-');
  const [wholeRaw, fractional = ''] = (negative ? value.slice(1) : value).split('.');
  const whole = wholeRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fraction = fractional.padEnd(2, '0').replace(/0+$/, '');
  return `${negative ? '−' : ''}${whole}${fraction ? `,${fraction}` : ''} Ft`;
}

export function formatRate(value: string | null): string {
  if (value === null) return '—';
  const [whole, fractional = ''] = value.split('.');
  const fraction = fractional.replace(/0+$/, '');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${fraction ? `,${fraction}` : ''} Ft/óra`;
}

/** "ó:pp" style for minutes, e.g. 95 -> "1:35". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}:${String(rest).padStart(2, '0')}`;
}

export const reviewStatusLabel: Record<BillingReviewStatus, string> = {
  OK: 'Rendben',
  REVIEW_REQUIRED: 'Felülvizsgálat szükséges',
  NO_RATE: 'Nincs óradíj',
  NON_BILLABLE: 'Nem számlázható',
  ZERO_MINUTES: 'Nulla perc',
  STALE: 'Forrás megváltozott',
  SOURCE_MISSING: 'Forrás törölve',
};

export function rateScopeLabel(item: BillingItem): string {
  if (item.billing.rateOverride) return 'Egyedi számlázási óradíj';
  if (item.rate.scope === 'CASE') return 'Egyedi ügy óradíja';
  if (item.rate.scope === 'CLIENT') return 'Ügyfél alap óradíja';
  return 'Nincs óradíj';
}

export const NO_GROUP_LABEL = 'Ügyféli egység nélkül';

/** Group items by the client-side organization unit (never by internal Department). */
export function groupByOrganizationGroup(items: BillingItem[]): Array<{ name: string; items: BillingItem[] }> {
  const groups = new Map<string, BillingItem[]>();
  for (const item of items) {
    const name = item.source.organizationGroup?.name || NO_GROUP_LABEL;
    const bucket = groups.get(name) ?? [];
    bucket.push(item);
    groups.set(name, bucket);
  }
  return [...groups.entries()].map(([name, groupItems]) => ({ name, items: groupItems }));
}

/**
 * Budapest calendar timestamp for audit metadata, e.g. "2026. 09. 20. 14:35".
 * Built from formatToParts so the output is stable regardless of the runtime's
 * locale data; the backend keeps authoritative timestamps as ISO strings.
 */
export function formatBudapestDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  // "24" can appear for midnight in some hourCycle defaults; normalise to "00".
  const hour = value('hour') === '24' ? '00' : value('hour');
  return `${value('year')}. ${value('month')}. ${value('day')}. ${hour}:${value('minute')}`;
}

export type BillingPreparationPeriodGroup = {
  periodStart: string;
  periodEnd: string;
  /** The single OPEN preparation of the period, if any (backend invariant: at most one). */
  current: BillingPreparationSummary | null;
  /** Every CLOSED snapshot of the period, newest close first. Audit records are never collapsed away. */
  history: BillingPreparationSummary[];
};

/**
 * Presentation-only regrouping of the authoritative preparation list by
 * client+period. The backend deliberately allows several CLOSED preparations
 * for the same period (historical snapshots, one OPEN max), so identical-looking
 * rows are distinct records with distinct ids and timestamps — this helper keeps
 * every record reachable while making the current open one stand out.
 */
export function groupPreparationsByPeriod(preparations: BillingPreparationSummary[]): BillingPreparationPeriodGroup[] {
  const groups = new Map<string, BillingPreparationPeriodGroup>();
  const order: string[] = [];
  for (const prep of preparations) {
    const key = `${prep.periodStart}|${prep.periodEnd}`;
    let group = groups.get(key);
    if (!group) {
      group = { periodStart: prep.periodStart, periodEnd: prep.periodEnd, current: null, history: [] };
      groups.set(key, group);
      order.push(key);
    }
    // A repeated OPEN record would still be listed (never hidden); the first wins the badge.
    if (prep.status === 'OPEN' && group.current === null) group.current = prep;
    else group.history.push(prep);
  }
  for (const key of order) {
    const group = groups.get(key)!;
    group.history.sort((a, b) => closeInstant(b) - closeInstant(a));
  }
  return order.map((key) => groups.get(key)!);
}

function closeInstant(prep: BillingPreparationSummary): number {
  const stamp = prep.closedAt ?? prep.createdAt;
  const parsed = Date.parse(stamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}
