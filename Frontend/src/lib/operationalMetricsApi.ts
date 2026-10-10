import { fetchApi } from './api';

export type OperationalMetric = {
  metricKey: string; definitionVersion: string; scope: { clientId: string; visibility: 'AUTHORIZED_CASES' | 'OWN_AUTHORIZED_TIME_ENTRIES' };
  period: { from: string; to: string; timeZone: string }; value: number | null; unit: string;
  numerator: number | null; denominator: number | null; sampleCount: number; missingCount: number; basis: string;
  freshness: { calculatedAt: string; mode: string }; sourceRefs: { type: string; id: string; caseId: string }[]; limitations: string[];
};
export type OperationalMetricsResult = { items: OperationalMetric[]; unavailable: { metricKey: string; code: string; reason: string }[] };
export function getOperationalMetrics(clientId: string, from: string, to: string) {
  const query = new URLSearchParams({ from, to });
  return fetchApi<OperationalMetricsResult>(`/company-workspace/clients/${encodeURIComponent(clientId)}/metrics?${query}`, { authContext: 'workforce' });
}

export const OPERATIONAL_METRIC_LABELS: Record<string, string> = {
  RECORDED_EFFORT: 'Saját rögzített ráfordítás',
  CASE_CYCLE: 'Ügy átfutási ideje', RETURN_FREQUENCY: 'Visszaadott leadások aránya',
  REVIEW_QUEUE_AGE: 'Nyitott ellenőrzés kora', SUBMISSION_COMPLETION: 'Jóváhagyott leadások aránya',
};
