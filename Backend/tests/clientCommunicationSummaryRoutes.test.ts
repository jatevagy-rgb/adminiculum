import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: String(req.headers['x-test-user-id'] || 'user-1'),
      email: 'test@example.com',
      role: String(req.headers['x-test-role'] || 'LAWYER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    client: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    case: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    caseCollaborator: { findMany: jest.fn(), findFirst: jest.fn() },
    communication: { findMany: jest.fn() },
    communicationAttachment: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import communicationsRoutes from '../src/modules/communications/routes';

type TestResponse = { status: number; body: any };

function requestJson(
  app: Express,
  method: string,
  path: string,
  authenticated = true,
  extraHeaders: Record<string, string> = {},
): Promise<TestResponse> {
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
            ...extraHeaders,
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
        },
      );
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
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

function resetPrisma(): void {
  (prisma.client.findUnique as jest.Mock).mockReset();
  (prisma.user.findUnique as jest.Mock).mockReset();
  (prisma.case.findMany as jest.Mock).mockReset();
  (prisma.case.findFirst as jest.Mock).mockReset();
  (prisma.caseCollaborator.findMany as jest.Mock).mockReset();
  (prisma.communication.findMany as jest.Mock).mockReset();
  (prisma.communicationAttachment.findMany as jest.Mock).mockReset();
  (prisma.task.findMany as jest.Mock).mockReset();
}

const clientA = 'client-A';
const clientB = 'client-B';
const caseA = 'case-A';
const caseB = 'case-B';

describe('GET /api/v1/communications/client/:clientId/summary — HTTP auth/error behavior', () => {
  beforeEach(() => {
    resetPrisma();
  });

  it('denies an unauthenticated request (401)', async () => {
    const response = await requestJson(createApp(), 'GET', `/communications/client/${clientA}/summary`, false);
    expect(response.status).toBe(401);
  });

  it('denies a non-workforce role (403) via the workforce gate', async () => {
    const response = await requestJson(createApp(), 'GET', `/communications/client/${clientA}/summary`, true, { 'x-test-role': 'CLIENT' });
    expect(response.status).toBe(403);
  });

  it('returns 200 + safe summary for an authorized privileged workforce user', async () => {
    (prisma.client.findUnique as jest.Mock).mockResolvedValue({ id: clientA, name: 'Client A' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN', status: 'ACTIVE', isActive: true });
    (prisma.case.findMany as jest.Mock).mockResolvedValue([{ id: caseA, caseNumber: 'CA-1', title: 'Case A' }]);
    (prisma.communication.findMany as jest.Mock).mockResolvedValue([
      { id: 'comm-1', subject: 'Hello', senderName: 'Alice', senderEmail: null, recipientName: null, content: 'Hello.', caseId: caseA, clientId: null, createdAt: new Date('2026-01-01T09:00:00Z'), receivedAt: new Date('2026-01-01T09:00:00Z'), sentAt: null },
    ]);
    (prisma.communicationAttachment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const response = await requestJson(createApp(), 'GET', `/communications/client/${clientA}/summary`, true, { 'x-test-role': 'ADMIN' });
    expect(response.status).toBe(200);
    expect(response.body.client.id).toBe(clientA);
    expect(response.body.communications).toHaveLength(1);
    expect(response.body.communications[0].id).toBe('comm-1');
    expect(response.body.communications[0].subject).toBe('Hello');
  });

  it('denies a workforce user with no read access to the target client (403, fail-closed)', async () => {
    (prisma.client.findUnique as jest.Mock).mockResolvedValue({ id: clientA, name: 'Client A' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'lawyer-1', role: 'LAWYER', status: 'ACTIVE', isActive: true });
    // Lawyer's internal scope is only case B (client B); no case in client A.
    (prisma.case.findMany as jest.Mock).mockResolvedValue([{ id: caseB, clientId: clientB }]);
    (prisma.caseCollaborator.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.case.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(createApp(), 'GET', `/communications/client/${clientA}/summary`, true, { 'x-test-role': 'LAWYER' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CLIENT_ACCESS_FORBIDDEN');
  });

  it('denies a cross-client substitution for a non-privileged actor (403, fail-closed)', async () => {
    (prisma.client.findUnique as jest.Mock).mockResolvedValue({ id: clientA, name: 'Client A' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'lawyer-b', role: 'LAWYER', status: 'ACTIVE', isActive: true });
    (prisma.case.findMany as jest.Mock).mockResolvedValue([{ id: caseB, clientId: clientB }]);
    (prisma.caseCollaborator.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.case.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(createApp(), 'GET', `/communications/client/${clientA}/summary`, true, { 'x-test-role': 'LAWYER', 'x-test-user-id': 'lawyer-b' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CLIENT_ACCESS_FORBIDDEN');
  });

  it('maps an unexpected service failure to a safe 500 (no raw internal error)', async () => {
    (prisma.client.findUnique as jest.Mock).mockResolvedValue({ id: clientA, name: 'Client A' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN', status: 'ACTIVE', isActive: true });
    (prisma.case.findMany as jest.Mock).mockResolvedValue([{ id: caseA, caseNumber: 'CA-1', title: 'Case A' }]);
    (prisma.communication.findMany as jest.Mock).mockRejectedValue(new Error('boom raw internal detail'));

    const response = await requestJson(createApp(), 'GET', `/communications/client/${clientA}/summary`, true, { 'x-test-role': 'ADMIN' });
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('CLIENT_COMMUNICATION_SUMMARY_ERROR');
    // Never expose the raw error message to the client.
    expect(JSON.stringify(response.body)).not.toContain('boom raw internal detail');
  });
});
