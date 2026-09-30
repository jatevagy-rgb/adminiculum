// ============================================================================
// WORK REPORTS — rate-free client work-report service.
// ============================================================================
//
// Builds an allowlisted, rate-free projection over TimeEntry facts plus the
// canonical provenance chain (Task.requestedByOrganizationPerson →
// OrganizationPerson → ClientOrganizationGroup) and published ClientSafeUpdate
// rows. It never reads HourlyRateVersion, BillingPreparationItem money fields,
// InvoiceDraft lines, or any billing adjustment.
//
// Bucket semantics (RECORDED / AMBIGUOUS / EXCLUDED / ZERO_TIME):
//   RECORDED  — attributed to the case (EXACT_CASE | TASK_DERIVED_CASE) and
//               billable. These rows form the report detail and total.
//   AMBIGUOUS — in scope but not provably this case (MATTER_ONLY | AMBIGUOUS,
//               resolvedCaseId === null). Shown separately, never summed.
//   EXCLUDED  — attributed to the case but billable=false (internal work).
//               Shown separately, never summed.
//   ZERO_TIME — no rows in any bucket.
// ============================================================================

import { resolveTimeEntryAttribution } from '../../routes/timeEntries';
import { buildCaseReadScope } from '../cases/authorization';
import {
  CASE_STATUS_LABELS,
  CLIENT_WORK_REPORT_CASES_KIND,
  CLIENT_WORK_REPORT_KIND,
  CLOSED_CASE_STATUSES,
  SAFE_UPDATE_CATEGORY_LABELS,
  WORK_TYPE_LABELS,
  type ClientWorkReport,
  type ClientWorkReportCaseListItem,
  type ClientWorkReportCasesResponse,
  type ClientWorkReportCaseSummary,
  type ClientWorkReportPeriod,
  type WorkReportRow,
  type WorkReportSafeUpdate,
} from './types';

type ReportCaseRecord = {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  completedAt: Date | null;
  matterId: string | null;
  client: { id: string; name: string } | null;
  matter: { id: string; title: string } | null;
  assignedLawyer: { id: string; name: string } | null;
};

const CASE_SELECT = {
  id: true,
  caseNumber: true,
  title: true,
  status: true,
  completedAt: true,
  matterId: true,
  client: { select: { id: true, name: true } },
  matter: { select: { id: true, title: true } },
  assignedLawyer: { select: { id: true, name: true } },
};

export const CASE_ENTRY_INCLUDE = {
  matter: {
    select: {
      id: true,
      title: true,
      cases: { select: { id: true } },
    },
  },
  user: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  task: {
    select: {
      id: true,
      title: true,
      caseId: true,
      matterId: true,
      workPackageItem: { select: { caseWorkPackage: { select: { caseId: true } } } },
      requestedByOrganizationPerson: {
        select: {
          id: true,
          name: true,
          jobTitle: true,
          organizationGroup: { select: { id: true, name: true } },
        },
      },
    },
  },
};

export interface WorkReportPeriod {
  startDate: Date | null;
  endDate: Date | null;
  dto: ClientWorkReportPeriod;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parsePeriodQuery(query: Record<string, unknown>): WorkReportPeriod | { invalid: true } {
  const startRaw = query.startDate ? String(query.startDate).trim() : '';
  const endRaw = query.endDate ? String(query.endDate).trim() : '';
  const startDate = startRaw ? parseDay(startRaw) : null;
  const endDate = endRaw ? parseDay(endRaw) : null;
  if ((startRaw && !startDate) || (endRaw && !endDate)) return { invalid: true };
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) return { invalid: true };
  return {
    startDate,
    endDate,
    dto: { startDate: startRaw || null, endDate: endRaw || null },
  };
}

function parseDay(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toIsoDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function periodWorkDateFilter(period: { startDate: Date | null; endDate: Date | null }): any {
  const filter: any = {};
  if (period.startDate) filter.gte = period.startDate;
  if (period.endDate) filter.lte = period.endDate;
  return Object.keys(filter).length ? filter : undefined;
}

function entryScopeForCase(caseId: string): any {
  return {
    OR: [
      { caseId },
      { task: { caseId } },
      { matter: { cases: { some: { id: caseId } } } },
    ],
  };
}

function entryScopeForClient(clientId: string): any {
  return {
    OR: [
      { case: { clientId } },
      { matter: { clientId } },
      { task: { case: { clientId } } },
    ],
  };
}

function distinct(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function sortRows(rows: WorkReportRow[]): WorkReportRow[] {
  return rows.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.timeEntryId.localeCompare(b.timeEntryId));
}

interface Buckets {
  recordedRows: WorkReportRow[];
  ambiguousRows: WorkReportRow[];
  excludedRows: WorkReportRow[];
}

function toRow(entry: any, attributionKind: WorkReportRow['attributionKind']): WorkReportRow {
  const requester = entry.task?.requestedByOrganizationPerson ?? null;
  return {
    timeEntryId: entry.id,
    workDate: toIsoDate(entry.workDate) ?? '',
    workerName: entry.user?.name ?? null,
    workType: entry.workType,
    workTypeLabel: WORK_TYPE_LABELS[entry.workType] ?? entry.workType,
    description: entry.description ?? '',
    minutes: entry.minutes,
    hours: Math.round((entry.minutes / 60) * 100) / 100,
    attributionKind,
    requesterName: requester?.name ?? null,
    requesterJobTitle: requester?.jobTitle ?? null,
    organizationGroupName: requester?.organizationGroup?.name ?? null,
    departmentName: entry.department?.name ?? null,
    taskTitle: entry.task?.title ?? null,
  };
}

/** Buckets entries strictly against one case. Never guesses ambiguous time. */
export function bucketCaseEntries(caseRecord: { id: string; matterId: string | null }, entries: any[]): Buckets {
  const recordedRows: WorkReportRow[] = [];
  const ambiguousRows: WorkReportRow[] = [];
  const excludedRows: WorkReportRow[] = [];
  for (const entry of entries) {
    const resolved = resolveTimeEntryAttribution(entry);
    if (resolved.resolvedCaseId === caseRecord.id && (resolved.attributionKind === 'EXACT_CASE' || resolved.attributionKind === 'TASK_DERIVED_CASE')) {
      if (entry.billable) {
        recordedRows.push(toRow(entry, resolved.attributionKind));
      } else {
        excludedRows.push(toRow(entry, resolved.attributionKind));
      }
      continue;
    }
    // Resolved to a different case — that row belongs to the other case's report.
    if (resolved.resolvedCaseId !== null) continue;
    // Unresolvable, but scoped to this case through caseId/task/matter membership.
    if (entry.matterId === caseRecord.matterId || entry.caseId === caseRecord.id || entry.task?.caseId === caseRecord.id) {
      ambiguousRows.push(toRow(entry, resolved.attributionKind));
    }
  }
  return {
    recordedRows: sortRows(recordedRows),
    ambiguousRows: sortRows(ambiguousRows),
    excludedRows: sortRows(excludedRows),
  };
}

function summarize(
  caseRecord: ReportCaseRecord,
  buckets: Pick<Buckets, 'recordedRows' | 'ambiguousRows' | 'excludedRows'>,
): ClientWorkReportCaseSummary {
  const recordedMinutes = buckets.recordedRows.reduce((sum, row) => sum + row.minutes, 0);
  const ambiguousMinutes = buckets.ambiguousRows.reduce((sum, row) => sum + row.minutes, 0);
  const excludedMinutes = buckets.excludedRows.reduce((sum, row) => sum + row.minutes, 0);
  return {
    caseId: caseRecord.id,
    caseNumber: caseRecord.caseNumber,
    caseTitle: caseRecord.title,
    caseStatus: caseRecord.status,
    caseStatusLabel: CASE_STATUS_LABELS[caseRecord.status] ?? caseRecord.status,
    isClosed: CLOSED_CASE_STATUSES.includes(caseRecord.status),
    completedAt: toIsoDate(caseRecord.completedAt),
    matter: caseRecord.matter ? { id: caseRecord.matter.id, title: caseRecord.matter.title } : null,
    responsibleLawyerName: caseRecord.assignedLawyer?.name ?? null,
    requesterNames: distinct(buckets.recordedRows.map((row) => row.requesterName)),
    organizationGroupNames: distinct(buckets.recordedRows.map((row) => row.organizationGroupName)),
    departmentNames: distinct(buckets.recordedRows.map((row) => row.departmentName)),
    workerNames: distinct(buckets.recordedRows.map((row) => row.workerName)),
    recordedMinutes,
    recordedEntryCount: buckets.recordedRows.length,
    ambiguousMinutes,
    ambiguousEntryCount: buckets.ambiguousRows.length,
    excludedMinutes,
    excludedEntryCount: buckets.excludedRows.length,
    zeroTime: buckets.recordedRows.length === 0 && buckets.ambiguousRows.length === 0 && buckets.excludedRows.length === 0,
  };
}

function toListItem(caseRecord: ReportCaseRecord, buckets: Pick<Buckets, 'recordedRows' | 'ambiguousRows' | 'excludedRows'>): ClientWorkReportCaseListItem {
  const summary = summarize(caseRecord, buckets);
  return {
    caseId: summary.caseId,
    caseNumber: summary.caseNumber,
    caseTitle: summary.caseTitle,
    caseStatus: summary.caseStatus,
    caseStatusLabel: summary.caseStatusLabel,
    isClosed: summary.isClosed,
    completedAt: summary.completedAt,
    matter: summary.matter,
    responsibleLawyerName: summary.responsibleLawyerName,
    recordedMinutes: summary.recordedMinutes,
    recordedEntryCount: summary.recordedEntryCount,
    ambiguousMinutes: summary.ambiguousMinutes,
    ambiguousEntryCount: summary.ambiguousEntryCount,
    excludedMinutes: summary.excludedMinutes,
    excludedEntryCount: summary.excludedEntryCount,
    zeroTime: summary.zeroTime,
  };
}

async function loadSafeUpdates(db: any, caseId: string): Promise<WorkReportSafeUpdate[]> {
  const updates = await db.clientSafeUpdate.findMany({
    where: { caseId, status: 'PUBLISHED' },
    orderBy: { publishedAt: 'asc' },
    select: { title: true, body: true, category: true, status: true, publishedAt: true },
  });
  // Defensive allowlist: only rows that are themselves published may leave the
  // server, even if a data layer returns broader results.
  return (updates as any[])
    .filter((update) => update.status === 'PUBLISHED')
    .map((update) => ({
      title: update.title,
      body: update.body,
      category: update.category,
      categoryLabel: SAFE_UPDATE_CATEGORY_LABELS[update.category] ?? update.category,
      publishedAt: toIsoDate(update.publishedAt),
    }));
}

/**
 * Lists client cases eligible for the work report: every closed case is kept
 * even with zero time, plus every case that has any in-period work in scope.
 */
export async function listReportCases(
  db: any,
  input: { clientId: string; period: WorkReportPeriod; viewer: { userId: string | null; role: string | null } },
): Promise<ClientWorkReportCasesResponse | null> {
  const client = await db.client.findUnique({ where: { id: input.clientId }, select: { id: true, name: true } });
  if (!client) return null;

  const readScope = buildCaseReadScope(input.viewer.userId, input.viewer.role);
  const caseWhere: any = { clientId: input.clientId };
  if (readScope) caseWhere.AND = [readScope];

  const cases = await db.case.findMany({ where: caseWhere, select: CASE_SELECT });
  const entriesWhere: any = { AND: [entryScopeForClient(input.clientId)] };
  const workDateFilter = periodWorkDateFilter(input.period);
  if (workDateFilter) entriesWhere.AND.push({ workDate: workDateFilter });
  const entries = await db.timeEntry.findMany({
    where: entriesWhere,
    include: CASE_ENTRY_INCLUDE,
    orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
  });

  const items: ClientWorkReportCaseListItem[] = [];
  for (const caseRecord of cases) {
    const buckets = bucketCaseEntries(caseRecord, entries);
    const isClosed = CLOSED_CASE_STATUSES.includes(caseRecord.status);
    if (!isClosed && buckets.recordedRows.length === 0 && buckets.ambiguousRows.length === 0 && buckets.excludedRows.length === 0) {
      continue;
    }
    items.push(toListItem(caseRecord, buckets));
  }
  items.sort((a, b) => Number(a.isClosed) - Number(b.isClosed) || b.recordedMinutes - a.recordedMinutes || a.caseNumber.localeCompare(b.caseNumber));

  return {
    kind: CLIENT_WORK_REPORT_CASES_KIND,
    client: { id: client.id, name: client.name },
    period: input.period.dto,
    cases: items,
    generatedAt: new Date().toISOString(),
  };
}

/** Builds the full rate-free report for one case. Returns null when the case is missing. */
export async function buildCaseReport(
  db: any,
  input: { caseId: string; period: WorkReportPeriod },
): Promise<ClientWorkReport | null> {
  const caseRecord = await db.case.findUnique({ where: { id: input.caseId }, select: CASE_SELECT });
  if (!caseRecord || !caseRecord.client) return null;

  const entriesWhere: any = { AND: [entryScopeForCase(input.caseId)] };
  const workDateFilter = periodWorkDateFilter(input.period);
  if (workDateFilter) entriesWhere.AND.push({ workDate: workDateFilter });
  const entries = await db.timeEntry.findMany({
    where: entriesWhere,
    include: CASE_ENTRY_INCLUDE,
    orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
  });

  const buckets = bucketCaseEntries(caseRecord, entries);
  const safeUpdates = await loadSafeUpdates(db, input.caseId);

  return {
    kind: CLIENT_WORK_REPORT_KIND,
    client: { id: caseRecord.client.id, name: caseRecord.client.name },
    period: input.period.dto,
    case: summarize(caseRecord, buckets),
    rows: buckets.recordedRows,
    ambiguousRows: buckets.ambiguousRows,
    excludedRows: buckets.excludedRows,
    safeUpdates,
    generatedAt: new Date().toISOString(),
  };
}
