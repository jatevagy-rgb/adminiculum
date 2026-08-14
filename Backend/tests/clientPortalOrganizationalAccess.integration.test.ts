import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { listOrganizationalCases, getOrganizationalCaseDetail } from '../src/modules/client-workspace/organizationalCaseService';
import { resolveParticipantAccess } from '../src/modules/client-workspace/organizationalAccessPolicy';
import { resolveMemberUnits } from '../src/modules/client-workspace/organizationUnitService';
import { unitSummary, organizationSummary, mayViewCaseContent } from '../src/modules/client-workspace/leadershipSummaryService';
import { assignUnitMembership, createParticipant, revokeParticipant, createSummaryScope, revokeUnitMembership, createWorkspaceUnit } from '../src/modules/client-workspace/organizationAdminService';
import { resolveActiveCustomerGrant } from '../src/modules/client-interaction/base';
import { createCustomerQuestion, listCustomerThreads } from '../src/modules/client-interaction/questionService';
import { getPortalMatter } from '../src/modules/client-publication/publicationService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('CP1 organizational access core (PostgreSQL)', () => {
  let db: PrismaClient;
  const admin = crypto.randomUUID();
  const client = crypto.randomUUID();
  const orgWs = crypto.randomUUID();
  const indivWs = crypto.randomUUID();
  const hrGroup = crypto.randomUUID();
  const finGroup = crypto.randomUUID();
  const identity: Record<string, string> = {};
  const membership: Record<string, string> = {};
  const kase: Record<string, string> = {};
  const internalActor = { userId: admin, role: 'ADMIN' };

  async function makeIdentity(key: string, suspended = false) {
    const id = crypto.randomUUID();
    identity[key] = id;
    await db.clientPortalIdentity.create({ data: { id, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-${id}`, normalizedEmail: `${key}-${id}@t.io`, emailVerifiedAt: new Date(), displayName: key, accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' } });
    const mid = crypto.randomUUID();
    membership[key] = mid;
    await db.clientPortalWorkspaceMembership.create({ data: { id: mid, clientPortalIdentityId: id, workspaceId: orgWs, status: suspended ? 'SUSPENDED' : 'ACTIVE', approvedAt: new Date(), approvedById: admin } });
    return id;
  }

  async function addUnitMembership(key: string, groupId: string, status = 'ACTIVE') {
    await db.clientOrganizationMembership.create({ data: { clientPortalIdentityId: identity[key], clientId: client, groupId, status: status as never, approvedFromRequestId: crypto.randomUUID(), approvedById: admin, approvedAt: new Date() } });
  }

  async function makePublishedCase(key: string, unitGroupId: string | null) {
    const id = crypto.randomUUID();
    kase[key] = id;
    await db.case.create({ data: { id, caseNumber: `CP1-${key}-${id.slice(0, 6)}`, title: `internal ${key}`, caseType: 'CONTRACT_REVIEW', clientId: client, createdById: admin, assignedLawyerId: admin } as never });
    const pub = await db.clientMatterPublication.create({ data: { caseId: id, clientId: client, status: 'PUBLISHED', preparedById: admin, publishedAt: new Date() } });
    const rev = await db.clientMatterPublicationRevision.create({
      data: {
        publicationId: pub.id,
        revisionNumber: 1,
        clientSafeTitle: `Ügy ${key}`,
        clientSafeStatus: 'Folyamatban',
        clientSafeNextStep: 'Következő lépés',
        clientSafeCurrentPosition: `Most itt tartunk ${key}`,
        clientSafeWaitingOn: `Mire várunk ${key}`,
        publicTargetDate: new Date('2026-10-01T00:00:00.000Z'),
        publishedDeadlinesSnapshot: [{ label: 'Teszt belső határidő', dueAt: '2026-12-31' }],
        safeUpdatesSnapshot: [],
        actionRequestsSnapshot: [],
        milestonesSnapshot: [{ reference: `ms-${key}`, title: `Mérföldkő ${key}`, description: null, state: 'NOT_STARTED', displayOrder: 1, weight: null, completedAt: null }],
        sourceFingerprint: `fp-${id}`,
        audienceSnapshot: {},
        createdById: admin,
      },
    });
    await db.clientMatterPublication.update({ where: { id: pub.id }, data: { currentRevisionId: rev.id } });
    if (unitGroupId) {
      await db.clientPortalIntakeRequest.create({ data: { workspaceId: orgWs, requesterMembershipId: membership.alexandra || membership.bela || admin, organizationGroupId: unitGroupId, subject: `intake ${key}`, descriptionSafe: 'x', status: 'LINKED_TO_EXISTING_CASE', linkedCaseId: id } });
    }
    return id;
  }

  async function grant(key: string, caseKey: string, participantRole: string, permissions: string[]) {
    return db.clientPortalGrant.create({ data: { clientPortalIdentityId: identity[key], workspaceId: orgWs, clientId: client, caseId: kase[caseKey], status: 'ACTIVE', participantRole: participantRole as never, isRequester: participantRole === 'REQUESTER', permissions: permissions as never, invitedById: admin, activatedAt: new Date() } as never });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    process.env.CLIENT_PORTAL_QUESTIONS_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: admin, email: `admin-${admin}@t.io`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' } as never });
    await db.client.create({ data: { id: client, name: 'CP1 Example Company Kft.' } });
    await db.clientPortalWorkspace.create({ data: { id: orgWs, clientId: client, name: 'CP1 Szervezeti ügyfél', mode: 'ORGANIZATION', publicReference: `org-${orgWs}`, createdById: admin } });
    await db.clientPortalWorkspace.create({ data: { id: indivWs, clientId: client, name: 'Privát', mode: 'INDIVIDUAL', publicReference: `ind-${indivWs}`, createdById: admin } });
    await db.clientOrganizationGroup.create({ data: { id: hrGroup, clientId: client, workspaceId: orgWs, name: 'HR', createdById: admin } });
    await db.clientOrganizationGroup.create({ data: { id: finGroup, clientId: client, workspaceId: orgWs, name: 'Finance', createdById: admin } });

    for (const key of ['alexandra', 'bela', 'ferenc', 'manager', 'exec']) await makeIdentity(key);
    await makeIdentity('suspended', true);
    await addUnitMembership('alexandra', hrGroup);
    await addUnitMembership('bela', hrGroup);
    await addUnitMembership('ferenc', finGroup);
    await addUnitMembership('manager', hrGroup);

    await makePublishedCase('A', hrGroup);
    await makePublishedCase('B', hrGroup);
    await makePublishedCase('C', finGroup);
    await makePublishedCase('D', hrGroup);

    await grant('alexandra', 'A', 'REQUESTER', ['MATTER_READ', 'DOCUMENT_READ']);
    await grant('alexandra', 'D', 'PARTICIPANT', ['MATTER_READ']);
    await grant('bela', 'B', 'REQUESTER', ['MATTER_READ', 'DOCUMENT_READ', 'MESSAGE_READ']);
    await grant('ferenc', 'C', 'REQUESTER', ['MATTER_READ', 'MESSAGE_SEND', 'MESSAGE_READ']);
    // manager + exec deliberately receive NO case grant.
  });

  afterAll(async () => { await db.$disconnect(); });

  it('1-2: Alexandra lists A as OWN and D as SHARED', async () => {
    const list = await listOrganizationalCases(identity.alexandra, orgWs, {}, db);
    const byRef = new Map(list.items.map((row) => [row.publicTitle, row]));
    expect(byRef.get('Ügy A')?.relationshipToCase).toBe('OWN');
    expect(byRef.get('Ügy D')?.relationshipToCase).toBe('SHARED');
    expect(list.total).toBe(2);
    for (const row of list.items) {
      expect(row.matterPublicationId).toBeTruthy();
    }
  });

  it('3-4: Alexandra cannot see B or C', async () => {
    const list = await listOrganizationalCases(identity.alexandra, orgWs, {}, db);
    expect(list.items.find((row) => row.publicTitle === 'Ügy B')).toBeUndefined();
    expect(list.items.find((row) => row.publicTitle === 'Ügy C')).toBeUndefined();
    await expect(getOrganizationalCaseDetail(identity.alexandra, orgWs, `CP1-B-${kase.B.slice(0, 6)}`, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('own/shared filter narrows the list', async () => {
    const own = await listOrganizationalCases(identity.alexandra, orgWs, { relationship: 'OWN' }, db);
    expect(own.items.every((row) => row.relationshipToCase === 'OWN')).toBe(true);
    expect(own.items.length).toBe(1);
  });

  it('7-8: no message permission -> detail hides + server-denies messages', async () => {
    const detail = await getOrganizationalCaseDetail(identity.alexandra, orgWs, kase.A ? (await db.case.findUnique({ where: { id: kase.A }, select: { caseNumber: true } }))!.caseNumber : '', db);
    expect(detail.capabilities.showMessages).toBe(false);
    expect(detail.capabilities.allowMessages).toBe(false);
    const access = await resolveParticipantAccess(identity.alexandra, kase.A, orgWs, db);
    expect(access.canViewMessages).toBe(false);
  });

  it('detail exposes matterPublicationId and milestones come from milestonesSnapshot, not deadlines', async () => {
    const detail = await getOrganizationalCaseDetail(identity.alexandra, orgWs, kase.A ? (await db.case.findUnique({ where: { id: kase.A }, select: { caseNumber: true } }))!.caseNumber : '', db);
    expect(detail.matterPublicationId).toBeTruthy();
    expect(detail.safeMilestones.length).toBe(1);
    expect((detail.safeMilestones[0] as any).reference).toBe('ms-A');
    expect((detail.safeMilestones[0] as any).title).toBe('Mérföldkő A');
    expect((detail.safeMilestones[0] as any).sourceTaskId).toBeUndefined();
  });

  it('9-10: active membership without case grant is denied (manager)', async () => {
    const list = await listOrganizationalCases(identity.manager, orgWs, {}, db);
    expect(list.total).toBe(0);
    await expect(resolveParticipantAccess(identity.manager, kase.A, orgWs, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('11: wrong workspace is denied', async () => {
    await expect(resolveParticipantAccess(identity.alexandra, kase.A, indivWs, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
    await expect(listOrganizationalCases(identity.alexandra, indivWs, {}, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_NOT_ORGANIZATION' });
  });

  it('14: cross-unit membership resolution excludes other units', async () => {
    const units = await resolveMemberUnits(identity.ferenc, orgWs, db);
    expect(units.map((u) => u.name)).toEqual(['Finance']);
    const alexUnits = await resolveMemberUnits(identity.alexandra, orgWs, db);
    expect(alexUnits.map((u) => u.name)).toEqual(['HR']);
  });

  it('workforce can assign and remove multiple organization-unit memberships without granting Case access', async () => {
    const before = await listOrganizationalCases(identity.ferenc, orgWs, {}, db);
    expect(before.items.map((row) => row.publicTitle)).toEqual(['Ügy C']);
    const created = await assignUnitMembership(internalActor, orgWs, membership.ferenc, { groupId: hrGroup, unitRole: 'MANAGER' }, db);
    expect(created.organizationGroupName).toBe('HR');
    expect(created.unitRole).toBe('MANAGER');
    expect(created.status).toBe('ACTIVE');
    const units = await resolveMemberUnits(identity.ferenc, orgWs, db);
    expect(units.map((unit) => unit.name).sort()).toEqual(['Finance', 'HR']);
    const stillOnlyGranted = await listOrganizationalCases(identity.ferenc, orgWs, {}, db);
    expect(stillOnlyGranted.items.map((row) => row.publicTitle)).toEqual(['Ügy C']);
    await expect(resolveParticipantAccess(identity.ferenc, kase.A, orgWs, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
    await revokeUnitMembership(internalActor, created.id, db);
    const afterRemoval = await resolveMemberUnits(identity.ferenc, orgWs, db);
    expect(afterRemoval.map((unit) => unit.name)).toEqual(['Finance']);
  });

  it('workforce can create same-named units independently per organization workspace', async () => {
    const secondWorkspace = crypto.randomUUID();
    await db.clientPortalWorkspace.create({ data: { id: secondWorkspace, clientId: client, name: 'CP1 second organization surface', mode: 'ORGANIZATION', publicReference: `org-${secondWorkspace}`, createdById: admin } });
    const duplicateHr = await createWorkspaceUnit(internalActor, secondWorkspace, { name: 'HR' }, db);
    expect(duplicateHr.name).toBe('HR');
    expect(duplicateHr.id).not.toBe(hrGroup);
    const sameWorkspaceRetry = await createWorkspaceUnit(internalActor, secondWorkspace, { name: 'HR' }, db);
    expect(sameWorkspaceRetry.id).toBe(duplicateHr.id);
    const units = await db.clientOrganizationGroup.findMany({ where: { clientId: client, name: 'HR' }, select: { workspaceId: true } });
    expect(units.map((unit) => unit.workspaceId).sort()).toEqual([orgWs, secondWorkspace].sort());
  });

  it('unit assignment rejects wrong workspace, wrong Client, archived unit and suspended workspace membership', async () => {
    const otherClient = crypto.randomUUID();
    const otherWorkspace = crypto.randomUUID();
    const otherGroup = crypto.randomUUID();
    await db.client.create({ data: { id: otherClient, name: 'Other Client' } });
    await db.clientPortalWorkspace.create({ data: { id: otherWorkspace, clientId: otherClient, name: 'Other org', mode: 'ORGANIZATION', publicReference: `org-${otherWorkspace}`, createdById: admin } });
    await db.clientOrganizationGroup.create({ data: { id: otherGroup, clientId: otherClient, workspaceId: otherWorkspace, name: 'Other HR', createdById: admin } });
    await expect(assignUnitMembership(internalActor, orgWs, membership.alexandra, { groupId: otherGroup, unitRole: 'MEMBER' }, db)).rejects.toMatchObject({ code: 'UNIT_NOT_FOUND' });
    await expect(assignUnitMembership(internalActor, otherWorkspace, membership.alexandra, { groupId: otherGroup, unitRole: 'MEMBER' }, db)).rejects.toMatchObject({ code: 'WORKSPACE_MEMBERSHIP_MISMATCH' });
    await db.clientOrganizationGroup.update({ where: { id: finGroup }, data: { status: 'INACTIVE' } });
    await expect(assignUnitMembership(internalActor, orgWs, membership.alexandra, { groupId: finGroup, unitRole: 'MEMBER' }, db)).rejects.toMatchObject({ code: 'UNIT_ARCHIVED_OR_INACTIVE' });
    await db.clientOrganizationGroup.update({ where: { id: finGroup }, data: { status: 'ACTIVE' } });
    await expect(assignUnitMembership(internalActor, orgWs, membership.suspended, { groupId: hrGroup, unitRole: 'MEMBER' }, db)).rejects.toMatchObject({ code: 'WORKSPACE_MEMBERSHIP_NOT_ACTIVE' });
  });

  it('17-19: HR manager gets aggregate counts but no case content', async () => {
    const scope = await createSummaryScope(internalActor, { workspaceId: orgWs, clientPortalIdentityId: identity.manager, scopeType: 'UNIT', organizationGroupId: hrGroup }, db);
    expect(scope.status).toBe('ACTIVE');
    const summary = await unitSummary(identity.manager, orgWs, hrGroup, db);
    expect(summary.organizationUnitName).toBe('HR');
    expect(summary.activeCaseCount).toBeGreaterThanOrEqual(3); // A, B, D linked to HR
    expect(await mayViewCaseContent(identity.manager, orgWs, kase.A, db)).toBe(false);
    await expect(getOrganizationalCaseDetail(identity.manager, orgWs, (await db.case.findUnique({ where: { id: kase.A }, select: { caseNumber: true } }))!.caseNumber, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('20-21: executive gets org aggregate but no case detail', async () => {
    await createSummaryScope(internalActor, { workspaceId: orgWs, clientPortalIdentityId: identity.exec, scopeType: 'ORGANIZATION' }, db);
    const org = await organizationSummary(identity.exec, orgWs, db);
    const names = org.units.map((u) => u.organizationUnitName).sort();
    expect(names).toEqual(['Finance', 'HR']);
    await expect(resolveParticipantAccess(identity.exec, kase.C, orgWs, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('summary scope holder is never a case participant (no own/shared rows)', async () => {
    const list = await listOrganizationalCases(identity.exec, orgWs, {}, db);
    expect(list.total).toBe(0);
  });

  it('5-6: explicit workforce grant then revoke flips visibility of B for Alexandra', async () => {
    const created = await createParticipant(internalActor, { workspaceId: orgWs, caseId: kase.B, clientPortalIdentityId: identity.alexandra, participantRole: 'OBSERVER', permissions: ['MATTER_READ'] }, db);
    let list = await listOrganizationalCases(identity.alexandra, orgWs, {}, db);
    expect(list.items.find((row) => row.publicTitle === 'Ügy B')?.relationshipToCase).toBe('SHARED');
    await revokeParticipant(internalActor, created.id, db);
    list = await listOrganizationalCases(identity.alexandra, orgWs, {}, db);
    expect(list.items.find((row) => row.publicTitle === 'Ügy B')).toBeUndefined();
  });

  it('23: list DTO carries no forbidden internal keys', async () => {
    const list = await listOrganizationalCases(identity.alexandra, orgWs, {}, db);
    const serialized = JSON.stringify(list);
    for (const forbidden of ['grantId', 'clientId', 'workspaceId', 'membershipId', 'storageKey', 'sharePoint', 'internalTriageNote', 'permissions']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('organization communication is case-grant scoped, not workspace-membership scoped', async () => {
    const ferencContext = await resolveActiveCustomerGrant(identity.ferenc, kase.C, orgWs, db);
    const thread = await createCustomerQuestion(ferencContext, { subject: 'Teszt kérdés', bodySafe: 'Szervezeti ügy kommunikációja.' }, db);
    expect(thread.subject).toBe('Teszt kérdés');
    const threads = await listCustomerThreads(ferencContext, db);
    expect(threads.items.some((t) => t.id === thread.id)).toBe(true);

    // No grant to another Case in the same Client.
    await expect(resolveActiveCustomerGrant(identity.ferenc, kase.A, orgWs, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });

    // Workspace membership alone (manager) has no case communication grant.
    await expect(resolveActiveCustomerGrant(identity.manager, kase.A, orgWs, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('MESSAGE_READ gates viewing messages and MESSAGE_SEND gates sending them', async () => {
    const noMessage = await resolveParticipantAccess(identity.alexandra, kase.A, orgWs, db);
    expect(noMessage.canViewMessages).toBe(false);
    expect(noMessage.canSendMessages).toBe(false);

    const viewOnly = await resolveParticipantAccess(identity.bela, kase.B, orgWs, db);
    expect(viewOnly.canViewMessages).toBe(true);
    expect(viewOnly.canSendMessages).toBe(false);

    const full = await resolveParticipantAccess(identity.ferenc, kase.C, orgWs, db);
    expect(full.canViewMessages).toBe(true);
    expect(full.canSendMessages).toBe(true);
  });

  it('direct matter endpoint requires active MATTER_READ grant and audience', async () => {
    const pubA = (await db.clientMatterPublication.findFirst({ where: { caseId: kase.A }, select: { id: true } }))!;
    const pubB = (await db.clientMatterPublication.findFirst({ where: { caseId: kase.B }, select: { id: true } }))!;

    const matterA = await getPortalMatter({ userId: identity.alexandra, role: 'CLIENT_PORTAL', workspaceId: orgWs }, pubA.id, db);
    expect(matterA.caseId).toBe(kase.A);
    expect(matterA.statusLabel).toBe('Folyamatban');
    expect(matterA.currentSummary).toBe('Most itt tartunk A');
    expect(matterA.waitingOnLabel).toBe('Mire várunk A');
    expect(matterA.estimatedTiming).toContain('2026-10-01');

    // Alexandra has no grant to Case B.
    await expect(getPortalMatter({ userId: identity.alexandra, role: 'CLIENT_PORTAL', workspaceId: orgWs }, pubB.id, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });

    // Workspace membership alone is insufficient.
    await expect(getPortalMatter({ userId: identity.manager, role: 'CLIENT_PORTAL', workspaceId: orgWs }, pubA.id, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });

    // Wrong workspace is denied.
    await expect(getPortalMatter({ userId: identity.alexandra, role: 'CLIENT_PORTAL', workspaceId: indivWs }, pubA.id, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
  });
});
