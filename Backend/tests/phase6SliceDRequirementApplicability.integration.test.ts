import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { addRequirementCitation, approveApplicabilityRuleVersion, approveRequirementVersion, createApplicabilityRuleVersion, createRequirement, createRequirementVersion } from '../src/modules/compliance/requirementRuleService';
import { ComplianceEvaluationError } from '../src/modules/compliance/complianceEvaluationService';
import { createRequirementApplicability, REQUIREMENT_APPLICABILITY_SCHEMA_VERSION } from '../src/modules/compliance/requirementApplicabilityService';
import { canonicalDigest } from '../src/modules/compliance/canonicalDigest';

const databaseUrl = process.env.COMPLIANCE_SLICE_D_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Phase 6 Slice D immutable requirement applicability snapshot (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `D_${suffix}`;
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const definitionIds = new Map<string, string>();
  const requirementIds: string[] = [];
  const versionIds: string[] = [];
  const ruleIds: string[] = [];
  const applicabilityIds: string[] = [];
  const assessmentIds: string[] = [];

  const comparison = (key: string, value: unknown = true, valueType = 'boolean'): Record<string, unknown> => ({ kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: key }, right: { kind: 'LITERAL', valueType, value } });
  const ast = (key: string, value: unknown = true, valueType = 'boolean') => ({ schemaVersion: 'rule-ast/v1', node: comparison(key, value, valueType) });
  const scope = { scopeType: 'COMPANY' as const, evaluationAt: new Date('2026-06-15T12:00:00.000Z') };
  const definitionKey = (key: string) => `D_${key}_${suffix}`;

  async function pair(name: string, key = 'bool', specialistRequirement: 'NONE' | 'LEGAL_ONLY' | 'TECHNICAL_CLASSIFICATION_REQUIRED' = 'NONE', ruleAst = ast(definitionKey(key))) {
    const requirement = await createRequirement({ key: `REQ_${name}_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    requirementIds.push(requirement.id);
    const version = await createRequirementVersion({ requirementId: requirement.id, versionKey: 'V1', title: name, normativeStatement: name, effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', specialistRequirement, db });
    versionIds.push(version.id);
    await addRequirementCitation({ requirementVersionId: version.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(version.id, userId, db);
    const rule = await createApplicabilityRuleVersion({ requirementVersionId: version.id, ruleVersionKey: 'R1', astJson: ruleAst, db });
    ruleIds.push(rule.id);
    await approveApplicabilityRuleVersion(rule.id, userId, db);
    return { version, rule };
  }

  async function fact(key = 'bool', value: Record<string, unknown> = { booleanValue: true }, clientId = clientA) {
    const id = crypto.randomUUID();
    await db.clientFact.create({ data: { id, clientId, type: `D_${key}`, value: 'legacy-unused', validFrom: new Date('2026-01-01T00:00:00Z'), factDefinitionId: definitionIds.get(key), scopeType: 'COMPANY', observedAt: new Date('2026-01-01T00:00:00Z'), ...value } as never });
    return id;
  }

  async function createSnapshot(name: string, key = 'bool', inputScope: { scopeType: 'COMPANY'; evaluationAt: Date; referencePeriod?: { start: Date; end: Date } } = scope, specialist: 'NONE' | 'LEGAL_ONLY' | 'TECHNICAL_CLASSIFICATION_REQUIRED' = 'NONE') {
    const selected = await pair(name, key, specialist);
    const result = await createRequirementApplicability({ requirementVersionId: selected.version.id, ruleVersionId: selected.rule.id, clientId: clientA, scope: inputScope }, db);
    applicabilityIds.push(result.applicability.id);
    return { ...selected, ...result };
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Slice D domain' } });
    await db.client.createMany({ data: [{ id: clientA, name: `D Client A ${suffix}` }, { id: clientB, name: `D Client B ${suffix}` }] });
    await db.user.create({ data: { id: userId, email: `d-${suffix}@example.invalid`, name: 'Slice D Fixture', role: 'ADMIN' } });
    for (const [key, valueType] of [['bool', 'BOOLEAN'], ['number', 'NUMBER'], ['date', 'DATE'], ['string', 'STRING']] as const) {
      const id = crypto.randomUUID();
      definitionIds.set(key, id);
      await db.factDefinition.create({ data: { id, key: `D_${key}_${suffix}`, domainCode, valueType, allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' } });
    }
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `d-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED', updatedAt: new Date() } });
    await db.legalSourceVersion.create({ data: { id: sourceVersionId, legalSourceId: sourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } });
  });

  afterEach(async () => {
    await db?.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
  });

  afterAll(async () => {
    await db?.assessmentFinding.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db?.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
    await db?.requirementApplicability.deleteMany({ where: { id: { in: applicabilityIds } } });
    await db?.applicabilityRuleVersion.deleteMany({ where: { id: { in: ruleIds } } });
    await db?.requirementVersion.deleteMany({ where: { id: { in: versionIds } } });
    await db?.requirement.deleteMany({ where: { id: { in: requirementIds } } });
    await db?.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db?.legalSourceVersion.deleteMany({ where: { id: sourceVersionId } });
    await db?.legalSource.deleteMany({ where: { id: sourceId } });
    await db?.factDefinition.deleteMany({ where: { id: { in: [...definitionIds.values()] } } });
    await db?.user.deleteMany({ where: { id: userId } });
    await db?.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db?.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db?.$disconnect();
  });

  it('persists APPLIES with exact pins and normalized value', async () => {
    const id = await fact();
    const result = await createSnapshot('applies');
    expect(result.applicability.outcome).toBe('APPLIES');
    expect(result.applicability.requirementVersionId).toBe(result.version.id);
    expect(result.applicability.ruleVersionId).toBe(result.rule.id);
    expect(result.applicability.facts.map((item) => item.clientFactId)).toEqual([id]);
    expect((result.applicability.snapshotJson as any).normalizedValues[0].normalizedValue).toBe(true);
  });

  it('persists DOES_NOT_APPLY', async () => {
    await fact('bool', { booleanValue: false });
    expect((await createSnapshot('does-not-apply')).applicability.outcome).toBe('DOES_NOT_APPLY');
  });

  it('persists INSUFFICIENT_FACTS and no normalized value for a missing fact', async () => {
    const result = await createSnapshot('insufficient');
    expect(result.applicability.outcome).toBe('INSUFFICIENT_FACTS');
    expect(result.applicability.facts).toHaveLength(0);
  });

  it('persists LEGAL_REVIEW_REQUIRED and TECHNICAL_REVIEW_REQUIRED', async () => {
    expect((await createSnapshot('legal', 'bool', scope, 'LEGAL_ONLY')).applicability.outcome).toBe('LEGAL_REVIEW_REQUIRED');
    expect((await createSnapshot('technical', 'bool', scope, 'TECHNICAL_CLASSIFICATION_REQUIRED')).applicability.outcome).toBe('TECHNICAL_REVIEW_REQUIRED');
  });

  it('persists SOURCE_SUPPORT_INSUFFICIENT in the frozen storage contract', async () => {
    const selected = await pair('source-storage');
    const payload = {
      schemaVersion: REQUIREMENT_APPLICABILITY_SCHEMA_VERSION,
      clientId: clientA,
      requirementVersionId: selected.version.id,
      ruleVersionId: selected.rule.id,
      ruleDigest: 'a'.repeat(64),
      outcome: 'SOURCE_SUPPORT_INSUFFICIENT',
      scope: { scopeType: 'COMPANY', factSubjectId: null, evaluationAt: scope.evaluationAt.toISOString(), referencePeriod: null },
      factSubjectId: null,
      evaluationAt: scope.evaluationAt.toISOString(),
      referencePeriod: null,
      reasonCodes: ['SOURCE_SUPPORT_INSUFFICIENT'],
      missingFactKeys: [],
      factDefinitions: [],
      selectedClientFactIds: [],
      normalizedValues: [],
      sourceSupportState: 'INCOMPLETE',
      specialistRequirement: 'NONE',
      specialistDomainCode: null,
      trace: {},
    };
    const created = await db.requirementApplicability.create({ data: {
      clientId: clientA, requirementVersionId: selected.version.id, ruleVersionId: selected.rule.id,
      ruleDigest: 'a'.repeat(64), outcome: 'SOURCE_SUPPORT_INSUFFICIENT', scopeType: 'COMPANY',
      evaluationAt: scope.evaluationAt, sourceSupportState: 'INCOMPLETE', specialistRequirement: 'NONE',
      schemaVersion: REQUIREMENT_APPLICABILITY_SCHEMA_VERSION, snapshotJson: payload, snapshotDigest: canonicalDigest(payload),
    } });
    applicabilityIds.push(created.id);
    expect(created.outcome).toBe('SOURCE_SUPPORT_INSUFFICIENT');
  });

  it('pins evaluationAt and referencePeriod exactly', async () => {
    await fact();
    const evaluationAt = new Date('2026-06-15T12:00:00.000Z');
    const referencePeriod = { start: new Date('2026-02-01T00:00:00.000Z'), end: new Date('2026-03-31T00:00:00.000Z') };
    const result = await createSnapshot('temporal', 'bool', { ...scope, evaluationAt, referencePeriod });
    expect(result.applicability.evaluationAt.toISOString()).toBe(evaluationAt.toISOString());
    expect(result.applicability.referencePeriodStart?.toISOString()).toBe(referencePeriod.start.toISOString());
    expect((result.applicability.snapshotJson as any).referencePeriod.end).toBe(referencePeriod.end.toISOString());
  });

  it('preserves equal duplicate contributing ClientFact IDs', async () => {
    const first = await fact();
    const second = await fact();
    const result = await createSnapshot('duplicates');
    const provenance = result.applicability.facts.sort((left, right) => left.clientFactId.localeCompare(right.clientFactId));
    expect(provenance.map((item) => item.clientFactId)).toEqual([first, second].sort());
    expect(provenance.map((item) => item.factKey)).toEqual([definitionKey('bool'), definitionKey('bool')]);
    expect(provenance[0].normalizedValueDigest).toBe(provenance[1].normalizedValueDigest);
    const snapshotBefore = result.applicability.snapshotJson;
    await expect(db.$executeRaw`UPDATE requirement_applicabilities SET snapshotJson = '{"tampered":true}'::jsonb WHERE id = ${result.applicability.id}`).rejects.toThrow();
    expect((await db.requirementApplicability.findUniqueOrThrow({ where: { id: result.applicability.id } })).snapshotJson).toEqual(snapshotBefore);
  });

  it('rejects a duplicate provenance triple', async () => {
    const first = await fact();
    const result = await createSnapshot('provenance-triple');
    const row = result.applicability.facts[0];
    await expect(db.requirementApplicabilityFact.create({ data: {
      applicabilityId: result.applicability.id,
      clientFactId: first,
      factDefinitionId: row.factDefinitionId,
      factKey: row.factKey,
      normalizedValueDigest: row.normalizedValueDigest,
    } })).rejects.toThrow();
  });

  it('preserves provenance across different fact keys', async () => {
    await fact('bool', { booleanValue: true });
    await fact('number', { numberValue: '42.00' });
    const selected = await pair('multi-key', 'bool', 'NONE', {
      schemaVersion: 'rule-ast/v1',
      node: { kind: 'AND', children: [comparison(definitionKey('bool')), comparison(definitionKey('number'), 42, 'number')] },
    });
    const result = await createRequirementApplicability({ requirementVersionId: selected.version.id, ruleVersionId: selected.rule.id, clientId: clientA, scope }, db);
    applicabilityIds.push(result.applicability.id);
    expect(result.applicability.facts.map((item) => item.factKey).sort()).toEqual([definitionKey('bool'), definitionKey('number')].sort());
    expect(result.applicability.facts).toHaveLength(2);
  });

  it('keeps conflicting values out of APPLIES and DOES_NOT_APPLY snapshots', async () => {
    await fact('bool', { booleanValue: true });
    await fact('bool', { booleanValue: false });
    const result = await createSnapshot('conflicting');
    expect(result.evaluation.outcome).toBe('INSUFFICIENT_FACTS');
    expect(result.applicability.outcome).toBe('INSUFFICIENT_FACTS');
    expect(result.applicability.outcome).not.toBe('APPLIES');
    expect(result.applicability.outcome).not.toBe('DOES_NOT_APPLY');
  });

  it('stores a deterministic snapshot and normalized value digest', async () => {
    await fact('number', { numberValue: '12.50' });
    const result = await createSnapshot('number', 'number');
    const again = await createSnapshot('number-again', 'number');
    expect(result.applicability.snapshotDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.applicability.snapshotDigest).not.toBe('');
    expect(result.applicability.facts[0].normalizedValueDigest).toMatch(/^[0-9a-f]{64}$/);
    expect((result.applicability.snapshotJson as any).normalizedValues[0].normalizedValue).toBe(12.5);
    expect(again.applicability.snapshotDigest).not.toBe(result.applicability.snapshotDigest);
  });

  it('rejects invalid approval pairs without creating a snapshot', async () => {
    const selected = await pair('invalid-pair');
    const before = await db.requirementApplicability.count();
    await expect(createRequirementApplicability({ requirementVersionId: selected.version.id, ruleVersionId: crypto.randomUUID(), clientId: clientA, scope }, db)).rejects.toMatchObject({ code: 'RULE_VERSION_NOT_FOUND' });
    expect(await db.requirementApplicability.count()).toBe(before);
  });

  it('rejects cross-client finding links and accepts same-client links', async () => {
    const result = await createSnapshot('finding-link');
    const assessmentA = await db.assessment.create({ data: { id: crypto.randomUUID(), clientId: clientA, type: 'D', title: 'A', createdByUserId: userId } });
    const assessmentB = await db.assessment.create({ data: { id: crypto.randomUUID(), clientId: clientB, type: 'D', title: 'B', createdByUserId: userId } });
    assessmentIds.push(assessmentA.id, assessmentB.id);
    await expect(db.assessmentFinding.create({ data: { clientId: clientB, assessmentId: assessmentB.id, title: 'cross', createdByUserId: userId, requirementApplicabilityId: result.applicability.id } })).rejects.toThrow();
    const finding = await db.assessmentFinding.create({ data: { clientId: clientA, assessmentId: assessmentA.id, title: 'same', createdByUserId: userId, requirementApplicabilityId: result.applicability.id } });
    expect(finding.requirementApplicabilityId).toBe(result.applicability.id);
    const legacy = await db.assessmentFinding.create({ data: { clientId: clientA, assessmentId: assessmentA.id, title: 'legacy', createdByUserId: userId } });
    expect(legacy.requirementApplicabilityId).toBeNull();
  });

  it('rejects semantic snapshot and provenance updates at the database boundary', async () => {
    const result = await createSnapshot('immutable');
    await expect(db.$executeRaw`UPDATE requirement_applicabilities SET outcome = 'DOES_NOT_APPLY' WHERE id = ${result.applicability.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE requirement_applicability_facts SET factKey = 'tampered' WHERE applicabilityId = ${result.applicability.id}`).rejects.toThrow();
  });

  it('blocks normal client deletion while a retained snapshot exists', async () => {
    const result = await createSnapshot('client-restrict');
    await expect(db.$executeRaw`DELETE FROM clients WHERE id = ${clientA}`).rejects.toThrow();
    await db.assessmentFinding.deleteMany({ where: { requirementApplicabilityId: result.applicability.id } });
  });

  it('keeps snapshot deletion structurally possible and cascades provenance', async () => {
    const result = await createSnapshot('purge-shape');
    const deleted = await db.requirementApplicability.delete({ where: { id: result.applicability.id } });
    expect(deleted.id).toBe(result.applicability.id);
    expect(await db.requirementApplicabilityFact.count({ where: { applicabilityId: result.applicability.id } })).toBe(0);
  });

  it('does not fall back to latest versions and leaves no row on C2 precondition failure', async () => {
    const before = await db.requirementApplicability.count();
    await expect(createRequirementApplicability({ requirementVersionId: crypto.randomUUID(), ruleVersionId: crypto.randomUUID(), clientId: clientA, scope }, db)).rejects.toBeInstanceOf(ComplianceEvaluationError);
    expect(await db.requirementApplicability.count()).toBe(before);
  });
});
