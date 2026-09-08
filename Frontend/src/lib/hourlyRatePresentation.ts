import type { EffectiveRate } from './hourlyRatesApi';

/** Display strings only; authoritative amounts remain decimal strings from the server. */
export function formatHourlyRate(value: string | null): string {
  if (value === null) return 'Nincs beállított óradíj';
  const [whole, fractional = ''] = value.split('.');
  const fraction = fractional.replace(/0+$/, '');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${fraction ? `,${fraction}` : ''} Ft/óra`;
}
export function rateSourceLabel(rate: EffectiveRate) {
  return rate.scope === 'CASE' ? 'Egyedi ügy óradíja' : rate.scope === 'CLIENT' ? 'Ügyfél alap óradíja' : 'Nincs alkalmazható óradíj';
}
export function rateToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
