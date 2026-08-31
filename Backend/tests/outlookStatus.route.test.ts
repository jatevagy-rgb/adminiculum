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
  const communication = { findFirst: jest.fn() };
  const mock: any = { communication };
  mock.$transaction = jest.fn((cb: any) => cb(mock));
  return { prisma: mock };
});

jest.mock('../src/modules/communications/outlookGraphLive', () => ({
  readOutlookSyncConfig: jest.fn(),
  isOutlookSyncConfigured: jest.fn(),
}));

import { prisma } from '../src/prisma/prisma.service';
import { isOutlookSyncConfigured } from '../src/modules/communications/outlookGraphLive';
import communicationsRoutes from '../src/modules/communications/routes';

type TestResponse = { status: number; body: any };

function requestJson(
  app: Express,
  method: string,
  path: string,
  options: { authenticated?: boolean } = {}
): Promise<TestResponse> {
  const { authenticated = true } = options;
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

describe('GET /communications/outlook/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_OUTLOOK_IMPORT;
    delete process.env.COMMUNICATIONS_MAILBOX;
    delete process.env.OUTLOOK_GRAPH_CLIENT_ID;
    delete process.env.OUTLOOK_GRAPH_CLIENT_SECRET;
    delete process.env.OUTLOOK_GRAPH_TENANT_ID;
  });

  it('returns available:false with DISABLED reason when ENABLE_OUTLOOK_IMPORT is off', async () => {
    // Gate is off by default — isDatabaseFoundationEnabled checks process.env
    const response = await requestJson(createApp(), 'GET', '/communications/outlook/status');

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.reason).toBe('DISABLED');
    expect(response.body.message).toBe('Outlook nincs összekapcsolva.');
    // Must NOT expose tenant IDs, client IDs, tokens, or mailbox internals
    expect(response.body).not.toHaveProperty('tenantId');
    expect(response.body).not.toHaveProperty('clientId');
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('mailboxAddress');
  });

  it('returns available:false with NOT_CONFIGURED when gate is on but no credentials', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    (isOutlookSyncConfigured as jest.Mock).mockReturnValue(false);

    const response = await requestJson(createApp(), 'GET', '/communications/outlook/status');

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.reason).toBe('NOT_CONFIGURED');
    expect(response.body.message).toBe('Outlook nincs összekapcsolva.');
  });

  it('returns available:true when gate is on and credentials are configured', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    (isOutlookSyncConfigured as jest.Mock).mockReturnValue(true);
    (prisma as any).communication.findFirst.mockResolvedValue(null);

    const response = await requestJson(createApp(), 'GET', '/communications/outlook/status');

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(true);
    expect(response.body.message).toBe('Outlook szinkronizálható.');
    expect(response.body.lastSyncAt).toBeNull();
  });

  it('returns lastSyncAt when previous import exists', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    (isOutlookSyncConfigured as jest.Mock).mockReturnValue(true);
    const lastImport = new Date('2026-08-28T10:30:00Z');
    (prisma as any).communication.findFirst.mockResolvedValue({ importedAt: lastImport });

    const response = await requestJson(createApp(), 'GET', '/communications/outlook/status');

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(true);
    expect(response.body.lastSyncAt).toBe(lastImport.toISOString());
  });

  it('returns safe error on DB failure — no raw error details', async () => {
    process.env.ENABLE_OUTLOOK_IMPORT = 'true';
    (isOutlookSyncConfigured as jest.Mock).mockReturnValue(true);
    (prisma as any).communication.findFirst.mockRejectedValue(new Error('connection refused'));

    const response = await requestJson(createApp(), 'GET', '/communications/outlook/status');

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.reason).toBe('UNAVAILABLE');
    expect(response.body.message).toBe('Átmenetileg nem érhető el.');
    // No raw error details leaked
    expect(response.body).not.toHaveProperty('error');
    expect(response.body).not.toHaveProperty('stack');
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await requestJson(createApp(), 'GET', '/communications/outlook/status', {
      authenticated: false,
    });

    expect(response.status).toBe(401);
  });
});
