// ============================================================================
// WORK REPORTS — allowlisted, RATE-FREE client work-report DTO contract.
// ============================================================================
//
// This DTO is a deliberate projection for the client-facing work-hour report.
// It must never carry hourly rates, rate versions, monetary amounts, VAT,
// billing adjustments, or invoice totals. The billing-preparation and
// invoice-draft DTOs remain the only monetary projections and are unchanged.
//
// Nothing here is persisted: the report is built deterministically from a
// frozen in-request snapshot (rows + summary + published safe updates), so a
// generated PDF is never silently rewritten by later source edits.
// ============================================================================

export const CLIENT_WORK_REPORT_KIND = 'CLIENT_WORK_REPORT_V1' as const;
export const CLIENT_WORK_REPORT_CASES_KIND = 'CLIENT_WORK_REPORT_CASES_V1' as const;
export const CLIENT_WORK_REPORT_OWNERS_KIND = 'CLIENT_WORK_REPORT_OWNERS_V1' as const;

export const CLOSED_CASE_STATUSES: readonly string[] = ['FINAL', 'CANCELLED', 'ARCHIVED'];

export const WORK_TYPE_LABELS: Record<string, string> = {
  DRAFTING: 'Szerkesztés',
  REVIEW: 'Átnézés',
  CLIENT_CALL: 'Ügyfélhívás',
  LEGAL_RESEARCH: 'Jogi kutatás',
  INTERNAL_MEETING: 'Belső megbeszélés',
  DOCUMENT_GENERATION: 'Dokumentum generálás',
  COURT_PREPARATION: 'Bírósági felkészülés',
  TRANSLATION: 'Fordítás',
  ADMIN: 'Adminisztratív',
  OTHER: 'Egyéb',
};

export const CASE_STATUS_LABELS: Record<string, string> = {
  CLIENT_INPUT: 'Ügyféltől érkezett',
  DRAFT: 'Piszkozat',
  IN_REVIEW: 'Felülvizsgálat alatt',
  APPROVED: 'Jóváhagyva',
  SENT_TO_CLIENT: 'Ügyfélnek elküldve',
  CLIENT_FEEDBACK: 'Ügyfél-visszajelzés',
  FINAL: 'Lezárt',
  ON_HOLD: 'Szünetel',
  CANCELLED: 'Megszakítva',
  ARCHIVED: 'Archivált',
};

export const SAFE_UPDATE_CATEGORY_LABELS: Record<string, string> = {
  STATUS: 'Állapot',
  DEADLINE: 'Határidő',
  DOCUMENT: 'Dokumentum',
  ACTION_REQUIRED: 'Teendő',
  GENERAL: 'Általános',
};

export type WorkReportAttributionKind = 'EXACT_CASE' | 'TASK_DERIVED_CASE' | 'MATTER_ONLY' | 'AMBIGUOUS';

/** One time row. Hours are a display convenience; minutes stays authoritative. */
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

/** Only already published, client-approved updates may appear in the report. */
export interface WorkReportSafeUpdate {
  title: string;
  body: string;
  category: string;
  categoryLabel: string;
  publishedAt: string | null;
}

export interface ClientWorkReportPeriod {
  startDate: string | null;
  endDate: string | null;
}

export interface ClientWorkReportCaseSummary {
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
  kind: typeof CLIENT_WORK_REPORT_CASES_KIND;
  client: { id: string; name: string };
  period: ClientWorkReportPeriod;
  cases: ClientWorkReportCaseListItem[];
  generatedAt: string;
}

export interface ClientWorkReport {
  kind: typeof CLIENT_WORK_REPORT_KIND;
  client: { id: string; name: string };
  period: ClientWorkReportPeriod;
  case: ClientWorkReportCaseSummary;
  rows: WorkReportRow[];
  ambiguousRows: WorkReportRow[];
  excludedRows: WorkReportRow[];
  safeUpdates: WorkReportSafeUpdate[];
  generatedAt: string;
}

// ============================================================================
// CLIENT EXPORT PROJECTION
// ============================================================================
//
// The internal review DTO above carries workforce diagnostics (ambiguous and
// excluded buckets plus their aggregates) and raw TimeEntry descriptions.
// Those are review aids, not client disclosures: not summing a row is not the
// same as not disclosing it, and billable=true is not a review of the free
// text itself.
//
// The client-export boundary is therefore a separate, explicit projection.
// The PDF renderer only ever receives ClientWorkReportExport, so ambiguous and
// excluded row details, internal diagnostic aggregates and raw descriptions
// are structurally absent from the client artifact. A reviewed/sanitized
// detailed narrative remains a separate future product requirement; this
// boundary does not invent a publication engine for it.

/** Neutral, truthful category label for work types outside the finite label map. */
export const CLIENT_EXPORT_UNKNOWN_WORK_TYPE_LABEL = 'Egyéb';

/**
 * Issuer identity for the client export: the LAW FIRM is the issuer,
 * Adminiculum is only the tool used to prepare the report. Only verified
 * identity fields cross this boundary — bank, VAT, rate and payment
 * configuration never do. The office/chamber registration identifier is
 * deliberately absent: its stored meaning is not independently verified, so it
 * must not be printed or mislabeled in the customer artifact.
 */
export interface ClientWorkReportIssuer {
  legalName: string | null;
  address: string | null;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Report-level client-side case owner ("Ügygazda az ügyfélnél"). This is a
 * selection scoped to ONE report; it is not a persisted Case owner, not the
 * responsible lawyer and not the original requester.
 */
export interface ClientWorkReportOwner {
  personId: string;
  name: string;
  jobTitle: string | null;
  organizationGroupName: string | null;
}

/** A person of the report's client eligible for the report-level owner selection. */
export interface ClientWorkReportOwnerCandidate {
  personId: string;
  name: string;
  jobTitle: string | null;
  organizationGroupName: string | null;
}

export interface ClientWorkReportOwnersResponse {
  kind: typeof CLIENT_WORK_REPORT_OWNERS_KIND;
  client: { id: string; name: string };
  people: ClientWorkReportOwnerCandidate[];
  generatedAt: string;
}

/** One row as disclosed to the client. Raw description and internal attribution diagnostics are absent. */
export interface ClientWorkReportExportRow {
  timeEntryId: string;
  workDate: string;
  workerName: string | null;
  workTypeLabel: string;
  minutes: number;
}

/** Case summary as disclosed to the client: facts only, no diagnostic aggregates. */
export interface ClientWorkReportExportCaseSummary {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  caseStatusLabel: string;
  completedAt: string | null;
  matter: { id: string; title: string } | null;
  responsibleLawyerName: string | null;
  requesterNames: string[];
  organizationGroupNames: string[];
  departmentNames: string[];
  recordedMinutes: number;
  recordedEntryCount: number;
}

/** The only DTO the client-export PDF renderer accepts. */
export interface ClientWorkReportExport {
  kind: typeof CLIENT_WORK_REPORT_KIND;
  client: { id: string; name: string };
  period: ClientWorkReportPeriod;
  case: ClientWorkReportExportCaseSummary;
  owner: ClientWorkReportOwner | null;
  issuer: ClientWorkReportIssuer | null;
  rows: ClientWorkReportExportRow[];
  safeUpdates: WorkReportSafeUpdate[];
  generatedAt: string;
}
