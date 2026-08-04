import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { createCorsOptions } from '../src/config/cors';

interface TestResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function createApp(isProduction = false): { app: Express; mutationCount: () => number } {
  const app = express();
  let mutations = 0;

  app.use(cors(createCorsOptions({
    isProduction,
    productionAllowedOrigins: ['https://adminiculum.example.invalid'],
    frontendUrl: 'https://adminiculum.example.invalid',
  })));
  app.use(express.json());
  app.post(
    '/api/v1/tasks/:taskId/submissions/:submissionId/submit',
    (req: Request, res: Response, next: NextFunction) => {
      if (req.headers.authorization !== 'Bearer authorized-worker') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    },
    (_req: Request, res: Response) => {
      mutations += 1;
      res.status(200).json({ ok: true });
    },
  );
  app.post(
    '/api/v1/tasks/:taskId/submissions/:submissionId/return',
    (req: Request, res: Response, next: NextFunction) => {
      if (req.headers.authorization !== 'Bearer authorized-reviewer') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
    },
    (_req: Request, res: Response) => {
      mutations += 1;
      res.status(200).json({ ok: true });
    },
  );

  return { app, mutationCount: () => mutations };
}

function request(
  app: Express,
  method: string,
  path: string,
  headers: Record<string, string>,
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server unavailable'));
        return;
      }
      const outgoing = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        method,
        path,
        headers,
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          resolve({
            status: response.statusCode || 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      outgoing.on('error', (error) => {
        server.close();
        reject(error);
      });
      outgoing.end();
    });
  });
}

describe('task lifecycle CORS middleware', () => {
  it('permits the submit idempotency header without executing the mutation', async () => {
    const { app, mutationCount } = createApp();
    const response = await request(
      app,
      'OPTIONS',
      '/api/v1/tasks/task-1/submissions/submission-1/submit',
      {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,idempotency-key',
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    expect(response.headers['access-control-allow-headers']).not.toContain('*');
    expect(mutationCount()).toBe(0);
  });

  it('permits optimistic concurrency headers for review decisions', async () => {
    const { app, mutationCount } = createApp();
    const response = await request(
      app,
      'OPTIONS',
      '/api/v1/tasks/task-1/submissions/submission-1/return',
      {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,idempotency-key,if-match',
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    expect(response.headers['access-control-allow-headers']).toContain('If-Match');
    expect(response.headers['access-control-expose-headers']).toBeUndefined();
    expect(mutationCount()).toBe(0);
  });

  it('permits the server-authoritative client portal workspace selector header', async () => {
    const { app, mutationCount } = createApp(true);
    const response = await request(
      app,
      'OPTIONS',
      '/api/v1/client-portal/me',
      {
        origin: 'https://adminiculum.example.invalid',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,x-client-portal-workspace',
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://adminiculum.example.invalid');
    expect(response.headers['access-control-allow-headers']).toContain('X-Client-Portal-Workspace');
    expect(mutationCount()).toBe(0);
  });

  it('keeps CORS permission separate from route authorization', async () => {
    const { app, mutationCount } = createApp();
    const unauthenticated = await request(
      app,
      'POST',
      '/api/v1/tasks/task-1/submissions/submission-1/submit',
      { origin: 'http://localhost:3000' },
    );
    const unrelatedActor = await request(
      app,
      'POST',
      '/api/v1/tasks/task-1/submissions/submission-1/return',
      { origin: 'http://localhost:3000', authorization: 'Bearer unrelated-actor' },
    );
    const authorized = await request(
      app,
      'POST',
      '/api/v1/tasks/task-1/submissions/submission-1/submit',
      { origin: 'http://localhost:3000', authorization: 'Bearer authorized-worker' },
    );

    expect(unauthenticated.status).toBe(401);
    expect(unrelatedActor.status).toBe(403);
    expect(authorized.status).toBe(200);
    expect(mutationCount()).toBe(1);
  });

  it('preserves the production origin allowlist', async () => {
    const { app, mutationCount } = createApp(true);
    const allowed = await request(
      app,
      'OPTIONS',
      '/api/v1/tasks/task-1/submissions/submission-1/submit',
      {
        origin: 'https://adminiculum.example.invalid',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,idempotency-key',
      },
    );
    const denied = await request(
      app,
      'OPTIONS',
      '/api/v1/tasks/task-1/submissions/submission-1/submit',
      {
        origin: 'https://unrelated.example.invalid',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,idempotency-key',
      },
    );

    expect(allowed.headers['access-control-allow-origin']).toBe('https://adminiculum.example.invalid');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(mutationCount()).toBe(0);
  });
});
