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
    communication: { findUnique: jest.fn(), update: jest.fn() },
    client: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    case: { findUnique: jest.fn() },
    caseCollaborator: { findFirst: jest.fn() },
    task: { create: jest.fn() },
    timelineEvent: { create: jest.fn() },
  };
  mock.$transaction = jest.fn((cb: any) => cb(mock));
  return { prisma: mock };
});

jest.mock('../src/modules/cases/services', () => ({
  __esModule: true,
  default: { createCase: jest.fn() },
}));

import { prisma } from '../src/prisma/prisma.service';
import casesService from '../src/modules/cases/services';
import communicationsRoutes from '../src/modules/communications/routes';

type TestResponse = { status: number; body: any };

function requestJson(
  app: Express,
  method: string,
  path: string,
  options: { authenticated?: boolean; body?: unknown; role?: string } = {},
): Promise<TestResponse> {
  const { authenticated = true, body, role } = options;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request({
        hostname: '127.0.0.1', port: address.port, path, method,
        headers: {
          ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
          ...(role ? { 'x-test-role': role } : {}),
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
        });
      });
      request.on('error', (error) => { server.close(); reject(error); });
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

const validBody = { title: 'Ügy: Bérleti szerződés felülvizsgálat', matterType: 'LEASE' };
const routeCommunication = { id: 'comm-1', caseId: null, clientId: 'client-1', subject: 'Bérleti szerződés', summary: 'Ügyfél kérdés.' };

function seedUnlinkedCommunication(): void {
  (prisma as any).communication.findUnique
    .mockResolvedValueOnce({ id: 'comm-1', caseId: null, createdById: 'user-1' })
    .mockResolvedValueOnce(routeCommunication);
  (prisma as any).client.findUnique.mockResolvedValue({ id: 'client-1', name: 'Teszt Kft.' });
  (casesService.createCase as jest.Mock).mockResolvedValue({
    id: 'case-new', caseNumber: 'CASE-2026-001', title: validBody.title, status: 'CLIENT_INPUT', createdAt: new Date(),
  });
  (prisma as any).communication.update.mockResolvedValue({ id: 'comm-1', caseId: 'case-new' });
  (prisma as any).timelineEvent.create.mockResolvedValue({ id: 'timeline-1' });
}

describe('POST /communications/:id/create-case', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma as any).$transaction = jest.fn((cb: any) => cb(prisma));
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
  });

  afterEach(() => { delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE; });

  it('keeps the feature gate closed before any transaction or case creation', async () => {
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', { body: validBody });
    expect(response.status).toBe(501);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect(casesService.createCase).not.toHaveBeenCalled();
  });

  it.each(['CLIENT', 'EXTERNAL_REVIEWER'])('denies non-workforce %s identities', async (role) => {
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', { body: validBody, role });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('WORKFORCE_ACCESS_REQUIRED');
    expect(casesService.createCase).not.toHaveBeenCalled();
  });

  it('fails closed when the communication is missing or already linked', async () => {
    (prisma as any).communication.findUnique.mockResolvedValueOnce(null);
    const missing = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', { body: validBody });
    expect(missing.status).toBe(404);

    jest.resetAllMocks();
    (prisma as any).$transaction = jest.fn((cb: any) => cb(prisma));
    (prisma as any).communication.findUnique
      .mockResolvedValueOnce({ id: 'comm-1', caseId: 'case-old', createdById: 'user-1' })
      .mockResolvedValueOnce({ ...routeCommunication, caseId: 'case-old' });
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-old', assignedLawyerId: null, createdById: 'user-1' });
    const linked = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', { body: validBody });
    expect(linked.status).toBe(409);
    expect(linked.body.code).toBe('COMMUNICATION_ALREADY_LINKED');
    expect(casesService.createCase).not.toHaveBeenCalled();
  });

  it('requires a client linked to the communication and never falls back to the request body', async () => {
    (prisma as any).communication.findUnique
      .mockResolvedValueOnce({ id: 'comm-1', caseId: null, createdById: 'user-1' })
      .mockResolvedValueOnce({ ...routeCommunication, clientId: null });
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { ...validBody, clientId: 'client-from-body' },
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('COMMUNICATION_CLIENT_REQUIRED');
    expect(casesService.createCase).not.toHaveBeenCalled();
  });

  it.each(['client-2', 'unrelated-client'])('denies request client substitution (%s)', async (clientId) => {
    seedUnlinkedCommunication();
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { ...validBody, clientId },
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('COMMUNICATION_CLIENT_MISMATCH');
    expect(casesService.createCase).not.toHaveBeenCalled();
  });

  it('allows an equal client id but creates through the canonical work-package-aware case service', async () => {
    seedUnlinkedCommunication();
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { ...validBody, clientId: 'client-1' },
    });
    expect(response.status).toBe(201);
    expect(casesService.createCase).toHaveBeenCalledWith(expect.objectContaining({
      title: validBody.title, clientId: 'client-1', clientName: 'Teszt Kft.', matterType: 'LEASE', createdById: 'user-1',
    }), prisma, { withinTransaction: true, provisionCaseFolders: false });
    expect((prisma as any).communication.update).toHaveBeenCalledWith({ where: { id: 'comm-1' }, data: { caseId: 'case-new' } });
    expect(response.body.case).toEqual({ id: 'case-new', caseNumber: 'CASE-2026-001', title: validBody.title });
  });

  it.each([
    ['CLIENT', true],
    ['EXTERNAL_REVIEWER', true],
    ['COLLAB_LAWYER', false],
  ])('applies canonical workforce eligibility for %s assignees', async (role, denied) => {
    seedUnlinkedCommunication();
    (prisma as any).user.findUnique.mockResolvedValue({ id: 'assignee-1', role, status: 'ACTIVE', isActive: true });
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { ...validBody, assignedLawyerId: 'assignee-1' },
    });
    if (denied) {
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_ASSIGNED_LAWYER');
      expect(casesService.createCase).not.toHaveBeenCalled();
    } else {
      expect(response.status).toBe(201);
      expect(casesService.createCase).toHaveBeenCalledWith(expect.objectContaining({ assignedLawyerId: 'assignee-1' }), prisma, expect.anything());
    }
  });

  it('denies an inactive workforce assignee', async () => {
    seedUnlinkedCommunication();
    (prisma as any).user.findUnique.mockResolvedValue({ id: 'assignee-1', role: 'LAWYER', status: 'INACTIVE', isActive: false });
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { ...validBody, assignedLawyerId: 'assignee-1' },
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_ASSIGNED_LAWYER');
    expect(casesService.createCase).not.toHaveBeenCalled();
  });

  it('does not return success when a later in-transaction task write fails', async () => {
    seedUnlinkedCommunication();
    (prisma as any).task.create.mockRejectedValue(new Error('task insert failed'));
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { ...validBody, task: { title: 'Első feladat' } },
    });
    expect(response.status).not.toBe(201);
    expect(response.body?.success).not.toBe(true);
  });
});
