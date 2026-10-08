import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRaceHarness, deferred, settle } from './helpers/asyncRaceHarness';

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

test('case and global task create actions consume backend CASE_MANAGE capability, not frontend role guesses', () => {
  const workspace = source('src/components/cases/CaseWorkspaceOverview.tsx');
  const tasks = source('src/app/tasks/page.tsx');
  assert.match(workspace, /useTaskCreateCapabilities\(\[caseId\]\)/);
  assert.match(workspace, /canCreateTask \? <AdminButton[\s\S]*?Új feladat<\/AdminButton>/);
  assert.match(workspace, /modal\?\.type === "task-create" && canCreateTask/);
  assert.match(workspace, /modal\?\.type === "deadline-create" && canCreateTask/);
  assert.match(tasks, /useTaskCreateCapabilities\(cases\.map\(\(caseItem\) => caseItem\.id\)\)/);
  assert.match(tasks, /manageableCases\.map\(\(caseItem\) => <option/);
  assert.match(tasks, /if \(!selectedCaseManageable\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?await createTask\(/);
  assert.match(tasks, /open=\{showCreateModal && canOpenCreate\}/);
  assert.match(tasks, /autoOpenKeyRef\.current === key/);
  assert.doesNotMatch([workspace, tasks].join('\n'), /role === "ADMIN" \|\| role === "PARTNER"/);
});

test('capability read fails closed, ignores stale client/case responses and preserves retry', async () => {
  const oldRead = deferred<{ canCreateCaseIds: string[] }>();
  let currentAllowed = false;
  let failCurrent = false;
  const requests: string[] = [];
  const h = createRaceHarness('src/lib/useTaskCreateCapabilities.ts', 'useTaskCreateCapabilities', {
    '@/lib/api': { fetchApi: (url: string) => {
      requests.push(url);
      if (url.includes('case-a')) return oldRead.promise;
      if (failCurrent) return Promise.reject(new Error('read failed'));
      return Promise.resolve({ canCreateCaseIds: currentAllowed ? ['case-b', 'foreign-case'] : [] });
    } },
  });
  assert.equal(h.render(['case-a']).status, 'loading');
  h.effects();
  h.render(['case-b']); h.effects(); await settle();
  assert.equal(h.render(['case-b']).status, 'ready');
  assert.deepEqual(Array.from(h.render(['case-b']).allowedCaseIds), []);
  oldRead.resolve({ canCreateCaseIds: ['case-a'] }); await settle();
  assert.deepEqual(Array.from(h.render(['case-b']).allowedCaseIds), []);
  currentAllowed = true;
  h.render(['case-b']).retry(); h.render(['case-b']); h.effects(); await settle();
  assert.deepEqual(Array.from(h.render(['case-b']).allowedCaseIds), ['case-b']);
  failCurrent = true;
  h.render(['case-b']).retry(); h.render(['case-b']); h.effects(); await settle();
  assert.equal(h.render(['case-b']).status, 'unavailable');
  assert.deepEqual(Array.from(h.render(['case-b']).allowedCaseIds), []);
  assert.ok(requests.every((url) => url.startsWith('/tasks/create-capabilities?caseIds=')));
});

test('capability requests bound the URL and never trust an unrequested returned case', async () => {
  const requests: string[] = [];
  const h = createRaceHarness('src/lib/useTaskCreateCapabilities.ts', 'useTaskCreateCapabilities', {
    '@/lib/api': { fetchApi: async (url: string) => { requests.push(url); return { canCreateCaseIds: ['case-0', 'foreign-case'] }; } },
  });
  const ids = Array.from({ length: 51 }, (_item, index) => `case-${index}`);
  h.render(ids); h.effects(); await settle();
  assert.equal(requests.length, 2);
  assert.deepEqual(Array.from(h.render(ids).allowedCaseIds), ['case-0']);
});
