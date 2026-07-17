import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: 'user-1',
      email: 'test@example.com',
      role: 'LAWYER',
      authProvider: 'local-jwt',
    };
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const prismaMock = {
  task: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  case: {
    findUnique: jest.fn(),
  },
  caseCollaborator: {
    findFirst: jest.fn(),
  },
  timelineEvent: {
    create: jest.fn(),
  },
};

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: prismaMock,
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    lawyerHandoffPackage: {},
  },
}));

import tasksRoutes from '../src/modules/tasks/routes';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/tasks', tasksRoutes);
  return app;
}

function requestJson(app: Express, method: string, reqPath: string, body?: unknown, authenticated = true): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const payload = body === undefined ? '' : JSON.stringify(body);
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method,
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
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

function openTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Task',
    caseId: 'case-1',
    status: 'TODO',
    assignedToId: 'user-1',
    assignedById: 'creator-1',
    stuckReason: null,
    stuckSince: null,
    ...overrides,
  };
}

describe('task workflow transition routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'LAWYER' });
    prismaMock.case.findUnique.mockResolvedValue({ assignedLawyerId: 'user-1', createdById: 'creator-1' });
    prismaMock.caseCollaborator.findFirst.mockResolvedValue(null);
    prismaMock.timelineEvent.create.mockResolvedValue({});
  });

  it('rejects unauthenticated transition calls', async () => {
    const app = createApp();
    const response = await requestJson(app, 'POST', '/tasks/task-1/start', {}, false);
    expect(response.status).toBe(401);
  });

  it('does not allow arbitrary status payloads on transitions', async () => {
    const app = createApp();
    const response = await requestJson(app, 'POST', '/tasks/task-1/start', { status: 'DONE' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('STATUS_PAYLOAD_NOT_ALLOWED');
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it('starts an assigned open task through the transition matrix', async () => {
    prismaMock.task.findUnique.mockResolvedValue(openTask());
    prismaMock.task.update.mockResolvedValue({ ...openTask(), status: 'IN_PROGRESS' });

    const app = createApp();
    const response = await requestJson(app, 'POST', '/tasks/task-1/start', {});

    expect(response.status).toBe(200);
    expect(prismaMock.task.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    }));
    expect(prismaMock.timelineEvent.create).toHaveBeenCalled();
  });

  it('returns 409 when a valid action is not allowed by current state', async () => {
    prismaMock.task.findUnique.mockResolvedValue(openTask({ status: 'DONE' }));

    const app = createApp();
    const response = await requestJson(app, 'POST', '/tasks/task-1/start', {});

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVALID_TASK_TRANSITION');
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it('rejects self-review even when the assignee has a lawyer role', async () => {
    prismaMock.task.findUnique.mockResolvedValue(openTask({ status: 'IN_REVIEW' }));

    const app = createApp();
    const response = await requestJson(app, 'POST', '/tasks/task-1/complete', { approved: true });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('TASK_ACTION_FORBIDDEN');
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it('allows the non-assignee task supervisor to approve review work', async () => {
    const reviewTask = openTask({ status: 'IN_REVIEW', assignedToId: 'worker-1', assignedById: 'user-1' });
    prismaMock.task.findUnique.mockResolvedValue(reviewTask);
    prismaMock.task.update.mockResolvedValue({ ...reviewTask, status: 'DONE' });

    const app = createApp();
    const response = await requestJson(app, 'POST', '/tasks/task-1/complete', { approved: true });

    expect(response.status).toBe(200);
    expect(prismaMock.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DONE' }),
    }));
  });

  it('blocks and unblocks only with structured blocker state', async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce(openTask({ status: 'IN_PROGRESS' }));
    prismaMock.task.update.mockResolvedValueOnce({ ...openTask(), status: 'BLOCKED', stuckReason: 'DEPENDENCY' });

    const app = createApp();
    const blocked = await requestJson(app, 'POST', '/tasks/task-1/block', { reason: 'DEPENDENCY' });
    expect(blocked.status).toBe(200);
    expect(prismaMock.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'BLOCKED', stuckReason: 'DEPENDENCY' }),
    }));

    prismaMock.task.findUnique.mockResolvedValueOnce(openTask({ status: 'BLOCKED', stuckReason: 'DEPENDENCY' }));
    prismaMock.task.update.mockResolvedValueOnce({ ...openTask(), status: 'IN_PROGRESS', stuckReason: null });
    const unblocked = await requestJson(app, 'POST', '/tasks/task-1/unblock', {});

    expect(unblocked.status).toBe(200);
    expect(prismaMock.task.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'IN_PROGRESS', stuckReason: null, stuckSince: null }),
    }));
  });

  it('rejects malformed blocker reasons', async () => {
    const app = createApp();
    const response = await requestJson(app, 'POST', '/tasks/task-1/block', { reason: 'free text blocker' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_STUCK_REASON');
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });
});
