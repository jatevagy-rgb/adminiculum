/**
 * DEMO KFT. IDENTITY BINDING & IMMUTABILITY — POSTGRESQL BEHAVIORAL TESTS
 *
 * Real database tests proving:
 *   A. Existing verified identity -> claims immutable, Demo Kft membership + grants attached
 *   B. Existing INDIVIDUAL + Demo ORGANIZATION -> dual membership on same identity, no second identity
 *   C. No existing identity -> NO synthetic identity created, NO grants on nonexistent identity, PENDING_IDENTITY
 *   D. Unverified email identity -> NO membership/grant binding
 *   E. Inactive / suspended / revoked identity -> NO reactivation, NO binding
 *   F. Namespace safety -> unrelated clients/workspaces/identities/memberships/grants survive reset
 *   G. Idempotency -> consecutive resets produce identical single membership + 3 grants
 *   H. Explicit issuer/subject mismatch -> cannot fall back to email
 *   I. Exact issuer/subject pair -> priority over matching-email identity
 *   J. Partial issuer/subject configuration -> invalid config / no email fallback
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const databaseUrl =
  process.env.DEMO_KFT_TEST_DATABASE_URL ||
  process.env.CLIENT_WORKSPACE_TEST_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

function stableId(name: string): string {
  return crypto.createHash('sha256').update(`DEMO_KFT_2026:${name}`).digest('hex').slice(0, 32);
}

const DEMO_IDS = {
  clientId: stableId('demoClient'),
  workspaceId: stableId('orgWorkspace'),
  caseEmploymentId: stableId('caseEmployment'),
  caseSupplierId: stableId('caseSupplier'),
  caseComplianceId: stableId('caseCompliance'),
};

describeWithDatabase('Demo Kft Identity Binding & Immutability (Real PostgreSQL)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.ADMINICULUM_DEMO_CONTENT_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  function runResetScript(customEnv: Record<string, string> = {}) {
    const possibleTsx = [
      path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs'),
      path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
      path.resolve(process.cwd(), 'Backend/node_modules/tsx/dist/cli.mjs'),
    ];
    const tsxCli = possibleTsx.find((p) => fs.existsSync(p)) || 'tsx';
    const scriptPath = path.resolve(__dirname, '../scripts/demo-kft-reset.mjs');
    const stdout = execFileSync(process.execPath, [tsxCli, scriptPath], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        ADMINICULUM_DEMO_CONTENT_ENABLED: 'true',
        ...customEnv,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return stdout;
  }

  // -------------------------------------------------------------------------
  // Scenario A: Existing verified identity
  // -------------------------------------------------------------------------
  it('A. EXISTING VERIFIED IDENTITY: binds Demo Kft membership + grants while preserving identity claims', async () => {
    const identityId = crypto.randomUUID();
    const verifiedEmail = `verified.exec.${identityId.slice(0, 8)}@demo.invalid`.toLowerCase();
    const verifiedDate = new Date('2026-01-15T12:00:00.000Z');

    const created = await db.clientPortalIdentity.create({
      data: {
        id: identityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/test-real-tenant/v2.0',
        subject: `sub-real-${identityId}`,
        normalizedEmail: verifiedEmail,
        displayName: 'Dr. Real Authenticated Lawyer',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
        emailVerifiedAt: verifiedDate,
      },
    });

    const output = runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: verifiedEmail,
    });
    expect(output).toContain('DEMO_PORTAL_IDENTITY_BINDING=BOUND');

    const after = await db.clientPortalIdentity.findUniqueOrThrow({
      where: { id: identityId },
    });

    // Prove all identity claims are 100% untouched
    expect(after.issuer).toBe(created.issuer);
    expect(after.subject).toBe(created.subject);
    expect(after.normalizedEmail).toBe(created.normalizedEmail);
    expect(after.provider).toBe(created.provider);
    expect(after.displayName).toBe(created.displayName);
    expect(after.accountType).toBe(created.accountType);
    expect(after.status).toBe('ACTIVE');
    expect(after.emailVerifiedAt?.toISOString()).toBe(verifiedDate.toISOString());

    // Prove Demo Kft membership is attached
    const membership = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityId,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(membership).not.toBeNull();
    expect(membership?.status).toBe('ACTIVE');
    expect(membership?.role).toBe('APPROVER');

    // Prove Demo Kft grants exist for all 3 cases
    const grants = await db.clientPortalGrant.findMany({
      where: {
        clientPortalIdentityId: identityId,
        workspaceId: DEMO_IDS.workspaceId,
      },
    });
    expect(grants).toHaveLength(3);
    const caseIds = grants.map((g) => g.caseId).sort();
    expect(caseIds).toEqual([DEMO_IDS.caseComplianceId, DEMO_IDS.caseEmploymentId, DEMO_IDS.caseSupplierId].sort());
  });

  // -------------------------------------------------------------------------
  // Scenario B: Existing INDIVIDUAL + Demo ORGANIZATION (Dual membership)
  // -------------------------------------------------------------------------
  it('B. EXISTING INDIVIDUAL + DEMO ORGANIZATION: adds ORGANIZATION membership to same identity row', async () => {
    const adminUser = await db.user.findFirst({ where: { status: 'ACTIVE' } });
    const adminId = adminUser ? adminUser.id : crypto.randomUUID();
    if (!adminUser) {
      await db.user.create({
        data: { id: adminId, email: 'admin-temp@example.invalid', name: 'Temp Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      });
    }

    const otherClientId = crypto.randomUUID();
    await db.client.create({
      data: { id: otherClientId, name: 'Personal Individual Client' },
    });

    const individualWsId = crypto.randomUUID();
    await db.clientPortalWorkspace.create({
      data: {
        id: individualWsId,
        clientId: otherClientId,
        name: 'Személyes Ügyfélkapu',
        mode: 'INDIVIDUAL',
        status: 'ACTIVE',
        communicationMode: 'PORTAL_PRIMARY',
        connectedSystemState: 'NOT_CONFIGURED',
        publicReference: `REF-INDIVIDUAL-${individualWsId.slice(0, 6)}`,
        createdById: adminId,
      },
    });

    const identityId = crypto.randomUUID();
    const email = `dual.user.${identityId.slice(0, 8)}@demo.invalid`.toLowerCase();

    await db.clientPortalIdentity.create({
      data: {
        id: identityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/test-real-tenant/v2.0',
        subject: `sub-dual-${identityId}`,
        normalizedEmail: email,
        displayName: 'Dual Membership User',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });

    await db.clientPortalWorkspaceMembership.create({
      data: {
        clientPortalIdentityId: identityId,
        workspaceId: individualWsId,
        status: 'ACTIVE',
        role: 'MEMBER',
      },
    });

    runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: email,
    });

    // Prove INDIVIDUAL membership remains intact
    const indMem = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityId,
          workspaceId: individualWsId,
        },
      },
    });
    expect(indMem).not.toBeNull();
    expect(indMem?.status).toBe('ACTIVE');

    // Prove Demo ORGANIZATION membership is added
    const orgMem = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityId,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(orgMem).not.toBeNull();
    expect(orgMem?.status).toBe('ACTIVE');
    expect(orgMem?.role).toBe('APPROVER');

    // Prove exact same identity row is used and no second identity is created
    const identityCount = await db.clientPortalIdentity.count({
      where: { normalizedEmail: email },
    });
    expect(identityCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Scenario C: No existing identity
  // -------------------------------------------------------------------------
  it('C. NO EXISTING IDENTITY: never creates synthetic identity or grants, reports PENDING_IDENTITY', async () => {
    const nonExistentEmail = `nonexistent.user.${crypto.randomUUID().slice(0, 8)}@demo.invalid`.toLowerCase();

    const output = runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: nonExistentEmail,
      DEMO_KFT_PORTAL_IDENTITY_ISSUER: 'https://login.microsoftonline.com/fake-issuer',
      DEMO_KFT_PORTAL_IDENTITY_SUBJECT: 'sub-fake-subject',
    });

    expect(output).toContain('DEMO_PORTAL_IDENTITY_BINDING=PENDING_IDENTITY');

    // Prove NO identity exists for this email or fake subject
    const createdIdentity = await db.clientPortalIdentity.findUnique({
      where: { normalizedEmail: nonExistentEmail },
    });
    expect(createdIdentity).toBeNull();

    // Prove NO memberships exist for Demo Kft workspace
    const demoMemberships = await db.clientPortalWorkspaceMembership.findMany({
      where: { workspaceId: DEMO_IDS.workspaceId },
    });
    expect(demoMemberships).toHaveLength(0);

    // Prove NO grants exist for Demo Kft workspace
    const demoGrants = await db.clientPortalGrant.findMany({
      where: { workspaceId: DEMO_IDS.workspaceId },
    });
    expect(demoGrants).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario D: Unverified email identity
  // -------------------------------------------------------------------------
  it('D. UNVERIFIED EMAIL IDENTITY: refuses binding when emailVerifiedAt is null', async () => {
    const identityId = crypto.randomUUID();
    const unverifiedEmail = `unverified.user.${identityId.slice(0, 8)}@demo.invalid`.toLowerCase();

    await db.clientPortalIdentity.create({
      data: {
        id: identityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/test-real-tenant/v2.0',
        subject: `sub-unverified-${identityId}`,
        normalizedEmail: unverifiedEmail,
        displayName: 'Unverified Customer',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
        emailVerifiedAt: null, // UNVERIFIED
      },
    });

    const output = runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: unverifiedEmail,
    });

    expect(output).toContain('DEMO_PORTAL_IDENTITY_BINDING=PENDING_IDENTITY');

    const membership = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityId,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(membership).toBeNull();

    const grants = await db.clientPortalGrant.findMany({
      where: { clientPortalIdentityId: identityId },
    });
    expect(grants).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario E: Inactive / Suspended / Revoked identity
  // -------------------------------------------------------------------------
  it('E. INACTIVE / SUSPENDED IDENTITY: refuses binding and preserves suspended status', async () => {
    const identityId = crypto.randomUUID();
    const suspendedEmail = `suspended.user.${identityId.slice(0, 8)}@demo.invalid`.toLowerCase();

    await db.clientPortalIdentity.create({
      data: {
        id: identityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/test-real-tenant/v2.0',
        subject: `sub-suspended-${identityId}`,
        normalizedEmail: suspendedEmail,
        displayName: 'Suspended Customer',
        accountType: 'INDIVIDUAL',
        status: 'SUSPENDED',
        emailVerifiedAt: new Date(),
      },
    });

    const output = runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: suspendedEmail,
    });

    expect(output).toContain('DEMO_PORTAL_IDENTITY_BINDING=PENDING_IDENTITY');

    const identityAfter = await db.clientPortalIdentity.findUniqueOrThrow({
      where: { id: identityId },
    });
    expect(identityAfter.status).toBe('SUSPENDED');

    const membership = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityId,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(membership).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Scenario F: Namespace safety
  // -------------------------------------------------------------------------
  it('F. NAMESPACE SAFETY: unrelated client, workspace, memberships, and grants survive reset + teardown', async () => {
    const adminUser = await db.user.findFirst({ where: { status: 'ACTIVE' } });
    const adminId = adminUser ? adminUser.id : crypto.randomUUID();
    if (!adminUser) {
      await db.user.create({
        data: { id: adminId, email: 'admin-temp2@example.invalid', name: 'Temp Admin 2', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      });
    }

    const unrelatedClientId = crypto.randomUUID();
    await db.client.create({
      data: { id: unrelatedClientId, name: 'Unrelated Foreign Enterprise Ltd.' },
    });

    const unrelatedWsId = crypto.randomUUID();
    await db.clientPortalWorkspace.create({
      data: {
        id: unrelatedWsId,
        clientId: unrelatedClientId,
        name: 'Foreign Enterprise Workspace',
        mode: 'ORGANIZATION',
        status: 'ACTIVE',
        communicationMode: 'PORTAL_PRIMARY',
        connectedSystemState: 'NOT_CONFIGURED',
        publicReference: `REF-FOREIGN-${unrelatedWsId.slice(0, 6)}`,
        createdById: adminId,
      },
    });

    const unrelatedIdentityId = crypto.randomUUID();
    await db.clientPortalIdentity.create({
      data: {
        id: unrelatedIdentityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/unrelated-tenant/v2.0',
        subject: `sub-unrelated-${unrelatedIdentityId}`,
        normalizedEmail: `unrelated.director.${unrelatedIdentityId.slice(0, 8)}@foreign.invalid`,
        displayName: 'Foreign Director',
        accountType: 'ORGANIZATION_MEMBER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });

    const unrelatedMemId = crypto.randomUUID();
    await db.clientPortalWorkspaceMembership.create({
      data: {
        id: unrelatedMemId,
        clientPortalIdentityId: unrelatedIdentityId,
        workspaceId: unrelatedWsId,
        status: 'ACTIVE',
        role: 'APPROVER',
      },
    });

    const unrelatedMatterId = crypto.randomUUID();
    await db.matter.create({
      data: {
        id: unrelatedMatterId,
        clientId: unrelatedClientId,
        title: 'Unrelated Foreign Matter',
        status: 'ACTIVE',
      },
    });

    const unrelatedCaseId = crypto.randomUUID();
    await db.case.create({
      data: {
        id: unrelatedCaseId,
        clientId: unrelatedClientId,
        matterId: unrelatedMatterId,
        title: 'Unrelated Foreign Case',
        status: 'ACTIVE',
      },
    });

    const unrelatedGrantId = crypto.randomUUID();
    await db.clientPortalGrant.create({
      data: {
        id: unrelatedGrantId,
        clientPortalIdentityId: unrelatedIdentityId,
        workspaceId: unrelatedWsId,
        clientId: unrelatedClientId,
        caseId: unrelatedCaseId,
        role: 'VIEWER',
        status: 'ACTIVE',
        permissions: ['MATTER_READ', 'DOCUMENT_READ'],
        validFrom: new Date(),
      },
    });

    // Run reset twice
    runResetScript();
    runResetScript();

    // Verify unrelated data survived completely
    const clientSurvives = await db.client.findUnique({ where: { id: unrelatedClientId } });
    expect(clientSurvives).not.toBeNull();

    const wsSurvives = await db.clientPortalWorkspace.findUnique({ where: { id: unrelatedWsId } });
    expect(wsSurvives).not.toBeNull();

    const identitySurvives = await db.clientPortalIdentity.findUnique({ where: { id: unrelatedIdentityId } });
    expect(identitySurvives).not.toBeNull();

    const memSurvives = await db.clientPortalWorkspaceMembership.findUnique({ where: { id: unrelatedMemId } });
    expect(memSurvives).not.toBeNull();

    const grantSurvives = await db.clientPortalGrant.findUnique({ where: { id: unrelatedGrantId } });
    expect(grantSurvives).not.toBeNull();
    expect(grantSurvives?.status).toBe('ACTIVE');
    expect(grantSurvives?.permissions).toEqual(['MATTER_READ', 'DOCUMENT_READ']);
  });

  // -------------------------------------------------------------------------
  // Scenario G: Idempotency
  // -------------------------------------------------------------------------
  it('G. IDEMPOTENCY: two resets against same verified identity produce exact single membership and 3 grants', async () => {
    const identityId = crypto.randomUUID();
    const email = `idempotent.user.${identityId.slice(0, 8)}@demo.invalid`.toLowerCase();

    await db.clientPortalIdentity.create({
      data: {
        id: identityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/idempotent-tenant/v2.0',
        subject: `sub-idempotent-${identityId}`,
        normalizedEmail: email,
        displayName: 'Idempotent User',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });

    runResetScript({ DEMO_KFT_PORTAL_IDENTITY_EMAIL: email });
    runResetScript({ DEMO_KFT_PORTAL_IDENTITY_EMAIL: email });

    const identityCount = await db.clientPortalIdentity.count({ where: { normalizedEmail: email } });
    expect(identityCount).toBe(1);

    const memberships = await db.clientPortalWorkspaceMembership.findMany({
      where: { clientPortalIdentityId: identityId, workspaceId: DEMO_IDS.workspaceId },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].status).toBe('ACTIVE');

    const grants = await db.clientPortalGrant.findMany({
      where: { clientPortalIdentityId: identityId, workspaceId: DEMO_IDS.workspaceId },
    });
    expect(grants).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Scenario H: Explicit issuer/subject mismatch cannot email-fallback
  // -------------------------------------------------------------------------
  it('H. EXPLICIT ISSUER/SUBJECT MISMATCH: cannot fall back to email when issuer/subject pair is provided', async () => {
    const identityId = crypto.randomUUID();
    const targetEmail = `target.mismatch.${identityId.slice(0, 8)}@demo.invalid`.toLowerCase();
    const verifiedDate = new Date('2026-02-01T10:00:00.000Z');

    const realIdentity = await db.clientPortalIdentity.create({
      data: {
        id: identityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/real-tenant-h/v2.0',
        subject: `sub-real-h-${identityId}`,
        normalizedEmail: targetEmail,
        displayName: 'Real Tenant Lawyer H',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
        emailVerifiedAt: verifiedDate,
      },
    });

    const output = runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_ISSUER: 'https://login.microsoftonline.com/different-issuer-h/v2.0',
      DEMO_KFT_PORTAL_IDENTITY_SUBJECT: `sub-different-h-${identityId}`,
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: targetEmail,
    });

    expect(output).toContain('DEMO_PORTAL_IDENTITY_BINDING=PENDING_IDENTITY');

    // Prove matching email did NOT bypass explicit issuer/subject mismatch
    const membership = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityId,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(membership).toBeNull();

    const grants = await db.clientPortalGrant.findMany({
      where: { clientPortalIdentityId: identityId, workspaceId: DEMO_IDS.workspaceId },
    });
    expect(grants).toHaveLength(0);

    const after = await db.clientPortalIdentity.findUniqueOrThrow({ where: { id: identityId } });
    expect(after.issuer).toBe(realIdentity.issuer);
    expect(after.subject).toBe(realIdentity.subject);
    expect(after.normalizedEmail).toBe(realIdentity.normalizedEmail);
  });

  // -------------------------------------------------------------------------
  // Scenario I: Exact issuer/subject beats matching-email identity
  // -------------------------------------------------------------------------
  it('I. EXACT ISSUER/SUBJECT WINS: binds identity matching configured pair rather than different identity with matching email', async () => {
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    const configuredIssuer = 'https://login.microsoftonline.com/tenant-i/v2.0';
    const configuredSubject = `sub-exact-i-${idA}`;
    const configuredEmail = `demo.target.i.${idB.slice(0, 8)}@demo.invalid`.toLowerCase();
    const emailA = `email.a.i.${idA.slice(0, 8)}@demo.invalid`.toLowerCase();

    // Identity A has the exact configured issuer + subject pair, but different email
    const identityA = await db.clientPortalIdentity.create({
      data: {
        id: idA,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: configuredIssuer,
        subject: configuredSubject,
        normalizedEmail: emailA,
        displayName: 'Identity A (Exact Pair Match)',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });

    // Identity B has different issuer + subject, but matching email
    const identityB = await db.clientPortalIdentity.create({
      data: {
        id: idB,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/other-tenant-i/v2.0',
        subject: `sub-other-i-${idB}`,
        normalizedEmail: configuredEmail,
        displayName: 'Identity B (Email Match Only)',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });

    const output = runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_ISSUER: configuredIssuer,
      DEMO_KFT_PORTAL_IDENTITY_SUBJECT: configuredSubject,
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: configuredEmail,
    });

    expect(output).toContain('DEMO_PORTAL_IDENTITY_BINDING=BOUND');

    // Identity A MUST be bound
    const memA = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityA.id,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(memA).not.toBeNull();
    expect(memA?.status).toBe('ACTIVE');

    const grantsA = await db.clientPortalGrant.findMany({
      where: { clientPortalIdentityId: identityA.id, workspaceId: DEMO_IDS.workspaceId },
    });
    expect(grantsA).toHaveLength(3);

    // Identity B MUST NOT have memberships or grants on Demo workspace
    const memB = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityB.id,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(memB).toBeNull();

    const grantsB = await db.clientPortalGrant.findMany({
      where: { clientPortalIdentityId: identityB.id, workspaceId: DEMO_IDS.workspaceId },
    });
    expect(grantsB).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario J: Partial issuer/subject config cannot email-fallback
  // -------------------------------------------------------------------------
  it('J. PARTIAL PAIR CONFIGURATION: fails binding safely and refuses email fallback when only one of issuer/subject is set', async () => {
    const identityId = crypto.randomUUID();
    const email = `partial.user.${identityId.slice(0, 8)}@demo.invalid`.toLowerCase();

    await db.clientPortalIdentity.create({
      data: {
        id: identityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://login.microsoftonline.com/tenant-j/v2.0',
        subject: `sub-j-${identityId}`,
        normalizedEmail: email,
        displayName: 'Partial Config User',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });

    // Sub-case J1: Issuer configured, Subject missing
    const outputJ1 = runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_ISSUER: 'https://login.microsoftonline.com/tenant-j/v2.0',
      DEMO_KFT_PORTAL_IDENTITY_SUBJECT: '',
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: email,
    });
    expect(outputJ1).toContain('DEMO_PORTAL_IDENTITY_BINDING=INVALID_IDENTITY_CONFIG');

    let mem = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityId,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(mem).toBeNull();

    // Sub-case J2: Subject configured, Issuer missing
    const outputJ2 = runResetScript({
      DEMO_KFT_PORTAL_IDENTITY_ISSUER: '',
      DEMO_KFT_PORTAL_IDENTITY_SUBJECT: `sub-j-${identityId}`,
      DEMO_KFT_PORTAL_IDENTITY_EMAIL: email,
    });
    expect(outputJ2).toContain('DEMO_PORTAL_IDENTITY_BINDING=INVALID_IDENTITY_CONFIG');

    mem = await db.clientPortalWorkspaceMembership.findUnique({
      where: {
        clientPortalIdentityId_workspaceId: {
          clientPortalIdentityId: identityId,
          workspaceId: DEMO_IDS.workspaceId,
        },
      },
    });
    expect(mem).toBeNull();
  });
});
