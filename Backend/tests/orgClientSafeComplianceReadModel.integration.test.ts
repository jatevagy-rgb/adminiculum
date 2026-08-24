import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getClientSafeComplianceReadModel } from '../src/modules/compliance/clientSafeComplianceService';

const databaseUrl = process.env.PHASE7CB_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

function hex64(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

describeWithDatabase('Org client safe compliance read model (PostgreSQL)', () => {
  let db: PrismaClient;
  const suiteSuffix = crypto.randomUUID();
  const domainCode = `ORGSafe_${suiteSuffix}`;
  const adminId = crypto.randomUUID();

  /** Shared requirement chain — registered key "GDPR_DATA_PROCESSING" */
  let sharedReqId: string;
  let sharedVersionId: string;
  let sharedRuleId: string;

  /** Shared DEMO requirement chain — registered key "DEMO_SAMPLE_TOPIC" */
  let demoReqId: string;
  let demoVersionId: string;
  let demoRuleId: string;

  /** Per-test clients (unique per test to avoid materialized-finding collisions). */
  const testClients: string[] = [];

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Org Safe Test' } });
    await db.user.create({ data: { id: adminId, email: `orgsafe-admin-${suiteSuffix}@example.invalid`, name: 'OrgSafe Admin', role: 'ADMIN' } });

    // Shared requirement chain (registered in safe topic registry)
    sharedReqId = crypto.randomUUID();
    sharedVersionId = crypto.randomUUID();
    sharedRuleId = crypto.randomUUID();
    await db.requirement.create({ data: { id: sharedReqId, key: 'GDPR_DATA_PROCESSING', jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({
      data: { id: sharedVersionId, requirementId: sharedReqId, versionKey: 'V1', title: 'Adatvédelmi feldolgozás', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
    });
    await db.applicabilityRuleVersion.create({
      data: { id: sharedRuleId, requirementVersionId: sharedVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: hex64('shared-rule') },
    });

    // DEMO requirement chain
    demoReqId = crypto.randomUUID();
    demoVersionId = crypto.randomUUID();
    demoRuleId = crypto.randomUUID();
    await db.requirement.create({ data: { id: demoReqId, key: 'DEMO_SAMPLE_TOPIC', jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({
      data: { id: demoVersionId, requirementId: demoReqId, versionKey: 'V1', title: 'Demó téma', normativeStatement: 'Demo', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
    });
    await db.applicabilityRuleVersion.create({
      data: { id: demoRuleId, requirementVersionId: demoVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: hex64('demo-rule') },
    });
  });

  afterAll(async () => {
    // Delete all test clients (cascades findings, applicabilities)
    if (testClients.length > 0) {
      await db.client.deleteMany({ where: { id: { in: testClients } } });
    }
    // Delete shared requirement chains
    await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: [sharedRuleId, demoRuleId] } } });
    await db.requirementVersion.deleteMany({ where: { id: { in: [sharedVersionId, demoVersionId] } } });
    await db.requirement.deleteMany({ where: { id: { in: [sharedReqId, demoReqId] } } });
    await db.user.deleteMany({ where: { id: adminId } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.$disconnect();
  });

  /** Create a unique client for a test. */
  async function createTestClient(label: string): Promise<string> {
    const clientId = crypto.randomUUID();
    testClients.push(clientId);
    await db.client.create({ data: { id: clientId, name: `Client ${label} ${suiteSuffix}` } });
    return clientId;
  }

  /** Create applicability + finding for the shared requirement. */
  async function createSharedFinding(clientId: string, outcome: string, title: string) {
    const applicabilityId = crypto.randomUUID();
    await db.requirementApplicability.create({
      data: {
        id: applicabilityId, clientId, requirementVersionId: sharedVersionId, ruleVersionId: sharedRuleId,
        ruleDigest: hex64(`app-${applicabilityId}`), outcome: outcome as never, scopeType: 'COMPANY', evaluationAt: new Date(),
        sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
        snapshotJson: {}, snapshotDigest: hex64(`snap-${applicabilityId}`),
      },
    });
    const findingId = crypto.randomUUID();
    await db.assessmentFinding.create({
      data: { id: findingId, clientId, title, description: 'Description', status: 'OPEN', severity: 'HIGH', createdByUserId: adminId, requirementId: sharedReqId, requirementApplicabilityId: applicabilityId, scopeType: 'COMPANY' },
    });
    return { applicabilityId, findingId };
  }

  it('returns configured COMPANY requirement-backed topic as safe DTO', async () => {
    const clientId = await createTestClient('basic');
    const { applicabilityId, findingId } = await createSharedFinding(clientId, 'APPLIES', 'Basic finding');
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    expect(result.topics.length).toBeGreaterThanOrEqual(1);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('REVIEW_RECOMMENDED');
    expect(topic!.missingInformation).toEqual([]);
  });

  it('topicId is opaque registry key, not a DB UUID', async () => {
    const clientId = await createTestClient('opaque');
    const { applicabilityId } = await createSharedFinding(clientId, 'APPLIES', 'Opaque finding');
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.topicId).toBe('portal/gdpr-data-processing');
    expect(topic!.topicId).not.toBe(applicabilityId);
    expect(topic!.topicId).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('omits COMPANY manual findings without requirementKey', async () => {
    const clientId = await createTestClient('manual');
    const findingId = crypto.randomUUID();
    await db.assessmentFinding.create({
      data: { id: findingId, clientId, title: 'Kézi megállapítás', description: 'Desc', status: 'OPEN', severity: 'HIGH', createdByUserId: adminId, scopeType: 'COMPANY' },
    });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const manual = result.topics.find((t) => t.topicLabel === 'Kézi megállapítás');
    expect(manual).toBeUndefined();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Kézi megállapítás');
    expect(serialized).not.toContain(findingId);
  });

  it('omits unregistered requirement keys', async () => {
    const clientId = await createTestClient('unreg');
    // Create a requirement with a key NOT in the safe registry
    const unregReqId = crypto.randomUUID();
    const unregVersionId = crypto.randomUUID();
    const unregRuleId = crypto.randomUUID();
    try {
      await db.requirement.create({ data: { id: unregReqId, key: `UNREGISTERED_${suiteSuffix}`, jurisdictionCode: 'HU', domainCode } });
      await db.requirementVersion.create({
        data: { id: unregVersionId, requirementId: unregReqId, versionKey: 'V1', title: 'Nem regisztrált', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
      });
      await db.applicabilityRuleVersion.create({
        data: { id: unregRuleId, requirementVersionId: unregVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: hex64(`unreg-${unregRuleId}`) },
      });
      const applicabilityId = crypto.randomUUID();
      await db.requirementApplicability.create({
        data: {
          id: applicabilityId, clientId, requirementVersionId: unregVersionId, ruleVersionId: unregRuleId,
          ruleDigest: hex64(`unreg-app-${applicabilityId}`), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(),
          sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
          snapshotJson: {}, snapshotDigest: hex64(`unreg-snap-${applicabilityId}`),
        },
      });
      await db.assessmentFinding.create({
        data: { id: crypto.randomUUID(), clientId, title: 'Nem regisztrált terület', status: 'OPEN', severity: 'LOW', createdByUserId: adminId, requirementId: unregReqId, requirementApplicabilityId: applicabilityId, scopeType: 'COMPANY' },
      });
      const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('Nem regisztrált terület');
      expect(serialized).not.toContain(`UNREGISTERED_${suiteSuffix}`);
    } finally {
      await db.assessmentFinding.deleteMany({ where: { requirementId: unregReqId } });
      await db.requirementApplicability.deleteMany({ where: { requirementVersionId: unregVersionId } });
      await db.applicabilityRuleVersion.deleteMany({ where: { id: unregRuleId } });
      await db.requirementVersion.deleteMany({ where: { id: unregVersionId } });
      await db.requirement.deleteMany({ where: { id: unregReqId } });
    }
  });

  it('omits DOES_NOT_APPLY findings', async () => {
    const clientId = await createTestClient('dna');
    await createSharedFinding(clientId, 'DOES_NOT_APPLY', 'DNA finding');
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('DNA finding');
  });

  it('omits EMPLOYEE scope findings (COMPANY scope only)', async () => {
    const clientId = await createTestClient('emp');
    const applicabilityId = crypto.randomUUID();
    await db.requirementApplicability.create({
      data: {
        id: applicabilityId, clientId, requirementVersionId: sharedVersionId, ruleVersionId: sharedRuleId,
        ruleDigest: hex64(`emp-app-${applicabilityId}`), outcome: 'APPLIES', scopeType: 'EMPLOYEE', evaluationAt: new Date(),
        sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
        snapshotJson: {}, snapshotDigest: hex64(`emp-snap-${applicabilityId}`),
      },
    });
    await db.assessmentFinding.create({
      data: { id: crypto.randomUUID(), clientId, title: 'Employee finding', description: 'Desc', status: 'OPEN', severity: 'HIGH', createdByUserId: adminId, requirementId: sharedReqId, requirementApplicabilityId: applicabilityId, scopeType: 'EMPLOYEE' },
    });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Employee finding');
  });

  it('maps INSUFFICIENT_FACTS to MORE_INFORMATION_NEEDED', async () => {
    const clientId = await createTestClient('insuff');
    await createSharedFinding(clientId, 'INSUFFICIENT_FACTS', 'Insufficient finding');
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('MORE_INFORMATION_NEEDED');
    expect(topic!.nextAction).toContain('hiányzó információkat');
  });

  it('maps LEGAL_REVIEW_REQUIRED to LAWYER_REVIEW_REQUIRED', async () => {
    const clientId = await createTestClient('legal');
    await createSharedFinding(clientId, 'LEGAL_REVIEW_REQUIRED', 'Legal review finding');
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('LAWYER_REVIEW_REQUIRED');
    expect(topic!.nextAction).toContain('Ügyvédi áttekintés javasolt');
  });

  it('DEMO flag matrix: production + flag true → hidden', async () => {
    const clientId = await createTestClient('demo');
    const applicabilityId = crypto.randomUUID();
    await db.requirementApplicability.create({
      data: {
        id: applicabilityId, clientId, requirementVersionId: demoVersionId, ruleVersionId: demoRuleId,
        ruleDigest: hex64(`demo-app-${applicabilityId}`), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(),
        sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
        snapshotJson: {}, snapshotDigest: hex64(`demo-snap-${applicabilityId}`),
      },
    });
    await db.assessmentFinding.create({
      data: { id: crypto.randomUUID(), clientId, title: 'Demó', status: 'OPEN', severity: 'LOW', createdByUserId: adminId, requirementId: demoReqId, requirementApplicabilityId: applicabilityId, scopeType: 'COMPANY' },
    });

    const prodTrue = await getClientSafeComplianceReadModel(clientId, true, true, db);
    expect(prodTrue.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

    const prodFalse = await getClientSafeComplianceReadModel(clientId, true, false, db);
    expect(prodFalse.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

    const devAbsent = await getClientSafeComplianceReadModel(clientId, false, false, db);
    expect(devAbsent.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

    const devTrue = await getClientSafeComplianceReadModel(clientId, false, true, db);
    expect(devTrue.topics.find((t) => t.topicLabel === 'Demó téma')).toBeDefined();
  });

  it('DTO contains only allowed fields and no internal ids', async () => {
    const clientId = await createTestClient('dto');
    const { applicabilityId, findingId } = await createSharedFinding(clientId, 'APPLIES', 'DTO finding');
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/requirementKey|severity|snapshot|factSubjectId|ruleAst|proposal|recommendation|complianceProposal/i);
    expect(serialized).not.toContain(applicabilityId);
    expect(serialized).not.toContain(findingId);
    expect(serialized).not.toContain(sharedVersionId);
    expect(serialized).not.toContain(sharedRuleId);
    expect(serialized).not.toContain(sharedReqId);

    for (const topic of result.topics) {
      expect(Object.keys(topic).sort()).toEqual(['missingInformation', 'nextAction', 'shortExplanation', 'state', 'topicId', 'topicLabel']);
      expect(topic.topicId).toMatch(/^portal\//);
    }
  });

  it('raw questionKey never appears in serialized output', async () => {
    const clientId = await createTestClient('qkey');
    await createSharedFinding(clientId, 'INSUFFICIENT_FACTS', 'QuestionKey finding');
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('company_data_processing_purpose');
    expect(serialized).not.toContain('company_employee_count');
    expect(serialized).not.toContain('company_risk_assessment');
  });

  it('neutral copy: no overclaiming legal certainty', async () => {
    const clientId = await createTestClient('neutral');
    await createSharedFinding(clientId, 'APPLIES', 'Neutral copy finding');
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('követelmény teljesítve van');
    expect(serialized).not.toContain('Ügyvédünk hamarosan felveszi');
    expect(serialized).not.toContain('szükséges lépések folyamatban');
  });

  it('bounded queries: batch loading regardless of topic count', async () => {
    const clientId = await createTestClient('bounded');
    // Use the shared requirement for all 5 findings — each has a unique clientId
    // so the materialized-finding constraint (clientId, requirementId, scopeType) is satisfied.
    for (let i = 0; i < 5; i++) {
      const applicabilityId = crypto.randomUUID();
      await db.requirementApplicability.create({
        data: {
          id: applicabilityId, clientId, requirementVersionId: sharedVersionId, ruleVersionId: sharedRuleId,
          ruleDigest: hex64(`bounded-app-${i}-${applicabilityId}`), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(),
          sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
          snapshotJson: {}, snapshotDigest: hex64(`bounded-snap-${i}-${applicabilityId}`),
        },
      });
      await db.assessmentFinding.create({
        data: { id: crypto.randomUUID(), clientId, title: `Bounded finding ${i}`, description: 'Desc', status: 'OPEN', severity: 'HIGH', createdByUserId: adminId, requirementId: sharedReqId, requirementApplicabilityId: applicabilityId, scopeType: 'COMPANY' },
      });
    }
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    expect(result.topics.length).toBe(5);
  });
});
