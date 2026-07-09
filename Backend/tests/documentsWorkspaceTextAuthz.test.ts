import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { Prisma } from '@prisma/client';

// Synthetic placeholder — never real legal content, never logged.
const SYNTHETIC = 'SYNTHETIC_WORKSPACE_TEXT_DO_NOT_LOG';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    (req as any).user = {
      userId: String(req.headers['x-test-user-id'] || 'user-1'),
      email: 'test@example.com',
      role: String(req.headers['x-test-role'] || 'LAWYER'),
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => {
  const mock: any = {
    document: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    case: { findUnique: jest.fn() },
    caseCollaborator: { findFirst: jest.fn() },
    timelineEvent: { create: jest.fn() },
  };
  return { prisma: mock };
});

import { prisma } from '../src/prisma/prisma.service';
import documentsRoutes from '../src/modules/documents/routes';

type TestResponse = { status: number; body: any };

function requestJson(
  app: Express,
  method: string,
  path: string,
  options: { authenticated?: boolean; body?: unknown; headers?: Record<string, string> } = {}
): Promise<TestResponse> {
  const { authenticated = true, body, headers = {} } = options;
  const payload = body === undefined ? undefined : JSON.stringify(body);
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
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            'content-type': 'application/json',
            ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
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
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (payload) request.write(payload);
      request.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/documents', documentsRoutes);
  return app;
}

function enableGate(): void {
  process.env.ENABLE_DOCUMENT_PROCESSING = 'true';
  process.env.ENABLE_DOCUMENT_AI_PRIVACY_MODEL = 'true';
}

const workingCopyDoc = {
  id: 'doc-1',
  caseId: 'case-1',
  clientId: 'client-1',
  name: 'Working copy',
  category: 'INTERNAL_MEMO',
  documentType: 'MODIFIED_WORKING_COPY',
  spItemId: null,
  workspaceText: SYNTHETIC,
  updatedAt: new Date('2026-07-02T10:00:00.000Z'),
};

function bodyHasNoRawText(res: TestResponse): void {
  const s = JSON.stringify(res.body || {});
  expect(s).not.toContain(SYNTHETIC);
}

describe('documents.workspaceText authorization hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_DOCUMENT_PROCESSING;
    delete process.env.ENABLE_DOCUMENT_AI_PRIVACY_MODEL;
    (prisma as any).document.findUnique.mockResolvedValue(workingCopyDoc);
    (prisma as any).document.create.mockResolvedValue({
      id: 'doc-new', name: 'copy', description: 'd', caseId: 'case-1', clientId: 'client-1',
      fileName: 'copy', documentType: 'MODIFIED_WORKING_COPY', category: 'INTERNAL_MEMO',
      createdAt: new Date(), updatedAt: new Date(),
    });
    (prisma as any).timelineEvent.create.mockResolvedValue({ id: 'tl-1' });
    (prisma as any).caseCollaborator.findFirst.mockResolvedValue(null);
  });

  afterAll(() => {
    delete process.env.ENABLE_DOCUMENT_PROCESSING;
    delete process.env.ENABLE_DOCUMENT_AI_PRIVACY_MODEL;
  });

  // ── read: GET /documents/:id/text ────────────────────────────────────────
  it('1. unauthenticated raw-text read is rejected (401), no raw text', async () => {
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/text', { authenticated: false });
    expect(res.status).toBe(401);
    bodyHasNoRawText(res);
  });

  it('2. disabled Document/AI gate blocks raw-text read (501) before authz/service', async () => {
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/text');
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE', feature: 'DOCUMENT_AI', reason: 'DOCUMENT_AI_NOT_ENABLED' });
    bodyHasNoRawText(res);
  });

  it('3. authenticated wrong-case user cannot read raw text (403), no raw text', async () => {
    enableGate();
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'other-user', createdById: 'other-user' });
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/text');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'DOCUMENT_ACCESS_FORBIDDEN' });
    bodyHasNoRawText(res);
  });

  it('4. authorized case owner reads raw text only via explicit /text route', async () => {
    enableGate();
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator' });
    const res = await requestJson(createApp(), 'GET', '/documents/doc-1/text');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ documentId: 'doc-1', source: 'MODIFIED_WORKING_COPY', text: SYNTHETIC });
  });

  it('5. read of a missing document returns 404 (non-enumerating)', async () => {
    enableGate();
    (prisma as any).document.findUnique.mockResolvedValue(null);
    const res = await requestJson(createApp(), 'GET', '/documents/missing/text');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    bodyHasNoRawText(res);
  });

  // ── broad list must omit workspaceText ───────────────────────────────────
  it('6. broad case document list omits workspaceText', async () => {
    (prisma as any).document.findMany.mockResolvedValue([
      { id: 'doc-1', caseId: 'case-1', fileName: 'f.pdf', documentType: 'MODIFIED_WORKING_COPY', version: '1', folder: 'DRAFTS', spPath: null, workspaceText: SYNTHETIC, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const res = await requestJson(createApp(), 'GET', '/documents/case/case-1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).not.toHaveProperty('workspaceText');
    bodyHasNoRawText(res);
  });

  // ── write: POST /documents/:id/save-workspace-version ────────────────────
  it('7. unauthenticated workspace-text write is rejected (401), no create', async () => {
    const res = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', { authenticated: false, body: { text: SYNTHETIC } });
    expect(res.status).toBe(401);
    expect((prisma as any).document.create).not.toHaveBeenCalled();
  });

  it('8. disabled gate blocks workspace-text write (501), no create', async () => {
    const res = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', { body: { text: SYNTHETIC } });
    expect(res.status).toBe(501);
    expect((prisma as any).document.create).not.toHaveBeenCalled();
  });

  it('9. authenticated non-manage user cannot persist workspace text (403), no create', async () => {
    enableGate();
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'other-user', createdById: 'other-user' });
    const res = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', { body: { text: SYNTHETIC } });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'DOCUMENT_ACCESS_FORBIDDEN' });
    expect((prisma as any).document.create).not.toHaveBeenCalled();
  });

  it('10. case manager may persist workspace text; response omits raw text', async () => {
    enableGate();
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator' });
    const res = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', { body: { text: SYNTHETIC } });
    expect(res.status).toBe(201);
    expect((prisma as any).document.create).toHaveBeenCalledTimes(1);
    bodyHasNoRawText(res);
  });

  it('11. privileged collaborator (non-manager) can read but cannot write', async () => {
    enableGate();
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'other', createdById: 'other' });
    (prisma as any).caseCollaborator.findFirst.mockResolvedValue({ id: 'collab-1' });

    const readRes = await requestJson(createApp(), 'GET', '/documents/doc-1/text');
    expect(readRes.status).toBe(200);
    expect(readRes.body).toMatchObject({ text: SYNTHETIC });

    const writeRes = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', { body: { text: SYNTHETIC } });
    expect(writeRes.status).toBe(403);
    expect((prisma as any).document.create).not.toHaveBeenCalled();
  });

  // ── logging guard: no raw text in error responses or logs ────────────────
  it('12. write failure returns content-free 500 and does not leak raw text (response or logs)', async () => {
    enableGate();
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator' });
    (prisma as any).document.create.mockRejectedValue(new Error('insert failed for value ' + SYNTHETIC));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', { body: { text: SYNTHETIC } });
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR' });
      bodyHasNoRawText(res);
      const logged = errSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n');
      expect(logged).not.toContain(SYNTHETIC);
      // content-free metadata is still logged
      expect(logged).toContain('workspace_text_update');
    } finally {
      errSpy.mockRestore();
    }
  });

  it('13. write failure with a Prisma error logs code only (no message/params, no raw text)', async () => {
    enableGate();
    (prisma as any).case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator' });
    const prismaErr = new Prisma.PrismaClientKnownRequestError(
      'constraint failed on ' + SYNTHETIC,
      { code: 'P2002', clientVersion: 'test' } as any
    );
    (prisma as any).document.create.mockRejectedValue(prismaErr);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', { body: { text: SYNTHETIC } });
      expect(res.status).toBe(500);
      bodyHasNoRawText(res);
      const logged = errSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n');
      expect(logged).not.toContain(SYNTHETIC);
      expect(logged).toContain('P2002');
    } finally {
      errSpy.mockRestore();
    }
  });
});
