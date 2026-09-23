/**
 * F-005 end-to-end regression: exact-version DOCX/PDF text through the REAL
 * version-text endpoint, consumed by the REAL Document Workspace decision
 * modules.
 *
 * Unlike the existing route test (which proves the backend contract) and the
 * frontend wiring test (which uses a fake API), this suite closes the cross-stack
 * gap: it drives the actual Express documents router over HTTP and then feeds the
 * actual HTTP responses into the exact frontend modules the Document Workspace
 * reader uses.
 *
 * Contract locked in here:
 *   DOCX_CURRENT_TEXT=PASS            PDF_CURRENT_TEXT=PASS
 *   DOCX_HISTORICAL_TEXT=PASS         PDF_HISTORICAL_TEXT=PASS
 *   LATEST_VERSION_FALLBACK_USED=NO   (a version response never carries another
 *                                      version's text, even when the other
 *                                      version's bytes are downloadable)
 *   SEARCH_VERSION_TRUE=YES           (reader search scans the exact version
 *                                      text returned for the selected version)
 *   TEXT_RANGE_VERSION_TRUE=YES       (anchors are built from, and validated
 *                                      against, the exact version text)
 *   Unavailable versions keep a truthful empty state — no fabricated text and no
 *   substitution of the current/latest version's text.
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { Document, Packer, Paragraph, TextRun } from 'docx';

// pdfkit is a CommonJS package without bundled types in this project.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfkitModule = require('pdfkit');
const PDFDocument = pdfkitModule?.default ?? pdfkitModule;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

// Mandated liability fixture (DOCX).
const V1_TEXT = 'A szolgáltató felelőssége korlátlan.';
const V2_TEXT = 'A szolgáltató teljes felelőssége a nettó éves díj összegére korlátozott.';
// PDF fixture kept ASCII so the default pdfkit font cannot re-encode the bytes;
// the assertions are about EXACT-VERSION routing, not glyph fidelity.
const V1_PDF_TEXT = 'Provider liability version one is unlimited.';
const V2_PDF_TEXT = 'Provider liability version two is capped at the annual fee.';

const mockPrisma = {
  document: { findUnique: jest.fn() },
  documentVersion: { findFirst: jest.fn() },
};

const driveMock = { downloadDocument: jest.fn() };
const mockGraphGet = jest.fn();

// The documents router loads the real SharePoint drive service through a dynamic
// import, so the storage boundary is mocked at the Graph client instead of at the
// service — the real drive service + text extractor still run.
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
import { isVersionScopedTextPlan, resolveVersionTextPlan } from '../../Frontend/src/lib/documents/versionTextPlan';
import { resolveVersionTextLoadOutcome } from '../../Frontend/src/lib/documents/versionTextAvailability';
import {
  buildReaderHighlightSegmentsInRange,
  findReaderMatchOffsets,
} from '../../Frontend/src/lib/documents/readerSearch';
import { buildTextAnchor } from '../../Frontend/src/lib/annotations/annotationAnchors';
import { TEXT_RENDERER_VERSION } from '../../Frontend/src/lib/annotations/annotationCapabilities';

// PDF text extraction (pdfjs) is materially slower than DOCX under Jest.
jest.setTimeout(60000);

async function makeDocxBuffer(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: paragraphs.map((p) => new Paragraph({ children: [new TextRun(p)] })) }],
  });
  return Packer.toBuffer(doc);
}

function makePdfBuffer(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(12).text(text);
    doc.end();
  });
}

interface VersionRow {
  id: string;
  documentId: string;
  version: number;
  securityScanStatus: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  storageReference: string | null;
  spItemId: string | null;
}

function versionRow(overrides: Partial<VersionRow> & { id: string; documentId: string; version: number }): VersionRow {
  return {
    securityScanStatus: 'CLEAN',
    originalFileName: `${overrides.id}.docx`,
    mimeType: DOCX_MIME,
    size: 1000,
    storageReference: `${overrides.id}-store`,
    spItemId: `${overrides.id}-store`,
    ...overrides,
  };
}

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    documentType: 'CONTRACT',
    workspaceText: null,
    updatedAt: new Date('2026-09-23T10:00:00Z'),
    spItemId: null,
    mimeType: DOCX_MIME,
    fileName: 'felelosseg.docx',
    name: 'Felelősségi klauzula',
    versions: [],
    ...overrides,
  };
}

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  // Same mount as production: /api/v1/documents.
  app.use('/api/v1/documents', documentsRoutes);
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

let app: Express;

beforeEach(() => {
  jest.clearAllMocks();
  app = createApp();
  // Real drive service -> mocked Graph client -> per-storage bytes.
  mockGraphGet.mockImplementation(async (endpoint: string, options?: { asBinary?: boolean }) => {
    if (!options?.asBinary) return {};
    const match = /\/items\/([^/]+)\/content/.exec(endpoint);
    return driveMock.downloadDocument(match ? decodeURIComponent(match[1]) : null);
  });
  // Honor the real where clause so a mismatched document/version resolves to
  // null (404) exactly like production.
  mockPrisma.documentVersion.findFirst.mockImplementation(async (args: any) => {
    const id = args?.where?.id;
    const documentId = args?.where?.documentId;
    const rows: VersionRow[] = (globalThis as any).__versionRows || [];
    return rows.find((row) => row.id === id && row.documentId === documentId) || null;
  });
});

describe('DOCX exact-version text through the real endpoint', () => {
  let v1Buffer: Buffer;
  let v2Buffer: Buffer;
  let v1: VersionRow;
  let v2: VersionRow;

  beforeAll(async () => {
    v1Buffer = await makeDocxBuffer([V1_TEXT]);
    v2Buffer = await makeDocxBuffer([V2_TEXT]);
  });

  beforeEach(() => {
    v1 = versionRow({ id: 'v1', documentId: 'doc-1', version: 1, originalFileName: 'felelosseg-v1.docx' });
    v2 = versionRow({ id: 'v2', documentId: 'doc-1', version: 2, originalFileName: 'felelosseg-v2.docx' });
    (globalThis as any).__versionRows = [v1, v2];
    driveMock.downloadDocument.mockImplementation(async (storageId: string) =>
      (storageId === 'v1-store' ? v1Buffer : storageId === 'v2-store' ? v2Buffer : null));
  });

  it('DOCX_CURRENT_TEXT=PASS: current v2 returns exactly v2 text', async () => {
    const res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v2/text');

    expect(res.status).toBe(200);
    expect(res.body.versionId).toBe('v2');
    expect(res.body.source).toBe('UPLOADED');
    expect(res.body.text.trim()).toBe(V2_TEXT);
    expect(res.body.text).not.toContain('korlátlan');
    expect(driveMock.downloadDocument).toHaveBeenCalledTimes(1);
    expect(driveMock.downloadDocument).toHaveBeenCalledWith('v2-store');
  });

  it('DOCX_HISTORICAL_TEXT=PASS: historical v1 returns exactly v1 text', async () => {
    const res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v1/text');

    expect(res.status).toBe(200);
    expect(res.body.versionId).toBe('v1');
    expect(res.body.text.trim()).toBe(V1_TEXT);
    expect(res.body.text).not.toContain('nettó éves díj');
  });

  it('LATEST_VERSION_FALLBACK_USED=NO: v1 never reads or returns v2 bytes', async () => {
    const res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v1/text');

    expect(res.body.text.trim()).toBe(V1_TEXT);
    expect(res.body.versionNumber).toBe(1);
    // The v2 bytes are downloadable in this fixture; a fallback would surface them.
    expect(driveMock.downloadDocument).toHaveBeenCalledTimes(1);
    expect(driveMock.downloadDocument).toHaveBeenCalledWith('v1-store');
    expect(driveMock.downloadDocument).not.toHaveBeenCalledWith('v2-store');
  });

  it('uses the exact requested version id (wrong ids resolve to 404, never text)', async () => {
    const wrongVersion = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v2-of-other/text');
    expect(wrongVersion.status).toBe(404);
    expect(wrongVersion.body.code).toBe('DOCUMENT_VERSION_NOT_FOUND');

    const wrongDocument = await requestJson(app, 'GET', '/api/v1/documents/doc-other/versions/v1/text');
    expect(wrongDocument.status).toBe(404);
    expect(driveMock.downloadDocument).not.toHaveBeenCalled();
  });

  it('reader plan + availability consume the real response as VERSION_TEXT', async () => {
    const res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v1/text');

    const plan = resolveVersionTextPlan({
      hasSelectedVersion: true,
      fileType: 'DOCX',
      versionIsCurrent: false,
      versionBelongsToSelectedDocument: true,
      documentIsUploaded: true,
    });
    expect(plan).toBe('VERSION_TEXT');
    expect(isVersionScopedTextPlan(plan)).toBe(true);

    const outcome = resolveVersionTextLoadOutcome(res.body);
    // DOCX extraction preserves paragraph breaks; the exact-version content is
    // proven by trimmed equality (never a substitute version's text).
    expect((outcome.text as string).trim()).toBe(V1_TEXT);
    expect(outcome.unavailableReason).toBeNull();
  });

  it('SEARCH_VERSION_TRUE=YES: search scans the exact returned version text', async () => {
    const v1Res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v1/text');
    const v2Res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v2/text');

    const v1Text = resolveVersionTextLoadOutcome(v1Res.body).text as string;
    const v2Text = resolveVersionTextLoadOutcome(v2Res.body).text as string;

    const v1Offsets = findReaderMatchOffsets(v1Text, 'korlátlan');
    const v2Offsets = findReaderMatchOffsets(v2Text, 'korlátlan');
    expect(v1Offsets.length).toBe(1);
    expect(v2Offsets.length).toBe(0);
    // The current version's distinctive phrase is NOT found in the historical text.
    expect(findReaderMatchOffsets(v1Text, 'nettó éves díj összegére').length).toBe(0);

    // Highlighting is presentation-only and rejoins byte-for-byte.
    const segments = buildReaderHighlightSegmentsInRange(v1Text, 0, v1Text.length, v1Offsets, 'korlátlan'.length);
    expect(segments.map((segment) => segment.text).join('')).toBe(v1Text);
  });

  it('TEXT_RANGE_VERSION_TRUE=YES: anchors are built from and validated against the exact version', async () => {
    const v1Res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v1/text');
    const v2Res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v2/text');
    const v1Text = resolveVersionTextLoadOutcome(v1Res.body).text as string;
    const v2Text = resolveVersionTextLoadOutcome(v2Res.body).text as string;

    const anchor = buildTextAnchor({ rawSelection: 'korlátlan', versionText: v1Text, rendererVersion: TEXT_RENDERER_VERSION });
    expect(anchor.ok).toBe(true);
    if (!anchor.ok) return;
    expect(v1Text.slice(anchor.anchor.startOffset as number, anchor.anchor.endOffset as number)).toBe('korlátlan');
    expect(anchor.anchor.selectedText).toBe('korlátlan');

    // A selection that does not exist in v2 is refused, never silently retargeted.
    const crossVersion = buildTextAnchor({ rawSelection: 'korlátlan', versionText: v2Text, rendererVersion: TEXT_RENDERER_VERSION });
    expect(crossVersion).toEqual({ ok: false, reason: 'NOT_FOUND_IN_VERSION' });
  });
});

describe('PDF exact-version text through the real endpoint', () => {
  let p1Buffer: Buffer;
  let p2Buffer: Buffer;
  let p1: VersionRow;
  let p2: VersionRow;

  beforeAll(async () => {
    p1Buffer = await makePdfBuffer(V1_PDF_TEXT);
    p2Buffer = await makePdfBuffer(V2_PDF_TEXT);
  });

  beforeEach(() => {
    p1 = versionRow({
      id: 'p1', documentId: 'doc-pdf', version: 1,
      originalFileName: 'felelosseg-p1.pdf', mimeType: PDF_MIME,
    });
    p2 = versionRow({
      id: 'p2', documentId: 'doc-pdf', version: 2,
      originalFileName: 'felelosseg-p2.pdf', mimeType: PDF_MIME,
    });
    (globalThis as any).__versionRows = [p1, p2];
    driveMock.downloadDocument.mockImplementation(async (storageId: string) =>
      (storageId === 'p1-store' ? p1Buffer : storageId === 'p2-store' ? p2Buffer : null));
  });

  it('PDF_CURRENT_TEXT=PASS and PDF_HISTORICAL_TEXT=PASS keep each version exact', async () => {
    const current = await requestJson(app, 'GET', '/api/v1/documents/doc-pdf/versions/p2/text');
    const historical = await requestJson(app, 'GET', '/api/v1/documents/doc-pdf/versions/p1/text');

    expect(current.status).toBe(200);
    expect(historical.status).toBe(200);

    const currentText = resolveVersionTextLoadOutcome(current.body).text as string;
    const historicalText = resolveVersionTextLoadOutcome(historical.body).text as string;

    expect(currentText).toContain('capped at the annual fee');
    expect(currentText).not.toContain('unlimited');
    expect(historicalText).toContain('unlimited');
    expect(historicalText).not.toContain('capped at the annual fee');

    expect(resolveVersionTextPlan({
      hasSelectedVersion: true, fileType: 'PDF', versionIsCurrent: true,
      versionBelongsToSelectedDocument: true, documentIsUploaded: true,
    })).toBe('VERSION_TEXT');
    expect(resolveVersionTextPlan({
      hasSelectedVersion: true, fileType: 'PDF', versionIsCurrent: false,
      versionBelongsToSelectedDocument: true, documentIsUploaded: true,
    })).toBe('VERSION_TEXT');

    expect(findReaderMatchOffsets(historicalText, 'unlimited').length).toBe(1);
    expect(findReaderMatchOffsets(currentText, 'unlimited').length).toBe(0);

    const anchor = buildTextAnchor({ rawSelection: 'unlimited', versionText: historicalText, rendererVersion: TEXT_RENDERER_VERSION });
    expect(anchor.ok).toBe(true);
    if (!anchor.ok) return;
    expect(historicalText.slice(anchor.anchor.startOffset as number, anchor.anchor.endOffset as number)).toBe('unlimited');
  });

  it('LATEST_VERSION_FALLBACK_USED=NO for PDF too', async () => {
    const historical = await requestJson(app, 'GET', '/api/v1/documents/doc-pdf/versions/p1/text');
    expect(historical.body.versionId).toBe('p1');
    expect(driveMock.downloadDocument).toHaveBeenCalledTimes(1);
    expect(driveMock.downloadDocument).toHaveBeenCalledWith('p1-store');
  });
});

describe('truthful unavailable state and legacy channel scope', () => {
  it('keeps a truthful unavailable state for a version with no storage (no fabrication)', async () => {
    const noStorage = versionRow({
      id: 'v1', documentId: 'doc-1', version: 1,
      originalFileName: 'felelosseg-v1.docx', storageReference: null, spItemId: null,
    });
    (globalThis as any).__versionRows = [noStorage];

    const res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/versions/v1/text');

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('');
    expect(res.body.reasonCode).toBe('NO_VERSION_STORAGE_REFERENCE');
    expect(res.body.unavailableReason).toBeTruthy();
    expect(driveMock.downloadDocument).not.toHaveBeenCalled();

    const outcome = resolveVersionTextLoadOutcome(res.body);
    expect(outcome.text).toBeNull();
    expect(outcome.unavailableReason).toBeTruthy();
    expect(String(outcome.unavailableReason)).not.toContain('reasonCode');
  });

  it('document-level /text remains current-version only, never historical', async () => {
    const v1Buffer = await makeDocxBuffer([V1_TEXT]);
    const v2Buffer = await makeDocxBuffer([V2_TEXT]);
    const v2 = versionRow({ id: 'v2', documentId: 'doc-1', version: 2, originalFileName: 'felelosseg-v2.docx' });
    (globalThis as any).__versionRows = [v2];
    mockPrisma.document.findUnique.mockResolvedValue(documentRow({ spItemId: null, versions: [v2] }));
    driveMock.downloadDocument.mockImplementation(async (storageId: string) =>
      (storageId === 'v2-store' ? v2Buffer : storageId === 'v1-store' ? v1Buffer : null));

    const res = await requestJson(app, 'GET', '/api/v1/documents/doc-1/text');

    expect(res.status).toBe(200);
    expect(res.body.versionId).toBe('v2');
    expect(res.body.text).toContain('nettó éves díj');
    expect(res.body.text).not.toContain('korlátlan');
    // The document-level channel never substitutes a historical version.
    expect(resolveVersionTextPlan({
      hasSelectedVersion: true, fileType: 'DOCX', versionIsCurrent: false,
      versionBelongsToSelectedDocument: true, documentIsUploaded: true,
    })).toBe('VERSION_TEXT');
    expect(resolveVersionTextPlan({
      hasSelectedVersion: true, fileType: 'TXT', versionIsCurrent: true,
      versionBelongsToSelectedDocument: true, documentIsUploaded: true,
    })).toBe('VERSION_BLOB');
  });
});
