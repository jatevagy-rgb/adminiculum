import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  approveMembershipRequest,
  createGrantForApprovedMembership,
  createOrganizationGroup,
  rejectMembershipRequest,
  submitMembershipRequest,
  validateInvitation,
} from '../src/modules/client-identity/identityService';
import { createWorkspace } from '../src/modules/client-workspace/workspaceService';

const databaseUrl = process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  admin: crypto.randomUUID(),
  lawyer: crypto.randomUUID(),
  client: crypto.randomUUID(),
  otherClient: crypto.randomUUID(),
  case: crypto.randomUUID(),
  identity: crypto.randomUUID(),
};

const admin = { userId: ids.admin, role: 'ADMIN' };
const session = {
  identityType: 'CLIENT_PORTAL' as const,
  issuer: 'https://customer.example.invalid/',
  audience: 'adminiculum-client-portal',
  subject: 'customer-subject-1',
  clientPortalIdentityId: ids.identity,
  normalizedEmail: 'customer@example.invalid',
  displayName: 'Customer Contact',
  accountType: 'ORGANIZATION_MEMBER' as const,
  status: 'ACTIVE',
  emailVerified: true,
  sessionContext: 'CUSTOMER_IDENTITY_PROVIDER' as const,
};

describeWithDatabase('Client identity membership PostgreSQL boundary', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toBe('adminiculum_replay_ci');
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: ids.admin, email: 'identity-admin@example.invalid', name: 'Identity Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.lawyer, email: 'identity-lawyer@example.invalid', name: 'Identity Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] });
    await db.client.createMany({ data: [{ id: ids.client, name: 'Identity Client' }, { id: ids.otherClient, name: 'Other Identity Client' }] });
    await db.case.create({ data: { id: ids.case, caseNumber: 'IDENT-001', title: 'Identity case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.lawyer, assignedLawyerId: ids.lawyer } });
    await db.clientPortalIdentity.create({ data: { id: ids.identity, provider: 'ENTRA_EXTERNAL_ID', issuer: session.issuer, subject: session.subject, normalizedEmail: session.normalizedEmail, emailVerifiedAt: new Date(), displayName: session.displayName, accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' } });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('keeps membership pending until approval provisions an active workspace membership (no auto grant)', async () => {
    const group = await createOrganizationGroup(admin, { clientId: ids.client, name: 'Jogi osztály' });
    const workspace = await createWorkspace(admin, { clientId: ids.client, name: 'Identity workspace', mode: 'ORGANIZATION', communicationMode: 'PORTAL_PRIMARY' });
    // The customer may never supply an authoritative client/workspace id — only
    // claimed labels and the requested mode.
    const request = await submitMembershipRequest(session, { requestedMode: 'ORGANIZATION', claimedOrganizationName: 'Identity Client', claimedUnitName: 'Jogi', claimedJobTitle: 'Vezető jogtanácsos' });
    expect(request.status).toBe('PENDING_REVIEW');
    expect(await db.clientOrganizationMembership.count({ where: { clientPortalIdentityId: ids.identity } })).toBe(0);
    expect(await db.clientPortalWorkspaceMembership.count({ where: { clientPortalIdentityId: ids.identity, workspaceId: workspace.id } })).toBe(0);
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: ids.identity } })).toBe(0);
    const pending = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: request.id } });
    // Compatibility guards: a workspace belonging to another client is rejected,
    // and a cross-client group is rejected.
    await expect(approveMembershipRequest(admin, request.id, { clientId: ids.otherClient, workspaceId: workspace.id, revision: pending.revision })).rejects.toMatchObject({ code: 'WORKSPACE_CLIENT_MISMATCH' });
    const approved = await approveMembershipRequest(admin, request.id, { clientId: ids.client, workspaceId: workspace.id, groupId: group.id, role: 'REPRESENTATIVE', revision: pending.revision });
    expect(approved.grantRequired).toBe(true);
    // Approval provisioned an ACTIVE workspace membership with the chosen role...
    const activeWorkspaceMembership = await db.clientPortalWorkspaceMembership.findFirstOrThrow({ where: { clientPortalIdentityId: ids.identity, workspaceId: workspace.id } });
    expect(activeWorkspaceMembership.status).toBe('ACTIVE');
    expect(activeWorkspaceMembership.role).toBe('REPRESENTATIVE');
    // ...recorded the linkage on the request...
    const approvedRequest = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approvedRequest.status).toBe('APPROVED');
    expect(approvedRequest.approvedWorkspaceId).toBe(workspace.id);
    expect(approvedRequest.approvedMembershipId).toBe(activeWorkspaceMembership.id);
    // ...promoted the identity to ACTIVE, and created NO automatic case grant.
    expect((await db.clientPortalIdentity.findUniqueOrThrow({ where: { id: ids.identity } })).status).toBe('ACTIVE');
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: ids.identity } })).toBe(0);
    // An explicit grant against the provisioned workspace membership still works.
    const grant = await createGrantForApprovedMembership(admin, { workspaceMembershipId: activeWorkspaceMembership.id, caseId: ids.case, permissions: ['MATTER_READ', 'DOCUMENT_READ'] });
    expect(grant.clientPortalIdentityId).toBe(ids.identity);
    expect(grant.clientId).toBe(ids.client);

    const equivalent = await createGrantForApprovedMembership(admin, { workspaceMembershipId: activeWorkspaceMembership.id, caseId: ids.case, permissions: ['DOCUMENT_READ', 'MATTER_READ'] });
    expect(equivalent.id).toBe(grant.id);
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: ids.identity, clientId: ids.client, caseId: ids.case } })).toBe(1);
    await expect(createGrantForApprovedMembership(admin, { workspaceMembershipId: activeWorkspaceMembership.id, caseId: ids.case, permissions: ['MATTER_READ'] })).rejects.toMatchObject({ code: 'GRANT_ALREADY_ACTIVE', status: 409 });

    const revoked = await db.clientPortalGrant.update({ where: { id: grant.id }, data: { status: 'REVOKED', revision: { increment: 1 }, revokedAt: new Date() } });
    const reactivated = await createGrantForApprovedMembership(admin, { workspaceMembershipId: activeWorkspaceMembership.id, caseId: ids.case, permissions: ['MATTER_READ', 'DOCUMENT_READ'] });
    expect(reactivated.id).toBe(grant.id);
    expect(reactivated.status).toBe('ACTIVE');
    expect(reactivated.revision).toBe(revoked.revision + 1);

    await db.clientPortalGrant.update({ where: { id: grant.id }, data: { status: 'SUSPENDED', revision: { increment: 1 }, suspendedAt: new Date() } });
    const suspendedReactivation = await createGrantForApprovedMembership(admin, { workspaceMembershipId: activeWorkspaceMembership.id, caseId: ids.case, permissions: ['MATTER_READ', 'DOCUMENT_READ'] });
    expect(suspendedReactivation.id).toBe(grant.id);
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: ids.identity, clientId: ids.client, caseId: ids.case } })).toBe(1);
    expect(await db.clientPublicationEvent.count({ where: { grantId: grant.id, action: 'GRANT_ACTIVATED' } })).toBeGreaterThanOrEqual(3);

    await expect(createGrantForApprovedMembership(admin, { workspaceMembershipId: activeWorkspaceMembership.id, caseId: crypto.randomUUID(), permissions: ['MATTER_READ'] })).rejects.toMatchObject({ code: 'CASE_NOT_FOUND', status: 404 });
  });

  it('uses non-enumerating invitation validation and prevents double review', async () => {
    expect(await validateInvitation('missing-token')).toEqual({ valid: false, status: 'UNAVAILABLE' });
    const workspace = await createWorkspace(admin, { clientId: ids.client, name: 'Review workspace', mode: 'ORGANIZATION', communicationMode: 'PORTAL_PRIMARY' });
    const request = await submitMembershipRequest(session, { requestedMode: 'ORGANIZATION', claimedOrganizationName: 'No enumeration org' });
    const pending = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: request.id } });
    // Split decision surfaces: the customer-safe message is stored separately
    // from the internal note, which must never reach a customer DTO.
    await rejectMembershipRequest(admin, request.id, { revision: pending.revision, clientSafeDecisionMessage: 'Nem ellenőrizhető kapcsolat.', internalDecisionNote: 'belső: hiányos azonosítás' });
    const rejected = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(rejected.clientSafeDecisionMessage).toBe('Nem ellenőrizhető kapcsolat.');
    expect(rejected.internalDecisionNote).toBe('belső: hiányos azonosítás');
    await expect(approveMembershipRequest(admin, request.id, { clientId: ids.client, workspaceId: workspace.id, revision: pending.revision + 1 })).rejects.toMatchObject({ code: 'REQUEST_NOT_PENDING' });
  });
});
