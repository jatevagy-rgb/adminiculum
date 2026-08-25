import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { addRequirementCitation, approveApplicabilityRuleVersion, approveRequirementVersion, createApplicabilityRuleVersion, createRequirement, createRequirementVersion } from '../src/modules/compliance/requirementRuleService';
import { createRequirementApplicability } from '../src/modules/compliance/requirementApplicabilityService';
import { FindingMaterializationIdentityConflictError, materializeRequirementApplicabilityFinding as materializeRequirementApplicabilityFindingCore, materializeRequirementApplicabilityFindingInTx as materializeRequirementApplicabilityFindingInTxCore, type FindingMaterializationInput } from '../src/modules/compliance/findingMaterializationService';

const databaseUrl = process.env.PHASE7_SLICE_7A_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

type LegacyTestMaterializationInput = FindingMaterializationInput & { assessmentId?: string };

const materializeRequirementApplicabilityFinding = (input: LegacyTestMaterializationInput, db: PrismaClient) =>
  materializeRequirementApplicabilityFindingCore({ applicabilityId: input.applicabilityId, createdByUserId: input.createdByUserId }, db);

const materializeRequirementApplicabilityFindingInTx = (input: LegacyTestMaterializationInput, tx: Prisma.TransactionClient) =>
  materializeRequirementApplicabilityFindingInTxCore({ applicabilityId: input.applicabilityId, createdByUserId: input.createdByUserId }, tx);

describeWithDatabase('Phase 7 Slice 7A applicability finding materialization (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `7A_${suffix}`;
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const subjectA = crypto.randomUUID();
  const subjectB = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const definitionId = crypto.randomUUID();
  const requirementIds: string[] = [];
  const versionIds: string[] = [];
  const ruleIds: string[] = [];
  const applicabilityIds: string[] = [];
  const assessmentIds: string[] = [];
  const factIds: string[] = [];
  const subjectIds: string[] = [];

  const ast = (factKey: string) => ({ schemaVersion: 'rule-ast/v1', node: { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } } });
  const scope = { scopeType: 'COMPANY' as const, evaluationAt: new Date('2026-08-24T12:00:00.000Z') };
  const factKey = `seven_a_fact_${suffix}`;

  async function pair(name: string, specialistRequirement: 'NONE' | 'LEGAL_ONLY' | 'TECHNICAL_CLASSIFICATION_REQUIRED' = 'NONE', sourceSupportState: 'SUFFICIENT' | 'INCOMPLETE' = 'SUFFICIENT') {
    const requirement = await createRequirement({ key: `REQ_7A_${name}_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    requirementIds.push(requirement.id);
    const version = await createRequirementVersion({ requirementId: requirement.id, versionKey: 'V1', title: `7A ${name}`, normativeStatement: `Normative ${name}`, effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: sourceSupportState === 'INCOMPLETE' ? 'SUFFICIENT' : sourceSupportState, specialistRequirement, db });
    versionIds.push(version.id);
    await addRequirementCitation({ requirementVersionId: version.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(version.id, userId, db);
    const rule = await createApplicabilityRuleVersion({ requirementVersionId: version.id, ruleVersionKey: 'R1', astJson: ast(factKey), evaluationScopeType: 'COMPANY', db });
    ruleIds.push(rule.id);
    await approveApplicabilityRuleVersion(rule.id, userId, db);
    return { requirement, version, rule };
  }

  async function fact(clientId: string, value: boolean, at = scope.evaluationAt, factScope: 'COMPANY' | 'EMPLOYEE' = 'COMPANY', factSubjectId: string | null = null) {
    const id = crypto.randomUUID();
    factIds.push(id);
    await db.clientFact.updateMany({
      where: { clientId, factDefinitionId: definitionId, scopeType: factScope, factSubjectId, supersededAt: null },
      data: { supersededAt: at },
    });
    await db.clientFact.create({ data: { id, clientId, type: factKey, value: 'legacy-unused', validFrom: new Date('2026-01-01T00:00:00Z'), factDefinitionId: definitionId, scopeType: factScope, factSubjectId, observedAt: at, booleanValue: value } as never });
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

  async function applicability(versionId: string, ruleId: string, clientId: string, evaluationAt = scope.evaluationAt, factScope: 'COMPANY' | 'EMPLOYEE' = 'COMPANY', factSubjectId: string | null = null) {
    const result = await createRequirementApplicability({ requirementVersionId: versionId, ruleVersionId: ruleId, clientId, scope: { ...scope, evaluationAt, scopeType: factScope, factSubjectId: factScope === 'COMPANY' ? undefined : factSubjectId } }, db);
    applicabilityIds.push(result.applicability.id);
    return result;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Phase 7 Slice 7A' } });
    await db.client.createMany({ data: [{ id: clientA, name: `7A Client A ${suffix}` }, { id: clientB, name: `7A Client B ${suffix}` }] });
    await db.user.create({ data: { id: userId, email: `7a-${suffix}@example.invalid`, name: '7A Fixture', role: 'ADMIN' } });
    await db.factDefinition.create({ data: { id: definitionId, key: factKey, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY', 'EMPLOYEE'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' } });
    subjectIds.push(subjectA, subjectB);
    await db.factSubject.createMany({ data: [
      { id: subjectA, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-a-${suffix}` },
      { id: subjectB, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-b-${suffix}` },
    ] });
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
    await db.factSubject.deleteMany({ where: { id: { in: subjectIds } } });
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

  it('keeps compliance finding materialization independent of Assessments', async () => {
    const selected = await pair('cross-client');
    await fact(clientA, true);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    const before = await db.assessmentFinding.count();
    const result = await materializeRequirementApplicabilityFinding({ applicabilityId: app.applicability.id, assessmentId: await assessment(clientB), createdByUserId: userId }, db);
    expect(result.finding?.clientId).toBe(clientA);
    expect((await db.assessmentFinding.findUniqueOrThrow({ where: { id: result.finding!.id }, select: { assessmentId: true } })).assessmentId).toBeNull();
    expect(await db.assessmentFinding.count()).toBe(before + 1);
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

  it('rolls back when the applicability is invalid', async () => {
    const selected = await pair('rollback');
    await fact(clientA, true);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    const before = await db.assessmentFinding.count();
    await expect(materializeRequirementApplicabilityFinding({ applicabilityId: crypto.randomUUID(), assessmentId: app.applicability.id, createdByUserId: userId }, db)).rejects.toThrow();
    expect(await db.assessmentFinding.count()).toBe(before);
  });

  it('never regresses from newer evidence to delayed older evidence', async () => {
    const selected = await pair('ordering');
    const assessmentId = await assessment(clientA);
    const olderAt = new Date('2026-08-24T11:00:00.000Z');
    const newerAt = new Date('2026-08-24T13:00:00.000Z');
    await fact(clientA, false, olderAt);
    const older = await applicability(selected.version.id, selected.rule.id, clientA, olderAt);
    await fact(clientA, true, newerAt);
    const newer = await applicability(selected.version.id, selected.rule.id, clientA, newerAt);
    const current = await materializeRequirementApplicabilityFinding({ applicabilityId: newer.applicability.id, assessmentId, createdByUserId: userId }, db);
    const delayed = await materializeRequirementApplicabilityFinding({ applicabilityId: older.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(current.finding?.requirementApplicabilityId).toBe(newer.applicability.id);
    expect(delayed.finding?.requirementApplicabilityId).toBe(newer.applicability.id);
    expect(delayed.finding?.applicabilityOutcome).toBe('APPLIES');
  });

  it('reconciles older then newer evidence and keeps the newer result under concurrency', async () => {
    const selected = await pair('concurrency-order');
    const assessmentId = await assessment(clientA);
    const olderAt = new Date('2026-08-24T14:00:00.000Z');
    const newerAt = new Date('2026-08-24T15:00:00.000Z');
    await fact(clientA, false, olderAt);
    const older = await applicability(selected.version.id, selected.rule.id, clientA, olderAt);
    await fact(clientA, true, newerAt);
    const newer = await applicability(selected.version.id, selected.rule.id, clientA, newerAt);
    const concurrent = await Promise.all([
      materializeRequirementApplicabilityFinding({ applicabilityId: older.applicability.id, assessmentId, createdByUserId: userId }, db),
      materializeRequirementApplicabilityFinding({ applicabilityId: newer.applicability.id, assessmentId, createdByUserId: userId }, db),
    ]);
    expect(await db.assessmentFinding.findFirstOrThrow({ where: { clientId: clientA, requirementId: selected.requirement.id } })).toMatchObject({ requirementApplicabilityId: newer.applicability.id, applicabilityOutcome: 'APPLIES' });
    expect(concurrent).toHaveLength(2);
  });

  it('deduplicates equivalent applicability evidence before finding persistence ordering', async () => {
    const selected = await pair('ambiguous-order');
    await fact(clientA, true);
    const assessmentId = await assessment(clientA);
    const first = await applicability(selected.version.id, selected.rule.id, clientA);
    const second = await applicability(selected.version.id, selected.rule.id, clientA);
    await materializeRequirementApplicabilityFinding({ applicabilityId: first.applicability.id, assessmentId, createdByUserId: userId }, db);
    const persisted = await db.requirementApplicability.findUniqueOrThrow({ where: { id: first.applicability.id }, select: { createdAt: true } });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "requirement_applicabilities" DISABLE TRIGGER "requirement_applicabilities_immutable"');
      try {
        await tx.requirementApplicability.update({ where: { id: second.applicability.id }, data: { createdAt: persisted.createdAt } });
      } finally {
        await tx.$executeRawUnsafe('ALTER TABLE "requirement_applicabilities" ENABLE TRIGGER "requirement_applicabilities_immutable"');
      }
    });
    const result = await materializeRequirementApplicabilityFinding({ applicabilityId: second.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(result.created).toBe(false);
    expect(result.finding?.requirementApplicabilityId).toBe(first.applicability.id);
  });

  it.each([
    ['LEGAL_REVIEW_REQUIRED', 'LEGAL_ONLY', 'SUFFICIENT'],
    ['TECHNICAL_REVIEW_REQUIRED', 'TECHNICAL_CLASSIFICATION_REQUIRED', 'SUFFICIENT'],
    ['SOURCE_SUPPORT_INSUFFICIENT', 'NONE', 'INCOMPLETE'],
  ] as const)('preserves specialist outcome %s', async (expected, specialist, sourceSupportState) => {
    const selected = await pair(`specialist-${expected}`, specialist);
    const created = await applicability(selected.version.id, selected.rule.id, clientA);
    if (sourceSupportState === 'INCOMPLETE') {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE "requirement_applicabilities" DISABLE TRIGGER "requirement_applicabilities_immutable"');
        try {
          await tx.requirementApplicability.update({ where: { id: created.applicability.id }, data: { outcome: expected, sourceSupportState: 'INCOMPLETE' } });
        } finally {
          await tx.$executeRawUnsafe('ALTER TABLE "requirement_applicabilities" ENABLE TRIGGER "requirement_applicabilities_immutable"');
        }
      });
    }
    const result = await materializeRequirementApplicabilityFinding({ applicabilityId: created.applicability.id, assessmentId: await assessment(clientA), createdByUserId: userId }, db);
    expect(result.finding?.applicabilityOutcome).toBe(expected);
    expect(result.finding?.applicabilityOutcome).not.toBe('DOES_NOT_APPLY');
  });

  it('supports composition inside an existing Prisma transaction', async () => {
    const selected = await pair('composable');
    await fact(clientA, true);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    const assessmentId = await assessment(clientA);
    const result = await db.$transaction((tx) => materializeRequirementApplicabilityFindingInTx({ applicabilityId: app.applicability.id, assessmentId, createdByUserId: userId }, tx));
    expect(result.finding).toBeTruthy();
  });

  it('materializes independent findings for two employee subjects', async () => {
    const selected = await pair('subject-independent');
    const assessmentId = await assessment(clientA);
    await fact(clientA, true, scope.evaluationAt, 'EMPLOYEE', subjectA);
    await fact(clientA, true, scope.evaluationAt, 'EMPLOYEE', subjectB);
    const appA = await applicability(selected.version.id, selected.rule.id, clientA, scope.evaluationAt, 'EMPLOYEE', subjectA);
    const appB = await applicability(selected.version.id, selected.rule.id, clientA, scope.evaluationAt, 'EMPLOYEE', subjectB);
    const findingA = await materializeRequirementApplicabilityFinding({ applicabilityId: appA.applicability.id, assessmentId, createdByUserId: userId }, db);
    const findingB = await materializeRequirementApplicabilityFinding({ applicabilityId: appB.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(findingA.finding?.id).not.toBe(findingB.finding?.id);
    expect(findingA.finding?.factSubjectId).toBe(subjectA);
    expect(findingB.finding?.factSubjectId).toBe(subjectB);
  });

  it('does not let one employee subject DOES_NOT_APPLY resolve another subject', async () => {
    const selected = await pair('subject-does-not-apply-isolation');
    const assessmentId = await assessment(clientA);
    await fact(clientA, true, scope.evaluationAt, 'EMPLOYEE', subjectA);
    await fact(clientA, false, scope.evaluationAt, 'EMPLOYEE', subjectB);
    const appA = await applicability(selected.version.id, selected.rule.id, clientA, scope.evaluationAt, 'EMPLOYEE', subjectA);
    const appB = await applicability(selected.version.id, selected.rule.id, clientA, scope.evaluationAt, 'EMPLOYEE', subjectB);
    const findingA = await materializeRequirementApplicabilityFinding({ applicabilityId: appA.applicability.id, assessmentId, createdByUserId: userId }, db);
    const findingB = await materializeRequirementApplicabilityFinding({ applicabilityId: appB.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(findingA.finding?.status).toBe('OPEN');
    expect(findingA.finding?.applicabilityOutcome).toBe('APPLIES');
    expect(findingB.finding).toBeNull();
  });

  it('resolves only the subject whose later applicability is DOES_NOT_APPLY', async () => {
    const selected = await pair('subject-resolve-isolation');
    const assessmentId = await assessment(clientA);
    const at = new Date('2026-08-24T16:00:00.000Z');
    await fact(clientA, true, at, 'EMPLOYEE', subjectA);
    await fact(clientA, true, at, 'EMPLOYEE', subjectB);
    const appA = await applicability(selected.version.id, selected.rule.id, clientA, at, 'EMPLOYEE', subjectA);
    const appB = await applicability(selected.version.id, selected.rule.id, clientA, at, 'EMPLOYEE', subjectB);
    const findingA = await materializeRequirementApplicabilityFinding({ applicabilityId: appA.applicability.id, assessmentId, createdByUserId: userId }, db);
    const findingB = await materializeRequirementApplicabilityFinding({ applicabilityId: appB.applicability.id, assessmentId, createdByUserId: userId }, db);
    await fact(clientA, false, new Date('2026-08-24T17:00:00.000Z'), 'EMPLOYEE', subjectB);
    const appBDoesNotApply = await applicability(selected.version.id, selected.rule.id, clientA, new Date('2026-08-24T17:00:00.000Z'), 'EMPLOYEE', subjectB);
    const resolvedB = await materializeRequirementApplicabilityFinding({ applicabilityId: appBDoesNotApply.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(resolvedB.finding?.id).toBe(findingB.finding?.id);
    expect(resolvedB.finding?.status).toBe('RESOLVED');
    expect((await db.assessmentFinding.findUniqueOrThrow({ where: { id: findingA.finding!.id } })).status).toBe('OPEN');
  });

  it('keeps company and employee findings separate', async () => {
    const selected = await pair('company-employee-scope');
    const assessmentId = await assessment(clientA);
    await fact(clientA, true);
    await fact(clientA, true, scope.evaluationAt, 'EMPLOYEE', subjectA);
    const company = await applicability(selected.version.id, selected.rule.id, clientA);
    const employee = await applicability(selected.version.id, selected.rule.id, clientA, scope.evaluationAt, 'EMPLOYEE', subjectA);
    const companyFinding = await materializeRequirementApplicabilityFinding({ applicabilityId: company.applicability.id, assessmentId, createdByUserId: userId }, db);
    const employeeFinding = await materializeRequirementApplicabilityFinding({ applicabilityId: employee.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(companyFinding.finding?.id).not.toBe(employeeFinding.finding?.id);
    expect(companyFinding.finding?.scopeType).toBe('COMPANY');
    expect(employeeFinding.finding?.scopeType).toBe('EMPLOYEE');
  });

  it('reconciles a newer applicability onto the same scoped finding row', async () => {
    const selected = await pair('subject-reconcile');
    const assessmentId = await assessment(clientA);
    const firstAt = new Date('2026-08-24T18:00:00.000Z');
    const secondAt = new Date('2026-08-24T19:00:00.000Z');
    await fact(clientA, true, firstAt, 'EMPLOYEE', subjectA);
    const first = await applicability(selected.version.id, selected.rule.id, clientA, firstAt, 'EMPLOYEE', subjectA);
    const firstFinding = await materializeRequirementApplicabilityFinding({ applicabilityId: first.applicability.id, assessmentId, createdByUserId: userId }, db);
    await fact(clientA, true, secondAt, 'EMPLOYEE', subjectA);
    const second = await applicability(selected.version.id, selected.rule.id, clientA, secondAt, 'EMPLOYEE', subjectA);
    const secondFinding = await materializeRequirementApplicabilityFinding({ applicabilityId: second.applicability.id, assessmentId, createdByUserId: userId }, db);
    expect(secondFinding.finding?.id).toBe(firstFinding.finding?.id);
  });

  it('enforces subjectless uniqueness while permitting different subjects', async () => {
    const selected = await pair('db-identity');
    const assessmentId = await assessment(clientA);
    await fact(clientA, true);
    await fact(clientA, true, scope.evaluationAt, 'EMPLOYEE', subjectA);
    const company = await applicability(selected.version.id, selected.rule.id, clientA);
    const employee = await applicability(selected.version.id, selected.rule.id, clientA, scope.evaluationAt, 'EMPLOYEE', subjectA);
    const companyFinding = await materializeRequirementApplicabilityFinding({ applicabilityId: company.applicability.id, assessmentId, createdByUserId: userId }, db);
    const employeeFinding = await materializeRequirementApplicabilityFinding({ applicabilityId: employee.applicability.id, assessmentId, createdByUserId: userId }, db);
    await expect(db.assessmentFinding.create({ data: {
      clientId: clientA, assessmentId, requirementId: selected.requirement.id, scopeType: 'COMPANY', factSubjectId: null,
      requirementApplicabilityId: company.applicability.id, applicabilityOutcome: 'APPLIES', severity: 'MEDIUM', title: 'duplicate', status: 'OPEN', createdByUserId: userId,
    } })).rejects.toMatchObject({ code: 'P2002' });
    expect(employeeFinding.finding?.id).not.toBe(companyFinding.finding?.id);
  });

  it('rejects a materialized finding without scopeType at the database boundary', async () => {
    const selected = await pair('scope-check');
    const assessmentId = await assessment(clientA);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    await expect(db.assessmentFinding.create({ data: {
      clientId: clientA,
      assessmentId,
      requirementId: selected.requirement.id,
      scopeType: null,
      factSubjectId: null,
      requirementApplicabilityId: app.applicability.id,
      applicabilityOutcome: 'APPLIES',
      severity: 'MEDIUM',
      title: 'invalid scope',
      status: 'OPEN',
      createdByUserId: userId,
    } })).rejects.toThrow();
  });

  it('retries a same-target uniqueness race in a fresh standalone transaction', async () => {
    const selected = await pair('same-target-race');
    const assessmentId = await assessment(clientA);
    await fact(clientA, true);
    const first = await applicability(selected.version.id, selected.rule.id, clientA);
    const second = await applicability(selected.version.id, selected.rule.id, clientA);
    const results = await Promise.all([
      materializeRequirementApplicabilityFinding({ applicabilityId: first.applicability.id, assessmentId, createdByUserId: userId }, db),
      materializeRequirementApplicabilityFinding({ applicabilityId: second.applicability.id, assessmentId, createdByUserId: userId }, db),
    ]);
    expect(new Set(results.map((result) => result.finding?.id)).size).toBe(1);
    expect(await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id, scopeType: 'COMPANY', factSubjectId: null } })).toBe(1);
  });

  it('leaves caller-owned InTx conflicts to the caller for whole-transaction retry', async () => {
    const selected = await pair('intx-conflict-ownership');
    const assessmentId = await assessment(clientA);
    await fact(clientA, true);
    const first = await applicability(selected.version.id, selected.rule.id, clientA);
    const second = await applicability(selected.version.id, selected.rule.id, clientA);
    const firstFinding = await materializeRequirementApplicabilityFinding({ applicabilityId: first.applicability.id, assessmentId, createdByUserId: userId }, db);
    let findCalls = 0;
    let createAttempted = false;
    let updatesAfterCreate = 0;
    await expect(db.$transaction((tx) => {
      const findingDelegate = new Proxy(tx.assessmentFinding, {
        get(target, property, receiver) {
          if (property === 'findFirst') {
            return async () => {
              findCalls += 1;
              return null;
            };
          }
          if (property === 'create') {
            return (...args: any[]) => {
              createAttempted = true;
              return Reflect.apply((target as any)[property], target, args);
            };
          }
          if (property === 'update') {
            return (...args: any[]) => {
              if (createAttempted) updatesAfterCreate += 1;
              return Reflect.apply((target as any)[property], target, args);
            };
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const conflictTx = new Proxy(tx, {
        get(target, property, receiver) {
          return property === 'assessmentFinding' ? findingDelegate : Reflect.get(target, property, receiver);
        },
      });
      return materializeRequirementApplicabilityFindingInTx({ applicabilityId: second.applicability.id, assessmentId, createdByUserId: userId }, conflictTx as typeof tx);
    })).rejects.toBeInstanceOf(FindingMaterializationIdentityConflictError);
    expect(findCalls).toBe(1);
    expect(createAttempted).toBe(true);
    expect(updatesAfterCreate).toBe(0);
    const retry = await db.$transaction(
      (tx) => materializeRequirementApplicabilityFindingInTx({ applicabilityId: second.applicability.id, assessmentId, createdByUserId: userId }, tx),
    );
    expect(retry.finding?.id).toBe(firstFinding.finding?.id);
    expect(await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id, scopeType: 'COMPANY', factSubjectId: null } })).toBe(1);
  });

  it('leaves an unrelated PostgreSQL P2002 outside finding identity classification', async () => {
    await expect(db.client.create({ data: { id: clientA, name: `duplicate-client-${suffix}` } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('retries the entire standalone transaction after a deterministic P2034', async () => {
    const selected = await pair('forced-p2034-ordering');
    const assessmentId = await assessment(clientA);
    const olderAt = new Date('2026-08-24T20:00:00.000Z');
    const newerAt = new Date('2026-08-24T21:00:00.000Z');
    await fact(clientA, false, olderAt);
    const older = await applicability(selected.version.id, selected.rule.id, clientA, olderAt);
    await fact(clientA, true, newerAt);
    const newer = await applicability(selected.version.id, selected.rule.id, clientA, newerAt);
    let attempts = 0;
    const p2034 = () => new Prisma.PrismaClientKnownRequestError('forced serialization failure', {
      code: 'P2034',
      clientVersion: Prisma.prismaVersion.client,
    });
    const faultInjectedDb = {
      $transaction: async (callback: any, options: any) => {
        attempts += 1;
        if (attempts === 1) {
          return db.$transaction(async (tx) => {
            await callback(tx);
            throw p2034();
          }, options);
        }
        return db.$transaction(callback, options);
      },
    } as unknown as PrismaClient;

    const result = await materializeRequirementApplicabilityFinding({ applicabilityId: newer.applicability.id, assessmentId, createdByUserId: userId }, faultInjectedDb);
    expect(attempts).toBe(2);
    expect(result.finding?.requirementApplicabilityId).toBe(newer.applicability.id);
    expect(result.finding?.requirementApplicabilityId).not.toBe(older.applicability.id);
    expect(await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id, scopeType: 'COMPANY', factSubjectId: null } })).toBe(1);
  });

  it('stops after three deterministic P2034 failures and commits no finding', async () => {
    const selected = await pair('forced-p2034-exhaustion');
    const assessmentId = await assessment(clientA);
    await fact(clientA, true);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    const before = await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id } });
    let attempts = 0;
    const p2034 = () => new Prisma.PrismaClientKnownRequestError('forced serialization failure', {
      code: 'P2034',
      clientVersion: Prisma.prismaVersion.client,
    });
    const faultInjectedDb = {
      $transaction: async (callback: any, options: any) => {
        attempts += 1;
        return db.$transaction(async (tx) => {
          await callback(tx);
          throw p2034();
        }, options);
      },
    } as unknown as PrismaClient;

    await expect(materializeRequirementApplicabilityFinding({ applicabilityId: app.applicability.id, assessmentId, createdByUserId: userId }, faultInjectedDb)).rejects.toMatchObject({ code: 'P2034' });
    expect(attempts).toBe(3);
    expect(await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id } })).toBe(before);
  });

  it('stops after three deterministic identity-conflict failures', async () => {
    const selected = await pair('forced-identity-exhaustion');
    const assessmentId = await assessment(clientA);
    await fact(clientA, true);
    const app = await applicability(selected.version.id, selected.rule.id, clientA);
    const before = await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id } });
    let attempts = 0;
    const faultInjectedDb = {
      $transaction: async () => {
        attempts += 1;
        throw new FindingMaterializationIdentityConflictError();
      },
    } as unknown as PrismaClient;

    await expect(materializeRequirementApplicabilityFinding({ applicabilityId: app.applicability.id, assessmentId, createdByUserId: userId }, faultInjectedDb)).rejects.toBeInstanceOf(FindingMaterializationIdentityConflictError);
    expect(attempts).toBe(3);
    expect(await db.assessmentFinding.count({ where: { clientId: clientA, requirementId: selected.requirement.id } })).toBe(before);
  });
});
