import { randomUUID } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import { prisma } from '../src/prisma/prisma.service';
import workReportRouter from '../src/modules/work-reports/routes';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const u = req.headers['x-test-user'];
    if (!u) return res.status(401).json({ status: 401, code: 'UNAUTHENTICATED', message: 'Unauthenticated' });
    req.user = { userId: String(u), role: req.headers['x-test-role'] || 'LAWYER' };
    next();
  },
}));

const client = randomUUID();
const caseId = randomUUID();
const admin = randomUUID();
const entitled = randomUUID();
const outsider = randomUUID();
const customer = randomUUID();
const activePerson = randomUUID();
const inactivePerson = randomUUID();
const CLIENT_NAME = 'ScopeClient Synthetic';
const PERSON_NAMES = ['Kiss Ilona', 'Nagy Béla'];
let server: Server;
let base: string;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== '127.0.0.1' || url.port !== '55483' || url.pathname !== '/adminiculum_replay_wf10') throw Error('Unsafe DB');
  const identity = await prisma.$queryRaw<any[]>`SELECT current_database() db,current_user usr,inet_server_port() port`;
  expect(identity[0]).toMatchObject({ db: 'adminiculum_replay_wf10', usr: 'wf10_pgtest', port: 55483 });
  await prisma.user.create({ data: { id: admin, email: `${admin}@wf10.invalid`, name: 'Admin manager', role: 'ADMIN', skills: [] } });
  await prisma.user.create({ data: { id: entitled, email: `${entitled}@wf10.invalid`, name: 'Entitled lawyer', role: 'LAWYER', skills: [] } });
  await prisma.user.create({ data: { id: outsider, email: `${outsider}@wf10.invalid`, name: 'Unentitled worker', role: 'LAWYER', skills: [] } });
  await prisma.user.create({ data: { id: customer, email: `${customer}@wf10.invalid`, name: 'Portal customer', role: 'CLIENT', skills: [] } });
  await prisma.client.create({ data: { id: client, name: CLIENT_NAME } });
  await prisma.case.create({ data: { id: caseId, caseNumber: caseId, title: 'Owner scope case', clientId: client, caseType: 'OTHER', createdById: entitled, assignedLawyerId: entitled } });
  await prisma.organizationPerson.create({ data: { id: activePerson, clientId: client, name: PERSON_NAMES[0], jobTitle: 'Beszerzési vezető', employmentStatus: 'ACTIVE', startDate: new Date('2024-01-01T00:00:00.000Z') } });
  await prisma.organizationPerson.create({ data: { id: inactivePerson, clientId: client, name: PERSON_NAMES[1], jobTitle: 'Korábbi munkatárs', employmentStatus: 'INACTIVE', startDate: new Date('2023-01-01T00:00:00.000Z'), endDate: new Date('2024-12-31T00:00:00.000Z') } });
  const app = express();
  app.use(express.json());
  app.use(workReportRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}, 30000);

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await prisma.$disconnect();
});

const ownersOf = async (headers: Record<string, string>) => {
  const r = await fetch(`${base}/clients/${client}/owners`, { headers });
  return { status: r.status, body: await r.json() as any };
};

const caseReportOf = async (ownerPersonId: string | null, headers: Record<string, string> = { 'x-test-user': entitled, 'x-test-role': 'LAWYER' }) => {
  const qs = ownerPersonId ? `?ownerPersonId=${ownerPersonId}` : '';
  const r = await fetch(`${base}/cases/${caseId}${qs}`, { headers });
  return { status: r.status, body: await r.json() as any };
};

test('unauthenticated request is rejected', async () => {
  const r = await fetch(`${base}/clients/${client}/owners`);
  expect(r.status).toBe(401);
});

test('customer role cannot reach the workforce owners list', async () => {
  const r = await ownersOf({ 'x-test-user': customer, 'x-test-role': 'CLIENT' });
  expect(r.status).toBe(403);
  expect(r.body.code).toBe('WORKFORCE_ACCESS_REQUIRED');
});

test('an unentitled workforce user cannot list owners of a different client', async () => {
  const r = await ownersOf({ 'x-test-user': outsider, 'x-test-role': 'LAWYER' });
  expect(r.status).toBe(403);
  expect(r.body.code).toBe('CLIENT_IDENTITY_ACCESS_FORBIDDEN');
  expect(JSON.stringify(r.body)).not.toMatch(new RegExp(PERSON_NAMES.join('|')));
  expect(JSON.stringify(r.body)).not.toMatch(new RegExp(CLIENT_NAME));
});

test('an entitled workforce user sees the client owner candidates', async () => {
  const r = await ownersOf({ 'x-test-user': entitled, 'x-test-role': 'LAWYER' });
  expect(r.status).toBe(200);
  expect(r.body.client.id).toBe(client);
  expect(r.body.people.some((p: any) => p.personId === activePerson)).toBe(true);
  expect(r.body.people.some((p: any) => p.name === PERSON_NAMES[0])).toBe(true);
});

test('a permitted manager (ADMIN) sees the client owner candidates', async () => {
  const r = await ownersOf({ 'x-test-user': admin, 'x-test-role': 'ADMIN' });
  expect(r.status).toBe(200);
  expect(r.body.client.id).toBe(client);
});

test('server-validated report override rejects an inactive person', async () => {
  const r = await caseReportOf(inactivePerson);
  expect(r.status).toBe(422);
  expect(r.body.code).toBe('WORK_REPORT_OWNER_NOT_IN_CLIENT');
});

test('server-validated report override accepts a valid owner without changing permanent ownership', async () => {
  const r = await caseReportOf(activePerson);
  expect(r.status).toBe(200);
  expect(r.body.owner.personId).toBe(activePerson);
  expect(await prisma.caseClientOwner.findUnique({ where: { caseId } })).toBeNull();
});
