/**
 * P0 — Workgroup / workload client authorization (IDOR) — deterministic route test.
 *
 * Proves that every workgroup and workload endpoint is gated by the canonical
 * Client authorization model and that a workforce actor with access to Client A
 * can neither read nor mutate workgroups/workload belonging to Client B.
 *
 * BLOCKED means 403 (foreign client, actor has no case access there), which is
 * the same semantic used by the canonical client-scoped modules
 * (client-company, client-contracts). An unknown resource is 404 and never
 * authorizes a mutation from a caller-supplied client id.
 *
 * This file is DB-free: `prisma.service` is replaced by a small in-memory store
 * so BEFORE/AFTER authorization behaviour can be exercised without PostgreSQL.
 * The PostgreSQL sibling is `workgroupClientAuthorization.integration.test.ts`.
 */
import express, { type Express } from 'express';
import http from 'http';
import { NextFunction, Request, Response } from 'express';

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
        userId: String(req.headers['x-test-user-id'] || ''),
        email: 'test@example.com',
        role: String(req.headers['x-test-role'] || 'LAWYER') as never,
        authProvider: 'local-jwt',
      };
      next();
    },
  };
});

jest.mock('../src/prisma/prisma.service', () => {
  const state: any = {
    users: [],
    clients: [],
    cases: [],
    collaborators: [],
    workgroups: [],
    workloads: [],
  };

  const matches = (where: any, row: any): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, value]: [string, any]) => {
      if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
      return row[key] === value;
    });
  };

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => state.users.find((u: any) => u.id === where.id) ?? null,
    },
    client: {
      findUnique: async ({ where }: any) => {
        const client = state.clients.find((c: any) => c.id === where.id);
        return client ? { id: client.id, name: client.name } : null;
      },
    },
    case: {
      findFirst: async ({ where }: any) => state.cases.find((c: any) => matches(where, c)) ?? null,
      findMany: async ({ where }: any) =>
        state.cases.filter((c: any) => (where?.OR ? where.OR.some((cond: any) => matches(cond, c)) : true)),
    },
    caseCollaborator: {
      findMany: async ({ where }: any) => state.collaborators.filter((x: any) => x.userId === where.userId),
    },
    clientWorkgroup: {
      findUnique: async ({ where }: any) => state.workgroups.find((w: any) => w.id === where.id) ?? null,
      findMany: async ({ where }: any) => state.workgroups.filter((w: any) => matches(where, w)),
      create: async ({ data }: any) => {
        const now = new Date();
        const row = { id: `wg-new-${state.workgroups.length + 1}`, isActive: true, createdAt: now, updatedAt: now, ...data };
        state.workgroups.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = state.workgroups.find((w: any) => w.id === where.id);
        if (!row) throw new Error('Workgroup not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    workloadRecord: {
      upsert: async ({ where, update, create }: any) => {
        const key = where.workgroupId_period;
        let row = state.workloads.find((r: any) => r.workgroupId === key.workgroupId && r.period === key.period);
        if (row) {
          Object.assign(row, update, { updatedAt: new Date() });
          return row;
        }
        row = { id: `wl-${state.workloads.length + 1}`, ...create, createdAt: new Date(), updatedAt: new Date() };
        state.workloads.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        state.workloads.filter((r: any) =>
          where.workgroupId?.in ? where.workgroupId.in.includes(r.workgroupId) : r.workgroupId === where.workgroupId,
        ),
    },
  };

  return { __esModule: true, prisma, default: prisma, __workgroupAuthState: state };
});

import * as prismaService from '../src/prisma/prisma.service';
import workgroupRoutes from '../src/modules/workgroups/routes';

const state = (prismaService as any).__workgroupAuthState;

type HttpResult = { status: number; body: any };

function call(
  app: Express,
  method: string,
  path: string,
  opts: { userId?: string; role?: string; body?: unknown; authenticated?: boolean } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const payload = opts.body === undefined ? null : JSON.stringify(opts.body);
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: {
            ...(opts.authenticated === false ? {} : { authorization: 'Bearer test-token' }),
            ...(opts.userId ? { 'x-test-user-id': opts.userId } : {}),
            ...(opts.role ? { 'x-test-role': opts.role } : {}),
            'content-type': 'application/json',
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
      request.end(payload);
    });
  });
}

const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const WG_A = 'wg-a';
const WG_B = 'wg-b';

const app = express();
app.use(express.json());
app.use('/api/v1', workgroupRoutes);

beforeEach(() => {
  state.users = [
    { id: 'admin', role: 'ADMIN', status: 'ACTIVE', isActive: true },
    { id: 'partner', role: 'PARTNER', status: 'ACTIVE', isActive: true },
    { id: 'lawyer-a', role: 'LAWYER', status: 'ACTIVE', isActive: true },
    { id: 'lawyer-b', role: 'LAWYER', status: 'ACTIVE', isActive: true },
    { id: 'trainee', role: 'TRAINEE', status: 'ACTIVE', isActive: true },
  ];
  state.clients = [
    { id: CLIENT_A, name: 'Client A' },
    { id: CLIENT_B, name: 'Client B' },
  ];
  state.cases = [
    { id: 'case-a', clientId: CLIENT_A, createdById: 'admin', assignedLawyerId: 'lawyer-a' },
    { id: 'case-b', clientId: CLIENT_B, createdById: 'admin', assignedLawyerId: 'lawyer-b' },
  ];
  state.collaborators = [];
  state.workgroups = [
    { id: WG_A, clientId: CLIENT_A, name: 'A team', description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { id: WG_B, clientId: CLIENT_B, name: 'B team', description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  ];
  state.workloads = [];
});

describe('workgroup client authorization (IDOR)', () => {
  it('AUTHORIZED_CLIENT_LIST: manager lists own client workgroups', async () => {
    const res = await call(app, 'GET', `/api/v1/clients/${CLIENT_A}/workgroups`, { userId: 'admin', role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((w: any) => w.id)).toEqual([WG_A]);
  });

  it('UNAUTHORIZED_CLIENT_LIST: no case access in foreign client is blocked', async () => {
    const res = await call(app, 'GET', `/api/v1/clients/${CLIENT_B}/workgroups`, { userId: 'lawyer-a', role: 'LAWYER' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CLIENT_ACCESS_FORBIDDEN');
  });

  it('AUTHORIZED_CREATE: manager creates a workgroup under own client', async () => {
    const res = await call(app, 'POST', `/api/v1/clients/${CLIENT_A}/workgroups`, {
      userId: 'admin', role: 'ADMIN', body: { name: 'New team' },
    });
    expect(res.status).toBe(201);
    expect(res.body.clientId).toBe(CLIENT_A);
  });

  it('UNAUTHORIZED_CREATE: foreign client create is blocked', async () => {
    const res = await call(app, 'POST', `/api/v1/clients/${CLIENT_B}/workgroups`, {
      userId: 'lawyer-a', role: 'LAWYER', body: { name: 'Sneaky' },
    });
    expect(res.status).toBe(403);
    expect(state.workgroups.some((w: any) => w.clientId === CLIENT_B && w.name === 'Sneaky')).toBe(false);
  });

  it('UNAUTHORIZED_CREATE: non-manager with read access cannot create', async () => {
    const res = await call(app, 'POST', `/api/v1/clients/${CLIENT_A}/workgroups`, {
      userId: 'lawyer-a', role: 'LAWYER', body: { name: 'Lawyer team' },
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CLIENT_MANAGE_FORBIDDEN');
  });

  it('AUTHORIZED_WORKGROUP_GET: manager reads own workgroup', async () => {
    const res = await call(app, 'GET', `/api/v1/workgroups/${WG_A}`, { userId: 'admin', role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(WG_A);
  });

  it('FOREIGN_WORKGROUP_GET: workgroup owns client B, actor has client A only', async () => {
    const res = await call(app, 'GET', `/api/v1/workgroups/${WG_B}`, { userId: 'lawyer-a', role: 'LAWYER' });
    expect(res.status).toBe(403);
  });

  it('AUTHORIZED_UPDATE: manager updates own workgroup', async () => {
    const res = await call(app, 'PATCH', `/api/v1/workgroups/${WG_A}`, {
      userId: 'partner', role: 'PARTNER', body: { name: 'Renamed' },
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });

  it('FOREIGN_UPDATE: foreign workgroup update is blocked and not persisted', async () => {
    const res = await call(app, 'PATCH', `/api/v1/workgroups/${WG_B}`, {
      userId: 'lawyer-a', role: 'LAWYER', body: { name: 'Hijacked' },
    });
    expect(res.status).toBe(403);
    expect(state.workgroups.find((w: any) => w.id === WG_B).name).toBe('B team');
  });

  it('AUTHORIZED_DELETE: manager soft deletes own workgroup', async () => {
    const res = await call(app, 'DELETE', `/api/v1/workgroups/${WG_A}`, { userId: 'admin', role: 'ADMIN' });
    expect(res.status).toBe(204);
    expect(state.workgroups.find((w: any) => w.id === WG_A).isActive).toBe(false);
  });

  it('FOREIGN_DELETE: foreign workgroup delete is blocked and stays active', async () => {
    const res = await call(app, 'DELETE', `/api/v1/workgroups/${WG_B}`, { userId: 'lawyer-a', role: 'LAWYER' });
    expect(res.status).toBe(403);
    expect(state.workgroups.find((w: any) => w.id === WG_B).isActive).toBe(true);
  });

  it('AUTHORIZED_WORKLOAD_READ: manager reads own workgroup workload', async () => {
    const res = await call(app, 'GET', `/api/v1/workgroups/${WG_A}/workload`, { userId: 'admin', role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('FOREIGN_WORKLOAD_READ: foreign workgroup workload is blocked', async () => {
    const res = await call(app, 'GET', `/api/v1/workgroups/${WG_B}/workload`, { userId: 'lawyer-a', role: 'LAWYER' });
    expect(res.status).toBe(403);
  });

  it('AUTHORIZED_WORKLOAD_WRITE: manager records workload on own workgroup', async () => {
    const res = await call(app, 'POST', `/api/v1/workgroups/${WG_A}/workload`, {
      userId: 'admin', role: 'ADMIN', body: { period: '2026-02', reportedHours: 12 },
    });
    expect(res.status).toBe(201);
    expect(res.body.reportedHours).toBe(12);
  });

  it('FOREIGN_WORKLOAD_WRITE: foreign workgroup workload is blocked', async () => {
    const res = await call(app, 'POST', `/api/v1/workgroups/${WG_B}/workload`, {
      userId: 'lawyer-a', role: 'LAWYER', body: { period: '2026-02', reportedHours: 99 },
    });
    expect(res.status).toBe(403);
    expect(state.workloads.length).toBe(0);
  });

  it('AUTHORIZED_SUMMARY: manager reads own client workload summary', async () => {
    const res = await call(app, 'GET', `/api/v1/clients/${CLIENT_A}/workload-summary?period=2026-02`, {
      userId: 'admin', role: 'ADMIN',
    });
    expect(res.status).toBe(200);
    expect(res.body.clientId).toBe(CLIENT_A);
  });

  it('FOREIGN_SUMMARY: foreign client workload summary is blocked', async () => {
    const res = await call(app, 'GET', `/api/v1/clients/${CLIENT_B}/workload-summary?period=2026-02`, {
      userId: 'lawyer-a', role: 'LAWYER',
    });
    expect(res.status).toBe(403);
  });

  it('WORKGROUP_IDOR: unknown workgroup never authorizes and returns 404', async () => {
    const paths: Array<[string, string, unknown?]> = [
      ['GET', '/api/v1/workgroups/does-not-exist'],
      ['PATCH', '/api/v1/workgroups/does-not-exist', { name: 'x' }],
      ['DELETE', '/api/v1/workgroups/does-not-exist'],
      ['GET', '/api/v1/workgroups/does-not-exist/workload'],
      ['POST', '/api/v1/workgroups/does-not-exist/workload', { period: '2026-02', reportedHours: 1 }],
    ];
    for (const [method, path, body] of paths) {
      const res = await call(app, method, path, { userId: 'admin', role: 'ADMIN', body });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Workgroup not found');
    }
  });

  it('BLOCKS non-internal workforce roles from the workgroup surface', async () => {
    const res = await call(app, 'GET', `/api/v1/clients/${CLIENT_A}/workgroups`, { userId: 'trainee', role: 'TRAINEE' });
    expect(res.status).toBe(403);
  });

  it('PRESERVES period validation for authorized actors', async () => {
    const badPeriod = await call(app, 'POST', `/api/v1/workgroups/${WG_A}/workload`, {
      userId: 'admin', role: 'ADMIN', body: { period: '2026-13', reportedHours: 1 },
    });
    expect(badPeriod.status).toBe(400);
    expect(badPeriod.body.code).toBe('VALIDATION_ERROR');

    const badSummary = await call(app, 'GET', `/api/v1/clients/${CLIENT_A}/workload-summary?period=2026-99`, {
      userId: 'admin', role: 'ADMIN',
    });
    expect(badSummary.status).toBe(400);
  });

  it('PRESERVES the frontend (PR #320) response contract shape', async () => {
    const list = await call(app, 'GET', `/api/v1/clients/${CLIENT_A}/workgroups`, { userId: 'admin', role: 'ADMIN' });
    expect(Object.keys(list.body[0]).sort()).toEqual(
      ['clientId', 'createdAt', 'description', 'id', 'isActive', 'name', 'updatedAt'].sort(),
    );

    const created = await call(app, 'POST', `/api/v1/clients/${CLIENT_A}/workgroups`, {
      userId: 'admin', role: 'ADMIN', body: { name: 'Shape', description: 'd' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ clientId: CLIENT_A, name: 'Shape', description: 'd', isActive: true });

    const summary = await call(app, 'GET', `/api/v1/clients/${CLIENT_A}/workload-summary?period=2026-02`, {
      userId: 'admin', role: 'ADMIN',
    });
    expect(Object.keys(summary.body).sort()).toEqual(['clientId', 'period', 'totalHours', 'workgroups'].sort());
  });

  it('REQUIRES authentication on every workgroup endpoint', async () => {
    const res = await call(app, 'GET', `/api/v1/clients/${CLIENT_A}/workgroups`, { authenticated: false });
    expect(res.status).toBe(401);
  });
});
