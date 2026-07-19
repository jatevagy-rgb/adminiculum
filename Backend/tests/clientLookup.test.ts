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
      role: ((req.headers['x-role'] as string) || 'PARTNER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    client: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    clientHouseStyleProfile: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    case: { findMany: jest.fn(), findFirst: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import clientsRoutes from '../src/modules/clients/routes';
import { parseClientColorKey } from '../src/modules/clients/clientColor';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/clients', clientsRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  reqPath: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method,
          headers: {
            'content-type': 'application/json',
            ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
            ...headers,
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

const AUTH = { authorization: 'Bearer test-token' };

const clientRow = {
  id: 'client-1',
  name: 'Teszt Kft.',
  email: 'iroda@tesztkft.hu',
  phone: '+36 1 234 5678',
  taxNumber: '12345678-2-42',
  companyRegistrationNumber: '01-09-999999',
};

describe('GET /clients/lookup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await requestJson(createApp(), 'GET', '/clients/lookup?q=teszt');
    expect(res.status).toBe(401);
  });

  it('rejects queries below the minimum length (400)', async () => {
    const res = await requestJson(createApp(), 'GET', '/clients/lookup?q=a', AUTH);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('QUERY_TOO_SHORT');
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it('is bounded and deterministic (take <= 10, ordered)', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([]);
    await requestJson(createApp(), 'GET', '/clients/lookup?q=teszt', AUTH);
    const arg = (prisma.client.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.take).toBeLessThanOrEqual(10);
    expect(arg.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    expect(arg.select).toBeDefined();
    expect(arg.include).toBeUndefined();
  });

  it('reports exact-email signals and keeps name similarity review-only', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([clientRow]);
    const exactEmail = await requestJson(createApp(), 'GET', '/clients/lookup?q=iroda@tesztkft.hu', AUTH);
    const candidate = exactEmail.body.candidates[0];
    expect(candidate.matchSignals).toContain('EXACT_EMAIL');
    expect(candidate.warning).toBe('REVIEW_REQUIRED');

    const similarName = await requestJson(createApp(), 'GET', '/clients/lookup?q=teszt', AUTH);
    const nameCandidate = similarName.body.candidates[0];
    expect(nameCandidate.matchSignals).toEqual(['SIMILAR_NAME']);
    // A name match is never a confirmed duplicate.
    expect(nameCandidate.warning).toBe('REVIEW_REQUIRED');
    expect(JSON.stringify(similarName.body)).not.toContain('CONFIRMED');
  });

  it('reports exact tax/registration identifier signals', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([clientRow]);
    const res = await requestJson(createApp(), 'GET', '/clients/lookup?q=12345678-2-42', AUTH);
    expect(res.body.candidates[0].matchSignals).toContain('EXACT_TAX_ID');
  });

  it('does not expose tax/registration identifiers or notes in candidates', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([clientRow]);
    const res = await requestJson(createApp(), 'GET', '/clients/lookup?q=teszt', AUTH);
    const serialized = JSON.stringify(res.body.candidates);
    expect(serialized).not.toContain('12345678-2-42');
    expect(serialized).not.toContain('01-09-999999');
    expect(serialized).not.toContain('notes');
  });

  it('restricts non-managers to their case-accessible clients', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([{ clientId: 'client-9' }]);
    (prisma.client.findMany as jest.Mock).mockResolvedValue([]);
    await requestJson(createApp(), 'GET', '/clients/lookup?q=teszt', { ...AUTH, 'x-role': 'LAWYER' });
    const arg = (prisma.client.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.where.id).toEqual({ in: ['client-9'] });
  });

  it('returns an empty candidate list for non-managers with no accessible cases', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([]);
    const res = await requestJson(createApp(), 'GET', '/clients/lookup?q=teszt', { ...AUTH, 'x-role': 'LAWYER' });
    expect(res.status).toBe(200);
    expect(res.body.candidates).toEqual([]);
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /clients creation boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthorized (non-identity-manager) creation', async () => {
    const res = await requestJson(createApp(), 'POST', '/clients', { ...AUTH, 'x-role': 'LAWYER' }, { name: 'Új Ügyfél' });
    expect(res.status).toBe(403);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed payload (missing name)', async () => {
    const res = await requestJson(createApp(), 'POST', '/clients', AUTH, { email: 'x@y.hu' });
    expect(res.status).toBe(400);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('returns 409 on exact unique-field collision and never merges automatically', async () => {
    (prisma.client.create as jest.Mock).mockRejectedValue(Object.assign(new Error('conflict'), { code: 'P2002' }));
    const res = await requestJson(createApp(), 'POST', '/clients', AUTH, { name: 'Teszt Kft.' });
    expect(res.status).toBe(409);
    // No merge/update path is invoked on collision.
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(prisma.client.delete).not.toHaveBeenCalled();
  });

  it('creates with an explicit allow-list only', async () => {
    (prisma.client.create as jest.Mock).mockResolvedValue({ id: 'client-new', name: 'Új Ügyfél' });
    const res = await requestJson(createApp(), 'POST', '/clients', AUTH, {
      name: 'Új Ügyfél',
      email: 'uj@ugyfel.hu',
      nested: { hack: true },
      cases: [{ id: 'case-1' }],
    });
    expect(res.status).toBe(201);
    const data = (prisma.client.create as jest.Mock).mock.calls[0][0].data;
    expect(data.nested).toBeUndefined();
    expect(data.cases).toBeUndefined();
    expect(data.name).toBe('Új Ügyfél');
  });
});

describe('client color contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts only exact palette keys, null, or omission', () => {
    expect(parseClientColorKey(undefined)).toBeUndefined();
    expect(parseClientColorKey(null)).toBeNull();
    expect(parseClientColorKey('BLUE')).toBe('BLUE');
    expect(() => parseClientColorKey('blue')).toThrow('allowed palette key');
    expect(() => parseClientColorKey('#0000ff')).toThrow('allowed palette key');
  });

  it('creates a client without assigning a color', async () => {
    (prisma.client.create as jest.Mock).mockResolvedValue({ id: 'client-new', name: 'Szintetikus ügyfél', colorKey: null });
    const res = await requestJson(createApp(), 'POST', '/clients', AUTH, { name: 'Szintetikus ügyfél' });
    expect(res.status).toBe(201);
    expect((prisma.client.create as jest.Mock).mock.calls[0][0].data.colorKey).toBeUndefined();
  });

  it('creates a client with a valid color key', async () => {
    (prisma.client.create as jest.Mock).mockResolvedValue({ id: 'client-new', name: 'Szintetikus ügyfél', colorKey: 'TEAL' });
    const res = await requestJson(createApp(), 'POST', '/clients', AUTH, { name: 'Szintetikus ügyfél', colorKey: 'TEAL' });
    expect(res.status).toBe(201);
    expect((prisma.client.create as jest.Mock).mock.calls[0][0].data.colorKey).toBe('TEAL');
  });

  it('rejects an invalid color without writing', async () => {
    const res = await requestJson(createApp(), 'POST', '/clients', AUTH, { name: 'Szintetikus ügyfél', colorKey: '#14b8a6' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CLIENT_COLOR_INVALID');
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('updates and clears the color with explicit values', async () => {
    (prisma.client.update as jest.Mock).mockResolvedValueOnce({ id: 'client-1', name: 'Teszt Kft.', colorKey: 'INDIGO' });
    const update = await requestJson(createApp(), 'PATCH', '/clients/client-1', AUTH, { colorKey: 'INDIGO' });
    expect(update.status).toBe(200);
    expect((prisma.client.update as jest.Mock).mock.calls[0][0].data.colorKey).toBe('INDIGO');

    (prisma.client.update as jest.Mock).mockResolvedValueOnce({ id: 'client-1', name: 'Teszt Kft.', colorKey: null });
    const clear = await requestJson(createApp(), 'PATCH', '/clients/client-1', AUTH, { colorKey: null });
    expect(clear.status).toBe(200);
    expect((prisma.client.update as jest.Mock).mock.calls[1][0].data.colorKey).toBeNull();
  });

  it('rejects an invalid update without writing', async () => {
    const res = await requestJson(createApp(), 'PATCH', '/clients/client-1', AUTH, { colorKey: 'ULTRAVIOLET' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CLIENT_COLOR_INVALID');
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('projects colorKey through list and detail DTO selects', async () => {
    (prisma.client.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'client-1', name: 'Teszt Kft.', email: null, phone: null, address: null, colorKey: 'ROSE' }])
      .mockResolvedValueOnce([{ id: 'client-1', taxNumber: null, companyRegistrationNumber: null, authorizedRepresentative: null, contactPerson: null }]);
    (prisma.clientHouseStyleProfile.findMany as jest.Mock).mockResolvedValue([]);

    const list = await requestJson(createApp(), 'GET', '/clients', AUTH);
    expect(list.status).toBe(200);
    expect(list.body.data[0].colorKey).toBe('ROSE');
    expect((prisma.client.findMany as jest.Mock).mock.calls[0][0].select.colorKey).toBe(true);

    (prisma.client.findUnique as jest.Mock).mockResolvedValue({ id: 'client-1', name: 'Teszt Kft.', colorKey: null });
    const detail = await requestJson(createApp(), 'GET', '/clients/client-1', AUTH);
    expect(detail.status).toBe(200);
    expect(detail.body.colorKey).toBeNull();
    expect((prisma.client.findUnique as jest.Mock).mock.calls[0][0].select.colorKey).toBe(true);
  });
});
