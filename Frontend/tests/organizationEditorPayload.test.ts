import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editedOrganizationFields } from '../src/lib/organizationEditorPayload';

test('editing a contact preserves concurrent and unspecified organization values', () => {
  const displayed = { name: 'Old name', email: 'new@example.test', phone: null, managerPersonId: 'old-manager' };
  const patch = editedOrganizationFields(displayed, new Set(['email']));
  const server = { ...displayed, name: 'Concurrent name', phone: '123', managerPersonId: 'new-manager', portalMembershipId: 'retained', employmentStatus: 'ACTIVE' };
  assert.deepEqual(patch, { email: 'new@example.test' });
  assert.deepEqual({ ...server, ...patch }, server);
});

test('explicitly clearing a relationship remains possible; unedited fields are absent', () => {
  assert.deepEqual(editedOrganizationFields({ managerPersonId: null, deputyPersonId: 'deputy' }, new Set(['managerPersonId'])), { managerPersonId: null });
  assert.deepEqual(editedOrganizationFields({ name: 'Group', parentGroupId: 'parent' }, new Set()), {});
  assert.deepEqual(editedOrganizationFields({ name: 'Group', parentGroupId: null }, new Set(['parentGroupId', 'portalMembershipId'])), { parentGroupId: null });
});
