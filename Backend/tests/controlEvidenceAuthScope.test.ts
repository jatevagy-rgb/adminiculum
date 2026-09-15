import express, { type Express } from 'express';
import http from 'node:http';

// Focused regression for the production defect where controlEvidenceRoutes was
// mounted on the bare /api/v1 prefix (Backend/src/index.ts) with an unscoped
// `router.use(authenticate)`, which intercepted UNRELATED later /api/v1 routes
// such as the tokenless mailbox OAuth callbacks and returned 401
// {"error":"No token provided"} before their own router could run.
//
// This mounts the routers the way index.ts wires them, so it proves the actual
// middleware leak rather than the mailbox router in isolation.

type HttpResponse = { status: number; body: any; location?: string };

let controlEvidenceRoutes: any;
let mailboxRoutes: any;

function request(app: Express, method: string, path: string, body?: unknown): Promise<HttpResponse> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('test server did not bind'));
        return;
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          method,
          path,
          headers: payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {},
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            server.close();
            let parsed: unknown = null;
            try {
              parsed = raw ? JSON.parse(raw) : null;
            } catch {
              parsed = null;
            }
            resolve({ status: res.statusCode || 0, body: parsed, location: res.headers.location });
          });
        },
      );
      req.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

// Mirrors Backend/src/index.ts: controlEvidenceRoutes is mounted on the bare
// /api/v1 prefix BEFORE a later tokenless route and the mailbox router.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', controlEvidenceRoutes);
  app.get('/api/v1/sentinel-tokenless-route', (_req, res) => {
    res.json({ reached: true });
  });
  app.use('/api/v1/mailboxes', mailboxRoutes);
  return app;
}

describe('control-evidence authentication scope', () => {
  beforeAll(() => {
    controlEvidenceRoutes = require('../src/modules/compliance/controlEvidenceRoutes').default;
    mailboxRoutes = require('../src/modules/mailbox/routes').default;
    process.env.FRONTEND_URL = 'https://adminiculum.example.test';
    process.env.MAILBOX_OAUTH_STATE_SECRET = 'control-evidence-auth-scope-state-secret-32';
  });

  it('UNRELATED_API_V1_ROUTE_NO_LONGER_INTERCEPTED', async () => {
    const res = await request(buildApp(), 'GET', '/api/v1/sentinel-tokenless-route');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reached: true });
  });

  it('CONTROL_EVIDENCE_AUTH_PRESERVED', async () => {
    const res = await request(buildApp(), 'GET', '/api/v1/clients/some-client/compliance/controls');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'No token provided' });
  });

  it('MICROSOFT_GET_CALLBACK_REGRESSION', async () => {
    const res = await request(
      buildApp(),
      'GET',
      '/api/v1/mailboxes/oauth/microsoft/callback?code=x&state=y',
    );
    expect(res.status).toBe(303);
    expect(String(res.location || '')).toContain('mailbox=error');
  });

  it('MICROSOFT_POST_CALLBACK_REGRESSION', async () => {
    const res = await request(buildApp(), 'POST', '/api/v1/mailboxes/oauth/microsoft/callback', {
      code: 'x',
      state: 'y',
    });
    expect(res.status).not.toBe(401);
    expect(res.body?.code).toBe('MAILBOX_OPERATION_FAILED');
  });

  it('GOOGLE_CALLBACK_REGRESSION', async () => {
    const getRes = await request(
      buildApp(),
      'GET',
      '/api/v1/mailboxes/oauth/google/callback?code=x&state=y',
    );
    expect(getRes.status).toBe(303);
    expect(String(getRes.location || '')).toContain('mailbox=error');

    const postRes = await request(buildApp(), 'POST', '/api/v1/mailboxes/oauth/google/callback', {
      code: 'x',
      state: 'y',
    });
    expect(postRes.status).not.toBe(401);
    expect(postRes.body?.code).toBe('MAILBOX_OPERATION_FAILED');
  });
});
