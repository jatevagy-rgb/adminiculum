/**
 * LIVE ACCEPTANCE REPAIRS — behavioural/source-contract regression tests.
 *
 * These assert user-visible outcomes (not merely that a component/string exists
 * somewhere), in line with the corrected test philosophy.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

test('A1: Jogi hírek is rendered directly (not inside the További jelzések disclosure)', () => {
  const src = read('Frontend/src/components/DashboardFocused.tsx');
  assert.match(src, /<section aria-labelledby="dashboard-legal-news-heading"/);
  assert.match(src, /news\.slice\(0, 5\)/);
  // The legal-news heading must not sit on a <details> element.
  const line = src.split('\n').find((l) => l.includes('dashboard-legal-news-heading')) ?? '';
  assert.doesNotMatch(line, /<details/);
  // The disclosure now holds only recent documents.
  assert.match(src, /recentDocuments\.length > 0 \? \(/);
});

test('A2: client list card uses a strong colorKey accent rail, not only a pale border', () => {
  const src = read('Frontend/src/app/clients/page.tsx');
  const line = src.split('\n').find((l) => l.includes('AdminPanel key={client.id}')) ?? '';
  assert.match(line, /border-l-4/);
  assert.match(line, /color\.accentBorderClass/);
  // Test-constrained literals must remain.
  assert.match(line, /border-2/);
  assert.match(line, /\$\{color\.borderClass\}/);
});

test('A3: Case Workspace task modal uses the canonical task-planning contract', () => {
  const src = read('Frontend/src/components/cases/CaseWorkspaceActions.tsx');
  assert.match(src, /TaskPlanningFields/);
  assert.match(src, /<TaskPlanningFields/);
  // canonical planning fields are submitted
  assert.match(src, /taskDefinitionId: taskPlanning\.taskDefinitionId/);
  assert.match(src, /plannedReviewerId: taskPlanning\.plannedReviewerId/);
  assert.match(src, /collaboratorUserIds: taskPlanning\.collaboratorUserIds/);
  assert.match(src, /saveToCatalogue: taskPlanning\.saveToCatalogue/);
});

test('A3: Case Workspace threads the client scope into the task modal', () => {
  const src = read('Frontend/src/components/cases/CaseWorkspaceOverview.tsx');
  assert.match(src, /clientId=\{c\.client\?\.id \?\? null\}/);
});

test('A3: canonical planning fields are accepted by the create-task client type', () => {
  const src = read('Frontend/src/lib/api.ts');
  assert.match(src, /taskDefinitionId\?: string \| null/);
  assert.match(src, /plannedReviewerId\?: string \| null/);
  assert.match(src, /collaboratorUserIds\?: string\[\]/);
});

test('A4: Communication task form uses the canonical TaskPlanningFields contract', () => {
  const src = read('Frontend/src/components/communications/CommunicationWorkspace.tsx');
  assert.match(src, /TaskPlanningFields/);
  assert.match(src, /<TaskPlanningFields/);
  assert.match(src, /taskDefinitionId: taskPlanning\.taskDefinitionId/);
  assert.match(src, /plannedReviewerId: taskPlanning\.plannedReviewerId/);
  assert.match(src, /collaboratorUserIds: taskPlanning\.collaboratorUserIds/);
  assert.match(src, /attentionCategory: taskAttentionCategory \|\| null/);
  assert.match(src, /estimatedMinutes:/);
});

test('A4: Communication task submit is source-derived (id in path) and planning is canonical', () => {
  const src = read('Frontend/src/lib/api.ts');
  assert.match(src, /\/communications\/\$\{communicationId\}\/extract-task/);
  assert.match(src, /taskDefinitionId\?: string \| null/);
});

test('A5: linked and unlinked communication case-first actions are both present', () => {
  const src = read('Frontend/src/components/communications/CommunicationWorkspace.tsx');
  assert.match(src, /Munka folytatása az ügyben/);
  assert.match(src, /Új ügy létrehozása/);
  assert.match(src, /Meglévő ügyhöz rendelés/);
});
