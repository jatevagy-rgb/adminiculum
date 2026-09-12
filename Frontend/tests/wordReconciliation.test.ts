import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These canonical pages depend on auth/router/browser state. Follow the existing
// source-contract harness; service authorization tests remain authoritative.
const read = (file: string) => readFileSync(file, 'utf8');

test('communication intake is case-first and retains secondary task capabilities', () => {
  const source = read('src/components/communications/CommunicationWorkspace.tsx');
  const actions = source.slice(source.indexOf('<section aria-label="Ügyindítás'), source.indexOf('</section>', source.indexOf('<section aria-label="Ügyindítás')));
  assert.match(actions, /Új ügy létrehozása/);
  assert.match(actions, /onCreateCase\(item\)/);
  assert.match(actions, /onAssign\(item\)/);
  assert.match(actions, /href=\{`\/cases\/\$\{encodeURIComponent\(item.caseId\)\}/);
  assert.match(actions, /<details[\s\S]*onCreateTask\(item\)[\s\S]*onLinkTask\(item\)[\s\S]*<\/details>/);
  for (const contract of ['CompactNewCaseDialog', 'sourceCommunicationId={createCaseTarget?.id}', 'initialClientId={createCaseTarget?.clientId', 'linkCommunicationToCase(assignTarget.id, selectedCaseId)']) assert.ok(source.includes(contract));
});

test('portal save reports both failure and success without changing the save contract', () => {
  const source = read('src/app/clients/[clientId]/portal/page.tsx');
  assert.match(source, /updateClient\(client.id, patch\)/);
  assert.match(source, /catch[\s\S]*setSaveFeedback\("A portálbeállítások mentése nem sikerült/);
  assert.match(source, /setSaveFeedback\("A portálbeállítások mentve/);
  assert.match(source, /role="status" aria-live="polite"/);
  for (const contract of ['ClientPortalMemberAdmin', 'listAdminWorkspaces(clientId)', 'relationshipMode', 'portalAccessEnabled', 'connectedSystemState']) assert.ok(source.includes(contract));
});

test('organization editor uses existing scoped APIs and never grants portal access', () => {
  const source = read('src/components/clients/OrganizationEditor.tsx');
  assert.match(source, /getCurrentUser\(\)[\s\S]*\["ADMIN", "PARTNER"\]\.includes\(user.role\)/);
  assert.match(source, /if \(!canManage\) return null/);
  assert.match(source, /if \(busy \|\| !canManage\) return/);
  for (const method of ['createPerson(clientId, patch)', 'createGroup(clientId, patch)', 'updatePerson(selectedId, patch)', 'updateGroup(selectedId, patch)']) assert.ok(source.includes(method));
  for (const key of ['organizationGroupId', 'managerPersonId', 'deputyPersonId', 'parentGroupId', 'responsibilitiesSummary', 'email', 'phone']) assert.ok(source.includes(key));
  assert.doesNotMatch(source, /portalMembershipId:|grant|deletePerson|deleteGroup/);
  assert.match(source, /item.id !== selectedId/);
  assert.match(source, /<fieldset disabled=\{busy\}/);
  assert.match(source, /role="alert"/);
  const service = read('../Backend/src/modules/client-organization/service.ts');
  assert.match(service, /requireManager/);
  assert.match(service, /CYCLE/);
});

test('document review uses three columns with one existing change list and unchanged decision handlers', () => {
  const source = read('src/app/documents/compare/page.tsx');
  const left = source.indexOf('<aside aria-label="Mit változtattunk és miért"');
  const end = source.indexOf('</aside>', left);
  assert.ok(left > 0 && end > left);
  const changes = source.slice(left, end);
  assert.match(source, /xl:grid-cols-\[240px_minmax\(0,1fr\)_280px\]/);
  for (const retained of ['localReviewMarks.map', 'proposedChanges.map', 'applyLocalReviewDecision(mark.id, "accepted")', 'applyLocalReviewDecision(mark.id, "rejected")', 'openReviewMarkEditor(mark)', 'localReviewPersistenceLabel']) assert.ok(changes.includes(retained));
  assert.equal(source.split('localReviewMarks.map((mark) => (').length - 1, 1);
  assert.match(source, /workspaceMainTab === "comments" \|\| workspaceMainTab === "review"/);
  assert.match(source, /<DocumentEditorShell/);
});
