import { fetchApi } from './api';

// Case-first time + billing preparation client. The compatibility scope is
// derived on the server from the Case, so the client never sends that id.

export type CaseTimeEntryInput = {
  caseId: string;
  taskId?: string;
  workType: string;
  description: string;
  minutes: number;
  workDate?: string;
};

export type CaseTimeEntry = {
  id: string;
  minutes: number;
  workDate: string;
  description: string;
  taskId: string | null;
  user?: { id: string; name: string | null } | null;
};

// Record time against a Case (optionally a Task). Case-first: the server derives
// the billing/compatibility scope; the UI never supplies a Matter identifier.
export async function recordCaseTime(input: CaseTimeEntryInput): Promise<CaseTimeEntry> {
  const body: Record<string, unknown> = {
    caseId: input.caseId,
    workType: input.workType,
    description: input.description,
    minutes: input.minutes,
  };
  if (input.taskId) body.taskId = input.taskId;
  if (input.workDate) body.workDate = input.workDate;
  return fetchApi<CaseTimeEntry>('/time-entries', { method: 'POST', body: JSON.stringify(body) });
}

export type CaseBillingPreparation = {
  caseId: string;
  billableMinutes: number;
  nonBillableMinutes: number;
  needsReviewMinutes: number;
  attributedMinutes: number;
  byLawyer: Array<{ lawyerId: string; lawyerName: string | null; billableMinutes: number; nonBillableMinutes: number }>;
  rateStatus: 'RATE_NOT_CONFIGURED';
  feeEstimate: null;
  billingReadiness: 'READY_FOR_BILLING' | 'NO_BILLABLE_TIME' | 'CASE_SCOPE_UNRESOLVED';
};

// Workforce-only internal billing preparation for a Case. Never shown to clients.
export async function getCaseBillingPreparation(caseId: string, period?: { startDate?: string; endDate?: string }): Promise<CaseBillingPreparation> {
  const params = new URLSearchParams();
  if (period?.startDate) params.set('startDate', period.startDate);
  if (period?.endDate) params.set('endDate', period.endDate);
  const query = params.toString();
  return fetchApi<CaseBillingPreparation>(`/billing-preparation/case/${encodeURIComponent(caseId)}${query ? `?${query}` : ''}`);
}

export function minutesToHours(minutes: number): string {
  return (minutes / 60).toLocaleString('hu-HU', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
