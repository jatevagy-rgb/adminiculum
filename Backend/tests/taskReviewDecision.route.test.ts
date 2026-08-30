import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const serviceMock = {
  getReviewDetail: jest.fn(),
  returnSubmission: jest.fn(),
  reviseSubmission: jest.fn(),
  approveSubmission: jest.fn(),
  recordExternalCompletion: jest.fn(),
};

class MockTaskReviewDecisionServiceError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = { userId: 'actor-1', email: 'actor@example.invalid', role: 'LAWYER', authProvider: 'local-jwt' };
    next();
  },
}));

jest.mock('../src/modules/tasks/taskReviewDecision.service', () => ({
  __esModule: true,
  default: serviceMock,
  TaskReviewDecisionServiceError: MockTaskReviewDecisionServiceError,
}));

import taskReviewDecisionRoutes from '../src/modules/tasks/taskReviewDecision.routes';

const ids = {
  task: '11111111-1111-4111-8111-111111111111',
  submission: '22222222-2222-4222-8222-222222222222',
};

interface TestResponse {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use('/tasks', taskReviewDecisionRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = { authorization: 'Bearer test-token' },
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server unavailable'));
        return;
      }
      const payload = body === undefined ? '' : JSON.stringify(body);
      const request = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        method,
        path,
        headers: {
          ...headers,
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null, headers: response.headers });
        });
      });
      request.on('error', (error) => { server.close(); reject(error); });
      request.end(payload);
    });
  });
}

describe('task review decision routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serviceMock.getReviewDetail.mockResolvedValue({ reviewVersion: 'version-1', submission: { id: ids.submission } });
    serviceMock.returnSubmission.mockResolvedValue({ idempotentReplay: false, review: { submission: { id: ids.submission } } });
    serviceMock.reviseSubmission.mockResolvedValue({ idempotentReplay: false, draft: { id: ids.submission } });
    serviceMock.approveSubmission.mockResolvedValue({ idempotentReplay: false, review: { submission: { id: ids.submission } } });
    serviceMock.recordExternalCompletion.mockResolvedValue({ idempotentReplay: false, review: { submission: { id: ids.submission } } });
  });

  it('authenticates before review detail access', async () => {
    const response = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/submissions/${ids.submission}/review`, undefined, {});
    expect(response.status).toBe(401);
    expect(serviceMock.getReviewDetail).not.toHaveBeenCalled();
  });

  it('rejects malformed identifiers before service access', async () => {
    const response = await requestJson(createApp(), 'GET', `/tasks/${encodeURIComponent('bad\u0000id')}/submissions/${ids.submission}/review`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_ID');
    expect(serviceMock.getReviewDetail).not.toHaveBeenCalled();
  });

  it('allows canonical non-UUID task and submission IDs through review decisions', async () => {
    const taskId = '0123456789abcdef0123456789abcdef';
    const submissionId = 'fedcba9876543210fedcba9876543210';
    const response = await requestJson(createApp(), 'GET', `/tasks/${taskId}/submissions/${submissionId}/review`);

    expect(response.status).toBe(200);
    expect(serviceMock.getReviewDetail).toHaveBeenCalledWith(taskId, submissionId, 'actor-1');
  });

  it('returns review detail with an optimistic ETag', async () => {
    const response = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/submissions/${ids.submission}/review`);
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"version-1"');
    expect(serviceMock.getReviewDetail).toHaveBeenCalledWith(ids.task, ids.submission, 'actor-1');
  });

  it('passes bounded return input and required request guards', async () => {
    const body = { note: 'Javítás kell', requestedCorrections: 'Pontosítsa a hivatkozást.', requiresFullReview: true };
    const response = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/return`, body, {
      authorization: 'Bearer test-token', 'idempotency-key': 'return-key', 'if-match': 'version-1',
    });
    expect(response.status).toBe(200);
    expect(serviceMock.returnSubmission).toHaveBeenCalledWith(ids.task, ids.submission, 'actor-1', 'return-key', 'version-1', body);
  });

  it('creates a revised draft and preserves idempotent status codes', async () => {
    const response = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/revise`, {}, {
      authorization: 'Bearer test-token', 'idempotency-key': 'revise-key',
    });
    expect(response.status).toBe(201);
    serviceMock.reviseSubmission.mockResolvedValueOnce({ idempotentReplay: true, draft: { id: ids.submission } });
    const replay = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/revise`, {}, {
      authorization: 'Bearer test-token', 'idempotency-key': 'revise-key',
    });
    expect(replay.status).toBe(200);
  });

  it('passes approval note, version and idempotency key', async () => {
    const body = { note: 'Jóváhagyható.' };
    const response = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/approve`, body, {
      authorization: 'Bearer test-token', 'idempotency-key': 'approve-key', 'if-match': 'version-1',
    });
    expect(response.status).toBe(200);
    expect(serviceMock.approveSubmission).toHaveBeenCalledWith(ids.task, ids.submission, 'actor-1', 'approve-key', 'version-1', body);
  });

  it('passes only safe external completion metadata', async () => {
    const body = { actionType: 'CLIENT_SEND', completedAt: '2026-07-18T10:00:00.000Z' };
    const response = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/external-completion`, body, {
      authorization: 'Bearer test-token', 'idempotency-key': 'external-key',
    });
    expect(response.status).toBe(200);
    expect(serviceMock.recordExternalCompletion).toHaveBeenCalledWith(ids.task, ids.submission, 'actor-1', 'external-key', body);
  });

  it('rejects external payload and review fields outside the contract', async () => {
    const response = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/external-completion`, {
      actionType: 'CLIENT_SEND', providerPayload: { secret: true },
    }, { authorization: 'Bearer test-token', 'idempotency-key': 'external-key' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('REVIEW_FIELD_NOT_ACCEPTED');
    expect(serviceMock.recordExternalCompletion).not.toHaveBeenCalled();
  });

  it('maps safe hidden and validation errors without stack leakage', async () => {
    serviceMock.getReviewDetail.mockRejectedValue(new MockTaskReviewDecisionServiceError(404, 'TASK_SUBMISSION_NOT_FOUND', 'Task submission not found.'));
    const response = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/submissions/${ids.submission}/review`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 404, code: 'TASK_SUBMISSION_NOT_FOUND', message: 'Task submission not found.' });
    expect(response.body.stack).toBeUndefined();
  });

  it('bounds unexpected failures without leaking internals', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    serviceMock.getReviewDetail.mockRejectedValue(new Error('database-secret'));
    const response = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/submissions/${ids.submission}/review`);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ status: 500, code: 'TASK_REVIEW_DECISION_INTERNAL_ERROR', message: 'Task review decision request failed.' });
    expect(JSON.stringify(response.body)).not.toContain('database-secret');
    expect(consoleSpy).toHaveBeenCalledWith('Task review decision request failed.');
    consoleSpy.mockRestore();
  });
});
