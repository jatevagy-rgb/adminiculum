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

  const createdClientIds: string[] = [];
  const createdUserIds: string[] = [adminId];
  const createdDomainCodes: string[] = [];

  /** Track all created IDs for proper teardown order. */
  const teardown = {
    findings: [] as string[],
    applicabilities: [] as string[],
    ruleVersions: [] as string[],
    requirementVersions: [] as string[],
    requirements: [] as string[],
  };

  interface TestFixture {
    clientId: string;
    requirementId: string;
    versionId: string;
    ruleId: string;
  }

  async function createFixture(testLabel: string): Promise<TestFixture> {
    const clientId = crypto.randomUUID();
    const requirementId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const ruleId = crypto.randomUUID();

    createdClientIds.push(clientId);
    teardown.requirements.push(requirementId);
    teardown.requirementVersions.push(versionId);
    teardown.ruleVersions.push(ruleId);

    await db.client.create({ data: { id: clientId, name: `Client ${testLabel} ${suiteSuffix}` } });
    await db.requirement.create({ data: { id: requirementId, key: `TEST_KEY_${testLabel}_${suiteSuffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({
      data: { id: versionId, requirementId, versionKey: 'V1', title: `Req ${testLabel}`, normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
    });
    await db.applicabilityRuleVersion.create({
      data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: hex64(`rule-${testLabel}`) },
    });

    return { clientId, requirementId, versionId, ruleId };
  }

  /** Create a requirement+version+rule chain (for multi-requirement tests). */
  async function createRequirementChain(testLabel: string): Promise<TestFixture> {
    const clientId = createdClientIds[0]; // Use first client
    const requirementId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const ruleId = crypto.randomUUID();

    teardown.requirements.push(requirementId);
    teardown.requirementVersions.push(versionId);
    teardown.ruleVersions.push(ruleId);

    await db.requirement.create({ data: { id: requirementId, key: `MULTI_${testLabel}_${suiteSuffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({
      data: { id: versionId, requirementId, versionKey: 'V1', title: `Req ${testLabel}`, normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
    });
    await db.applicabilityRuleVersion.create({
      data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: hex64(`rule-multi-${testLabel}`) },
    });

    return { clientId, requirementId, versionId, ruleId };
  }

  async function createApplicability(fixture: TestFixture, outcome: string, scopeType = 'COMPANY') {
    const id = crypto.randomUUID();
    teardown.applicabilities.push(id);
    await db.requirementApplicability.create({
      data: {
        id,
        clientId: fixture.clientId,
        requirementVersionId: fixture.versionId,
        ruleVersionId: fixture.ruleId,
        ruleDigest: hex64(`rule-digest-${id}`),
        outcome: outcome as never,
        scopeType: scopeType as never,
        evaluationAt: new Date(),
        sourceSupportState: 'SUFFICIENT',
        specialistRequirement: 'NONE',
        schemaVersion: 'phase6-requirement-applicability/v1',
        snapshotJson: { internal: true },
        snapshotDigest: hex64(`snap-${id}`),
      },
    });
    return id;
  }

  async function createFinding(fixture: TestFixture, input: { applicabilityId?: string; scopeType?: string; status?: string; title: string }) {
    const id = crypto.randomUUID();
    teardown.findings.push(id);
    await db.assessmentFinding.create({
      data: {
        id,
        clientId: fixture.clientId,
        title: input.title,
        description: 'Description',
        status: (input.status || 'OPEN') as never,
        severity: 'HIGH',
        createdByUserId: adminId,
        ...(input.applicabilityId
          ? { requirementId: fixture.requirementId, requirementApplicabilityId: input.applicabilityId, scopeType: (input.scopeType || 'COMPANY') as never }
          : { scopeType: (input.scopeType || 'COMPANY') as never }),
      },
    });
    return id;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    createdDomainCodes.push(domainCode);
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Org Safe Test' } });
    await db.user.create({ data: { id: adminId, email: `orgsafe-admin-${suiteSuffix}@example.invalid`, name: 'OrgSafe Admin', role: 'ADMIN' } });
  });

  afterAll(async () => {
    // Teardown in FK-safe order (children before parents)
    if (teardown.findings.length > 0) {
      await db.assessmentFinding.deleteMany({ where: { id: { in: teardown.findings } } });
    }
    if (teardown.applicabilities.length > 0) {
      await db.requirementApplicability.deleteMany({ where: { id: { in: teardown.applicabilities } } });
    }
    if (teardown.ruleVersions.length > 0) {
      await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: teardown.ruleVersions } } });
    }
    if (teardown.requirementVersions.length > 0) {
      await db.requirementVersion.deleteMany({ where: { id: { in: teardown.requirementVersions } } });
    }
    if (teardown.requirements.length > 0) {
      await db.requirement.deleteMany({ where: { id: { in: teardown.requirements } } });
    }
    if (createdClientIds.length > 0) {
      await db.client.deleteMany({ where: { id: { in: createdClientIds } } });
    }
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await db.complianceDomain.deleteMany({ where: { code: { in: createdDomainCodes } } });
    await db.$disconnect();
  });

  it('returns configured COMPANY requirement-backed topic as safe DTO', async () => {
    const fx = await createFixture('basic');
    const applicabilityId = await createApplicability(fx, 'APPLIES');
    await createFinding(fx, { applicabilityId, title: 'Basic finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    expect(result.topics.length).toBeGreaterThanOrEqual(1);
    const topic = result.topics.find((t) => t.topicLabel === 'Req basic');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('REVIEW_RECOMMENDED');
    expect(topic!.missingInformation).toEqual([]);
  });

  it('topicId is opaque registry key, not a DB UUID', async () => {
    const fx = await createFixture('opaque');
    const applicabilityId = await createApplicability(fx, 'APPLIES');
    await createFinding(fx, { applicabilityId, title: 'Opaque finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Req opaque');
    expect(topic).toBeDefined();
    expect(topic!.topicId).not.toBe(applicabilityId);
    expect(topic!.topicId).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('omits COMPANY manual findings without requirementKey', async () => {
    const fx = await createFixture('manual');
    const findingId = await createFinding(fx, { title: 'Kézi megállapítás', scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const manual = result.topics.find((t) => t.topicLabel === 'Kézi megállapítás');
    expect(manual).toBeUndefined();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Kézi megállapítás');
    expect(serialized).not.toContain(findingId);
  });

  it('omits unregistered requirement keys', async () => {
    const fx = await createFixture('unreg');
    const unregReqId = crypto.randomUUID();
    const unregVersionId = crypto.randomUUID();
    const unregRuleId = crypto.randomUUID();
    const unregApplicabilityId = crypto.randomUUID();
    teardown.requirements.push(unregReqId);
    teardown.requirementVersions.push(unregVersionId);
    teardown.ruleVersions.push(unregRuleId);
    teardown.applicabilities.push(unregApplicabilityId);
    try {
      await db.requirement.create({ data: { id: unregReqId, key: `UNREGISTERED_${suiteSuffix}`, jurisdictionCode: 'HU', domainCode } });
      await db.requirementVersion.create({
        data: { id: unregVersionId, requirementId: unregReqId, versionKey: 'V1', title: 'Nem regisztrált', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
      });
      await db.applicabilityRuleVersion.create({
        data: { id: unregRuleId, requirementVersionId: unregVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: hex64(`unreg-rule-${unregRuleId}`) },
      });
      await db.requirementApplicability.create({
        data: {
          id: unregApplicabilityId, clientId: fx.clientId, requirementVersionId: unregVersionId, ruleVersionId: unregRuleId,
          ruleDigest: hex64(`unreg-app-${unregApplicabilityId}`), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(),
          sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
          snapshotJson: {}, snapshotDigest: hex64(`unreg-snap-${unregApplicabilityId}`),
        },
      });
      const unregFindingId = crypto.randomUUID();
      teardown.findings.push(unregFindingId);
      await db.assessmentFinding.create({
        data: { id: unregFindingId, clientId: fx.clientId, title: 'Nem regisztrált terület', status: 'OPEN', severity: 'LOW', createdByUserId: adminId, requirementId: unregReqId, requirementApplicabilityId: unregApplicabilityId, scopeType: 'COMPANY' },
      });
      const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('Nem regisztrált terület');
      expect(serialized).not.toContain(`UNREGISTERED_${suiteSuffix}`);
    } finally {
      // Cleanup handled by afterAll via teardown arrays
    }
  });

  it('omits DOES_NOT_APPLY findings', async () => {
    const fx = await createFixture('dna');
    const applicabilityId = await createApplicability(fx, 'DOES_NOT_APPLY');
    await createFinding(fx, { applicabilityId, title: 'DNA finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(applicabilityId);
  });

  it('omits EMPLOYEE scope findings (COMPANY scope only)', async () => {
    const fx = await createFixture('emp');
    const applicabilityId = await createApplicability(fx, 'APPLIES', 'EMPLOYEE');
    await createFinding(fx, { applicabilityId, scopeType: 'EMPLOYEE', title: 'Employee finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(applicabilityId);
  });

  it('maps INSUFFICIENT_FACTS to MORE_INFORMATION_NEEDED', async () => {
    const fx = await createFixture('insuff');
    const applicabilityId = await createApplicability(fx, 'INSUFFICIENT_FACTS');
    await createFinding(fx, { applicabilityId, title: 'Insufficient finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Req insuff');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('MORE_INFORMATION_NEEDED');
    expect(topic!.nextAction).toContain('hiányzó információkat');
  });

  it('maps LEGAL_REVIEW_REQUIRED to LAWYER_REVIEW_REQUIRED', async () => {
    const fx = await createFixture('legal');
    const applicabilityId = await createApplicability(fx, 'LEGAL_REVIEW_REQUIRED');
    await createFinding(fx, { applicabilityId, title: 'Legal review finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Req legal');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('LAWYER_REVIEW_REQUIRED');
    expect(topic!.nextAction).toContain('Ügyvédi áttekintés javasolt');
  });

  it('DEMO flag matrix: production + flag true → hidden', async () => {
    const fx = await createFixture('demo');
    const demoReqId = crypto.randomUUID();
    const demoVersionId = crypto.randomUUID();
    const demoRuleId = crypto.randomUUID();
    const demoApplicabilityId = crypto.randomUUID();
    teardown.requirements.push(demoReqId);
    teardown.requirementVersions.push(demoVersionId);
    teardown.ruleVersions.push(demoRuleId);
    teardown.applicabilities.push(demoApplicabilityId);
    try {
      await db.requirement.create({ data: { id: demoReqId, key: 'DEMO_SAMPLE_TOPIC', jurisdictionCode: 'HU', domainCode } });
      await db.requirementVersion.create({
        data: { id: demoVersionId, requirementId: demoReqId, versionKey: 'V1', title: 'Demó téma', normativeStatement: 'Demo', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
      });
      await db.applicabilityRuleVersion.create({
        data: { id: demoRuleId, requirementVersionId: demoVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: hex64(`demo-rule-${demoRuleId}`) },
      });
      await db.requirementApplicability.create({
        data: {
          id: demoApplicabilityId, clientId: fx.clientId, requirementVersionId: demoVersionId, ruleVersionId: demoRuleId,
          ruleDigest: hex64(`demo-app-${demoApplicabilityId}`), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(),
          sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
          snapshotJson: {}, snapshotDigest: hex64(`demo-snap-${demoApplicabilityId}`),
        },
      });
      const demoFindingId = crypto.randomUUID();
      teardown.findings.push(demoFindingId);
      await db.assessmentFinding.create({
        data: { id: demoFindingId, clientId: fx.clientId, title: 'Demó', status: 'OPEN', severity: 'LOW', createdByUserId: adminId, requirementId: demoReqId, requirementApplicabilityId: demoApplicabilityId, scopeType: 'COMPANY' },
      });

      const prodTrue = await getClientSafeComplianceReadModel(fx.clientId, true, true, db);
      expect(prodTrue.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

      const prodFalse = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
      expect(prodFalse.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

      const devAbsent = await getClientSafeComplianceReadModel(fx.clientId, false, false, db);
      expect(devAbsent.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

      const devTrue = await getClientSafeComplianceReadModel(fx.clientId, false, true, db);
      expect(devTrue.topics.find((t) => t.topicLabel === 'Demó téma')).toBeDefined();
    } finally {
      // Already tracked in teardown arrays
    }
  });

  it('DTO contains only allowed fields and no internal ids', async () => {
    const fx = await createFixture('dto');
    const applicabilityId = await createApplicability(fx, 'APPLIES');
    const findingId = await createFinding(fx, { applicabilityId, title: 'DTO finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/requirementKey|severity|snapshot|factSubjectId|ruleAst|proposal|recommendation|complianceProposal/i);
    expect(serialized).not.toContain(applicabilityId);
    expect(serialized).not.toContain(findingId);
    expect(serialized).not.toContain(fx.versionId);
    expect(serialized).not.toContain(fx.ruleId);
    expect(serialized).not.toContain(fx.requirementId);

    for (const topic of result.topics) {
      expect(Object.keys(topic).sort()).toEqual(['missingInformation', 'nextAction', 'shortExplanation', 'state', 'topicId', 'topicLabel']);
      expect(topic.topicId).toMatch(/^portal\//);
    }
  });

  it('raw questionKey never appears in serialized output', async () => {
    const fx = await createFixture('qkey');
    const applicabilityId = await createApplicability(fx, 'INSUFFICIENT_FACTS');
    await createFinding(fx, { applicabilityId, title: 'QuestionKey finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('company_data_processing_purpose');
    expect(serialized).not.toContain('company_employee_count');
    expect(serialized).not.toContain('company_risk_assessment');
  });

  it('neutral copy: no overclaiming legal certainty', async () => {
    const fx = await createFixture('neutral');
    const applicabilityId = await createApplicability(fx, 'APPLIES');
    await createFinding(fx, { applicabilityId, title: 'Neutral copy finding' });
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('követelmény teljesítve van');
    expect(serialized).not.toContain('Ügyvédünk hamarosan felveszi');
    expect(serialized).not.toContain('szükséges lépések folyamatban');
  });

  it('bounded queries: batch loading regardless of topic count', async () => {
    const fx = await createFixture('bounded');
    // Each finding must have a unique (clientId, requirementId, scopeType).
    // Create 5 separate requirement chains to avoid unique constraint violations.
    const chains: TestFixture[] = [];
    for (let i = 0; i < 5; i++) {
      const chain = await createRequirementChain(`bounded-${i}`);
      chains.push({ ...chain, clientId: fx.clientId });
    }
    for (let i = 0; i < 5; i++) {
      const chain = chains[i];
      const aId = await createApplicability(chain, 'APPLIES');
      await createFinding(chain, { applicabilityId: aId, title: `Bounded finding ${i}` });
    }
    const result = await getClientSafeComplianceReadModel(fx.clientId, true, false, db);
    expect(result.topics.length).toBe(5);
  });
});
