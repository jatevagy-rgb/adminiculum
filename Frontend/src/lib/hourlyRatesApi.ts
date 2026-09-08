import { fetchApi } from './api';

export type RateScope = { clientId: string; caseId?: string };
export type RateMode = 'EXPLICIT_RATE' | 'INHERIT_CLIENT';
export type EffectiveRate = {
  status: 'RESOLVED' | 'UNRESOLVED'; currency: string; hourlyRate: string | null;
  scope: 'CASE' | 'CLIENT' | 'UNRESOLVED'; rateVersionId: string | null; effectiveFrom: string | null;
  caseMode: RateMode; caseVersionId: string | null;
};
export type RateHistory = {
  asOf: string; canManage: boolean; effective: EffectiveRate;
  next: { date: string; effective: EffectiveRate } | null;
  history: Array<{ id: string; mode: RateMode; hourlyRate: string | null; currency: string; effectiveFrom: string; createdById: string; createdAt: string }>;
};
export type AppendRateInput = { effectiveFrom: string; currency: 'HUF'; mode: RateMode; hourlyRate: string | null };

export function ratePath(scope: RateScope) {
  return `/hourly-rates/clients/${encodeURIComponent(scope.clientId)}${scope.caseId ? `/cases/${encodeURIComponent(scope.caseId)}` : ''}`;
}
export function getHourlyRates(scope: RateScope) { return fetchApi<RateHistory>(ratePath(scope), { cache: 'no-store' }); }
export function appendHourlyRate(scope: RateScope, body: AppendRateInput) {
  return fetchApi(ratePath(scope), { method: 'POST', body: JSON.stringify(body) });
}
