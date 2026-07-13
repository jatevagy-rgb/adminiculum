import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

import {
  deriveIntakeChecklist,
  deriveIntakeBlockers,
  deriveIntakeReadiness,
  deriveIntakeCapabilities,
  validateMatterActivation,
  validateMatterDecline,
  INTAKE_AVAILABILITY,
} from '../src/modules/cases/intakeReadiness';

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

jest.mock('../src/modules/tasks/services', () => ({
  createTask: jest.fn(),
}));

jest.mock('../src/prisma/prisma.service', () => {
  const prisma = {
    case: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    caseCollaborator: { findFirst: jest.fn(), findMany: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
    lawyerHandoffPackage: { count: jest.fn() },
    timelineEvent: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});

import { prisma } from '../src/prisma/prisma.service';
import casesRoutes from '../src/modules/cases/routes';

type TestResponse = { status: number; body: any };

// ---------------------------------------------------------------------------
// Pure engine
// ---------------------------------------------------------------------------

function checklistInput(overrides: Record<string, unknown> = {}) {
  return {
    hasClient: true,
    clientHasContactData: true,
    hasClientRole: true,
    hasResponsibleLawyer: true,
    hasDescription: true,
    openTaskCount: 1,
    hasInitialDeadline: true,
    caseId: 'case-1',
    ...overrides,
  } as any;
}

describe('intake readiness engine', () => {
  it('is deterministic and complete when all data is present', () => {
    const checklist = deriveIntakeChecklist(checklistInput());
    const blockers = deriveIntakeBlockers(checklist);
    const readiness = deriveIntakeReadiness(checklist, blockers);
    expect(blockers).toHaveLength(0);
    expect(readiness.readyForActivation).toBe(true);
    expect(readiness.completedRequiredItems).toBe(readiness.totalRequiredItems);
  });

  it('reports missing client / role / lawyer / description blockers', () => {
    const checklist = deriveIntakeChecklist(
      checklistInput({ hasClient: false, hasClientRole: false, hasResponsibleLawyer: false, hasDescription: false })
    );
    const codes = deriveIntakeBlockers(checklist).map((blocker) => blocker.code);
    expect(codes).toEqual([
      'MISSING_CLIENT',
      'MISSING_CLIENT_ROLE',
      'MISSING_RESPONSIBLE_LAWYER',
      'MISSING_REQUIRED_INFORMATION',
    ]);
  });

  it('never emits conflict blockers (no persistence) and marks conflict item unavailable', () => {
    const checklist = deriveIntakeChecklist(checklistInput({ hasClient: false }));
    const conflictItem = checklist.find((item) => item.code === 'CONFLICT_REVIEW');
    expect(conflictItem?.available).toBe(false);
    expect(conflictItem?.required).toBe(false);
    const codes = deriveIntakeBlockers(checklist).map((blocker) => blocker.code);
    expect(codes).not.toContain('CONFLICT_REVIEW_REQUIRED');
    expect(codes).not.toContain('CONFLICT_BLOCKED');
  });

  it('optional items (tasks, deadline, identity) do not block activation', () => {
    const checklist = deriveIntakeChecklist(
      checklistInput({ openTaskCount: 0, hasInitialDeadline: false, clientHasContactData: false })
    );
    const blockers = deriveIntakeBlockers(checklist);
    expect(blockers).toHaveLength(0);
    expect(deriveIntakeReadiness(checklist, blockers).readyForActivation).toBe(true);
  });

  it('uses operational — not legal/compliance-certification — wording', () => {
    const checklist = deriveIntakeChecklist(checklistInput({ hasDescription: false }));
    const blockers = deriveIntakeBlockers(checklist);
    const allText = [...checklist.map((item) => item.label), ...blockers.map((blocker) => blocker.label)]
      .join(' ')
      .toLowerCase();
    expect(allText).toContain('operatív');
    expect(allText).not.toContain('jogilag');
    expect(allText).not.toContain('megfelelőségi tanúsítás');
    expect(allText).not.toContain('kötelezettség teljesült');
  });
});

describe('intake capabilities', () => {
  it('never offers conflict-review recording or client re-linking', () => {
    for (const status of ['CLIENT_INPUT', 'DRAFT', 'FINAL', 'ARCHIVED']) {
      const caps = deriveIntakeCapabilities({ status, isCaseManager: true, readyForActivation: true });
      expect(caps.canRecordConflictReview).toBe(false);
      expect(caps.canEditClientLink).toBe(false);
    }
  });

  it('offers activation only to managers, in intake state, when ready', () => {
    expect(deriveIntakeCapabilities({ status: 'CLIENT_INPUT', isCaseManager: true, readyForActivation: true }).canActivateMatter).toBe(true);
    expect(deriveIntakeCapabilities({ status: 'CLIENT_INPUT', isCaseManager: true, readyForActivation: false }).canActivateMatter).toBe(false);
    expect(deriveIntakeCapabilities({ status: 'DRAFT', isCaseManager: true, readyForActivation: true }).canActivateMatter).toBe(false);
    expect(deriveIntakeCapabilities({ status: 'CLIENT_INPUT', isCaseManager: false, readyForActivation: true }).canActivateMatter).toBe(false);
  });

  it('offers decline only from the intake state', () => {
    expect(deriveIntakeCapabilities({ status: 'CLIENT_INPUT', isCaseManager: true, readyForActivation: false }).canDeclineMatter).toBe(true);
    expect(deriveIntakeCapabilities({ status: 'DRAFT', isCaseManager: true, readyForActivation: false }).canDeclineMatter).toBe(false);
  });
});

describe('validateMatterActivation / validateMatterDecline', () => {
  it('rejects a non-manager', () => {
    expect(validateMatterActivation({ currentStatus: 'CLIENT_INPUT', isCaseManager: false, blockers: [] }).errorCode).toBe('CASE_MANAGE_FORBIDDEN');
    expect(validateMatterDecline({ currentStatus: 'CLIENT_INPUT', isCaseManager: false }).errorCode).toBe('CASE_MANAGE_FORBIDDEN');
  });

  it('activates only from CLIENT_INPUT to the existing DRAFT transition target', () => {
    const ok = validateMatterActivation({ currentStatus: 'CLIENT_INPUT', isCaseManager: true, blockers: [] });
    expect(ok.allowed).toBe(true);
    expect(ok.targetStatus).toBe('DRAFT');
    expect(validateMatterActivation({ currentStatus: 'DRAFT', isCaseManager: true, blockers: [] }).errorCode).toBe('INVALID_INTAKE_STATE');
  });

  it('blocks activation with structured blockers', () => {
    const decision = validateMatterActivation({
      currentStatus: 'CLIENT_INPUT',
      isCaseManager: true,
      blockers: [{ code: 'MISSING_CLIENT', label: 'Nincs ügyfél kapcsolva az ügyhöz.' }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe('ACTIVATION_BLOCKED');
    expect(decision.blockers).toHaveLength(1);
  });

  it('declines only from CLIENT_INPUT to the persistable CANCELLED status', () => {
    const ok = validateMatterDecline({ currentStatus: 'CLIENT_INPUT', isCaseManager: true });
    expect(ok.allowed).toBe(true);
    expect(ok.targetStatus).toBe('CANCELLED');
    expect(validateMatterDecline({ currentStatus: 'IN_REVIEW', isCaseManager: true }).errorCode).toBe('INVALID_INTAKE_STATE');
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

function requestJson(
  app: Express,
  method: string,
  reqPath: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method,
          headers: {
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
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (payload) request.write(payload);
      request.end();
    });
  });
}

const AUTH = { authorization: 'Bearer test-token' };

function intakeCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    caseNumber: 'CASE-2026-001',
    title: 'Teszt ügy',
    status: 'CLIENT_INPUT',
    description: 'Rövid belső leírás',
    clientRole: 'MEGBÍZÓ',
    deadline: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    assignedLawyerId: 'user-1',
    createdById: 'creator-1',
    assignedLawyer: { id: 'user-1', name: 'Teszt Ügyvéd' },
    client: {
      id: 'client-1',
      name: 'Teszt Kft.',
      email: 'iroda@tesztkft.hu',
      phone: null,
      taxNumber: '12345678-2-42',
      companyRegistrationNumber: null,
    },
    ...overrides,
  };
}

describe('GET /cases/:caseId/intake-readiness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.caseCollaborator.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('requires authentication (401)', async () => {
    const res = await requestJson(createApp(), 'GET', '/cases/case-1/intake-readiness');
    expect(res.status).toBe(401);
  });

  it('returns safe 404 for a missing case', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await requestJson(createApp(), 'GET', '/cases/case-x/intake-readiness', AUTH);
    expect(res.status).toBe(404);
  });

  it('returns an explicit DTO with truthful conflict/availability state', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(intakeCaseRow());
    const res = await requestJson(createApp(), 'GET', '/cases/case-1/intake-readiness', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.conflictReview.status).toBe('UNAVAILABLE');
    expect(res.body.availability).toEqual(INTAKE_AVAILABILITY);
    expect(res.body.availability.conflictReviewPersistence).toBe(false);
    expect(res.body.readiness.readyForActivation).toBe(true);
    expect(res.body.capabilities.canActivateMatter).toBe(true);
    expect(res.body.capabilities.canRecordConflictReview).toBe(false);
    expect(res.body.client).toMatchObject({ id: 'client-1', type: null, identityStatus: null });
  });

  it('leaks no sensitive identity fields or raw rows', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(intakeCaseRow());
    const res = await requestJson(createApp(), 'GET', '/cases/case-1/intake-readiness', AUTH);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('taxNumber');
    expect(serialized).not.toContain('companyRegistrationNumber');
    expect(serialized).not.toContain('workspaceText');
    expect(serialized).not.toContain('notes');
  });
});

describe('POST /cases/:caseId/activate and /decline-intake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.caseCollaborator.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('activates a ready intake case to DRAFT with a content-minimized audit event', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(intakeCaseRow());
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/activate', AUTH);
    expect(res.status).toBe(200);
    expect((prisma.case.update as jest.Mock).mock.calls[0][0].data.status).toBe('DRAFT');
    const eventArg = (prisma.timelineEvent.create as jest.Mock).mock.calls[0][0];
    expect(eventArg.data.eventType).toBe('CASE_STATUS_CHANGED');
    expect(eventArg.data.metadata.intakeAction).toBe('ACTIVATE');
    // Content-minimized: no client identity data in the audit event.
    expect(JSON.stringify(eventArg.data)).not.toContain('Teszt Kft');
  });

  it('returns 409 with structured blockers when activation is not ready', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(intakeCaseRow({ clientRole: null, description: null }));
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/activate', AUTH);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACTIVATION_BLOCKED');
    expect(res.body.blockers.map((blocker: any) => blocker.code)).toEqual(
      expect.arrayContaining(['MISSING_CLIENT_ROLE', 'MISSING_REQUIRED_INFORMATION'])
    );
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('returns 409 for activation from a non-intake state (deterministic repeat)', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(intakeCaseRow({ status: 'DRAFT' }));
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/activate', AUTH);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_INTAKE_STATE');
  });

  it('forbids non-managers (403) without touching the case', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(intakeCaseRow({ assignedLawyerId: 'other', createdById: 'else' }));
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'collab-1' });
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/activate', { ...AUTH, 'x-user': 'intruder' });
    expect(res.status).toBe(403);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('declines an intake case to CANCELLED without deleting anything', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(intakeCaseRow({ clientRole: null }));
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/decline-intake', AUTH);
    expect(res.status).toBe(200);
    expect((prisma.case.update as jest.Mock).mock.calls[0][0].data.status).toBe('CANCELLED');
    const eventArg = (prisma.timelineEvent.create as jest.Mock).mock.calls[0][0];
    expect(eventArg.data.metadata.intakeAction).toBe('DECLINE');
  });

  it('rejects decline from a non-intake state (409)', async () => {
    (prisma.case.findUnique as jest.Mock).mockResolvedValue(intakeCaseRow({ status: 'IN_REVIEW' }));
    const res = await requestJson(createApp(), 'POST', '/cases/case-1/decline-intake', AUTH);
    expect(res.status).toBe(409);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });
});
