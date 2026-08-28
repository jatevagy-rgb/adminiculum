import { listClientCommunicationSummary, type Prisma } from '../src/modules/communications/clientSummary.service';

describe('Client communication summary read model (bounded queries, no N+1)', () => {
  const clientId = 'client-A';
  const caseA = 'case-A';
  const actor = { userId: 'admin-1', role: 'ADMIN' };

  function buildMockPrisma() {
    const caseFindMany = jest.fn().mockResolvedValue([
      { id: caseA, caseNumber: 'CA-1', title: 'Case A' },
    ]);
    const communicationFindMany = jest.fn().mockResolvedValue([
      {
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
      },
    ]);
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

  it('performs a bounded number of queries (one case lookup, one communication lookup)', async () => {
    const { prisma, caseFindMany, communicationFindMany, communicationAttachmentFindMany, taskFindMany } = buildMockPrisma();

    await listClientCommunicationSummary(actor, clientId, { limit: 5 }, prisma);

    // No N+1: exactly one per-case-independent lookup, not a loop over cases.
    expect(caseFindMany).toHaveBeenCalledTimes(1);
    expect(communicationFindMany).toHaveBeenCalledTimes(1);
    expect(communicationAttachmentFindMany).toHaveBeenCalledTimes(1);
    expect(taskFindMany).toHaveBeenCalledTimes(1);
  });

  it('returns a provider-safe DTO with no provider/storage identifiers', async () => {
    const { prisma } = buildMockPrisma();
    const result = await listClientCommunicationSummary(actor, clientId, { limit: 5 }, prisma);

    expect(result.client).toEqual({ id: clientId, name: 'Client A' });
    expect(result.communications).toHaveLength(1);

    const item = result.communications[0];
    expect(item.id).toBe('comm-1');
    expect(item.sender).toBe('Alice');
    expect(item.subject).toBe('Hello');
    expect(item.preview).toBe('Hello from the client.');
    expect(item.caseId).toBe(null);
    expect(item.caseNumber).toBe(null);
    expect(item.attachmentCount).toBe(0);
    expect(item.taskCount).toBe(0);

    for (const forbiddenKey of ['providerConversationId', 'spItemId', 'url', 'syncStatus', 'externalMessageId', 'metadata']) {
      expect(Object.prototype.hasOwnProperty.call(item, forbiddenKey)).toBe(false);
    }
  });
});
