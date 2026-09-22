/**
 * Version-bound document text routes (DOCUMENT-CONTENT-PIPELINE-1).
 *
 * Exercises the real documents router over HTTP with auth/authorization and
 * Prisma mocked, proving the user-facing contract behind UAT symptom 1:
 *   - GET /documents/:id/text resolves the CURRENT immutable version's own
 *     stored bytes even when the document-level SharePoint pointer is missing;
 *   - the legacy document-level pointer still works when no version storage
 *     exists (honest legacy behaviour preserved);
 *   - a genuinely metadata-only document reports a truthful empty state;
 *   - the scan gate still blocks content;
 *   - GET /documents/:id/versions/:versionId/text is strictly version-bound and
 *     never substitutes another version's text.
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const mockPrisma = {
  document: { findUnique: jest.fn() },
  documentVersion: { findFirst: jest.fn() },
};

const driveMock = { downloadDocument: jest.fn() };
const mockGraphGet = jest.fn();

// The documents router loads the real SharePoint drive service through a
// dynamic import, so the storage boundary is mocked at the Graph client instead
// of at the service — the real drive service + text extractor still run.
jest.mock('../src/modules/sharepoint/graphClient', () => ({
  __esModule: true,
  GraphClientError: class GraphClientError extends Error {
    operation = 'mock';
  },
  default: {
    isConfigured: () => true,
    getConfig: () => ({ siteId: 'site-1' }),
    get: (...args: unknown[]) => mockGraphGet(...args),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ code: 'NO_TOKEN' });
      return;
    }
    (req as any).user = { userId: 'user-1', email: 'test@example.com', role: 'LAWYER', authProvider: 'local-jwt' };
    next();
  },
}));

const passthrough = (_req: Request, _res: Response, next: NextFunction) => next();

jest.mock('../src/middleware/workforceAuthorization', () => ({ requireWorkforceUser: passthrough }));

jest.mock('../src/modules/documents/authorization', () => ({
  requireDocumentReadAccess: passthrough,
  requireDocumentManageAccess: passthrough,
  requireHrConfidentialReadAccess: passthrough,
  hrConfidentialReadAllowed: () => true,
  getUserRole: () => 'LAWYER',
}));

jest.mock('../src/modules/documents/documentObjectAuthorization', () => ({
  requireDocumentObjectReadAccess: passthrough,
  requireDocumentObjectManageAccess: passthrough,
}));

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockPrisma }));

import documentsRoutes from '../src/modules/documents/routes';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const V1_TEXT = 'A szolgáltató felelőssége korlátlan.';
const V2_TEXT = 'A szolgáltató teljes felelőssége a nettó éves díj összegére korlátozott.';

async function makeDocxBuffer(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: paragraphs.map((p) => new Paragraph({ children: [new TextRun(p)] })) }],
  });
  return Packer.toBuffer(doc);
}

function currentVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v2',
    documentId: 'doc-1',
    version: 2,
    securityScanStatus: 'CLEAN',
    originalFileName: 'felelosseg-v2.docx',
    mimeType: DOCX_MIME,
    size: 1000,
    storageReference: 'ver-store',
    spItemId: 'ver-store',
    ...overrides,
  };
}

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    documentType: 'CONTRACT',
    workspaceText: null,
    updatedAt: new Date('2026-09-21T10:00:00Z'),
    spItemId: null,
    mimeType: DOCX_MIME,
    fileName: 'felelosseg.docx',
    name: 'Felelősségi klauzula',
    versions: [currentVersion()],
    ...overrides,
  };
}

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/documents', documentsRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  path: string,
  options: { authenticated?: boolean } = {},
): Promise<{ status: number; body: any }> {
  const { authenticated = true } = options;
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
          method,
          headers: authenticated ? { authorization: 'Bearer test-token' } : {},
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
          });
        },
      );
      req.on('error', (error) => { server.close(); reject(error); });
      req.end();
    });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Real drive service -> mocked Graph client -> per-storage bytes.
  mockGraphGet.mockImplementation(async (endpoint: string, options?: { asBinary?: boolean }) => {
    if (!options?.asBinary) return {};
    const match = /\/items\/([^/]+)\/content/.exec(endpoint);
    return driveMock.downloadDocument(match ? decodeURIComponent(match[1]) : null);
  });
});

describe('GET /documents/:id/text (current-version bound)', () => {
  let v1Buffer: Buffer;
  let v2Buffer: Buffer;

  beforeAll(async () => {
    v1Buffer = await makeDocxBuffer([V1_TEXT]);
    v2Buffer = await makeDocxBuffer([V2_TEXT]);
  });

  it('reads the current immutable version storage even when the document pointer is missing', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(documentRow({ spItemId: null }));
    driveMock.downloadDocument.mockImplementation(async (storageId: string) =>
      (storageId === 'ver-store' ? v2Buffer : null));

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/text');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('UPLOADED');
    expect(res.body.versionId).toBe('v2');
    expect(res.body.text).toContain('korlátozott');
    expect(res.body.unavailableReason).toBeUndefined();
    expect(driveMock.downloadDocument).toHaveBeenCalledWith('ver-store');
  });

  it('keeps the legacy document-level pointer fallback when no version storage exists', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(documentRow({
      spItemId: 'doc-store',
      versions: [currentVersion({ spItemId: null, storageReference: null })],
    }));
    driveMock.downloadDocument.mockImplementation(async (storageId: string) =>
      (storageId === 'doc-store' ? v1Buffer : null));

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/text');

    expect(res.status).toBe(200);
    expect(res.body.text).toContain('korlátlan');
    expect(driveMock.downloadDocument).toHaveBeenCalledWith('doc-store');
  });

  it('reports a truthful empty state for a genuinely metadata-only document', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(documentRow({
      spItemId: null,
      versions: [currentVersion({ spItemId: null, storageReference: null })],
    }));

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/text');

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('');
    expect(res.body.unavailableReason).toBe('A dokumentumhoz nincs SharePoint azonosító, ezért a szöveg nem nyerhető ki.');
    expect(driveMock.downloadDocument).not.toHaveBeenCalled();
  });

  it('preserves the security-scan gate', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(documentRow({
      versions: [currentVersion({ securityScanStatus: 'PENDING_SCAN' })],
    }));

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/text');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOCUMENT_SECURITY_SCAN_BLOCKED');
    expect(driveMock.downloadDocument).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown document without touching storage', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(null);

    const res = await requestJson(createApp(), 'GET', '/documents/missing/text');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(driveMock.downloadDocument).not.toHaveBeenCalled();
  });
});

describe('GET /documents/:id/versions/:versionId/text (strictly version-bound)', () => {
  let v1Buffer: Buffer;
  let v2Buffer: Buffer;

  beforeAll(async () => {
    v1Buffer = await makeDocxBuffer([V1_TEXT]);
    v2Buffer = await makeDocxBuffer([V2_TEXT]);
  });

  it('returns the exact selected version text and never the current version text', async () => {
    mockPrisma.documentVersion.findFirst.mockResolvedValue(currentVersion({
      id: 'v1', version: 1, spItemId: 'v1-store', storageReference: 'v1-store',
    }));
    driveMock.downloadDocument.mockImplementation(async (storageId: string) =>
      (storageId === 'v1-store' ? v1Buffer : storageId === 'ver-store' ? v2Buffer : null));

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/versions/v1/text');

    expect(res.status).toBe(200);
    expect(res.body.versionId).toBe('v1');
    expect(res.body.text).toContain('korlátlan');
    expect(res.body.text).not.toContain('korlátozott');
    expect(driveMock.downloadDocument).toHaveBeenCalledTimes(1);
    expect(driveMock.downloadDocument).toHaveBeenCalledWith('v1-store');
  });

  it('reports NO_VERSION_STORAGE_REFERENCE for a metadata-only version instead of substituting text', async () => {
    mockPrisma.documentVersion.findFirst.mockResolvedValue(currentVersion({
      id: 'v1', version: 1, spItemId: null, storageReference: null,
    }));

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/versions/v1/text');

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('');
    expect(res.body.reasonCode).toBe('NO_VERSION_STORAGE_REFERENCE');
    expect(res.body.unavailableReason).toBeTruthy();
    expect(driveMock.downloadDocument).not.toHaveBeenCalled();
  });

  it('returns 404 for a version that does not belong to the document', async () => {
    mockPrisma.documentVersion.findFirst.mockResolvedValue(null);

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/versions/other/text');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DOCUMENT_VERSION_NOT_FOUND');
  });
});

describe('route protection wiring (unchanged security posture)', () => {
  it('requires authentication on both text endpoints and never touches storage', async () => {
    const versionRes = await requestJson(createApp(), 'GET', '/documents/doc-1/versions/v1/text', { authenticated: false });
    expect(versionRes.status).toBe(401);

    const documentRes = await requestJson(createApp(), 'GET', '/documents/doc-1/text', { authenticated: false });
    expect(documentRes.status).toBe(401);

    expect(mockPrisma.document.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(driveMock.downloadDocument).not.toHaveBeenCalled();
  });

  it('registers both text routes behind authenticate + a document read-access guard', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'modules', 'documents', 'routes.ts'),
      'utf8',
    );
    // The version-bound endpoint inherits the same document read guard as the
    // existing version endpoints; the current-version preview keeps its
    // object-level read guard. Neither route weakens authorization.
    expect(source).toContain("router.get('/:id/versions/:versionId/text', authenticate, requireDocumentReadAccess,");
    expect(source).toContain("router.get('/:id/text', authenticate, requireDocumentObjectReadAccess,");
  });
});
