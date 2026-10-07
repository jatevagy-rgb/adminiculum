export const BUSINESS_TIME_ZONE = 'Europe/Budapest';
export type DeadlineTemporalType = 'DATE_ONLY' | 'TIMESTAMP';

export function businessDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

/** Calendar-only values retain their literal day; timestamps use business time. */
export function formatDeadline(value?: string | null, type: DeadlineTemporalType = 'TIMESTAMP'): string {
  if (!value) return '—';
  if (type === 'DATE_ONLY') {
    const day = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—';
    const parsed = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return '—';
    return `${day.replaceAll('-', '.')}.`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('hu-HU', {
    timeZone: BUSINESS_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short',
  });
}

export function businessDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function businessDateTimeToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Invalid business date');
  const desired = new Date(`${local}:00.000Z`).getTime();
  let candidate = desired;
  for (let i = 0; i < 3; i += 1) {
    const displayed = new Date(`${businessDateTimeInput(new Date(candidate).toISOString())}:00.000Z`).getTime();
    candidate += desired - displayed;
  }
  const result = new Date(candidate).toISOString();
  if (businessDateTimeInput(result) !== local) throw new Error('Nonexistent business time');
  return result;
}
