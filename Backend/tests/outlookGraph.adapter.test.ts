jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    communication: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    communicationAttachment: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import {
  mapGraphMessagesToOutlookImportPayload,
  mapGraphMessageToOutlookImportMessage,
  type GraphMessageLike,
} from '../src/modules/communications/outlookGraph.adapter';
import { runOutlookImportDryRun } from '../src/modules/communications/outlookImport.service';

const MAILBOX = 'hubay.mate@balintfy.hu';

const graphMessage: GraphMessageLike = {
  id: 'graph-id-1',
  internetMessageId: '<internet-message-1@example.com>',
  conversationId: 'conversation-1',
  subject: 'Kérdés a szerződésről',
  from: { emailAddress: { address: 'client@example.com', name: 'Client' } },
  toRecipients: [{ emailAddress: { address: MAILBOX, name: 'Hubay Máté' } }],
  ccRecipients: [{ emailAddress: { address: 'copy@example.com' } }],
  bccRecipients: [{ emailAddress: { address: 'archive@example.com' } }],
  receivedDateTime: '2026-07-01T08:00:00.000Z',
  sentDateTime: '2026-07-01T07:59:00.000Z',
  bodyPreview: 'Rövid előnézet',
  hasAttachments: true,
  attachments: [
    { id: 'attachment-1', name: 'document.pdf', contentType: 'application/pdf', size: 12345 },
  ],
};

function assertNoWrites() {
  expect((prisma as any).communication.create).not.toHaveBeenCalled();
  expect((prisma as any).communication.update).not.toHaveBeenCalled();
  expect((prisma as any).communicationAttachment.create).not.toHaveBeenCalled();
  expect((prisma as any).communicationAttachment.update).not.toHaveBeenCalled();
}

describe('outlookGraph.adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).communication.findMany.mockResolvedValue([]);
  });

  it('maps a normal inbound Graph message', () => {
    const mapped = mapGraphMessageToOutlookImportMessage(graphMessage, MAILBOX);

    expect(mapped).toMatchObject({
      externalMessageId: '<internet-message-1@example.com>',
      providerConversationId: 'conversation-1',
      subject: 'Kérdés a szerződésről',
      sender: 'client@example.com',
      receivedAt: '2026-07-01T08:00:00.000Z',
      sentAt: '2026-07-01T07:59:00.000Z',
      bodyPreview: 'Rövid előnézet',
      hasAttachments: true,
    });
    expect(mapped.recipients.to).toEqual([MAILBOX]);
  });

  it('uses internetMessageId over id', () => {
    const mapped = mapGraphMessageToOutlookImportMessage(graphMessage, MAILBOX);

    expect(mapped.externalMessageId).toBe('<internet-message-1@example.com>');
  });

  it('falls back to id when internetMessageId is missing', () => {
    const mapped = mapGraphMessageToOutlookImportMessage(
      { ...graphMessage, internetMessageId: undefined, id: 'graph-id-fallback' },
      MAILBOX,
    );

    expect(mapped.externalMessageId).toBe('graph-id-fallback');
  });

  it('maps to/cc/bcc recipients', () => {
    const mapped = mapGraphMessageToOutlookImportMessage(graphMessage, MAILBOX);

    expect(mapped.recipients).toEqual({
      to: [MAILBOX],
      cc: ['copy@example.com'],
      bcc: ['archive@example.com'],
    });
  });

  it('maps attachment metadata only', () => {
    const mapped = mapGraphMessageToOutlookImportMessage(graphMessage, MAILBOX);

    expect(mapped.attachments).toEqual([
      {
        providerAttachmentId: 'attachment-1',
        name: 'document.pdf',
        contentType: 'application/pdf',
        sizeBytes: 12345,
      },
    ]);
    expect(JSON.stringify(mapped.attachments)).not.toContain('contentBytes');
  });

  it('defensively strips contentBytes and unknown attachment fields (no raw spread)', () => {
    const mapped = mapGraphMessageToOutlookImportMessage(
      {
        ...graphMessage,
        attachments: [
          {
            id: 'attachment-2',
            name: 'binary.pdf',
            contentType: 'application/pdf',
            size: 9001,
            // Fields Graph may return that must never be persisted or serialized:
            // @ts-expect-error contentBytes is intentionally not part of GraphAttachment
            contentBytes: 'JVBERi0xLjcncontent',
            // @ts-expect-error unknown provider fields must not be spread through
            '@odata.mediaContentType': 'application/pdf',
            // @ts-expect-error unknown provider fields must not be spread through
            isInline: true,
          },
        ],
      },
      MAILBOX,
    );

    expect(mapped.attachments).toEqual([
      { providerAttachmentId: 'attachment-2', name: 'binary.pdf', contentType: 'application/pdf', sizeBytes: 9001 },
    ]);
    const serialized = JSON.stringify(mapped);
    expect(serialized).not.toContain('contentBytes');
    expect(serialized).not.toContain('JVBERi0');
    expect(serialized).not.toContain('isInline');
    expect(serialized).not.toContain('mediaContentType');
  });

  it('handles missing sender and recipients safely', () => {
    const mapped = mapGraphMessageToOutlookImportMessage(
      {
        id: 'graph-id-2',
        subject: 'Hiányos üzenet',
        from: null,
        toRecipients: null,
        ccRecipients: undefined,
        bccRecipients: [],
      },
      MAILBOX,
    );

    expect(mapped.sender).toBeNull();
    expect(mapped.recipients).toEqual({ to: [], cc: [], bcc: [] });
    expect(mapped.attachments).toEqual([]);
  });

  it('produces a payload accepted by runOutlookImportDryRun', async () => {
    const payload = mapGraphMessagesToOutlookImportPayload([graphMessage], MAILBOX);
    const result = await runOutlookImportDryRun(payload) as any;

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      mailboxAddress: MAILBOX,
      summary: { received: 1, new: 1, duplicates: 0, invalid: 0 },
    });
    expect(result.items[0]).toMatchObject({
      externalMessageId: '<internet-message-1@example.com>',
      direction: 'INBOUND',
      wouldImport: true,
      duplicate: false,
      valid: true,
    });
    assertNoWrites();
  });

  it('does not perform network calls or database writes', () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);

    mapGraphMessagesToOutlookImportPayload([graphMessage], MAILBOX);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect((prisma as any).communication.findMany).not.toHaveBeenCalled();
    assertNoWrites();
    fetchSpy.mockRestore();
  });
});
