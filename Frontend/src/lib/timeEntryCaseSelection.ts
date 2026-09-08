import type { CaseListItem, CasesResponse } from './api';

// Follow the canonical list pagination so cases with no time history also appear.
export async function loadTimeEntryCases(
  getPage: (page: number, limit: number, assignedLawyerId?: string, clientId?: string) => Promise<CasesResponse>,
  clientId?: string,
): Promise<CaseListItem[]> {
  const cases: CaseListItem[] = [];
  for (let page = 1; ; page += 1) {
    const result = await getPage(page, 100, undefined, clientId);
    cases.push(...result.data);
    if (!result.data.length || cases.length >= result.pagination.total) return cases;
  }
}

export function timeEntryCaseLabel(row: CaseListItem): string {
  return [row.clientName, row.caseNumber, row.title].filter(Boolean).join(' · ');
}
