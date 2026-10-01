import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ code: 'AUTH_REQUIRED' });
      return;
    }
    req.user = {
      userId: String(req.headers['x-test-user'] || 'worker-1'),
      email: 'synthetic@example.test',
      role: String(req.headers['x-test-role'] || 'LAWYER') as never,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    case: { findUnique: jest.fn() },
    caseCollaborator: { findFirst: jest.fn() },
    timelineEvent: { findMany: jest.fn() },
    timeEntry: { findMany: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import { caseHistoryReadRouter } from '../src/modules/case-history/read.routes';

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  case: { findUnique: jest.Mock };
  caseCollaborator: { findFirst: jest.Mock };
  timelineEvent: { findMany: jest.Mock };
  timeEntry: { findMany: jest.Mock };
};

function app(): Express {
  const server = express();
  server.use('/api/v1/case-history', caseHistoryReadRouter);
  return server;
}

function get(server: Express, path: string, options: { auth?: boolean; role?: string; user?: string } = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const listener = server.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      if (!address || typeof address === 'string') { listener.close(); reject(new Error('Missing test address')); return; }
      const req = http.get({
        hostname: '127.0.0.1', port: address.port, path,
        headers: {
          ...(options.auth === false ? {} : { authorization: 'Bearer test-token' }),
          'x-test-role': options.role || 'LAWYER',
          'x-test-user': options.user || 'worker-1',
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          listener.close();
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode || 0, body: text ? JSON.parse(text) : null });
        });
      });
      req.on('error', (error) => { listener.close(); reject(error); });
    });
  });
}

const route = '/api/v1/case-history/cases/case-1';
const work = (id: string, day: string, minutes: number, description = 'Belső munka') => ({
  id, workDate: new Date(day), createdAt: new Date(day), workType: 'OTHER',
  description, minutes, user: { name: 'Teszt Munkatárs' },
});

describe('mounted internal case-history read router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: 'worker-1', role: 'LAWYER', status: 'ACTIVE', isActive: true });
    db.case.findUnique.mockResolvedValue({ id: 'case-1', clientId: 'client-1', createdById: 'worker-1', assignedLawyerId: null });
    db.caseCollaborator.findFirst.mockResolvedValue(null);
    db.timelineEvent.findMany.mockResolvedValue([]);
    db.timeEntry.findMany.mockResolvedValue([]);
  });

  it('rejects unauthenticated and customer callers before any source query', async () => {
    expect((await get(app(), route, { auth: false })).status).toBe(401);
    expect((await get(app(), route, { role: 'CLIENT' })).status).toBe(403);
    expect(db.timelineEvent.findMany).not.toHaveBeenCalled();
    expect(db.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it('checks the case before reading and rejects a different internal worker', async () => {
    const result = await get(app(), route, { user: 'worker-2' });
    expect(result.status).toBe(403);
    expect(db.case.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case-1' } }));
    expect(db.timelineEvent.findMany).not.toHaveBeenCalled();
    expect(db.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty scoped history and rejects a missing case', async () => {
    expect(await get(app(), route)).toMatchObject({ status: 200, body: { items: [], nextCursor: null, totalMinutes: 0 } });
    db.case.findUnique.mockResolvedValue(null);
    expect((await get(app(), route)).status).toBe(404);
  });

  it('rejects invalid limits and cursors before querying sources', async () => {
    for (const suffix of ['?limit=0', '?limit=101', '?limit=abc', '?cursor=bad', '?cursor=timeline%3Aunknown']) {
      const response = await get(app(), route + suffix);
      expect(response.status).toBe(400);
    }
    expect(db.timelineEvent.findMany).toHaveBeenCalledTimes(1);
  });

  it('reads only this case, including direct and task-attributed time, without duplicate audit time', async () => {
    db.timelineEvent.findMany.mockResolvedValue([
      { id: 'audit-1', eventType: 'CASE_CREATED', createdAt: new Date('2026-01-01T09:00:00Z'), description: null, user: null },
      { id: 'audit-time', eventType: 'TIME_LOGGED', timeEntryId: 'time-1', createdAt: new Date('2026-01-02T10:00:00Z') },
    ]);
    db.timeEntry.findMany.mockResolvedValue([
      work('time-1', '2026-01-02T10:00:00Z', 60),
      work('time-2', '2026-01-03T10:00:00Z', 30),
    ]);
    const result = await get(app(), route);
    expect(result.status).toBe(200);
    expect(result.body.items.map((item: { sourceKey: string }) => item.sourceKey)).toEqual(['timeline:audit-1', 'time:time-1', 'time:time-2']);
    expect(result.body.totalMinutes).toBe(90);
    expect(db.timelineEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: 'case-1' } }));
    expect(db.timeEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ caseId: 'case-1' }, { caseId: null, task: { caseId: 'case-1' } }] },
    }));
  });

  it('keeps tie order and total independent of page size across cursors', async () => {
    db.timeEntry.findMany.mockResolvedValue([
      work('time-b', '2026-01-02T10:00:00Z', 20),
      work('time-a', '2026-01-02T10:00:00Z', 10),
    ]);
    const first = await get(app(), route + '?limit=1');
    expect(first.body.items[0].sourceKey).toBe('time:time-a');
    expect(first.body.nextCursor).toBe('time:time-a');
    expect(first.body.totalMinutes).toBe(30);
    const second = await get(app(), route + '?limit=1&cursor=time%3Atime-a');
    expect(second.body.items[0].sourceKey).toBe('time:time-b');
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.totalMinutes).toBe(30);
  });

  it('returns a bounded error without exposing source failure details', async () => {
    db.timelineEvent.findMany.mockRejectedValue(new Error('synthetic private database details'));
    const result = await get(app(), route);
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('synthetic private database details');
  });
});
