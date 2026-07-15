import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';

const mockPrismaService: any = {
  case: { findMany: jest.fn(), findUnique: jest.fn() },
  caseCollaborator: { findMany: jest.fn(), findFirst: jest.fn() },
  task: { findMany: jest.fn() },
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockTaskDb: any = {
  task: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  timelineEvent: { create: jest.fn() },
};

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

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockPrismaService }));
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockTaskDb }));

import agendaRoutes from '../src/modules/agenda/routes';
import taskRoutes from '../src/modules/tasks/routes';
import notificationsService from '../src/modules/notifications/services';
import { deriveDeadlineUrgency, mapImportance } from '../src/modules/agenda/deadlineEngine';

type TestResponse = { status: number; body: any };

function requestJson(
  app: Express,
  method: string,
  requestPath: string,
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
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: requestPath,
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
      req.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/agenda', agendaRoutes);
  app.use('/tasks', taskRoutes);
  return app;
}

function resetMocks() {
  jest.clearAllMocks();
  mockPrismaService.case.findMany.mockResolvedValue([]);
  mockPrismaService.case.findUnique.mockResolvedValue(null);
  mockPrismaService.caseCollaborator.findMany.mockResolvedValue([]);
  mockPrismaService.caseCollaborator.findFirst.mockResolvedValue(null);
  mockPrismaService.task.findMany.mockResolvedValue([]);
  mockPrismaService.notification.findMany.mockResolvedValue([]);
  mockPrismaService.notification.count.mockResolvedValue(0);
  mockPrismaService.notification.findFirst.mockResolvedValue(null);
  mockPrismaService.notification.findUnique.mockResolvedValue(null);
  mockPrismaService.notification.update.mockResolvedValue(null);
  mockPrismaService.notification.updateMany.mockResolvedValue({ count: 0 });

  mockTaskDb.task.findUnique.mockResolvedValue(null);
  mockTaskDb.task.update.mockResolvedValue(null);
  mockTaskDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'LAWYER' });
  mockTaskDb.case.findUnique.mockResolvedValue({ assignedLawyerId: 'user-1', createdById: 'creator-1' });
  mockTaskDb.caseCollaborator.findFirst.mockResolvedValue(null);
  mockTaskDb.timelineEvent.create.mockResolvedValue({ id: 'timeline-1' });
}

describe('workflow deadlines agenda and notifications', () => {
  beforeEach(resetMocks);

  it('derives urgency from persisted dates only, without title semantics', () => {
    const now = new Date('2026-07-13T10:00:00.000Z');
    expect(deriveDeadlineUrgency('2026-07-13T09:00:00.000Z', now)).toBe('OVERDUE');
    expect(deriveDeadlineUrgency('2026-07-13T12:00:00.000Z', now)).toBe('TODAY');
    expect(deriveDeadlineUrgency('2026-07-14T09:00:00.000Z', now)).toBe('TOMORROW');
    expect(deriveDeadlineUrgency('2026-07-17T09:00:00.000Z', now)).toBe('THIS_WEEK');
    expect(deriveDeadlineUrgency('2026-08-01T09:00:00.000Z', now)).toBe('LATER');
    expect(mapImportance('critical court filing')).toBe('UNSPECIFIED');
  });

  it('requires auth for the agenda endpoint', async () => {
    const response = await requestJson(createApp(), 'GET', '/agenda', { authenticated: false });
    expect(response.status).toBe(401);
  });

  it('returns a scalar agenda contract with explicit task select and no relation includes', async () => {
    mockPrismaService.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Beadvány ellenőrzése',
        description: 'Rövid belső feladatleírás',
        status: 'TODO',
        priority: 'HIGH',
        dueDate: new Date('2026-07-14T09:00:00.000Z'),
        updatedAt: new Date('2026-07-12T09:00:00.000Z'),
        assignedToId: 'user-1',
        assignedTo: { id: 'user-1', name: 'Ügyvéd', email: 'lawyer@example.test' },
        caseId: 'case-1',
        case: {
          id: 'case-1',
          caseNumber: 'CASE-1',
          title: 'Teszt ügy',
          clientName: 'Teszt ügyfél',
          assignedLawyerId: 'user-1',
          assignedLawyer: { id: 'user-1', name: 'Ügyvéd', email: 'lawyer@example.test' },
        },
      },
    ]);

    const response = await requestJson(createApp(), 'GET', '/agenda?scope=MY_WORK&status=OPEN&limit=5&from=2026-07-13&to=2026-07-20');

    expect(response.status).toBe(200);
    expect(response.body.days[0].items[0]).toMatchObject({
      id: 'TASK:task-1',
      sourceType: 'TASK',
      sourceId: 'task-1',
      caseId: 'case-1',
      title: 'Beadvány ellenőrzése',
      legalSignificance: null,
      href: '/tasks?taskId=task-1',
    });
    expect(response.body.days[0].items[0]).not.toHaveProperty('payload');
    expect(response.body.days[0].items[0]).not.toHaveProperty('metadata');
    expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ id: true, dueDate: true, case: expect.any(Object) }),
    }));
    expect(mockPrismaService.task.findMany.mock.calls[0][0]).not.toHaveProperty('include');
  });

  it('rejects unsupported team agenda scope and inaccessible case scope', async () => {
    const team = await requestJson(createApp(), 'GET', '/agenda?scope=TEAM');
    expect(team.status).toBe(400);
    expect(team.body.code).toBe('TEAM_SCOPE_NOT_AVAILABLE');

    mockPrismaService.case.findMany.mockResolvedValue([]);
    mockPrismaService.caseCollaborator.findMany.mockResolvedValue([]);
    const inaccessible = await requestJson(createApp(), 'GET', '/agenda?scope=CASE&caseId=case-other');
    expect(inaccessible.status).toBe(404);
    expect(inaccessible.body.code).toBe('CASE_NOT_FOUND');
  });

  it('reschedules task due date through an explicit mutation and content-minimal timeline event', async () => {
    mockTaskDb.task.findUnique.mockResolvedValue({
      id: 'task-1',
      title: 'Határidős feladat',
      caseId: 'case-1',
      status: 'TODO',
      dueDate: new Date('2026-07-14T09:00:00.000Z'),
      assignedToId: 'user-1',
      assignedById: 'manager-1',
      stuckReason: null,
      stuckSince: null,
    });
    mockTaskDb.task.update.mockResolvedValue({
      id: 'task-1',
      title: 'Határidős feladat',
      description: null,
      status: 'TODO',
      priority: 'HIGH',
      dueDate: new Date('2026-07-15T09:00:00.000Z'),
      caseId: 'case-1',
      assignedToId: 'user-1',
      assignedById: 'manager-1',
      updatedAt: new Date('2026-07-13T09:00:00.000Z'),
    });

    const response = await requestJson(createApp(), 'POST', '/tasks/task-1/reschedule', {
      body: { dueAt: '2026-07-15T09:00:00.000Z' },
    });

    expect(response.status).toBe(200);
    expect(mockTaskDb.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { dueDate: new Date('2026-07-15T09:00:00.000Z') },
      select: expect.objectContaining({ id: true, dueDate: true, description: true }),
    }));
    expect(mockTaskDb.timelineEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: 'DEADLINE_SET',
        payload: { taskId: 'task-1', source: 'task_due_date', dueAt: '2026-07-15T09:00:00.000Z' },
      }),
    }));
  });

  it('rejects arbitrary task status payloads on reschedule', async () => {
    const response = await requestJson(createApp(), 'POST', '/tasks/task-1/reschedule', {
      body: { status: 'DONE', dueAt: '2026-07-15T09:00:00.000Z' },
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNSUPPORTED_RESCHEDULE_FIELD');
  });

  it('keeps notification list DTOs explicit and mark-read idempotent', async () => {
    mockPrismaService.notification.findMany.mockResolvedValue([
      {
        id: 'n-1',
        type: 'TASK_DUE_SOON',
        title: 'Közelgő határidős tétel',
        message: 'Egy hozzád rendelt belső határidős tétel figyelmet igényel.',
        link: '/deadlines',
        isRead: false,
        createdAt: new Date('2026-07-13T09:00:00.000Z'),
      },
    ]);
    mockPrismaService.notification.count.mockResolvedValue(1);
    mockPrismaService.notification.findFirst.mockResolvedValue({ id: 'n-1', isRead: true });
    mockPrismaService.notification.findUnique.mockResolvedValue({
      id: 'n-1',
      type: 'TASK_DUE_SOON',
      title: 'Közelgő határidős tétel',
      message: 'Egy hozzád rendelt belső határidős tétel figyelmet igényel.',
      link: '/deadlines',
      isRead: true,
      createdAt: new Date('2026-07-13T09:00:00.000Z'),
    });

    const listed = await notificationsService.listNotifications({ userId: 'user-1' });
    const read = await notificationsService.markAsRead('user-1', 'n-1');
    const preview = notificationsService.buildDeadlineNotificationPreview({
      userId: 'user-1',
      deadlineId: 'TASK:task-1',
      urgency: 'OVERDUE',
      href: '/tasks?taskId=task-1',
    });

    expect(listed.items[0]).toEqual(expect.objectContaining({ id: 'n-1', createdAt: '2026-07-13T09:00:00.000Z' }));
    expect(read).toEqual(expect.objectContaining({ id: 'n-1', isRead: true }));
    expect(mockPrismaService.notification.findMany.mock.calls[0][0]).toHaveProperty('select');
    expect(mockPrismaService.notification.findMany.mock.calls[0][0]).not.toHaveProperty('include');
    expect(preview.message).not.toMatch(/CASE-|ügyfél|client/i);
  });

  it('keeps agenda implementation free of external automations, AI extraction and broad JSON exposure', () => {
    const sourceFiles = [
      'src/modules/agenda/deadlineEngine.ts',
      'src/modules/agenda/service.ts',
      'src/modules/agenda/routes.ts',
      'src/modules/notifications/services.ts',
    ].map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
    const combined = sourceFiles.join('\n');

    expect(combined).not.toMatch(/openai|anthropic|gemini|n8n|microsoftGraph|graphClient/i);
    expect(combined).not.toMatch(/workspaceText\s*:\s*true|content\s*:\s*true/);
    expect(combined).not.toMatch(/include\s*:/);
  });
});
