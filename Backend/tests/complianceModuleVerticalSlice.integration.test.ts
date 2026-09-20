import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { answerCompanyProfileQuestion } from '../src/modules/client-workspace/companyProfileAnswerService';
import { getControlEvidenceJourney, resolveControlEvidenceCatalog, submitControlEvidenceAnswer } from '../src/modules/client-workspace/companyProfileEvidenceService';
import { seedComplianceModuleRuleFamilies } from '../src/modules/compliance/complianceModuleSeedingService';
import { provisionComplianceModuleRules } from '../src/modules/compliance/complianceModuleProvisioning';
import { createTypedFactInTx } from '../src/modules/compliance/typedFactMutationService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('compliance module vertical slice (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const representativeId = crypto.randomUUID();
  let documentId = '';
  let documentVersionId = '';
  const caseId = crypto.randomUUID();

  const answer = (questionKey: string, payload: Record<string, unknown>) => answerCompanyProfileQuestion(representativeId, workspaceId, questionKey, payload, db);

  /**
   * Supplies a fact that has no client question (legal classification), the way
   * the legal team would. The evaluator requires every dependency to be present
   * before it evaluates, so OR-branches cannot resolve from one side alone.
   */
  const setFact = async (factKey: string, values: Record<string, unknown>) => {
    const definition = await db.factDefinition.findUniqueOrThrow({ where: { key: factKey } });
    const now = new Date().toISOString();
    await db.$transaction(
      (tx) => createTypedFactInTx({ clientId, factDefinitionId: definition.id, actorUserId: adminId, verificationStatus: 'CLIENT_PROVIDED', input: { scopeType: 'COMPANY', ...values, validFrom: now, observedAt: now, evaluationAt: now, sourceReference: 'VERTICAL_TEST' } }, tx),
      { isolationLevel: 'Serializable' },
    );
  };

  const latestOutcome = async (requirementKey: string) => {
    const requirement = await db.requirement.findFirstOrThrow({ where: { key: requirementKey } });
    const version = await db.requirementVersion.findFirstOrThrow({ where: { requirementId: requirement.id } });
    const row = await db.requirementApplicability.findFirst({ where: { clientId, requirementVersionId: version.id }, orderBy: [{ evaluationAt: 'desc' }, { createdAt: 'desc' }] });
    return row?.outcome;
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `vertical-${suffix}@fixture.invalid`, name: 'Vertical seed actor', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.create({ data: { id: clientId, name: 'Vertical slice fixture' } });
    await db.clientOperatingProfile.create({ data: { clientId, complianceEnrollmentStatus: 'ENROLLED' } });
    await db.clientPortalWorkspace.create({ data: { id: workspaceId, clientId, name: 'Vertical workspace', mode: 'ORGANIZATION', publicReference: `vertical-${suffix}`, createdById: adminId } });
    await db.clientPortalIdentity.create({ data: { id: representativeId, provider: 'ENTRA_EXTERNAL_ID', issuer: `vertical-${suffix}`, subject: 'representative', normalizedEmail: `vertical-${suffix}@fixture.invalid`, emailVerifiedAt: new Date(), displayName: 'Representative', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' } });
    await db.clientPortalWorkspaceMembership.create({ data: { id: crypto.randomUUID(), clientPortalIdentityId: representativeId, workspaceId, status: 'ACTIVE', role: 'REPRESENTATIVE', approvedAt: new Date(), approvedById: adminId } });

    // Documents are case-scoped in this schema, so evidence documents need a case.
    await db.case.create({ data: { id: caseId, caseNumber: `VS-${suffix.replace(/-/g, '').slice(0, 8)}`, title: 'Vertical slice case', caseType: 'OTHER', clientId, assignedLawyerId: adminId, createdById: adminId } as never });
    const document = await db.document.create({ data: { clientId, caseId, name: 'Adatkezelési tájékoztató', category: 'EVIDENCE' } as never });
    documentId = document.id;
    const version = await db.documentVersion.create({ data: { documentId, version: 1, name: 'Adatkezelési tájékoztató v1', uploadedById: adminId } as never });
    documentVersionId = version.id;

    await seedComplianceModuleRuleFamilies(db, adminId);
  });

  afterAll(async () => {
    await db.assessmentFinding.deleteMany({ where: { clientId } });
    await db.requirementApplicability.deleteMany({ where: { clientId } });
    await db.clientFactAnswerState.deleteMany({ where: { clientId } });
    await db.clientFact.deleteMany({ where: { clientId } });
    await db.evidenceControlLink.deleteMany({ where: { clientId } });
    await db.evidenceRecord.deleteMany({ where: { clientId } });
    await db.clientControl.deleteMany({ where: { clientId } });
    await db.clientDocumentPublication.deleteMany({ where: { clientId } });
    await db.documentVersion.deleteMany({ where: { documentId } });
    await db.document.deleteMany({ where: { id: documentId } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId } });
    await db.clientPortalIdentity.deleteMany({ where: { id: representativeId } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: workspaceId } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId } });
    await db.client.delete({ where: { id: clientId } });
    // Approved requirement/rule rows keep an approvedById reference, so the
    // seed actor is intentionally left in place (fresh database per CI run).
    await db.$disconnect();
  });

  it('seeds the three verticals idempotently with citations, rules, dependencies and controls', async () => {
    const seeded = await seedComplianceModuleRuleFamilies(db, adminId);
    expect(seeded.domains).toBeGreaterThanOrEqual(3);
    expect(seeded.legalSources).toBeGreaterThanOrEqual(4);
    expect(seeded.skipped).toBeGreaterThanOrEqual(5);
    expect(await db.applicabilityRuleVersion.count({ where: { requirementVersion: { requirement: { key: { in: ['GDPR_GENERAL_SCOPE', 'WHISTLEBLOWING_INTERNAL_CHANNEL', 'NIS2_SECURITY_CONTROLS'] } } } } })).toBe(3);
    expect(await db.requirementControlMap.count()).toBeGreaterThan(0);
    expect(await db.applicabilityRuleFactDependency.count({ where: { resolvedFactDefinitionId: { not: null } } })).toBeGreaterThan(0);
  });

  it('GDPR_DB_RUNTIME: APPLIES, DOES_NOT_APPLY and INSUFFICIENT_FACTS through the real evaluator', async () => {
    await answer('personal_data_processing', { status: 'ANSWERED', booleanValue: true });
    expect(await latestOutcome('GDPR_GENERAL_SCOPE')).toBe('APPLIES');
    await answer('personal_data_processing', { status: 'ANSWERED', booleanValue: false });
    expect(await latestOutcome('GDPR_GENERAL_SCOPE')).toBe('DOES_NOT_APPLY');
    await answer('personal_data_processing', { status: 'UNKNOWN' });
    expect(await latestOutcome('GDPR_GENERAL_SCOPE')).toBe('INSUFFICIENT_FACTS');
  });

  it('WHISTLEBLOWING_DB_RUNTIME: headcount threshold applies; unknown headcount stays insufficient', async () => {
    await answer('employee_count', { status: 'ANSWERED', numberValue: 73 });
    // The whistleblowing rule ORs on the legally-classified special sector, so
    // the evaluator needs that dependency present too.
    await setFact('whistle_special_sector', { booleanValue: false });
    expect(await latestOutcome('WHISTLEBLOWING_INTERNAL_CHANNEL')).toBe('APPLIES');
    await answer('employee_count', { status: 'UNKNOWN' });
    expect(await latestOutcome('WHISTLEBLOWING_INTERNAL_CHANNEL')).toBe('INSUFFICIENT_FACTS');
  });

  it('NIS2_DB_RUNTIME: ambiguous scope is LEGAL_REVIEW_REQUIRED; controls evaluate deterministically', async () => {
    await answer('critical_it_dependency', { status: 'ANSWERED', booleanValue: true });
    await answer('managed_it_service_provider', { status: 'ANSWERED', booleanValue: false });
    expect(await latestOutcome('NIS2_ORGANISATION_SCOPE')).toBe('LEGAL_REVIEW_REQUIRED');
    expect(await latestOutcome('NIS2_SECURITY_CONTROLS')).toBe('APPLIES');
    await answer('critical_it_dependency', { status: 'ANSWERED', booleanValue: false });
    expect(await latestOutcome('NIS2_SECURITY_CONTROLS')).toBe('DOES_NOT_APPLY');
  });

  it('EVIDENCE_UNKNOWN_REAL_REVIEW: unknown routes to lawyer review without evidence', async () => {
    const result = await submitControlEvidenceAnswer(representativeId, workspaceId, 'C-DATA-002', { answer: 'UNKNOWN' }, db);
    expect(result).toMatchObject({ route: 'LAWYER_REVIEW', implemented: false, documentVersionId: null });
    expect(await db.evidenceRecord.count({ where: { clientId } })).toBe(0);
  });

  it('EVIDENCE_NO_REAL_GAP: a negative answer records a missing control, not evidence', async () => {
    const result = await submitControlEvidenceAnswer(representativeId, workspaceId, 'C-DATA-002', { answer: 'NO' }, db);
    expect(result).toMatchObject({ route: 'MISSING_CONTROL_EVIDENCE', implemented: false });
    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: 'C-DATA-002' } });
    const control = await db.clientControl.findFirstOrThrow({ where: { clientId, controlDefinitionId: definition.id } });
    expect(control.implementationStatus).toBe('NOT_IMPLEMENTED');
    expect(await db.evidenceRecord.count({ where: { clientId } })).toBe(0);
  });

  it('EVIDENCE_YES_REAL_PATH + DOCUMENTVERSION_REUSED: links an existing document version and reuses it', async () => {
    const first = await submitControlEvidenceAnswer(representativeId, workspaceId, 'C-DATA-002', { answer: 'YES', documentVersionId }, db);
    expect(first).toMatchObject({ route: 'UPLOAD_OR_REUSE_DOCUMENT', implemented: true, documentVersionId });
    expect(await db.evidenceRecord.count({ where: { clientId } })).toBe(1);
    expect(await db.evidenceControlLink.count({ where: { clientId } })).toBe(1);
    const record = await db.evidenceRecord.findFirstOrThrow({ where: { clientId } });
    expect(record.documentVersionId).toBe(documentVersionId);

    const second = await submitControlEvidenceAnswer(representativeId, workspaceId, 'C-DATA-002', { answer: 'YES', documentVersionId }, db);
    expect(second.route).toBe('UPLOAD_OR_REUSE_DOCUMENT');
    expect(await db.evidenceRecord.count({ where: { clientId } })).toBe(1);

    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: 'C-DATA-002' } });
    const control = await db.clientControl.findFirstOrThrow({ where: { clientId, controlDefinitionId: definition.id } });
    expect(control.implementationStatus).toBe('IMPLEMENTED');
  });

  it('rejects a document version that belongs to another client', async () => {
    const otherClient = crypto.randomUUID();
    const otherCase = crypto.randomUUID();
    await db.client.create({ data: { id: otherClient, name: 'Other client' } });
    await db.case.create({ data: { id: otherCase, caseNumber: `VS-F-${suffix.replace(/-/g, '').slice(0, 6)}`, title: 'Foreign case', caseType: 'OTHER', clientId: otherClient, assignedLawyerId: adminId, createdById: adminId } as never });
    const otherDocument = await db.document.create({ data: { clientId: otherClient, caseId: otherCase, name: 'Foreign document', category: 'EVIDENCE' } as never });
    const otherVersion = await db.documentVersion.create({ data: { documentId: otherDocument.id, version: 1, name: 'Foreign v1', uploadedById: adminId } as never });
    await expect(submitControlEvidenceAnswer(representativeId, workspaceId, 'C-WB-001', { answer: 'YES', documentVersionId: otherVersion.id }, db)).rejects.toMatchObject({ code: 'EVIDENCE_CROSS_CLIENT' });
    await db.documentVersion.deleteMany({ where: { documentId: otherDocument.id } });
    await db.document.deleteMany({ where: { id: otherDocument.id } });
    await db.case.deleteMany({ where: { id: otherCase } });
    await db.client.delete({ where: { id: otherClient } });
  });

  it('NO_SECOND_EVIDENCE_MODEL: the journey reads back through the shared models only', async () => {
    const journey = await getControlEvidenceJourney(representativeId, workspaceId, db);
    const keys = journey.items.map((item) => item.controlKey);
    // Every eligible canonical safe control appears exactly once; no hard-coded
    // representative subset and no duplicates.
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['C-CYBER-001', 'C-CYBER-002', 'C-DATA-001', 'C-DATA-002', 'C-WB-001']);
    const gdpr = journey.items.find((item) => item.controlKey === 'C-DATA-002');
    expect(gdpr).toMatchObject({ implemented: true, evidenceLinked: true });
    expect(journey.items.map((item) => item.questionHu)).toEqual(expect.arrayContaining([
      'Van jelenleg hatályos adatkezelési tájékoztatótok?',
    ]));
    expect(JSON.stringify(journey)).not.toContain('evidenceRecordId');
    expect(JSON.stringify(journey)).not.toContain('clientControlId');
  });

  it('PRODUCTION_RULE_PROVISIONING: the production entry point is additive and idempotent', async () => {
    const provisioned = await provisionComplianceModuleRules(db, adminId);
    expect(provisioned.requirements).toBeGreaterThanOrEqual(5);
    expect(provisioned.skipped).toBeGreaterThanOrEqual(5);
    expect(await db.factDefinition.count({ where: { key: 'employee_count' } })).toBeGreaterThanOrEqual(1);
    expect(await db.applicabilityRuleVersion.count({ where: { requirementVersion: { requirement: { key: { in: ['GDPR_GENERAL_SCOPE', 'WHISTLEBLOWING_INTERNAL_CHANNEL', 'NIS2_SECURITY_CONTROLS'] } } } } })).toBe(3);
  });

  it('SME_DB_METADATA_CORRECT: eu_sme_size_class is LEGAL_CLASSIFICATION_REQUIRED', async () => {
    const definition = await db.factDefinition.findUniqueOrThrow({ where: { key: 'eu_sme_size_class' } });
    expect(String(definition.determinationMethod)).toBe('LEGAL_CLASSIFICATION_REQUIRED');
  });

  it('EVIDENCE_RELEVANCE_GATING: applies / does-not-apply / insufficient drive visibility', async () => {
    await answer('personal_data_processing', { status: 'ANSWERED', booleanValue: true });
    let journey = await getControlEvidenceJourney(representativeId, workspaceId, db);
    expect(journey.items.find((item) => item.controlKey === 'C-DATA-002')?.relevance).toBe('APPLIES');

    await answer('personal_data_processing', { status: 'ANSWERED', booleanValue: false });
    journey = await getControlEvidenceJourney(representativeId, workspaceId, db);
    // Irrelevant controls are omitted, never rendered as a state.
    expect(journey.items.find((item) => item.controlKey === 'C-DATA-002')).toBeUndefined();

    await answer('personal_data_processing', { status: 'UNKNOWN' });
    journey = await getControlEvidenceJourney(representativeId, workspaceId, db);
    expect(journey.items.find((item) => item.controlKey === 'C-DATA-002')?.relevance).toBe('INSUFFICIENT_FACTS');
  });

  it('EVIDENCE_FRONTEND_CONTRACT: journey exposes relevance and reusable documents', async () => {
    await db.clientDocumentPublication.create({
      data: {
        caseId,
        clientId,
        documentId,
        documentVersionId,
        status: 'PUBLISHED',
        clientFacingTitle: 'Adatkezelési tájékoztató (közzétéve)',
        preparedById: adminId,
        audienceSnapshot: {},
        sourceFingerprint: 'vertical-slice',
      } as never,
    });
    const journey = await getControlEvidenceJourney(representativeId, workspaceId, db);
    expect(journey.items[0]).toEqual(expect.objectContaining({ controlKey: expect.any(String), questionHu: expect.any(String), relevance: expect.any(String) }));
    expect(journey.reusableDocuments.some((doc) => doc.documentVersionId === documentVersionId)).toBe(true);
    expect(journey.reusableDocuments.every((doc) => typeof doc.documentVersionId === 'string' && typeof doc.label === 'string')).toBe(true);
  });

  it('ONE_DOCUMENT_VERSION_BACKS_MULTIPLE_CONTROLS_WITHOUT_COPYING', async () => {
    const versionCountBefore = await db.documentVersion.count({ where: { documentId } });
    const dataControl = await submitControlEvidenceAnswer(representativeId, workspaceId, 'C-DATA-001', { answer: 'YES', documentVersionId }, db);
    const wbControl = await submitControlEvidenceAnswer(representativeId, workspaceId, 'C-WB-001', { answer: 'YES', documentVersionId }, db);
    expect(dataControl).toMatchObject({ route: 'UPLOAD_OR_REUSE_DOCUMENT', implemented: true, documentVersionId });
    expect(wbControl).toMatchObject({ route: 'UPLOAD_OR_REUSE_DOCUMENT', implemented: true, documentVersionId });
    // No document or document-version copy is created to reuse the evidence.
    expect(await db.documentVersion.count({ where: { documentId } })).toBe(versionCountBefore);
    expect(await db.evidenceRecord.count({ where: { clientId, documentVersionId } })).toBeGreaterThanOrEqual(3);
  });

  it('EXPIRED_EVIDENCE_IS_STALE_AND_DOES_NOT_COUNT_AS_CURRENT', async () => {
    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: 'C-CYBER-001' } });
    const control = await db.clientControl.create({ data: { clientId, controlDefinitionId: definition.id, implementationStatus: 'IMPLEMENTED' } });
    const expired = await db.evidenceRecord.create({
      data: {
        clientId, sourceType: 'EXTERNAL_REFERENCE', status: 'ACCEPTED', title: 'Lejárt bizonyíték',
        externalReference: 'https://example.invalid/expired', validFrom: new Date('2020-01-01'), validUntil: new Date('2020-12-31'),
        reviewedAt: new Date('2020-12-31'), reviewedByUserId: adminId,
      },
    });
    await db.evidenceControlLink.create({ data: { clientId, evidenceRecordId: expired.id, clientControlId: control.id } });

    const journey = await getControlEvidenceJourney(representativeId, workspaceId, db);
    const item = journey.items.find((entry) => entry.controlKey === 'C-CYBER-001');
    expect(item).toMatchObject({ implemented: false, evidenceLinked: false, relevance: 'LEGAL_REVIEW_REQUIRED' });

    await db.evidenceControlLink.deleteMany({ where: { clientId, clientControlId: control.id } });
    await db.evidenceRecord.deleteMany({ where: { id: expired.id } });
    await db.clientControl.deleteMany({ where: { id: control.id } });
  });

  it('CONTROLS_WITHOUT_SAFE_METADATA_FAIL_CLOSED_AND_ARE_REPORTED', async () => {
    const version = await db.requirementVersion.findFirstOrThrow({ where: { requirement: { key: 'GDPR_GENERAL_SCOPE' } } });
    const unlistedKey = `C-INTERNAL-${suffix.replace(/-/g, '').slice(0, 8)}`;
    const unlisted = await db.controlDefinition.create({ data: { key: unlistedKey, title: 'Belső kontroll', description: 'Belső megjegyzés', type: 'ORGANIZATIONAL' } });
    await db.requirementControlMap.create({ data: { requirementVersionId: version.id, controlDefinitionId: unlisted.id } });

    const safeDefinition = await db.controlDefinition.findFirstOrThrow({ where: { key: 'C-DATA-001' } });
    const originalDescription = safeDefinition.description;
    await db.controlDefinition.update({ where: { id: safeDefinition.id }, data: { description: null } });

    try {
      const catalog = await resolveControlEvidenceCatalog(clientId, db);
      expect(catalog.omissions).toEqual(expect.arrayContaining([
        { controlKey: unlistedKey, reason: 'NOT_PORTAL_VISIBLE' },
        { controlKey: 'C-DATA-001', reason: 'NO_SAFE_QUESTION' },
      ]));
      const journey = await getControlEvidenceJourney(representativeId, workspaceId, db);
      expect(journey.items.some((item) => item.controlKey === unlistedKey)).toBe(false);
      expect(journey.items.some((item) => item.controlKey === 'C-DATA-001')).toBe(false);
      expect(journey.items.some((item) => item.questionHu === 'Belső megjegyzés')).toBe(false);
    } finally {
      await db.controlDefinition.update({ where: { id: safeDefinition.id }, data: { description: originalDescription } });
      await db.requirementControlMap.deleteMany({ where: { controlDefinitionId: unlisted.id } });
      await db.controlDefinition.deleteMany({ where: { id: unlisted.id } });
    }
  });
});
