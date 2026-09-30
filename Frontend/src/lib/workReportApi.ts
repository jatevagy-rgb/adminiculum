import { fetchApi, fetchApiBlob } from './api';

/**
 * Rate-free client work-report API contract.
 *
 * The backend projection deliberately carries no hourly rate, rate version,
 * monetary amount, VAT, billing adjustment, or invoice data. The frontend must
 * never add such fields; it only renders the allowlisted report facts.
 */

export type WorkReportAttributionKind = 'EXACT_CASE' | 'TASK_DERIVED_CASE' | 'MATTER_ONLY' | 'AMBIGUOUS';

export interface WorkReportRow {
  timeEntryId: string;
  workDate: string;
  workerName: string | null;
  workType: string;
  workTypeLabel: string;
  description: string;
  minutes: number;
  hours: number;
  attributionKind: WorkReportAttributionKind;
  requesterName: string | null;
  requesterJobTitle: string | null;
  organizationGroupName: string | null;
  departmentName: string | null;
  taskTitle: string | null;
}

export interface WorkReportSafeUpdate {
  title: string;
  body: string;
  category: string;
  categoryLabel: string;
  publishedAt: string | null;
}

export interface WorkReportPeriod {
  startDate: string | null;
  endDate: string | null;
}

export interface ClientWorkReportCaseListItem {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  caseStatus: string;
  caseStatusLabel: string;
  isClosed: boolean;
  completedAt: string | null;
  matter: { id: string; title: string } | null;
  responsibleLawyerName: string | null;
  recordedMinutes: number;
  recordedEntryCount: number;
  ambiguousMinutes: number;
  ambiguousEntryCount: number;
  excludedMinutes: number;
  excludedEntryCount: number;
  zeroTime: boolean;
}

export interface ClientWorkReportCasesResponse {
  kind: 'CLIENT_WORK_REPORT_CASES_V1';
  client: { id: string; name: string };
  period: WorkReportPeriod;
  cases: ClientWorkReportCaseListItem[];
  generatedAt: string;
}

export interface ClientWorkReport {
  kind: 'CLIENT_WORK_REPORT_V1';
  client: { id: string; name: string };
  period: WorkReportPeriod;
  case: {
    caseId: string;
    caseNumber: string;
    caseTitle: string;
    caseStatus: string;
    caseStatusLabel: string;
    isClosed: boolean;
    completedAt: string | null;
    matter: { id: string; title: string } | null;
    responsibleLawyerName: string | null;
    requesterNames: string[];
    organizationGroupNames: string[];
    departmentNames: string[];
    workerNames: string[];
    recordedMinutes: number;
    recordedEntryCount: number;
    ambiguousMinutes: number;
    ambiguousEntryCount: number;
    excludedMinutes: number;
    excludedEntryCount: number;
    zeroTime: boolean;
  };
  rows: WorkReportRow[];
  ambiguousRows: WorkReportRow[];
  excludedRows: WorkReportRow[];
  safeUpdates: WorkReportSafeUpdate[];
  generatedAt: string;
}

export interface WorkReportPeriodQuery {
  startDate?: string;
  endDate?: string;
}

function periodParams(period?: WorkReportPeriodQuery): string {
  const params = new URLSearchParams();
  if (period?.startDate) params.set('startDate', period.startDate);
  if (period?.endDate) params.set('endDate', period.endDate);
  const suffix = params.toString();
  return suffix ? `?${suffix}` : '';
}

export function listWorkReportCases(clientId: string, period?: WorkReportPeriodQuery): Promise<ClientWorkReportCasesResponse> {
  return fetchApi<ClientWorkReportCasesResponse>(`/work-reports/cases?clientId=${encodeURIComponent(clientId)}${periodParams(period).replace('?', '&')}`);
}

export function getWorkReportCase(caseId: string, period?: WorkReportPeriodQuery): Promise<ClientWorkReport> {
  return fetchApi<ClientWorkReport>(`/work-reports/cases/${encodeURIComponent(caseId)}${periodParams(period)}`);
}

export function downloadWorkReportPdf(caseId: string, period?: WorkReportPeriodQuery): Promise<{ blob: Blob; filename: string | null }> {
  return fetchApiBlob(`/work-reports/cases/${encodeURIComponent(caseId)}/pdf${periodParams(period)}`);
}
