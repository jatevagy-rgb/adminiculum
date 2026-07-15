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

const PATH = '/communications/outlook/import-dry-run';
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

function assertNoWrites() {
  expect((prisma as any).communication.create).not.toHaveBeenCalled();
  expect((prisma as any).communication.update).not.toHaveBeenCalled();
  expect((prisma as any).communicationAttachment.create).not.toHaveBeenCalled();
  expect((prisma as any).communicationAttachment.update).not.toHaveBeenCalled();
}

describe('POST /communications/outlook/import-dry-run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_OUTLOOK_IMPORT;
    (prisma as any).communication.findMany.mockResolvedValue([]);
  });

  it('1. gate off → 501 OUTLOOK_IMPORT_NOT_ENABLED, no DB access, no writes', async () => {
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg] } });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'OUTLOOK_IMPORT',
      reason: 'OUTLOOK_IMPORT_NOT_ENABLED',
    });
    expect((prisma as any).communication.findMany).not.toHaveBeenCalled();
    assertNoWrites();
  });

  it('2. unauthenticated → 401', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, { authenticated: false, body: { messages: [inboundMsg] } });
    expect(res.status).toBe(401);
    expect((prisma as any).communication.findMany).not.toHaveBeenCalled();
    assertNoWrites();
  });

  it('3. invalid body (messages not array) → 400', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((prisma as any).communication.findMany).not.toHaveBeenCalled();
    assertNoWrites();
  });

  it('4. valid inbound message → success, wouldImport true, direction INBOUND', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg] } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, dryRun: true, mailboxAddress: MAILBOX });
    expect(res.body.summary).toEqual({ received: 1, new: 1, duplicates: 0, invalid: 0 });
    const item = res.body.items[0];
    expect(item).toMatchObject({ externalMessageId: 'graph-msg-1', direction: 'INBOUND', wouldImport: true, duplicate: false, valid: true });
    expect(item.communicationPreview).toMatchObject({ type: 'EMAIL', source: 'OUTLOOK', syncStatus: 'PENDING', subject: 'Kérdés a szerződésről', mailboxAddress: MAILBOX });
    assertNoWrites();
  });

  it('5. sender equals mailbox → OUTBOUND', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const outbound = { ...inboundMsg, externalMessageId: 'graph-msg-out', sender: MAILBOX, recipients: { to: ['client@example.com'], cc: [], bcc: [] } };
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [outbound] } });
    expect(res.status).toBe(200);
    expect(res.body.items[0].direction).toBe('OUTBOUND');
    assertNoWrites();
  });

  it('6. existing externalMessageId → duplicate true / wouldImport false', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    (prisma as any).communication.findMany.mockResolvedValue([{ externalMessageId: 'graph-msg-1' }]);
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg] } });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ received: 1, new: 0, duplicates: 1, invalid: 0 });
    expect(res.body.items[0]).toMatchObject({ duplicate: true, wouldImport: false });
    // Dedupe query is read-only findMany; no writes.
    expect((prisma as any).communication.findMany).toHaveBeenCalledTimes(1);
    assertNoWrites();
  });

  it('7. attachment previews included, no writes', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg] } });
    expect(res.status).toBe(200);
    expect(res.body.items[0].attachmentPreviews).toEqual([
      { providerAttachmentId: 'att-1', fileName: 'document.pdf', fileType: 'application/pdf', sizeBytes: 12345 },
    ]);
    assertNoWrites();
  });

  it('8. invalid message (missing externalMessageId) counted, others still processed', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const bad = { subject: 'no id', sender: 'x@example.com' };
    const res = await requestJson(createApp(), 'POST', PATH, { body: { mailboxAddress: MAILBOX, messages: [inboundMsg, bad] } });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ received: 2, new: 1, duplicates: 0, invalid: 1 });
    const invalidItem = res.body.items[1];
    expect(invalidItem).toMatchObject({ valid: false, wouldImport: false });
    expect(invalidItem.communicationPreview).toBeNull();
    assertNoWrites();
  });
});
