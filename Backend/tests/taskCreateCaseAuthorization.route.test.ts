import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';

const manageCaseMock = jest.fn();
const createTaskMock = jest.fn();
const canAssignMock = jest.fn();
const parseAttentionMock = jest.fn();
const resolvePlanningMock = jest.fn();
const assertPlanningRolesMock = jest.fn();

jest.mock('../src/middleware/auth', () => ({
  ROLES: { ADMIN: 'ADMIN', PARTNER: 'PARTNER', LAWYER: 'LAWYER', COLLAB_LAWYER: 'COLLAB_LAWYER', TRAINEE: 'TRAINEE', LEGAL_ASSISTANT: 'LEGAL_ASSISTANT' },
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') { res.status(401).json({ error: 'Authentication required' }); return; }
    req.user = { userId: String(req.headers['x-actor-id'] || 'actor'), email: 'actor@test.invalid', role: String(req.headers['x-actor-role'] || 'LAWYER') as any, authProvider: 'local-jwt' };
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('../src/modules/cases/authorization', () => ({
  userCanManageCase: (...args: unknown[]) => manageCaseMock(...args),
  userCanReadCase: jest.fn(),
  requireCaseReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('../src/modules/tasks/services', () => ({
  __esModule: true,
  default: {
    createTask: (...args: unknown[]) => createTaskMock(...args),
    canAssign: (...args: unknown[]) => canAssignMock(...args),
    parseTaskAttentionInput: (...args: unknown[]) => parseAttentionMock(...args),
  },
  TaskValidationError: class TaskValidationError extends Error {},
}));
jest.mock('../src/modules/tasks/taskPlanning', () => ({
  resolveTaskPlanning: (...args: unknown[]) => resolvePlanningMock(...args),
  assertTaskPlanningRolesEligible: (...args: unknown[]) => assertPlanningRolesMock(...args),
}));
jest.mock('../src/modules/tasks/taskSubmission.routes', () => ({ __esModule: true, default: require('express').Router() }));

import routes from '../src/modules/tasks/routes';

const caseId = '11111111-1111-4111-8111-111111111111';
const missingCaseId = '22222222-2222-4222-8222-222222222222';

function app(): Express { const result = express(); result.use(express.json()); result.use('/tasks', routes); return result; }

function request(body: Record<string, unknown>, actorId = 'actor', role = 'LAWYER', authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app().listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Test server unavailable')); return; }
      const payload = JSON.stringify(body);
      const call = http.request({ hostname: '127.0.0.1', port: address.port, method: 'POST', path: '/tasks', headers: {
        ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
        'x-actor-id': actorId, 'x-actor-role': role, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
      } }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => { server.close(); const text = Buffer.concat(chunks).toString('utf8'); resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null }); });
      });
      call.on('error', (error) => { server.close(); reject(error); });
      call.end(payload);
    });
  });
}

const input = { caseId, title: 'Biztonságos feladat', type: 'OTHER', assignedTo: 'worker', plannedReviewerId: 'reviewer', collaboratorUserIds: ['colleague'], attentionCategory: 'QUICK_SCAN', estimatedMinutes: 30 };

function expectNoDownstreamEffects() {
  for (const mock of [canAssignMock, parseAttentionMock, resolvePlanningMock, assertPlanningRolesMock, createTaskMock]) expect(mock).not.toHaveBeenCalled();
}

describe('POST /api/v1/tasks CASE_MANAGE security boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    manageCaseMock.mockResolvedValue(true);
    canAssignMock.mockResolvedValue(true);
    parseAttentionMock.mockReturnValue({ attentionCategory: 'QUICK_SCAN', estimatedMinutes: 30 });
    resolvePlanningMock.mockResolvedValue({ plannedReviewerId: 'reviewer', taskDefinitionId: null, taskTypeLabelSnapshot: null, attentionCategory: 'QUICK_SCAN', estimatedMinutes: 30 });
    assertPlanningRolesMock.mockResolvedValue(undefined);
    createTaskMock.mockResolvedValue({ id: 'task-1', caseId, title: input.title, status: 'TODO' });
  });

  it('rejects unauthenticated before case lookup', async () => {
    expect((await request(input, 'actor', 'LAWYER', false)).status).toBe(401);
    expect(manageCaseMock).not.toHaveBeenCalled(); expectNoDownstreamEffects();
  });

  it('rejects a non-workforce identity before case lookup', async () => {
    const result = await request(input, 'portal-actor', 'CUSTOMER');
    expect(result).toMatchObject({ status: 403, body: { code: 'WORKFORCE_ACCESS_REQUIRED' } });
    expect(manageCaseMock).not.toHaveBeenCalled(); expectNoDownstreamEffects();
  });

  it('rejects a missing caseId before the authorization lookup or any planning', async () => {
    const { caseId: _caseId, ...withoutCase } = input;
    expect((await request(withoutCase)).status).toBe(400);
    expect(manageCaseMock).not.toHaveBeenCalled(); expectNoDownstreamEffects();
  });

  it.each([
    ['collaborator-only', 'COLLAB_LAWYER'], ['other-client-worker', 'LAWYER'], ['unrelated-workforce', 'LAWYER'],
  ])('denies %s even with planning/assignee input before any downstream call', async (actorId, role) => {
    manageCaseMock.mockResolvedValue(false);
    const result = await request(input, actorId, role);
    expect(result).toMatchObject({ status: 403, body: { code: 'CASE_ACCESS_FORBIDDEN' } });
    expect(manageCaseMock).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ userId: actorId, role }) }), caseId);
    expectNoDownstreamEffects();
  });

  it('returns the canonical 404 for a nonexistent case and does not create a task', async () => {
    manageCaseMock.mockResolvedValue(null);
    const result = await request({ ...input, caseId: missingCaseId });
    expect(result).toMatchObject({ status: 404, body: { code: 'CASE_NOT_FOUND' } });
    expectNoDownstreamEffects();
  });

  it('fails closed when case authority lookup fails', async () => {
    manageCaseMock.mockRejectedValue(new Error('synthetic database failure'));
    const result = await request(input);
    expect(result).toMatchObject({ status: 500, body: { code: 'CASE_AUTHORIZATION_ERROR' } });
    expect(JSON.stringify(result.body)).not.toContain('synthetic database failure');
    expectNoDownstreamEffects();
  });

  it.each([
    ['admin', 'ADMIN'], ['partner', 'PARTNER'], ['assigned-lawyer', 'LAWYER'], ['case-creator', 'LAWYER'],
  ])('preserves authorized %s task creation and planning', async (actorId, role) => {
    const result = await request(input, actorId, role);
    expect(result.status).toBe(201);
    expect(manageCaseMock).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ userId: actorId, role }) }), caseId);
    expect(canAssignMock).toHaveBeenCalledWith(actorId, 'worker');
    expect(resolvePlanningMock).toHaveBeenCalledTimes(1);
    expect(assertPlanningRolesMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({ caseId, assignedBy: actorId, plannedReviewerId: 'reviewer', collaboratorUserIds: ['colleague'], attentionCategory: 'QUICK_SCAN', estimatedMinutes: 30 }));
  });

  it('preserves simple authorized creation without an assignee or reviewer', async () => {
    resolvePlanningMock.mockResolvedValue({ plannedReviewerId: null, taskDefinitionId: null, taskTypeLabelSnapshot: null, attentionCategory: null, estimatedMinutes: null });
    parseAttentionMock.mockReturnValue({ attentionCategory: null, estimatedMinutes: null });
    const result = await request({ caseId, title: 'Egyszerű feladat', type: 'OTHER' }, 'assigned-lawyer', 'LAWYER');
    expect(result.status).toBe(201);
    expect(canAssignMock).not.toHaveBeenCalled();
    expect(assertPlanningRolesMock).not.toHaveBeenCalled();
    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({ caseId, title: 'Egyszerű feladat', assignedBy: 'assigned-lawyer', plannedReviewerId: null }));
  });
});
