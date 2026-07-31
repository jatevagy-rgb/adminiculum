import { fetchApi } from './api';

export type PortalMatter = {
  id: string;
  caseId: string;
  title: string;
  statusLabel: string;
  currentSummary?: string | null;
  waitingOnLabel?: string | null;
  waitingDescription?: string | null;
  nextStepLabel?: string | null;
  nextStepTitle?: string | null;
  nextStepDescription?: string | null;
  estimatedTiming?: string | null;
  responsibleLawyerDisplay?: string | null;
  responsibleLawyerContactSafe?: string | null;
  publicDeadlines?: Array<{ label?: string; dueAt?: string }>;
  publishedAt?: string | null;
  attentionCount?: number;
  documentCount?: number;
  latestUpdateAt?: string | null;
  lastClientVisibleUpdateAt?: string | null;
};

export type PortalDocument = {
  id: string;
  matterId?: string | null;
  matterTitle?: string | null;
  title: string;
  explanation?: string | null;
  versionLabel: string;
  publishedAt?: string | null;
  stateLabel: string;
  downloadAvailable: boolean;
  mimeType?: string | null;
  size?: number | null;
};

export type PortalActionRequest = {
  id: string;
  matterId?: string | null;
  matterTitle?: string | null;
  title: string;
  instructions?: string | null;
  typeLabel: string;
  dueAt?: string | null;
  statusLabel: string;
  readOnlyNote: string;
};

export type PortalSafeUpdate = {
  id: string;
  matterId?: string | null;
  matterTitle?: string | null;
  title: string;
  body: string;
  categoryLabel: string;
  publishedAt?: string | null;
};

export type PortalHome = {
  portalActionsEnabled: boolean;
  identity?: { displayName?: string | null; email?: string | null };
  access: { state: string; grantCount: number };
  attention: PortalActionRequest[];
  matters: PortalMatter[];
  updates: PortalSafeUpdate[];
};

export async function getPortalHome() {
  return fetchApi<PortalHome>('/client-portal/home', { suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export async function getPortalMatters() {
  return fetchApi<{ items: PortalMatter[] }>('/client-portal/matters', { suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export async function getPortalMatter(publicationId: string) {
  return fetchApi<PortalMatter & { documents: PortalDocument[]; actionRequests: PortalActionRequest[]; updates: PortalSafeUpdate[] }>(`/client-portal/matters/${encodeURIComponent(publicationId)}`, { suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalDocument(publicationId: string) {
  return fetchApi<PortalDocument>(`/client-portal/documents/${encodeURIComponent(publicationId)}`, { suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalActionRequest(requestId: string) {
  return fetchApi<PortalActionRequest>(`/client-portal/action-requests/${encodeURIComponent(requestId)}`, { suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalUpdates() {
  return fetchApi<{ items: PortalSafeUpdate[] }>('/client-portal/updates', { suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export function portalDownloadUrl(publicationId: string) {
  const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const root = backendBaseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
  return `${root}/api/v1/client-portal/documents/${encodeURIComponent(publicationId)}/download`;
}
