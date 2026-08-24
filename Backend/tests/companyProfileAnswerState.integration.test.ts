import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { answerCompanyProfileQuestion, assignCompanyProfileResponsibility, getCompanyProfileDiscovery } from '../src/modules/client-workspace/companyProfileAnswerService';
import { addRequirementCitation, approveApplicabilityRuleVersion, approveRequirementVersion, createApplicabilityRuleVersion, createRequirement, createRequirementVersion } from '../src/modules/compliance/requirementRuleService';

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
  const approverId = crypto.randomUUID();
  const otherClientIdentityId = crypto.randomUUID();
  const personId = crypto.randomUUID();
  const definitionId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const requirementVersionId = crypto.randomUUID();
  const ruleVersionId = crypto.randomUUID();

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
      { id: approverId, provider: 'ENTRA_EXTERNAL_ID', issuer: `answer-${suffix}`, subject: 'approver', normalizedEmail: `approver-${suffix}@fixture.invalid`, emailVerifiedAt: new Date(), displayName: 'Approver', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: otherClientIdentityId, provider: 'ENTRA_EXTERNAL_ID', issuer: `answer-${suffix}`, subject: 'other', normalizedEmail: `other-${suffix}@fixture.invalid`, emailVerifiedAt: new Date(), displayName: 'Other', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    ] });
    await db.clientPortalWorkspaceMembership.createMany({ data: [
      { id: crypto.randomUUID(), clientPortalIdentityId: memberId, workspaceId: workspaceA, status: 'ACTIVE', role: 'MEMBER', approvedAt: new Date(), approvedById: adminId },
      { id: crypto.randomUUID(), clientPortalIdentityId: representativeId, workspaceId: workspaceA, status: 'ACTIVE', role: 'REPRESENTATIVE', approvedAt: new Date(), approvedById: adminId },
      { id: crypto.randomUUID(), clientPortalIdentityId: approverId, workspaceId: workspaceA, status: 'ACTIVE', role: 'APPROVER', approvedAt: new Date(), approvedById: adminId },
      { id: crypto.randomUUID(), clientPortalIdentityId: otherClientIdentityId, workspaceId: workspaceB, status: 'ACTIVE', role: 'REPRESENTATIVE', approvedAt: new Date(), approvedById: adminId },
    ] });
    await db.organizationPerson.create({ data: { id: personId, clientId: clientA, name: 'Portal responsibility person', jobTitle: 'Director' } });
    await db.factDefinition.create({ data: { id: definitionId, key: 'employee_count', domainCode: `ANSWER_STATE_${suffix}`, valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'DISALLOW', temporalPolicy: 'OBSERVATION' } });
    await db.complianceDomain.create({ data: { code: `ANSWER_STATE_${suffix}`, label: 'Answer state acceptance domain' } });
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `answer-state-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'CANDIDATE' } });
    await db.legalSourceVersion.create({ data: { id: sourceVersionId, legalSourceId: sourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } });
    const requirement = await createRequirement({ key: `ANSWER_STATE_THRESHOLD_${suffix}`, jurisdictionCode: 'HU', domainCode: `ANSWER_STATE_${suffix}`, db });
    await db.requirement.update({ where: { id: requirement.id }, data: { id: requirementId } });
    await createRequirementVersion({ requirementId, versionKey: 'V1', title: 'Employee count threshold', normativeStatement: 'At least fifty employees.', effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db });
    await db.requirementVersion.update({ where: { requirementId_versionKey: { requirementId, versionKey: 'V1' } }, data: { id: requirementVersionId } });
    await addRequirementCitation({ requirementVersionId, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(requirementVersionId, adminId, db);
    const rule = await createApplicabilityRuleVersion({ requirementVersionId, ruleVersionKey: 'R1', evaluationScopeType: 'COMPANY', astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'COMPARE', operator: 'GTE', left: { kind: 'FACT', factKey: 'employee_count' }, right: { kind: 'LITERAL', valueType: 'number', value: 50 } } }, db });
    await db.applicabilityRuleVersion.update({ where: { id: rule.id }, data: { id: ruleVersionId } });
    await approveApplicabilityRuleVersion(ruleVersionId, adminId, db);
  });

  afterAll(async () => {
    await db.assessmentFinding.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.requirementApplicability.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.clientFactAnswerState.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: ruleVersionId } });
    await db.requirementVersion.deleteMany({ where: { id: requirementVersionId } });
    await db.requirement.deleteMany({ where: { id: requirementId } });
    await db.factDefinition.deleteMany({ where: { id: definitionId } });
    await db.legalSourceVersion.deleteMany({ where: { id: sourceVersionId } });
    await db.legalSource.deleteMany({ where: { id: sourceId } });
    await db.complianceDomain.deleteMany({ where: { code: `ANSWER_STATE_${suffix}` } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.clientPortalIdentity.deleteMany({ where: { id: { in: [memberId, representativeId, approverId, otherClientIdentityId] } } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.organizationPerson.deleteMany({ where: { id: personId } });
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

  it('changes real compliance truth for 47 -> 52 and for fact removal', async () => {
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 47 }, db);
    const before = await db.requirementApplicability.findFirstOrThrow({ where: { clientId: clientA, requirementVersionId }, orderBy: { createdAt: 'desc' } });
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 52 }, db);
    const after = await db.requirementApplicability.findFirstOrThrow({ where: { clientId: clientA, requirementVersionId }, orderBy: { createdAt: 'desc' } });
    expect(before.outcome).toBe('DOES_NOT_APPLY');
    expect(after.outcome).toBe('APPLIES');
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'UNKNOWN' }, db);
    const outcomes = await db.requirementApplicability.findMany({ where: { clientId: clientA, requirementVersionId }, select: { outcome: true } });
    expect(outcomes.map((row) => row.outcome)).toContain('INSUFFICIENT_FACTS');
    expect(await db.clientFact.count({ where: { clientId: clientA } })).toBe(4);
  });

  it('enforces representative authority and client isolation', async () => {
    await expect(answerCompanyProfileQuestion(memberId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 1 }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_WRITE_FORBIDDEN' });
    await expect(answerCompanyProfileQuestion(otherClientIdentityId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 1 }, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_FORBIDDEN' });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceA, 'not-a-question', { status: 'UNKNOWN' }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_QUESTION_NOT_FOUND' });
  });

  it('supersedes a legacy active fact when the absent state is answered UNKNOWN', async () => {
    const legacyId = crypto.randomUUID();
    await db.clientFact.create({ data: { id: legacyId, clientId: clientB, type: 'employee_count', value: '41', factDefinitionId: definitionId, scopeType: 'COMPANY', numberValue: 41, validFrom: new Date('2026-01-01T00:00:00Z'), observedAt: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED' } });
    await answerCompanyProfileQuestion(otherClientIdentityId, workspaceB, 'employee_count', { status: 'UNKNOWN' }, db);
    const legacy = await db.clientFact.findUniqueOrThrow({ where: { id: legacyId } });
    expect(legacy.supersededAt).not.toBeNull();
    expect(await db.clientFactAnswerState.findFirst({ where: { clientId: clientB } })).toMatchObject({ status: 'UNKNOWN', currentFactId: null });
  });

  it('keeps responsibility authority in the portal membership domain', async () => {
    await expect(assignCompanyProfileResponsibility(representativeId, workspaceA, { organizationPersonId: personId, type: 'HR', label: 'People contact' }, db)).rejects.toMatchObject({ code: 'ORGANIZATION_RESPONSIBILITY_FORBIDDEN' });
    const assigned = await assignCompanyProfileResponsibility(approverId, workspaceA, { organizationPersonId: personId, type: 'HR', label: 'People contact' }, db);
    expect(assigned).toMatchObject({ organizationPersonId: personId, type: 'HR', label: 'People contact' });
    const repeated = await assignCompanyProfileResponsibility(approverId, workspaceA, { organizationPersonId: personId, type: 'HR', label: 'People contact' }, db);
    expect(repeated.id).toBe(assigned.id);
  });
});
