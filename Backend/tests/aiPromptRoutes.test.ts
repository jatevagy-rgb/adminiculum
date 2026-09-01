import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => {
  const actual = jest.requireActual('../src/middleware/auth');
  return {
    ...actual,
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ status: 401, code: 'AUTH_REQUIRED' });
      return;
    }
    req.user = {
      userId: String(req.headers['x-test-user-id'] || 'user-1'),
      email: 'test@example.com',
      role: String(req.headers['x-test-role'] || 'LAWYER') as never,
      authProvider: 'local-jwt',
    };
    next();
  },
  };
});

jest.mock('../src/middleware/workforceAuthorization', () => ({
  requireWorkforceUser: (req: Request, res: Response, next: NextFunction) => {
    if (!['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT'].includes(String(req.user?.role || ''))) {
      res.status(403).json({ status: 403, code: 'WORKFORCE_ACCESS_REQUIRED' });
      return;
    }
    next();
  },
}));

jest.mock('../src/modules/cases/authorization', () => ({
  requireCaseManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireCaseReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/modules/ai-prompts/service', () => ({
  approvePromptDraft: jest.fn(),
  createPromptTemplateVersion: jest.fn().mockResolvedValue({ id: 'template-1', version: 1 }),
  getPromptDraft: jest.fn(),
  importPromptResponse: jest.fn(),
  listPromptDraftsForCase: jest.fn(),
  listPromptTemplates: jest.fn(),
  preparePromptDraft: jest.fn(),
  rejectPromptDraft: jest.fn(),
  returnPromptDraft: jest.fn(),
  toPublicPromptDraft: jest.fn((draft) => draft),
  verifyPromptDraft: jest.fn(),
}));

import promptRoutes from '../src/modules/ai-prompts/routes';
import { createPromptTemplateVersion } from '../src/modules/ai-prompts/service';

type TestResponse = { status: number; body: Record<string, unknown> | null };

function requestJson(app: Express, role?: string, authenticated = true): Promise<TestResponse> {
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
        path: '/templates',
        method: 'POST',
        headers: {
          ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
          ...(role ? { 'x-test-role': role } : {}),
          'content-type': 'application/json',
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
      request.end(JSON.stringify({ stableKey: 'route-test', title: 'Route test' }));
    });
  });
}

describe('AI prompt template mutation authorization', () => {
  const app = express();
  app.use(express.json());
  app.use('/', promptRoutes);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['ADMIN', 'PARTNER'])('allows %s to create a shared template version', async (role) => {
    const response = await requestJson(app, role);
    expect(response.status).toBe(201);
    expect(createPromptTemplateVersion).toHaveBeenCalledTimes(1);
  });

  it.each(['LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT', 'COLLAB_LAWYER', 'CLIENT', 'EXTERNAL_REVIEWER'])(
    'blocks %s without creating a template version',
    async (role) => {
      const response = await requestJson(app, role);
      expect(response.status).toBe(403);
      expect(createPromptTemplateVersion).not.toHaveBeenCalled();
    },
  );

  it('blocks unauthenticated template mutation', async () => {
    const response = await requestJson(app, undefined, false);
    expect(response.status).toBe(401);
    expect(createPromptTemplateVersion).not.toHaveBeenCalled();
  });
});
