import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These canonical pages depend on auth/router/browser state. Follow the existing
// source-contract harness; service authorization tests remain authoritative.
const read = (file: string) => readFileSync(file, 'utf8');

test('communication intake is case-first and retains secondary task capabilities', () => {
  const source = read('src/components/communications/CommunicationWorkspace.tsx');
  // Canonical structural boundary: the classification section was renamed from
  // "Ügyindítás és ügyhöz rendelés" to "Ügybesorolás és feladatműveletek" when the
  // intake became case-first. Keep the assertions scoped to this section.
  const sectionStart = source.indexOf('<section aria-label="Ügybesorolás és feladatműveletek"');
  const sectionEnd = source.indexOf('</section>', sectionStart);
  assert.ok(sectionStart > 0 && sectionEnd > sectionStart, 'the communication classification section must exist');
  const actions = source.slice(sectionStart, sectionEnd);
  // The ternary inside the section separates the associated branch from the
  // case-first branch (an unsorted communication has no case yet).
  const branchSplit = actions.indexOf(') : (');
  assert.ok(branchSplit > 0, 'the associated and case-first branches of the classification section must exist');
  // Already associated branch: the canonical case link and re-assignment stay available.
  const assigned = actions.slice(0, branchSplit);
  assert.match(assigned, /href=\{`\/cases\/\$\{encodeURIComponent\(item.caseId\)\}/);
  assert.match(assigned, /onAssign\(item\)/);
  // Case-first branch: an unsorted communication is assigned to an existing case or starts a new one.
  const unassigned = actions.slice(branchSplit);
  assert.match(unassigned, /Meglévő ügyhöz kapcsolás/);
  assert.match(unassigned, /Új ügy létrehozása/);
  assert.match(unassigned, /onCreateCase\(item\)/);
  assert.match(unassigned, /onAssign\(item\)/);
  // Task creation and linking stay secondary: they live under the subordinate
  // "Feladatműveletek" block of the associated branch and never in the case-first branch.
  assert.match(assigned, /Feladatműveletek[\s\S]*onCreateTask\(item\)[\s\S]*onLinkTask\(item\)/);
  assert.doesNotMatch(unassigned, /onCreateTask\(item\)|onLinkTask\(item\)/);
  assert.match(source, /caseId: result.communication.caseId, clientId: result.communication.clientId/);
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

test('organization editor uses existing scoped APIs and keeps portal invitations separate from access grants', () => {
  const source = read('src/components/clients/OrganizationEditor.tsx');
  assert.match(source, /getCurrentUser\(\)[\s\S]*\["ADMIN", "PARTNER"\]\.includes\(user.role\)/);
  assert.match(source, /if \(!canManage\) return null/);
  assert.match(source, /if \(busy \|\| !canManage \|\| !mode\) return/);
  for (const method of ['createPerson(clientId, patch)', 'createGroup(clientId, patch)', 'updatePerson(selectedId, editedOrganizationFields(patch, editedFields))', 'updateGroup(selectedId, editedOrganizationFields(patch, editedFields))']) assert.ok(source.includes(method));
  for (const key of ['organizationGroupId', 'managerPersonId', 'deputyPersonId', 'parentGroupId', 'responsibilitiesSummary', 'email', 'phone']) assert.ok(source.includes(key));
  assert.match(source, /inviteAdminWorkspaceMember/);
  assert.match(source, /transitionAdminWorkspaceMembership/);
  assert.doesNotMatch(source, /deletePerson|deleteGroup/);
  assert.match(source, /ügy- vagy dokumentumhozzáférést nem ad/);
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
  const document = source.indexOf('<div aria-label="Dokumentum"');
  const comments = source.indexOf('<aside aria-label="Megjegyzések és magyarázatok"');
  assert.ok(left < document && document < comments, 'DOM reading/focus order must match left-document-right visual order');
  assert.doesNotMatch(source.slice(left, comments), /className="order-[123]/);
});
