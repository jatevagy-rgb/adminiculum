import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getClientSafeComplianceReadModel } from '../src/modules/compliance/clientSafeComplianceService';
import { createEvidenceRecord, getControlCoverage, linkEvidenceToControl, reviewEvidenceRecord } from '../src/modules/compliance/controlEvidenceService';

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

  let sharedReqId: string;
  let sharedVersionId: string;
  let sharedRuleId: string;
  let portalControlDefinitionId: string;
  let unknownControlDefinitionId: string;

  let demoReqId: string;
  let demoVersionId: string;
  let demoRuleId: string;

  const testClients: string[] = [];
  const createdVersionIds: string[] = [];
  const createdRuleIds: string[] = [];
  const createdRequirementIds: string[] = [];
  const originalVersionStates = new Map<string, { title: string; status: string; sourceSupportState: string }>();
  const originalRuleStates = new Map<string, { status: string }>();
  const createdDependencyIds: string[] = [];
  const createdDefinitionIds: string[] = [];

  async function ensureRequirementChain(key: string, title: string, ruleDigestSeed: string) {
    let req = await db.requirement.findFirst({ where: { key } });
    if (!req) {
      req = await db.requirement.create({ data: { id: crypto.randomUUID(), key, jurisdictionCode: 'HU', domainCode } });
      createdRequirementIds.push(req.id);
    }

    let version = await db.requirementVersion.findFirst({
      where: { requirementId: req.id, versionKey: 'V1' },
    });
    if (!version) {
      version = await db.requirementVersion.create({
        data: { id: crypto.randomUUID(), requirementId: req.id, versionKey: 'V1', title, normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', status: 'APPROVED' },
      });
      createdVersionIds.push(version.id);
    } else if (version.title !== title || version.status !== 'APPROVED' || version.sourceSupportState !== 'SUFFICIENT') {
      originalVersionStates.set(version.id, { title: version.title, status: String(version.status), sourceSupportState: String(version.sourceSupportState) });
      version = await db.requirementVersion.update({ where: { id: version.id }, data: { title, status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    }

    let rule = await db.applicabilityRuleVersion.findFirst({
      where: { requirementVersionId: version.id, ruleVersionKey: 'R1' },
    });
    if (!rule) {
      rule = await db.applicabilityRuleVersion.create({
        data: { id: crypto.randomUUID(), requirementVersionId: version.id, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: hex64(ruleDigestSeed), status: 'APPROVED' },
      });
      createdRuleIds.push(rule.id);
    } else if (rule.status !== 'APPROVED') {
      originalRuleStates.set(rule.id, { status: String(rule.status) });
      rule = await db.applicabilityRuleVersion.update({ where: { id: rule.id }, data: { status: 'APPROVED' } });
    }

    return { reqId: req.id, versionId: version.id, ruleId: rule.id };
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Org Safe Test' } }).catch(() => {});
    await db.user.upsert({ where: { id: adminId }, create: { id: adminId, email: `orgsafe-admin-${suiteSuffix}@example.invalid`, name: 'OrgSafe Admin', role: 'ADMIN' }, update: {} });

    const shared = await ensureRequirementChain('GDPR_DATA_PROCESSING', 'INTERNAL WORKFORCE REQUIREMENT WORDING — MUST NOT LEAK', 'shared-rule');
    sharedReqId = shared.reqId;
    sharedVersionId = shared.versionId;
    sharedRuleId = shared.ruleId;
    portalControlDefinitionId = crypto.randomUUID();
    unknownControlDefinitionId = crypto.randomUUID();
    await db.controlDefinition.create({
      data: { id: portalControlDefinitionId, key: 'GDPR_DATA_PROCESSING_CONTROL', title: 'INTERNAL CONTROL TITLE — MUST NOT LEAK', type: 'LEGAL' },
    });
    await db.controlDefinition.create({
      data: { id: unknownControlDefinitionId, key: `portal-scope-${suiteSuffix}`, title: 'UNKNOWN INTERNAL CONTROL TITLE — MUST NOT LEAK', type: 'LEGAL' },
    });
    await db.requirementControlMap.create({
      data: { requirementVersionId: sharedVersionId, controlDefinitionId: portalControlDefinitionId },
    });
    await db.requirementControlMap.create({
      data: { requirementVersionId: sharedVersionId, controlDefinitionId: unknownControlDefinitionId },
    });

    const demo = await ensureRequirementChain('DEMO_SAMPLE_TOPIC', 'Demó téma', 'demo-rule');
    demoReqId = demo.reqId;
    demoVersionId = demo.versionId;
    demoRuleId = demo.ruleId;
  });

  afterAll(async () => {
    if (testClients.length > 0) {
      await db.assessmentFinding.deleteMany({ where: { clientId: { in: testClients } } });
      await db.requirementApplicability.deleteMany({ where: { clientId: { in: testClients } } });
      await db.clientControl.deleteMany({ where: { clientId: { in: testClients } } });
      await db.client.deleteMany({ where: { id: { in: testClients } } });
    }
    await db.requirementControlMap.deleteMany({ where: { controlDefinitionId: { in: [portalControlDefinitionId, unknownControlDefinitionId] } } });
    if (createdRuleIds.length > 0) {
      await db.applicabilityRuleFactDependency.deleteMany({ where: { id: { in: createdDependencyIds } } });
      await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: createdRuleIds } } });
    }
    for (const [id, state] of originalRuleStates) {
      await db.applicabilityRuleVersion.update({ where: { id }, data: { status: state.status as never } });
    }
    if (createdVersionIds.length > 0) {
      await db.requirementVersion.deleteMany({ where: { id: { in: createdVersionIds } } });
    }
    for (const [id, state] of originalVersionStates) {
      await db.requirementVersion.update({ where: { id }, data: { title: state.title, status: state.status as never, sourceSupportState: state.sourceSupportState as never } });
    }
    await db.controlDefinition.delete({ where: { id: portalControlDefinitionId } }).catch(() => {});
    await db.controlDefinition.delete({ where: { id: unknownControlDefinitionId } }).catch(() => {});
    if (createdRequirementIds.length > 0) {
      await db.requirement.deleteMany({ where: { id: { in: createdRequirementIds } } });
    }
    if (createdDefinitionIds.length > 0) {
      await db.factDefinition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
    }
    await db.user.delete({ where: { id: adminId } }).catch(() => {});
    await db.complianceDomain.delete({ where: { code: domainCode } }).catch(() => {});
    await db.$disconnect();
  });

  async function createTestClient(label: string): Promise<string> {
    const clientId = crypto.randomUUID();
    testClients.push(clientId);
    await db.client.create({ data: { id: clientId, name: `Client ${label} ${suiteSuffix}` } });
    return clientId;
  }

  async function createFinding(clientId: string, outcome: string, title: string, opts: { reqId: string; versionId: string; ruleId: string; scopeType?: string }) {
    const applicabilityId = crypto.randomUUID();
    await db.requirementApplicability.create({
      data: {
        id: applicabilityId, clientId, requirementVersionId: opts.versionId, ruleVersionId: opts.ruleId,
        ruleDigest: hex64(`app-${applicabilityId}`), outcome: outcome as never, scopeType: (opts.scopeType || 'COMPANY') as never, evaluationAt: new Date(),
        sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
        snapshotJson: {}, snapshotDigest: hex64(`snap-${applicabilityId}`),
      },
    });
    const findingId = crypto.randomUUID();
    await db.assessmentFinding.create({
      data: { id: findingId, clientId, title, description: 'Description', status: 'OPEN', severity: 'HIGH', createdByUserId: adminId, requirementId: opts.reqId, requirementApplicabilityId: applicabilityId, scopeType: (opts.scopeType || 'COMPANY') as never },
    });
    return { applicabilityId, findingId };
  }

  async function createMissingProjection(clientId: string, title: string, definitionId: string, factKey: string) {
    const versionId = crypto.randomUUID();
    createdVersionIds.push(versionId);
    await db.requirementVersion.create({
      data: {
        id: versionId,
        requirementId: sharedReqId,
        versionKey: `V_${versionId.slice(0, 8)}`,
        title,
        normativeStatement: 'Test',
        effectiveFrom: new Date(Date.now() + createdVersionIds.length * 1000),
        sourceSupportState: 'SUFFICIENT',
        specialistRequirement: 'NONE',
        status: 'APPROVED',
      },
    });
    const ruleId = crypto.randomUUID();
    createdRuleIds.push(ruleId);
    await db.applicabilityRuleVersion.create({
      data: {
        id: ruleId,
        requirementVersionId: versionId,
        ruleVersionKey: `R_${ruleId.slice(0, 8)}`,
        schemaVersion: 'rule-ast/v1',
        astJson: { node: 'test' },
        canonicalDigest: hex64(`projection-${ruleId}`),
        status: 'APPROVED',
      },
    });
    const dependencyId = crypto.randomUUID();
    createdDependencyIds.push(dependencyId);
    await db.applicabilityRuleFactDependency.create({ data: { id: dependencyId, applicabilityRuleVersionId: ruleId, factKey, resolvedFactDefinitionId: definitionId } });
    const applicabilityId = crypto.randomUUID();
    await db.requirementApplicability.create({
      data: {
        id: applicabilityId,
        clientId,
        requirementVersionId: versionId,
        ruleVersionId: ruleId,
        ruleDigest: hex64(`projection-app-${applicabilityId}`),
        outcome: 'INSUFFICIENT_FACTS',
        scopeType: 'COMPANY',
        evaluationAt: new Date(),
        sourceSupportState: 'SUFFICIENT',
        specialistRequirement: 'NONE',
        schemaVersion: 'phase6-requirement-applicability/v1',
        snapshotJson: { missingFactKeys: [factKey] },
        snapshotDigest: hex64(`projection-snap-${applicabilityId}`),
      },
    });
    await db.assessmentFinding.create({
      data: {
        id: crypto.randomUUID(),
        clientId,
        title,
        description: 'Description',
        status: 'OPEN',
        severity: 'HIGH',
        createdByUserId: adminId,
        requirementId: sharedReqId,
        requirementApplicabilityId: applicabilityId,
        scopeType: 'COMPANY',
      },
    });
  }

  it('only marks canonical definitions portal-answerable and returns canonical typed metadata', async () => {
    const canonical = await db.factDefinition.findUnique({ where: { key: 'employee_count' }, select: { id: true, key: true, questionKey: true, valueType: true } });
    expect(canonical).toMatchObject({ key: 'employee_count', valueType: 'NUMBER' });

    const aliasId = crypto.randomUUID();
    createdDefinitionIds.push(aliasId);
    await db.factDefinition.create({ data: { id: aliasId, key: `legacy_employee_count_${suiteSuffix}`, domainCode, valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION', questionKey: 'employee_count' } });

    const aliasClient = await createTestClient('alias');
    await createMissingProjection(aliasClient, 'Alias projection', aliasId, `legacy_employee_count_${suiteSuffix}`);
    const aliasResult = await getClientSafeComplianceReadModel(aliasClient, true, false, db);
    const aliasMissing = aliasResult.topics[0]?.missingInformation[0];
    expect(aliasMissing).toMatchObject({ portalAnswerable: false, questionKey: null });
    expect(aliasMissing?.valueType).toBeUndefined();

    const canonicalClient = await createTestClient('canonical');
    await createMissingProjection(canonicalClient, 'Canonical projection', canonical!.id, 'employee_count');
    const canonicalResult = await getClientSafeComplianceReadModel(canonicalClient, true, false, db);
    const canonicalMissing = canonicalResult.topics[0]?.missingInformation[0];
    expect(canonicalMissing).toMatchObject({ portalAnswerable: true, questionKey: 'employee_count', valueType: 'NUMBER', label: 'Munkavállalók száma', integerOnly: true });
  });

  it('returns configured COMPANY requirement-backed topic as safe DTO', async () => {
    const clientId = await createTestClient('basic');
    await createFinding(clientId, 'APPLIES', 'Basic finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    expect(result.topics.length).toBeGreaterThanOrEqual(1);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('REVIEW_RECOMMENDED');
    expect(topic!.missingInformation).toEqual([]);
  });

  it('topicId is opaque registry key, not a DB UUID', async () => {
    const clientId = await createTestClient('opaque');
    const { applicabilityId } = await createFinding(clientId, 'APPLIES', 'Opaque finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId });
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
    await createFinding(clientId, 'DOES_NOT_APPLY', 'DNA finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('DNA finding');
  });

  it('omits EMPLOYEE scope findings (COMPANY scope only)', async () => {
    const clientId = await createTestClient('emp');
    await createFinding(clientId, 'APPLIES', 'Employee finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId, scopeType: 'EMPLOYEE' });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Employee finding');
  });

  it('PORTAL_COMPANY_SCOPE_ONLY, EMPLOYEE_SCOPE_PORTAL_EXCLUDED, OTHER_SCOPE_PORTAL_EXCLUDED, NO_DUPLICATE_PORTAL_CONTROL_PER_SUBJECT, WORKFORCE_SCOPE_BEHAVIOR_PRESERVED', async () => {
    const clientId = await createTestClient('control-scopes');
    await db.clientControl.create({ data: { clientId, controlDefinitionId: portalControlDefinitionId } });
    await db.clientControl.create({ data: { clientId, controlDefinitionId: unknownControlDefinitionId } });
    const futureEvidence = await createEvidenceRecord({ userId: adminId, role: 'ADMIN' }, clientId, {
      sourceType: 'EXTERNAL_REFERENCE',
      title: 'Future portal evidence',
      externalReference: 'https://example.invalid/future-portal',
      validFrom: new Date(Date.now() + 86400000),
    }, db);
    await reviewEvidenceRecord({ userId: adminId, role: 'ADMIN' }, clientId, futureEvidence.id, { status: 'ACCEPTED' }, db);
    const portalControl = await db.clientControl.findFirstOrThrow({ where: { clientId, controlDefinitionId: portalControlDefinitionId } });
    await linkEvidenceToControl({ userId: adminId, role: 'ADMIN' }, clientId, portalControl.id, futureEvidence.id, db);
    const scopeSnapshot = (scopeType: 'COMPANY' | 'EMPLOYEE' | 'WORKPLACE_SITE', factSubjectId: string | null, evaluationAt: Date) => ({
      clientId,
      requirementVersionId: sharedVersionId,
      ruleVersionId: sharedRuleId,
      ruleDigest: hex64(`scope-${scopeType}-${factSubjectId || 'company'}-${clientId}`),
      outcome: 'APPLIES' as const,
      scopeType: scopeType as never,
      factSubjectId,
      evaluationAt,
      sourceSupportState: 'SUFFICIENT' as const,
      specialistRequirement: 'NONE' as const,
      schemaVersion: 'phase6-requirement-applicability/v1',
      snapshotJson: {},
      snapshotDigest: hex64(`scope-snapshot-${scopeType}-${factSubjectId || 'company'}-${clientId}`),
    });
    await db.requirementApplicability.createMany({
      data: [
        scopeSnapshot('COMPANY', null, new Date('2026-09-14T10:00:00Z')),
        scopeSnapshot('EMPLOYEE', crypto.randomUUID(), new Date('2026-09-14T10:01:00Z')),
        scopeSnapshot('WORKPLACE_SITE', crypto.randomUUID(), new Date('2026-09-14T10:02:00Z')),
      ],
    });

    const portal = await getClientSafeComplianceReadModel(clientId, true, false, db);
    expect(portal.controlsSummary).toHaveLength(1);
    expect(portal.controlsSummary[0].controls).toHaveLength(1);
    expect(portal.controlsSummary[0].controls[0].evidence.acceptedCurrent).toBe(0);
    expect(portal.controlsSummary[0].controls[0].evidence.missing).toBe(true);
    expect(portal.controlsSummary[0].requirementTitle).toBe('Adatvédelmi feldolgozás');
    expect(portal.controlsSummary[0].controls[0].title).toBe('Adatvédelmi intézkedés');
    const serialized = JSON.stringify(portal);
    expect(serialized).not.toContain('INTERNAL WORKFORCE REQUIREMENT WORDING — MUST NOT LEAK');
    expect(serialized).not.toContain('INTERNAL CONTROL TITLE — MUST NOT LEAK');
    expect(serialized).not.toContain('UNKNOWN INTERNAL CONTROL TITLE — MUST NOT LEAK');
    const workforce = await getControlCoverage({ userId: adminId, role: 'ADMIN' }, clientId, db);
    expect(workforce.requirements).toHaveLength(3);
    expect(workforce.requirements[0].title).toBe('INTERNAL WORKFORCE REQUIREMENT WORDING — MUST NOT LEAK');
    expect(workforce.requirements[0].controls.map((control) => control.title)).toContain('INTERNAL CONTROL TITLE — MUST NOT LEAK');
  });

  it('maps INSUFFICIENT_FACTS to MORE_INFORMATION_NEEDED', async () => {
    const clientId = await createTestClient('insuff');
    await createFinding(clientId, 'INSUFFICIENT_FACTS', 'Insufficient finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('MORE_INFORMATION_NEEDED');
    expect(topic!.nextAction).toContain('hiányzó információkat');
  });

  it('maps LEGAL_REVIEW_REQUIRED to LAWYER_REVIEW_REQUIRED', async () => {
    const clientId = await createTestClient('legal');
    await createFinding(clientId, 'LEGAL_REVIEW_REQUIRED', 'Legal review finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const topic = result.topics.find((t) => t.topicLabel === 'Adatvédelmi feldolgozás');
    expect(topic).toBeDefined();
    expect(topic!.state).toBe('LAWYER_REVIEW_REQUIRED');
    expect(topic!.nextAction).toContain('Ügyvédi áttekintés javasolt');
  });

  it('DEMO flag matrix: production + flag true → hidden', async () => {
    const clientId = await createTestClient('demo');
    await createFinding(clientId, 'APPLIES', 'Demó', { reqId: demoReqId, versionId: demoVersionId, ruleId: demoRuleId });

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
    const { applicabilityId, findingId } = await createFinding(clientId, 'APPLIES', 'DTO finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/requirementKey|severity|snapshot|factSubjectId|ruleAst|proposal|recommendation|complianceProposal/i);
    expect(serialized).not.toContain(applicabilityId);
    expect(serialized).not.toContain(findingId);
    expect(serialized).not.toContain(sharedVersionId);
    expect(serialized).not.toContain(sharedRuleId);
    expect(serialized).not.toContain(sharedReqId);

    for (const topic of result.topics) {
      expect(Object.keys(topic).sort()).toEqual(['documents', 'missingInformation', 'nextAction', 'shortExplanation', 'state', 'topicId', 'topicLabel']);
      expect(topic.topicId).toMatch(/^portal\//);
      for (const document of topic.documents) {
        // Only client-safe published-document fields may be projected.
        expect(Object.keys(document).sort()).toEqual(['downloadAvailable', 'publicationId', 'publishedAt', 'title', 'versionLabel']);
      }
    }
  });

  it('raw questionKey never appears in serialized output', async () => {
    const clientId = await createTestClient('qkey');
    await createFinding(clientId, 'INSUFFICIENT_FACTS', 'QuestionKey finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('company_data_processing_purpose');
    expect(serialized).not.toContain('company_employee_count');
    expect(serialized).not.toContain('company_risk_assessment');
  });

  it('neutral copy: no overclaiming legal certainty', async () => {
    const clientId = await createTestClient('neutral');
    await createFinding(clientId, 'APPLIES', 'Neutral copy finding', { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId });
    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('követelmény teljesítve van');
    expect(serialized).not.toContain('Ügyvédünk hamarosan felveszi');
    expect(serialized).not.toContain('szükséges lépések folyamatban');
  });

  it('bounded queries: batch loading regardless of topic count', async () => {
    const clientId = await createTestClient('bounded');

    const keys = ['GDPR_DATA_SUBJECT_RIGHTS', 'LABOR_SAFETY_REGULATION', 'ANTI_MONEY_LAUNDERING'];
    const labels = ['Érintetti jogok', 'Munkavédelmi előírások', 'Pénzmosás megelőzése'];
    const chains = await Promise.all(
      keys.map((k, i) => ensureRequirementChain(k, labels[i], `bounded-${k}`)),
    );

    const expectedLabels = ['Adatvédelmi feldolgozás', ...labels];
    const allChains = [
      { reqId: sharedReqId, versionId: sharedVersionId, ruleId: sharedRuleId },
      ...chains,
    ];

    for (const chain of allChains) {
      await createFinding(clientId, 'APPLIES', `Bounded ${chain.reqId}`, chain);
    }

    const result = await getClientSafeComplianceReadModel(clientId, true, false, db);
    expect(result.topics.length).toBe(allChains.length);
    for (const label of expectedLabels) {
      expect(result.topics.find((t) => t.topicLabel === label)).toBeDefined();
    }
  });
});
