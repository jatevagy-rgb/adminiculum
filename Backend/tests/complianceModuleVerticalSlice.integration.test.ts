import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { answerCompanyProfileQuestion } from '../src/modules/client-workspace/companyProfileAnswerService';
import { getControlEvidenceJourney, submitControlEvidenceAnswer } from '../src/modules/client-workspace/companyProfileEvidenceService';
import { seedComplianceModuleRuleFamilies } from '../src/modules/compliance/complianceModuleSeedingService';

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

  const answer = (questionKey: string, payload: Record<string, unknown>) => answerCompanyProfileQuestion(representativeId, workspaceId, questionKey, payload, db);

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

    const document = await db.document.create({ data: { clientId, name: 'Adatkezelési tájékoztató', category: 'EVIDENCE' } as never });
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
    await db.documentVersion.deleteMany({ where: { documentId } });
    await db.document.deleteMany({ where: { id: documentId } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId } });
    await db.clientPortalIdentity.deleteMany({ where: { id: representativeId } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: workspaceId } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId } });
    await db.client.delete({ where: { id: clientId } });
    await db.user.delete({ where: { id: adminId } });
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

  it('WHISTLEBLOWING_DB_RUNTIME: headcount threshold applies; missing/unknown stays insufficient', async () => {
    await answer('employee_count', { status: 'ANSWERED', numberValue: 73 });
    expect(await latestOutcome('WHISTLEBLOWING_INTERNAL_CHANNEL')).toBe('APPLIES');
    await answer('employee_count', { status: 'ANSWERED', numberValue: 12 });
    expect(await latestOutcome('WHISTLEBLOWING_INTERNAL_CHANNEL')).toBe('INSUFFICIENT_FACTS');
  });

  it('NIS2_DB_RUNTIME: ambiguous scope is LEGAL_REVIEW_REQUIRED; controls evaluate deterministically', async () => {
    await answer('critical_it_dependency', { status: 'ANSWERED', booleanValue: true });
    expect(await latestOutcome('NIS2_ORGANISATION_SCOPE')).toBe('LEGAL_REVIEW_REQUIRED');
    expect(await latestOutcome('NIS2_SECURITY_CONTROLS')).toBe('APPLIES');
    await answer('critical_it_dependency', { status: 'ANSWERED', booleanValue: false });
    await answer('managed_it_service_provider', { status: 'ANSWERED', booleanValue: false });
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
    await db.client.create({ data: { id: otherClient, name: 'Other client' } });
    const otherDocument = await db.document.create({ data: { clientId: otherClient, name: 'Foreign document', category: 'EVIDENCE' } as never });
    const otherVersion = await db.documentVersion.create({ data: { documentId: otherDocument.id, version: 1, name: 'Foreign v1', uploadedById: adminId } as never });
    await expect(submitControlEvidenceAnswer(representativeId, workspaceId, 'C-WB-001', { answer: 'YES', documentVersionId: otherVersion.id }, db)).rejects.toMatchObject({ code: 'EVIDENCE_CROSS_CLIENT' });
    await db.documentVersion.deleteMany({ where: { documentId: otherDocument.id } });
    await db.document.deleteMany({ where: { id: otherDocument.id } });
    await db.client.delete({ where: { id: otherClient } });
  });

  it('NO_SECOND_EVIDENCE_MODEL: the journey reads back through the shared models only', async () => {
    const journey = await getControlEvidenceJourney(representativeId, workspaceId, db);
    expect(journey.items).toHaveLength(3);
    const gdpr = journey.items.find((item) => item.controlKey === 'C-DATA-002');
    expect(gdpr).toMatchObject({ implemented: true, evidenceLinked: true });
    expect(journey.items.map((item) => item.questionHu)).toEqual(expect.arrayContaining([
      'Van jelenleg hatályos adatkezelési tájékoztatójuk?',
    ]));
    expect(JSON.stringify(journey)).not.toContain('evidenceRecordId');
    expect(JSON.stringify(journey)).not.toContain('clientControlId');
  });
});
