import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/clients/page.tsx', 'utf8');
const cardStart = source.indexOf('const renderClientCard');
const firstReturn = source.indexOf('\n    return (', cardStart);
const cardEnd = source.indexOf('\n  return (', firstReturn + 1);
const card = source.slice(cardStart, cardEnd);

test('client directory cards keep a quick-scan information hierarchy', () => {
  for (const hiddenLabel of ['Székhely', 'Adószám', 'Nyilvántartás', 'Kapcsolattartó', 'House style kitöltve', 'House style részleges', 'Fejlécminta']) {
    assert.equal(card.includes(hiddenLabel), false, `${hiddenLabel} must remain inside the dossier/form, not the primary card`);
  }
  assert.match(card, /Ügyfél dosszié/);
  assert.match(card, /További műveletek/);
  assert.match(card, /#house-style/);
  assert.match(card, /handleEdit\(client\)/);
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
