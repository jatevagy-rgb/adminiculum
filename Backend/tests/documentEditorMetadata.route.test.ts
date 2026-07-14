import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'LAWYER', authProvider: 'local-jwt' };
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
  default: {
    searchDocuments: jest.fn(),
    createDocument: jest.fn(),
    getCaseDocuments: jest.fn(),
    getDocumentById: jest.fn(),
    uploadNewVersion: jest.fn(),
    submitForReview: jest.fn(),
    approveDocument: jest.fn(),
    rejectDocument: jest.fn(),
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
  prisma: {
    document: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    case: { findUnique: jest.fn() },
    caseCollaborator: { findFirst: jest.fn() },
    timelineEvent: { create: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import documentsRoutes from '../src/modules/documents/routes';

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/documents', documentsRoutes);
  return app;
}

function requestJson(app: Express, method: string, path: string, authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request(
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
        }
      );
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      request.end();
    });
  });
}

const documentRecord = {
  id: 'doc-1',
  caseId: 'case-1',
  name: 'Szerződés.docx',
  fileName: 'Szerződés.docx',
  category: 'CONTRACT',
  documentType: 'CONTRACT',
  currentVersion: 2,
  folder: '02_Drafts',
  updatedAt: new Date('2026-07-14T08:00:00.000Z'),
};

describe('document editor metadata route', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated access before DB lookup', async () => {
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/editor', false);
    expect(res.status).toBe(401);
    expect((prisma as any).document.findUnique).not.toHaveBeenCalled();
  });

  it('returns safe 404 for missing document', async () => {
    (prisma as any).document.findUnique.mockResolvedValueOnce(null);
    const res = await requestJson(createApp(), 'GET', '/documents/missing/editor');
    expect(res.status).toBe(404);
  });

  it('returns Mode C capabilities and no storage paths for a view-only collaborator', async () => {
    (prisma as any).document.findUnique
      .mockResolvedValueOnce({ caseId: 'case-1' })
      .mockResolvedValueOnce(documentRecord);
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'other', createdById: 'owner' });
    (prisma as any).caseCollaborator.findFirst.mockResolvedValue({ id: 'collab-1' });

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/editor');
    expect(res.status).toBe(200);
    expect(res.body.persistence).toMatchObject({ mode: 'EXPORT_ONLY', serverSaved: false, contentAvailable: false, versionToken: null });
    expect(res.body.capabilities.canView).toBe(true);
    expect(res.body.capabilities.canEdit).toBe(false);
    expect(res.body.capabilities.canSave).toBe(false);
    expect(res.body.capabilities.canSaveNewVersion).toBe(false);
    expect(res.body.availability).toMatchObject({ serverPersistence: false, autosave: false, contentVersions: false, restore: false, comments: false });
    expect(JSON.stringify(res.body)).not.toMatch(/spItemId|spPath|spWebUrl|workspaceText|sharepoint/i);
  });

  it('marks managers as editable without enabling save/version/comment persistence', async () => {
    (prisma as any).document.findUnique
      .mockResolvedValueOnce({ caseId: 'case-1' })
      .mockResolvedValueOnce(documentRecord);
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'owner' });

    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/editor');
    expect(res.status).toBe(200);
    expect(res.body.capabilities.canEdit).toBe(true);
    expect(res.body.capabilities.canSave).toBe(false);
    expect(res.body.capabilities.canRestoreVersion).toBe(false);
    expect(res.body.capabilities.canComment).toBe(false);
    expect(res.body.document).toEqual({
      id: 'doc-1',
      caseId: 'case-1',
      name: 'Szerződés.docx',
      category: 'CONTRACT',
      documentType: 'CONTRACT',
      currentVersion: 2,
      updatedAt: '2026-07-14T08:00:00.000Z',
    });
  });
});
