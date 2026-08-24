import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const mockPrisma = {
  document: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
};

class MockDocumentDeleteError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public reason?: string
  ) {
    super(message);
    this.name = 'DocumentDeleteError';
  }
}

const deleteDocumentMock = jest.fn();

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

jest.mock('../src/modules/documents/services', () => ({
  __esModule: true,
  DocumentDeleteError: MockDocumentDeleteError,
  default: {
    searchDocuments: jest.fn(),
    createDocument: jest.fn(),
    getCaseDocuments: jest.fn(),
    getDocumentById: jest.fn(),
    uploadNewVersion: jest.fn(),
    submitForReview: jest.fn(),
    approveDocument: jest.fn(),
    rejectDocument: jest.fn(),
    deleteDocument: deleteDocumentMock,
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
  options: { authenticated?: boolean; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; text: string }> {
  const { authenticated = true, headers = {} } = options;
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
      req.end();
    });
  });
}

describe('document delete route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.document.findUnique.mockResolvedValue({ id: 'doc-1', caseId: 'case-1' });
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator-1' });
    mockPrisma.caseCollaborator.findFirst.mockResolvedValue(null);
    deleteDocumentMock.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated deletion before authorization or service calls', async () => {
    const res = await requestJson(createApp(), 'DELETE', '/documents/doc-1', { authenticated: false });

    expect(res.status).toBe(401);
    expect(mockPrisma.document.findUnique).not.toHaveBeenCalled();
    expect(deleteDocumentMock).not.toHaveBeenCalled();
  });

  it('requires document manage access before deleting', async () => {
    const res = await requestJson(createApp(), 'DELETE', '/documents/doc-1', { headers: { 'x-user-id': 'other-user' } });

    expect(res.status).toBe(403);
    expect(deleteDocumentMock).not.toHaveBeenCalled();
  });

  it('returns safe 404 for missing or inaccessible documents before service calls', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce(null);

    const res = await requestJson(createApp(), 'DELETE', '/documents/missing-doc');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DOCUMENT_NOT_FOUND');
    expect(deleteDocumentMock).not.toHaveBeenCalled();
  });

  it('allows privileged admin deletion through the existing manage rule', async () => {
    const res = await requestJson(createApp(), 'DELETE', '/documents/doc-1', { headers: { 'x-user-id': 'admin-user', 'x-role': 'ADMIN' } });

    expect(res.status).toBe(204);
    expect(deleteDocumentMock).toHaveBeenCalledWith('doc-1', 'admin-user', { forceHistoryDelete: false });
  });

  it('returns 204 for authorized deletion without response body', async () => {
    const res = await requestJson(createApp(), 'DELETE', '/documents/doc-1');

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(deleteDocumentMock).toHaveBeenCalledWith('doc-1', 'user-1', { forceHistoryDelete: false });
  });

  it('returns safe 409 conflict reasons from dependency preflight', async () => {
    deleteDocumentMock.mockRejectedValueOnce(new MockDocumentDeleteError(
      409,
      'DOCUMENT_DELETE_CONFLICT',
      'A dokumentum nem törölhető, mert feladat hivatkozik rá.',
      'TASK_REFERENCE_EXISTS'
    ));

    const res = await requestJson(createApp(), 'DELETE', '/documents/doc-1');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      status: 409,
      code: 'DOCUMENT_DELETE_CONFLICT',
      reason: 'TASK_REFERENCE_EXISTS',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/workspaceText|spPath|spWebUrl|fileName/i);
  });

  it('does not return success when SharePoint storage deletion fails', async () => {
    deleteDocumentMock.mockRejectedValueOnce(new MockDocumentDeleteError(
      502,
      'DOCUMENT_STORAGE_DELETE_FAILED',
      'A dokumentum SharePoint-törlése nem sikerült. Az adatbázis nem módosult.',
      'STORAGE_DELETE_FAILED'
    ));

    const res = await requestJson(createApp(), 'DELETE', '/documents/doc-1');

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      status: 502,
      code: 'DOCUMENT_STORAGE_DELETE_FAILED',
      reason: 'STORAGE_DELETE_FAILED',
    });
  });
});
