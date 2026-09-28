/**
 * MAILBOX OWNER PRIVACY BOUNDARY — focused tests (MF-MAILBOX-PRIVACY-BOUNDARY-1).
 *
 * Mailbox ownership is a privacy boundary above role: a user may read
 * mailbox-derived email ONLY when the mailbox belongs to that authenticated DB
 * user. ADMIN/PARTNER never bypass it. Non-mailbox (MANUAL) communication keeps
 * its existing authorization behavior.
 *
 * These tests exercise the canonical helper AND the real route/service
 * surfaces against an in-memory Prisma double that applies the generated
 * `where` shapes, so list/count scoping is verified behaviourally.
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

type Row = Record<string, any>;

// ---------------------------------------------------------------------------
// In-memory Prisma double
// ---------------------------------------------------------------------------

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function matchesWhere(row: Row, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND) && !where.AND.every((part: any) => matchesWhere(row, part))) return false;
  if (Array.isArray(where.OR) && !where.OR.some((part: any) => matchesWhere(row, part))) return false;

  if ('id' in where) {
    const value = where.id;
    if (value && typeof value === 'object' && Array.isArray(value.in)) {
      if (!value.in.includes(row.id)) return false;
    } else if (row.id !== value) {
      return false;
    }
  }
  if ('caseId' in where) {
    const value = where.caseId;
    if (value === null) {
      if (row.caseId != null) return false;
    } else if (value && typeof value === 'object' && Array.isArray(value.in)) {
      if (!value.in.includes(row.caseId)) return false;
    } else if (row.caseId !== value) {
      return false;
    }
  }
  if ('clientId' in where) {
    const value = where.clientId;
    if (value === null) {
      if (row.clientId != null) return false;
    } else if (row.clientId !== value) {
      return false;
    }
  }
  if ('createdById' in where && row.createdById !== where.createdById) return false;
  if ('type' in where && row.type !== where.type) return false;
  if ('documentId' in where && row.documentId !== where.documentId) return false;
  if ('mailboxConnectionId' in where) {
    const value = where.mailboxConnectionId;
    if (value === null) {
      if (row.mailboxConnectionId != null) return false;
    } else if (value && typeof value === 'object' && Array.isArray(value.in)) {
      if (!value.in.includes(row.mailboxConnectionId)) return false;
    } else if (row.mailboxConnectionId !== value) {
      return false;
    }
  }
  if ('source' in where) {
    const value = where.source;
    if (value === null) {
      if (row.source != null) return false;
    } else if (row.source !== value) {
      return false;
    }
  }
  if ('mailboxAddress' in where) {
    const value = where.mailboxAddress;
    if (value && typeof value === 'object' && value.equals != null) {
      if (normalize(row.mailboxAddress) !== normalize(value.equals)) return false;
    }
  }
  if ('receivedAt' in where) {
    const value = where.receivedAt;
    if (value === null) {
      if (row.receivedAt != null) return false;
    } else if (value && typeof value === 'object' && value.not === null) {
      if (row.receivedAt == null) return false;
    }
  }
  if ('sentAt' in where) {
    const value = where.sentAt;
    if (value === null) {
      if (row.sentAt != null) return false;
    } else if (value && typeof value === 'object' && value.not === null) {
      if (row.sentAt == null) return false;
    }
  }
  return true;
}

function applyOrderBy(rows: Row[], orderBy: any): Row[] {
  const specs = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  if (specs.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const spec of specs) {
      for (const [key, direction] of Object.entries(spec as Record<string, unknown>)) {
        const a = left[key];
        const b = right[key];
        if (a === b) continue;
        const cmp = a == null ? -1 : b == null ? 1 : a < b ? -1 : 1;
        return String(direction) === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  });
}

const state: { rows: Row[]; userEmail: string; connectionIds: string[] } = {
  rows: [],
  userEmail: 'user-a@firm.example',
  connectionIds: ['conn-a'],
};

const prismaMock: any = {
  user: {
    findUnique: jest.fn(async () => ({
      id: 'user-a',
      role: 'ADMIN',
      status: 'ACTIVE',
      isActive: true,
      email: state.userEmail,
      mailboxConnections: state.connectionIds.map((id) => ({ id })),
    })),
  },
  communication: {
    findMany: jest.fn(async (args: any) => {
      const filtered = state.rows.filter((row) => matchesWhere(row, args?.where));
      const ordered = applyOrderBy(filtered, args?.orderBy);
      return args?.take != null ? ordered.slice(0, args.take) : ordered;
    }),
    count: jest.fn(async (args: any) => state.rows.filter((row) => matchesWhere(row, args?.where)).length),
    findUnique: jest.fn(async (args: any) => state.rows.find((row) => row.id === args?.where?.id) ?? null),
  },
  communicationAttachment: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  caseCollaborator: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
  case: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
  task: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  document: { findMany: jest.fn(async () => []) },
  comment: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) },
  timelineEvent: { findMany: jest.fn(async () => []), create: jest.fn() },
  lawyerHandoffPackage: { findMany: jest.fn(async () => []) },
  client: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null) },
};

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    (req as any).user = {
      userId: String(req.headers['x-test-user-id'] || 'user-a'),
      role: String(req.headers['x-test-role'] || 'ADMIN'),
      // Deliberately a client-supplied email the server must never trust.
      email: 'forged-client-email@evil.invalid',
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/middleware/featureAvailability', () => ({
  isDatabaseFoundationEnabled: () => true,
  requireDatabaseFoundation: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));
jest.mock('../src/config/database', () => ({ __esModule: true, default: prismaMock }));

jest.mock('../src/modules/workflow', () => ({
  workflowService: {
    isValidStatus: jest.fn(() => true),
    getWorkflowGraph: jest.fn(),
    getWorkflowHistory: jest.fn(),
  },
}));

jest.mock('../src/modules/tasks/services', () => ({
  canUserActOnTask: jest.fn(),
  createTaskFromCommunicationSource: jest.fn(),
  SourceLinkedTaskError: class SourceLinkedTaskError extends Error {},
}));

import communicationsRoutes from '../src/modules/communications/routes';
import casesRoutes from '../src/modules/cases/routes';
import { listClientCommunicationSummary } from '../src/modules/communications/clientSummary.service';
import {
  buildMailboxPrivacyWhere,
  isCommunicationVisibleUnderMailboxPrivacy,
  resolveCommunicationPrivacyScope,
  type CommunicationPrivacyScope,
} from '../src/modules/communications/readScope';

type TestResponse = { status: number; body: any };

function request(
  app: Express,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<TestResponse> {
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
          path,
          method,
          headers: { authorization: 'Bearer test-token', ...headers },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
          });
        },
      );
      req.on('error', (error) => {
        server.close();
        reject(error);
      });
      req.end();
    });
  });
}

function communicationsApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/communications', communicationsRoutes);
  return app;
}

function casesApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRoutes);
  return app;
}

function communicationRow(overrides: Row = {}): Row {
  return {
    id: 'comm-x',
    type: 'EMAIL',
    subject: 'Subject',
    senderName: 'Sender',
    senderEmail: 'sender@example.invalid',
    recipientName: null,
    recipientEmail: null,
    content: 'Body',
    summary: null,
    caseId: null,
    clientId: null,
    documentId: null,
    createdById: 'user-a',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    providerConversationId: null,
    direction: null,
    receivedAt: null,
    sentAt: null,
    source: null,
    syncStatus: null,
    metadata: null,
    mailboxConnectionId: null,
    mailboxAddress: null,
    ...overrides,
  };
}

const baseScope: CommunicationPrivacyScope = {
  userId: 'user-a',
  canonicalEmail: 'user-a@firm.example',
  ownedMailboxConnectionIds: ['conn-a'],
};

beforeEach(() => {
  jest.clearAllMocks();
  state.rows = [];
  state.userEmail = 'user-a@firm.example';
  state.connectionIds = ['conn-a'];
  prismaMock.case.findUnique.mockResolvedValue({
    id: 'case-1',
    assignedLawyerId: 'user-a',
    createdById: 'user-a',
    caseNumber: 'CASE-1',
    title: 'Matter',
    status: 'ACTIVE',
    priority: 'HIGH',
    client: null,
    assignedLawyer: null,
  });
  prismaMock.caseCollaborator.findFirst.mockResolvedValue(null);
  prismaMock.task.findMany.mockResolvedValue([]);
  prismaMock.document.findMany.mockResolvedValue([]);
  prismaMock.comment.findMany.mockResolvedValue([]);
  prismaMock.comment.groupBy.mockResolvedValue([]);
  prismaMock.timelineEvent.findMany.mockResolvedValue([]);
  prismaMock.communicationAttachment.findMany.mockResolvedValue([]);
  prismaMock.communicationAttachment.count.mockResolvedValue(0);
  prismaMock.lawyerHandoffPackage.findMany.mockResolvedValue([]);
  prismaMock.client.findMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Canonical predicate / scope resolution
// ---------------------------------------------------------------------------

describe('mailbox privacy canonical predicate', () => {
  it('treats CommunicationMailboxConnection.ownerUserId as authoritative for every role', () => {
    const own = { mailboxConnectionId: 'conn-a', source: 'MAILBOX', mailboxAddress: 'user-a@firm.example' };
    const foreign = { mailboxConnectionId: 'conn-b', source: 'MAILBOX', mailboxAddress: 'user-a@firm.example' };
    expect(isCommunicationVisibleUnderMailboxPrivacy(own, baseScope)).toBe(true);
    expect(isCommunicationVisibleUnderMailboxPrivacy(foreign, baseScope)).toBe(false);
    // Role is not part of the predicate: the same rule holds for ADMIN/PARTNER/LAWYER scopes.
    expect(isCommunicationVisibleUnderMailboxPrivacy(foreign, { ...baseScope, userId: 'admin-b' })).toBe(false);
  });

  it('case linkage never overrides mailbox ownership', () => {
    const foreignLinkedToReadableCase = {
      mailboxConnectionId: 'conn-b',
      source: 'MAILBOX',
      caseId: 'case-1',
      clientId: 'client-1',
    };
    expect(isCommunicationVisibleUnderMailboxPrivacy(foreignLinkedToReadableCase, baseScope)).toBe(false);
  });

  it('keeps non-mailbox rows outside the boundary', () => {
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: null }, baseScope)).toBe(true);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'MANUAL' }, baseScope)).toBe(true);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'MANUAL' }, null)).toBe(true);
  });

  it('legacy OUTLOOK uses a case-insensitive exact mailboxAddress match', () => {
    const own = { source: 'OUTLOOK', mailboxAddress: '  User-A@FIRM.example ' };
    expect(isCommunicationVisibleUnderMailboxPrivacy(own, baseScope)).toBe(true);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK', mailboxAddress: 'user-b@firm.example' }, baseScope)).toBe(false);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK', mailboxAddress: 'attacker@evil.example' }, baseScope)).toBe(false);
  });

  it('legacy OUTLOOK without a provable address fails closed', () => {
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK' }, baseScope)).toBe(false);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK', mailboxAddress: null }, baseScope)).toBe(false);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK', mailboxAddress: '' }, baseScope)).toBe(false);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK', mailboxAddress: 'user-a@firm.example' }, null)).toBe(false);
  });

  it('same domain alone never grants access', () => {
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK', mailboxAddress: 'colleague@firm.example' }, baseScope)).toBe(false);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK', mailboxAddress: 'user-a@other.example' }, baseScope)).toBe(false);
  });

  it('fails closed for a mailbox-source row whose connection cannot be proven', () => {
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'MAILBOX' }, baseScope)).toBe(false);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'MAILBOX', mailboxAddress: 'user-a@firm.example' }, baseScope)).toBe(false);
  });

  it('resolves the canonical email from the DB, never from the request user object', async () => {
    const db = {
      user: {
        findUnique: jest.fn(async () => ({
          email: 'canonical@firm.example',
          mailboxConnections: [{ id: 'conn-1' }],
        })),
      },
    };
    const scope = await resolveCommunicationPrivacyScope('user-x', db as never);
    expect(scope.canonicalEmail).toBe('canonical@firm.example');
    expect(scope.ownedMailboxConnectionIds).toEqual(['conn-1']);
  });

  it('fails closed when the identity lookup fails', async () => {
    const db = { user: { findUnique: jest.fn(async () => { throw new Error('db down'); }) } };
    const scope = await resolveCommunicationPrivacyScope('user-x', db as never);
    expect(scope).toEqual({ userId: 'user-x', canonicalEmail: null, ownedMailboxConnectionIds: [] });
    expect(isCommunicationVisibleUnderMailboxPrivacy({ mailboxConnectionId: 'conn-1' }, scope)).toBe(false);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'OUTLOOK', mailboxAddress: 'user-x@firm.example' }, scope)).toBe(false);
    expect(isCommunicationVisibleUnderMailboxPrivacy({ source: 'MANUAL' }, scope)).toBe(true);
  });

  it('builds a where fragment with owned connections, legacy outlook match, and untouched non-mailbox rows', () => {
    const where: any = buildMailboxPrivacyWhere(baseScope);
    expect(where.OR).toEqual([
      { mailboxConnectionId: { in: ['conn-a'] } },
      { mailboxConnectionId: null, source: 'OUTLOOK', mailboxAddress: { equals: 'user-a@firm.example', mode: 'insensitive' } },
      { mailboxConnectionId: null, source: null },
      { mailboxConnectionId: null, source: 'MANUAL' },
    ]);
    const none: any = buildMailboxPrivacyWhere(null);
    expect(none.OR).toEqual([
      { mailboxConnectionId: null, source: null },
      { mailboxConnectionId: null, source: 'MANUAL' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// GET /communications — list AND count share the identical scope
// ---------------------------------------------------------------------------

describe('communications list/count mailbox privacy', () => {
  it('shows ADMIN only own-mailbox, own legacy outlook, and non-mailbox rows', async () => {
    state.rows = [
      communicationRow({ id: 'own-mailbox', mailboxConnectionId: 'conn-a', source: 'MAILBOX', mailboxAddress: 'user-a@firm.example', caseId: 'case-1' }),
      communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', mailboxAddress: 'user-b@firm.example', caseId: 'case-1', createdById: 'user-b' }),
      communicationRow({ id: 'own-outlook', source: 'OUTLOOK', mailboxAddress: 'User-A@FIRM.example', createdAt: new Date('2026-01-03T00:00:00.000Z') }),
      communicationRow({ id: 'foreign-outlook', source: 'OUTLOOK', mailboxAddress: 'user-b@firm.example', createdById: 'user-b' }),
      communicationRow({ id: 'same-domain-outlook', source: 'OUTLOOK', mailboxAddress: 'colleague@firm.example', createdById: 'user-c' }),
      communicationRow({ id: 'manual-case', source: 'MANUAL', caseId: 'case-1', createdById: 'user-b' }),
    ];

    const response = await request(communicationsApp(), 'GET', '/communications');
    expect(response.status).toBe(200);
    const ids = response.body.communications.map((item: any) => item.id).sort();
    expect(ids).toEqual(['manual-case', 'own-mailbox', 'own-outlook']);
    // Count uses the identical scope as the list.
    expect(response.body.pagination.total).toBe(3);
  });

  it('PARTNER cannot bypass foreign mailbox ownership', async () => {
    state.rows = [
      communicationRow({ id: 'own-mailbox', mailboxConnectionId: 'conn-a', source: 'MAILBOX' }),
      communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', createdById: 'user-b' }),
    ];
    const response = await request(communicationsApp(), 'GET', '/communications', { 'x-test-role': 'PARTNER' });
    expect(response.status).toBe(200);
    expect(response.body.communications.map((item: any) => item.id)).toEqual(['own-mailbox']);
    expect(response.body.pagination.total).toBe(1);
  });

  it('a LAWYER sees only their own mailbox and their manual case rows', async () => {
    state.userEmail = 'lawyer-a@firm.example';
    state.connectionIds = ['conn-lawyer'];
    prismaMock.case.findMany.mockResolvedValue([{ id: 'case-1' }]);
    state.rows = [
      communicationRow({ id: 'own-mailbox', mailboxConnectionId: 'conn-lawyer', source: 'MAILBOX', createdById: 'lawyer-a' }),
      communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', caseId: 'case-1', createdById: 'user-b' }),
      communicationRow({ id: 'manual-own-case', source: 'MANUAL', caseId: 'case-1', createdById: 'user-b' }),
    ];
    const response = await request(communicationsApp(), 'GET', '/communications', {
      'x-test-role': 'LAWYER',
      'x-test-user-id': 'lawyer-a',
    });
    expect(response.status).toBe(200);
    const ids = response.body.communications.map((item: any) => item.id).sort();
    expect(ids).toEqual(['manual-own-case', 'own-mailbox']);
    expect(response.body.pagination.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GET /communications/:id — detail and attachments
// ---------------------------------------------------------------------------

describe('communication detail mailbox privacy', () => {
  it('returns 403 for another user’s mailbox communication, even for ADMIN', async () => {
    state.rows = [communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', caseId: 'case-1', createdById: 'user-b' })];
    const response = await request(communicationsApp(), 'GET', '/communications/foreign-mailbox');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('COMMUNICATION_ACCESS_FORBIDDEN');
  });

  it('returns 403 for a foreign legacy OUTLOOK communication', async () => {
    state.rows = [communicationRow({ id: 'foreign-outlook', source: 'OUTLOOK', mailboxAddress: 'user-b@firm.example', createdById: 'user-b' })];
    const response = await request(communicationsApp(), 'GET', '/communications/foreign-outlook', { 'x-test-role': 'PARTNER' });
    expect(response.status).toBe(403);
  });

  it('returns the detail for the owner’s own mailbox communication', async () => {
    state.rows = [communicationRow({ id: 'own-mailbox', mailboxConnectionId: 'conn-a', source: 'MAILBOX', createdById: 'user-a' })];
    const response = await request(communicationsApp(), 'GET', '/communications/own-mailbox', { 'x-test-role': 'LAWYER' });
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('own-mailbox');
  });

  it('returns 404 for a missing communication and preserves manual creator/case rules', async () => {
    state.rows = [
      communicationRow({ id: 'manual-own', source: 'MANUAL', createdById: 'lawyer-a' }),
      communicationRow({ id: 'manual-foreign', source: 'MANUAL', createdById: 'user-b' }),
      communicationRow({ id: 'manual-case', source: 'MANUAL', caseId: 'case-1', createdById: 'user-b' }),
    ];
    const missing = await request(communicationsApp(), 'GET', '/communications/does-not-exist');
    expect(missing.status).toBe(404);

    const creator = await request(communicationsApp(), 'GET', '/communications/manual-own', { 'x-test-user-id': 'lawyer-a', 'x-test-role': 'LAWYER' });
    expect(creator.status).toBe(200);

    const foreign = await request(communicationsApp(), 'GET', '/communications/manual-foreign', { 'x-test-user-id': 'lawyer-a', 'x-test-role': 'LAWYER' });
    expect(foreign.status).toBe(403);

    prismaMock.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'lawyer-a', createdById: 'user-a' });
    const caseVisible = await request(communicationsApp(), 'GET', '/communications/manual-case', { 'x-test-user-id': 'lawyer-a', 'x-test-role': 'LAWYER' });
    expect(caseVisible.status).toBe(200);

    const adminManual = await request(communicationsApp(), 'GET', '/communications/manual-foreign');
    expect(adminManual.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Client communication summary
// ---------------------------------------------------------------------------

describe('client communication summary mailbox privacy', () => {
  it('excludes foreign mailbox rows from the client summary', async () => {
    const rows = [
      communicationRow({ id: 'own-mailbox', mailboxConnectionId: 'conn-a', source: 'MAILBOX', clientId: 'client-1', createdAt: new Date('2026-01-03T00:00:00.000Z') }),
      communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', clientId: 'client-1', createdById: 'user-b', createdAt: new Date('2026-01-02T00:00:00.000Z') }),
      communicationRow({ id: 'manual', source: 'MANUAL', clientId: 'client-1', createdAt: new Date('2026-01-01T00:00:00.000Z') }),
    ];
    const db = {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-a',
          role: 'ADMIN',
          status: 'ACTIVE',
          isActive: true,
          email: 'user-a@firm.example',
          mailboxConnections: [{ id: 'conn-a' }],
        })),
      },
      client: { findUnique: jest.fn(async () => ({ id: 'client-1', name: 'Client' })) },
      case: { findMany: jest.fn(async () => []) },
      caseCollaborator: { findMany: jest.fn(async () => []) },
      communication: { findMany: jest.fn(async (args: any) => applyFakeWhere(rows, args?.where)) },
      communicationAttachment: { findMany: jest.fn(async () => []) },
      task: { findMany: jest.fn(async () => []) },
    } as never;

    const result = await listClientCommunicationSummary({ userId: 'user-a', role: 'ADMIN' }, 'client-1', {}, db);
    const ids = result.communications.map((item) => item.id).sort();
    expect(ids).toEqual(['manual', 'own-mailbox']);
  });
});

function applyFakeWhere(rows: Row[], where: any): Row[] {
  return rows.filter((row) => matchesWhere(row, where));
}

// ---------------------------------------------------------------------------
// Case workspace / activity / work items / workflow summary
// ---------------------------------------------------------------------------

describe('case surfaces mailbox privacy', () => {
  it('case workspace communication list/count and activity respect mailbox ownership', async () => {
    state.rows = [
      communicationRow({ id: 'own-mailbox', mailboxConnectionId: 'conn-a', source: 'MAILBOX', caseId: 'case-1' }),
      communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', caseId: 'case-1', createdById: 'user-b' }),
      communicationRow({ id: 'manual-case', source: 'MANUAL', caseId: 'case-1' }),
    ];

    const workspaceResponse = await request(casesApp(), 'GET', '/cases/case-1/workspace');
    expect(workspaceResponse.status).toBe(200);
    const communicationIds = workspaceResponse.body.communications.map((item: any) => item.id).sort();
    expect(communicationIds).toEqual(['manual-case', 'own-mailbox']);
    expect(workspaceResponse.body.metrics.communicationCount).toBe(2);
    const activityIds = workspaceResponse.body.activity.filter((item: any) => item.objectType === 'COMMUNICATION').map((item: any) => item.objectId).sort();
    expect(activityIds).toEqual(['manual-case', 'own-mailbox']);
  });

  it('case activity excludes foreign mailbox rows and nulls their source links', async () => {
    state.rows = [
      communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', caseId: 'case-1', createdById: 'user-b' }),
      communicationRow({ id: 'manual-case', source: 'MANUAL', caseId: 'case-1' }),
    ];
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Task linked to foreign mail',
        description: null,
        status: 'TODO',
        taskType: null,
        dueDate: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        documentId: null,
        sourceCommunicationId: 'foreign-mailbox',
      },
    ]);
    prismaMock.timelineEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        eventType: 'CLIENT_CONTACT',
        type: 'CLIENT_CONTACT',
        description: 'contact',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        documentId: null,
        communicationId: 'foreign-mailbox',
        taskId: null,
      },
    ]);

    const response = await request(casesApp(), 'GET', '/cases/case-1/activity');
    expect(response.status).toBe(200);
    const communicationItems = response.body.items.filter((item: any) => item.kind === 'COMMUNICATION');
    expect(communicationItems.map((item: any) => item.communicationId)).toEqual(['manual-case']);
    const taskItem = response.body.items.find((item: any) => item.kind === 'TASK');
    expect(taskItem.communicationId).toBeNull();
    const timelineItem = response.body.items.find((item: any) => item.kind === 'TIMELINE');
    expect(timelineItem.communicationId).toBeNull();
  });

  it('case work items exclude foreign mailbox rows and fall task sources back to the case', async () => {
    state.rows = [
      communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', caseId: 'case-1', createdById: 'user-b' }),
      communicationRow({ id: 'manual-case', source: 'MANUAL', caseId: 'case-1' }),
    ];
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Task linked to foreign mail',
        description: null,
        status: 'TODO',
        priority: 'MEDIUM',
        dueDate: null,
        completedAt: null,
        submittedAt: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        caseId: 'case-1',
        assignedToId: 'user-a',
        assignedById: 'user-a',
        documentId: null,
        sourceCommunicationId: 'foreign-mailbox',
        assignedTo: { id: 'user-a', name: 'User A', email: 'user-a@firm.example' },
        assignedBy: { id: 'user-a', name: 'User A', email: 'user-a@firm.example' },
      },
    ]);

    const response = await request(casesApp(), 'GET', '/cases/case-1/work-items');
    expect(response.status).toBe(200);
    const itemIds = response.body.items.map((item: any) => item.id);
    expect(itemIds).not.toContain('communication-foreign-mailbox');
    expect(itemIds).toContain('communication-manual-case');
    const taskItem = response.body.items.find((item: any) => item.id === 'task-1');
    expect(taskItem.source.type).toBe('CASE');
    expect(taskItem.capabilities.canOpenSource).toBe(false);
  });

  it('workflow summary latestCommunication skips a newer foreign mailbox row', async () => {
    state.rows = [
      communicationRow({ id: 'foreign-mailbox', mailboxConnectionId: 'conn-b', source: 'MAILBOX', caseId: 'case-1', createdById: 'user-b', createdAt: new Date('2026-01-05T00:00:00.000Z') }),
      communicationRow({ id: 'own-mailbox', mailboxConnectionId: 'conn-a', source: 'MAILBOX', caseId: 'case-1', createdAt: new Date('2026-01-04T00:00:00.000Z') }),
    ];

    const response = await request(casesApp(), 'GET', '/cases/case-1/workflow-summary');
    expect(response.status).toBe(200);
    expect(response.body.latestCommunication.id).toBe('own-mailbox');
  });
});
