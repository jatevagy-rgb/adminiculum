import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeGrowQuestions, parseGrowDraft, pruneGrowAnswers } from '../src/lib/growAdaptiveRunner';

const question = (questionKey: string, when?: { mode: 'ALL' | 'ANY'; triggers: Array<{ questionKey: string; answers: string[] }> }) => ({ questionKey, promptHu: questionKey, helpTextHu: null, options: ['YES', 'NO', 'UNKNOWN'].map(value => ({ value, labelHu: value })), when });
const questions = [question('first'), question('followup', { mode: 'ALL', triggers: [{ questionKey: 'first', answers: ['YES'] }] }), question('last', { mode: 'ANY', triggers: [{ questionKey: 'followup', answers: ['YES'] }] })];

test('back navigation removes now-hidden answers and their descendants', () => {
  const previous = { first: 'YES', followup: 'YES', last: 'NO' };
  assert.equal(activeGrowQuestions(questions, previous).length, 3);
  const changed = { ...previous, first: 'NO' };
  assert.deepEqual(pruneGrowAnswers(questions, changed), { first: 'NO' });
  assert.deepEqual(activeGrowQuestions(questions, changed).map(q => q.questionKey), ['first']);
  assert.deepEqual(pruneGrowAnswers(questions, { first: 'INVALID', foreign: 'YES' }), {});
});

test('browser resume rejects other identity/workspace scopes and malformed drafts', () => {
  const draft = { scope: 'identity-a-workspace-a', packKey: 'test-pack', version: 2, index: 1, processId: 'process-a', idempotencyKey: 'retry-key', answers: { first: 'YES' } };
  assert.deepEqual(parseGrowDraft(JSON.stringify(draft), draft.scope), draft);
  assert.equal(parseGrowDraft(JSON.stringify(draft), 'identity-b-workspace-a'), null);
  assert.equal(parseGrowDraft(JSON.stringify(draft), 'identity-a-workspace-b'), null);
  assert.equal(parseGrowDraft('{invalid', draft.scope), null);
  assert.equal(parseGrowDraft(JSON.stringify({ ...draft, answers: ['YES'] }), draft.scope), null);
  assert.equal(parseGrowDraft(JSON.stringify({ ...draft, index: -1 }), draft.scope), null);
});
