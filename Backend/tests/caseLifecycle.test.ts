import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

import {
  deriveLifecycleCategory,
  deriveClosureBlockers,
  deriveClosureReadiness,
  deriveLifecycleCapabilities,
  validateCaseLifecycleTransition,
  LIFECYCLE_ACTION_TARGET,
  PERSISTABLE_CASE_STATUSES,
  isPersistableCaseStatus,
} from '../src/modules/cases/lifecycle';

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

jest.mock('../src/prisma/prisma.service', () => {
  const prisma = {
    case: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    caseCollaborator: { findFirst: jest.fn(), findMany: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
    document: { findMany: jest.fn() },
    communication: { findMany: jest.fn() },
    communicationAttachment: { count: jest.fn() },
    lawyerHandoffPackage: { count: jest.fn() },
    timelineEvent: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = { status: number; body: any };
const now = new Date('2026-07-13T10:00:00.000Z');

// ---------------------------------------------------------------------------
// Pure engine
// ---------------------------------------------------------------------------

describe('lifecycle category mapping (persistable enum only)', () => {
  it('maps each persistable status to a supported category', () => {
    expect(deriveLifecycleCategory('CLIENT_INPUT')).toBe('INTAKE');
    expect(deriveLifecycleCategory('DRAFT')).toBe('ACTIVE');
    expect(deriveLifecycleCategory('IN_REVIEW')).toBe('ACTIVE');
    expect(deriveLifecycleCategory('CLIENT_FEEDBACK')).toBe('ACTIVE');
    expect(deriveLifecycleCategory('ON_HOLD')).toBe('ON_HOLD');
    expect(deriveLifecycleCategory('FINAL')).toBe('CLOSED');
    expect(deriveLifecycleCategory('CANCELLED')).toBe('CLOSED');
    expect(deriveLifecycleCategory('ARCHIVED')).toBe('ARCHIVED');
  });

  it('never returns a CLOSING category (no such enum value)', () => {
    for (const status of PERSISTABLE_CASE_STATUSES) {
      expect(deriveLifecycleCategory(status)).not.toBe('CLOSING');
    }
    expect(deriveLifecycleCategory('SOME_LEGACY_VALUE')).toBe('ACTIVE');
  });

  it('does not treat a non-persistable CLOSED status as writable', () => {
    expect(isPersistableCaseStatus('CLOSED')).toBe(false);
    expect(isPersistableCaseStatus('FINAL')).toBe(true);
    expect(Object.values(LIFECYCLE_ACTION_TARGET).every(isPersistableCaseStatus)).toBe(true);
  });
});

describe('closure blockers and readiness', () => {
  const base = {
    hasResponsibleLawyer: true,
    openTaskCount: 0,
    overdueTaskCount: 0,
    activeReviewCount: 0,
    openDeadlineCount: 0,
    activeHandoffCount: 0,
  };

  it('is ready when nothing is outstanding', () => {
    const blockers = deriveClosureBlockers(base);
    expect(blockers).toHaveLength(0);
    expect(deriveClosureReadiness(blockers)).toEqual({ ready: true, reasons: [] });
  });

  it('reports each supported operational blocker', () => {
    const blockers = deriveClosureBlockers({
      hasResponsibleLawyer: false,
      openTaskCount: 3,
      overdueTaskCount: 1,
      activeReviewCount: 2,
      openDeadlineCount: 1,
      activeHandoffCount: 1,
    });
    const codes = blockers.map((b) => b.code);
    expect(codes).toEqual(
      expect.arrayContaining(['MISSING_RESPONSIBLE_LAWYER', 'OVERDUE_TASKS', 'OPEN_TASKS', 'ACTIVE_REVIEW', 'OPEN_DEADLINES', 'ACTIVE_HANDOFF'])
    );
    // Litigation-item blocker is never emitted (no structured model).
    expect(codes).not.toContain('UNRESOLVED_LITIGATION_ITEM');
  });

  it('uses operational — not legal — wording', () => {
    const readiness = deriveClosureReadiness(deriveClosureBlockers({ ...base, openTaskCount: 1 }));
    expect(readiness.ready).toBe(false);
    expect(readiness.reasons[0]).toContain('operatív');
    const joined = readiness.reasons.join(' ').toLowerCase();
    expect(joined).not.toContain('jogilag lezárható');
    expect(joined).not.toContain('minden jogi kötelezettség');
  });
});

describe('lifecycle capabilities', () => {
  it('offers close only from open-like states for managers', () => {
    expect(deriveLifecycleCapabilities({ category: 'ACTIVE', isCaseManager: true }).canClose).toBe(true);
    expect(deriveLifecycleCapabilities({ category: 'ON_HOLD', isCaseManager: true }).canClose).toBe(true);
    expect(deriveLifecycleCapabilities({ category: 'CLOSED', isCaseManager: true }).canClose).toBe(false);
    expect(deriveLifecycleCapabilities({ category: 'ACTIVE', isCaseManager: false }).canClose).toBe(false);
  });

  it('never offers a two-phase closing flow', () => {
    for (const category of ['INTAKE', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'ARCHIVED'] as const) {
      expect(deriveLifecycleCapabilities({ category, isCaseManager: true }).canStartClosing).toBe(false);
    }
  });

  it('offers reopen/archive only from terminal states', () => {
    expect(deriveLifecycleCapabilities({ category: 'CLOSED', isCaseManager: true }).canReopen).toBe(true);
    expect(deriveLifecycleCapabilities({ category: 'ARCHIVED', isCaseManager: true }).canReopen).toBe(true);
    expect(deriveLifecycleCapabilities({ category: 'CLOSED', isCaseManager: true }).canArchive).toBe(true);
    expect(deriveLifecycleCapabilities({ category: 'ARCHIVED', isCaseManager: true }).canArchive).toBe(false);
    expect(deriveLifecycleCapabilities({ category: 'ACTIVE', isCaseManager: true }).canReopen).toBe(false);
  });
});

describe('validateCaseLifecycleTransition', () => {
  const noBlockers: never[] = [];

  it('rejects a non-manager actor', () => {
    const d = validateCaseLifecycleTransition({ action: 'CLOSE', currentCategory: 'ACTIVE', isCaseManager: false, blockers: noBlockers });
    expect(d.allowed).toBe(false);
    expect(d.errorCode).toBe('CASE_MANAGE_FORBIDDEN');
  });

  it('allows close from ACTIVE with no blockers and targets a persistable status', () => {
    const d = validateCaseLifecycleTransition({ action: 'CLOSE', currentCategory: 'ACTIVE', isCaseManager: true, blockers: noBlockers });
    expect(d.allowed).toBe(true);
    expect(d.targetStatus).toBe('FINAL');
  });

  it('blocks close when operational blockers remain', () => {
    const d = validateCaseLifecycleTransition({
      action: 'CLOSE',
      currentCategory: 'ACTIVE',
      isCaseManager: true,
      blockers: [{ code: 'OPEN_TASKS', label: 'Nyitott feladatok vannak.', count: 2 }],
    });
    expect(d.allowed).toBe(false);
    expect(d.errorCode).toBe('CLOSURE_BLOCKED');
    expect(d.blockers).toHaveLength(1);
  });

  it('rejects close from an already-closed state', () => {
    const d = validateCaseLifecycleTransition({ action: 'CLOSE', currentCategory: 'CLOSED', isCaseManager: true, blockers: noBlockers });
    expect(d.allowed).toBe(false);
    expect(d.errorCode).toBe('INVALID_LIFECYCLE_TRANSITION');
  });

  it('allows reopen from CLOSED/ARCHIVED but not from ACTIVE', () => {
    expect(validateCaseLifecycleTransition({ action: 'REOPEN', currentCategory: 'CLOSED', isCaseManager: true, blockers: noBlockers }).targetStatus).toBe('IN_REVIEW');
    expect(validateCaseLifecycleTransition({ action: 'REOPEN', currentCategory: 'ARCHIVED', isCaseManager: true, blockers: noBlockers }).allowed).toBe(true);
    expect(validateCaseLifecycleTransition({ action: 'REOPEN', currentCategory: 'ACTIVE', isCaseManager: true, blockers: noBlockers }).allowed).toBe(false);
  });

  it('allows archive only from CLOSED', () => {
    expect(validateCaseLifecycleTransition({ action: 'ARCHIVE', currentCategory: 'CLOSED', isCaseManager: true, blockers: noBlockers }).targetStatus).toBe('ARCHIVED');
    expect(validateCaseLifecycleTransition({ action: 'ARCHIVE', currentCategory: 'ACTIVE', isCaseManager: true, blockers: noBlockers }).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

function requestJson(app: Express, method: string, reqPath: string, headers: Record<string, string> = {}): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request(
        { hostname: '127.0.0.1', port: address.port, path: reqPath, method, headers: { 'content-type': 'application/json', ...headers } },
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

const AUTH = { authorization: 'Bearer test-token' };

function managerCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    status: 'IN_REVIEW',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    receivedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    assignedLawyerId: 'user-1',
    createdById: 'creator-1',
    assignedLawyer: { id: 'user-1', name: 'Teszt Ügyvéd' },
    ...overrides,
  };
}

function mockCounts(values: { open?: number; overdue?: number; review?: number; handoff?: number; caseDeadline?: number } = {}) {
  (prisma.task.count as jest.Mock)
    .mockResolvedValueOnce(values.open ?? 0) // openTaskCount
    .mockResolvedValueOnce(values.overdue ?? 0) // overdueTaskCount
    .mockResolvedValueOnce(values.review ?? 0); // activeReviewCount
  (prisma.lawyerHandoffPackage.count as jest.Mock).mockResolvedValueOnce(values.handoff ?? 0);
  (prisma.case.count as jest.Mock).mockResolvedValueOnce(values.caseDeadline ?? 0);
}

describe('GET /cases/:caseId/lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await requestJson(createApp(), 'GET', '/cases/case-1/lifecycle');
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown case', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await requestJson(createApp(), 'GET', '/cases/case-x/lifecycle', AUTH);
    expect(res.status).toBe(404);
  });

  it('returns the lifecycle DTO with truthful availability flags', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(managerCaseRow());
    mockCounts({ open: 2 });
    const res = await requestJson(createApp(), 'GET', '/cases/case-1/lifecycle', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.lifecycleCategory).toBe('ACTIVE');
    expect(res.body.availability).toMatchObject({ closingState: false, litigationBlockers: false });
    expect(res.body.capabilities.canStartClosing).toBe(false);
    expect(res.body.closureReadiness.ready).toBe(false);
    expect(res.body.blockers.map((b: any) => b.code)).toContain('OPEN_TASKS');
  });
});

describe('POST /cases/:caseId lifecycle transitions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forbids a non-manager from closing (403)', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(managerCaseRow({ assignedLawyerId: 'someone', createdById: 'else' }));
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/close', { ...AUTH, 'x-user': 'intruder', 'x-role': 'LAWYER' });
    expect(res.status).toBe(403);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('returns 409 with blockers when closure is not ready', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(managerCaseRow());
    mockCounts({ open: 1, overdue: 1 });
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/close', AUTH);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CLOSURE_BLOCKED');
    expect(Array.isArray(res.body.blockers)).toBe(true);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('closes a ready case to a persistable FINAL status with a content-minimal audit event', async () => {
    // findUnique is consumed by the manage-access guard, the service load and the reload.
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(managerCaseRow());
    mockCounts({}); // ready
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/close', AUTH);
    expect(res.status).toBe(200);
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case-1' }, data: expect.objectContaining({ status: 'FINAL' }) })
    );
    const updateArg = (prisma.case.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.status).not.toBe('CLOSED');
    const eventArg = (prisma.timelineEvent.create as jest.Mock).mock.calls[0][0];
    expect(eventArg.data.eventType).toBe('CASE_STATUS_CHANGED');
    expect(JSON.stringify(eventArg.data)).not.toContain('CASE_REOPENED');
  });

  it('rejects reopen from an active case (409)', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(managerCaseRow({ status: 'IN_REVIEW' }));
    const invalid = await requestJson(createApp(), 'POST', '/cases/case-1/reopen', AUTH);
    expect(invalid.status).toBe(409);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('reopens a closed case to IN_REVIEW and clears completedAt', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(managerCaseRow({ status: 'FINAL', completedAt: now }));
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/reopen', AUTH);
    expect(res.status).toBe(200);
    expect((prisma.case.update as jest.Mock).mock.calls[0][0].data).toMatchObject({ status: 'IN_REVIEW', completedAt: null });
  });

  it('archives only from a closed state', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(managerCaseRow({ status: 'FINAL' }));
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/archive', AUTH);
    expect(res.status).toBe(200);
    expect((prisma.case.update as jest.Mock).mock.calls[0][0].data.status).toBe('ARCHIVED');
  });
});
