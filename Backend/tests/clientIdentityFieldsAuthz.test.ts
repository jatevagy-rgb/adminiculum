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
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    client: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    clientHouseStyleProfile: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import clientsRoutes from '../src/modules/clients/routes';
import clientPortalRoutes from '../src/routes/clientPortal';

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
  app.use('/clients', clientsRoutes);
  app.use('/client-portal', clientPortalRoutes);
  return app;
}

function clientRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-1',
    name: 'Acme Kft.',
    email: 'acme@example.com',
    phone: '+361234567',
    address: 'Budapest',
    taxNumber: '12345678-1-42',
    companyRegistrationNumber: '01-09-999999',
    authorizedRepresentative: 'Dr. Representative',
    contactPerson: 'Client Contact',
    color: '#219EBC',
    createdAt: new Date('2026-07-09T00:00:00.000Z'),
    updatedAt: new Date('2026-07-09T00:00:00.000Z'),
    ...overrides,
  };
}

describe('client identity field authorization and exposure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_CLIENT_PORTAL;
    delete process.env.ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL;
  });

  it('rejects unauthenticated client detail before identity fields can be read', async () => {
    const response = await requestJson(createApp(), 'GET', '/clients/client-1', {
      authenticated: false,
    });

    expect(response.status).toBe(401);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it('returns an empty client list for an ordinary authenticated user without related cases', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([]);

    const response = await requestJson(createApp(), 'GET', '/clients');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it('scopes broad client list identity fields to related-case clients for ordinary users', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([{ clientId: 'client-1' }]);
    (prisma.client.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'client-1', name: 'Acme Kft.', email: 'acme@example.com', phone: null, address: null }])
      .mockResolvedValueOnce([
        {
          id: 'client-1',
          taxNumber: '12345678-1-42',
          companyRegistrationNumber: '01-09-999999',
          authorizedRepresentative: 'Dr. Representative',
          contactPerson: 'Client Contact',
        },
      ]);
    (prisma.clientHouseStyleProfile.findMany as jest.Mock).mockResolvedValue([]);

    const response = await requestJson(createApp(), 'GET', '/clients');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: 'client-1',
      taxNumber: '12345678-1-42',
      companyRegistrationNumber: '01-09-999999',
      authorizedRepresentative: 'Dr. Representative',
    });
    expect(prisma.client.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: { in: ['client-1'] } },
    }));
  });

  it('blocks authenticated users without related case access from reading client detail', async () => {
    (prisma.case.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(createApp(), 'GET', '/clients/client-1');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CLIENT_IDENTITY_ACCESS_FORBIDDEN' });
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it('allows related-case users to read client detail identity fields', async () => {
    (prisma.case.findFirst as jest.Mock).mockResolvedValue({ id: 'case-1' });
    (prisma.client.findUnique as jest.Mock).mockResolvedValue(clientRecord());

    const response = await requestJson(createApp(), 'GET', '/clients/client-1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'client-1',
      taxNumber: '12345678-1-42',
      companyRegistrationNumber: '01-09-999999',
      authorizedRepresentative: 'Dr. Representative',
    });
  });

  it('rejects unauthenticated client identity creation before DB access', async () => {
    const response = await requestJson(createApp(), 'POST', '/clients', {
      authenticated: false,
      body: { name: 'Acme Kft.', taxNumber: '12345678-1-42' },
    });

    expect(response.status).toBe(401);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('blocks ordinary authenticated users from creating client identity records', async () => {
    const response = await requestJson(createApp(), 'POST', '/clients', {
      body: { name: 'Acme Kft.', taxNumber: '12345678-1-42' },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CLIENT_IDENTITY_ACCESS_FORBIDDEN' });
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('allows partners to create client identity records', async () => {
    (prisma.client.create as jest.Mock).mockResolvedValue(clientRecord());

    const response = await requestJson(createApp(), 'POST', '/clients', {
      headers: { 'x-test-role': 'PARTNER' },
      body: { name: 'Acme Kft.', taxNumber: '12345678-1-42', authorizedRepresentative: 'Dr. Representative' },
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: 'client-1', taxNumber: '12345678-1-42' });
    expect(prisma.client.create).toHaveBeenCalled();
  });

  it('blocks ordinary authenticated users from patching client identity fields', async () => {
    const response = await requestJson(createApp(), 'PATCH', '/clients/client-1', {
      body: { taxNumber: '99999999-1-42' },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CLIENT_IDENTITY_ACCESS_FORBIDDEN' });
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('allows admins to patch client identity fields', async () => {
    (prisma.client.update as jest.Mock).mockResolvedValue(clientRecord({ taxNumber: '99999999-1-42' }));

    const response = await requestJson(createApp(), 'PATCH', '/clients/client-1', {
      headers: { 'x-test-role': 'ADMIN' },
      body: { taxNumber: '99999999-1-42' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 'client-1', taxNumber: '99999999-1-42' });
    expect(prisma.client.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'client-1' },
    }));
  });

  it('keeps client portal unavailable without exposing client identity fields', async () => {
    const response = await requestJson(createApp(), 'GET', '/client-portal/summary/client-1');

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
    });
    expect(JSON.stringify(response.body)).not.toContain('taxNumber');
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });
});
