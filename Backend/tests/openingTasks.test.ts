import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'No token provided' });
      return;
    }
    req.user = {
      userId: (req.headers['x-user'] as string) || 'user-1',
      email: 'test@example.com',
      role: ((req.headers['x-role'] as string) || 'LAWYER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/modules/workflow', () => ({
  workflowService: { isValidStatus: jest.fn(() => true), getWorkflowGraph: jest.fn(), getWorkflowHistory: jest.fn() },
}));

const createTaskMock = jest.fn();
jest.mock('../src/modules/tasks/services', () => ({
  createTask: (...args: unknown[]) => createTaskMock(...args),
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: { findUnique: jest.fn(), count: jest.fn() },
    caseCollaborator: { findFirst: jest.fn(), findMany: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
    timelineEvent: { create: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';
import { OPENING_TASK_DEFINITIONS } from '../src/modules/cases/intakeReadiness';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  reqPath: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method,
          headers: {
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

const AUTH = { authorization: 'Bearer test-token' };

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    status: 'CLIENT_INPUT',
    assignedLawyerId: 'user-1',
    createdById: 'creator-1',
    ...overrides,
  };
}

describe('POST /cases/:caseId/opening-tasks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(caseRow());
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.caseCollaborator.findMany as jest.Mock).mockResolvedValue([]);
    createTaskMock.mockImplementation(async (input: any) => ({
      id: `task-${input.type}`,
      title: input.title,
      dueDate: input.dueDate || null,
    }));
  });

  it('requires authentication', async () => {
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', {}, { tasks: [] });
    expect(res.status).toBe(401);
  });

  it('rejects an empty selection — no automatic creation', async () => {
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, { tasks: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_TASKS_SELECTED');
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it('rejects unknown task codes and forbidden payload fields', async () => {
    const unknown = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, {
      tasks: [{ code: 'DO_SOMETHING_ELSE' }],
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('INVALID_OPENING_TASK_CODE');

    const forbidden = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, {
      tasks: [{ code: 'VERIFY_CLIENT_DETAILS' }],
      description: 'sensitive intake narrative',
    });
    expect(forbidden.status).toBe(400);
    expect(forbidden.body.code).toBe('UNSUPPORTED_OPENING_TASK_FIELD');
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it('creates only the explicitly selected tasks with safe backend-owned titles', async () => {
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, {
      tasks: [{ code: 'VERIFY_CLIENT_DETAILS' }, { code: 'COLLECT_INITIAL_DOCUMENTS', dueAt: '2026-07-20T09:00:00.000Z' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(2);
    expect(createTaskMock).toHaveBeenCalledTimes(2);
    const first = createTaskMock.mock.calls[0][0];
    // Backend derives case relation, creator, safe title, and type code.
    expect(first.caseId).toBe('case-1');
    expect(first.assignedBy).toBe('user-1');
    expect(first.type).toBe('INTAKE_OPENING_VERIFY_CLIENT_DETAILS');
    expect(first.title).toBe('Ügyfél alapadatok ellenőrzése');
    expect(first.description).toBeUndefined();
  });

  it('deduplicates against existing open opening tasks (deterministic repeat)', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([{ type: 'INTAKE_OPENING_VERIFY_CLIENT_DETAILS' }]);
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, {
      tasks: [{ code: 'VERIFY_CLIENT_DETAILS' }, { code: 'RECORD_CLIENT_ROLE' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.skippedExisting).toEqual(['VERIFY_CLIENT_DETAILS']);
    expect(res.body.created.map((task: any) => task.code)).toEqual(['RECORD_CLIENT_ROLE']);
    expect(createTaskMock).toHaveBeenCalledTimes(1);
  });

  it('rejects assignees outside the case team', async () => {
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, {
      tasks: [{ code: 'VERIFY_CLIENT_DETAILS', assigneeId: 'outsider-1' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ASSIGNEE_NOT_ON_CASE_TEAM');
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it('accepts assignees from the case team (lawyer, creator, collaborator)', async () => {
    (prisma.caseCollaborator.findMany as jest.Mock).mockResolvedValue([{ userId: 'collab-7' }]);
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, {
      tasks: [{ code: 'VERIFY_CLIENT_DETAILS', assigneeId: 'collab-7' }],
    });
    expect(res.status).toBe(201);
    expect(createTaskMock.mock.calls[0][0].assignedTo).toBe('collab-7');
  });

  it('rejects opening tasks on a terminal case (409)', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(caseRow({ status: 'ARCHIVED' }));
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, {
      tasks: [{ code: 'VERIFY_CLIENT_DETAILS' }],
    });
    expect(res.status).toBe(409);
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it('exposes the backend-owned definitions and no sensitive data in titles', async () => {
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/opening-tasks', AUTH, {
      tasks: [{ code: 'CONFIRM_SCOPE_AND_NEXT_STEP' }],
    });
    expect(res.body.availableCodes).toHaveLength(OPENING_TASK_DEFINITIONS.length);
    for (const definition of res.body.availableCodes) {
      expect(definition.title).not.toMatch(/ügyfélnév|adószám|e-mail/i);
    }
  });
});
