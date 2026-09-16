import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterLedgerItems, matchesLedgerSearch } from '../src/lib/documents/ledgerSearch';

test('an empty search keeps the whole loaded ledger collection', () => {
  const items = [{ fileName: 'a.docx' }, { fileName: 'b.pdf' }];
  assert.deepEqual(filterLedgerItems(items, ''), items);
  assert.deepEqual(filterLedgerItems(items, '   '), items);
});

test('search filters the left rail by fileName/title/templateName, case-insensitively', () => {
  const items: Array<{ fileName?: string; title?: string; templateName?: string }> = [
    { fileName: 'Szerződés_v2.docx' },
    { fileName: 'Melléklet.pdf', title: 'Kutatási jegyzőkönyv' },
    { templateName: 'Vállalkozási szerződés', title: 'Megbízás' },
  ];
  assert.deepEqual(filterLedgerItems(items, 'szerződés'), [items[0], items[2]]);
  assert.deepEqual(filterLedgerItems(items, 'KUTATÁSI'), [items[1]]);
  assert.deepEqual(filterLedgerItems(items, 'nincs-talalat'), []);
});

test('matchesLedgerSearch matches only the empty term or an actual substring', () => {
  assert.equal(matchesLedgerSearch('', 'anything'), true);
  assert.equal(matchesLedgerSearch('x', 'aXb'), true);
  assert.equal(matchesLedgerSearch('z', 'abc'), false);
  assert.equal(matchesLedgerSearch('alma', null, undefined), false);
});
