import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => {
  const actual = jest.requireActual('../src/middleware/auth');
  return {
    ...actual,
    authenticate: (req: Request, res: Response, next: NextFunction) => {
      if (req.headers.authorization !== 'Bearer test-token') {
        res.status(401).json({ error: 'No token provided' });
        return;
      }
      req.user = {
        userId: 'user-1',
        email: 'test@example.com',
        role: String(req.headers['x-test-role'] || 'LAWYER') as never,
        authProvider: 'local-jwt',
      };
      next();
    },
  };
});

const createUserMock = jest.fn();
jest.mock('../src/modules/users/services', () => ({
  __esModule: true,
  default: { createUser: (...args: unknown[]) => createUserMock(...args) },
}));

const getSettingMock = jest.fn();
const updateSettingMock = jest.fn();
const updateUiSettingsMock = jest.fn();
const getUiSettingsMock = jest.fn();
jest.mock('../src/modules/settings/settings', () => ({
  __esModule: true,
  default: {
    getSetting: (...args: unknown[]) => getSettingMock(...args),
    updateSetting: (...args: unknown[]) => updateSettingMock(...args),
    updateUiSettings: (...args: unknown[]) => updateUiSettingsMock(...args),
    getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
  },
}));

import settingsRouter from '../src/modules/settings/routes';
import usersRouter from '../src/modules/users/routes';

function requestJson(
  app: Express,
  method: string,
  requestPath: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Test server address unavailable'));
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path: requestPath,
        method,
        headers: { 'content-type': 'application/json', ...headers, ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}) },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          server.close();
          resolve({ status: response.statusCode || 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        });
      });
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (payload) request.write(payload);
      request.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/settings', settingsRouter);
  app.use('/users', usersRouter);
  return app;
}

const auth = { authorization: 'Bearer test-token' };

describe('settings authorization', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication for internal reads', async () => {
    expect((await requestJson(createApp(), 'GET', '/settings')).status).toBe(401);
  });

  it('returns only the safe public UI DTO', async () => {
    getUiSettingsMock.mockResolvedValue({
      theme: { mode: 'light' },
      language: 'hu',
      dateFormat: 'YYYY.MM.DD.',
      secret: 'must-not-leak',
    });
    const response = await requestJson(createApp(), 'GET', '/settings/ui');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      theme: { mode: 'light' },
      language: 'hu',
      dateFormat: 'YYYY.MM.DD.',
    });
  });

  it('blocks non-admin settings writes and forwards only theme', async () => {
    const blocked = await requestJson(createApp(), 'PATCH', '/settings/ui', { ...auth, 'x-test-role': 'LAWYER' }, { theme: { mode: 'dark' } });
    expect(blocked.status).toBe(403);
    expect(updateUiSettingsMock).not.toHaveBeenCalled();

    updateUiSettingsMock.mockResolvedValue({ theme: { mode: 'dark' } });
    const allowed = await requestJson(createApp(), 'PATCH', '/settings/ui', { ...auth, 'x-test-role': 'ADMIN' }, { theme: { mode: 'dark' }, secret: 'x' });
    expect(allowed.status).toBe(200);
    expect(updateUiSettingsMock).toHaveBeenCalledWith({ theme: { mode: 'dark' } });
  });

  it('rejects non-allowlisted settings keys before service access', async () => {
    const response = await requestJson(createApp(), 'GET', '/settings/database_secret', auth);
    expect(response.status).toBe(403);
    expect(getSettingMock).not.toHaveBeenCalled();
  });
});

describe('workforce user creation authority', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated and client creation', async () => {
    expect((await requestJson(createApp(), 'POST', '/users', {}, { name: 'x', email: 'x@y.z', role: 'LAWYER' })).status).toBe(401);
    expect((await requestJson(createApp(), 'POST', '/users', { ...auth, 'x-test-role': 'CLIENT' }, { name: 'x', email: 'x@y.z', role: 'ADMIN' })).status).toBe(403);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('rejects external reviewers and allows an administrator', async () => {
    expect((await requestJson(createApp(), 'POST', '/users', { ...auth, 'x-test-role': 'EXTERNAL_REVIEWER' }, { name: 'x', email: 'x@y.z', role: 'LAWYER' })).status).toBe(403);
    createUserMock.mockResolvedValue({ id: 'u2', name: 'New', email: 'n@y.z', role: 'LAWYER' });
    expect((await requestJson(createApp(), 'POST', '/users', { ...auth, 'x-test-role': 'ADMIN' }, { name: 'New', email: 'n@y.z', role: 'LAWYER' })).status).toBe(201);
    expect(createUserMock).toHaveBeenCalledTimes(1);
  });
});
