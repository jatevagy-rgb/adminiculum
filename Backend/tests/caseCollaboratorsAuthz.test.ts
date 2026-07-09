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
    case: {
      findUnique: jest.fn(),
    },
    caseCollaborator: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = {
  status: number;
  body: any;
};

function requestJson(
  app: Express,
  method: string,
  path: string,
  options: { authenticated?: boolean; body?: unknown; headers?: Record<string, string> } = {}
): Promise<TestResponse> {
  const { authenticated = true, body, headers = {} } = options;

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }

      const requestBody = body === undefined ? '' : JSON.stringify(body);
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            ...(requestBody ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(requestBody) } : {}),
            ...headers,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: response.statusCode || 0,
              body: text ? JSON.parse(text) : null,
            });
          });
        }
      );

      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (requestBody) {
        request.write(requestBody);
      }
      request.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

describe('case collaborator route authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated collaborator read before DB access', async () => {
    const response = await requestJson(createApp(), 'GET', '/cases/case-1/collaborators', {
      authenticated: false,
    });

    expect(response.status).toBe(401);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.caseCollaborator.findMany).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated collaborator create before DB access', async () => {
    const response = await requestJson(createApp(), 'POST', '/cases/case-1/collaborators', {
      authenticated: false,
      body: { userId: 'user-2' },
    });

    expect(response.status).toBe(401);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.caseCollaborator.create).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated collaborator delete before DB access', async () => {
    const response = await requestJson(createApp(), 'DELETE', '/cases/case-1/collaborators/collab-1', {
      authenticated: false,
    });

    expect(response.status).toBe(401);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.caseCollaborator.deleteMany).not.toHaveBeenCalled();
  });

  it('blocks authenticated users without case access from reading collaborators', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-2',
      createdById: 'user-3',
    });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(createApp(), 'GET', '/cases/case-1/collaborators');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    expect(prisma.caseCollaborator.findMany).not.toHaveBeenCalled();
  });

  it('allows same-case collaborators to read collaborators', async () => {
    const collaboratorRows = [
      {
        id: 'collab-1',
        userId: 'user-1',
        role: 'COLLABORATOR',
        addedAt: new Date('2026-07-09T00:00:00.000Z'),
        user: { id: 'user-1', name: 'User One', email: 'user@example.com', role: 'LAWYER' },
      },
    ];
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-2',
      createdById: 'user-3',
    });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'collab-1' });
    (prisma.caseCollaborator.findMany as jest.Mock).mockResolvedValue(collaboratorRows);

    const response = await requestJson(createApp(), 'GET', '/cases/case-1/collaborators');

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: 'collab-1',
      userId: 'user-1',
      role: 'COLLABORATOR',
      user: { email: 'user@example.com' },
    });
    expect(prisma.caseCollaborator.findMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1' },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { addedAt: 'asc' },
    });
  });

  it('blocks authenticated users without manage access from creating collaborators', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-2',
      createdById: 'user-3',
    });

    const response = await requestJson(createApp(), 'POST', '/cases/case-1/collaborators', {
      body: { userId: 'user-4' },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    expect(prisma.caseCollaborator.create).not.toHaveBeenCalled();
  });

  it('allows assigned lawyers to create collaborators', async () => {
    const created = {
      id: 'collab-2',
      userId: 'user-4',
      role: 'REVIEWER',
      addedAt: new Date('2026-07-09T00:00:00.000Z'),
      user: { id: 'user-4', name: 'User Four', email: 'four@example.com', role: 'LAWYER' },
    };
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-1',
      createdById: 'user-3',
    });
    (prisma.caseCollaborator.create as jest.Mock).mockResolvedValue(created);

    const response = await requestJson(createApp(), 'POST', '/cases/case-1/collaborators', {
      body: { userId: 'user-4', role: 'REVIEWER' },
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 'collab-2',
      userId: 'user-4',
      role: 'REVIEWER',
    });
  });

  it('blocks authenticated users without manage access from deleting collaborators', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-2',
      createdById: 'user-3',
    });

    const response = await requestJson(createApp(), 'DELETE', '/cases/case-1/collaborators/collab-1');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    expect(prisma.caseCollaborator.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes collaborators only when they belong to the path case', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-1',
      createdById: 'user-3',
    });
    (prisma.caseCollaborator.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    const response = await requestJson(createApp(), 'DELETE', '/cases/case-1/collaborators/collab-from-other-case');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'COLLABORATOR_NOT_FOUND' });
    expect(prisma.caseCollaborator.deleteMany).toHaveBeenCalledWith({
      where: { id: 'collab-from-other-case', caseId: 'case-1' },
    });
  });
});
