import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { listOrganizationalCases } from '../src/modules/client-workspace/organizationalCaseService';
import {
  createParticipant,
  revokeParticipant,
} from '../src/modules/client-workspace/organizationAdminService';
import {
  InternalCasePortalPublicationError,
  listCasePortalPublicationTargets,
  publishInternalCaseToPortal,
} from '../src/modules/client-publication/internalCasePortalPublication.service';

const databaseUrl = process.env.PORTAL_PUBLICATION_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

/**
 * PHASE 0 reproduction / PHASE 4 acceptance for the PARTICIPANT_GRANT_CONFLICT
 * publication defect (UX-01). Every case below publishes an internal Case to a
 * selected organization portal target and asserts the exact grant-compatibility
 * outcome. Fixtures run only against a real PostgreSQL database.
 */
d('internal Case portal publication grant compatibility (PostgreSQL)', () => {
  let db: PrismaClient;
  const ids = {
    admin: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    client: crypto.randomUUID(),
    otherClient: crypto.randomUUID(),
    workspaceA: crypto.randomUUID(),
    workspaceB: crypto.randomUUID(),
    otherWorkspace: crypto.randomUUID(),
    identity: crypto.randomUUID(),
    membershipA: crypto.randomUUID(),
    membershipB: crypto.randomUUID(),
    otherIdentity: crypto.randomUUID(),
    otherMembership: crypto.randomUUID(),
  };
  const admin = { userId: ids.admin, role: 'ADMIN' };
  const lawyer = { userId: ids.lawyer, role: 'LAWYER' };

  const publicationPayload = () => ({
    workspaceId: ids.workspaceA,
    workspaceMembershipId: ids.membershipA,
    clientSafeTitle: 'Közzétételi kompatibilitási teszt',
    clientSafeStatus: 'Folyamatban',
  });

  const makeCase = async (label: string) => {
    const caseId = crypto.randomUUID();
    await db.case.create({ data: {
      id: caseId,
      caseNumber: `COMPAT-${label}-${caseId.slice(0, 8)}`,
      title: `Grant compatibility ${label}`,
      caseType: 'CONTRACT_REVIEW',
      clientId: ids.client,
      createdById: ids.lawyer,
      assignedLawyerId: ids.lawyer,
    } as never });
    return caseId;
  };

  const cleanupCase = async (caseId: string) => {
    await db.clientPublicationEvent.deleteMany({ where: { caseId } });
    const publications = await db.clientMatterPublication.findMany({ where: { caseId }, select: { id: true } });
    await db.clientMatterPublicationRevision.deleteMany({ where: { publicationId: { in: publications.map((publication) => publication.id) } } });
    await db.clientMatterPublication.deleteMany({ where: { id: { in: publications.map((publication) => publication.id) } } });
    await db.clientPortalGrant.deleteMany({ where: { caseId } });
    await db.case.deleteMany({ where: { id: caseId } });
  };

  const existingGrant = async (caseId: string, workspaceId: string, participantRole: string, permissions: string[]) =>
    createParticipant(admin, { workspaceId, caseId, clientPortalIdentityId: ids.identity, participantRole, permissions }, db);

  const grantRow = (caseId: string, workspaceId: string) =>
    db.clientPortalGrant.findFirst({ where: { clientPortalIdentityId: ids.identity, clientId: ids.client, caseId, workspaceId } });

  const publicationRows = async (caseId: string) => db.clientMatterPublication.findMany({ where: { caseId } });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: ids.admin, email: `compat-${ids.admin}@t.io`, name: 'Compat admin', role: 'ADMIN', status: 'ACTIVE' },
      { id: ids.lawyer, email: `compat-${ids.lawyer}@t.io`, name: 'Compat lawyer', role: 'LAWYER', status: 'ACTIVE' },
    ] as never });
    await db.client.createMany({ data: [
      { id: ids.client, name: `Compat client ${ids.client}` },
      { id: ids.otherClient, name: `Compat other client ${ids.otherClient}` },
    ] });
    await db.clientPortalWorkspace.createMany({ data: [
      { id: ids.workspaceA, clientId: ids.client, name: 'Demo Kft portal', mode: 'ORGANIZATION', publicReference: `compat-${ids.workspaceA}`, createdById: ids.admin },
      { id: ids.workspaceB, clientId: ids.client, name: 'Demo Kft második munkatér', mode: 'ORGANIZATION', publicReference: `compat-${ids.workspaceB}`, createdById: ids.admin },
      { id: ids.otherWorkspace, clientId: ids.otherClient, name: 'Other portal', mode: 'ORGANIZATION', publicReference: `compat-${ids.otherWorkspace}`, createdById: ids.admin },
    ] });
    await db.clientPortalIdentity.createMany({ data: [
      { id: ids.identity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'compat-test', subject: `member-${ids.identity}`, normalizedEmail: `compat-${ids.identity}@t.io`, emailVerifiedAt: new Date(), displayName: 'Péterfi János', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: ids.otherIdentity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'compat-test', subject: `other-${ids.otherIdentity}`, normalizedEmail: `compat-${ids.otherIdentity}@t.io`, emailVerifiedAt: new Date(), displayName: 'Másik Ügyfél', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    ] });
    await db.clientPortalWorkspaceMembership.createMany({ data: [
      { id: ids.membershipA, clientPortalIdentityId: ids.identity, workspaceId: ids.workspaceA, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin },
      { id: ids.membershipB, clientPortalIdentityId: ids.identity, workspaceId: ids.workspaceB, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin },
      { id: ids.otherMembership, clientPortalIdentityId: ids.otherIdentity, workspaceId: ids.otherWorkspace, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin },
    ] });
  });

  afterAll(async () => {
    await db.clientPortalGrant.deleteMany({ where: { clientPortalIdentityId: { in: [ids.identity, ids.otherIdentity] } } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { id: { in: [ids.membershipA, ids.membershipB, ids.otherMembership] } } });
    await db.clientPortalIdentity.deleteMany({ where: { id: { in: [ids.identity, ids.otherIdentity] } } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: { in: [ids.workspaceA, ids.workspaceB, ids.otherWorkspace] } } });
    await db.client.deleteMany({ where: { id: { in: [ids.client, ids.otherClient] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.lawyer] } } });
    await db.$disconnect();
  });

  it('A: publishes with a fresh target (no prior grant) and creates a PARTICIPANT/MATTER_READ grant', async () => {
    const caseId = await makeCase('A');
    try {
      const result = await publishInternalCaseToPortal(lawyer, caseId, publicationPayload(), db);
      expect(result.grant.status).toBe('ACTIVE');
      const grant = await grantRow(caseId, ids.workspaceA);
      expect(grant).not.toBeNull();
      expect(grant?.participantRole).toBe('PARTICIPANT');
      expect([...(grant?.permissions ?? [])].sort()).toEqual(['MATTER_READ']);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('A2: reuses an exact existing PARTICIPANT + MATTER_READ grant idempotently', async () => {
    const caseId = await makeCase('A2');
    try {
      const prior = await existingGrant(caseId, ids.workspaceA, 'PARTICIPANT', ['MATTER_READ']);
      const result = await publishInternalCaseToPortal(lawyer, caseId, publicationPayload(), db);
      expect(result.grant.idempotent).toBe(true);
      const grants = await db.clientPortalGrant.findMany({ where: { clientPortalIdentityId: ids.identity, clientId: ids.client, caseId } });
      expect(grants).toHaveLength(1);
      expect(grants[0]?.id).toBe(prior.id);
      expect((await publicationRows(caseId))).toHaveLength(1);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('B (REPRO): same-workspace CLIENT_OWNER grant with MATTER_READ + extras currently blocks publication', async () => {
    const caseId = await makeCase('B');
    try {
      await existingGrant(caseId, ids.workspaceA, 'CLIENT_OWNER', ['MATTER_READ', 'DOCUMENT_READ']);
      await expect(publishInternalCaseToPortal(lawyer, caseId, publicationPayload(), db))
        .rejects.toMatchObject({ code: 'PARTICIPANT_GRANT_CONFLICT' } satisfies Partial<InternalCasePortalPublicationError>);
      expect(await publicationRows(caseId)).toHaveLength(0);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('C (REPRO): same-workspace PARTICIPANT grant with a permission superset currently blocks publication', async () => {
    const caseId = await makeCase('C');
    try {
      await existingGrant(caseId, ids.workspaceA, 'PARTICIPANT', ['MATTER_READ', 'UPDATE_READ']);
      await expect(publishInternalCaseToPortal(lawyer, caseId, publicationPayload(), db))
        .rejects.toMatchObject({ code: 'PARTICIPANT_GRANT_CONFLICT' } satisfies Partial<InternalCasePortalPublicationError>);
      expect(await publicationRows(caseId)).toHaveLength(0);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('D: same-workspace grant WITHOUT MATTER_READ blocks publication', async () => {
    const caseId = await makeCase('D');
    try {
      await existingGrant(caseId, ids.workspaceA, 'PARTICIPANT', ['DOCUMENT_READ']);
      await expect(publishInternalCaseToPortal(lawyer, caseId, publicationPayload(), db))
        .rejects.toMatchObject({ code: 'PARTICIPANT_GRANT_CONFLICT' } satisfies Partial<InternalCasePortalPublicationError>);
      expect(await publicationRows(caseId)).toHaveLength(0);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('E: active grant for the same identity/case in ANOTHER workspace blocks publication', async () => {
    const caseId = await makeCase('E');
    try {
      await existingGrant(caseId, ids.workspaceB, 'PARTICIPANT', ['MATTER_READ']);
      await expect(publishInternalCaseToPortal(lawyer, caseId, publicationPayload(), db))
        .rejects.toMatchObject({ code: 'PARTICIPANT_GRANT_CONFLICT' } satisfies Partial<InternalCasePortalPublicationError>);
      expect(await publicationRows(caseId)).toHaveLength(0);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('F: revoked previous grant in the SAME workspace is reactivated by publication (current behavior)', async () => {
    const caseId = await makeCase('F');
    try {
      const prior = await existingGrant(caseId, ids.workspaceA, 'PARTICIPANT', ['MATTER_READ']);
      await revokeParticipant(admin, prior.id, db);
      const result = await publishInternalCaseToPortal(lawyer, caseId, publicationPayload(), db);
      expect(result.grant.status).toBe('ACTIVE');
      const grants = await db.clientPortalGrant.findMany({ where: { clientPortalIdentityId: ids.identity, clientId: ids.client, caseId } });
      expect(grants).toHaveLength(1);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('F2: revoked previous grant in ANOTHER workspace blocks publication', async () => {
    const caseId = await makeCase('F2');
    try {
      const prior = await existingGrant(caseId, ids.workspaceB, 'PARTICIPANT', ['MATTER_READ']);
      await revokeParticipant(admin, prior.id, db);
      await expect(publishInternalCaseToPortal(lawyer, caseId, publicationPayload(), db))
        .rejects.toMatchObject({ code: 'PARTICIPANT_GRANT_CONFLICT' } satisfies Partial<InternalCasePortalPublicationError>);
      expect(await publicationRows(caseId)).toHaveLength(0);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('cross-client workspace substitution is denied without visibility', async () => {
    const caseId = await makeCase('XCLIENT');
    try {
      await expect(publishInternalCaseToPortal(lawyer, caseId, {
        workspaceId: ids.otherWorkspace,
        workspaceMembershipId: ids.otherMembership,
        clientSafeTitle: 'Kereszt ügyfél közzététel',
        clientSafeStatus: 'Folyamatban',
      }, db)).rejects.toMatchObject({ code: 'CASE_CLIENT_MISMATCH' } satisfies Partial<InternalCasePortalPublicationError>);
      expect(await publicationRows(caseId)).toHaveLength(0);
    } finally {
      await cleanupCase(caseId);
    }
  });

  it('readiness preflight (CURRENT): targets without grant are selectable and an internal Case stays private until publication', async () => {
    const caseId = await makeCase('PREFLIGHT');
    try {
      expect((await listOrganizationalCases(ids.identity, ids.workspaceA, {}, db)).total).toBe(0);
      const targets = await listCasePortalPublicationTargets(admin, caseId, db);
      expect(targets.items.length).toBeGreaterThanOrEqual(1);
      const target = targets.items.find((item) => item.workspaceMembershipId === ids.membershipA);
      expect(target).toBeDefined();
      expect(target?.workspaceId).toBe(ids.workspaceA);
    } finally {
      await cleanupCase(caseId);
    }
  });
});
