import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'No token provided' });
      return;
    }
    req.user = {
      userId: (req.headers['x-user'] as string) || 'user-1',
      email: 'test@example.com',
      role: ((req.headers['x-role'] as string) || 'LAWYER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/modules/tasks/services', () => ({
  createTask: jest.fn(),
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: { findUnique: jest.fn(), findMany: jest.fn() },
    caseCollaborator: { findMany: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import intakeRoutes from '../src/modules/intake/routes';
import { CLOSED_TASK_STATUSES } from '../src/modules/tasks/taskStatus';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/intake', intakeRoutes);
  return app;
}

function requestJson(app: Express, method: string, reqPath: string, headers: Record<string, string> = {}): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request(
        { hostname: '127.0.0.1', port: address.port, path: reqPath, method, headers: { 'content-type': 'application/json', ...headers } },
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
      request.end();
    });
  });
}

const AUTH = { authorization: 'Bearer test-token' };

function queueCase(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    caseNumber: `CASE-2026-${id}`,
    title: `Ügy ${id}`,
    status: 'CLIENT_INPUT',
    description: 'Leírás',
    clientRole: 'MEGBÍZÓ',
    deadline: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    assignedLawyerId: 'user-1',
    createdById: 'user-1',
    assignedLawyer: { id: 'user-1', name: 'Teszt Ügyvéd' },
    client: { id: 'client-1', name: 'Teszt Kft.', email: 'a@b.hu', phone: null, taxNumber: '111', companyRegistrationNumber: null },
    ...overrides,
  };
}

describe('GET /intake queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('requires authentication', async () => {
    const res = await requestJson(createApp(), 'GET', '/intake');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid scope with 400', async () => {
    const res = await requestJson(createApp(), 'GET', '/intake?scope=EVERYTHING', AUTH);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INTAKE_SCOPE');
  });

  it('forbids TEAM scope for non-privileged users (403)', async () => {
    const res = await requestJson(createApp(), 'GET', '/intake?scope=TEAM', AUTH);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TEAM_SCOPE_FORBIDDEN');
    expect(prisma.case.findMany).not.toHaveBeenCalled();
  });

  it('allows TEAM scope for privileged roles and reports teamScope availability', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([]);
    const res = await requestJson(createApp(), 'GET', '/intake?scope=TEAM', { ...AUTH, 'x-role': 'PARTNER' });
    expect(res.status).toBe(200);
    expect(res.body.availability.teamScope).toBe(true);
    // TEAM scope has no per-user OR restriction.
    const where = (prisma.case.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where.status).toBe('CLIENT_INPUT');
  });

  it('scopes MY_INTAKES to the current user only', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([]);
    await requestJson(createApp(), 'GET', '/intake?scope=MY_INTAKES', AUTH);
    const where = (prisma.case.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toEqual([{ assignedLawyerId: 'user-1' }, { createdById: 'user-1' }]);
  });

  it('includes collaborator access in MY_CASES scope', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([]);
    await requestJson(createApp(), 'GET', '/intake?scope=MY_CASES', AUTH);
    const where = (prisma.case.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
  });

  it('computes summary counts, blockers, and next steps deterministically', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([
      queueCase('a'), // ready
      queueCase('b', { clientRole: null, assignedLawyerId: null, assignedLawyer: null }), // blocked
      queueCase('c', { client: null, description: null }), // blocked
    ]);
    const res = await requestJson(createApp(), 'GET', '/intake', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      total: 3,
      missingClient: 1,
      missingResponsibleLawyer: 1,
      conflictReviewRequired: 0, // never simulated
      readyForActivation: 1,
      blocked: 2,
    });
    const blockedItem = res.body.items.find((item: any) => item.caseId === 'b');
    expect(blockedItem.nextStep.code).toBe('CLIENT_ROLE');
    expect(blockedItem.blockers.map((blocker: any) => blocker.code)).toContain('MISSING_RESPONSIBLE_LAWYER');
  });

  it('queries open task counts with only deployed TaskStatus enum values', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([queueCase('a')]);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([{ caseId: 'a' }]);
    const res = await requestJson(createApp(), 'GET', '/intake', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.summary.readyForActivation).toBe(1);

    const taskQuery = (prisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(taskQuery.where.status.notIn).toEqual(CLOSED_TASK_STATUSES);
    expect(taskQuery.where.status.notIn).not.toEqual(expect.arrayContaining(['APPROVED', 'REJECTED', 'DECLINED', 'ARCHIVED']));
    expect(taskQuery.include).toBeUndefined();
  });

  it('returns a successful empty queue response without broad task includes', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([]);
    const res = await requestJson(createApp(), 'GET', '/intake', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.summary.total).toBe(0);
    expect(res.body.pagination.limit).toBeLessThanOrEqual(50);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('applies NEEDS_ATTENTION / READY filters and pagination bounds', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([queueCase('a'), queueCase('b', { clientRole: null })]);
    const needsAttention = await requestJson(createApp(), 'GET', '/intake?status=NEEDS_ATTENTION', AUTH);
    expect(needsAttention.body.items).toHaveLength(1);
    expect(needsAttention.body.items[0].caseId).toBe('b');

    const ready = await requestJson(createApp(), 'GET', '/intake?status=READY&limit=1&offset=0', AUTH);
    expect(ready.body.items).toHaveLength(1);
    expect(ready.body.items[0].caseId).toBe('a');
    expect(ready.body.pagination).toMatchObject({ limit: 1, offset: 0 });
  });

  it('caps the limit and rejects unknown status filters', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([]);
    const capped = await requestJson(createApp(), 'GET', '/intake?limit=99999', AUTH);
    expect(capped.body.pagination.limit).toBeLessThanOrEqual(50);
    const invalid = await requestJson(createApp(), 'GET', '/intake?status=WEIRD', AUTH);
    expect(invalid.status).toBe(400);
  });

  it('leaks no sensitive identity data in queue items', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([queueCase('a')]);
    const res = await requestJson(createApp(), 'GET', '/intake', AUTH);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('taxNumber');
    expect(serialized).not.toContain('companyRegistrationNumber');
    expect(serialized).not.toContain('a@b.hu'); // queue shows names only, not client contact data
    expect(serialized).not.toContain('workspaceText');
  });
});
