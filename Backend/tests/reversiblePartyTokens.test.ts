import { assignReversibleTokens } from '../src/modules/anonymize/reversibleTokens';
import { rehydrateDocument } from '../src/modules/anonymize/rehydration';

test('two parties with the same role receive stable distinct tokens and round-trip', () => {
  const parties = [{ value: 'Alpha Person', token: '[ÜGYFÉL]' }, { value: 'Beta Person', token: '[ÜGYFÉL]' }];
  const assigned = assignReversibleTokens(parties);
  expect(assigned).toEqual(assignReversibleTokens([...parties].reverse()));
  expect(assigned.map((item) => item.token)).toEqual(['[ÜGYFÉL_1]', '[ÜGYFÉL_2]']);
  const mapping = assigned.map(({ value, token }) => ({ original: value, replacement: token }));
  const restored = rehydrateDocument('[ÜGYFÉL_1] + [ÜGYFÉL_2]', mapping);
  expect(restored.rehydrationStatus).toBe('COMPLETE');
  expect(restored.rehydratedContent).toBe('Alpha Person + Beta Person');
});

test('ambiguous historical mappings fail closed even when the ambiguous token was omitted', () => {
  const mapping = [{ original: 'Alpha Person', replacement: '[ÜGYFÉL]' }, { original: 'Beta Person', replacement: '[ÜGYFÉL]' }];
  for (const response of ['[ÜGYFÉL] válasza', 'Összefoglaló']) {
    expect(rehydrateDocument(response, mapping)).toMatchObject({ success: false, rehydrationStatus: 'FAILED', rehydratedContent: null });
  }
});

test('restored bracketed originals are inserted literally and never expanded a second time', () => {
  expect(rehydrateDocument('[ÜGYFÉL_1] és [ÜGYFÉL_2]', [
    { original: 'Alpha [ÜGYFÉL_2]', replacement: '[ÜGYFÉL_1]' },
    { original: 'Beta Person', replacement: '[ÜGYFÉL_2]' },
  ]).rehydratedContent).toBe('Alpha [ÜGYFÉL_2] és Beta Person');
});
