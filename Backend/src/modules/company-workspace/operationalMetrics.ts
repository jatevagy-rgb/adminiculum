import { InteractionError } from '../client-interaction/base';
import { addCalendarDays, businessDateKey, businessDayStart, BUSINESS_TIME_ZONE } from '../agenda/businessTime';

export const OPERATIONAL_METRICS = {
  RECORDED_EFFORT: { label: 'Saját rögzített ráfordítás', unit: 'RECORDED_LABOUR_MINUTES', definition: 'Saját, közvetlenül ügyhöz kötött TimeEntry percek összege workDate szerint; nem irodai összesítés.' },
  CASE_CYCLE: { label: 'Ügy átfutási ideje', unit: 'ELAPSED_MINUTES', definition: 'A nem törölt, lezárási időponttal rendelkező ügyek receivedAt→completedAt átlaga; lezárás szerinti időszak. Lezárási idő nélkül az ügy nem rendelhető a lezárási időszakhoz.' },
  RETURN_FREQUENCY: { label: 'Visszaadott leadások aránya', unit: 'RATIO', definition: 'Az időszakban leadott, döntéssel rendelkező revíziók közül returnedAt időponttal rendelkezők aránya.' },
  REVIEW_QUEUE_AGE: { label: 'Nyitott ellenőrzés kora', unit: 'ELAPSED_MINUTES', definition: 'Az időszakban leadott, jelenleg SUBMITTED revíziók submittedAt→lekérdezés átlaga.' },
  SUBMISSION_COMPLETION: { label: 'Jóváhagyott leadások aránya', unit: 'RATIO', definition: 'Az időszakban leadott revíziók közül approvedAt időponttal rendelkezők aránya; revízió, nem feladat.' },
} as const;
export type OperationalMetricKey = keyof typeof OPERATIONAL_METRICS;
export type MetricPeriod = { from: string; to: string; timeZone: typeof BUSINESS_TIME_ZONE };
export type MetricSource = { type: 'Case' | 'TaskSubmission' | 'TimeEntry'; id: string; caseId: string };
export type MetricDto = {
  metricKey: OperationalMetricKey | 'RECORDED_EFFORT'; definitionVersion: '1'; scope: { clientId: string; visibility: 'AUTHORIZED_CASES' | 'OWN_AUTHORIZED_TIME_ENTRIES' };
  period: MetricPeriod; value: number | null; unit: string; numerator: number | null; denominator: number | null;
  sampleCount: number; missingCount: number; basis: 'RECORDED_TIMESTAMPS' | 'RECORDED_TIME_ENTRIES' | 'NO_RECORDED_SAMPLE';
  freshness: { calculatedAt: string; mode: 'READ_SNAPSHOT' }; sourceRefs: MetricSource[]; limitations: string[];
};

export function calculateRecordedEffort(clientId: string, period: MetricPeriod, entries: { id: string; caseId: string | null; minutes: number }[], now: Date): MetricDto {
  const unique = [...new Map(entries.map(row => [row.id, row])).values()];
  const valid = unique.filter(row => row.caseId && Number.isInteger(row.minutes) && row.minutes >= 0);
  const total = valid.reduce((sum, row) => sum + row.minutes, 0);
  return {
    metricKey: 'RECORDED_EFFORT', definitionVersion: '1', scope: { clientId, visibility: 'OWN_AUTHORIZED_TIME_ENTRIES' }, period,
    value: valid.length ? total : null, unit: 'RECORDED_LABOUR_MINUTES', numerator: valid.length ? total : null, denominator: null,
    sampleCount: valid.length, missingCount: unique.length - valid.length, basis: valid.length ? 'RECORDED_TIME_ENTRIES' : 'NO_RECORDED_SAMPLE',
    freshness: { calculatedAt: now.toISOString(), mode: 'READ_SNAPSHOT' },
    sourceRefs: valid.slice(0, 100).map(row => ({ type: 'TimeEntry', id: row.id, caseId: row.caseId! })),
    limitations: ['Csak a saját, engedélyezett ügyhöz közvetlenül kötött munkaidő-bejegyzések, workDate szerint.', 'A nulla kizárólag rögzített nulla értékből adódhat; bejegyzés hiányában nincs ismert ráfordítás.', 'A kézzel rögzített idő nem automatikusan mért idő. Nincs munkatársi összesítés vagy teljes irodai ráfordítási állítás.', ...(valid.length > 100 ? ['Legfeljebb 100 forráshivatkozás; az összes mintát tartalmazó összeg.'] : [])],
  };
}
export type CaseMetricRow = { id: string; receivedAt: Date; completedAt: Date | null };
export type SubmissionMetricRow = { id: string; task: { caseId: string }; status: string; submittedAt: Date | null; returnedAt: Date | null; approvedAt: Date | null };

export function metricPeriod(from: unknown, to: unknown, now = new Date()): MetricPeriod {
  const end = to === undefined ? businessDateKey(now) : String(to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(Date.parse(`${end}T12:00:00Z`))) throw new InteractionError(400, 'METRIC_PERIOD_INVALID', 'Érvényes naptári időszak szükséges.');
  const start = from === undefined ? addCalendarDays(end, -29) : String(from);
  for (const day of [start, end]) {
    const parsed = new Date(`${day}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
      throw new InteractionError(400, 'METRIC_PERIOD_INVALID', 'Érvényes naptári időszak szükséges.');
    }
  }
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (days < 0 || days > 365) throw new InteractionError(400, 'METRIC_PERIOD_INVALID', 'Az időszak legfeljebb 366 nap lehet.');
  return { from: start, to: end, timeZone: BUSINESS_TIME_ZONE };
}

export function periodBounds(period: MetricPeriod) {
  return { gte: businessDayStart(period.from), lt: businessDayStart(addCalendarDays(period.to, 1)) };
}

export function calculateOperationalMetric(key: Exclude<OperationalMetricKey, 'RECORDED_EFFORT'>, clientId: string, period: MetricPeriod, cases: CaseMetricRow[], submissions: SubmissionMetricRow[], now: Date): MetricDto {
  const refs: MetricSource[] = [];
  let missing = 0;
  let numerator = 0;
  let denominator = 0;
  const invalidDuration = (start: Date | null, end: Date | null) => !start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start || end > now;
  if (key === 'CASE_CYCLE') {
    for (const row of new Map(cases.map(row => [row.id, row])).values()) {
      if (invalidDuration(row.receivedAt, row.completedAt)) { missing++; continue; }
      numerator += (row.completedAt!.getTime() - row.receivedAt.getTime()) / 60000;
      denominator++;
      refs.push({ type: 'Case', id: row.id, caseId: row.id });
    }
  } else {
    for (const row of new Map(submissions.map(row => [row.id, row])).values()) {
      if (key === 'REVIEW_QUEUE_AGE' && row.status !== 'SUBMITTED') continue;
      if (!row.submittedAt || invalidDuration(row.submittedAt, now)) { missing++; continue; }
      if ((row.status === 'APPROVED' && !row.approvedAt) || (row.status === 'RETURNED' && !row.returnedAt) || (row.status === 'SUBMITTED' && (row.returnedAt || row.approvedAt)) || (row.status === 'APPROVED' && row.returnedAt) || (row.status === 'RETURNED' && row.approvedAt)) { missing++; continue; }
      if (key === 'REVIEW_QUEUE_AGE') {
        numerator += (now.getTime() - row.submittedAt.getTime()) / 60000;
      } else {
        const decision = row.returnedAt || row.approvedAt;
        if (key === 'RETURN_FREQUENCY' && !decision) { missing++; continue; }
        if ((row.returnedAt && invalidDuration(row.submittedAt, row.returnedAt)) || (row.approvedAt && invalidDuration(row.submittedAt, row.approvedAt)) || (row.returnedAt && row.approvedAt)) { missing++; continue; }
        numerator += key === 'RETURN_FREQUENCY' ? Number(Boolean(row.returnedAt)) : Number(Boolean(row.approvedAt));
      }
      denominator++;
      refs.push({ type: 'TaskSubmission', id: row.id, caseId: row.task.caseId });
    }
  }
  return {
    metricKey: key, definitionVersion: '1', scope: { clientId, visibility: 'AUTHORIZED_CASES' }, period,
    value: denominator ? numerator / denominator : null, unit: OPERATIONAL_METRICS[key].unit,
    numerator: denominator ? numerator : null, denominator: denominator || null, sampleCount: denominator, missingCount: missing,
    basis: denominator ? 'RECORDED_TIMESTAMPS' : 'NO_RECORDED_SAMPLE', freshness: { calculatedAt: now.toISOString(), mode: 'READ_SNAPSHOT' },
    sourceRefs: refs.slice(0, 100),
    limitations: [OPERATIONAL_METRICS[key].definition, 'Csak az olvasó számára elérhető ügyek. Nem teljes irodai mutató.', 'Az eltelt idő nem munkaidő. Az időbélyegek a jelenleg rögzített állapotot tükrözik.', ...(missing ? ['Hiányos, jövőbeli vagy ellentmondó időbélyegek kizárva.'] : []), ...(refs.length > 100 ? ['Legfeljebb 100 forráshivatkozás látható; a számítás az összes jelzett mintát tartalmazza.'] : [])],
  };
}
