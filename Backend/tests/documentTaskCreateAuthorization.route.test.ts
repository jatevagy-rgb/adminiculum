/**
 * SEC-0A — POST /api/v1/documents/:id/tasks authority.
 *
 * Document READ access must not elevate into Task creation. The route now uses
 * the canonical CASE_MANAGE gate (requireDocumentManageAccess -> userCanManageCase),
 * so a collaborator-only reader is denied before any Task side effect.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';

const manageCaseMock = jest.fn();
const readCaseMock = jest.fn();
const createTaskFromDocumentSourceMock = jest.fn();

jest.mock('../src/middleware/auth', () => ({
  ROLES: { ADMIN: 'ADMIN', PARTNER: 'PARTNER', LAWYER: 'LAWYER', COLLAB_LAWYER: 'COLLAB_LAWYER', TRAINEE: 'TRAINEE', LEGAL_ASSISTANT: 'LEGAL_ASSISTANT' },
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') { res.status(401).json({ error: 'Authentication required' }); return; }
    (req as any).user = { userId: String(req.headers['x-actor-id'] || 'actor'), email: 'actor@test.invalid', role: String(req.headers['x-actor-role'] || 'LAWYER') as any, authProvider: 'local-jwt' };
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/modules/cases/authorization', () => ({
  userCanManageCase: (...args: unknown[]) => manageCaseMock(...args),
  userCanReadCase: (...args: unknown[]) => readCaseMock(...args),
  getCaseReadScope: () => null,
  buildCaseReadScope: () => null,
  requireCaseReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireCaseManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireCaseCollaboratorManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: { document: { findUnique: jest.fn() }, case: { findUnique: jest.fn() }, caseCollaborator: { findFirst: jest.fn() } },
}));

jest.mock('../src/modules/tasks/services', () => {
  class MockSourceLinkedTaskError extends Error {
    constructor(public readonly statusCode: number, public readonly code: string, message: string) {
      super(message);
      this.name = 'SourceLinkedTaskError';
    }
  }
  return {
    __esModule: true,
    createTaskFromDocumentSource: (...args: unknown[]) => createTaskFromDocumentSourceMock(...args),
    SourceLinkedTaskError: MockSourceLinkedTaskError,
  };
});

import { prisma } from '../src/prisma/prisma.service';
import documentsRoutes from '../src/modules/documents/routes';

const documentFindUniqueMock = prisma.document.findUnique as jest.Mock;

function app(): Express { const result = express(); result.use(express.json()); result.use('/documents', documentsRoutes); return result; }

function request(body: Record<string, unknown>, actorId = 'actor', role = 'LAWYER', authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app().listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Test server unavailable')); return; }
      const payload = JSON.stringify(body);
      const call = http.request({ hostname: '127.0.0.1', port: address.port, method: 'POST', path: '/documents/doc-1/tasks', headers: {
        ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
        'x-actor-id': actorId, 'x-actor-role': role,
        'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
      } }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => { server.close(); const text = Buffer.concat(chunks).toString('utf8'); resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null }); });
      });
      call.on('error', (error) => { server.close(); reject(error); });
      call.end(payload);
    });
  });
}

describe('POST /api/v1/documents/:id/tasks CASE_MANAGE boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    documentFindUniqueMock.mockResolvedValue({ caseId: 'case-1', securityClassification: 'STANDARD' });
    readCaseMock.mockResolvedValue(true);
    manageCaseMock.mockResolvedValue(true);
    createTaskFromDocumentSourceMock.mockResolvedValue({ success: true, task: { id: 'task-1', caseId: 'case-1', documentId: 'doc-1', status: 'TODO' }, source: { type: 'DOCUMENT', id: 'doc-1', caseId: 'case-1' } });
  });

  it('rejects unauthenticated before any document lookup', async () => {
    expect((await request({ kind: 'REVIEW' }, 'actor', 'LAWYER', false)).status).toBe(401);
    expect(createTaskFromDocumentSourceMock).not.toHaveBeenCalled();
  });

  it('rejects a non-workforce identity', async () => {
    const result = await request({ kind: 'REVIEW' }, 'portal-actor', 'CUSTOMER');
    expect(result.status).toBe(403);
    expect(createTaskFromDocumentSourceMock).not.toHaveBeenCalled();
  });

  it('DENIES a collaborator-only reader (read allowed, manage denied) with zero side effects', async () => {
    readCaseMock.mockResolvedValue(true);
    manageCaseMock.mockResolvedValue(false);
    const result = await request({ kind: 'REVIEW' }, 'collab-1', 'COLLAB_LAWYER');
    expect(result).toMatchObject({ status: 403, body: { code: 'DOCUMENT_ACCESS_FORBIDDEN' } });
    expect(createTaskFromDocumentSourceMock).not.toHaveBeenCalled();
  });

  it('DENIES an unrelated workforce actor with zero side effects', async () => {
    readCaseMock.mockResolvedValue(false);
    manageCaseMock.mockResolvedValue(false);
    const result = await request({ kind: 'REVIEW' }, 'outsider', 'LAWYER');
    expect(result.status).toBe(403);
    expect(createTaskFromDocumentSourceMock).not.toHaveBeenCalled();
  });

  it('preserves manager (CASE_MANAGE) task creation', async () => {
    manageCaseMock.mockResolvedValue(true);
    const result = await request({ kind: 'REVIEW' }, 'assigned-lawyer', 'LAWYER');
    expect(result.status).toBe(201);
    expect(createTaskFromDocumentSourceMock).toHaveBeenCalledWith('doc-1', 'assigned-lawyer', { kind: 'REVIEW' });
  });
});
