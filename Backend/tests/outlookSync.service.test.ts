import {
  applySafeConversationLinkage,
  OutlookImportServiceError,
  syncOutlookMailbox,
} from '../src/modules/communications/outlookImport.service';
import { OutlookGraphReaderError } from '../src/modules/communications/outlookGraphLive';

jest.mock('../src/prisma/prisma.service', () => {
  const communication = {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };
  const communicationAttachment = { create: jest.fn() };
  const mock: any = { communication, communicationAttachment };
  mock.$transaction = jest.fn((cb: any) => cb(mock));
  return { prisma: mock };
});

import { prisma } from '../src/prisma/prisma.service';

const MAILBOX = 'legal@example.com';
const CFG = { mailboxAddress: MAILBOX, clientId: 'c', clientSecret: 's', tenantId: 't' };

function fakeReader(messages: unknown[], config = CFG) {
  return {
    fetchRecentInbound: jest.fn().mockResolvedValue(messages),
    isConfigured: () => true,
    config: () => config,
  } as any;
}

function graphMsg(id: string, conv: string | null, subject = 'Téma', sender = 'client@example.com') {
  return {
    id: `g-${id}`,
    internetMessageId: `im-${id}`,
    conversationId: conv,
    subject,
    from: { emailAddress: { address: sender } },
    toRecipients: [{ emailAddress: { address: MAILBOX } }],
    receivedDateTime: '2026-07-01T08:00:00Z',
    sentDateTime: '2026-07-01T07:59:00Z',
    bodyPreview: 'Rövid előnézet',
    hasAttachments: false,
    attachments: [],
  };
}

describe('syncOutlookMailbox (service unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws OUTLOOK_IMPORT_NOT_CONFIGURED when no config', async () => {
    await expect(syncOutlookMailbox('u1', { reader: fakeReader([], null) })).rejects.toMatchObject({
      status: 501,
      responseBody: { code: 'OUTLOOK_IMPORT_NOT_CONFIGURED' },
    });
  });

  it('classifies Graph rate-limit failure into a safe 502', async () => {
    const reader = fakeReader([]);
    reader.fetchRecentInbound.mockRejectedValue(new OutlookGraphReaderError('RATE_LIMITED', 'x'));
    await expect(syncOutlookMailbox('u1', { reader })).rejects.toMatchObject({
      status: 502,
      responseBody: { code: 'OUTLOOK_GRAPH_RATE_LIMITED' },
    });
  });

  it('returns zero summary when Graph returns no messages', async () => {
    const res = await syncOutlookMailbox('u1', { reader: fakeReader([]) });
    expect(res.success).toBe(true);
    expect(res.summary).toEqual({ imported: 0, alreadyKnown: 0, needsAssignment: 0, failed: 0 });
  });

  it('imports an inbound message and leaves it as needs-assignment when no thread linkage', async () => {
    (prisma as any).communication.findMany.mockResolvedValue([]); // dedupe -> nothing existing
    (prisma as any).communication.create.mockResolvedValue({ id: 'c1' });
    (prisma as any).communicationAttachment.create.mockResolvedValue({ id: 'a1' });

    const res = await syncOutlookMailbox('u1', { reader: fakeReader([graphMsg('1', 'conv-null', 'Nincs szál')]) });
    expect(res.summary).toEqual({ imported: 1, alreadyKnown: 0, needsAssignment: 1, failed: 0 });
    expect(res.threadLinked).toBe(0);
    expect(res.items[0]).toMatchObject({ imported: true, linkedToCase: false, needsAssignment: true });
  });

  it('propagates a case via safe thread linkage when the conversation has exactly one linked case', async () => {
    // Dedupe step: nothing exists yet.
    (prisma as any).communication.findMany.mockResolvedValueOnce([]);
    (prisma as any).communication.create.mockResolvedValue({ id: 'c1' });
    (prisma as any).communicationAttachment.create.mockResolvedValue({ id: 'a1' });
    // Thread-linkage step: an existing sibling already linked to case-9.
    (prisma as any).communication.findMany.mockResolvedValueOnce([
      { id: 'sibling', caseId: 'case-9', clientId: 'client-9' },
      { id: 'c1', caseId: null, clientId: null },
    ]);
    (prisma as any).communication.update.mockResolvedValue({ id: 'c1', caseId: 'case-9' });

    const res = await syncOutlookMailbox('u1', { reader: fakeReader([graphMsg('1', 'conv-9')]) });
    expect(res.threadLinked).toBe(1);
    expect(res.summary.needsAssignment).toBe(0);
    expect(res.items[0].linkedToCase).toBe(true);
    const updateCall = (prisma as any).communication.update.mock.calls[0][0];
    expect(updateCall).toMatchObject({ where: { id: 'c1' }, data: { caseId: 'case-9', clientId: 'client-9' } });
  });

  it('leaves the message unassigned when the conversation is linked to multiple different cases (no guessing)', async () => {
    (prisma as any).communication.findMany.mockResolvedValueOnce([]); // dedupe
    (prisma as any).communication.create.mockResolvedValue({ id: 'c1' });
    (prisma as any).communicationAttachment.create.mockResolvedValue({ id: 'a1' });
    (prisma as any).communication.findMany.mockResolvedValueOnce([
      { id: 's1', caseId: 'case-A', clientId: 'client-A' },
      { id: 's2', caseId: 'case-B', clientId: 'client-B' },
      { id: 'c1', caseId: null, clientId: null },
    ]);

    const res = await syncOutlookMailbox('u1', { reader: fakeReader([graphMsg('1', 'conv-mixed')]) });
    expect(res.threadLinked).toBe(0);
    expect(res.summary.needsAssignment).toBe(1);
    expect(res.items[0].linkedToCase).toBe(false);
    expect((prisma as any).communication.update).not.toHaveBeenCalled();
  });

  it('counts an existing message as already-known (duplicate), never re-imports', async () => {
    (prisma as any).communication.findMany.mockResolvedValueOnce([{ id: 'existing', externalMessageId: 'im-1' }]);
    const res = await syncOutlookMailbox('u1', { reader: fakeReader([graphMsg('1', null)]) });
    expect(res.summary).toEqual({ imported: 0, alreadyKnown: 1, needsAssignment: 0, failed: 0 });
    expect(res.items[0]).toMatchObject({ duplicate: true, imported: false });
    expect((prisma as any).communication.create).not.toHaveBeenCalled();
  });
});

describe('applySafeConversationLinkage', () => {
  it('propagates only when exactly one distinct case exists', async () => {
    const db = {
      communication: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's', caseId: 'case-1', clientId: 'client-1' },
          { id: 'new', caseId: null, clientId: null },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;

    const { linked, unassigned } = await applySafeConversationLinkage(db, [
      { communicationId: 'new', providerConversationId: 'conv-1' },
    ]);
    expect(linked).toEqual(['new']);
    expect(unassigned).toEqual([]);
    expect(db.communication.update).toHaveBeenCalledWith({
      where: { id: 'new' },
      data: { caseId: 'case-1', clientId: 'client-1' },
    });
  });

  it('leaves unassigned when multiple distinct cases are present', async () => {
    const db = {
      communication: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's1', caseId: 'case-A', clientId: 'client-A' },
          { id: 's2', caseId: 'case-B', clientId: 'client-B' },
        ]),
        update: jest.fn(),
      },
    } as any;

    const { linked, unassigned } = await applySafeConversationLinkage(db, [
      { communicationId: 'new', providerConversationId: 'conv-x' },
    ]);
    expect(linked).toEqual([]);
    expect(unassigned).toEqual(['new']);
    expect(db.communication.update).not.toHaveBeenCalled();
  });

  it('leaves unassigned when the conversation has no linked case', async () => {
    const db = {
      communication: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1', caseId: null, clientId: null }]),
        update: jest.fn(),
      },
    } as any;

    const { linked, unassigned } = await applySafeConversationLinkage(db, [
      { communicationId: 'new', providerConversationId: 'conv-y' },
    ]);
    expect(linked).toEqual([]);
    expect(unassigned).toEqual(['new']);
  });
});
