/**
 * GET /cases — authorization scope repair (PR #355 prerequisite).
 *
 * Regression guard for the pre-existing defect where `GET /cases` was
 * authenticate-only, so any authenticated actor could enumerate every case
 * (ids, caseNumbers, client names) through pagination. The canonical case-read
 * predicate (`buildCaseReadScope`, the same one used by `userCanReadCase` /
 * `requireCaseReadAccess`) is now applied inside the database query.
 *
 * The Prisma double below is stateless-mocked but *applies* the where predicate
 * to an in-memory fixture set, so "case must not appear" is proven against the
 * real query shape instead of a hard-coded mock return value.
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
    case: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    caseCollaborator: {
      findFirst: jest.fn(),
    },
    document: { findMany: jest.fn(), count: jest.fn() },
    timelineEvent: { findMany: jest.fn(), count: jest.fn() },
    communication: { findMany: jest.fn(), count: jest.fn() },
    comment: { findMany: jest.fn(), groupBy: jest.fn() },
    task: { findMany: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = { status: number; body: any };

const ASSIGNED = 'user-assigned';
const CREATOR = 'user-creator';
const COLLABORATOR = 'user-collaborator';
const OUTSIDER = 'user-outsider';

type CaseRow = {
  id: string;
  caseNumber: string;
  title: string;
  clientId: string;
  clientName: string;
  matterType: string;
  status: string;
  priority: string;
  deadline: Date | null;
  clientRole: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedLawyerId: string | null;
  createdById: string;
  collaboratorIds: string[];
};

function row(partial: Partial<CaseRow> & Pick<CaseRow, 'id' | 'caseNumber' | 'clientId' | 'assignedLawyerId' | 'createdById' | 'updatedAt'>): CaseRow {
  return {
    title: `Ügy ${partial.id}`,
    clientName: `Client ${partial.clientId}`,
    matterType: 'OTHER',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    deadline: null,
    clientRole: null,
    createdAt: partial.updatedAt,
    collaboratorIds: [],
    ...partial,
  };
}

// Ordered newest-first, matching the endpoint's `orderBy updatedAt desc`.
const CASES: CaseRow[] = [
  row({ id: 'case-d', caseNumber: 'CASE-2026-0004', clientId: 'client-b', assignedLawyerId: 'someone-else', createdById: 'someone-else', updatedAt: new Date('2026-04-01') }),
  row({ id: 'case-c', caseNumber: 'CASE-2026-0003', clientId: 'client-b', assignedLawyerId: 'someone-else', createdById: 'someone-else', collaboratorIds: [COLLABORATOR], updatedAt: new Date('2026-03-01') }),
  row({ id: 'case-b', caseNumber: 'CASE-2026-0002', clientId: 'client-a', assignedLawyerId: 'someone-else', createdById: CREATOR, updatedAt: new Date('2026-02-01') }),
  row({ id: 'case-a', caseNumber: 'CASE-2026-0001', clientId: 'client-a', assignedLawyerId: ASSIGNED, createdById: 'someone-else', updatedAt: new Date('2026-01-01') }),
];

/** Evaluates the subset of Prisma.CaseWhereInput the canonical scope produces. */
function matchesWhere(record: CaseRow, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND)) return where.AND.every((part: any) => matchesWhere(record, part));
  if (Array.isArray(where.OR)) return where.OR.some((part: any) => matchesWhere(record, part));
  if (where.id && typeof where.id === 'object' && Array.isArray(where.id.in)) {
    return where.id.in.includes(record.id);
  }
  if (where.assignedLawyerId !== undefined && record.assignedLawyerId !== where.assignedLawyerId) return false;
  if (where.createdById !== undefined && record.createdById !== where.createdById) return false;
  if (where.clientId !== undefined && record.clientId !== where.clientId) return false;
  if (where.status !== undefined && record.status !== where.status) return false;
  if (where.collaborators?.some?.userId !== undefined) {
    return record.collaboratorIds.includes(where.collaborators.some.userId);
  }
  return true;
}

function toApiRow(record: CaseRow) {
  return {
    ...record,
    client: { id: record.clientId, name: record.clientName, colorKey: 'GREEN' },
    assignedLawyer: record.assignedLawyerId
      ? { id: record.assignedLawyerId, name: 'dr. Teszt', email: 'lawyer@example.com', role: 'LAWYER' }
      : null,
  };
}

function queryCases(where: any): CaseRow[] {
  return CASES.filter((record) => matchesWhere(record, where)).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

function installPrismaDouble(): void {
  (prisma.case.findMany as jest.Mock).mockImplementation(async ({ where, skip = 0, take }: any) =>
    queryCases(where).slice(skip, skip + take).map(toApiRow),
  );
  (prisma.case.count as jest.Mock).mockImplementation(async (args?: any) => queryCases(args?.where).length);
  (prisma.case.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
    const record = CASES.find((candidate) => candidate.id === where?.id);
    return record ? toApiRow(record) : null;
  });
  (prisma.caseCollaborator.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => {
    const record = CASES.find((candidate) => candidate.id === where?.caseId);
    if (record && record.collaboratorIds.includes(where?.userId)) return { id: `collab-${where.userId}` };
    return null;
  });
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

function asActor(userId: string, role: string, reqPath: string): Promise<TestResponse> {
  return requestJson(createApp(), reqPath, true, { 'x-test-user-id': userId, 'x-test-role': role });
}

function ids(response: TestResponse): string[] {
  return (response.body?.data ?? []).map((item: any) => item.id);
}

/**
 * Exact-reference resolver mirrored from PR #355
 * (`Frontend/src/lib/workspace/identityResolution.ts`). Scans the paginated
 * list endpoint until the reference is found, up to 50 pages of 200.
 */
async function scanCaseReference(
  userId: string,
  role: string,
  reference: string,
  pageSize = 200,
  maxPages = 50,
): Promise<any | null> {
  const app = createApp();
  let page = 1;
  let totalPages = maxPages;
  while (page <= maxPages) {
    const response = await requestJson(app, `/cases?page=${page}&limit=${pageSize}`, true, {
      'x-test-user-id': userId,
      'x-test-role': role,
    });
    const data: any[] = response.body?.data ?? [];
    const match = data.find((item) => item.id === reference || item.caseNumber === reference);
    if (match) return match;
    const total = response.body?.pagination?.total;
    if (typeof total === 'number') {
      totalPages = Math.min(maxPages, Math.max(1, Math.ceil(total / pageSize)));
      if (page >= totalPages) return null;
    } else if (data.length < pageSize) {
      return null;
    }
    page += 1;
  }
  return null;
}

describe('GET /cases — canonical case-read scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installPrismaDouble();
  });

  it('returns 401 without a token', async () => {
    const response = await requestJson(createApp(), '/cases', false);
    expect(response.status).toBe(401);
  });

  it('pushes the canonical scope into the database query (not app-side filtering)', async () => {
    await asActor(OUTSIDER, 'LAWYER', '/cases');

    const findManyArgs = (prisma.case.findMany as jest.Mock).mock.calls[0][0];
    const countArgs = (prisma.case.count as jest.Mock).mock.calls[0][0];
    const expectedScope = {
      OR: [
        { assignedLawyerId: OUTSIDER },
        { createdById: OUTSIDER },
        { collaborators: { some: { userId: OUTSIDER } } },
      ],
    };

    expect(findManyArgs.where).toEqual({ AND: [expectedScope] });
    expect(countArgs).toEqual({ where: { AND: [expectedScope] } });
  });

  it('keeps broad access for ADMIN (no scope predicate)', async () => {
    await asActor('admin-1', 'ADMIN', '/cases');
    const findManyArgs = (prisma.case.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyArgs.where).toBeUndefined();
  });

  it('keeps broad access for PARTNER (no scope predicate)', async () => {
    await asActor('partner-1', 'PARTNER', '/cases');
    const findManyArgs = (prisma.case.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyArgs.where).toBeUndefined();
  });

  it('shows the assigned lawyer only their authorized case', async () => {
    const response = await asActor(ASSIGNED, 'LAWYER', '/cases');
    expect(response.status).toBe(200);
    expect(ids(response)).toEqual(['case-a']);
    expect(response.body.pagination.total).toBe(1);
  });

  it('shows the creator the case they created', async () => {
    const response = await asActor(CREATOR, 'LAWYER', '/cases');
    expect(ids(response)).toEqual(['case-b']);
    expect(response.body.pagination.total).toBe(1);
  });

  it('shows a collaborator the case they collaborate on', async () => {
    const response = await asActor(COLLABORATOR, 'LAWYER', '/cases');
    expect(ids(response)).toEqual(['case-c']);
    expect(response.body.pagination.total).toBe(1);
  });

  it('returns an empty authorized result for an unrelated lawyer', async () => {
    const response = await asActor(OUTSIDER, 'LAWYER', '/cases');
    expect(response.status).toBe(200);
    expect(ids(response)).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });

  it('returns an empty authorized result for a client/portal role', async () => {
    const response = await asActor('portal-user', 'CLIENT', '/cases');
    expect(ids(response)).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });

  it('does not expose a forbidden case through the list to an unrelated actor', async () => {
    const response = await asActor(OUTSIDER, 'LAWYER', '/cases?page=1&limit=200');
    expect(ids(response)).not.toContain('case-d');
    expect(JSON.stringify(response.body)).not.toContain('CASE-2026-0004');
  });

  it('applies clientId filtering inside the authorized scope (no cross-client leak)', async () => {
    const foreign = await asActor(OUTSIDER, 'LAWYER', '/cases?clientId=client-b');
    expect(ids(foreign)).toEqual([]);
    expect(foreign.body.pagination.total).toBe(0);

    const otherClient = await asActor(COLLABORATOR, 'LAWYER', '/cases?clientId=client-a');
    expect(ids(otherClient)).toEqual([]);

    const ownClient = await asActor(COLLABORATOR, 'LAWYER', '/cases?clientId=client-b');
    expect(ids(ownClient)).toEqual(['case-c']);
  });

  it('reflects the authorized set in pagination.total and multi-page windows', async () => {
    const adminPage1 = await asActor('admin-1', 'ADMIN', '/cases?page=1&limit=2');
    expect(ids(adminPage1)).toEqual(['case-d', 'case-c']);
    expect(adminPage1.body.pagination.total).toBe(4);

    const adminPage2 = await asActor('admin-1', 'ADMIN', '/cases?page=2&limit=2');
    expect(ids(adminPage2)).toEqual(['case-b', 'case-a']);
    expect(adminPage2.body.pagination.total).toBe(4);

    // A non-privileged actor's total counts only their authorized case.
    const scoped = await asActor(ASSIGNED, 'LAWYER', '/cases?page=2&limit=1');
    expect(ids(scoped)).toEqual([]);
    expect(scoped.body.pagination.total).toBe(1);
  });

  it('preserves legacy caseNumber aliases for authorized actors only', async () => {
    const admin = await asActor('admin-1', 'ADMIN', '/cases');
    const adminNumbers = (admin.body.data ?? []).map((item: any) => item.caseNumber);
    expect(adminNumbers).toContain('CASE-2026-0004');

    const assigned = await asActor(ASSIGNED, 'LAWYER', '/cases');
    const assignedNumbers = (assigned.body.data ?? []).map((item: any) => item.caseNumber);
    expect(assignedNumbers).toEqual(['CASE-2026-0001']);
  });
});

describe('GET /cases/:caseId — direct access converges with list scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installPrismaDouble();
  });

  it('fails closed with 403 for a forbidden canonical case id', async () => {
    const response = await asActor(OUTSIDER, 'LAWYER', '/cases/case-d');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CASE_ACCESS_FORBIDDEN');
  });

  it('allows the assigned lawyer to read their case directly', async () => {
    const response = await asActor(ASSIGNED, 'LAWYER', '/cases/case-a');
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('case-a');
  });

  it('returns 404 (not 403) for a case that does not exist', async () => {
    const response = await asActor(OUTSIDER, 'LAWYER', '/cases/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('CASE_NOT_FOUND');
  });
});

describe('#355 compatibility — paginated exact-reference fallback cannot recover a forbidden case', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installPrismaDouble();
  });

  it('unrelated actor cannot discover the forbidden case by UUID or caseNumber scan', async () => {
    expect(await scanCaseReference(OUTSIDER, 'LAWYER', 'case-d')).toBeNull();
    expect(await scanCaseReference(OUTSIDER, 'LAWYER', 'CASE-2026-0004')).toBeNull();
    expect(await scanCaseReference('random-lawyer', 'LAWYER', 'case-d')).toBeNull();
  });

  it('direct forbidden request fails closed AND the fallback scan finds nothing', async () => {
    const direct = await asActor(OUTSIDER, 'LAWYER', '/cases/case-d');
    expect(direct.status).toBe(403);
    expect(await scanCaseReference(OUTSIDER, 'LAWYER', 'case-d')).toBeNull();
  });

  it('authorized actor can still resolve the same reference exactly', async () => {
    const resolved = await scanCaseReference('admin-1', 'ADMIN', 'CASE-2026-0004');
    expect(resolved?.id).toBe('case-d');

    const assigned = await asActor(ASSIGNED, 'LAWYER', '/cases/case-a');
    expect(assigned.status).toBe(200);
    expect(await scanCaseReference(ASSIGNED, 'LAWYER', 'CASE-2026-0001')).toMatchObject({ id: 'case-a' });
  });
});
