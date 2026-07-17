import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: 'user-1',
      email: 'test@example.com',
      role: 'LAWYER',
      authProvider: 'local-jwt',
    };
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/modules/tasks/services', () => ({
  __esModule: true,
  default: {
    getReviewTasksForUser: jest.fn(),
  },
  TaskValidationError: class MockTaskValidationError extends Error {},
}));

import taskService from '../src/modules/tasks/services';
import tasksRoutes from '../src/modules/tasks/routes';

type TestResponse = { status: number; body: any };

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/tasks', tasksRoutes);
  return app;
}

function requestJson(app: Express, authenticated = true): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path: '/tasks/review-queue',
        method: 'GET',
        headers: authenticated ? { authorization: 'Bearer test-token' } : {},
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
      request.end();
    });
  });
}

describe('GET /tasks/review-queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await requestJson(createApp(), false);

    expect(response.status).toBe(401);
    expect(taskService.getReviewTasksForUser).not.toHaveBeenCalled();
  });

  it('returns the authenticated user review queue', async () => {
    const queue = [{ id: 'task-1', status: 'SUBMITTED', title: 'Review task' }];
    (taskService.getReviewTasksForUser as jest.Mock).mockResolvedValue(queue);

    const response = await requestJson(createApp());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(queue);
    expect(taskService.getReviewTasksForUser).toHaveBeenCalledWith('user-1');
  });
});
