import { fetchApi } from "./api";

/** Grow product + Observatory intake API. All endpoints are additive. */

export type SufficiencyDecision =
  | "SUPPORTED"
  | "NEEDS_MORE_DATA"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTING_EVIDENCE"
  | "OUT_OF_SCOPE"
  | "HUMAN_DOMAIN_REVIEW";
export type EvidenceStrength = "STRONG" | "MODERATE" | "WEAK";

export type RoiProvenanceType =
  | "MEASURED"
  | "CALCULATED"
  | "CLIENT_ESTIMATE"
  | "CONSULTANT_ESTIMATE"
  | "RESEARCH_BENCHMARK"
  | "GENERAL_ASSUMPTION";

export interface GrowOpportunityItem {
  id: string;
  runId: string;
  status: string;
  kind: string;
  sufficiency: SufficiencyDecision;
  actionable: boolean;
  interventionCodes: string[];
  title: string;
  problemStatement: string;
  direction: string;
  impactTags: string[];
  domainKey: string | null;
  businessProcess: { id: string; name: string } | null;
  evidenceStrength: EvidenceStrength;
  opportunity?: { id: string; status: string; developmentInitiativeId: string | null } | null;
  createdAt: string;
}

export interface GrowEvidenceItem {
  id: string;
  clientId: string | null;
  corpusKey: string | null;
  kind: string;
  title: string;
  authors: string | null;
  venue: string | null;
  year: number | null;
  doi: string | null;
  locator: string | null;
  origin: string | null;
  boundedClaim: string | null;
  evidenceType: string | null;
  verificationStatus: string;
  strength: string;
  domainKeys: string[];
  supportedInterventions: string[];
  supportedOutcomes: string[];
  applicabilityNotes: string | null;
  limitations: string | null;
  createdAt: string;
}

export interface GrowOpportunityDetail {
  id: string;
  runId: string;
  status: string;
  kind: string;
  sufficiency: SufficiencyDecision;
  actionable: boolean;
  interventionCodes: string[];
  title: string;
  problemStatement: string;
  direction: string;
  impactTags: string[];
  diagnosis: {
    id: string;
    title: string;
    summary: string;
    domainTitle: string | null;
    businessProcess: { id: string; name: string } | null;
    sourceRefs: DiagnosisSourceRefs | null;
  } | null;
  evidence: GrowEvidenceItem[];
  review: { byId: string; byName: string | null; at: string | null; note: string | null } | null;
  opportunity: { id: string; status: string; developmentInitiativeId: string | null } | null;
  createdAt: string;
}

export interface GrowHomeSummary {
  canRunResearch: boolean;
  opportunityCounts: {
    total: number;
    supported: number;
    evidenceBacked: number;
    measurementBacked: number;
  };
  topOpportunities: GrowOpportunityItem[];
  activeInitiatives: Array<{ id: string; title: string; status: string }>;
  completedOutcomes: Array<{ id: string; businessProcess: { id: string; name: string } | null; basis: string; synthetic: boolean; createdAt: string }>;
}

export interface OutcomeRoi {
  basis: string;
  provenanceType?: RoiProvenanceType | null;
  timeSavedMinutesPerRun?: { low: number; base: number; high: number } | null;
  timeSavedMinutesPerMonth?: { low: number; base: number; high: number } | null;
  cashSavedHufPerMonth?: { low: number; base: number; high: number } | null;
  provenance?: {
    formulaVersion: string;
    computedAt: string;
    type?: RoiProvenanceType;
    timeSavedIsNotCashSaved: boolean;
    explanationHu: string;
    recordedById?: string;
  };
}

export interface OutcomeMeasurementDTO {
  id: string;
  basis: "MEASURED" | "CALCULATED" | "ESTIMATED" | "ASSUMED";
  synthetic: boolean;
  businessProcess: { id: string; name: string } | null;
  opportunityTitle: string | null;
  initiative: { id: string; title: string; status: string } | null;
  metricsSummary: { before?: Record<string, number>; after?: Record<string, number> | null; comparable?: boolean } | null;
  roi: OutcomeRoi | null;
  note: string | null;
  recordedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface BusinessProcessDTO {
  id: string;
  clientId: string;
  name: string;
  category: string;
  description: string | null;
  ownerPersonName: string | null;
  organizationGroupName: string | null;
  criticality: string;
  frequency: string;
  status: string;
  steps?: Array<{
    id: string;
    position: number;
    name: string;
    stepType: string;
    responsiblePersonId: string | null;
    responsiblePersonName: string | null;
    systemId: string | null;
    systemName: string | null;
    estimatedActiveMinutes: number | null;
    estimatedWaitingMinutes: number | null;
    isApproval: boolean;
  }>;
}

/** Canonical process observation snapshot (T2B) returned by the server. */
export interface ProcessObservationSnapshotDTO {
  id: string;
  clientId: string;
  businessProcessId: string;
  metricVersion: string;
  observedAt: string;
  inputDigest: string;
  snapshotDigest: string;
  metrics: Array<{ code: string; value: number | boolean | null; unit: string; metricVersion: string }>;
  provenance: {
    source: string;
    calculatedBy: string;
    stepCount: number;
    inputFieldInventory: string[];
  } | null;
  createdAt: string;
}

/** Canonical snapshot/observation references recorded on a diagnosis. */
export interface DiagnosisSourceRefs {
  snapshotIds?: string[];
  observationIds?: string[];
  businessProcessId?: string | null;
  severity?: "HIGH" | "MEDIUM" | "LOW" | string;
  sufficiency?: SufficiencyDecision | string;
  reasons?: string[];
}

export type OpportunityPublicationStatus =
  | "DRAFT"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "PUBLISHED"
  | "REVOKED"
  | "SUPERSEDED";

export interface OpportunityPublicationSnapshot {
  id: string;
  revisionNumber: number;
  clientSafeTitle: string;
  clientSafeSummary: string;
  clientSafeDirection: string | null;
  sourceFingerprint: string;
  audienceSnapshot: unknown;
  createdAt: string;
}

export interface OpportunityPublicationDTO {
  id: string;
  opportunityId: string;
  clientId: string;
  workspaceId: string;
  status: OpportunityPublicationStatus;
  currentRevisionId: string | null;
  preparedById: string;
  approvedById: string | null;
  publishedById: string | null;
  revokedById: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  revokedAt: string | null;
  revision: number;
  snapshot: OpportunityPublicationSnapshot | null;
}

export interface OpportunityPublicationWorkspaceDTO {
  id: string;
  name: string;
  mode: string;
}

export interface OpportunityPublicationDraftInput {
  opportunityId: string;
  workspaceId: string;
  title: string;
  summary: string;
  direction?: string;
  expectedRevision?: number;
}

export type OpportunityPublicationAction = "submit" | "approve" | "publish" | "revoke";

export const SURVEY_CATEGORY_LABELS_HU: Record<string, string> = {
  MANUAL_ADMIN: "Túl sok kézi adminisztráció",
  SLOW_APPROVAL: "Lassú jóváhagyások / várakozás",
  DUPLICATE_DATA: "Ugyanazokat az adatokat többször rögzítjük",
  TOO_MANY_SYSTEMS: "Túl sok rendszer között kell váltani",
  UNCLEAR_OWNERSHIP: "Nem egyértelmű, ki miért felel",
  REWORK: "Sok a javítás / újramunka",
  UNMEASURED_COST: "Nehéz mérni, mi mennyi idő és pénz",
  GENERAL_CONCERN: "Nem tudom pontosan, csak azt érzem, hogy valami nem működik jól",
};

export const DOMAIN_LABELS_HU: Record<string, { title: string }> = {
  MANUAL_ADMIN_LOAD: { title: "Túl sok kézi adminisztráció" },
  APPROVAL_DELAY: { title: "Lassú jóváhagyások / várakozás" },
  DUPLICATE_DATA_ENTRY: { title: "Ugyanazokat az adatokat többször rögzítjük" },
  SYSTEM_SWITCHING: { title: "Túl sok rendszer között kell váltani" },
  UNCLEAR_OWNERSHIP: { title: "Nem egyértelmű, ki miért felel" },
  REWORK: { title: "Sok a javítás / újramunka" },
  UNMEASURED_COST: { title: "Nehéz mérni, mi mennyi idő és pénz" },
  GENERAL_FLOW: { title: "Általános folyamat-probléma" },
};

export function domainTitleHu(domainKey: string | null | undefined): string {
  if (!domainKey) return "Általános folyamat";
  return DOMAIN_LABELS_HU[domainKey]?.title ?? domainKey;
}

function url(clientId: string, path: string): string {
  return `/client-company/clients/${encodeURIComponent(clientId)}${path}`;
}

export const growApi = {
  getHome(clientId: string) {
    return fetchApi<GrowHomeSummary>(url(clientId, "/grow/home"));
  },
  listEvidence(clientId: string) {
    return fetchApi<{ items: GrowEvidenceItem[] }>(url(clientId, "/grow/evidence"));
  },
  listOpportunities(clientId: string, status?: "PENDING_REVIEW" | "ACCEPTED" | "DECLINED" | "NEEDS_MORE_DATA") {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return fetchApi<{ items: GrowOpportunityItem[] }>(url(clientId, `/grow/opportunities${query}`));
  },
  getOpportunity(clientId: string, recommendationId: string) {
    return fetchApi<GrowOpportunityDetail>(url(clientId, `/grow/opportunities/${encodeURIComponent(recommendationId)}`));
  },
  runResearch(clientId: string, input: { businessProcessId?: string; idempotencyKey?: string }) {
    return fetchApi<{ runId: string; status: string; diagnosisCount: number; recommendationCount: number; replayed: boolean }>(
      url(clientId, "/grow/research-runs"),
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  reviewOpportunity(clientId: string, recommendationId: string, decision: "ACCEPT" | "DECLINE" | "REQUEST_MORE_INFO", note?: string) {
    return fetchApi<{ recommendation: unknown; opportunity: { id: string } | null }>(url(clientId, `/grow/opportunities/${encodeURIComponent(recommendationId)}/review`), {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    });
  },
  startInitiative(clientId: string, opportunityId: string, input: { title?: string; reason?: string; currentState?: string; targetState?: string; priority?: string; caseId?: string } = {}) {
    return fetchApi<{ opportunity: unknown; initiative: { id: string; title: string } }>(url(clientId, `/grow/opportunities/${encodeURIComponent(opportunityId)}/start-initiative`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listOutcomes(clientId: string) {
    return fetchApi<{ items: OutcomeMeasurementDTO[] }>(url(clientId, "/grow/outcomes"));
  },
  recordOutcome(clientId: string, opportunityId: string, input: { businessProcessId: string; beforeSnapshotId: string; afterSnapshotId?: string; expectedActiveReductionPct?: number; runsPerMonth?: number; hourlyCostHuf?: { low: number; base: number; high: number }; peopleAffected?: number; synthetic?: boolean; note?: string }) {
    return fetchApi<OutcomeMeasurementDTO>(url(clientId, `/grow/opportunities/${encodeURIComponent(opportunityId)}/outcomes`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  submitSurveyIntake(clientId: string, input: { categories: string[]; freeText?: string; processId?: string; idempotencyKey: string }) {
    return fetchApi<{ observationId: string; runId: string; connectionId: string; replayed: boolean }>(
      url(clientId, "/observatory/survey-intake"),
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  listSurveyIntakes(clientId: string) {
    return fetchApi<{ items: Array<{ id: string; runId: string; connectionId: string; idempotencyKey: string; observedAt: string; payload: Record<string, unknown> }> }>(url(clientId, "/observatory/survey-intake"));
  },
  listSources(clientId: string) {
    return fetchApi<{ items: Array<{ id: string; sourceType: string; name: string; status: string; createdAt: string }> }>(url(clientId, "/observatory/sources"));
  },
  listProcesses(clientId: string) {
    return fetchApi<BusinessProcessDTO[]>(url(clientId, "/processes"));
  },
  getProcessObservationLatest(clientId: string, processId: string) {
    return fetchApi<{ id: string; observedAt: string; metrics: Record<string, number> }>(url(clientId, `/processes/${encodeURIComponent(processId)}/observations/latest`));
  },
  captureProcessObservation(clientId: string, processId: string) {
    return fetchApi<ProcessObservationSnapshotDTO>(
      url(clientId, `/processes/${encodeURIComponent(processId)}/observations`),
      { method: "POST", body: JSON.stringify({}) },
    );
  },
  /**
   * Canonical observation-snapshot history for a process (T2B). Read-only: the
   * returned snapshots are the same records the outcome service consumes by id.
   */
  listProcessObservationHistory(clientId: string, processId: string) {
    return fetchApi<{ items: ProcessObservationSnapshotDTO[] }>(
      url(clientId, `/processes/${encodeURIComponent(processId)}/observations`),
    );
  },
  listOpportunityPublications(clientId: string, opportunityId: string) {
    return fetchApi<{ items: OpportunityPublicationDTO[] }>(
      url(clientId, `/grow/opportunities/${encodeURIComponent(opportunityId)}/publications`),
    );
  },
  listOpportunityPublicationWorkspaces(clientId: string) {
    return fetchApi<{ items: OpportunityPublicationWorkspaceDTO[] }>(url(clientId, "/grow/opportunity-publication-workspaces"));
  },
  createOpportunityPublicationDraft(clientId: string, input: OpportunityPublicationDraftInput) {
    return fetchApi<OpportunityPublicationDTO>(url(clientId, "/grow/opportunity-publications"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  transitionOpportunityPublication(
    clientId: string,
    publicationId: string,
    action: OpportunityPublicationAction,
    expectedRevision?: number,
  ) {
    return fetchApi<OpportunityPublicationDTO>(
      url(clientId, `/grow/opportunity-publications/${encodeURIComponent(publicationId)}/${action}`),
      { method: "POST", body: JSON.stringify({ expectedRevision }) },
    );
  },
};

export function sufficiencyLabelHu(sufficiency: SufficiencyDecision): string {
  const labels: Record<SufficiencyDecision, string> = {
    SUPPORTED: "Alátámasztott",
    NEEDS_MORE_DATA: "Több adat kell",
    INSUFFICIENT_EVIDENCE: "Elégtelen bizonyíték",
    CONFLICTING_EVIDENCE: "Ellentmondásos bizonyíték",
    OUT_OF_SCOPE: "Területen kívül",
    HUMAN_DOMAIN_REVIEW: "Szakértői felülvizsgálat",
  };
  return labels[sufficiency];
}

export function sufficiencyExplanationHu(sufficiency: SufficiencyDecision): string | null {
  const labels: Partial<Record<SufficiencyDecision, string>> = {
    CONFLICTING_EVIDENCE: "A rendelkezésre álló bizonyítékok ellentmondásosak. Szakértői felülvizsgálat szükséges.",
    HUMAN_DOMAIN_REVIEW: "Szakértői felülvizsgálat szükséges, mielőtt javaslatot adunk.",
  };
  return labels[sufficiency] ?? null;
}

export function evidenceStrengthLabelHu(strength: EvidenceStrength | string): string {
  const labels: Record<string, string> = {
    STRONG: "Erős bizonyíték",
    MODERATE: "Mérsékelt bizonyíték",
    WEAK: "Gyenge bizonyíték",
  };
  return labels[strength] || strength;
}

export function outcomeBasisLabelHu(basis: string): string {
  const labels: Record<string, string> = {
    MEASURED: "Mért",
    CALCULATED: "Számított",
    ESTIMATED: "Becsült",
    ASSUMED: "Feltételezés",
  };
  return labels[basis] || basis;
}

export function roiProvenanceLabelHu(type: RoiProvenanceType | string | null | undefined): string {
  const labels: Record<string, string> = {
    MEASURED: "Mért",
    CALCULATED: "Számított",
    CLIENT_ESTIMATE: "Ügyfélbecslés",
    CONSULTANT_ESTIMATE: "Tanácsadói becslés",
    RESEARCH_BENCHMARK: "Kutatási benchmark",
    GENERAL_ASSUMPTION: "Általános feltételezés",
  };
  return type ? labels[type] || type : "—";
}

/** Display labels for the canonical backend intervention codes. */
export const INTERVENTION_LABELS_HU: Record<string, string> = {
  STANDARDIZE_PROCESS: "Folyamat standardizálása",
  REDESIGN_APPROVAL_ROUTING: "Jóváhagyási útvonal újratervezése",
  DIGITIZE_INTAKE: "Beviteli adatrögzítés digitalizálása",
  CONSOLIDATE_SYSTEMS: "Rendszerek összevonása",
  INTEGRATE_SYSTEMS: "Rendszerek integrálása",
  AUTOMATE_REPETITIVE_STEP: "Ismétlődő lépés automatizálása",
  CLARIFY_PROCESS_OWNERSHIP: "Folyamatfelelősség tisztázása",
  TRAIN_DIGITAL_SKILLS: "Digitális készségek fejlesztése",
  ALIGN_IT_WITH_BUSINESS_GOALS: "IT és üzleti célok összehangolása",
  IMPLEMENT_PROCESS_MEASUREMENT: "Folyamatmérés bevezetése",
  PHASE_DIGITAL_INVESTMENT: "Digitális beruházás szakaszolása",
  REMOVE_NON_VALUE_ADDING_STEP: "Nem értékteremtő lépés elhagyása",
  REDESIGN_BEFORE_AUTOMATING: "Újratervezés automatizálás előtt",
};

export function interventionLabelHu(code: string): string {
  return INTERVENTION_LABELS_HU[code] ?? code;
}

export function evidenceOriginLabelHu(origin: string | null | undefined): string {
  const labels: Record<string, string> = {
    USER_LIBRARY: "Felhasználói könyvtár",
    ONLINE_VERIFIED: "Online ellenőrzött",
    GENERAL_KNOWLEDGE: "Általános ismeret",
    CLIENT_INTERNAL: "Ügyfél-belső",
  };
  return origin ? labels[origin] || origin : "—";
}

export function reviewDecisionLabelHu(status: string): string {
  const labels: Record<string, string> = {
    PENDING_REVIEW: "Emberi döntésre vár",
    ACCEPTED: "Elfogadva",
    DECLINED: "Elutasítva",
    NEEDS_MORE_DATA: "További információ kérve",
  };
  return labels[status] || status;
}

export function opportunityStatusLabelHu(status: string): string {
  const labels: Record<string, string> = {
    OPEN: "Nyitott",
    INITIATIVE_STARTED: "Kezdeményezés indítva",
    OUTCOME_RECORDED: "Eredmény rögzítve",
    CLOSED: "Lezárt",
  };
  return labels[status] || status;
}

export function publicationStatusLabelHu(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "Előkészítés (piszkozat)",
    READY_FOR_APPROVAL: "Jóváhagyásra vár",
    APPROVED: "Jóváhagyva",
    PUBLISHED: "Közzétéve az ügyfélportálon",
    REVOKED: "Visszavonva",
    SUPERSEDED: "Felváltva",
  };
  return labels[status] || status;
}

/** Evidence category for the workforce "Mi alapján?" explanation. */
export type EvidenceBasisCategory = "MEASURED_COMPANY" | "DECLARED_COMPANY" | "RESEARCH";

export function evidenceBasisCategory(item: GrowEvidenceItem): EvidenceBasisCategory {
  if (item.kind === "INTERNAL_MEASUREMENT" || item.evidenceType === "INTERNAL_MEASUREMENT") return "MEASURED_COMPANY";
  if (item.kind === "INTERNAL_OBSERVATION" || item.evidenceType === "INTERNAL_OBSERVATION") return "DECLARED_COMPANY";
  if (item.origin === "CLIENT_INTERNAL") return "DECLARED_COMPANY";
  return "RESEARCH";
}

export function evidenceBasisLabelHu(category: EvidenceBasisCategory): string {
  const labels: Record<EvidenceBasisCategory, string> = {
    MEASURED_COMPANY: "Ügyfél-mérési bizonyíték",
    DECLARED_COMPANY: "Deklarált felmérés / megfigyelés",
    RESEARCH: "Kutatási háttér (nem ügyféladat)",
  };
  return labels[category];
}

export function evidenceBasisExplanationHu(category: EvidenceBasisCategory): string {
  const labels: Record<EvidenceBasisCategory, string> = {
    MEASURED_COMPANY: "A cég saját folyamat-mérési pillanatképéből származó, mért adat.",
    DECLARED_COMPANY: "A cég által kitöltött felmérésből vagy bejelentésből származó, deklarált adat.",
    RESEARCH: "Külső szakirodalmi/módszertani háttér. Ez nem a cég saját tényadata, csak alátámasztó kontextus.",
  };
  return labels[category];
}
