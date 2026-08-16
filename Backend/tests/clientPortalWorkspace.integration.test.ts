import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { resolveActiveCustomerGrant } from '../src/modules/client-interaction/base';
import {
  createWorkspace,
  getPortalIdentityContext,
  inviteWorkspaceMember,
  resolvePortalWorkspace,
  transitionWorkspace,
  transitionWorkspaceMembership,
} from '../src/modules/client-workspace/workspaceService';

const databaseUrl = process.env.CLIENT_WORKSPACE_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('CP0 workspace authorization (PostgreSQL)', () => {
  let db: PrismaClient;
  const ids = {
    admin: crypto.randomUUID(),
    client: crypto.randomUUID(),
    otherClient: crypto.randomUUID(),
    identity: crypto.randomUUID(),
    case: crypto.randomUUID(),
    otherCase: crypto.randomUUID(),
  };
  const actor = { userId: ids.admin, role: 'ADMIN' };
  const session = {
    identityType: 'CLIENT_PORTAL' as const,
    issuer: 'https://cp0.example.invalid/',
    audience: 'cp0-api',
    subject: `cp0-${ids.identity}`,
    clientPortalIdentityId: ids.identity,
    normalizedEmail: `cp0-${ids.identity}@example.invalid`,
    displayName: 'CP0 Customer',
    accountType: 'INDIVIDUAL' as const,
    status: 'ACTIVE',
    emailVerified: true,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER' as const,
  };

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toBe('adminiculum_replay_ci');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: ids.admin, email: `cp0-admin-${ids.admin}@example.invalid`, name: 'CP0 Admin', role: 'ADMIN', status: 'ACTIVE' } as any });
    await db.client.createMany({ data: [{ id: ids.client, name: 'CP0 Client' }, { id: ids.otherClient, name: 'CP0 Other Client' }] });
    await db.case.create({ data: { id: ids.case, caseNumber: `CP0-${ids.case.slice(0, 6)}`, title: 'CP0 exact case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin } as any });
    await db.case.create({ data: { id: ids.otherCase, caseNumber: `CP0-${ids.otherCase.slice(0, 6)}`, title: 'CP0 ungranted case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin } as any });
    await db.clientPortalIdentity.create({ data: { id: ids.identity, provider: 'ENTRA_EXTERNAL_ID', issuer: session.issuer, subject: session.subject, normalizedEmail: session.normalizedEmail, emailVerifiedAt: new Date(), displayName: session.displayName, accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
  });

  afterAll(async () => { await db.$disconnect(); });

  it('returns zero, one and multiple active workspaces without trusting login mode', async () => {
    expect((await getPortalIdentityContext(session, null, db)).state).toBe('NO_ACCESS');
    await expect(getPortalIdentityContext({ ...session, emailVerified: false }, null, db)).rejects.toMatchObject({ code: 'CLIENT_IDENTITY_NOT_ACTIVE' });
    await expect(getPortalIdentityContext({ ...session, status: 'SUSPENDED' }, null, db)).rejects.toMatchObject({ code: 'CLIENT_IDENTITY_NOT_ACTIVE' });
    const individual = await createWorkspace(actor, { clientId: ids.client, name: 'Privát tér', mode: 'INDIVIDUAL', communicationMode: 'PORTAL_PRIMARY' }, db);
    const invitation = await inviteWorkspaceMember(actor, individual.id, { email: session.normalizedEmail }, db);
    let membership = await db.clientPortalWorkspaceMembership.findUniqueOrThrow({ where: { id: invitation.membershipId! } });
    expect((await getPortalIdentityContext(session, null, db)).state).toBe('PENDING_APPROVAL');
    membership = await transitionWorkspaceMembership(actor, membership.id, 'approve', membership.revision, db);
    const one = await getPortalIdentityContext(session, null, db);
    expect(one.state).toBe('READY');
    expect(one.selectedWorkspace?.mode).toBe('INDIVIDUAL');
    expect(one.selectedWorkspace?.capabilities.leadership).toBe(false);
    await db.clientPortalSummaryScope.create({ data: { workspaceMembershipId: membership.id, workspaceId: individual.id, scopeType: 'ORGANIZATION', approvedById: ids.admin } as any });
    const oneWithSummary = await getPortalIdentityContext(session, null, db);
    expect(oneWithSummary.selectedWorkspace?.capabilities.leadership).toBe(true);
    await expect(resolveActiveCustomerGrant(ids.identity, ids.case, individual.id, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });

    const relay = await createWorkspace(actor, { clientId: ids.otherClient, name: 'Átvezető tér', mode: 'CASE_RELAY', communicationMode: 'EXTERNAL_ONLY', connectedSystemState: 'READY' }, db);
    const relayInvitation = await inviteWorkspaceMember(actor, relay.id, { email: session.normalizedEmail }, db);
    const relayPending = await db.clientPortalWorkspaceMembership.findUniqueOrThrow({ where: { id: relayInvitation.membershipId! } });
    await transitionWorkspaceMembership(actor, relayPending.id, 'approve', relayPending.revision, db);
    const multiple = await getPortalIdentityContext(session, null, db);
    expect(multiple.state).toBe('SELECTION_REQUIRED');
    expect(multiple.workspaces.map((workspace) => workspace.mode).sort()).toEqual(['CASE_RELAY', 'INDIVIDUAL']);
    await expect(resolvePortalWorkspace(session, 'forged-workspace', db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_FORBIDDEN' });

    const selected = await resolvePortalWorkspace(session, individual.publicReference, db);
    expect(selected.id).toBe(individual.id);
    await db.clientPortalGrant.create({ data: { clientPortalIdentityId: ids.identity, workspaceId: individual.id, clientId: ids.client, caseId: ids.case, status: 'ACTIVE', permissions: ['MATTER_READ'], invitedById: ids.admin, activatedAt: new Date() } as any });
    await expect(resolveActiveCustomerGrant(ids.identity, ids.case, relay.id, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
    await expect(resolveActiveCustomerGrant(ids.identity, ids.otherCase, individual.id, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
    expect((await resolveActiveCustomerGrant(ids.identity, ids.case, individual.id, db)).workspaceId).toBe(individual.id);

    let active = await db.clientPortalWorkspaceMembership.findUniqueOrThrow({ where: { id: membership.id } });
    active = await transitionWorkspaceMembership(actor, active.id, 'suspend', active.revision, db);
    await expect(resolveActiveCustomerGrant(ids.identity, ids.case, individual.id, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
    active = await transitionWorkspaceMembership(actor, active.id, 'approve', active.revision, db);
    await db.clientPortalWorkspaceMembership.update({ where: { id: active.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await expect(resolveActiveCustomerGrant(ids.identity, ids.case, individual.id, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
    active = await db.clientPortalWorkspaceMembership.update({ where: { id: active.id }, data: { expiresAt: null } });
    await transitionWorkspaceMembership(actor, active.id, 'revoke', active.revision, db);
    await expect(resolveActiveCustomerGrant(ids.identity, ids.case, individual.id, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
    const currentRelay = await db.clientPortalWorkspace.findUniqueOrThrow({ where: { id: relay.id } });
    const suspendedRelay = await transitionWorkspace(actor, relay.id, 'suspend', currentRelay.revision, db);
    expect((await getPortalIdentityContext(session, null, db)).state).toBe('ACCESS_SUSPENDED');
    await transitionWorkspace(actor, relay.id, 'archive', suspendedRelay.revision, db);
    expect((await getPortalIdentityContext(session, null, db)).state).toBe('NO_ACCESS');
  });
});
