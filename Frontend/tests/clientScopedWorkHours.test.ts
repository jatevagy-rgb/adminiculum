import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/lib/api.ts', 'utf8');
const page = readFileSync('src/app/time-entries/page.tsx', 'utf8');
const route = readFileSync('../Backend/src/routes/timeEntries.ts', 'utf8');
const dossier = readFileSync('src/app/clients/[clientId]/page.tsx', 'utf8');

test('T1 preserves authoritative client/case scopes and existing time wiring', () => {
  for (const value of ['clientId', 'caseId']) assert.match(api, new RegExp(`queryParams\\.set\\('(?:${value})'`));
  for (const value of ['matterId', 'userId', 'workType', 'startDate', 'endDate']) assert.match(api, new RegExp(`filters\\?\\.${value}`));
  assert.match(route, /clientId/);
  assert.match(route, /caseId/);
  assert.match(route, /classifyTimeAttribution/);
  assert.match(route, /TASK_DERIVED_CASE/);
  assert.match(route, /AMBIGUOUS/);
  assert.match(route, /where\.userId = userId \? String\(userId\) : requesterId/);
  for (const value of ['createTimeEntry', 'updateTimeEntry', 'deleteTimeEntry', 'timesheet']) assert.match(page + route, new RegExp(value));
});

test('T1 exposes the client dossier entry point and hours-only review state', () => {
  assert.match(dossier, /href=\{`\/time-entries\?clientId=\$\{encodeURIComponent\(clientId\)\}`\}/);
  assert.match(dossier, />Munkaórák</);
  assert.match(page, /deepLinkedClientId/);
  assert.match(page, /Szűrés törlése/);
  assert.match(page, /Ellenőrizendő idő/);
  assert.match(page, /Elszámolható idő/);
  assert.match(page, /resolvedCaseOptions/);
  assert.match(page, /entry\.resolvedCaseId \|\| entry\.task\?\.caseId/);
  assert.match(page, /Kimutatás/);
});
