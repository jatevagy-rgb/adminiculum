import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { buildPrismaErrorResponse } from '../src/utils/prismaError';

const RAW_FAILURE = 'SECRET_DB_TEXT /srv/app/private.ts:42';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
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
    listClauses: jest.fn(() => Promise.reject(new Error(RAW_FAILURE))),
  },
}));
jest.mock('../src/modules/sharepoint/graphClient', () => ({
  __esModule: true,
  default: {
    getConfig: () => ({
      siteId: 'site-id',
      driveId: 'drive-id',
    }),
    isConfigured: () => true,
      getAccessToken: jest.fn(() => Promise.reject(new Error('PROVIDER_SECRET_SENTINEL bearer-token https://secret.example/path'))),
      get: jest.fn(() => Promise.reject(new Error('PROVIDER_SECRET_SENTINEL bearer-token https://secret.example/path'))),
  },
  GraphClientError: class GraphClientError extends Error {},
}));

import clauseLibraryRouter from '../src/modules/clause-library/routes';
import sharepointRouter from '../src/modules/sharepoint/routes';

interface HttpResult {
  status: number;
  body: string;
}

function request(app: Express, path: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('server did not bind'));
        return;
      }
      const client = http.request(
        { hostname: '127.0.0.1', port: address.port, path, method: 'GET' },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            server.close();
            resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') });
          });
        },
      );
      client.on('error', (error) => {
        server.close();
        reject(error);
      });
      client.end();
    });
  });
}

describe('safe error failure boundaries', () => {
  it('does not expose unknown route failure details', async () => {
    const app = express();
    app.use('/clause-library', clauseLibraryRouter);

    const result = await request(app, '/clause-library/clauses');

    expect(result.status).toBe(500);
    expect(result.body).not.toContain(RAW_FAILURE);
    expect(result.body).not.toContain('stack');
    expect(result.body).toContain('CLAUSE_LIBRARY_INTERNAL_ERROR');
  });

  it('preserves safe status while removing raw Prisma text', () => {
    const result = buildPrismaErrorResponse({
      code: 'P9999',
      message: RAW_FAILURE,
    });

    expect(result?.status).toBe(400);
    expect(JSON.stringify(result?.body)).not.toContain(RAW_FAILURE);
    expect(result?.body.details).toBe('An error occurred while processing your request');
  });

  it('preserves curated not-found semantics without raw database text', () => {
    const result = buildPrismaErrorResponse({
      code: 'P2025',
      meta: { modelName: 'Document' },
      message: RAW_FAILURE,
    });

    expect(result?.status).toBe(404);
    expect(JSON.stringify(result?.body)).not.toContain(RAW_FAILURE);
  });

  it('does not expose provider failure details in diagnostics', async () => {
    const app = express();
    app.use('/sharepoint', sharepointRouter);

    const result = await request(app, '/sharepoint/diagnostics');

    expect(result.status).toBe(200);
    expect(result.body).not.toContain('PROVIDER_SECRET_SENTINEL');
    expect(result.body).not.toContain('bearer-token');
    expect(result.body).not.toContain('secret.example');
  });
});
