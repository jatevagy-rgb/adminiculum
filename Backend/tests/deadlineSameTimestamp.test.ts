// @ts-nocheck
import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { jest } from '@jest/globals';

const mockPrismaService: any = {
  case: { findMany: jest.fn(), findUnique: jest.fn() },
  caseCollaborator: { findMany: jest.fn(), findFirst: jest.fn() },
  caseIntakeDeadline: { findMany: jest.fn() },
  document: { findMany: jest.fn() },
  documentReview: { findMany: jest.fn() },
  task: { findMany: jest.fn() },
  notification: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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
    if (req.headers.authorization !== 'Bearer test-token') { res.status(401).json({ error: 'No token provided' }); return; }
    (req as any).user = { userId: String(req.headers['x-test-user-id'] || 'user-1'), email: 'test@example.com', role: String(req.headers['x-test-role'] || 'LAWYER'), authProvider: 'local-jwt' };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockPrismaService }));
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockTaskDb }));

import agendaRoutes from '../src/modules/agenda/routes';
import taskRoutes from '../src/modules/tasks/routes';

type TestResponse = { status: number; body: any };

function requestJson(app: Express, method: string, requestPath: string, options: { authenticated?: boolean; body?: unknown; headers?: Record<string, string> } = {}): Promise<TestResponse> {
  const { authenticated = true, body, headers = {} } = options;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Test server address unavailable')); return; }
      const req = http.request({ hostname: '127.0.0.1', port: address.port, path: requestPath, method, headers: { ...(authenticated ? { authorization: 'Bearer test-token' } : {}), 'content-type': 'application/json', ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
        });
      });
      req.on('error', (error) => { server.close(); reject(error); });
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
  mockPrismaService.caseIntakeDeadline.findMany.mockResolvedValue([]);
  mockPrismaService.document.findMany.mockResolvedValue([]);
  mockPrismaService.documentReview.findMany.mockResolvedValue([]);
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

describe('distinct intake deadlines with identical timestamps', () => {
  beforeEach(resetMocks);

  it('shows both intake deadlines and no generic case deadline', async () => {
    mockPrismaService.caseIntakeDeadline.findMany.mockResolvedValue([
      {
        id: 'intake-a',
        title: 'Határidő A',
        deadlineType: 'STATUTORY',
        dueAt: new Date('2026-07-15T10:00:00.000Z'),
        responsibleId: 'user-1',
        note: 'First',
        updatedAt: new Date('2026-07-13T08:00:00.000Z'),
        caseId: 'case-1',
        responsible: { id: 'user-1', name: 'Ügyvéd', email: 'lawyer@example.test' },
        case: { id: 'case-1', caseNumber: 'CASE-2026-001', title: 'Teszt ügy', clientName: 'Nagy Kft.', priority: 'HIGH', status: 'IN_PROGRESS', completedAt: null, assignedLawyerId: 'user-1', assignedLawyer: { id: 'user-1', name: 'Ügyvéd', email: 'lawyer@example.test' } },
      },
      {
        id: 'intake-b',
        title: 'Határidő B',
        deadlineType: 'STATUTORY',
        dueAt: new Date('2026-07-15T10:00:00.000Z'),
        responsibleId: 'user-1',
        note: 'Second',
        updatedAt: new Date('2026-07-13T09:00:00.000Z'),
        caseId: 'case-1',
        responsible: { id: 'user-1', name: 'Ügyvéd', email: 'lawyer@example.test' },
        case: { id: 'case-1', caseNumber: 'CASE-2026-001', title: 'Teszt ügy', clientName: 'Nagy Kft.', priority: 'HIGH', status: 'IN_PROGRESS', completedAt: null, assignedLawyerId: 'user-1', assignedLawyer: { id: 'user-1', name: 'Ügyvéd', email: 'lawyer@example.test' } },
      },
    ]);
    const response = await requestJson(createApp(), 'GET', '/agenda?scope=MY_WORK&status=OPEN&from=2026-07-13&to=2026-07-20');
    expect(response.status).toBe(200);
    const items = response.body.days.flatMap((day: any) => day.items);
    const intakeIds = items.map((i: any) => i.id).filter((id: string) => id.startsWith('CASE_INTAKE_DEADLINE'));
    expect(intakeIds).toContain('CASE_INTAKE_DEADLINE:intake-a');
    expect(intakeIds).toContain('CASE_INTAKE_DEADLINE:intake-b');
    const generic = items.find((i: any) => i.id.startsWith('CASE_DEADLINE'));
    expect(generic).toBeUndefined();
  });
});
