import { fetchApi } from './api';
export type WorkbenchRow = {
  id: string; kind: 'MISSING_FACT' | 'SUBMISSION' | 'STALE_EVIDENCE' | 'PROPOSAL' | 'SOURCE_IMPACT'; sourceId: string; clientId: string; caseId: string | null; subject: string | null;
  title: string; status: string; since: string | null; dueAt: string | null; ownerId: string | null; ownerName?: string | null; readOnly: boolean; reason: string | null;
  action: 'REQUIREMENTS' | 'SUBMISSION_REVIEW' | 'EVIDENCE_REVIEW' | 'PROPOSAL_REVIEW' | 'SOURCE_REVIEW' | 'IMPACT_DECISION';
  source?: { observationId: string; legalSourceId: string; legalSourceVersionId: string; versionKey: string; sourceKey: string; event: string; reviewedNote: string | null; revision: string; requirementVersions: Array<{ id: string; title: string }>; proposals: Array<{ id: string; title: string }>; decision: { kind: string; note: string; decidedAt: string; result: { caseId?: string; taskId?: string; requirementVersionId?: string } } | null };
};
export type ImpactDecisionInput = { sourceRevision: string; kind: 'NO_ACTION' | 'REEVALUATE' | 'REMEDIATION' | 'RULE_REVIEW'; note: string; proposalId?: string; requirementVersionId?: string; draft?: { versionKey: string; title: string; normativeStatement: string; effectiveFrom: string } };
export type AcceptanceTarget = { id: string; key: string; valueType: 'BOOLEAN' | 'NUMBER' | 'STRING' };
export type Workbench = { acceptanceTargets: AcceptanceTarget[]; clientId: string; rows: WorkbenchRow[]; generatedAt: string; truncated: Record<string, boolean> };
export const complianceWorkbenchApi = {
  get: (clientId: string) => fetchApi<Workbench>(`/compliance/clients/${encodeURIComponent(clientId)}/workbench`, { authContext: 'workforce' }),
  decide: (clientId: string, observationId: string, input: ImpactDecisionInput) => fetchApi(`/compliance/clients/${encodeURIComponent(clientId)}/source-impacts/${encodeURIComponent(observationId)}/decision`, { method: 'POST', body: JSON.stringify(input), authContext: 'workforce' }),
};
