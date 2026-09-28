import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = { userId: 'user-1', email: 't@e.com', role: 'LAWYER', authProvider: 'local-jwt' };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: { findUnique: jest.fn() },
    caseCollaborator: { findFirst: jest.fn() },
    comment: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import { validateCommentCreate } from '../src/modules/documents/documentComments.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

function request(app: Express, method: string, reqPath: string, opts: { auth?: boolean; body?: any } = {}): Promise<TestResponse> {
  const { auth = true, body } = opts;
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('no addr')); return; }
      const headers: Record<string, string> = auth ? { authorization: 'Bearer test-token' } : {};
      if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = String(Buffer.byteLength(payload)); }
      const r = http.request({ host: '127.0.0.1', port: address.port, path: reqPath, method, headers }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode || 0, body: data ? JSON.parse(data) : null }); });
      });
      r.on('error', (e) => { server.close(); reject(e); });
      if (payload) r.write(payload);
      r.end();
    });
  });
}

// userCanReadCase reads case.findUnique(assignedLawyerId/createdById) + caseCollaborator.
const CASE_AUTH = { id: 'case-1', assignedLawyerId: 'user-1', createdById: 'user-1' };

describe('Case comments routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(CASE_AUTH);
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it('requires authentication', async () => {
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { auth: false, body: { content: 'x' } });
    expect(res.status).toBe(401);
  });

  it('404 when the case does not exist', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(createApp(), 'POST', '/cases/nope/comments', { body: { content: 'jegyzet' } });
    expect(res.status).toBe(404);
  });

  it('403 when the user cannot access the case', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({ id: 'case-1', assignedLawyerId: 'other', createdById: 'other' });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'jegyzet' } });
    expect(res.status).toBe(403);
  });

  it('creates a case comment (caseId server-set, documentId null, author from auth)', async () => {
    (prisma.comment.create as jest.Mock).mockResolvedValue({
      id: 'cm-1', caseId: 'case-1', documentId: null, userId: 'user-1', content: 'Belső jegyzet',
      isResolved: false, createdAt: new Date('2026-07-10'), updatedAt: new Date('2026-07-10'),
      user: { id: 'user-1', name: 'dr. Teszt' },
    });
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'Belső jegyzet' } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'cm-1', caseId: 'case-1', status: 'OPEN', content: 'Belső jegyzet' });
    expect(res.body.author.displayName).toBe('dr. Teszt');
    // caseId/documentId/userId were set server-side, not taken from the request body
    const createArg = (prisma.comment.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data).toMatchObject({ caseId: 'case-1', documentId: null, userId: 'user-1' });
  });

  it('rejects a comment that tries to smuggle caseId/documentId/userId', async () => {
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'x', caseId: 'other-case', userId: 'admin' } });
    expect(res.status).toBe(400);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects an empty comment', async () => {
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: '   ' } });
    expect(res.status).toBe(400);
  });

  it('lists only case-level notes (documentId null)', async () => {
    (prisma.comment.findMany as jest.Mock).mockResolvedValue([
      { id: 'cm-1', caseId: 'case-1', documentId: null, parentId: null, userId: 'user-1', content: 'Jegyzet', isResolved: false, createdAt: new Date(), updatedAt: new Date(), user: { id: 'user-1', name: 'dr. Teszt' } },
    ]);
    const res = await request(createApp(), 'GET', '/cases/case-1/comments');
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].parentId).toBeNull();
    const whereArg = (prisma.comment.findMany as jest.Mock).mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ caseId: 'case-1', documentId: null });
  });

  // ---- replies (canonical Comment.parentId, one visible thread level) ----

  const CASE_LEVEL_PARENT = { id: 'cm-parent', caseId: 'case-1', documentId: null, parentId: null };
  const REPLY_RECORD = {
    id: 'cm-reply', caseId: 'case-1', documentId: null, parentId: 'cm-parent',
    userId: 'user-1', content: 'Válasz', isResolved: false,
    createdAt: new Date('2026-07-10'), updatedAt: new Date('2026-07-10'),
    user: { id: 'user-1', name: 'dr. Teszt' },
  };

  it('creates a reply tied to a same-case top-level note', async () => {
    (prisma.comment.findFirst as jest.Mock).mockResolvedValue(CASE_LEVEL_PARENT);
    (prisma.comment.create as jest.Mock).mockResolvedValue(REPLY_RECORD);
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'Válasz', parentCommentId: 'cm-parent' } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'cm-reply', parentId: 'cm-parent', status: 'OPEN' });
    const createArg = (prisma.comment.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data).toMatchObject({ caseId: 'case-1', documentId: null, userId: 'user-1', parentId: 'cm-parent' });
    const parentLookup = (prisma.comment.findFirst as jest.Mock).mock.calls[0][0];
    expect(parentLookup.where).toMatchObject({ id: 'cm-parent' });
  });

  it('rejects a reply whose parent does not exist', async () => {
    (prisma.comment.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'Válasz', parentCommentId: 'nope' } });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COMMENT_PARENT_NOT_FOUND');
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects a cross-case parent without leaking its existence', async () => {
    (prisma.comment.findFirst as jest.Mock).mockResolvedValue({ id: 'cm-parent', caseId: 'other-case', documentId: null, parentId: null });
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'Válasz', parentCommentId: 'cm-parent' } });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COMMENT_PARENT_NOT_FOUND');
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects a document-comment parent (case/document isolation)', async () => {
    (prisma.comment.findFirst as jest.Mock).mockResolvedValue({ id: 'cm-parent', caseId: 'case-1', documentId: 'doc-1', parentId: null });
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'Válasz', parentCommentId: 'cm-parent' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMMENT_PARENT_IS_DOCUMENT_COMMENT');
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects replying to a reply (one visible thread level)', async () => {
    (prisma.comment.findFirst as jest.Mock).mockResolvedValue({ id: 'cm-parent', caseId: 'case-1', documentId: null, parentId: 'cm-grandparent' });
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'Válasz', parentCommentId: 'cm-parent' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMMENT_PARENT_IS_REPLY');
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed parentCommentId', async () => {
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'Válasz', parentCommentId: 42 } });
    expect(res.status).toBe(400);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized reply (cannot access the case)', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({ id: 'case-1', assignedLawyerId: 'other', createdById: 'other' });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(createApp(), 'POST', '/cases/case-1/comments', { body: { content: 'Válasz', parentCommentId: 'cm-parent' } });
    expect(res.status).toBe(403);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('document comments never accept parentCommentId', () => {
    expect(() => validateCommentCreate({ content: 'Komment', parentCommentId: 'cm-1' }))
      .toThrowError(/parentCommentId is not accepted/);
    // The same validation explicitly allows it for the case-note reply flow.
    expect(validateCommentCreate({ content: 'Jegyzet', parentCommentId: 'cm-1' }, { allowParentCommentId: true }))
      .toBe('Jegyzet');
  });
});
