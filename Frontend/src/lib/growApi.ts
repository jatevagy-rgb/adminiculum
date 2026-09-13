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
    sourceRefs: Record<string, unknown> | null;
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
  listOpportunities(clientId: string) {
    return fetchApi<{ items: GrowOpportunityItem[] }>(url(clientId, "/grow/opportunities"));
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
