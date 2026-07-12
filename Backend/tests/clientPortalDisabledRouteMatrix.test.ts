import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Auth mock: bearer `test-token` -> authenticated user; otherwise 401.
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: 'user-1',
      email: 'test@example.com',
      role: 'LAWYER',
      authProvider: 'local-jwt',
    };
    next();
  },
}));

import clientPortalRoutes from '../src/routes/clientPortal';

type TestResponse = { status: number; body: unknown };

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/client-portal', clientPortalRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  reqPath: string,
  authenticated = true,
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

// The full V1 route matrix (external-safe *Ref path params).
const matrix: Array<[string, string]> = [
  ['GET', '/client-portal/me'],
  ['GET', '/client-portal/matters'],
  ['GET', '/client-portal/matters/ext-matter-1'],
  ['GET', '/client-portal/matters/ext-matter-1/documents'],
  ['GET', '/client-portal/documents/ext-doc-1'],
  ['GET', '/client-portal/tasks'],
  ['POST', '/client-portal/tasks/ext-task-1/complete'],
  ['GET', '/client-portal/uploads'],
  // Deferred placeholders — still disabled.
  ['POST', '/client-portal/uploads/ext-upload-1/files'],
  ['GET', '/client-portal/messages'],
  ['POST', '/client-portal/messages/ext-thread-1/replies'],
];

describe('client portal disabled V1 route matrix', () => {
  beforeEach(() => {
    delete process.env.ENABLE_CLIENT_PORTAL;
    delete process.env.ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL;
    delete process.env.ENABLE_CLIENT_PORTAL_RUNTIME_READY;
  });

  it('unauthenticated GET /client-portal/me returns 401 before feature checks', async () => {
    const response = await requestJson(createApp(), 'GET', '/client-portal/me', false);
    expect(response.status).toBe(401);
  });

  it.each(matrix)('authenticated %s %s returns 501 CLIENT_PORTAL_NOT_ENABLED', async (method, reqPath) => {
    const response = await requestJson(createApp(), method, reqPath, true);
    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
    });
    // Content-free: no portal data vocabulary leaks into the disabled body.
    const serialized = JSON.stringify(response.body).toLowerCase();
    expect(serialized).not.toContain('workspacetext');
    expect(serialized).not.toContain('ext-matter-1');
    expect(serialized).not.toContain('ext-doc-1');
  });

  it('ENABLE_CLIENT_PORTAL alone is insufficient (still 501)', async () => {
    process.env.ENABLE_CLIENT_PORTAL = 'true';
    const response = await requestJson(createApp(), 'GET', '/client-portal/matters', true);
    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({ feature: 'CLIENT_PORTAL', reason: 'CLIENT_PORTAL_NOT_ENABLED' });
  });

  it('portal + ownership flags without runtime-ready is insufficient (still 501)', async () => {
    process.env.ENABLE_CLIENT_PORTAL = 'true';
    process.env.ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL = 'true';
    const response = await requestJson(createApp(), 'GET', '/client-portal/me', true);
    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({ feature: 'CLIENT_PORTAL', reason: 'CLIENT_PORTAL_NOT_ENABLED' });
  });

  it('routes.ts imports no service stubs, mappers, or Prisma/DB access', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'modules', 'client-portal', 'routes.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/from\s+['"]\.\/services['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\/mappers['"]/);
    expect(source).not.toMatch(/PrismaClient/);
    expect(source).not.toMatch(/@prisma\/client/);
    expect(source).not.toMatch(/\bprisma\./);
    // Forbidden field name constructed in test code (absent from runtime source).
    expect(source).not.toContain(['workspace', 'Text'].join(''));
    // No service-stub call sites in the routes file.
    for (const fn of [
      'getPortalMe',
      'listPortalMatters',
      'getPortalMatterDetail',
      'listPortalMatterDocuments',
      'getPortalDocumentDetail',
      'listPortalTasks',
      'completePortalTask',
      'listPortalUploadRequests',
    ]) {
      expect(source).not.toContain(`${fn}(`);
    }
  });
});
