import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { answerCompanyProfileQuestion, assignCompanyProfileResponsibility, getCompanyProfileDiscovery } from '../src/modules/client-workspace/companyProfileAnswerService';
import { addRequirementCitation, approveApplicabilityRuleVersion, approveRequirementVersion, createApplicabilityRuleVersion, createRequirement, createRequirementVersion } from '../src/modules/compliance/requirementRuleService';
import { createRequirementApplicability } from '../src/modules/compliance/requirementApplicabilityService';

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
  let selectedDefinitionId: string = definitionId;
  const sourceId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const requirementVersionId = crypto.randomUUID();
  const ruleVersionId = crypto.randomUUID();
  const adaptiveRequirementId = crypto.randomUUID();
  const adaptiveRequirementVersionId = crypto.randomUUID();
  const adaptiveRuleVersionId = crypto.randomUUID();
  const aliasDefinitionId = crypto.randomUUID();
  const aliasDependencyId = crypto.randomUUID();
  const canonicalAiDependencyId = crypto.randomUUID();
  const aliasSnapshotId = crypto.randomUUID();
  const canonicalAiSnapshotId = crypto.randomUUID();
  const fallbackAiFactId = crypto.randomUUID();
  let ownsDefinition = false;
  let existingDefinitionBaseline: Record<string, unknown> | null = null;

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
    const existingDefinition = await db.factDefinition.findUnique({ where: { key: 'employee_count' } });
    if (existingDefinition) {
      existingDefinitionBaseline = JSON.parse(JSON.stringify(existingDefinition));
      (globalThis as { answerStateDefinitionId?: string }).answerStateDefinitionId = existingDefinition.id;
    } else {
      await db.factDefinition.create({ data: { id: definitionId, key: 'employee_count', domainCode: `ANSWER_STATE_${suffix}`, valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'DISALLOW', temporalPolicy: 'OBSERVATION' } });
      ownsDefinition = true;
    }
    selectedDefinitionId = existingDefinition?.id ?? definitionId;
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

    const adaptiveRequirement = await createRequirement({ key: `ANSWER_STATE_BOOLEAN_${suffix}`, jurisdictionCode: 'HU', domainCode: `ANSWER_STATE_${suffix}`, db });
    await db.requirement.update({ where: { id: adaptiveRequirement.id }, data: { id: adaptiveRequirementId } });
    await createRequirementVersion({ requirementId: adaptiveRequirementId, versionKey: 'V1', title: 'Regulated activity', normativeStatement: 'A regulated activity flag is required.', effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db });
    await db.requirementVersion.update({ where: { requirementId_versionKey: { requirementId: adaptiveRequirementId, versionKey: 'V1' } }, data: { id: adaptiveRequirementVersionId } });
    await addRequirementCitation({ requirementVersionId: adaptiveRequirementVersionId, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(adaptiveRequirementVersionId, adminId, db);
    const adaptiveRule = await createApplicabilityRuleVersion({ requirementVersionId: adaptiveRequirementVersionId, ruleVersionKey: 'R1', evaluationScopeType: 'COMPANY', astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: 'company_regulated_activity' }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } } }, db });
    await db.applicabilityRuleVersion.update({ where: { id: adaptiveRule.id }, data: { id: adaptiveRuleVersionId } });
    await approveApplicabilityRuleVersion(adaptiveRuleVersionId, adminId, db);

    const requiredDefinitions = await db.factDefinition.findMany({ where: { key: { in: ['company_main_activity', 'company_operating_country', 'company_regulated_activity'] } }, select: { key: true, valueType: true, questionKey: true, allowedScopeTypes: true, determinationMethod: true, status: true } });
    expect(requiredDefinitions).toHaveLength(3);
    expect(requiredDefinitions.every((definition) => definition.status === 'ACTIVE' && definition.allowedScopeTypes.includes('COMPANY') && definition.determinationMethod === 'USER_PROVIDED')).toBe(true);
  });

  afterAll(async () => {
    await db.assessmentFinding.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.requirementApplicability.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.clientFactAnswerState.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: ruleVersionId } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: adaptiveRuleVersionId } });
    await db.requirementVersion.deleteMany({ where: { id: requirementVersionId } });
    await db.requirementVersion.deleteMany({ where: { id: adaptiveRequirementVersionId } });
    await db.requirement.deleteMany({ where: { id: requirementId } });
    await db.requirement.deleteMany({ where: { id: adaptiveRequirementId } });
    if (ownsDefinition) await db.factDefinition.deleteMany({ where: { id: definitionId } });
    if (existingDefinitionBaseline) {
      const after = await db.factDefinition.findUniqueOrThrow({ where: { key: 'employee_count' } });
      expect(JSON.parse(JSON.stringify(after))).toEqual(existingDefinitionBaseline);
    }
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
    const discovery = (await getCompanyProfileDiscovery(memberId, workspaceA, db)).questions;
    expect(discovery).toHaveLength(3);
    expect(discovery).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionKey: 'employee_count', label: 'Munkavállalók száma', valueType: 'NUMBER', integerOnly: true, status: 'UNANSWERED', value: null }),
      expect.objectContaining({ questionKey: 'company_main_activity', valueType: 'STRING', status: 'UNANSWERED', value: null }),
      expect.objectContaining({ questionKey: 'company_operating_country', valueType: 'STRING', status: 'UNANSWERED', value: null }),
    ]));
    const result = await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'UNKNOWN' }, db);
    expect(result).toEqual({ questionKey: 'employee_count', status: 'UNKNOWN', answered: false });
    expect(await db.clientFact.count({ where: { clientId: clientA } })).toBe(0);
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'UNKNOWN' }, db);
    expect(await db.clientFactAnswerState.count({ where: { clientId: clientA } })).toBe(1);
  });

  it('discovers adaptive dependencies and persists typed STRING/BOOLEAN answers with reevaluation', async () => {
    await createRequirementApplicability({
      requirementVersionId: adaptiveRequirementVersionId,
      ruleVersionId: adaptiveRuleVersionId,
      clientId: clientA,
      scope: { scopeType: 'COMPANY', evaluationAt: new Date() },
    }, db);
    const before = await getCompanyProfileDiscovery(memberId, workspaceA, db);
    expect(before.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionKey: 'company_main_activity', valueType: 'STRING', status: 'UNANSWERED' }),
      expect.objectContaining({ questionKey: 'company_regulated_activity', valueType: 'BOOLEAN', status: 'UNANSWERED' }),
    ]));
    await expect(answerCompanyProfileQuestion(representativeId, workspaceA, 'company_main_activity', { status: 'ANSWERED', stringValue: '   logistics   ' }, db)).resolves.toMatchObject({ status: 'ANSWERED', answered: true });
    const stringFact = await db.clientFact.findFirstOrThrow({ where: { clientId: clientA, factDefinition: { key: 'company_main_activity' }, supersededAt: null } });
    expect(stringFact.stringValue).toBe('logistics');
    expect(stringFact.determinationMethod).toBe('USER_PROVIDED');
    expect((await db.clientFactAnswerState.findFirstOrThrow({ where: { clientId: clientA, factDefinition: { key: 'company_main_activity' } } })).status).toBe('ANSWERED');
    expect((await getCompanyProfileDiscovery(memberId, workspaceA, db)).questions).toEqual(expect.arrayContaining([expect.objectContaining({ questionKey: 'company_main_activity', status: 'ANSWERED', value: 'logistics' })]));
    await expect(answerCompanyProfileQuestion(representativeId, workspaceA, 'company_main_activity', { status: 'ANSWERED', stringValue: '   ' }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_ANSWER_INVALID' });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceA, 'company_main_activity', { status: 'ANSWERED', stringValue: 'x'.repeat(501) }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_ANSWER_INVALID' });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceA, 'company_regulated_activity', { status: 'ANSWERED', booleanValue: true }, db)).resolves.toMatchObject({ status: 'ANSWERED', answered: true });
    const booleanFact = await db.clientFact.findFirstOrThrow({ where: { clientId: clientA, factDefinition: { key: 'company_regulated_activity' }, supersededAt: null } });
    expect(booleanFact.booleanValue).toBe(true);
    expect(booleanFact.determinationMethod).toBe('USER_PROVIDED');
    const booleanState = await db.clientFactAnswerState.findFirstOrThrow({ where: { clientId: clientA, factDefinition: { key: 'company_regulated_activity' } } });
    expect(booleanState.status).toBe('ANSWERED');
    const latestAdaptive = await db.requirementApplicability.findFirstOrThrow({ where: { clientId: clientA, requirementVersionId: adaptiveRequirementVersionId }, orderBy: [{ evaluationAt: 'desc' }, { createdAt: 'desc' }] });
    expect(latestAdaptive.outcome).toBe('APPLIES');
    expect((await getCompanyProfileDiscovery(memberId, workspaceA, db)).questions).not.toEqual(expect.arrayContaining([expect.objectContaining({ questionKey: 'company_regulated_activity' })]));
    const adaptiveDefinitionIds = (await db.factDefinition.findMany({ where: { key: { in: ['company_main_activity', 'company_regulated_activity'] } }, select: { id: true } })).map((definition) => definition.id);
    await db.assessmentFinding.deleteMany({ where: { clientId: clientA, requirementId: adaptiveRequirementId } });
    await db.clientFactAnswerState.deleteMany({ where: { clientId: clientA, factDefinitionId: { in: adaptiveDefinitionIds } } });
    await db.clientFact.deleteMany({ where: { clientId: clientA, factDefinitionId: { in: adaptiveDefinitionIds } } });
  });

  it('does not expose questionKey aliases and binds adaptive writes to the canonical definition', async () => {
    const canonicalDefinition = await db.factDefinition.findUniqueOrThrow({ where: { key: 'company_ai_usage' } });
    const aliasKey = `legacy_ai_usage_${suffix}`;
    const snapshotTemplate = await db.requirementApplicability.findFirstOrThrow({
      where: { clientId: clientA, requirementVersionId: adaptiveRequirementVersionId, ruleVersionId: adaptiveRuleVersionId },
      orderBy: [{ evaluationAt: 'desc' }, { createdAt: 'desc' }],
    });
    await db.factDefinition.create({ data: {
      id: aliasDefinitionId,
      key: aliasKey,
      domainCode: `ANSWER_STATE_${suffix}`,
      valueType: 'BOOLEAN',
      allowedScopeTypes: ['COMPANY'],
      determinationMethod: 'USER_PROVIDED',
      overlapPolicy: 'DISALLOW',
      temporalPolicy: 'OBSERVATION',
      questionKey: 'company_ai_usage',
      status: 'ACTIVE',
    } });
    let snapshotClock = Date.now() + 10000;
    const addSnapshot = (id: string, missingFactKey: string) => db.requirementApplicability.create({ data: {
      id,
      clientId: clientA,
      requirementVersionId: adaptiveRequirementVersionId,
      ruleVersionId: adaptiveRuleVersionId,
      ruleDigest: snapshotTemplate.ruleDigest,
      outcome: 'INSUFFICIENT_FACTS',
      scopeType: 'COMPANY',
      factSubjectId: null,
      evaluationAt: new Date(++snapshotClock),
      sourceSupportState: snapshotTemplate.sourceSupportState,
      specialistRequirement: snapshotTemplate.specialistRequirement,
      specialistDomainCode: snapshotTemplate.specialistDomainCode,
      schemaVersion: snapshotTemplate.schemaVersion,
      snapshotJson: { missingFactKeys: [missingFactKey] },
      snapshotDigest: snapshotTemplate.snapshotDigest,
    } });
    try {
      await db.applicabilityRuleFactDependency.create({ data: { id: aliasDependencyId, applicabilityRuleVersionId: adaptiveRuleVersionId, factKey: aliasKey, resolvedFactDefinitionId: aliasDefinitionId } });
      await addSnapshot(aliasSnapshotId, aliasKey);
      const aliasDiscovery = await getCompanyProfileDiscovery(memberId, workspaceA, db);
      expect(aliasDiscovery.questions.some((question) => question.questionKey === 'company_ai_usage')).toBe(false);

      await db.applicabilityRuleFactDependency.delete({ where: { id: aliasDependencyId } });
      await db.applicabilityRuleFactDependency.create({ data: { id: canonicalAiDependencyId, applicabilityRuleVersionId: adaptiveRuleVersionId, factKey: 'company_ai_usage', resolvedFactDefinitionId: canonicalDefinition.id } });
      await addSnapshot(canonicalAiSnapshotId, 'company_ai_usage');
      const canonicalDiscovery = await getCompanyProfileDiscovery(memberId, workspaceA, db);
      expect(canonicalDiscovery.questions).toEqual(expect.arrayContaining([expect.objectContaining({ questionKey: 'company_ai_usage', status: 'UNANSWERED' })]));

      await db.clientFact.create({ data: { id: fallbackAiFactId, clientId: clientA, type: 'company_ai_usage', value: 'false', factDefinitionId: canonicalDefinition.id, scopeType: 'COMPANY', booleanValue: false, validFrom: new Date('2026-01-01T00:00:00Z'), observedAt: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED' } });
      const fallbackDiscovery = await getCompanyProfileDiscovery(memberId, workspaceA, db);
      expect(fallbackDiscovery.questions).toEqual(expect.arrayContaining([expect.objectContaining({ questionKey: 'company_ai_usage', status: 'ANSWERED', value: false })]));
      await answerCompanyProfileQuestion(representativeId, workspaceA, 'company_ai_usage', { status: 'ANSWERED', booleanValue: false }, db);
      const falseWritten = await db.clientFact.findFirstOrThrow({ where: { clientId: clientA, factDefinitionId: canonicalDefinition.id, supersededAt: null } });
      expect(falseWritten.booleanValue).toBe(false);
      await answerCompanyProfileQuestion(representativeId, workspaceA, 'company_ai_usage', { status: 'ANSWERED', booleanValue: true }, db);
      const written = await db.clientFact.findFirstOrThrow({ where: { clientId: clientA, factDefinitionId: canonicalDefinition.id, supersededAt: null } });
      expect(written.factDefinitionId).toBe(canonicalDefinition.id);
      expect(written.booleanValue).toBe(true);
    } finally {
      await db.assessmentFinding.deleteMany({ where: { clientId: clientA, requirementId: adaptiveRequirementId } });
      await db.requirementApplicability.deleteMany({ where: { clientId: clientA, requirementVersionId: adaptiveRequirementVersionId } });
      await db.clientFactAnswerState.deleteMany({ where: { clientId: clientA, factDefinitionId: canonicalDefinition.id } });
      await db.clientFact.deleteMany({ where: { clientId: clientA, factDefinitionId: canonicalDefinition.id } });
      await db.applicabilityRuleFactDependency.deleteMany({ where: { id: { in: [aliasDependencyId, canonicalAiDependencyId] } } });
      await db.factDefinition.deleteMany({ where: { id: aliasDefinitionId } });
    }
  });

  it('preserves existing USER_PROVIDED OBSERVATION definitions and rejects incompatible metadata', async () => {
    const migration = readFileSync(path.resolve(__dirname, '../prisma/migrations/20260914100000_provision_company_profile_fact_definitions/migration.sql'), 'utf8');
    const baseline = await db.factDefinition.findUniqueOrThrow({ where: { key: 'company_main_activity' } });
    expect(baseline.determinationMethod).toBe('USER_PROVIDED');
    expect(baseline.temporalPolicy).toBe('OBSERVATION');

    await db.$executeRawUnsafe(migration);
    const replayed = await db.factDefinition.findUniqueOrThrow({ where: { key: 'company_main_activity' } });
    expect(JSON.parse(JSON.stringify(replayed))).toEqual(JSON.parse(JSON.stringify(baseline)));

    for (const incompatiblePolicy of ['EFFECTIVE_INSTANT', 'REFERENCE_PERIOD'] as const) {
      await expect(db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`UPDATE "fact_definitions" SET "temporalPolicy" = '${incompatiblePolicy}'::"FactTemporalPolicy" WHERE "key" = 'company_main_activity'`);
        await tx.$executeRawUnsafe(migration);
      })).rejects.toThrow(/Incompatible company-profile FactDefinition/);

      const afterRejectedReplay = await db.factDefinition.findUniqueOrThrow({ where: { key: 'company_main_activity' } });
      expect(JSON.parse(JSON.stringify(afterRejectedReplay))).toEqual(JSON.parse(JSON.stringify(baseline)));
    }

    for (const incompatibleMethod of ['DERIVED', 'LEGAL_CLASSIFICATION_REQUIRED', 'TECHNICAL_CLASSIFICATION_REQUIRED'] as const) {
      await expect(db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`UPDATE "fact_definitions" SET "determinationMethod" = '${incompatibleMethod}'::"FactDeterminationMethod" WHERE "key" = 'company_main_activity'`);
        await tx.$executeRawUnsafe(migration);
      })).rejects.toThrow(/Incompatible company-profile FactDefinition/);

      const afterRejectedReplay = await db.factDefinition.findUniqueOrThrow({ where: { key: 'company_main_activity' } });
      expect(JSON.parse(JSON.stringify(afterRejectedReplay))).toEqual(JSON.parse(JSON.stringify(baseline)));
    }
  });

  it('creates CLIENT_PROVIDED facts, supersedes immutable truth, and is idempotent', async () => {
    await expect(answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 1.5 }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_ANSWER_INVALID' });
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 0 }, db);
    const zero = await db.clientFact.findFirstOrThrow({ where: { clientId: clientA }, orderBy: { createdAt: 'asc' } });
    expect(zero.numberValue?.toString()).toBe('0');
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 47 }, db);
    const first = await db.clientFact.findFirstOrThrow({ where: { clientId: clientA }, orderBy: { createdAt: 'asc' } });
    expect(first.verificationStatus).toBe('CLIENT_PROVIDED');
    expect(first.determinationMethod).toBe('USER_PROVIDED');
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 47 }, db);
    expect(await db.clientFact.count({ where: { clientId: clientA } })).toBe(2);
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 52 }, db);
    const facts = await db.clientFact.findMany({ where: { clientId: clientA }, orderBy: { createdAt: 'asc' } });
    expect(facts).toHaveLength(3);
    expect(facts[0].supersededAt).not.toBeNull();
    expect(facts[1].supersededAt).not.toBeNull();
    expect(facts[2].numberValue?.toString()).toBe('52');
    await answerCompanyProfileQuestion(representativeId, workspaceA, 'employee_count', { status: 'UNKNOWN' }, db);
    const employeeQuestion = (await getCompanyProfileDiscovery(memberId, workspaceA, db)).questions.find((question) => question.questionKey === 'employee_count');
    expect(employeeQuestion).toMatchObject({ status: 'UNKNOWN', value: null });
    expect(await db.clientFact.count({ where: { clientId: clientA } })).toBe(3);
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
    expect(await db.clientFact.count({ where: { clientId: clientA } })).toBe(5);
  });

  it('enforces representative authority and client isolation', async () => {
    await expect(answerCompanyProfileQuestion(memberId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 1 }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_WRITE_FORBIDDEN' });
    await expect(answerCompanyProfileQuestion(otherClientIdentityId, workspaceA, 'employee_count', { status: 'ANSWERED', numberValue: 1 }, db)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_FORBIDDEN' });
    await expect(answerCompanyProfileQuestion(representativeId, workspaceA, 'not-a-question', { status: 'UNKNOWN' }, db)).rejects.toMatchObject({ code: 'CLIENT_PROFILE_QUESTION_NOT_FOUND' });
  });

  it('supersedes a legacy active fact when the absent state is answered UNKNOWN', async () => {
    const legacyId = crypto.randomUUID();
    await db.clientFact.create({ data: { id: legacyId, clientId: clientB, type: 'employee_count', value: '41', factDefinitionId: selectedDefinitionId, scopeType: 'COMPANY', numberValue: 41, validFrom: new Date('2026-01-01T00:00:00Z'), observedAt: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED' } });
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
