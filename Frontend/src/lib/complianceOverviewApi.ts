import { fetchApi } from './api';
import type { ComplianceControlGap, ComplianceFindingView } from '@/components/clients/compliance/ComplianceOverview';

export type ComplianceEvidenceFreshness = 'CURRENT' | 'STALE';

export type ComplianceEvidenceRecordSummary = {
  title: string;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
  freshness: ComplianceEvidenceFreshness;
};

export type ComplianceOverview = { findings: ComplianceFindingView[] };
export type ComplianceControlSummary = {
  requirements: Array<{
    title: string;
    applicability: string;
    controls: Array<{
      title: string;
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
    }>;
  }>;
};

export const complianceOverviewApi = {
  getOverview(clientId: string) {
    return fetchApi<ComplianceOverview>(`/compliance/clients/${encodeURIComponent(clientId)}/overview`);
  },
  getControls(clientId: string) {
    return fetchApi<ComplianceControlSummary>(`/clients/${encodeURIComponent(clientId)}/compliance/controls`);
  },
};
