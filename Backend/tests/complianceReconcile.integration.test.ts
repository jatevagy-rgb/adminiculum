import crypto from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { reconcileClientCompliance } from '../src/modules/compliance/complianceReconcileService';
import {
  createRequirement,
  createRequirementVersion,
  addRequirementCitation,
  createApplicabilityRuleVersion,
  approveRequirementVersion,
  approveApplicabilityRuleVersion,
  supersedeRequirementVersion,
  supersedeApplicabilityRuleVersion,
} from '../src/modules/compliance/requirementRuleService';

const databaseUrl = process.env.RECONCILE_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Compliance reconciliation — initial/backfill evaluation (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `RC_${suffix}`;
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const clientC = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const boolDefId = crypto.randomUUID();
  const numberDefId = crypto.randomUUID();
  const missingDefId = crypto.randomUUID();
  const employeeDefId = crypto.randomUUID();
  const employeeSubjectId = crypto.randomUUID();
  const requirementIds: string[] = [];
  const versionIds: string[] = [];
  const ruleIds: string[] = [];
  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };

  const ast = (factKey: string, expected: unknown = true, valueType = 'boolean') => ({
    schemaVersion: 'rule-ast/v1',
    node: { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey }, right: { kind: 'LITERAL', valueType, value: expected } },
  });

  async function approvedRule(name: string, factKey: string, options: { scopeType?: 'COMPANY' | 'EMPLOYEE'; expected?: unknown; valueType?: string } = {}) {
    const requirement = await createRequirement({ key: `REQ_RC_${name}_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    requirementIds.push(requirement.id);
    const version = await createRequirementVersion({
      requirementId: requirement.id, versionKey: 'V1', title: `RC ${name}`, normativeStatement: `RC normative ${name}`,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db,
    });
    versionIds.push(version.id);
    await addRequirementCitation({ requirementVersionId: version.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(version.id, adminId, db);
    const rule = await createApplicabilityRuleVersion({
      requirementVersionId: version.id, ruleVersionKey: 'R1',
      astJson: ast(factKey, options.expected ?? true, options.valueType ?? 'boolean'),
      evaluationScopeType: (options.scopeType ?? 'COMPANY') as never, db,
    });
    ruleIds.push(rule.id);
    await approveApplicabilityRuleVersion(rule.id, adminId, db);
    return { requirement, version, rule };
  }

  async function seedCompanyFact(clientId: string, definitionId: string, key: string, fields: { booleanValue?: boolean; numberValue?: number }) {
    const id = crypto.randomUUID();
    await db.clientFact.create({ data: {
      id, clientId, type: key, value: String(fields.numberValue ?? fields.booleanValue ?? 'x'), validFrom: new Date('2026-01-01T00:00:00Z'),
      factDefinitionId: definitionId, scopeType: 'COMPANY', observedAt: new Date('2026-01-01T00:00:00Z'),
      verificationStatus: 'CLIENT_PROVIDED', determinationMethod: 'USER_PROVIDED',
      booleanValue: fields.booleanValue,
      numberValue: fields.numberValue !== undefined ? new Prisma.Decimal(String(fields.numberValue)) : undefined,
    } });
    return id;
  }

  // Assertions are always scoped to the requirement versions created inside a
  // single test: rules accumulate across the suite and the shared CI database
  // may hold requirements left by other suites.
  const applicabilitiesFor = (clientId: string, vIds: string[]) =>
    db.requirementApplicability.findMany({ where: { clientId, requirementVersionId: { in: vIds } }, select: { id: true, outcome: true, requirementVersionId: true, ruleVersionId: true } });
  const findingsFor = (clientId: string, rIds: string[]) =>
    db.assessmentFinding.findMany({ where: { clientId, requirementId: { in: rIds } }, select: { id: true, status: true, requirementId: true } });

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Reconcile test domain' } });
    await db.client.createMany({ data: [{ id: clientA, name: `RC Client A ${suffix}` }, { id: clientB, name: `RC Client B ${suffix}` }, { id: clientC, name: `RC Client C ${suffix}` }] });
    await db.clientOperatingProfile.createMany({ data: [
      { clientId: clientA, complianceEnrollmentStatus: 'ENROLLED' },
      { clientId: clientB, complianceEnrollmentStatus: 'ENROLLED' },
      { clientId: clientC, complianceEnrollmentStatus: 'NOT_ENROLLED' },
    ] });
    await db.user.createMany({ data: [
      { id: adminId, email: `rc-admin-${suffix}@example.invalid`, name: 'RC Admin', role: 'ADMIN' },
      { id: lawyerId, email: `rc-lawyer-${suffix}@example.invalid`, name: 'RC Lawyer', role: 'LAWYER' },
    ] });
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `rc-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED' } });
    await db.legalSourceVersion.create({ data: { id: sourceVersionId, legalSourceId: sourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } });
    await db.factDefinition.createMany({ data: [
      { id: boolDefId, key: `rc_bool_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: numberDefId, key: `rc_number_${suffix}`, domainCode, valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: missingDefId, key: `rc_missing_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: employeeDefId, key: `rc_employee_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['EMPLOYEE'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
    ] });
    await db.factSubject.create({ data: { id: employeeSubjectId, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-${suffix}` } });
  });

  // Full per-test teardown of the requirement chain keeps every test isolated:
  // reconciliation enumerates the whole approved corpus, so a requirement left
  // over from an earlier test would be evaluated again and would pollute the
  // count assertions of later tests.
  afterEach(async () => {
    await db.assessmentFinding.deleteMany({ where: { clientId: { in: [clientA, clientB, clientC] } } });
    await db.requirementApplicabilityFact.deleteMany({ where: { applicability: { clientId: { in: [clientA, clientB, clientC] } } } });
    await db.requirementApplicability.deleteMany({ where: { clientId: { in: [clientA, clientB, clientC] } } });
    await db.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB, clientC] } } });
    await db.applicabilityRuleVersion.updateMany({ where: { id: { in: ruleIds } }, data: { supersededById: null } });
    await db.requirementVersion.updateMany({ where: { id: { in: versionIds } }, data: { supersededById: null } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: ruleIds } } });
    await db.requirementCitation.deleteMany({ where: { requirementVersionId: { in: versionIds } } });
    await db.requirementVersion.deleteMany({ where: { id: { in: versionIds } } });
    await db.requirement.deleteMany({ where: { id: { in: requirementIds } } });
    requirementIds.length = 0;
    versionIds.length = 0;
    ruleIds.length = 0;
  });

  afterAll(async () => {
    await db.assessmentFinding.deleteMany({ where: { clientId: { in: [clientA, clientB, clientC] } } });
    await db.requirementApplicabilityFact.deleteMany({ where: { applicability: { clientId: { in: [clientA, clientB, clientC] } } } });
    await db.requirementApplicability.deleteMany({ where: { clientId: { in: [clientA, clientB, clientC] } } });
    await db.requirementCitation.deleteMany({ where: { requirementVersionId: { in: versionIds } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: ruleIds } } });
    await db.requirementVersion.deleteMany({ where: { id: { in: versionIds } } });
    await db.requirement.deleteMany({ where: { id: { in: requirementIds } } });
    await db.factSubject.deleteMany({ where: { id: employeeSubjectId } });
    await db.factDefinition.deleteMany({ where: { id: { in: [boolDefId, numberDefId, missingDefId, employeeDefId] } } });
    await db.legalSourceVersion.deleteMany({ where: { id: sourceVersionId } });
    await db.legalSource.deleteMany({ where: { id: sourceId } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId: { in: [clientA, clientB, clientC] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB, clientC] } } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.$disconnect();
  });

  it('A: backfills a real current snapshot for an enrolled client with a pre-existing fact', async () => {
    const { version } = await approvedRule('applies', `rc_bool_${suffix}`, { expected: true });
    await seedCompanyFact(clientA, boolDefId, `rc_bool_${suffix}`, { booleanValue: true });
    const result = await reconcileClientCompliance(admin, clientA, db);
    expect(result.enrolled).toBe(true);
    const rows = await applicabilitiesFor(clientA, [version.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'APPLIES', requirementVersionId: version.id });
    expect(result.snapshotsCreated).toBeGreaterThanOrEqual(1);
  });

  it('B: DOES_NOT_APPLY produces a snapshot but never fabricates a finding', async () => {
    const { requirement, version } = await approvedRule('doesnotapply', `rc_bool_${suffix}`, { expected: true });
    await seedCompanyFact(clientA, boolDefId, `rc_bool_${suffix}`, { booleanValue: false });
    const result = await reconcileClientCompliance(admin, clientA, db);
    const rows = await applicabilitiesFor(clientA, [version.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('DOES_NOT_APPLY');
    // Requirement-scoped: no finding is fabricated for a DOES_NOT_APPLY verdict.
    expect(await findingsFor(clientA, [requirement.id])).toHaveLength(0);
    expect(result.evaluated).toBeGreaterThanOrEqual(1);
  });

  it('C: APPLIES flows through the existing finding materialization', async () => {
    const { requirement, version } = await approvedRule('finding', `rc_bool_${suffix}`, { expected: true });
    await seedCompanyFact(clientA, boolDefId, `rc_bool_${suffix}`, { booleanValue: true });
    await reconcileClientCompliance(admin, clientA, db);
    const findings = await findingsFor(clientA, [requirement.id]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ requirementId: requirement.id, status: 'OPEN' });
  });

  it('D: a missing required fact produces a truthful INSUFFICIENT_FACTS state', async () => {
    const { version } = await approvedRule('missing', `rc_missing_${suffix}`);
    await reconcileClientCompliance(admin, clientA, db);
    const rows = await applicabilitiesFor(clientA, [version.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('INSUFFICIENT_FACTS');
    const row = await db.requirementApplicability.findFirstOrThrow({ where: { id: rows[0].id }, select: { snapshotJson: true } });
    expect((row.snapshotJson as { missingFactKeys?: string[] }).missingFactKeys).toEqual([`rc_missing_${suffix}`]);
  });

  it('E: repeated reconciliation on unchanged state deduplicates and never duplicates findings', async () => {
    const { requirement, version } = await approvedRule('idem', `rc_bool_${suffix}`, { expected: true });
    await seedCompanyFact(clientA, boolDefId, `rc_bool_${suffix}`, { booleanValue: true });
    const first = await reconcileClientCompliance(admin, clientA, db);
    const second = await reconcileClientCompliance(admin, clientA, db);
    expect(first.snapshotsCreated).toBeGreaterThanOrEqual(1);
    expect(second.snapshotsCreated).toBe(0);
    expect(second.snapshotsDeduplicated).toBeGreaterThanOrEqual(1);
    expect(second.findingsCreated).toBe(0);
    expect(await applicabilitiesFor(clientA, [version.id])).toHaveLength(1);
    expect(await findingsFor(clientA, [requirement.id])).toHaveLength(1);
  });

  it('F: superseded requirement versions and superseded rules are not evaluated as current', async () => {
    // Supersession is constrained to the same requirement/rule family by a
    // composite FK — use the canonical supersession services.
    const requirement = await createRequirement({ key: `REQ_RC_sup_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    requirementIds.push(requirement.id);
    const oldVersion = await createRequirementVersion({
      requirementId: requirement.id, versionKey: 'V1', title: 'RC sup old', normativeStatement: 'old wording',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db,
    });
    const newVersion = await createRequirementVersion({
      requirementId: requirement.id, versionKey: 'V2', title: 'RC sup new', normativeStatement: 'new wording',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db,
    });
    versionIds.push(oldVersion.id, newVersion.id);
    await addRequirementCitation({ requirementVersionId: oldVersion.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await addRequirementCitation({ requirementVersionId: newVersion.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(oldVersion.id, adminId, db);
    await supersedeRequirementVersion(oldVersion.id, newVersion.id, db);
    await approveRequirementVersion(newVersion.id, adminId, db);
    const supersededRule = await createApplicabilityRuleVersion({ requirementVersionId: newVersion.id, ruleVersionKey: 'R0', astJson: ast(`rc_number_${suffix}`, 5, 'number'), evaluationScopeType: 'COMPANY' as never, db });
    const currentRule = await createApplicabilityRuleVersion({ requirementVersionId: newVersion.id, ruleVersionKey: 'R1', astJson: ast(`rc_number_${suffix}`, 10, 'number'), evaluationScopeType: 'COMPANY' as never, db });
    ruleIds.push(supersededRule.id, currentRule.id);
    await approveApplicabilityRuleVersion(supersededRule.id, adminId, db);
    await approveApplicabilityRuleVersion(currentRule.id, adminId, db);
    await supersedeApplicabilityRuleVersion(supersededRule.id, currentRule.id, db);
    await seedCompanyFact(clientA, numberDefId, `rc_number_${suffix}`, { numberValue: 10 });
    await reconcileClientCompliance(admin, clientA, db);
    const rows = await applicabilitiesFor(clientA, [oldVersion.id, newVersion.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].requirementVersionId).toBe(newVersion.id);
    expect(rows[0].ruleVersionId).toBe(currentRule.id);
  });

  it('G: reconciliation is strictly scoped to the requested client', async () => {
    const { version } = await approvedRule('isolation', `rc_bool_${suffix}`, { expected: true });
    await seedCompanyFact(clientA, boolDefId, `rc_bool_${suffix}`, { booleanValue: true });
    await reconcileClientCompliance(admin, clientA, db);
    expect(await applicabilitiesFor(clientA, [version.id])).toHaveLength(1);
    expect(await applicabilitiesFor(clientB, [version.id])).toHaveLength(0);
    await reconcileClientCompliance(admin, clientB, db);
    const bRows = await applicabilitiesFor(clientB, [version.id]);
    expect(bRows).toHaveLength(1);
    expect(bRows[0].outcome).toBe('INSUFFICIENT_FACTS');
  });

  it('H: unauthorized actors are rejected and non-enrolled clients no-op', async () => {
    await approvedRule('authz', `rc_bool_${suffix}`, { expected: true });
    await expect(reconcileClientCompliance(lawyer, clientA, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    const notEnrolled = await reconcileClientCompliance(admin, clientC, db);
    expect(notEnrolled).toMatchObject({ enrolled: false, evaluated: 0 });
    expect(await db.requirementApplicability.count({ where: { clientId: clientC } })).toBe(0);
  });

  it('I: reconciliation never creates, updates, or supersedes ClientFact rows', async () => {
    await approvedRule('factsafe', `rc_bool_${suffix}`, { expected: true });
    const factId = await seedCompanyFact(clientA, boolDefId, `rc_bool_${suffix}`, { booleanValue: true });
    const before = await db.clientFact.findMany({ where: { clientId: clientA }, select: { id: true, updatedAt: true, supersededAt: true } });
    await reconcileClientCompliance(admin, clientA, db);
    const after = await db.clientFact.findMany({ where: { clientId: clientA }, select: { id: true, updatedAt: true, supersededAt: true } });
    expect(after).toEqual(before);
    expect(after.map((row) => row.id)).toEqual([factId]);
  });

  it('J: subject-scoped rules evaluate per existing subject and are skipped with none', async () => {
    const { version } = await approvedRule('employeesubject', `rc_employee_${suffix}`, { scopeType: 'EMPLOYEE' });
    await reconcileClientCompliance(admin, clientA, db);
    const rows = await applicabilitiesFor(clientA, [version.id]);
    expect(rows).toHaveLength(1);
    // Client B is enrolled but has no EMPLOYEE subject: no subject-less verdict is fabricated.
    await reconcileClientCompliance(admin, clientB, db);
    expect(await applicabilitiesFor(clientB, [version.id])).toHaveLength(0);
  });
});
