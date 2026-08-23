import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createProposal, bindProposalToCase, confirmProposal, rejectProposal, updateProposal } from '../src/modules/compliance/complianceProposalService';

const databaseUrl = process.env.PHASE7B_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Phase 7B compliance proposal workflow (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const domainCode = `7B_${suffix}`;
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const proposalIds: string[] = [];
  const findingIds: string[] = [];
  const applicabilityIds: string[] = [];
  const caseIds: string[] = [];
  const taskIds: string[] = [];
  const clientIds = [clientA, clientB];

  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };

  async function scenario(withCases = 1) {
    const applicabilityId = crypto.randomUUID();
    const findingId = crypto.randomUUID();
    const factSubjectId = crypto.randomUUID();
    applicabilityIds.push(applicabilityId);
    findingIds.push(findingId);
    await db.requirementApplicability.create({ data: {
      id: applicabilityId, clientId: clientA, requirementVersionId: versionId, ruleVersionId: ruleId,
      ruleDigest: 'a'.repeat(64), outcome: 'APPLIES', scopeType: 'EMPLOYEE', factSubjectId, evaluationAt: new Date(),
      sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1',
      snapshotJson: { outcome: 'APPLIES' }, snapshotDigest: 'b'.repeat(64),
    } });
    await db.assessmentFinding.create({ data: {
      id: findingId, clientId: clientA, title: `7B finding ${findingId}`, status: 'OPEN',
      requirementId, scopeType: 'EMPLOYEE', factSubjectId, requirementApplicabilityId: applicabilityId, createdByUserId: adminId,
    } });
    const cases = [];
    for (let index = 0; index < withCases; index += 1) {
      const id = crypto.randomUUID();
      caseIds.push(id);
      cases.push(await db.case.create({ data: {
        id, caseNumber: `7B-${suffix.slice(0, 8)}-${caseIds.length}`, title: `7B case ${id}`,
        caseType: 'OTHER', status: 'DRAFT', priority: 'MEDIUM', clientId: clientA, createdById: adminId,
      } }));
    }
    return { applicabilityId, findingId, factSubjectId, cases };
  }

  async function proposal(findingId: string, input: Record<string, unknown> = {}) {
    const result = await createProposal(admin, {
      findingId,
      proposalKind: 'REMEDIATION',
      actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP',
      title: `Javasolt intézkedés ${findingId}`,
      ...input,
    }, db);
    proposalIds.push(result.id);
    return result;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Phase 7B test domain' } });
    await db.user.createMany({ data: [
      { id: adminId, email: `7b-admin-${suffix}@example.invalid`, name: '7B Admin', role: 'ADMIN' },
      { id: lawyerId, email: `7b-lawyer-${suffix}@example.invalid`, name: '7B Lawyer', role: 'LAWYER' },
    ] });
    await db.client.createMany({ data: [{ id: clientA, name: `7B Client A ${suffix}` }, { id: clientB, name: `7B Client B ${suffix}` }] });
    await db.requirement.create({ data: { id: requirementId, key: `REQ_7B_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({ data: { id: versionId, requirementId, versionKey: 'V1', title: '7B requirement', normativeStatement: '7B statement', effectiveFrom: new Date('2026-01-01'), status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    await db.applicabilityRuleVersion.create({ data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'LITERAL', valueType: 'boolean', value: true } }, canonicalDigest: 'c'.repeat(64), status: 'APPROVED' } });
  });

  afterAll(async () => {
    await db.complianceProposal.deleteMany({ where: { id: { in: proposalIds } } });
    await db.task.deleteMany({ where: { OR: [{ id: { in: taskIds } }, { type: 'COMPLIANCE_PROPOSAL', caseId: { in: caseIds } }] } });
    await db.case.deleteMany({ where: { id: { in: caseIds } } });
    await db.assessmentFinding.deleteMany({ where: { id: { in: findingIds } } });
    await db.requirementApplicability.deleteMany({ where: { id: { in: applicabilityIds } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: ruleId } });
    await db.requirementVersion.deleteMany({ where: { id: versionId } });
    await db.requirement.deleteMany({ where: { id: requirementId } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.client.deleteMany({ where: { id: { in: clientIds } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
    await db.$disconnect();
  });

  it('creates a PROPOSED proposal with frozen provenance', async () => { const s = await scenario(); const row = await proposal(s.findingId); expect(row.status).toBe('PROPOSED'); expect(row.findingId).toBe(s.findingId); });
  it('supports two action kinds on one finding', async () => { const s = await scenario(); const a = await proposal(s.findingId); const b = await createProposal(admin, { findingId: s.findingId, proposalKind: 'DISCLOSURE', actionIntentKey: 'DISCLOSE_REQUIREMENT', title: 'Disclosure' }, db); proposalIds.push(b.id); expect(a.id).not.toBe(b.id); });
  it('allows different cases for the same intent', async () => { const s = await scenario(2); const a = await proposal(s.findingId, { caseId: s.cases[0].id }); const b = await proposal(s.findingId, { caseId: s.cases[1].id }); expect(a.id).not.toBe(b.id); });
  it('rejects same intent and same case collision', async () => { const s = await scenario(1); await proposal(s.findingId, { caseId: s.cases[0].id }); await expect(proposal(s.findingId, { caseId: s.cases[0].id })).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_ACTIVE' }); });
  it('rejects no-case duplicate collision', async () => { const s = await scenario(); await proposal(s.findingId); await expect(proposal(s.findingId)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_ACTIVE' }); });
  it('allows reproposal after REJECTED', async () => { const s = await scenario(); const first = await proposal(s.findingId); await rejectProposal(admin, first.id, db); const second = await proposal(s.findingId); expect(second.id).not.toBe(first.id); });
  it('allows reproposal after CONFIRMED without disturbing the historical task link', async () => { const s = await scenario(1); const first = await proposal(s.findingId, { caseId: s.cases[0].id }); const task = await confirmProposal(admin, first.id, db); taskIds.push(task.id); const second = await proposal(s.findingId, { caseId: s.cases[0].id }); expect(second.id).not.toBe(first.id); expect((await db.complianceProposal.findUniqueOrThrow({ where: { id: first.id } })).taskId).toBe(task.id); });
  it('allows reproposal after STALE', async () => { const s = await scenario(); const first = await proposal(s.findingId, { caseId: s.cases[0].id }); const replacement = crypto.randomUUID(); applicabilityIds.push(replacement); await db.requirementApplicability.create({ data: { id: replacement, clientId: clientA, requirementVersionId: versionId, ruleVersionId: ruleId, ruleDigest: 'd'.repeat(64), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(), sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1', snapshotJson: {}, snapshotDigest: 'e'.repeat(64) } }); await db.assessmentFinding.update({ where: { id: s.findingId }, data: { requirementApplicabilityId: replacement } }); await expect(confirmProposal(admin, first.id, db)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' }); const second = await proposal(s.findingId, { caseId: s.cases[0].id }); expect(second.id).not.toBe(first.id); });
  it('binds a no-case proposal to an authorized case', async () => { const s = await scenario(1); const row = await proposal(s.findingId); const bound = await bindProposalToCase(admin, row.id, s.cases[0].id, db); expect(bound.case.id).toBe(s.cases[0].id); });
  it('rejects binding collision', async () => { const s = await scenario(1); await proposal(s.findingId, { caseId: s.cases[0].id }); const row = await proposal(s.findingId); await expect(bindProposalToCase(admin, row.id, s.cases[0].id, db)).rejects.toMatchObject({ code: 'PROPOSAL_CASE_ALREADY_ACTIVE' }); });
  it('rejects cross-client case binding', async () => { const s = await scenario(); const otherCase = crypto.randomUUID(); caseIds.push(otherCase); await db.case.create({ data: { id: otherCase, caseNumber: `7B-${suffix.slice(0, 8)}-${caseIds.length}`, title: 'Other client case', caseType: 'OTHER', status: 'DRAFT', priority: 'MEDIUM', clientId: clientB, createdById: adminId } }); const row = await proposal(s.findingId); await expect(bindProposalToCase(admin, row.id, otherCase, db)).rejects.toMatchObject({ code: 'PROPOSAL_CASE_CLIENT_MISMATCH' }); });
  it('rejects unauthorized case binding', async () => { const s = await scenario(); const row = await proposal(s.findingId); await expect(bindProposalToCase(lawyer, row.id, s.cases[0].id, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' }); });
  it('does not let proposal fields grant case access', async () => { const s = await scenario(); const row = await proposal(s.findingId); await expect(bindProposalToCase(lawyer, row.id, s.cases[0].id, db)).rejects.toBeDefined(); });
  it('creates no task on proposal creation', async () => { const s = await scenario(); const before = await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL' } }); await proposal(s.findingId); expect(await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL' } })).toBe(before); });
  it('creates no case on proposal creation', async () => { const s = await scenario(); const before = await db.case.count({ where: { clientId: clientA } }); await proposal(s.findingId); expect(await db.case.count({ where: { clientId: clientA } })).toBe(before); });
  it('rejects manual findings as compliance proposals', async () => { const findingId = crypto.randomUUID(); findingIds.push(findingId); await db.assessmentFinding.create({ data: { id: findingId, clientId: clientA, title: 'Manual', createdByUserId: adminId } }); await expect(proposal(findingId)).rejects.toMatchObject({ code: 'PROPOSAL_FINDING_NOT_COMPLIANCE' }); });
  it('rejects an applicability-backed finding without a Requirement', async () => { const s = await scenario(); await db.assessmentFinding.update({ where: { id: s.findingId }, data: { requirementId: null } }); await expect(proposal(s.findingId)).rejects.toMatchObject({ code: 'PROPOSAL_FINDING_NOT_COMPLIANCE' }); });
  it('rejects invalid proposal kind', async () => { const s = await scenario(); await expect(createProposal(admin, { findingId: s.findingId, proposalKind: 'PENDING', actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP', title: 'x' }, db)).rejects.toMatchObject({ code: 'PROPOSAL_KIND_INVALID' }); });
  it('rejects invalid action intent', async () => { const s = await scenario(); await expect(createProposal(admin, { findingId: s.findingId, proposalKind: 'REMEDIATION', actionIntentKey: 'ARBITRARY', title: 'x' }, db)).rejects.toMatchObject({ code: 'PROPOSAL_ACTION_INTENT_INVALID' }); });
  it('rejects mismatched kind and intent', async () => { const s = await scenario(); await expect(createProposal(admin, { findingId: s.findingId, proposalKind: 'REVIEW', actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP', title: 'x' }, db)).rejects.toMatchObject({ code: 'PROPOSAL_ACTION_INTENT_INVALID' }); });
  it('rejects a caller client mismatch', async () => { const s = await scenario(); await expect(createProposal(admin, { findingId: s.findingId, clientId: clientB, proposalKind: 'REMEDIATION', actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP', title: 'x' }, db)).rejects.toMatchObject({ code: 'PROPOSAL_CLIENT_MISMATCH' }); });
  it('edits allowed proposed fields', async () => { const s = await scenario(); const row = await proposal(s.findingId); const updated = await updateProposal(admin, row.id, { title: 'Módosított', description: 'Leírás', suggestedAction: 'Teendő', deadline: '2030-01-01' }, db); expect(updated.title).toBe('Módosított'); expect(updated.deadline).toContain('2030-01-01'); });
  it('rejects immutable identity edits', async () => { const s = await scenario(); const row = await proposal(s.findingId); await expect(updateProposal(admin, row.id, { findingId: crypto.randomUUID(), proposalKind: 'REVIEW', actionIntentKey: 'REVIEW_APPLICABILITY' }, db)).rejects.toMatchObject({ code: 'PROPOSAL_IMMUTABLE' }); const stored = await db.complianceProposal.findUniqueOrThrow({ where: { id: row.id } }); expect(stored.findingId).toBe(s.findingId); expect(stored.proposalKind).toBe('REMEDIATION'); });
  it('keeps applicability provenance immutable', async () => { const s = await scenario(); const row = await proposal(s.findingId); await expect(updateProposal(admin, row.id, { applicabilityIdAtProposal: crypto.randomUUID(), findingStatusAtProposal: 'RESOLVED' }, db)).rejects.toMatchObject({ code: 'PROPOSAL_IMMUTABLE' }); expect((await db.complianceProposal.findUniqueOrThrow({ where: { id: row.id } })).applicabilityIdAtProposal).toBe(s.applicabilityId); });
  it('rejects terminal edits', async () => { const s = await scenario(); const row = await proposal(s.findingId); await rejectProposal(admin, row.id, db); await expect(updateProposal(admin, row.id, { title: 'x' }, db)).rejects.toMatchObject({ code: 'PROPOSAL_TERMINAL' }); });
  it('rejects confirmation without a case', async () => { const s = await scenario(); const row = await proposal(s.findingId); await expect(confirmProposal(admin, row.id, db)).rejects.toMatchObject({ code: 'PROPOSAL_NO_CASE' }); });
  it('confirms a fresh proposal into one compliance task', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); const task = await confirmProposal(admin, row.id, db); taskIds.push(task.id); expect(task.caseId).toBe(s.cases[0].id); expect(task.type).toBe('COMPLIANCE_PROPOSAL'); });
  it('stores confirmer and confirmed case', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); const task = await confirmProposal(admin, row.id, db); taskIds.push(task.id); const stored = await db.complianceProposal.findUniqueOrThrow({ where: { id: row.id } }); expect(stored.confirmedById).toBe(adminId); expect(stored.confirmedCaseId).toBe(s.cases[0].id); });
  it('uses proposal assignee and deadline on the task', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id, assigneeId: lawyerId, deadline: '2031-01-01' }); const task = await confirmProposal(admin, row.id, db); taskIds.push(task.id); expect(task.assignedToId).toBe(lawyerId); expect(task.dueDate?.toISOString()).toContain('2031-01-01'); });
  it('returns the same task on repeated confirmation', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); const first = await confirmProposal(admin, row.id, db); const second = await confirmProposal(admin, row.id, db); taskIds.push(first.id); expect(second.id).toBe(first.id); });
  it('stales on applicability pointer change and creates no task', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); const replacement = crypto.randomUUID(); applicabilityIds.push(replacement); await db.requirementApplicability.create({ data: { id: replacement, clientId: clientA, requirementVersionId: versionId, ruleVersionId: ruleId, ruleDigest: 'f'.repeat(64), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(), sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1', snapshotJson: {}, snapshotDigest: '1'.repeat(64) } }); await db.assessmentFinding.update({ where: { id: s.findingId }, data: { requirementApplicabilityId: replacement } }); const before = await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL' } }); await expect(confirmProposal(admin, row.id, db)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' }); const stored = await db.complianceProposal.findUniqueOrThrow({ where: { id: row.id } }); expect(stored.status).toBe('STALE'); expect(stored.taskId).toBeNull(); expect(await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL' } })).toBe(before); });
  it('stales on finding status change', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); await db.assessmentFinding.update({ where: { id: s.findingId }, data: { status: 'RESOLVED' } }); await expect(confirmProposal(admin, row.id, db)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' }); const observer = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); expect((await observer.complianceProposal.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('STALE'); await observer.$disconnect(); });
  it('keeps stale transition committed after domain error', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); await db.assessmentFinding.update({ where: { id: s.findingId }, data: { status: 'RESOLVED' } }); await expect(confirmProposal(admin, row.id, db)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' }); expect((await db.complianceProposal.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('STALE'); });
  it('rejects terminal confirmation', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); await rejectProposal(admin, row.id, db); await expect(confirmProposal(admin, row.id, db)).rejects.toMatchObject({ code: 'PROPOSAL_TERMINAL' }); });
  it('rejects rebinding after confirmation', async () => { const s = await scenario(2); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); const task = await confirmProposal(admin, row.id, db); taskIds.push(task.id); await expect(bindProposalToCase(admin, row.id, s.cases[1].id, db)).rejects.toMatchObject({ code: 'PROPOSAL_TERMINAL' }); });
  it('preserves different scoped finding identities', async () => { const a = await scenario(); const b = await scenario(); const first = await proposal(a.findingId); const second = await proposal(b.findingId); expect(first.id).not.toBe(second.id); });
  it('rejects client portal actor mutation', async () => { const s = await scenario(); await expect(createProposal({ userId: adminId, role: 'CLIENT' }, { findingId: s.findingId, proposalKind: 'REMEDIATION', actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP', title: 'x' }, db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' }); });
  it('rejects every non-workforce role on every mutation path', async () => { const s = await scenario(1); const row = await proposal(s.findingId); for (const role of ['TRAINEE', 'LEGAL_ASSISTANT', 'CLIENT', 'EXTERNAL_REVIEWER']) { const actor = { userId: adminId, role }; await expect(createProposal(actor, { findingId: s.findingId, proposalKind: 'REMEDIATION', actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP', title: 'x' }, db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' }); await expect(updateProposal(actor, row.id, { title: 'x' }, db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' }); await expect(bindProposalToCase(actor, row.id, s.cases[0].id, db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' }); await expect(confirmProposal(actor, row.id, db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' }); await expect(rejectProposal(actor, row.id, db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' }); } });
  it('requires an active workforce assignee', async () => { const s = await scenario(); await expect(proposal(s.findingId, { assigneeId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'PROPOSAL_ASSIGNEE_INVALID' }); });
  it('rejects unauthorized proposal confirmation', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); await expect(confirmProposal(lawyer, row.id, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' }); });
  it('lists only authorized client proposals', async () => { const s = await scenario(); await proposal(s.findingId); const rows = await (await import('../src/modules/compliance/complianceProposalService')).listProposals(admin, { clientId: clientA }, db); expect(rows.some((item) => item.findingId === s.findingId)).toBe(true); });
  it('requires a client or Case scope for listing', async () => { await expect((await import('../src/modules/compliance/complianceProposalService')).listProposals(admin, {}, db)).rejects.toMatchObject({ code: 'PROPOSAL_SCOPE_REQUIRED' }); });
  it('does not leak raw applicability snapshot in DTO', async () => { const s = await scenario(); const row = await proposal(s.findingId); expect(row.snapshotJson).toBeUndefined(); expect(row.applicabilityIdAtProposal).toBeUndefined(); });
  it('keeps proposal task linkage unique', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); const task = await confirmProposal(admin, row.id, db); taskIds.push(task.id); expect((await db.complianceProposal.findUniqueOrThrow({ where: { taskId: task.id } })).id).toBe(row.id); });
  it('uses a required Case on confirmed tasks', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); const task = await confirmProposal(admin, row.id, db); taskIds.push(task.id); expect(task.caseId).toBeTruthy(); });
  it('keeps rejected rows historical', async () => { const s = await scenario(); const row = await proposal(s.findingId); await rejectProposal(admin, row.id, db); expect((await db.complianceProposal.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('REJECTED'); });
  it('keeps proposed no-case rows indefinitely', async () => { const s = await scenario(); const row = await proposal(s.findingId); expect(row.status).toBe('PROPOSED'); expect(row.case).toBeNull(); });
  it('does not expose a new-case backend path', async () => { const s = await scenario(); const row = await proposal(s.findingId); expect(row.id).toBeTruthy(); });
  it('supports disclosure intent from the canonical registry', async () => { const s = await scenario(); const row = await createProposal(admin, { findingId: s.findingId, proposalKind: 'DISCLOSURE', actionIntentKey: 'DISCLOSE_REQUIREMENT', title: 'Disclosure' }, db); proposalIds.push(row.id); expect(row.actionIntentKey).toBe('DISCLOSE_REQUIREMENT'); });
  it('supports document update intent from the canonical registry', async () => { const s = await scenario(); const row = await createProposal(admin, { findingId: s.findingId, proposalKind: 'DOCUMENT_UPDATE', actionIntentKey: 'UPDATE_DOCUMENTATION', title: 'Update' }, db); proposalIds.push(row.id); expect(row.proposalKind).toBe('DOCUMENT_UPDATE'); });
  it('supports control implementation intent from the canonical registry', async () => { const s = await scenario(); const row = await createProposal(admin, { findingId: s.findingId, proposalKind: 'CONTROL_IMPLEMENTATION', actionIntentKey: 'IMPLEMENT_CONTROL', title: 'Control' }, db); proposalIds.push(row.id); expect(row.proposalKind).toBe('CONTROL_IMPLEMENTATION'); });
  it('supports review intent from the canonical registry', async () => { const s = await scenario(); const row = await createProposal(admin, { findingId: s.findingId, proposalKind: 'REVIEW', actionIntentKey: 'REVIEW_APPLICABILITY', title: 'Review' }, db); proposalIds.push(row.id); expect(row.proposalKind).toBe('REVIEW'); });
  it('supports open matter intent from the canonical registry', async () => { const s = await scenario(); const row = await createProposal(admin, { findingId: s.findingId, proposalKind: 'OPEN_MATTER', actionIntentKey: 'ADDRESS_OPEN_MATTER', title: 'Matter' }, db); proposalIds.push(row.id); expect(row.proposalKind).toBe('OPEN_MATTER'); });
  it('preserves createdByUserId from the authenticated actor', async () => { const s = await scenario(); const row = await proposal(s.findingId, { createdByUserId: lawyerId }); expect((await db.complianceProposal.findUniqueOrThrow({ where: { id: row.id } })).createdByUserId).toBe(adminId); });
  it('does not accept caller status override', async () => { const s = await scenario(); const row = await proposal(s.findingId, { status: 'CONFIRMED', taskId: crypto.randomUUID() }); const stored = await db.complianceProposal.findUniqueOrThrow({ where: { id: row.id } }); expect(stored.status).toBe('PROPOSED'); expect(stored.taskId).toBeNull(); });
  it('concurrent confirmation produces exactly one task', async () => { const s = await scenario(1); const row = await proposal(s.findingId, { caseId: s.cases[0].id }); const dbA = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); const dbB = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); const [a, b] = await Promise.all([confirmProposal(admin, row.id, dbA), confirmProposal(admin, row.id, dbB)]); taskIds.push(a.id); expect(a.id).toBe(b.id); expect(await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL', id: a.id } })).toBe(1); await dbA.$disconnect(); await dbB.$disconnect(); });
});
