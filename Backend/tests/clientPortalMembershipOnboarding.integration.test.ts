import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  acceptPortalInvitation,
  approveMembershipRequest,
  getCurrentMembershipRequests,
  rejectMembershipRequest,
  submitMembershipRequest,
} from '../src/modules/client-identity/identityService';
import { createWorkspace, getOnboardingContext, inviteWorkspaceMember } from '../src/modules/client-workspace/workspaceService';
import type { ClientPortalSession } from '../src/middleware/clientPortalAuth';

const databaseUrl = process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.CLIENT_INTERACTION_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

function sessionFor(identityId: string, email: string, status = 'REGISTERED', displayName = 'Onboarding User'): ClientPortalSession {
  return {
    identityType: 'CLIENT_PORTAL',
    issuer: 'https://customer.example.invalid/',
    audience: 'adminiculum-client-portal',
    subject: `sub-${identityId}`,
    clientPortalIdentityId: identityId,
    normalizedEmail: email,
    displayName,
    accountType: 'ORGANIZATION_MEMBER',
    status,
    emailVerified: true,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER',
  };
}

d('Client portal membership onboarding (PostgreSQL)', () => {
  let db: PrismaClient;
  const admin = crypto.randomUUID();
  const client = crypto.randomUUID();
  const otherClient = crypto.randomUUID();

  async function makeIdentity(email: string, status = 'REGISTERED') {
    const id = crypto.randomUUID();
    await db.clientPortalIdentity.create({ data: { id, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://customer.example.invalid/', subject: `sub-${id}`, normalizedEmail: email, emailVerifiedAt: new Date(), displayName: 'Onboarding User', accountType: 'ORGANIZATION_MEMBER', status: status as never } });
    return id;
  }

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.create({ data: { id: admin, email: `onb-admin-${admin}@t.io`, name: 'Onboarding Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.createMany({ data: [{ id: client, name: 'Onboarding Client Kft.' }, { id: otherClient, name: 'Other Onboarding Client' }] });
  });

  afterAll(async () => { await db?.$disconnect(); });

  const reviewer = { userId: admin, role: 'ADMIN' };

  it('resolves ONBOARDING_REQUIRED for a membership-less identity, then REQUEST_PENDING after submit', async () => {
    const email = `pending-${crypto.randomUUID()}@t.io`;
    const id = await makeIdentity(email);
    const session = sessionFor(id, email);

    const before = await getOnboardingContext(session, undefined, db);
    expect(before.state).toBe('ONBOARDING_REQUIRED');
    expect(before.onboarding?.allowedNextAction).toBe('SUBMIT_REQUEST');

    // Server-authoritative fields injected by the client are ignored — only the
    // allowlisted claimed data is persisted.
    const result = await submitMembershipRequest(session, {
      requestedMode: 'ORGANIZATION',
      claimedOrganizationName: 'Onboarding Client Kft.',
      claimedUnitName: 'HR',
      claimedJobTitle: 'HR munkatárs',
      clientId: otherClient,
      requestedClientId: otherClient,
      workspaceId: crypto.randomUUID(),
      status: 'APPROVED',
      permissions: ['MATTER_READ'],
    } as Record<string, unknown>);
    expect(result.status).toBe('PENDING_REVIEW');

    const stored = await db.clientOrganizationMembershipRequest.findFirstOrThrow({ where: { clientPortalIdentityId: id } });
    expect(stored.status).toBe('PENDING_REVIEW');
    expect(stored.requestedClientId).toBeNull(); // injection ignored
    expect(stored.requestedMode).toBe('ORGANIZATION');
    expect(stored.verifiedEmailSnapshot).toBe(email); // server-set, not client-set

    const after = await getOnboardingContext(session, undefined, db);
    expect(after.state).toBe('REQUEST_PENDING');
    expect(after.onboarding?.latestRequest?.claimedOrganizationName).toBe('Onboarding Client Kft.');
  });

  it('is idempotent: a repeated submit does not create a second pending request', async () => {
    const email = `dup-${crypto.randomUUID()}@t.io`;
    const id = await makeIdentity(email);
    const session = sessionFor(id, email);
    const first = await submitMembershipRequest(session, { requestedMode: 'INDIVIDUAL' });
    const second = await submitMembershipRequest(session, { requestedMode: 'INDIVIDUAL' });
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(await db.clientOrganizationMembershipRequest.count({ where: { clientPortalIdentityId: id, status: 'PENDING_REVIEW' } })).toBe(1);
  });

  it('scopes a request to its owning identity', async () => {
    const emailA = `own-a-${crypto.randomUUID()}@t.io`;
    const emailB = `own-b-${crypto.randomUUID()}@t.io`;
    const idA = await makeIdentity(emailA);
    const idB = await makeIdentity(emailB);
    await submitMembershipRequest(sessionFor(idA, emailA), { requestedMode: 'ORGANIZATION', claimedOrganizationName: 'A cég' });
    const contextB = await getOnboardingContext(sessionFor(idB, emailB), undefined, db);
    expect(contextB.state).toBe('ONBOARDING_REQUIRED');
    expect(contextB.onboarding?.latestRequest).toBeNull();
  });

  it('approval provisions an ACTIVE workspace membership and flips the resolver to READY, with no auto grant', async () => {
    const email = `approve-${crypto.randomUUID()}@t.io`;
    const id = await makeIdentity(email);
    const session = sessionFor(id, email);
    const workspace = await createWorkspace(reviewer, { clientId: client, name: 'HR munkatér', mode: 'ORGANIZATION', communicationMode: 'PORTAL_PRIMARY' });

    const submitted = await submitMembershipRequest(session, { requestedMode: 'ORGANIZATION', claimedOrganizationName: 'Onboarding Client Kft.' });
    const pending = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: submitted.id } });

    // Mode/client compatibility guards.
    const indivWorkspace = await createWorkspace(reviewer, { clientId: client, name: 'Privát', mode: 'INDIVIDUAL', communicationMode: 'PORTAL_PRIMARY' });
    await expect(approveMembershipRequest(reviewer, submitted.id, { clientId: client, workspaceId: indivWorkspace.id, revision: pending.revision })).rejects.toMatchObject({ code: 'WORKSPACE_MODE_MISMATCH' });
    await expect(approveMembershipRequest(reviewer, submitted.id, { clientId: otherClient, workspaceId: workspace.id, revision: pending.revision })).rejects.toMatchObject({ code: 'WORKSPACE_CLIENT_MISMATCH' });

    await approveMembershipRequest(reviewer, submitted.id, { clientId: client, workspaceId: workspace.id, role: 'MEMBER', revision: pending.revision, clientSafeDecisionMessage: 'Üdvözöljük!', internalDecisionNote: 'belső: rendben' });

    const wsMembership = await db.clientPortalWorkspaceMembership.findFirstOrThrow({ where: { clientPortalIdentityId: id, workspaceId: workspace.id } });
    expect(wsMembership.status).toBe('ACTIVE');
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: id } })).toBe(0); // no auto case grant

    const activeSession = sessionFor(id, email, 'ACTIVE');
    const context = await getOnboardingContext(activeSession, undefined, db);
    expect(context.state).toBe('READY');
    expect(context.selectedWorkspace?.publicReference).toBe(workspace.publicReference);
  });

  it('rejection stores a client-safe message and keeps the internal note out of the customer DTO', async () => {
    const email = `reject-${crypto.randomUUID()}@t.io`;
    const id = await makeIdentity(email);
    const session = sessionFor(id, email);
    const submitted = await submitMembershipRequest(session, { requestedMode: 'ORGANIZATION', claimedOrganizationName: 'Elutasítandó cég' });
    const pending = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: submitted.id } });
    await rejectMembershipRequest(reviewer, submitted.id, { revision: pending.revision, clientSafeDecisionMessage: 'Kérjük, vegye fel a kapcsolatot az irodával.', internalDecisionNote: 'belső: azonosítás sikertelen' });

    const context = await getOnboardingContext(session, undefined, db);
    expect(context.state).toBe('REQUEST_REJECTED');
    expect(context.onboarding?.latestRequest?.decisionMessage).toBe('Kérjük, vegye fel a kapcsolatot az irodával.');

    const customerView = await getCurrentMembershipRequests(session);
    const serialized = JSON.stringify(customerView);
    expect(serialized).toContain('Kérjük, vegye fel a kapcsolatot az irodával.');
    expect(serialized).not.toContain('azonosítás sikertelen');
    expect(serialized).not.toContain('internalDecisionNote');
  });

  it('surfaces a matching invitation (case-insensitive e-mail) and accepts it into an active membership', async () => {
    const email = `invite-${crypto.randomUUID()}@t.io`;
    const workspace = await createWorkspace(reviewer, { clientId: client, name: 'Meghívott munkatér', mode: 'ORGANIZATION', communicationMode: 'PORTAL_PRIMARY' });
    // Invite the address BEFORE any identity exists (the real invited-user flow):
    // inviteWorkspaceMember then records an invitation row rather than a pending
    // membership. The admin invites the UPPER-CASE form; the identity's verified
    // e-mail is the lower-case form — they must still match.
    await inviteWorkspaceMember(reviewer, workspace.id, { email: email.toUpperCase(), role: 'MEMBER' });
    const id = await makeIdentity(email);

    const session = sessionFor(id, email);
    const context = await getOnboardingContext(session, undefined, db);
    expect(context.state).toBe('INVITATION_PENDING');
    expect(context.onboarding?.invitation?.workspaceName).toBe('Meghívott munkatér');

    const accepted = await acceptPortalInvitation(session, { invitationId: context.onboarding!.invitation!.invitationId });
    expect(accepted.workspaceReference).toBe(workspace.publicReference);
    const membership = await db.clientPortalWorkspaceMembership.findFirstOrThrow({ where: { clientPortalIdentityId: id, workspaceId: workspace.id } });
    expect(membership.status).toBe('ACTIVE');

    const readyContext = await getOnboardingContext(sessionFor(id, email, 'ACTIVE'), undefined, db);
    expect(readyContext.state).toBe('READY');
  });

  // --- Assignment-model orchestration (existing vs new client) -------------

  it('NEW_CLIENT individual: creates Client + INDIVIDUAL surface + membership atomically, no case grant, reaches READY', async () => {
    const email = `newcli-${crypto.randomUUID()}@t.io`;
    const id = await makeIdentity(email);
    const session = sessionFor(id, email);
    const submitted = await submitMembershipRequest(session, { requestedMode: 'INDIVIDUAL' });
    const pending = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: submitted.id } });

    const result = await approveMembershipRequest(reviewer, submitted.id, {
      assignmentMode: 'NEW_CLIENT',
      actualMode: 'INDIVIDUAL',
      newClientInput: { name: 'Péterfi János (magánügyfél)' },
      portalMembershipRole: 'MEMBER',
      revision: pending.revision,
    });
    expect(result.createdClient).toBe(true);
    expect(result.createdWorkspace).toBe(true);
    const newClient = await db.client.findUniqueOrThrow({ where: { id: result.clientId } });
    expect(newClient.name).toBe('Péterfi János (magánügyfél)');
    const workspace = await db.clientPortalWorkspace.findUniqueOrThrow({ where: { id: result.workspaceId } });
    expect(workspace.mode).toBe('INDIVIDUAL');
    expect(workspace.clientId).toBe(result.clientId);
    const wsMembership = await db.clientPortalWorkspaceMembership.findFirstOrThrow({ where: { clientPortalIdentityId: id, workspaceId: result.workspaceId } });
    expect(wsMembership.status).toBe('ACTIVE');
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: id } })).toBe(0);

    const readyContext = await getOnboardingContext(sessionFor(id, email, 'ACTIVE'), undefined, db);
    expect(readyContext.state).toBe('READY');
    expect(readyContext.selectedWorkspace?.publicReference).toBe(workspace.publicReference);
  });

  it('EXISTING_CLIENT with no compatible surface creates one inline; a second approval auto-selects it', async () => {
    const emailA = `exista-${crypto.randomUUID()}@t.io`;
    const idA = await makeIdentity(emailA);
    const submittedA = await submitMembershipRequest(sessionFor(idA, emailA), { requestedMode: 'ORGANIZATION', claimedOrganizationName: 'Onboarding Client Kft.' });
    const pendingA = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: submittedA.id } });
    // No ORGANIZATION surface yet for `client` -> inline create.
    const resA = await approveMembershipRequest(reviewer, submittedA.id, {
      assignmentMode: 'EXISTING_CLIENT', existingClientId: client, actualMode: 'ORGANIZATION',
      createWorkspaceInput: { name: 'Onboarding – Szervezeti', mode: 'ORGANIZATION' },
      portalMembershipRole: 'REPRESENTATIVE',
      newOrganizationGroupName: 'HR', unitRole: 'MANAGER',
      revision: pendingA.revision,
    });
    expect(resA.createdWorkspace).toBe(true);
    const group = await db.clientOrganizationGroup.findFirstOrThrow({ where: { clientId: client, name: 'HR', workspaceId: resA.workspaceId } });
    const orgMembershipA = await db.clientOrganizationMembership.findFirstOrThrow({ where: { clientPortalIdentityId: idA, groupId: group.id } });
    expect(orgMembershipA.unitRole).toBe('MANAGER');

    // Second applicant, same client + mode -> the surface auto-selects (no createWorkspaceInput).
    const emailB = `existb-${crypto.randomUUID()}@t.io`;
    const idB = await makeIdentity(emailB);
    const submittedB = await submitMembershipRequest(sessionFor(idB, emailB), { requestedMode: 'ORGANIZATION', claimedOrganizationName: 'Onboarding Client Kft.' });
    const pendingB = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: submittedB.id } });
    const resB = await approveMembershipRequest(reviewer, submittedB.id, {
      assignmentMode: 'EXISTING_CLIENT', existingClientId: client, actualMode: 'ORGANIZATION', portalMembershipRole: 'MEMBER', revision: pendingB.revision,
    });
    expect(resB.createdWorkspace).toBe(false);
    expect(resB.workspaceId).toBe(resA.workspaceId); // auto-selected the single compatible surface
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: idB } })).toBe(0);
  });

  it('NEW_CLIENT rolls back the Client when membership creation fails (no orphan)', async () => {
    const email = `rollback-${crypto.randomUUID()}@t.io`;
    const id = await makeIdentity(email);
    const submitted = await submitMembershipRequest(sessionFor(id, email), { requestedMode: 'INDIVIDUAL' });
    const pending = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: submitted.id } });
    const uniqueName = `Rollback Co ${crypto.randomUUID()}`;
    // Force the membership insert to fail: pre-create a membership row for this
    // request id so the unique(approvedFromRequestId) constraint trips mid-tx.
    await db.clientOrganizationMembership.create({ data: { clientPortalIdentityId: id, clientId: otherClient, approvedFromRequestId: submitted.id, approvedById: admin, approvedAt: new Date() } });
    await expect(approveMembershipRequest(reviewer, submitted.id, {
      assignmentMode: 'NEW_CLIENT', actualMode: 'INDIVIDUAL', newClientInput: { name: uniqueName }, portalMembershipRole: 'MEMBER', revision: pending.revision,
    })).rejects.toBeDefined();
    // The new Client must not have been left behind.
    expect(await db.client.count({ where: { name: uniqueName } })).toBe(0);
  });
});
