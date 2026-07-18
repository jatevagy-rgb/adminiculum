import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

const serviceMock = {
  getTaskSubmissionWorkflow: jest.fn(),
  listEligibleReviewers: jest.fn(),
  createTaskSubmissionDraft: jest.fn(),
  updateTaskSubmissionDraft: jest.fn(),
  validateSubmissionReadiness: jest.fn(),
  attachSubmissionDocument: jest.fn(),
  detachSubmissionDocument: jest.fn(),
  attachSubmissionTimeEntry: jest.fn(),
  detachSubmissionTimeEntry: jest.fn(),
  submitTaskSubmission: jest.fn(),
};

class MockTaskSubmissionServiceError extends Error {
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

jest.mock('../src/modules/tasks/taskSubmission.service', () => ({
  __esModule: true,
  default: serviceMock,
  TaskSubmissionServiceError: MockTaskSubmissionServiceError,
}));

import taskSubmissionRoutes from '../src/modules/tasks/taskSubmission.routes';

const ids = {
  task: '11111111-1111-4111-8111-111111111111',
  submission: '22222222-2222-4222-8222-222222222222',
  document: '33333333-3333-4333-8333-333333333333',
  time: '44444444-4444-4444-8444-444444444444',
};

interface TestResponse {
  status: number;
  body: any;
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/tasks', taskSubmissionRoutes);
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
          resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
        });
      });
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      request.end(payload);
    });
  });
}

describe('task submission routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serviceMock.getTaskSubmissionWorkflow.mockResolvedValue({ task: { id: ids.task } });
    serviceMock.createTaskSubmissionDraft.mockResolvedValue({ created: true, workflow: { task: { id: ids.task } } });
    serviceMock.updateTaskSubmissionDraft.mockResolvedValue({ task: { id: ids.task } });
    serviceMock.listEligibleReviewers.mockResolvedValue([]);
    serviceMock.validateSubmissionReadiness.mockResolvedValue({ ready: false, missingPrerequisites: ['OUTPUT_REQUIRED'], blockingErrors: [], warnings: [] });
    serviceMock.attachSubmissionDocument.mockResolvedValue({ created: true, workflow: { task: { id: ids.task } } });
    serviceMock.detachSubmissionDocument.mockResolvedValue({ task: { id: ids.task } });
    serviceMock.attachSubmissionTimeEntry.mockResolvedValue({ created: true, workflow: { task: { id: ids.task } } });
    serviceMock.detachSubmissionTimeEntry.mockResolvedValue({ task: { id: ids.task } });
    serviceMock.submitTaskSubmission.mockResolvedValue({ idempotentReplay: false, submission: { id: ids.submission }, workflow: { task: { id: ids.task } } });
  });

  it('authenticates before workflow lookup', async () => {
    const response = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/workflow`, undefined, {});
    expect(response.status).toBe(401);
    expect(serviceMock.getTaskSubmissionWorkflow).not.toHaveBeenCalled();
  });

  it('rejects malformed identifiers before service access', async () => {
    const response = await requestJson(createApp(), 'GET', '/tasks/not-a-uuid/workflow');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_ID');
    expect(serviceMock.getTaskSubmissionWorkflow).not.toHaveBeenCalled();
  });

  it('returns a hidden task error without stack leakage', async () => {
    serviceMock.getTaskSubmissionWorkflow.mockRejectedValue(new MockTaskSubmissionServiceError(404, 'TASK_NOT_FOUND', 'Task not found.'));
    const response = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/workflow`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 404, code: 'TASK_NOT_FOUND', message: 'Task not found.' });
    expect(response.body.stack).toBeUndefined();
  });

  it('creates a new draft and returns an existing draft idempotently', async () => {
    const first = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions`, { assignedReviewerId: ids.document });
    expect(first.status).toBe(201);
    serviceMock.createTaskSubmissionDraft.mockResolvedValueOnce({ created: false, workflow: { task: { id: ids.task } } });
    const second = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions`, { assignedReviewerId: ids.document });
    expect(second.status).toBe(200);
  });

  it('patches only through the explicit draft service', async () => {
    const response = await requestJson(createApp(), 'PATCH', `/tasks/${ids.task}/submissions/${ids.submission}`, { workSummary: 'Ready' });
    expect(response.status).toBe(200);
    expect(serviceMock.updateTaskSubmissionDraft).toHaveBeenCalledWith(ids.task, ids.submission, 'actor-1', { workSummary: 'Ready' });
  });

  it('lists eligible reviewers and reads deterministic readiness', async () => {
    const reviewers = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/eligible-reviewers`);
    const readiness = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/submissions/${ids.submission}/readiness`);
    expect(reviewers.status).toBe(200);
    expect(readiness.status).toBe(200);
    expect(readiness.body.missingPrerequisites).toEqual(['OUTPUT_REQUIRED']);
  });

  it('links and unlinks document metadata without accepting malformed ids', async () => {
    const linked = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/documents`, { documentId: ids.document, role: 'PRIMARY_OUTPUT' });
    const unlinked = await requestJson(createApp(), 'DELETE', `/tasks/${ids.task}/submissions/${ids.submission}/documents/${ids.document}`);
    const rejected = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/documents`, { documentId: 'bad', role: 'PRIMARY_OUTPUT' });
    expect(linked.status).toBe(201);
    expect(unlinked.status).toBe(200);
    expect(rejected.status).toBe(400);
  });

  it('links and unlinks existing time entries', async () => {
    const linked = await requestJson(createApp(), 'POST', `/tasks/${ids.task}/submissions/${ids.submission}/time-entries`, { timeEntryId: ids.time });
    const unlinked = await requestJson(createApp(), 'DELETE', `/tasks/${ids.task}/submissions/${ids.submission}/time-entries/${ids.time}`);
    expect(linked.status).toBe(201);
    expect(unlinked.status).toBe(200);
  });

  it('passes the Idempotency-Key to the transactional submit service', async () => {
    const response = await requestJson(
      createApp(),
      'POST',
      `/tasks/${ids.task}/submissions/${ids.submission}/submit`,
      {},
      { authorization: 'Bearer test-token', 'idempotency-key': 'submit-key-1' },
    );
    expect(response.status).toBe(200);
    expect(serviceMock.submitTaskSubmission).toHaveBeenCalledWith(ids.task, ids.submission, 'actor-1', 'submit-key-1');
  });

  it('maps unexpected failures to a bounded response', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    serviceMock.getTaskSubmissionWorkflow.mockRejectedValue(new Error('database secret details'));
    const response = await requestJson(createApp(), 'GET', `/tasks/${ids.task}/workflow`);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ status: 500, code: 'TASK_SUBMISSION_INTERNAL_ERROR', message: 'Task submission request failed.' });
    expect(JSON.stringify(response.body)).not.toContain('database secret details');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Task submission request failed.');
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain('database secret details');
    consoleErrorSpy.mockRestore();
  });
});
