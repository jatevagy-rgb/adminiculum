import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClientControl, createControlDefinition, createEvidenceRecord, getControlCoverage, linkEvidenceToControl, mapControlToRequirement, reviewEvidenceRecord, updateClientControl } from '../src/modules/compliance/controlEvidenceService';
import { materializeRequirementApplicabilityFinding } from '../src/modules/compliance/findingMaterializationService';
import { createProposal } from '../src/modules/compliance/complianceProposalService';

const databaseUrl = process.env.PHASE7CB_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('compliance controls and evidence (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const unauthorizedId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const secondClientId = crypto.randomUUID();
  const domainCode = `CTRL_${suffix}`;
  const requirementId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const documentVersionId = crypto.randomUUID();
  const clientFactId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();
  const discoveryRunId = crypto.randomUUID();
  const observationId = crypto.randomUUID();
  const actor = { userId: adminId, role: 'ADMIN' };
  const unauthorizedActor = { userId: unauthorizedId, role: 'LAWYER' };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `controls-${suffix}@example.invalid`, name: 'Controls Admin', role: 'ADMIN' } });
    await db.user.create({ data: { id: unauthorizedId, email: `controls-unauthorized-${suffix}@example.invalid`, name: 'Unauthorized Lawyer', role: 'LAWYER' } });
    await db.client.createMany({ data: [{ id: clientId, name: `Controls A ${suffix}` }, { id: secondClientId, name: `Controls B ${suffix}` }] });
    await db.case.create({ data: { id: caseId, caseNumber: `CTRL-${suffix}`, title: 'Controls case', caseType: 'OTHER', clientId, createdById: adminId } });
    await db.document.create({ data: { id: documentId, name: 'Evidence document', category: 'EVIDENCE', caseId, clientId } });
    await db.documentVersion.create({ data: { id: documentVersionId, documentId, version: 1, name: 'Evidence document v1', uploadedById: adminId } });
    await db.clientFact.create({ data: { id: clientFactId, clientId, type: 'controls-test', value: 'verified', validFrom: new Date('2026-01-01') } });
    await db.externalSourceConnection.create({ data: { id: connectionId, clientId, sourceType: 'TEST', name: 'Controls source' } });
    await db.discoveryRun.create({ data: { id: discoveryRunId, clientId, connectionId, status: 'COMPLETED', completedAt: new Date() } });
    await db.observation.create({ data: { id: observationId, clientId, connectionId, discoveryRunId, idempotencyKey: `controls-${suffix}`, inputDigest: 'c'.repeat(64), rawPayload: { source: 'test' } } });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Controls' } });
    await db.requirement.create({ data: { id: requirementId, key: `CTRL_REQ_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({ data: { id: versionId, requirementId, versionKey: 'V1', title: 'Control requirement', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01'), status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    await db.applicabilityRuleVersion.create({ data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'test', astJson: {}, canonicalDigest: 'a'.repeat(64), status: 'APPROVED' } });
    await db.requirementApplicability.create({ data: { clientId, requirementVersionId: versionId, ruleVersionId: ruleId, ruleDigest: 'a'.repeat(64), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(), sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'test', snapshotJson: {}, snapshotDigest: 'b'.repeat(64) } });
  });

  afterAll(async () => {
    await db.evidenceControlLink.deleteMany({ where: { clientId } });
    await db.evidenceRecord.deleteMany({ where: { clientId: { in: [clientId, secondClientId] } } });
    await db.observation.deleteMany({ where: { id: observationId } });
    await db.discoveryRun.deleteMany({ where: { id: discoveryRunId } });
    await db.externalSourceConnection.deleteMany({ where: { id: connectionId } });
    await db.clientFact.deleteMany({ where: { id: clientFactId } });
    await db.documentVersion.deleteMany({ where: { id: documentVersionId } });
    await db.document.deleteMany({ where: { id: documentId } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.clientControl.deleteMany({ where: { clientId: { in: [clientId, secondClientId] } } });
    await db.complianceProposal.deleteMany({ where: { clientId } });
    await db.assessmentFinding.deleteMany({ where: { clientId } });
    await db.requirementControlMap.deleteMany({ where: { requirementVersionId: versionId } });
    await db.requirementApplicability.deleteMany({ where: { clientId } });
    await db.applicabilityRuleVersion.delete({ where: { id: ruleId } });
    await db.requirementVersion.delete({ where: { id: versionId } });
    await db.requirement.delete({ where: { id: requirementId } });
    await db.complianceDomain.delete({ where: { code: domainCode } });
    await db.client.deleteMany({ where: { id: { in: [clientId, secondClientId] } } });
    await db.user.delete({ where: { id: adminId } });
    await db.user.delete({ where: { id: unauthorizedId } });
    await db.$disconnect();
  });

  it('CONTROL_DEFINITION_REUSABLE and ONE_CONTROL_MULTIPLE_REQUIREMENTS', async () => {
    const definition = await createControlDefinition(actor, { key: `access_review_${suffix}`, title: 'Access review', type: 'TECHNICAL' }, db);
    const secondRequirement = await db.requirementVersion.create({ data: { requirementId, versionKey: 'V2', title: 'Second requirement', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01'), status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    await mapControlToRequirement(actor, { requirementVersionId: versionId, controlDefinitionId: definition.id }, db);
    await mapControlToRequirement(actor, { requirementVersionId: secondRequirement.id, controlDefinitionId: definition.id }, db);
    expect(await db.requirementControlMap.count({ where: { controlDefinitionId: definition.id } })).toBe(2);
    await db.requirementVersion.delete({ where: { id: secondRequirement.id } });
  });

  it('ONE_CLIENT_CONTROL_PER_CLIENT_DEFINITION, CLIENT_CONTROL_STATUS_PERSISTENCE, ZERO_AUTO_CLIENT_CONTROL', async () => {
    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: `access_review_${suffix}` } });
    const control = await createClientControl(actor, clientId, { controlDefinitionId: definition.id }, db);
    await expect(createClientControl(actor, clientId, { controlDefinitionId: definition.id }, db)).rejects.toMatchObject({ status: 409, code: 'CLIENT_CONTROL_ALREADY_EXISTS' });
    await expect(createClientControl(actor, secondClientId, { controlDefinitionId: definition.id }, db)).resolves.toBeDefined();
    await updateClientControl(actor, clientId, control.id, { implementationStatus: 'PARTIAL' }, db);
    expect((await db.clientControl.findUniqueOrThrow({ where: { id: control.id } })).implementationStatus).toBe('PARTIAL');
    expect(await db.clientControl.count({ where: { clientId } })).toBe(1);
  });

  it('AUTHORIZATION_CONTRACT, UNAUTHORIZED_MUTATION_DENIED', async () => {
    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: `access_review_${suffix}` } });
    const control = await db.clientControl.findFirstOrThrow({ where: { clientId } });
    const evidence = await db.evidenceRecord.findFirst({ where: { clientId } });
    await expect(createClientControl(unauthorizedActor, clientId, { controlDefinitionId: definition.id }, db)).rejects.toBeTruthy();
    await expect(updateClientControl(unauthorizedActor, clientId, control.id, { notes: 'forbidden' }, db)).rejects.toBeTruthy();
    await expect(createEvidenceRecord(unauthorizedActor, clientId, { sourceType: 'EXTERNAL_REFERENCE', title: 'Forbidden', externalReference: 'https://example.invalid/forbidden' }, db)).rejects.toBeTruthy();
    if (evidence) {
      await expect(reviewEvidenceRecord(unauthorizedActor, clientId, evidence.id, { status: 'REJECTED' }, db)).rejects.toBeTruthy();
      await expect(linkEvidenceToControl(unauthorizedActor, clientId, control.id, evidence.id, db)).rejects.toBeTruthy();
    }
  });

  it('APPLICABILITY_CREATES_ZERO_CONTROLS, FINDING_CREATES_ZERO_CONTROLS, PROPOSAL_CREATES_ZERO_CONTROLS', async () => {
    const before = await db.clientControl.count({ where: { clientId } });
    const materialized = await materializeRequirementApplicabilityFinding({ applicabilityId: (await db.requirementApplicability.findFirstOrThrow({ where: { clientId, outcome: 'APPLIES' } })).id, createdByUserId: adminId }, db);
    expect(materialized.finding).not.toBeNull();
    expect(await db.clientControl.count({ where: { clientId } })).toBe(before);
    const proposal = await createProposal(actor, {
      findingId: materialized.finding!.id,
      proposalKind: 'CONTROL_IMPLEMENTATION',
      title: 'Implement control',
      description: 'Test proposal',
    }, db);
    expect(proposal.status).toBe('PROPOSED');
    expect(await db.clientControl.count({ where: { clientId } })).toBe(before);
  });

  it('DOCUMENT_VERSION_EVIDENCE, CLIENT_FACT_EVIDENCE, OBSERVATION_EVIDENCE, EXTERNAL_REFERENCE_EVIDENCE, ONE_EVIDENCE_MULTIPLE_CONTROLS, MULTIPLE_EVIDENCE_ONE_CONTROL, CROSS_CLIENT_EVIDENCE_CONTROL_LINK_DENIED, FOREIGN_DOCUMENT_VERSION_DENIED, FOREIGN_CLIENT_FACT_DENIED, FOREIGN_OBSERVATION_DENIED, EVIDENCE_FRESHNESS_STALE, STALE_EVIDENCE_NOT_DELETED, ZERO_AUTO_IMPLEMENTED_STATUS', async () => {
    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: `access_review_${suffix}` } });
    const first = await db.clientControl.findFirstOrThrow({ where: { clientId } });
    const second = await db.clientControl.create({ data: { clientId, controlDefinitionId: (await db.controlDefinition.create({ data: { key: `incident_${suffix}`, title: 'Incident procedure', type: 'PROCEDURAL' } })).id } });
    const stale = await createEvidenceRecord(actor, clientId, { sourceType: 'EXTERNAL_REFERENCE', title: 'Old review', externalReference: 'https://example.invalid/review', validUntil: new Date('2020-01-01') }, db);
    const current = await createEvidenceRecord(actor, clientId, { sourceType: 'EXTERNAL_REFERENCE', title: 'Current review', externalReference: 'https://example.invalid/current' }, db);
    await reviewEvidenceRecord(actor, clientId, stale.id, { status: 'ACCEPTED' }, db);
    await reviewEvidenceRecord(actor, clientId, current.id, { status: 'ACCEPTED' }, db);
    const documentEvidence = await createEvidenceRecord(actor, clientId, { sourceType: 'DOCUMENT_VERSION', title: 'Document evidence', documentVersionId, clientFactId: '  ', observationId: '', externalReference: '   ' }, db);
    const factEvidence = await createEvidenceRecord(actor, clientId, { sourceType: 'CLIENT_FACT', title: 'Fact evidence', clientFactId, documentVersionId: '', observationId: ' ', externalReference: '' }, db);
    const observationEvidence = await createEvidenceRecord(actor, clientId, { sourceType: 'OBSERVATION', title: 'Observation evidence', observationId, documentVersionId: ' ', clientFactId: '', externalReference: '  ' }, db);
    const externalEvidence = await createEvidenceRecord(actor, clientId, { sourceType: 'EXTERNAL_REFERENCE', title: 'External evidence', externalReference: ' https://example.invalid/blank-fields ', documentVersionId: '', clientFactId: ' ', observationId: '  ' }, db);
    expect(documentEvidence.documentVersionId).toBe(documentVersionId);
    expect(factEvidence.clientFactId).toBe(clientFactId);
    expect(observationEvidence.observationId).toBe(observationId);
    expect(externalEvidence.externalReference).toBe('https://example.invalid/blank-fields');
    await expect(createEvidenceRecord(actor, clientId, { sourceType: 'DOCUMENT_VERSION', title: 'Mismatch', clientFactId }, db)).rejects.toMatchObject({ code: 'EVIDENCE_SOURCE_MISMATCH' });
    await expect(createEvidenceRecord(actor, clientId, { sourceType: 'DOCUMENT_VERSION', title: 'Multiple sources', documentVersionId, clientFactId }, db)).rejects.toMatchObject({ code: 'EVIDENCE_SOURCE_REQUIRED' });
    await expect(createEvidenceRecord(actor, clientId, { sourceType: 'DOCUMENT_VERSION', title: 'Foreign document', documentVersionId: crypto.randomUUID() }, db)).rejects.toMatchObject({ code: 'EVIDENCE_ARTIFACT_FORBIDDEN' });
    await expect(createEvidenceRecord(actor, clientId, { sourceType: 'CLIENT_FACT', title: 'Foreign fact', clientFactId: crypto.randomUUID() }, db)).rejects.toMatchObject({ code: 'EVIDENCE_ARTIFACT_FORBIDDEN' });
    await expect(createEvidenceRecord(actor, clientId, { sourceType: 'OBSERVATION', title: 'Foreign observation', observationId: crypto.randomUUID() }, db)).rejects.toMatchObject({ code: 'EVIDENCE_ARTIFACT_FORBIDDEN' });
    await linkEvidenceToControl(actor, clientId, first.id, stale.id, db);
    await linkEvidenceToControl(actor, clientId, second.id, stale.id, db);
    await linkEvidenceToControl(actor, clientId, first.id, current.id, db);
    await expect(linkEvidenceToControl(actor, secondClientId, first.id, current.id, db)).rejects.toBeTruthy();
    expect((await getControlCoverage(actor, clientId, db)).requirements[0].controls[0].evidenceSummary.stale).toBe(1);
    expect((await db.evidenceRecord.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('ACCEPTED');
    expect((await db.clientControl.findUniqueOrThrow({ where: { id: first.id } })).implementationStatus).toBe('NOT_ASSESSED');
    void definition;
  });

  it('EVIDENCE_REVIEW_LIFECYCLE, EVIDENCE_FRESHNESS_CURRENT, SOURCE_TYPE_REFERENCE_INVARIANTS', async () => {
    const evidence = await createEvidenceRecord(actor, clientId, {
      sourceType: 'EXTERNAL_REFERENCE',
      title: 'Lifecycle evidence',
      externalReference: 'https://example.invalid/lifecycle',
      validUntil: new Date('2099-01-01'),
    }, db);
    expect(evidence.status).toBe('PROVIDED');
    await expect(reviewEvidenceRecord(actor, clientId, evidence.id, { status: 'ACCEPTED' }, db)).resolves.toMatchObject({
      status: 'ACCEPTED',
      reviewedByUserId: adminId,
    });
    const accepted = await db.evidenceRecord.findUniqueOrThrow({ where: { id: evidence.id } });
    expect(accepted.reviewedAt).not.toBeNull();
    await expect(reviewEvidenceRecord(actor, clientId, evidence.id, { status: 'UNDER_REVIEW' }, db)).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
      reviewedAt: null,
      reviewedByUserId: null,
    });
    await expect(createEvidenceRecord(actor, clientId, {
      sourceType: 'EXTERNAL_REFERENCE',
      title: 'Bad external reference',
      externalReference: '',
    }, db)).rejects.toMatchObject({ code: 'EVIDENCE_SOURCE_REQUIRED' });

    await expect(createEvidenceRecord(actor, clientId, {
      sourceType: 'EXTERNAL_REFERENCE',
      title: 'Equal validity',
      externalReference: 'https://example.invalid/equal',
      validFrom: new Date('2026-09-14'),
      validUntil: new Date('2026-09-14'),
    }, db)).resolves.toMatchObject({ validFrom: new Date('2026-09-14'), validUntil: new Date('2026-09-14') });
    await expect(createEvidenceRecord(actor, clientId, {
      sourceType: 'EXTERNAL_REFERENCE',
      title: 'Start-only validity',
      externalReference: 'https://example.invalid/start-only',
      validFrom: new Date('2026-09-14'),
    }, db)).resolves.toMatchObject({ validUntil: null });

    const evidenceBeforeReversedRange = await db.evidenceRecord.count({ where: { clientId } });
    await expect(createEvidenceRecord(actor, clientId, {
      sourceType: 'EXTERNAL_REFERENCE',
      title: 'Reversed validity',
      externalReference: 'https://example.invalid/reversed',
      validFrom: new Date('2026-09-14'),
      validUntil: new Date('2026-09-01'),
    }, db)).rejects.toMatchObject({ status: 400, code: 'EVIDENCE_VALIDITY_INVALID' });
    expect(await db.evidenceRecord.count({ where: { clientId } })).toBe(evidenceBeforeReversedRange);

    const future = await createEvidenceRecord(actor, clientId, {
      sourceType: 'EXTERNAL_REFERENCE',
      title: 'Future evidence',
      externalReference: 'https://example.invalid/future',
      validFrom: new Date(Date.now() + 86400000),
    }, db);
    await reviewEvidenceRecord(actor, clientId, future.id, { status: 'ACCEPTED' }, db);
    const control = await db.clientControl.findFirstOrThrow({ where: { clientId } });
    await linkEvidenceToControl(actor, clientId, control.id, future.id, db);
    const coverage = await getControlCoverage(actor, clientId, db);
    expect(coverage.requirements.flatMap((item) => item.controls).some((item) => item.evidenceSummary.acceptedCurrent > 0 && item.evidenceSummary.missing === false)).toBe(false);
  });

  it('APPLICABILITY_UNCHANGED_BY_CONTROL_MUTATION, APPLICABILITY_UNCHANGED_BY_EVIDENCE_MUTATION', async () => {
    const before = await db.requirementApplicability.findMany({ where: { clientId }, select: { id: true, outcome: true, snapshotDigest: true } });
    const control = await db.clientControl.findFirstOrThrow({ where: { clientId } });
    await updateClientControl(actor, clientId, control.id, { notes: 'reviewed' }, db);
    const evidence = await createEvidenceRecord(actor, clientId, { sourceType: 'EXTERNAL_REFERENCE', title: 'Mutation evidence', externalReference: 'https://example.invalid/mutation' }, db);
    await linkEvidenceToControl(actor, clientId, control.id, evidence.id, db);
    const after = await db.requirementApplicability.findMany({ where: { clientId }, select: { id: true, outcome: true, snapshotDigest: true } });
    expect(after).toEqual(before);
  });

  it('LATEST_SNAPSHOT_BEFORE_OUTCOME_FILTER, OLD_APPLIES_NEW_DOES_NOT_APPLY_NOT_INCLUDED, OLD_APPLIES_NEW_INSUFFICIENT_FACTS_NOT_INCLUDED, LATEST_APPLIES_INCLUDED', async () => {
    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: `access_review_${suffix}` } });
    const nextEvaluation = new Date(Date.now() + 1000);
    const snapshot = (outcome: 'DOES_NOT_APPLY' | 'INSUFFICIENT_FACTS' | 'APPLIES', evaluationAt: Date) => ({
      clientId, requirementVersionId: versionId, ruleVersionId: ruleId, ruleDigest: 'a'.repeat(64), outcome,
      scopeType: 'COMPANY' as const, evaluationAt, sourceSupportState: 'SUFFICIENT' as const,
      specialistRequirement: 'NONE' as const, schemaVersion: 'test', snapshotJson: {}, snapshotDigest: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
    });
    await db.requirementApplicability.create({ data: snapshot('DOES_NOT_APPLY', nextEvaluation) });
    expect((await getControlCoverage(actor, clientId, db)).requirements).toHaveLength(0);
    await db.requirementApplicability.create({ data: snapshot('INSUFFICIENT_FACTS', new Date(nextEvaluation.getTime() + 1000)) });
    expect((await getControlCoverage(actor, clientId, db)).requirements).toHaveLength(0);
    await db.requirementApplicability.create({ data: snapshot('APPLIES', new Date(nextEvaluation.getTime() + 2000)) });
    expect((await getControlCoverage(actor, clientId, db)).requirements).toHaveLength(1);
    void definition;
  });
});
