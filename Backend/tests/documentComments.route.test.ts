import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const mockPrisma = {
  document: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  comment: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  timelineEvent: { create: jest.fn() },
  notification: { create: jest.fn() },
};

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
  prisma: mockPrisma,
}));

import documentsRoutes from '../src/modules/documents/routes';
import documentsService from '../src/modules/documents/services';

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
  options: { authenticated?: boolean; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any }> {
  const { authenticated = true, body, headers = {} } = options;
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
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
          });
        }
      );
      req.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

const openComment = {
  id: 'comment-1',
  documentId: 'doc-1',
  caseId: 'case-1',
  userId: 'user-1',
  content: 'Átnézendő pont.',
  isResolved: false,
  createdAt: new Date('2026-07-14T10:00:00Z'),
  updatedAt: new Date('2026-07-14T10:00:00Z'),
  user: { id: 'user-1', name: 'Dr. Teszt' },
};

const uploadBody = {
  caseId: 'case-1',
  fileName: 'smoke.txt',
  fileContent: Buffer.from('safe smoke').toString('base64'),
  mimeType: 'text/plain',
};

describe('document upload route safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator-1' });
    mockPrisma.timelineEvent.create.mockResolvedValue({});
    (documentsService.createDocument as jest.Mock).mockResolvedValue({
      id: 'doc-new',
      caseId: 'case-1',
      fileName: 'smoke.txt',
      documentType: 'OTHER',
      version: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('requires case-level manage access before uploading', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'other-user', createdById: 'creator-1' });
    const res = await requestJson(createApp(), 'POST', '/documents', { body: uploadBody });
    expect(res.status).toBe(403);
    expect(documentsService.createDocument).not.toHaveBeenCalled();
  });

  it('rejects unsupported file extensions before storage upload', async () => {
    const res = await requestJson(createApp(), 'POST', '/documents', { body: { ...uploadBody, fileName: 'unsafe.exe' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(documentsService.createDocument).not.toHaveBeenCalled();
  });

  it('rejects mismatched MIME type before storage upload', async () => {
    const res = await requestJson(createApp(), 'POST', '/documents', { body: { ...uploadBody, mimeType: 'application/x-msdownload' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_MIME_TYPE');
    expect(documentsService.createDocument).not.toHaveBeenCalled();
  });

  it('sanitizes path-like filenames before calling the document service', async () => {
    const res = await requestJson(createApp(), 'POST', '/documents', { body: { ...uploadBody, fileName: '..\\..\\safe smoke.txt' } });
    expect(res.status).toBe(201);
    expect(documentsService.createDocument).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'safe smoke.txt' }));
  });
});

describe('document comments routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.document.findUnique.mockResolvedValue({ id: 'doc-1', caseId: 'case-1' });
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator-1' });
    mockPrisma.caseCollaborator.findFirst.mockResolvedValue(null);
    mockPrisma.comment.findMany.mockResolvedValue([openComment]);
    mockPrisma.comment.create.mockImplementation(async ({ data, select }: any) => ({
      ...openComment,
      id: 'comment-new',
      userId: data.userId,
      documentId: data.documentId,
      caseId: data.caseId,
      content: data.content,
      isResolved: false,
      user: { id: data.userId, name: 'Dr. Teszt' },
    }));
    mockPrisma.comment.findFirst.mockResolvedValue(openComment);
    mockPrisma.comment.update.mockImplementation(async ({ data }: any) => ({ ...openComment, isResolved: data.isResolved }));
  });

  it('rejects unauthenticated list before DB access', async () => {
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/comments', { authenticated: false });
    expect(res.status).toBe(401);
    expect(mockPrisma.document.findUnique).not.toHaveBeenCalled();
  });

  it('lists bounded explicit DTOs without private author fields', async () => {
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/comments?limit=10&offset=0');
    expect(res.status).toBe(200);
    expect(mockPrisma.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { documentId: 'doc-1' },
      take: 10,
      skip: 0,
      select: expect.objectContaining({ content: true, user: { select: { id: true, name: true } } }),
    }));
    expect(res.body.comments[0]).toMatchObject({
      id: 'comment-1',
      documentId: 'doc-1',
      author: { id: 'user-1', displayName: 'Dr. Teszt' },
      content: 'Átnézendő pont.',
      status: 'OPEN',
      capabilities: { canResolve: true, canReopen: false, canDelete: false },
    });
    expect(JSON.stringify(res.body)).not.toContain('email');
  });

  it('rejects invalid list limits', async () => {
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/comments?limit=500');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_COMMENT_LIMIT');
  });

  it('returns safe not found for missing document', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce(null);
    const res = await requestJson(createApp(), 'GET', '/documents/missing/comments');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DOCUMENT_NOT_FOUND');
    expect(mockPrisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('blocks wrong-case users without comment lookup', async () => {
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/comments', { headers: { 'x-user-id': 'other-user' } });
    expect(res.status).toBe(403);
    expect(mockPrisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('creates plain-text comments with authenticated author only', async () => {
    const res = await requestJson(createApp(), 'POST', '/documents/doc-1/comments', {
      body: { content: '  Kérlek ellenőrizd.  ' },
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.comment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { documentId: 'doc-1', caseId: 'case-1', userId: 'user-1', content: 'Kérlek ellenőrizd.' },
    }));
    expect(mockPrisma.timelineEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('rejects empty, HTML, oversized, and client actor fields', async () => {
    const app = createApp();
    expect((await requestJson(app, 'POST', '/documents/doc-1/comments', { body: { content: '   ' } })).status).toBe(400);
    expect((await requestJson(app, 'POST', '/documents/doc-1/comments', { body: { content: '<script>alert(1)</script>' } })).body.code).toBe('COMMENT_HTML_NOT_ACCEPTED');
    expect((await requestJson(app, 'POST', '/documents/doc-1/comments', { body: { content: 'a'.repeat(2001) } })).body.code).toBe('COMMENT_CONTENT_TOO_LONG');
    expect((await requestJson(app, 'POST', '/documents/doc-1/comments', { body: { content: 'ok', authorId: 'evil' } })).body.code).toBe('COMMENT_FIELD_NOT_ACCEPTED');
  });

  it('resolves and reopens own comments', async () => {
    const resolved = await requestJson(createApp(), 'POST', '/documents/doc-1/comments/comment-1/resolve');
    expect(resolved.status).toBe(200);
    expect(mockPrisma.comment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'comment-1' }, data: { isResolved: true } }));

    mockPrisma.comment.findFirst.mockResolvedValueOnce({ ...openComment, isResolved: true });
    const reopened = await requestJson(createApp(), 'POST', '/documents/doc-1/comments/comment-1/reopen');
    expect(reopened.status).toBe(200);
    expect(mockPrisma.comment.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { isResolved: false } }));
  });

  it('returns 409 for repeated resolve/reopen and 404 for wrong document comment', async () => {
    mockPrisma.comment.findFirst.mockResolvedValueOnce({ ...openComment, isResolved: true });
    const repeatedResolve = await requestJson(createApp(), 'POST', '/documents/doc-1/comments/comment-1/resolve');
    expect(repeatedResolve.status).toBe(409);
    expect(repeatedResolve.body.code).toBe('COMMENT_ALREADY_RESOLVED');

    mockPrisma.comment.findFirst.mockResolvedValueOnce(null);
    const wrongDocument = await requestJson(createApp(), 'POST', '/documents/doc-1/comments/comment-other/resolve');
    expect(wrongDocument.status).toBe(404);
  });

  it('blocks non-author non-manager transitions', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'manager-1', createdById: 'creator-1' });
    mockPrisma.caseCollaborator.findFirst.mockResolvedValue({ id: 'collab-1' });
    const res = await requestJson(createApp(), 'POST', '/documents/doc-1/comments/comment-1/resolve', { headers: { 'x-user-id': 'collab-1' } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('COMMENT_ACTION_FORBIDDEN');
  });
});
