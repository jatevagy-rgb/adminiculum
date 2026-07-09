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

jest.mock('../src/prisma/prisma.service', () => {
  const prismaMock = {
    client: {
      findUnique: jest.fn(),
    },
    clientWorkgroup: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    workloadRecord: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

import prisma from '../src/prisma/prisma.service';
import workgroupRoutes from '../src/modules/workgroups/routes';

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
  app.use('/', workgroupRoutes);
  return app;
}

describe('workload/workgroup route authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated workload reads before DB access', async () => {
    const response = await requestJson(createApp(), 'GET', '/workgroups/workgroup-1/workload', {
      authenticated: false,
    });

    expect(response.status).toBe(401);
    expect(prisma.workloadRecord.findMany).not.toHaveBeenCalled();
  });

  it('blocks ordinary authenticated users from workload summary reads before DB access', async () => {
    const response = await requestJson(createApp(), 'GET', '/clients/client-1/workload-summary?period=2026-07');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'WORKLOAD_ACCESS_FORBIDDEN' });
    expect(prisma.clientWorkgroup.findMany).not.toHaveBeenCalled();
    expect(prisma.workloadRecord.findMany).not.toHaveBeenCalled();
  });

  it('allows admins to read workload records', async () => {
    (prisma.workloadRecord.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'record-1',
        workgroupId: 'workgroup-1',
        period: '2026-07',
        reportedHours: 12.5,
        note: 'Internal note',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    ]);

    const response = await requestJson(createApp(), 'GET', '/workgroups/workgroup-1/workload', {
      headers: { 'x-test-role': 'ADMIN' },
    });

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: 'record-1',
      workgroupId: 'workgroup-1',
      period: '2026-07',
      reportedHours: 12.5,
    });
    expect(prisma.workloadRecord.findMany).toHaveBeenCalledWith({
      where: { workgroupId: 'workgroup-1' },
      orderBy: { period: 'desc' },
    });
  });

  it('blocks ordinary authenticated users from mutating workload records before DB access', async () => {
    const response = await requestJson(createApp(), 'POST', '/workgroups/workgroup-1/workload', {
      body: { period: '2026-07', reportedHours: 8, note: 'Should not write' },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'WORKLOAD_ACCESS_FORBIDDEN' });
    expect(prisma.clientWorkgroup.findUnique).not.toHaveBeenCalled();
    expect(prisma.workloadRecord.upsert).not.toHaveBeenCalled();
  });

  it('allows partners to mutate workload records', async () => {
    (prisma.clientWorkgroup.findUnique as jest.Mock).mockResolvedValue({
      id: 'workgroup-1',
      clientId: 'client-1',
      name: 'Legal',
      description: null,
      isActive: true,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    (prisma.workloadRecord.upsert as jest.Mock).mockResolvedValue({
      id: 'record-2',
      workgroupId: 'workgroup-1',
      period: '2026-07',
      reportedHours: 8,
      note: 'Allowed',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    });

    const response = await requestJson(createApp(), 'POST', '/workgroups/workgroup-1/workload', {
      headers: { 'x-test-role': 'PARTNER' },
      body: { period: '2026-07', reportedHours: 8, note: 'Allowed' },
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 'record-2',
      workgroupId: 'workgroup-1',
      period: '2026-07',
      reportedHours: 8,
    });
    expect(prisma.workloadRecord.upsert).toHaveBeenCalled();
  });

  it('blocks ordinary authenticated users from workgroup lists before DB access', async () => {
    const response = await requestJson(createApp(), 'GET', '/clients/client-1/workgroups');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'WORKLOAD_ACCESS_FORBIDDEN' });
    expect(prisma.clientWorkgroup.findMany).not.toHaveBeenCalled();
  });

  it('allows admins to read workgroup lists', async () => {
    (prisma.clientWorkgroup.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'workgroup-1',
        clientId: 'client-1',
        name: 'Legal',
        description: null,
        isActive: true,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);

    const response = await requestJson(createApp(), 'GET', '/clients/client-1/workgroups', {
      headers: { 'x-test-role': 'ADMIN' },
    });

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: 'workgroup-1',
      clientId: 'client-1',
      name: 'Legal',
    });
    expect(prisma.clientWorkgroup.findMany).toHaveBeenCalledWith({
      where: { clientId: 'client-1', isActive: true },
      orderBy: { name: 'asc' },
    });
  });
});
