import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_READER_SEARCH,
  buildReaderHighlightSegments,
  buildReaderHighlightSegmentsInRange,
  findReaderMatchOffsets,
  isReaderSearchSupported,
  readerSearchReducer,
  resolveReaderSearchSurface,
  stepReaderMatchIndex,
} from '../src/lib/documents/readerSearch';

const TEXT = 'alma körte alma';

test('match count is truthful for repeated terms', () => {
  const offsets = findReaderMatchOffsets(TEXT, 'alma');
  assert.equal(offsets.length, 2);
  assert.deepEqual(offsets, [0, 11]);
});

test('next and previous navigate with wrap-around', () => {
  assert.equal(stepReaderMatchIndex(0, 2, 1), 1); // next 1 -> 2
  assert.equal(stepReaderMatchIndex(1, 2, 1), 0); // wraps
  assert.equal(stepReaderMatchIndex(1, 2, -1), 0); // previous 2 -> 1
  assert.equal(stepReaderMatchIndex(0, 2, -1), 1); // wraps
  assert.equal(stepReaderMatchIndex(0, 0, 1), 0); // no matches
});

test('reducer drives SET_QUERY / STEP / RESET', () => {
  let state = EMPTY_READER_SEARCH;
  state = readerSearchReducer(state, { type: 'SET_QUERY', query: 'alma' });
  assert.deepEqual(state, { query: 'alma', activeIndex: 0 });
  state = readerSearchReducer(state, { type: 'STEP', direction: 1, count: 2 });
  assert.equal(state.activeIndex, 1);
  state = readerSearchReducer(state, { type: 'STEP', direction: -1, count: 2 });
  assert.equal(state.activeIndex, 0);
  state = readerSearchReducer(state, { type: 'RESET' });
  assert.deepEqual(state, { query: '', activeIndex: 0 });
});

test('document/version switch resets query and active index', () => {
  const state = readerSearchReducer({ query: 'alma', activeIndex: 1 }, { type: 'RESET' });
  assert.deepEqual(state, { query: '', activeIndex: 0 });
});

test('no-match state is truthful', () => {
  assert.deepEqual(findReaderMatchOffsets(TEXT, 'nincs'), []);
  assert.deepEqual(findReaderMatchOffsets(TEXT, '   '), []);
  assert.deepEqual(findReaderMatchOffsets(null, 'alma'), []);
});

test('search is supported on the exact version-text and plain surfaces only', () => {
  assert.equal(resolveReaderSearchSurface({ hasVersionText: true, hasPlainText: false }), 'VERSION_TEXT');
  assert.equal(isReaderSearchSupported('VERSION_TEXT'), true);
  assert.equal(resolveReaderSearchSurface({ hasVersionText: false, hasPlainText: true }), 'PLAIN');
  assert.equal(isReaderSearchSupported('PLAIN'), true);
  // The version-scoped surface wins when both qualify (it is rendered first).
  assert.equal(resolveReaderSearchSurface({ hasVersionText: true, hasPlainText: true }), 'VERSION_TEXT');
  assert.equal(resolveReaderSearchSurface({ hasVersionText: false, hasPlainText: false }), 'NONE');
  assert.equal(isReaderSearchSupported('NONE'), false);
});

test('range highlighting keeps global match indexes and rejoins byte-for-byte', () => {
  const offsets = findReaderMatchOffsets(TEXT, 'alma'); // [0, 11]
  // Second half only: the [11, 15] match stays globally indexed as 1.
  const tail = buildReaderHighlightSegmentsInRange(TEXT, 8, TEXT.length, offsets, 4);
  assert.equal(tail.map((segment) => segment.text).join(''), TEXT.slice(8));
  assert.deepEqual(tail.filter((s) => s.matchIndex !== null).map((s) => s.matchIndex), [1]);
  // First half only: the [0, 4] match stays globally indexed as 0.
  const head = buildReaderHighlightSegmentsInRange(TEXT, 0, 8, offsets, 4);
  assert.equal(head.map((segment) => segment.text).join(''), TEXT.slice(0, 8));
  assert.deepEqual(head.filter((s) => s.matchIndex !== null).map((s) => s.matchIndex), [0]);
  // A range with no contained match is returned as one plain segment.
  const none = buildReaderHighlightSegmentsInRange(TEXT, 4, 8, offsets, 4);
  assert.deepEqual(none, [{ text: TEXT.slice(4, 8), matchIndex: null }]);
});

test('highlight segments rejoin to the original text byte-for-byte (canonical text unchanged)', () => {
  const offsets = findReaderMatchOffsets(TEXT, 'alma');
  const segments = buildReaderHighlightSegments(TEXT, offsets, 4);
  assert.equal(segments.map((segment) => segment.text).join(''), TEXT);
  assert.deepEqual(
    segments.filter((segment) => segment.matchIndex !== null).map((segment) => segment.matchIndex),
    [0, 1],
  );
  assert.deepEqual(
    segments.filter((segment) => segment.matchIndex !== null).map((segment) => segment.text),
    ['alma', 'alma'],
  );
});

test('every match exposes a stable presentation index used to target the rendered match', () => {
  const offsets = findReaderMatchOffsets(TEXT, 'alma');
  const segments = buildReaderHighlightSegments(TEXT, offsets, 4);
  const indexes = segments.filter((segment) => segment.matchIndex !== null).map((segment) => segment.matchIndex);
  assert.deepEqual(indexes, [0, 1]);
  // the active match resolves to exactly one rendered segment
  const active = 1;
  assert.equal(segments.filter((segment) => segment.matchIndex === active).length, 1);
});
