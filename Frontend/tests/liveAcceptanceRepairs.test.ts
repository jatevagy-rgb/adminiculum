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

test('A5/3A1: communication is case-first (linked: case actions primary, tasks secondary; unlinked: link/create case)', () => {
  const src = read('Frontend/src/components/communications/CommunicationWorkspace.tsx');
  // linked communication
  assert.match(src, /Ügy megnyitása/);
  assert.match(src, /Ügy módosítása/);
  assert.match(src, /Feladatműveletek/);
  assert.match(src, /Új feladat ebből/);
  // unlinked communication
  assert.match(src, /Meglévő ügyhöz kapcsolás/);
  assert.match(src, /Új ügy létrehozása/);
});

test('Task catalogue: truthful empty state is rendered when no definitions exist', () => {
  const src = read('Frontend/src/components/tasks/TaskPlanningFields.tsx');
  assert.match(src, /definitions\.length === 0/);
  assert.match(src, /Nincs még létrehozott feladattípus/);
  // Free naming must remain available alongside the catalogue.
  assert.match(src, /Szabad megnevezés/);
});

test('Case responsible selector uses the authoritative backend-eligible source, not unrestricted getUsers', () => {
  const panel = read('Frontend/src/components/cases/CaseWorkPackagePanel.tsx');
  assert.match(panel, /getCaseResponsibleCandidates/);
  // The old unrestricted source must be gone from the responsible selector.
  assert.doesNotMatch(panel, /getUsers\(\)/);
  assert.doesNotMatch(panel, /ELIGIBLE_WORKFORCE_ROLES/);
  const api = read('Frontend/src/lib/api.ts');
  assert.match(api, /responsible-candidates/);
});

test('Case error mapping prefers the structured backend error code', () => {
  const src = read('Frontend/src/components/cases/CaseWorkPackagePanel.tsx');
  assert.match(src, /error instanceof ApiError \? error\.code/);
  assert.match(src, /RESPONSIBLE_NOT_CASE_ELIGIBLE/);
});

test('Portal: actionable and active content precede the organization profile', () => {
  const src = read('Frontend/src/components/client-portal/OrgHomeView.tsx');
  const actions = src.indexOf('title="Ami most Öntől kell"');
  const matters = src.indexOf('title="Ügyeink"');
  const org = src.indexOf('data-testid="org-company-profile"');
  assert.ok(actions > -1 && matters > -1 && org > -1, 'portal markers missing');
  assert.ok(actions < org, 'actions must precede organization profile');
  assert.ok(matters < org, 'active matters must precede organization profile');
});

test('Portal: empty sections use a compact state, not full cards', () => {
  const src = read('Frontend/src/components/client-portal/OrgHomeView.tsx');
  assert.match(src, /data-testid="portal-compact-empty"/);
  assert.match(src, /const compactState/);
  // Empty branches must return the compact state before the full card.
  assert.match(src, /if \(empty\) \{[\s\S]*compactState/);
});

test('Portal: recent changes use persisted/published content only and organization stays reachable', () => {
  const src = read('Frontend/src/components/client-portal/OrgHomeView.tsx');
  assert.match(src, /home\.recentDocuments\.slice\(0, 4\)/);
  assert.match(src, /\/portal\/vallalat/);
  assert.match(src, /\/portal\/uzenetek/);
});

test('Portal: recorded work is never presented as savings/outcome and only shows when real time exists', () => {
  const src = read('Frontend/src/components/client-portal/OrgHomeView.tsx');
  assert.match(src, /workSummary && workSummary\.totalMinutes > 0/);
  assert.doesNotMatch(src, /megtakar|hatékonyság|növekedés|ROI/i);
});

test('Portal: organization mode uses OrgHomeView while individual mode is preserved', () => {
  const src = read('Frontend/src/components/client-portal/ClientPortalShell.tsx');
  assert.ok(src.includes('OrgHomeView'), 'OrgHomeView must be wired');
  assert.ok(src.includes("mode === 'ORGANIZATION'"), 'organization branch must exist');
  assert.ok(src.includes('INDIVIDUAL'), 'individual branch must remain');
});

test('Task planning candidates come from the authoritative case-scoped projection (not getUsers)', () => {
  const cw = read('Frontend/src/components/cases/CaseWorkspaceActions.tsx');
  assert.match(cw, /getCaseResponsibleCandidates/);
  assert.doesNotMatch(cw, /getUsers\(\)/);
  const comm = read('Frontend/src/components/communications/CommunicationWorkspace.tsx');
  assert.match(comm, /getCaseResponsibleCandidates/);
  assert.doesNotMatch(comm, /getUsers\(\)/);
  const tasks = read('Frontend/src/app/tasks/page.tsx');
  assert.match(tasks, /getCaseResponsibleCandidates/);
  assert.match(tasks, /users=\{planningUsers\}/);
});

test('Structured task-role error codes map to specific Hungarian messages', () => {
  const src = read('Frontend/src/lib/taskWorkflowPresentation.ts');
  assert.match(src, /error\.code && ERROR_MESSAGES\[error\.code\]/);
  for (const code of ['TASK_ROLE_CASE_ACCESS_REQUIRED', 'TASK_ROLE_USER_INELIGIBLE', 'REVIEWER_CANNOT_BE_WORKER', 'COLLABORATOR_IS_WORKER', 'COLLABORATOR_IS_REVIEWER']) {
    assert.match(src, new RegExp(code));
  }
});

test('TaskPlanningFields reports when no further eligible coworkers exist', () => {
  const src = read('Frontend/src/components/tasks/TaskPlanningFields.tsx');
  assert.match(src, /Nincs további jogosult munkatárs\./);
});
