import { fetchApi } from './api';

export type ComplianceDocumentAudience = 'INTERNAL_ANALYSIS' | 'CLIENT_POLICY';

export type ComplianceDocumentLink = {
  id: string;
  documentId: string;
  title: string;
  latestVersion: { version: number; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
  published: { publicationId: string; clientFacingTitle: string; publishedAt: string | null } | null;
};

export type ComplianceDocumentTopic = {
  requirementKey: string;
  internalAnalysis: ComplianceDocumentLink[];
  clientPolicy: ComplianceDocumentLink[];
};

export type ComplianceDocumentsReadModel = {
  topics: ComplianceDocumentTopic[];
};

export type ComplianceDocumentUploadResult = {
  caseId: string;
  caseCreated: boolean;
  caseReused: boolean;
  documentId: string;
  documentVersionId: string | null;
  complianceDocumentId: string;
  audience: ComplianceDocumentAudience;
  internalAnalysis: { matrixScheduled: boolean } | null;
  publication: { publicationId: string | null; status: string; code?: string } | null;
};

export type ComplianceCaseOption = {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
};

export const complianceDocumentApi = {
  list(clientId: string) {
    return fetchApi<ComplianceDocumentsReadModel>(`/compliance/clients/${encodeURIComponent(clientId)}/documents`);
  },
  caseOptions(clientId: string) {
    return fetchApi<{ items: ComplianceCaseOption[] }>(
      `/compliance/clients/${encodeURIComponent(clientId)}/document-case-options`,
    );
  },
  upload(
    clientId: string,
    input: {
      requirementKey: string;
      intent: ComplianceDocumentAudience;
      fileName: string;
      mimeType: string;
      fileContent: string;
      title?: string;
      caseId?: string;
    },
  ) {
    return fetchApi<ComplianceDocumentUploadResult>(
      `/compliance/clients/${encodeURIComponent(clientId)}/documents/upload`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },
  link(clientId: string, input: { requirementKey: string; documentId: string; audience: ComplianceDocumentAudience }) {
    return fetchApi<{ id: string }>(`/compliance/clients/${encodeURIComponent(clientId)}/documents`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  unlink(clientId: string, complianceDocumentId: string) {
    return fetchApi<{ removed: boolean }>(
      `/compliance/clients/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(complianceDocumentId)}`,
      { method: 'DELETE' },
    );
  },
};
