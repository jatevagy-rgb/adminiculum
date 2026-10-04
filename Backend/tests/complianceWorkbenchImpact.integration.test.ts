import crypto from 'node:crypto';
import express from 'express';
const mockActors = new Map<string, { userId: string; role: string }>();
jest.mock('../src/middleware/auth', () => ({
  ...jest.requireActual('../src/middleware/auth'),
  authenticate: (req: any, res: any, next: any) => { req.user = mockActors.get(req.headers.authorization); if (!req.user) return res.status(401).json({ code: 'UNAUTHENTICATED' }); next(); },
}));
import { PrismaClient } from '@prisma/client';
import { getClientComplianceWorkbench } from '../src/modules/compliance/complianceWorkbenchService';
import { clientImpactContext, decideClientImpact } from '../src/modules/compliance/complianceImpactDecisionService';
import { reconcileClientCompliance } from '../src/modules/compliance/complianceReconcileService';
import { createProposal } from '../src/modules/compliance/complianceProposalService';
import { acceptSubmissionCompliance } from '../src/modules/client-interaction/complianceAcceptanceService';
import { reviewEvidenceRecord } from '../src/modules/compliance/controlEvidenceService';
import { getClientSafeComplianceReadModel } from '../src/modules/compliance/clientSafeComplianceService';
import { createRequirement, createRequirementVersion, addRequirementCitation, approveRequirementVersion, createApplicabilityRuleVersion, approveApplicabilityRuleVersion } from '../src/modules/compliance/requirementRuleService';

const url = process.env.COMPLIANCE_WORKBENCH_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const pg = url ? describe : describe.skip;
jest.setTimeout(90000);
pg('BE-COMP-003/004 canonical workbench and impact decisions (real PG)', () => {
  const db = url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const customer = { userId: crypto.randomUUID(), role: 'CLIENT' };
  const clientId = crypto.randomUUID(), otherClientId = crypto.randomUUID(), caseId = crypto.randomUUID();
  const definitionId = crypto.randomUUID(), factKey = `wb_${definitionId}`, domainCode = `WB_${crypto.randomUUID()}`;
  const identityId = crypto.randomUUID();
  let sourceId: string, versionId: string, requirementVersionId: string;
  beforeAll(async () => {
    for (const actor of [admin, lawyer, customer]) await db.user.create({ data: { id: actor.userId, role: actor.role as any, name: actor.role, email: `${actor.userId}@example.invalid`, status: 'ACTIVE', isActive: true } });
    await db.client.createMany({ data: [{ id: clientId, name: 'Workbench client' }, { id: otherClientId, name: 'Outside client' }] });
    await db.case.create({ data: { id: caseId, caseNumber: caseId, title: 'Workbench case', caseType: 'CONTRACT_REVIEW', clientId, createdById: admin.userId, assignedLawyerId: lawyer.userId } });
    await db.clientOperatingProfile.create({ data: { clientId, complianceEnrollmentStatus: 'ENROLLED' } });
    await db.clientPortalIdentity.create({ data: { id: identityId, provider: 'ENTRA_EXTERNAL_ID', issuer: 'wb', subject: identityId, normalizedEmail: `${identityId}@example.invalid`, displayName: 'Customer', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Workbench fixture' } });
    await db.factDefinition.create({ data: { id: definitionId, key: factKey, domainCode, valueType: 'BOOLEAN', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'VALIDITY_INTERVAL' } });
    const source = await db.legalSource.create({ data: { sourceKey: crypto.randomUUID(), jurisdictionCode: 'EU', instrumentType: 'LEGISLATION', status: 'APPROVED' } }); sourceId = source.id;
    const version = await db.legalSourceVersion.create({ data: { legalSourceId: sourceId, legalVersionKey: 'WB-V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } }); versionId = version.id;
    const requirement = await createRequirement({ key: crypto.randomUUID(), jurisdictionCode: 'EU', domainCode, db });
    const rv = await createRequirementVersion({ requirementId: requirement.id, versionKey: 'V1', title: 'Workbench requirement', normativeStatement: 'Fixture requirement', effectiveFrom: new Date('2026-01-01'), sourceSupportState: 'SUFFICIENT', db }); requirementVersionId = rv.id;
    await addRequirementCitation({ requirementVersionId: rv.id, legalSourceVersionId: versionId, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(rv.id, admin.userId, db);
    const rule = await createApplicabilityRuleVersion({ requirementVersionId: rv.id, ruleVersionKey: 'R1', evaluationScopeType: 'COMPANY', astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } } }, db });
    await approveApplicabilityRuleVersion(rule.id, admin.userId, db);
    await reconcileClientCompliance(admin, clientId, db);
  });
  afterAll(async () => {
    if (requirementVersionId) await db.requirementVersion.update({ where: { id: requirementVersionId }, data: { status: 'RETIRED' } });
    await db.$disconnect();
    await (await import('../src/prisma/prisma.service')).prisma.$disconnect();
  });
  async function observation(status = 'IMPACT_CONFIRMED') {
    return db.legalSourceObservation.create({ data: { idempotencyKey: crypto.randomUUID(), payloadDigest: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64), kind: 'CONSOLIDATED_VERSION_AVAILABLE', source: 'EUR_LEX', identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', relatedIdentifier: '02016R0679-20260101', legalSourceId: sourceId, legalSourceVersionId: versionId, sourceUri: 'https://eur-lex.europa.eu/', capturedAt: new Date(), reviewStatus: status as any, decidedAt: status === 'IMPACT_CONFIRMED' ? new Date() : null, decidedById: status === 'IMPACT_CONFIRMED' ? admin.userId : null } });
  }
  async function input(id: string, kind: any = 'NO_ACTION') { return { sourceRevision: (await clientImpactContext(admin, clientId, id, db)).sourceRevision, kind, note: 'Reviewed exact source and client impact.' }; }
  it('derives missing facts, then canonical submission acceptance removes the gap and pending row', async () => {
    expect((await getClientComplianceWorkbench(lawyer, clientId, db)).rows.some(r => r.kind === 'MISSING_FACT' && r.sourceId.endsWith(factKey))).toBe(true);
    const request = await db.clientRequest.create({ data: { clientId, caseId, createdById: admin.userId, type: 'DATA_FORM', status: 'PUBLISHED', clientSafeTitle: 'Fact answer', audienceSnapshot: {} } });
    const sub = await db.clientSubmission.create({ data: { clientId, caseId, clientRequestId: request.id, clientPortalIdentityId: identityId, status: 'SUBMITTED' } });
    const field = await db.clientSubmissionField.create({ data: { submissionId: sub.id, labelSnapshot: 'Fixture answer', valueSafe: 'Yes' } });
    expect((await getClientComplianceWorkbench(lawyer, clientId, db)).rows.find(r => r.sourceId === sub.id)?.action).toBe('SUBMISSION_REVIEW');
    await acceptSubmissionCompliance(lawyer, sub.id, { outcome: 'ACCEPT_FACT', expectedRevision: 0, reason: 'Reviewed answer', fieldId: field.id, factDefinitionId: definitionId, fact: { scopeType: 'COMPANY', booleanValue: true, validFrom: '2026-01-01T00:00:00.000Z' } }, db);
    const rows = (await getClientComplianceWorkbench(lawyer, clientId, db)).rows;
    expect(rows.some(r => r.sourceId === sub.id)).toBe(false);
    expect(rows.some(r => r.kind === 'MISSING_FACT' && r.sourceId.endsWith(factKey))).toBe(false);
  });
  it('derives a stale evidence review row; canonical rejection removes it', async () => {
    const e = await db.evidenceRecord.create({ data: { clientId, sourceType: 'EXTERNAL_REFERENCE', title: 'Expired review', externalReference: 'fixture', status: 'ACCEPTED', validUntil: new Date('2025-01-01') } });
    const row = (await getClientComplianceWorkbench(lawyer, clientId, db)).rows.find(r => r.sourceId === e.id)!;
    expect(row).toMatchObject({ kind: 'STALE_EVIDENCE', status: 'STALE:ACCEPTED', action: 'EVIDENCE_REVIEW', ownerId: null });
    await reviewEvidenceRecord(lawyer, clientId, e.id, { status: 'REJECTED' }, db);
    expect((await getClientComplianceWorkbench(lawyer, clientId, db)).rows.some(r => r.sourceId === e.id)).toBe(false);
  });
  it('shows exact observation/version and requires human review before an operator decision', async () => {
    const o = await observation('NEW');
    const row = (await getClientComplianceWorkbench(lawyer, clientId, db)).rows.find(r => r.sourceId === o.id)!;
    expect(row).toMatchObject({ action: 'SOURCE_REVIEW', source: { legalSourceId: sourceId, legalSourceVersionId: versionId, versionKey: 'WB-V1' } });
    await expect(decideClientImpact(admin, clientId, o.id, { sourceRevision: row.source!.revision, kind: 'NO_ACTION', note: 'Not reviewed' }, db)).rejects.toMatchObject({ code: 'OBSERVATION_IMPACT_NOT_CONFIRMED' });
  });
  it('no-action creates only one durable decision and no work or publication; concurrent retries replay', async () => {
    const o = await observation(), command = await input(o.id);
    const counts = [await db.case.count(), await db.task.count(), await db.complianceProposal.count(), await db.requirementVersion.count()];
    const safe = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const results = await Promise.all([decideClientImpact(admin, clientId, o.id, command, db), decideClientImpact(admin, clientId, o.id, command, db)]);
    expect(results[0].id).toBe(results[1].id);
    expect(await db.complianceImpactDecision.count({ where: { observationId: o.id, clientId } })).toBe(1);
    expect([await db.case.count(), await db.task.count(), await db.complianceProposal.count(), await db.requirementVersion.count()]).toEqual(counts);
    expect(await getClientSafeComplianceReadModel(clientId, true, false, db)).toEqual(safe);
    await expect(decideClientImpact(admin, clientId, o.id, { ...command, kind: 'REEVALUATE' }, db)).rejects.toMatchObject({ code: 'IMPACT_ALREADY_DECIDED' });
  });
  it('remediation concurrently reuses exactly one canonical proposal Case/Task bridge', async () => {
    const finding = await db.assessmentFinding.findFirstOrThrow({ where: { clientId, requirementApplicability: { requirementVersionId }, status: { not: 'RESOLVED' } } });
    const proposal = await createProposal(admin, { findingId: finding.id, proposalKind: 'REMEDIATION', title: 'Review impacted obligation' }, db);
    const o = await observation(), command = { ...await input(o.id, 'REMEDIATION'), proposalId: proposal.id };
    const safe = await getClientSafeComplianceReadModel(clientId, true, false, db);
    const beforeCases = await db.case.count({ where: { clientId } }), beforeTasks = await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL' } });
    const [a, b] = await Promise.all([decideClientImpact(admin, clientId, o.id, command, db), decideClientImpact(admin, clientId, o.id, command, db)]);
    expect(a.id).toBe(b.id);
    const persisted = await db.complianceProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(persisted.status).toBe('CONFIRMED'); expect(persisted.taskId).toBeTruthy(); expect(persisted.caseId).toBeTruthy();
    expect(await db.case.count({ where: { clientId } })).toBe(beforeCases + 1); expect(await db.task.count({ where: { type: 'COMPLIANCE_PROPOSAL' } })).toBe(beforeTasks + 1);
    expect(await db.task.count({ where: { caseId: persisted.caseId!, type: 'COMPLIANCE_PROPOSAL' } })).toBe(1);
    expect(a.result).toMatchObject({ proposalId: proposal.id, caseId: persisted.caseId, taskId: persisted.taskId });
    expect(await getClientSafeComplianceReadModel(clientId, true, false, db)).toEqual(safe);
    expect((await db.legalSourceVersion.findUniqueOrThrow({ where: { id: versionId } })).reviewStatus).toBe('APPROVED');
  });
  it('explicit reevaluation uses canonical reconcile and replays without duplicate snapshots', async () => {
    const o = await observation(), command = await input(o.id, 'REEVALUATE');
    const first = await decideClientImpact(admin, clientId, o.id, command, db);
    const n = await db.requirementApplicability.count({ where: { clientId } });
    expect((await decideClientImpact(admin, clientId, o.id, command, db)).id).toBe(first.id);
    expect(await db.requirementApplicability.count({ where: { clientId } })).toBe(n);
  });
  it('creates only an unapproved canonical rule review draft with exact source citation', async () => {
    const o = await observation();
    const command = { ...await input(o.id, 'RULE_REVIEW'), requirementVersionId, draft: { versionKey: `review-${o.id}`, title: 'Explicit review', normativeStatement: 'Operator-authored candidate', effectiveFrom: '2027-01-01' } };
    const decision = await decideClientImpact(admin, clientId, o.id, command, db);
    const id = (decision.result as any).requirementVersionId;
    expect(await db.requirementVersion.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'IN_REVIEW', approvedById: null });
    expect(await db.requirementCitation.count({ where: { requirementVersionId: id, legalSourceVersionId: versionId } })).toBe(1);
    expect((await decideClientImpact(admin, clientId, o.id, command, db)).id).toBe(decision.id);
    expect(await db.applicabilityRuleVersion.count({ where: { requirementVersionId: id } })).toBe(0);
  });
  it('denies cross-client impact, spoofed persisted role, unauthenticated actor and customer', async () => {
    const o = await observation(), command = await input(o.id);
    await expect(getClientComplianceWorkbench(lawyer, otherClientId, db)).rejects.toMatchObject({ status: 403 });
    await expect(decideClientImpact(admin, otherClientId, o.id, command, db)).rejects.toMatchObject({ code: 'IMPACT_CLIENT_NOT_LINKED' });
    for (const actor of [customer, { ...customer, role: 'ADMIN' }, { userId: '', role: 'ADMIN' }]) await expect(decideClientImpact(actor, clientId, o.id, command, db)).rejects.toMatchObject({ status: 403 });
    expect(await db.complianceImpactDecision.count({ where: { observationId: o.id } })).toBe(0);
  });
  it('conflicts on stale source lifecycle revision with no decision side effects', async () => {
    const o = await observation(), command = await input(o.id);
    await db.legalSourceVersion.update({ where: { id: versionId }, data: { versionLabel: 'Changed after read' } });
    await expect(decideClientImpact(admin, clientId, o.id, command, db)).rejects.toMatchObject({ code: 'IMPACT_SOURCE_REVISION_CONFLICT' });
    expect(await db.complianceImpactDecision.count({ where: { observationId: o.id } })).toBe(0);
  });
  it('denies a proposal outside exact impact, without creating a receipt', async () => {
    const o = await observation(), command = { ...await input(o.id, 'REMEDIATION'), proposalId: crypto.randomUUID() };
    await expect(decideClientImpact(admin, clientId, o.id, command, db)).rejects.toMatchObject({ code: 'IMPACT_PROPOSAL_NOT_LINKED' });
    expect(await db.complianceImpactDecision.count({ where: { observationId: o.id } })).toBe(0);
  });
  it('routes use only the authenticated actor and deny cross-client/customer writes', async () => {
    mockActors.set('Bearer admin', admin); mockActors.set('Bearer lawyer', lawyer); mockActors.set('Bearer customer', customer);
    const app = express(); app.use(express.json());
    app.use('/compliance', (await import('../src/modules/compliance/complianceCenterRoutes')).default);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/compliance/clients`;
    try {
      const o = await observation(), command = await input(o.id);
      const endpoint = `${base}/${clientId}/source-impacts/${o.id}/decision`;
      expect((await fetch(`${base}/${clientId}/workbench`)).status).toBe(401);
      expect((await fetch(`${base}/${otherClientId}/workbench`, { headers: { authorization: 'Bearer lawyer' } })).status).toBe(403);
      expect((await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer customer', 'content-type': 'application/json' }, body: JSON.stringify(command) })).status).toBe(403);
      const result = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer admin', 'content-type': 'application/json' }, body: JSON.stringify({ ...command, decidedById: lawyer.userId, clientId: otherClientId, role: 'PARTNER' }) });
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ decidedById: admin.userId, clientId });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('does not expose same-client submissions/evidence from inaccessible cases', async () => {
    const hiddenCase = await db.case.create({ data: { caseNumber: crypto.randomUUID(), title: 'Private case', caseType: 'CONTRACT_REVIEW', clientId, createdById: admin.userId, assignedLawyerId: admin.userId } });
    const doc = await db.document.create({ data: { clientId, caseId: hiddenCase.id, name: 'Private evidence', fileName: 'private.pdf', category: 'CLIENT_INPUT' } });
    const v = await db.documentVersion.create({ data: { documentId: doc.id, version: 1, name: 'private.pdf', uploadedById: admin.userId, securityScanStatus: 'CLEAN' } });
    const e = await db.evidenceRecord.create({ data: { clientId, sourceType: 'DOCUMENT_VERSION', documentVersionId: v.id, title: 'Private evidence', status: 'PROVIDED' } });
    const request = await db.clientRequest.create({ data: { clientId, caseId: hiddenCase.id, createdById: admin.userId, type: 'DATA_FORM', status: 'PUBLISHED', clientSafeTitle: 'Private request', audienceSnapshot: {} } });
    const sub = await db.clientSubmission.create({ data: { clientId, caseId: hiddenCase.id, clientRequestId: request.id, clientPortalIdentityId: identityId, status: 'SUBMITTED' } });
    const rows = (await getClientComplianceWorkbench(lawyer, clientId, db)).rows;
    expect(rows.some(r => r.sourceId === e.id || r.sourceId === sub.id)).toBe(false);
  });

});
