/**
 * P0 — Workgroup / workload client authorization (IDOR) — PostgreSQL integration.
 *
 * Same authorization contract as `workgroupClientAuthorization.test.ts`, but
 * executed against a real PostgreSQL database and the untouched canonical
 * `assertClientReadAccess` implementation, so Workgroup → Client ownership is
 * resolved from persisted rows (never from caller input).
 *
 * Skipped when no test database URL is configured (see sibling integration
 * suites for the same guard), so local runs without PostgreSQL stay green while
 * CI exercises the full stack.
 */
import crypto from 'crypto';
import express, { type Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import { PrismaClient } from '@prisma/client';

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

import workgroupRoutes from '../src/modules/workgroups/routes';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

type HttpResult = { status: number; body: any };

function call(
  app: Express,
  method: string,
  path: string,
  opts: { userId?: string; role?: string; body?: unknown } = {},
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
            authorization: 'Bearer test-token',
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

d('workgroup client authorization (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerAId = crypto.randomUUID();
  const lawyerBId = crypto.randomUUID();
  const traineeId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const caseB = crypto.randomUUID();
  let workgroupA = '';
  let workgroupB = '';

  const app = express();
  app.use(express.json());
  app.use('/api/v1', workgroupRoutes);

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: adminId, email: `wg-admin-${suffix}@test.invalid`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyerAId, email: `wg-lawyer-a-${suffix}@test.invalid`, name: 'Lawyer A', role: 'LAWYER', status: 'ACTIVE' },
        { id: lawyerBId, email: `wg-lawyer-b-${suffix}@test.invalid`, name: 'Lawyer B', role: 'LAWYER', status: 'ACTIVE' },
        { id: traineeId, email: `wg-trainee-${suffix}@test.invalid`, name: 'Trainee', role: 'TRAINEE', status: 'ACTIVE' },
      ] as never,
    });
    await db.client.createMany({
      data: [
        { id: clientA, name: `WG Client A ${suffix}` },
        { id: clientB, name: `WG Client B ${suffix}` },
      ],
    });
    await db.case.create({ data: { id: caseA, caseNumber: `WG-A-${suffix}`, title: 'Case A', caseType: 'CONTRACT_REVIEW', clientId: clientA, assignedLawyerId: lawyerAId, createdById: adminId } as never });
    await db.case.create({ data: { id: caseB, caseNumber: `WG-B-${suffix}`, title: 'Case B', caseType: 'CONTRACT_REVIEW', clientId: clientB, assignedLawyerId: lawyerBId, createdById: adminId } as never });
    const wgA = await db.clientWorkgroup.create({ data: { clientId: clientA, name: `Team A ${suffix}` } });
    const wgB = await db.clientWorkgroup.create({ data: { clientId: clientB, name: `Team B ${suffix}` } });
    workgroupA = wgA.id;
    workgroupB = wgB.id;
  });

  afterAll(async () => {
    if (db) {
      await db.workloadRecord.deleteMany({ where: { workgroupId: { in: [workgroupA, workgroupB].filter(Boolean) } } });
      await db.clientWorkgroup.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
      await db.case.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
      await db.user.deleteMany({ where: { id: { in: [adminId, lawyerAId, lawyerBId, traineeId] } } });
      await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
      await db.$disconnect();
    }
  });

  it('manager lists own client workgroups, foreign client is forbidden', async () => {
    const own = await call(app, 'GET', `/api/v1/clients/${clientA}/workgroups`, { userId: adminId, role: 'ADMIN' });
    expect(own.status).toBe(200);
    expect(own.body.some((w: any) => w.id === workgroupA)).toBe(true);

    const foreign = await call(app, 'GET', `/api/v1/clients/${clientB}/workgroups`, { userId: lawyerAId, role: 'LAWYER' });
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('CLIENT_ACCESS_FORBIDDEN');
  });

  it('blocks foreign create and non-manager create; allows manager create', async () => {
    const foreignCreate = await call(app, 'POST', `/api/v1/clients/${clientB}/workgroups`, {
      userId: lawyerAId, role: 'LAWYER', body: { name: `Intruder ${suffix}` },
    });
    expect(foreignCreate.status).toBe(403);
    const leaked = await db.clientWorkgroup.count({ where: { clientId: clientB, name: `Intruder ${suffix}` } });
    expect(leaked).toBe(0);

    const nonManager = await call(app, 'POST', `/api/v1/clients/${clientA}/workgroups`, {
      userId: lawyerAId, role: 'LAWYER', body: { name: `NonManager ${suffix}` },
    });
    expect(nonManager.status).toBe(403);
    expect(nonManager.body.code).toBe('CLIENT_MANAGE_FORBIDDEN');

    const allowed = await call(app, 'POST', `/api/v1/clients/${clientA}/workgroups`, {
      userId: adminId, role: 'ADMIN', body: { name: `Allowed ${suffix}` },
    });
    expect(allowed.status).toBe(201);
    expect(allowed.body.clientId).toBe(clientA);
  });

  it('derives workgroup ownership from persisted data (foreign by-id access blocked)', async () => {
    // Workgroup B lives under Client B; lawyer A only has Case access in Client A.
    const foreignGet = await call(app, 'GET', `/api/v1/workgroups/${workgroupB}`, { userId: lawyerAId, role: 'LAWYER' });
    expect(foreignGet.status).toBe(403);

    const foreignUpdate = await call(app, 'PATCH', `/api/v1/workgroups/${workgroupB}`, {
      userId: lawyerAId, role: 'LAWYER', body: { name: `Hijack ${suffix}` },
    });
    expect(foreignUpdate.status).toBe(403);
    const row = await db.clientWorkgroup.findUnique({ where: { id: workgroupB } });
    expect(row?.name).not.toBe(`Hijack ${suffix}`);

    // The owning-client manager path stays green.
    const managerRead = await call(app, 'GET', `/api/v1/workgroups/${workgroupB}`, { userId: adminId, role: 'ADMIN' });
    expect(managerRead.status).toBe(200);
    expect(managerRead.body.id).toBe(workgroupB);
  });

  it('blocks foreign update/delete and foreign workload read/write and foreign summary', async () => {
    const foreignUpdate = await call(app, 'PATCH', `/api/v1/workgroups/${workgroupB}`, {
      userId: lawyerAId, role: 'LAWYER', body: { name: 'nope' },
    });
    expect(foreignUpdate.status).toBe(403);

    const foreignDelete = await call(app, 'DELETE', `/api/v1/workgroups/${workgroupB}`, { userId: lawyerAId, role: 'LAWYER' });
    expect(foreignDelete.status).toBe(403);

    const foreignRead = await call(app, 'GET', `/api/v1/workgroups/${workgroupB}/workload`, { userId: lawyerAId, role: 'LAWYER' });
    expect(foreignRead.status).toBe(403);

    const foreignWrite = await call(app, 'POST', `/api/v1/workgroups/${workgroupB}/workload`, {
      userId: lawyerAId, role: 'LAWYER', body: { period: '2026-02', reportedHours: 5 },
    });
    expect(foreignWrite.status).toBe(403);

    const foreignSummary = await call(app, 'GET', `/api/v1/clients/${clientB}/workload-summary?period=2026-02`, {
      userId: lawyerAId, role: 'LAWYER',
    });
    expect(foreignSummary.status).toBe(403);

    const leaks = await db.workloadRecord.count({ where: { workgroupId: workgroupB } });
    expect(leaks).toBe(0);
  });

  it('allows the manager to mutate and record workload on a client it owns', async () => {
    const update = await call(app, 'PATCH', `/api/v1/workgroups/${workgroupA}`, {
      userId: adminId, role: 'ADMIN', body: { name: `Team A renamed ${suffix}` },
    });
    expect(update.status).toBe(200);

    const record = await call(app, 'POST', `/api/v1/workgroups/${workgroupA}/workload`, {
      userId: adminId, role: 'ADMIN', body: { period: '2026-02', reportedHours: 7.5 },
    });
    expect(record.status).toBe(201);
    expect(record.body.reportedHours).toBe(7.5);

    const summary = await call(app, 'GET', `/api/v1/clients/${clientA}/workload-summary?period=2026-02`, {
      userId: adminId, role: 'ADMIN',
    });
    expect(summary.status).toBe(200);
    expect(summary.body.clientId).toBe(clientA);
  });

  it('returns 404 for unknown workgroups and blocks non-internal roles', async () => {
    const unknown = await call(app, 'GET', `/api/v1/workgroups/${crypto.randomUUID()}`, { userId: adminId, role: 'ADMIN' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toBe('Workgroup not found');

    const trainee = await call(app, 'GET', `/api/v1/clients/${clientA}/workgroups`, { userId: traineeId, role: 'TRAINEE' });
    expect(trainee.status).toBe(403);
  });
});
