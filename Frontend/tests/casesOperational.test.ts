import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isClosedCase, matchesCaseScope, casePriorityLabel, caseStatusLabel, caseDeadline, attentionForCase, matchesOperationalFilter, nextActionLabel, loadCaseAttentionPages, type CaseAttentionState } from '../src/lib/casesOperational';
import type { CaseListItem, CaseAttentionItem } from '../src/lib/api';
const row = (id: string, status = 'DRAFT') => ({ id, status, assignedLawyer: { id: 'me' }, deadline: null } as CaseListItem);
const attention = (id: string, urgency: CaseAttentionItem['attention']['urgency'] = 'ATTENTION'): CaseAttentionItem => ({ case: { id }, attention: { caseId: id, urgency, nextAction: null, signals: [], lastMeaningfulChangeAt: null } });
test('canonical closed scope, paused scope, and assignment are independent', () => {
  for (const status of ['FINAL', 'CANCELLED', 'ARCHIVED']) { assert.ok(isClosedCase(status)); assert.ok(!matchesCaseScope(row('a', status), 'MINE', 'me')); }
  assert.ok(!isClosedCase('ON_HOLD'));
  assert.ok(matchesCaseScope(row('a', 'ON_HOLD'), 'MINE', 'me'));
  assert.ok(!matchesCaseScope(row('a'), 'MINE', 'other'));
  assert.ok(!matchesCaseScope(row('a'), 'MINE'));
  assert.equal(caseStatusLabel('ON_HOLD'), 'Szünetel');
  assert.equal(caseStatusLabel('unexpected'), 'unexpected');
  assert.equal(casePriorityLabel('URGENT'), 'Sürgős'); assert.equal(casePriorityLabel('HIGH'), 'Magas');
});
test('deadline is localized and historical closed deadlines do not demand action', () => {
  const unknown = { state: 'UNKNOWN' } as const;
  const item = { deadline: '2020-01-01T12:00:00Z', status: 'DRAFT' };
  assert.equal(caseDeadline(item, unknown).label, new Date(item.deadline).toLocaleDateString());
  assert.equal(caseDeadline(item, unknown).sourceLabel, 'Ügyhatáridő');
  assert.ok(caseDeadline(item, unknown).overdue);
  assert.ok(!caseDeadline({ ...item, status: 'FINAL' }, unknown).overdue);
  assert.equal(caseDeadline({ deadline: null, status: 'DRAFT' }, unknown).label, 'Határidőadat nem érhető el');
  assert.equal(caseDeadline({ deadline: null, status: 'DRAFT' }, unknown).state, 'UNKNOWN');
});
test('Határidős filter evidence is always observable in the displayed deadline', () => {
  const now = Date.parse('2026-09-01T00:00:00Z');
  const noCaseDeadline = { deadline: null, status: 'DRAFT' } as CaseListItem;
  const known = (signals: CaseAttentionItem['attention']['signals']): CaseAttentionState =>
    ({ state: 'KNOWN', attention: { caseId: 'x', urgency: 'ATTENTION', nextAction: null, signals, lastMeaningfulChangeAt: null } });
  const signal = (label: string, dueAt: string | null): CaseAttentionItem['attention']['signals'][number] =>
    ({ type: 'TEST', severity: 'ATTENTION', label, dueAt, sourceType: 'TEST' });
  // No Case.deadline + KNOWN signal dueAt: row qualifies and shows the same
  // earliest dueAt with the signal's human-readable label, never a source id.
  const dated = known([signal('Dokumentum-review', '2026-09-08T00:00:00Z'), signal('Feladat', '2026-09-05T00:00:00Z'), signal('Bejelentkezés', null)]);
  assert.ok(matchesOperationalFilter(noCaseDeadline, dated, 'deadline'));
  const shown = caseDeadline(noCaseDeadline, dated, now);
  assert.equal(shown.state, 'KNOWN');
  assert.equal(shown.dueAt?.toISOString(), '2026-09-05T00:00:00.000Z');
  assert.equal(shown.label, new Date('2026-09-05T00:00:00Z').toLocaleDateString());
  assert.equal(shown.sourceLabel, 'Feladat');
  assert.ok(!shown.overdue);
  // Overdue styling follows the resolved dueAt; closed cases never demand it,
  // ON_HOLD remains non-closed.
  const pastDue = known([signal('Feladat', '2020-01-01T00:00:00Z')]);
  assert.ok(caseDeadline(noCaseDeadline, pastDue, now).overdue);
  for (const status of ['FINAL', 'CANCELLED', 'ARCHIVED']) assert.ok(!caseDeadline({ deadline: null, status }, pastDue, now).overdue);
  assert.ok(caseDeadline({ deadline: null, status: 'ON_HOLD' }, pastDue, now).overdue);
  // KNOWN attention without any dueAt: truthful neutral label, not filtered in.
  const noDue = known([signal('Bejelentkezés', null)]);
  assert.ok(!matchesOperationalFilter(noCaseDeadline, noDue, 'deadline'));
  assert.equal(caseDeadline(noCaseDeadline, noDue).label, 'Nincs megjeleníthető határidő');
  assert.equal(caseDeadline(noCaseDeadline, noDue).state, 'KNOWN');
  // UNKNOWN coverage is never authoritative and never satisfies Határidős.
  const unknown = { state: 'UNKNOWN' } as const;
  assert.ok(!matchesOperationalFilter(noCaseDeadline, unknown, 'deadline'));
  assert.equal(caseDeadline(noCaseDeadline, unknown).state, 'UNKNOWN');
  assert.equal(caseDeadline(noCaseDeadline, unknown).label, 'Határidőadat nem érhető el');
});
test('bounded pagination joins reordered rows by ID and forwards scope', async () => {
  const calls: unknown[] = [];
  const data = await loadCaseAttentionPages(async (...args) => { calls.push(args); return { items: args[2] === 0 ? Array.from({ length: 50 }, (_, i) => attention('id'+(49-i))) : [attention('target', 'URGENT')] }; }, 'client');
  assert.deepEqual(calls, [['client', 50, 0], ['client', 50, 50]]);
  assert.equal(attentionForCase(data, 'target').state, 'KNOWN');
  const result = attentionForCase(data, 'id0'); assert.ok(result.state === 'KNOWN' && result.attention.caseId === 'id0');
  assert.equal(attentionForCase(data, 'missing').state, 'UNKNOWN');
  let count = 0; await loadCaseAttentionPages(async () => { count++; return { items: Array.from({ length: 50 }, (_, i) => attention(String(i))) }; }); assert.equal(count, 4);
});
test('partial failure retains successful rows, missing remains unknown not NONE', async () => {
  const data = await loadCaseAttentionPages(async (_c, _l, offset) => { if (offset) throw Error('unavailable'); return { items: Array.from({ length: 50 }, (_, i) => attention(String(i), 'NONE')) }; });
  const known = attentionForCase(data, '0'), unknown = attentionForCase(data, 'absent');
  assert.equal(nextActionLabel(known), 'Nincs megjeleníthető következő teendő');
  assert.equal(nextActionLabel(unknown), 'Teendőadat nem érhető el');
  assert.ok(!matchesOperationalFilter(row('absent'), unknown, 'attention'));
  for (const urgency of ['ATTENTION', 'URGENT'] as const) assert.ok(matchesOperationalFilter(row('a'), { state: 'KNOWN', attention: attention('a', urgency).attention }, 'attention'));
  assert.ok(matchesOperationalFilter({ ...row('a'), deadline: '2030-01-01' }, unknown, 'deadline'));
  assert.ok(!matchesOperationalFilter(row('a'), known, 'attention'));
});
test('list preserves navigation, creation and existing filter wiring', () => {
  const src = readFileSync('src/components/CasesList.tsx', 'utf8');
  assert.ok(src.includes('Hozzám rendelve')); assert.ok(!src.includes('Rám vár'));
  assert.ok(src.includes('getCases(1, 200'));
  assert.ok(src.includes('onClick={() => router.push(`/cases/${item.id}`)}'));
  assert.match(src, /Ügy megnyitása/); assert.match(src, /onClick=\{\(\) => setShowNewCaseModal\(true\)\}/);
  assert.match(src, /practiceMatch && clientIdMatch && clientMatch && workPriorityMatch/);
  assert.match(src, /getClientAccentBorderClass\(item.clientColorKey\)/);
});
