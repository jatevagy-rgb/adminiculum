/**
 * P0/P1 — document download must release the exact immutable version bytes
 * whose scan verdict was gated, never the legacy document-level pointer.
 *
 * The `GET /api/v1/documents/:id/download` route gates on the CURRENT
 * DocumentVersion.securityScanStatus but (before the P1-2 repair) downloaded
 * bytes through the legacy Document.spItemId. This suite proves the bytes
 * released are the current version's own storage identity.
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const mockFindUnique = jest.fn();
const mockDownloadResult = jest.fn();

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    document: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

jest.mock('../src/modules/sharepoint/driveService', () => ({
  __esModule: true,
  default: { downloadDocumentResult: (...args: unknown[]) => mockDownloadResult(...args) },
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    (req as any).user = { userId: 'user-1' };
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

import documentsRoutes from '../src/modules/documents/routes';

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1/documents', documentsRoutes);
  return app;
}

function requestDownload(app: Express, path: string): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('unavailable'));
        return;
      }
      const req = http.request({ hostname: '127.0.0.1', port: address.port, path, method: 'GET' }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (c) => chunks.push(Buffer.from(c)));
        response.on('end', () => {
          server.close();
          resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks) });
        });
      });
      req.on('error', (e) => { server.close(); reject(e); });
      req.end();
    });
  });
}

describe('GET /:id/download — bytes scanned must be the bytes released', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('downloads the CURRENT version storage, not the legacy document pointer', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'doc-1',
      spItemId: 'legacy-doc-pointer',
      fileName: 'file.txt',
      name: 'file',
      mimeType: 'text/plain',
      versions: [
        { securityScanStatus: 'CLEAN', storageReference: 'v-store', spItemId: 'v-store' },
      ],
    });
    mockDownloadResult.mockResolvedValue({ success: true, content: Buffer.from('version bytes') });

    const res = await requestDownload(createApp(), '/api/v1/documents/doc-1/download');

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('version bytes');
    expect(mockDownloadResult).toHaveBeenCalledTimes(1);
    expect(mockDownloadResult).toHaveBeenCalledWith('v-store');
    expect(mockDownloadResult).not.toHaveBeenCalledWith('legacy-doc-pointer');
  });

  it('blocks a versionless legacy document (no trustworthy verdict) with zero download', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'doc-1',
      spItemId: 'legacy-doc-pointer',
      fileName: 'file.txt',
      name: 'file',
      mimeType: 'text/plain',
      versions: [],
    });

    const res = await requestDownload(createApp(), '/api/v1/documents/doc-1/download');

    expect(res.status).toBe(409);
    expect(mockDownloadResult).not.toHaveBeenCalled();
  });

  it('blocks a non-CLEAN current version with zero download', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'doc-1',
      spItemId: 'legacy-doc-pointer',
      fileName: 'file.txt',
      name: 'file',
      mimeType: 'text/plain',
      versions: [
        { securityScanStatus: 'SCAN_FAILED', storageReference: 'v-store', spItemId: 'v-store' },
      ],
    });

    const res = await requestDownload(createApp(), '/api/v1/documents/doc-1/download');

    expect(res.status).toBe(409);
    expect(mockDownloadResult).not.toHaveBeenCalled();
  });

  it('does not fall back to the legacy pointer when the current version has no storage', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'doc-1',
      spItemId: 'legacy-doc-pointer',
      fileName: 'file.txt',
      name: 'file',
      mimeType: 'text/plain',
      versions: [
        { securityScanStatus: 'CLEAN', storageReference: null, spItemId: null },
      ],
    });

    const res = await requestDownload(createApp(), '/api/v1/documents/doc-1/download');

    expect(res.status).toBe(400);
    expect(mockDownloadResult).not.toHaveBeenCalled();
  });
});
