import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { answerCompanyProfileQuestion, getCompanyProfileDiscovery } from '../src/modules/client-workspace/companyProfileAnswerService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('organization client answer state and discovery (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const workspaceA = crypto.randomUUID();
  const workspaceB = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const representativeId = crypto.randomUUID();
  const otherClientIdentityId = crypto.randomUUID();
  const definitionId = crypto.randomUUID();

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `answer-state-${suffix}@fixture.invalid`, name: 'Answer state actor', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.createMany({ data: [{ id: clientA, name: 'Answer state A' }, { id: clientB, name: 'Answer state B' }] });
    await db.clientOperatingProfile.createMany({ data: [{ clientId: clientA, complianceEnrollmentStatus: 'ENROLLED' }, { clientId: clientB, complianceEnrollmentStatus: 'ENROLLED' }] });
    await db.clientPortalWorkspace.createMany({ data: [
      { id: workspaceA, clientId: clientA, name: 'Answer state A workspace', mode: 'ORGANIZATION', publicReference: `answer-a-${suffix}`, createdById: adminId },
      { id: workspaceB, clientId: clientB, name: 'Answer state B workspace', mode: 'ORGANIZATION', publicReference: `answer-b-${suffix}`, createdById: adminId },
    ] });
    await db.clientPortalIdentity.createMany({ data: [
      { id: memberId, provider: 'ENTRA_EXTERNAL_ID', issuer: `answer-${suffix}`, subject: 'member', normalizedEmail: `member-${suffix}@fixture.invalid`, emailVerifiedAt: new Date(), displayName: 'Member', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: representativeId, provider: 'ENTRA_EXTERNAL_ID', issuer: `answer-${suffix}`, subject: 'representative', normalizedEmail: `representative-${suffix}@fixture.invalid`, emailVerifiedAt: new Date(), displayName: 'Representative', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: otherClientIdentityId, provider: 'ENTRA_EXTERNAL_ID', issuer: `answer-${suffix}`, subject: 'other', normalizedEmail: `other-${suffix}@fixture.invalid`, emailVerifiedAt: new Date(), displayName: 'Other', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    ] });
    await db.clientPortalWorkspaceMembership.createMany({ data: [
      { id: crypto.randomUUID(), clientPortalIdentityId: memberId, workspaceId: workspaceA, status: 'ACTIVE', role: 'MEMBER', approvedAt: new Date(), approvedById: adminId },
      { id: crypto.randomUUID(), clientPortalIdentityId: representativeId, workspaceId: workspaceA, status: 'ACTIVE', role: 'REPRESENTATIVE', approvedAt: new Date(), approvedById: adminId },
      { id: crypto.randomUUID(), clientPortalIdentityId: otherClientIdentityId, workspaceId: workspaceB, status: 'ACTIVE', role: 'REPRESENTATIVE', approvedAt: new Date(), approvedById: adminId },
    ] });
    await db.factDefinition.create({ data: { id: definitionId, key: 'employee_count', domainCode: `ANSWER_STATE_${suffix}`, valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'DISALLOW', temporalPolicy: 'OBSERVATION' } });
  });

  afterAll(async () => {
    await db.clientFactAnswerState.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.factDefinition.deleteMany({ where: { id: definitionId } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.clientPortalIdentity.deleteMany({ where: { id: { in: [memberId, representativeId, otherClientIdentityId] } } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.user.delete({ where: { id: adminId } });
    await db.$disconnect();
  });

  it('derives UNANSWERED and preserves UNKNOWN without a fake ClientFact', async () => {
    expect((await getCompanyProfileDiscovery(memberId, workspaceA, db)).questions).toEqual([{ questionKey: 'employee_count', label: 'Number of employees', status: 'UNANSWERED', value: null }]);
    const result = await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'UNKNOWN' }, db);
    expect(result).toEqual({ questionKey: 'employee_count', status: 'UNKNOWN', answered: false });
    expect(await db.clientFact.count({ where: { clientId: clientA } })).toBe(0);
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'UNKNOWN' }, db);
    expect(await db.clientFactAnswerState.count({ where: { clientId: clientA } })).toBe(1);
  });

  it('creates CLIENT_PROVIDED facts, supersedes immutable truth, and is idempotent', async () => {
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 47 }, db);
    const first = await db.clientFact.findFirstOrThrow({ where: { clientId: clientA }, orderBy: { createdAt: 'asc' } });
    expect(first.verificationStatus).toBe('CLIENT_PROVIDED');
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 47 }, db);
    expect(await db.clientFact.count({ where: { clientId: clientA } })).toBe(1);
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 52 }, db);
    const facts = await db.clientFact.findMany({ where: { clientId: clientA }, orderBy: { createdAt: 'asc' } });
    expect(facts).toHaveLength(2);
    expect(facts[0].supersededAt).not.toBeNull();
    expect(facts[1].numberValue?.toString()).toBe('52');
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'UNKNOWN' }, db);
    expect((await getCompanyProfileDiscovery(memberId, workspaceA, db)).questions[0]).toMatchObject({ status: 'UNKNOWN', value: null });
    expect(await db.clientFact.count({ where: { clientId: clientA } })).toBe(2);
  });

  it('enforces representative authority and client isolation', async () => {
    await expect(answerCompanyProfileQuestion(memberId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 1 }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_WRITE_FORBIDDEN' });
    await expect(answerCompanyProfileQuestion(otherClientIdentityId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 1 }, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_FORBIDDEN' });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceA, 'not-a-question', { status: 'UNKNOWN' }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_QUESTION_NOT_FOUND' });
  });
});
