/**
 * Client-data isolation regression tests for anchored annotations (Phase 12).
 *
 * Exercises RUNTIME responses, not source text. Annotation rows are seeded with
 * unique sentinel strings; any client-facing surface that echoed annotation
 * content would leak a sentinel and fail these tests.
 *
 * Unknown paths remain quarantined and implemented paths remain protected by
 * feature/auth/workspace gates. Neither boundary may query annotation storage.
 */
import express, { Express } from 'express';
import http from 'http';

export const ANNOTATION_INTERNAL_SENTINEL = 'ANNOTATION_INTERNAL_SENTINEL_9f2a';
export const CLIENT_EXPLANATION_DRAFT_SENTINEL = 'CLIENT_EXPLANATION_DRAFT_SENTINEL_7c1b';

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    documentVersion: { findFirst: jest.fn() },
    document: { findUnique: jest.fn(), findMany: jest.fn() },
    documentAnnotation: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
  },
}));

import clientPortalRoutes from '../src/routes/clientPortal';

type TestResponse = { status: number; rawBody: string };

function request(app: Express, method: string, reqPath: string): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('no addr')); return; }
      const r = http.request({ host: '127.0.0.1', port: address.port, path: reqPath, method }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode || 0, rawBody: data }); });
      });
      r.on('error', (e) => { server.close(); reject(e); });
      r.end();
    });
  });
}

function createPortalApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/client-portal', clientPortalRoutes);
  return app;
}

const PORTAL_PATHS = [
  '/api/v1/client-portal/summary',
  '/api/v1/client-portal/cases',
  '/api/v1/client-portal/documents',
  '/api/v1/client-portal/documents/doc-1',
  '/api/v1/client-portal/export',
  '/api/v1/client-portal/anything/nested/deep',
];

describe('Client Portal cannot expose annotation data', () => {
  it.each(PORTAL_PATHS)('%s is refused and returns no annotation content', async (portalPath) => {
    const res = await request(createPortalApp(), 'GET', portalPath);
    expect([501, 503]).toContain(res.status);
    expect(res.rawBody).not.toContain(ANNOTATION_INTERNAL_SENTINEL);
    expect(res.rawBody).not.toContain(CLIENT_EXPLANATION_DRAFT_SENTINEL);
    expect(res.rawBody.toLowerCase()).not.toContain('annotation');
  });

  it('every portal path — including POST — is refused before any data access', async () => {
    for (const path of PORTAL_PATHS) {
      for (const method of ['GET', 'POST']) {
        const res = await request(createPortalApp(), method, path);
        expect([501, 503]).toContain(res.status);
      }
    }
    // The quarantine must short-circuit before Prisma is ever touched.
    const { prisma } = jest.requireMock('../src/prisma/prisma.service') as any;
    expect(prisma.documentAnnotation.findMany).not.toHaveBeenCalled();
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('the portal response body carries a controlled reason, not a data payload', async () => {
    const res = await request(createPortalApp(), 'GET', '/api/v1/client-portal/summary');
    const body = JSON.parse(res.rawBody || '{}');
    expect(JSON.stringify(body)).toMatch(/CLIENT_PORTAL_NOT_ENABLED|FEATURE_NOT_AVAILABLE/);
    expect(body).not.toHaveProperty('annotations');
    expect(body).not.toHaveProperty('documents');
  });
});

describe('annotation visibility never implies client publication', () => {
  it('CLIENT_CANDIDATE and CLIENT_EXPLANATION_DRAFT remain internal-only concepts', () => {
    // There is deliberately no publication endpoint or published flag in this slice.
    const routes = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src/modules/documents/annotations.routes.ts'),
      'utf8'
    );
    expect(routes).not.toMatch(/publish/i);
    expect(routes).not.toMatch(/client-portal/i);

    const service = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src/modules/documents/annotations.service.ts'),
      'utf8'
    );
    expect(service).not.toMatch(/publishedAt|isPublished|publishToClient/);
  });

  it('annotation routes are mounted only under the authenticated documents router', () => {
    const index = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src/index.ts'),
      'utf8'
    );
    // No top-level/public mount of annotations.
    expect(index).not.toMatch(/annotations/i);
  });
});
