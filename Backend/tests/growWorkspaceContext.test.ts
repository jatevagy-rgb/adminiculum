jest.mock('../src/modules/client-interaction/base', () => ({
  ...jest.requireActual('../src/modules/client-interaction/base'),
  assertClientReadAccess: jest.fn(),
}));
import { assertClientReadAccess } from '../src/modules/client-interaction/base';
import { getOpportunityPublicationWorkspaceContext } from '../src/modules/company-growth/opportunityPublicationService';

const access = assertClientReadAccess as jest.Mock;
beforeEach(() => access.mockReset());

test('suspended organization preserves Grow context without becoming a publication target', async () => {
  const db = { clientPortalWorkspace: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(1) } };
  const actor = { userId: 'lawyer', role: 'LAWYER' };
  expect(await getOpportunityPublicationWorkspaceContext(actor, 'client-a', db as any)).toEqual({ items: [], organizationMode: true });
  expect(access).toHaveBeenCalledWith(actor, 'client-a', db);
  expect(db.clientPortalWorkspace.findMany.mock.calls[0][0].where).toEqual({ clientId: 'client-a', status: 'ACTIVE', mode: { in: ['ORGANIZATION', 'CASE_RELAY'] } });
  expect(db.clientPortalWorkspace.count).toHaveBeenCalledWith({ where: { clientId: 'client-a', status: { not: 'ARCHIVED' }, mode: { in: ['ORGANIZATION', 'CASE_RELAY'] } } });
});

test('no organization remains false only after successful client-scoped reads', async () => {
  const db = { clientPortalWorkspace: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
  expect(await getOpportunityPublicationWorkspaceContext({ userId: 'reader', role: 'COLLAB_LAWYER' }, 'client-a', db as any)).toEqual({ items: [], organizationMode: false });
  db.clientPortalWorkspace.count.mockRejectedValueOnce(new Error('unavailable'));
  await expect(getOpportunityPublicationWorkspaceContext({ userId: 'reader' }, 'client-a', db as any)).rejects.toThrow('unavailable');
});

test('denied client read cannot query workspace context or targets', async () => {
  access.mockRejectedValue(new Error('forbidden'));
  const db = { clientPortalWorkspace: { findMany: jest.fn(), count: jest.fn() } };
  await expect(getOpportunityPublicationWorkspaceContext({ userId: 'foreign-reader' }, 'client-a', db as any)).rejects.toThrow('forbidden');
  expect(db.clientPortalWorkspace.findMany).not.toHaveBeenCalled();
  expect(db.clientPortalWorkspace.count).not.toHaveBeenCalled();
});
