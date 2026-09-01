import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createProposal, startCaseFromProposal } from '../src/modules/compliance/complianceProposalService';

/**
 * Compliance -> Work Package operational convergence (PostgreSQL).
 *
 * Proves that a confirmed compliance proposal elevates into the canonical spine:
 * Finding -> ComplianceProposal -> Case (canonical creation) -> immutable
 * CaseWorkPackage snapshot -> compliance Task, with provenance, idempotency,
 * client isolation, safe degradation, no auto client publication, and
 * transactional atomicity.
 */
const databaseUrl = process.env.COMPLIANCE_CASE_WP_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Compliance proposal -> Case + Work Package convergence (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `CWP_${suffix}`.slice(0, 40);
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const caseTypeId = crypto.randomUUID();
  const workflowTemplateId = crypto.randomUUID();
  const workPackageTemplateId = crypto.randomUUID();
  const requiredModuleKey = 'compliance-required-review';
  const optionalModuleKey = 'compliance-optional-research';

  const proposalIds: string[] = [];
  const findingIds: string[] = [];
  const applicabilityIds: string[] = [];
  const caseIds: string[] = [];
  const extraUserIds: string[] = [];

  const admin = { userId: adminId, role: 'ADMIN' };

  async function makeFinding(clientId = clientA) {
    const applicabilityId = crypto.randomUUID();
    const findingId = crypto.randomUUID();
    const factSubjectId = crypto.randomUUID();
    applicabilityIds.push(applicabilityId);
    findingIds.push(findingId);
    await db.requirementApplicability.create({ data: {
      id: applicabilityId, clientId, requirementVersionId: versionId, ruleVersionId: ruleId,
      ruleDigest: 'a'.repeat(64), outcome: 'APPLIES', scopeType: 'EMPLOYEE', factSubjectId, evaluationAt: new Date(),
      sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
      snapshotJson: { outcome: 'APPLIES' }, snapshotDigest: 'b'.repeat(64),
    } });
    await db.assessmentFinding.create({ data: {
      id: findingId, clientId, title: `Convergence finding ${findingId}`, status: 'OPEN',
      requirementId, scopeType: 'EMPLOYEE', factSubjectId, requirementApplicabilityId: applicabilityId, createdByUserId: adminId,
    } });
    return { findingId, applicabilityId, factSubjectId };
  }

  async function makeProposal(findingId: string, input: Record<string, unknown> = {}) {
    const row = await createProposal(admin, {
      findingId, proposalKind: 'REMEDIATION', actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP',
      title: `Javasolt intézkedés ${findingId}`, ...input,
    }, db);
    proposalIds.push(row.id);
    return row;
  }

  function trackCase(id: string): string { if (id && !caseIds.includes(id)) caseIds.push(id); return id; }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Convergence test domain' } });
    await db.user.createMany({ data: [
      { id: adminId, email: `cwp-admin-${suffix}@example.invalid`, name: 'CWP Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true },
      { id: lawyerId, email: `cwp-lawyer-${suffix}@example.invalid`, name: 'CWP Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true },
    ] });
    await db.client.createMany({ data: [{ id: clientA, name: `CWP Client A ${suffix}` }, { id: clientB, name: `CWP Client B ${suffix}` }] });
    await db.requirement.create({ data: { id: requirementId, key: `REQ_CWP_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({ data: { id: versionId, requirementId, versionKey: 'V1', title: 'CWP requirement', normativeStatement: 'CWP statement', effectiveFrom: new Date('2026-01-01'), status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    await db.applicabilityRuleVersion.create({ data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'LITERAL', valueType: 'boolean', value: true } }, canonicalDigest: 'c'.repeat(64), status: 'APPROVED' } });
    // Recommended compliance Case Type (matched by legacyCaseTypeKey) with an ACTIVE work package.
    await db.caseTypeDefinition.create({ data: { id: caseTypeId, slug: `cwp-compliance-${suffix}`, name: 'Compliance', isActive: true, sortOrder: 0, legacyCaseTypeKey: 'COMPLIANCE' } });
    await db.workflowTemplate.create({ data: { id: workflowTemplateId, key: `cwp-workflow-${suffix}`, name: 'CWP Workflow', status: 'ACTIVE', version: 1, steps: [{ key: 'review', title: 'Review', dependsOn: [], publicMilestoneCandidate: true }] } });
    await db.workPackageTemplate.create({ data: {
      id: workPackageTemplateId, caseTypeDefinitionId: caseTypeId, name: 'CWP Template v1', version: 1, status: 'ACTIVE', defaultWorkflowTemplateId: workflowTemplateId,
      items: { create: [
        { moduleType: 'REVIEW', moduleKey: requiredModuleKey, label: 'Required review', isOptional: false, order: 1, config: { scope: 'standard' } },
        { moduleType: 'RESEARCH', moduleKey: optionalModuleKey, label: 'Optional research', isOptional: true, order: 2, config: { topic: 'background' } },
      ] },
    } });
  });

  afterAll(async () => {
    await db.complianceProposal.deleteMany({ where: { id: { in: proposalIds } } }).catch(() => {});
    await db.task.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => {});
    await db.clientMatterPublication.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => {});
    await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId: { in: caseIds } } } }).catch(() => {});
    await db.caseWorkPackage.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => {});
    await db.timelineEvent.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => {});
    await db.case.deleteMany({ where: { id: { in: caseIds } } }).catch(() => {});
    await db.assessmentFinding.deleteMany({ where: { id: { in: findingIds } } }).catch(() => {});
    await db.requirementApplicability.deleteMany({ where: { id: { in: applicabilityIds } } }).catch(() => {});
    await db.workPackageTemplateItem.deleteMany({ where: { workPackageTemplateId } }).catch(() => {});
    await db.workPackageTemplate.deleteMany({ where: { id: workPackageTemplateId } }).catch(() => {});
    await db.workflowTemplate.deleteMany({ where: { id: workflowTemplateId } }).catch(() => {});
    await db.caseTypeDefinition.deleteMany({ where: { id: caseTypeId } }).catch(() => {});
    await db.applicabilityRuleVersion.deleteMany({ where: { id: ruleId } }).catch(() => {});
    await db.requirementVersion.deleteMany({ where: { id: versionId } }).catch(() => {});
    await db.requirement.deleteMany({ where: { id: requirementId } }).catch(() => {});
    await db.complianceDomain.deleteMany({ where: { code: domainCode } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId, ...extraUserIds] } } }).catch(() => {});
    await db.$disconnect();
  });

  it('1: Finding -> proposal -> new Case (proposal becomes CONFIRMED)', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(result.case.id);
    expect(result.case.id).toBeTruthy();
    expect((await db.complianceProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe('CONFIRMED');
  });

  it('2: new Case receives the finding client', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(result.case.id);
    expect(result.case.clientId).toBe(clientA);
  });

  it('3: recommended Case Type is resolved', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(result.case.id);
    const created = await db.case.findUniqueOrThrow({ where: { id: result.case.id } });
    expect(created.caseTypeDefinitionId).toBe(caseTypeId);
  });

  it('4: immutable Work Package snapshot is created from the active template', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(result.case.id);
    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({ where: { caseId: result.case.id } });
    expect(snapshot.workPackageTemplateId).toBe(workPackageTemplateId);
    expect(snapshot.workPackageTemplateVersion).toBe(1);
  });

  it('5: required modules are included in the snapshot', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(result.case.id);
    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({ where: { caseId: result.case.id }, include: { items: true } });
    const keys = snapshot.items.map((i) => i.moduleKey);
    expect(keys).toContain(requiredModuleKey);
  });

  it('6: Case Workspace can load the package with requiredness snapshot', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(result.case.id);
    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({ where: { caseId: result.case.id }, include: { items: { orderBy: { order: 'asc' } } } });
    expect(snapshot.items.length).toBeGreaterThan(0);
    const required = snapshot.items.find((i) => i.moduleKey === requiredModuleKey);
    expect((required?.config as any)?.$caseWorkPackageSnapshot?.required).toBe(true);
  });

  it('7 + 9: the compliance Task is created exactly once and elevation is idempotent', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const first = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(first.case.id);
    const second = await startCaseFromProposal(admin, proposal.id, {}, db);
    expect(second.case.id).toBe(first.case.id);
    expect(second.task.id).toBe(first.task.id);
    expect(await db.task.count({ where: { caseId: first.case.id, type: 'COMPLIANCE_PROPOSAL' } })).toBe(1);
    expect(await db.caseWorkPackage.count({ where: { caseId: first.case.id } })).toBe(1);
  });

  it('8: finding/proposal/task provenance is retained', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(result.case.id);
    const stored = await db.complianceProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(stored.findingId).toBe(findingId);
    expect(stored.taskId).toBe(result.task.id);
    expect(stored.confirmedCaseId).toBe(result.case.id);
    expect(result.task.caseId).toBe(result.case.id);
  });

  it('10 + 11: an already-linked Case is reused and its snapshot is not duplicated', async () => {
    const { findingId } = await makeFinding();
    const existingCaseId = trackCase(crypto.randomUUID());
    await db.case.create({ data: { id: existingCaseId, caseNumber: `CWP-EX-${suffix.slice(0, 8)}`, title: 'Existing case', caseType: 'OTHER', status: 'DRAFT', priority: 'MEDIUM', clientId: clientA, createdById: adminId } });
    await db.caseWorkPackage.create({ data: { caseId: existingCaseId, workPackageTemplateId, workPackageTemplateVersion: 1, createdById: adminId } });
    const proposal = await makeProposal(findingId, { caseId: existingCaseId });
    const before = await db.case.count({ where: { clientId: clientA } });
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    expect(result.case.id).toBe(existingCaseId);
    expect(await db.case.count({ where: { clientId: clientA } })).toBe(before);
    expect(await db.caseWorkPackage.count({ where: { caseId: existingCaseId } })).toBe(1);
  });

  it('12: cross-client Case linking is rejected', async () => {
    const { findingId } = await makeFinding();
    const otherClientCase = trackCase(crypto.randomUUID());
    await db.case.create({ data: { id: otherClientCase, caseNumber: `CWP-XC-${suffix.slice(0, 8)}`, title: 'Other client case', caseType: 'OTHER', status: 'DRAFT', priority: 'MEDIUM', clientId: clientB, createdById: adminId } });
    await expect(makeProposal(findingId, { caseId: otherClientCase })).rejects.toMatchObject({ code: 'PROPOSAL_CASE_CLIENT_MISMATCH' });
  });

  it('13: missing recommended Case Type degrades safely (Case without snapshot)', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    await db.caseTypeDefinition.update({ where: { id: caseTypeId }, data: { isActive: false } });
    try {
      const result = await startCaseFromProposal(admin, proposal.id, {}, db);
      trackCase(result.case.id);
      expect(result.case.id).toBeTruthy();
      expect(await db.caseWorkPackage.count({ where: { caseId: result.case.id } })).toBe(0);
      expect(result.task.id).toBeTruthy();
    } finally {
      await db.caseTypeDefinition.update({ where: { id: caseTypeId }, data: { isActive: true } });
    }
  });

  it('14: missing active Work Package degrades safely (Case without snapshot)', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    await db.workPackageTemplate.update({ where: { id: workPackageTemplateId }, data: { status: 'DRAFT' } });
    try {
      const result = await startCaseFromProposal(admin, proposal.id, {}, db);
      trackCase(result.case.id);
      expect(await db.caseWorkPackage.count({ where: { caseId: result.case.id } })).toBe(0);
      expect((await db.complianceProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe('CONFIRMED');
    } finally {
      await db.workPackageTemplate.update({ where: { id: workPackageTemplateId }, data: { status: 'ACTIVE' } });
    }
  });

  it('15: internal elevation does not publish to the client portal', async () => {
    const { findingId } = await makeFinding();
    const proposal = await makeProposal(findingId);
    const result = await startCaseFromProposal(admin, proposal.id, {}, db);
    trackCase(result.case.id);
    expect(await db.clientMatterPublication.count({ where: { caseId: result.case.id } })).toBe(0);
  });

  it('16: a mid-transaction failure leaves no half-created operational state', async () => {
    const { findingId } = await makeFinding();
    const throwawayAssignee = crypto.randomUUID();
    extraUserIds.push(throwawayAssignee);
    await db.user.create({ data: { id: throwawayAssignee, email: `cwp-throwaway-${suffix}@example.invalid`, name: 'CWP Throwaway', role: 'LAWYER', status: 'ACTIVE', isActive: true } });
    const proposal = await makeProposal(findingId, { assigneeId: throwawayAssignee });
    // Invalidate the assignee AFTER the proposal exists: task creation (which runs
    // after the Case + snapshot inside the same transaction) will reject, rolling
    // the entire elevation back.
    await db.user.update({ where: { id: throwawayAssignee }, data: { isActive: false } });
    const casesBefore = await db.case.count({ where: { clientId: clientA } });
    await expect(startCaseFromProposal(admin, proposal.id, {}, db)).rejects.toMatchObject({ code: 'PROPOSAL_ASSIGNEE_INVALID' });
    const stored = await db.complianceProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(stored.status).toBe('PROPOSED');
    expect(stored.caseId).toBeNull();
    expect(await db.case.count({ where: { clientId: clientA } })).toBe(casesBefore);
  });
});
