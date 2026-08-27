import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const mockPrisma = {
  document: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
};

const mockDriveUploadDocument = jest.fn();

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: String(req.headers['x-user-id'] || 'user-1'),
      email: 'test@example.com',
      role: String(req.headers['x-role'] || 'LAWYER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/middleware/featureAvailability', () => ({
  isDatabaseFoundationEnabled: jest.fn(() => false),
  sendFeatureUnavailable: jest.fn((res: Response, payload: unknown) => res.status(501).json(payload)),
  requireDatabaseFoundation: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

jest.mock('../src/modules/sharepoint', () => ({
  driveService: {
    uploadDocument: mockDriveUploadDocument,
    deleteDocument: jest.fn(),
  },
}));

jest.mock('../src/modules/documents/reviewSuggestions.service', () => ({
  createDocumentReviewSuggestion: jest.fn(),
  listDocumentReviewSuggestions: jest.fn(),
  updateDocumentReviewSuggestionStatus: jest.fn(),
  DocumentReviewSuggestionError: class DocumentReviewSuggestionError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

jest.mock('../src/modules/documents/textExtractor', () => ({ extractText: jest.fn() }));
jest.mock('../src/modules/tasks/services', () => ({
  createTaskFromDocumentSource: jest.fn(),
  SourceLinkedTaskError: class SourceLinkedTaskError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: mockPrisma,
}));

import documentsRoutes from '../src/modules/documents/routes';
import documentsService, { DocumentStorageUploadError } from '../src/modules/documents/services';

const mockCreateDocument = jest.spyOn(documentsService, 'createDocument');

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
  options: { authenticated?: boolean; headers?: Record<string, string>; body?: unknown } = {}
): Promise<{ status: number; body: any; text: string }> {
  const { authenticated = true, headers = {}, body } = options;
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
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            'content-type': 'application/json',
            ...headers,
          },
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
      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}

const VALID_FILE_CONTENT = Buffer.from('test PDF content').toString('base64');

describe('DocumentStorageUploadError → safe 502 mapping across all upload routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      caseId: 'case-1',
      securityClassification: 'STANDARD',
      case: { caseNumber: 'CASE-1' },
      fileName: 'v1.pdf',
      name: 'v1.pdf',
      folder: 'DRAFTS',
      mimeType: 'application/pdf',
      version: '1',
      currentVersion: 1,
      currentVersionInt: 1,
    });
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-1',
      createdById: 'user-1',
    });
    mockPrisma.caseCollaborator.findFirst.mockResolvedValue(null);
    mockDriveUploadDocument.mockResolvedValue({
      success: false,
      error: 'Graph SharePoint token drive path failure',
    });
  });

  describe('POST /documents (create new document)', () => {
    it('returns 502 DOCUMENT_STORAGE_UNAVAILABLE on storage failure', async () => {
      mockCreateDocument.mockRejectedValueOnce(new DocumentStorageUploadError('Document storage upload failed'));

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'test.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).toBe(502);
      expect(res.body).toMatchObject({
        status: 502,
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'A tárhelykapcsolat jelenleg nem érhető el.',
      });
    });

    it('does not leak provider details in the 502 response', async () => {
      mockCreateDocument.mockRejectedValueOnce(new DocumentStorageUploadError('SharePoint Graph API returned 503'));

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'test.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/sharepoint|graph|token|drive|provider|stack|internal|503/i);
    });

    it('does not return 200/201 on storage failure', async () => {
      mockCreateDocument.mockRejectedValueOnce(new DocumentStorageUploadError('Document storage upload failed'));

      const res = await requestJson(createApp(), 'POST', '/documents', {
        body: {
          caseId: 'case-1',
          fileName: 'test.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          documentType: 'OTHER',
        },
      });

      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
      expect(res.body).not.toHaveProperty('id');
    });
  });

  describe('POST /documents/:id/versions (immutable version upload)', () => {
    it('maps a real storage provider failure to a safe 502 response', async () => {
      const res = await requestJson(createApp(), 'POST', '/documents/doc-1/versions', {
        body: {
          fileName: 'v2.pdf',
          fileContent: VALID_FILE_CONTENT,
          mimeType: 'application/pdf',
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'WORKING_COPY',
        },
      });

      expect(res.status).toBe(502);
      expect(res.body).toMatchObject({
        status: 502,
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'A tárhelykapcsolat jelenleg nem érhető el.',
      });
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/sharepoint|graph|token|drive|path|provider|stack|internal/i);
      expect(mockDriveUploadDocument).toHaveBeenCalledTimes(1);
      expect(res.body).not.toHaveProperty('id');
    });
  });

  describe('POST /documents/:id/version (singular version upload)', () => {
    it('maps a real storage provider failure to a safe 502 response', async () => {
      const res = await requestJson(createApp(), 'POST', '/documents/doc-1/version', {
        body: {
          fileContent: VALID_FILE_CONTENT,
          comment: 'test version',
        },
      });

      expect(res.status).toBe(502);
      expect(res.body).toMatchObject({
        status: 502,
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'A tárhelykapcsolat jelenleg nem érhető el.',
      });
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/sharepoint|graph|token|drive|path|provider|stack|internal/i);
      expect(mockDriveUploadDocument).toHaveBeenCalledTimes(1);
      expect(res.body).not.toHaveProperty('id');
    });
  });
});
