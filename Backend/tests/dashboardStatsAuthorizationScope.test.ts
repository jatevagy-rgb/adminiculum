/**
 * GET /cases/dashboard/stats — authorization-scope repair for the dashboard
 * case aggregates.
 *
 * Regression guard for the defect where the dashboard totals (totalCases,
 * inReview, pendingClient, completedThisMonth) were computed with unscoped
 * `prisma.case.count()`, so any authenticated actor saw office-wide totals.
 * The canonical case-read predicate (`buildCaseReadScope`, the same one used
 * by GET /cases and userCanReadCase/requireCaseReadAccess) is now applied to
 * every aggregate inside the database query.
 *
 * The Prisma double is stateless-mocked but *applies* the where predicate to
 * an in-memory fixture set, so "a case must not contribute" is proven against
 * the real query shape instead of a hard-coded mock return value.
 */

import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: String(req.headers['x-test-user-id'] || 'anonymous'),
      email: 'test@example.com',
      role: String(req.headers['x-test-role'] || 'LAWYER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: { count: jest.fn() },
    timelineEvent: { findMany: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = { status: number; body: any };

const ASSIGNED = 'user-assigned';
const CREATOR = 'user-creator';
const COLLABORATOR = 'user-collaborator';
const OUTSIDER = 'user-outsider';
const OTHER = 'someone-else';

type CaseRow = {
  id: string;
  status: string;
  assignedLawyerId: string | null;
  createdById: string;
  collaboratorIds: string[];
  updatedAt: Date;
};

function row(partial: Partial<CaseRow> & Pick<CaseRow, 'id' | 'status'>): CaseRow {
  return {
    assignedLawyerId: OTHER,
    createdById: OTHER,
    collaboratorIds: [],
    updatedAt: new Date('2025-01-01'),
    ...partial,
  };
}

// Mid-current-month date so the FINAL fixtures always satisfy updatedAt >=
// startOfMonth regardless of when the suite runs.
const THIS_MONTH = new Date();
THIS_MONTH.setDate(15);

const CASES: CaseRow[] = [
  row({ id: 'case-assigned-inreview', status: 'IN_REVIEW', assignedLawyerId: ASSIGNED }),
  row({ id: 'case-foreign-inreview', status: 'IN_REVIEW' }),
  row({ id: 'case-created-pending', status: 'CLIENT_INPUT', createdById: CREATOR }),
  row({ id: 'case-collab-final', status: 'FINAL', collaboratorIds: [COLLABORATOR], updatedAt: THIS_MONTH }),
  row({ id: 'case-foreign-final', status: 'FINAL', updatedAt: THIS_MONTH }),
];

/** Evaluates the subset of Prisma.CaseWhereInput the dashboard aggregates produce. */
function matchesCondition(record: CaseRow, key: string, value: any): boolean {
  if (key === 'OR' && Array.isArray(value)) return value.some((part: any) => matchesWhere(record, part));
  if (key === 'AND' && Array.isArray(value)) return value.every((part: any) => matchesWhere(record, part));
  if (key === 'id' && value && typeof value === 'object' && Array.isArray(value.in)) {
    return value.in.includes(record.id);
  }
  if (key === 'status') return record.status === value;
  if (key === 'assignedLawyerId') return record.assignedLawyerId === value;
  if (key === 'createdById') return record.createdById === value;
  if (key === 'collaborators' && value?.some?.userId !== undefined) {
    return record.collaboratorIds.includes(value.some.userId);
  }
  if (key === 'updatedAt' && value?.gte) {
    return record.updatedAt.getTime() >= value.gte.getTime();
  }
  return true;
}

function matchesWhere(record: CaseRow, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => matchesCondition(record, key, value));
}

function installPrismaDouble(): void {
  (prisma.case.count as jest.Mock).mockImplementation(async (args?: any) =>
    CASES.filter((record) => matchesWhere(record, args?.where)).length,
  );
  (prisma.timelineEvent.findMany as jest.Mock).mockImplementation(async () => []);
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

function requestJson(
  app: Express,
  reqPath: string,
  authenticated = true,
  headers: Record<string, string> = {},
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('no addr')); return; }
      const request = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method: 'GET',
          headers: authenticated ? { authorization: 'Bearer test-token', ...headers } : { ...headers },
        },
        (response) => {
          let data = '';
          response.on('data', (chunk) => (data += chunk));
          response.on('end', () => { server.close(); resolve({ status: response.statusCode || 0, body: data ? JSON.parse(data) : null }); });
        },
      );
      request.on('error', (error) => { server.close(); reject(error); });
      request.end();
    });
  });
}

function asActor(userId: string, role: string): Promise<TestResponse> {
  return requestJson(createApp(), '/cases/dashboard/stats', true, { 'x-test-user-id': userId, 'x-test-role': role });
}

const CANONICAL_SCOPE = (userId: string) => ({
  OR: [
    { assignedLawyerId: userId },
    { createdById: userId },
    { collaborators: { some: { userId } } },
  ],
});

describe('GET /cases/dashboard/stats — canonical case-read scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installPrismaDouble();
  });

  it('returns 401 without a token', async () => {
    const response = await requestJson(createApp(), '/cases/dashboard/stats', false);
    expect(response.status).toBe(401);
  });

  it('pushes the canonical scope into every aggregate query for a restricted actor', async () => {
    await asActor(ASSIGNED, 'LAWYER');

    const countCalls = (prisma.case.count as jest.Mock).mock.calls;
    expect(countCalls.length).toBe(4);
    for (const [args] of countCalls) {
      expect(args.where).toMatchObject(CANONICAL_SCOPE(ASSIGNED));
    }
  });

  it('applies no scope predicate for ADMIN (broad access preserved)', async () => {
    await asActor('admin-1', 'ADMIN');

    const countCalls = (prisma.case.count as jest.Mock).mock.calls;
    expect(countCalls.length).toBe(4);
    for (const [args] of countCalls) {
      expect(args.where?.OR).toBeUndefined();
    }
  });

  it('counts only the accessible case for the assigned lawyer', async () => {
    const response = await asActor(ASSIGNED, 'LAWYER');
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({ totalCases: 1, inReview: 1, pendingClient: 0, completedThisMonth: 0 });
  });

  it('counts only the accessible case for the creator', async () => {
    const response = await asActor(CREATOR, 'LAWYER');
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({ totalCases: 1, inReview: 0, pendingClient: 1, completedThisMonth: 0 });
  });

  it('counts only the accessible case for a collaborator', async () => {
    const response = await asActor(COLLABORATOR, 'LAWYER');
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({ totalCases: 1, inReview: 0, pendingClient: 0, completedThisMonth: 1 });
  });

  it('returns zero aggregates for an unrelated lawyer (no object access granted)', async () => {
    const response = await asActor(OUTSIDER, 'LAWYER');
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({ totalCases: 0, inReview: 0, pendingClient: 0, completedThisMonth: 0 });
  });

  it('returns zero aggregates for a client/portal role', async () => {
    const response = await asActor('portal-user', 'CLIENT');
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({ totalCases: 0, inReview: 0, pendingClient: 0, completedThisMonth: 0 });
  });

  it('preserves intended office-wide totals for ADMIN', async () => {
    const response = await asActor('admin-1', 'ADMIN');
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({ totalCases: 5, inReview: 2, pendingClient: 1, completedThisMonth: 2 });
  });

  it('preserves intended office-wide totals for PARTNER', async () => {
    const response = await asActor('partner-1', 'PARTNER');
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({ totalCases: 5, inReview: 2, pendingClient: 1, completedThisMonth: 2 });
  });

  it('keeps recent activity payload shape unchanged', async () => {
    const response = await asActor('admin-1', 'ADMIN');
    expect(response.status).toBe(200);
    expect(response.body.recentActivity).toEqual([]);
  });
});
