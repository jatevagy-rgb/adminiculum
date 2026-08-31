import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const mockPrisma = {
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  document: { findUnique: jest.fn() },
  communication: { findUnique: jest.fn() },
  task: { create: jest.fn(), findUnique: jest.fn() },
  timelineEvent: { create: jest.fn() },
};

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
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: mockPrisma,
}));

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import documentsRoutes from '../src/modules/documents/routes';
import communicationsRoutes from '../src/modules/communications/routes';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/documents', documentsRoutes);
  app.use('/communications', communicationsRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  reqPath: string,
  body?: unknown,
  authenticated = true,
): Promise<TestResponse> {
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
          path: reqPath,
          method,
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            'content-type': 'application/json',
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
        },
      );
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (body !== undefined) request.write(JSON.stringify(body));
      request.end();
    });
  });
}

describe('source-linked task creation', () => {
  let lastTaskData: any;

  beforeEach(() => {
    jest.clearAllMocks();
    lastTaskData = {};
    process.env.ENABLE_COMMUNICATIONS_PERSISTENCE = 'true';
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator-1' });
    mockPrisma.caseCollaborator.findFirst.mockResolvedValue(null);
    mockPrisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      caseId: 'case-1',
      name: 'Agreement',
      fileName: 'agreement.docx',
      documentType: 'CONTRACT',
    });
    mockPrisma.communication.findUnique.mockResolvedValue({
      id: 'comm-1',
      caseId: 'case-1',
      subject: 'Client email',
    });
    mockPrisma.task.create.mockImplementation(async ({ data }: any) => {
      lastTaskData = data;
      return {
      id: 'task-1',
      title: data.title,
      status: data.status,
      caseId: data.caseId,
      documentId: data.documentId || null,
      sourceCommunicationId: data.sourceCommunicationId || null,
      dueDate: data.dueDate || null,
      };
    });
    mockPrisma.task.findUnique.mockImplementation(async () => ({
      id: 'task-1',
      title: lastTaskData.title || 'Source task',
      description: null,
      taskType: 'REVIEW_CONTRACT',
      type: 'REVIEW_CONTRACT',
      status: 'TODO',
      priority: 'MEDIUM',
      assignedToId: lastTaskData.assignedToId || lastTaskData.assignedTo || 'user-1',
      assignedById: lastTaskData.assignedById || lastTaskData.assignedBy || 'user-1',
      attentionCategory: null,
      estimatedMinutes: null,
      documentId: lastTaskData.documentId || null,
      sourceCommunicationId: lastTaskData.sourceCommunicationId || null,
      caseId: 'case-1',
      requiredSkills: lastTaskData.requiredSkills || [],
      dueDate: lastTaskData.dueDate || null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      submittedAt: null,
      stuckReason: null,
      stuckReasonDetails: null,
      externalActionRequired: false,
      externalActionNote: null,
      externalCompletedAt: null,
      assignedTo: { id: 'user-1', name: 'Test User', role: 'LAWYER' },
      case: { id: 'case-1', title: 'Matter', client: { colorKey: null } },
      _count: { documents: 0 },
      timeEntries: [],
      submissions: [],
    }));
    mockPrisma.timelineEvent.create.mockResolvedValue({ id: 'timeline-1' });
  });

  afterEach(() => {
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
  });

  it('rejects unauthenticated document source-task creation before DB writes', async () => {
    const response = await requestJson(createApp(), 'POST', '/documents/doc-1/tasks', { kind: 'REVIEW' }, false);
    expect(response.status).toBe(401);
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it('creates a document source-linked task from metadata only', async () => {
    const response = await requestJson(createApp(), 'POST', '/documents/doc-1/tasks', { kind: 'REVIEW' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      task: { id: 'task-1', caseId: 'case-1', documentId: 'doc-1', status: 'TODO' },
      source: { type: 'DOCUMENT', id: 'doc-1', caseId: 'case-1' },
    });
    expect(mockPrisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        caseId: 'case-1',
        documentId: 'doc-1',
        assignedById: 'user-1',
        status: 'TODO',
      }),
    }));
    expect(JSON.stringify(mockPrisma.task.create.mock.calls[0][0])).not.toContain('workspaceText');
  });

  it('rejects arbitrary task status and case assignment payloads', async () => {
    const response = await requestJson(createApp(), 'POST', '/documents/doc-1/tasks', {
      kind: 'REVIEW',
      status: 'DONE',
      caseId: 'case-2',
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNSUPPORTED_TASK_PAYLOAD_FIELD');
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it('requires communications persistence and auth before communication source-task creation', async () => {
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/tasks', { kind: 'FOLLOW_UP' });

    expect(response.status).toBe(501);
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it('creates a communication source-linked task without copying message body', async () => {
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/tasks', { kind: 'FOLLOW_UP' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      task: { id: 'task-1', caseId: 'case-1', sourceCommunicationId: 'comm-1', status: 'TODO' },
      source: { type: 'COMMUNICATION', id: 'comm-1', caseId: 'case-1' },
    });
    expect(mockPrisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        caseId: 'case-1',
        sourceCommunicationId: 'comm-1',
        assignedById: 'user-1',
        status: 'TODO',
      }),
    }));
    expect(JSON.stringify(mockPrisma.task.create.mock.calls[0][0])).not.toContain('content');
    expect(JSON.stringify(mockPrisma.task.create.mock.calls[0][0])).not.toContain('summary');
  });

  it('blocks communication task creation until the communication is linked to a case', async () => {
    mockPrisma.communication.findUnique.mockResolvedValueOnce({ id: 'comm-1', caseId: null, subject: 'Unlinked' });
    const response = await requestJson(createApp(), 'POST', '/communications/comm-1/tasks', { kind: 'FOLLOW_UP' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COMMUNICATION_NOT_LINKED_TO_CASE');
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });
});
