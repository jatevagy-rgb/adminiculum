import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { canonicalDigest } from '../src/modules/compliance/canonicalDigest';
import {
  addRequirementCitation,
  approveApplicabilityRuleVersion,
  approveRequirementVersion,
  createApplicabilityRuleVersion,
  createRequirement,
  createRequirementVersion,
  supersedeApplicabilityRuleVersion,
  supersedeRequirementVersion,
  updateRequirementVersion,
} from '../src/modules/compliance/requirementRuleService';

const databaseUrl = process.env.COMPLIANCE_SLICE_B_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Phase 6 Slice B requirement/rule foundation (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `TEST_${suffix}`;
  const factBoolean = crypto.randomUUID();
  const factMoney = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const sourceVersionOld = crypto.randomUUID();
  const sourceVersionNew = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const requirementBId = crypto.randomUUID();
  const overlapRequirementId = crypto.randomUUID();
  const versionA1 = crypto.randomUUID();
  const versionA2 = crypto.randomUUID();
  const versionB1 = crypto.randomUUID();
  const versionOverlap1 = crypto.randomUUID();
  const versionOverlap2 = crypto.randomUUID();
  const ruleA1 = crypto.randomUUID();
  const ruleA2 = crypto.randomUUID();
  const ruleB1 = crypto.randomUUID();
  const unsupportedRule = crypto.randomUUID();

  const ast = (factKey: string) => ({
    schemaVersion: 'rule-ast/v1',
    node: {
      kind: 'COMPARE',
      operator: 'EQ',
      left: { kind: 'FACT', factKey },
      right: { kind: 'LITERAL', valueType: 'boolean', value: true },
    },
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Slice B test domain' } });
    await db.factDefinition.createMany({ data: [
      { id: factBoolean, key: `SLICE_B_BOOLEAN_${suffix}`, domainCode: 'TEST', valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
      { id: factMoney, key: `SLICE_B_MONEY_${suffix}`, domainCode: 'TEST', valueType: 'MONEY', allowedScopeTypes: ['COMPANY'], determinationMethod: 'LEGAL_CLASSIFICATION_REQUIRED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' },
    ] });
    await db.legalSource.create({ data: { id: sourceId, sourceKey: `slice-b-source-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'CANDIDATE', updatedAt: new Date() } });
    await db.legalSourceVersion.createMany({ data: [
      { id: sourceVersionOld, legalSourceId: sourceId, legalVersionKey: 'old', effectiveFrom: new Date('2024-01-01T00:00:00Z'), status: 'ACTIVE', reviewStatus: 'APPROVED' },
      { id: sourceVersionNew, legalSourceId: sourceId, legalVersionKey: 'new', effectiveFrom: new Date('2025-01-01T00:00:00Z'), status: 'ACTIVE', reviewStatus: 'APPROVED' },
    ] });
    await createRequirement({ key: `REQ_SLICE_B_${suffix}`, jurisdictionCode: 'HU', domainCode, db });
    await db.requirement.update({ where: { key: `REQ_SLICE_B_${suffix}` }, data: { id: requirementId } });
    await db.requirement.create({ data: { id: requirementBId, key: `REQ_SLICE_B_OTHER_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirement.create({ data: { id: overlapRequirementId, key: `REQ_SLICE_B_OVERLAP_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await createRequirementVersion({ requirementId, versionKey: 'A1', title: 'A1', normativeStatement: 'A1 statement', effectiveFrom: new Date('2024-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db });
    await db.requirementVersion.update({ where: { requirementId_versionKey: { requirementId, versionKey: 'A1' } }, data: { id: versionA1 } });
    await createRequirementVersion({ requirementId, versionKey: 'A2', title: 'A2', normativeStatement: 'A2 statement', effectiveFrom: new Date('2025-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db });
    await db.requirementVersion.update({ where: { requirementId_versionKey: { requirementId, versionKey: 'A2' } }, data: { id: versionA2 } });
    await createRequirementVersion({ requirementId: requirementBId, versionKey: 'B1', title: 'B1', normativeStatement: 'B1 statement', effectiveFrom: new Date('2024-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db });
    await db.requirementVersion.update({ where: { requirementId_versionKey: { requirementId: requirementBId, versionKey: 'B1' } }, data: { id: versionB1 } });
    await createRequirementVersion({ requirementId: overlapRequirementId, versionKey: 'O1', title: 'O1', normativeStatement: 'O1 statement', effectiveFrom: new Date('2024-01-01T00:00:00Z'), effectiveTo: new Date('2025-06-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db });
    await db.requirementVersion.update({ where: { requirementId_versionKey: { requirementId: overlapRequirementId, versionKey: 'O1' } }, data: { id: versionOverlap1 } });
    await createRequirementVersion({ requirementId: overlapRequirementId, versionKey: 'O2', title: 'O2', normativeStatement: 'O2 statement', effectiveFrom: new Date('2025-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', db });
    await db.requirementVersion.update({ where: { requirementId_versionKey: { requirementId: overlapRequirementId, versionKey: 'O2' } }, data: { id: versionOverlap2 } });
  });

  afterAll(async () => {
    await db?.applicabilityRuleVersion.deleteMany({ where: { requirementVersion: { requirementId: { in: [requirementId, requirementBId, overlapRequirementId] } } } });
    await db?.requirementVersion.deleteMany({ where: { requirementId: { in: [requirementId, requirementBId, overlapRequirementId] } } });
    await db?.requirement.deleteMany({ where: { id: { in: [requirementId, requirementBId, overlapRequirementId] } } });
    await db?.legalSourceVersion.deleteMany({ where: { id: { in: [sourceVersionOld, sourceVersionNew] } } });
    await db?.legalSource.deleteMany({ where: { id: sourceId } });
    await db?.factDefinition.deleteMany({ where: { id: { in: [factBoolean, factMoney] } } });
    await db?.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db?.$disconnect();
  });

  it('enforces unique Requirement identity and permits multiple versions', async () => {
    await expect(db.requirement.create({ data: { id: crypto.randomUUID(), key: `REQ_SLICE_B_${suffix}`, jurisdictionCode: 'HU', domainCode } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.requirementVersion.count({ where: { requirementId } })).toBe(2);
  });

  it('rejects RequirementVersion self-supersession and cross-Requirement supersession', async () => {
    await expect(supersedeRequirementVersion(versionA1, versionA1, db)).rejects.toMatchObject({ code: 'SELF_SUPERSESSION' });
    await expect(supersedeRequirementVersion(versionA1, versionB1, db)).rejects.toMatchObject({ code: 'CROSS_REQUIREMENT_SUPERSESSION' });
  });

  it('pins citations to the exact LegalSourceVersion', async () => {
    const citation = await addRequirementCitation({ requirementVersionId: versionA1, legalSourceVersionId: sourceVersionOld, supportRole: 'PRIMARY', article: '1', db });
    await db.legalSourceVersion.update({ where: { id: sourceVersionNew }, data: { versionLabel: 'newer source version' } });
    const stored = await db.requirementCitation.findUnique({ where: { id: citation.id } });
    expect(stored?.legalSourceVersionId).toBe(sourceVersionOld);
  });

  it('allows multiple candidate rules and derives exact FACT dependencies', async () => {
    const key = `SLICE_B_BOOLEAN_${suffix}`;
    const first = await createApplicabilityRuleVersion({ requirementVersionId: versionA1, ruleVersionKey: 'R1', astJson: ast(key), db });
    const firstStored = await db.applicabilityRuleVersion.update({ where: { id: first.id }, data: { id: ruleA1 } });
    const second = await createApplicabilityRuleVersion({ requirementVersionId: versionA1, ruleVersionKey: 'R2', astJson: ast(key), db });
    await db.applicabilityRuleVersion.update({ where: { id: second.id }, data: { id: ruleA2 } });
    expect(await db.applicabilityRuleVersion.count({ where: { requirementVersionId: versionA1, status: 'CANDIDATE' } })).toBe(2);
    const dependencies = await db.applicabilityRuleFactDependency.findMany({ where: { applicabilityRuleVersionId: firstStored.id } });
    expect(dependencies.map((dependency) => dependency.factKey)).toEqual([key]);
    expect(dependencies[0].resolvedFactDefinitionId).toBe(factBoolean);
  });

  it('rejects invalid AST and unsupported schema before persistence', async () => {
    const before = await db.applicabilityRuleVersion.count();
    await expect(createApplicabilityRuleVersion({ requirementVersionId: versionA2, ruleVersionKey: 'INVALID', astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'NOPE' } }, db })).rejects.toMatchObject({ code: 'RULE_AST_INVALID' });
    await expect(createApplicabilityRuleVersion({ requirementVersionId: versionA2, ruleVersionKey: 'UNSUPPORTED', astJson: { schemaVersion: 'rule-ast/v2', node: ast(`SLICE_B_BOOLEAN_${suffix}`).node }, db })).rejects.toMatchObject({ code: 'RULE_AST_INVALID' });
    expect(await db.applicabilityRuleVersion.count()).toBe(before);
  });

  it('rejects a supplied digest mismatch and preserves deterministic JSONB digest', async () => {
    const rule = await createApplicabilityRuleVersion({ requirementVersionId: versionA2, ruleVersionKey: 'DIGEST', astJson: ast(`SLICE_B_BOOLEAN_${suffix}`), canonicalDigest: '0'.repeat(64), db }).catch((error) => error);
    expect(rule).toMatchObject({ code: 'DIGEST_MISMATCH' });
    const stored = await db.applicabilityRuleVersion.findFirstOrThrow({ where: { requirementVersionId: versionA1, ruleVersionKey: 'R1' } });
    expect(stored.canonicalDigest).toBe(canonicalDigest(stored.astJson));
  });

  it('requires explicit approval and enforces one approved rule in the database', async () => {
    expect((await db.applicabilityRuleVersion.findUniqueOrThrow({ where: { id: ruleA1 } })).status).toBe('CANDIDATE');
    await db.requirementVersion.update({ where: { id: versionA1 }, data: { status: 'APPROVED', approvedAt: new Date() } });
    await approveApplicabilityRuleVersion(ruleA1, db);
    await expect(approveApplicabilityRuleVersion(ruleA2, db)).rejects.toThrow();
  });

  it('rejects rule self-supersession and cross-parent supersession', async () => {
    await expect(supersedeApplicabilityRuleVersion(ruleA1, ruleA1, db)).rejects.toMatchObject({ code: 'SELF_SUPERSESSION' });
    const other = await createApplicabilityRuleVersion({ requirementVersionId: versionB1, ruleVersionKey: 'B1', astJson: ast(`SLICE_B_BOOLEAN_${suffix}`), db });
    await db.applicabilityRuleVersion.update({ where: { id: other.id }, data: { id: ruleB1 } });
    await expect(supersedeApplicabilityRuleVersion(ruleA1, ruleB1, db)).rejects.toMatchObject({ code: 'CROSS_RULE_PARENT_SUPERSESSION' });
  });

  it('blocks approval for unsupported fact types and unresolved dependencies', async () => {
    await db.requirementVersion.update({ where: { id: versionA2 }, data: { status: 'APPROVED', approvedAt: new Date() } });
    const unsupported = await createApplicabilityRuleVersion({ requirementVersionId: versionA2, ruleVersionKey: 'MONEY', astJson: ast(`SLICE_B_MONEY_${suffix}`), db });
    await db.applicabilityRuleVersion.update({ where: { id: unsupported.id }, data: { id: unsupportedRule } });
    await expect(approveApplicabilityRuleVersion(unsupportedRule, db)).rejects.toMatchObject({ code: 'UNSUPPORTED_FACT_TYPE' });
    const unresolved = await createApplicabilityRuleVersion({ requirementVersionId: versionA2, ruleVersionKey: 'UNRESOLVED', astJson: ast('UNKNOWN_FACT'), db });
    await expect(approveApplicabilityRuleVersion(unresolved.id, db)).rejects.toMatchObject({ code: 'UNRESOLVED_FACT_DEPENDENCY' });
  });

  it('blocks insufficient source support, overlapping approval, and approved mutation', async () => {
    const incomplete = await createRequirementVersion({ requirementId, versionKey: 'INCOMPLETE', title: 'Incomplete', normativeStatement: 'Incomplete', effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'INCOMPLETE', db });
    await expect(approveRequirementVersion(incomplete.id, db)).rejects.toMatchObject({ code: 'SOURCE_SUPPORT_INSUFFICIENT' });
    await approveRequirementVersion(versionOverlap1, db);
    await expect(approveRequirementVersion(versionOverlap2, db)).rejects.toMatchObject({ code: 'EFFECTIVE_PERIOD_OVERLAP' });
    await expect(updateRequirementVersion(versionA1, { title: 'mutated after approval' }, db)).rejects.toMatchObject({ code: 'APPROVED_VERSION_IMMUTABLE' });
  });

  it('persists specialist metadata independently from the compliance domain', async () => {
    const version = await createRequirementVersion({ requirementId, versionKey: 'SPECIALIST', title: 'Specialist', normativeStatement: 'Specialist', effectiveFrom: new Date('2027-01-01T00:00:00Z'), sourceSupportState: 'AMBIGUOUS', specialistRequirement: 'TECHNICAL_CLASSIFICATION_REQUIRED', specialistDomainCode: 'TECH', db });
    expect(version.specialistRequirement).toBe('TECHNICAL_CLASSIFICATION_REQUIRED');
    expect(version.specialistDomainCode).toBe('TECH');
    expect((await db.requirement.findUniqueOrThrow({ where: { id: requirementId } })).domainCode).toBe(domainCode);
  });

  it('stores the frozen AST schema version and server-computed digest', async () => {
    const stored = await db.applicabilityRuleVersion.findUniqueOrThrow({ where: { id: ruleA1 } });
    expect(stored.schemaVersion).toBe('rule-ast/v1');
    expect(stored.canonicalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.canonicalDigest).toBe(canonicalDigest(stored.astJson));
  });

  it('keeps unresolved dependencies explicit on candidate rules', async () => {
    const rule = await db.applicabilityRuleVersion.findFirstOrThrow({ where: { requirementVersionId: versionA2, ruleVersionKey: 'UNRESOLVED' }, include: { dependencies: true } });
    expect(rule.status).toBe('CANDIDATE');
    expect(rule.dependencies).toEqual([expect.objectContaining({ factKey: 'UNKNOWN_FACT', resolvedFactDefinitionId: null })]);
  });

  it('preserves structured citation metadata without executable interpretation', async () => {
    const citation = await addRequirementCitation({ requirementVersionId: versionA2, legalSourceVersionId: sourceVersionOld, supportRole: 'SUPPORTING', section: '2.1', metadata: { sourceLabel: 'archival' }, db });
    const stored = await db.requirementCitation.findUniqueOrThrow({ where: { id: citation.id } });
    expect(stored.section).toBe('2.1');
    expect(stored.metadata).toEqual({ sourceLabel: 'archival' });
  });

  it('retains candidate status until an explicit approval call', async () => {
    const candidate = await db.applicabilityRuleVersion.findFirstOrThrow({ where: { requirementVersionId: versionA2, ruleVersionKey: 'MONEY' } });
    expect(candidate.status).toBe('CANDIDATE');
  });

  it('rejects deleting a Requirement that still has versions', async () => {
    await expect(db.requirement.delete({ where: { id: requirementId } })).rejects.toThrow();
  });

  it('rejects deleting a RequirementVersion that still owns rules', async () => {
    await expect(db.requirementVersion.delete({ where: { id: versionA1 } })).rejects.toThrow();
  });

  it('rejects an invalid effective period at the service boundary', async () => {
    await expect(createRequirementVersion({ requirementId, versionKey: 'BAD_RANGE', title: 'Bad range', normativeStatement: 'Bad range', effectiveFrom: new Date('2028-01-01T00:00:00Z'), effectiveTo: new Date('2027-01-01T00:00:00Z'), db })).rejects.toMatchObject({ code: 'INVALID_EFFECTIVE_RANGE' });
  });

  it('rejects executable AST escape-hatch fields', async () => {
    await expect(createApplicabilityRuleVersion({ requirementVersionId: versionA2, ruleVersionKey: 'EXECUTABLE', astJson: { ...ast(`SLICE_B_BOOLEAN_${suffix}`), expression: 'x => x' }, db })).rejects.toMatchObject({ code: 'RULE_AST_INVALID' });
  });

  it('keeps exact source-version citations stable after source metadata changes', async () => {
    await db.legalSourceVersion.update({ where: { id: sourceVersionNew }, data: { versionLabel: 'replacement' } });
    const citations = await db.requirementCitation.findMany({ where: { requirementVersionId: versionA1 } });
    expect(citations.every((citation) => citation.legalSourceVersionId === sourceVersionOld)).toBe(true);
  });

  it('retains all candidate RequirementVersions even when approval is rejected', async () => {
    const candidates = await db.requirementVersion.count({ where: { requirementId, status: 'CANDIDATE' } });
    expect(candidates).toBeGreaterThanOrEqual(2);
  });
});
