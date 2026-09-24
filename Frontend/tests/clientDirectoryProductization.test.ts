import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/clients/page.tsx', 'utf8');
const cardStart = source.indexOf('const renderClientTile');
const firstReturn = source.indexOf('\n    return (', cardStart);
const cardEnd = source.indexOf('\n  return (', firstReturn + 1);
const card = source.slice(cardStart, cardEnd);

test('client directory tiles keep a quick-scan, identity-first hierarchy', () => {
  for (const hiddenLabel of ['Székhely', 'Nyilvántartás', 'House style kitöltve', 'House style részleges', 'Fejlécminta']) {
    assert.equal(card.includes(hiddenLabel), false, `${hiddenLabel} must remain inside the dossier/form, not the primary tile`);
  }
  // The target tile intentionally surfaces the operational identity fields.
  for (const shownLabel of ['Kapcsolattartó:', 'Adószám:']) {
    assert.equal(card.includes(shownLabel), true, `${shownLabel} must be visible on the client tile`);
  }
  assert.match(card, />\s*Dosszié\s*<\/Link>/);
  assert.doesNotMatch(card, /További műveletek|#house-style|handleEdit\(client\)/);
  assert.match(card, /border-2/);
  assert.match(card, /color\.borderClass/);
  assert.match(card, /\+ Új ügy/);
  assert.doesNotMatch(card, /AdminPanel[^>]*overflow-hidden[\s\S]*<details[^>]*>[\s\S]*absolute/);
});

test('client master data, search, loading/error/empty states and routes remain wired', () => {
  for (const field of ['taxNumber', 'companyRegistrationNumber', 'authorizedRepresentative', 'contactPerson', 'colorKey']) assert.match(source, new RegExp(field));
  assert.match(source, /getClients\(\)/);
  assert.match(source, /client\.email, client\.contactPerson, client\.taxNumber/);
  assert.match(source, /localeCompare\(right\.name, "hu-HU"\)/);
  assert.match(source, /Még nincs ügyfél\./);
  assert.match(source, /Nincs találat a keresésre\./);
  assert.match(source, /setError\("Az ügyféllista/);
  assert.match(source, /\/cases\?newCase=1&clientId=/);
  assert.match(source, /updateClient\(editingClient\.id/);
  assert.match(source, /createClient\(formData\)/);
  assert.match(source, /ClientColorSelector/);
});

test('directory does not introduce backend or client-data cleanup behavior', () => {
  assert.equal(source.includes('deleteClient'), false);
  assert.equal(source.includes('archiveClient'), false);
  assert.equal(source.includes('Backend/'), false);
});

test('directory visual polish keeps compact accessible tiles', () => {
  assert.match(card, /border-2/);
  assert.doesNotMatch(card, /adm-board-list-row|shadow-lg/);
  assert.match(card, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(card, /<details/);
  assert.match(card, /min-h-9/);
  assert.match(card, /focus-visible:outline-2/);
  assert.match(source, /grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
});
