import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  ClientLifecycleError,
  archiveClient,
  getClientDependencySummary,
  getClientLifecyclePreview,
  hardDeleteClient,
} from '../src/modules/clients/clientLifecycleService';
import { createWorkspace } from '../src/modules/client-workspace/workspaceService';

const databaseUrl = process.env.CLIENT_LIFECYCLE_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Client lifecycle archive/delete (PostgreSQL)', () => {
  let db: PrismaClient;
  const ids = {
    admin: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    client: crypto.randomUUID(),
    otherClient: crypto.randomUUID(),
    emptyClient: crypto.randomUUID(),
    identity: crypto.randomUUID(),
    case: crypto.randomUUID(),
    document: crypto.randomUUID(),
  };
  const admin = { userId: ids.admin, role: 'ADMIN' };
  const lawyer = { userId: ids.lawyer, role: 'LAWYER' };

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toBe('adminiculum_replay_ci');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: ids.admin, email: `lifecycle-admin-${ids.admin}@example.invalid`, name: 'Lifecycle Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: ids.lawyer, email: `lifecycle-lawyer-${ids.lawyer}@example.invalid`, name: 'Lifecycle Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      ] as any[],
    });
    await db.client.createMany({
      data: [
        { id: ids.client, name: 'Lifecycle Client' },
        { id: ids.otherClient, name: 'Lifecycle Other Client' },
        { id: ids.emptyClient, name: 'Lifecycle Empty Client' },
      ],
    });
    // Client A: linked case + document + INDIVIDUAL portal workspace + identity membership
    await db.case.create({ data: { id: ids.case, caseNumber: `LCL-${ids.case.slice(0, 6)}`, title: 'Lifecycle case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin } as any });
    await db.document.create({ data: { id: ids.document, name: 'lifecycle.pdf', category: 'OTHER', caseId: ids.case, clientId: ids.client } as any });
    await db.clientPortalIdentity.create({ data: { id: ids.identity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://lifecycle.example.invalid/', subject: `lc-${ids.identity}`, normalizedEmail: `lc-${ids.identity}@example.invalid`, emailVerifiedAt: new Date(), displayName: 'Lifecycle Person', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
  });

  afterAll(async () => { await db.$disconnect(); });

  it('rejects non-ADMIN/PARTNER actors for archive and hard delete', async () => {
    await expect(archiveClient(lawyer, ids.client, db)).rejects.toMatchObject({ status: 403, code: 'CLIENT_LIFECYCLE_FORBIDDEN' });
    await expect(hardDeleteClient(lawyer, ids.client, db)).rejects.toMatchObject({ status: 403, code: 'CLIENT_LIFECYCLE_FORBIDDEN' });
    await expect(hardDeleteClient({ userId: '', role: 'ADMIN' }, ids.client, db)).rejects.toMatchObject({ status: 403 });
  });

  it('archives the client and its portal workspace while preserving cases, documents, identity and memberships', async () => {
    const workspace = await createWorkspace(admin, { clientId: ids.client, name: 'Privát tér', mode: 'INDIVIDUAL', communicationMode: 'PORTAL_PRIMARY' }, db);
    await db.clientPortalWorkspaceMembership.create({
      data: { clientPortalIdentityId: ids.identity, workspaceId: workspace.id, status: 'ACTIVE', role: 'MEMBER', invitedById: ids.admin, approvedAt: new Date(), approvedById: ids.admin } as any,
    });

    const preview = await getClientLifecyclePreview(ids.client, db);
    expect(preview.dependencies.cases).toBe(1);
    expect(preview.dependencies.documents).toBe(1);
    expect(preview.dependencies.portalWorkspaces).toBe(1);
    expect(preview.canHardDelete).toBe(false);

    const result = await archiveClient(admin, ids.client, db);
    expect(result.alreadyArchived).toBe(false);
    expect(result.client.archivedAt).not.toBeNull();
    expect(result.client.archivedById).toBe(ids.admin);
    expect(result.archivedWorkspaceIds).toEqual([workspace.id]);
    expect((await db.clientPortalWorkspace.findUniqueOrThrow({ where: { id: workspace.id } })).status).toBe('ARCHIVED');

    // Linked history and portal identity preserved — no cascade purge
    expect(await db.case.findUnique({ where: { id: ids.case } })).not.toBeNull();
    expect(await db.document.findUnique({ where: { id: ids.document } })).not.toBeNull();
    expect(await db.clientPortalIdentity.findUnique({ where: { id: ids.identity } })).not.toBeNull();
    const membership = await db.clientPortalWorkspaceMembership.findFirstOrThrow({ where: { clientPortalIdentityId: ids.identity, workspaceId: workspace.id } });
    expect(membership.status).toBe('ACTIVE');

    // Idempotent re-archive keeps the original timestamp and does not re-archive workspaces
    const second = await archiveClient(admin, ids.client, db);
    expect(second.alreadyArchived).toBe(true);
    expect(second.archivedWorkspaceIds).toEqual([]);

    // Other client untouched
    expect((await db.client.findUniqueOrThrow({ where: { id: ids.otherClient } })).archivedAt).toBeNull();
  });

  it('omits archived clients from the active-list and lookup predicates', async () => {
    const activeIds = (await db.client.findMany({ where: { archivedAt: null }, select: { id: true } })).map((row) => row.id);
    expect(activeIds).toContain(ids.otherClient);
    expect(activeIds).toContain(ids.emptyClient);
    expect(activeIds).not.toContain(ids.client);

    const lookup = await db.client.findMany({
      where: { archivedAt: null, OR: [{ name: { contains: 'Lifecycle', mode: 'insensitive' } }] },
      select: { id: true },
    });
    expect(lookup.map((row) => row.id)).not.toContain(ids.client);
    expect(lookup.map((row) => row.id)).toContain(ids.otherClient);
  });

  it('blocks hard delete with CLIENT_DELETE_BLOCKED while dependencies exist', async () => {
    try {
      await hardDeleteClient(admin, ids.client, db);
      throw new Error('expected hard delete to be blocked');
    } catch (error) {
      expect(error).toBeInstanceOf(ClientLifecycleError);
      const blocked = error as ClientLifecycleError;
      expect(blocked.status).toBe(409);
      expect(blocked.code).toBe('CLIENT_DELETE_BLOCKED');
      expect(blocked.dependencies?.dependencies.cases).toBe(1);
      expect(blocked.dependencies?.canHardDelete).toBe(false);
    }
    // Nothing was deleted
    expect(await db.case.count({ where: { clientId: ids.client } })).toBe(1);
    expect(await db.document.count({ where: { clientId: ids.client } })).toBe(1);
    expect(await db.client.findUnique({ where: { id: ids.client } })).not.toBeNull();
  });

  it('hard-deletes a dependency-free client and reports an empty summary', async () => {
    const summary = await getClientDependencySummary(ids.emptyClient, db);
    expect(summary.total).toBe(0);
    expect(summary.canHardDelete).toBe(true);
    await expect(hardDeleteClient(admin, ids.emptyClient, db)).resolves.toEqual({ deleted: true });
    expect(await db.client.findUnique({ where: { id: ids.emptyClient } })).toBeNull();
    // Isolation: other clients still exist
    expect(await db.client.findUnique({ where: { id: ids.otherClient } })).not.toBeNull();
  });
});
