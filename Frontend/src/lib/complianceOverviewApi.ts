import { fetchApi } from './api';
import type { ComplianceControlGap, ComplianceFindingView } from '@/components/clients/compliance/ComplianceOverview';

export type ComplianceOverview = { findings: ComplianceFindingView[] };

export type ComplianceEvidenceSourceType =
  | 'DOCUMENT_VERSION'
  | 'CLIENT_FACT'
  | 'OBSERVATION'
  | 'EXTERNAL_REFERENCE';

export type ComplianceEvidenceStatus =
  | 'PROVIDED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED';

export type ComplianceEvidenceRecordView = {
  id: string;
  title: string;
  description?: string | null;
  status: ComplianceEvidenceStatus;
  sourceType: ComplianceEvidenceSourceType;
  validFrom: string | null;
  validUntil: string | null;
};

export type ComplianceControlSummary = {
  requirements: Array<{
    title: string;
    applicability: string;
    controls: Array<{
      title: string;
      controlDefinitionId?: string;
      controlId?: string | null;
      implementationStatus: string | null;
      owner: string | null;
      lastReviewedAt?: string | null;
      nextReviewAt: string | null;
      evidence?: ComplianceEvidenceRecordView[];
      evidenceSummary: { acceptedCurrent: number; stale: number; missing: boolean };
      gap?: ComplianceControlGap | null;
    }>;
  }>;
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
