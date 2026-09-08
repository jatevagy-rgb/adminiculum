import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import http from 'http';
import type { Request, Response, NextFunction } from 'express';
jest.mock('../src/prisma/prisma.service', () => {
  const databaseUrl = process.env.USABLE_CASE_TYPE_TEST_DATABASE_URL || process.env.WORK_PACKAGE_ADMIN_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
  if (!databaseUrl) return { prisma: {} };
  const parsed = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !parsed.pathname.startsWith('/adminiculum_replay')) throw new Error('Requires an isolated local replay database');
  const { PrismaClient } = jest.requireActual('@prisma/client');
  return { prisma: new PrismaClient({ datasources: { db: { url: databaseUrl } } }) };
});
jest.mock('../src/middleware/auth', () => ({
  ROLES: { ADMIN: 'ADMIN', PARTNER: 'PARTNER', LAWYER: 'LAWYER', CLIENT: 'CLIENT' },
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const userId = req.headers['x-test-user'];
    if (typeof userId !== 'string') { res.status(401).json({}); return; }
    req.user = { userId, role: 'ADMIN', email: 'local@example.invalid', authProvider: 'local-jwt' } as any;
    next();
  },
}));
jest.mock('../src/modules/sharepoint', () => ({ driveService: { createCaseFolders: jest.fn().mockRejectedValue(new Error('External call forbidden')) } }));
import casesService from '../src/modules/cases/services';
import timeEntriesRoutes from '../src/routes/timeEntries';
import { prisma as routeDb } from '../src/prisma/prisma.service';
import { createPreparation, getPreparation, refreshPreparation } from '../src/modules/billing-preparations/service';
import { createUsableCaseType, createCaseType, createTemplate, activateTemplate, listCaseCreationOptions } from '../src/modules/work-package-admin/service';

const url = process.env.USABLE_CASE_TYPE_TEST_DATABASE_URL || process.env.WORK_PACKAGE_ADMIN_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('name-only case types (isolated PostgreSQL)', () => {
  let db: PrismaClient;
  const userId = randomUUID();
  const actor = { userId, role: 'ADMIN' };
  const prefix = `usable-${randomUUID()}`;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !parsed.pathname.startsWith('/adminiculum_replay')) throw new Error('Requires an isolated local replay database');
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.user.create({ data: { id: userId, email: `${prefix}@example.invalid`, name: 'Local test', role: 'ADMIN' } });
  });
  afterAll(async () => {
    await db.workPackageTemplate.deleteMany({ where: { createdById: userId } });
    await db.caseTypeDefinition.deleteMany({ where: { createdById: userId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
    await routeDb.$disconnect();
  });

  it('the existing create and activate primitives support zero modules', async () => {
    const type = await createCaseType(actor, { name: `${prefix} existing`, slug: `${prefix}-existing` }, db);
    const draft = await createTemplate(actor, { caseTypeDefinitionId: type.id, name: 'Empty', items: [] }, db);
    const active = await activateTemplate(actor, draft.id, db);
    expect(active.status).toBe('ACTIVE');
    expect(active.items).toEqual([]);
  });

  it.each(['ADMIN', 'PARTNER'])('%s creates a persisted, immediately selectable empty active template', async (role) => {
    const option = await createUsableCaseType({ ...actor, role }, { name: `${prefix} Munkajog ${role}` }, db);
    expect(option.template.status).toBe('ACTIVE');
    expect(option.template.items).toEqual([]);
    expect(option.template.version).toBe(1);
    const read = () => listCaseCreationOptions({ userId, role: 'LAWYER' }, db);
    expect((await read()).find((item) => item.caseTypeDefinition.id === option.caseTypeDefinition.id)).toEqual(option);
    expect((await read()).some((item) => item.caseTypeDefinition.id === option.caseTypeDefinition.id)).toBe(true);
  });

  it('resolves transliteration collisions deterministically without overwriting', async () => {
    const first = await createUsableCaseType(actor, { name: `${prefix} Ár` }, db);
    const second = await createUsableCaseType(actor, { name: `${prefix} Ar` }, db);
    expect(second.caseTypeDefinition.slug).toBe(`${first.caseTypeDefinition.slug}-2`);
    expect(second.caseTypeDefinition.id).not.toBe(first.caseTypeDefinition.id);
    await expect(createUsableCaseType(actor, { name: `${prefix} ÁR` }, db)).rejects.toMatchObject({ code: 'CASE_TYPE_NAME_EXISTS' });
    expect((await db.caseTypeDefinition.findUniqueOrThrow({ where: { id: first.caseTypeDefinition.id } })).name).toBe(`${prefix} Ár`);
  });

  it.each(['LAWYER', 'COLLAB_LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT', 'CLIENT'])('rejects %s before writing', async (role) => {
    const before = await db.caseTypeDefinition.count();
    await expect(createUsableCaseType({ userId, role }, { name: `${prefix} denied` }, db)).rejects.toMatchObject({ status: 403 });
    expect(await db.caseTypeDefinition.count()).toBe(before);
  });

  it('rolls back the type and draft if activation fails', async () => {
    // Delegate every operation to the real transaction except an injected activation failure.
    const failingDb = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (operation: any, options: any) => target.$transaction((tx) => operation(new Proxy(tx, { get(inner, property) {
        if (property === 'workPackageTemplate') return new Proxy(inner.workPackageTemplate, { get(model, method) {
          if (method === 'update') return () => { throw new Error('Injected activation failure'); };
          return Reflect.get(model, method);
        } });
        return Reflect.get(inner, property);
      } })), options);
      return Reflect.get(target, key);
    } });
    const before = await db.workPackageTemplate.count();
    await expect(createUsableCaseType(actor, { name: `${prefix} rollback` }, failingDb)).rejects.toThrow('Injected activation failure');
    expect(await db.caseTypeDefinition.count({ where: { name: `${prefix} rollback` } })).toBe(0);
    expect(await db.workPackageTemplate.count()).toBe(before);
  });

  it('new type → empty Case snapshot → case-first POST → preparation refresh → canonical billing row', async () => {
    // Separate local actor/client because append-only rate history intentionally prevents deletion.
    const owner = { userId: randomUUID(), role: 'ADMIN' };
    await db.user.create({ data: { id: owner.userId, email: `${owner.userId}@example.invalid`, name: 'Local convergence', role: 'ADMIN' } });
    const client = await db.client.create({ data: { name: `${prefix} convergence` } });
    const tasksBeforeType = await db.task.count();
    const option = await createUsableCaseType(owner, { name: `${prefix} usable convergence` }, db);
    expect(await db.task.count()).toBe(tasksBeforeType);
    expect(option.template.defaultWorkflowTemplateId).toBeNull();
    const kase = await casesService.createCase({ clientId: client.id, clientName: client.name, title: 'New empty Case', matterType: 'OTHER', caseTypeDefinitionId: option.caseTypeDefinition.id, selectedModuleKeys: [], createdById: owner.userId }, db, { provisionCaseFolders: false });
    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({ where: { caseId: kase.id }, include: { items: true } });
    expect(snapshot.workPackageTemplateId).toBe(option.template.id);
    expect(snapshot.items).toHaveLength(0);
    expect(await db.timeEntry.count({ where: { caseId: kase.id } })).toBe(0);
    await db.hourlyRateVersion.create({ data: { clientId: client.id, effectiveFrom: new Date('2026-09-01T00:00:00Z'), currency: 'HUF', hourlyRate: '50000', mode: 'EXPLICIT_RATE', createdById: owner.userId } });
    const { preparation } = await createPreparation(owner, { clientId: client.id, periodStart: '2026-09-01', periodEnd: '2026-09-30' }, db);
    expect((await getPreparation(owner, preparation.id, db)).items).toHaveLength(0);
    const app = express(); app.use(express.json()); app.use('/time-entries', timeEntriesRoutes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const result = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const payload = JSON.stringify({ caseId: kase.id, minutes: 60, workType: 'DRAFTING', description: 'Local September work', workDate: '2026-09-08', billable: true });
        const req = http.request({ hostname: '127.0.0.1', port: (server.address() as any).port, path: '/time-entries', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-test-user': owner.userId } }, (res) => {
          let body = ''; res.on('data', (chunk) => { body += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(body) }));
        });
        req.on('error', reject); req.end(payload);
      });
      expect(result.status).toBe(201);
      expect(result.body.caseId).toBe(kase.id);
      expect(result.body.matterId).toBeNull();
      expect((await refreshPreparation(owner, preparation.id, db)).added).toBe(1);
      const row = (await getPreparation(owner, preparation.id, db)).items.find((item) => item.sourceTimeEntryId === result.body.id)!;
      expect(row.attributionKind).toBe('EXACT_CASE');
      expect(row.billing.netAmount).toBe('50000.00');
      expect((await db.timeEntry.findUniqueOrThrow({ where: { id: result.body.id } })).minutes).toBe(60);
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});
