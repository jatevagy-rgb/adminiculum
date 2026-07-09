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
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    caseCollaborator: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
    },
    timelineEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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

function caseAccessRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    assignedLawyerId: 'user-2',
    createdById: 'user-3',
    ...overrides,
  };
}

function fullCaseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    caseNumber: 'CASE-1',
    clientName: 'Acme Kft.',
    clientId: 'client-1',
    matterType: 'LITIGATION',
    status: 'CLIENT_INPUT',
    description: 'Internal matter',
    priority: 'MEDIUM',
    deadline: null,
    clientRole: 'CLAIMANT',
    sharepointRoot: null,
    assignedLawyer: null,
    createdAt: new Date('2026-07-09T00:00:00.000Z'),
    updatedAt: new Date('2026-07-09T00:00:00.000Z'),
    ...overrides,
  };
}

describe('cases clientRole authorization and exposure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated case detail before clientRole can be read', async () => {
    const response = await requestJson(createApp(), 'GET', '/cases/case-1', {
      authenticated: false,
    });

    expect(response.status).toBe(401);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
  });

  it('blocks authenticated users without case access from reading clientRole on detail', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(caseAccessRecord());
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(createApp(), 'GET', '/cases/case-1');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    expect(prisma.case.findUnique).toHaveBeenCalledTimes(1);
  });

  it('allows same-case collaborators to read clientRole on detail', async () => {
    (prisma.case.findUnique as jest.Mock)
      .mockResolvedValueOnce(caseAccessRecord())
      .mockResolvedValueOnce(fullCaseRecord());
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'collab-1' });

    const response = await requestJson(createApp(), 'GET', '/cases/case-1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'case-1',
      clientRole: 'CLAIMANT',
    });
  });

  it('omits clientRole from the broad authenticated case list response', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([fullCaseRecord()]);
    (prisma.case.count as jest.Mock).mockResolvedValue(1);

    const response = await requestJson(createApp(), 'GET', '/cases');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).not.toHaveProperty('clientRole');
  });

  it('rejects unauthenticated clientRole patch before DB access', async () => {
    const response = await requestJson(createApp(), 'PATCH', '/cases/case-1', {
      authenticated: false,
      body: { clientRole: 'DEFENDANT' },
    });

    expect(response.status).toBe(401);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('blocks authenticated users without manage access from patching clientRole', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(caseAccessRecord());

    const response = await requestJson(createApp(), 'PATCH', '/cases/case-1', {
      body: { clientRole: 'DEFENDANT' },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('allows assigned lawyers to patch clientRole', async () => {
    (prisma.case.findUnique as jest.Mock)
      .mockResolvedValueOnce(caseAccessRecord({ assignedLawyerId: 'user-1' }))
      .mockResolvedValueOnce(fullCaseRecord());
    (prisma.case.update as jest.Mock).mockResolvedValue(fullCaseRecord({ clientRole: 'DEFENDANT' }));
    (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({ id: 'event-1' });

    const response = await requestJson(createApp(), 'PATCH', '/cases/case-1', {
      body: { clientRole: 'DEFENDANT' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      id: 'case-1',
      clientRole: 'DEFENDANT',
    });
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { clientRole: 'DEFENDANT' },
    });
  });

  it('guards workflow summary clientRole with case read access', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(caseAccessRecord());
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(createApp(), 'GET', '/cases/case-1/workflow');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
  });

  it('keeps case creation protected by existing authenticated create-case rules', async () => {
    const response = await requestJson(createApp(), 'POST', '/cases', {
      authenticated: false,
      body: { clientName: 'Acme Kft.', matterType: 'LITIGATION', clientRole: 'CLAIMANT' },
    });

    expect(response.status).toBe(401);
    expect(prisma.case.create).not.toHaveBeenCalled();
  });
});
