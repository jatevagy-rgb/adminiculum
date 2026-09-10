import crypto from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { getComplianceWorkspace } from '../src/modules/compliance/complianceWorkspaceService';

const databaseUrl = process.env.PHASE7CB_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const MUTATING = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', '$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe', '$transaction']);

describeWithDatabase('compliance workspace read model (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `WS_${suffix}`;
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const supersededVersionId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const extraRuleIds: string[] = [];
  const subjectA = crypto.randomUUID();
  const factDefId = crypto.randomUUID();
  const missingFactDefId = crypto.randomUUID();
  const clientFactId = crypto.randomUUID();
  const applicabilityIds: string[] = [];
  const dependencyIds: string[] = [];
  const applicabilityFactIds: string[] = [];
  const findingIds: string[] = [];
  const admin = { userId: adminId, role: 'ADMIN' };

  async function applicability(outcome: 'APPLIES' | 'DOES_NOT_APPLY' | 'INSUFFICIENT_FACTS', input: { clientId?: string; subjectId?: string | null; evaluationAt?: Date; specialist?: 'NONE' | 'LEGAL_ONLY'; sourceSupport?: 'SUFFICIENT' | 'MISSING'; missingFactKeys?: string[]; requirementVersionId?: string; ruleVersionId?: string; snapshotJson?: Prisma.InputJsonValue } = {}) {
    const id = crypto.randomUUID();
    applicabilityIds.push(id);
    await db.requirementApplicability.create({ data: {
      id, clientId: input.clientId || clientA, requirementVersionId: input.requirementVersionId || versionId, ruleVersionId: input.ruleVersionId || ruleId,
      ruleDigest: 'a'.repeat(64), outcome, scopeType: 'EMPLOYEE', factSubjectId: input.subjectId ?? subjectA,
      evaluationAt: input.evaluationAt || new Date(), sourceSupportState: input.sourceSupport || 'SUFFICIENT',
      specialistRequirement: input.specialist || 'NONE',
      schemaVersion: 'phase6-requirement-applicability/v1',
      snapshotJson: input.snapshotJson ?? { schemaVersion: 'phase6-requirement-applicability/v1', missingFactKeys: input.missingFactKeys ?? [] },
      snapshotDigest: 'b'.repeat(64),
    } });
    return id;
  }

  async function applicabilityFact(applicabilityId: string, factKey: string) {
    const id = crypto.randomUUID();
    applicabilityFactIds.push(id);
    await db.requirementApplicabilityFact.create({ data: {
      id, applicabilityId, clientFactId, factDefinitionId: factDefId, factKey, normalizedValueDigest: 'd'.repeat(64),
    } });
    return id;
  }

  async function finding(applicabilityId: string, status: 'OPEN' | 'RESOLVED' = 'OPEN') {
    const id = crypto.randomUUID();
    findingIds.push(id);
    await db.assessmentFinding.create({ data: {
      id, clientId: clientA, title: `Megállapítás ${id}`, description: 'd', recommendation: 'r',
      status, severity: 'HIGH', createdByUserId: adminId,
      requirementId, requirementApplicabilityId: applicabilityId, scopeType: 'EMPLOYEE', factSubjectId: subjectA,
    } });
    return id;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Workspace' } });
    await db.user.createMany({ data: [
      { id: adminId, email: `ws-admin-${suffix}@example.invalid`, name: 'WS Admin', role: 'ADMIN' },
      { id: lawyerId, email: `ws-lawyer-${suffix}@example.invalid`, name: 'WS Lawyer', role: 'LAWYER' },
    ] });
    await db.client.createMany({ data: [{ id: clientA, name: `WS Client A ${suffix}` }, { id: clientB, name: `WS Client B ${suffix}` }] });
    await db.clientOperatingProfile.create({ data: { clientId: clientA, complianceEnrollmentStatus: 'ENROLLED' } });
    await db.factDefinition.createMany({ data: [
      { id: factDefId, key: `fact_used_${suffix}`, domainCode, valueType: 'NUMBER', allowedScopeTypes: ['EMPLOYEE'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION', questionKey: 'employee_count' },
      { id: missingFactDefId, key: `fact_missing_${suffix}`, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['EMPLOYEE'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION', questionKey: 'employee_count' },
    ] });
    await db.factSubject.create({ data: { id: subjectA, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-${suffix}`, displayLabel: 'Minta munkavállaló' } });
    await db.clientFact.create({ data: {
      id: clientFactId, clientId: clientA, type: 'typed', value: '9', validFrom: new Date(),
      factDefinitionId: factDefId, scopeType: 'EMPLOYEE', factSubjectId: subjectA, numberValue: new Prisma.Decimal(9),
    } });
    await db.requirement.create({ data: { id: requirementId, key: `REQ_WS_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.createMany({ data: [
      { id: versionId, requirementId, versionKey: 'V1', title: 'Követelmény cím', normativeStatement: 'Pinned wording', effectiveFrom: new Date('2026-01-01T00:00:00Z'), status: 'APPROVED' },
      { id: supersededVersionId, requirementId, versionKey: 'V0', title: 'Korábbi követelmény cím', normativeStatement: 'Old wording', effectiveFrom: new Date('2025-01-01T00:00:00Z'), effectiveTo: new Date('2026-01-01T00:00:00Z'), status: 'SUPERSEDED', supersededById: versionId },
    ] });
    await db.applicabilityRuleVersion.create({ data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: 'c'.repeat(64), status: 'APPROVED' } });
    for (const [factKey, resolvedFactDefinitionId] of [[`fact_used_${suffix}`, factDefId], [`fact_missing_${suffix}`, missingFactDefId]] as const) {
      const id = crypto.randomUUID();
      dependencyIds.push(id);
      await db.applicabilityRuleFactDependency.create({ data: { id, applicabilityRuleVersionId: ruleId, factKey, resolvedFactDefinitionId } });
    }
  });

  afterEach(async () => {
    await db.requirementApplicabilityFact.deleteMany({ where: { applicabilityId: { in: applicabilityIds } } });
    await db.assessmentFinding.deleteMany({ where: { id: { in: findingIds } } });
    await db.requirementApplicability.deleteMany({ where: { id: { in: applicabilityIds } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: extraRuleIds } } });
    extraRuleIds.length = 0;
    applicabilityIds.length = 0;
    applicabilityFactIds.length = 0;
    findingIds.length = 0;
  });

  afterAll(async () => {
    await db.requirementApplicabilityFact.deleteMany({ where: { id: { in: applicabilityFactIds } } });
    await db.assessmentFinding.deleteMany({ where: { id: { in: findingIds } } });
    await db.requirementApplicability.deleteMany({ where: { id: { in: applicabilityIds } } });
    await db.applicabilityRuleFactDependency.deleteMany({ where: { id: { in: dependencyIds } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: [ruleId, ...extraRuleIds] } } });
    await db.requirementVersion.deleteMany({ where: { id: { in: [versionId, supersededVersionId] } } });
    await db.requirement.deleteMany({ where: { id: requirementId } });
    await db.clientFact.deleteMany({ where: { id: clientFactId } });
    await db.factSubject.deleteMany({ where: { id: subjectA } });
    await db.factDefinition.deleteMany({ where: { id: { in: [factDefId, missingFactDefId] } } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId: clientA } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.$disconnect();
  });

  it('surfaces a zero-finding evaluated DOES_NOT_APPLY state with the fact the engine used', async () => {
    const appId = await applicability('DOES_NOT_APPLY', { missingFactKeys: [`fact_missing_${suffix}`] });
    await applicabilityFact(appId, `fact_used_${suffix}`);
    const workspace = await getComplianceWorkspace(admin, clientA, db);
    expect(workspace.summary.enrollment).toBe('ENROLLED');
    expect(workspace.summary.evaluatedCount).toBe(1);
    expect(workspace.summary.doesNotApply).toBe(1);
    expect(workspace.summary.openFindings).toBe(0);
    const area = workspace.areas[0];
    expect(area).toMatchObject({ title: 'Követelmény cím', outcome: 'DOES_NOT_APPLY', scopeType: 'EMPLOYEE', subjectLabel: 'Minta munkavállaló', activeFindingId: null });
    expect(area.usedFacts).toEqual([{ factKey: `fact_used_${suffix}`, label: 'Number of employees', value: '9' }]);
    expect(area.missingFacts).toEqual([{ factKey: `fact_missing_${suffix}`, label: 'Number of employees', profileAnswerable: true }]);
    expect(JSON.stringify(area)).not.toMatch(/ruleAst|astJson|snapshot|ruleDigest/i);
  });

  it('projects an APPLIES outcome with its active finding and supersedes stale snapshots', async () => {
    const older = await applicability('DOES_NOT_APPLY', { evaluationAt: new Date('2026-01-02T00:00:00Z') });
    await applicabilityFact(older, `fact_used_${suffix}`);
    const newer = await applicability('APPLIES', { evaluationAt: new Date('2026-01-03T00:00:00Z') });
    await applicabilityFact(newer, `fact_used_${suffix}`);
    const findingId = await finding(newer);
    const workspace = await getComplianceWorkspace(admin, clientA, db);
    expect(workspace.areas).toHaveLength(1);
    expect(workspace.areas[0]).toMatchObject({ applicabilityId: newer, outcome: 'APPLIES', activeFindingId: findingId });
    expect(workspace.summary.applies).toBe(1);
    expect(workspace.summary.openFindings).toBe(1);
    expect(workspace.evaluatedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('reports insufficient-facts and review-required outcomes truthfully', async () => {
    const id = await applicability('INSUFFICIENT_FACTS', { sourceSupport: 'MISSING', specialist: 'LEGAL_ONLY', missingFactKeys: [`fact_missing_${suffix}`] });
    const workspace = await getComplianceWorkspace(admin, clientA, db);
    const area = workspace.areas.find((item) => item.applicabilityId === id)!;
    expect(area.outcome).toBe('INSUFFICIENT_FACTS');
    expect(area.sourceSupportState).toBe('MISSING');
    expect(area.specialistRequirement).toBe('LEGAL_ONLY');
    expect(area.usedFacts).toEqual([]);
    expect(area.missingFacts).toEqual([{ factKey: `fact_missing_${suffix}`, label: 'Number of employees', profileAnswerable: true }]);
  });

  it('never labels an unconsumed dependency as missing when the persisted missingFactKeys is empty', async () => {
    // Malformed/conflicting or early-stopped evaluation: the fact exists but was
    // not consumed — the persisted snapshot (not the dependency list) decides.
    const id = await applicability('INSUFFICIENT_FACTS', { missingFactKeys: [] });
    const workspace = await getComplianceWorkspace(admin, clientA, db);
    const area = workspace.areas.find((item) => item.applicabilityId === id)!;
    expect(area.outcome).toBe('INSUFFICIENT_FACTS');
    expect(area.missingFacts).toEqual([]);
  });

  it('excludes snapshots from superseded requirement versions and superseded rules', async () => {
    const staleVersionRow = await applicability('APPLIES', { requirementVersionId: supersededVersionId });
    const supersededRule = crypto.randomUUID();
    extraRuleIds.push(supersededRule);
    await db.applicabilityRuleVersion.create({ data: {
      id: supersededRule, requirementVersionId: versionId, ruleVersionKey: 'R0', schemaVersion: 'rule-ast/v1',
      astJson: { node: 'old' }, canonicalDigest: 'f'.repeat(64), status: 'APPROVED', supersededById: ruleId,
    } });
    const staleRuleRow = await applicability('APPLIES', { ruleVersionId: supersededRule });
    const current = await applicability('APPLIES', { missingFactKeys: [] });
    const workspace = await getComplianceWorkspace(admin, clientA, db);
    expect(workspace.areas.map((area) => area.applicabilityId)).toEqual([current]);
    expect(workspace.summary.evaluatedCount).toBe(1);
    expect(workspace.areas.find((area) => area.applicabilityId === staleVersionRow)).toBeUndefined();
    expect(workspace.areas.find((area) => area.applicabilityId === staleRuleRow)).toBeUndefined();
  });

  it('enforces client isolation and read access', async () => {
    const aId = await applicability('DOES_NOT_APPLY');
    const bId = await applicability('APPLIES', { clientId: clientB, subjectId: null });
    await expect(getComplianceWorkspace({ userId: lawyerId, role: 'LAWYER' }, clientA, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    await expect(getComplianceWorkspace({ userId: lawyerId, role: 'LAWYER' }, clientB, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    const workspaceB = await getComplianceWorkspace(admin, clientB, db);
    expect(workspaceB.areas).toHaveLength(1);
    expect(workspaceB.areas[0].applicabilityId).toBe(bId);
    const workspaceA = await getComplianceWorkspace(admin, clientA, db);
    expect(workspaceA.areas.map((area) => area.applicabilityId)).toEqual([aId]);
  });

  it('performs no mutations or rule evaluation when read', async () => {
    await applicability('DOES_NOT_APPLY');
    let mutations = 0;
    const guard = (target: object) => new Proxy(target, { get(delegate, method) {
      const original = Reflect.get(delegate, method);
      if (typeof original !== 'function') return original;
      if (MUTATING.has(String(method))) {
        return () => { mutations += 1; throw new Error(`mutation attempted: ${String(method)}`); };
      }
      return original.bind(delegate);
    } });
    const counted = new Proxy(db, { get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value === 'object' && value !== null && typeof (value as { findMany?: unknown }).findMany === 'function') return guard(value as object);
      if (typeof value === 'function' && MUTATING.has(String(property))) {
        return () => { mutations += 1; throw new Error(`mutation attempted: ${String(property)}`); };
      }
      return value;
    } }) as unknown as PrismaClient;
    const workspace = await getComplianceWorkspace(admin, clientA, counted);
    expect(workspace.areas.length).toBeGreaterThan(0);
    expect(mutations).toBe(0);
  });
});
