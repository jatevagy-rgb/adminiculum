import {
  CLIENT_SUMMARY_TIMESTAMP_CONTRACT,
  listClientCommunicationSummary,
  type Prisma,
} from '../src/modules/communications/clientSummary.service';

describe('Client communication summary read model (bounded queries + predicate guard)', () => {
  const clientId = 'client-A';
  const caseA = 'case-A';
  const actor = { userId: 'admin-1', role: 'ADMIN' };

  function buildMockPrisma(communicationRows: Array<Record<string, unknown>> = [{
    id: 'comm-1',
    subject: 'Hello',
    senderName: 'Alice',
    senderEmail: null,
    recipientName: null,
    content: 'Hello from the client.',
    caseId: null,
    clientId,
    createdAt: new Date('2026-01-01T09:00:00Z'),
    receivedAt: null,
    sentAt: null,
  }]) {
    const caseFindMany = jest.fn().mockResolvedValue([
      { id: caseA, caseNumber: 'CA-1', title: 'Case A' },
    ]);
    const communicationFindMany = jest.fn().mockResolvedValue(communicationRows);
    const communicationAttachmentFindMany = jest.fn().mockResolvedValue([]);
    const taskFindMany = jest.fn().mockResolvedValue([]);

    const prisma = {
      client: { findUnique: jest.fn().mockResolvedValue({ id: clientId, name: 'Client A' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: actor.userId, role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      case: { findMany: caseFindMany },
      communication: { findMany: communicationFindMany },
      communicationAttachment: { findMany: communicationAttachmentFindMany },
      task: { findMany: taskFindMany },
    };

    return { prisma: prisma as unknown as Prisma, caseFindMany, communicationFindMany, communicationAttachmentFindMany, taskFindMany };
  }

  it('performs a bounded number of queries (no N+1 per-case loop)', async () => {
    const { prisma, caseFindMany, communicationFindMany, communicationAttachmentFindMany, taskFindMany } = buildMockPrisma();

    await listClientCommunicationSummary(actor, clientId, { limit: 5 }, prisma);

    expect(caseFindMany).toHaveBeenCalledTimes(1);
    expect(communicationFindMany).toHaveBeenCalledTimes(1);
    expect(communicationAttachmentFindMany).toHaveBeenCalledTimes(1);
    expect(taskFindMany).toHaveBeenCalledTimes(1);
  });

  it('cannot regress to the unrestricted direct-client OR arm (predicate guard)', async () => {
    const { prisma, communicationFindMany } = buildMockPrisma();

    await listClientCommunicationSummary(actor, clientId, { limit: 5 }, prisma);

    const where = communicationFindMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(Array.isArray(where.OR)).toBe(true);

    const anyUnrestrictedDirectArm = (where.OR as Array<Record<string, unknown>>).find(
      (arm) => Object.prototype.hasOwnProperty.call(arm, 'clientId') && !Object.prototype.hasOwnProperty.call(arm, 'caseId'),
    );
    // The buggy `{ clientId }` alone (no caseId constraint) must never reappear.
    expect(anyUnrestrictedDirectArm).toBeUndefined();
  });

  it('constrains case-linked arms so a clientId match never overrides case authorization', async () => {
    const { prisma, communicationFindMany } = buildMockPrisma();

    await listClientCommunicationSummary(actor, clientId, { limit: 5 }, prisma);

    const where = communicationFindMany.mock.calls[0][0].where as Record<string, unknown>;
    for (const arm of where.OR as Array<Record<string, unknown>>) {
      if (Object.prototype.hasOwnProperty.call(arm, 'caseId') && Object.prototype.hasOwnProperty.call(arm, 'clientId')) {
        expect(arm.clientId === null || arm.clientId === clientId).toBe(true);
      }
    }
  });

  it('computes counts only for the authorized returned ids', async () => {
    const { prisma, communicationAttachmentFindMany, taskFindMany } = buildMockPrisma();

    const result = await listClientCommunicationSummary(actor, clientId, { limit: 5 }, prisma);
    const returnedIds = result.communications.map((item) => item.id);

    expect(communicationAttachmentFindMany).toHaveBeenCalledTimes(1);
    expect(communicationAttachmentFindMany.mock.calls[0][0].where.communicationId.in).toEqual(returnedIds);

    expect(taskFindMany).toHaveBeenCalledTimes(1);
    expect(taskFindMany.mock.calls[0][0].where.sourceCommunicationId.in).toEqual(returnedIds);
  });

  it('returns a provider-safe DTO whose id is the internal resource identifier', async () => {
    const { prisma } = buildMockPrisma();
    const result = await listClientCommunicationSummary(actor, clientId, { limit: 5 }, prisma);

    expect(result.client).toEqual({ id: clientId, name: 'Client A' });
    expect(result.communications).toHaveLength(1);

    const item = result.communications[0];
    // id is an internal uuid resource identifier — not a provider/graph/storage/external id.
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)).toBe(true);
    expect(item.sender).toBe('Alice');
    expect(item.subject).toBe('Hello');
    expect(item.preview).toBe('Hello from the client.');
    expect(item.caseId).toBe(null);
    expect(item.caseNumber).toBe(null);
    expect(item.attachmentCount).toBe(0);
    expect(item.taskCount).toBe(0);

    for (const forbiddenKey of ['providerConversationId', 'externalMessageId', 'spItemId', 'url', 'graphId', 'syncStatus', 'metadata']) {
      expect(Object.prototype.hasOwnProperty.call(item, forbiddenKey)).toBe(false);
    }
  });

  it('pins the documented timestamp/order contract', () => {
    expect(CLIENT_SUMMARY_TIMESTAMP_CONTRACT).toBe('receivedAt ?? sentAt ?? createdAt');
  });
});
