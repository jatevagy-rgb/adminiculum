import crypto from 'node:crypto';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { acceptSubmissionCompliance, ComplianceAcceptanceInput } from '../src/modules/client-interaction/complianceAcceptanceService';
import * as submissions from '../src/modules/client-interaction/submissionService';
import * as evidence from '../src/modules/compliance/controlEvidenceService';
import * as reconcile from '../src/modules/compliance/complianceReconcileService';
import { CustomerContext } from '../src/modules/client-interaction/base';
import { createRequirement, createRequirementVersion, addRequirementCitation, approveRequirementVersion,
  createApplicabilityRuleVersion, approveApplicabilityRuleVersion } from '../src/modules/compliance/requirementRuleService';

// Only token verification is substituted. The mounted role gate and all domain,
// authorization, scan, transaction and persistence behavior use production code.
const mockActors = new Map<string, { userId: string; role: string }>();
jest.mock('../src/middleware/auth', () => ({
  ...jest.requireActual('../src/middleware/auth'),
  authenticate: (req: any, res: any, next: any) => {
    req.user = mockActors.get(req.headers.authorization);
    if (!req.user) return res.status(401).json({ code: 'UNAUTHENTICATED' });
    next();
  },
}));

const databaseUrl = process.env.COMPLIANCE_ACCEPTANCE_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;
jest.setTimeout(60000);

describePg('Submission Compliance acceptance — real PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const customer = { userId: crypto.randomUUID(), role: 'CLIENT' };
  const clientId = crypto.randomUUID();
  const otherClientId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const otherCaseId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const domainCode = `CA_${crypto.randomUUID()}`;
  const definitionId = crypto.randomUUID();
  const factKey = `acceptance_${definitionId}`;
  let requirementVersionId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    for (const actor of [admin, lawyer, customer]) {
      mockActors.set(`Bearer ${actor.role}`, actor);
      await db.user.create({ data: { id: actor.userId, email: `${actor.userId}@example.invalid`, name: actor.role, role: actor.role as any, status: 'ACTIVE', isActive: true } });
    }
    await db.client.createMany({ data: [{ id: clientId, name: 'Acceptance client' }, { id: otherClientId, name: 'Other client' }] });
    await db.clientPortalIdentity.create({ data: { id: identityId, provider: 'ENTRA_EXTERNAL_ID', issuer: 'acceptance-test',
      subject: identityId, normalizedEmail: `${identityId}@example.invalid`, displayName: 'Customer', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
    for (const id of [caseId, otherCaseId]) await db.case.create({ data: {
      id, caseNumber: id, title: 'Acceptance case', caseType: 'CONTRACT_REVIEW', clientId,
      createdById: admin.userId, assignedLawyerId: id === caseId ? lawyer.userId : admin.userId,
    } });
    await db.clientOperatingProfile.create({ data: { clientId, complianceEnrollmentStatus: 'ENROLLED' } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Acceptance test' } });
    await db.factDefinition.create({ data: { id: definitionId, key: factKey, domainCode, valueType: 'BOOLEAN',
      allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'VALIDITY_INTERVAL' } });
    const source = await db.legalSource.create({ data: { sourceKey: crypto.randomUUID(), jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED' } });
    const sourceVersion = await db.legalSourceVersion.create({ data: { legalSourceId: source.id, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } });
    const requirement = await createRequirement({ key: crypto.randomUUID(), jurisdictionCode: 'HU', domainCode, db });
    const version = await createRequirementVersion({ requirementId: requirement.id, versionKey: 'V1', title: 'Acceptance requirement',
      normativeStatement: 'Acceptance fixture', effectiveFrom: new Date('2026-01-01'), sourceSupportState: 'SUFFICIENT', db });
    requirementVersionId = version.id;
    await addRequirementCitation({ requirementVersionId: version.id, legalSourceVersionId: sourceVersion.id, supportRole: 'PRIMARY', db });
    await approveRequirementVersion(version.id, admin.userId, db);
    const rule = await createApplicabilityRuleVersion({ requirementVersionId: version.id, ruleVersionKey: 'R1', evaluationScopeType: 'COMPANY',
      astJson: { schemaVersion: 'rule-ast/v1', node: { kind: 'COMPARE', operator: 'EQ', left: { kind: 'FACT', factKey }, right: { kind: 'LITERAL', valueType: 'boolean', value: true } } }, db });
    await approveApplicabilityRuleVersion(rule.id, admin.userId, db);
  }, 60000);
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    // Retain rows in this disposable database for independent inspection, but retire
    // this test rule so adjacent suites do not inherit its approved corpus.
    if (requirementVersionId) await db.requirementVersion.update({ where: { id: requirementVersionId }, data: { status: 'RETIRED' as any } });
    await db.$disconnect();
    await (await import('../src/prisma/prisma.service')).prisma.$disconnect();
  });

  async function fixture(status: string = 'CLEAN') {
    const request = await db.clientRequest.create({ data: { clientId, caseId, createdById: admin.userId,
      type: 'DOCUMENT_UPLOAD', status: 'PUBLISHED', clientSafeTitle: 'Supporting document', audienceSnapshot: {} } });
    const sub = await db.clientSubmission.create({ data: { clientId, caseId, clientRequestId: request.id, clientPortalIdentityId: identityId, status: 'SUBMITTED' } });
    const file = await db.clientSubmissionFile.create({ data: { submissionId: sub.id, originalFileNameSafe: 'source.pdf',
      detectedMimeType: 'application/pdf', status: status as any, scannedAt: status === 'CLEAN' ? new Date() : null,
      scanProvider: 'TEST', quarantineStorageReference: `test:${crypto.randomUUID()}` } });
    const field = await db.clientSubmissionField.create({ data: { submissionId: sub.id, labelSnapshot: 'Has employees', valueSafe: 'Yes' } });
    const input: ComplianceAcceptanceInput = { outcome: 'ACCEPT_EVIDENCE', expectedRevision: 0, fileId: file.id, reason: 'Checked supporting document' };
    return { request, sub, file, field, input };
  }

  async function version(options: { client?: string; owningCase?: string; classification?: string; scan?: string } = {}) {
    const doc = await db.document.create({ data: { clientId: options.client || clientId, caseId: options.owningCase || caseId,
      name: 'Evidence', fileName: 'evidence.pdf', mimeType: 'application/pdf', category: 'CLIENT_INPUT', securityClassification: (options.classification || 'STANDARD') as any } });
    return db.documentVersion.create({ data: { documentId: doc.id, version: 1, name: 'Evidence', uploadedById: admin.userId,
      securityScanStatus: (options.scan || 'CLEAN') as any, storageReference: `test:${crypto.randomUUID()}` } });
  }

  async function expectUnaccepted(id: string, fileId: string) {
    const sub = await db.clientSubmission.findUniqueOrThrow({ where: { id } });
    expect(sub.complianceAcceptance).toBeNull();
    expect(sub.status).toBe('SUBMITTED');
    expect(sub.acceptedDocumentVersionId).toBeNull();
    expect((await db.clientSubmissionFile.findUniqueOrThrow({ where: { id: fileId } })).acceptedDocumentVersionId).toBeNull();
  }

  it('denies customer, unauthenticated, and unassigned actor decisions', async () => {
    const f = await fixture();
    for (const actor of [customer, { userId: '', role: 'ADMIN' }]) {
      await expect(acceptSubmissionCompliance(actor, f.sub.id, f.input, db)).rejects.toMatchObject({ status: 403 });
    }
    await db.case.update({ where: { id: caseId }, data: { assignedLawyerId: admin.userId } });
    try { await expect(acceptSubmissionCompliance(lawyer, f.sub.id, f.input, db)).rejects.toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' }); }
    finally { await db.case.update({ where: { id: caseId }, data: { assignedLawyerId: lawyer.userId } }); }
    await expectUnaccepted(f.sub.id, f.file.id);
  });

  it.each(['UPLOADED', 'SCANNING', 'SCAN_FAILED', 'INFECTED'])('does not accept a %s submission file', async (status) => {
    const f = await fixture(status);
    await expect(acceptSubmissionCompliance(admin, f.sub.id, f.input, db)).rejects.toMatchObject({ code: 'FILE_NOT_CLEAN' });
    await expectUnaccepted(f.sub.id, f.file.id);
  });

  it('accepts CLEAN exact file, reads back provenance and canonical reevaluation, and denies retry duplication', async () => {
    const f = await fixture();
    const before = new Date();
    const receipt = await acceptSubmissionCompliance(lawyer, f.sub.id, { ...f.input, reviewedByUserId: admin.userId, reviewedAt: '2000-01-01' } as any, db);
    expect(receipt).toMatchObject({ clientId, caseId, requestId: f.request.id, submissionId: f.sub.id, fileId: f.file.id,
      reviewedByUserId: lawyer.userId, reevaluation: { status: 'COMPLETED', enrolled: true } });
    expect(receipt.reevaluation.evaluated).toBeGreaterThan(0);
    expect(new Date(receipt.reviewedAt).getTime()).toBeGreaterThanOrEqual(before.getTime());
    const record = await db.evidenceRecord.findUniqueOrThrow({ where: { id: receipt.evidenceRecordId! } });
    expect(record).toMatchObject({ status: 'ACCEPTED', reviewedByUserId: lawyer.userId, documentVersionId: receipt.documentVersionId });
    const acceptedVersion = await db.documentVersion.findUniqueOrThrow({ where: { id: receipt.documentVersionId! } });
    expect(acceptedVersion).toMatchObject({ documentId: receipt.documentId, securityScanStatus: 'CLEAN', storageReference: f.file.quarantineStorageReference });
    expect((await submissions.getSubmissionInternal(admin, f.sub.id, db)).complianceAcceptance).toEqual(receipt);
    await expect(acceptSubmissionCompliance(lawyer, f.sub.id, f.input, db)).rejects.toMatchObject({ code: 'COMPLIANCE_ALREADY_ACCEPTED' });
    expect(await db.evidenceRecord.count({ where: { documentVersionId: receipt.documentVersionId } })).toBe(1);
    expect((await db.clientRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe('PUBLISHED');
    const safe = await submissions.getCustomerSubmission({ clientPortalIdentityId: identityId, caseId } as CustomerContext, f.sub.id, db);
    expect(JSON.stringify(safe)).not.toMatch(/reviewedBy|reviewedAt|complianceAcceptance|evidenceRecordId|storageReference/);
  });

  it('accepts an already accepted file by its own version even after another file changes the submission pointer', async () => {
    const f = await fixture();
    const first = await submissions.acceptFileIntoMatter(admin, f.sub.id, f.file.id, {}, db);
    const second = await db.clientSubmissionFile.create({ data: { submissionId: f.sub.id, originalFileNameSafe: 'second.pdf', status: 'CLEAN', quarantineStorageReference: 'test:second' } });
    await submissions.acceptFileIntoMatter(admin, f.sub.id, second.id, {}, db);
    const receipt = await acceptSubmissionCompliance(admin, f.sub.id, { ...f.input, expectedRevision: 2, documentVersionId: first.documentVersionId }, db);
    expect(receipt.documentVersionId).toBe(first.documentVersionId);
  });

  it('denies cross-submission file, cross-client document and cross-case destination', async () => {
    const f = await fixture(); const other = await fixture();
    await expect(acceptSubmissionCompliance(admin, f.sub.id, { ...f.input, fileId: other.file.id }, db)).rejects.toMatchObject({ code: 'EVIDENCE_ARTIFACT_FORBIDDEN' });
    for (const v of [await version({ client: otherClientId }), await version({ owningCase: otherCaseId })]) {
      await expect(acceptSubmissionCompliance(admin, f.sub.id, { ...f.input, documentId: v.documentId }, db)).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    }
    await expectUnaccepted(f.sub.id, f.file.id);
  });

  it('denies mismatched document and exact version on an already accepted file', async () => {
    const f = await fixture();
    const accepted = await submissions.acceptFileIntoMatter(admin, f.sub.id, f.file.id, {}, db);
    const unrelated = await version();
    await expect(acceptSubmissionCompliance(admin, f.sub.id, { ...f.input, expectedRevision: 1, documentVersionId: unrelated.id }, db)).rejects.toMatchObject({ code: 'EXACT_VERSION_MISMATCH' });
    await expect(acceptSubmissionCompliance(admin, f.sub.id, { ...f.input, expectedRevision: 1, documentVersionId: accepted.documentVersionId, documentId: unrelated.documentId }, db)).rejects.toMatchObject({ code: 'EVIDENCE_ARTIFACT_FORBIDDEN' });
  });

  it('denies confidential destination and confidential evidence for a case-authorized lawyer', async () => {
    const f = await fixture(); const v = await version({ classification: 'HR_CONFIDENTIAL' });
    await expect(acceptSubmissionCompliance(lawyer, f.sub.id, { ...f.input, documentId: v.documentId }, db)).rejects.toMatchObject({ code: 'DOCUMENT_ACCESS_FORBIDDEN' });
    await expect(evidence.createEvidenceRecord(lawyer, clientId, { sourceType: 'DOCUMENT_VERSION', documentVersionId: v.id, title: 'Restricted', status: 'ACCEPTED' }, db)).rejects.toMatchObject({ code: 'DOCUMENT_ACCESS_FORBIDDEN' });
    await expectUnaccepted(f.sub.id, f.file.id);
  });

  it.each(['PENDING_SCAN', 'SCAN_FAILED', 'INFECTED'])('allows PROVIDED but prevents %s exact version from being ACCEPTED on create or review', async (scan) => {
    const v = await version({ scan });
    // A clean newer version must never launder a blocked historical version.
    await db.documentVersion.create({ data: { documentId: v.documentId, version: 2, name: 'New clean version', uploadedById: admin.userId, securityScanStatus: 'CLEAN', isCurrent: true } });
    const input = { sourceType: 'DOCUMENT_VERSION', documentVersionId: v.id, title: 'Pending evidence' };
    await expect(evidence.createEvidenceRecord(admin, clientId, { ...input, status: 'ACCEPTED' }, db)).rejects.toMatchObject({ code: 'DOCUMENT_SECURITY_SCAN_BLOCKED' });
    const provided = await evidence.createEvidenceRecord(admin, clientId, input, db);
    await expect(evidence.reviewEvidenceRecord(admin, clientId, provided.id, { status: 'ACCEPTED' }, db)).rejects.toMatchObject({ code: 'DOCUMENT_SECURITY_SCAN_BLOCKED' });
    expect((await db.evidenceRecord.findUniqueOrThrow({ where: { id: provided.id } })).status).toBe('PROVIDED');
    expect((await evidence.reviewEvidenceRecord(admin, clientId, provided.id, { status: 'REJECTED' }, db)).status).toBe('REJECTED');
  });

  it('binds direct evidence create and review to server actor/time; checks cross-client and owning case', async () => {
    const v = await version();
    const input = { sourceType: 'DOCUMENT_VERSION', documentVersionId: v.id, title: 'Reviewed', status: 'ACCEPTED', reviewedByUserId: admin.userId, reviewedAt: '2000-01-01' };
    const created = await evidence.createEvidenceRecord(lawyer, clientId, input, db);
    expect(created.reviewedByUserId).toBe(lawyer.userId);
    expect(created.reviewedAt!.getUTCFullYear()).not.toBe(2000);
    const supplied = await evidence.createEvidenceRecord(admin, clientId, { ...input, status: 'PROVIDED' }, db);
    const reviewed = await evidence.reviewEvidenceRecord(lawyer, clientId, supplied.id, { status: 'ACCEPTED', reviewedByUserId: admin.userId } as any, db);
    expect(reviewed.reviewedByUserId).toBe(lawyer.userId);
    await expect(evidence.createEvidenceRecord(admin, otherClientId, input, db)).rejects.toMatchObject({ code: 'EVIDENCE_ARTIFACT_FORBIDDEN' });
    const hidden = await version({ owningCase: otherCaseId });
    await expect(evidence.createEvidenceRecord(lawyer, clientId, { ...input, documentVersionId: hidden.id }, db)).rejects.toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    const hiddenEvidence = await evidence.createEvidenceRecord(admin, clientId, { ...input, documentVersionId: hidden.id, status: 'PROVIDED' }, db);
    await expect(evidence.reviewEvidenceRecord(lawyer, clientId, hiddenEvidence.id, { status: 'ACCEPTED' }, db)).rejects.toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
  });

  it('creates a typed accepted fact with answer provenance and actual applicability reevaluation', async () => {
    const f = await fixture();
    const receipt = await acceptSubmissionCompliance(admin, f.sub.id, { outcome: 'ACCEPT_FACT', expectedRevision: 0, reason: 'Confirmed answer',
      fieldId: f.field.id, factDefinitionId: definitionId, fact: { scopeType: 'COMPANY', booleanValue: true, sourceReference: 'forged', sourceDocumentVersionId: 'forged' } }, db);
    const fact = await db.clientFact.findUniqueOrThrow({ where: { id: receipt.factId! } });
    expect(fact).toMatchObject({ verificationStatus: 'LAW_FIRM_VERIFIED', booleanValue: true, sourceReference: `CLIENT_SUBMISSION:${f.sub.id}`, sourceDocumentVersionId: null });
    expect(receipt.field).toMatchObject({ id: f.field.id, valueSafe: 'Yes' });
    expect(await db.requirementApplicability.count({ where: { clientId, requirementVersionId, outcome: 'APPLIES' } })).toBeGreaterThan(0);
    expect(receipt.evidenceRecordId).toBeNull();
    await expect(acceptSubmissionCompliance(admin, f.sub.id, { ...f.input, outcome: 'ACCEPT_FACT' }, db)).rejects.toMatchObject({ code: 'COMPLIANCE_ALREADY_ACCEPTED' });
    expect(await db.clientFact.count({ where: { sourceReference: `CLIENT_SUBMISSION:${f.sub.id}` } })).toBe(1);
  });

  it.each(['ACCEPT_FACT', 'ACCEPT_EVIDENCE'] as const)('rolls back %s and file/version on injected downstream reevaluation failure', async (outcome) => {
    const f = await fixture();
    const evidenceCount = await db.evidenceRecord.count({ where: { clientId } });
    const versionCount = await db.documentVersion.count({ where: { document: { clientId } } });
    jest.spyOn(reconcile, 'reconcileClientComplianceInTx').mockRejectedValueOnce(new Error('injected downstream failure'));
    await expect(acceptSubmissionCompliance(admin, f.sub.id, { ...f.input, outcome, factDefinitionId: definitionId, fact: { scopeType: 'COMPANY', booleanValue: false } }, db)).rejects.toThrow('injected downstream failure');
    await expectUnaccepted(f.sub.id, f.file.id);
    expect(await db.evidenceRecord.count({ where: { clientId } })).toBe(evidenceCount);
    expect(await db.documentVersion.count({ where: { document: { clientId } } })).toBe(versionCount);
    expect(await db.clientFact.count({ where: { sourceReference: `CLIENT_SUBMISSION:${f.sub.id}` } })).toBe(0);
  });

  it('links evidence to the request control without marking the control implemented or exposing internal review metadata', async () => {
    const f = await fixture();
    const definition = await evidence.createControlDefinition(admin, { key: crypto.randomUUID(), title: 'Document control', type: 'PROCEDURAL' }, db);
    const control = await evidence.createClientControl(admin, clientId, { controlDefinitionId: definition.id }, db);
    await db.clientRequest.update({ where: { id: f.request.id }, data: { clientControlId: control.id } });
    const receipt = await acceptSubmissionCompliance(admin, f.sub.id, f.input, db);
    expect(await db.evidenceControlLink.count({ where: { clientControlId: control.id, evidenceRecordId: receipt.evidenceRecordId! } })).toBe(1);
    const safe = await evidence.getClientControl(admin, clientId, control.id, db);
    expect(safe.implementationStatus).toBe('NOT_ASSESSED');
    expect(safe.evidence[0].status).toBe('ACCEPTED');
    expect(JSON.stringify(safe)).not.toMatch(/reviewedBy|reviewedAt|complianceAcceptance|reason/);
    const otherControl = await evidence.createClientControl(admin, otherClientId, { controlDefinitionId: definition.id }, db);
    const another = await fixture();
    await expect(acceptSubmissionCompliance(admin, another.sub.id, { ...another.input, clientControlId: otherControl.id }, db)).rejects.toMatchObject({ code: 'EVIDENCE_CONTROL_FORBIDDEN' });
    await expectUnaccepted(another.sub.id, another.file.id);
  });

  it('does not infer exact legacy file provenance or accept a customer unavailability declaration', async () => {
    const f = await fixture();
    await db.clientSubmissionFile.update({ where: { id: f.file.id }, data: { status: 'ACCEPTED' } });
    await expect(acceptSubmissionCompliance(admin, f.sub.id, f.input, db)).rejects.toMatchObject({ code: 'EXACT_FILE_VERSION_UNAVAILABLE' });
    const unavailable = await fixture();
    await db.clientSubmission.update({ where: { id: unavailable.sub.id }, data: { customerUnavailableDeclaredAt: new Date() } });
    await expect(acceptSubmissionCompliance(admin, unavailable.sub.id, unavailable.input, db)).rejects.toMatchObject({ code: 'SUBMISSION_NOT_REVIEWABLE' });
  });

  it('reports NOT_ENROLLED truthfully without fabricating a completed evaluation', async () => {
    const f = await fixture();
    await db.clientOperatingProfile.update({ where: { clientId }, data: { complianceEnrollmentStatus: 'NOT_ENROLLED' } });
    try {
      const receipt = await acceptSubmissionCompliance(admin, f.sub.id, f.input, db);
      expect(receipt.reevaluation).toMatchObject({ status: 'NOT_ENROLLED', enrolled: false, evaluated: 0 });
    } finally { await db.clientOperatingProfile.update({ where: { clientId }, data: { complianceEnrollmentStatus: 'ENROLLED' } }); }
  });

  it('concurrent identical decisions create exactly one evidence record', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([acceptSubmissionCompliance(admin, f.sub.id, f.input, db), acceptSubmissionCompliance(admin, f.sub.id, f.input, db)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason.status).toBe(409);
    const row = await db.clientSubmission.findUniqueOrThrow({ where: { id: f.sub.id } });
    expect(await db.evidenceRecord.count({ where: { documentVersionId: row.acceptedDocumentVersionId } })).toBe(1);
  });

  it('correction and rejection retain original answers/files without accepting evidence', async () => {
    const f = await fixture();
    await submissions.requestCorrection(admin, f.sub.id, { reasonSafe: 'Please correct the answer', expectedRevision: 0 }, db);
    await expect(acceptSubmissionCompliance(admin, f.sub.id, { ...f.input, expectedRevision: 1 }, db)).rejects.toMatchObject({ code: 'SUBMISSION_NOT_REVIEWABLE' });
    await submissions.rejectSubmission(admin, f.sub.id, { reasonSafe: 'Not sufficient', expectedRevision: 1 }, db);
    const row = await submissions.getSubmissionInternal(admin, f.sub.id, db);
    expect(row).toMatchObject({ status: 'REJECTED', correctionReasonSafe: 'Please correct the answer', complianceAcceptance: null });
    expect(row.files.map((file) => file.id)).toContain(f.file.id);
    expect(row.fields.map((field) => field.id)).toContain(f.field.id);
  });

  it('mounts the internal command with authentication and role gating; body cannot override actor', async () => {
    const { clientInteractionInternalRouter } = await import('../src/modules/client-interaction/internalRoutes');
    const app = express(); app.use(express.json()); app.use('/api/v1/internal/client-interaction', clientInteractionInternalRouter);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const address = server.address() as { port: number }; const f = await fixture();
      const url = `http://127.0.0.1:${address.port}/api/v1/internal/client-interaction/submissions/${f.sub.id}/accept-compliance`;
      for (const [token, expected] of [['', 401], ['Bearer CLIENT', 403]] as const) {
        expect((await fetch(url, { method: 'POST', headers: { authorization: token, 'content-type': 'application/json' }, body: JSON.stringify(f.input) })).status).toBe(expected);
      }
      const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer LAWYER', 'content-type': 'application/json' },
        body: JSON.stringify({ ...f.input, reviewedByUserId: admin.userId, actor: admin }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ reviewedByUserId: lawyer.userId });
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
