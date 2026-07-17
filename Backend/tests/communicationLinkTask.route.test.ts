import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    (req as any).user = { userId: 'user-1', email: 'test@example.com', role: 'LAWYER' };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    communication: { findUnique: jest.fn() },
    task: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../src/modules/tasks/services', () => {
  class MockSourceLinkedTaskError extends Error {
    constructor(
      public readonly statusCode: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }

  return {
    __esModule: true,
    default: {},
    canUserActOnTask: jest.fn(),
    createTaskFromCommunicationSource: jest.fn(),
    SourceLinkedTaskError: MockSourceLinkedTaskError,
  };
});

import { prisma } from '../src/prisma/prisma.service';
import communicationsRoutes from '../src/modules/communications/routes';
import { canUserActOnTask } from '../src/modules/tasks/services';

type TestResponse = { status: number; body: any };

function requestJson(app: Express, path: string, options: { authenticated?: boolean; body?: unknown } = {}): Promise<TestResponse> {
  const payload = JSON.stringify(options.body ?? {});
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method: 'POST',
        headers: {
          ...(options.authenticated === false ? {} : { authorization: 'Bearer test-token' }),
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
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      request.write(payload);
      request.end();
    });
  });
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/communications', communicationsRoutes);
  return app;
}

describe('POST /communications/:id/link-task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canUserActOnTask as jest.Mock).mockResolvedValue({ allowed: true, role: 'LAWYER' });
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
  });

  it('keeps the route gated and rejects unauthenticated access', async () => {
    const gated = await requestJson(createApp(), '/communications/comm-1/link-task', { body: { taskId: 'task-1' } });
    expect(gated.status).toBe(501);
    expect((prisma as any).task.update).not.toHaveBeenCalled();

    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    const unauthenticated = await requestJson(createApp(), '/communications/comm-1/link-task', { authenticated: false, body: { taskId: 'task-1' } });
    expect(unauthenticated.status).toBe(401);
    expect((prisma as any).task.update).not.toHaveBeenCalled();
  });

  it('validates taskId before database reads', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    const response = await requestJson(createApp(), '/communications/comm-1/link-task');
    expect(response.status).toBe(400);
    expect((prisma as any).communication.findUnique).not.toHaveBeenCalled();
  });

  it('rejects missing records and cross-case linkage', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValueOnce(null);
    const missingCommunication = await requestJson(createApp(), '/communications/missing/link-task', { body: { taskId: 'task-1' } });
    expect(missingCommunication.status).toBe(404);

    (prisma as any).communication.findUnique.mockResolvedValueOnce({ id: 'comm-1', caseId: 'case-1' });
    (prisma as any).task.findUnique.mockResolvedValueOnce(null);
    const missingTask = await requestJson(createApp(), '/communications/comm-1/link-task', { body: { taskId: 'missing' } });
    expect(missingTask.status).toBe(404);

    (prisma as any).communication.findUnique.mockResolvedValueOnce({ id: 'comm-1', caseId: 'case-1' });
    (prisma as any).task.findUnique.mockResolvedValueOnce({ id: 'task-1', title: 'Task', caseId: 'case-2', status: 'TODO', sourceCommunicationId: null });
    const mismatch = await requestJson(createApp(), '/communications/comm-1/link-task', { body: { taskId: 'task-1' } });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.code).toBe('TASK_CASE_MISMATCH');
    expect((prisma as any).task.update).not.toHaveBeenCalled();
  });

  it('is idempotent and never overwrites another communication link', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'case-1' });
    (prisma as any).task.findUnique.mockResolvedValueOnce({ id: 'task-1', title: 'Task', caseId: 'case-1', status: 'TODO', sourceCommunicationId: 'comm-2' });
    const conflict = await requestJson(createApp(), '/communications/comm-1/link-task', { body: { taskId: 'task-1' } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('TASK_ALREADY_LINKED');

    (prisma as any).task.findUnique.mockResolvedValueOnce({ id: 'task-1', title: 'Task', caseId: 'case-1', status: 'TODO', sourceCommunicationId: 'comm-1' });
    const idempotent = await requestJson(createApp(), '/communications/comm-1/link-task', { body: { taskId: 'task-1' } });
    expect(idempotent.status).toBe(200);
    expect(idempotent.body).toMatchObject({ success: true, linked: false });
    expect((prisma as any).task.update).not.toHaveBeenCalled();
  });

  it('rejects task linkage when the authenticated user cannot act on the task', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'case-1' });
    (prisma as any).task.findUnique.mockResolvedValue({
      id: 'task-1',
      title: 'Task',
      caseId: 'case-1',
      status: 'TODO',
      sourceCommunicationId: null,
      assignedToId: 'user-2',
      assignedById: 'user-3',
    });
    (canUserActOnTask as jest.Mock).mockResolvedValueOnce({ allowed: false, role: 'LAWYER' });

    const response = await requestJson(createApp(), '/communications/comm-1/link-task', { body: { taskId: 'task-1' } });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('TASK_LINK_FORBIDDEN');
    expect((prisma as any).task.update).not.toHaveBeenCalled();
  });

  it('links a same-case task to the communication', async () => {
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    (prisma as any).communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'case-1' });
    (prisma as any).task.findUnique.mockResolvedValue({ id: 'task-1', title: 'Task', caseId: 'case-1', status: 'IN_PROGRESS', sourceCommunicationId: null });
    (prisma as any).task.update.mockResolvedValue({ id: 'task-1', title: 'Task', caseId: 'case-1', status: 'IN_PROGRESS', sourceCommunicationId: 'comm-1' });

    const response = await requestJson(createApp(), '/communications/comm-1/link-task', { body: { taskId: 'task-1' } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, linked: true, task: { id: 'task-1', sourceCommunicationId: 'comm-1' } });
    expect((prisma as any).task.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-1' },
      data: { sourceCommunicationId: 'comm-1' },
    }));
  });
});
