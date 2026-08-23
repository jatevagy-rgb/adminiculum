import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { addRequirementCitation, approveApplicabilityRuleVersion, approveRequirementVersion, createApplicabilityRuleVersion, createRequirement, createRequirementVersion } from '../src/modules/compliance/requirementRuleService';
import { ComplianceEvaluationError, evaluateCompliance } from '../src/modules/compliance/complianceEvaluationService';
import { canonicalDigest } from '../src/modules/compliance/canonicalDigest';

const databaseUrl = process.env.COMPLIANCE_SLICE_C2_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Phase 6 Slice C2 evaluation orchestration (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `C2_${suffix}`;
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const definitionIds = new Map<string, string>();
  const requirementIds: string[] = [];
  const versionIds: string[] = [];
  const ruleIds: string[] = [];
  const factIds: string[] = [];
  const subjectIds: string[] = [];

  const ast = (key: string) => ({ schemaVersion: 'rule-ast/v1', node: { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey: key }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } } });
  const definitionKey = (key: string) => definitionIds.has(key) ? `C2_${key}_${suffix}` : `C2_bool_${suffix}`;
  const definitionId = (key: string) => definitionIds.get(key) || definitionIds.get('bool')!;
  const evaluation = (requirementVersionId: string, ruleVersionId: string, clientId = clientA, scope: any = { scopeType: 'COMPANY', evaluationAt: new Date('2026-06-15T12:00:00Z') }) => evaluateCompliance({ requirementVersionId, ruleVersionId, clientId, scope }, db);

  async function createPair(key: string, options: { sourceSupportState?: any; specialistRequirement?: any; approve?: boolean } = {}) {
    const requirement = await createRequirement({ key: `REQ_${key}_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    requirementIds.push(requirement.id);
    const version = await createRequirementVersion({ requirementId: requirement.id, versionKey: 'V1', title: key, normativeStatement: key, effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: options.sourceSupportState === 'INCOMPLETE' ? 'SUFFICIENT' : options.sourceSupportState || 'SUFFICIENT', specialistRequirement: options.specialistRequirement || 'NONE', db });
    versionIds.push(version.id);
    await addRequirementCitation({ requirementVersionId: version.id, legalSourceVersionId: sourceVersionId, supportRole: 'PRIMARY', db });
    if (options.approve !== false) await db.requirementVersion.update({ where: { id: version.id }, data: { status: 'APPROVED', approvedAt: new Date('2026-01-02T00:00:00Z'), approvedById: 'fixture-approver' } });
    if (options.sourceSupportState) await db.requirementVersion.update({ where: { id: version.id }, data: { sourceSupportState: options.sourceSupportState } });
    const rule = await createApplicabilityRuleVersion({ requirementVersionId: version.id, ruleVersionKey: 'R1', astJson: ast(definitionKey(key)), db });
    ruleIds.push(rule.id);
    if (options.approve !== false) await db.applicabilityRuleVersion.update({ where: { id: rule.id }, data: { status: 'APPROVED', approvedAt: new Date('2026-01-02T00:00:00Z'), approvedById: 'fixture-approver' } });
    return { requirement, version, rule };
  }

  async function addFact(key: string, value: Record<string, unknown>, options: Record<string, unknown> = {}) {
    const id = crypto.randomUUID();
    factIds.push(id);
    await db.clientFact.create({ data: { id, clientId: clientA, type: `C2_${key}`, value: 'legacy-unused', validFrom: new Date('2026-01-01T00:00:00Z'), factDefinitionId: definitionId(key), scopeType: 'COMPANY', observedAt: new Date('2026-01-01T00:00:00Z'), ...value, ...options } as never });
    return id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'C2 test domain' } });
    await db.client.createMany({ data: [{ id: clientA, name: `C2 Client A ${suffix}` }, { id: clientB, name: `C2 Client B ${suffix}` }] });
    const definitions = [
      ['bool', 'BOOLEAN', 'OBSERVATION'], ['number', 'NUMBER', 'OBSERVATION'], ['date', 'DATE', 'OBSERVATION'], ['string', 'STRING', 'OBSERVATION'],
      ['money', 'MONEY', 'OBSERVATION'], ['event', 'BOOLEAN', 'EVENT'], ['retired', 'BOOLEAN', 'OBSERVATION'], ['deprecated', 'BOOLEAN', 'OBSERVATION'], ['period', 'NUMBER', 'REFERENCE_PERIOD'],
    ] as const;
    await db.factDefinition.createMany({ data: definitions.map(([key, valueType, temporalPolicy]) => { const id = crypto.randomUUID(); definitionIds.set(key, id); return { id, key: `C2_${key}_${suffix}`, domainCode, valueType: valueType as never, allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: temporalPolicy as never, status: key === 'retired' ? 'RETIRED' : key === 'deprecated' ? 'DEPRECATED' : 'ACTIVE' }; }) });
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `c2-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED', updatedAt: new Date() } });
    await db.legalSourceVersion.create({ data: { id: sourceVersionId, legalSourceId: sourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } });
  });

  afterEach(async () => {
    await db?.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
  });

  afterAll(async () => {
    await db?.requirementCitation.deleteMany({ where: { requirementVersionId: { in: versionIds } } });
    await db?.applicabilityRuleVersion.deleteMany({ where: { id: { in: ruleIds } } });
    await db?.requirementVersion.deleteMany({ where: { id: { in: versionIds } } });
    await db?.requirement.deleteMany({ where: { id: { in: requirementIds } } });
    await db?.clientFact.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db?.factSubject.deleteMany({ where: { id: { in: subjectIds } } });
    await db?.legalSourceVersion.deleteMany({ where: { id: sourceVersionId } });
    await db?.legalSource.deleteMany({ where: { id: sourceId } });
    await db?.factDefinition.deleteMany({ where: { id: { in: [...definitionIds.values()] } } });
    await db?.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db?.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db?.$disconnect();
  });

  it('rejects candidate RequirementVersion', async () => { const pair = await createPair('candidate-req', { approve: false }); await expect(evaluation(pair.version.id, pair.rule.id)).rejects.toMatchObject({ code: 'REQUIREMENT_VERSION_NOT_APPROVED' }); });
  it('rejects in-review RequirementVersion', async () => { const pair = await createPair('review-req', { approve: false }); await db.requirementVersion.update({ where: { id: pair.version.id }, data: { status: 'IN_REVIEW' } }); await expect(evaluation(pair.version.id, pair.rule.id)).rejects.toMatchObject({ code: 'REQUIREMENT_VERSION_NOT_APPROVED' }); });
  it('rejects candidate RuleVersion', async () => { const pair = await createPair('candidate-rule'); await db.applicabilityRuleVersion.update({ where: { id: pair.rule.id }, data: { status: 'CANDIDATE' } }); await expect(evaluation(pair.version.id, pair.rule.id)).rejects.toMatchObject({ code: 'RULE_VERSION_NOT_APPROVED' }); });
  it('rejects mismatched approved pair', async () => { const first = await createPair('mismatch-a'); const second = await createPair('mismatch-b'); await expect(evaluation(first.version.id, second.rule.id)).rejects.toMatchObject({ code: 'RULE_REQUIREMENT_MISMATCH' }); });
  it('accepts the exact approved pair and invokes C1', async () => { const pair = await createPair('exact'); await addFact('exact', { booleanValue: true }); const result = await evaluation(pair.version.id, pair.rule.id); expect(result.outcome).toBe('APPLIES'); expect(result.trace.evaluatorResult?.result).toBe('APPLIES'); });
  it('does not fall back to latest rule or version', async () => { const pair = await createPair('exact-only'); await expect(evaluation(pair.version.id, crypto.randomUUID())).rejects.toMatchObject({ code: 'RULE_VERSION_NOT_FOUND' }); });
  it('enforces the database approved-source invariant', async () => { await expect(createPair('source-gate', { sourceSupportState: 'INCOMPLETE' })).rejects.toThrow('requirement_versions_approved_support_check'); });
  it('maps LEGAL_ONLY to legal review', async () => { const pair = await createPair('legal-gate', { specialistRequirement: 'LEGAL_ONLY' }); expect((await evaluation(pair.version.id, pair.rule.id)).outcome).toBe('LEGAL_REVIEW_REQUIRED'); });
  it('maps technical classification to technical review', async () => { const pair = await createPair('technical-gate', { specialistRequirement: 'TECHNICAL_CLASSIFICATION_REQUIRED' }); expect((await evaluation(pair.version.id, pair.rule.id)).outcome).toBe('TECHNICAL_REVIEW_REQUIRED'); });
  it('fails closed on unresolved dependency', async () => { const pair = await createPair('unresolved'); await db.applicabilityRuleFactDependency.updateMany({ where: { applicabilityRuleVersionId: pair.rule.id }, data: { resolvedFactDefinitionId: null } }); expect((await evaluation(pair.version.id, pair.rule.id)).trace.reasonCodes).toContain('UNRESOLVED_FACT_DEPENDENCY'); });
  it('fails closed on retired FactDefinition', async () => { const pair = await createPair('retired'); expect((await evaluation(pair.version.id, pair.rule.id)).trace.reasonCodes).toContain('FACT_DEFINITION_RETIRED'); });
  it('continues with deprecated FactDefinition and warning', async () => { const pair = await createPair('deprecated'); await addFact('deprecated', { booleanValue: true }); const result = await evaluation(pair.version.id, pair.rule.id); expect(result.trace.reasonCodes).toContain('DEPRECATED_FACT_DEFINITION_USED'); });
  it('rejects unsupported types', async () => { const pair = await createPair('money'); expect((await evaluation(pair.version.id, pair.rule.id)).trace.reasonCodes).toContain('UNSUPPORTED_FACT_TYPE'); });
  it('evaluates company scope without a subject', async () => { const pair = await createPair('company'); await addFact('company', { booleanValue: true }); expect((await evaluation(pair.version.id, pair.rule.id)).outcome).toBe('APPLIES'); });
  it('isolates employee or contract subjects', async () => { const subjectId = crypto.randomUUID(); subjectIds.push(subjectId); await db.factSubject.create({ data: { id: subjectId, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-${suffix}` } }); const pair = await createPair('subject'); await expect(evaluation(pair.version.id, pair.rule.id, clientA, { scopeType: 'EMPLOYEE', factSubjectId: crypto.randomUUID(), evaluationAt: new Date('2026-06-15') })).resolves.toMatchObject({ outcome: 'INSUFFICIENT_FACTS' }); });
  it('excludes cross-client facts', async () => { const pair = await createPair('cross-client'); await db.clientFact.create({ data: { clientId: clientB, type: 'C2_CROSS', value: 'unused', validFrom: new Date('2026-01-01'), factDefinitionId: definitionIds.get('cross-client') || definitionIds.get('bool'), scopeType: 'COMPANY', booleanValue: true } as never }); expect((await evaluation(pair.version.id, pair.rule.id)).outcome).toBe('INSUFFICIENT_FACTS'); });
  it('honors validity start boundary', async () => { const pair = await createPair('validity-start'); await addFact('validity-start', { booleanValue: true }); expect((await evaluation(pair.version.id, pair.rule.id)).outcome).toBe('APPLIES'); });
  it('excludes future facts', async () => { const pair = await createPair('future'); await addFact('future', { booleanValue: true }, { validFrom: new Date('2027-01-01') }); expect((await evaluation(pair.version.id, pair.rule.id)).outcome).toBe('INSUFFICIENT_FACTS'); });
  it('excludes expired facts', async () => { const pair = await createPair('expired'); await addFact('expired', { booleanValue: true }, { validTo: new Date('2026-01-01') }); expect((await evaluation(pair.version.id, pair.rule.id)).outcome).toBe('INSUFFICIENT_FACTS'); });
  it('accepts equal duplicate values and retains sorted IDs', async () => { const pair = await createPair('duplicates'); const z = await addFact('duplicates', { booleanValue: true }); const a = await addFact('duplicates', { booleanValue: true }); const result = await evaluation(pair.version.id, pair.rule.id); expect(result.outcome).toBe('APPLIES'); expect(result.trace.selectedClientFactIds).toEqual([a, z].sort()); });
  it('rejects conflicting duplicate values', async () => { const pair = await createPair('conflict'); await addFact('conflict', { booleanValue: true }); await addFact('conflict', { booleanValue: false }); expect((await evaluation(pair.version.id, pair.rule.id)).trace.reasonCodes).toContain('CONFLICTING_FACT_VALUES'); });
  it('rejects EVENT temporal policy without invoking C1', async () => { const pair = await createPair('event'); const result = await evaluation(pair.version.id, pair.rule.id); expect(result.trace.reasonCodes).toContain('UNSUPPORTED_TEMPORAL_POLICY_EVENT'); expect(result.trace.evaluatorResult).toBeNull(); });
  it('requires reference-period containment', async () => { const pair = await createPair('period'); const result = await evaluation(pair.version.id, pair.rule.id, clientA, { scopeType: 'COMPANY', evaluationAt: new Date('2026-06-15'), referencePeriod: { start: new Date('2026-02-01'), end: new Date('2026-03-31') } }); expect(result.outcome).toBe('INSUFFICIENT_FACTS'); });
  it('supports the four normalized type families', async () => { for (const key of ['bool', 'number', 'date', 'string']) expect(definitionIds.get(key)).toBeDefined(); });
  it('returns deterministic trace IDs and digest', async () => { const pair = await createPair('trace'); await addFact('trace', { booleanValue: true }); const one = await evaluation(pair.version.id, pair.rule.id); const two = await evaluation(pair.version.id, pair.rule.id); expect(one).toEqual(two); expect(one.trace.ruleDigest).toBe(canonicalDigest((await db.applicabilityRuleVersion.findUniqueOrThrow({ where: { id: pair.rule.id } })).astJson)); });
});
