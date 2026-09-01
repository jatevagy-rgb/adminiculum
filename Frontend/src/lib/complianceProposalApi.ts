import { fetchApi } from './api';

export type ComplianceProposalStatus = 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'STALE';
export type ComplianceProposalKind = 'REMEDIATION' | 'DISCLOSURE' | 'DOCUMENT_UPDATE' | 'CONTROL_IMPLEMENTATION' | 'REVIEW' | 'OPEN_MATTER';

export type ComplianceProposal = {
  id: string;
  clientId: string;
  findingId: string;
  proposalKind: ComplianceProposalKind;
  actionIntentKey: string;
  title: string;
  description?: string | null;
  suggestedAction?: string | null;
  deadline?: string | null;
  status: ComplianceProposalStatus;
  case?: { id: string; caseNumber: string; title: string } | null;
  taskId?: string | null;
  task?: { id: string; title: string; status: string; caseId: string } | null;
}

export const proposalKinds: Array<{ value: ComplianceProposalKind; label: string; intent: string }> = [
  { value: 'REMEDIATION', label: 'Megfelelési hiány kezelése', intent: 'REMEDIATE_COMPLIANCE_GAP' },
  { value: 'DISCLOSURE', label: 'Közzététel', intent: 'DISCLOSE_REQUIREMENT' },
  { value: 'DOCUMENT_UPDATE', label: 'Dokumentáció frissítése', intent: 'UPDATE_DOCUMENTATION' },
  { value: 'CONTROL_IMPLEMENTATION', label: 'Kontroll bevezetése', intent: 'IMPLEMENT_CONTROL' },
  { value: 'REVIEW', label: 'Alkalmazhatóság áttekintése', intent: 'REVIEW_APPLICABILITY' },
  { value: 'OPEN_MATTER', label: 'Nyitott ügy kezelése', intent: 'ADDRESS_OPEN_MATTER' },
];

export async function listComplianceProposals(clientId: string): Promise<ComplianceProposal[]> {
  return fetchApi<ComplianceProposal[]>(`/compliance/proposals?clientId=${encodeURIComponent(clientId)}`);
}

export async function createComplianceProposal(input: Record<string, unknown>): Promise<ComplianceProposal> {
  return fetchApi<ComplianceProposal>('/compliance/proposals', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateComplianceProposal(id: string, input: Record<string, unknown>): Promise<ComplianceProposal> {
  return fetchApi<ComplianceProposal>(`/compliance/proposals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function bindComplianceProposal(id: string, caseId: string): Promise<ComplianceProposal> {
  return fetchApi<ComplianceProposal>(`/compliance/proposals/${encodeURIComponent(id)}/bind-case`, { method: 'POST', body: JSON.stringify({ caseId }) });
}

export async function confirmComplianceProposal(id: string): Promise<{ id: string; title: string; caseId: string; status: string }> {
  return fetchApi(`/compliance/proposals/${encodeURIComponent(id)}/confirm`, { method: 'POST' });
}

export async function rejectComplianceProposal(id: string): Promise<ComplianceProposal> {
  return fetchApi<ComplianceProposal>(`/compliance/proposals/${encodeURIComponent(id)}/reject`, { method: 'POST' });
}

export type StartedComplianceCase = {
  case: { id: string; caseNumber: string; title: string; clientId: string } | null;
  task: { id: string; title: string; status: string; caseId: string } | null;
};

// "Ügy indítása" — elevate a proposal into a new (or already-linked) Case with a
// Work Package and a first Task, reusing the canonical Case creation on the server.
export async function startCaseFromComplianceProposal(id: string): Promise<StartedComplianceCase> {
  return fetchApi<StartedComplianceCase>(`/compliance/proposals/${encodeURIComponent(id)}/start-case`, { method: 'POST' });
}
