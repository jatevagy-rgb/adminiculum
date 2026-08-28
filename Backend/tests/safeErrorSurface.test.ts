/**
 * Safe error-surface hardening tests.
 *
 * Proves that internal/unexpected failures never leak raw exception text,
 * stacks, provider detail, or DB error text into the HTTP response — while the
 * status stays semantically correct and a stable safe code is returned.
 */

import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { buildPrismaErrorResponse } from '../src/utils/prismaError';

// Distinctive sentinels that must never appear in a client response.
const SENTINEL_MSG = 'LEAKSENTINEL_raw_db_text';
const SENTINEL_SECRET = 'password=hunter2';
const SENTINEL_PATH = '/srv/app/secret.ts:42';

function throwingSentinelError(): never {
  const err = new Error(`${SENTINEL_MSG} ${SENTINEL_SECRET} at ${SENTINEL_PATH}`);
  err.stack = `Error: ${SENTINEL_MSG}\n    at Object.<anonymous> (${SENTINEL_PATH})`;
  throw err;
}

// ---- Clause Library router mocks (auth passes; service forced to fail) -------

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { userId: 'u1', email: 'w@example.com', role: 'LAWYER', authProvider: 'local-jwt' };
    next();
  },
}));
jest.mock('../src/middleware/workforceAuthorization', () => ({
  requireWorkforceUser: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('../src/middleware/featureAvailability', () => ({
  isDatabaseFoundationEnabled: () => true,
  requireDatabaseFoundation: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('../src/modules/cases/authorization', () => ({
  requireCaseReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireCaseManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('../src/modules/contracts/contractAuthorization', () => ({
  requireContractGenerationReadAccessFromBody: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('../src/modules/clause-library/service', () => ({
  __esModule: true,
  default: {
    listClauses: jest.fn(() => throwingSentinelError()),
    getClause: jest.fn(() => throwingSentinelError()),
    createClause: jest.fn(() => throwingSentinelError()),
  },
}));

import clauseLibraryRouter from '../src/modules/clause-library/routes';

interface TestResponse {
  status: number;
  rawText: string;
  body: any;
}

function requestJson(app: Express, method: string, urlPath: string, body?: unknown): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('no address'));
        return;
      }
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: urlPath,
          method,
          headers: { 'content-type': 'application/json', ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}) },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.from(c)));
          res.on('end', () => {
            server.close();
            const rawText = Buffer.concat(chunks).toString('utf8');
            resolve({ status: res.statusCode || 0, rawText, body: rawText ? JSON.parse(rawText) : null });
          });
        },
      );
      req.on('error', (e) => {
        server.close();
        reject(e);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function expectNoLeak(res: TestResponse) {
  expect(res.rawText).not.toContain(SENTINEL_MSG);
  expect(res.rawText).not.toContain(SENTINEL_SECRET);
  expect(res.rawText).not.toContain(SENTINEL_PATH);
  expect(res.rawText.toLowerCase()).not.toContain('stack');
  expect(res.body?.details).toBeUndefined();
}

describe('Clause Library — internal failures never leak raw error text', () => {
  const app = () => {
    const a = express();
    a.use(express.json());
    a.use('/clause-library', clauseLibraryRouter);
    return a;
  };

  it('GET /clauses → 500 stable code, no raw leak', async () => {
    const res = await requestJson(app(), 'GET', '/clause-library/clauses');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('CLAUSE_LIBRARY_INTERNAL_ERROR');
    expectNoLeak(res);
  });

  it('GET /clauses/:id → 500 stable code, no raw leak', async () => {
    const res = await requestJson(app(), 'GET', '/clause-library/clauses/abc');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('CLAUSE_LIBRARY_INTERNAL_ERROR');
    expectNoLeak(res);
  });

  it('POST /clauses → 500 stable code, no raw leak', async () => {
    // Complete body so validation passes and the (mocked, throwing) service is reached.
    const res = await requestJson(app(), 'POST', '/clause-library/clauses', {
      title: 'x',
      slug: 'x',
      body: 'x',
      contractType: 'NDA',
      clauseKind: 'STANDARD',
      representedSide: 'BUYER',
      category: 'GENERAL',
    });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('CLAUSE_LIBRARY_INTERNAL_ERROR');
    expectNoLeak(res);
  });
});

describe('buildPrismaErrorResponse — no raw DB text', () => {
  it('curated unique-constraint stays informative but carries no raw message', () => {
    const r = buildPrismaErrorResponse({ code: 'P2002', meta: { target: ['email'] } })!;
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).not.toContain('LEAK');
  });

  it('unmapped Prisma code does not surface raw err.message', () => {
    const r = buildPrismaErrorResponse({ code: 'P9999', message: `${SENTINEL_MSG} column secret` })!;
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain(SENTINEL_MSG);
    expect(r.body.details).toBe('An error occurred while processing your request');
  });

  it('generic Prisma client error does not surface raw err.message', () => {
    const r = buildPrismaErrorResponse({ name: 'PrismaClientValidationError', message: `${SENTINEL_MSG} internals` })!;
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain(SENTINEL_MSG);
    expect(r.body.details).toBe('Database operation failed');
  });
});

describe('Source guards — leak patterns removed', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

  it('clause-library routes carry no details: error.message', () => {
    const s = read('../src/modules/clause-library/routes.ts');
    expect(s).not.toContain('details: error.message');
    expect(s).toContain("CLAUSE_LIBRARY_INTERNAL_ERROR");
  });

  it('generation-draft routes carry no details: error.message', () => {
    const s = read('../src/modules/generation-draft/routes.ts');
    expect(s).not.toContain('details: error.message');
    expect(s).toContain('GENERATION_DRAFT_INTERNAL_ERROR');
  });

  it('contracts service no longer serializes stack/rawError into results', () => {
    const s = read('../src/modules/contracts/services.ts');
    expect(s).not.toContain('rawError:');
    expect(s).not.toContain('serializeTemplateError');
  });

  it('prismaError helper surfaces no raw err.message', () => {
    const s = read('../src/utils/prismaError.ts');
    expect(s).not.toContain('details: err.message');
    expect(s).not.toContain('err.meta?.message');
  });

  it('sharepoint diagnostics no longer returns raw provider text', () => {
    const s = read('../src/modules/sharepoint/routes.ts');
    expect(s).not.toContain('error.message.slice');
  });
});
