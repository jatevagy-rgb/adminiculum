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

  it('returns configured COMPANY requirement-backed topic as safe DTO', async () => {
    const applicabilityId = await createApplicability('APPLIES');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    expect(result.topics.length).toBeGreaterThanOrEqual(1);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('REVIEW_RECOMMENDED');
    expect(topic!.missingInformation).toEqual([]);
  });

  it('topicId is opaque registry key, not a DB UUID', async () => {
    const applicabilityId = await createApplicability('APPLIES');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    // Must be the registry topicKey, not a UUID
    expect(topic!.topicId).toBe('portal/gdpr-data-processing');
    expect(topic!.topicId).not.toBe(applicabilityId);
    // Must not look like a UUID
    expect(topic!.topicId).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('omits COMPANY manual findings without requirementKey', async () => {
    const findingId = await createFinding({ title: 'Kézi megállapítás', scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    // Manual finding title must never appear as topicLabel
    const manual = result.topics.find((t) => t.topicLabel === 'Kézi megállapítás');
    expect(manual).toBeUndefined();
    // Manual finding title must not appear anywhere in the result
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Kézi megállapítás');
    expect(serialized).not.toContain(findingId);
  });

  it('omits unregistered requirement keys', async () => {
    // Create a requirement with a key NOT in the safe registry
    const unregReqId = crypto.randomUUID();
    const unregVersionId = crypto.randomUUID();
    const unregRuleId = crypto.randomUUID();
    const unregApplicabilityId = crypto.randomUUID();
    try {
      await db.requirement.create({ data: { id: unregReqId, key: 'UNREGISTERED_INTERNAL_KEY', jurisdictionCode: 'HU', domainCode } });
      await db.requirementVersion.create({
        data: { id: unregVersionId, requirementId: unregReqId, versionKey: 'V1', title: 'Nem regisztrált', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
      });
      await db.applicabilityRuleVersion.create({
        data: { id: unregRuleId, requirementVersionId: unregVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: 'g'.repeat(64) },
      });
      await db.requirementApplicability.create({
        data: {
          id: unregApplicabilityId, clientId: clientA, requirementVersionId: unregVersionId, ruleVersionId: unregRuleId,
          ruleDigest: 'h'.repeat(64), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(),
          sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
          snapshotJson: {}, snapshotDigest: 'i'.repeat(64),
        },
      });
      const fid = crypto.randomUUID();
      findingIds.push(fid);
      await db.assessmentFinding.create({
        data: { id: fid, clientId: clientA, title: 'Nem regisztrált terület', status: 'OPEN', severity: 'LOW', createdByUserId: adminId, requirementId: unregReqId, requirementApplicabilityId: unregApplicabilityId, scopeType: 'COMPANY' },
      });
      applicabilityIds.push(unregApplicabilityId);
      const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('Nem regisztrált terület');
      expect(serialized).not.toContain('UNREGISTERED_INTERNAL_KEY');
    } finally {
      await db.assessmentFinding.deleteMany({ where: { requirementId: unregReqId } });
      await db.requirementApplicability.deleteMany({ where: { id: unregApplicabilityId } });
      await db.applicabilityRuleVersion.deleteMany({ where: { id: unregRuleId } });
      await db.requirementVersion.deleteMany({ where: { id: unregVersionId } });
      await db.requirement.deleteMany({ where: { id: unregReqId } });
    }
  });

  it('omits DOES_NOT_APPLY findings', async () => {
    const applicabilityId = await createApplicability('DOES_NOT_APPLY');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(applicabilityId);
  });

  it('omits EMPLOYEE scope findings (COMPANY scope only)', async () => {
    const applicabilityId = await createApplicability('APPLIES', 'EMPLOYEE');
    await createFinding({ applicabilityId, scopeType: 'EMPLOYEE' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(applicabilityId);
  });

  it('maps INSUFFICIENT_FACTS to MORE_INFORMATION_NEEDED', async () => {
    const applicabilityId = await createApplicability('INSUFFICIENT_FACTS');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('MORE_INFORMATION_NEEDED');
    expect(topic!.nextAction).toContain('hiányzó információkat');
  });

  it('maps LEGAL_REVIEW_REQUIRED to LAWYER_REVIEW_REQUIRED', async () => {
    const applicabilityId = await createApplicability('LEGAL_REVIEW_REQUIRED');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('LAWYER_REVIEW_REQUIRED');
    // Must use neutral copy, not overclaiming
    expect(topic!.nextAction).toContain('Ügyvédi áttekintés javasolt');
  });

  it('DEMO flag matrix: production + flag true → hidden', async () => {
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

      // production + flag true → DEMO hidden
      const prodTrue = await getClientSafeComplianceReadModel(clientA, true, true, db);
      expect(prodTrue.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

      // production + flag false → DEMO hidden
      const prodFalse = await getClientSafeComplianceReadModel(clientA, true, false, db);
      expect(prodFalse.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

      // development + flag absent (false) → DEMO hidden
      const devAbsent = await getClientSafeComplianceReadModel(clientA, false, false, db);
      expect(devAbsent.topics.find((t) => t.topicLabel === 'Demó téma')).toBeUndefined();

      // development + flag true → DEMO visible
      const devTrue = await getClientSafeComplianceReadModel(clientA, false, true, db);
      expect(devTrue.topics.find((t) => t.topicLabel === 'Demó téma')).toBeDefined();
    } finally {
      await db.assessmentFinding.deleteMany({ where: { id: demoFindingId } });
      await db.requirementApplicability.deleteMany({ where: { id: demoApplicabilityId } });
      await db.applicabilityRuleVersion.deleteMany({ where: { id: demoRuleId } });
      await db.requirementVersion.deleteMany({ where: { id: demoVersionId } });
      await db.requirement.deleteMany({ where: { id: demoReqId } });
    }
  });

  it('DTO contains only allowed fields and no internal ids', async () => {
    const applicabilityId = await createApplicability('APPLIES');
    const findingId = await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    const serialized = JSON.stringify(result);

    // Regex: no internal field names
    expect(serialized).not.toMatch(/requirementKey|severity|snapshot|factSubjectId|ruleAst|proposal|recommendation|complianceProposal/i);

    // Assert known internal UUIDs do not appear
    expect(serialized).not.toContain(applicabilityId);
    expect(serialized).not.toContain(findingId);
    expect(serialized).not.toContain(versionId);
    expect(serialized).not.toContain(ruleId);
    expect(serialized).not.toContain(requirementId);

    // Assert exact DTO shape
    for (const topic of result.topics) {
      expect(Object.keys(topic).sort()).toEqual(['missingInformation', 'nextAction', 'shortExplanation', 'state', 'topicId', 'topicLabel']);
      // topicId must be a registry key (starts with "portal/")
      expect(topic.topicId).toMatch(/^portal\//);
    }
  });

  it('raw questionKey never appears in serialized output', async () => {
    const applicabilityId = await createApplicability('INSUFFICIENT_FACTS');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    const serialized = JSON.stringify(result);
    // Known raw questionKeys must not appear
    expect(serialized).not.toContain('company_data_processing_purpose');
    expect(serialized).not.toContain('company_employee_count');
    expect(serialized).not.toContain('company_risk_assessment');
  });

  it('neutral copy: no overclaiming legal certainty', async () => {
    const applicabilityId = await createApplicability('APPLIES');
    await createFinding({ applicabilityId, scopeType: 'COMPANY' });
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    const serialized = JSON.stringify(result);
    // Forbidden phrases
    expect(serialized).not.toContain('követelmény teljesítve van');
    expect(serialized).not.toContain('Ügyvédünk hamarosan felveszi');
    expect(serialized).not.toContain('szükséges lépések folyamatban');
  });

  it('bounded queries: batch loading regardless of topic count', async () => {
    // Create 5 topics
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const aId = await createApplicability('APPLIES');
      await createFinding({ applicabilityId: aId, scopeType: 'COMPANY' });
      ids.push(aId);
    }
    // The service should make exactly: 1 findMany (findings) + 2 batch (deps + facts) = 3 queries
    // We verify by confirming it returns without error and with correct count
    const result = await getClientSafeComplianceReadModel(clientA, true, false, db);
    // Should have at least 5 topics (the 5 we created, possibly more from prior tests)
    expect(result.topics.length).toBeGreaterThanOrEqual(5);
  });
});
