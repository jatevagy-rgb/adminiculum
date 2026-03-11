const HOLIDAYS_2026 = new Set([
  '2026-01-01', // Újév
  '2026-03-15', // Nemzeti ünnep
  '2026-04-03', // Nagypéntek
  '2026-04-06', // Húsvéthétfő
  '2026-05-01', // Munka ünnepe
  '2026-05-25', // Pünkösdhétfő
  '2026-08-20', // Államalapítás ünnepe
  '2026-10-23', // Nemzeti ünnep
  '2026-11-01', // Mindenszentek
  '2026-12-25', // Karácsony
  '2026-12-26', // Karácsony másnapja
]);

function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isHungarianHoliday(date: Date): boolean {
  return HOLIDAYS_2026.has(toIsoDate(date));
}

export function isBusinessDayHU(date: Date): boolean {
  return !isWeekend(date) && !isHungarianHoliday(date);
}

export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addBusinessDaysHU(date: Date, businessDays: number): Date {
  if (businessDays <= 0) return new Date(date);

  const result = new Date(date);
  let added = 0;

  while (added < businessDays) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (isBusinessDayHU(result)) {
      added += 1;
    }
  }

  return result;
}

