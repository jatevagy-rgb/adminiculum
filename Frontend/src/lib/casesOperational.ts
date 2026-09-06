import type { CaseListItem, CaseAttentionItem } from './api';

export const isClosedCase = (status: string) => ['FINAL', 'CANCELLED', 'ARCHIVED'].includes(status);
export const matchesCaseScope = (item: CaseListItem, scope: string, userId?: string) =>
  scope === 'CLOSED' ? isClosedCase(item.status) : !isClosedCase(item.status) && (scope !== 'MINE' || Boolean(userId && item.assignedLawyer?.id === userId));
const statusLabels: Record<string, string> = {
  CLIENT_INPUT: 'Ügyféltől érkezett', DRAFT: 'Piszkozat', IN_REVIEW: 'Felülvizsgálat alatt',
  APPROVED: 'Jóváhagyva', SENT_TO_CLIENT: 'Ügyfélnek elküldve', CLIENT_FEEDBACK: 'Ügyfél-visszajelzés',
  FINAL: 'Lezárt', ON_HOLD: 'Szünetel', CANCELLED: 'Megszakítva', ARCHIVED: 'Archivált',
};
export const caseStatusLabel = (value: string) => Object.prototype.hasOwnProperty.call(statusLabels, value) ? statusLabels[value] : String(value || 'Ismeretlen').slice(0, 80);
const priorityLabels: Record<string, string> = { URGENT: 'Sürgős', HIGH: 'Magas', MEDIUM: 'Közepes', LOW: 'Alacsony' };
export const casePriorityLabel = (value?: string) => Object.prototype.hasOwnProperty.call(priorityLabels, value || '') ? priorityLabels[value!] : String(value || 'Ismeretlen').slice(0, 80);
export type CaseAttentionState = { state: 'UNKNOWN' } | { state: 'KNOWN'; attention: CaseAttentionItem['attention'] };
export function attentionForCase(items: Map<string, CaseAttentionItem>, id: string): CaseAttentionState {
  const item = items.get(id);
  return item ? { state: 'KNOWN', attention: item.attention } : { state: 'UNKNOWN' };
}
export function matchesOperationalFilter(item: CaseListItem, state: CaseAttentionState, filter: string) {
  if (filter === 'attention') return state.state === 'KNOWN' && ['ATTENTION', 'URGENT'].includes(state.attention.urgency);
  if (filter === 'deadline') return Boolean(item.deadline || (state.state === 'KNOWN' && state.attention.signals.some(signal => signal.dueAt)));
  return true;
}
export function nextActionLabel(state: CaseAttentionState) {
  return state.state === 'UNKNOWN' ? 'Teendőadat nem érhető el' : state.attention.nextAction?.label || 'Nincs megjeleníthető következő teendő';
}
export type CaseDeadlineDisplay = {
  state: 'KNOWN' | 'UNKNOWN';
  dueAt: Date | null;
  label: string;
  sourceLabel?: string;
  overdue: boolean;
};
// The displayed deadline must reflect the exact evidence that satisfies the
// Határidős filter: Case.deadline first, else the earliest dueAt of a KNOWN
// attention signal. UNKNOWN coverage never yields an authoritative label.
export function caseDeadline(item: Pick<CaseListItem, 'deadline' | 'status'>, state: CaseAttentionState, now = Date.now()): CaseDeadlineDisplay {
  const closed = isClosedCase(item.status);
  const caseDueAt = item.deadline ? new Date(item.deadline) : null;
  if (caseDueAt && Number.isFinite(caseDueAt.getTime())) {
    return { state: 'KNOWN', dueAt: caseDueAt, label: caseDueAt.toLocaleDateString(), sourceLabel: 'Ügyhatáridő', overdue: caseDueAt.getTime() < now && !closed };
  }
  if (state.state === 'KNOWN') {
    const earliest = state.attention.signals
      .filter((signal) => Boolean(signal.dueAt))
      .map((signal) => ({ dueAt: new Date(String(signal.dueAt)), sourceLabel: signal.label }))
      .filter((entry) => Number.isFinite(entry.dueAt.getTime()))
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
    if (earliest) {
      return { state: 'KNOWN', dueAt: earliest.dueAt, label: earliest.dueAt.toLocaleDateString(), sourceLabel: earliest.sourceLabel || undefined, overdue: earliest.dueAt.getTime() < now && !closed };
    }
    return { state: 'KNOWN', dueAt: null, label: 'Nincs megjeleníthető határidő', overdue: false };
  }
  return { state: 'UNKNOWN', dueAt: null, label: 'Határidőadat nem érhető el', overdue: false };
}

// Coverage is bounded, not a portfolio-wide completeness claim. Preserve successful
// pages if a later request fails; every missing case remains UNKNOWN.
export async function loadCaseAttentionPages(fetchPage: (clientId?: string, limit?: number, offset?: number) => Promise<{ items: CaseAttentionItem[] }>, clientId?: string) {
  const result = new Map<string, CaseAttentionItem>();
  for (let offset = 0; offset < 200; offset += 50) {
    try {
      const page = await fetchPage(clientId, 50, offset);
      for (const item of page.items) result.set(item.case.id, item);
      if (page.items.length < 50) break;
    } catch { break; }
  }
  return result;
}
