/**
 * SEC-0A route authorization — behavioral tests.
 *
 * Exercises the REAL requireRole middleware against the hardened settings and
 * users routers (authenticate is stubbed to inject a role from a header; the
 * underlying services are mocked so no database is required).
 */

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
      (req as any).user = {
        userId: 'user-1',
        email: 'test@example.com',
        role: String(req.headers['x-test-role'] || 'LAWYER'),
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

interface TestResponse {
  status: number;
  body: any;
}

function requestJson(
  app: Express,
  method: string,
  urlPath: string,
  headers: Record<string, string> = {},
  body?: unknown,
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
          path: urlPath,
          method,
          headers: {
            'content-type': 'application/json',
            ...headers,
            ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
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
        },
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

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/settings', settingsRouter);
  app.use('/users', usersRouter);
  return app;
}

const AUTH = { authorization: 'Bearer test-token' };

describe('settings authorization + allowlist', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated reads', async () => {
    const res = await requestJson(createApp(), 'GET', '/settings');
    expect(res.status).toBe(401);
  });

  it('serves only allowlisted keys to authenticated workforce', async () => {
    getSettingMock.mockImplementation((key: string) => (key === 'theme' ? { mode: 'light' } : undefined));
    const res = await requestJson(createApp(), 'GET', '/settings', AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ theme: { mode: 'light' } });
  });

  it('refuses a non-allowlisted single key with 403', async () => {
    const res = await requestJson(createApp(), 'GET', '/settings/db_secret', AUTH);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SETTINGS_KEY_NOT_ALLOWED');
    expect(getSettingMock).not.toHaveBeenCalled();
  });

  it('blocks a non-admin from writing UI settings', async () => {
    const res = await requestJson(createApp(), 'PATCH', '/settings/ui', { ...AUTH, 'x-test-role': 'LAWYER' }, { theme: { mode: 'dark' } });
    expect(res.status).toBe(403);
    expect(updateUiSettingsMock).not.toHaveBeenCalled();
  });

  it('allows ADMIN to write allowlisted UI settings', async () => {
    updateUiSettingsMock.mockResolvedValue({ theme: { mode: 'dark' } });
    const res = await requestJson(createApp(), 'PATCH', '/settings/ui', { ...AUTH, 'x-test-role': 'ADMIN' }, { theme: { mode: 'dark' }, evil: 1 });
    expect(res.status).toBe(200);
    // Only the allowlisted key is forwarded.
    expect(updateUiSettingsMock).toHaveBeenCalledWith({ theme: { mode: 'dark' } });
  });

  it('refuses PUT of a non-writable key even for ADMIN', async () => {
    const res = await requestJson(createApp(), 'PUT', '/settings/db_secret', { ...AUTH, 'x-test-role': 'ADMIN' }, { value: 'x' });
    expect(res.status).toBe(403);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });
});

describe('user creation authority', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated creation', async () => {
    const res = await requestJson(createApp(), 'POST', '/users', {}, { name: 'x', email: 'x@y.z', role: 'LAWYER' });
    expect(res.status).toBe(401);
  });

  it('forbids a non-admin workforce user from creating accounts', async () => {
    const res = await requestJson(createApp(), 'POST', '/users', { ...AUTH, 'x-test-role': 'LAWYER' }, { name: 'x', email: 'x@y.z', role: 'ADMIN' });
    expect(res.status).toBe(403);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('allows ADMIN to create a workforce user', async () => {
    createUserMock.mockResolvedValue({ id: 'u2', name: 'New', email: 'n@y.z', role: 'LAWYER' });
    const res = await requestJson(createApp(), 'POST', '/users', { ...AUTH, 'x-test-role': 'ADMIN' }, { name: 'New', email: 'n@y.z', role: 'LAWYER' });
    expect(res.status).toBe(201);
    expect(createUserMock).toHaveBeenCalledTimes(1);
  });
});
