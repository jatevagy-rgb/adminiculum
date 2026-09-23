import { fetchApi } from './api';
import type { ComplianceControlGap, ComplianceFindingView } from '@/components/clients/compliance/ComplianceOverview';

export type ComplianceEvidenceFreshness = 'CURRENT' | 'STALE';
export type ComplianceEvidenceSourceType = 'DOCUMENT_VERSION' | 'CLIENT_FACT' | 'OBSERVATION' | 'EXTERNAL_REFERENCE';
export type ComplianceEvidenceStatus = 'PROVIDED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';

export type ComplianceEvidenceRecordSummary = {
  id?: string;
  title: string;
  description?: string | null;
  status: ComplianceEvidenceStatus | string;
  sourceType?: ComplianceEvidenceSourceType | string;
  documentVersionId?: string | null;
  validFrom: string | null;
  validUntil: string | null;
  freshness: ComplianceEvidenceFreshness;
};

export type ComplianceEvidenceRecord = {
  id: string;
  clientId: string;
  sourceType: ComplianceEvidenceSourceType;
  status: ComplianceEvidenceStatus;
  title: string;
  description?: string | null;
  documentVersionId?: string | null;
  clientFactId?: string | null;
  observationId?: string | null;
  externalReference?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type ComplianceClientControl = {
  id: string;
  clientId: string;
  controlDefinitionId: string;
  implementationStatus: string;
};

export type ComplianceOverview = { findings: ComplianceFindingView[] };

export type ComplianceControlEntry = {
  title: string;
  controlDefinitionId?: string;
  controlId?: string | null;
  description?: string | null;
  type?: string | null;
  reviewCadenceDays?: number | null;
  implementationStatus: string | null;
  owner: string | null;
  lastReviewedAt?: string | null;
  nextReviewAt: string | null;
  evidenceSummary: { acceptedCurrent: number; stale: number; missing: boolean };
  evidence?: ComplianceEvidenceRecordSummary[] | null;
  gap?: ComplianceControlGap | null;
};

export type ComplianceControlSummary = {
  requirements: Array<{
    title: string;
    applicability: string;
    controls: ComplianceControlEntry[];
  }>;
};

export const complianceOverviewApi = {
  getOverview(clientId: string) {
    return fetchApi<ComplianceOverview>(`/compliance/clients/${encodeURIComponent(clientId)}/overview`);
  },
  getControls(clientId: string) {
    return fetchApi<ComplianceControlSummary>(`/clients/${encodeURIComponent(clientId)}/compliance/controls`);
  },
  createClientControl(clientId: string, input: { controlDefinitionId: string; implementationStatus?: string }) {
    return fetchApi<ComplianceClientControl>(`/clients/${encodeURIComponent(clientId)}/compliance/controls`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateClientControl(clientId: string, controlId: string, input: { implementationStatus?: string }) {
    return fetchApi<ComplianceClientControl>(`/clients/${encodeURIComponent(clientId)}/compliance/controls/${encodeURIComponent(controlId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  createEvidenceRecord(
    clientId: string,
    input: {
      sourceType: ComplianceEvidenceSourceType;
      title: string;
      description?: string;
      externalReference?: string;
      documentVersionId?: string;
      clientFactId?: string;
      observationId?: string;
    },
  ) {
    return fetchApi<ComplianceEvidenceRecord>(`/clients/${encodeURIComponent(clientId)}/compliance/evidence`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  reviewEvidenceRecord(clientId: string, evidenceId: string, input: { status: ComplianceEvidenceStatus }) {
    return fetchApi<ComplianceEvidenceRecord>(`/clients/${encodeURIComponent(clientId)}/compliance/evidence/${encodeURIComponent(evidenceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  linkEvidenceToControl(clientId: string, controlId: string, evidenceId: string) {
    return fetchApi<{ id: string }>(`/clients/${encodeURIComponent(clientId)}/compliance/controls/${encodeURIComponent(controlId)}/evidence/${encodeURIComponent(evidenceId)}`, {
      method: 'POST',
    });
  },
};

