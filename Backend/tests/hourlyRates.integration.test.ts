import { randomUUID } from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { PrismaClient } from '@prisma/client';

// Never fall back to a production DATABASE_URL. Run after canonical migration replay.
const databaseUrl = process.env.HOURLY_RATE_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

jest.mock('../src/middleware/auth', () => ({
  ...jest.requireActual('../src/middleware/auth'),
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-user']) { res.status(401).end(); return; }
    req.user = { userId: String(req.headers['x-test-user']), role: String(req.headers['x-test-role']) as any, email: 'rates@example.invalid', authProvider: 'local-jwt' };
    next();
  },
}));
import routes from '../src/modules/hourly-rates/routes';
import { appendRate, billingDate, getRateHistory, resolveHourlyRate } from '../src/modules/hourly-rates/service';
import { prisma } from '../src/prisma/prisma.service';

describeDb('effective hourly rates against canonical PostgreSQL schema', () => {
  let db: PrismaClient;
  const prefix = `rate-${randomUUID()}`;
  const clientId = `${prefix}-client`, otherClient = `${prefix}-other`, caseId = `${prefix}-case`, sibling = `${prefix}-sibling`;
  const admin = { userId: `${prefix}-admin`, role: 'ADMIN' };
  const lawyer = { userId: `${prefix}-lawyer`, role: 'LAWYER' };
  const partner = { userId: `${prefix}-partner`, role: 'PARTNER' };
  const explicit = (amount: string, date: string, scopedCase: string | null = null) => ({ id: randomUUID(), clientId, caseId: scopedCase,
    mode: 'EXPLICIT_RATE' as const, currency: 'HUF', hourlyRate: amount, effectiveFrom: new Date(`${date}T00:00:00Z`), createdById: admin.userId });
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(url.hostname);
    expect(url.pathname).toMatch(/^\/adminiculum_replay/);
    // Routes use the shared Prisma client; both must address this disposable database.
    expect(process.env.DATABASE_URL).toBe(databaseUrl);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    for (const actor of [admin, lawyer, partner]) await db.user.create({ data: { id: actor.userId, name: actor.role, email: `${actor.userId}@example.invalid`, role: actor.role as any, skills: [] } });
    await db.client.createMany({ data: [{ id: clientId, name: 'Rate test client' }, { id: otherClient, name: 'Other rate test client' }] });
    for (const id of [caseId, sibling]) await db.case.create({ data: { id, caseNumber: id, title: id, caseType: 'OTHER', clientId, createdById: admin.userId } });
  });
  afterAll(async () => { await db?.$disconnect(); await prisma.$disconnect(); });

  it('resolves unresolved, effective, future and historical client rates without repricing August', async () => {
    expect((await resolveHourlyRate({ clientId, workDate: '2025-12-31' }, db)).status).toBe('UNRESOLVED');
    await db.hourlyRateVersion.create({ data: explicit('40000', '2026-01-01') });
    await db.hourlyRateVersion.create({ data: explicit('45000.1234', '2026-09-01') });
    expect(await resolveHourlyRate({ clientId, workDate: '2026-08-31' }, db)).toMatchObject({ scope: 'CLIENT', hourlyRate: '40000.0000', effectiveFrom: '2026-01-01' });
    expect(await resolveHourlyRate({ clientId, workDate: '2026-09-01' }, db)).toMatchObject({ hourlyRate: '45000.1234' });
    expect((await resolveHourlyRate({ clientId, workDate: '2026-08-10' }, db)).hourlyRate).toBe('40000.0000');
  });
  it('case override is isolated and future inheritance switches to the applicable client rate', async () => {
    await db.hourlyRateVersion.create({ data: explicit('50000', '2026-02-01', caseId) });
    const inherit = await db.hourlyRateVersion.create({ data: { ...explicit('1', '2026-10-01', caseId), mode: 'INHERIT_CLIENT', hourlyRate: null } });
    expect(await resolveHourlyRate({ clientId, caseId, workDate: '2026-09-15' }, db)).toMatchObject({ scope: 'CASE', hourlyRate: '50000.0000' });
    expect(await resolveHourlyRate({ clientId, caseId: sibling, workDate: '2026-09-15' }, db)).toMatchObject({ scope: 'CLIENT', hourlyRate: '45000.1234' });
    expect(await resolveHourlyRate({ clientId, caseId, workDate: '2026-10-01' }, db)).toMatchObject({ scope: 'CLIENT', hourlyRate: '45000.1234', caseVersionId: inherit.id });
    const history = await getRateHistory({ clientId, caseId }, admin, '2026-09-15', db);
    expect(history.next).toMatchObject({ date: '2026-10-01', effective: { scope: 'CLIENT' } });
    expect(history.history).toHaveLength(2);
  });
  it('rejects cross-client service calls and direct SQL inserts', async () => {
    await expect(resolveHourlyRate({ clientId: otherClient, caseId, workDate: '2026-09-01' }, db)).rejects.toMatchObject({ code: 'RATE_CLIENT_CASE_MISMATCH' });
    await expect(db.hourlyRateVersion.create({ data: { ...explicit('1', '2026-05-01', caseId), clientId: otherClient } })).rejects.toThrow();
    await expect(db.case.update({ where: { id: caseId }, data: { clientId: otherClient } })).rejects.toThrow();
    await expect(resolveHourlyRate({ clientId: 'missing', workDate: '2026-09-01' }, db)).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
  });
  it.each([null, caseId])('DB uniqueness rejects concurrent duplicate effective dates for scope %s', async scopedCase => {
    const result = await Promise.allSettled([1, 2].map(() => db.hourlyRateVersion.create({ data: explicit('2', '2027-01-01', scopedCase) })));
    expect(result.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const rejected = result.find(row => row.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('P2002');
  });
  it('DB enforces inheritance/amount/currency constraints and append-only history', async () => {
    const invalid = [
      { mode: 'INHERIT_CLIENT' as const, hourlyRate: null },
      { mode: 'EXPLICIT_RATE' as const, hourlyRate: null },
      { caseId, mode: 'INHERIT_CLIENT' as const, hourlyRate: '1' },
      { hourlyRate: '0' }, { hourlyRate: '-1' }, { hourlyRate: 'NaN' }, { currency: 'EUR' },
    ];
    for (const fields of invalid) await expect(db.hourlyRateVersion.create({ data: { ...explicit('2', '2027-02-01'), ...fields } })).rejects.toThrow();
    const row = await db.hourlyRateVersion.findFirstOrThrow({ where: { clientId, caseId: null } });
    await expect(db.hourlyRateVersion.update({ where: { id: row.id }, data: { hourlyRate: '9' } })).rejects.toThrow();
    await expect(db.hourlyRateVersion.delete({ where: { id: row.id } })).rejects.toThrow();
  });
  it('service append records actor, refuses duplicate/backdated dates, and denies ordinary users', async () => {
    const scope = { clientId: otherClient };
    const body = { effectiveFrom: billingDate(), currency: 'HUF', mode: 'EXPLICIT_RATE', hourlyRate: '12345.6789' };
    await expect(appendRate(scope, lawyer, body, db)).rejects.toMatchObject({ status: 403 });
    expect(await appendRate(scope, partner, body, db)).toMatchObject({ createdById: partner.userId, hourlyRate: '12345.6789' });
    await expect(appendRate(scope, admin, body, db)).rejects.toMatchObject({ code: 'RATE_EFFECTIVE_DATE_EXISTS' });
    await expect(appendRate(scope, admin, { ...body, effectiveFrom: '2000-01-01' }, db)).rejects.toMatchObject({ code: 'RATE_BACKDATE_FORBIDDEN' });
  });
  it('appends case overrides and inheritance without altering any prior row or source work', async () => {
    const source = await db.timeEntry.create({ data: { userId: admin.userId, caseId: sibling, minutes: 31, billable: false, workDate: new Date('2026-08-05T12:00:00Z'), workType: 'OTHER', description: 'Preserve recorded work' } });
    const historyBefore = await db.hourlyRateVersion.findMany({ where: { clientId }, orderBy: { id: 'asc' } });
    const scope = { clientId, caseId: sibling };
    await appendRate(scope, admin, { effectiveFrom: '2098-01-01', currency: 'HUF', mode: 'EXPLICIT_RATE', hourlyRate: '12.3456' }, db);
    await appendRate(scope, partner, { effectiveFrom: '2098-02-01', currency: 'HUF', mode: 'INHERIT_CLIENT', hourlyRate: null }, db);
    expect(await resolveHourlyRate({ ...scope, workDate: '2098-01-31' }, db)).toMatchObject({ scope: 'CASE', hourlyRate: '12.3456' });
    expect(await resolveHourlyRate({ ...scope, workDate: '2098-02-01' }, db)).toMatchObject({ scope: 'CLIENT' });
    await expect(appendRate(scope, admin, { effectiveFrom: '2098-02-01', currency: 'HUF', mode: 'INHERIT_CLIENT', hourlyRate: null }, db)).rejects.toMatchObject({ code: 'RATE_EFFECTIVE_DATE_EXISTS' });
    expect(await db.hourlyRateVersion.findMany({ where: { id: { in: historyBefore.map(row => row.id) } }, orderBy: { id: 'asc' } })).toEqual(historyBefore);
    expect(await db.timeEntry.findUnique({ where: { id: source.id } })).toEqual(source);
    // Existing non-financial CRUD still works, even with rate history present.
    await expect(db.client.update({ where: { id: clientId }, data: { name: 'Renamed rate client' } })).resolves.toMatchObject({ name: 'Renamed rate client' });
    await expect(db.case.update({ where: { id: sibling }, data: { title: 'Renamed rate case' } })).resolves.toMatchObject({ title: 'Renamed rate case' });
    await expect(db.timeEntry.update({ where: { id: source.id }, data: { minutes: 32 } })).resolves.toMatchObject({ minutes: 32 });
    await db.timeEntry.delete({ where: { id: source.id } });
  });
  it('HTTP boundary uses canonical role guard for GET/POST, no edit/delete endpoint', async () => {
    const app = express(); app.use(express.json()); app.use('/rates', routes);
    const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as import('net').AddressInfo).port;
    const request = (method: string, actor?: typeof admin, payload?: object) => new Promise<{ status: number; body: any }>((resolve, reject) => {
      const body = payload ? JSON.stringify(payload) : '';
      const req = http.request({ hostname: '127.0.0.1', port, path: `/rates/clients/${otherClient}`, method,
        headers: { 'content-type': 'application/json', ...(actor ? { 'x-test-user': actor.userId, 'x-test-role': actor.role } : {}) } }, response => {
        let data = ''; response.on('data', chunk => { data += chunk; }); response.on('end', () => resolve({ status: response.statusCode!, body: data.startsWith('{') ? JSON.parse(data) : data }));
      }); req.on('error', reject); req.end(body);
    });
    try {
      expect((await request('GET')).status).toBe(401);
      expect((await request('GET', lawyer)).status).toBe(403);
      expect((await request('POST', lawyer, {})).status).toBe(403);
      expect((await request('GET', { ...lawyer, role: 'ADMIN' })).status).toBe(403);
      expect((await request('GET', admin)).body.effective.hourlyRate).toBe('12345.6789');
      expect((await request('POST', admin, { mode: 'INHERIT_CLIENT', effectiveFrom: billingDate(), currency: 'HUF' })).status).toBe(400);
      expect((await request('DELETE', admin)).status).toBe(404);
      expect((await request('PATCH', admin, {})).status).toBe(404);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
