import { fetchApi } from './api';
import type { ComplianceFindingView } from '@/components/clients/compliance/ComplianceOverview';

export type ComplianceOverview = { findings: ComplianceFindingView[] };

export const complianceOverviewApi = {
  getOverview(clientId: string) {
    return fetchApi<ComplianceOverview>(`/compliance/clients/${encodeURIComponent(clientId)}/overview`);
  },
};
