/**
 * CP1 internal triage API client (workforce auth context). Types are separate
 * from the customer DTO: the internal detail intentionally exposes triage fields
 * that must never reach a customer.
 */
import { fetchApi } from './api';

export interface IntakeQueueItem {
  id: string;
  workspaceId: string;
  requesterMembershipId: string;
  organizationGroupId: string | null;
  subject: string;
  urgency: string;
  requestedDeadline: string | null;
  status: string;
  submittedAt: string | null;
  triagedByInternalUserId: string | null;
  revision: number;
  updatedAt: string | null;
}

export interface IntakeQueuePage {
  items: IntakeQueueItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface IntakeTriageAttachment {
  id: string;
  fileName: string;
  declaredMimeType: string | null;
  detectedMimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  status: string;
  uploadedAt: string | null;
  scannedAt: string | null;
}

export interface IntakeTriageDetail {
  id: string;
  workspace: { id: string; name: string; clientId: string; mode: string; status: string } | null;
  organizationGroup: { id: string; name: string } | null;
  requester: { id: string; displayName: string; normalizedEmail: string; accountType: string; status: string } | null;
  subject: string;
  descriptionSafe: string;
  urgency: string;
  requestedDeadline: string | null;
  status: string;
  revision: number;
  submittedAt: string | null;
  triagedAt: string | null;
  triagedByInternalUserId: string | null;
  customerResponseSafe: string | null;
  linkedCase: { id: string; caseNumber: string; title: string; clientId: string; status: string } | null;
  attachments: IntakeTriageAttachment[];
  informationRequests: unknown[];
  history: Array<{ id: string; action: string; actorId: string; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
  availableTransitions: string[];
}

const BASE = '/client-identity/admin/intakes';

export async function listIntakeQueue(query: Record<string, string | number | undefined> = {}): Promise<IntakeQueuePage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  return fetchApi<IntakeQueuePage>(`${BASE}?${params.toString()}`);
}

export async function getIntakeDetail(intakeId: string): Promise<IntakeTriageDetail> {
  return fetchApi<IntakeTriageDetail>(`${BASE}/${encodeURIComponent(intakeId)}`);
}

async function action<T = IntakeTriageDetail>(intakeId: string, path: string, body?: Record<string, unknown>): Promise<T> {
  return fetchApi<T>(`${BASE}/${encodeURIComponent(intakeId)}/${path}`, { method: 'POST', body: JSON.stringify(body || {}) });
}

export const startTriage = (id: string, expectedRevision?: number) => action(id, 'start-triage', { expectedRevision });
export const requestMoreInformation = (id: string, body: Record<string, unknown>) => action(id, 'request-more-information', body);
export const declineIntake = (id: string, body: Record<string, unknown>) => action(id, 'decline', body);
export const linkExistingCase = (id: string, body: Record<string, unknown>) => action(id, 'link-existing-case', body);
export const convertNewCase = (id: string, body: Record<string, unknown>) => action(id, 'convert-new-case', body);
export const approveRequesterAccess = (id: string, permissions: string[]) => action(id, 'approve-requester-access', { permissions });
export const publishInitialSnapshot = (id: string, body: Record<string, unknown>) => action(id, 'publish-initial-snapshot', body);
export const approvedConversion = (id: string, body: Record<string, unknown>) => action(id, 'approved-conversion', body);
export const closeIntake = (id: string, expectedRevision?: number) => action(id, 'close', { expectedRevision });
