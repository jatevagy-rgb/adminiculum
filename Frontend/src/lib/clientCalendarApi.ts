import { fetchApi } from './api';

// Read-only client calendar projection — GET /api/v1/client-calendar/clients/:clientId.
// Every item is a canonical stored date (contract, obligation, entitlement,
// company milestone, case deadline, task due date, intake deadline). No invented
// dates: a null source date produces no item.

export type ClientCalendarSourceType =
  | 'CONTRACT'
  | 'OBLIGATION'
  | 'ENTITLEMENT'
  | 'COMPANY_MILESTONE'
  | 'CASE_DEADLINE'
  | 'TASK'
  | 'CASE_INTAKE_DEADLINE';

export type ClientCalendarDateKind =
  | 'SIGNATURE'
  | 'EFFECTIVE'
  | 'EXPIRY'
  | 'CRITICAL_DATE'
  | 'NEXT_DUE'
  | 'EXERCISE_BY'
  | 'TARGET_DATE'
  | 'MILESTONE_DATE'
  | 'DEADLINE'
  | 'DUE_DATE'
  | 'INTAKE_DUE';

export type ClientCalendarItem = {
  id: string;
  sourceType: ClientCalendarSourceType;
  sourceId: string;
  dateKind: ClientCalendarDateKind;
  title: string;
  date: string; // ISO-8601
  status?: string | null;
  caseId?: string;
  contractId?: string;
};

export type ClientCalendarResponse = {
  clientId: string;
  from: string;
  to: string;
  items: ClientCalendarItem[];
};

export async function getClientCalendar(clientId: string, range: { from: string; to: string }): Promise<ClientCalendarResponse> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  return fetchApi<ClientCalendarResponse>(`/client-calendar/clients/${encodeURIComponent(clientId)}?${params.toString()}`);
}
