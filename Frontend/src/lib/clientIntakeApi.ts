/**
 * CP1 customer intake API client. Faithful types mirror the backend customer-safe
 * DTO (intakeService.toCustomerDto) — never an internal interface. All calls run
 * in the customer auth context (Bearer + x-client-portal-workspace header added
 * by fetchApi).
 */
import { fetchApi } from './api';

export interface CustomerIntakeAttachment {
  reference: string;
  fileName: string;
  sizeBytes: number | null;
  state: 'ready-for-review' | 'not-accepted' | 'processing-unavailable' | string;
  uploadedAt: string | null;
}

export interface CustomerIntakeRequestField {
  reference: string;
  label: string;
  helpText: string | null;
  type: string;
  required: boolean;
  maxLength: number | null;
  options: unknown;
}

export interface CustomerIntakeInformationRequest {
  reference: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  fields: CustomerIntakeRequestField[];
}

export interface CustomerIntake {
  reference: string;
  subject: string;
  description: string;
  organizationGroupName: string | null;
  urgency: string;
  requestedDeadline: string | null;
  status: { code: string; label: string };
  submittedAt: string | null;
  updatedAt: string | null;
  officeResponse: string | null;
  linkedPublicCaseReference: string | null;
  allowedActions: { update: boolean; submit: boolean; withdraw: boolean; respond: boolean };
  informationRequest: CustomerIntakeInformationRequest | null;
  attachments: CustomerIntakeAttachment[];
}

export interface CustomerIntakePage {
  items: CustomerIntake[];
  total: number;
  limit: number;
  offset: number;
}

export interface CustomerOrganizationUnit {
  id: string;
  name: string;
  descriptionSafe: string | null;
}

const CUSTOMER = { authContext: 'customer' as const };

export async function listOwnIntakes(limit = 20, offset = 0): Promise<CustomerIntakePage> {
  return fetchApi<CustomerIntakePage>(`/client-portal/org/intakes?limit=${limit}&offset=${offset}`, { ...CUSTOMER, suppressErrorStatuses: [401, 403, 409, 503], suppressErrorLogging: true });
}

export async function getIntake(intakeId: string): Promise<CustomerIntake> {
  return fetchApi<CustomerIntake>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}`, { ...CUSTOMER, suppressErrorStatuses: [401, 403, 404, 409, 503], suppressErrorLogging: true });
}

export async function createIntake(payload: Record<string, unknown>): Promise<CustomerIntake> {
  return fetchApi<CustomerIntake>('/client-portal/org/intakes', { ...CUSTOMER, method: 'POST', body: JSON.stringify(payload) });
}

export async function updateIntake(intakeId: string, payload: Record<string, unknown>): Promise<CustomerIntake> {
  return fetchApi<CustomerIntake>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}`, { ...CUSTOMER, method: 'PATCH', body: JSON.stringify(payload) });
}

export async function submitIntake(intakeId: string, expectedRevision?: number | null): Promise<CustomerIntake> {
  return fetchApi<CustomerIntake>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}/submit`, { ...CUSTOMER, method: 'POST', body: JSON.stringify({ expectedRevision }) });
}

export async function withdrawIntake(intakeId: string, expectedRevision?: number | null): Promise<CustomerIntake> {
  return fetchApi<CustomerIntake>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}/withdraw`, { ...CUSTOMER, method: 'POST', body: JSON.stringify({ expectedRevision }) });
}

export async function respondToIntake(intakeId: string, requestId: string, answers: Array<Record<string, unknown>>): Promise<CustomerIntake> {
  return fetchApi<CustomerIntake>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}/responses`, { ...CUSTOMER, method: 'POST', body: JSON.stringify({ requestId, answers }) });
}

export async function addIntakeAttachment(intakeId: string, payload: Record<string, unknown>): Promise<CustomerIntakeAttachment> {
  return fetchApi<CustomerIntakeAttachment>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}/attachments`, { ...CUSTOMER, method: 'POST', body: JSON.stringify(payload) });
}

export async function listMemberUnits(): Promise<{ items: CustomerOrganizationUnit[] }> {
  return fetchApi<{ items: CustomerOrganizationUnit[] }>('/client-portal/org/units', { ...CUSTOMER, suppressErrorStatuses: [401, 403, 409, 503], suppressErrorLogging: true });
}
