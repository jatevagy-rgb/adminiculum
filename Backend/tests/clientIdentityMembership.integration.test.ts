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

  it('keeps organization membership pending until internal approval and grant creation', async () => {
    const group = await createOrganizationGroup(admin, { clientId: ids.client, name: 'Jogi osztály' });
    await expect(submitMembershipRequest(session, { requestedClientId: ids.otherClient, requestedGroupId: group.id, requestedOrganizationName: 'Identity Client' })).rejects.toMatchObject({ code: 'CROSS_CLIENT_GROUP_REJECTED' });
    const request = await submitMembershipRequest(session, { requestedClientId: ids.client, requestedGroupId: group.id, requestedOrganizationName: 'Identity Client', corporateEmail: session.normalizedEmail });
    expect(request.status).toBe('PENDING_REVIEW');
    expect(await db.clientOrganizationMembership.count({ where: { clientPortalIdentityId: ids.identity } })).toBe(0);
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: ids.identity } })).toBe(0);
    const pending = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: request.id } });
    const approved = await approveMembershipRequest(admin, request.id, { clientId: ids.client, groupId: group.id, revision: pending.revision });
    expect(approved.grantRequired).toBe(true);
    expect(await db.clientPortalGrant.count({ where: { clientPortalIdentityId: ids.identity } })).toBe(0);
    const grant = await createGrantForApprovedMembership(admin, { membershipId: approved.membership.id, caseId: ids.case, permissions: ['MATTER_READ', 'DOCUMENT_READ'] });
    expect(grant.clientPortalIdentityId).toBe(ids.identity);
    expect(grant.clientId).toBe(ids.client);
  });

  it('uses non-enumerating invitation validation and prevents double review', async () => {
    expect(await validateInvitation('missing-token')).toEqual({ valid: false, status: 'UNAVAILABLE' });
    const request = await submitMembershipRequest(session, { requestedOrganizationName: 'No enumeration org', corporateEmail: session.normalizedEmail });
    const pending = await db.clientOrganizationMembershipRequest.findUniqueOrThrow({ where: { id: request.id } });
    await rejectMembershipRequest(admin, request.id, { revision: pending.revision, rejectionReasonSafe: 'Nem ellenőrizhető kapcsolat.' });
    await expect(approveMembershipRequest(admin, request.id, { clientId: ids.client, revision: pending.revision + 1 })).rejects.toMatchObject({ code: 'REQUEST_NOT_PENDING' });
  });
});
