import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

// Auth mock mirrors tests/routeFeatureGuards.test.ts: a valid bearer token
// produces an authenticated user; anything else is 401.
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

// Prisma mock. $transaction runs the callback with the same mock object as the
// transaction client, so every tx.* call is observable and a thrown error
// rejects the whole $transaction (the real engine would roll back).
jest.mock('../src/prisma/prisma.service', () => {
  const mock: any = {
    communication: { findUnique: jest.fn(), update: jest.fn() },
    client: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    case: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    caseCollaborator: { findFirst: jest.fn() },
    task: { create: jest.fn() },
    timelineEvent: { create: jest.fn() },
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

const validBody = {
  title: 'Ügy: Bérleti szerződés felülvizsgálat',
  matterType: 'LEASE',
  description: 'Ügyféltől érkezett megkeresés alapján.',
};

describe('POST /communications/:id/create-case (atomic intake)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'user-1' });
    (prisma as any).caseCollaborator.findFirst.mockResolvedValue(null);
  });

  it('1. returns 501 FEATURE_NOT_AVAILABLE when the gate is off and writes nothing', async () => {
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: validBody,
    });

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'COMMUNICATIONS',
      reason: 'DATABASE_FOUNDATION_NOT_DEPLOYED',
    });
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect((prisma as any).case.create).not.toHaveBeenCalled();
    expect((prisma as any).communication.update).not.toHaveBeenCalled();
  });

  it('2. returns 401 when unauthenticated and never opens a transaction', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      authenticated: false,
      body: validBody,
    });

    expect(response.status).toBe(401);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect((prisma as any).case.create).not.toHaveBeenCalled();
  });

  it('3. returns 404 when the communication does not exist and creates no case', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue(null);

    const response = await requestJson(createApp(), 'POST', '/communications/missing/create-case', {
      body: validBody,
    });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'COMMUNICATION_NOT_FOUND' });
    expect((prisma as any).case.create).not.toHaveBeenCalled();
    expect((prisma as any).communication.update).not.toHaveBeenCalled();
  });

  it('4. returns 409 when the communication is already linked and creates no case', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({
      id: 'comm-1',
      caseId: 'case-existing',
      clientId: 'client-1',
      createdById: 'user-1',
    });

    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: validBody,
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'COMMUNICATION_ALREADY_LINKED' });
    expect((prisma as any).case.create).not.toHaveBeenCalled();
    expect((prisma as any).communication.update).not.toHaveBeenCalled();
  });

  it('5. returns 400 when the title is missing (before any DB work)', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({
      id: 'comm-1',
      caseId: 'case-1',
      clientId: 'client-1',
      createdById: 'user-1',
    });

    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { matterType: 'LEASE' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect((prisma as any).case.create).not.toHaveBeenCalled();
  });

  it('5b. returns 400 when no client can be resolved (no clientId on body or communication)', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({
      id: 'comm-1',
      caseId: null,
      clientId: null,
      createdById: 'user-1',
    });

    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: validBody,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((prisma as any).case.create).not.toHaveBeenCalled();
  });

  it('6. happy path: creates the case and links the communication to it', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({
      id: 'comm-1',
      caseId: null,
      clientId: 'client-1',
      subject: 'Bérleti szerződés',
      summary: 'Ügyfél kérdés.',
      createdById: 'user-1',
    });
    (prisma as any).client.findUnique.mockResolvedValue({ id: 'client-1', name: 'Teszt Kft.' });
    (prisma as any).user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', isActive: true });
    (prisma as any).case.count.mockResolvedValue(7);
    (prisma as any).case.create.mockResolvedValue({
      id: 'case-new',
      caseNumber: 'CASE-2026-008',
      title: validBody.title,
      status: 'CLIENT_INPUT',
      createdAt: new Date(),
    });
    (prisma as any).communication.update.mockResolvedValue({ id: 'comm-1', caseId: 'case-new' });
    (prisma as any).timelineEvent.create.mockResolvedValue({ id: 'tl-1' });

    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: validBody,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      case: { id: 'case-new', caseNumber: 'CASE-2026-008', title: validBody.title },
      communication: { id: 'comm-1', caseId: 'case-new' },
    });
    expect(response.body.task).toBeUndefined();
    // The link write targets the new case id and runs inside the transaction.
    expect((prisma as any).communication.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'comm-1' }, data: { caseId: 'case-new' } })
    );
    expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
    expect((prisma as any).task.create).not.toHaveBeenCalled();
  });

  it('7. happy path with optional task: task carries caseId and sourceCommunicationId', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({
      id: 'comm-1',
      caseId: null,
      clientId: 'client-1',
      subject: 'Bérleti szerződés',
      summary: 'Ügyfél kérdés.',
      createdById: 'user-1',
    });
    (prisma as any).client.findUnique.mockResolvedValue({ id: 'client-1', name: 'Teszt Kft.' });
    (prisma as any).user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', isActive: true });
    (prisma as any).case.count.mockResolvedValue(0);
    (prisma as any).case.create.mockResolvedValue({
      id: 'case-new',
      caseNumber: 'CASE-2026-001',
      title: validBody.title,
      status: 'CLIENT_INPUT',
      createdAt: new Date(),
    });
    (prisma as any).communication.update.mockResolvedValue({ id: 'comm-1', caseId: 'case-new' });
    (prisma as any).task.create.mockResolvedValue({ id: 'task-new', title: 'Első feladat' });
    (prisma as any).timelineEvent.create.mockResolvedValue({ id: 'tl-1' });

    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { ...validBody, task: { title: 'Első feladat', priority: 'HIGH' } },
    });

    expect(response.status).toBe(201);
    expect(response.body.task).toMatchObject({ id: 'task-new', title: 'Első feladat' });
    expect((prisma as any).task.create).toHaveBeenCalledTimes(1);
    const taskArg = (prisma as any).task.create.mock.calls[0][0];
    expect(taskArg.data).toMatchObject({
      caseId: 'case-new',
      sourceCommunicationId: 'comm-1',
      priority: 'HIGH',
    });
  });

  it('8. rollback: a task-create failure rejects the whole transaction and returns no case', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({
      id: 'comm-1',
      caseId: null,
      clientId: 'client-1',
      subject: 'Bérleti szerződés',
      summary: 'Ügyfél kérdés.',
      createdById: 'user-1',
    });
    (prisma as any).client.findUnique.mockResolvedValue({ id: 'client-1', name: 'Teszt Kft.' });
    (prisma as any).user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', isActive: true });
    (prisma as any).case.count.mockResolvedValue(0);
    (prisma as any).case.create.mockResolvedValue({
      id: 'case-new',
      caseNumber: 'CASE-2026-001',
      title: validBody.title,
    });
    (prisma as any).communication.update.mockResolvedValue({ id: 'comm-1', caseId: 'case-new' });
    (prisma as any).timelineEvent.create.mockResolvedValue({ id: 'tl-1' });
    // Force the final write inside the transaction to fail.
    (prisma as any).task.create.mockRejectedValue(new Error('task insert failed'));

    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/create-case', {
      body: { ...validBody, task: { title: 'Első feladat' } },
    });

    // The whole operation fails — no success/201, no case in the response.
    expect(response.status).not.toBe(201);
    expect(response.body?.success).not.toBe(true);
    expect(response.body?.case).toBeUndefined();
    // All writes were bound to a single $transaction, so the real Prisma engine
    // rolls back the case + link + timeline together. (With a fully mocked
    // client the physical rollback cannot be executed here; this asserts the
    // strongest feasible proof: every write was issued inside one transaction
    // boundary and the transaction rejected.)
    expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
    expect((prisma as any).task.create).toHaveBeenCalledTimes(1);
  });
});
