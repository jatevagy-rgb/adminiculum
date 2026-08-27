import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createFact, createFinding, verifyFact } from '../src/modules/client-company/service';
import { createTypedFactAndEvaluate } from '../src/modules/compliance/typedFactMutationService';
import { createRequirement, createRequirementVersion, addRequirementCitation, createApplicabilityRuleVersion, approveRequirementVersion, approveApplicabilityRuleVersion } from '../src/modules/compliance/requirementRuleService';
import { createRequirementApplicability } from '../src/modules/compliance/requirementApplicabilityService';
import { listUnresolvedRuleScopes } from '../src/modules/compliance/complianceOverviewService';
import { resolveEffectiveRequirementRuleVersion } from '../src/modules/compliance/effectiveRequirementRuleResolver';

const databaseUrl = process.env.PHASE7D_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Phase 7D typed fact to finding automation (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `7D_${suffix}`;
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const boolDefinitionId = crypto.randomUUID();
  const numberDefinitionId = crypto.randomUUID();
  const enumDefinitionId = crypto.randomUUID();
  const moneyDefinitionId = crypto.randomUUID();
  const periodDefinitionId = crypto.randomUUID();
  const multiEnumDefinitionId = crypto.randomUUID();
  const employeeDefinitionId = crypto.randomUUID();
  const enrollmentDefinitionId = crypto.randomUUID();
  const enrollmentStateDefinitionId = crypto.randomUUID();
  const temporalDefinitionId = crypto.randomUUID();
  const employeeSubjectA = crypto.randomUUID();
  const employeeSubjectB = crypto.randomUUID();
  const employeeSubjectC = crypto.randomUUID();
  const contractSubjectA = crypto.randomUUID();
  const requirementIds: string[] = [];
  const versionIds: string[] = [];
  const ruleIds: string[] = [];
  const assessmentIds: string[] = [];

  const actor = { userId: actorId, role: 'ADMIN' };
  const ast = (factKey: string) => ({
    schemaVersion: 'rule-ast/v1',
    node: { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } },
  });

  async function createBooleanRule(name: string, factKey: string, options: { scopeType?: 'COMPANY' | 'EMPLOYEE'; effectiveFrom?: string; effectiveTo?: string | null } = {}) {
    const scopeType = options.scopeType ?? 'COMPANY';
    const requirement = await createRequirement({ key: `REQ_7D_${name}_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    requirementIds.push(requirement.id);
    const version = await createRequirementVersion({
      requirementId: requirement.id,
      versionKey: 'V1',
      title: `7D ${name}`,
      normativeStatement: `7D normative ${name}`,
      effectiveFrom: new Date(options.effectiveFrom ?? '2026-01-01T00:00:00Z'),
      effectiveTo: options.effectiveTo === undefined ? undefined : options.effectiveTo ? new Date(options.effectiveTo) : null,
      sourceSupportState: 'SUFFICIENT',
      db,
    });
    versionIds.push(version.id);
    await addRequirementCitation({ requirementVersionId: version.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(version.id, actorId, db);
    const rule = await createApplicabilityRuleVersion({ requirementVersionId: version.id, ruleVersionKey: 'R1', astJson: ast(factKey), evaluationScopeType: scopeType as never, db });
    ruleIds.push(rule.id);
    await approveApplicabilityRuleVersion(rule.id, actorId, db);
    return { requirement, version, rule };
  }

  async function typed(definitionId: string, fields: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const input = { factDefinitionId: definitionId, scopeType: 'COMPANY', ...fields, ...extra } as Record<string, unknown>;
    if (input.observedAt && !input.evaluationAt) input.evaluationAt = '2026-08-24T23:00:00Z';
    // Keep observation-based fixtures eligible at their fixed evaluation time;
    // production intentionally defaults omitted validFrom to the wall clock.
    if (input.observedAt && !input.validFrom) input.validFrom = input.observedAt;
    return createFact(actor, clientA, input, db);
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Phase 7D test domain' } });
    await db.client.createMany({ data: [{ id: clientA, name: `7D Client A ${suffix}` }, { id: clientB, name: `7D Client B ${suffix}` }] });
    await db.clientOperatingProfile.create({ data: { clientId: clientA, complianceEnrollmentStatus: 'ENROLLED' } });
    await db.user.create({ data: { id: actorId, email: `7d-${suffix}@example.invalid`, name: 'Phase 7D actor', role: 'ADMIN' } });
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `7d-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED' } });
    await db.legalSourceVersion.create({ data: { id: sourceVersionId, legalSourceId: sourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } });
    await db.factDefinition.createMany({ data: [
      { id: boolDefinitionId, key: `seven_d_boolean_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: numberDefinitionId, key: `seven_d_number_${suffix}`, domainCode, valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'DISALLOW', temporalPolicy: 'VALIDITY_INTERVAL' },
      { id: enumDefinitionId, key: `seven_d_enum_${suffix}`, domainCode, valueType: 'ENUM', allowedEnumValues: ['A', 'B'], allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: moneyDefinitionId, key: `seven_d_money_${suffix}`, domainCode, valueType: 'MONEY', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: periodDefinitionId, key: `seven_d_period_${suffix}`, domainCode, valueType: 'PERIOD', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'REFERENCE_PERIOD' },
      { id: multiEnumDefinitionId, key: `seven_d_multi_${suffix}`, domainCode, valueType: 'MULTI_ENUM', allowedEnumValues: ['A', 'B', 'C'], allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: employeeDefinitionId, key: `seven_d_employee_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['EMPLOYEE'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: enrollmentDefinitionId, key: `seven_d_enrollment_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: enrollmentStateDefinitionId, key: `seven_d_enrollment_state_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: temporalDefinitionId, key: `seven_d_temporal_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
    ] });
    await db.factSubject.createMany({ data: [
      { id: employeeSubjectA, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-a-${suffix}` },
      { id: employeeSubjectB, clientId: clientB, scopeType: 'EMPLOYEE', subjectKey: `employee-b-${suffix}` },
      { id: employeeSubjectC, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-c-${suffix}` },
      { id: contractSubjectA, clientId: clientA, scopeType: 'CONTRACT', subjectKey: `contract-a-${suffix}` },
    ] });
    await createBooleanRule('boolean', `seven_d_boolean_${suffix}`);
  });

  afterAll(async () => {
    await db.assessmentFinding.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
    await db.requirementApplicability.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: ruleIds } } });
    await db.requirementVersion.deleteMany({ where: { id: { in: versionIds } } });
    await db.requirement.deleteMany({ where: { id: { in: requirementIds } } });
    await db.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.factSubject.deleteMany({ where: { id: { in: [employeeSubjectA, employeeSubjectB, employeeSubjectC, contractSubjectA] } } });
    await db.factDefinition.deleteMany({ where: { id: { in: [boolDefinitionId, numberDefinitionId, enumDefinitionId, moneyDefinitionId, periodDefinitionId, multiEnumDefinitionId, employeeDefinitionId, enrollmentDefinitionId, enrollmentStateDefinitionId, temporalDefinitionId] } } });
    await db.legalSourceVersion.deleteMany({ where: { id: sourceVersionId } });
    await db.legalSource.deleteMany({ where: { id: sourceId } });
    await db.user.deleteMany({ where: { id: actorId } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.$disconnect();
  });

  it('writes typed BOOLEAN and atomically evaluates, snapshots, and materializes a NULL-assessment finding', async () => {
    const result = await typed(boolDefinitionId, { booleanValue: true, observedAt: '2026-08-24T12:00:00Z' });
    const row = await db.clientFact.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.type).toBe(`seven_d_boolean_${suffix}`);
    expect(row.value).toBe('true');
    expect(row.booleanValue).toBe(true);
    const finding = await db.assessmentFinding.findFirstOrThrow({ where: { clientId: clientA, requirementId: requirementIds[0] } });
    expect(finding.assessmentId).toBeNull();
    expect(finding.createdByUserId).toBe(actorId);
    expect(finding.applicabilityOutcome).toBe('APPLIES');
    const applicabilityCount = await db.requirementApplicability.count({ where: { clientId: clientA } });
    await verifyFact(actor, result.id, { verificationStatus: 'CLIENT_PROVIDED' }, db);
    expect(await db.requirementApplicability.count({ where: { clientId: clientA } })).toBe(applicabilityCount);
  });

  it('keeps manual Assessment finding creation unchanged and does not attach compliance findings', async () => {
    const assessmentId = crypto.randomUUID();
    assessmentIds.push(assessmentId);
    await db.assessment.create({ data: { id: assessmentId, clientId: clientA, type: 'COMPANY_OPERATING', title: 'Manual assessment', createdByUserId: actorId } });
    const manual = await createFinding(actor, { clientId: clientA, assessmentId, title: 'Manual finding' }, db);
    expect(manual.assessmentId).toBe(assessmentId);
    const compliance = await db.assessmentFinding.findFirstOrThrow({ where: { clientId: clientA, requirementId: requirementIds[0] } });
    expect(compliance.assessmentId).toBeNull();
    await db.assessment.delete({ where: { id: assessmentId } });
    expect(await db.assessmentFinding.findUnique({ where: { id: compliance.id } })).not.toBeNull();
  });

  it('accepts typed NUMBER, ENUM, MONEY, PERIOD, and MULTI_ENUM values and rejects wrong representations', async () => {
    const number = await typed(numberDefinitionId, { numberValue: '12.50', validFrom: '2030-01-01', validTo: '2030-02-01' });
    const enumFact = await typed(enumDefinitionId, { enumValue: 'A', observedAt: '2026-08-24T12:00:00Z' });
    const money = await typed(moneyDefinitionId, { moneyAmount: '1500000', moneyCurrency: 'HUF', observedAt: '2026-08-24T12:00:00Z' });
    const period = await typed(periodDefinitionId, { jsonValue: { end: '2026-12-31', start: '2026-01-01' }, referencePeriodStart: '2026-01-01', referencePeriodEnd: '2026-12-31' });
    const multi = await typed(multiEnumDefinitionId, { jsonValue: ['C', 'A', 'A'], observedAt: '2026-08-24T12:00:00Z' });
    const rows = await db.clientFact.findMany({ where: { id: { in: [number.id, enumFact.id, money.id, period.id, multi.id] } } });
    expect(rows.find((row) => row.id === number.id)?.numberValue?.toString()).toBe('12.5');
    expect(rows.find((row) => row.id === money.id)?.value).toBe('1500000 HUF');
    expect(rows.find((row) => row.id === multi.id)?.value).toBe('["A","C"]');
    await expect(typed(enumDefinitionId, { enumValue: 'Z', observedAt: '2026-08-24T12:00:00Z' })).rejects.toMatchObject({ code: 'COMPLIANCE_FACT_VALUE_INVALID' });
    await expect(typed(moneyDefinitionId, { moneyAmount: 1, moneyCurrency: 'US', observedAt: '2026-08-24T12:00:00Z' })).rejects.toMatchObject({ code: 'COMPLIANCE_FACT_VALUE_INVALID' });
    await expect(typed(numberDefinitionId, { numberValue: 1, stringValue: 'wrong' })).rejects.toMatchObject({ code: 'COMPLIANCE_FACT_VALUE_INVALID' });
    expect(period).toBeDefined();
  });

  it('enforces company and subject scope ownership and keeps subjects isolated', async () => {
    await expect(typed(employeeDefinitionId, { booleanValue: true, observedAt: '2026-08-24T12:00:00Z' }, { factSubjectId: null, scopeType: 'EMPLOYEE' })).rejects.toMatchObject({ code: 'COMPLIANCE_FACT_VALUE_INVALID' });
    await expect(typed(boolDefinitionId, { booleanValue: true, observedAt: '2026-08-24T12:00:00Z' }, { factSubjectId: employeeSubjectA })).rejects.toMatchObject({ code: 'COMPLIANCE_FACT_VALUE_INVALID' });
    await expect(createFact(actor, clientA, { factDefinitionId: employeeDefinitionId, scopeType: 'EMPLOYEE', factSubjectId: employeeSubjectB, booleanValue: true, observedAt: '2026-08-24T12:00:00Z' }, db)).rejects.toMatchObject({ code: 'COMPLIANCE_FACT_VALUE_INVALID' });
    await expect(createFact(actor, clientA, { factDefinitionId: employeeDefinitionId, scopeType: 'CONTRACT', factSubjectId: contractSubjectA, booleanValue: true, observedAt: '2026-08-24T12:00:00Z' }, db)).rejects.toMatchObject({ code: 'COMPLIANCE_FACT_VALUE_INVALID' });
    const employee = await createFact(actor, clientA, { factDefinitionId: employeeDefinitionId, scopeType: 'EMPLOYEE', factSubjectId: employeeSubjectA, booleanValue: true, observedAt: '2026-08-24T12:00:00Z' }, db);
    expect(employee.factSubjectId).toBe(employeeSubjectA);
  });

  it('materializes subject-scoped findings only for the mutated subject', async () => {
    const { requirement } = await createBooleanRule('employee-scope', `seven_d_employee_${suffix}`, { scopeType: 'EMPLOYEE' });
    const first = await createFact(actor, clientA, { factDefinitionId: employeeDefinitionId, scopeType: 'EMPLOYEE', factSubjectId: employeeSubjectA, booleanValue: true, observedAt: '2026-08-24T12:00:00Z' }, db);
    expect(first.factSubjectId).toBe(employeeSubjectA);
    const findingsAfterFirst = await db.assessmentFinding.findMany({ where: { clientId: clientA, requirementId: requirement.id } });
    expect(findingsAfterFirst).toHaveLength(1);
    expect(findingsAfterFirst[0].scopeType).toBe('EMPLOYEE');
    expect(findingsAfterFirst[0].factSubjectId).toBe(employeeSubjectA);

    await createFact(actor, clientA, { factDefinitionId: employeeDefinitionId, scopeType: 'EMPLOYEE', factSubjectId: employeeSubjectC, booleanValue: true, observedAt: '2026-08-24T13:00:00Z' }, db);
    const findingsAfterSecond = await db.assessmentFinding.findMany({ where: { clientId: clientA, requirementId: requirement.id }, orderBy: { factSubjectId: 'asc' } });
    expect(findingsAfterSecond.map((finding) => finding.factSubjectId).sort()).toEqual([employeeSubjectA, employeeSubjectC].sort());
  });

  it('stores typed facts without triggering compliance while the client is not enrolled', async () => {
    await createBooleanRule('enrollment-gate', `seven_d_enrollment_${suffix}`);
    await db.clientOperatingProfile.update({ where: { clientId: clientA }, data: { complianceEnrollmentStatus: 'SUSPENDED' } });
    const suspended = await createFact(actor, clientA, { factDefinitionId: enrollmentDefinitionId, scopeType: 'COMPANY', booleanValue: true, observedAt: '2026-08-24T12:00:00Z' }, db);
    expect(suspended.factDefinitionId).toBe(enrollmentDefinitionId);
    expect(await db.requirementApplicability.count({ where: { clientId: clientA, facts: { some: { clientFactId: suspended.id } } } })).toBe(0);
    await db.clientOperatingProfile.update({ where: { clientId: clientA }, data: { complianceEnrollmentStatus: 'ENROLLED' } });
    const enrolled = await createFact(actor, clientA, { factDefinitionId: enrollmentDefinitionId, scopeType: 'COMPANY', booleanValue: true, observedAt: '2026-08-24T13:00:00Z' }, db);
    expect(await db.requirementApplicability.count({ where: { clientId: clientA, facts: { some: { clientFactId: enrolled.id } } } })).toBe(1);
  });

  it('keeps bare clients and NOT_ENROLLED profiles non-evaluable while enrolled profiles evaluate', async () => {
    const { requirement, version } = await createBooleanRule('enrollment-states', `seven_d_enrollment_state_${suffix}`);
    const bare = await createFact(actor, clientB, { factDefinitionId: enrollmentStateDefinitionId, scopeType: 'COMPANY', booleanValue: true, observedAt: '2026-08-24T14:00:00Z' }, db);
    expect(await db.requirementApplicability.count({ where: { clientId: clientB, facts: { some: { clientFactId: bare.id } } } })).toBe(0);

    await db.clientOperatingProfile.create({ data: { clientId: clientB, complianceEnrollmentStatus: 'NOT_ENROLLED' } });
    const notEnrolled = await createFact(actor, clientB, { factDefinitionId: enrollmentStateDefinitionId, scopeType: 'COMPANY', booleanValue: true, observedAt: '2026-08-24T15:00:00Z' }, db);
    expect(await db.requirementApplicability.count({ where: { clientId: clientB, facts: { some: { clientFactId: notEnrolled.id } } } })).toBe(0);

    await db.clientOperatingProfile.update({ where: { clientId: clientB }, data: { complianceEnrollmentStatus: 'SUSPENDED' } });
    const suspended = await createFact(actor, clientB, { factDefinitionId: enrollmentStateDefinitionId, scopeType: 'COMPANY', booleanValue: true, observedAt: '2026-08-24T16:00:00Z' }, db);
    expect(await db.requirementApplicability.count({ where: { clientId: clientB, facts: { some: { clientFactId: suspended.id } } } })).toBe(0);

    await db.clientOperatingProfile.update({ where: { clientId: clientB }, data: { complianceEnrollmentStatus: 'ENROLLED' } });
    const enrolled = await createFact(actor, clientB, { factDefinitionId: enrollmentStateDefinitionId, scopeType: 'COMPANY', booleanValue: true, observedAt: '2026-08-24T17:00:00Z' }, db);
    expect(await db.requirementApplicability.count({ where: { clientId: clientB, facts: { some: { clientFactId: enrolled.id } } } })).toBe(1);
    expect(requirement.id).toBeDefined();
    await db.assessmentFinding.deleteMany({ where: { clientId: clientB, requirementId: requirement.id } });
    await db.requirementApplicability.deleteMany({ where: { clientId: clientB, requirementVersionId: version.id } });
  });

  it('evaluates only the approved requirement version effective at evaluationAt', async () => {
    const requirement = await createRequirement({ key: `REQ_7D_TEMPORAL_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    requirementIds.push(requirement.id);
    const firstVersion = await createRequirementVersion({
      requirementId: requirement.id,
      versionKey: 'V2026',
      title: 'Temporal 2026',
      normativeStatement: 'Temporal 2026 statement',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: new Date('2027-01-01T00:00:00Z'),
      sourceSupportState: 'SUFFICIENT',
      db,
    });
    const secondVersion = await createRequirementVersion({
      requirementId: requirement.id,
      versionKey: 'V2027',
      title: 'Temporal 2027',
      normativeStatement: 'Temporal 2027 statement',
      effectiveFrom: new Date('2027-01-01T00:00:00Z'),
      sourceSupportState: 'SUFFICIENT',
      db,
    });
    versionIds.push(firstVersion.id, secondVersion.id);
    await addRequirementCitation({ requirementVersionId: firstVersion.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await addRequirementCitation({ requirementVersionId: secondVersion.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(firstVersion.id, actorId, db);
    await approveRequirementVersion(secondVersion.id, actorId, db);
    const firstRule = await createApplicabilityRuleVersion({ requirementVersionId: firstVersion.id, ruleVersionKey: 'R1', astJson: ast(`seven_d_temporal_${suffix}`), evaluationScopeType: 'COMPANY', db });
    const secondRule = await createApplicabilityRuleVersion({ requirementVersionId: secondVersion.id, ruleVersionKey: 'R1', astJson: ast(`seven_d_temporal_${suffix}`), evaluationScopeType: 'COMPANY', db });
    ruleIds.push(firstRule.id, secondRule.id);
    await approveApplicabilityRuleVersion(firstRule.id, actorId, db);
    await approveApplicabilityRuleVersion(secondRule.id, actorId, db);

    await createFact(actor, clientA, { factDefinitionId: temporalDefinitionId, scopeType: 'COMPANY', booleanValue: true, observedAt: '2026-08-24T12:00:00Z', validFrom: '2026-08-24T12:00:00Z', evaluationAt: '2026-08-24T12:00:00Z' }, db);
    await createFact(actor, clientA, { factDefinitionId: temporalDefinitionId, scopeType: 'COMPANY', booleanValue: true, observedAt: '2027-08-24T12:00:00Z', validFrom: '2027-08-24T12:00:00Z', evaluationAt: '2027-08-24T12:00:00Z' }, db);
    expect(await db.requirementApplicability.count({ where: { clientId: clientA, requirementVersionId: firstVersion.id } })).toBe(1);
    expect(await db.requirementApplicability.count({ where: { clientId: clientA, requirementVersionId: secondVersion.id } })).toBe(1);
  });

  it('leaves legacy facts non-evaluable and does not scan unrelated definitions', async () => {
    const before = await db.requirementApplicability.count({ where: { clientId: clientA } });
    const legacy = await createFact(actor, clientA, { type: 'EMPLOYEE_COUNT', value: '42' }, db);
    expect(legacy.factDefinitionId).toBeNull();
    const unrelated = await typed(enumDefinitionId, { enumValue: 'B', observedAt: '2026-08-24T12:00:00Z' });
    expect(unrelated.factDefinitionId).toBe(enumDefinitionId);
    expect(await db.requirementApplicability.count({ where: { clientId: clientA } })).toBe(before);
  });

  it('allows equal values with provenance, records conflicts, and rejects DISALLOW overlap', async () => {
    const first = await typed(boolDefinitionId, { booleanValue: true, observedAt: '2026-08-24T13:00:00Z' });
    const second = await typed(boolDefinitionId, { booleanValue: true, observedAt: '2026-08-24T14:00:00Z' });
    expect(first.id).not.toBe(second.id);
    const equalSnapshots = await db.requirementApplicability.count({ where: { clientId: clientA, requirementVersionId: versionIds[0] } });
    expect(equalSnapshots).toBeGreaterThanOrEqual(2);
    await typed(boolDefinitionId, { booleanValue: false, observedAt: '2026-08-24T15:00:00Z' });
    const latest = await db.assessmentFinding.findFirstOrThrow({ where: { clientId: clientA, requirementId: requirementIds[0] } });
    expect(latest.applicabilityOutcome).toBe('INSUFFICIENT_FACTS');
    await typed(numberDefinitionId, { numberValue: 1, validFrom: '2040-08-01', validTo: '2040-09-01' });
    await expect(typed(numberDefinitionId, { numberValue: 2, validFrom: '2040-08-15', validTo: '2040-08-20' })).rejects.toMatchObject({ code: 'FACT_OVERLAP_CONFLICT' });
  });

  it('deduplicates logical applicability when only evaluationAt changes', async () => {
    await db.clientFact.deleteMany({ where: { clientId: clientA, factDefinitionId: boolDefinitionId } });
    await typed(boolDefinitionId, { booleanValue: true, validFrom: '2026-08-24T18:00:00Z', observedAt: '2026-08-24T19:00:00Z' });
    const before = await db.requirementApplicability.count({ where: { clientId: clientA, requirementVersionId: versionIds[0] } });
    const one = await createRequirementApplicability({ requirementVersionId: versionIds[0], ruleVersionId: ruleIds[0], clientId: clientA, scope: { scopeType: 'COMPANY', evaluationAt: new Date('2026-08-24T20:00:00Z') } }, db);
    const two = await createRequirementApplicability({ requirementVersionId: versionIds[0], ruleVersionId: ruleIds[0], clientId: clientA, scope: { scopeType: 'COMPANY', evaluationAt: new Date('2026-08-24T21:00:00Z') } }, db);
    expect(two.applicability.id).toBe(one.applicability.id);
    expect(await db.requirementApplicability.count({ where: { clientId: clientA, requirementVersionId: versionIds[0] } })).toBe(before);
  });

  it('rolls the fact back when evaluator or finding persistence fails', async () => {
    const ruleId = ruleIds[0];
    await db.clientFact.deleteMany({ where: { clientId: clientA, factDefinitionId: boolDefinitionId } });
    const original = await db.applicabilityRuleVersion.findUniqueOrThrow({ where: { id: ruleId }, select: { astJson: true } });
    await db.applicabilityRuleVersion.update({ where: { id: ruleId }, data: { astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'INVALID' } } } });
    const beforeEvaluator = await db.clientFact.count({ where: { clientId: clientA, factDefinitionId: boolDefinitionId } });
    await expect(typed(boolDefinitionId, { booleanValue: true, observedAt: '2026-08-24T10:00:00Z' })).rejects.toThrow();
    expect(await db.clientFact.count({ where: { clientId: clientA, factDefinitionId: boolDefinitionId } })).toBe(beforeEvaluator);
    await db.applicabilityRuleVersion.update({ where: { id: ruleId }, data: { astJson: original.astJson as never } });
    const beforeFinding = await db.clientFact.count({ where: { clientId: clientA, factDefinitionId: boolDefinitionId } });
    await createBooleanRule('finding-failure', `seven_d_boolean_${suffix}`);
    await expect(createTypedFactAndEvaluate({ clientId: clientA, factDefinitionId: boolDefinitionId, actorUserId: crypto.randomUUID(), input: { scopeType: 'COMPANY', booleanValue: true, observedAt: '2026-08-24T10:00:00Z' } }, db)).rejects.toThrow();
    expect(await db.clientFact.count({ where: { clientId: clientA, factDefinitionId: boolDefinitionId } })).toBe(beforeFinding);
  });

  it('puts legacy approved null-scope rules in mandatory review while evaluation remains fail closed', async () => {
    const { requirement, version, rule } = await createBooleanRule('legacy-scope-review', `seven_d_enrollment_${suffix}`);
    await db.applicabilityRuleVersion.update({ where: { id: rule.id }, data: { evaluationScopeType: null } });

    await expect(db.$transaction((tx) => resolveEffectiveRequirementRuleVersion(requirement.id, new Date('2026-08-24T12:00:00Z'), tx)))
      .rejects.toMatchObject({ code: 'RULE_SCOPE_UNRESOLVED' });
    await expect(listUnresolvedRuleScopes(actor, db)).resolves.toContainEqual({
      requirementVersionId: version.id,
      ruleVersionId: rule.id,
      reason: 'RULE_SCOPE_UNRESOLVED',
    });
    await expect(listUnresolvedRuleScopes({ userId: actorId, role: 'LAWYER' }, db))
      .rejects.toMatchObject({ code: 'COMPLIANCE_DIAGNOSTICS_FORBIDDEN' });
  });

  it('rejects concurrent DISALLOW writes with one winner and keeps clients isolated', async () => {
    const dbA = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const dbB = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const results = await Promise.allSettled([
      createTypedFactAndEvaluate({ clientId: clientB, factDefinitionId: numberDefinitionId, actorUserId: actorId, input: { scopeType: 'COMPANY', numberValue: 5, validFrom: '2050-01-01', validTo: '2050-02-01' } }, dbA),
      createTypedFactAndEvaluate({ clientId: clientB, factDefinitionId: numberDefinitionId, actorUserId: actorId, input: { scopeType: 'COMPANY', numberValue: 6, validFrom: '2050-01-01', validTo: '2050-02-01' } }, dbB),
    ]);
    await dbA.$disconnect();
    await dbB.$disconnect();
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await db.clientFact.count({ where: { clientId: clientB, factDefinitionId: numberDefinitionId } })).toBe(1);
    expect(await db.assessmentFinding.count({ where: { clientId: clientB } })).toBe(0);
  });
});
