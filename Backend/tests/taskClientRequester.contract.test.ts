import { readFileSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskRequester } from '../src/modules/tasks/services';
import { WorkflowTransitionError } from '../src/modules/cases/workItems';

const repo = (path: string) => readFileSync(path, 'utf8');

function requesterDb(person: { id: string; clientId: string; employmentStatus: string } | null, clientId = 'client-a') {
  return {
    case: { findUnique: async () => ({ clientId }) },
    organizationPerson: { findUnique: async () => person },
  } as any;
}

test('keeps requester optional for legacy and automation-created tasks', async () => {
    const db = requesterDb(null);
  assert.equal(await validateTaskRequester('case-a', undefined, db), undefined);
  assert.equal(await validateTaskRequester('case-a', null, db), null);
});

test('accepts an eligible same-client requester and keeps internal assignee/assigner separate', async () => {
    const db = requesterDb({ id: 'person-a', clientId: 'client-a', employmentStatus: 'ACTIVE' });
  assert.equal(await validateTaskRequester('case-a', 'person-a', db), 'person-a');
  const taskService = repo('src/modules/tasks/services.ts');
  assert.match(taskService, /assignedToId: data\.assignedTo/);
  assert.match(taskService, /assignedById: data\.assignedBy/);
  assert.match(taskService, /requestedByOrganizationPersonId/);
});

test('fails closed for unknown, cross-client, and ineligible requesters', async () => {
  await assert.rejects(() => validateTaskRequester('case-a', 'missing', requesterDb(null)), { code: 'ORGANIZATION_PERSON_NOT_FOUND' });
  await assert.rejects(() => validateTaskRequester('case-a', 'person-b', requesterDb({ id: 'person-b', clientId: 'client-b', employmentStatus: 'ACTIVE' })), { code: 'CROSS_CLIENT_REQUESTER' });
  await assert.rejects(() => validateTaskRequester('case-a', 'person-ended', requesterDb({ id: 'person-ended', clientId: 'client-a', employmentStatus: 'ENDED' })), { code: 'ORGANIZATION_PERSON_NOT_ELIGIBLE' });
});

test('preserves the no-TimeEntry-column rule while projecting requester from Task', () => {
    const schema = repo('prisma/schema.prisma');
    const timeEntries = repo('src/routes/timeEntries.ts');
    const timeEntryModel = schema.slice(schema.indexOf('model TimeEntry'), schema.indexOf('model TimeEntry') + 2600);
  assert.doesNotMatch(timeEntryModel, /requester/);
  assert.match(timeEntries, /entry\.task\?\.requestedByOrganizationPerson/);
  assert.match(timeEntries, /organizationGroup: entry\.task\.requestedByOrganizationPerson\.organizationGroup \?\? null/);
});
