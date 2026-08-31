import {
  CLIENT_SUMMARY_TIMESTAMP_CONTRACT,
  listClientCommunicationSummary,
  type ClientCommunicationSummaryItem,
} from '../src/modules/communications/clientSummary.service';

describe('client communication summary read model', () => {
  it('uses the effective timestamp contract and bounded relation lookups', async () => {
    const communicationFindMany = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'comm-1',
          subject: 'Subject',
          senderName: 'Sender',
          senderEmail: null,
          recipientName: null,
          content: 'Preview',
          clientId: 'client-1',
          caseId: null,
          createdAt: new Date('2026-01-01T09:00:00Z'),
          receivedAt: null,
          sentAt: new Date('2026-01-02T09:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([]);
    const caseFindMany = jest.fn().mockResolvedValue([]);
    const attachmentFindMany = jest.fn().mockResolvedValue([]);
    const taskFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      client: { findUnique: jest.fn().mockResolvedValue({ id: 'client-1', name: 'Client' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', role: 'ADMIN', status: 'ACTIVE', isActive: true }) },
      case: { findMany: caseFindMany, findFirst: jest.fn() },
      caseCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      communication: { findMany: communicationFindMany },
      communicationAttachment: { findMany: attachmentFindMany },
      task: { findMany: taskFindMany },
    } as never;

    const result = await listClientCommunicationSummary({ userId: 'user-1', role: 'ADMIN' }, 'client-1', {}, prisma);
    const item: ClientCommunicationSummaryItem = result.communications[0];

    expect(CLIENT_SUMMARY_TIMESTAMP_CONTRACT).toBe('receivedAt ?? sentAt ?? createdAt');
    expect(item.timestamp).toBe('2026-01-02T09:00:00.000Z');
    expect(item).not.toHaveProperty('providerConversationId');
    expect(item).not.toHaveProperty('mailboxAddress');
    expect(caseFindMany).toHaveBeenCalledTimes(1);
    expect(communicationFindMany).toHaveBeenCalledTimes(3);
    expect(attachmentFindMany).toHaveBeenCalledTimes(1);
    expect(taskFindMany).toHaveBeenCalledTimes(1);
  });
});
