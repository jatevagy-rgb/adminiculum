/**
 * SEC-0A — GET /api/v1/communications/:id/tasks read authority (SEC-E, DISPROVED).
 *
 * The finding claimed the communication task list had no object read gate. The
 * route is actually behind the communications `router.param('id')` middleware,
 * which enforces canonical mailbox + case/creator READ authority before the
 * handler runs. This proves an unrelated actor cannot learn Task/user metadata.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';

const mockPrisma = {
  communication: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  task: { findMany: jest.fn() },
};

jest.mock('../src/middleware/auth', () => ({
  ROLES: { ADMIN: 'ADMIN', PARTNER: 'PARTNER', LAWYER: 'LAWYER', COLLAB_LAWYER: 'COLLAB_LAWYER', TRAINEE: 'TRAINEE', LEGAL_ASSISTANT: 'LEGAL_ASSISTANT' },
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') { res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authentication required.' }); return; }
    (req as any).user = { userId: String(req.headers['x-actor-id'] || 'actor'), role: String(req.headers['x-actor-role'] || 'LAWYER') as any };
    next();
  },
}));

jest.mock('../src/middleware/workforceAuthorization', () => ({
  requireWorkforceUser: (_req: Request, _res: Response, next: NextFunction) => next(),
  isWorkforceRole: () => true,
}));

jest.mock('../src/middleware/featureAvailability', () => ({
  isDatabaseFoundationEnabled: () => true,
  requireDatabaseFoundation: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockPrisma }));
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockPrisma }));
jest.mock('../src/modules/tasks/services', () => ({
  __esModule: true,
  canUserActOnTask: jest.fn(),
  createCanonicalTaskFromCommunication: jest.fn(),
  SourceLinkedTaskError: class SourceLinkedTaskError extends Error {},
}));

import communicationsRoutes from '../src/modules/communications/routes';

function app(): Express { const result = express(); result.use(express.json()); result.use('/communications', communicationsRoutes); return result; }

function request(actorId = 'actor', role = 'LAWYER', authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app().listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Test server unavailable')); return; }
      const call = http.request({ hostname: '127.0.0.1', port: address.port, method: 'GET', path: '/communications/comm-1/tasks', headers: {
        ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
        'x-actor-id': actorId, 'x-actor-role': role,
      } }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => { server.close(); const text = Buffer.concat(chunks).toString('utf8'); resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null }); });
      });
      call.on('error', (error) => { server.close(); reject(error); });
      call.end();
    });
  });
}

describe('GET /api/v1/communications/:id/tasks — canonical READ authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.communication.findUnique.mockResolvedValue({ id: 'comm-1', caseId: 'case-1', createdById: 'creator-1', mailboxConnectionId: null, source: 'MANUAL', mailboxAddress: null });
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', assignedLawyerId: 'lawyer-1', createdById: 'creator-1' });
    mockPrisma.caseCollaborator.findFirst.mockResolvedValue(null);
    mockPrisma.task.findMany.mockResolvedValue([]);
  });

  it('blocks an unrelated actor before any task query', async () => {
    const result = await request('outsider', 'LAWYER');
    expect(result).toMatchObject({ status: 403, body: { code: 'COMMUNICATION_ACCESS_FORBIDDEN' } });
    expect(mockPrisma.task.findMany).not.toHaveBeenCalled();
  });

  it('blocks a same-client other-case actor (no case membership)', async () => {
    const result = await request('other-case-worker', 'LAWYER');
    expect(result.status).toBe(403);
    expect(mockPrisma.task.findMany).not.toHaveBeenCalled();
  });

  it('blocks an unauthenticated caller', async () => {
    expect((await request('actor', 'LAWYER', false)).status).toBe(401);
    expect(mockPrisma.task.findMany).not.toHaveBeenCalled();
  });

  it('allows an assigned lawyer (canonical reader) to list linked tasks', async () => {
    mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1', title: 'Follow up', assignedTo: { id: 'lawyer-1', name: 'Lawyer' }, assignedBy: { id: 'creator-1', name: 'Creator' } }]);
    const result = await request('lawyer-1', 'LAWYER');
    expect(result.status).toBe(200);
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sourceCommunicationId: 'comm-1' } }));
  });

  it('allows the communication creator (canonical reader)', async () => {
    const result = await request('creator-1', 'LAWYER');
    expect(result.status).toBe(200);
    expect(mockPrisma.task.findMany).toHaveBeenCalled();
  });
});
