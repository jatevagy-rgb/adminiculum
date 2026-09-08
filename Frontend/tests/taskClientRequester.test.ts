import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('task requester UI uses canonical organization persons, preserves only the stored historical requester, and supports clear', () => {
  const actions = read('src/components/cases/CaseWorkspaceActions.tsx');
  assert.match(actions, /clientOrganizationApi\.listPersons/);
  assert.match(actions, /Ügyféloldali kérő/);
  assert.match(actions, /Az ügyfél szervezetén belül az a személy, akinek a kérésére a feladat készül\./);
  assert.match(actions, /Nincs megadva/);
  assert.match(actions, /historicalRequester && !requesters\.some/);
  assert.match(actions, /person\.employmentStatus === "ACTIVE" \|\| person\.employmentStatus === "ON_LEAVE"/);
  assert.match(actions, /\}, \.\.\.requesters\]/);
  assert.match(actions, /korábbi kérő/);
  assert.match(actions, /requestedByOrganizationPersonId === \(task\.requestedByOrganizationPerson\?\.id \?\? ""\)/);
});

test('task and client-scoped work hours display requester separately from Department', () => {
  const taskCard = read('src/components/cases/CaseCockpitPanels.tsx');
  const timeEntries = read('src/app/time-entries/page.tsx');
  assert.match(taskCard, /Nincs ügyféloldali kérő megadva/);
  assert.match(timeEntries, /Osztály:/);
  assert.match(timeEntries, /Ügyféloldali kérő:/);
  assert.match(timeEntries, /Ügyféloldali szervezeti egység:/);
});
