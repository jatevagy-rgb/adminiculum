import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  deriveTaskCapabilities,
  deriveUrgency,
  deriveWorkflowCategory,
  validateTaskTransition,
} from '../src/modules/cases/workItems';

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

jest.mock('../src/modules/workflow', () => ({
  workflowService: {
    isValidStatus: jest.fn(() => true),
    getWorkflowGraph: jest.fn(),
    getWorkflowHistory: jest.fn(),
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    caseCollaborator: { findFirst: jest.fn(), findMany: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
    document: { findMany: jest.fn() },
    communication: { findMany: jest.fn() },
    communicationAttachment: { count: jest.fn(), findMany: jest.fn() },
    timelineEvent: { findMany: jest.fn() },
    lawyerHandoffPackage: { findMany: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

function requestJson(app: Express, reqPath: string, authenticated = true): Promise<TestResponse> {
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
          method: 'GET',
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

describe('workflow work item pure functions', () => {
  it('normalizes supported workflow categories without free-text inference', () => {
    expect(deriveWorkflowCategory('TODO')).toBe('OPEN');
    expect(deriveWorkflowCategory('IN_PROGRESS')).toBe('IN_PROGRESS');
    expect(deriveWorkflowCategory('IN_REVIEW')).toBe('REVIEW');
    expect(deriveWorkflowCategory('DONE')).toBe('COMPLETED');
    expect(deriveWorkflowCategory('TODO', 'CLIENT_WAITING')).toBe('BLOCKED');
  });

  it('derives urgency deterministically from due date only', () => {
    const now = new Date('2026-07-13T10:00:00.000Z');
    expect(deriveUrgency('2026-07-12T10:00:00.000Z', now)).toBe('OVERDUE');
    expect(deriveUrgency('2026-07-13T20:00:00.000Z', now)).toBe('TODAY');
    expect(deriveUrgency('2026-07-15T10:00:00.000Z', now)).toBe('SOON');
    expect(deriveUrgency(null, now)).toBe('NONE');
  });

  it('exposes task capabilities only for permitted structured states', () => {
    expect(deriveTaskCapabilities({ status: 'TODO', assignedToId: 'user-1' }, 'user-1').canStart).toBe(true);
    expect(deriveTaskCapabilities({ status: 'IN_PROGRESS', assignedToId: 'user-1' }, 'user-1').canSubmitForReview).toBe(true);
    expect(deriveTaskCapabilities({ status: 'IN_REVIEW', assignedToId: 'user-1' }, 'user-1', 'LAWYER').canApprove).toBe(false);
    expect(deriveTaskCapabilities({ status: 'IN_REVIEW', assignedToId: 'worker-1', assignedById: 'user-1' }, 'user-1', 'LAWYER').canApprove).toBe(true);
    expect(deriveTaskCapabilities({ status: 'DONE', assignedToId: 'user-1' }, 'user-1').canStart).toBe(false);
    expect(deriveTaskCapabilities({ status: 'TODO', assignedToId: 'user-2' }, 'user-1').canStart).toBe(false);
  });

  it('validates supported and forbidden transitions with explicit statuses', () => {
    expect(validateTaskTransition({ status: 'TODO', assignedToId: 'user-1' }, 'START', 'user-1').status).toBe('IN_PROGRESS');
    expect(validateTaskTransition({ status: 'IN_PROGRESS', assignedToId: 'user-1' }, 'SUBMIT_FOR_REVIEW', 'user-1').status).toBe('IN_REVIEW');
    expect(validateTaskTransition({ status: 'IN_REVIEW', assignedToId: 'worker-1', assignedById: 'user-1' }, 'APPROVE', 'user-1', 'LAWYER').status).toBe('DONE');
    expect(() => validateTaskTransition({ status: 'IN_REVIEW', assignedToId: 'user-1' }, 'APPROVE', 'user-1', 'LAWYER')).toThrow('not allowed');
    expect(() => validateTaskTransition({ status: 'DONE', assignedToId: 'user-1' }, 'START', 'user-1')).toThrow('state');
    expect(() => validateTaskTransition({ status: 'TODO', assignedToId: 'user-2' }, 'START', 'user-1')).toThrow('not allowed');
  });
});

describe('GET /cases/:caseId/work-items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator-1' });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.communication.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.communicationAttachment.count as jest.Mock).mockResolvedValue(0);
    (prisma.communicationAttachment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timelineEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.lawyerHandoffPackage.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.ENABLE_HANDOFF_PACKAGES;
  });

  it('requires authentication', async () => {
    const app = createApp();
    const response = await requestJson(app, '/cases/case-1/work-items', false);
    expect(response.status).toBe(401);
  });

  it('returns safe normalized work items and backend-derived capabilities', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'task-1',
        title: 'Review contract',
        description: 'Safe short task description',
        status: 'TODO',
        priority: 'HIGH',
        dueDate: new Date('2026-07-12T10:00:00.000Z'),
        completedAt: null,
        submittedAt: null,
        updatedAt: new Date('2026-07-11T10:00:00.000Z'),
        caseId: 'case-1',
        assignedToId: 'user-1',
        assignedById: 'creator-1',
        documentId: 'doc-1',
        sourceCommunicationId: null,
        stuckReason: null,
        stuckSince: null,
        assignedTo: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        assignedBy: { id: 'creator-1', name: 'Creator', email: 'creator@example.com' },
      },
    ]);

    const app = createApp();
    const response = await requestJson(app, '/cases/case-1/work-items');

    expect(response.status).toBe(200);
    expect(response.body.summary.open).toBe(1);
    expect(response.body.summary.mine).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      id: 'task-1',
      type: 'TASK',
      workflowCategory: 'OPEN',
      urgency: 'OVERDUE',
      isMine: true,
      capabilities: expect.objectContaining({ canStart: true, canSubmitForReview: false }),
    });
    expect(JSON.stringify(response.body)).not.toContain('workspaceText');
    expect(JSON.stringify(response.body)).not.toContain('contentPreview');
  });

  it('includes safe document and communication workbench entries without raw bodies', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'doc-1',
        name: 'Agreement',
        fileName: 'agreement.docx',
        documentType: 'CONTRACT',
        category: 'CONTRACT',
        createdAt: new Date('2026-07-10T10:00:00.000Z'),
        updatedAt: new Date('2026-07-12T10:00:00.000Z'),
      },
    ]);
    (prisma.communication.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'comm-1',
        subject: 'Client email',
        summary: 'Safe summarized communication metadata',
        type: 'EMAIL',
        documentId: null,
        createdAt: new Date('2026-07-11T10:00:00.000Z'),
        updatedAt: new Date('2026-07-11T10:00:00.000Z'),
      },
    ]);

    const response = await requestJson(createApp(), '/cases/case-1/work-items');

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'document-doc-1', type: 'DOCUMENT', title: 'agreement.docx' }),
      expect.objectContaining({ id: 'communication-comm-1', type: 'COMMUNICATION', title: 'Client email' }),
    ]));
    expect(JSON.stringify(response.body)).not.toContain('workspaceText');
    expect(JSON.stringify(response.body)).not.toContain('Raw message body');
  });

  it('uses bounded explicit selects and no broad includes', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const app = createApp();
    await requestJson(app, '/cases/case-1/work-items');

    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 80,
      select: expect.objectContaining({
        title: true,
        description: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      }),
    }));
    expect((prisma.task.findMany as jest.Mock).mock.calls[0][0]).not.toHaveProperty('include');
  });

  it('static guard prevents sensitive workflow DTO patterns', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/modules/cases/workItems.ts'), 'utf8');
    expect(source).not.toContain('workspaceText');
    expect(source).not.toContain('rawText');
    expect(source).not.toContain('extractedText');
    expect(source).not.toContain('content: true');
    expect(source).not.toContain('body: true');
    expect(source).not.toMatch(/include\s*:/);
    expect(source).not.toMatch(/client-portal/i);
    expect(source).not.toMatch(/\.\.\.task[,}]/);
  });
});

describe('GET /cases/:caseId/activity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({ id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator-1' });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'task-1',
        title: 'Structured task',
        description: 'Safe task description',
        status: 'TODO',
        taskType: 'OTHER',
        dueDate: null,
        createdAt: new Date('2026-07-10T10:00:00.000Z'),
        updatedAt: new Date('2026-07-10T11:00:00.000Z'),
        documentId: null,
        sourceCommunicationId: null,
      },
    ]);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'doc-1',
        name: 'Agreement',
        fileName: 'agreement.docx',
        documentType: 'CONTRACT',
        category: 'CONTRACT',
        createdAt: new Date('2026-07-11T10:00:00.000Z'),
        updatedAt: new Date('2026-07-11T11:00:00.000Z'),
      },
    ]);
    (prisma.communication.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'comm-1',
        subject: 'Client email',
        summary: 'Safe summary only',
        type: 'EMAIL',
        documentId: null,
        createdAt: new Date('2026-07-12T10:00:00.000Z'),
        updatedAt: new Date('2026-07-12T10:00:00.000Z'),
      },
    ]);
    (prisma.timelineEvent.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'timeline-1',
        eventType: 'DOCUMENT_UPLOADED',
        type: 'DOCUMENT_UPLOADED',
        description: 'Document metadata event',
        createdAt: new Date('2026-07-09T10:00:00.000Z'),
        documentId: 'doc-1',
        communicationId: null,
        taskId: null,
      },
    ]);
    (prisma.communicationAttachment.findMany as jest.Mock).mockResolvedValue([{ communicationId: 'comm-1' }]);
  });

  it('requires authentication', async () => {
    const response = await requestJson(createApp(), '/cases/case-1/activity', false);
    expect(response.status).toBe(401);
  });

  it('returns unified safe activity with explicit privacy flags', async () => {
    const response = await requestJson(createApp(), '/cases/case-1/activity?limit=500');

    expect(response.status).toBe(200);
    expect(response.body.pagination.limit).toBe(50);
    expect(response.body.privacy).toEqual({
      rawDocumentTextIncluded: false,
      rawCommunicationBodyIncluded: false,
      attachmentBytesIncluded: false,
    });
    expect(response.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'DOCUMENT', documentId: 'doc-1' }),
      expect.objectContaining({ kind: 'COMMUNICATION', communicationId: 'comm-1', meta: expect.objectContaining({ attachmentCount: 1 }) }),
      expect.objectContaining({ kind: 'TASK', taskId: 'task-1' }),
    ]));
    expect(JSON.stringify(response.body)).not.toContain('workspaceText');
    expect(JSON.stringify(response.body)).not.toContain('contentPreview');
    expect(JSON.stringify(response.body)).not.toContain('spWebUrl');
  });

  it('supports a safe type filter and avoids broad relation includes', async () => {
    const response = await requestJson(createApp(), '/cases/case-1/activity?type=document');

    expect(response.status).toBe(200);
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ id: true, fileName: true, documentType: true }),
      take: 50,
    }));
    expect((prisma.document.findMany as jest.Mock).mock.calls[0][0]).not.toHaveProperty('include');
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.communication.findMany).not.toHaveBeenCalled();
    expect(prisma.timelineEvent.findMany).not.toHaveBeenCalled();
  });
});
