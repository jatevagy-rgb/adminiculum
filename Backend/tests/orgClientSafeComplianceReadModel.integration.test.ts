import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getClientSafeComplianceReadModel } from '../src/modules/compliance/clientSafeComplianceService';

const databaseUrl = process.env.PHASE7CB_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Org client safe compliance read model (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `ORGSafe_${suffix}`;
  const adminId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const subjectCompanyA = crypto.randomUUID();
  const subjectEmployeeA = crypto.randomUUID();
  const applicabilityIds: string[] = [];
  const findingIds: string[] = [];
  const admin = { userId: adminId, role: 'ADMIN' };

  async function createApplicability(outcome: string, scopeType = 'COMPANY') {
    const id = crypto.randomUUID();
    applicabilityIds.push(id);
    await db.requirementApplicability.create({
      data: {
        id,
        clientId: clientA,
        requirementVersionId: versionId,
        ruleVersionId: ruleId,
        ruleDigest: 'a'.repeat(64),
        outcome: outcome as never,
        scopeType: scopeType as never,
        evaluationAt: new Date(),
        sourceSupportState: 'SUFFICIENT',
        specialistRequirement: 'NONE',
        schemaVersion: 'phase6-requirement-applicability/v1',
        snapshotJson: { internal: true },
        snapshotDigest: 'b'.repeat(64),
      },
    });
    return id;
  }

  async function createFinding(input: { applicabilityId?: string; scopeType?: string; status?: string; title?: string; clientId?: string }) {
    const id = crypto.randomUUID();
    findingIds.push(id);
    await db.assessmentFinding.create({
      data: {
        id,
        clientId: input.clientId || clientA,
        title: input.title || `Finding ${id}`,
        description: 'Description',
        status: (input.status || 'OPEN') as never,
        severity: 'HIGH',
        createdByUserId: adminId,
        ...(input.applicabilityId
          ? { requirementId, requirementApplicabilityId: input.applicabilityId, scopeType: (input.scopeType || 'COMPANY') as never }
          : { scopeType: (input.scopeType || 'COMPANY') as never }),
      },
    });
    return id;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Org Safe Test' } });
    await db.user.create({ data: { id: adminId, email: `orgsafe-admin-${suffix}@example.invalid`, name: 'OrgSafe Admin', role: 'ADMIN' } });
    await db.client.createMany({ data: [{ id: clientA, name: `OrgSafe Client A ${suffix}` }, { id: clientB, name: `OrgSafe Client B ${suffix}` }] });
    await db.factSubject.createMany({
      data: [
        { id: subjectCompanyA, clientId: clientA, scopeType: 'COMPANY', subjectKey: `company-${suffix}`, displayLabel: 'Teszt Vállalat' },
        { id: subjectEmployeeA, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-${suffix}`, displayLabel: 'Minta Munkavállaló' },
      ],
    });
    await db.requirement.create({ data: { id: requirementId, key: `GDPR_DATA_PROCESSING`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({
      data: {
        id: versionId,
        requirementId,
        versionKey: 'V1',
        title: 'Adatvédelmi feldolgozás',
        normativeStatement: 'Test normative',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      },
    });
    await db.applicabilityRuleVersion.create({
      data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: 'c'.repeat(64) },
    });
  });

  afterAll(async () => {
    await db.assessmentFinding.deleteMany({ where: { id: { in: findingIds } } });
    await db.requirementApplicability.deleteMany({ where: { id: { in: applicabilityIds } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: ruleId } });
    await db.requirementVersion.deleteMany({ where: { id: versionId } });
    await db.requirement.deleteMany({ where: { id: requirementId } });
    await db.factSubject.deleteMany({ where: { id: { in: [subjectCompanyA, subjectEmployeeA] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.user.deleteMany({ where: { id: adminId } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.$disconnect();
  });

  it('returns configured COMPANY finding as safe DTO', async () => {
    const applicabilityId = await createApplicability('APPLIES');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, db);
    expect(result.topics.length).toBeGreaterThanOrEqual(1);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('REVIEW_RECOMMENDED');
    expect(topic!.missingInformation).toEqual([]);
    expect(topic!.topicId).toBe(applicabilityId);
  });

  it('omits manual findings not linked to an applicability', async () => {
    await createFinding({ title: 'Kézi megállapítás', scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, db);
    const manual = result.topics.find((t) => t.topicLabel === 'Kézi megállapítás');
    expect(manual).toBeUndefined();
  });

  it('omits DOES_NOT_APPLY findings', async () => {
    const applicabilityId = await createApplicability('DOES_NOT_APPLY');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, db);
    const topic = result.topics.find((t) => t.topicId === applicabilityId);
    expect(topic).toBeUndefined();
  });

  it('omits EMPLOYEE scope findings (COMPANY scope only)', async () => {
    const applicabilityId = await createApplicability('APPLIES', 'EMPLOYEE');
    await createFinding({ applicabilityId, scopeType: 'EMPLOYEE' });
    const result = await getClientSafeComplianceReadModel(clientA, true, db);
    const topic = result.topics.find((t) => t.topicId === applicabilityId);
    expect(topic).toBeUndefined();
  });

  it('maps INSUFFICIENT_FACTS to MORE_INFORMATION_NEEDED', async () => {
    const applicabilityId = await createApplicability('INSUFFICIENT_FACTS');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, db);
    const topic = result.topics.find((t) => t.topicId === applicabilityId);
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('MORE_INFORMATION_NEEDED');
    expect(topic!.nextAction).toContain('hiányzó információkat');
  });

  it('maps LEGAL_REVIEW_REQUIRED to LAWYER_REVIEW_REQUIRED', async () => {
    const applicabilityId = await createApplicability('LEGAL_REVIEW_REQUIRED');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, db);
    const topic = result.topics.find((t) => t.topicId === applicabilityId);
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('LAWYER_REVIEW_REQUIRED');
    expect(topic!.nextAction).toContain('Ügyvédünk');
  });

  it('omits DEMO topics in production mode', async () => {
    const demoReqId = crypto.randomUUID();
    const demoVersionId = crypto.randomUUID();
    const demoRuleId = crypto.randomUUID();
    const demoApplicabilityId = crypto.randomUUID();
    const demoFindingId = crypto.randomUUID();
    try {
      await db.requirement.create({ data: { id: demoReqId, key: 'DEMO_SAMPLE_TOPIC', jurisdictionCode: 'HU', domainCode } });
      await db.requirementVersion.create({
        data: { id: demoVersionId, requirementId: demoReqId, versionKey: 'V1', title: 'Demó', normativeStatement: 'Demo', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
      });
      await db.applicabilityRuleVersion.create({
        data: { id: demoRuleId, requirementVersionId: demoVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: 'd'.repeat(64) },
      });
      await db.requirementApplicability.create({
        data: {
          id: demoApplicabilityId, clientId: clientA, requirementVersionId: demoVersionId, ruleVersionId: demoRuleId,
          ruleDigest: 'e'.repeat(64), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(),
          sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
          snapshotJson: {}, snapshotDigest: 'f'.repeat(64),
        },
      });
      findingIds.push(demoFindingId);
      await db.assessmentFinding.create({
        data: { id: demoFindingId, clientId: clientA, title: 'Demó', status: 'OPEN', severity: 'LOW', createdByUserId: adminId, requirementId: demoReqId, requirementApplicabilityId: demoApplicabilityId, scopeType: 'COMPANY' },
      });
      applicabilityIds.push(demoApplicabilityId);
      const prodResult = await getClientSafeComplianceReadModel(clientA, true, db);
      expect(prodResult.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();
      const devResult = await getClientSafeComplianceReadModel(clientA, false, db);
      expect(devResult.topics.find((t) => t.topicLabel === 'Demó téma')).toBeDefined();
    } finally {
      await db.assessmentFinding.deleteMany({ where: { id: demoFindingId } });
      await db.requirementApplicability.deleteMany({ where: { id: demoApplicabilityId } });
      await db.applicabilityRuleVersion.deleteMany({ where: { id: demoRuleId } });
      await db.requirementVersion.deleteMany({ where: { id: demoVersionId } });
      await db.requirement.deleteMany({ where: { id: demoReqId } });
    }
  });

  it('does not expose requirement keys, severity, or raw finding ids in DTO', async () => {
    const applicabilityId = await createApplicability('APPLIES');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/requirementKey|severity|snapshot|factSubjectId|ruleAst|proposal|recommendation/i);
    for (const topic of result.topics) {
      expect(Object.keys(topic).sort()).toEqual(['missingInformation', 'nextAction', 'shortExplanation', 'state', 'topicId', 'topicLabel']);
    }
  });
});
