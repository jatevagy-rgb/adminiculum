import type { BillingItem, BillingReviewStatus } from './billingPreparationsApi';

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
