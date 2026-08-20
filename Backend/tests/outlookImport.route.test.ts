import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    (req as any).user = {
      userId: String(req.headers['x-test-user-id'] || 'user-1'),
      email: 'test@example.com',
      role: String(req.headers['x-test-role'] || 'LAWYER'),
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => {
  const mock: any = {
    communication: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    communicationAttachment: { create: jest.fn(), update: jest.fn() },
    case: { create: jest.fn(), findUnique: jest.fn() },
    task: { create: jest.fn() },
  };
  mock.$transaction = jest.fn((cb: any) => cb(mock));
  return { prisma: mock };
});

import { prisma } from '../src/prisma/prisma.service';
import communicationsRoutes from '../src/modules/communications/routes';

type TestResponse = { status: number; body: any };

function requestJson(
  app: Express,
  method: string,
  path: string,
  options: { authenticated?: boolean; body?: unknown } = {}
): Promise<TestResponse> {
  const { authenticated = true, body } = options;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            'content-type': 'application/json',
            ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
          });
        }
      );
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (payload) request.write(payload);
      request.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/communications', communicationsRoutes);
  return app;
}

const PATH = '/communications/outlook/import';
const MAILBOX = 'hubay.mate@balintfy.hu';

const inboundMsg = {
  externalMessageId: 'graph-msg-1',
  providerConversationId: 'conv-1',
  subject: 'Kérdés a szerződésről',
  sender: 'client@example.com',
  recipients: { to: [MAILBOX], cc: [], bcc: [] },
  receivedAt: '2026-07-01T08:00:00.000Z',
  sentAt: '2026-07-01T07:59:00.000Z',
  bodyPreview: 'Rövid előnézet',
  hasAttachments: true,
  attachments: [
    { providerAttachmentId: 'att-1', name: 'document.pdf', contentType: 'application/pdf', sizeBytes: 12345 },
  ],
};

function noRelationshipWrites() {
  expect((prisma as any).case.create).not.toHaveBeenCalled();
  expect((prisma as any).task.create).not.toHaveBeenCalled();
}

describe('POST /communications/outlook/import (mock write import)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_OUTLOOK_IMPORT;
    process.env.COMMUNICATIONS_MAILBOX = MAILBOX;
    process.env.OUTLOOK_GRAPH_CLIENT_ID = 'graph-client';
    process.env.OUTLOOK_GRAPH_CLIENT_SECRET = 'graph-secret';
    process.env.OUTLOOK_GRAPH_TENANT_ID = 'graph-tenant';
    (prisma as any).communication.findMany.mockResolvedValue([]);
    (prisma as any).communication.create.mockResolvedValue({ id: 'new-1' });
    (prisma as any).communicationAttachment.create.mockResolvedValue({ id: 'att-row-1' });
  });

  it('1. gate off → 501, no reads/writes', async () => {
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg] } });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE', feature: 'OUTLOOK_IMPORT', reason: 'OUTLOOK_IMPORT_NOT_ENABLED' });
    expect((prisma as any).communication.findMany).not.toHaveBeenCalled();
    expect((prisma as any).communication.create).not.toHaveBeenCalled();
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it('2. unauthenticated → 401', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, { authenticated: false, body: { messages: [inboundMsg] } });
    expect(res.status).toBe(401);
    expect((prisma as any).communication.create).not.toHaveBeenCalled();
  });

  it('3. invalid body → 400', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((prisma as any).communication.create).not.toHaveBeenCalled();
  });

  it('rejects a client-supplied mailbox outside the server scope', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, {
      body: { mailboxAddress: 'other@example.com', messages: [inboundMsg] },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTLOOK_MAILBOX_SCOPE_MISMATCH');
    expect((prisma as any).communication.create).not.toHaveBeenCalled();
  });

  it('4. valid inbound message creates one communication', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg] } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, dryRun: false, mailboxAddress: MAILBOX });
    expect(res.body.summary).toEqual({ received: 1, imported: 1, duplicates: 0, invalid: 0 });
    expect(res.body.items[0]).toMatchObject({ externalMessageId: 'graph-msg-1', communicationId: 'new-1', imported: true, duplicate: false, direction: 'INBOUND' });
    expect((prisma as any).communication.create).toHaveBeenCalledTimes(1);
    const data = (prisma as any).communication.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'EMAIL', source: 'OUTLOOK', syncStatus: 'IMPORTED', externalMessageId: 'graph-msg-1', direction: 'INBOUND', createdById: 'user-1' });
    noRelationshipWrites();
  });

  it('5. sender equals mailbox → OUTBOUND', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const outbound = { ...inboundMsg, externalMessageId: 'graph-out', sender: MAILBOX };
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [outbound] } });
    expect(res.status).toBe(201);
    expect(res.body.items[0].direction).toBe('OUTBOUND');
    expect((prisma as any).communication.create.mock.calls[0][0].data.direction).toBe('OUTBOUND');
  });

  it('6. existing externalMessageId → duplicate, no second create', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    (prisma as any).communication.findMany.mockResolvedValue([{ id: 'existing-1', externalMessageId: 'graph-msg-1' }]);
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg] } });
    expect(res.status).toBe(201);
    expect(res.body.summary).toEqual({ received: 1, imported: 0, duplicates: 1, invalid: 0 });
    expect(res.body.items[0]).toMatchObject({ duplicate: true, imported: false, communicationId: 'existing-1' });
    expect((prisma as any).communication.create).not.toHaveBeenCalled();
    expect((prisma as any).communicationAttachment.create).not.toHaveBeenCalled();
  });

  it('7. attachment metadata created without binary content', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg] } });
    expect(res.status).toBe(201);
    expect((prisma as any).communicationAttachment.create).toHaveBeenCalledTimes(1);
    const data = (prisma as any).communicationAttachment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ communicationId: 'new-1', fileName: 'document.pdf', fileType: 'application/pdf', providerAttachmentId: 'att-1', sizeBytes: 12345, uploadedById: 'user-1' });
    // No binary payload stored.
    expect(data.content).toBeUndefined();
    expect(data.bytes).toBeUndefined();
    expect(data.data).toBeUndefined();
  });

  it('8. duplicate attachment provider id does not duplicate attachment metadata', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const dupAtt = {
      ...inboundMsg,
      externalMessageId: 'graph-dupatt',
      attachments: [
        { providerAttachmentId: 'att-x', name: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1 },
        { providerAttachmentId: 'att-x', name: 'a-again.pdf', contentType: 'application/pdf', sizeBytes: 1 },
      ],
    };
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [dupAtt] } });
    expect(res.status).toBe(201);
    expect((prisma as any).communicationAttachment.create).toHaveBeenCalledTimes(1);
  });

  it('9. mixed batch: invalid skipped, valid imported', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const bad = { subject: 'no id', sender: 'x@example.com' };
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg, bad] } });
    expect(res.status).toBe(201);
    expect(res.body.summary).toEqual({ received: 2, imported: 1, duplicates: 0, invalid: 1 });
    expect((prisma as any).communication.create).toHaveBeenCalledTimes(1);
    const invalidItem = res.body.items[1];
    expect(invalidItem).toMatchObject({ valid: false, imported: false, communicationId: null });
  });

  it('10. no case/client/document/task relationships are invented', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    // Even if payload smuggles a caseId/clientId, import must not set them.
    const smuggled = { ...inboundMsg, externalMessageId: 'graph-smuggle', caseId: 'case-x', clientId: 'client-x', documentId: 'doc-x' };
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [smuggled] } });
    expect(res.status).toBe(201);
    const data = (prisma as any).communication.create.mock.calls[0][0].data;
    expect(data.caseId).toBeUndefined();
    expect(data.clientId).toBeUndefined();
    expect(data.documentId).toBeUndefined();
    noRelationshipWrites();
  });
});
