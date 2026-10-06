import type { PortalGrowAssessmentQuestion } from './clientPortalApi';

/** Interpret only server-owned metadata. No pack/question-specific routing here. */
export function activeGrowQuestions(questions: PortalGrowAssessmentQuestion[], answers: Record<string, string>) {
  const active: PortalGrowAssessmentQuestion[] = [];
  for (const q of questions) {
    const tests = q.when?.triggers.map(t => active.some(previous => previous.questionKey === t.questionKey) && t.answers.includes(answers[t.questionKey]));
    if (!tests || (q.when?.mode === 'ALL' ? tests.every(Boolean) : tests.some(Boolean))) active.push(q);
  }
  return active;
}

export function pruneGrowAnswers(questions: PortalGrowAssessmentQuestion[], answers: Record<string, string>) {
  return Object.fromEntries(activeGrowQuestions(questions, answers).flatMap(q => q.options.some(o => o.value === answers[q.questionKey]) ? [[q.questionKey, answers[q.questionKey]]] : []));
}

export type GrowDraft = { scope: string; packKey: string; version: number; answers: Record<string, string>; index: number; processId: string; idempotencyKey: string };
export const growDraftKey = (scope: string) => `adminiculum:grow-v2:${scope}`;
export function parseGrowDraft(raw: string | null, scope: string): GrowDraft | null {
  try {
    const d = JSON.parse(raw || 'null');
    if (!d || d.scope !== scope || typeof d.packKey !== 'string' || !Number.isInteger(d.version) || !Number.isInteger(d.index) || d.index < 0 || typeof d.processId !== 'string' || typeof d.idempotencyKey !== 'string' || !d.answers || Array.isArray(d.answers) || Object.values(d.answers).some(v => typeof v !== 'string')) return null;
    return d;
  } catch { return null; }
}
