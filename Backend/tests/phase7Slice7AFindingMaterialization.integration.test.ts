import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { addRequirementCitation, approveApplicabilityRuleVersion, approveRequirementVersion, createApplicabilityRuleVersion, createRequirement, createRequirementVersion } from '../src/modules/compliance/requirementRuleService';
import { createRequirementApplicability } from '../src/modules/compliance/requirementApplicabilityService';
import { materializeRequirementApplicabilityFinding } from '../src/modules/compliance/findingMaterializationService';

const databaseUrl = process.env.PHASE7_SLICE_7A_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Phase 7 Slice 7A applicability finding materialization (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `7A_${suffix}`;
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const definitionId = crypto.randomUUID();
  const requirementIds: string[] = [];
  const versionIds: string[] = [];
  const ruleIds: string[] = [];
  const applicabilityIds: string[] = [];
  const assessmentIds: string[] = [];
  const factIds: string[] = [];

  const ast = (factKey: string) => ({ schemaVersion: 'rule-ast/v1', node: { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } } });
  const scope = { scopeType: 'COMPANY' as const, evaluationAt: new Date('2026-08-24T12:00:00.000Z') };
  const factKey = `seven_a_fact_${suffix}`;

  async function pair(name: string) {
    const requirement = await createRequirement({ key: `REQ_7A_${name}_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    requirementIds.push(requirement.id);
    const version = await createRequirementVersion({ requirementId: requirement.id, versionKey: 'V1', title: `7A ${name}`, normativeStatement: `Normative ${name}`, effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db });
    versionIds.push(version.id);
    await addRequirementCitation({ requirementVersionId: version.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(version.id, userId, db);
    const rule = await createApplicabilityRuleVersion({ requirementVersionId: version.id, ruleVersionKey: 'R1', astJson: ast(factKey), db });
    ruleIds.push(rule.id);
    await approveApplicabilityRuleVersion(rule.id, userId, db);
    return { requirement, version, rule };
  }

  async function fact(clientId: string, value: boolean) {
    const id = crypto.randomUUID();
    factIds.push(id);
    await db.clientFact.updateMany({
      where: { clientId, factDefinitionId: definitionId, supersededAt: null },
      data: { supersededAt: scope.evaluationAt },
    });
    await db.clientFact.create({ data: { id, clientId, type: factKey, value: 'legacy-unused', validFrom: new Date('2026-01-01T00:00:00Z'), factDefinitionId: definitionId, scopeType: 'COMPANY', observedAt: scope.evaluationAt, booleanValue: value } as never });
    return id;
  }

  async function supersedeActiveFacts(clientId: string) {
    await db.clientFact.updateMany({
      where: { clientId, factDefinitionId: definitionId, supersededAt: null },
      data: { supersededAt: scope.evaluationAt },
    });
  }

  async function assessment(clientId: string) {
    const id = crypto.randomUUID();
    assessmentIds.push(id);
    await db.assessment.create({ data: { id, clientId, type: 'COMPLIANCE', title: `7A assessment ${id}`, createdByUserId: userId } });
    return id;
  }

  async function applicability(versionId: string, ruleId: string, clientId: string) {
    const result = await createRequirementApplicability({ requirementVersionId: versionId, ruleVersionId: ruleId, clientId, scope }, db);
    applicabilityIds.push(result.applicability.id);
    return result;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Phase 7 Slice 7A' } });
    await db.client.createMany({ data: [{ id: clientA, name: `7A Client A ${suffix}` }, { id: clientB, name: `7A Client B ${suffix}` }] });
    await db.user.create({ data: { id: userId, email: `7a-${suffix}@example.invalid`, name: '7A Fixture', role: 'ADMIN' } });
    await db.factDefinition.create({ data: { id: definitionId, key: factKey, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' } });
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `7a-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED', updatedAt: new Date() } });
    await db.legalSourceVersion.create({ data: { id: sourceVersionId, legalSourceId: sourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } });
  });

  afterAll(async () => {
    await db.assessmentFinding.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
    await db.requirementApplicability.deleteMany({ where: { id: { in: applicabilityIds } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: ruleIds } } });
    await db.requirementVersion.deleteMany({ where: { id: { in: versionIds } } });
    await db.requirement.deleteMany({ where: { id: { in: requirementIds } } });
    await db.clientFact.deleteMany({ where: { id: { in: factIds } } });
    await db.legalSourceVersion.deleteMany({ where: { id: sourceVersionId } });
    await db.legalSource.deleteMany({ where: { id: sourceId } });
    await db.factDefinition.deleteMany({ where: { id: definitionId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.$disconnect();
  });

  it('materializes APPLIES and is idempotent for the same snapshot', async () => {
    const selected = await pair('applies');
    await fact(clientA, true);
    const assessmentId = await assessment(clientA);
    const created = await applicability(selected.version.id, selected.rule.id, clientA);
    const first = await materializeRequirementApplicabilityFinding({ applicabilityId: created.applicability.id, assessmentId, createdByUserId: userId }, db);
    const second = await materializeRequirementApplicabilityFinding({ applicabilityId: created.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.finding?.id).toBe(first.finding?.id);
    expect(await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id } })).toBe(1);
    expect(second.finding?.applicabilityOutcome).toBe('APPLIES');
  });

  it('does not duplicate a finding under concurrent retries', async () => {
    const selected = await pair('concurrent');
    await fact(clientA, true);
    const assessmentId = await assessment(clientA);
    const created = await applicability(selected.version.id, selected.rule.id, clientA);
    const results = await Promise.all([
      materializeRequirementApplicabilityFinding({ applicabilityId: created.applicability.id, assessmentId, createdByUserId: userId }, db),
      materializeRequirementApplicabilityFinding({ applicabilityId: created.applicability.id, assessmentId, createdByUserId: userId }, db),
    ]);
    expect(new Set(results.map((result) => result.finding?.id)).size).toBe(1);
    expect(await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id } })).toBe(1);
  });

  it('keeps two clients isolated for the same requirement', async () => {
    const selected = await pair('tenant-isolation');
    await fact(clientA, true);
    await fact(clientB, true);
    const appA = await applicability(selected.version.id, selected.rule.id, clientA);
    const appB = await applicability(selected.version.id, selected.rule.id, clientB);
    const findingA = await materializeRequirementApplicabilityFinding({ applicabilityId: appA.applicability.id, assessmentId: await assessment(clientA), createdByUserId: userId }, db);
    const findingB = await materializeRequirementApplicabilityFinding({ applicabilityId: appB.applicability.id, assessmentId: await assessment(clientB), createdByUserId: userId }, db);
    expect(findingA.finding?.clientId).toBe(clientA);
    expect(findingB.finding?.clientId).toBe(clientB);
    expect(findingA.finding?.id).not.toBe(findingB.finding?.id);
  });

  it('rejects a cross-client assessment and creates no finding', async () => {
    const selected = await pair('cross-client');
    await fact(clientA, true);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    const before = await db.assessmentFinding.count();
    await expect(materializeRequirementApplicabilityFinding({ applicabilityId: app.applicability.id, assessmentId: await assessment(clientB), createdByUserId: userId }, db)).rejects.toThrow('Assessment does not belong');
    expect(await db.assessmentFinding.count()).toBe(before);
  });

  it('keeps DOES_NOT_APPLY non-active and follows the finding lifecycle', async () => {
    const selected = await pair('does-not-apply');
    const clientFactId = await fact(clientA, true);
    const assessmentId = await assessment(clientA);
    const applies = await applicability(selected.version.id, selected.rule.id, clientA);
    const original = await materializeRequirementApplicabilityFinding({ applicabilityId: applies.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(original.finding?.status).toBe('OPEN');
    await db.clientFact.update({ where: { id: clientFactId }, data: { supersededAt: new Date('2026-08-24T13:00:00Z') } });
    await fact(clientA, false);
    const doesNotApply = await applicability(selected.version.id, selected.rule.id, clientA);
    const resolved = await materializeRequirementApplicabilityFinding({ applicabilityId: doesNotApply.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(resolved.finding?.id).toBe(original.finding?.id);
    expect(resolved.finding?.status).toBe('RESOLVED');
    expect(resolved.finding?.applicabilityOutcome).toBe('DOES_NOT_APPLY');
  });

  it('keeps INSUFFICIENT_FACTS distinct and reconciles a later APPLIES snapshot', async () => {
    const selected = await pair('insufficient');
    await supersedeActiveFacts(clientA);
    const assessmentId = await assessment(clientA);
    const insufficient = await applicability(selected.version.id, selected.rule.id, clientA);
    const unresolved = await materializeRequirementApplicabilityFinding({ applicabilityId: insufficient.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(unresolved.finding?.applicabilityOutcome).toBe('INSUFFICIENT_FACTS');
    expect(unresolved.finding?.status).toBe('OPEN');
    await fact(clientA, true);
    const applies = await applicability(selected.version.id, selected.rule.id, clientA);
    const reconciled = await materializeRequirementApplicabilityFinding({ applicabilityId: applies.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(reconciled.finding?.id).toBe(unresolved.finding?.id);
    expect(reconciled.finding?.applicabilityOutcome).toBe('APPLIES');
  });

  it('does not mutate immutable applicability evidence and preserves traceability', async () => {
    const selected = await pair('immutable');
    await fact(clientA, true);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    const before = await db.requirementApplicability.findUniqueOrThrow({ where: { id: app.applicability.id } });
    const result = await materializeRequirementApplicabilityFinding({ applicabilityId: app.applicability.id, assessmentId: await assessment(clientA), createdByUserId: userId }, db);
    const after = await db.requirementApplicability.findUniqueOrThrow({ where: { id: app.applicability.id } });
    expect(after.snapshotDigest).toBe(before.snapshotDigest);
    expect(result.finding?.requirementApplicabilityId).toBe(before.id);
    await expect(db.$executeRaw`UPDATE requirement_applicabilities SET outcome = 'DOES_NOT_APPLY' WHERE id = ${before.id}`).rejects.toThrow();
  });

  it('rolls back when the assessment is invalid', async () => {
    const selected = await pair('rollback');
    await fact(clientA, true);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    const before = await db.assessmentFinding.count();
    await expect(materializeRequirementApplicabilityFinding({ applicabilityId: app.applicability.id, assessmentId: crypto.randomUUID(), createdByUserId: userId }, db)).rejects.toThrow();
    expect(await db.assessmentFinding.count()).toBe(before);
  });
});
