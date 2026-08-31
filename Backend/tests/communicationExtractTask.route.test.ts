import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const mockPrisma = {
  communication: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
};

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authentication required.' });
      return;
    }
    (req as any).user = { userId: 'user-1', role: 'LAWYER' };
    next();
  },
}));

jest.mock('../src/middleware/workforceAuthorization', () => ({
  requireWorkforceUser: (_req: Request, _res: Response, next: NextFunction) => next(),
  isWorkforceRole: () => true,
}));

jest.mock('../src/middleware/featureAvailability', () => ({
  isDatabaseFoundationEnabled: () => true,
  requireDatabaseFoundation: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockPrisma }));
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockPrisma }));
jest.mock('../src/modules/tasks/services', () => {
  class MockSourceLinkedTaskError extends Error {
    constructor(
      public readonly statusCode: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'SourceLinkedTaskError';
    }
  }
  return {
    __esModule: true,
    canUserActOnTask: jest.fn(),
    createTaskFromCommunicationSource: jest.fn(),
    SourceLinkedTaskError: MockSourceLinkedTaskError,
  };
});

import communicationsRoutes from '../src/modules/communications/routes';
import { createTaskFromCommunicationSource, SourceLinkedTaskError } from '../src/modules/tasks/services';

type TestResponse = { status: number; body: any };

function requestJson(app: Express, body: unknown = {}, authenticated = true): Promise<TestResponse> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Test server address unavailable'));
      const request = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path: '/communications/comm-1/extract-task',
        method: 'POST',
        headers: {
          ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
        });
      });
      request.on('error', (error) => { server.close(); reject(error); });
      request.write(payload);
      request.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/communications', communicationsRoutes);
  return app;
}

describe('POST /communications/:id/extract-task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'case-1', createdById: 'other-user' });
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'other-user' });
    mockPrisma.caseCollaborator.findFirst.mockResolvedValue(null);
  });

  it('delegates and returns the canonical source-linked task response', async () => {
    (createTaskFromCommunicationSource as jest.Mock).mockResolvedValue({
      success: true,
      task: { id: 'task-1', caseId: 'case-1', sourceCommunicationId: 'comm-1', status: 'TODO' },
      source: { type: 'COMMUNICATION', id: 'comm-1', caseId: 'case-1' },
    });

    const response = await requestJson(createApp(), { title: 'Follow up', dueDate: '2026-09-01T00:00:00.000Z', caseId: 'case-2' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, task: { caseId: 'case-1', sourceCommunicationId: 'comm-1' } });
    expect(createTaskFromCommunicationSource).toHaveBeenCalledWith('comm-1', 'user-1', {
      title: 'Follow up',
      kind: 'FOLLOW_UP',
      dueAt: '2026-09-01T00:00:00.000Z',
      assigneeId: undefined,
    });
    expect(JSON.stringify((createTaskFromCommunicationSource as jest.Mock).mock.calls[0][2])).not.toContain('case-2');
  });

  it('returns the canonical safe error for an unlinked communication', async () => {
    (createTaskFromCommunicationSource as jest.Mock).mockRejectedValue(new SourceLinkedTaskError(409, 'COMMUNICATION_NOT_LINKED_TO_CASE', 'Communication must be linked to a case before creating a task.'));
    const response = await requestJson(createApp());
    expect(response.status).toBe(409);
    expect(response.body).toEqual(expect.objectContaining({ code: 'COMMUNICATION_NOT_LINKED_TO_CASE' }));
    expect(response.body).not.toHaveProperty('stack');
  });

  it('blocks an unauthorized actor before task creation', async () => {
    mockPrisma.case.findUnique.mockResolvedValue(null);
    const response = await requestJson(createApp());
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('COMMUNICATION_ACCESS_FORBIDDEN');
    expect(createTaskFromCommunicationSource).not.toHaveBeenCalled();
  });

  it('preserves authentication and canonical service failures as safe responses', async () => {
    const unauthenticated = await requestJson(createApp(), {}, false);
    expect(unauthenticated.status).toBe(401);

    (createTaskFromCommunicationSource as jest.Mock).mockRejectedValue(new SourceLinkedTaskError(403, 'CASE_ACCESS_FORBIDDEN', 'You do not have access to this case.'));
    const denied = await requestJson(createApp());
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
  });
});
