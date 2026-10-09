/**
 * SEC-0A — POST /api/v1/tasks/auto-generate authority.
 *
 * The auto-generate route previously authenticated only, so a collaborator-only
 * or unrelated workforce actor could create a Task through the workflow-event
 * template path. It must now require canonical CASE_MANAGE before any Task side
 * effect, mirroring POST /tasks (PR #517).
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';

const manageCaseMock = jest.fn();
const autoGenerateMock = jest.fn();

jest.mock('../src/middleware/auth', () => ({
  ROLES: { ADMIN: 'ADMIN', PARTNER: 'PARTNER', LAWYER: 'LAWYER', COLLAB_LAWYER: 'COLLAB_LAWYER', TRAINEE: 'TRAINEE', LEGAL_ASSISTANT: 'LEGAL_ASSISTANT' },
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') { res.status(401).json({ error: 'Authentication required' }); return; }
    (req as any).user = { userId: String(req.headers['x-actor-id'] || 'actor'), email: 'actor@test.invalid', role: String(req.headers['x-actor-role'] || 'LAWYER') as any, authProvider: 'local-jwt' };
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
  default: { autoGenerateTask: (...args: unknown[]) => autoGenerateMock(...args) },
  TaskValidationError: class TaskValidationError extends Error {},
}));
jest.mock('../src/modules/tasks/taskPlanning', () => ({
  resolveTaskPlanning: jest.fn(),
  assertTaskPlanningRolesEligible: jest.fn(),
}));
jest.mock('../src/modules/tasks/taskSubmission.routes', () => ({ __esModule: true, default: require('express').Router() }));

import routes from '../src/modules/tasks/routes';

const caseId = '11111111-1111-4111-8111-111111111111';

function app(): Express { const result = express(); result.use(express.json()); result.use('/tasks', routes); return result; }

function request(body: Record<string, unknown>, actorId = 'actor', role = 'LAWYER', authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app().listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Test server unavailable')); return; }
      const payload = JSON.stringify(body);
      const call = http.request({ hostname: '127.0.0.1', port: address.port, method: 'POST', path: '/tasks/auto-generate', headers: {
        ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
        'x-actor-id': actorId, 'x-actor-role': role,
        'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
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

const input = { caseId, workflowEvent: 'DOCUMENT_GENERATED', originalDocumentId: 'doc-1' };

function expectNoDownstreamEffects() {
  expect(autoGenerateMock).not.toHaveBeenCalled();
}

describe('POST /api/v1/tasks/auto-generate CASE_MANAGE security boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    manageCaseMock.mockResolvedValue(true);
    autoGenerateMock.mockResolvedValue({ id: 'task-1', caseId, title: 'Szerződés első review', status: 'TODO' });
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

  it('rejects a missing caseId/workflowEvent before any lookup', async () => {
    expect((await request({ workflowEvent: 'DOCUMENT_GENERATED' })).status).toBe(400);
    expect((await request({ caseId })).status).toBe(400);
    expect(manageCaseMock).not.toHaveBeenCalled(); expectNoDownstreamEffects();
  });

  it.each([
    ['collaborator-only', 'COLLAB_LAWYER'], ['other-case-worker', 'LAWYER'], ['unrelated-workforce', 'LAWYER'],
  ])('denies %s before any auto-generate side effect', async (actorId, role) => {
    manageCaseMock.mockResolvedValue(false);
    const result = await request(input, actorId, role);
    expect(result).toMatchObject({ status: 403, body: { code: 'CASE_ACCESS_FORBIDDEN' } });
    expect(manageCaseMock).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ userId: actorId, role }) }), caseId);
    expectNoDownstreamEffects();
  });

  it('returns the canonical 404 for a nonexistent case and does not create a task', async () => {
    manageCaseMock.mockResolvedValue(null);
    const result = await request({ ...input, caseId: '22222222-2222-4222-8222-222222222222' });
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
  ])('preserves authorized %s auto-generation', async (actorId, role) => {
    const result = await request(input, actorId, role);
    expect(result.status).toBe(200);
    expect(manageCaseMock).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ userId: actorId, role }) }), caseId);
    expect(autoGenerateMock).toHaveBeenCalledWith(expect.objectContaining({ caseId, workflowEvent: 'DOCUMENT_GENERATED', triggeredBy: actorId, originalDocumentId: 'doc-1' }));
  });
});
