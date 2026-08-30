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

jest.mock('../src/modules/communications/outlookImport.service', () => {
  const actual = jest.requireActual('../src/modules/communications/outlookImport.service');
  return {
    ...actual,
    syncOutlookMailbox: jest.fn(),
  };
});

jest.mock('../src/prisma/prisma.service', () => {
  const communication = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };
  const communicationAttachment = { findMany: jest.fn(), create: jest.fn() };
  const client = { findMany: jest.fn(), findUnique: jest.fn() };
  const caseData: any = { findUnique: jest.fn(), findMany: jest.fn() };
  const caseCollaborator = { findFirst: jest.fn() };
  const task = { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() };
  const timelineEvent = { create: jest.fn() };
  const mock: any = { communication, communicationAttachment, client, case: caseData, caseCollaborator, task, timelineEvent };
  mock.$transaction = jest.fn((cb: any) => cb(mock));
  return { prisma: mock };
});

import { prisma } from '../src/prisma/prisma.service';
import { syncOutlookMailbox, OutlookImportServiceError } from '../src/modules/communications/outlookImport.service';
import communicationsRoutes from '../src/modules/communications/routes';

type TestResponse = { status: number; body: any };

function requestJson(
  app: Express,
  method: string,
  path: string,
  options: { authenticated?: boolean; body?: unknown; role?: string } = {}
): Promise<TestResponse> {
  const { authenticated = true, body, role = 'ADMIN' } = options;
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
            ...(authenticated ? { authorization: 'Bearer test-token', 'x-test-role': role } : {}),
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

const SYNC_PATH = '/communications/outlook/sync';
const OK_RESULT = {
  success: true,
  configured: true,
  mailboxAddress: 'legal@example.com',
  summary: { imported: 2, alreadyKnown: 1, needsAssignment: 1, failed: 0 },
  threadLinked: 1,
  items: [],
};

describe('POST /communications/outlook/sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_OUTLOOK_IMPORT;
  });

  it('1. gate off -> 501, sync never called', async () => {
    const res = await requestJson(createApp(), 'POST', SYNC_PATH, { body: {} });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE', feature: 'OUTLOOK_IMPORT' });
    expect(syncOutlookMailbox).not.toHaveBeenCalled();
  });

  it('2. unauthenticated (customer/absent token) -> 401 before any sync', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', SYNC_PATH, { authenticated: false, body: {} });
    expect(res.status).toBe(401);
    expect(syncOutlookMailbox).not.toHaveBeenCalled();
  });

  it('rejects a customer identity at the backend boundary', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    const res = await requestJson(createApp(), 'POST', SYNC_PATH, { role: 'CLIENT', body: {} });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WORKFORCE_ACCESS_REQUIRED');
    expect(syncOutlookMailbox).not.toHaveBeenCalled();
  });

  it('3. workforce token + gate on -> 201 with safe summary', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    (syncOutlookMailbox as jest.Mock).mockResolvedValue(OK_RESULT);
    const res = await requestJson(createApp(), 'POST', SYNC_PATH, { body: {} });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, summary: { imported: 2, alreadyKnown: 1, needsAssignment: 1, failed: 0 } });
    expect(JSON.stringify(res.body)).not.toContain('Bearer');
    expect(JSON.stringify(res.body)).not.toContain('access_token');
  });

  it('4. Graph failure from service -> 502 safe message', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    (syncOutlookMailbox as jest.Mock).mockRejectedValue(
      new OutlookImportServiceError(
        502,
        { status: 502, code: 'OUTLOOK_GRAPH_RATE_LIMITED', message: 'Próbáld újra később.', feature: 'OUTLOOK_IMPORT' },
        'x',
      ),
    );
    const res = await requestJson(createApp(), 'POST', SYNC_PATH, { body: {} });
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: 'OUTLOOK_GRAPH_RATE_LIMITED' });
  });
});

describe('POST /communications/:id/link-client (explicit safe assignment)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
  });

  it('gate off -> 501', async () => {
    const res = await requestJson(createApp(), 'POST', '/communications/c-1/link-client', { body: { clientId: 'client-1' } });
    expect(res.status).toBe(501);
  });

  it('gate on, assigns client to an unassigned communication', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).client.findUnique.mockResolvedValue({ id: 'client-1', name: 'ACME Kft.' });
    (prisma as any).communication.findUnique.mockResolvedValue({ id: 'c-1', clientId: null, caseId: null });
    (prisma as any).communication.update.mockResolvedValue({ id: 'c-1', clientId: 'client-1', caseId: null, subject: 'Kérdés' });

    const res = await requestJson(createApp(), 'POST', '/communications/c-1/link-client', { body: { clientId: 'client-1' } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((prisma as any).communication.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-1' }, data: { clientId: 'client-1' } }),
    );
  });

  it('unknown client -> 404, no update', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).client.findUnique.mockResolvedValue(null);
    const res = await requestJson(createApp(), 'POST', '/communications/c-1/link-client', { body: { clientId: 'nope' } });
    expect(res.status).toBe(404);
    expect((prisma as any).communication.update).not.toHaveBeenCalled();
  });
});

describe('POST /communications/:id/ignore and /unignore (triage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
  });

  it('ignore persists triage flag in metadata JSON', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValueOnce({ id: 'c-1', caseId: null, metadata: {} });
    (prisma as any).communication.findUnique.mockResolvedValueOnce({ id: 'c-1', caseId: null, metadata: {} });
    (prisma as any).communication.update.mockResolvedValue({ id: 'c-1', metadata: { triage: 'IGNORED' } });

    const res = await requestJson(createApp(), 'POST', '/communications/c-1/ignore', { body: {} });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((prisma as any).communication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metadata: { triage: 'IGNORED' } } }),
    );
  });

  it('cannot ignore a case-linked communication -> 409', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({ id: 'c-1', caseId: 'case-1', metadata: {} });
    const res = await requestJson(createApp(), 'POST', '/communications/c-1/ignore', { body: {} });
    expect(res.status).toBe(409);
    expect((prisma as any).communication.update).not.toHaveBeenCalled();
  });

  it('unignore removes the triage flag', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValueOnce({ id: 'c-1', caseId: null, metadata: {} });
    (prisma as any).communication.findUnique.mockResolvedValueOnce({ id: 'c-1', caseId: null, metadata: { triage: 'IGNORED' } });
    (prisma as any).communication.update.mockResolvedValue({ id: 'c-1', metadata: {} });

    const res = await requestJson(createApp(), 'POST', '/communications/c-1/unignore', { body: {} });
    expect(res.status).toBe(200);
    expect((prisma as any).communication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metadata: {} } }),
    );
  });
});

describe('GET /communications (list DTO triage + bounded shape)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps triage for linked / needs-assignment / ignored rows', async () => {
    (prisma as any).communication.findMany.mockResolvedValue([
      { id: 'c-link', type: 'EMAIL', subject: 'S', senderName: 'A', senderEmail: 'a@x', recipientName: null, recipientEmail: null, content: 'body', summary: null, caseId: 'case-1', clientId: 'client-1', documentId: null, createdById: 'u', createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), providerConversationId: 'conv-1', direction: 'INBOUND', receivedAt: new Date('2026-01-01T00:00:00Z'), source: 'OUTLOOK', syncStatus: 'IMPORTED', metadata: {} },
      { id: 'c-need', type: 'EMAIL', subject: 'S2', senderName: 'B', senderEmail: 'b@x', recipientName: null, recipientEmail: null, content: null, summary: null, caseId: null, clientId: null, documentId: null, createdById: 'u', createdAt: new Date('2026-01-02T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'), providerConversationId: 'conv-2', direction: 'INBOUND', receivedAt: new Date('2026-01-02T00:00:00Z'), source: 'OUTLOOK', syncStatus: 'IMPORTED', metadata: {} },
      { id: 'c-ign', type: 'EMAIL', subject: 'S3', senderName: 'C', senderEmail: 'c@x', recipientName: null, recipientEmail: null, content: null, summary: null, caseId: null, clientId: null, documentId: null, createdById: 'u', createdAt: new Date('2026-01-03T00:00:00Z'), updatedAt: new Date('2026-01-03T00:00:00Z'), providerConversationId: null, direction: 'INBOUND', receivedAt: new Date('2026-01-03T00:00:00Z'), source: 'OUTLOOK', syncStatus: 'IMPORTED', metadata: { triage: 'IGNORED' } },
    ]);
    (prisma as any).communicationAttachment.findMany.mockResolvedValue([]);
    (prisma as any).task.findMany.mockResolvedValue([]);
    (prisma as any).client.findMany.mockResolvedValue([]);
    (prisma as any).communication.count.mockResolvedValue(3);

    const res = await requestJson(createApp(), 'GET', '/communications?limit=10', {});
    expect(res.status).toBe(200);
    const list = res.body.communications;
    const byId = (id: string) => list.find((c: any) => c.id === id);
    expect(byId('c-link').triage).toBe('LINKED');
    expect(byId('c-need').triage).toBe('NEEDS_ASSIGNMENT');
    expect(byId('c-ign').triage).toBe('IGNORED');
    // Lean DTO: content preview only, no full body; direction/thread preserved.
    expect(byId('c-link').content).toBeUndefined();
    expect(byId('c-link').contentPreview).toBe('body');
    expect(byId('c-link').direction).toBe('INBOUND');
    expect(byId('c-link').providerConversationId).toBe('conv-1');
  });
});
