import { fetchApi } from './api';
import type { ComplianceFindingView } from '@/components/clients/compliance/ComplianceOverview';

export type ComplianceOverview = { findings: ComplianceFindingView[] };
export type ComplianceControlSummary = {
  requirements: Array<{
    title: string;
    applicability: string;
    controls: Array<{
      title: string;
      implementationStatus: string | null;
      owner: string | null;
      nextReviewAt: string | null;
      evidenceSummary: { acceptedCurrent: number; stale: number; missing: boolean };
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
