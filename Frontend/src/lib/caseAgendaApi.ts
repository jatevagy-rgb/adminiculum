import { fetchApi } from './api';

// Canonical single-Case deadline projection for the Case Workspace. Reuses the
// existing GET /cases/:caseId/deadlines endpoint, which runs the same agenda
// engine (scope=CASE) as the global Agenda, so the Case Workspace never queries a
// second deadline store or engine.

export type CaseAgendaUrgency = 'OVERDUE' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'LATER';

export type CaseAgendaItem = {
  id: string;
  sourceType: 'TASK' | 'CASE_DEADLINE';
  caseId: string;
  title: string;
  dueAt: string;
  urgency: CaseAgendaUrgency;
  responsibility: {
    assignee?: { id: string; displayName: string } | null;
    responsibleLawyer?: { id: string; displayName: string } | null;
  };
  href?: string | null;
};

export type CaseAgendaResponse = {
  caseId: string;
  generatedAt: string;
  timezone: string;
  items: CaseAgendaItem[];
  pagination: { limit: number; offset: number; hasMore: boolean };
};

export async function getCaseAgenda(caseId: string, status: 'OPEN' | 'COMPLETED' | 'ALL' = 'OPEN'): Promise<CaseAgendaResponse> {
  return fetchApi<CaseAgendaResponse>(`/cases/${encodeURIComponent(caseId)}/deadlines?status=${status}`);
}
