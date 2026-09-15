import { fetchApi } from "./api";
import { interventionLabelHu } from "./growApi";

export type DiagnosticProvenanceClass =
  | "CANONICAL_STATE"
  | "DECLARED_OBSERVATION"
  | "MEASURED_SNAPSHOT"
  | "EVIDENCE_RECORD"
  | "RESEARCH_EVIDENCE"
  | "DERIVED_DIAGNOSIS"
  | "RECOMMENDATION";

export type ProcessMetricCode =
  | "TOTAL_ACTIVE_MINUTES"
  | "TOTAL_WAITING_MINUTES"
  | "TOTAL_CYCLE_MINUTES"
  | "WAITING_SHARE"
  | "APPROVAL_STEP_COUNT"
  | "DATA_ENTRY_STEP_COUNT"
  | "HANDOFF_STEP_COUNT"
  | "RESPONSIBLE_PERSON_CHANGE_COUNT"
  | "SYSTEM_COUNT"
  | "SYSTEM_SWITCH_COUNT"
  | "UNASSIGNED_STEP_COUNT"
  | "PROCESS_OWNER_PRESENT";

export type ProcessMetricUnit = "MINUTES" | "COUNT" | "RATIO" | "BOOLEAN";

export interface ProcessMetricValue {
  code: ProcessMetricCode | string;
  value: number | boolean | null;
  unit: ProcessMetricUnit | string;
  metricVersion: string;
}

export interface DiagnosticWorkbenchDto {
  client: {
    id: string;
    name: string;
    operatingProfile: {
      provenanceClass: "CANONICAL_STATE";
      status: string | null;
      complianceEnrollmentStatus: string;
      summary: string | null;
      lastReviewedAt: string | null;
      nextReviewAt: string | null;
    } | null;
  };
  known: {
    facts: Array<{
      id: string;
      provenanceClass: "CANONICAL_STATE";
      type: string;
      value: string;
      factDefinition: { key: string; domainCode: string; valueType: string } | null;
      scopeType: string | null;
      factSubjectId: string | null;
      verificationStatus: string;
      determinationMethod: string | null;
      observedAt: string | null;
      effectiveAt: string | null;
      validFrom: string;
      validTo: string | null;
      supersededAt: string | null;
    }>;
    processes: Array<{
      id: string;
      provenanceClass: "CANONICAL_STATE";
      name: string;
      category: string;
      description: string | null;
      criticality: string;
      frequency: string;
      status: string;
      owner: { id: string; name: string } | null;
      organizationGroup: { id: string; name: string } | null;
      steps: Array<{
        id: string;
        position: number;
        name: string;
        stepType: string;
        isApproval: boolean;
        responsiblePerson: { id: string; name: string } | null;
        system: { id: string; name: string; category: string } | null;
        estimatedActiveMinutes: number | null;
        estimatedWaitingMinutes: number | null;
      }>;
    }>;
    systems: Array<{
      id: string;
      provenanceClass: "CANONICAL_STATE";
      name: string;
      category: string;
      vendor: string | null;
      purpose: string | null;
      status: string;
      owner: { id: string; name: string } | null;
    }>;
  };
  observed: {
    observations: Array<{
      id: string;
      provenanceClass: "DECLARED_OBSERVATION";
      observationType: string;
      observedAt: string;
      createdAt: string;
      sourceRecordId: string | null;
      inputDigest: string;
      source: { id: string; sourceType: string; name: string };
      discoveryRun: { id: string; status: string; startedAt: string } | null;
    }>;
    processSnapshots: Array<{
      id: string;
      provenanceClass: "MEASURED_SNAPSHOT";
      businessProcess: { id: string; name: string };
      metricVersion: string;
      observedAt: string;
      inputDigest: string;
      snapshotDigest: string;
      metrics: ProcessMetricValue[];
      provenance: {
        source: string;
        calculatedBy: string;
        stepCount: number;
        inputFieldInventory: string[];
      } | null;
    }>;
  };
  problems: {
    domains: Array<{
      id: string;
      provenanceClass: "DERIVED_DIAGNOSIS";
      key: string;
      name: string;
      description: string | null;
      status: string;
    }>;
    diagnoses: Array<{
      id: string;
      provenanceClass: "DERIVED_DIAGNOSIS";
      title: string;
      summary: string | null;
      status: string;
      problemDomain: { id: string; key: string; name: string } | null;
      businessProcess: { id: string; name: string } | null;
      evidence: Array<{ id: string; title: string; verificationStatus: string; strength: string }>;
    }>;
    sufficiency: Array<{
      recommendationId: string;
      provenanceClass: "RECOMMENDATION";
      decision: string;
      evidenceCount: number;
    }>;
  };
  proposed: {
    recommendations: Array<{
      id: string;
      provenanceClass: "RECOMMENDATION";
      title: string;
      problemStatement: string;
      direction: string;
      kind: string;
      impactTags: string[];
      interventionCodes: string[];
      status: string;
      sufficiency: string;
      diagnosisId: string | null;
      domain: { key: string; name: string } | null;
      businessProcess: { id: string; name: string } | null;
      evidence: Array<{ id: string; title: string; verificationStatus: string; strength: string }>;
    }>;
  };
  evidence: {
    records: Array<{
      id: string;
      provenanceClass: "EVIDENCE_RECORD";
      sourceType: string;
      status: string;
      title: string;
      description: string | null;
      validFrom: string | null;
      validUntil: string | null;
      clientFactId: string | null;
      observationId: string | null;
      documentVersionId: string | null;
    }>;
    research: Array<{
      id: string;
      provenanceClass: "RESEARCH_EVIDENCE";
      kind: string;
      title: string;
      origin: string | null;
      boundedClaim: string | null;
      verificationStatus: string;
      strength: string;
      domainKeys: string[];
    }>;
  };
  missing: {
    hasUnknownFacts: boolean;
    hasConflictingEvidence: boolean;
    insufficientRecommendationCount: number;
    unresolvedItems: Array<{ code: string; message: string }>;
  };
}

export const PROVENANCE_LABELS_HU: Record<DiagnosticProvenanceClass, { label: string; tone: string }> = {
  CANONICAL_STATE: {
    label: "Kanonikus vállalati állapot",
    tone: "border-sky-200 bg-sky-50 text-sky-800",
  },
  DECLARED_OBSERVATION: {
    label: "Deklarált megfigyelés (felmérés)",
    tone: "border-purple-200 bg-purple-50 text-purple-800",
  },
  MEASURED_SNAPSHOT: {
    label: "Mért folyamatpillanatkép",
    tone: "border-teal-200 bg-teal-50 text-teal-800",
  },
  DERIVED_DIAGNOSIS: {
    label: "Levezetett diagnózis",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  RECOMMENDATION: {
    label: "Belső javaslat",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  EVIDENCE_RECORD: {
    label: "Ügyfélspecifikus bizonyíték",
    tone: "border-indigo-200 bg-indigo-50 text-indigo-800",
  },
  RESEARCH_EVIDENCE: {
    label: "Kutatási háttér",
    tone: "border-slate-200 bg-slate-50 text-slate-800",
  },
};

export const PROCESS_METRIC_LABELS_HU: Record<ProcessMetricCode, { title: string; unitLabel: string }> = {
  TOTAL_ACTIVE_MINUTES: { title: "Összes aktív idő", unitLabel: "perc" },
  TOTAL_WAITING_MINUTES: { title: "Összes várakozási idő", unitLabel: "perc" },
  TOTAL_CYCLE_MINUTES: { title: "Összes átfutási idő", unitLabel: "perc" },
  WAITING_SHARE: { title: "Várakozási arány", unitLabel: "%" },
  APPROVAL_STEP_COUNT: { title: "Jóváhagyási lépések", unitLabel: "db" },
  DATA_ENTRY_STEP_COUNT: { title: "Adatbeviteli lépések", unitLabel: "db" },
  HANDOFF_STEP_COUNT: { title: "Átadási lépések", unitLabel: "db" },
  RESPONSIBLE_PERSON_CHANGE_COUNT: { title: "Felelősváltások", unitLabel: "db" },
  SYSTEM_COUNT: { title: "Érintett rendszerek", unitLabel: "db" },
  SYSTEM_SWITCH_COUNT: { title: "Rendszerváltások", unitLabel: "db" },
  UNASSIGNED_STEP_COUNT: { title: "Felelős nélküli lépések", unitLabel: "db" },
  PROCESS_OWNER_PRESENT: { title: "Folyamatgazda kijelölve", unitLabel: "" },
};

export function formatProcessMetricValue(metric: ProcessMetricValue): string {
  if (metric.value === null || metric.value === undefined) {
    return "—";
  }
  if (typeof metric.value === "boolean") {
    return metric.value ? "Igen" : "Nem";
  }
  if (metric.unit === "MINUTES") {
    return `${metric.value} perc`;
  }
  if (metric.unit === "RATIO") {
    return `${Math.round(metric.value * 100)}%`;
  }
  if (metric.unit === "COUNT") {
    return `${metric.value} db`;
  }
  return String(metric.value);
}

export const VERIFICATION_STATUS_LABELS_HU: Record<string, string> = {
  VERIFIED: "Hitelesített",
  REPORTED: "Jelentett",
  ESTIMATED: "Becsült",
  INFERRED: "Következtetett",
  UNKNOWN: "Ismeretlen",
  REJECTED: "Elutasított",
};

export function verificationStatusLabelHu(status: string | null | undefined): string {
  if (!status) return "—";
  return VERIFICATION_STATUS_LABELS_HU[status] ?? status;
}

export const SUFFICIENCY_LABELS_HU: Record<string, { label: string; tone: string }> = {
  SUPPORTED: { label: "Alátámasztott", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  NEEDS_MORE_DATA: { label: "További adat szükséges", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  INSUFFICIENT_EVIDENCE: { label: "Elégtelen bizonyíték", tone: "bg-rose-50 text-rose-800 border-rose-200" },
  CONFLICTING_EVIDENCE: { label: "Ellentmondó bizonyíték", tone: "bg-red-50 text-red-800 border-red-200" },
  OUT_OF_SCOPE: { label: "Hatókörön kívüli", tone: "bg-zinc-50 text-zinc-700 border-zinc-200" },
  HUMAN_DOMAIN_REVIEW: { label: "Szakértői felülvizsgálat szükséges", tone: "bg-blue-50 text-blue-800 border-blue-200" },
};

export function sufficiencyBadge(sufficiency: string | null | undefined): { label: string; tone: string } {
  if (!sufficiency) return { label: "Meghatározatlan", tone: "bg-gray-50 text-gray-700 border-gray-200" };
  return SUFFICIENCY_LABELS_HU[sufficiency] ?? { label: sufficiency, tone: "bg-gray-50 text-gray-700 border-gray-200" };
}

export function recommendationStatusLabelHu(status: string | null | undefined): string {
  if (status === "ACCEPTED") return "Belsőleg elfogadott";
  if (status === "DECLINED") return "Elutasítva";
  if (status === "DISMISSED") return "Mellőzve";
  if (status === "ACTIVE" || status === "PROPOSED") return "Tervezet";
  return status || "Tervezet";
}

export async function getDiagnosticWorkbench(clientId: string): Promise<DiagnosticWorkbenchDto> {
  return fetchApi<DiagnosticWorkbenchDto>(
    `/client-company/clients/${encodeURIComponent(clientId)}/grow/diagnostic-workbench`
  );
}

export { interventionLabelHu };
