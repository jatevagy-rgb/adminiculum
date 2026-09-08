import { readFileSync } from 'fs';
import { validateTaskRequester } from '../src/modules/tasks/services';

const repo = (path: string) => readFileSync(path, 'utf8');

function requesterDb(person: { id: string; clientId: string; employmentStatus: string } | null, clientId = 'client-a') {
  return {
    case: { findUnique: async () => ({ clientId }) },
    organizationPerson: { findUnique: async () => person },
  } as any;
}

describe('Task client requester provenance contract', () => {
  test('keeps requester optional for legacy and automation-created tasks', async () => {
    const db = requesterDb(null);
    await expect(validateTaskRequester('case-a', undefined, db)).resolves.toBeUndefined();
    await expect(validateTaskRequester('case-a', null, db)).resolves.toBeNull();
  });

  test('accepts an eligible same-client requester and keeps internal assignee/assigner separate', async () => {
    const db = requesterDb({ id: 'person-a', clientId: 'client-a', employmentStatus: 'ACTIVE' });
    await expect(validateTaskRequester('case-a', 'person-a', db)).resolves.toBe('person-a');
    const taskService = repo('src/modules/tasks/services.ts');
    expect(taskService).toContain('assignedToId: data.assignedTo');
    expect(taskService).toContain('assignedById: data.assignedBy');
    expect(taskService).toContain('requestedByOrganizationPersonId');
  });

  test('fails closed for unknown, cross-client, and ineligible newly selected requesters', async () => {
    await expect(validateTaskRequester('case-a', 'missing', requesterDb(null))).rejects.toMatchObject({ code: 'ORGANIZATION_PERSON_NOT_FOUND' });
    await expect(validateTaskRequester('case-a', 'person-b', requesterDb({ id: 'person-b', clientId: 'client-b', employmentStatus: 'ACTIVE' }))).rejects.toMatchObject({ code: 'CROSS_CLIENT_REQUESTER' });
    await expect(validateTaskRequester('case-a', 'person-ended', requesterDb({ id: 'person-ended', clientId: 'client-a', employmentStatus: 'ENDED' }))).rejects.toMatchObject({ code: 'ORGANIZATION_PERSON_NOT_ELIGIBLE' });
  });

  test('preserves INACTIVE and ENDED requester IDs only when they are the current Task requester', async () => {
    const ended = requesterDb({ id: 'person-ended', clientId: 'client-a', employmentStatus: 'ENDED' });
    const inactive = requesterDb({ id: 'person-inactive', clientId: 'client-a', employmentStatus: 'INACTIVE' });
    await expect(validateTaskRequester('case-a', 'person-ended', ended, { preserveHistoricalRequesterId: 'person-ended' })).resolves.toBe('person-ended');
    await expect(validateTaskRequester('case-a', 'person-inactive', inactive, { preserveHistoricalRequesterId: 'person-inactive' })).resolves.toBe('person-inactive');
    await expect(validateTaskRequester('case-a', 'person-ended', ended, { preserveHistoricalRequesterId: 'other-person' })).rejects.toMatchObject({ code: 'ORGANIZATION_PERSON_NOT_ELIGIBLE' });
    await expect(validateTaskRequester('case-a', 'person-b', requesterDb({ id: 'person-b', clientId: 'client-b', employmentStatus: 'ENDED' }), { preserveHistoricalRequesterId: 'person-b' })).rejects.toMatchObject({ code: 'CROSS_CLIENT_REQUESTER' });
    const taskService = repo('src/modules/tasks/services.ts');
    expect(taskService).toContain('requestedByOrganizationPersonId: true');
    expect(taskService).toContain('{ preserveHistoricalRequesterId: existing.requestedByOrganizationPersonId }');
  });

  test('preserves the no-TimeEntry-column rule while projecting requester from Task', () => {
    const schema = repo('prisma/schema.prisma');
    const timeEntries = repo('src/routes/timeEntries.ts');
    const timeEntryModel = schema.slice(schema.indexOf('model TimeEntry'), schema.indexOf('model TimeEntry') + 2600);
    expect(timeEntryModel).not.toContain('requester');
    expect(timeEntries).toContain('entry.task?.requestedByOrganizationPerson');
    expect(timeEntries).toContain('organizationGroup: entry.task.requestedByOrganizationPerson.organizationGroup ?? null');
  });
});
