import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  selectNextWorkflowAction,
  WorkflowActionCandidate,
} from '../src/modules/cases/workflowSummary';

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
    communicationAttachment: { count: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = { status: number; body: any };

const now = new Date('2026-07-12T10:00:00.000Z');

function candidate(overrides: Partial<WorkflowActionCandidate>): WorkflowActionCandidate {
  return {
    kind: 'OPEN_TASK',
    title: 'Alap feladat',
    explanation: 'Nyitott feladat vár feldolgozásra.',
    dueAt: null,
    sourceType: 'TASK',
    sourceId: 'task-base',
    href: '/tasks?taskId=task-base',
    scope: 'CASE',
    assignedToCurrentUser: false,
    createdAt: '2026-07-10T10:00:00.000Z',
    priority: 'MEDIUM',
    ...overrides,
  };
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

function requestJson(app: Express, method: string, reqPath: string, authenticated = true): Promise<TestResponse> {
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

function caseAccessRecord() {
  return { id: 'case-1', assignedLawyerId: 'user-1', createdById: 'creator-1' };
}

function workflowCaseRecord() {
  return {
    id: 'case-1',
    caseNumber: 'CASE-2026-001',
    title: 'Teszt ügy',
    clientName: 'Teszt Kft.',
    matterType: 'LITIGATION',
    status: 'IN_REVIEW',
    clientRole: 'MEGBÍZÓ',
    deadline: new Date('2026-07-15T09:00:00.000Z'),
    updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    assignedLawyer: { id: 'user-1', name: 'Teszt Ügyvéd' },
  };
}

describe('case workflow summary next-action priority', () => {
  it('overdue personal task wins', () => {
    const selected = selectNextWorkflowAction([
      candidate({ sourceId: 'future', dueAt: '2026-07-13T10:00:00.000Z' }),
      candidate({
        kind: 'OVERDUE_TASK',
        sourceId: 'overdue-personal',
        dueAt: '2026-07-11T10:00:00.000Z',
        scope: 'MY_WORK',
        assignedToCurrentUser: true,
        explanation: 'A feladat határideje lejárt.',
      }),
    ], now);

    expect(selected?.sourceId).toBe('overdue-personal');
  });

  it('overdue case task beats future task', () => {
    const selected = selectNextWorkflowAction([
      candidate({ sourceId: 'future', dueAt: '2026-07-14T10:00:00.000Z' }),
      candidate({
        kind: 'OVERDUE_TASK',
        sourceId: 'overdue-case',
        dueAt: '2026-07-11T10:00:00.000Z',
        explanation: 'A feladat határideje lejárt.',
      }),
    ], now);

    expect(selected?.sourceId).toBe('overdue-case');
  });

  it('handoff awaiting current user beats non-urgent task', () => {
    const selected = selectNextWorkflowAction([
      candidate({ sourceId: 'open-task' }),
      candidate({
        kind: 'HANDOFF_REVIEW',
        title: 'Átadás ellenőrzése',
        explanation: 'Az átadás elfogadásra vár.',
        sourceType: 'HANDOFF',
        sourceId: 'handoff-1',
        scope: 'MY_WORK',
        assignedToCurrentUser: true,
      }),
    ], now);

    expect(selected?.sourceId).toBe('handoff-1');
  });

  it('review awaiting current user beats non-urgent task', () => {
    const selected = selectNextWorkflowAction([
      candidate({ sourceId: 'open-task' }),
      candidate({
        kind: 'DOCUMENT_REVIEW',
        title: 'Irat review',
        explanation: 'A dokumentum felülvizsgálatra vár.',
        sourceType: 'DOCUMENT_REVIEW',
        sourceId: 'doc-1',
        scope: 'MY_WORK',
        assignedToCurrentUser: true,
      }),
    ], now);

    expect(selected?.sourceId).toBe('doc-1');
  });

  it('due-soon personal task beats later deadline', () => {
    const selected = selectNextWorkflowAction([
      candidate({
        kind: 'UPCOMING_DEADLINE',
        title: 'Ügyhatáridő',
        explanation: 'A következő határidő hét napon belül esedékes.',
        dueAt: '2026-07-16T10:00:00.000Z',
        sourceType: 'DEADLINE',
        sourceId: 'case-1',
      }),
      candidate({
        kind: 'DUE_SOON_TASK',
        sourceId: 'due-soon',
        dueAt: '2026-07-13T08:00:00.000Z',
        scope: 'MY_WORK',
        assignedToCurrentUser: true,
        explanation: 'A feladat határideje 48 órán belül esedékes.',
      }),
    ], now);

    expect(selected?.sourceId).toBe('due-soon');
  });

  it('upcoming deadline selected where no stronger action exists', () => {
    const selected = selectNextWorkflowAction([
      candidate({
        kind: 'UPCOMING_DEADLINE',
        title: 'Ügyhatáridő',
        explanation: 'A következő határidő hét napon belül esedékes.',
        dueAt: '2026-07-15T10:00:00.000Z',
        sourceType: 'DEADLINE',
        sourceId: 'case-1',
      }),
    ], now);

    expect(selected?.kind).toBe('UPCOMING_DEADLINE');
  });

  it('blocked internal item selected appropriately', () => {
    const selected = selectNextWorkflowAction([
      candidate({
        kind: 'BLOCKED_ITEM',
        sourceId: 'blocked',
        explanation: 'A feladat blokkolt állapotban van, belső döntést igényel.',
      }),
    ], now);

    expect(selected?.sourceId).toBe('blocked');
  });

  it('uses deterministic tie-breaking by due date, priority, creation, and id', () => {
    const selected = selectNextWorkflowAction([
      candidate({ sourceId: 'later', dueAt: '2026-07-14T10:00:00.000Z', priority: 'URGENT' }),
      candidate({ sourceId: 'earlier', dueAt: '2026-07-13T10:00:00.000Z', priority: 'LOW' }),
    ], now);

    expect(selected?.sourceId).toBe('earlier');
  });

  it('no candidates returns null', () => {
    expect(selectNextWorkflowAction([], now)).toBeNull();
  });

  it('does not infer from free text', () => {
    const selected = selectNextWorkflowAction([
      candidate({
        title: 'Sürgősnek hangzó szabadszöveg',
        explanation: 'Nyitott feladat vár feldolgozásra.',
        priority: 'LOW',
      }),
    ], now);

    expect(selected?.kind).toBe('OPEN_TASK');
    expect(selected?.explanation).toBe('Nyitott feladat vár feldolgozásra.');
  });
});

describe('GET /cases/:caseId/workflow-summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.communication.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.caseCollaborator.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.communicationAttachment.count as jest.Mock).mockResolvedValue(0);
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
  });

  it('unauthenticated request returns 401', async () => {
    const response = await requestJson(createApp(), 'GET', '/cases/case-1/workflow-summary', false);

    expect(response.status).toBe(401);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
  });

  it('authenticated missing case returns safe 404 before summary queries', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const response = await requestJson(createApp(), 'GET', '/cases/missing/workflow-summary');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('CASE_NOT_FOUND');
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('authenticated available case returns explicit safe DTO', async () => {
    (prisma.case.findUnique as jest.Mock)
      .mockResolvedValueOnce(caseAccessRecord())
      .mockResolvedValueOnce(workflowCaseRecord());
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'task-1',
        title: 'Review feladat',
        status: 'PENDING',
        priority: 'HIGH',
        assignedToId: 'user-1',
        dueDate: new Date('2026-07-11T09:00:00.000Z'),
        createdAt: new Date('2026-07-10T09:00:00.000Z'),
        updatedAt: new Date('2026-07-10T09:00:00.000Z'),
        documentId: null,
        stuckReason: null,
        stuckSince: null,
      },
    ]);
    (prisma.communication.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'comm-1',
        subject: 'Egyeztetés',
        summary: 'Rövid, biztonságos kommunikációs előnézet.',
        direction: 'INBOUND',
        createdAt: new Date('2026-07-11T09:30:00.000Z'),
      },
    ]);
    (prisma.communicationAttachment.count as jest.Mock).mockResolvedValue(2);
    (prisma.task.count as jest.Mock).mockResolvedValue(1);

    const response = await requestJson(createApp(), 'GET', '/cases/case-1/workflow-summary');

    expect(response.status).toBe(200);
    expect(response.body.caseId).toBe('case-1');
    expect(response.body.nextAction.kind).toBe('OVERDUE_TASK');
    expect(response.body.latestCommunication.contentPreview).toBe('Rövid, biztonságos kommunikációs előnézet.');
    expect(JSON.stringify(response.body)).not.toContain('workspaceText');
    expect(JSON.stringify(response.body)).not.toContain('raw document');
    expect(JSON.stringify(response.body)).not.toContain('full email body');
  });

  it('uses bounded select-only task, communication, review and collaborator queries', async () => {
    (prisma.case.findUnique as jest.Mock)
      .mockResolvedValueOnce(caseAccessRecord())
      .mockResolvedValueOnce(workflowCaseRecord());

    await requestJson(createApp(), 'GET', '/cases/case-1/workflow-summary');

    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 50,
      select: expect.objectContaining({ id: true, title: true, status: true }),
    }));
    expect(prisma.communication.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 1,
      select: expect.not.objectContaining({ content: true }),
    }));
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 20,
      select: expect.not.objectContaining({ workspaceText: true }),
    }));
    expect(prisma.caseCollaborator.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 12,
      select: expect.objectContaining({ id: true, role: true }),
    }));
  });

  it('keeps unavailable handoff source unqueried and marked unavailable', async () => {
    (prisma.case.findUnique as jest.Mock)
      .mockResolvedValueOnce(caseAccessRecord())
      .mockResolvedValueOnce(workflowCaseRecord());

    const response = await requestJson(createApp(), 'GET', '/cases/case-1/workflow-summary');

    expect(response.status).toBe(200);
    expect(response.body.handoff).toBeNull();
    expect(response.body.availability.handoff).toBe(false);
    expect((prisma as any).lawyerHandoffPackage).toBeUndefined();
  });
});

describe('workflow summary static privacy guard', () => {
  it('does not use forbidden raw fields, broad includes, or Client Portal modules', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'modules', 'cases', 'workflowSummary.ts'),
      'utf8'
    );

    expect(source).not.toContain('workspaceText');
    expect(source).not.toContain('rawText');
    expect(source).not.toContain('extractedText');
    expect(source).not.toContain('content: true');
    expect(source).not.toContain('body: true');
    expect(source).not.toMatch(/include\s*:/);
    expect(source).not.toMatch(/client-portal/i);
  });
});
