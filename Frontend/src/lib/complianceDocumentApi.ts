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

export const complianceDocumentApi = {
  list(clientId: string) {
    return fetchApi<ComplianceDocumentsReadModel>(`/compliance/clients/${encodeURIComponent(clientId)}/documents`);
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
