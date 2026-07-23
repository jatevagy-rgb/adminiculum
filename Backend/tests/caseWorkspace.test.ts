import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = { userId: 'user-1', email: 't@e.com', role: 'LAWYER', authProvider: 'local-jwt' };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: { findUnique: jest.fn() },
    caseCollaborator: { findFirst: jest.fn() },
    task: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
    communication: { findMany: jest.fn(), count: jest.fn() },
    comment: { findMany: jest.fn(), groupBy: jest.fn() },
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
      if (!address || typeof address === 'string') { server.close(); reject(new Error('no addr')); return; }
      const r = http.request({ host: '127.0.0.1', port: address.port, path: reqPath, method: 'GET', headers: authenticated ? { authorization: 'Bearer test-token' } : {} }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode || 0, body: data ? JSON.parse(data) : null }); });
      });
      r.on('error', (e) => { server.close(); reject(e); });
      r.end();
    });
  });
}

const CASE_RECORD = {
  id: 'case-1', assignedLawyerId: 'user-1', createdById: 'user-1',
  caseNumber: 'CASE-2026-001', title: 'Teszt ügy', status: 'ACTIVE', priority: 'HIGH',
  description: 'Ügyvédi instrukció szövege.', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-07-01'),
  client: { id: 'client-1', name: 'Teszt Kft.', colorKey: 'JADE' },
  assignedLawyer: { id: 'user-1', name: 'dr. Teszt' },
};

describe('GET /cases/:caseId/workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(CASE_RECORD);
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.communication.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.communication.count as jest.Mock).mockResolvedValue(0);
    (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.comment.groupBy as jest.Mock).mockResolvedValue([]);
  });

  it('returns 401 without a token', async () => {
    const res = await requestJson(createApp(), '/cases/case-1/workspace', false);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a missing / invalid case id', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await requestJson(createApp(), '/cases/not-a-real-id/workspace');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CASE_NOT_FOUND');
  });

  it('returns 403 when the user cannot access the case', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({ ...CASE_RECORD, assignedLawyerId: 'other', createdById: 'other' });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await requestJson(createApp(), '/cases/case-1/workspace');
    expect(res.status).toBe(403);
  });

  it('returns the full workspace DTO shape', async () => {
    const res = await requestJson(createApp(), '/cases/case-1/workspace');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['activity', 'case', 'comments', 'communications', 'deadlines', 'documents', 'metrics', 'tasks', 'time', 'warnings']);
    expect(res.body.case).toMatchObject({ id: 'case-1', caseNumber: 'CASE-2026-001', title: 'Teszt ügy', status: 'ACTIVE', priority: 'HIGH' });
    expect(res.body.case.client).toMatchObject({ id: 'client-1', name: 'Teszt Kft.' });
    expect(res.body.metrics).toHaveProperty('openTaskCount');
    expect(res.body.metrics).toHaveProperty('communicationCount');
  });

  it('marks case time as not attributable (never fabricates case time)', async () => {
    const res = await requestJson(createApp(), '/cases/case-1/workspace');
    expect(res.body.time).toEqual({ available: false, reason: 'CASE_TIME_NOT_ATTRIBUTABLE' });
    expect(res.body.metrics.loggedMinutes).toBeNull();
  });

  it('enforces max limits and excludes raw internal fields', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, title: `Feladat ${i}`, status: 'IN_PROGRESS', priority: 'MEDIUM', attentionCategory: 'EDITING', estimatedMinutes: 30, dueDate: new Date(), documentId: null, createdAt: new Date(), assignedTo: { id: 'user-1', name: 'dr. Teszt' }, assignedBy: null })),
    );
    (prisma.communication.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, type: 'EMAIL', subject: `Tárgy ${i}`, content: 'A'.repeat(500), senderName: 'Küldő', direction: 'INBOUND', clientId: 'client-1', documentId: null, createdAt: new Date() })),
    );
    const res = await requestJson(createApp(), '/cases/case-1/workspace');
    expect(res.body.tasks.length).toBeLessThanOrEqual(8);
    expect(res.body.communications.length).toBeLessThanOrEqual(8);
    expect(res.body.activity.length).toBeLessThanOrEqual(12);
    // no raw full communication body — only a bounded preview
    for (const c of res.body.communications) {
      expect(c).not.toHaveProperty('content');
      expect((c.contentPreview || '').length).toBeLessThanOrEqual(141);
    }
    // task rows carry the attention fields, no raw prisma internals
    expect(res.body.tasks[0]).toHaveProperty('attentionCategory', 'EDITING');
    expect(res.body.tasks[0]).not.toHaveProperty('assignedById');
  });

  it('degrades a failing optional source without collapsing the workspace', async () => {
    (prisma.document.findMany as jest.Mock).mockRejectedValue(new Error('boom'));
    const res = await requestJson(createApp(), '/cases/case-1/workspace');
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
    expect(res.body.warnings.some((w: any) => w.section === 'documents')).toBe(true);
  });

  it('produces human-readable activity (no generic "Esemény rögzítve")', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 't1', title: 'Szerződés ellenőrzése', status: 'IN_PROGRESS', priority: 'HIGH', attentionCategory: 'DETAILED_REVIEW', estimatedMinutes: null, dueDate: new Date(), documentId: null, createdAt: new Date('2026-07-02'), assignedTo: { id: 'u2', name: 'Nagy Anna' }, assignedBy: { id: 'user-1', name: 'Hubay Gyula' } },
    ]);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([
      { id: 'd1', name: 'szerzodes.pdf', fileName: 'szerzodes.pdf', mimeType: 'application/pdf', documentType: 'CONTRACT', category: 'CONTRACT', version: 'v1', currentVersion: 1, createdAt: new Date('2026-07-03'), updatedAt: new Date('2026-07-03') },
    ]);
    const res = await requestJson(createApp(), '/cases/case-1/workspace');
    expect(res.body.activity.length).toBeGreaterThan(0);
    for (const a of res.body.activity) {
      expect(a.actionLabel).toBeTruthy();
      expect(a.actionLabel).not.toBe('Esemény rögzítve');
      expect(a.objectLabel).toBeTruthy();
      expect(a).toHaveProperty('occurredAt');
      expect(a).toHaveProperty('objectType');
    }
    const taskEvent = res.body.activity.find((a: any) => a.objectType === 'TASK');
    expect(taskEvent.actionLabel).toContain('feladat');
    expect(taskEvent.objectLabel).toBe('Szerződés ellenőrzése');
  });
});
