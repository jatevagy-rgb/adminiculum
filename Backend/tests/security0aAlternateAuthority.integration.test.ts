/**
 * SEC-0A — alternate Task-producing authority (disposable PostgreSQL).
 *
 * Behaviour-level proof that the alternate Task entry points are no weaker than
 * the canonical POST /tasks CASE_MANAGE boundary. A CaseCollaborator-only actor
 * (read access, no CASE_MANAGE) must be denied with zero Task side effects.
 *
 * Gated: runs only when a disposable loopback database URL is provided
 * (SECURITY0A_TEST_DATABASE_URL or MIGRATION_REPLAY_DATABASE_URL in CI).
 */

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createCanonicalTaskFromCommunication } from '../src/modules/tasks/services';
import { createProposal, confirmProposal } from '../src/modules/compliance/complianceProposalService';

const databaseUrl = process.env.SECURITY0A_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('SEC-0A alternate Task authority (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);

  // ---- SEC-B communication fixtures ----
  const commIds = {
    admin: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    collaborator: crypto.randomUUID(),
    clientA: crypto.randomUUID(),
    caseA: crypto.randomUUID(),
    commLinked: crypto.randomUUID(),
  };

  // ---- SEC-D compliance fixtures ----
  const comp = {
    admin: crypto.randomUUID(),
    collaborator: crypto.randomUUID(),
    clientA: crypto.randomUUID(),
    domain: `SEC0A_${suffix}`,
    requirement: crypto.randomUUID(),
    version: crypto.randomUUID(),
    rule: crypto.randomUUID(),
    applicability: crypto.randomUUID(),
    finding: crypto.randomUUID(),
    factSubject: crypto.randomUUID(),
    caseA: crypto.randomUUID(),
  };

  const taskIds: string[] = [];
  const proposalIds: string[] = [];

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    // SEC-B users
    await db.user.createMany({ data: [
      { id: commIds.admin, email: `s0a-comm-admin-${suffix}@test.invalid`, name: 'S0A Comm Admin', role: 'ADMIN', status: 'ACTIVE' },
      { id: commIds.lawyer, email: `s0a-comm-lawyer-${suffix}@test.invalid`, name: 'S0A Comm Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      { id: commIds.collaborator, email: `s0a-comm-collab-${suffix}@test.invalid`, name: 'S0A Comm Collab', role: 'COLLAB_LAWYER', status: 'ACTIVE' },
    ] as never });
    await db.client.create({ data: { id: commIds.clientA, name: `S0A Comm Client ${suffix}` } as never });
    await db.case.create({ data: { id: commIds.caseA, caseNumber: `S0A-${suffix}`, title: 'S0A Case', caseType: 'OTHER', clientId: commIds.clientA, createdById: commIds.admin, assignedLawyerId: commIds.lawyer } as never });
    await db.caseCollaborator.create({ data: { id: crypto.randomUUID(), caseId: commIds.caseA, userId: commIds.collaborator, role: 'ASSISTANT' } as never });
    await db.communication.create({ data: { id: commIds.commLinked, type: 'EMAIL', subject: 'S0A comm', caseId: commIds.caseA, clientId: commIds.clientA, createdById: commIds.admin, content: 'hello' } as never });

    // SEC-D users + compliance fixture
    await db.user.createMany({ data: [
      { id: comp.admin, email: `s0a-comp-admin-${suffix}@test.invalid`, name: 'S0A Comp Admin', role: 'ADMIN', status: 'ACTIVE' },
      { id: comp.collaborator, email: `s0a-comp-collab-${suffix}@test.invalid`, name: 'S0A Comp Collab', role: 'COLLAB_LAWYER', status: 'ACTIVE' },
    ] as never });
    await db.client.create({ data: { id: comp.clientA, name: `S0A Comp Client ${suffix}` } as never });
    await db.case.create({ data: { id: comp.caseA, caseNumber: `S0A-C-${suffix}`, title: 'S0A Comp Case', caseType: 'OTHER', status: 'DRAFT', priority: 'MEDIUM', clientId: comp.clientA, createdById: comp.admin } as never });
    await db.caseCollaborator.create({ data: { id: crypto.randomUUID(), caseId: comp.caseA, userId: comp.collaborator, role: 'ASSISTANT' } as never });
    await db.complianceDomain.create({ data: { code: comp.domain, label: `S0A domain ${suffix}` } });
    await db.requirement.create({ data: { id: comp.requirement, key: `REQ_S0A_${suffix}`, jurisdictionCode: 'HU', domainCode: comp.domain } });
    await db.requirementVersion.create({ data: { id: comp.version, requirementId: comp.requirement, versionKey: 'V1', title: 'S0A requirement', normativeStatement: 'S0A statement', effectiveFrom: new Date('2026-01-01'), status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    await db.applicabilityRuleVersion.create({ data: { id: comp.rule, requirementVersionId: comp.version, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'LITERAL', valueType: 'boolean', value: true } }, canonicalDigest: 'a'.repeat(64), status: 'APPROVED' } });
    await db.requirementApplicability.create({ data: { id: comp.applicability, clientId: comp.clientA, requirementVersionId: comp.version, ruleVersionId: comp.rule, ruleDigest: 'b'.repeat(64), outcome: 'APPLIES', scopeType: 'EMPLOYEE', factSubjectId: comp.factSubject, evaluationAt: new Date(), sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'phase6-requirement-applicability/v1', snapshotJson: { outcome: 'APPLIES' }, snapshotDigest: 'c'.repeat(64) } });
    await db.assessmentFinding.create({ data: { id: comp.finding, clientId: comp.clientA, title: `S0A finding ${suffix}`, status: 'OPEN', requirementId: comp.requirement, scopeType: 'EMPLOYEE', factSubjectId: comp.factSubject, requirementApplicabilityId: comp.applicability, createdByUserId: comp.admin } });
  });

  afterAll(async () => {
    try {
      await db.task.deleteMany({ where: { OR: [{ id: { in: taskIds } }, { type: 'COMPLIANCE_PROPOSAL', caseId: { in: [comp.caseA] } }, { sourceCommunicationId: commIds.commLinked }] } });
      await db.complianceProposal.deleteMany({ where: { id: { in: proposalIds } } });
      await db.assessmentFinding.deleteMany({ where: { id: comp.finding } });
      await db.requirementApplicability.deleteMany({ where: { id: comp.applicability } });
      await db.applicabilityRuleVersion.deleteMany({ where: { id: comp.rule } });
      await db.requirementVersion.deleteMany({ where: { id: comp.version } });
      await db.requirement.deleteMany({ where: { id: comp.requirement } });
      await db.complianceDomain.deleteMany({ where: { code: comp.domain } });
      await db.caseCollaborator.deleteMany({ where: { caseId: { in: [commIds.caseA, comp.caseA] } } });
      await db.communication.deleteMany({ where: { id: commIds.commLinked } });
      await db.case.deleteMany({ where: { id: { in: [commIds.caseA, comp.caseA] } } });
      await db.client.deleteMany({ where: { id: { in: [commIds.clientA, comp.clientA] } } });
      await db.user.deleteMany({ where: { id: { in: [commIds.admin, commIds.lawyer, commIds.collaborator, comp.admin, comp.collaborator] } } });
    } finally {
      await db.$disconnect();
    }
  });

  describe('SEC-B communication → task', () => {
    it('DENIES a collaborator-only actor with zero Task side effects', async () => {
      const before = await db.task.count({ where: { sourceCommunicationId: commIds.commLinked } });
      await expect(
        createCanonicalTaskFromCommunication(commIds.commLinked, commIds.collaborator, 'COLLAB_LAWYER', { title: 'Collab follow-up' }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'COMMUNICATION_NOT_AUTHORIZED' });
      expect(await db.task.count({ where: { sourceCommunicationId: commIds.commLinked } })).toBe(before);
    });

    it('allows the CASE_MANAGE assigned lawyer', async () => {
      const result = await createCanonicalTaskFromCommunication(commIds.commLinked, commIds.lawyer, 'LAWYER', { title: 'Lawyer follow-up' });
      taskIds.push(result.task.id);
      expect(result.task.sourceCommunicationId).toBe(commIds.commLinked);
    });
  });

  describe('SEC-D compliance proposal → task', () => {
    it('DENIES a collaborator-only professional with zero side effects', async () => {
      const created = await createProposal({ userId: comp.admin, role: 'ADMIN' }, {
        findingId: comp.finding,
        proposalKind: 'REMEDIATION',
        actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP',
        title: 'S0A remediation proposal',
        caseId: comp.caseA,
      }, db);
      proposalIds.push(created.id);

      const before = await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL', caseId: comp.caseA } });
      await expect(
        confirmProposal({ userId: comp.collaborator, role: 'COLLAB_LAWYER' }, created.id, db),
      ).rejects.toMatchObject({ status: 403, code: 'CASE_MANAGE_REQUIRED' });

      const stored = await db.complianceProposal.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.status).toBe('PROPOSED');
      expect(stored.taskId).toBeNull();
      expect(stored.confirmedById).toBeNull();
      expect(stored.confirmedAt).toBeNull();
      expect(stored.confirmedCaseId).toBeNull();
      expect(await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL', caseId: comp.caseA } })).toBe(before);
    });

    it('preserves the CASE_MANAGE admin confirmation', async () => {
      const created = await createProposal({ userId: comp.admin, role: 'ADMIN' }, {
        findingId: comp.finding,
        proposalKind: 'REMEDIATION',
        actionIntentKey: 'REMEDIATE_COMPLIANCE_GAP',
        title: 'S0A admin remediation',
        caseId: comp.caseA,
      }, db);
      proposalIds.push(created.id);
      const task = await confirmProposal({ userId: comp.admin, role: 'ADMIN' }, created.id, db);
      taskIds.push(task.id);
      expect(task.caseId).toBe(comp.caseA);
    });
  });
});
