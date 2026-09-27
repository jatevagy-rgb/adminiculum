import { fetchApi } from './api';

export type ContractDateCandidateStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export type ContractDateCandidateDTO = {
  id: string;
  documentId: string;
  documentVersionId: string;
  dateType: string;
  proposedDate: string;
  sourceExcerpt: string;
  excerptStartOffset: number | null;
  excerptEndOffset: number | null;
  excerptHash: string | null;
  provenance: string;
  aiPromptDraftId: string | null;
  status: ContractDateCandidateStatus;
  targetContractId: string | null;
  targetOccurrenceId: string | null;
  decisionReason: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type ExtractCandidatesResult = {
  items: ContractDateCandidateDTO[];
  detectedCount: number;
  createdCount: number;
  skippedExisting: number;
};

export const contractDateCandidatesApi = {
  list(documentId: string, status?: string) {
    const query = status ? `?documentId=${encodeURIComponent(documentId)}&status=${encodeURIComponent(status)}` : `?documentId=${encodeURIComponent(documentId)}`;
    return fetchApi<{ items: ContractDateCandidateDTO[] }>(`/contract-date-candidates${query}`);
  },
  extract(documentVersionId: string) {
    return fetchApi<ExtractCandidatesResult>('/contract-date-candidates/extract', {
      method: 'POST',
      body: JSON.stringify({ documentVersionId }),
    });
  },
  confirm(candidateId: string, payload: { targetContractId: string; obligationId?: string | null }) {
    return fetchApi<{ candidate: ContractDateCandidateDTO; canonical: unknown }>(
      `/contract-date-candidates/${encodeURIComponent(candidateId)}/confirm`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  },
  reject(candidateId: string, reason?: string | null) {
    return fetchApi<ContractDateCandidateDTO>(
      `/contract-date-candidates/${encodeURIComponent(candidateId)}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  },
};

export function contractDateTypeLabel(dateType: string): string {
  const labels: Record<string, string> = {
    EFFECTIVE: 'Hatálybalépés',
    EXPIRY: 'Lejárat',
    NEXT_CRITICAL: 'Következő kritikus dátum',
    PAYMENT_DUE: 'Fizetési határidő',
    MILESTONE: 'Mérföldkő / teljesítési határidő',
    NOTICE: 'Felmondási / értesítési határidő',
    OTHER: 'Egyéb szerződéses határidő',
  };
  return labels[dateType] || dateType;
}

export function candidateStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Jóváhagyásra vár',
    CONFIRMED: 'Megerősítve',
    REJECTED: 'Elutasítva',
  };
  return labels[status] || status;
}

export function formatCandidateDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hu-HU');
}
