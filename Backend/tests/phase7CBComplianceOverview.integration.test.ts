import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getComplianceOverview } from '../src/modules/compliance/complianceOverviewService';

const databaseUrl = process.env.PHASE7CB_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Phase 7C-B compliance overview (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `7CB_${suffix}`;
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const oldVersionId = crypto.randomUUID();
  const newVersionId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const subjectA = crypto.randomUUID();
  const subjectB = crypto.randomUUID();
  const applicabilityIds: string[] = [];
  const findingIds: string[] = [];
  const admin = { userId: adminId, role: 'ADMIN' };

  async function applicability(outcome: 'APPLIES' | 'DOES_NOT_APPLY' = 'APPLIES') {
    const id = crypto.randomUUID();
    applicabilityIds.push(id);
    await db.requirementApplicability.create({ data: {
      id, clientId: clientA, requirementVersionId: oldVersionId, ruleVersionId: ruleId,
      ruleDigest: 'a'.repeat(64), outcome, scopeType: 'EMPLOYEE', factSubjectId: subjectA,
      evaluationAt: new Date(), sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE',
      schemaVersion: 'phase6-requirement-applicability/v1', snapshotJson: { internal: true }, snapshotDigest: 'b'.repeat(64),
    } });
    return id;
  }

  async function finding(input: { applicabilityId?: string; subjectId?: string | null; status?: 'OPEN' | 'RESOLVED'; title?: string } = {}) {
    const id = crypto.randomUUID();
    findingIds.push(id);
    await db.assessmentFinding.create({ data: {
      id, clientId: clientA, title: input.title || `Manual ${id}`, description: 'Internal description', recommendation: 'Internal recommendation',
      status: input.status || 'OPEN', severity: 'HIGH', createdByUserId: adminId,
      ...(input.applicabilityId ? { requirementId, requirementApplicabilityId: input.applicabilityId, scopeType: 'EMPLOYEE', factSubjectId: input.subjectId ?? subjectA } : { scopeType: 'COMPANY', factSubjectId: input.subjectId ?? null }),
    } });
    return id;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Phase 7C-B' } });
    await db.user.createMany({ data: [
      { id: adminId, email: `7cb-admin-${suffix}@example.invalid`, name: '7CB Admin', role: 'ADMIN' },
      { id: lawyerId, email: `7cb-lawyer-${suffix}@example.invalid`, name: '7CB Lawyer', role: 'LAWYER' },
    ] });
    await db.client.createMany({ data: [{ id: clientA, name: `7CB Client A ${suffix}` }, { id: clientB, name: `7CB Client B ${suffix}` }] });
    await db.factSubject.createMany({ data: [
      { id: subjectA, clientId: clientA, scopeType: 'EMPLOYEE', subjectKey: `employee-${suffix}`, displayLabel: 'Minta munkavállaló' },
      { id: subjectB, clientId: clientB, scopeType: 'EMPLOYEE', subjectKey: `other-${suffix}`, displayLabel: 'Másik ügyfél alanya' },
    ] });
    await db.requirement.create({ data: { id: requirementId, key: `REQ_7CB_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.createMany({ data: [
      { id: oldVersionId, requirementId, versionKey: 'V1', title: 'Rögzített korábbi cím', normativeStatement: 'Pinned wording', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
      { id: newVersionId, requirementId, versionKey: 'V2', title: 'Újabb cím nem jelenhet meg', normativeStatement: 'New wording', effectiveFrom: new Date('2026-02-01T00:00:00Z') },
    ] });
    await db.applicabilityRuleVersion.create({ data: { id: ruleId, requirementVersionId: oldVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: 'c'.repeat(64) } });
  });

  afterAll(async () => {
    await db.assessmentFinding.deleteMany({ where: { id: { in: findingIds } } });
    await db.requirementApplicability.deleteMany({ where: { id: { in: applicabilityIds } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: ruleId } });
    await db.requirementVersion.deleteMany({ where: { id: { in: [oldVersionId, newVersionId] } } });
    await db.requirement.deleteMany({ where: { id: requirementId } });
    await db.factSubject.deleteMany({ where: { id: { in: [subjectA, subjectB] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.$disconnect();
  });

  it('uses the historical requirement version, subject label, and safe DTO projection', async () => {
    const linked = await finding({ applicabilityId: await applicability() });
    await finding({ title: 'Kézi megállapítás', status: 'RESOLVED' });
    const overview = await getComplianceOverview(admin, clientA, db);
    const row = overview.findings.find((item) => item.id === linked)!;
    expect(row).toMatchObject({ title: 'Rögzített korábbi cím', requirementKey: `REQ_7CB_${suffix}`, applicabilityStatus: 'APPLIES', subjectLabel: 'Minta munkavállaló' });
    expect(Object.keys(row).sort()).toEqual(['applicabilityStatus', 'description', 'id', 'operationalStatus', 'recommendation', 'requirementKey', 'scopeType', 'severity', 'subjectLabel', 'title']);
    expect(JSON.stringify(row)).not.toMatch(/snapshot|factSubjectId|requirementApplicabilityId/i);
  });

  it('enforces client access and never joins a subject from another client', async () => {
    const id = await finding({ applicabilityId: await applicability(), subjectId: subjectB });
    await expect(getComplianceOverview({ userId: lawyerId, role: 'LAWYER' }, clientA, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    const row = (await getComplianceOverview(admin, clientA, db)).findings.find((item) => item.id === id)!;
    expect(row.subjectLabel).toBeNull();
  });

  it('uses at most the finding read plus one batched subject read for one and one hundred rows', async () => {
    const first = await finding({ subjectId: subjectA });
    for (let index = 0; index < 99; index += 1) await finding({ title: `Bulk ${index}` });
    let findingReads = 0;
    let subjectReads = 0;
    const counted = new Proxy(db, { get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === 'assessmentFinding' || property === 'factSubject') return new Proxy(value as object, { get(delegate, method, delegateReceiver) {
        const original = Reflect.get(delegate, method, delegateReceiver);
        if (method === 'findMany') return (...args: unknown[]) => { if (property === 'assessmentFinding') findingReads += 1; else subjectReads += 1; return (original as Function).apply(delegate, args); };
        return original;
      } });
      return value;
    } }) as unknown as PrismaClient;
    const result = await getComplianceOverview(admin, clientA, counted);
    expect(result.findings.some((item) => item.id === first)).toBe(true);
    expect(findingReads).toBe(1);
    expect(subjectReads).toBe(1);
  });
});
