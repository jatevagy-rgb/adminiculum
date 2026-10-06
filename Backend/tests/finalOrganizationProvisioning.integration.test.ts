import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createWorkspace } from '../src/modules/client-workspace/workspaceService';
import { upsertOperatingProfile } from '../src/modules/client-company/service';
const { runProvisioning } = require('../scripts/final-organization-provisioning.cjs');
const url = process.env.MIGRATION_REPLAY_DATABASE_URL;
const suite = url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ? describe : describe.skip;

suite('bounded organization provisioning on local PostgreSQL', () => {
  const actorId = crypto.randomUUID();
  const actorEmail = `provisioning-${actorId}@example.invalid`;
  const targets = [0, 1].map(i => ({ id: crypto.randomUUID(), name: `Provisioning fixture ${actorId}-${i}` }));
  const db = new PrismaClient({ datasources: { db: { url } } });
  const services = { createWorkspace, upsertOperatingProfile };
  beforeAll(async () => {
    await db.user.create({ data: { id: actorId, email: actorEmail, name: 'Provisioning fixture', role: 'ADMIN' } });
    await db.client.createMany({ data: targets });
    await db.case.create({ data: { caseNumber: `PROV-${actorId}`, title: 'Must stay attached', clientId: targets[0].id, caseType: 'OTHER', createdById: actorId } });
  });
  afterAll(async () => {
    const ids = targets.map(t => t.id);
    const workspaces = await db.clientPortalWorkspace.findMany({ where: { clientId: { in: ids } }, select: { id: true } });
    await db.clientPortalWorkspaceEvent.deleteMany({ where: { workspaceId: { in: workspaces.map(w => w.id) } } });
    await db.clientPortalWorkspace.deleteMany({ where: { clientId: { in: ids } } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId: { in: ids } } });
    await db.case.deleteMany({ where: { clientId: { in: ids } } });
    await db.client.deleteMany({ where: { id: { in: ids } } });
    await db.user.delete({ where: { id: actorId } });
    await db.$disconnect();
  });
  it('dry-run creates nothing', async () => {
    const report = await runProvisioning({ db, services, actorEmail, targets });
    expect(report.applied).toBe(false);
    expect(report.before[0].counts.cases).toBe(1);
    expect(await db.clientPortalWorkspace.count({ where: { clientId: { in: targets.map(t => t.id) } } })).toBe(0);
  });
  it('rolls back the first client, profile, and audit event when a later service fails', async () => {
    let calls = 0;
    await expect(runProvisioning({ db, actorEmail, targets, apply: true, services: { ...services, createWorkspace: (...args: Parameters<typeof createWorkspace>) => {
      if (++calls === 2) throw new Error('INJECTED_SECOND_CLIENT_FAILURE');
      return createWorkspace(...args);
    } } })).rejects.toThrow('INJECTED_SECOND_CLIENT_FAILURE');
    expect(await db.clientPortalWorkspace.count({ where: { clientId: { in: targets.map(t => t.id) } } })).toBe(0);
    expect(await db.clientOperatingProfile.count({ where: { clientId: { in: targets.map(t => t.id) } } })).toBe(0);
    expect(await db.clientPortalWorkspaceEvent.count({ where: { actorId } })).toBe(0);
  });
  it('creates only structural records, preserves relationships and defaults, and is idempotent', async () => {
    const first = await runProvisioning({ db, services, actorEmail, targets, apply: true });
    expect(first.created.every((r: any) => r.workspaceCreated && r.profileCreated)).toBe(true);
    for (const [i, state] of first.after.entries()) {
      expect(state.businessDigest).toBe(first.before[i].businessDigest);
      expect(state.profile.complianceEnrollmentStatus).toBe('NOT_ENROLLED');
      expect(state.profile.status).toBeNull();
      expect(state.counts.grants + state.counts.memberships + state.counts.scopes).toBe(0);
    }
    const second = await runProvisioning({ db, services, actorEmail, targets, apply: true });
    expect(second.created.every((r: any) => !r.workspaceCreated && !r.profileCreated)).toBe(true);
    expect(second.created.map((r: any) => r.workspaceId)).toEqual(first.created.map((r: any) => r.workspaceId));
    expect(await db.clientPortalWorkspaceEvent.count({ where: { actorId, action: 'WORKSPACE_CREATED' } })).toBe(2);
  });
  it('rejects ambiguous workspaces before any additional write', async () => {
    await createWorkspace({ userId: actorId, role: 'ADMIN' }, { clientId: targets[0].id, name: 'Collision', mode: 'ORGANIZATION' }, db);
    await expect(runProvisioning({ db, services, actorEmail, targets, apply: true })).rejects.toThrow('WORKSPACE_COLLISION');
    expect(await db.clientPortalWorkspaceEvent.count({ where: { actorId } })).toBe(3);
  });
});
