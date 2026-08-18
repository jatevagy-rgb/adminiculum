import { fetchApi } from './api';

export type CompanyOperatingProfile = {
  id: string;
  clientId: string;
  status: string | null;
  summary: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  updatedAt: string;
};

export type CompanyFact = {
  id: string;
  type: string;
  value: string;
  validFrom: string;
  validTo: string | null;
  sourceReference: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
  updatedAt: string;
};

export type CompanyMilestone = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  milestoneDate: string | null;
  targetDate: string | null;
  status: string;
  developmentInitiativeId: string | null;
  updatedAt: string;
};

export type CompanyAssessment = {
  id: string;
  type: string;
  title: string;
  status: string;
  methodRef: string | null;
  startedAt: string | null;
  completedAt: string | null;
  itemCount?: number;
  findingCount?: number;
  updatedAt: string;
};

export type CompanyAssessmentItem = {
  id: string;
  assessmentId: string;
  key: string;
  label: string;
  kind: string;
  maturityLevel: number | null;
  statusCode: string | null;
  evidenceSummary: string | null;
  comment: string | null;
};

export type CompanyFinding = {
  id: string;
  clientId: string;
  assessmentId: string;
  severity: string;
  title: string;
  description: string | null;
  recommendation: string | null;
  status: string;
  developmentInitiativeId: string | null;
};

export type DevelopmentInitiative = {
  id: string;
  title: string;
  reason: string | null;
  currentState: string | null;
  targetState: string | null;
  priority: string;
  status: string;
  lawFirmOwnerUserId: string | null;
  caseId: string | null;
  targetAt: string | null;
  updatedAt: string;
};

function url(clientId: string, path: string): string {
  return `/client-company/clients/${encodeURIComponent(clientId)}${path}`;
}

export const clientCompanyApi = {
  getProfile(clientId: string) {
    return fetchApi<CompanyOperatingProfile | null>(url(clientId, '/operating-profile'), { suppressErrorStatuses: [404] });
  },
  saveProfile(clientId: string, payload: Partial<CompanyOperatingProfile>) {
    return fetchApi<CompanyOperatingProfile>(url(clientId, '/operating-profile'), { method: 'PUT', body: JSON.stringify(payload) });
  },
  listFacts(clientId: string) {
    return fetchApi<{ items: CompanyFact[] }>(url(clientId, '/facts'));
  },
  createFact(clientId: string, payload: { type: string; value: string; validFrom?: string; sourceReference?: string }) {
    return fetchApi<CompanyFact>(url(clientId, '/facts'), { method: 'POST', body: JSON.stringify(payload) });
  },
  verifyFact(factId: string, verificationStatus: string) {
    return fetchApi<CompanyFact>(`/client-company/facts/${encodeURIComponent(factId)}/verify`, { method: 'POST', body: JSON.stringify({ verificationStatus }) });
  },
  listMilestones(clientId: string) {
    return fetchApi<{ items: CompanyMilestone[] }>(url(clientId, '/milestones'));
  },
  createMilestone(clientId: string, payload: { type: string; title: string; targetDate?: string; developmentInitiativeId?: string }) {
    return fetchApi<CompanyMilestone>(url(clientId, '/milestones'), { method: 'POST', body: JSON.stringify(payload) });
  },
  listAssessments(clientId: string) {
    return fetchApi<{ items: CompanyAssessment[] }>(url(clientId, '/assessments'));
  },
  createAssessment(clientId: string, payload: { type: string; title: string }) {
    return fetchApi<CompanyAssessment>(url(clientId, '/assessments'), { method: 'POST', body: JSON.stringify(payload) });
  },
  getAssessment(assessmentId: string) {
    return fetchApi<CompanyAssessment & { items: CompanyAssessmentItem[]; findings: CompanyFinding[] }>(`/client-company/assessments/${encodeURIComponent(assessmentId)}`);
  },
  transitionAssessment(assessmentId: string, action: 'start' | 'complete') {
    return fetchApi<CompanyAssessment>(`/client-company/assessments/${encodeURIComponent(assessmentId)}/${action}`, { method: 'POST' });
  },
  addItem(assessmentId: string, payload: { key: string; label: string; kind: string; maturityLevel?: number }) {
    return fetchApi<CompanyAssessmentItem>(`/client-company/assessments/${encodeURIComponent(assessmentId)}/items`, { method: 'POST', body: JSON.stringify(payload) });
  },
  listFindings(clientId: string) {
    return fetchApi<{ items: CompanyFinding[] }>(url(clientId, '/findings'));
  },
  transitionFinding(findingId: string, status: string) {
    return fetchApi<CompanyFinding>(`/client-company/findings/${encodeURIComponent(findingId)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
  },
  listInitiatives(clientId: string) {
    return fetchApi<{ items: DevelopmentInitiative[] }>(url(clientId, '/initiatives'));
  },
  createInitiative(clientId: string, payload: { title: string; priority: string; targetState?: string }) {
    return fetchApi<DevelopmentInitiative>(url(clientId, '/initiatives'), { method: 'POST', body: JSON.stringify(payload) });
  },
  updateInitiative(initiativeId: string, payload: { status?: string; caseId?: string | null }) {
    return fetchApi<DevelopmentInitiative>(`/client-company/initiatives/${encodeURIComponent(initiativeId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
};

export function companyFactTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    EMPLOYEE_COUNT: 'Létszám',
    REVENUE_BAND: 'Bevételi sáv',
    MAIN_ACTIVITY: 'Fő tevékenység',
    OPERATING_COUNTRY: 'Működési ország',
    SITE: 'Telephely',
    EXPORT_ACTIVITY: 'Exporttevékenység',
    OWNERSHIP: 'Tulajdonosi szerkezet',
    MANAGEMENT_STRUCTURE: 'Vezetési struktúra',
    REGULATED_ACTIVITY: 'Szabályozott tevékenység',
    CRITICAL_CUSTOMER: 'Kritikus ügyfél',
    CRITICAL_SUPPLIER: 'Kritikus beszállító',
    FINANCING: 'Finanszírozás',
    IMPORTANT_IT_SYSTEM: 'Fontos IT-rendszer',
    SENSITIVE_DATA_USAGE: 'Érzékeny adatok kezelése',
    AI_USAGE: 'AI-használat',
    CERTIFICATION: 'Tanúsítvány',
  };
  return labels[type] || type;
}

export function factVerificationLabel(status: string): string {
  const labels: Record<string, string> = {
    UNVERIFIED: 'Nem ellenőrzött',
    CLIENT_PROVIDED: 'Ügyfél által közölt',
    DOCUMENT_VERIFIED: 'Dokumentummal igazolva',
    LAW_FIRM_VERIFIED: 'Iroda által igazolt',
  };
  return labels[status] || status;
}

export function assessmentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    COMPANY_OPERATING: 'Működési felmérés',
    MANAGEMENT_MATURITY: 'Vezetési érettség',
    CONTRACT_GOVERNANCE: 'Szerződés-kormányzás',
    HR_GOVERNANCE: 'HR-kormányzás',
    DIGITAL_MATURITY: 'Digitális érettség',
  };
  return labels[type] || type;
}

export function initiativeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    BACKLOG: 'Visszaváró',
    PLANNED: 'Tervezett',
    ACTIVE: 'Folyamatban',
    ON_HOLD: 'Szünetel',
    COMPLETED: 'Kész',
    CANCELLED: 'Törölve',
  };
  return labels[status] || status;
}
