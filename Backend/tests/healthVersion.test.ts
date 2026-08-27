import express, { Express, Request, Response } from 'express';
import http from 'http';

function createHealthApp(): Express {
  const app = express();
  app.get('/health/version', (_req: Request, res: Response) => {
    res.json({
      commitSha: process.env.APP_COMMIT_SHA || null,
      buildTime: process.env.APP_BUILD_TIME || null,
      environment: process.env.NODE_ENV || 'development',
    });
  });
  return app;
}

function requestJson(
  app: Express,
  path: string
): Promise<{ status: number; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method: 'GET',
          headers: { accept: 'application/json' },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null, text });
          });
        }
      );
      req.on('error', (error) => {
        server.close();
        reject(error);
      });
      req.end();
    });
  });
}

describe('GET /health/version', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns commitSha, buildTime, and environment', async () => {
    process.env.APP_COMMIT_SHA = 'abc123';
    process.env.APP_BUILD_TIME = '2026-01-15T10:00:00Z';
    process.env.NODE_ENV = 'production';

    const res = await requestJson(createHealthApp(), '/health/version');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      commitSha: 'abc123',
      buildTime: '2026-01-15T10:00:00Z',
      environment: 'production',
    });
  });

  it('returns null for missing commitSha and buildTime', async () => {
    delete process.env.APP_COMMIT_SHA;
    delete process.env.APP_BUILD_TIME;
    process.env.NODE_ENV = 'test';

    const res = await requestJson(createHealthApp(), '/health/version');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      commitSha: null,
      buildTime: null,
      environment: 'test',
    });
  });

  it('defaults environment to development when NODE_ENV is unset', async () => {
    delete process.env.APP_COMMIT_SHA;
    delete process.env.APP_BUILD_TIME;
    delete process.env.NODE_ENV;

    const res = await requestJson(createHealthApp(), '/health/version');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      commitSha: null,
      buildTime: null,
      environment: 'development',
    });
  });

  it('does not expose tokens, database URLs, or filesystem paths', async () => {
    process.env.APP_COMMIT_SHA = 'abc123';
    process.env.APP_BUILD_TIME = '2026-01-15T10:00:00Z';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://secret@localhost/db';
    process.env.AZURE_CLIENT_SECRET = 'super-secret';

    const res = await requestJson(createHealthApp(), '/health/version');

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/postgres|azure|secret|super|password|token|filesystem|C:\\|\/home|\/var/i);
  });

  it('response contains exactly three fields', async () => {
    process.env.APP_COMMIT_SHA = 'x';
    process.env.APP_BUILD_TIME = 'y';
    process.env.NODE_ENV = 'z';

    const res = await requestJson(createHealthApp(), '/health/version');

    expect(Object.keys(res.body)).toEqual(['commitSha', 'buildTime', 'environment']);
  });
});
