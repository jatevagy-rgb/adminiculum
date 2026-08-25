import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getClientSafeWorkSummary } from '../src/modules/client-workspace/workSummaryService';
import { resolvePortalWorkspace } from '../src/modules/client-workspace/workspaceService';
import { ClientPortalSession } from '../src/middleware/clientPortalAuth';

const databaseUrl = process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.CLIENT_INTERACTION_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

function sessionFor(identityId: string, email: string): ClientPortalSession {
  return {
    identityType: 'CLIENT_PORTAL',
    issuer: 'https://customer.example.invalid/',
    audience: 'adminiculum-client-portal',
    subject: `sub-${identityId}`,
    clientPortalIdentityId: identityId,
    normalizedEmail: email,
    displayName: 'Work Summary Customer',
    accountType: 'ORGANIZATION_MEMBER',
    status: 'ACTIVE',
    emailVerified: true,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER',
  };
}

d('Client-safe recorded work summary (PostgreSQL)', () => {
  let db: PrismaClient;
  const admin = crypto.randomUUID();
  const client = crypto.randomUUID();
  const otherClient = crypto.randomUUID();
  const identity = crypto.randomUUID();
  const otherIdentity = crypto.randomUUID();
  const workspace = crypto.randomUUID();
  const membership = crypto.randomUUID();
  const matterIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const caseIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const entryIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const from = new Date('2026-08-01T00:00:00.000Z');
  const to = new Date('2026-09-01T00:00:00.000Z');

  beforeAll(async () => {
    const url = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(url.hostname);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.create({ data: { id: admin, email: `summary-admin-${admin}@example.invalid`, name: 'Summary Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.createMany({ data: [{ id: client, name: 'Demo Kft.' }, { id: otherClient, name: 'Other Client' }] });
    await db.clientPortalIdentity.createMany({ data: [
      { id: identity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://customer.example.invalid/', subject: `sub-${identity}`, normalizedEmail: `summary-${identity}@example.invalid`, emailVerifiedAt: new Date(), displayName: 'Summary Customer', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: otherIdentity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://customer.example.invalid/', subject: `sub-${otherIdentity}`, normalizedEmail: `other-${otherIdentity}@example.invalid`, emailVerifiedAt: new Date(), displayName: 'Other Customer', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    ] });
    await db.clientPortalWorkspace.create({ data: { id: workspace, clientId: client, name: 'Demo Kft. workspace', mode: 'ORGANIZATION', publicReference: `demo-summary-${workspace}`, createdById: admin } as never });
    await db.clientPortalWorkspaceMembership.create({ data: { id: membership, clientPortalIdentityId: identity, workspaceId: workspace, status: 'ACTIVE', role: 'MEMBER' } });
    await db.matter.createMany({ data: [
      { id: matterIds[0], clientId: client, title: 'Compliance review', matterType: 'COMPLIANCE', status: 'OPEN' },
      { id: matterIds[1], clientId: client, title: 'Employment review', matterType: 'EMPLOYMENT', status: 'OPEN' },
      { id: matterIds[2], clientId: client, title: 'Supplier review', matterType: 'CONTRACT', status: 'OPEN' },
    ] });
    await db.case.createMany({ data: caseIds.map((id, index) => ({ id, caseNumber: `SUMMARY-${index}`, title: `Summary case ${index}`, caseType: 'CONTRACT_REVIEW', clientId: client, matterId: matterIds[index], createdById: admin })) as never });
    await db.clientPortalGrant.createMany({ data: caseIds.map((caseId) => ({ clientPortalIdentityId: identity, workspaceId: workspace, clientId: client, caseId, status: 'ACTIVE', permissions: ['MATTER_READ', 'HOURS_READ'], invitedById: admin })) as never });
    await db.timeEntry.createMany({ data: [
      { id: entryIds[0], matterId: matterIds[0], userId: admin, workType: 'LEGAL_RESEARCH', description: 'Internal description must not leak', minutes: 185, workDate: new Date('2026-08-05T12:00:00.000Z') },
      { id: entryIds[1], matterId: matterIds[1], userId: admin, workType: 'REVIEW', description: 'Internal employment note', minutes: 380, workDate: new Date('2026-08-06T12:00:00.000Z') },
      { id: entryIds[2], matterId: matterIds[2], userId: admin, workType: 'DRAFTING', description: 'Internal supplier note', minutes: 310, workDate: new Date('2026-08-07T12:00:00.000Z') },
    ] as never });
  });

  afterAll(async () => {
    await db?.timeEntry.deleteMany({ where: { id: { in: entryIds } } });
    await db?.clientPortalGrant.deleteMany({ where: { workspaceId: workspace } });
    await db?.case.deleteMany({ where: { id: { in: caseIds } } });
    await db?.matter.deleteMany({ where: { id: { in: matterIds } } });
    await db?.clientPortalWorkspaceMembership.deleteMany({ where: { id: membership } });
    await db?.clientPortalWorkspace.deleteMany({ where: { id: workspace } });
    await db?.clientPortalIdentity.deleteMany({ where: { id: { in: [identity, otherIdentity] } } });
    await db?.client.deleteMany({ where: { id: { in: [client, otherClient] } } });
    await db?.user.deleteMany({ where: { id: admin } });
    await db?.$disconnect();
  });

  it('aggregates real recorded work with matter totals and stable safe ordering', async () => {
    const result = await getClientSafeWorkSummary(identity, { id: workspace, clientId: client }, { from, to }, db);
    expect(result.period).toEqual({ from: from.toISOString(), to: to.toISOString() });
    expect(result.totalMinutes).toBe(875);
    expect(result.matters).toEqual([
      { matterId: matterIds[0], title: 'Compliance review', minutes: 185 },
      { matterId: matterIds[1], title: 'Employment review', minutes: 380 },
      { matterId: matterIds[2], title: 'Supplier review', minutes: 310 },
    ]);
    expect(result.matters.reduce((sum, matter) => sum + matter.minutes, 0)).toBe(result.totalMinutes);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Internal description');
    expect(serialized).not.toMatch(/billable|rate|profit|compensation|description/i);
  });

  it('returns zero safely for an empty month', async () => {
    const result = await getClientSafeWorkSummary(identity, { id: workspace, clientId: client }, { from: new Date('2026-07-01T00:00:00.000Z'), to: from }, db);
    expect(result.totalMinutes).toBe(0);
    expect(result.matters).toEqual([]);
  });

  it('denies missing HOURS_READ and fails closed for a cross-client scope', async () => {
    await db.clientPortalGrant.updateMany({ where: { workspaceId: workspace }, data: { permissions: ['MATTER_READ'] } as never });
    await expect(getClientSafeWorkSummary(identity, { id: workspace, clientId: client }, { from, to }, db)).rejects.toMatchObject({ code: 'HOURS_READ_REQUIRED', status: 403 });
    await db.clientPortalGrant.updateMany({ where: { workspaceId: workspace }, data: { permissions: ['MATTER_READ', 'HOURS_READ'] } as never });
    await expect(getClientSafeWorkSummary(identity, { id: workspace, clientId: otherClient }, { from, to }, db)).rejects.toMatchObject({ code: 'HOURS_READ_REQUIRED', status: 403 });
    await expect(resolvePortalWorkspace(sessionFor(otherIdentity, `other-${otherIdentity}@example.invalid`), `demo-summary-${workspace}`, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', status: 403 });
  });
});
